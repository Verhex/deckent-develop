import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── Mocks ───────────────────────────────────────────────────────────
//
// Only the CLI-boundary helpers are mocked (resolveProjectRoot → real tmpdir;
// print/printError → spyable), matching plan-nl-cmd.test.ts's convention.
// `confirm`/`spawnStart` are the real-world-effectful golden-flow seams — they
// are injected directly via `registerDo(program, deps)` (no vi.mock needed),
// so this suite never spawns a real subprocess and never blocks on real
// stdin. golden-flow.ts itself is the REAL, already-tested module — this file
// never touches or duplicates its logic (nogo: "golden-flow'u değiştirmek").

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn(),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

import { resolveProjectRoot } from '../../src/cli/helpers/process.js';
import { print, printError } from '../../src/cli/helpers/output.js';
import {
  registerDo,
  createDoSeams,
  formatDoPlanPreview,
  type DoSeamDeps,
} from '../../src/cli/commands/do.js';
import { buildPlanPreview } from '../../src/orchestra/golden-flow.js';
import { buildPlanNlIntent } from '../../src/cli/commands/plan-nl.js';
import { DIRECTIVES_FILE } from '../../src/core/constants.js';

// ─── Helpers ─────────────────────────────────────────────────────────

async function runCommand(args: string[], deps: DoSeamDeps = {}): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerDo(program, deps);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride throws on exit
  }
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('do command (isolated, real tmpdir fs)', () => {
  let tmpRoot: string;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-do-cmd-'));
    vi.mocked(resolveProjectRoot).mockReturnValue(tmpRoot);
  });

  afterEach(() => {
    process.exitCode = undefined;
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('registers a `do` command with a required <goal> arg and a --run option', () => {
    const program = new Command();
    registerDo(program);
    const cmd = program.commands.find((c) => c.name() === 'do');
    expect(cmd).toBeDefined();
    expect(cmd!.options.map((o) => o.long)).toContain('--run');
    expect(cmd!.registeredArguments).toHaveLength(1);
    expect(cmd!.registeredArguments[0]!.required).toBe(true);
  });

  it('rejects an empty/whitespace-only goal without invoking any seam', async () => {
    const confirm = vi.fn();
    const spawnStart = vi.fn();
    await runCommand(['do', '   '], { confirm, spawnStart });

    expect(printError).toHaveBeenCalledWith('do: goal must not be empty');
    expect(process.exitCode).toBe(1);
    expect(confirm).not.toHaveBeenCalled();
    expect(spawnStart).not.toHaveBeenCalled();
  });

  describe('dry-run (default) — deterministic preview, never starts', () => {
    it('prints a deterministic plan preview and never calls confirm/spawnStart', async () => {
      const confirm = vi.fn().mockResolvedValue(true);
      const spawnStart = vi.fn().mockResolvedValue({ exitCode: 0 });

      await runCommand(['do', 'ship the widget exporter'], { confirm, spawnStart });

      const output = vi.mocked(print).mock.calls.map((c) => c[0] as string).join('\n');
      expect(output).toContain('dry-run');
      expect(output).toContain('ship the widget exporter');
      expect(output).toContain('Re-run with --run to execute');
      expect(output).toContain('Dry-run complete');

      expect(confirm).not.toHaveBeenCalled();
      expect(spawnStart).not.toHaveBeenCalled();
      expect(process.exitCode).toBeUndefined();
      // DIRECTIVES.md is never touched in dry-run mode
      expect(existsSync(join(tmpRoot, DIRECTIVES_FILE))).toBe(false);
    });

    it('produces byte-identical preview output for the same goal (no clock/random/IO)', async () => {
      const intent = buildPlanNlIntent('same goal twice');
      const preview = buildPlanPreview(intent);
      expect(formatDoPlanPreview(preview, false)).toBe(formatDoPlanPreview(preview, false));
    });
  });

  describe('--run — seam-chain exercised with unit-fakes only', () => {
    it('confirms then spawns start, swapping DIRECTIVES.md to the approved preview and restoring it after', async () => {
      let directivesDuringSpawn: string | null = null;
      const confirm = vi.fn().mockResolvedValue(true);
      const spawnStart = vi.fn().mockImplementation(async (root: string) => {
        directivesDuringSpawn = readFileSync(join(root, DIRECTIVES_FILE), 'utf-8');
        return { exitCode: 0 };
      });

      await runCommand(['do', 'wire the export button', '--run'], { confirm, spawnStart });

      expect(confirm).toHaveBeenCalledWith('Proceed and start this sprint now?');
      expect(spawnStart).toHaveBeenCalledWith(tmpRoot);
      expect(directivesDuringSpawn).toContain('wire the export button');

      // restored to "did not exist before" after the spawned sprint exits
      expect(existsSync(join(tmpRoot, DIRECTIVES_FILE))).toBe(false);

      const output = vi.mocked(print).mock.calls.map((c) => c[0] as string).join('\n');
      expect(output).toContain('Confirm below to start the sprint now');
      expect(output).toContain('Sprint finished — exitCode 0 (success)');
      expect(process.exitCode).toBeUndefined();
    });

    it('restores a pre-existing DIRECTIVES.md after the spawned sprint exits', async () => {
      const directivesPath = join(tmpRoot, DIRECTIVES_FILE);
      writeFileSync(directivesPath, '# DIRECTIVES — pre-existing\n', 'utf-8');

      const confirm = vi.fn().mockResolvedValue(true);
      const spawnStart = vi.fn().mockResolvedValue({ exitCode: 0 });

      await runCommand(['do', 'replace nothing permanently', '--run'], { confirm, spawnStart });

      expect(readFileSync(directivesPath, 'utf-8')).toBe('# DIRECTIVES — pre-existing\n');
    });

    it('cancels cleanly and never spawns when the user declines the approve-seam', async () => {
      const confirm = vi.fn().mockResolvedValue(false);
      const spawnStart = vi.fn();

      await runCommand(['do', 'a goal the user rejects', '--run'], { confirm, spawnStart });

      expect(confirm).toHaveBeenCalled();
      expect(spawnStart).not.toHaveBeenCalled();
      const output = vi.mocked(print).mock.calls.map((c) => c[0] as string).join('\n');
      expect(output).toContain('Cancelled at stage "approve"');
      expect(existsSync(join(tmpRoot, DIRECTIVES_FILE))).toBe(false);
      expect(process.exitCode).toBeUndefined();
    });

    it('sets a non-zero exit code when the spawned sprint fails', async () => {
      const confirm = vi.fn().mockResolvedValue(true);
      const spawnStart = vi.fn().mockResolvedValue({ exitCode: 1 });

      await runCommand(['do', 'a goal whose sprint fails', '--run'], { confirm, spawnStart });

      const output = vi.mocked(print).mock.calls.map((c) => c[0] as string).join('\n');
      expect(output).toContain('Sprint finished — exitCode 1 (failure)');
      expect(process.exitCode).toBe(1);
    });

    it('restores DIRECTIVES.md even when spawnStart throws', async () => {
      const confirm = vi.fn().mockResolvedValue(true);
      const spawnStart = vi.fn().mockRejectedValue(new Error('boom'));

      await runCommand(['do', 'a goal whose spawn explodes', '--run'], { confirm, spawnStart });

      expect(printError).toHaveBeenCalledWith('boom');
      expect(process.exitCode).toBe(1);
      expect(existsSync(join(tmpRoot, DIRECTIVES_FILE))).toBe(false);
    });
  });
});

