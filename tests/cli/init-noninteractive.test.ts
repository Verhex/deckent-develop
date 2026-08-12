// tests/cli/init-noninteractive.test.ts
//
// Task 413-001 (RC2C / born-652) — `deckent init --yes` was NOT actually
// non-interactive (language/plan/project-name prompts still opened), and if
// piped stdin ran out mid-sequence, the whole flow silently exited 0 without
// writing a single file or printing the 412-001 outcome block — the most
// critical hole in that outcome contract (it only fires if the flow reaches
// its end).
//
// Part 1 (RED-reproduce, real code, real subprocess): proves the underlying
// stdin-EOF-hang bug in src/cli/helpers/prompt.ts is fixed. Spawns the REAL,
// unmocked promptSelect via `vite-node` (which — like vitest itself — resolves
// this project's `.js`-suffixed relative imports against their `.ts` source,
// so the subprocess runs the actual fixed module, not a reimplementation) with
// real piped stdin that runs dry mid-sequence. Before the fix this hung
// forever and the process eventually exited 0 silently, never printing
// anything past the point of the dead prompt. After the fix it rejects with
// PromptEOFError and the process exits non-zero promptly.
//
// Part 2 (integration, mock harness mirrors tests/cli/init-outcome-honesty.test.ts):
// proves `deckent init --yes` never calls promptSelect/promptText, applies the
// documented lang=en/plan=balanced/name=basename(cwd) defaults, and still
// writes config.json; proves a non-TTY run without --yes fails honestly
// (FAILED outcome, non-zero exit, i18n message, zero prompts, zero file
// writes) instead of silently exiting 0; and proves that an EOF thrown mid
// real-interactive-prompt is caught by the EXISTING 412-001 fatal-catch and
// rendered via formatInitOutcomeBlock — no parallel mechanism.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const VITE_NODE_BIN = join(REPO_ROOT, 'node_modules', '.bin', 'vite-node');
const PROMPT_MODULE = join(REPO_ROOT, 'src', 'cli', 'helpers', 'prompt.ts');

// ─── Part 1: RED-reproduce — real prompt.ts, real piped stdin EOF ──────────
//
// Part 2 below mocks 'node:fs' and 'node:child_process' project-wide for this
// file (hoisted). This harness needs the REAL fs (to stage a driver script in
// a tmpdir) and the REAL child_process.spawn (to actually run it) — vi.importActual
// bypasses the mock registry for exactly those two calls, real disk I/O never
// touches the mocked fs the production code under test sees in Part 2.

async function runDriver(stdinData: string | null): Promise<{ code: number | null; stderr: string; timedOut: boolean }> {
  const realFs = await vi.importActual<typeof import('node:fs')>('node:fs');
  const realChildProcess = await vi.importActual<typeof import('node:child_process')>('node:child_process');

  const driver = `
import { promptSelect } from ${JSON.stringify(PROMPT_MODULE)};
async function main() {
  const first = await promptSelect('lang', [{ label: 'a', value: 'a' }, { label: 'b', value: 'b' }]);
  process.stderr.write('first=' + first + '\\n');
  // The second call is the one that used to hang forever: a piped stdin with
  // only one usable line left loses the remainder when the first readline
  // interface closes, so this awaits an answer that will never come.
  const second = await promptSelect('mode', [{ label: 'x', value: 'x' }, { label: 'y', value: 'y' }]);
  process.stderr.write('second=' + second + '\\n');
  process.stderr.write('REACHED_END\\n');
  process.exit(0);
}
main().catch((err) => {
  process.stderr.write('REJECTED:' + (err && err.name) + ':' + (err && err.message) + '\\n');
  process.exit(3);
});
`;

  const tmpDir = realFs.mkdtempSync(join(tmpdir(), 'deckent-prompt-eof-'));
  const driverPath = join(tmpDir, 'driver.mjs');
  realFs.writeFileSync(driverPath, driver, 'utf-8');

  try {
    return await new Promise((resolve) => {
      const child = realChildProcess.spawn(VITE_NODE_BIN, [driverPath], {
        cwd: REPO_ROOT,
        stdio: ['pipe', 'ignore', 'pipe'],
      });
      let stderr = '';
      child.stderr!.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf-8'); });

      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, 8000);

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code, stderr, timedOut });
      });

      if (stdinData === null) {
        child.stdin!.end();
      } else {
        child.stdin!.end(stdinData);
      }
    });
  } finally {
    realFs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

describe('promptSelect stdin-EOF (RC2C regression, async-spawn, real code)', () => {
  it('rejects with PromptEOFError instead of hanging when piped stdin runs out mid-sequence', async () => {
    // Only ONE usable answer ("1") is piped — the second promptSelect call has
    // nothing left to read and stdin then hits EOF.
    const result = await runDriver('1\n');

    expect(result.timedOut).toBe(false); // must not hang — this is the core regression
    expect(result.code).toBe(3); // driver's explicit non-zero exit on rejection
    expect(result.stderr).toContain('first=a');
    expect(result.stderr).not.toContain('REACHED_END'); // never silently completes
    expect(result.stderr).toContain('REJECTED:PromptEOFError');
  }, 15000);

  it('rejects immediately (stdin=/dev/null equivalent — no input at all)', async () => {
    const result = await runDriver(null);

    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(3);
    expect(result.stderr).toContain('REJECTED:PromptEOFError');
    expect(result.stderr).not.toContain('first='); // EOF hits before even the first answer
  }, 15000);
});

// ─── Part 2: full registerInit integration (mock harness mirrors
// tests/cli/init-outcome-honesty.test.ts) ───────────────────────────────────

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  // 524-010 sınıfı: initializeWorkspaceArtifacts realpathSync.native + lstatSync
  // kullanır; kapalı factory bu export'ları taşımayınca init erken ölür.
  realpathSync: Object.assign(vi.fn((path: string) => path), {
    native: vi.fn((path: string) => path),
  }),
  lstatSync: vi.fn((path: string) => ({
    isSymbolicLink: () => false,
    isDirectory: () => !/\.(?:md|json)$/i.test(path),
    isFile: () => /\.(?:md|json)$/i.test(path),
  })),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 1, stdout: '', stderr: 'mocked: no real installs in tests' }),
  spawn: vi.fn(),
  execSync: vi.fn().mockReturnValue(''),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

