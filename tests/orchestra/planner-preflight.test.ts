/**
 * Plan-time scope preflight — 423-003 (born-650 + 653 + 661).
 *
 * RED→GREEN discipline: every fix is proven against the REAL defect first.
 *   - 653: the real `extractScopeFromDirective` STILL produces the phantom paths
 *     (RED, live defect) → `stripPhantomScope` removes them (GREEN).
 *   - 650: the real `lintScopeSatisfiability` STILL emits a BLOCK for the code/money
 *     token (RED) → the wired gate (`evaluatePromptGate`) filters it (GREEN), while a
 *     genuinely-missing real path STILL blocks (NO_GO guard: gate not weakened).
 *   - 661: affected tests auto-added + reported; cap enforced + overflow announced
 *     (NO_GO guard: expansion neither cap-less nor silent).
 * Hermetic: all fixtures are inline in-memory (no gitignored state, no fs, no spawn).
 */
import { describe, it, expect } from 'vitest';
import { extractScopeFromDirective } from '../../src/orchestra/task-builder.js';
import { lintScopeSatisfiability } from '../../src/orchestra/scope-satisfiability.js';
import { evaluatePromptGate } from '../../src/orchestra/prompt-gate.js';
import { preflightTaskScopes } from '../../src/orchestra/planner.js';
import {
  isRealPathCandidate,
  stripPhantomScope,
  scanAffectedTests,
  expandScopeWithAffectedTests,
  AFFECTED_TEST_CAP,
  type AffectedTestFile,
} from '../../src/core/task-builder-scope.js';
import type { AgentDefinition } from '../../src/core/agent-types.js';
import type { Task } from '../../src/core/task-types.js';

const EMPTY_POOL = new Map<string, AgentDefinition>();

