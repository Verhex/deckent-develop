// ─── Feature Truth Compiler ──────────────────────────────────────────────────
// Pure 4-level truth-chain engine (born-640a): for each declared feature, resolves
// L1-CODE (module+export present) -> L2-WIRED (prod call-site present) ->
// L3-ENABLED (config-flag value) -> L4-LIVE-PROOF (artifact/journal/smoke evidence).
//
// Side-effect-free by design: config and projectRoot are always caller-supplied
// (see FeatureTruthContext) — this module never reads real config, never calls
// process.cwd(), and never imports a config-loading module. The only filesystem
// access is read-only, scoped to files/directories the caller explicitly points
// it at (entryModule, `<projectRoot>/src`, proof.ref) — this is what keeps it
// hermetic under a tmpdir fixture in tests.
//
// born-641 lesson applied here: fail-soft, never throw, never silently swallow —
// a single malformed FeatureTruthDef degrades to a result with an `error` field,
// the rest of the batch is unaffected.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { resolvePath } from './condition-evaluator.js';

// ─── Data model ─────────────────────────────────────────────────────────────

export interface FeatureTruthProofArtifactFile {
  kind: 'artifact-file';
  /** Path to the proof artifact, relative to projectRoot. */
  ref: string;
}

export interface FeatureTruthProofJournalRecent {
  kind: 'journal-recent';
  /** Path to a JSONL journal, relative to projectRoot. */
  ref: string;
  maxAgeDays: number;
}

export interface FeatureTruthProofSmokeCmd {
  kind: 'smoke-cmd';
  /** Not executed by this engine — always resolves to 'declared'. */
  cmd: string;
}

export type FeatureTruthProof =
  | FeatureTruthProofArtifactFile
  | FeatureTruthProofJournalRecent
  | FeatureTruthProofSmokeCmd;

export interface FeatureTruthDef {
  id: string;
  title: string;
  /** Path to the entry module, relative to projectRoot. */
  entryModule: string;
  exportName?: string;
  /** Regex source tested line-by-line against non-test files under <projectRoot>/src. */
  prodCallsitePattern?: string;
  /** Dot-path resolved against the caller-supplied resolved-config object. */
  flagPath?: string;
  proof?: FeatureTruthProof;
}

export type CodeTruth = 'ok' | 'missing';
export type WiredTruth = 'ok' | 'none' | 'undefined';
export type EnabledTruth = 'on' | 'off' | 'no-flag';
export type ProofTruth = 'ok' | 'stale' | 'missing' | 'declared' | 'undefined';

export interface FeatureTruthEvidence {
  entryModulePath?: string;
  exportFound?: boolean;
  callsites?: Array<{ file: string; line: number }>;
  flagValue?: unknown;
  proofRef?: string;
  proofCheckedAt?: string;
  /** Set when a level's own resolution failed but did not abort the whole def (fail-soft). */
  error?: string;
}

export interface FeatureTruthResult {
  id: string;
  code: CodeTruth;
  wired: WiredTruth;
  enabled: EnabledTruth;
  proof: ProofTruth;
  evidence: FeatureTruthEvidence;
  /** Set when resolving this def threw — the def is reported honestly, never dropped. */
  error?: string;
}

export interface FeatureTruthContext {
  /** Caller-resolved config object — this engine never loads config itself. */
  config: Record<string, unknown>;
  projectRoot: string;
  now: Date;
}

export interface HalfWireClassification {
  id: string;
  isHalfWireCandidate: boolean;
  reason: string;
}

// ─── Entry point ────────────────────────────────────────────────────────────

/**
 * Resolve the 4-level truth chain for every def. Pure, synchronous, fail-soft:
 * one broken def never drops or aborts the rest of the batch.
 */
export function resolveTruth(
  defs: readonly FeatureTruthDef[],
  ctx: FeatureTruthContext,
): FeatureTruthResult[] {
  return defs.map(def => resolveOne(def, ctx));
}