// Keep the REAL PromptEOFError export (used by the EOF-during-interactive-prompt
// test below) while mocking the three prompt functions themselves.
vi.mock('../../src/cli/helpers/prompt.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/cli/helpers/prompt.js')>();
  return {
    ...actual,
    promptText: vi.fn().mockResolvedValue('my-project'),
    promptSelect: vi.fn().mockResolvedValue('balanced'),
    promptConfirm: vi.fn().mockResolvedValue(false),
  };
});

vi.mock('../../src/cli/auto-setup.js', () => ({
  generateSetupRecommendation: vi.fn().mockReturnValue({
    mode: 'max_plan',
    reasons: ['Detected Max subscription', 'Multi-core system'],
  }),
}));

vi.mock('../../src/core/system-profile.js', () => ({
  getSystemProfile: vi.fn().mockReturnValue({ cpus: 8, ram: 16 }),
}));

vi.mock('../../src/core/subscription.js', () => ({
  detectSubscription: vi.fn().mockReturnValue({ detected: 'max', plan: 'max' }),
}));

vi.mock('../../src/core/analyzer.js', () => ({
  analyzeProject: vi.fn().mockReturnValue({ language: 'typescript', framework: 'none' }),
}));

vi.mock('../../src/core/utils.js', () => ({
  ensureDeckentImport: vi.fn(),
}));

vi.mock('../../src/core/config.js', () => ({
  resolveBrainModel: () => 'sonnet',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  deepMerge: vi.fn().mockImplementation((a: Record<string, unknown>, b: Record<string, unknown>) => ({ ...a, ...b })),
}));

vi.mock('../../src/cli/helpers/splash.js', () => ({
  showSplash: vi.fn().mockReturnValue('KRAKEN SPLASH'),
}));

vi.mock('../../src/core/environment.js', () => ({
  detectEnvironment: vi.fn().mockReturnValue('shell'),
}));

vi.mock('../../src/core/deck-file.js', () => ({
  createDeckTemplate: vi.fn(),
  ensureDeckGitignore: vi.fn(),
}));

vi.mock('../../src/cli/commands/doctor.js', () => ({
  runDoctorChecks: vi.fn().mockReturnValue({ ok: true, checks: [] }),
}));

vi.mock('../../src/cli/helpers/codex-config.js', () => ({
  generateCodexConfig: vi.fn().mockReturnValue({ global: '/home/.codex/config.toml', project: '/mock/root/.codex/config.toml' }),
}));

vi.mock('../../src/cli/helpers/gemini-config.js', () => ({
  generateGeminiConfig: vi.fn().mockReturnValue({ settingsPath: '/home/.gemini/settings.json' }),
}));

vi.mock('../../src/cli/helpers/cursor-config.js', () => ({
  generateCursorConfig: vi.fn().mockReturnValue({ mcpPath: '/mock/root/.cursor/mcp.json', rulesPath: '/mock/root/.cursor/rules/deckent.mdc' }),
}));

vi.mock('../../src/cli/helpers/agent-templates.js', () => ({
  generateAgentsMd: vi.fn().mockReturnValue('# AGENTS.md — Deckent Integration\n\nProject: test (typescript/unknown)\n'),
  generateGeminiMd: vi.fn().mockReturnValue('# GEMINI.md — Deckent Integration\n\nProject: test (typescript/unknown)\n'),
  generateCursorRules: vi.fn().mockReturnValue('---\ndescription: Deckent rules\nglobs: **/*\n---\n# Deckent Integration\n'),
  appendDeckentSection: vi.fn(),
}));

