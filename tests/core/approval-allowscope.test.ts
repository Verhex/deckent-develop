// ─── ApprovalAllowScope tests (APR-ALLOWSCOPE, task 357-005) ─────────────────
// Faithful behavior tests for the scoped always-allow grant store: schema-level
// rejection of a global/wildcard grant, exact-scope + risk<=max + not-expired
// matching, expiry cleanup at match-time, the grant->match->revoke->no-match
// round-trip, and fail-soft loading of a corrupt/missing/malformed on-disk file.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  ApprovalAllowScopeStore,
  ApprovalAllowScopeError,
  loadAllowScopeFile,
  APPROVAL_ALLOWS_FILE,
  type ApprovalAllowScopeGrantInput,
  type ApprovalAllowScopeMatchInput,
} from '../../src/core/approval-allowscope.js';

const GRANTED_AT = '2026-07-02T00:00:00.000Z';
const FUTURE_EXPIRY = '2026-07-02T01:00:00.000Z';
const PAST_EXPIRY = '2026-07-01T23:59:59.000Z';

function buildGrantInput(overrides: Partial<ApprovalAllowScopeGrantInput> = {}): ApprovalAllowScopeGrantInput {
  return {
    scopeId: 'sprint-357',
    scope: 'shell-exec',
    maxRisk: 'medium',
    expiresAt: FUTURE_EXPIRY,
    grantedBy: 'alperen',
    ...overrides,
  };
}

function buildMatchInput(overrides: Partial<ApprovalAllowScopeMatchInput> = {}): ApprovalAllowScopeMatchInput {
  return {
    scopeId: 'sprint-357',
    scope: 'shell-exec',
    risk: 'medium',
    ...overrides,
  };
}

let projectRoot: string;
let filePath: string;
let idCounter: number;

function makeStore(now: string = GRANTED_AT): ApprovalAllowScopeStore {
  return new ApprovalAllowScopeStore(projectRoot, {
    filePath,
    now: () => new Date(now),
    idFactory: () => `allow-${++idCounter}`,
  });
}

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'approval-allowscope-'));
  filePath = join(projectRoot, '.deckent', 'settings', 'approval-allows.json');
  idCounter = 0;
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

// ─── construction / default path / fail-soft load ────────────────────────────

describe('ApprovalAllowScopeStore — construction', () => {
  it('starts empty when no file exists yet', () => {
    const store = makeStore();
    expect(store.list()).toEqual([]);
  });

  it('defaults filePath to <projectRoot>/.deckent/settings/approval-allows.json', () => {
    const store = new ApprovalAllowScopeStore(projectRoot);
    store.grantAllow(buildGrantInput());
    expect(existsSync(join(projectRoot, APPROVAL_ALLOWS_FILE))).toBe(true);
  });

  it('is fail-soft to an empty set when the file contains invalid JSON', () => {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, '{ this is not valid json', 'utf-8');
    expect(() => makeStore()).not.toThrow();
    expect(makeStore().list()).toEqual([]);
  });

  it('is fail-soft to an empty set when the top level is not an array', () => {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify({ not: 'an array' }), 'utf-8');
    expect(makeStore().list()).toEqual([]);
  });

  it('is fail-soft and skips only the malformed entries in a mixed-validity array', () => {
    mkdirSync(dirname(filePath), { recursive: true });
    const valid = {
      id: 'allow-good',
      scopeId: 'sprint-357',
      scope: 'shell-exec',
      maxRisk: 'medium',
      expiresAt: FUTURE_EXPIRY,
      grantedBy: 'alperen',
      grantedAt: GRANTED_AT,
      reason: '',
    };
    const malformed = { id: 'allow-bad', scope: 'shell-exec' }; // missing required fields
    writeFileSync(filePath, JSON.stringify([valid, malformed]), 'utf-8');
    const rules = loadAllowScopeFile(filePath);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.id).toBe('allow-good');
  });
});

// ─── schema-level never-global enforcement ───────────────────────────────────

describe('ApprovalAllowScopeStore — never-global (wildcard scopeId rejection)', () => {
  it.each(['*', '**', 'all', 'ALL', 'Any', 'global', 'GLOBAL'])(
    'rejects a grant whose scopeId is the reserved wildcard token %j',
    (scopeId) => {
      const store = makeStore();
      expect(() => store.grantAllow(buildGrantInput({ scopeId }))).toThrow(ApprovalAllowScopeError);
      expect(store.list()).toEqual([]);
    },
  );

  it('does not persist anything to disk when a wildcard grant is rejected', () => {
    const store = makeStore();
    try {
      store.grantAllow(buildGrantInput({ scopeId: '*' }));
    } catch {
      // expected
    }
    expect(existsSync(filePath)).toBe(false);
  });

  it('accepts a concrete (non-wildcard) scopeId', () => {
    const store = makeStore();
    const rule = store.grantAllow(buildGrantInput({ scopeId: 'sprint-357' }));
    expect(rule.scopeId).toBe('sprint-357');
  });

  it('rejects an empty scopeId (schema min-length, not just the wildcard set)', () => {
    const store = makeStore();
    expect(() => store.grantAllow(buildGrantInput({ scopeId: '' }))).toThrow(ApprovalAllowScopeError);
  });
});

