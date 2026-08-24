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
import { afterEach, describe, expect, it, vi } from 'vitest';

const publicTerminalVerifyProbe = vi.hoisted(() => ({
  fail: false,
  callsWhileFailed: 0,
}));

vi.mock('../../src/core/sprint-archive.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/sprint-archive.js')>(
    '../../src/core/sprint-archive.js',
  );
  return {
    ...actual,
    verifySprintArchiveTerminal: (...args: Parameters<typeof actual.verifySprintArchiveTerminal>) => {
      if (publicTerminalVerifyProbe.fail) {
        publicTerminalVerifyProbe.callsWhileFailed += 1;
        return {
          sprintId: args[1],
          ok: false,
          reasonCodes: ['brain_adoption_failed'] as const,
          manifestDigest: null,
          sealReceiptSha256: null,
          brainIndexSha256: null,
          guardedSummarySha256: null,
        };
      }
      return actual.verifySprintArchiveTerminal(...args);
    },
  };
});

import { CHANNELS, readEvents, writeEvent } from '../../src/core/event-stream.js';
import { MemoryStore } from '../../src/core/memory-store.js';
import { verifySprintArchive, verifySprintArchiveTerminal } from '../../src/core/sprint-archive.js';
import type { SprintTerminalReceiptV1 } from '../../src/core/sprint-terminal-publication.js';
import {
  publishOutermostSprintTerminalArchive,
  SPRINT_TERMINAL_COMPLETED_CHANNEL,
  SprintTerminalArchivePublicationError,
} from '../../src/orchestra/sprint-finalizer.js';

const roots: string[] = [];

function fixture(): { root: string; receipt: SprintTerminalReceiptV1 } {
  const root = mkdtempSync(join(tmpdir(), 'deckent-normal-terminal-seal-'));
  roots.push(root);
  mkdirSync(join(root, '.deckent', 'recently-works'), { recursive: true });
  mkdirSync(join(root, '.brain'), { recursive: true });
  const receipt: SprintTerminalReceiptV1 = {
    version: 1,
    sprintId: 'sprint-905',
    runId: 'run-905',
    coordinatorGeneration: 2,
    terminalOutcome: 'COMPLETE',
    logicalSettlementDigest: 'a'.repeat(64),
    priorAuthorityVersion: 0,
    authorityVersion: 1,
  };
  writeFileSync(
    join(root, '.deckent', 'recently-works', 'sprint-905-terminal-receipt.json'),
    `${JSON.stringify({ terminalOutcome: 'COMPLETE', receipt }, null, 2)}\n`,
  );
  const store = new MemoryStore(join(root, '.brain', 'memory.db'));
  store.close();
  writeEvent(root, receipt.sprintId, 'brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, {
    sprintId: receipt.sprintId,
    fromPhase: 'RETRO',
    toPhase: 'CLEANUP',
  });
  return { root, receipt };
}

