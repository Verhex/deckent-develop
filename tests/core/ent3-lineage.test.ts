// ─── ENT-3 causal lineage — hermetic integration tests ───────────────────────
// Verifies that correlationId/causationId are written to the audit stream and
// that readAuditEventsByCorrelationId() retrieves by either field.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  writeAuditEvent,
  _resetChainHead,
  type AuditEvent,
} from '../../src/core/audit-writer.js';
import { readAuditEventsByCorrelationId } from '../../src/core/audit-query.js';

const SPRINT_ID = 'sprint-ent3-test';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'ent3-lineage-'));
  mkdirSync(join(tmpRoot, '.deckent', 'recently-works'), { recursive: true });
  _resetChainHead();
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

// ─── Test A: N events same correlationId → readAuditEventsByCorrelationId returns all N

describe('readAuditEventsByCorrelationId — correlationId match', () => {
  it('returns all N events sharing the same correlationId', () => {
    const CORR_ID = 'corr-flow-001';
    const base: AuditEvent = { tenantId: 'tenant-a', actor: 'user-1', action: 'read' };

    for (let i = 0; i < 4; i++) {
      const written = writeAuditEvent(tmpRoot, SPRINT_ID, {
        ...base,
        action: `action-${i}`,
        correlationId: CORR_ID,
      });
      expect(written).toBe(true);
    }

    // Write one unrelated event (different correlationId)
    writeAuditEvent(tmpRoot, SPRINT_ID, {
      ...base,
      action: 'unrelated',
      correlationId: 'other-flow',
    });

    const results = readAuditEventsByCorrelationId(tmpRoot, SPRINT_ID, CORR_ID);
    expect(results).toHaveLength(4);
    expect(results.every(e => e.correlationId === CORR_ID)).toBe(true);
  });

  it('returns empty array when no events have the given correlationId', () => {
    writeAuditEvent(tmpRoot, SPRINT_ID, {
      tenantId: 't1', actor: 'u1', action: 'read', correlationId: 'other',
    });

    const results = readAuditEventsByCorrelationId(tmpRoot, SPRINT_ID, 'nonexistent-corr');
    expect(results).toHaveLength(0);
  });
});

// ─── Test B: events matched by causationId

describe('readAuditEventsByCorrelationId — causationId match', () => {
  it('also returns events whose causationId matches the given id', () => {
    const LOOKUP_ID = 'shared-cause-abc';

    writeAuditEvent(tmpRoot, SPRINT_ID, {
      tenantId: 't1', actor: 'u1', action: 'trigger',
      correlationId: LOOKUP_ID,
    });

    writeAuditEvent(tmpRoot, SPRINT_ID, {
      tenantId: 't1', actor: 'u2', action: 'caused-action',
      causationId: LOOKUP_ID,
    });

    writeAuditEvent(tmpRoot, SPRINT_ID, {
      tenantId: 't1', actor: 'u3', action: 'no-match',
    });

    const results = readAuditEventsByCorrelationId(tmpRoot, SPRINT_ID, LOOKUP_ID);
    expect(results).toHaveLength(2);
    const actions = results.map(e => e.action).sort();
    expect(actions).toEqual(['caused-action', 'trigger']);
  });
});

// ─── Test C: chain fields (prevHmac/hmac) preserved on returned events

describe('readAuditEventsByCorrelationId — chain fields preserved', () => {
  it('returned events carry prevHmac and hmac (chain intact)', () => {
    const CORR_ID = 'chain-test-corr';

    writeAuditEvent(tmpRoot, SPRINT_ID, {
      tenantId: 't1', actor: 'u1', action: 'first', correlationId: CORR_ID,
    });
    writeAuditEvent(tmpRoot, SPRINT_ID, {
      tenantId: 't1', actor: 'u1', action: 'second', correlationId: CORR_ID,
    });

    const results = readAuditEventsByCorrelationId(tmpRoot, SPRINT_ID, CORR_ID);
    expect(results).toHaveLength(2);
    for (const e of results) {
      expect(typeof e.prevHmac).toBe('string');
      expect(e.prevHmac!.length).toBeGreaterThan(0);
      expect(typeof e.hmac).toBe('string');
      expect(e.hmac!.length).toBeGreaterThan(0);
    }
  });
});

// ─── Test D: events without lineage fields not returned

describe('readAuditEventsByCorrelationId — lineage-less events excluded', () => {
  it('returns empty when events exist but none carry the looked-up id', () => {
    writeAuditEvent(tmpRoot, SPRINT_ID, {
      tenantId: 't1', actor: 'u1', action: 'no-lineage',
    });

    const results = readAuditEventsByCorrelationId(tmpRoot, SPRINT_ID, 'any-id');
    expect(results).toHaveLength(0);
  });
});
