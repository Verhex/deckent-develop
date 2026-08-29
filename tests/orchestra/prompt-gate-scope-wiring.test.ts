/**
 * Sprint-399 WIRING regression — the 397 prompt-contract failure modes, end-to-end
 * through the REAL surfaces (not the core modules in isolation):
 *   - SAN-1: buildScopeBlock keeps tracked root files (README/.secrets-baseline) and
 *     evaluatePromptGate BLOCKs on a write path the render would silently drop.
 *   - G1b: evaluatePromptGate surfaces scope-satisfiability findings (fixture-012).
 *   - SAN-2: evaluateScopeGate(resolveSuggestions) + applyScopeResolutions repair the
 *     397-007 typo path and the 397-011 typo-duplicate.
 * Hermetic: fixtures are static JSON under tests/fixtures/prompt-contract-397/.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluatePromptGate } from '../../src/orchestra/prompt-gate.js';
import { buildScopeBlock } from '../../src/orchestra/prompt-god-template.js';
import { evaluateScopeGate, applyScopeResolutions } from '../../src/core/scope-gate.js';
import type { AgentDefinition } from '../../src/core/agent-types.js';
import type { Task } from '../../src/core/task-types.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'prompt-contract-397');

interface Fixture {
  description: string;
  goCriteria: string;
  proofCommands?: string[];
  filesWrite: string[];
  directories: string[];
  trackedFiles: string[];
}
function loadFixture(name: string): Fixture {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf-8')) as Fixture;
}

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
const EMPTY_POOL = new Map<string, AgentDefinition>();

describe('SAN-1 wiring — render keeps tracked root files (397-011/012 failure mode)', () => {
  it('fail-closes wildcard and cross-platform ambiguous legacy scope before scheduling', () => {
    const wildcard = task({ id: 'wild', scope: { directories: [], filesRead: [], filesWrite: ['src/**/*.ts'] } });
    const drive = task({ id: 'drive', scope: { directories: [], filesRead: [], filesWrite: ['C:\\repo\\x.ts'] } });
    const result = evaluatePromptGate({ tasks: [wildcard, drive], agentPool: EMPTY_POOL });
    expect(result.ok).toBe(false);
    expect(result.blockers.map(item => item.message)).toEqual(expect.arrayContaining([
      expect.stringContaining('LEGACY_WILDCARD_REQUIRES_SELECTOR'),
      expect.stringContaining('INVALID_PATH'),
    ]));
    const forced = evaluatePromptGate({
      tasks: [wildcard], agentPool: EMPTY_POOL, acknowledgePromptGate: true,
    });
    expect(forced.ok).toBe(false);
    expect(forced.overrideApplied).toBeUndefined();
  });
  it('buildScopeBlock renders README.md/README-TR.md when they are tracked root files', () => {
    const warnings: string[] = [];
    const block = buildScopeBlock(
      { directories: ['docs/'], filesRead: [], filesWrite: ['README.md', 'README-TR.md', 'docs/reference/agents.md'] },
      warnings,
      false,
      ['README.md', 'README-TR.md', 'docs/reference/agents.md', 'package.json'],
    );
    expect(block).toContain('README.md');
    expect(block).toContain('README-TR.md');
    expect(warnings).toEqual([]);
  });

  it('buildScopeBlock renders .secrets-baseline when tracked (fixture-012 write set)', () => {
    const fx = loadFixture('task-012.json');
    const warnings: string[] = [];
    const block = buildScopeBlock(
      { directories: fx.directories, filesRead: [], filesWrite: fx.filesWrite },
      warnings,
      false,
      fx.trackedFiles,
    );
    expect(block).toContain('.secrets-baseline');
    expect(warnings).toEqual([]);
  });

  it('evaluatePromptGate BLOCKs a root write path the render would silently drop (untracked)', () => {
    const t = task({
      id: 't-drop',
      scope: { directories: [], filesRead: [], filesWrite: ['UNTRACKED-NOTES.md', 'src/core/x.ts'] },
    });
    const res = evaluatePromptGate({
      tasks: [t],
      agentPool: EMPTY_POOL,
      trackedFiles: ['src/core/x.ts', 'README.md'],
    });
    const drops = res.findings.filter(f => f.lint === 'scope-silent-drop');
    expect(drops).toHaveLength(1);
    expect(drops[0]?.level).toBe('block');
    expect(drops[0]?.message).toContain('UNTRACKED-NOTES.md');
    expect(res.ok).toBe(false);
  });

  it('does NOT block the same root path once it is tracked (SAN-1 fix live at the gate)', () => {
    const t = task({
      id: 't-keep',
      scope: { directories: [], filesRead: [], filesWrite: ['UNTRACKED-NOTES.md', 'src/core/x.ts'] },
    });
    const res = evaluatePromptGate({
      tasks: [t],
      agentPool: EMPTY_POOL,
      trackedFiles: ['src/core/x.ts', 'UNTRACKED-NOTES.md'],
    });
    expect(res.findings.filter(f => f.lint === 'scope-silent-drop')).toHaveLength(0);
  });

  it('skips both scope lints entirely without a trackedFiles signal (fail-soft)', () => {
    const t = task({
      id: 't-nosignal',
      scope: { directories: [], filesRead: [], filesWrite: ['UNTRACKED-NOTES.md'] },
    });
    const res = evaluatePromptGate({ tasks: [t], agentPool: EMPTY_POOL });
    expect(res.findings.filter(f => f.lint === 'scope-silent-drop' || f.lint === 'scope-satisfiability'))
      .toHaveLength(0);
  });
});

