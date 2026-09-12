// An archived sprint's own sealed receipt proves its terminality.
//
// `readOwningRunTerminalDisposition` used to infer terminality for an archived
// run only through `readRunFlowTerminalClosureForSprint`, which first needs the
// sprint's `.pid`/`.snapshot.json` process identity. Teardown removes those, so
// a genuinely finished run read back as `unknown` forever — and because
// retirement of a decided, unsettleable accepted-result attempt requires a
// provably terminal owning run, that attempt blocked every later cold start.
// Observed live: sprint-746 (sealed `terminalOutcome: ABORTED`) blocking
// sprint-747 with EXACT_RECOVERY_TERMINAL_SETTLEMENT_HOLD.
//
// The seal is digest-bound and self-consistent, so reading it is not a
// weakening. These tests pin that, and that nothing short of an intact seal
// for THIS sprint is ever read as terminal.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readArchivedSprintTerminalOutcome } from '../../src/core/sprint-archive.js';

const sha256 = (v: string): string => createHash('sha256').update(v, 'utf8').digest('hex');
const DIGEST = sha256('logical-settlement');

function seal(over: Record<string, unknown> = {}): Record<string, unknown> {
  const reason = 'owner recovery seal';
  const receipt = {
    version: 1,
    sprintId: 'sprint-999001',
    runId: 'sprint-999001',
    coordinatorGeneration: 3,
    terminalOutcome: 'ABORTED',
    logicalSettlementDigest: DIGEST,
    priorAuthorityVersion: 0,
    authorityVersion: 1,
  };
  return {
    kind: 'deckent.sprint-archive-terminal-seal',
    version: 1,
    sprintId: 'sprint-999001',
    runId: 'sprint-999001',
    coordinatorGeneration: 3,
    terminalOutcome: 'ABORTED',
    logicalSettlementDigest: DIGEST,
    priorAuthorityVersion: 0,
    authorityVersion: 1,
    operatorReason: reason,
    operatorReasonSha256: sha256(reason),
    brainAdoptionRequired: false,
    terminalEventsProjectionSha256: null,
    postSealPolicySha256: null,
    terminalReceipt: receipt,
    ...over,
  };
}

let root: string;

function writeSeal(sprintId: string, value: unknown): void {
  const dir = join(root, '.deckent', 'archive', 'sprints', sprintId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'terminal-seal-receipt.json'), JSON.stringify(value), 'utf-8');
}

beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'deckent-archive-seal-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('readArchivedSprintTerminalOutcome — an intact seal is terminal', () => {
  it('reads ABORTED from a well-formed seal', () => {
    writeSeal('sprint-999001', seal());
    expect(readArchivedSprintTerminalOutcome(root, 'sprint-999001')).toBe('ABORTED');
  });

  it('reads COMPLETE from a well-formed seal', () => {
    const receipt = { ...(seal().terminalReceipt as object), terminalOutcome: 'COMPLETE' };
    writeSeal('sprint-999001', seal({ terminalOutcome: 'COMPLETE', terminalReceipt: receipt }));
    expect(readArchivedSprintTerminalOutcome(root, 'sprint-999001')).toBe('COMPLETE');
  });
});

describe('readArchivedSprintTerminalOutcome — fails closed otherwise', () => {
  it('returns null when no archive exists', () => {
    expect(readArchivedSprintTerminalOutcome(root, 'sprint-999001')).toBeNull();
  });

  it('returns null for a seal belonging to a different sprint', () => {
    writeSeal('sprint-999002', seal());
    expect(readArchivedSprintTerminalOutcome(root, 'sprint-999002')).toBeNull();
  });

  it('returns null when the seal contradicts its own receipt', () => {
    // The duplicated outcome disagrees with the receipt it claims to seal.
    writeSeal('sprint-999001', seal({ terminalOutcome: 'COMPLETE' }));
    expect(readArchivedSprintTerminalOutcome(root, 'sprint-999001')).toBeNull();
  });

  it('returns null when the operator reason digest does not match', () => {
    writeSeal('sprint-999001', seal({ operatorReasonSha256: sha256('something else') }));
    expect(readArchivedSprintTerminalOutcome(root, 'sprint-999001')).toBeNull();
  });

  it('returns null for a foreign kind', () => {
    writeSeal('sprint-999001', seal({ kind: 'deckent.some-other-record' }));
    expect(readArchivedSprintTerminalOutcome(root, 'sprint-999001')).toBeNull();
  });

  it('returns null when the receipt is missing or malformed', () => {
    writeSeal('sprint-999001', seal({ terminalReceipt: { version: 1 } }));
    expect(readArchivedSprintTerminalOutcome(root, 'sprint-999001')).toBeNull();
  });

  it('returns null for a non-terminal outcome', () => {
    const receipt = { ...(seal().terminalReceipt as object), terminalOutcome: 'RUNNING' };
    writeSeal('sprint-999001', seal({ terminalOutcome: 'RUNNING', terminalReceipt: receipt }));
    expect(readArchivedSprintTerminalOutcome(root, 'sprint-999001')).toBeNull();
  });

  it('returns null for an unparseable file', () => {
    const dir = join(root, '.deckent', 'archive', 'sprints', 'sprint-999001');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'terminal-seal-receipt.json'), 'not json', 'utf-8');
    expect(readArchivedSprintTerminalOutcome(root, 'sprint-999001')).toBeNull();
  });

  it('returns null for a malformed sprint id instead of touching the filesystem', () => {
    expect(readArchivedSprintTerminalOutcome(root, '../escape')).toBeNull();
    expect(readArchivedSprintTerminalOutcome(root, 'sprint-abc')).toBeNull();
  });
});