/**
 * code:'ok' + wired:'none' — code shipped but never reached from a prod call-site.
 */
export function classifyHalfWire(result: FeatureTruthResult): HalfWireClassification {
  const isHalfWireCandidate = result.code === 'ok' && result.wired === 'none';
  return {
    id: result.id,
    isHalfWireCandidate,
    reason: isHalfWireCandidate
      ? 'code var (entryModule+export dogrulandi) ama prod call-site bulunamadi'
      : 'half-wire deseni yok',
  };
}

// ─── Per-def resolution (fail-soft boundary) ───────────────────────────────

function resolveOne(def: FeatureTruthDef, ctx: FeatureTruthContext): FeatureTruthResult {
  const evidence: FeatureTruthEvidence = {};
  try {
    const code = resolveCode(def, ctx, evidence);
    const wired = resolveWired(def, ctx, evidence);
    const enabled = resolveEnabled(def, ctx, evidence);
    const proof = resolveProof(def, ctx, evidence);
    return { id: def.id, code, wired, enabled, proof, evidence };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      id: def.id,
      code: 'missing',
      wired: 'undefined',
      enabled: 'no-flag',
      proof: 'undefined',
      evidence: { ...evidence, error: message },
      error: message,
    };
  }
}

// ─── L1-CODE ────────────────────────────────────────────────────────────────

function resolveCode(
  def: FeatureTruthDef,
  ctx: FeatureTruthContext,
  evidence: FeatureTruthEvidence,
): CodeTruth {
  if (!def.entryModule) return 'missing';
  const entryPath = join(ctx.projectRoot, def.entryModule);
  evidence.entryModulePath = toPosixRelative(ctx.projectRoot, entryPath);

  if (!existsSync(entryPath) || !statSync(entryPath).isFile()) {
    evidence.exportFound = false;
    return 'missing';
  }
  if (!def.exportName) return 'ok';

  const source = readFileSync(entryPath, 'utf8');
  const found = hasNamedExport(source, def.exportName);
  evidence.exportFound = found;
  return found ? 'ok' : 'missing';
}

const EXPORT_DECL_KEYWORDS =
  '(?:function\\*?|class|const|let|var|interface|type|enum|namespace)';

function hasNamedExport(source: string, exportName: string): boolean {
  const escaped = escapeRegExp(exportName);
  const declPattern = new RegExp(
    `export\\s+(?:default\\s+)?(?:declare\\s+)?(?:abstract\\s+)?(?:async\\s+)?${EXPORT_DECL_KEYWORDS}\\s+${escaped}\\b`,
  );
  if (declPattern.test(source)) return true;

  const braceBlocks = source.match(/export\s*\{[^}]*\}/g) ?? [];
  for (const block of braceBlocks) {
    const inner = block.slice(block.indexOf('{') + 1, block.lastIndexOf('}'));
    for (const rawPart of inner.split(',')) {
      const part = rawPart.trim();
      if (!part) continue;
      const asMatch = part.match(/^(?:type\s+)?(\S+)\s+as\s+(\S+)$/);
      const exportedName = asMatch ? asMatch[2] : part.replace(/^type\s+/, '');
      if (exportedName === exportName) return true;
    }
  }
  return false;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── L2-WIRED ───────────────────────────────────────────────────────────────

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const EXCLUDED_DIR_NAMES = new Set(['tests', 'test', 'node_modules', '.git', 'dist', 'coverage']);

function resolveWired(
  def: FeatureTruthDef,
  ctx: FeatureTruthContext,
  evidence: FeatureTruthEvidence,
): WiredTruth {
  if (!def.prodCallsitePattern) return 'undefined';

  const pattern = new RegExp(def.prodCallsitePattern);
  const callsites: Array<{ file: string; line: number }> = [];

  for (const file of walkSourceFiles(ctx.projectRoot)) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (pattern.test(line)) {
        callsites.push({ file: toPosixRelative(ctx.projectRoot, file), line: i + 1 });
      }
    });
  }

  evidence.callsites = callsites;
  return callsites.length > 0 ? 'ok' : 'none';
}

