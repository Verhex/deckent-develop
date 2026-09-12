// ═══ Observability Rotation ════════════════════════════════════════
// Size-based and sprint-based metrics file rotation.
// Archives to .deckent/archive/sprints/<sprintId>/metrics/
// Sprint 150 — Task 030

import {
  existsSync, readFileSync, writeFileSync,
  statSync, readdirSync, unlinkSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash, randomUUID } from 'node:crypto';
import { debugLog } from './utils.js';
import { DeckentError } from './errors.js';
import {
  discoverSprintArchiveIds, publishSprintArchiveArtifact, resolveSprintArchiveDir,
} from './sprint-archive.js';
// Tenant identity authority. The retention path never invents, parses or
// defaults a tenant name of its own — `resolveTenant`/`isValidTenantId` are the
// single source of truth for what a tenant scope is (747-001).
import { isValidTenantId, resolveTenant } from './tenant-context.js';

// ─── Types ───────────────────────────────────────────────────────

export interface ObservabilityRotationConfig {
  /** Max size in MB before auto-rotate (default: 1) */
  maxSizeMB: number;
  /** Archive format (only gzip supported) */
  archiveFormat: 'gzip';
  /** Keep last N archived files (default: 10) */
  keepLastN: number;
}

export interface RotationResult {
  rotated: boolean;
  archivePath?: string;
  originalSizeBytes?: number;
  archivedSizeBytes?: number;
  pruned: string[];
}

// ─── Defaults ────────────────────────────────────────────────────

export const DEFAULT_ROTATION_CONFIG: ObservabilityRotationConfig = {
  maxSizeMB: 1,
  archiveFormat: 'gzip',
  keepLastN: 10,
};

// ─── Constants ───────────────────────────────────────────────────

const METRICS_FILENAME = 'metrics.jsonl';
const DECKENT_DIR = '.deckent';
const LEGACY_ARCHIVE_DIR = 'archive/metrics';
const CONFIG_FILENAME = 'config.json';
const LEGAL_HOLD_MARKER_SUFFIX = '.legal-hold.json';
/** Path segment of the tenant isolation namespace (`tenant-context.ts`). */
const TENANTS_SUBDIR = 'tenants';
/** Archive namespaces mirrored under a tenant isolation root. */
const TENANT_LEGACY_ARCHIVE_DIR = 'archive/metrics';
const TENANT_SPRINT_ARCHIVE_DIR = 'archive/sprints';
const ARCHIVE_METRICS_SUBDIR = 'metrics';
const ARCHIVE_FILE_PREFIX = 'metrics-';
const ARCHIVE_FILE_SUFFIX = '.jsonl.gz';

// ─── Retention Policy (737-001) ─────────────────────────────────
// Combined age + count + size ceilings over archived, content-addressed
// metrics files under .deckent/archive/sprints/<sprintId>/metrics/ (plus the
// legacy .deckent/archive/metrics/ namespace `listArchives` also scans).
// Replaces the historical `enforceKeepLastN` no-op — deletion now happens
// ONLY through `enforceRetentionPolicy`, and ONLY via a typed receipt naming
// exactly what was pruned. Legal-hold-marked archives are excluded from
// every ceiling.

export interface ObservabilityRetentionPolicy {
  /** Maximum number of archived metrics files retained (default: 10). */
  keepLastN: number;
  /** Maximum age in days before an archived metrics file is prunable (default: 90). */
  maxAgeDays: number;
  /** Maximum aggregate size in MB for archived metrics files (default: 500). */
  maxSizeMB: number;
}

export const DEFAULT_RETENTION_POLICY: ObservabilityRetentionPolicy = {
  keepLastN: DEFAULT_ROTATION_CONFIG.keepLastN,
  maxAgeDays: 90,
  maxSizeMB: 500,
};

/**
 * Tenant identity an archived metrics file belongs to (747-001).
 *
 * A tenant-partitioned archive lives under `<root>/.deckent/tenants/<tenantId>/`
 * and carries that tenant's id. Every other archive belongs to the scope the
 * canonical tenant authority (`resolveTenant`) resolves for the root itself.
 * `null` means the authority could not resolve an identity at all — the scope
 * still partitions ceilings, it just has no name to report.
 */
export type ArchiveTenantScope = string | null;

/** One pruned archive plus the tenant scope it belonged to. */
export interface RetentionPrunedArchive {
  readonly path: string;
  readonly tenantScope: ArchiveTenantScope;
}

