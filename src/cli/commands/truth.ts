// ═══ deckent truth — Feature Truth-Chain Surface (born-640b, Task 404-002) ═══
//
// Surfaces the pure 4-level truth engine (src/core/feature-truth.ts, born-640a,
// Task 404-001). For every truth-block declared under the `truth` array of
// .deckent/settings/features-manifest.json it resolves the chain
//   L1-CODE → L2-WIRED → L3-ENABLED → L4-LIVE-PROOF
// via `resolveTruth`, prints a table (feature | code | wired | enabled | proof),
// lists the "half-wire candidates" (code shipped but no prod call-site), and
// — under `--check` — ratchets NEW half-wire candidates against a pinned
// .deckent/truth-baseline.json (orphan-ratchet precedent: exit 1 on a new
// candidate, exit 2 when the baseline is absent).
//
// The ENGINE is IMPORTED, never reimplemented (task nogo). Only the thin
// manifest-read + def-mapping + rendering + ratchet plumbing lives here — the
// same CLI/MCP parity-duplication pattern already used by features.ts vs
// mcp/tools/feature-query.ts.
//
// i18n note: user-facing strings come from a self-contained en+tr map below,
// English default, `{var}`-interpolated exactly like helpers/messages.ts. The
// canonical helpers/messages.ts is outside this task's write scope — see the
// docImpact line in the task result: these keys should later be lifted into
// messages.ts by a task that owns it (a mechanical move, no behavior change).

import type { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  resolveTruth,
  classifyHalfWire,
  type FeatureTruthDef,
  type FeatureTruthResult,
  type FeatureTruthProof,
  type FeatureTruthContext,
} from '../../core/feature-truth.js';
import { loadConfig } from '../../core/config.js';
import { FEATURES_MANIFEST_FILE } from '../../core/constants.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { detectLang } from '../helpers/i18n.js';
import { print, printError, isNoColor } from '../helpers/output.js';

/** Pinned half-wire ratchet baseline, relative to projectRoot. */
export const TRUTH_BASELINE_FILE = '.deckent/truth-baseline.json';

// ─── i18n (self-contained en+tr; English default) ───────────────────────────

const TRUTH_MESSAGES: Record<string, { en: string; tr: string }> = {
  'truth.manifest_not_found': {
    en: 'features-manifest.json not found. Run `node scripts/sync-manifest.mjs` to generate.',
    tr: 'features-manifest.json bulunamadı. Oluşturmak için `node scripts/sync-manifest.mjs` çalıştırın.',
  },
  'truth.config_load_failed': {
    en: 'failed to load resolved config: {message}',
    tr: 'çözümlenmiş config yüklenemedi: {message}',
  },
  'truth.header_title': {
    en: 'Deckent Feature Truth-Chain',
    tr: 'Deckent Özellik Doğruluk-Zinciri',
  },
  'truth.header_meta': {
    en: '{count} truth-block(s) — code → wired → enabled → proof',
    tr: '{count} doğruluk-bloğu — code → wired → enabled → proof',
  },
  'truth.no_features': {
    en: '(no truth-blocks declared in features-manifest.json)',
    tr: '(features-manifest.json içinde doğruluk-bloğu tanımlı değil)',
  },
  'truth.col_feature': { en: 'feature', tr: 'özellik' },
  'truth.col_code': { en: 'code', tr: 'code' },
  'truth.col_wired': { en: 'wired', tr: 'wired' },
  'truth.col_enabled': { en: 'enabled', tr: 'enabled' },
  'truth.col_proof': { en: 'proof', tr: 'proof' },
  'truth.halfwire_header': {
    en: 'HALF-WIRE candidates ({count}) — code shipped but no prod call-site:',
    tr: 'YARIM-WİRE adayları ({count}) — kod var ama prod call-site yok:',
  },
  'truth.no_halfwire': {
    en: 'HALF-WIRE candidates: none — every code-present feature is wired.',
    tr: 'YARIM-WİRE adayları: yok — kodu olan her özellik prod\'a bağlı.',
  },
  'truth.baseline_missing': {
    en: 'No baseline found at .deckent/truth-baseline.json.',
    tr: '.deckent/truth-baseline.json altında baseline bulunamadı.',
  },
  'truth.baseline_missing_candidates': {
    en: 'Current half-wire candidates ({count}) that would be pinned:',
    tr: 'Pinlenecek mevcut yarım-wire adayları ({count}):',
  },
  'truth.baseline_missing_clean': {
    en: 'There are currently zero half-wire candidates — a clean baseline would be pinned.',
    tr: 'Şu an sıfır yarım-wire adayı var — temiz bir baseline pinlenir.',
  },
  'truth.baseline_create_hint': {
    en: 'Create it with: `deckent truth --check --write`',
    tr: 'Oluşturmak için: `deckent truth --check --write`',
  },
  'truth.baseline_written': {
    en: 'Pinned baseline written to {path} ({count} half-wire candidate(s)).',
    tr: 'Baseline {path} dosyasına yazıldı ({count} yarım-wire adayı).',
  },
  'truth.ratchet_new': {
    en: 'RATCHET FAIL — {count} NEW half-wire candidate(s) not in the baseline:',
    tr: 'RATCHET HATA — baseline\'da olmayan {count} YENİ yarım-wire adayı:',
  },
  'truth.ratchet_resolved': {
    en: 'note: {count} baselined candidate(s) resolved (shrink the baseline): {names}',
    tr: 'not: {count} baseline adayı kapandı (baseline\'ı küçültün): {names}',
  },
  'truth.ratchet_ok': {
    en: 'RATCHET OK — no new half-wire candidates ({count} pinned).',
    tr: 'RATCHET TAMAM — yeni yarım-wire adayı yok ({count} pinli).',
  },
};