afterEach(() => {
  publicTerminalVerifyProbe.fail = false;
  publicTerminalVerifyProbe.callsWhileFailed = 0;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function terminalEventsFor(receipt: SprintTerminalReceiptV1) {
  return [
    {
      channel: CHANNELS.SPRINT_PHASE_CHANGE,
      payload: {
        sprintId: receipt.sprintId,
        fromPhase: 'DECAY',
        toPhase: 'COMPLETE',
        transitionKind: 'normal-run',
      },
    },
    {
      channel: SPRINT_TERMINAL_COMPLETED_CHANNEL,
      payload: {
        sprintId: receipt.sprintId,
        status: 'COMPLETE',
        phase: 'COMPLETE',
        terminalOutcome: 'COMPLETE',
      },
    },
  ];
}

describe('normal outermost archive finalizer seal', () => {
  it('seals the exact completed marker, refreshes Brain parity, and retires the journal counter', () => {
    const { root, receipt } = fixture();
    const terminalEvents = terminalEventsFor(receipt);
    const handoffPath = join(root, '.tasks', 'handoffs', '905-001-to-905-002.json');
    mkdirSync(join(handoffPath, '..'), { recursive: true });
    writeFileSync(handoffPath, JSON.stringify({
      id: '905-001-to-905-002', fromTaskId: '905-001', toTaskId: '905-002',
      artifacts: ['src/core/sprint-archive.ts'], status: 'ready', createdAt: '2026-08-23T00:00:00.000Z',
    }));
    // Simulate the production WAL checkpoint race seen by sprint-634: a fresh
    // public verifier would observe a transient detached snapshot failure at
    // this exact boundary. The first commit must consume the core sealer's
    // same-call output instead of invoking that public/replay surface.
    publicTerminalVerifyProbe.fail = true;
    const publication = publishOutermostSprintTerminalArchive({
      projectRoot: root,
      sprintId: receipt.sprintId,
      receipt,
      terminalEvents,
    });
    publicTerminalVerifyProbe.fail = false;
    expect(publicTerminalVerifyProbe.callsWhileFailed).toBe(0);

    const archiveDir = join(root, '.deckent', 'archive', 'sprints', receipt.sprintId);
    const hotJournal = join(root, '.deckent', 'recently-works', `${receipt.sprintId}-events.jsonl`);
    const archivedJournal = join(archiveDir, `${receipt.sprintId}-events.jsonl`);
    const manifest = JSON.parse(readFileSync(join(archiveDir, 'manifest.json'), 'utf-8')) as {
      contentDigest: string;
      artifacts: Array<{ path: string }>;
    };
    const seal = JSON.parse(readFileSync(
      join(archiveDir, 'terminal-seal-receipt.json'),
      'utf-8',
    )) as {
      finalEvent: { sequence: number; digest: string };
      terminalOutcome: string;
      sequenceCounterValue: number;
    };
    const application = JSON.parse(readFileSync(
      join(archiveDir, 'terminal-seal-application.json'),
      'utf-8',
    )) as {
      state: string;
      manifestDigest: string;
      brainAdopted: boolean;
      brainIndexSha256: string;
      guardedSummarySha256: string;
    };
    const archiveIndex = new MemoryStore(join(root, '.brain', 'memory.db'));
    const archiveEntry = archiveIndex.getById(`archive-${receipt.sprintId}`);
    archiveIndex.close();

    expect(publication.seal.terminalComplete).toBe(true);
    expect(publication.finalEvent).toEqual(seal.finalEvent);
    expect(seal.terminalOutcome).toBe('COMPLETE');
    expect(seal.sequenceCounterValue).toBe(publication.finalEvent.sequence);
    expect(readFileSync(join(archiveDir, `${receipt.sprintId}-seq`), 'utf-8').trim())
      .toBe(String(publication.finalEvent.sequence));
    expect(application).toMatchObject({
      state: 'applied',
      manifestDigest: manifest.contentDigest,
      brainAdopted: true,
      brainIndexSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      guardedSummarySha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(readEvents(root, receipt.sprintId).at(-1)?.channel).toBe(SPRINT_TERMINAL_COMPLETED_CHANNEL);
    expect(readFileSync(archivedJournal, 'utf-8')).toBe(readFileSync(hotJournal, 'utf-8'));
    expect(manifest.artifacts.map(artifact => artifact.path)).toEqual(expect.arrayContaining([
      `${receipt.sprintId}-events.jsonl`,
      'terminal-seal-receipt.json',
    ]));
    expect(verifySprintArchive(root, receipt.sprintId).ok).toBe(true);
    expect(archiveEntry?.metadata).toContain(`\"manifestDigest\":\"sha256:${manifest.contentDigest}\"`);
    expect(readFileSync(join(root, '.brain', 'exports', 'summary.md'), 'utf-8'))
      .toContain('_Total entries: 1');
    expect(existsSync(join(root, '.deckent', 'recently-works', `${receipt.sprintId}-seq`))).toBe(false);
    expect(existsSync(handoffPath)).toBe(false);
    expect(readFileSync(join(archiveDir, 'tasks', 'handoffs', '905-001-to-905-002.json'), 'utf8'))
      .toContain('"status":"ready"');
    expect(verifySprintArchiveTerminal(root, receipt.sprintId, hotJournal))
      .toMatchObject({ ok: true, reasonCodes: [] });

    const journalAfterSeal = readFileSync(hotJournal);
    const replay = publishOutermostSprintTerminalArchive({
      projectRoot: root,
      sprintId: receipt.sprintId,
      receipt,
      terminalEvents,
    });
    expect(replay.seal).toMatchObject({ disposition: 'idempotent', terminalComplete: true });
    expect(existsSync(join(root, '.deckent', 'recently-works', `${receipt.sprintId}-seq`))).toBe(false);
    expect(readFileSync(hotJournal)).toEqual(journalAfterSeal);

    expect(() => publishOutermostSprintTerminalArchive({
      projectRoot: root,
      sprintId: receipt.sprintId,
      receipt,
      terminalEvents: terminalEvents.map((event, index) => index === 1
        ? { ...event, payload: { ...event.payload, phase: 'ABORTED' } }
        : event),
    })).toThrow(SprintTerminalArchivePublicationError);
    expect(readFileSync(hotJournal)).toEqual(journalAfterSeal);
  });


  it('replays an older applied seal after a later Brain refresh and rejects conflict or tampering', () => {
    const { root, receipt } = fixture();
    const terminalEvents = terminalEventsFor(receipt);
    publishOutermostSprintTerminalArchive({
      projectRoot: root,
      sprintId: receipt.sprintId,
      receipt,
      terminalEvents,
    });
    const archiveDir = join(root, '.deckent', 'archive', 'sprints', receipt.sprintId);
    const hotJournal = join(root, '.deckent', 'recently-works', `${receipt.sprintId}-events.jsonl`);
    const journalAfterSeal = readFileSync(hotJournal);
    const firstSummary = readFileSync(join(root, '.brain', 'exports', 'summary.md'), 'utf8');

    const laterReceipt: SprintTerminalReceiptV1 = {
      ...receipt,
      sprintId: 'sprint-906',
      runId: 'run-906',
      logicalSettlementDigest: 'b'.repeat(64),
      priorAuthorityVersion: 1,
      authorityVersion: 2,
    };
    writeFileSync(
      join(root, '.deckent', 'recently-works', `${laterReceipt.sprintId}-terminal-receipt.json`),
      `${JSON.stringify({ terminalOutcome: 'COMPLETE', receipt: laterReceipt }, null, 2)}\n`,
    );
    writeEvent(root, laterReceipt.sprintId, 'brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, {
      sprintId: laterReceipt.sprintId,
      fromPhase: 'RETRO',
      toPhase: 'CLEANUP',
    });
    publishOutermostSprintTerminalArchive({
      projectRoot: root,
      sprintId: laterReceipt.sprintId,
      receipt: laterReceipt,
      terminalEvents: terminalEventsFor(laterReceipt),
    });
    expect(readFileSync(join(root, '.brain', 'exports', 'summary.md'), 'utf8')).not.toBe(firstSummary);

    expect(publishOutermostSprintTerminalArchive({
      projectRoot: root,
      sprintId: receipt.sprintId,
      receipt,
      terminalEvents,
    }).seal).toMatchObject({ disposition: 'idempotent', terminalComplete: true });
    expect(readFileSync(hotJournal)).toEqual(journalAfterSeal);

    expect(() => publishOutermostSprintTerminalArchive({
      projectRoot: root,
      sprintId: receipt.sprintId,
      receipt,
      terminalEvents: terminalEvents.map((event, index) => index === 1
        ? { ...event, payload: { ...event.payload, phase: 'ABORTED' } }
        : event),
    })).toThrow(SprintTerminalArchivePublicationError);

    const store = new MemoryStore(join(root, '.brain', 'memory.db'));
    try {
      const entry = store.getById(`archive-${receipt.sprintId}`)!;
      store.update(entry.id, { summary: 'tampered historic Brain projection' }, 'test-tamper');
    } finally {
      store.close();
    }
    expect(() => publishOutermostSprintTerminalArchive({
      projectRoot: root,
      sprintId: receipt.sprintId,
      receipt,
      terminalEvents,
    })).toThrow(SprintTerminalArchivePublicationError);
    expect(readFileSync(hotJournal)).toEqual(journalAfterSeal);
    expect(readFileSync(join(archiveDir, 'terminal-seal-application.json'), 'utf8')).toContain('"state": "applied"');
  });
});
