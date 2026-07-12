// ─── Plan-time Scope Preflight Engine (task 423-003: born-650 + 653 + 661) ────
//
// Pure, orchestra-free helpers (ADR-D-004 C1: core/ MUST NOT import orchestra/).
// Three plan-time scope concerns, one module — consumed by the preflight surfaces
// (prompt-gate.ts real-path filter; planner.ts preflightTaskScopes):
//
//   - born-650: isRealPathCandidate — the gate's scope-satisfiability lint mistakes
//     code tokens ("Date.now/process.env" → "now/process.env", "$2.23/4.25dk" →
//     "23/4.25dk") for slash-qualified file paths and false-BLOCKs. A path candidate
//     must LOOK like a real path, not a code-API or money/number token.
//   - born-653: stripPhantomScope — scope derivation turns a file path into a phantom
//     directory ("src/core/deck-file.ts/") and substring-derives a phantom file/dir
//     ("tests/docs/x.test.ts" → "docs/", "docs/x.test.ts"). A derived path not grounded
//     in the declared Files is removed; a file path is never treated as a directory.
//   - born-661: scanAffectedTests / expandScopeWithAffectedTests — plan-time, the test
//     files that import a task's source modules are added to its write scope so a worker
//     can update the tests its change breaks without a boundary violation. Capped (≤25),
//     never silent on overflow.

import type { TaskScope } from './task-types.js';

// ─── born-650: real-path candidate predicate ─────────────────────────────────

/** Known repo roots — a token under one of these is a path candidate even without a
 * file extension (a bare "src/foo" directory-ish target still blocks legitimately). */
const KNOWN_ROOT_PREFIXES = ['src/', 'tests/', 'test/', 'docs/', 'doc/', 'scripts/', '.github/'] as const;

/** Code-API tokens the satisfiability regex splits on "." / "/" and misreads as a path
 * ("Date.now/process.env" → matched span "now/process.env"). Substring-checked against
 * the candidate token so an embedded API fragment is enough to disqualify it. */
const CODE_API_TOKENS = [
  'process.env', 'process.argv', 'process.cwd', 'process.platform', 'process.exit',
  'Date.now', 'import.meta', 'Math.random', 'Math.max', 'Math.min', 'Math.floor',
  'Object.keys', 'Object.entries', 'Object.assign', 'Array.from', 'JSON.parse', 'JSON.stringify',
] as const;

/** A real file extension is alpha-led (".ts", ".test.ts", ".md", ".yml"); a numeric-led
 * "extension" (".25dk", ".4") is a money/number artifact, never a filename. */
const REAL_EXTENSION_RE = /\.[A-Za-z][A-Za-z0-9]*$/;

/** Currency signs that mark a money token ("$2.23", "₺5"). */
const CURRENCY_RE = /[$₺€£]/;

function hasRealExtension(token: string): boolean {
  const base = token.split('/').pop() ?? token;
  return REAL_EXTENSION_RE.test(base);
}

function hasKnownRootPrefix(token: string): boolean {
  return KNOWN_ROOT_PREFIXES.some((p) => token.startsWith(p));
}

function isCodeApiToken(token: string): boolean {
  return CODE_API_TOKENS.some((api) => token.includes(api));
}

/** Money/number: a currency sign anywhere, or every slash-segment starts with a digit
 * ("23/4.25dk", "4.25dk"). */
function isMoneyOrNumber(token: string): boolean {
  if (CURRENCY_RE.test(token)) return true;
  const segments = token.split('/');
  return segments.length > 0 && segments.every((s) => /^\d/.test(s));
}

/**
 * born-650 — does `token` look like a REAL file path (vs. a code-API token or a
 * money/number the satisfiability regex greedily matched)? A candidate MUST NOT be a
 * code-API token, MUST NOT be a money/number pattern, AND MUST either carry a real
 * (alpha-led) extension OR sit under a known repo root. Conservative by construction:
 * a genuinely missing path ("src/core/x.ts") still qualifies — the gate still blocks it.
 */
