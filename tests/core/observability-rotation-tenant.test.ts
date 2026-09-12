// ═══ 747-001: tenant-aware retention prune receipt ═══════════════════
// `enforceRetentionPolicy` used to evaluate its count/size ceilings over ONE
// global archive population. In a multi-tenant install that is a data-loss
// path: tenant A's `max_count` silently deletes tenant B's retained evidence
// because both tenants' archives landed in the same sorted list.
//
// These tests exercise the CANONICAL module (`src/core/observability-rotation.ts`)
// — there is no fixture-local reimplementation of the prune algorithm here.
// Every fixture is hermetic: a tmpdir-scoped root, no spawn, no shared state.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, existsSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  enforceRetentionPolicy,
  listArchives,
  listTenantScopes,
  resolveArchiveTenantScope,
  markArchiveLegalHold,
  isArchiveUnderLegalHold,
  DEFAULT_RETENTION_POLICY,
} from '../../src/core/observability-rotation.js';
import { resolveTenant } from '../../src/core/tenant-context.js';

let TEST_ROOT: string;

/** The scope the canonical tenant authority resolves for a plain project root. */
function projectScope(): string {
  return resolveTenant(TEST_ROOT).tenantId;
}

/** `<root>/.deckent/tenants/<tenantId>/archive/metrics` — the tenant archive namespace. */
function tenantArchiveDir(tenantId: string): string {
  return join(TEST_ROOT, '.deckent', 'tenants', tenantId, 'archive', 'metrics');
}

/** `<root>/.deckent/archive/metrics` — the non-partitioned project namespace. */
function projectArchiveDir(): string {
  return join(TEST_ROOT, '.deckent', 'archive', 'metrics');
}

/**
 * Fixture archive with an exact on-disk size and a deterministic mtime, so the
 * age/count/size ceilings are reproducible across filesystems.
 */
function createArchive(dir: string, name: string, ageMs: number, bytes = 16): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, Buffer.alloc(bytes, 'x'));
  const mtime = new Date(Date.now() - ageMs);
  utimesSync(path, mtime, mtime);
  return path;
}

function writeConfig(config: unknown): void {
  mkdirSync(join(TEST_ROOT, '.deckent'), { recursive: true });
  writeFileSync(join(TEST_ROOT, '.deckent', 'config.json'), JSON.stringify(config), 'utf-8');
}

beforeEach(() => {
  TEST_ROOT = mkdtempSync(join(tmpdir(), 'deckent-obs-tenant-'));
  mkdirSync(join(TEST_ROOT, '.deckent'), { recursive: true });
});

afterEach(() => {
  try {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  } catch { /* cleanup best effort */ }
});

// ═══ Tenant scope discovery ═════════════════════════════════════════

describe('tenant scope discovery', () => {
  it('lists only valid tenant ids that own an isolation directory', () => {
    mkdirSync(join(TEST_ROOT, '.deckent', 'tenants', 'acme'), { recursive: true });
    mkdirSync(join(TEST_ROOT, '.deckent', 'tenants', 'globex'), { recursive: true });
    // Rejected by the canonical isValidTenantId authority (uppercase + dot).
    mkdirSync(join(TEST_ROOT, '.deckent', 'tenants', 'Bad.Tenant'), { recursive: true });

    expect(listTenantScopes(TEST_ROOT)).toEqual(['acme', 'globex']);
  });

  it('returns an empty list when no tenant namespace exists', () => {
    expect(listTenantScopes(TEST_ROOT)).toEqual([]);
  });

  it('derives an archive tenant scope from its isolation path', () => {
    const archive = createArchive(tenantArchiveDir('acme'), 'metrics-a.jsonl.gz', 1000);
    expect(resolveArchiveTenantScope(TEST_ROOT, archive)).toBe('acme');
  });

  it('attributes a non-partitioned archive to the root tenant scope', () => {
    const archive = createArchive(projectArchiveDir(), 'metrics-p.jsonl.gz', 1000);
    expect(resolveArchiveTenantScope(TEST_ROOT, archive)).toBe(projectScope());
  });

  it('discovers tenant-partitioned archives alongside project-scope archives', () => {
    const projectArchive = createArchive(projectArchiveDir(), 'metrics-p.jsonl.gz', 1000);
    const acmeArchive = createArchive(tenantArchiveDir('acme'), 'metrics-a.jsonl.gz', 1000);
    const globexArchive = createArchive(
      join(TEST_ROOT, '.deckent', 'tenants', 'globex', 'archive', 'sprints', 'sprint-747', 'metrics'),
      'metrics-g.jsonl.gz',
      1000,
    );

    const archives = listArchives(TEST_ROOT);
    expect(archives).toContain(projectArchive);
    expect(archives).toContain(acmeArchive);
    expect(archives).toContain(globexArchive);
  });
});

