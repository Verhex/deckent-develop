/**
 * New tests for sync+onboard+upgrade improvements (sprint-057-011)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('../../../src/core/utils.js', () => ({
  ensureDeckentImport: vi.fn(),
  countBrainLines: vi.fn().mockReturnValue(100),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../../src/core/system-profile.js', () => ({
  getSystemProfile: vi.fn().mockReturnValue({
    cpuCores: 4,
    totalMemMB: 8192,
    recommendedMaxWorkers: 3,
  }),
}));

vi.mock('../../../src/cli/helpers/wizard.js', () => ({
  runWizard: vi.fn().mockResolvedValue({ language: 'en', mode: 'max_plan', runInit: false }),
}));

vi.mock('../../../src/core/constants.js', () => ({
  DECKENT_DIR: '.deckent',
  DECKENT_VERSION: '1.0.0',
  DECKENT_FILE: 'DECKENT.md',
  CLAUDE_FILE: 'CLAUDE.md',
  AGENTS_FILE: 'AGENTS.md',
  BRAIN_DIR: '.brain',
  SPRINTS_DIR: 'sprints',
  MEMORY_FILE: 'MEMORY.md',
}));

vi.mock('../../../src/core/stack-detector.js', () => ({
  detectProjectStack: vi.fn().mockReturnValue({
    language: 'TypeScript',
    framework: 'Express',
    testFramework: 'vitest',
  }),
}));

// ─── Imports ─────────────────────────────────────────────────────────

import { existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { ensureDeckentImport } from '../../../src/core/utils.js';
import { print, printError } from '../../../src/cli/helpers/output.js';
import { runWizard } from '../../../src/cli/helpers/wizard.js';
import { detectProjectStack } from '../../../src/core/stack-detector.js';

import {
  truncateFileList,
  syncAdapterFiles,
  registerSync,
  formatSyncOutput,
  getLastSprintTimestamp,
} from '../../../src/cli/commands/sync.js';
import type { SyncResult } from '../../../src/cli/commands/sync.js';

import {
  detectProjectInfo,
  buildOnboardSteps,
  runOnboard,
  registerOnboard,
} from '../../../src/cli/commands/onboard.js';

import {
  parseSemver,
  compareVersions,
  detectInstallStrategy,
  checkLatestVersion,
  buildInstallCommand,
  executeUpgrade,
  registerUpgrade,
} from '../../../src/cli/commands/upgrade.js';

// ═══════════════════════════════════════════════════════════════════════
// sync.ts — New tests
// ═══════════════════════════════════════════════════════════════════════

describe('sync: truncateFileList', () => {
  it('returns all files joined when <= 50', () => {
    const files = Array.from({ length: 50 }, (_, i) => `file${i}.ts`);
    const result = truncateFileList(files);
    expect(result).not.toContain('more...');
    expect(result.split(', ')).toHaveLength(50);
  });

  it('truncates at 50 with "and N more..." when > 50', () => {
    const files = Array.from({ length: 75 }, (_, i) => `file${i}.ts`);
    const result = truncateFileList(files);
    expect(result).toContain('and 25 more...');
    // Should show first 50
    expect(result.split(', ').length).toBe(51); // 50 files + "and 25 more..."
  });

  it('handles exactly 51 files', () => {
    const files = Array.from({ length: 51 }, (_, i) => `f${i}.ts`);
    const result = truncateFileList(files);
    expect(result).toContain('and 1 more...');
  });

  it('returns single file without truncation', () => {
    const result = truncateFileList(['src/foo.ts']);
    expect(result).toBe('src/foo.ts');
    expect(result).not.toContain('more');
  });
});

describe('sync: formatSyncOutput with large file lists', () => {
  it('truncates modified files list at 50', () => {
    const manyFiles = Array.from({ length: 100 }, (_, i) => `src/file${i}.ts`);
    const result: SyncResult = {
      commits: 5,
      sprintId: 'sprint-042',
      modified: manyFiles,
      added: [],
      deleted: [],
      renamed: [],
    };
    const output = formatSyncOutput(result);
    expect(output).toContain('and 50 more...');
    expect(output).not.toContain('src/file99.ts');
  });
});

describe('sync: syncAdapterFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
  });

  it('syncs CLAUDE.md, AGENTS.md, GEMINI.md, .cursor/rules, .codex/AGENTS.md', () => {
    const synced = syncAdapterFiles('/project');
    expect(synced).toContain('CLAUDE.md');
    expect(synced).toContain('AGENTS.md');
    expect(synced).toContain('GEMINI.md');
    expect(synced).toContain('.cursor/rules');
    expect(synced).toContain('.codex/AGENTS.md');
    expect(ensureDeckentImport).toHaveBeenCalledTimes(5);
  });

  it('dry-run does NOT call ensureDeckentImport', () => {
    const synced = syncAdapterFiles('/project', true);
    expect(synced).toHaveLength(5);
    expect(ensureDeckentImport).not.toHaveBeenCalled();
  });

  it('creates .cursor directory if not exists', () => {
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      if (String(p).includes('.cursor')) return false;
      return true;
    });
    syncAdapterFiles('/project');
    expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining('.cursor'), { recursive: true });
  });
});

describe('sync: --json and --dry-run flags via registerSync', () => {
  let program: Command;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    program = new Command();
    program.exitOverride();
    registerSync(program);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    process.exitCode = undefined;
  });

  it('--json outputs JSON when DECKENT.md not found', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await program.parseAsync(['node', 'deckent', 'sync', '--json']);
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('"error"'));
  });

  it('--dry-run does not call ensureDeckentImport', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(spawnSync).mockReturnValue({
      status: 0, stdout: 'true\n', stderr: '', pid: 1, output: [], signal: null,
    });
    vi.mocked(readdirSync).mockReturnValue([]);

    await program.parseAsync(['node', 'deckent', 'sync', '--dry-run']);
    expect(ensureDeckentImport).not.toHaveBeenCalled();
  });
});

describe('sync: getLastSprintTimestamp uses git date when available', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses git commit date when git log succeeds', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['sprint-040.md'] as unknown as ReturnType<typeof readdirSync>);

    const gitDate = '2026-03-20T10:00:00.000Z';
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: gitDate + '\n',
      stderr: '',
      pid: 1,
      output: [],
      signal: null,
    });

    const result = getLastSprintTimestamp('/project');
    expect(result).not.toBeNull();
    expect(result!.timestamp).toBe(new Date(gitDate).toISOString());
  });

  it('falls back to mtime when git log returns empty', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['sprint-040.md'] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(spawnSync).mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, output: [], signal: null,
    });
    vi.mocked(statSync).mockReturnValue({ mtimeMs: 9000000 } as ReturnType<typeof statSync>);

    const result = getLastSprintTimestamp('/project');
    expect(result).not.toBeNull();
    expect(result!.timestamp).toBe(new Date(9000000).toISOString());
  });
});

// ═══════════════════════════════════════════════════════════════════════
// onboard.ts — New tests
// ═══════════════════════════════════════════════════════════════════════

describe('onboard: detectProjectInfo uses stack-detector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(detectProjectStack).mockReturnValue({
      language: 'TypeScript',
      framework: 'Fastify',
      testFramework: 'vitest',
    } as ReturnType<typeof detectProjectStack>);
  });

  it('returns framework from stack-detector', () => {
    const info = detectProjectInfo('/project');
    expect(info.framework).toBe('Fastify');
  });

  it('returns testFramework from stack-detector', () => {
    const info = detectProjectInfo('/project');
    expect(info.testFramework).toBe('vitest');
  });

  it('falls back gracefully when stack-detector throws', () => {
    vi.mocked(detectProjectStack).mockImplementation(() => { throw new Error('no git'); });
    vi.mocked(existsSync).mockImplementation((p: unknown) => String(p).includes('tsconfig.json'));

    const info = detectProjectInfo('/project');
    expect(info.language).toBe('TypeScript'); // from basic detection
    expect(info.framework).toBe('');
  });
});

describe('onboard: buildOnboardSteps includes api mode', () => {
  it('includes api mode option', () => {
    const steps = buildOnboardSteps('my-app');
    const modeStep = steps.find(s => s.id === 'mode');
    expect(modeStep).toBeDefined();
    const apiChoice = modeStep!.choices?.find(c => c.value === 'api');
    expect(apiChoice).toBeDefined();
    expect(apiChoice!.label).toMatch(/api/i);
  });

  it('has 4 mode choices including api', () => {
    const steps = buildOnboardSteps('my-app');
    const modeStep = steps.find(s => s.id === 'mode');
    expect(modeStep!.choices).toHaveLength(4);
  });
});

describe('onboard: --force flag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips init when already initialized and no --force', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(runWizard).mockResolvedValue({ language: 'en', mode: 'max_plan', runInit: true });
    vi.mocked(spawnSync).mockReturnValue({
      status: 0, stdout: '1.0.0', stderr: '', pid: 1, output: [], signal: null,
    });

    await runOnboard('/project', { nonInteractive: true });

    const calls = vi.mocked(print).mock.calls.flat();
    expect(calls.some(m => m.includes('already exists') || m.includes('Skipped init'))).toBe(true);
    // spawnSync should NOT be called with 'npx' (init should be skipped)
    const npxCalls = vi.mocked(spawnSync).mock.calls.filter(c => c[0] === 'npx');
    expect(npxCalls).toHaveLength(0);
  });

  it('runs init when --force is set even if already initialized', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(runWizard).mockResolvedValue({ language: 'en', mode: 'max_plan', runInit: true });
    vi.mocked(spawnSync).mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, output: [], signal: null,
    });

    await runOnboard('/project', { nonInteractive: true, force: true });

    expect(spawnSync).toHaveBeenCalledWith(
      'npx',
      expect.arrayContaining(['deckent', 'init', '--force']),
      expect.any(Object),
    );
  });
});

describe('onboard: passes language and mode to init', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(spawnSync).mockReturnValue({
      status: 0, stdout: '', stderr: '', pid: 1, output: [], signal: null,
    });
  });

  it('passes --mode to init command', async () => {
    vi.mocked(runWizard).mockResolvedValue({ language: 'en', mode: 'pro_plan', runInit: true });

    await runOnboard('/project', { nonInteractive: true });

    expect(spawnSync).toHaveBeenCalledWith(
      'npx',
      expect.arrayContaining(['--mode', 'pro_plan']),
      expect.any(Object),
    );
  });

  it('passes --language to init command when not en', async () => {
    vi.mocked(runWizard).mockResolvedValue({ language: 'tr', mode: 'max_plan', runInit: true });

    await runOnboard('/project', { nonInteractive: true });

    expect(spawnSync).toHaveBeenCalledWith(
      'npx',
      expect.arrayContaining(['--language', 'tr']),
      expect.any(Object),
    );
  });

  it('does not pass --language for default en', async () => {
    vi.mocked(runWizard).mockResolvedValue({ language: 'en', mode: 'max_plan', runInit: true });

    await runOnboard('/project', { nonInteractive: true });

    const callArgs = vi.mocked(spawnSync).mock.calls[0]?.[1] ?? [];
    expect(callArgs).not.toContain('--language');
  });
});

describe('onboard: registerOnboard has --force option', () => {
  it('registers --force option', () => {
    const program = new Command();
    registerOnboard(program);
    const cmd = program.commands.find(c => c.name() === 'onboard');
    const opts = cmd!.options.map(o => o.long);
    expect(opts).toContain('--force');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// upgrade.ts — New tests
// ═══════════════════════════════════════════════════════════════════════

describe('upgrade: parseSemver', () => {
  it('parses basic version', () => {
    const r = parseSemver('1.2.3');
    expect(r).toEqual({ major: 1, minor: 2, patch: 3, pre: '' });
  });

  it('parses pre-release version', () => {
    const r = parseSemver('1.0.0-beta.1');
    expect(r).toEqual({ major: 1, minor: 0, patch: 0, pre: 'beta.1' });
  });

  it('parses canary version', () => {
    const r = parseSemver('2.0.0-canary.20260101');
    expect(r.major).toBe(2);
    expect(r.pre).toBe('canary.20260101');
  });

  it('strips v prefix', () => {
    const r = parseSemver('v3.1.0');
    expect(r.major).toBe(3);
    expect(r.pre).toBe('');
  });
});

describe('upgrade: compareVersions with pre-release', () => {
  it('release > pre-release of same version', () => {
    expect(compareVersions('1.0.0', '1.0.0-beta.1')).toBe(1);
  });

  it('pre-release < release of same version', () => {
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBe(-1);
  });

  it('pre-release versions compared lexicographically', () => {
    expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBe(-1);
  });

  it('equal pre-release versions', () => {
    expect(compareVersions('1.0.0-beta.1', '1.0.0-beta.1')).toBe(0);
  });

  it('newer canary > older canary', () => {
    expect(compareVersions('1.0.0-canary.2', '1.0.0-canary.1')).toBe(1);
  });
});

describe('upgrade: buildInstallCommand', () => {
  it('global strategy uses npm install -g', () => {
    const cmd = buildInstallCommand('global', 'latest');
    expect(cmd).toContain('-g');
    expect(cmd).toContain('deckent@latest');
  });

  it('local strategy uses npm install without -g', () => {
    const cmd = buildInstallCommand('local', 'latest');
    expect(cmd).not.toContain('-g');
    expect(cmd).toContain('deckent@latest');
  });

  it('beta channel uses deckent@beta tag', () => {
    const cmd = buildInstallCommand('global', 'beta');
    expect(cmd).toContain('deckent@beta');
  });

  it('canary channel uses deckent@canary tag', () => {
    const cmd = buildInstallCommand('global', 'canary');
    expect(cmd).toContain('deckent@canary');
  });
});

describe('upgrade: checkLatestVersion with channel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries npm with beta tag when channel=beta', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0, stdout: '1.0.0-beta.5\n', stderr: '', pid: 1, output: [], signal: null,
    });
    const v = checkLatestVersion('beta');
    expect(v).toBe('1.0.0-beta.5');
    expect(spawnSync).toHaveBeenCalledWith(
      'npm',
      expect.arrayContaining(['deckent@beta']),
      expect.any(Object),
    );
  });

  it('queries npm with canary tag when channel=canary', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0, stdout: '2.0.0-canary.1\n', stderr: '', pid: 1, output: [], signal: null,
    });
    checkLatestVersion('canary');
    expect(spawnSync).toHaveBeenCalledWith(
      'npm',
      expect.arrayContaining(['deckent@canary']),
      expect.any(Object),
    );
  });
});

describe('upgrade: rollback via executeUpgrade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('shows error when no rollback version saved', () => {
    // npm config get returns undefined
    vi.mocked(spawnSync).mockReturnValue({
      status: 0, stdout: 'undefined\n', stderr: '', pid: 1, output: [], signal: null,
    });

    executeUpgrade({ rollback: true });

    const calls = vi.mocked(print).mock.calls.flat();
    expect(calls.some(m => m.includes('No rollback'))).toBe(true);
    expect(process.exitCode).toBe(1);
  });
});

describe('upgrade: --canary / --beta flags via registerUpgrade', () => {
  it('registers --canary option', () => {
    const program = new Command();
    registerUpgrade(program);
    const cmd = program.commands.find(c => c.name() === 'upgrade');
    const opts = cmd!.options.map(o => o.long);
    expect(opts).toContain('--canary');
  });

  it('registers --beta option', () => {
    const program = new Command();
    registerUpgrade(program);
    const cmd = program.commands.find(c => c.name() === 'upgrade');
    const opts = cmd!.options.map(o => o.long);
    expect(opts).toContain('--beta');
  });

  it('registers --rollback option', () => {
    const program = new Command();
    registerUpgrade(program);
    const cmd = program.commands.find(c => c.name() === 'upgrade');
    const opts = cmd!.options.map(o => o.long);
    expect(opts).toContain('--rollback');
  });
});

describe('upgrade: detectInstallStrategy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['npm_execpath'];
  });

  afterEach(() => {
    delete process.env['npm_execpath'];
  });

  it('returns npx when npm_execpath contains npx', () => {
    process.env['npm_execpath'] = '/usr/local/lib/node_modules/npx/index.js';
    const strategy = detectInstallStrategy();
    expect(strategy).toBe('npx');
  });

  it('returns global when npm list -g shows deckent', () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 0, stdout: 'deckent@1.0.0\n', stderr: '', pid: 1, output: [], signal: null,
    });
    const strategy = detectInstallStrategy();
    expect(strategy).toBe('global');
  });

  it('returns local when npm list (no -g) shows deckent', () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce({
        status: 0, stdout: '/usr/local/lib\n  -- nothing here --\n', stderr: '', pid: 1, output: [], signal: null,
      })
      .mockReturnValueOnce({
        status: 0, stdout: '/project/node_modules\n  `-- deckent@1.0.0\n', stderr: '', pid: 1, output: [], signal: null,
      });
    const strategy = detectInstallStrategy();
    expect(strategy).toBe('local');
  });

  it('returns unknown when not found anywhere', () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce({
        status: 0, stdout: '/usr/local/lib\n  -- nothing --\n', stderr: '', pid: 1, output: [], signal: null,
      })
      .mockReturnValueOnce({
        status: 0, stdout: '/project/node_modules\n  -- nothing --\n', stderr: '', pid: 1, output: [], signal: null,
      });
    const strategy = detectInstallStrategy();
    expect(strategy).toBe('unknown');
  });
});
