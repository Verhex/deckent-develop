import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── Mocks ───────────────────────────────────────────────────────────
//
// Only the CLI-boundary helpers are mocked (resolveProjectRoot → points at a
// real tmpdir so writeFileSync/copyFileSync exercise real fs behavior;
// getLangFromConfig/print/printError → deterministic + spyable). buildDirectives
// and parseStructuredDirectives are the REAL, already-tested modules — this
// file never touches or duplicates their logic (nogo: "builder'ı değiştirmek").

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

import { resolveProjectRoot } from '../../src/cli/helpers/process.js';
import { print, printError } from '../../src/cli/helpers/output.js';
import {
  registerPlanNl,
  buildPlanNlIntent,
  formatPlanNlPreview,
} from '../../src/cli/commands/plan-nl.js';
import { buildDirectives } from '../../src/orchestra/directives-builder.js';
import { parseStructuredDirectives } from '../../src/orchestra/task-builder.js';
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

// ─── Tests ───────────────────────────────────────────────────────────

describe('plan-nl command (isolated, real tmpdir fs)', () => {
  let tmpRoot: string;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-plan-nl-'));
    vi.mocked(resolveProjectRoot).mockReturnValue(tmpRoot);
  });

  afterEach(() => {
    process.exitCode = undefined;
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('registers a plan-nl command with a required <goal> arg and --write option', () => {
    const program = new Command();
    registerPlanNl(program);
    const cmd = program.commands.find((c) => c.name() === 'plan-nl');
    expect(cmd).toBeDefined();
    expect(cmd!.options.map((o) => o.long)).toContain('--write');
    expect(cmd!.registeredArguments).toHaveLength(1);
    expect(cmd!.registeredArguments[0]!.required).toBe(true);
  });

  it('dry-run (default): prints a preview and does NOT write DIRECTIVES.md', async () => {
    await runCommand(['plan-nl', 'ship the widget exporter']);

    expect(existsSync(join(tmpRoot, DIRECTIVES_FILE))).toBe(false);
    const output = vi.mocked(print).mock.calls.map((c) => c[0] as string).join('\n');
    expect(output).toContain('preview only, DIRECTIVES.md was NOT modified');
    expect(output).toContain('ship the widget exporter');
    expect(process.exitCode).toBeUndefined();
  });

  it('--write creates DIRECTIVES.md with no backup message when none existed yet', async () => {
    await runCommand(['plan-nl', 'ship the widget exporter', '--write']);

    const written = readFileSync(join(tmpRoot, DIRECTIVES_FILE), 'utf-8');
    expect(written).toContain('ship the widget exporter');
    const output = vi.mocked(print).mock.calls.map((c) => c[0] as string).join('\n');
    expect(output).not.toContain('Backed up');
    expect(output).toContain('DIRECTIVES.md updated');
    expect(process.exitCode).toBeUndefined();
  });

  it('--write backs up an existing DIRECTIVES.md before overwriting (never overwrites without a backup)', async () => {
    const directivesPath = join(tmpRoot, DIRECTIVES_FILE);
    writeFileSync(
      directivesPath,
      '# DIRECTIVES — old sprint\n\n## Task 1: legacy task\n- Files: a.ts\n### Description\nold\n',
      'utf-8',
    );

    await runCommand(['plan-nl', 'new goal replaces the old one', '--write']);

    const written = readFileSync(directivesPath, 'utf-8');
    expect(written).toContain('new goal replaces the old one');
    expect(written).not.toContain('legacy task');

    const backups = readdirSync(tmpRoot).filter((f) => f.startsWith(`${DIRECTIVES_FILE}.bak.`));
    expect(backups).toHaveLength(1);
    expect(readFileSync(join(tmpRoot, backups[0]!), 'utf-8')).toContain('legacy task');

    const output = vi.mocked(print).mock.calls.map((c) => c[0] as string).join('\n');
    expect(output).toContain('Backed up existing DIRECTIVES.md');
  });

  it('rejects an empty/whitespace-only goal without touching the filesystem', async () => {
    await runCommand(['plan-nl', '   ', '--write']);

    expect(printError).toHaveBeenCalledWith('plan-nl: goal must not be empty');
    expect(process.exitCode).toBe(1);
    expect(existsSync(join(tmpRoot, DIRECTIVES_FILE))).toBe(false);
  });

  it('surfaces a directives-builder fragility-guard error via printError instead of crashing', async () => {
    await runCommand(['plan-nl', 'legit goal\n## Task 2: hijack']);

    expect(printError).toHaveBeenCalledWith(expect.stringContaining('heading'));
    expect(process.exitCode).toBe(1);
    expect(existsSync(join(tmpRoot, DIRECTIVES_FILE))).toBe(false);
  });
});

// ─── Pure helpers ────────────────────────────────────────────────────

describe('buildPlanNlIntent', () => {
  it('maps a trimmed goal to a single-task intent, verbatim as title/desc/goal', () => {
    const intent = buildPlanNlIntent('  add dark mode toggle  ');

    expect(intent.goal).toBe('add dark mode toggle');
    expect(intent.tasks).toHaveLength(1);
    expect(intent.tasks[0]!.title).toBe('add dark mode toggle');
    expect(intent.tasks[0]!.desc).toContain('add dark mode toggle');
    expect(intent.tasks[0]!.files.length).toBeGreaterThan(0);
    expect(intent.tasks[0]!.scope.length).toBeGreaterThan(0);
    expect(intent.tasks[0]!.goCriteria.length).toBeGreaterThan(0);
    expect(intent.tasks[0]!.nogo.length).toBeGreaterThan(0);
    expect(intent.tasks[0]!.deps).toEqual([]);
  });
});

describe('formatPlanNlPreview', () => {
  it('prefixes the directives text with an explicit dry-run banner', () => {
    const text = formatPlanNlPreview('# DIRECTIVES — x\n');
    expect(text).toContain('preview only, DIRECTIVES.md was NOT modified');
    expect(text).toContain('# DIRECTIVES — x');
  });
});

// ─── Round-trip through the UNCHANGED directives-builder + parser ─────

describe('plan-nl scaffold round-trips through buildDirectives + parseStructuredDirectives', () => {
  it('produces exactly one parseable task carrying the goal verbatim', () => {
    const goal = 'wire the export button to the CSV endpoint';
    const text = buildDirectives(buildPlanNlIntent(goal));
    const parsed = parseStructuredDirectives(text);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.title).toBe(goal);
    expect(parsed[0]!.description).toContain(goal);
    expect(parsed[0]!.scope.filesWrite).toContain('TODO-fill-in-target-files');
  });
});