describe('Scope render — sanitization must never WIDEN declared write authority (2026-08-28 review blocker)', () => {
  const TRACKED = ['package.json', 'src/a.ts'];

  it('refuses the directory grant when every declared write target was sanitized away', () => {
    // Measured before the fix: filesWrite=['package.json'] + directories=['src'] rendered
    // "You may ONLY write to these files: - (… you may write to any file within src)" with
    // NO warning, because Rule 6 (GLOBAL_PROTECTED) drops silently. A request for one file
    // became authority over a whole tree, under an "ONLY" header.
    const warnings: string[] = [];
    const block = buildScopeBlock(
      { directories: ['src'], filesRead: [], filesWrite: ['package.json'] },
      warnings,
      TRACKED,
    );
    expect(block).not.toContain('you may write to any file within');
    expect(block).toContain('every declared write target was rejected');
    expect(warnings.some(w => w.includes('refusing to widen'))).toBe(true);
  });

  it('keeps the legitimate PQ-4 F5 directory fallback when NO write list was declared', () => {
    const warnings: string[] = [];
    const block = buildScopeBlock(
      { directories: ['src'], filesRead: [], filesWrite: [] },
      warnings,
      TRACKED,
    );
    expect(block).toContain('you may write to any file within');
    expect(warnings).toHaveLength(0);
  });

  it('renders the surviving subset when only SOME declared targets are dropped', () => {
    const warnings: string[] = [];
    const block = buildScopeBlock(
      { directories: ['src'], filesRead: [], filesWrite: ['package.json', 'src/a.ts'] },
      warnings,
      TRACKED,
    );
    expect(block).toContain('src/a.ts');
    expect(block).not.toContain('you may write to any file within');
  });
});

