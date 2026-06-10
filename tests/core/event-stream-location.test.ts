// ═══ Event Stream Location Tests ═══════════════════════════════════════
// Sprint 279 — WK-import (ADR-008): event-stream moved orchestra/ → core/.
//
// Guards:
//   1. event-stream is importable from core/ and round-trips in a tmpdir.
//   2. The orchestra/ shim re-exports the SAME module (function + CHANNELS
//      identity) → single instance, shared module-level state preserved.
//   3. core/audit-writer + core/audit-query are wired to the core import and
//      their source contains NO `orchestra/event-stream` import (no core→
//      orchestra reverse-dependency).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// Canonical home after the move.
import {
  writeEvent as coreWriteEvent,
  readEvents as coreReadEvents,
  CHANNELS as CORE_CHANNELS,
} from '../../src/core/event-stream.js';
import type { DeckentEvent } from '../../src/core/event-stream.js';

// Backward-compat re-export shim.
import {
  writeEvent as shimWriteEvent,
  readEvents as shimReadEvents,
  CHANNELS as SHIM_CHANNELS,
} from '../../src/orchestra/event-stream.js';

// Audit modules — must consume the core import (the thing this task rewired).
import { writeAuditEvent, _resetChainHead } from '../../src/core/audit-writer.js';
import { readAuditEvents } from '../../src/core/audit-query.js';

describe('event-stream location (Sprint 279 WK-import / ADR-008)', () => {
  let testRoot: string;
  const sprintId = 'sprint-279';

  beforeEach(() => {
    testRoot = join(tmpdir(), `deckent-es-location-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(testRoot, '.deckent'), { recursive: true });
    _resetChainHead();
  });

  afterEach(() => {
    try {
      rmSync(testRoot, { recursive: true, force: true });
    } catch {
      // cleanup best-effort
    }
  });

  it('writeEvent/readEvents are importable from core/ and round-trip', () => {
    const ev = coreWriteEvent(
      testRoot, sprintId, 'brain', '*',
      CORE_CHANNELS.SPRINT_PHASE_CHANGE, { phase: 'EXECUTE' },
    );
    expect(ev).not.toBeNull();
    expect(ev!.sequence).toBe(1);

    const events = coreReadEvents(testRoot, sprintId);
    expect(events).toHaveLength(1);
    expect(events[0]!.channel).toBe(CORE_CHANNELS.SPRINT_PHASE_CHANGE);
  });

  it('DeckentEvent type from core is structurally usable', () => {
    const ev: DeckentEvent | null = coreWriteEvent(
      testRoot, sprintId, 'worker', 'brain',
      CORE_CHANNELS.HEARTBEAT, { taskId: '279-001' },
    );
    expect(ev?.protocol_version).toBe('1.0');
    expect(ev?.source).toBe('worker');
  });

  it('orchestra shim re-exports the SAME function references as core (single module instance)', () => {
    expect(shimWriteEvent).toBe(coreWriteEvent);
    expect(shimReadEvents).toBe(coreReadEvents);
  });

  it('CHANNELS is identical across core and the orchestra shim', () => {
    expect(SHIM_CHANNELS).toBe(CORE_CHANNELS);
    expect(SHIM_CHANNELS.RESULT).toBe(CORE_CHANNELS.RESULT);
  });

  it('write via core is readable via the orchestra shim (shared stream + module)', () => {
    coreWriteEvent(testRoot, sprintId, 'brain', 'worker', CORE_CHANNELS.TASK_ASSIGN, { taskId: 'a' });
    const viaShim = shimReadEvents(testRoot, sprintId);
    expect(viaShim).toHaveLength(1);
    expect(viaShim[0]!.channel).toBe(CORE_CHANNELS.TASK_ASSIGN);
  });

  it('core/audit-writer writes events readable via core/audit-query (rewired core-only import)', () => {
    const ok = writeAuditEvent(testRoot, sprintId, { tenantId: 't1', actor: 'alice', action: 'login' });
    expect(ok).toBe(true);

    const audits = readAuditEvents(testRoot, sprintId);
    expect(audits).toHaveLength(1);
    expect(audits[0]!.actor).toBe('alice');
    expect(audits[0]!.action).toBe('login');
  });

  it('core/audit-writer.ts source never imports from orchestra/event-stream (ADR-008)', () => {
    const src = readFileSync(fileURLToPath(new URL('../../src/core/audit-writer.ts', import.meta.url)), 'utf-8');
    expect(src).not.toContain('orchestra/event-stream');
    expect(src).toContain("from './event-stream.js'");
  });

  it('core/audit-query.ts source never imports from orchestra/event-stream (ADR-008)', () => {
    const src = readFileSync(fileURLToPath(new URL('../../src/core/audit-query.ts', import.meta.url)), 'utf-8');
    expect(src).not.toContain('orchestra/event-stream');
    expect(src).toContain("from './event-stream.js'");
  });
});
