// ─── ORPHAN-DELIVERABLE-SWEEP (Sprint 374, Task 374-004) ─────────────────────
//
// Desen 3 kez yaşandı (ölü-endpoint'ler, orphan-kartlar, pool-görünmez katalog):
// teslim-edilmiş ama hiçbir yerden referanslanmayan modüller. Bu dosya:
//   (a) sistematik, deterministik, tekrar-koşulabilir bir orphan-taraması
//       (plain import-grep + path resolution, ts-morph YOK) unit-test edilmiş
//       fonksiyonlar olarak sağlıyor;
//   (b) repo-genelinde (testler hariç) gerçek taramayı BİLİNEN-orphan
//       allowlist'iyle pinliyor — roundtrip-gap-pin deseni: yeni bir orphan
//       eklenirse (allowlist'te olmayan bir dosya bulunursa) test sesli
//       kırılır; bir orphan bağlanıp/silinirse (allowlist'te olan bir dosya
//       artık bulunamazsa) test YİNE kırılır — bu da allowlist'in küçültülüp
//       güncellenmesini zorunlu kılar.
//
// Tam bulgu listesi + her biri için hüküm (gerçek-orphan / kasıtlı /
// follow-up-öneri): docs/analysis/orphan-deliverables-2026-07.md
//
// Hermetik: yalnız gerçek, commit'lenmiş repo ağacını okur (src/**, scripts/**,
// tests/**) — zero-hardcode-audit.test.ts'teki "scanForViolations(projectRoot)"
// ile aynı kabul edilmiş desen (gitignored state DEĞİL, git-tracked kaynak).
// Fixture testleri (§ Scan Functions) gerçek tmpdir kullanır, no spawnSync.

import { describe, it, expect, afterEach } from 'vitest';
import {
  mkdtempSync, writeFileSync, mkdirSync, rmSync, readdirSync, readFileSync, existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, extname, relative, sep } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..', '..');

// ═══════════════════════════════════════════════════════════════════════════
// Scan functions (script-mantığı test-içinde — task 374-004 write-scope only
// allows this file + the analysis doc, so the scanner lives here, not in a
// separate scripts/*.mjs file).
// ═══════════════════════════════════════════════════════════════════════════

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const IMPORTER_EXTENSIONS = new Set(['.ts', '.tsx', '.mjs', '.js']);