describe('SAN-1 membership diff — the five SILENT sanitizer rules now BLOCK (sprint-708 root cause)', () => {
  // Before this fix lintScopeSilentDrop only consumed sanitizeScope's own
  // warnings/rejected arrays. Five rules drop a declared write path with a bare
  // `continue` and report nothing, so the "silent drop" detector was blind to
  // silent drops. Task 708-003 declared `package.json` (Rule 6, GLOBAL_PROTECTED),
  // the render removed it, no BLOCK fired, and the worker was handed a task it
  // could not satisfy — honest NO_GO, burnt FIX budget, paused run.
  const KEEP = 'src/core/keep.ts';
  const TRACKED = [KEEP, 'package.json', 'tsconfig.json', 'config.json', 'package-lock.json'];

  function dropsFor(id: string, filesWrite: string[]) {
    const res = evaluatePromptGate({
      tasks: [task({ id, scope: { directories: [], filesRead: [], filesWrite } })],
      agentPool: EMPTY_POOL,
      trackedFiles: TRACKED,
    });
    // Both codes are the same SAN-1 family: 'scope-silent-drop' is a sanitizer-reported
    // drop, 'scope-silent-drop-unreported' is one found only by the membership diff.
    return { res, drops: res.findings.filter(f => f.lint === 'scope-silent-drop' || f.lint === 'scope-silent-drop-unreported') };
  }

  it.each([
    ['Rule 6 — GLOBAL_PROTECTED package.json (the 708-003 case)', 'package.json'],
    ['Rule 6 — GLOBAL_PROTECTED tsconfig.json', 'tsconfig.json'],
    ['Rule 6 — GLOBAL_PROTECTED lockfile', 'package-lock.json'],
    ['Rule 3 — dist/ prefix', 'dist/core/x.js'],
    ['Rule 4 — extension-only token', '.ts'],
    ['Rule 9 — JS property-access pattern', '.directories'],
    ['Rule 10 — placeholder filename', 'src/foo.ts'],
  ])('BLOCKs a silently dropped write path: %s', (_label, dropped) => {
    const { res, drops } = dropsFor('t-silent', [dropped, KEEP]);
    expect(drops.length).toBeGreaterThanOrEqual(1);
    expect(drops.every(d => d.level === 'block')).toBe(true);
    expect(drops.some(d => d.message.includes(dropped))).toBe(true);
    expect(res.ok).toBe(false);
  });

  it('names the surviving path in NO finding — only the dropped one blocks', () => {
    const { drops } = dropsFor('t-only-dropped', ['package.json', KEEP]);
    expect(drops).toHaveLength(1);
    expect(drops[0]?.message).toContain('package.json');
    expect(drops[0]?.message).not.toContain(KEEP);
  });

  it('stays silent when every declared write path survives sanitization', () => {
    const { res, drops } = dropsFor('t-clean', [KEEP, 'src/core/other.ts']);
    expect(drops).toHaveLength(0);
    expect(res.ok).toBe(true);
  });

  // ─── False-positive guards: the sanitizer's LEGITIMATE normalizations ──────
  it('does NOT block Rule 7 normalization — a trailing "(yeni)" suffix is stripped, not dropped', () => {
    const { drops } = dropsFor('t-rule7', [KEEP + ' (yeni)']);
    expect(drops).toHaveLength(0);
  });

  it('does NOT block Rule 8 dedupe — a case-variant duplicate is collapsed, not dropped', () => {
    const { drops } = dropsFor('t-rule8', [KEEP, KEEP.toUpperCase()]);
    expect(drops).toHaveLength(0);
  });

  it('does NOT double-report a WHITESPACE-PADDED path the sanitizer already warned about', () => {
    // The sanitizer trims before reporting, so a padded declaration is named trimmed in the
    // warning; comparing the raw string double-reported it (2026-08-28 review finding).
    const { drops } = dropsFor('t-padded', ['  UNTRACKED-NOTES.md  ']);
    expect(drops).toHaveLength(1);
  });

  it('does NOT double-report a path the sanitizer already warned about (Rule 5)', () => {
    // 'UNTRACKED-NOTES.md' is an unqualified untracked root file: Rule 5 pushes a
    // warning, so the membership diff must not raise a second finding for it.
    const { drops } = dropsFor('t-nodup', ['UNTRACKED-NOTES.md']);
    expect(drops).toHaveLength(1);
  });

  it('leaves empty/whitespace entries to the pre-existing canonical guard, adding no duplicate', () => {
    // Measured 2026-08-28: an empty or whitespace-only filesWrite entry never
    // reaches the sanitizer's silent path — a canonical scope validator already
    // fail-closes it as CANONICAL_SCOPE_HOLD:INVALID_PATH under this same lint.
    // The membership diff must therefore stay quiet about them rather than
    // raising a second finding for a path that is already blocked.
    const { drops } = dropsFor('t-empty', ['', '   ', KEEP]);
    expect(drops).toHaveLength(2);
    expect(drops.every(d => d.message.includes('CANONICAL_SCOPE_HOLD:INVALID_PATH'))).toBe(true);
    expect(drops.some(d => d.message.includes('silently shrinks'))).toBe(false);
  });
});

describe('G1b wiring — satisfiability findings surface through evaluatePromptGate', () => {
  it('passes task.scope.filesRead into the read-satisfiability gate', () => {
    const t = task({
      id: 't-read-authority',
      description: 'Read src/core/provider-catalog.ts before writing the bounded evidence note.',
      scope: {
        directories: [],
        filesRead: ['src/core/provider-catalog.ts'],
        filesWrite: ['docs/evidence/provider-catalog-note.md'],
      },
    });
    const res = evaluatePromptGate({
      tasks: [t],
      agentPool: EMPTY_POOL,
      trackedFiles: ['src/core/provider-catalog.ts', 'docs/evidence/provider-catalog-note.md'],
    });
    expect(res.findings.filter(f =>
      f.lint === 'scope-satisfiability' && f.message.includes('MENTIONED_NOT_READABLE'),
    )).toEqual([]);
  });

  it('flags a goCriteria-mentioned path missing from the write authority as BLOCK', () => {
    const t = task({
      id: 't-g1b',
      goNogo: {
        goCriteria: 'tests/core/error-handling-unification.test.ts pins the DeckentError type',
        noGoCriteria: 'fails',
        techDebtAcceptable: 'minor',
      },
      scope: { directories: [], filesRead: [], filesWrite: ['src/cli/commands/chat-tool-exec.ts'] },
    });
    const res = evaluatePromptGate({
      tasks: [t],
      agentPool: EMPTY_POOL,
      trackedFiles: ['src/cli/commands/chat-tool-exec.ts', 'tests/core/error-handling-unification.test.ts'],
    });
    const sat = res.findings.filter(f => f.lint === 'scope-satisfiability');
    expect(sat.some(f => f.level === 'block' && f.message.includes('MENTIONED_NOT_WRITABLE'))).toBe(true);
  });

  it('fixture-012 produces its UNCHANGED_IN_WRITE-free, self-consistent verdict end-to-end', () => {
    // The 012 fixture's declared write set is fully tracked and its text mentions no
    // out-of-authority file — the wired gate must stay quiet on it (no false positives
    // from real DIRECTIVES prose, the advisor's precision requirement).
    const fx = loadFixture('task-012.json');
    const t = task({
      id: 't-012',
      description: fx.description,
      goNogo: { goCriteria: fx.goCriteria, noGoCriteria: 'fails', techDebtAcceptable: 'minor' },
      scope: { directories: fx.directories, filesRead: [], filesWrite: fx.filesWrite },
    });
    const res = evaluatePromptGate({ tasks: [t], agentPool: EMPTY_POOL, trackedFiles: fx.trackedFiles });
    expect(res.findings.filter(f => f.lint === 'scope-silent-drop')).toHaveLength(0);
    expect(res.findings.filter(f => f.lint === 'scope-satisfiability' && f.level === 'block')).toHaveLength(0);
  });
});