vi.mock('../../src/core/stack-detector.js', () => ({
  detectFullStack: vi.fn().mockReturnValue({
    language: 'typescript',
    framework: 'express',
    buildTool: 'tsc',
    testFramework: 'vitest',
    commands: { build: 'npx tsc', test: 'npx vitest run', lint: 'npx eslint' },
  }),
}));

vi.mock('../../src/core/provider.js', () => ({
  detectAvailableProviders: vi.fn().mockResolvedValue([
    { name: 'claude', available: true, version: '1.0.0', authMethod: 'session', models: ['opus', 'sonnet', 'haiku'] },
  ]),
}));

vi.mock('../../src/cli/helpers/wizard.js', () => ({
  detectIDEEnvironment: vi.fn().mockReturnValue('terminal'),
  getMCPGuidance: vi.fn().mockReturnValue(['Terminal mode — MCP server binary: deckent-mcp']),
  buildProviderWizardSteps: vi.fn().mockReturnValue({
    autoConfig: {
      brain_provider: 'claude',
      worker_provider: 'claude',
      selectedProviders: ['claude'],
    },
    steps: [],
  }),
  resolveProviderWizardResult: vi.fn().mockReturnValue({
    brain_provider: 'claude',
    worker_provider: 'claude',
    selectedProviders: ['claude'],
  }),
  formatProviderAuthGuidance: vi.fn().mockReturnValue([]),
  runWizard: vi.fn().mockResolvedValue({ brain_provider: 'claude', worker_provider: 'claude' }),
}));

import { writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { print } from '../../src/cli/helpers/output.js';
import { registerInit } from '../../src/cli/commands/init.js';
import { runDoctorChecks } from '../../src/cli/commands/doctor.js';
import { detectAvailableProviders } from '../../src/core/provider.js';
import { showSplash } from '../../src/cli/helpers/splash.js';
import { detectEnvironment } from '../../src/core/environment.js';
import { createDeckTemplate } from '../../src/core/deck-file.js';
import { promptSelect, promptText, promptConfirm, PromptEOFError } from '../../src/cli/helpers/prompt.js';
import { detectFullStack } from '../../src/core/stack-detector.js';
import { buildProviderWizardSteps, runWizard } from '../../src/cli/helpers/wizard.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

// ─── Helpers ─────────────────────────────────────────────────────────

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerInit(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride
  }
}

function printedText(): string {
  return vi.mocked(print).mock.calls.map((c) => String(c[0])).join('\n');
}

function configWriteCalls(): Array<Record<string, unknown>> {
  return vi.mocked(writeFileSync).mock.calls
    .filter((c) => String(c[0]).includes('config.json'))
    .map((c) => JSON.parse(String(c[1])) as Record<string, unknown>);
}