/** Localized lookup — English default, `{var}` interpolation (messages.ts-shaped). */
export function truthMessage(key: string, lang: string, vars?: Record<string, string>): string {
  const entry = TRUTH_MESSAGES[key];
  if (!entry) return key;
  const template = (lang === 'tr' ? entry.tr : entry.en) || entry.en;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? `{${name}}`);
}

// ─── Manifest → defs ─────────────────────────────────────────────────────────

/** One truth-block entry in features-manifest.json's `truth` array (≈ FeatureTruthDef + label). */
export interface TruthManifestEntry {
  id: string;
  label?: string;
  entryModule: string;
  exportName?: string;
  prodCallsitePattern?: string;
  flagPath?: string;
  proof?: FeatureTruthProof;
}

/**
 * Read the `truth` array from features-manifest.json.
 * Returns `null` when the manifest is missing or unparseable (caller reports the
 * error); returns `[]` when the manifest exists but declares no truth-blocks.
 */
export function loadTruthManifest(root: string): TruthManifestEntry[] | null {
  const manifestPath = join(root, FEATURES_MANIFEST_FILE);
  if (!existsSync(manifestPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { truth?: TruthManifestEntry[] };
    return Array.isArray(parsed.truth) ? parsed.truth : [];
  } catch {
    return null;
  }
}

/** Map manifest entries to engine defs (id←id, title←label). No undefined keys. */
export function collectTruthDefs(entries: readonly TruthManifestEntry[]): FeatureTruthDef[] {
  return entries.map((e) => {
    const def: FeatureTruthDef = { id: e.id, title: e.label ?? e.id, entryModule: e.entryModule };
    if (e.exportName !== undefined) def.exportName = e.exportName;
    if (e.prodCallsitePattern !== undefined) def.prodCallsitePattern = e.prodCallsitePattern;
    if (e.flagPath !== undefined) def.flagPath = e.flagPath;
    if (e.proof !== undefined) def.proof = e.proof;
    return def;
  });
}

// ─── Compute ─────────────────────────────────────────────────────────────────

export interface TruthRun {
  results: FeatureTruthResult[];
  /** ids of features classified as half-wire candidates (code-ok + wired-none). */
  halfWireCandidates: string[];
  /** id → display label. */
  labels: Record<string, string>;
}

/** Resolve every truth-block via the imported engine + classify half-wire. */
export function computeTruth(entries: readonly TruthManifestEntry[], ctx: FeatureTruthContext): TruthRun {
  const defs = collectTruthDefs(entries);
  const results = resolveTruth(defs, ctx);
  const halfWireCandidates = results
    .filter((r) => classifyHalfWire(r).isHalfWireCandidate)
    .map((r) => r.id);
  const labels: Record<string, string> = {};
  for (const e of entries) labels[e.id] = e.label ?? e.id;
  return { results, halfWireCandidates, labels };
}

// ─── Render (NO_COLOR-aware) ─────────────────────────────────────────────────

/** ANSI code for a truth token's semantic (green ok, red missing/none, …). */
function colorFor(token: string): string {
  switch (token) {
    case 'ok':
    case 'on':
      return '\x1b[32m'; // green
    case 'declared':
      return '\x1b[36m'; // cyan
    case 'none':
    case 'missing':
      return '\x1b[31m'; // red
    case 'stale':
    case 'off':
      return '\x1b[33m'; // yellow
    default:
      return '\x1b[2m'; // dim: undefined / no-flag
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

/** feature | code | wired | enabled | proof table. Status cells colored unless NO_COLOR. */
export function renderTruthTable(run: TruthRun, lang: string): string {
  if (run.results.length === 0) return `  ${truthMessage('truth.no_features', lang)}`;

  const headers = [
    truthMessage('truth.col_feature', lang),
    truthMessage('truth.col_code', lang),
    truthMessage('truth.col_wired', lang),
    truthMessage('truth.col_enabled', lang),
    truthMessage('truth.col_proof', lang),
  ];
  const rows = run.results.map((r) => [
    truncate(run.labels[r.id] ?? r.id, 44),
    r.code,
    r.wired,
    r.enabled,
    r.proof,
  ]);

  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => (row[i] ?? '').length)),
  );

  const noColor = isNoColor();
  const lines: string[] = [];
  lines.push('  ' + headers.map((h, i) => h.padEnd(widths[i] ?? 0)).join('  '));
  lines.push('  ' + widths.map((w) => '─'.repeat(w)).join('  '));
  for (const row of rows) {
    const cells = row.map((cell, i) => {
      const padded = cell.padEnd(widths[i] ?? 0);
      // Colorize only the status columns (i >= 1); leave the feature label plain.
      if (i === 0 || noColor) return padded;
      return `${colorFor(cell)}${padded}\x1b[0m`;
    });
    lines.push('  ' + cells.join('  '));
  }
  return lines.join('\n');
}