// ─── Pure helpers ────────────────────────────────────────────────────

describe('formatDoPlanPreview', () => {
  it('lists every task with files/scope/goCriteria and includes the full directives markdown', () => {
    const intent = buildPlanNlIntent('add dark mode toggle');
    const preview = buildPlanPreview(intent);
    const text = formatDoPlanPreview(preview, false);

    expect(text).toContain('1. add dark mode toggle');
    expect(text).toContain('files:');
    expect(text).toContain('scope:');
    expect(text).toContain('goCriteria:');
    expect(text).toContain(preview.directivesMarkdown);
  });

  it('renders a --run-specific banner when run=true', () => {
    const intent = buildPlanNlIntent('goal');
    const preview = buildPlanPreview(intent);
    expect(formatDoPlanPreview(preview, true)).toContain('Confirm below to start the sprint now');
    expect(formatDoPlanPreview(preview, false)).toContain('Nothing was started');
  });
});

describe('createDoSeams', () => {
  it('wires deriveIntent to buildPlanNlIntent (no LLM call, deterministic)', async () => {
    const seams = createDoSeams('/tmp/does-not-matter', { run: false });
    const intent = await seams.deriveIntent('a goal');
    expect(intent).toEqual(buildPlanNlIntent('a goal'));
  });
});