describe('SAN-2 wiring — resolution adoption repairs the 397 typo modes', () => {
  it('397-007: typo dir auto-replaces to the sole tracked candidate', () => {
    const fx = loadFixture('task-007.json');
    const gate = evaluateScopeGate({
      tasks: [{ id: '397-007', scope: { filesWrite: fx.filesWrite, filesRead: [], directories: fx.directories } }],
      trackedFiles: fx.trackedFiles,
      resolveSuggestions: true,
    });
    expect(gate.ok).toBe(true);
    const resolutions = gate.resolutions ?? [];
    expect(resolutions.some(r => r.action === 'auto-replace' && r.taskId === '397-007')).toBe(true);
    const { filesWrite } = applyScopeResolutions('397-007', fx.filesWrite, resolutions);
    expect(filesWrite).toContain('tests/core/error-handling-unification.test.ts');
    expect(filesWrite).not.toContain('tests/cli/error-handling-unification.test.ts');
  });

  it('397-011: typo-duplicate is dropped, the correct path stays', () => {
    const filesWrite = ['tests/docs/refdocs-adr-regen.test.ts', 'docs/refdocs-adr-regen.test.ts'];
    const gate = evaluateScopeGate({
      tasks: [{ id: '397-011', scope: { filesWrite, filesRead: [], directories: [] } }],
      trackedFiles: ['tests/docs/refdocs-adr-regen.test.ts'],
      resolveSuggestions: true,
    });
    expect(gate.ok).toBe(true);
    const { filesWrite: fixed } = applyScopeResolutions('397-011', filesWrite, gate.resolutions ?? []);
    expect(fixed).toEqual(['tests/docs/refdocs-adr-regen.test.ts']);
  });

  it('cross-task guard: another task sharing the typo path is NOT mutated by a foreign resolution', () => {
    // Advisor-confirmed repro (sprint-399 BEFORE-done): t1 resolves its typo via its own
    // duplicate; t2 carries the same typo but is AMBIGUOUS (2 same-basename candidates) —
    // t2 must keep blocking and applyScopeResolutions must not touch t2's filesWrite.
    const gate = evaluateScopeGate({
      tasks: [
        { id: 't1', scope: { filesWrite: ['src/wrong/dup.ts', 'src/a/dup.ts'], filesRead: [], directories: [] } },
        { id: 't2', scope: { filesWrite: ['src/wrong/dup.ts'], filesRead: [], directories: [] } },
      ],
      trackedFiles: ['src/a/dup.ts', 'src/b/dup.ts'],
      resolveSuggestions: true,
    });
    expect(gate.ok).toBe(false); // t2's ambiguous suspect still blocks
    const resolutions = gate.resolutions ?? [];
    expect(resolutions.every(r => r.taskId === 't1')).toBe(true);
    const { filesWrite: t2Files, applied } = applyScopeResolutions('t2', ['src/wrong/dup.ts'], resolutions);
    expect(applied).toEqual([]);
    expect(t2Files).toEqual(['src/wrong/dup.ts']);
  });

  it('a genuinely ambiguous suspect still blocks even with resolveSuggestions', () => {
    const gate = evaluateScopeGate({
      tasks: [{ id: 't-amb', scope: { filesWrite: ['src/wrong/dup.ts'], filesRead: [], directories: [] } }],
      trackedFiles: ['src/a/dup.ts', 'src/b/dup.ts'],
      resolveSuggestions: true,
    });
    expect(gate.ok).toBe(false);
  });
});
