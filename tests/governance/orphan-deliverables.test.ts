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
 * excluded — separate bundler-resolution sub-project, see analysis doc §0)
 * that no other file under `root/src/**` or `root/scripts/**` imports via a
 * relative specifier. `root/tests/**` is deliberately excluded from the
 * importer search — a file reached only from a test is exactly the
 * "delivered but not wired" pattern this sweep targets.
 */
export function findOrphanFiles(
  root: string,
  existsCheck: (p: string) => boolean = existsSync,
): OrphanScanResult {
  const candidates = walkFiles(join(root, 'src'), SOURCE_EXTENSIONS, ['dashboard']);
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
// ═══════════════════════════════════════════════════════════════════════════

const KNOWN_ORPHANS = [
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
  'src/cli/helpers/sprint-summary.ts',
  'src/cli/repl/cursor-model.ts',
  'src/cli/repl/ink-probe.tsx',
  'src/connectors/approval-clients-wire.ts',
  'src/connectors/approval-telegram.ts',
  'src/connectors/identity/verify-bind.ts',
  'src/core/agent-selector.ts',
  'src/core/approval-expiry-driver.ts',
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
  'src/orchestra/output-collector.ts',
  'src/orchestra/pattern-reader.ts',
  'src/orchestra/reconciler.ts',
  'src/orchestra/result-assembler.ts',
  'src/orchestra/spawn-backend-mock.ts',
  'src/orchestra/spawn-backend-subprocess.ts',
  'src/orchestra/task-analyzer.ts',
  'src/orchestra/timeout-watcher.ts',
  'src/providers/cache-adapter-resource.ts',
  'src/providers/cache-adapter.ts',
  'src/sdk/index.ts',
  'src/training/corpus-lint.ts',
].sort();

describe('KNOWN_ORPHANS allowlist sanity', () => {
  it('has the expected count and only well-formed src/**/*.ts(x) entries', () => {
    expect(KNOWN_ORPHANS.length).toBe(85);
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