// ─── grantAllow — shape + persistence ────────────────────────────────────────

describe('ApprovalAllowScopeStore — grantAllow', () => {
  it('generates id + grantedAt, defaults reason, and returns the full rule', () => {
    const store = makeStore(GRANTED_AT);
    const rule = store.grantAllow(buildGrantInput());
    expect(rule.id).toBe('allow-1');
    expect(rule.grantedAt).toBe(GRANTED_AT);
    expect(rule.reason).toBe('');
    expect(rule.scope).toBe('shell-exec');
    expect(rule.maxRisk).toBe('medium');
  });

  it('persists the grant atomically as a JSON array on disk', () => {
    const store = makeStore(GRANTED_AT);
    store.grantAllow(buildGrantInput());
    expect(existsSync(filePath)).toBe(true);
    const onDisk = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown[];
    expect(onDisk).toHaveLength(1);
    expect((onDisk[0] as { scopeId: string }).scopeId).toBe('sprint-357');
  });

  it('accumulates multiple grants', () => {
    const store = makeStore();
    store.grantAllow(buildGrantInput({ scopeId: 'sprint-357' }));
    store.grantAllow(buildGrantInput({ scopeId: 'sprint-358' }));
    expect(store.list()).toHaveLength(2);
  });

  it('rejects an invalid ApprovalScope value', () => {
    const store = makeStore();
    expect(() =>
      store.grantAllow(buildGrantInput({ scope: 'not-a-real-scope' as never })),
    ).toThrow(ApprovalAllowScopeError);
  });

  it('rejects an invalid maxRisk value', () => {
    const store = makeStore();
    expect(() => store.grantAllow(buildGrantInput({ maxRisk: 'catastrophic' as never }))).toThrow(
      ApprovalAllowScopeError,
    );
  });

  it('rejects a non-ISO expiresAt', () => {
    const store = makeStore();
    expect(() => store.grantAllow(buildGrantInput({ expiresAt: 'not-a-date' }))).toThrow(ApprovalAllowScopeError);
  });
});

// ─── matchesAllow — exact-scope + risk<=max + not-expired ────────────────────

describe('ApprovalAllowScopeStore — matchesAllow positive cases', () => {
  it('matches when scopeId + scope are identical and risk is exactly maxRisk', () => {
    const store = makeStore();
    store.grantAllow(buildGrantInput({ maxRisk: 'medium' }));
    const match = store.matchesAllow(buildMatchInput({ risk: 'medium' }));
    expect(match).not.toBeNull();
    expect(match!.scopeId).toBe('sprint-357');
  });

  it('matches when request risk is BELOW maxRisk', () => {
    const store = makeStore();
    store.grantAllow(buildGrantInput({ maxRisk: 'high' }));
    const match = store.matchesAllow(buildMatchInput({ risk: 'low' }));
    expect(match).not.toBeNull();
  });

  it('matches the none risk tier against any maxRisk', () => {
    const store = makeStore();
    store.grantAllow(buildGrantInput({ maxRisk: 'low' }));
    expect(store.matchesAllow(buildMatchInput({ risk: 'none' }))).not.toBeNull();
  });
});

describe('ApprovalAllowScopeStore — matchesAllow negative cases (rich)', () => {
  it('does not match a different scopeId', () => {
    const store = makeStore();
    store.grantAllow(buildGrantInput({ scopeId: 'sprint-357' }));
    expect(store.matchesAllow(buildMatchInput({ scopeId: 'sprint-999' }))).toBeNull();
  });

  it('does not match a different scope (out-of-scope)', () => {
    const store = makeStore();
    store.grantAllow(buildGrantInput({ scope: 'shell-exec' }));
    expect(store.matchesAllow(buildMatchInput({ scope: 'network' }))).toBeNull();
  });

  it('does not match a scope that is merely adjacent (credential vs shell-exec)', () => {
    const store = makeStore();
    store.grantAllow(buildGrantInput({ scope: 'credential' }));
    expect(store.matchesAllow(buildMatchInput({ scope: 'shell-exec' }))).toBeNull();
  });

  it('does not match when request risk exceeds maxRisk (over-risk)', () => {
    const store = makeStore();
    store.grantAllow(buildGrantInput({ maxRisk: 'low' }));
    expect(store.matchesAllow(buildMatchInput({ risk: 'medium' }))).toBeNull();
    expect(store.matchesAllow(buildMatchInput({ risk: 'high' }))).toBeNull();
    expect(store.matchesAllow(buildMatchInput({ risk: 'critical' }))).toBeNull();
  });

  it('does not match critical risk even against a maxRisk of high', () => {
    const store = makeStore();
    store.grantAllow(buildGrantInput({ maxRisk: 'high' }));
    expect(store.matchesAllow(buildMatchInput({ risk: 'critical' }))).toBeNull();
  });

  it('returns null against an empty store', () => {
    const store = makeStore();
    expect(store.matchesAllow(buildMatchInput())).toBeNull();
  });

  it('does not match a request that satisfies risk+scope but not scopeId, and vice versa', () => {
    const store = makeStore();
    store.grantAllow(buildGrantInput({ scopeId: 'sprint-357', scope: 'shell-exec', maxRisk: 'high' }));
    expect(store.matchesAllow({ scopeId: 'sprint-999', scope: 'shell-exec', risk: 'low' })).toBeNull();
    expect(store.matchesAllow({ scopeId: 'sprint-357', scope: 'network', risk: 'low' })).toBeNull();
  });
});