describe('init non-interactive honesty (413-001 / RC2C)', () => {
  const originalIsTTY = process.stdin.isTTY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    process.stdin.isTTY = undefined; // default test environment: no TTY on stdin

    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(promptSelect).mockResolvedValue('balanced' as any);
    vi.mocked(promptText).mockResolvedValue('my-project');
    vi.mocked(detectEnvironment).mockReturnValue('shell');
    vi.mocked(showSplash).mockReturnValue('KRAKEN SPLASH');
    vi.mocked(createDeckTemplate).mockImplementation(() => {});
    vi.mocked(runDoctorChecks).mockReturnValue({ ok: true, checks: [] });
    vi.mocked(detectFullStack).mockReturnValue({
      language: 'typescript',
      framework: 'express',
      buildTool: 'tsc',
      testFramework: 'vitest',
      commands: { build: 'npx tsc', test: 'npx vitest run', lint: 'npx eslint' },
    });
    vi.mocked(detectAvailableProviders).mockResolvedValue([
      { name: 'claude', available: true, version: '1.0.0', authMethod: 'session', models: ['opus', 'sonnet', 'haiku'] } as any,
    ]);
    vi.mocked(buildProviderWizardSteps).mockReturnValue({
      autoConfig: { brain_provider: 'claude' as any, worker_provider: 'claude' as any, selectedProviders: ['claude'] as any[] },
      steps: [],
    });
  });

  afterEach(() => {
    process.exitCode = undefined;
    process.stdin.isTTY = originalIsTTY;
  });

  // ─── Requirement 1: --yes is fully non-interactive ──────────────────────

  it('--yes opens ZERO prompts and applies lang=en/plan=balanced/name=basename(cwd) defaults, config.json still written', async () => {
    await runCommand(['init', '--yes']);

    expect(promptSelect).not.toHaveBeenCalled();
    expect(promptText).not.toHaveBeenCalled();

    const configCalls = configWriteCalls();
    expect(configCalls.length).toBeGreaterThan(0);
    for (const cfg of configCalls) {
      expect(cfg.mode).toBe('balanced');
      expect(cfg.language).toBe('en');
      expect(cfg.projectName).toBe('root'); // basename of mocked root '/mock/root'
    }
  });

  it('--yes with multiple available providers skips the provider wizard prompt too (runWizard called nonInteractive)', async () => {
    vi.mocked(buildProviderWizardSteps).mockReturnValue({
      autoConfig: null,
      steps: [
        { id: 'brain_provider', prompt: 'Select brain provider:', type: 'select', choices: [{ label: 'claude', value: 'claude' }, { label: 'codex', value: 'codex' }], default: 'claude' },
        { id: 'worker_provider', prompt: 'Select worker provider:', type: 'select', choices: [{ label: 'claude', value: 'claude' }, { label: 'codex', value: 'codex' }], default: 'claude' },
      ],
    });
    vi.mocked(runWizard).mockResolvedValue({ brain_provider: 'claude', worker_provider: 'claude' });

    await runCommand(['init', '--yes']);

    expect(runWizard).toHaveBeenCalledWith(expect.anything(), { nonInteractive: true });
    expect(promptSelect).not.toHaveBeenCalled();
    expect(promptText).not.toHaveBeenCalled();
  });

  it('--yes never treats unattended defaults as npm-global install consent', async () => {
    vi.mocked(detectAvailableProviders).mockResolvedValue([
      { name: 'claude', available: false, models: [] } as any,
    ]);

    await runCommand(['init', '--yes']);

    expect(promptConfirm).not.toHaveBeenCalled();
    expect(spawnSync).not.toHaveBeenCalledWith(
      'npm',
      expect.arrayContaining(['install', '-g']),
      expect.anything(),
    );
    expect(printedText()).toContain('Missing prerequisites: claude');
  });

  it('--yes --install explicitly authorizes the existing bounded installer', async () => {
    vi.mocked(detectAvailableProviders).mockResolvedValue([
      { name: 'claude', available: false, models: [] } as any,
    ]);

    await runCommand(['init', '--yes', '--install']);

    expect(promptConfirm).not.toHaveBeenCalled();
    expect(spawnSync).toHaveBeenCalledWith(
      'npm',
      ['install', '-g', '@anthropic-ai/claude-code'],
      expect.objectContaining({ shell: false }),
    );
  });

  // ─── Requirement 2: non-TTY without --yes fails honestly ───────────────

  it('non-TTY without --yes -> FAILED, non-zero exit, honest i18n message, zero prompts, zero config write (silent-exit-0 DIES)', async () => {
    // process.stdin.isTTY is already undefined (falsy) by default in this suite —
    // the exact shape of a piped/redirected stdin with no --yes flag.
    await runCommand(['init']);

    const out = printedText();
    expect(process.exitCode).toBe(1); // initOutcomeExitCode('FAILED')
    expect(out).toContain('FAILED');
    expect(out).toContain(getMessage('init.non_interactive_requires_yes', 'en'));

    expect(promptSelect).not.toHaveBeenCalled();
    expect(promptText).not.toHaveBeenCalled();

    // The core regression: today's bug wrote NOTHING and exited 0 silently.
    // The fix must neither exit 0 nor write any file.
    expect(vi.mocked(writeFileSync)).not.toHaveBeenCalled();
  });

  it('non-TTY without --yes never reaches --auto\'s system-detection path (auto still bypasses the TTY gate on purpose)', async () => {
    // --auto already fully avoids prompts via system-profile detection (existing,
    // unchanged behavior) — confirm the TTY gate does not interfere with it.
    await runCommand(['init', '--auto']);

    expect(process.exitCode).toBeUndefined();
    expect(printedText()).not.toContain('Non-interactive environment detected');
  });

  // ─── Requirement 3: EOF mid-interactive-prompt reuses the 412-001 contract ──

  it('EOF (PromptEOFError) during a real interactive prompt -> FAILED via the EXISTING classifyInitOutcome/formatInitOutcomeBlock contract, non-zero exit', async () => {
    process.stdin.isTTY = true; // a genuine interactive session this time
    vi.mocked(promptSelect).mockRejectedValueOnce(new PromptEOFError());

    await runCommand(['init']);

    const out = printedText();
    expect(process.exitCode).toBe(1);
    expect(out).toContain('FAILED');
    expect(out).not.toContain("You're ready");
    // No parallel mechanism: the same outcome-block format used for every other
    // fatal failure (388-010 / 412-001) renders this one too.
    expect(out).toContain(getMessage('init.outcome_failed_message', 'en'));
  });
});