export function isRealPathCandidate(token: string): boolean {
  if (!token) return false;
  if (isCodeApiToken(token)) return false;
  if (isMoneyOrNumber(token)) return false;
  return hasRealExtension(token) || hasKnownRootPrefix(token);
}

// ─── born-653: phantom scope strip ───────────────────────────────────────────

/** A directory token whose final segment carries a real file extension is a file path
 * mislabeled as a directory ("src/core/deck-file.ts/"). */
function directoryLooksLikeFile(dir: string): boolean {
  const trimmed = dir.endsWith('/') ? dir.slice(0, -1) : dir;
  const base = trimmed.split('/').pop() ?? trimmed;
  return REAL_EXTENSION_RE.test(base);
}

export interface PhantomStripResult {
  scope: TaskScope;
  /** Every path removed as a phantom (for the preflight report; never silent). */
  removed: string[];
}

/**
 * born-653 — remove phantom scope entries a naive derivation produced from the declared
 * Files, WITHOUT dropping legitimately-derived (grounded) test scope:
 *
 *   1. a directory whose last segment is a file ("src/core/deck-file.ts/") — a file path
 *      wrongly treated as a directory (extension-detection);
 *   2. a filesWrite entry that is a proper path-suffix of a declared file
 *      ("docs/x.test.ts" from "tests/docs/x.test.ts") — a substring-derivation artifact;
 *   3. a directory that grounds no declared file yet is a mid-path fragment of one
 *      ("docs/" from "tests/docs/x.test.ts").
 *
 * `groundingFiles` is the task's DECLARED Files (its true write intent). A derived path
 * that is not grounded in it, and matches a phantom signature, is stripped; declared
 * paths and real mirror-test scope (grounded under a real dir) are preserved untouched.
 */
export function stripPhantomScope(scope: TaskScope, groundingFiles: readonly string[]): PhantomStripResult {
  const declared = new Set(groundingFiles);
  const removed: string[] = [];

  const filesWrite = scope.filesWrite.filter((f) => {
    const isSuffixArtifact =
      !declared.has(f) && groundingFiles.some((g) => g !== f && g.endsWith('/' + f));
    if (isSuffixArtifact) {
      removed.push(f);
      return false;
    }
    return true;
  });

  const directories = scope.directories.filter((d) => {
    if (directoryLooksLikeFile(d)) {
      removed.push(d);
      return false;
    }
    const groundsDeclared = groundingFiles.some((g) => g.startsWith(d));
    const groundsKeptFile = filesWrite.some((f) => f.startsWith(d));
    if (groundsDeclared || groundsKeptFile) return true;
    // Ungrounded dir that is a mid-path fragment of a declared file → phantom.
    const isMidPathFragment = groundingFiles.some((g) => g.includes('/' + d));
    if (isMidPathFragment) {
      removed.push(d);
      return false;
    }
    return true;
  });

  return { scope: { directories, filesRead: scope.filesRead, filesWrite }, removed };
}

// ─── born-661: affected-test scope expansion ─────────────────────────────────

/** Max affected-test files auto-added to a single task's write scope (bounds the pass). */
export const AFFECTED_TEST_CAP = 25;

/** A source-code extension (.ts/.tsx/.mts/.cts) — the only files an affected test targets. */
const SOURCE_EXT_RE = /\.[cm]?tsx?$/;

export interface AffectedTestFile {
  path: string;
  /** Optional file content — when present, matched by import path/basename; when absent,
   * only the mirror-name convention ("src/X/Y.ts" ↔ "tests/X/Y.test.ts") applies. */
  content?: string;
}

export interface AffectedTestScan {
  /** Test paths to add to write scope (unique, sorted, not already in scope, capped). */
  added: string[];
  /** True when the distinct-match count exceeded the cap and was truncated. */
  capped: boolean;
  /** Total distinct affected tests found BEFORE the cap. */
  total: number;
  /** One-line preflight report ('affected-test-expansion: +N dosya', + overflow note). */
  report: string;
}