/** Per-tenant-scope outcome: the ceilings that scope was actually judged by. */
export interface RetentionTenantScopeOutcome {
  readonly tenantScope: ArchiveTenantScope;
  /** Effective ceilings for THIS scope (base config ← tenant config ← override). */
  readonly policy: ObservabilityRetentionPolicy;
  /** Non-held archives considered inside this scope. */
  readonly evaluated: number;
  /** Archive paths pruned inside this scope, sorted. */
  readonly pruned: string[];
}

export interface RetentionPruneReceipt {
  /** Archive paths actually deleted this run. Never the active metrics.jsonl. */
  readonly pruned: string[];
  /** Same deletions, each naming the tenant scope the archive belonged to. */
  readonly prunedArchives: readonly RetentionPrunedArchive[];
  /** Every tenant scope evaluated this run, with its effective ceilings. */
  readonly scopes: readonly RetentionTenantScopeOutcome[];
  /** The exact resolved policy this run enforced. */
  readonly policy: ObservabilityRetentionPolicy;
  /** True when at least one archive was withheld from pruning by a legal hold. */
  readonly legalHold: boolean;
}

export interface ArchiveLegalHoldMarker {
  readonly kind: 'deckent.observability-archive-legal-hold';
  readonly version: 1;
  readonly reason: string;
  readonly recordedAt: string;
}

// ─── Core Functions ──────────────────────────────────────────────

/**
 * Rotate the metrics.jsonl file for a given sprint.
 * Compresses current content to gzip archive, truncates original.
 * Returns rotation result with archive path and sizes.
 */
export function rotateMetricsFile(
  root: string,
  sprintId: string,
  config: Partial<ObservabilityRotationConfig> = {},
): RotationResult {
  const opts = { ...DEFAULT_ROTATION_CONFIG, ...config };
  const metricsPath = join(root, DECKENT_DIR, METRICS_FILENAME);

  if (!existsSync(metricsPath)) {
    return { rotated: false, pruned: [] };
  }

  const stat = statSync(metricsPath);
  if (stat.size === 0) {
    return { rotated: false, pruned: [] };
  }

  // Stage deterministic gzip bytes outside the immutable archive namespace. The
  // canonical publisher is the only archive writer and proves its destination
  // before the hot source is retired below.
  const content = readFileSync(metricsPath);
  const gzipped = gzipSync(content);
  const digest = createHash('sha256').update(gzipped).digest('hex');
  const targetRelative = `metrics/metrics-${digest.slice(0, 16)}.jsonl.gz`;
  const archivePath = join(resolveSprintArchiveDir(root, sprintId), targetRelative);
  const stagingPath = join(
    root,
    DECKENT_DIR,
    `.metrics-rotation-${process.pid}-${randomUUID()}.tmp`,
  );

  try {
    writeFileSync(stagingPath, gzipped, { flag: 'wx', mode: 0o600 });
    const publication = publishSprintArchiveArtifact(root, sprintId, stagingPath, targetRelative);
    if (
      publication.path !== targetRelative
      || publication.bytes !== gzipped.length
      || publication.sha256 !== digest
      || !readFileSync(archivePath).equals(gzipped)
    ) throw new DeckentError('DECKENT_E008', 'METRICS_ARCHIVE_VERIFY_FAILED');
  } finally {
    // This is process-owned staging, never an archive artifact.
    try { unlinkSync(stagingPath); } catch { /* staging was never created or already removed */ }
  }

  // Publication and exact destination proof succeeded; only now retire hot bytes.
  writeFileSync(metricsPath, '', 'utf-8');

  // Enforce keepLastN
  const pruned = enforceKeepLastN(root, opts.keepLastN);

  debugLog('observability-rotation', `Rotated ${stat.size} bytes → ${archivePath} (${gzipped.length} bytes gzipped), pruned ${pruned.length} old archives`);

  return {
    rotated: true,
    archivePath,
    originalSizeBytes: stat.size,
    archivedSizeBytes: gzipped.length,
    pruned,
  };
}


/**
 * Check if the metrics file exceeds the size threshold.
 * Returns true if rotation should be triggered.
 */
export function shouldRotate(
  root: string,
  config: Partial<ObservabilityRotationConfig> = {},
): boolean {
  // Precedence: built-in default ← operator config ← explicit caller override.
  const opts = { ...DEFAULT_ROTATION_CONFIG, ...readConfiguredRotationConfig(root), ...config };
  const metricsPath = join(root, DECKENT_DIR, METRICS_FILENAME);

  if (!existsSync(metricsPath)) return false;

  const stat = statSync(metricsPath);
  const maxBytes = opts.maxSizeMB * 1024 * 1024;
  return stat.size >= maxBytes;
}

