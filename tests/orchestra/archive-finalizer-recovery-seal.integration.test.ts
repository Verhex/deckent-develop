import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { CHANNELS, readEvents, writeEvent } from '../../src/core/event-stream.js';
import { MemoryStore } from '../../src/core/memory-store.js';
import type { SprintTerminalReceiptV1 } from '../../src/core/sprint-terminal-publication.js';
import {
  publishOutermostSprintTerminalArchive,
  SprintTerminalArchivePublicationError,
} from '../../src/orchestra/sprint-finalizer.js';

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-recovery-terminal-seal-'));
  roots.push(root);
  mkdirSync(join(root, '.deckent', 'recently-works'), { recursive: true });
  mkdirSync(join(root, '.brain'), { recursive: true });
  const store = new MemoryStore(join(root, '.brain', 'memory.db'));
  store.close();
  return root;
}

function receipt(): SprintTerminalReceiptV1 {
  return {
    version: 1,
    sprintId: 'sprint-906',
    runId: 'recovery-run-906',
    coordinatorGeneration: 4,
    terminalOutcome: 'COMPLETE',
    logicalSettlementDigest: 'b'.repeat(64),
    priorAuthorityVersion: 0,
    authorityVersion: 1,
  };
}

function terminalEvents(sprintId: string) {
  return [
    {
      channel: CHANNELS.SPRINT_PHASE_CHANGE,
      payload: {
        recoveryKind: 'completed-checkpoint-terminalization',
        sprintId,
        fromPhase: 'EVALUATE',
        toPhase: 'COMPLETE',
        replayedPhases: [],
      },
    },
    {
      channel: CHANNELS.RECOVERY_TERMINALIZATION_COMPLETED,
      payload: {
        recoveryKind: 'completed-checkpoint-terminalization',
        sprintId,
        status: 'COMPLETE',
        phase: 'COMPLETE',
        dispatchCount: 0,
      },
    },
  ];
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('completed-checkpoint recovery archive seal', () => {
  it('seals recovery completion as the last durable event and refreshes the Brain archive projection', () => {
    const root = makeRoot();
    const terminalReceipt = receipt();
    writeFileSync(
      join(root, '.deckent', 'recently-works', `${terminalReceipt.sprintId}-terminal-receipt.json`),
      `${JSON.stringify({ terminalOutcome: 'COMPLETE', receipt: terminalReceipt }, null, 2)}\n`,
    );
    writeEvent(
      root,
      terminalReceipt.sprintId,
      'brain',
      '*',
      CHANNELS.RECOVERY_CLEANUP_SETTLED,
      { sprintId: terminalReceipt.sprintId, outcome: 'RETAINED_BY_POLICY' },
    );
    const handoffPath = join(root, '.tasks', 'handoffs', '906-001-to-906-002.json');
    mkdirSync(join(handoffPath, '..'), { recursive: true });
    writeFileSync(handoffPath, JSON.stringify({
      id: '906-001-to-906-002', fromTaskId: '906-001', toTaskId: '906-002',
      artifacts: ['src/core/sprint-archive.ts'], status: 'ready', createdAt: '2026-08-23T00:00:00.000Z',
    }));

    const publication = publishOutermostSprintTerminalArchive({
      projectRoot: root,
      sprintId: terminalReceipt.sprintId,
      receipt: terminalReceipt,
      terminalEvents: terminalEvents(terminalReceipt.sprintId),
    });

    const archiveDir = join(root, '.deckent', 'archive', 'sprints', terminalReceipt.sprintId);
    const events = readEvents(root, terminalReceipt.sprintId);
    const store = new MemoryStore(join(root, '.brain', 'memory.db'));
    const archiveEntry = store.getById(`archive-${terminalReceipt.sprintId}`);
    store.close();

    expect(publication.seal.terminalComplete).toBe(true);
    expect(events.map(event => event.channel)).toEqual([
      CHANNELS.RECOVERY_CLEANUP_SETTLED,
      CHANNELS.SPRINT_PHASE_CHANGE,
      CHANNELS.RECOVERY_TERMINALIZATION_COMPLETED,
    ]);
    expect(publication.finalEvent.sequence).toBe(events.at(-1)?.sequence);
    expect(readFileSync(
      join(archiveDir, `${terminalReceipt.sprintId}-seq`),
      'utf-8',
    ).trim()).toBe(String(publication.finalEvent.sequence));
    expect(archiveEntry?.content).toContain(`Canonical archive: .deckent/archive/sprints/${terminalReceipt.sprintId}`);
    expect(readFileSync(join(root, '.brain', 'exports', 'summary.md'), 'utf-8'))
      .toContain('_Total entries: 1');
    expect(existsSync(join(archiveDir, 'terminal-seal-receipt.json'))).toBe(true);
    expect(existsSync(join(root, '.deckent', 'recently-works', `${terminalReceipt.sprintId}-seq`)))
      .toBe(false);
    expect(existsSync(handoffPath)).toBe(false);
    expect(readFileSync(join(archiveDir, 'tasks', 'handoffs', '906-001-to-906-002.json'), 'utf8'))
      .toContain('"status":"ready"');
  });

  it('holds a mismatched receipt before emitting any false recovery COMPLETE marker', () => {
    const root = makeRoot();
    const terminalReceipt = receipt();
    writeFileSync(
      join(root, '.deckent', 'recently-works', `${terminalReceipt.sprintId}-terminal-receipt.json`),
      `${JSON.stringify({
        terminalOutcome: 'COMPLETE',
        receipt: { ...terminalReceipt, logicalSettlementDigest: 'c'.repeat(64) },
      }, null, 2)}\n`,
    );

    expect(() => publishOutermostSprintTerminalArchive({
      projectRoot: root,
      sprintId: terminalReceipt.sprintId,
      receipt: terminalReceipt,
      terminalEvents: terminalEvents(terminalReceipt.sprintId),
    })).toThrow(SprintTerminalArchivePublicationError);

    expect(readEvents(root, terminalReceipt.sprintId)).toEqual([]);
    expect(existsSync(join(
      root,
      '.deckent',
      'archive',
      'sprints',
      terminalReceipt.sprintId,
      'terminal-seal-receipt.json',
    ))).toBe(false);
  });
});