/** Comment-only line (mirrors scripts/zero-hardcode-audit.mjs's isCommentLine). */
export function isCommentLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/**');
}

/** Recursively collect files under `dir` matching `extensions`, skipping node_modules/.git/.d.ts and any `excludeDirNames`. */
export function walkFiles(
  dir: string,
  extensions: Set<string>,
  excludeDirNames: string[] = [],
): string[] {
  const exclude = new Set(['node_modules', '.git', ...excludeDirNames]);
  const results: string[] = [];
  function walk(d: string): void {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return; // directory doesn't exist — treat as empty
    }
    for (const entry of entries) {
      if (exclude.has(entry.name)) continue;
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (extensions.has(extname(entry.name)) && !entry.name.endsWith('.d.ts')) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

/** Relative `from '...'` / `import('...')` specifiers in a file, skipping comment lines. */
export function extractRelativeImportSpecifiers(content: string): string[] {
  const specifiers: string[] = [];
  for (const line of content.split('\n')) {
    if (isCommentLine(line)) continue;
    const fromRe = /\bfrom\s+['"](\.[^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = fromRe.exec(line))) specifiers.push(m[1]);
    const dynRe = /\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g;
    while ((m = dynRe.exec(line))) specifiers.push(m[1]);
  }
  return specifiers;
}

/**
 * Resolve a relative import specifier from `fromFile` to an absolute .ts/.tsx
 * path, mapping the ESM `.js`/`.jsx` extension back to TypeScript source
 * (ADR-D-001 Node16 resolution: source imports always carry `.js`). Returns
 * null for non-TS specifiers (`.json`, `.css`, …) or unresolvable paths.
 */
export function resolveRelativeImport(
  fromFile: string,
  specifier: string,
  existsCheck: (p: string) => boolean,
): string | null {
  const base = resolve(dirname(fromFile), specifier);
  const ext = extname(base);
  const candidates: string[] = [];
  if (ext === '.js') {
    candidates.push(base.slice(0, -3) + '.ts', base.slice(0, -3) + '.tsx');
  } else if (ext === '.jsx') {
    candidates.push(base.slice(0, -4) + '.tsx');
  } else if (ext === '') {
    candidates.push(base + '.ts', base + '.tsx', join(base, 'index.ts'));
  } else {
    return null;
  }
  for (const c of candidates) {
    if (existsCheck(c)) return c;
  }
  return null;
}

export interface OrphanScanResult {
  candidateCount: number;
  importerCount: number;
  orphans: string[]; // forward-slash paths relative to `root`
}

/**
 * Full orphan sweep: files under `root/src/**` (`.ts`/`.tsx`, `src/dashboard/`
 * and `src/desktop/` excluded — both are separate bundler-resolution
 * sub-projects with their own package.json/tsconfig/bundler-config, see
 * analysis doc §0 and task 398-002) that no other file under `root/src/**`
 * or `root/scripts/**` imports via a relative specifier. `root/tests/**` is
 * deliberately excluded from the importer search — a file reached only from
 * a test is exactly the "delivered but not wired" pattern this sweep targets.
 */
export function findOrphanFiles(
  root: string,
  existsCheck: (p: string) => boolean = existsSync,
): OrphanScanResult {
  const candidates = walkFiles(join(root, 'src'), SOURCE_EXTENSIONS, ['dashboard', 'desktop']);
  const importerFiles = [
    ...walkFiles(join(root, 'src'), IMPORTER_EXTENSIONS),
    ...walkFiles(join(root, 'scripts'), IMPORTER_EXTENSIONS),
  ];

  const importedBy = new Set<string>();
  for (const file of importerFiles) {
    const content = readFileSafe(file);
    if (content === null) continue;
    for (const spec of extractRelativeImportSpecifiers(content)) {
      const resolved = resolveRelativeImport(file, spec, existsCheck);
      if (resolved) importedBy.add(resolved);
    }
  }

  const orphans = candidates
    .filter((c) => !importedBy.has(c))
    .map((c) => relative(root, c).split(sep).join('/'))
    .sort();

  return { candidateCount: candidates.length, importerCount: importerFiles.length, orphans };
}

function readFileSafe(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Unit tests — scan primitives
// ═══════════════════════════════════════════════════════════════════════════

describe('isCommentLine', () => {
  it('flags // and * and /** lines', () => {
    expect(isCommentLine('// a comment')).toBe(true);
    expect(isCommentLine('  * @param foo')).toBe(true);
    expect(isCommentLine('/** header */')).toBe(true);
  });

  it('does not flag real code lines', () => {
    expect(isCommentLine("import { x } from './y.js';")).toBe(false);
    expect(isCommentLine('')).toBe(false);
  });
});

describe('extractRelativeImportSpecifiers', () => {
  it('catches static from-imports and export-from', () => {
    const content = [
      "import { a } from './a.js';",
      "export { b } from '../b.js';",
      "export * from './c.js';",
    ].join('\n');
    expect(extractRelativeImportSpecifiers(content)).toEqual(['./a.js', '../b.js', './c.js']);
  });

  it('catches dynamic import() with literal specifiers', () => {
    const content = "const mod = await import('./lazy.js');";
    expect(extractRelativeImportSpecifiers(content)).toEqual(['./lazy.js']);
  });

  it('ignores bare (non-relative) package specifiers', () => {
    const content = "import { z } from 'zod';\nimport fs from 'node:fs';";
    expect(extractRelativeImportSpecifiers(content)).toEqual([]);
  });

  it('skips specifiers that appear only in comment lines', () => {
    const content = [
      "// import { ghost } from './ghost.js';",
      "import { real } from './real.js';",
    ].join('\n');
    expect(extractRelativeImportSpecifiers(content)).toEqual(['./real.js']);
  });

  it('catches import type specifiers (type-only imports still count as usage)', () => {
    const content = "import type { Foo } from './types.js';";
    expect(extractRelativeImportSpecifiers(content)).toEqual(['./types.js']);
  });
});

describe('resolveRelativeImport', () => {
  const exists = (known: Set<string>) => (p: string) => known.has(p);

  it('maps .js specifier to a sibling .ts file', () => {
    const from = '/proj/src/core/consumer.ts';
    const known = new Set(['/proj/src/core/used.ts']);
    expect(resolveRelativeImport(from, './used.js', exists(known))).toBe('/proj/src/core/used.ts');
  });

  it('falls back to .tsx when .ts does not exist', () => {
    const from = '/proj/src/cli/consumer.ts';
    const known = new Set(['/proj/src/cli/widget.tsx']);
    expect(resolveRelativeImport(from, './widget.js', exists(known))).toBe('/proj/src/cli/widget.tsx');
  });

  it('maps .jsx specifier to .tsx', () => {
    const from = '/proj/src/cli/consumer.tsx';
    const known = new Set(['/proj/src/cli/widget.tsx']);
    expect(resolveRelativeImport(from, './widget.jsx', exists(known))).toBe('/proj/src/cli/widget.tsx');
  });

  it('returns null for non-TS specifiers (.json, .css)', () => {
    const from = '/proj/src/core/consumer.ts';
    expect(resolveRelativeImport(from, './data.json', () => true)).toBeNull();
    expect(resolveRelativeImport(from, './style.css', () => true)).toBeNull();
  });

  it('returns null when no candidate file exists', () => {
    const from = '/proj/src/core/consumer.ts';
    expect(resolveRelativeImport(from, './ghost.js', () => false)).toBeNull();
  });

  it('resolves an extensionless directory import to index.ts', () => {
    const from = '/proj/src/mcp/consumer.ts';
    const known = new Set(['/proj/src/mcp/tools/index.ts']);
    expect(resolveRelativeImport(from, './tools', exists(known))).toBe('/proj/src/mcp/tools/index.ts');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// findOrphanFiles — determinism on a synthetic fixture project (hermetic tmpdir)
// ═══════════════════════════════════════════════════════════════════════════

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

function buildFixtureProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-orphan-fixture-'));
  tmpDirs.push(root);

  mkdirSync(join(root, 'src', 'core'), { recursive: true });
  mkdirSync(join(root, 'src', 'dashboard', 'src'), { recursive: true });
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'tests', 'core'), { recursive: true });

  // used.ts — imported by consumer.ts → NOT an orphan.
  writeFileSync(join(root, 'src', 'core', 'used.ts'), 'export function used() { return 1; }\n');
  // consumer.ts — the sole importer of used.ts.
  writeFileSync(
    join(root, 'src', 'core', 'consumer.ts'),
    "import { used } from './used.js';\nexport function run() { return used(); }\n",
  );
  // orphan.ts — exports something, imported by nothing in src/ or scripts/.
  writeFileSync(join(root, 'src', 'core', 'orphan.ts'), 'export function orphan() { return 2; }\n');
  // test-only.ts — imported ONLY by a test file (the "delivered but not wired" case).
  writeFileSync(join(root, 'src', 'core', 'test-only.ts'), 'export function testOnly() { return 3; }\n');
  writeFileSync(
    join(root, 'tests', 'core', 'test-only.test.ts'),
    "import { testOnly } from '../../src/core/test-only.js';\ntestOnly();\n",
  );
  // dashboard file — excluded from candidates regardless of import status.
  writeFileSync(join(root, 'src', 'dashboard', 'src', 'App.tsx'), 'export function App() { return null; }\n');
  // a script that imports orphan.ts from scripts/ — proves scripts/ counts as a real importer.
  writeFileSync(
    join(root, 'scripts', 'tool.mjs'),
    "import { orphan } from '../src/core/orphan.js';\norphan();\n",
  );

  return root;
}

describe('findOrphanFiles — fixture determinism', () => {
  it('flags files with zero src/scripts importers, excluding dashboard candidates', () => {
    const root = buildFixtureProject();
    const result = findOrphanFiles(root);
    // consumer.ts is itself unreached (nothing imports it, same shape as a real
    // process entry point like src/cli/entry.ts) — legitimately an orphan too.
    // test-only.ts is reached ONLY from tests/, which does not count as wired.
    // orphan.ts is excluded because scripts/tool.mjs imports it; dashboard/App.tsx
    // is excluded from candidates entirely.
    expect(result.orphans).toEqual(['src/core/consumer.ts', 'src/core/test-only.ts']);
    expect(result.candidateCount).toBe(4); // used, consumer, orphan, test-only (dashboard excluded)
  });

  it('is deterministic — repeated runs on the same tree produce the same result', () => {
    const root = buildFixtureProject();
    const first = findOrphanFiles(root);
    const second = findOrphanFiles(root);
    expect(second).toEqual(first);
  });

  it('a scripts/**-only importer is sufficient to NOT be flagged as orphan', () => {
    const root = buildFixtureProject();
    const result = findOrphanFiles(root);
    expect(result.orphans).not.toContain('src/core/orphan.ts');
  });

  it('a tests/**-only importer is NOT sufficient — still flagged as orphan', () => {
    const root = buildFixtureProject();
    const result = findOrphanFiles(root);
    expect(result.orphans).toContain('src/core/test-only.ts');
  });

  it('excludes src/dashboard/** from candidates entirely', () => {
    const root = buildFixtureProject();
    const result = findOrphanFiles(root);
    expect(result.orphans.some((o) => o.startsWith('src/dashboard/'))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Repo-wide roundtrip-gap-pin — KNOWN_ORPHANS allowlist
//
// Full findings + per-file verdict (gerçek-orphan / kasıtlı / follow-up-öneri):
// docs/analysis/orphan-deliverables-2026-07.md
//
// This list is pinned exactly (not "subset of"): a NEW orphan appearing here
// that isn't in the list is a regression signal (something got un-wired, or
// a fresh "delivered but not integrated" deliverable landed) — loud failure.
// An allowlist entry that STOPS appearing means it was connected or deleted —
// update this list (shrink it) as the corresponding follow-up work lands.
//
// Wave-1 selection + ready-to-execute wiring specs for the 5 highest-value
// entries below (approval-expiry-driver.ts, ask-brain-escalation.ts,
// global-store.ts, tool-scope-gate.ts, retro-formatter.ts): Sprint 375 Task
// 375-007, docs/analysis/orphan-wire-wave1.md. None of those 5 were wired in
// that task (its scope.filesWrite covered only this file + that doc, no
// src/** write authority) — they stay pinned until a follow-up wiring task
// lands.
//
// `src/cli/helpers/risk-language.ts` was added to this pin by the same task,
// NOT as one of the wave-1 5 — it is a brand-new deliverable landed by a
// sibling same-sprint task (375-004, TERM5-I18N-DILIM-1), whose own result
// notes explicitly leave it with zero consumer wiring ("slice-2 will wire
// help/catalog-render"). Ground-truth verified live (git status showed it
// untracked, 375-004 was already DONE) before adding — this keeps the
// roundtrip-gap-pin accurate rather than leaving it permanently red for
// everyone after this sprint closes.
//
// --- Sprint 398 Task 398-002 (LAT-ORPHAN ratchet-refresh) — 3 pin changes ---
// Diagnosed via `git log` per new/vanished entry the live scan surfaced
// (see docs/analysis/orphan-deliverables-2026-07.md for the running log —
// docImpact: that doc predates this refresh and does not yet reflect it):
//
// REMOVED (closed gap): `src/cli/repl/cursor-model.ts` is no longer an
// orphan — sprint-380 (commit 947473e2) wired it via a real consumer,
// `src/cli/repl/line-edit.ts` (`import { applyCursorEdit, moveCursor,
// toBuffer, type CursorState } from './cursor-model.js'`). Verified live
// with `grep -rn cursor-model src/`.
//
// ADDED, intentional (kasıtlı, kept-with-rationale): `src/orchestra/worker.ts`
// — its own file header (born-573 REDO, task 382-001) documents this as a
// deliberate thin re-export shim, kept ONLY so
// `tests/orchestra/worker-approval-gate-wire.test.ts` keeps resolving a
// single canonical definition; the real implementation lives in
// `src/agents/worker.ts` (imported by http-agentic-worker.ts,
// spawn-backend-docker.ts, debt-manager.ts, sprint-lifecycle.ts,
// sprint-spawner.ts, and more). Same re-export-after-relocation pattern
// ADR-D-004 already sanctions for `orchestra/event-stream.ts`.
//
// ADDED, SUSPICIOUS / dead-code candidate — flagged, not endorsed:
// `src/cli/repl/native-flag.ts` (`isNativeAgentEnabled`). Sprint-376 M5
// NATIVE-FLIP (commit a778151a, task 376-003) replaced its call site in
// `run.tsx` with a new local `isNativeAgentSelected`; that commit's own
// added comment says the old gate "is no longer called from this module."
// Its only remaining importers are two test files
// (`tests/cli/native-flag-wire.test.ts`,
// `tests/cli/native-stabilization-proof.test.ts`) exercising a gate that no
// longer runs in production — the exact "delivered but not wired" shape
// this sweep exists to catch. Pinned here because the roundtrip-gap-pin
// must reflect the live scan exactly, but this entry is NOT a vouched-for
// intentional deliverable like the others above — flagging for Brain to
// decide whether to delete the file + its two orphaned tests, or to keep it
// as a documented legacy/rollback reference.
//
// FIXED AT THE SOURCE (scanner bug, not a per-file pin): 8 new candidates
// under `src/desktop/**` (electron.vite.config.ts, src/main/index.ts,
// src/main/tray.ts, src/preload/index.ts, src/renderer/main.ts, and 3
// tests/*.test.ts) were a scanner gap, not real orphans — `src/desktop/`
// has its own package.json + tsconfig.json + electron.vite.config.ts +
// node_modules (born-496: "DESK-1 B2 scaffold — src/desktop sub-package
// (dashboard-isolation pattern)"), structurally identical to
// `src/dashboard/` which `findOrphanFiles` already excludes from
// `candidates`. Added `'desktop'` alongside `'dashboard'` in the
// excludeDirNames call above instead of allowlisting each file individually
// — desktop's real cross-boundary imports (e.g. `../../../core/
// pid-ownership.js`, `../../../cli/helpers/messages.js`) stay visible to
// the importer-side walk, which is unaffected by this change.
// ═══════════════════════════════════════════════════════════════════════════

const KNOWN_ORPHANS = [
  // SURF-1b (sprint-439): the durable RunFlowCoordinator core landed but its
  // consumers (terminal controller + API routes) are the SURF-1c driver-
  // migration slice — deliberately frozen mid-train (Alperen, 2026-07-14:
  // SURF dondu, PCOMP-6 öncelik). Un-orphans when SURF-1c wires it.
  'src/orchestra/run-flow-coordinator.ts',
  'src/agents/auditor.ts',
  'src/agents/cross-sprint-analyzer.ts',
  'src/agents/http-agentic-worker.ts',
  'src/agents/permission-guard.ts',
  'src/agents/prompt-ab-test.ts',
  'src/agents/prompt-evolution.ts',
  'src/agents/prompt-metrics.ts',
  'src/api/rpc-write-handlers.ts',
  'src/cli/commands/agentic-session.ts',
  'src/cli/commands/chat-status-line.ts',
  'src/cli/commands/retro-formatter.ts',
  'src/cli/entry.ts',
  'src/cli/helpers/agent-templates.ts',
  'src/cli/helpers/chat-intent-executor.ts',
  'src/cli/helpers/hints.ts',
  'src/cli/helpers/output-mode.ts',
  'src/cli/helpers/risk-language.ts',
  'src/cli/helpers/sprint-summary.ts',
  'src/cli/repl/ink-probe.tsx',
  'src/cli/repl/native-flag.ts',
  // 'src/cli/repl/plan-preview-card.tsx' — KAPANDI sprint-426 TERM4B (2026-07-12):
  // app.tsx canlı-mount → artık orphan değil (5d94a831'deki geçici pin düştü).
  'src/connectors/approval-clients-wire.ts',
  'src/connectors/approval-telegram.ts',
  'src/connectors/identity/verify-bind.ts',
  'src/core/agent-selector.ts',
  // 'src/core/approval-expiry-driver.ts' — KAPANDI born-631 (405-004, 2026-07-11):
  // server-start'ta canlı-sürücü (unref'd + dispose) → artık orphan değil.
  'src/core/approval-fallback.ts',
  'src/core/audit-export.ts',
  'src/core/auth-session.ts',
  'src/core/catalog/cache-archetype.ts',
  'src/core/catalog/catalog-registry.ts',
  'src/core/catalog/local-static-source.ts',
  'src/core/catalog/models-dev-source.ts',
  'src/core/catalog/openrouter-source.ts',
  'src/core/computer-use-exec.ts',
  'src/core/config-validator.ts',
  'src/core/credentials-per-project.ts',
  'src/core/credentials.ts',
  'src/core/global-config.ts',
  'src/core/global-store.ts',
  'src/core/interaction-policy.ts',
  'src/core/lazy-loader.ts',
  'src/core/marketplace/dependency-resolver.ts',
  'src/core/marketplace/rating-system.ts',
  'src/core/notification-config.ts',
  'src/core/notification-providers/discord.ts',
  'src/core/notification-providers/slack.ts',
  'src/core/provider-capabilities.ts',
  'src/core/rate-limiter.ts',
  'src/core/skill-registry.ts',
  'src/core/spawn-safety.ts',
  'src/core/state-paths.ts',
  'src/core/telemetry.ts',
  'src/core/token-counter.ts',
  'src/core/tokenizer-fallback.ts',
  'src/core/tool-availability.ts',
  'src/core/tool-schema-override.ts',
  'src/core/tool-scope-gate.ts',
  'src/core/tool-shadow-policy.ts',
  'src/extensions/vscode/src/deckent-panel.ts',
  'src/extensions/vscode/src/panel-refresh.ts',
  'src/index.ts',
  'src/mcp/helpers/index.ts',
  'src/mcp/server.ts',
  'src/monitor/alert-emitter.ts',
  'src/nervous/approval-actions.ts',
  'src/nervous/ask-brain-escalation.ts',
  'src/orchestra/autonomous/mission-store/mission-events.ts',
  'src/orchestra/brain-context.ts',
  'src/orchestra/capability-realizer.ts',
  'src/orchestra/codex-spawn-readiness.ts',
  'src/orchestra/doc-updaters/metrics-updater.ts',
  'src/orchestra/managed-docs/index.ts',
  'src/orchestra/monitor-adapter.ts',
  'src/orchestra/multi-agent.ts',
  // 'src/orchestra/output-collector.ts' — KAPANDI (born-614, 2026-07-10):
  // recordSprintWorkerTrace artik runEvaluatePhase'ten cagriliyor (sprint-trace-wire).
  'src/orchestra/pattern-reader.ts',
  'src/orchestra/reconciler.ts',
  'src/orchestra/result-assembler.ts',
  'src/orchestra/spawn-backend-mock.ts',
  'src/orchestra/spawn-backend-subprocess.ts',
  'src/orchestra/task-analyzer.ts',
  'src/orchestra/timeout-watcher.ts',
  'src/orchestra/worker.ts',
  'src/providers/cache-adapter-resource.ts',
  'src/providers/cache-adapter.ts',
  'src/sdk/index.ts',
  'src/training/corpus-lint.ts',
].sort();

describe('KNOWN_ORPHANS allowlist sanity', () => {
  it('has the expected count and only well-formed src/**/*.ts(x) entries', () => {
    expect(KNOWN_ORPHANS.length).toBe(86); // 86->85: plan-preview-card TERM4B mount'uyla kapandi (sprint-426)
    for (const entry of KNOWN_ORPHANS) {
      expect(entry.startsWith('src/')).toBe(true);
      expect(entry.endsWith('.ts') || entry.endsWith('.tsx')).toBe(true);
    }
  });

  it('has no duplicate entries', () => {
    expect(new Set(KNOWN_ORPHANS).size).toBe(KNOWN_ORPHANS.length);
  });
});

describe('orphan-deliverable-sweep — repo-wide roundtrip-gap-pin', () => {
  it('the live scan matches KNOWN_ORPHANS exactly (new orphan or a closed gap both fail loudly)', () => {
    const result = findOrphanFiles(projectRoot);
    expect(result.orphans).toEqual(KNOWN_ORPHANS);
  });
});