/** The half-wire candidates block (the born-640 payoff section). */
export function renderHalfWireSection(run: TruthRun, lang: string): string {
  if (run.halfWireCandidates.length === 0) {
    return `  ${truthMessage('truth.no_halfwire', lang)}`;
  }
  const lines = [
    `  ${truthMessage('truth.halfwire_header', lang, { count: String(run.halfWireCandidates.length) })}`,
  ];
  for (const id of run.halfWireCandidates) {
    lines.push(`    - ${run.labels[id] ?? id} (${id})`);
  }
  return lines.join('\n');
}

/** Machine-readable projection for `--json`. */
export function truthToJson(run: TruthRun): Record<string, unknown> {
  return {
    features: run.results.map((r) => ({
      id: r.id,
      label: run.labels[r.id] ?? r.id,
      code: r.code,
      wired: r.wired,
      enabled: r.enabled,
      proof: r.proof,
      evidence: r.evidence,
      ...(r.error ? { error: r.error } : {}),
    })),
    halfWireCandidates: run.halfWireCandidates,
    summary: { total: run.results.length, halfWire: run.halfWireCandidates.length },
  };
}

// ─── Ratchet (--check) ───────────────────────────────────────────────────────

export interface TruthBaseline {
  halfWireCandidates: string[];
  generatedAt?: string;
  note?: string;
}

/**
 * Read the pinned baseline. `null` = absent (→ propose creation). A present but
 * malformed baseline degrades to an empty candidate set (fail-soft) rather than
 * masking every current candidate as "new".
 */
export function loadBaseline(root: string): TruthBaseline | null {
  const p = join(root, TRUTH_BASELINE_FILE);
  if (!existsSync(p)) return null;
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf-8')) as TruthBaseline;
    return { halfWireCandidates: Array.isArray(parsed.halfWireCandidates) ? parsed.halfWireCandidates : [] };
  } catch {
    return { halfWireCandidates: [] };
  }
}

