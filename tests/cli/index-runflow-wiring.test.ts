// ═══ index-runflow-wiring — T6E cli/index route-wiring tests (TERM-6, 428-008) ═
//
// docs/analysis/term-flow-unify-design-2026-07-11.md Sprint-6 row: cli/index.ts
// is the composition point where do.ts (T6C, 428-006) and plan-nl.ts (T6D,
// 428-007) get wired into the full CLI program. The RunFlow-vs-legacy routing
// decision (config.terminal.run_flow_v2) lives entirely inside registerDo's/
// registerPlanNl's own action handlers — already covered in full by
// tests/cli/do-runflow-adapter.test.ts and tests/cli/plan-nl-adapter.test.ts
// (isolated `new Command()` instances) and tests/cli/do-cmd.test.ts /
// tests/cli/plan-nl-cmd.test.ts (flag-off legacy coverage). This file's job is
// narrower and index-specific: (1) the registration/import wiring itself
// (mirrors tests/cli/flow-wire.test.ts's established source-scan pattern),
// (2) that composing `do`/`plan-nl` into the FULL ~70-command program via
// buildProgram() introduces no new command (nogo: "yeni komut doğarsa NO_GO")
// and leaves their options/descriptions unchanged (help-text consistency),
// and (3) a flag-off composition smoke proving the legacy path still fires
// correctly once composed with every other registered command, not just in
// isolation.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Command } from 'commander';

const INDEX_FILE = 'src/cli/index.ts';
const indexContent = readFileSync(INDEX_FILE, 'utf-8');

// ─── Source-scan: registration wiring present (mirrors flow-wire.test.ts) ──

describe('T6E — do/plan-nl index-registration wiring (source scan)', () => {
  it('registerDo is imported in index.ts', () => {
    expect(indexContent).toMatch(/import\s*\{[^}]*registerDo[^}]*\}\s*from/);
  });

  it('registerPlanNl is imported in index.ts', () => {
    expect(indexContent).toMatch(/import\s*\{[^}]*registerPlanNl[^}]*\}\s*from/);
  });

  it('registerDo is called with program (and nothing else) in index.ts', () => {
    expect(indexContent).toMatch(/registerDo\s*\(\s*program\s*\)/);
  });

  it('registerPlanNl is called with program in index.ts', () => {
    expect(indexContent).toMatch(/registerPlanNl\s*\(\s*program\s*\)/);
  });

  it('index.ts does not define its own "do"/"plan-nl" action handler (no shadow implementation)', () => {
    expect(indexContent).not.toMatch(/\.command\(\s*['"]do\b/);
    expect(indexContent).not.toMatch(/\.command\(\s*['"]plan-nl\b/);
  });
});

// ─── buildProgram() composition (disk truth, full program) ─────────────────

describe('T6E — buildProgram() composition (disk truth, full ~70-command program)', () => {
  let program: Command;

  beforeEach(async () => {
    const mod = await import('../../src/cli/index.js');
    program = mod.buildProgram();
  });

  it('registers exactly one "do" command', () => {
    const matches = program.commands.filter((c) => c.name() === 'do');
    expect(matches).toHaveLength(1);
  });

  it('registers exactly one "plan-nl" command', () => {
    const matches = program.commands.filter((c) => c.name() === 'plan-nl');
    expect(matches).toHaveLength(1);
  });

  it('nogo guard: no separate RunFlow-specific command variant was introduced', () => {
    const names = program.commands.map((c) => c.name());
    const forbidden = ['propose-run', 'do-runflow', 'do-v2', 'plan-nl-v2', 'plan-nl-runflow', 'run-flow', 'runflow'];
    for (const name of forbidden) {
      expect(names).not.toContain(name);
    }
  });

  it('"do" keeps exactly its pre-existing options — --run and --yes, no new flag', () => {
    const cmd = program.commands.find((c) => c.name() === 'do')!;
    expect(cmd.options.map((o) => o.long).sort()).toEqual(['--run', '--yes'].sort());
  });

  it('"plan-nl" keeps exactly its pre-existing options — --write, no new flag', () => {
    const cmd = program.commands.find((c) => c.name() === 'plan-nl')!;
    expect(cmd.options.map((o) => o.long)).toEqual(['--write']);
  });

  it('help-text consistency pin: "do" description text is unchanged', () => {
    const cmd = program.commands.find((c) => c.name() === 'do')!;
    expect(cmd.description()).toBe(
      'Golden-flow: turn a goal into a sprint plan (dry-run preview by default; --run to actually start it)',
    );
  });

  it('help-text consistency pin: "plan-nl" description text is unchanged', () => {
    const cmd = program.commands.find((c) => c.name() === 'plan-nl')!;
    expect(cmd.description()).toBe(
      'Turn a free-form goal into a DIRECTIVES.md scaffold (single-task template; preview by default)',
    );
  });

  it('help-text consistency pin: "do" --yes option text still documents the RunFlow flag (terminal.run_flow_v2)', () => {
    const cmd = program.commands.find((c) => c.name() === 'do')!;
    const yesOpt = cmd.options.find((o) => o.long === '--yes')!;
    expect(yesOpt.description).toContain('terminal.run_flow_v2');
  });
});

// ─── Flag-off composition smoke: full buildProgram() program, not isolated ─

// Partial mock: buildProgram() transitively pulls in every registered
// command module (e.g. registerNervous -> nervous/bootstrap.ts), several of
// which read OTHER config.js exports (constants, etc.) at import time — a
// full module replacement breaks those. Only loadConfig is overridden.
vi.mock('../../src/core/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/config.js')>();
  return { ...actual, loadConfig: vi.fn() };
});

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn(),
}));