/** Import needles for a source file: its path-stem (boundary-anchored so "planner" does
 * NOT match a sibling "planner-helper") and relative-import basename forms. */
function sourceImportNeedles(source: string): string[] {
  const noExt = source.replace(SOURCE_EXT_RE, ''); // src/orchestra/planner
  const base = noExt.split('/').pop() ?? noExt; // planner
  return [
    `${noExt}.`, `${noExt}'`, `${noExt}"`, // path-stem, terminated by ext-dot or quote
    `/${base}.js'`, `/${base}.js"`, `/${base}.ts'`, `/${base}.ts"`,
  ];
}

/** Mirror-test path for a source file, or undefined when it is not an src/*.ts source. */
function mirrorTestPath(source: string): string | undefined {
  if (!source.startsWith('src/') || !SOURCE_EXT_RE.test(source)) return undefined;
  return 'tests/' + source.slice('src/'.length).replace(SOURCE_EXT_RE, '.test.ts');
}

/**
 * born-661 — scan candidate test files for those that import/pin any of a task's source
 * modules (`filesWrite`). A test matches when its content mentions the source path-stem
 * or a relative import of its basename; without content, the mirror-name convention is
 * used. Only src/*.ts sources are considered (a test already in filesWrite is not a
 * source). The result is unique + sorted, excludes tests already in scope, and is capped
 * at `cap` (≤25) — an overflow is reported, never silently dropped. This is deliberately
 * NOT a full dependency graph (born-661's remaining vision): a fast import-mention scan.
 */
export function scanAffectedTests(
  filesWrite: readonly string[],
  testFiles: readonly AffectedTestFile[],
  opts: { cap?: number; alreadyInScope?: readonly string[] } = {},
): AffectedTestScan {
  const cap = opts.cap ?? AFFECTED_TEST_CAP;
  const already = new Set(opts.alreadyInScope ?? filesWrite);
  const sources = filesWrite.filter(
    (f) => f.startsWith('src/') && SOURCE_EXT_RE.test(f) && !f.includes('.test.'),
  );

  const matches = new Set<string>();
  for (const test of testFiles) {
    if (already.has(test.path)) continue;
    for (const src of sources) {
      const mirror = mirrorTestPath(src);
      let hit = false;
      if (mirror && test.path === mirror) hit = true;
      if (!hit && test.content) {
        hit = sourceImportNeedles(src).some((n) => test.content!.includes(n));
      }
      if (hit) {
        matches.add(test.path);
        break;
      }
    }
  }

  const all = [...matches].sort();
  const total = all.length;
  const capped = total > cap;
  const added = capped ? all.slice(0, cap) : all;
  let report = `affected-test-expansion: +${added.length} dosya`;
  if (capped) {
    report += ` (uyarı: ${total} eşleşme cap ${cap}'i aştı — ilk ${cap} eklendi, ${total - cap} atlandı)`;
  }
  return { added, capped, total, report };
}

export interface ScopeExpansion {
  scope: TaskScope;
  scan: AffectedTestScan;
}

/**
 * born-661 — return a NEW scope with affected tests appended to filesWrite (idempotent:
 * tests already present are not duplicated). The scan report is returned for the
 * plan-time preflight log line. Input scope is never mutated.
 */
export function expandScopeWithAffectedTests(
  scope: TaskScope,
  testFiles: readonly AffectedTestFile[],
  opts: { cap?: number } = {},
): ScopeExpansion {
  const scan = scanAffectedTests(scope.filesWrite, testFiles, {
    cap: opts.cap,
    alreadyInScope: scope.filesWrite,
  });
  if (scan.added.length === 0) return { scope, scan };
  return { scope: { ...scope, filesWrite: [...scope.filesWrite, ...scan.added] }, scan };
}