// ─── expiry — not-expired requirement + cleanup-at-match-time ────────────────

describe('ApprovalAllowScopeStore — expiry', () => {
  it('does not match an already-expired grant', () => {
    const store = makeStore(GRANTED_AT);
    store.grantAllow(buildGrantInput({ expiresAt: PAST_EXPIRY }));
    expect(store.matchesAllow(buildMatchInput())).toBeNull();
  });

  it('purges an expired grant from the in-memory set as a side effect of matchesAllow', () => {
    const store = makeStore(GRANTED_AT);
    store.grantAllow(buildGrantInput({ expiresAt: PAST_EXPIRY }));
    expect(store.list()).toHaveLength(1);
    store.matchesAllow(buildMatchInput());
    expect(store.list()).toEqual([]);
  });

  it('persists the purge — a fresh store re-reading the same file no longer sees the expired grant', () => {
    const store = makeStore(GRANTED_AT);
    store.grantAllow(buildGrantInput({ expiresAt: PAST_EXPIRY }));
    store.matchesAllow(buildMatchInput());

    const reloaded = makeStore(GRANTED_AT);
    expect(reloaded.list()).toEqual([]);
  });

  it('only purges the expired grant, leaving a still-live grant for a different scopeId intact', () => {
    const store = makeStore(GRANTED_AT);
    store.grantAllow(buildGrantInput({ scopeId: 'sprint-expired', expiresAt: PAST_EXPIRY }));
    store.grantAllow(buildGrantInput({ scopeId: 'sprint-live', expiresAt: FUTURE_EXPIRY }));

    store.matchesAllow(buildMatchInput({ scopeId: 'sprint-expired' }));

    const remaining = store.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.scopeId).toBe('sprint-live');
  });

  it('treats a grant expiring exactly at "now" as expired (boundary is exclusive)', () => {
    const store = makeStore(FUTURE_EXPIRY);
    store.grantAllow(buildGrantInput({ expiresAt: FUTURE_EXPIRY }));
    // grantAllow above ran at clock=FUTURE_EXPIRY too — grantedAt is fine (schema
    // does not compare grantedAt/expiresAt); the match check is what boundary-tests.
    expect(store.matchesAllow(buildMatchInput())).toBeNull();
  });
});

// ─── round-trip: grant -> match -> revoke -> no-match ────────────────────────

describe('ApprovalAllowScopeStore — grant -> match -> revoke -> no-match round-trip', () => {
  it('completes the full round-trip', () => {
    const store = makeStore();
    const rule = store.grantAllow(buildGrantInput());

    expect(store.matchesAllow(buildMatchInput())).not.toBeNull();

    const revoked = store.revokeAllow(rule.id);
    expect(revoked).toBe(true);

    expect(store.matchesAllow(buildMatchInput())).toBeNull();
    expect(store.list()).toEqual([]);
  });

  it('persists the revoke — a fresh store re-reading the same file no longer sees it', () => {
    const store = makeStore();
    const rule = store.grantAllow(buildGrantInput());
    store.revokeAllow(rule.id);

    const reloaded = makeStore();
    expect(reloaded.list()).toEqual([]);
  });

  it('revokeAllow on an unknown id returns false and does not disturb existing grants', () => {
    const store = makeStore();
    store.grantAllow(buildGrantInput());
    expect(store.revokeAllow('does-not-exist')).toBe(false);
    expect(store.list()).toHaveLength(1);
  });

  it('revoking one grant leaves sibling grants untouched', () => {
    const store = makeStore();
    const first = store.grantAllow(buildGrantInput({ scopeId: 'sprint-a' }));
    store.grantAllow(buildGrantInput({ scopeId: 'sprint-b' }));

    store.revokeAllow(first.id);

    const remaining = store.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.scopeId).toBe('sprint-b');
  });
});