/**
 * Enforce keepLastN archive files.
 * Removes oldest archives beyond the limit.
 * Returns list of pruned file paths.
 */
export function enforceKeepLastN(root: string, keepLastN: number): string[] {
  // Legacy call shape (rotateMetricsFile's internal caller below + any
  // external caller) is preserved byte-for-byte; the work now happens for
  // real via enforceRetentionPolicy with age/size ceilings relaxed to
  // unbounded so only the historical count ceiling applies.
  const receipt = enforceRetentionPolicy(root, {
    keepLastN,
    maxAgeDays: Number.POSITIVE_INFINITY,
    maxSizeMB: Number.POSITIVE_INFINITY,
  });
  return receipt.pruned;
}

/**
 * Read and decompress an archived metrics file.
 * Returns the raw JSONL content as string.
 */
export function readArchivedMetrics(archivePath: string): string {
  if (!existsSync(archivePath)) {
    throw new Error(`Archive not found: ${archivePath}`);
  }
  const compressed = readFileSync(archivePath);
  const decompressed = gunzipSync(compressed);
  return decompressed.toString('utf-8');
}

/**
 * List all archived metrics files for a project.
 * Returns sorted list of archive file paths (oldest first).
 */
export function listArchives(root: string): string[] {
  const archives: string[] = [
    ...listProjectScopeArchives(root),
    ...listTenantScopeArchives(root),
  ];
  return [...new Set(archives)].sort();
}

/** Archive files directly under `dir`; never recurses, never reads content. */
function listArchiveFilesIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter(file => file.startsWith(ARCHIVE_FILE_PREFIX) && file.endsWith(ARCHIVE_FILE_SUFFIX))
      .map(file => join(dir, file));
  } catch (error) {
    debugLog('observability-rotation:list-archives', error);
    return [];
  }
}

/** The project-root archive namespaces (legacy + canonical per-sprint). */
function listProjectScopeArchives(root: string): string[] {
  const archives: string[] = [
    ...listArchiveFilesIn(join(root, DECKENT_DIR, LEGACY_ARCHIVE_DIR)),
  ];
  for (const sprintId of discoverSprintArchiveIds(root)) {
    archives.push(...listArchiveFilesIn(
      join(resolveSprintArchiveDir(root, sprintId), ARCHIVE_METRICS_SUBDIR),
    ));
  }
  return archives;
}

/**
 * Tenant ids that currently own an isolation directory under the root
 * (`<root>/.deckent/tenants/<tenantId>/`). Bounded: exactly one directory read,
 * and only names the canonical `isValidTenantId` authority accepts.
 */
export function listTenantScopes(root: string): string[] {
  try {
    return readdirSync(join(root, DECKENT_DIR, TENANTS_SUBDIR), { withFileTypes: true })
      .filter(entry => entry.isDirectory() && isValidTenantId(entry.name))
      .map(entry => entry.name)
      .sort();
  } catch (error) {
    debugLog('observability-rotation:tenant-discovery', error);
    return [];
  }
}

/**
 * Archives owned by a tenant isolation root. The isolation root mirrors the
 * project archive layout minus the `.deckent` prefix, because the isolation
 * root IS already the tenant's state directory (`tenantIsolationPath`).
 */
function listTenantScopeArchives(root: string): string[] {
  const archives: string[] = [];
  for (const tenantId of listTenantScopes(root)) {
    const isolationRoot = join(root, DECKENT_DIR, TENANTS_SUBDIR, tenantId);
    archives.push(...listArchiveFilesIn(join(isolationRoot, TENANT_LEGACY_ARCHIVE_DIR)));
    const sprintsBase = join(isolationRoot, TENANT_SPRINT_ARCHIVE_DIR);
    let sprintDirs: string[] = [];
    try {
      sprintDirs = existsSync(sprintsBase)
        ? readdirSync(sprintsBase, { withFileTypes: true })
          .filter(entry => entry.isDirectory())
          .map(entry => entry.name)
        : [];
    } catch (error) {
      debugLog('observability-rotation:tenant-discovery', error);
    }
    for (const sprintDir of sprintDirs) {
      archives.push(...listArchiveFilesIn(
        join(sprintsBase, sprintDir, ARCHIVE_METRICS_SUBDIR),
      ));
    }
  }
  return archives;
}