// ═══ Receipt records the tenant scope of each pruned archive ════════

describe('RetentionPruneReceipt tenant attribution', () => {
  it('names the tenant scope every pruned archive belonged to', () => {
    const acmeOld = createArchive(tenantArchiveDir('acme'), 'metrics-a-old.jsonl.gz', 10_000);
    createArchive(tenantArchiveDir('acme'), 'metrics-a-new.jsonl.gz', 1);
    const globexOld = createArchive(tenantArchiveDir('globex'), 'metrics-g-old.jsonl.gz', 10_000);
    createArchive(tenantArchiveDir('globex'), 'metrics-g-new.jsonl.gz', 1);

    const receipt = enforceRetentionPolicy(TEST_ROOT, { keepLastN: 1, maxAgeDays: 90, maxSizeMB: 500 });

    expect(receipt.pruned.sort()).toEqual([acmeOld, globexOld].sort());
    const attributed = new Map(receipt.prunedArchives.map(entry => [entry.path, entry.tenantScope]));
    expect(attributed.get(acmeOld)).toBe('acme');
    expect(attributed.get(globexOld)).toBe('globex');
    // Attribution covers exactly the deletions — no extra, no missing rows.
    expect(receipt.prunedArchives).toHaveLength(receipt.pruned.length);
  });

  it('reports one scope outcome per evaluated tenant, with that scope`s ceilings', () => {
    createArchive(tenantArchiveDir('acme'), 'metrics-a.jsonl.gz', 1000);
    createArchive(tenantArchiveDir('globex'), 'metrics-g.jsonl.gz', 1000);
    createArchive(projectArchiveDir(), 'metrics-p.jsonl.gz', 1000);

    const receipt = enforceRetentionPolicy(TEST_ROOT);

    const scopes = receipt.scopes.map(scope => scope.tenantScope).sort();
    expect(scopes).toEqual(['acme', 'globex', projectScope()].sort());
    for (const scope of receipt.scopes) {
      expect(scope.evaluated).toBe(1);
      expect(scope.policy).toEqual(DEFAULT_RETENTION_POLICY);
    }
  });

  it('attributes a project-scope prune to the root tenant scope', () => {
    const old = createArchive(projectArchiveDir(), 'metrics-old.jsonl.gz', 10_000);
    createArchive(projectArchiveDir(), 'metrics-new.jsonl.gz', 1);

    const receipt = enforceRetentionPolicy(TEST_ROOT, { keepLastN: 1 });

    expect(receipt.prunedArchives).toEqual([{ path: old, tenantScope: projectScope() }]);
  });
});

// ═══ Ceilings are evaluated PER tenant scope ════════════════════════