vi.mock('../../src/cli/helpers/config-reader.js', () => ({
  getLangFromConfig: vi.fn().mockReturnValue('en'),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

import { loadConfig } from '../../src/core/config.js';
import { resolveProjectRoot } from '../../src/cli/helpers/process.js';
import { print, printError } from '../../src/cli/helpers/output.js';

const mockLoadConfig = vi.mocked(loadConfig);
const mockResolveProjectRoot = vi.mocked(resolveProjectRoot);

function printed(): string {
  return vi.mocked(print).mock.calls.map((c) => c[0] as string).join('\n');
}

function flagOffConfig(): unknown {
  return {
    mode: 'max_plan',
    activeModeConfig: { max_workers: 4, brain_model: 'opus', default_model: 'sonnet', haiku_allowed: true, brain_planning: 'auto' },
    language: 'en',
    projectName: 'test',
    projectRoot: '/mock/root',
    version: '1.0.0',
    auto_docs: { tier1: true, tier2: true, tier3: false },
    // no `terminal` block at all — the exact flag-off shape do-cmd.test.ts / plan-nl-cmd.test.ts use.
  };
}

describe('T6E — flag-off composition smoke (full program, terminal.run_flow_v2 unset)', () => {
  let tmpRoot: string;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-index-runflow-wiring-'));
    mockResolveProjectRoot.mockReturnValue(tmpRoot);
  });

  afterEach(() => {
    process.exitCode = undefined;
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('`deckent do <goal>` (dry-run) through the FULL program prints the legacy golden-flow preview — no RunFlow markers', async () => {
    mockLoadConfig.mockResolvedValue(flagOffConfig() as never);
    const mod = await import('../../src/cli/index.js');
    const program = mod.buildProgram();
    program.exitOverride();

    try {
      await program.parseAsync(['node', 'test', 'do', 'ship the widget exporter']);
    } catch {
      // commander exitOverride throws on exit — not expected here, but tolerate.
    }

    const out = printed();
    expect(out).toContain('Deckent Do — plan preview (dry-run;');
    expect(out).toContain('Dry-run complete');
    expect(out).not.toContain('RunFlow');
    expect(out).not.toContain('GATE:');
    expect(printError).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('`deckent plan-nl <goal>` through the FULL program prints the legacy scaffold-only preview — no compatibility-adapter marker', async () => {
    mockLoadConfig.mockResolvedValue(flagOffConfig() as never);
    const mod = await import('../../src/cli/index.js');
    const program = mod.buildProgram();
    program.exitOverride();

    try {
      await program.parseAsync(['node', 'test', 'plan-nl', 'ship the widget exporter']);
    } catch {
      // commander exitOverride throws on exit — not expected here, but tolerate.
    }

    const out = printed();
    expect(out).toContain('preview only, DIRECTIVES.md was NOT modified');
    expect(out).toContain('ship the widget exporter');
    expect(out).not.toContain('compatibility-preview-adapter');
    expect(printError).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });
});