/**
 * Tenant scope an archive path belongs to (747-001).
 *
 * Path-derived when the archive sits inside a tenant isolation directory;
 * otherwise delegated to the canonical tenant authority for the root. No
 * tenant name is ever spelled as a literal here.
 */
export function resolveArchiveTenantScope(root: string, archivePath: string): ArchiveTenantScope {
  const tenantsRoot = resolve(join(root, DECKENT_DIR, TENANTS_SUBDIR));
  const projected = relative(tenantsRoot, resolve(archivePath));
  if (projected !== '' && !projected.startsWith('..') && !isAbsolute(projected)) {
    const candidate = projected.split(sep)[0];
    if (candidate && isValidTenantId(candidate)) return candidate;
  }
  return resolveRootTenantScope(root);
}

function resolveRootTenantScope(root: string): ArchiveTenantScope {
  try {
    return resolveTenant(root).tenantId;
  } catch (error) {
    // An operator-supplied identity that the canonical authority rejects is
    // reported as "unresolved", never silently replaced with an invented name.
    debugLog('observability-rotation:tenant-scope', error);
    return null;
  }
}

/**
 * Owner-authored retention overrides read directly from `.deckent/config.json`'s
 * `observability.retention` block (737-001). This module is outside
 * `config.ts`'s write scope, so it mirrors the direct-read precedent
 * `sprint-archive.ts`'s `safeConfiguredArchiveBase` already uses: parse the
 * raw project config file, never `loadConfig`/`ResolvedConfig`. An absent
 * block, a missing file, or a malformed value all fall back to
 * `DEFAULT_RETENTION_POLICY`.
 */
/**
 * Config-resolved rotation ceiling.
 *
 * `observability.rotation.maxSizeMB` existed in the config contract but nothing
 * read it, so the ceiling was effectively the hardcoded default everywhere and
 * an operator could not bound metrics growth at all. Same direct-read precedent
 * as `readConfiguredRetentionPolicy`.
 */
export function readConfiguredRotationConfig(root: string): Partial<ObservabilityRotationConfig> {
  try {
    const configPath = join(root, DECKENT_DIR, CONFIG_FILENAME);
    if (!existsSync(configPath)) return {};
    const parsed = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      observability?: { rotation?: { maxSizeMB?: unknown; keepLastN?: unknown } };
    } | null;
    const rotation = parsed?.observability?.rotation;
    if (!rotation || typeof rotation !== 'object') return {};
    const resolved: Partial<ObservabilityRotationConfig> = {};
    if (typeof rotation.maxSizeMB === 'number' && Number.isFinite(rotation.maxSizeMB) && rotation.maxSizeMB > 0) {
      resolved.maxSizeMB = rotation.maxSizeMB;
    }
    if (typeof rotation.keepLastN === 'number' && Number.isInteger(rotation.keepLastN) && rotation.keepLastN >= 0) {
      resolved.keepLastN = rotation.keepLastN;
    }
    return resolved;
  } catch {
    return {};
  }
}

interface ConfiguredRetention {
  /** Ceilings applying to every tenant scope that has no override of its own. */
  readonly base: Partial<ObservabilityRetentionPolicy>;
  /** Ceiling overrides keyed by tenant id (`observability.retention.tenants`). */
  readonly tenants: Readonly<Record<string, Partial<ObservabilityRetentionPolicy>>>;
}

/** Snake-case operator ceilings → the typed policy shape. Invalid values are dropped. */
function parseRetentionCeilings(node: unknown): Partial<ObservabilityRetentionPolicy> {
  if (!node || typeof node !== 'object') return {};
  const raw = node as { max_age_days?: unknown; max_count?: unknown; max_size_mb?: unknown };
  const ceilings: Partial<ObservabilityRetentionPolicy> = {};
  if (typeof raw.max_age_days === 'number' && raw.max_age_days > 0) {
    ceilings.maxAgeDays = raw.max_age_days;
  }
  if (typeof raw.max_count === 'number' && raw.max_count >= 0) {
    ceilings.keepLastN = raw.max_count;
  }
  if (typeof raw.max_size_mb === 'number' && raw.max_size_mb > 0) {
    ceilings.maxSizeMB = raw.max_size_mb;
  }
  return ceilings;
}