describe('per-tenant ceiling isolation', () => {
  it('never prunes tenant B archives because tenant A exceeded the count ceiling', () => {
    // acme is far over a keepLastN=2 ceiling; globex holds exactly one archive.
    const acme = Array.from({ length: 5 }, (_, i) =>
      createArchive(tenantArchiveDir('acme'), `metrics-a${i}.jsonl.gz`, (6 - i) * 1000));
    const globexOnly = createArchive(tenantArchiveDir('globex'), 'metrics-g0.jsonl.gz', 50_000);

    const receipt = enforceRetentionPolicy(TEST_ROOT, { keepLastN: 2, maxAgeDays: 90, maxSizeMB: 500 });

    // Globally, globexOnly is the OLDEST of all six archives — a tenant-blind
    // count ceiling would have deleted it first. Per-tenant, it is that
    // tenant's only archive and survives untouched.
    expect(existsSync(globexOnly)).toBe(true);
    expect(receipt.pruned).not.toContain(globexOnly);
    expect(receipt.pruned.sort()).toEqual([acme[0], acme[1], acme[2]].sort());
    for (const entry of receipt.prunedArchives) expect(entry.tenantScope).toBe('acme');
  });

  it('never prunes tenant B archives because tenant A exceeded the size ceiling', () => {
    // ~1KB aggregate ceiling. acme alone blows past it; globex sits under it.
    const acmeOldest = createArchive(tenantArchiveDir('acme'), 'metrics-a1.jsonl.gz', 9000, 2000);
    const acmeMiddle = createArchive(tenantArchiveDir('acme'), 'metrics-a2.jsonl.gz', 8000, 2000);
    const acmeNewest = createArchive(tenantArchiveDir('acme'), 'metrics-a3.jsonl.gz', 7000, 2000);
    const globexOne = createArchive(tenantArchiveDir('globex'), 'metrics-g1.jsonl.gz', 6000, 100);
    const globexTwo = createArchive(tenantArchiveDir('globex'), 'metrics-g2.jsonl.gz', 5000, 100);

    const receipt = enforceRetentionPolicy(TEST_ROOT, {
      keepLastN: 10, maxAgeDays: 90, maxSizeMB: 1 / 1024,
    });

    // Tenant-blind, the 6.2KB total would have shed the oldest archives until
    // it fit — which includes both globex files. Per tenant, globex (200 bytes)
    // is already under the ceiling and loses nothing.
    expect(receipt.pruned.sort()).toEqual([acmeOldest, acmeMiddle].sort());
    expect(existsSync(acmeNewest)).toBe(true);
    expect(existsSync(globexOne)).toBe(true);
    expect(existsSync(globexTwo)).toBe(true);
  });

  it('keeps the project scope and a tenant scope independent of each other', () => {
    const projectOld = createArchive(projectArchiveDir(), 'metrics-p1.jsonl.gz', 9000);
    createArchive(projectArchiveDir(), 'metrics-p2.jsonl.gz', 8000);
    const tenantSolo = createArchive(tenantArchiveDir('acme'), 'metrics-a1.jsonl.gz', 10_000);

    const receipt = enforceRetentionPolicy(TEST_ROOT, { keepLastN: 1, maxAgeDays: 90, maxSizeMB: 500 });

    expect(receipt.pruned).toEqual([projectOld]);
    expect(existsSync(tenantSolo)).toBe(true);
  });

  it('applies a per-tenant configured ceiling only to that tenant', () => {
    writeConfig({
      observability: {
        retention: {
          max_count: 10,
          tenants: { acme: { max_count: 1 } },
        },
      },
    });
    const acmeOld = createArchive(tenantArchiveDir('acme'), 'metrics-a1.jsonl.gz', 9000);
    const acmeNew = createArchive(tenantArchiveDir('acme'), 'metrics-a2.jsonl.gz', 1000);
    const globexOld = createArchive(tenantArchiveDir('globex'), 'metrics-g1.jsonl.gz', 9000);
    const globexNew = createArchive(tenantArchiveDir('globex'), 'metrics-g2.jsonl.gz', 1000);

    const receipt = enforceRetentionPolicy(TEST_ROOT);

    expect(receipt.pruned).toEqual([acmeOld]);
    expect(existsSync(acmeNew)).toBe(true);
    expect(existsSync(globexOld)).toBe(true);
    expect(existsSync(globexNew)).toBe(true);

    const acmeScope = receipt.scopes.find(scope => scope.tenantScope === 'acme');
    const globexScope = receipt.scopes.find(scope => scope.tenantScope === 'globex');
    expect(acmeScope?.policy.keepLastN).toBe(1);
    expect(globexScope?.policy.keepLastN).toBe(10);
    // The base receipt policy stays the un-tenanted, resolved ceiling.
    expect(receipt.policy.keepLastN).toBe(10);
  });

  it('ignores a per-tenant block keyed by an id the tenant authority rejects', () => {
    writeConfig({
      observability: {
        retention: { max_count: 10, tenants: { 'Bad.Tenant': { max_count: 0 } } },
      },
    });
    const kept = createArchive(tenantArchiveDir('acme'), 'metrics-a1.jsonl.gz', 1000);

    const receipt = enforceRetentionPolicy(TEST_ROOT);

    expect(receipt.pruned).toEqual([]);
    expect(existsSync(kept)).toBe(true);
  });

  it('an explicit caller override still outranks a per-tenant configured ceiling', () => {
    writeConfig({
      observability: { retention: { tenants: { acme: { max_count: 1 } } } },
    });
    createArchive(tenantArchiveDir('acme'), 'metrics-a1.jsonl.gz', 9000);
    createArchive(tenantArchiveDir('acme'), 'metrics-a2.jsonl.gz', 1000);

    const receipt = enforceRetentionPolicy(TEST_ROOT, { keepLastN: 5 });

    expect(receipt.pruned).toEqual([]);
    expect(receipt.scopes[0]?.policy.keepLastN).toBe(5);
  });
});