/** Pin the current half-wire candidate set. Returns the written absolute path. */
export function writeBaseline(root: string, candidates: readonly string[], nowIso: string): string {
  const p = join(root, TRUTH_BASELINE_FILE);
  mkdirSync(dirname(p), { recursive: true });
  const payload: TruthBaseline = {
    halfWireCandidates: [...candidates].sort(),
    generatedAt: nowIso,
    note: 'Pinned half-wire candidate ratchet (born-640b). Regenerate with `deckent truth --check --write`.',
  };
  writeFileSync(p, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
  return p;
}

/** Pure ratchet diff: candidates present now but not in the baseline are NEW. */
export function diffRatchet(
  live: readonly string[],
  baseline: TruthBaseline,
): { newCandidates: string[]; resolved: string[] } {
  const baseSet = new Set(baseline.halfWireCandidates);
  const liveSet = new Set(live);
  return {
    newCandidates: live.filter((id) => !baseSet.has(id)).sort(),
    resolved: baseline.halfWireCandidates.filter((id) => !liveSet.has(id)).sort(),
  };
}

export interface RatchetOutcome {
  exitCode: 0 | 1 | 2;
  lines: string[];
}

/**
 * Pure ratchet decision (no process.exit — caller applies exitCode):
 *  --write        → pin baseline, exit 0
 *  no baseline    → propose creation + list candidates, exit 2
 *  new candidate  → list new candidates, exit 1
 *  otherwise      → exit 0
 */
export function runRatchet(
  run: TruthRun,
  baseline: TruthBaseline | null,
  lang: string,
  opts: { write: boolean; root: string; nowIso: string },
): RatchetOutcome {
  if (opts.write) {
    const p = writeBaseline(opts.root, run.halfWireCandidates, opts.nowIso);
    return {
      exitCode: 0,
      lines: [truthMessage('truth.baseline_written', lang, { path: p, count: String(run.halfWireCandidates.length) })],
    };
  }

  if (baseline === null) {
    const lines = [truthMessage('truth.baseline_missing', lang)];
    if (run.halfWireCandidates.length > 0) {
      lines.push(truthMessage('truth.baseline_missing_candidates', lang, { count: String(run.halfWireCandidates.length) }));
      for (const id of run.halfWireCandidates) lines.push(`    - ${run.labels[id] ?? id} (${id})`);
    } else {
      lines.push(truthMessage('truth.baseline_missing_clean', lang));
    }
    lines.push(truthMessage('truth.baseline_create_hint', lang));
    return { exitCode: 2, lines };
  }

  const { newCandidates, resolved } = diffRatchet(run.halfWireCandidates, baseline);
  const lines: string[] = [];
  if (resolved.length > 0) {
    lines.push(truthMessage('truth.ratchet_resolved', lang, { count: String(resolved.length), names: resolved.join(', ') }));
  }
  if (newCandidates.length > 0) {
    lines.push(truthMessage('truth.ratchet_new', lang, { count: String(newCandidates.length) }));
    for (const id of newCandidates) lines.push(`    - ${run.labels[id] ?? id} (${id})`);
    return { exitCode: 1, lines };
  }
  lines.push(truthMessage('truth.ratchet_ok', lang, { count: String(run.halfWireCandidates.length) }));
  return { exitCode: 0, lines };
}

// ─── Command ─────────────────────────────────────────────────────────────────

export function registerTruth(program: Command): void {
  program
    .command('truth')
    .description('Resolve the 4-level feature truth-chain (code → wired → enabled → proof) for manifest truth-blocks')
    .option('--json', 'Output raw truth data as JSON')
    .option('--check', 'Ratchet new half-wire candidates against .deckent/truth-baseline.json (exit 1 = new, exit 2 = no baseline)')
    .option('--write', 'With --check: (re)write the pinned baseline to the current half-wire candidate set')
    .action(async (opts: { json?: boolean; check?: boolean; write?: boolean }) => {
      const root = resolveProjectRoot();
      const lang = detectLang(root);

      const entries = loadTruthManifest(root);
      if (entries === null) {
        printError(truthMessage('truth.manifest_not_found', lang));
        process.exitCode = 1;
        return;
      }

      let config: Record<string, unknown>;
      try {
        config = (await loadConfig(root)) as unknown as Record<string, unknown>;
      } catch (err) {
        printError(truthMessage('truth.config_load_failed', lang, {
          message: err instanceof Error ? err.message : String(err),
        }));
        process.exitCode = 1;
        return;
      }

      const now = new Date();
      const ctx: FeatureTruthContext = { config, projectRoot: root, now };
      const run = computeTruth(entries, ctx);

      if (opts.json) {
        print(JSON.stringify(truthToJson(run), null, 2));
        return;
      }

      if (opts.check) {
        const baseline = loadBaseline(root);
        const outcome = runRatchet(run, baseline, lang, {
          write: opts.write === true,
          root,
          nowIso: now.toISOString(),
        });
        for (const line of outcome.lines) print(line);
        if (outcome.exitCode !== 0) process.exitCode = outcome.exitCode;
        return;
      }

      print(`\n${truthMessage('truth.header_title', lang)}`);
      print(truthMessage('truth.header_meta', lang, { count: String(run.results.length) }));
      print('');
      print(renderTruthTable(run, lang));
      print('');
      print(renderHalfWireSection(run, lang));
    });
}
