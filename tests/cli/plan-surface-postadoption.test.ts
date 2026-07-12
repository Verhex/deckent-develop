/**
 * task-407-004 PLAN-SURFACE-KALAN (born-629 b,c).
 *
 * (b) `deckent start --dry-run`'s plan table used to print the task's PRE-adoption
 *     `scope.filesWrite` — the real `deckent start` (runSprint → sprint-controller.ts)
 *     runs the pre-spawn scope-gate + SAN-2 suggestion-adoption AFTER planning, so a
 *     typo write path the operator reviewed in the dry-run table could silently differ
 *     from what the worker actually receives at spawn (trust-surface mismatch). Fixed
 *     by `computeDryRunScopePreview()` (src/cli/commands/start.ts), which reuses the
 *     exact same pure evaluateScopeGate/applyScopeResolutions runSprint uses, best-
 *     effort/fail-open, to preview the POST-adoption scope in the table + print an
 *     honest note (never blocks or mutates dry-run).
 *
 * (c) `evaluateScopeGate` (src/core/scope-gate.ts) used to BLOCK every write into a
 *     not-yet-existing directory, even a legitimate new subdirectory of an established
 *     tracked root (the live docs/guides/-style false positive, costing a full
 *     --force-scope round-trip). Fixed by classifying a normal-depth, unsuspicious new
 *     directory under an ESTABLISHED tracked ancestor as `new-plausible` (WARN, non-
 *     blocking) while typo-class paths (out-of-root / suspicious character / too deep /
 *     thin ancestor) keep BLOCKing exactly as before.
 *
 * RED-before-fix evidence (see task-407-004.result notes for the verified transcript):
 * with the born-629c carve-out in src/core/scope-gate.ts temporarily disabled, the
 * "classifies a new subdirectory under an ESTABLISHED tracked root..." test below
 * failed (`ok` was `false`, classification `suspect`) — confirming today's (pre-fix)
 * behavior really does BLOCK a docs/guides-like path before the fix landed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ═══ Mocks (mirrors tests/cli/start-gate-exit.test.ts) ═══════════════════

vi.mock('../../src/core/config.js', () => ({
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn(),
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  runSprint: vi.fn(),
  readContext: vi.fn(),
  planSprint: vi.fn(),
  BrainError: class BrainError extends Error {
    phase?: string;
    constructor(message: string, phase?: string) {
      super(message);
      this.name = 'BrainError';
      this.phase = phase;
    }
  },
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  isSessionActive: vi.fn().mockReturnValue(false),
  setupWatchWindow: vi.fn(),
}));

vi.mock('../../src/core/constants.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/constants.js')>();
  return { ...actual, TMUX_SESSION_NAME: 'deckent' };
});

vi.mock('../../src/core/provider.js', () => ({
  bootstrapProviders: vi.fn().mockResolvedValue({ registered: [], skipped: [], defaultProvider: null }),
}));

vi.mock('../../src/cli/commands/doctor.js', () => ({
  runDoctorChecks: vi.fn().mockReturnValue({ checks: [] }),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatSprintSummary: vi.fn().mockReturnValue('Sprint summary'),
  formatTable: vi.fn().mockReturnValue('Task table'),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../src/cli/commands/quick-start.js', () => ({
  prepareZeroConfig: vi.fn(),
  cleanupZeroConfig: vi.fn(),
}));

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return { ...actual, spawnSync: vi.fn() };
});

import { loadConfig } from '../../src/core/config.js';
import { runSprint, readContext, planSprint } from '../../src/orchestra/brain.js';
import { print, formatTable } from '../../src/cli/helpers/output.js';
import { registerStart, computeDryRunScopePreview } from '../../src/cli/commands/start.js';
import { evaluateScopeGate, type ScopeGateTask } from '../../src/core/scope-gate.js';
import { spawnSync } from 'node:child_process';

// ═══ Helpers ═══════════════════════════════════════════════════════════

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    activeModeConfig: { brain_model: 'opus', max_workers: 3 },
    brain_planning: 'auto',
    language: 'en',
    ...overrides,
  };
}

function gitLsFilesOk(files: string[]) {
  return { status: 0, stdout: files.join('\n') + '\n', stderr: '', pid: 1, output: [], signal: null } as any;
}

function gitLsFilesFail() {
  return { status: 1, stdout: '', stderr: 'fatal: not a git repository', pid: 1, output: [], signal: null } as any;
}

function makeSprint(taskOverrides: Record<string, unknown> = {}) {
  return {
    id: 'sprint-777',
    number: 7,
    tasks: [
      {
        id: '777-001',
        title: 'Fix error handling',
        model: 'sonnet',
        priority: 'NORMAL',
        scope: { directories: [], filesRead: [], filesWrite: ['tests/cli/error-handling-unification.test.ts'] },
        ...taskOverrides,
      },
    ],
    reasoning: 'test reasoning',
    planningMode: 'structured',
  };
}

async function runStart(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerStart(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride throws instead of process.exit — expected in tests.
  }
}

// ═══ (b) CLI: --dry-run plan table shows POST-adoption scope ═════════════

describe('deckent start --dry-run — POST-adoption scope preview (born-629b / 407-004)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.mocked(loadConfig).mockResolvedValue(makeConfig() as any);
    vi.mocked(readContext).mockReturnValue({ memory: '', retro: '', debt: '', patterns: [] } as any);
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('renders a Scope (write) column carrying the POST-adoption path, not the pre-adoption typo', async () => {
    vi.mocked(planSprint).mockReturnValue(makeSprint() as any);
    // The task planned a typo'd path; the ONLY real tracked file with that basename
    // lives elsewhere — SAN-2 auto-replace resolves it unambiguously.
    vi.mocked(spawnSync).mockReturnValue(
      gitLsFilesOk(['tests/core/error-handling-unification.test.ts', 'package.json']),
    );

    await runStart(['start', '--dry-run']);

    expect(formatTable).toHaveBeenCalledWith(
      expect.arrayContaining(['Scope (write)']),
      expect.arrayContaining([expect.arrayContaining(['tests/core/error-handling-unification.test.ts'])]),
    );
    const [, rows] = vi.mocked(formatTable).mock.calls[0]!;
    expect((rows as string[][]).flat()).not.toContain('tests/cli/error-handling-unification.test.ts');
  });

  it('prints an honest post-adoption note after the table', async () => {
    vi.mocked(planSprint).mockReturnValue(makeSprint() as any);
    vi.mocked(spawnSync).mockReturnValue(gitLsFilesOk(['tests/core/error-handling-unification.test.ts']));

    await runStart(['start', '--dry-run']);

    expect(print).toHaveBeenCalledWith(expect.stringMatching(/adoption/i));
  });

  it('falls back to PRE-adoption scope + a "final scope lives in task-JSON" note when git ls-files fails', async () => {
    vi.mocked(planSprint).mockReturnValue(makeSprint() as any);
    vi.mocked(spawnSync).mockReturnValue(gitLsFilesFail());

    await runStart(['start', '--dry-run']);

    const [, rows] = vi.mocked(formatTable).mock.calls[0]!;
    expect((rows as string[][]).flat()).toContain('tests/cli/error-handling-unification.test.ts');
    expect(print).toHaveBeenCalledWith(expect.stringContaining('task-JSON'));
  });

  it('warns the run would BLOCK (instead of inventing an adopted scope) when the write path is an unresolved suspect', async () => {
    vi.mocked(planSprint).mockReturnValue(makeSprint({
      scope: { directories: [], filesRead: [], filesWrite: ['src/invented/nowhere.ts'] },
    }) as any);
    vi.mocked(spawnSync).mockReturnValue(gitLsFilesOk(['src/core/config.ts', 'package.json']));

    await runStart(['start', '--dry-run']);

    expect(print).toHaveBeenCalledWith(expect.stringContaining('BLOCK'));
    const [, rows] = vi.mocked(formatTable).mock.calls[0]!;
    expect((rows as string[][]).flat()).toContain('src/invented/nowhere.ts');
  });
});

// ═══ (b) unit: computeDryRunScopePreview ══════════════════════════════════

describe('computeDryRunScopePreview (unit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies the SAN-2 auto-replace resolution to the previewed scope', () => {
    vi.mocked(spawnSync).mockReturnValue(gitLsFilesOk(['tests/core/error-handling-unification.test.ts']));

    const preview = computeDryRunScopePreview('/mock/root', [
      { id: 't1', scope: { filesWrite: ['tests/cli/error-handling-unification.test.ts'], filesRead: [], directories: [] } },
    ], false);

    expect(preview.validated).toBe(true);
    expect(preview.blockedMessage).toBeUndefined();
    expect(preview.scopeByTask.get('t1')).toEqual(['tests/core/error-handling-unification.test.ts']);
  });

  it('fails open to the pre-adoption scope when git ls-files throws', () => {
    vi.mocked(spawnSync).mockImplementation(() => { throw new Error('boom'); });

    const preview = computeDryRunScopePreview('/mock/root', [
      { id: 't1', scope: { filesWrite: ['docs/x.md'], filesRead: [], directories: [] } },
    ], false);

    expect(preview.validated).toBe(false);
    expect(preview.scopeByTask.get('t1')).toEqual(['docs/x.md']);
  });

  it('returns the block message + pre-adoption scope (no fictitious adoption) when the gate would BLOCK', () => {
    vi.mocked(spawnSync).mockReturnValue(gitLsFilesOk(['src/core/config.ts', 'package.json']));

    const preview = computeDryRunScopePreview('/mock/root', [
      { id: 't1', scope: { filesWrite: ['src/invented/nowhere.ts'], filesRead: [], directories: [] } },
    ], false);

    expect(preview.validated).toBe(true);
    expect(preview.blockedMessage).toBeTruthy();
    expect(preview.scopeByTask.get('t1')).toEqual(['src/invented/nowhere.ts']);
  });

  it('never calls runSprint — preview-only, no spawn', () => {
    vi.mocked(spawnSync).mockReturnValue(gitLsFilesOk(['package.json']));
    computeDryRunScopePreview('/mock/root', [
      { id: 't1', scope: { filesWrite: ['docs/x.md'], filesRead: [], directories: [] } },
    ], false);
    expect(runSprint).not.toHaveBeenCalled();
  });
});

// ═══ (c) evaluateScopeGate — intentional-new-directory vs typo (born-629c) ═

describe('evaluateScopeGate — intentional-new-directory vs typo classification (born-629c / 407-004)', () => {
  // An ESTABLISHED tracked root: 20 real files under docs/ (well above
  // MIN_ESTABLISHED_ROOT_FILES) — none of them under docs/guides/, so that
  // subdirectory itself is genuinely untracked, mirroring the live
  // docs/guides/-style false positive (a *new* docs subdirectory, not the one
  // that happens to already be tracked in this actual repo).
  const ESTABLISHED_DOCS_TRACKED = [
    'docs/guide/getting-started.md',
    'docs/guide/installation.md',
    'docs/guide/faq.md',
    'docs/guide/architecture-overview.md',
    'docs/guide/troubleshooting.md',
    'docs/guide/quickstart.md',
    'docs/reference/api-surface.md',
    'docs/reference/mcp-guide.md',
    'docs/reference/migration-guide.md',
    'docs/development/worker-guide.md',
    'docs/development/brain-guide.md',
    'docs/development/agent-guide.md',
    'docs/development/dashboard-guide.md',
    'docs/development/plugin-guide.md',
    'docs/audits/doc-refresh-2026-06/A01-guide-onboarding-core.md',
    'docs/audits/doc-refresh-2026-06/A02-guide-concepts.md',
    'docs/audits/doc-refresh-2026-06/A03-guide-autonomous.md',
    'docs/analysis/2026-05-22-guide-docs-audit.md',
    'docs/worker-guide.md',
    'docs/README.md',
    'package.json',
  ];

  function task(id: string, filesWrite: string[]): ScopeGateTask {
    return { id, scope: { filesWrite, filesRead: [] } };
  }

  it('direction 1 — a new subdirectory under an ESTABLISHED tracked root is new-plausible (WARN, not BLOCK)', () => {
    const res = evaluateScopeGate({
      tasks: [task('t1', ['docs/guides/publish-checklist.md'])],
      trackedFiles: ESTABLISHED_DOCS_TRACKED,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const v = res.verdicts.find(x => x.path === 'docs/guides/publish-checklist.md')!;
    expect(v.classification).toBe('new-plausible');
    expect(v.reason).toMatch(/intentional/i);
    expect(res.advisories).toContainEqual(v);
  });

  it('direction 2a (typo-class) — a path that escapes the repo root still BLOCKs, even under an established root', () => {
    const res = evaluateScopeGate({
      tasks: [task('t1', ['../etc/evil.md'])],
      trackedFiles: ESTABLISHED_DOCS_TRACKED,
    });
    expect(res.ok).toBe(false);
  });

  it('direction 2b (typo-class) — a suspicious character in the path still BLOCKs, even under an established root', () => {
    const res = evaluateScopeGate({
      tasks: [task('t1', ['docs/guides/bad|name.md'])],
      trackedFiles: ESTABLISHED_DOCS_TRACKED,
    });
    expect(res.ok).toBe(false);
  });

  it('direction 2c (typo-class) — too many new directory levels still BLOCKs, even under an established root', () => {
    const res = evaluateScopeGate({
      tasks: [task('t1', ['docs/a/b/c/deep.md'])],
      trackedFiles: ESTABLISHED_DOCS_TRACKED,
    });
    expect(res.ok).toBe(false);
  });

  it('direction 2d (typo-class) — a new subdirectory under a THIN (barely-tracked) root still BLOCKs (regression guard)', () => {
    // Deliberately mirrors tests/core/scope-gate.test.ts's TRACKED fixture (9 files
    // under src/, well under MIN_ESTABLISHED_ROOT_FILES) so this file independently
    // pins that the born-629c carve-out does NOT silently free every new directory —
    // only ones under an established root.
    const THIN_SRC_TRACKED = [
      'src/agents/worker.ts',
      'src/agents/adaptive-agent.ts',
      'src/core/provider.ts',
      'src/core/config.ts',
      'src/core/routing-engine.ts',
      'src/orchestra/sprint-controller.ts',
      'src/orchestra/task-builder.ts',
      'src/foo/index.ts',
      'src/bar/index.ts',
    ];
    const res = evaluateScopeGate({
      tasks: [task('t1', ['src/nonexistent-dir/brand-new-thing.ts'])],
      trackedFiles: THIN_SRC_TRACKED,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.suspects[0]!.reason).toContain('is not in the repo');
  });

  it('a fully invented top-level tree (no tracked ancestor at all) still BLOCKs', () => {
    const res = evaluateScopeGate({
      tasks: [task('t1', ['totally-new-toplevel/nested/thing.ts'])],
      trackedFiles: ESTABLISHED_DOCS_TRACKED,
    });
    expect(res.ok).toBe(false);
  });
});