function readConfiguredRetention(root: string): ConfiguredRetention {
  try {
    const configPath = join(root, DECKENT_DIR, CONFIG_FILENAME);
    if (!existsSync(configPath)) return { base: {}, tenants: {} };
    const parsed = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      observability?: { retention?: { tenants?: unknown } };
    } | null;
    const retention = parsed?.observability?.retention;
    if (!retention || typeof retention !== 'object') return { base: {}, tenants: {} };
    const tenants: Record<string, Partial<ObservabilityRetentionPolicy>> = {};
    const tenantNode = retention.tenants;
    if (tenantNode && typeof tenantNode === 'object' && !Array.isArray(tenantNode)) {
      for (const [tenantId, ceilings] of Object.entries(tenantNode as Record<string, unknown>)) {
        // Only the canonical authority decides what a tenant id is.
        if (!isValidTenantId(tenantId)) continue;
        const parsedCeilings = parseRetentionCeilings(ceilings);
        if (Object.keys(parsedCeilings).length > 0) tenants[tenantId] = parsedCeilings;
      }
    }
    return { base: parseRetentionCeilings(retention), tenants };
  } catch (error) {
    debugLog('observability-rotation:retention-config', error);
    return { base: {}, tenants: {} };
  }
}

/**
 * Mark one archived metrics file as under legal hold. A held archive is
 * never a deletion candidate for `enforceRetentionPolicy`, under any
 * ceiling. The marker is a sidecar JSON file (never named `*.jsonl.gz`, so
 * `listArchives` never mistakes it for an archive) and never mutates the
 * immutable, content-addressed archive bytes it protects.
 */
export function markArchiveLegalHold(archivePath: string, reason: string): string {
  const markerPath = `${archivePath}${LEGAL_HOLD_MARKER_SUFFIX}`;
  const marker: ArchiveLegalHoldMarker = {
    kind: 'deckent.observability-archive-legal-hold',
    version: 1,
    reason,
    recordedAt: new Date().toISOString(),
  };
  writeFileSync(markerPath, JSON.stringify(marker, null, 2), 'utf-8');
  return markerPath;
}

/** Whether an archived metrics file has a legal-hold sidecar marker. */
export function isArchiveUnderLegalHold(archivePath: string): boolean {
  return existsSync(`${archivePath}${LEGAL_HOLD_MARKER_SUFFIX}`);
}

interface ArchiveEntry {
  readonly path: string;
  readonly bytes: number;
  readonly mtimeMs: number;
  readonly tenantScope: ArchiveTenantScope;
}

/** Bounded metadata read — one `statSync` per archive path; the gzip content is never read. */
function listArchiveEntries(root: string): ArchiveEntry[] {
  const entries: ArchiveEntry[] = [];
  for (const path of listArchives(root)) {
    try {
      const stat = statSync(path);
      entries.push({
        path,
        bytes: stat.size,
        mtimeMs: stat.mtimeMs,
        tenantScope: resolveArchiveTenantScope(root, path),
      });
    } catch (error) {
      debugLog('observability-rotation:retention-stat', error);
    }
  }
  return entries;
}

/**
 * Deletion candidates inside ONE tenant scope, under that scope's own ceilings.
 * Every caller passes a single scope's entries, which is what makes one
 * tenant's ceiling structurally unable to reach another tenant's archives.
 */
function selectPrunableInScope(
  evaluable: readonly ArchiveEntry[],
  policy: ObservabilityRetentionPolicy,
  nowMs: number,
): Set<string> {
  const toPrune = new Set<string>();
  const maxAgeMs = policy.maxAgeDays * 24 * 60 * 60 * 1000;

  // Age ceiling.
  for (const entry of evaluable) {
    if (nowMs - entry.mtimeMs > maxAgeMs) toPrune.add(entry.path);
  }

  // Count ceiling — keep the newest `keepLastN` survivors, oldest-first prune.
  const afterAge = evaluable.filter(entry => !toPrune.has(entry.path));
  if (afterAge.length > policy.keepLastN) {
    const byAgeAsc = [...afterAge].sort((a, b) => a.mtimeMs - b.mtimeMs);
    const excess = byAgeAsc.length - Math.max(policy.keepLastN, 0);
    for (let index = 0; index < excess; index += 1) {
      toPrune.add(byAgeAsc[index]!.path);
    }
  }

  // Size ceiling — prune oldest survivors until the aggregate fits; never
  // below one surviving (non-held) archive IN THIS SCOPE.
  const maxSizeBytes = policy.maxSizeMB * 1024 * 1024;
  let survivors = evaluable.filter(entry => !toPrune.has(entry.path));
  let totalBytes = survivors.reduce((sum, entry) => sum + entry.bytes, 0);
  const byAgeAscSize = [...survivors].sort((a, b) => a.mtimeMs - b.mtimeMs);
  for (const entry of byAgeAscSize) {
    if (totalBytes <= maxSizeBytes || survivors.length <= 1) break;
    toPrune.add(entry.path);
    totalBytes -= entry.bytes;
    survivors = survivors.filter(item => item.path !== entry.path);
  }

  return toPrune;
}