function task(over: Partial<Task> & { id: string }): Task {
  return {
    id: over.id,
    title: over.title ?? 'T',
    description: over.description ?? '',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: over.scope ?? { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: over.goNogo ?? { goCriteria: 'works', noGoCriteria: 'fails', techDebtAcceptable: 'minor' },
    status: 'PENDING',
    sprintId: 'sprint-1',
    createdAt: '2026-01-01T00:00:00Z',
    assignedAgent: over.assignedAgent,
    assignedSkills: [],
    provider: 'claude',
  } as Task;
}

// ─── born-653: phantom scope strip (real producer → RED, strip → GREEN) ───────

describe('born-653 — scope derivation phantom paths', () => {
  // 414-001 real case: a Files list with `tests/docs/release-docs.test.ts` — the real
  // extractScopeFromDirective substring-matches `docs/release-docs.test.ts` and pushes
  // both a phantom `docs/` directory and a phantom `docs/release-docs.test.ts` file.
  it('RED: real extractScopeFromDirective produces the 414-001 docs/ phantoms', () => {
    const scope = extractScopeFromDirective('- Files: tests/docs/release-docs.test.ts');
    // Live defect: the phantom docs/-root file + dir exist today.
    expect(scope.filesWrite).toContain('docs/release-docs.test.ts');
    expect(scope.directories).toContain('docs/');
  });

  it('GREEN: stripPhantomScope removes the 414-001 phantoms, keeps the real path', () => {
    const declared = ['tests/docs/release-docs.test.ts'];
    const scope = extractScopeFromDirective('- Files: tests/docs/release-docs.test.ts');
    const { scope: clean, removed } = stripPhantomScope(scope, declared);
    expect(clean.filesWrite).toContain('tests/docs/release-docs.test.ts');
    expect(clean.filesWrite).not.toContain('docs/release-docs.test.ts');
    expect(clean.directories).not.toContain('docs/');
    expect(removed).toEqual(expect.arrayContaining(['docs/release-docs.test.ts', 'docs/']));
    // Phantom-zero: nothing outside the declared intent survives as a fake path.
    expect(clean.directories.filter((d) => d.startsWith('docs/'))).toHaveLength(0);
  });

  // 411-001 real case: a Scope label carrying a FILE path — the real derivation appends
  // a slash and mints the `src/core/deck-file.ts/` phantom directory.
  it('RED: real extractScopeFromDirective mints the 411-001 file-as-directory phantom', () => {
    const scope = extractScopeFromDirective('- Scope: src/core/deck-file.ts');
    expect(scope.directories).toContain('src/core/deck-file.ts/');
  });

  it('GREEN: stripPhantomScope drops the file-as-directory phantom (extension-detected)', () => {
    const declared = ['src/core/deck-file.ts', 'tests/core/deck-file.test.ts'];
    const scope = extractScopeFromDirective('- Scope: src/core/deck-file.ts');
    const { scope: clean, removed } = stripPhantomScope(scope, declared);
    expect(clean.directories).not.toContain('src/core/deck-file.ts/');
    expect(removed).toContain('src/core/deck-file.ts/');
    // No directory token is actually a file path.
    expect(clean.directories.filter((d) => /\.[cm]?tsx?\/$/.test(d))).toHaveLength(0);
  });

  it('does NOT strip a legitimately-declared file or a real grounded directory', () => {
    const declared = ['src/core/deck-file.ts'];
    const scope = {
      directories: ['src/core/', 'tests/core/'],
      filesRead: [],
      filesWrite: ['src/core/deck-file.ts', 'tests/core/deck-file.test.ts'],
    };
    const { scope: clean, removed } = stripPhantomScope(scope, declared);
    expect(clean.directories).toEqual(['src/core/', 'tests/core/']);
    expect(clean.filesWrite).toContain('src/core/deck-file.ts');
    expect(clean.filesWrite).toContain('tests/core/deck-file.test.ts');
    expect(removed).toHaveLength(0);
  });
});

// ─── born-650: G6 code-token false-positive (real lint → RED, gate → GREEN) ───

describe('born-650 — code/money tokens are not file paths', () => {
  const CODE_MONEY_GO =
    'Regresyon: (Date.now/process.env/fs importu YOK) doğrulanır; maliyet $2.23/4.25dk sınırında kalır.';

  it('RED: real lintScopeSatisfiability BLOCKs the code/money tokens as phantom paths', () => {
    const findings = lintScopeSatisfiability({
      description: '',
      goCriteria: CODE_MONEY_GO,
      proofCommands: [],
      filesWrite: ['src/orchestra/planner.ts'],
      directories: [],
      trackedFiles: ['src/orchestra/planner.ts'],
    });
    // Live defect: the raw extractor treats "now/process.env" and/or "23/4.25dk" as paths.
    const badPaths = findings.map((f) => f.path);
    expect(badPaths.some((p) => p.includes('process.env') || /\d\/\d/.test(p))).toBe(true);
  });

  it('GREEN: the wired gate emits no BLOCK for the code/money sentence', () => {
    const t = task({
      id: 't-650',
      goNogo: { goCriteria: CODE_MONEY_GO, noGoCriteria: 'fails', techDebtAcceptable: 'minor' },
      scope: { directories: [], filesRead: [], filesWrite: ['src/orchestra/planner.ts'] },
    });
    const res = evaluatePromptGate({
      tasks: [t],
      agentPool: EMPTY_POOL,
      trackedFiles: ['src/orchestra/planner.ts'],
    });
    const sat = res.findings.filter((f) => f.lint === 'scope-satisfiability');
    expect(sat).toHaveLength(0);
    expect(res.ok).toBe(true);
  });

  it('NO_GO guard — a genuinely missing real path STILL blocks (gate not weakened)', () => {
    const t = task({
      id: 't-real-miss',
      goNogo: {
        goCriteria: 'src/core/nonexistent-xyz.ts must export the new resolver',
        noGoCriteria: 'fails',
        techDebtAcceptable: 'minor',
      },
      scope: { directories: [], filesRead: [], filesWrite: ['src/orchestra/planner.ts'] },
    });
    const res = evaluatePromptGate({
      tasks: [t],
      agentPool: EMPTY_POOL,
      trackedFiles: ['src/orchestra/planner.ts'],
    });
    const block = res.findings.filter((f) => f.lint === 'scope-satisfiability' && f.level === 'block');
    expect(block.some((f) => f.message.includes('src/core/nonexistent-xyz.ts'))).toBe(true);
    expect(res.ok).toBe(false);
  });

  it('isRealPathCandidate: code/money out, real paths in', () => {
    expect(isRealPathCandidate('now/process.env')).toBe(false);
    expect(isRealPathCandidate('23/4.25dk')).toBe(false);
    expect(isRealPathCandidate('Date.now')).toBe(false);
    expect(isRealPathCandidate('import.meta')).toBe(false);
    expect(isRealPathCandidate('src/core/nonexistent-xyz.ts')).toBe(true);
    expect(isRealPathCandidate('README.md')).toBe(true);
    expect(isRealPathCandidate('tests/orchestra/planner.test.ts')).toBe(true);
    expect(isRealPathCandidate('src/core/no-ext-dir')).toBe(true); // known root, no ext → still a candidate
  });
});

// ─── born-661: affected-test scope expansion ──────────────────────────────────

describe('born-661 — affected-test scope expansion', () => {
  it('adds a test that imports the task source module, ignores an unrelated test', () => {
    const scan = scanAffectedTests(
      ['src/orchestra/planner.ts'],
      [
        { path: 'tests/orchestra/planner.test.ts', content: "import { x } from '../../src/orchestra/planner.js';" },
        { path: 'tests/orchestra/unrelated.test.ts', content: "import { y } from '../../src/core/other.js';" },
      ],
    );
    expect(scan.added).toEqual(['tests/orchestra/planner.test.ts']);
    expect(scan.report).toBe('affected-test-expansion: +1 dosya');
    expect(scan.capped).toBe(false);
  });

  it('matches by mirror-name convention when test content is unavailable', () => {
    const scan = scanAffectedTests(
      ['src/orchestra/planner.ts'],
      [{ path: 'tests/orchestra/planner.test.ts' }, { path: 'tests/orchestra/other.test.ts' }],
    );
    expect(scan.added).toEqual(['tests/orchestra/planner.test.ts']);
  });

  it('expandScopeWithAffectedTests appends without duplicating already-scoped tests', () => {
    const scope = {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/planner.ts', 'tests/orchestra/planner.test.ts'],
    };
    const { scope: expanded, scan } = expandScopeWithAffectedTests(scope, [
      { path: 'tests/orchestra/planner.test.ts', content: "from '../../src/orchestra/planner.js'" },
      { path: 'tests/orchestra/planner-edge.test.ts', content: "from '../../src/orchestra/planner.js'" },
    ]);
    expect(scan.added).toEqual(['tests/orchestra/planner-edge.test.ts']);
    expect(expanded.filesWrite).toContain('tests/orchestra/planner-edge.test.ts');
    // idempotent: the already-scoped test is not duplicated
    expect(expanded.filesWrite.filter((f) => f === 'tests/orchestra/planner.test.ts')).toHaveLength(1);
  });

  it('NO_GO guard — the cap is enforced AND an overflow is announced (never silent)', () => {
    const many: AffectedTestFile[] = [];
    for (let i = 0; i < 30; i++) {
      many.push({ path: `tests/core/big-${String(i).padStart(2, '0')}.test.ts`, content: "from '../../src/core/big.js'" });
    }
    const scan = scanAffectedTests(['src/core/big.ts'], many);
    expect(scan.total).toBe(30);
    expect(scan.added).toHaveLength(AFFECTED_TEST_CAP); // 25 — capped, not cap-less
    expect(scan.capped).toBe(true);
    expect(scan.report).toContain(`+${AFFECTED_TEST_CAP} dosya`);
    expect(scan.report).toMatch(/aştı|atlandı/); // overflow announced, not silent
  });
});

// ─── planner preflight orchestration (in-place mutation + report) ─────────────

describe('preflightTaskScopes — in-place mutation + report lines', () => {
  it('expands affected tests and strips phantoms in one pass, reporting both', () => {
    // Realistic 414-001 shape: the declared Files carry `tests/docs/release-docs.test.ts`;
    // derivation added the phantom `docs/` dir + `docs/release-docs.test.ts` file.
    const t = {
      id: '423-x',
      scope: {
        directories: ['docs/'], // phantom (substring of tests/docs/...)
        filesRead: [],
        filesWrite: ['src/orchestra/planner.ts', 'tests/docs/release-docs.test.ts', 'docs/release-docs.test.ts'],
      },
    };
    const res = preflightTaskScopes([t], {
      declaredFilesOf: () => ['src/orchestra/planner.ts', 'tests/docs/release-docs.test.ts'],
      testFiles: [{ path: 'tests/orchestra/planner.test.ts', content: "from '../../src/orchestra/planner.js'" }],
    });
    // born-653: phantoms gone
    expect(t.scope.filesWrite).not.toContain('docs/release-docs.test.ts');
    expect(t.scope.directories).not.toContain('docs/');
    // born-661: affected test added
    expect(t.scope.filesWrite).toContain('tests/orchestra/planner.test.ts');
    expect(res.reportLines.some((l) => l.includes('affected-test-expansion: +1'))).toBe(true);
    expect(res.reportLines.some((l) => l.includes('phantom-scope-strip'))).toBe(true);
  });

  it('is a no-op (no mutation, no report) for an already-clean scope with no affected tests', () => {
    const t = {
      id: '423-clean',
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/config.ts'] },
    };
    const before = JSON.parse(JSON.stringify(t.scope));
    const res = preflightTaskScopes([t], {
      declaredFilesOf: () => ['src/core/config.ts'],
      testFiles: [{ path: 'tests/orchestra/unrelated.test.ts', content: "from '../../src/other.js'" }],
    });
    expect(t.scope).toEqual(before);
    expect(res.reportLines).toHaveLength(0);
    expect(res.entries).toHaveLength(0);
  });
});