// ═══ Preserved invariants under the tenant-aware rewrite ════════════

describe('invariants preserved by the tenant-aware rewrite', () => {
  it('never prunes a legal-hold-marked archive, in any tenant scope', () => {
    const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
    const held = createArchive(tenantArchiveDir('acme'), 'metrics-a-held.jsonl.gz', FIVE_DAYS_MS);
    // Same tenant, same age, no hold: proves the age ceiling really would
    // have taken `held` too.
    const control = createArchive(tenantArchiveDir('acme'), 'metrics-a-control.jsonl.gz', FIVE_DAYS_MS);
    const otherTenantHeld = createArchive(tenantArchiveDir('globex'), 'metrics-g-held.jsonl.gz', FIVE_DAYS_MS);
    markArchiveLegalHold(held, 'litigation-hold-747');
    markArchiveLegalHold(otherTenantHeld, 'litigation-hold-747');

    expect(isArchiveUnderLegalHold(held)).toBe(true);

    const receipt = enforceRetentionPolicy(TEST_ROOT, { keepLastN: 10, maxAgeDays: 1, maxSizeMB: 500 });

    expect(receipt.pruned).toEqual([control]);
    expect(existsSync(held)).toBe(true);
    expect(existsSync(otherTenantHeld)).toBe(true);
    expect(receipt.legalHold).toBe(true);
    // A held archive is not even a member of the scope population it would
    // otherwise have been judged in.
    const acmeScope = receipt.scopes.find(scope => scope.tenantScope === 'acme');
    expect(acmeScope?.evaluated).toBe(1);
  });

  it('a held archive does not count toward its own tenant`s count ceiling', () => {
    const held = createArchive(tenantArchiveDir('acme'), 'metrics-a-held.jsonl.gz', 10_000);
    const survivor = createArchive(tenantArchiveDir('acme'), 'metrics-a-live.jsonl.gz', 1000);
    markArchiveLegalHold(held, 'litigation-hold-747');

    const receipt = enforceRetentionPolicy(TEST_ROOT, { keepLastN: 1 });

    expect(receipt.pruned).toEqual([]);
    expect(existsSync(held)).toBe(true);
    expect(existsSync(survivor)).toBe(true);
  });

  it('never prunes the last surviving archive of a tenant for the size ceiling alone', () => {
    const acmeSolo = createArchive(tenantArchiveDir('acme'), 'metrics-a-solo.jsonl.gz', 1000, 5000);
    const globexSolo = createArchive(tenantArchiveDir('globex'), 'metrics-g-solo.jsonl.gz', 1000, 5000);
    const projectSolo = createArchive(projectArchiveDir(), 'metrics-p-solo.jsonl.gz', 1000, 5000);

    const receipt = enforceRetentionPolicy(TEST_ROOT, {
      keepLastN: 10, maxAgeDays: 90, maxSizeMB: 1 / 1024,
    });

    // Globally there are three archives, so a tenant-blind size ceiling would
    // have pruned two of them. Per tenant each is a last survivor.
    expect(receipt.pruned).toEqual([]);
    expect(existsSync(acmeSolo)).toBe(true);
    expect(existsSync(globexSolo)).toBe(true);
    expect(existsSync(projectSolo)).toBe(true);
  });

  it('the age ceiling may still empty a tenant scope completely', () => {
    const ancient = createArchive(
      tenantArchiveDir('acme'), 'metrics-a-ancient.jsonl.gz', 200 * 24 * 60 * 60 * 1000);
    const fresh = createArchive(tenantArchiveDir('globex'), 'metrics-g-fresh.jsonl.gz', 1000);

    const receipt = enforceRetentionPolicy(TEST_ROOT, { keepLastN: 10, maxAgeDays: 90, maxSizeMB: 500 });

    expect(receipt.pruned).toEqual([ancient]);
    expect(existsSync(fresh)).toBe(true);
    const acmeScope = receipt.scopes.find(scope => scope.tenantScope === 'acme');
    expect(acmeScope?.pruned).toEqual([ancient]);
  });

  it('returns an empty, throw-free receipt when nothing is archived', () => {
    const receipt = enforceRetentionPolicy(TEST_ROOT);

    expect(receipt.pruned).toEqual([]);
    expect(receipt.prunedArchives).toEqual([]);
    expect(receipt.scopes).toEqual([]);
    expect(receipt.legalHold).toBe(false);
  });
});