function walkSourceFiles(projectRoot: string): string[] {
  const srcRoot = join(projectRoot, 'src');
  const results: string[] = [];
  if (!existsSync(srcRoot) || !statSync(srcRoot).isDirectory()) return results;

  const stack: string[] = [srcRoot];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue; // fail-soft: an unreadable directory is skipped, not thrown
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIR_NAMES.has(entry.name)) stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!SOURCE_EXTENSIONS.has(extname(entry.name))) continue;
      if (/\.(test|spec)\./.test(entry.name)) continue;
      results.push(full);
    }
  }
  return results;
}

// ─── L3-ENABLED ─────────────────────────────────────────────────────────────

function resolveEnabled(
  def: FeatureTruthDef,
  ctx: FeatureTruthContext,
  evidence: FeatureTruthEvidence,
): EnabledTruth {
  if (!def.flagPath) return 'no-flag';
  const value = resolvePath(ctx.config, def.flagPath);
  evidence.flagValue = value;
  if (value === undefined) return 'no-flag';
  return value ? 'on' : 'off';
}

// ─── L4-LIVE-PROOF ──────────────────────────────────────────────────────────

function resolveProof(
  def: FeatureTruthDef,
  ctx: FeatureTruthContext,
  evidence: FeatureTruthEvidence,
): ProofTruth {
  const proof = def.proof;
  if (!proof) return 'undefined';

  if (proof.kind === 'smoke-cmd') {
    evidence.proofRef = proof.cmd;
    return 'declared';
  }

  if (proof.kind === 'artifact-file') {
    const artifactPath = join(ctx.projectRoot, proof.ref);
    evidence.proofRef = toPosixRelative(ctx.projectRoot, artifactPath);
    if (!existsSync(artifactPath) || !statSync(artifactPath).isFile()) return 'missing';
    return statSync(artifactPath).size > 0 ? 'ok' : 'missing';
  }

  // journal-recent
  const journalPath = join(ctx.projectRoot, proof.ref);
  evidence.proofRef = toPosixRelative(ctx.projectRoot, journalPath);
  if (!existsSync(journalPath) || !statSync(journalPath).isFile()) return 'missing';

  const lines = readFileSync(journalPath, 'utf8')
    .split(/\r?\n/)
    .filter(line => line.trim().length > 0);
  const lastLine = lines.at(-1);
  if (lastLine === undefined) return 'missing';

  let ts: unknown;
  try {
    const parsed = JSON.parse(lastLine) as Record<string, unknown>;
    // Journals stamp the timestamp either top-level (`ts`/`timestamp`) or
    // inside a meta envelope (the sprint-worker trace: `{messages, meta:{ts}}`)
    // — the first live `deckent truth` run reported the trace 'missing' while
    // the file sat freshly-written on disk (nested-ts miss, 2026-07-11).
    const meta = parsed['meta'] as Record<string, unknown> | undefined;
    ts = parsed['ts'] ?? parsed['timestamp'] ?? meta?.['ts'] ?? meta?.['timestamp'];
  } catch {
    return 'missing'; // torn/mid-write last line — fail-soft, not a thrown error
  }
  if (typeof ts !== 'string') return 'missing';

  const entryDate = new Date(ts);
  if (Number.isNaN(entryDate.getTime())) return 'missing';

  evidence.proofCheckedAt = entryDate.toISOString();
  const ageMs = ctx.now.getTime() - entryDate.getTime();
  const maxAgeMs = proof.maxAgeDays * 24 * 60 * 60 * 1000;
  return ageMs <= maxAgeMs ? 'ok' : 'stale';
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

function toPosixRelative(root: string, target: string): string {
  return relative(root, target).split(sep).join('/');
}
