import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── Mocks ───────────────────────────────────────────────────────────
//
// TERM-FLOW-UNIFY Sprint-6 (428-007): only the CLI-boundary + delegation
// seams are mocked here — buildDirectives/buildPlanNlIntent stay the REAL,
// already-tested modules (same philosophy as plan-nl-cmd.test.ts, which
// covers the flag-off/legacy path in full). This file only exercises the
// NEW compatibility-preview-adapter branch: loadConfig (flag read),
// readContext + generatePlanPreview (the delegated real-plan-preview call).

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

vi.mock('../../src/core/config.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  readContext: vi.fn(),
}));

vi.mock('../../src/orchestra/plan-preview-service.js', () => ({
  generatePlanPreview: vi.fn(),
}));

import { resolveProjectRoot } from '../../src/cli/helpers/process.js';
import { print, printError } from '../../src/cli/helpers/output.js';
import { loadConfig } from '../../src/core/config.js';
import { readContext } from '../../src/orchestra/brain.js';
import { generatePlanPreview } from '../../src/orchestra/plan-preview-service.js';
import { registerPlanNl } from '../../src/cli/commands/plan-nl.js';
import { DIRECTIVES_FILE } from '../../src/core/constants.js';

// ─── Helpers ─────────────────────────────────────────────────────────

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerPlanNl(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride throws on exit
  }
}

function makeConfig(runFlowV2: boolean | undefined): unknown {
  return {
    activeModeConfig: { max_workers: 4 },
    terminal: runFlowV2 === undefined ? undefined : { run_flow_v2: runFlowV2 },
  };
}

const FAKE_CONTEXT = {
  directives: '',
  memory: '',
  retro: '',
  debt: [],
  patterns: '',
  decisions: '',
  existingTasks: [],
  projectState: { gitStatus: '', fileTree: [] },
};

function fakeSprint(): unknown {
  return { id: 'sprint-x', number: 1, tasks: [], reasoning: undefined, planningMode: 'structured' };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('plan-nl compatibility-preview-adapter (terminal.run_flow_v2)', () => {
  let tmpRoot: string;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-plan-nl-adapter-'));
    vi.mocked(resolveProjectRoot).mockReturnValue(tmpRoot);
    vi.mocked(readContext).mockReturnValue(FAKE_CONTEXT as never);
  });

  afterEach(() => {
    process.exitCode = undefined;
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('flag-off (config.terminal undefined): does NOT delegate — output shape is the plain scaffold preview only', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig(undefined) as never);

    await runCommand(['plan-nl', 'ship the widget exporter']);

    expect(generatePlanPreview).not.toHaveBeenCalled();
    const output = vi.mocked(print).mock.calls.map((c) => c[0] as string).join('\n');
    expect(output).toContain('preview only, DIRECTIVES.md was NOT modified');
    expect(output).toContain('ship the widget exporter');
    expect(output).not.toContain('compatibility-preview-adapter');
    expect(process.exitCode).toBeUndefined();
  });

  it('flag-on (dry-run preview): delegates to plan-preview-service with structured mode + scaffold directives, preserving the preview shape', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig(true) as never);
    vi.mocked(generatePlanPreview).mockResolvedValue({
      sprint: fakeSprint(),
      planDigest: 'deadbeef1234',
      taskSummaries: [],
      gateResult: 'skipped',
      policyDecision: 'allow',
    } as never);

    await runCommand(['plan-nl', 'ship the widget exporter']);

    expect(generatePlanPreview).toHaveBeenCalledTimes(1);
    const call = vi.mocked(generatePlanPreview).mock.calls[0]!;
    const [calledRoot, , calledContext, , calledOptions] = call as unknown as [
      string, unknown, { directives: string }, unknown, { mode?: string },
    ];
    expect(calledRoot).toBe(tmpRoot);
    expect(calledContext.directives).toContain('ship the widget exporter');
    expect(calledOptions?.mode).toBe('structured');

    const output = vi.mocked(print).mock.calls.map((c) => c[0] as string).join('\n');
    // Output shape preserved: the same banner + scaffold body still prints in full.
    expect(output).toContain('preview only, DIRECTIVES.md was NOT modified');
    expect(output).toContain('ship the widget exporter');
    // Plus the compatibility-adapter's digest line, proving real delegation occurred.
    expect(output).toContain('compatibility-preview-adapter');
    expect(output).toContain('deadbeef1234');
    expect(process.exitCode).toBeUndefined();
    expect(existsSync(join(tmpRoot, DIRECTIVES_FILE))).toBe(false);
  });

  it('flag-on + --write: the write path is unaffected — no delegation call, DIRECTIVES.md still written with the scaffold text', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig(true) as never);

    await runCommand(['plan-nl', 'ship the widget exporter', '--write']);

    expect(generatePlanPreview).not.toHaveBeenCalled();
    expect(loadConfig).not.toHaveBeenCalled();
    const written = readFileSync(join(tmpRoot, DIRECTIVES_FILE), 'utf-8');
    expect(written).toContain('ship the widget exporter');
  });

  it('flag-on delegation failure: reports via printError, exits 1, never writes DIRECTIVES.md', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeConfig(true) as never);
    vi.mocked(generatePlanPreview).mockRejectedValue(new Error('planner exploded'));

    await runCommand(['plan-nl', 'ship the widget exporter']);

    expect(printError).toHaveBeenCalledWith('planner exploded');
    expect(process.exitCode).toBe(1);
    expect(existsSync(join(tmpRoot, DIRECTIVES_FILE))).toBe(false);
  });
});