/**
 * Enforce the combined age + count + size retention ceilings over archived,
 * content-addressed metrics files. Replaces the historical `enforceKeepLastN`
 * no-op (737-001): deletion happens ONLY here, and ONLY through a typed
 * receipt naming exactly what was removed — never a silent `unlinkSync`.
 *
 * - Legal-hold-marked archives (`markArchiveLegalHold`) are excluded from
 *   every ceiling and can never be pruned.
 * - The live `.deckent/metrics.jsonl` hot file is never a candidate — this
 *   function only ever inspects `listArchives()` output.
 * - Archive bytes are never rewritten; the only mutation is a whole-file
 *   `unlinkSync`, so surviving content-addressed archives are untouched.
 * - The size ceiling never prunes the last surviving (non-held) archive —
 *   age and count may legitimately reach zero, size alone must not.
 *
 * Tenant awareness (747-001): archives are partitioned by
 * `resolveArchiveTenantScope` and each scope is judged ONLY by its own
 * resolved ceilings, so one tenant's count/size ceiling can never reach
 * another tenant's archives, and "the last surviving archive" is guaranteed
 * per tenant rather than globally. The receipt names the tenant scope of
 * every pruned archive.
 */
export function enforceRetentionPolicy(
  root: string,
  overrides: Partial<ObservabilityRetentionPolicy> = {},
): RetentionPruneReceipt {
  const configured = readConfiguredRetention(root);
  // Base ceilings: built-in default ← operator config ← explicit caller override.
  // No ceiling literal lives on this path; every number is resolved, not typed.
  const policy: ObservabilityRetentionPolicy = {
    ...DEFAULT_RETENTION_POLICY,
    ...configured.base,
    ...overrides,
  };

  const entries = listArchiveEntries(root);

  // Legal hold is evaluated per archive and BEFORE any ceiling, so a held
  // archive is never even a member of the scope group it would be judged in.
  let legalHold = false;
  const groups = new Map<string, { scope: ArchiveTenantScope; entries: ArchiveEntry[] }>();
  for (const entry of entries) {
    if (isArchiveUnderLegalHold(entry.path)) {
      legalHold = true;
      continue;
    }
    const key = entry.tenantScope ?? '';
    let group = groups.get(key);
    if (!group) {
      group = { scope: entry.tenantScope, entries: [] };
      groups.set(key, group);
    }
    group.entries.push(entry);
  }

  const nowMs = Date.now();
  const scopes: RetentionTenantScopeOutcome[] = [];
  const prunedArchives: RetentionPrunedArchive[] = [];

  for (const key of [...groups.keys()].sort()) {
    const group = groups.get(key)!;
    // Per-tenant ceilings: base ← this tenant's configured override ← explicit
    // caller override. A scope is only ever judged by its OWN resolved policy.
    const scopePolicy: ObservabilityRetentionPolicy = {
      ...DEFAULT_RETENTION_POLICY,
      ...configured.base,
      ...(group.scope ? configured.tenants[group.scope] ?? {} : {}),
      ...overrides,
    };

    const toPrune = selectPrunableInScope(group.entries, scopePolicy, nowMs);
    const scopePruned: string[] = [];
    for (const path of toPrune) {
      try {
        unlinkSync(path);
        scopePruned.push(path);
        prunedArchives.push({ path, tenantScope: group.scope });
      } catch (error) {
        debugLog('observability-rotation:retention-prune', error);
      }
    }
    scopePruned.sort();

    scopes.push({
      tenantScope: group.scope,
      policy: scopePolicy,
      evaluated: group.entries.length,
      pruned: scopePruned,
    });
  }

  const pruned = prunedArchives.map(entry => entry.path).sort();
  const sortedPrunedArchives = [...prunedArchives]
    .sort((left, right) => left.path.localeCompare(right.path));

  return {
    pruned,
    prunedArchives: sortedPrunedArchives,
    scopes,
    policy,
    legalHold,
  };
}
