import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../../src/cli/helpers/prompt.js', () => ({
  promptText: vi.fn().mockResolvedValue('my-project'),
  promptSelect: vi.fn().mockResolvedValue('max_plan'),
}));

vi.mock('../../../src/cli/auto-setup.js', () => ({
  generateSetupRecommendation: vi.fn().mockReturnValue({
    mode: 'max_plan',
    reasons: ['Detected Max subscription', 'Multi-core system'],
  }),
}));

vi.mock('../../../src/core/system-profile.js', () => ({
  getSystemProfile: vi.fn().mockReturnValue({ cpus: 8, ram: 16 }),
}));

vi.mock('../../../src/core/subscription.js', () => ({
  detectSubscription: vi.fn().mockReturnValue({ detected: 'max', plan: 'max' }),
}));

vi.mock('../../../src/core/analyzer.js', () => ({
  analyzeProject: vi.fn().mockReturnValue({ language: 'typescript', framework: 'none' }),
}));

vi.mock('../../../src/core/utils.js', () => ({
  ensureDeckentImport: vi.fn(),
}));

vi.mock('../../../src/core/config.js', () => ({
  deepMerge: vi.fn().mockImplementation((base: Record<string, unknown>, override: Record<string, unknown>) => {
    const result = { ...base };
    for (const key of Object.keys(override)) {
      const baseVal = result[key];
      const overrideVal = override[key];
      if (baseVal && typeof baseVal === 'object' && !Array.isArray(baseVal) && overrideVal && typeof overrideVal === 'object' && !Array.isArray(overrideVal)) {
        result[key] = { ...baseVal as Record<string, unknown>, ...overrideVal as Record<string, unknown> };
      } else {
        result[key] = overrideVal;
      }
    }
    return result;
  }),
}));

vi.mock('../../../src/cli/helpers/splash.js', () => ({
  showSplash: vi.fn().mockReturnValue('KRAKEN SPLASH'),
}));

vi.mock('../../../src/core/environment.js', () => ({
  detectEnvironment: vi.fn().mockReturnValue('shell'),
}));

vi.mock('../../../src/core/deck-file.js', () => ({
  createDeckTemplate: vi.fn(),
  ensureDeckGitignore: vi.fn(),
}));


vi.mock('../../../src/core/config.js', () => ({
  deepMerge: vi.fn().mockImplementation((a: Record<string, unknown>, b: Record<string, unknown>) => ({ ...a, ...b })),
}));
vi.mock('../../../src/cli/commands/doctor.js', () => ({
  runDoctorChecks: vi.fn().mockReturnValue({ ok: true, checks: [] }),
}));

vi.mock('../../../src/cli/helpers/codex-config.js', () => ({
  generateCodexConfig: vi.fn().mockReturnValue({ global: '/home/.codex/config.toml', project: '/mock/root/.codex/config.toml' }),
}));

vi.mock('../../../src/cli/helpers/gemini-config.js', () => ({
  generateGeminiConfig: vi.fn().mockReturnValue({ settingsPath: '/home/.gemini/settings.json' }),
}));

vi.mock('../../../src/cli/helpers/cursor-config.js', () => ({
  generateCursorConfig: vi.fn().mockReturnValue({ mcpPath: '/mock/root/.cursor/mcp.json', rulesPath: '/mock/root/.cursor/rules/deckent.mdc' }),
}));

vi.mock('../../../src/cli/helpers/agent-templates.js', () => ({
  generateAgentsMd: vi.fn().mockReturnValue('# AGENTS.md — Deckent Integration\n\nProject: test (typescript/unknown)\n'),
  generateGeminiMd: vi.fn().mockReturnValue('# GEMINI.md — Deckent Integration\n\nProject: test (typescript/unknown)\n'),
  generateCursorRules: vi.fn().mockReturnValue('---\ndescription: Deckent rules\nglobs: **/*\n---\n# Deckent Integration\n'),
  appendDeckentSection: vi.fn(),
}));

vi.mock('../../../src/core/stack-detector.js', () => ({
  detectFullStack: vi.fn().mockReturnValue({
    language: 'typescript',
    framework: 'express',
    buildTool: 'tsc',
    testFramework: 'vitest',
    commands: { build: 'npx tsc', test: 'npx vitest run', lint: 'npx eslint' },
  }),
}));

vi.mock('../../../src/core/provider.js', () => ({
  detectAvailableProviders: vi.fn().mockResolvedValue([
    { name: 'claude', available: true, version: '1.0.0', authMethod: 'session', models: ['opus', 'sonnet', 'haiku'] },
  ]),
}));

vi.mock('../../../src/cli/helpers/wizard.js', () => ({
  detectIDEEnvironment: vi.fn().mockReturnValue('terminal'),
  getMCPGuidance: vi.fn().mockReturnValue(['Terminal mode — MCP tools available via: deckent mcp']),
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

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { print, printError } from '../../../src/cli/helpers/output.js';
import { promptText, promptSelect } from '../../../src/cli/helpers/prompt.js';
import { generateSetupRecommendation } from '../../../src/cli/auto-setup.js';
import { getSystemProfile } from '../../../src/core/system-profile.js';
import { detectSubscription } from '../../../src/core/subscription.js';
import { analyzeProject } from '../../../src/core/analyzer.js';
import { ensureDeckentImport } from '../../../src/core/utils.js';
import { registerInit } from '../../../src/cli/commands/init.js';
import { runDoctorChecks } from '../../../src/cli/commands/doctor.js';
import { detectAvailableProviders } from '../../../src/core/provider.js';
import { showSplash } from '../../../src/cli/helpers/splash.js';
import { detectEnvironment } from '../../../src/core/environment.js';
import { createDeckTemplate, ensureDeckGitignore } from '../../../src/core/deck-file.js';
import { deepMerge } from '../../../src/core/config.js';
import { generateCodexConfig } from '../../../src/cli/helpers/codex-config.js';
import { generateGeminiConfig } from '../../../src/cli/helpers/gemini-config.js';
import { generateCursorConfig } from '../../../src/cli/helpers/cursor-config.js';
import { generateAgentsMd, generateGeminiMd, generateCursorRules } from '../../../src/cli/helpers/agent-templates.js';
import { detectFullStack } from '../../../src/core/stack-detector.js';
import {
  detectIDEEnvironment,
  getMCPGuidance,
  buildProviderWizardSteps,
  resolveProviderWizardResult,
  formatProviderAuthGuidance,
  runWizard,
} from '../../../src/cli/helpers/wizard.js';

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

// Ensure imported mocked functions are referenced to prevent lint removal
const _providerMocks = { detectAvailableProviders, detectIDEEnvironment, getMCPGuidance, buildProviderWizardSteps, resolveProviderWizardResult, formatProviderAuthGuidance, runWizard };
void _providerMocks;
const _envMocks = { generateCodexConfig, generateGeminiConfig, generateCursorConfig, generateAgentsMd, generateGeminiMd, generateCursorRules, detectFullStack };
void _envMocks;
const _doctorMocks = { runDoctorChecks, ensureDeckGitignore, deepMerge };
void _doctorMocks;

// ─── Tests ───────────────────────────────────────────────────────────

describe('init command (isolated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;

    // Default: no files exist (fresh project)
    vi.mocked(existsSync).mockReturnValue(false);

    // Default prompt responses
    vi.mocked(promptSelect).mockResolvedValue('max_plan' as any);
    vi.mocked(promptText).mockResolvedValue('my-project');

    // Default environment: shell (must reset after other tests change it)
    vi.mocked(detectEnvironment).mockReturnValue('shell');
    vi.mocked(showSplash).mockReturnValue('KRAKEN SPLASH');
    vi.mocked(createDeckTemplate).mockImplementation(() => {});
    vi.mocked(runDoctorChecks).mockReturnValue({ ok: true, checks: [] });
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  // ─── registerInit ──────────────────────────────────────────────────

  describe('registerInit', () => {
    it('registers init command', () => {
      const program = new Command();
      registerInit(program);
      const cmd = program.commands.find(c => c.name() === 'init');
      expect(cmd).toBeDefined();
    });

    it('registers --auto flag', () => {
      const program = new Command();
      registerInit(program);
      const cmd = program.commands.find(c => c.name() === 'init');
      expect(cmd!.options.some(o => o.long === '--auto')).toBe(true);
    });

    it('registers --manual flag', () => {
      const program = new Command();
      registerInit(program);
      const cmd = program.commands.find(c => c.name() === 'init');
      expect(cmd!.options.some(o => o.long === '--manual')).toBe(true);
    });

    it('has correct description', () => {
      const program = new Command();
      registerInit(program);
      const cmd = program.commands.find(c => c.name() === 'init');
      expect(cmd!.description()).toContain('Initialize');
    });
  });

  // ─── Directory creation ────────────────────────────────────────────

  describe('directory creation', () => {
    it('creates .deckent directory', async () => {
      await runCommand(['init', '--auto']);
      expect(mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.deckent'),
        expect.objectContaining({ recursive: true }),
      );
    });

    it('creates .brain directory', async () => {
      await runCommand(['init', '--auto']);
      expect(mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.brain'),
        expect.objectContaining({ recursive: true }),
      );
    });

    it('creates .tasks directory', async () => {
      await runCommand(['init', '--auto']);
      expect(mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.tasks'),
        expect.objectContaining({ recursive: true }),
      );
    });

    it('creates .locks directory', async () => {
      await runCommand(['init', '--auto']);
      expect(mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.locks'),
        expect.objectContaining({ recursive: true }),
      );
    });

    it('creates .brain/sprints sub-directory', async () => {
      await runCommand(['init', '--auto']);
      expect(mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('sprints'),
        expect.objectContaining({ recursive: true }),
      );
    });

    it('creates .deckent/workspace directory', async () => {
      await runCommand(['init', '--auto']);
      expect(mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('workspace'),
        expect.objectContaining({ recursive: true }),
      );
    });

    it('creates .deckent/plugins directory', async () => {
      await runCommand(['init', '--auto']);
      expect(mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('plugins'),
        expect.objectContaining({ recursive: true }),
      );
    });

    it('creates .deckent/i18n directory', async () => {
      await runCommand(['init', '--auto']);
      expect(mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('i18n'),
        expect.objectContaining({ recursive: true }),
      );
    });
  });

  // ─── File generation ───────────────────────────────────────────────

  describe('file generation', () => {
    it('writes DECKENT.md when it does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const deckentCall = writeCalls.find(c => String(c[0]).includes('DECKENT.md'));
      expect(deckentCall).toBeDefined();
    });

    it('does not overwrite DECKENT.md when it already exists', async () => {
      vi.mocked(existsSync).mockImplementation((p) => String(p).includes('DECKENT.md'));
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const deckentCall = writeCalls.find(c => String(c[0]).includes('DECKENT.md') && !String(c[0]).includes('config'));
      expect(deckentCall).toBeUndefined();
    });

    it('writes TOOLS.md to workspace dir', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const toolsCall = writeCalls.find(c => String(c[0]).includes('TOOLS.md'));
      expect(toolsCall).toBeDefined();
    });

    it('writes BOOT.md to workspace dir', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const bootCall = writeCalls.find(c => String(c[0]).includes('BOOT.md'));
      expect(bootCall).toBeDefined();
      expect(String(bootCall![1])).toContain('Boot Sequence');
    });

    it('writes DIRECTIVES.md when it does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const directivesCall = writeCalls.find(c => String(c[0]).includes('DIRECTIVES.md'));
      expect(directivesCall).toBeDefined();
    });

    it('writes i18n/en.json file', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const enCall = writeCalls.find(c => String(c[0]).includes('en.json'));
      expect(enCall).toBeDefined();
      const content = JSON.parse(String(enCall![1]));
      expect(content).toHaveProperty('sprint_started');
    });

    it('writes i18n/tr.json file', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const trCall = writeCalls.find(c => String(c[0]).includes('tr.json'));
      expect(trCall).toBeDefined();
      const content = JSON.parse(String(trCall![1]));
      expect(content).toHaveProperty('sprint_started');
    });

    it('TOOLS.md reads scripts from package.json when it exists', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readFileSync).mockImplementation((p) => {
        if (String(p).includes('package.json')) {
          return JSON.stringify({ scripts: { build: 'tsc', test: 'vitest run' } });
        }
        return '';
      });
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const toolsCall = writeCalls.find(c => String(c[0]).includes('TOOLS.md'));
      expect(toolsCall).toBeDefined();
      expect(String(toolsCall![1])).toContain('build');
      expect(String(toolsCall![1])).toContain('tsc');
    });

    it('TOOLS.md falls back gracefully when package.json missing', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readFileSync).mockImplementation((p) => {
        if (String(p).includes('package.json')) throw new Error('ENOENT');
        return '';
      });
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const toolsCall = writeCalls.find(c => String(c[0]).includes('TOOLS.md'));
      expect(toolsCall).toBeDefined();
      expect(String(toolsCall![1])).toContain('No package.json');
    });
  });

  // ─── Config creation ───────────────────────────────────────────────

  describe('config creation', () => {
    it('writes config.json with mode, language, projectName', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const configCall = writeCalls.find(c => String(c[0]).includes('config.json'));
      expect(configCall).toBeDefined();
      const config = JSON.parse(String(configCall![1]));
      expect(config).toHaveProperty('mode');
      expect(config).toHaveProperty('language');
      expect(config).toHaveProperty('projectName');
    });

    it('merges with existing config.json preserving other fields', async () => {
      vi.mocked(existsSync).mockImplementation((p) => String(p).includes('config.json'));
      vi.mocked(readFileSync).mockImplementation((p) => {
        if (String(p).includes('config.json')) {
          return JSON.stringify({ customField: 'preserved', mode: 'old_mode' });
        }
        return '';
      });
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const configCall = writeCalls.find(c => String(c[0]).includes('config.json'));
      expect(configCall).toBeDefined();
      const config = JSON.parse(String(configCall![1]));
      expect(config.customField).toBe('preserved');
      expect(config.mode).toBe('max_plan'); // overwritten by new value
    });

    it('falls back to fresh config if existing config.json is malformed', async () => {
      vi.mocked(existsSync).mockImplementation((p) => String(p).includes('config.json'));
      vi.mocked(readFileSync).mockImplementation((p) => {
        if (String(p).includes('config.json')) return 'not valid json!!!';
        return '';
      });
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const configCall = writeCalls.find(c => String(c[0]).includes('config.json'));
      expect(configCall).toBeDefined();
      const config = JSON.parse(String(configCall![1]));
      expect(config).toHaveProperty('mode', 'max_plan');
    });

    it('config.json uses auto-detected mode in --auto mode', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(generateSetupRecommendation).mockReturnValue({ mode: 'pro_plan', reasons: [] });
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const configCall = writeCalls.find(c => String(c[0]).includes('config.json'));
      const config = JSON.parse(String(configCall![1]));
      expect(config.mode).toBe('pro_plan');
    });
  });

  // ─── ensureDeckentImport ───────────────────────────────────────────

  describe('ensureDeckentImport', () => {
    it('calls ensureDeckentImport for AGENTS.md', async () => {
      await runCommand(['init', '--auto']);
      expect(ensureDeckentImport).toHaveBeenCalledWith(
        expect.stringContaining('AGENTS.md'),
      );
    });

    it('calls ensureDeckentImport for CLAUDE.md', async () => {
      await runCommand(['init', '--auto']);
      expect(ensureDeckentImport).toHaveBeenCalledWith(
        expect.stringContaining('CLAUDE.md'),
      );
    });

    it('calls ensureDeckentImport exactly twice (AGENTS.md + CLAUDE.md)', async () => {
      await runCommand(['init', '--auto']);
      expect(ensureDeckentImport).toHaveBeenCalledTimes(2);
    });

    it('writes AGENTS.md with DECKENT.md reference when it does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const agentsCall = writeCalls.find(c => String(c[0]).includes('AGENTS.md'));
      expect(agentsCall).toBeDefined();
      expect(String(agentsCall![1])).toContain('DECKENT.md');
    });
  });

  // ─── .gitignore update ─────────────────────────────────────────────

  describe('.gitignore update', () => {
    it('writes .gitignore with .tasks/ entry when it does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const gitignoreCall = writeCalls.find(c => String(c[0]).includes('.gitignore'));
      expect(gitignoreCall).toBeDefined();
      expect(String(gitignoreCall![1])).toContain('.tasks/');
    });

    it('writes .gitignore with .locks/ entry', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const gitignoreCall = writeCalls.find(c => String(c[0]).includes('.gitignore'));
      expect(String(gitignoreCall![1])).toContain('.locks/');
    });

    it('writes .gitignore with .dashboard entry', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const gitignoreCall = writeCalls.find(c => String(c[0]).includes('.gitignore'));
      expect(String(gitignoreCall![1])).toContain('.dashboard');
    });

    it('skips duplicate entries when .gitignore already has all required entries', async () => {
      const existingGitignore = '.tasks/\n.locks/\n.dashboard\n.brain/archive/\n';
      vi.mocked(existsSync).mockImplementation((p) => String(p).includes('.gitignore'));
      vi.mocked(readFileSync).mockImplementation((p) => {
        if (String(p).includes('.gitignore')) return existingGitignore;
        return '';
      });
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const gitignoreCall = writeCalls.find(c => String(c[0]).includes('.gitignore'));
      // Should not write if all entries already exist
      expect(gitignoreCall).toBeUndefined();
    });

    it('only appends missing entries to existing .gitignore', async () => {
      const existingGitignore = '.tasks/\n';
      vi.mocked(existsSync).mockImplementation((p) => String(p).includes('.gitignore'));
      vi.mocked(readFileSync).mockImplementation((p) => {
        if (String(p).includes('.gitignore')) return existingGitignore;
        return '';
      });
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const gitignoreCall = writeCalls.find(c => String(c[0]).includes('.gitignore'));
      if (gitignoreCall) {
        // If written, should include the missing entries
        expect(String(gitignoreCall[1])).toContain('.locks/');
        // Should NOT duplicate .tasks/
        const content = String(gitignoreCall[1]);
        const taskCount = (content.match(/\.tasks\//g) ?? []).length;
        expect(taskCount).toBe(1);
      }
    });
  });

  // ─── Rule templates ────────────────────────────────────────────────

  describe('rule templates', () => {
    it('writes brain.md rule template', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const brainCall = writeCalls.find(c => String(c[0]).includes('brain.md'));
      expect(brainCall).toBeDefined();
      expect(String(brainCall![1])).toContain('Brain Rules');
    });

    it('writes auditor.md rule template', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const auditorCall = writeCalls.find(c => String(c[0]).includes('auditor.md'));
      expect(auditorCall).toBeDefined();
      expect(String(auditorCall![1])).toContain('Auditor Rules');
    });

    it('writes worker-default.md rule template', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const workerCall = writeCalls.find(c => String(c[0]).includes('worker-default.md'));
      expect(workerCall).toBeDefined();
      expect(String(workerCall![1])).toContain('Worker Rules');
    });

    it('does not overwrite brain.md if it already exists', async () => {
      vi.mocked(existsSync).mockImplementation((p) => String(p).includes('brain.md'));
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const brainCall = writeCalls.find(c => String(c[0]).endsWith('brain.md'));
      expect(brainCall).toBeUndefined();
    });

    it('brain.md template includes YAML frontmatter', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const brainCall = writeCalls.find(c => String(c[0]).includes('brain.md'));
      expect(String(brainCall![1])).toContain('---');
      expect(String(brainCall![1])).toContain('paths:');
    });

    it('auditor.md template includes NEVER write source code rule', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const auditorCall = writeCalls.find(c => String(c[0]).includes('auditor.md'));
      expect(String(auditorCall![1])).toContain('NEVER write source code');
    });
  });

  // ─── --auto mode ───────────────────────────────────────────────────

  describe('--auto mode', () => {
    it('calls getSystemProfile in --auto mode', async () => {
      await runCommand(['init', '--auto']);
      expect(getSystemProfile).toHaveBeenCalled();
    });

    it('calls detectSubscription in --auto mode', async () => {
      await runCommand(['init', '--auto']);
      expect(detectSubscription).toHaveBeenCalled();
    });

    it('calls analyzeProject in --auto mode', async () => {
      await runCommand(['init', '--auto']);
      expect(analyzeProject).toHaveBeenCalled();
    });

    it('calls generateSetupRecommendation in --auto mode', async () => {
      await runCommand(['init', '--auto']);
      expect(generateSetupRecommendation).toHaveBeenCalled();
    });

    it('does NOT call promptSelect in --auto mode', async () => {
      await runCommand(['init', '--auto']);
      expect(promptSelect).not.toHaveBeenCalled();
    });

    it('does NOT call promptText in --auto mode', async () => {
      await runCommand(['init', '--auto']);
      expect(promptText).not.toHaveBeenCalled();
    });

    it('prints welcome banner in --auto mode', async () => {
      await runCommand(['init', '--auto']);
      const calls = vi.mocked(print).mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('Welcome to Deckent'))).toBe(true);
    });

    it('prints next steps after init', async () => {
      await runCommand(['init', '--auto']);
      const calls = vi.mocked(print).mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes("You're ready"))).toBe(true);
    });
  });

  // ─── Interactive mode ──────────────────────────────────────────────

  describe('interactive mode (default)', () => {
    it('calls promptSelect for plan mode', async () => {
      vi.mocked(promptSelect).mockResolvedValueOnce('pro_plan' as any).mockResolvedValueOnce('en' as any);
      vi.mocked(promptText).mockResolvedValue('my-project');
      await runCommand(['init']);
      expect(promptSelect).toHaveBeenCalledWith(
        expect.stringContaining('Claude plan'),
        expect.any(Array),
      );
    });

    it('calls promptSelect for language', async () => {
      vi.mocked(promptSelect).mockResolvedValueOnce('max_plan' as any).mockResolvedValueOnce('tr' as any);
      vi.mocked(promptText).mockResolvedValue('my-project');
      await runCommand(['init']);
      expect(promptSelect).toHaveBeenCalledWith(
        expect.stringContaining('language'),
        expect.any(Array),
      );
    });

    it('calls promptText for project name', async () => {
      vi.mocked(promptSelect).mockResolvedValue('max_plan' as any);
      vi.mocked(promptText).mockResolvedValue('my-project');
      await runCommand(['init']);
      expect(promptText).toHaveBeenCalled();
    });

    it('does NOT call getSystemProfile in interactive mode', async () => {
      vi.mocked(promptSelect).mockResolvedValue('max_plan' as any);
      vi.mocked(promptText).mockResolvedValue('my-project');
      await runCommand(['init']);
      expect(getSystemProfile).not.toHaveBeenCalled();
    });
  });

  // ─── Error handling ────────────────────────────────────────────────

  describe('error handling', () => {
    it('calls printError and sets exitCode=1 when mkdirSync throws', async () => {
      vi.mocked(mkdirSync).mockImplementationOnce(() => { throw new Error('EACCES'); });
      await runCommand(['init', '--auto']);
      expect(printError).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('calls printError and sets exitCode=1 when writeFileSync throws', async () => {
      vi.mocked(writeFileSync).mockImplementationOnce(() => { throw new Error('disk full'); });
      await runCommand(['init', '--auto']);
      expect(printError).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  // ─── i18n integration ──────────────────────────────────────────────

  describe('i18n integration', () => {
    it('prints welcome banner in --auto mode', async () => {
      await runCommand(['init', '--auto']);
      const calls = vi.mocked(print).mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('Welcome to Deckent'))).toBe(true);
    });

    it('prints detected setup in --auto mode', async () => {
      await runCommand(['init', '--auto']);
      const calls = vi.mocked(print).mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('I detected your setup'))).toBe(true);
    });

    it('prints setup progress with checkmarks', async () => {
      await runCommand(['init', '--auto']);
      const calls = vi.mocked(print).mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('Setting up your AI development team'))).toBe(true);
    });

    it('prints next steps with numbered instructions (en)', async () => {
      await runCommand(['init', '--auto']);
      const calls = vi.mocked(print).mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('1. Write your goals'))).toBe(true);
      expect(calls.some(c => c.includes('2. Plan the sprint'))).toBe(true);
      expect(calls.some(c => c.includes('3. Start working'))).toBe(true);
    });

    it('prints zero-config hint with deckent start example', async () => {
      await runCommand(['init', '--auto']);
      const calls = vi.mocked(print).mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('deckent start "Add JWT'))).toBe(true);
    });

    it('prints Turkish next steps when language is tr (interactive mode)', async () => {
      vi.mocked(promptSelect)
        .mockResolvedValueOnce('max_plan' as any)
        .mockResolvedValueOnce('tr' as any);
      vi.mocked(promptText).mockResolvedValue('my-project');
      await runCommand(['init']);
      const calls = vi.mocked(print).mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('Hazırsınız'))).toBe(true);
    });

    it('prints Turkish zero-config mode when language is tr', async () => {
      vi.mocked(promptSelect)
        .mockResolvedValueOnce('max_plan' as any)
        .mockResolvedValueOnce('tr' as any);
      vi.mocked(promptText).mockResolvedValue('my-project');
      await runCommand(['init']);
      const calls = vi.mocked(print).mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('doğrudan ne yapılacağını söyleyin'))).toBe(true);
    });
  });

  // ─── Provider detection & wizard ────────────────────────────────────

  describe('provider detection & wizard', () => {
    it('calls detectAvailableProviders during init', async () => {
      await runCommand(['init', '--auto']);
      expect(detectAvailableProviders).toHaveBeenCalled();
    });

    it('shows detected provider info in human-friendly output', async () => {
      await runCommand(['init', '--auto']);
      const calls = vi.mocked(print).mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('I detected your setup'))).toBe(true);
    });

    it('calls buildProviderWizardSteps', async () => {
      await runCommand(['init', '--auto']);
      expect(buildProviderWizardSteps).toHaveBeenCalled();
    });

    it('writes provider config to config.json', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const configCalls = writeCalls.filter(c => String(c[0]).includes('config.json'));
      const hasProviderConfig = configCalls.some(c => {
        const content = JSON.parse(String(c[1]));
        return content.brain_provider !== undefined;
      });
      expect(hasProviderConfig).toBe(true);
    });

    it('auto-configures single provider without wizard in --auto mode', async () => {
      await runCommand(['init', '--auto']);
      expect(runWizard).not.toHaveBeenCalled();
    });

    it('runs wizard when autoConfig is null (multiple providers, interactive)', async () => {
      vi.mocked(buildProviderWizardSteps).mockReturnValue({
        autoConfig: null,
        steps: [
          { id: 'brain_provider', prompt: 'Brain?', type: 'select', choices: [{ label: 'claude', value: 'claude' }], default: 'claude' },
          { id: 'worker_provider', prompt: 'Worker?', type: 'select', choices: [{ label: 'claude', value: 'claude' }], default: 'claude' },
        ],
      });
      vi.mocked(promptSelect).mockResolvedValue('max_plan' as any);
      vi.mocked(promptText).mockResolvedValue('my-project');
      await runCommand(['init']);
      expect(runWizard).toHaveBeenCalled();
    });

    it('resolves wizard result with resolveProviderWizardResult', async () => {
      vi.mocked(buildProviderWizardSteps).mockReturnValue({
        autoConfig: null,
        steps: [
          { id: 'brain_provider', prompt: 'Brain?', type: 'select', choices: [{ label: 'claude', value: 'claude' }], default: 'claude' },
        ],
      });
      vi.mocked(promptSelect).mockResolvedValue('max_plan' as any);
      vi.mocked(promptText).mockResolvedValue('my-project');
      await runCommand(['init']);
      expect(resolveProviderWizardResult).toHaveBeenCalled();
    });

    it('calls formatProviderAuthGuidance', async () => {
      await runCommand(['init', '--auto']);
      expect(formatProviderAuthGuidance).toHaveBeenCalled();
    });

    it('prints auth guidance when providers are unavailable', async () => {
      vi.mocked(formatProviderAuthGuidance).mockReturnValue([
        '  ⚠ codex: Set OPENAI_API_KEY environment variable to enable',
      ]);
      await runCommand(['init', '--auto']);
      const calls = vi.mocked(print).mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('OPENAI_API_KEY'))).toBe(true);
    });

    it('skips auth guidance print when all providers available', async () => {
      vi.mocked(formatProviderAuthGuidance).mockReturnValue([]);
      await runCommand(['init', '--auto']);
      expect(formatProviderAuthGuidance).toHaveBeenCalled();
    });

    it('writes fallback_provider to config when present', async () => {
      vi.mocked(buildProviderWizardSteps).mockReturnValue({
        autoConfig: {
          brain_provider: 'claude' as any,
          worker_provider: 'codex' as any,
          fallback_provider: 'gemini' as any,
          selectedProviders: ['claude', 'codex', 'gemini'] as any[],
        },
        steps: [],
      });
      vi.mocked(existsSync).mockImplementation((p) => String(p).includes('config.json'));
      vi.mocked(readFileSync).mockImplementation((p) => {
        if (String(p).includes('config.json')) {
          return JSON.stringify({ mode: 'max_plan', language: 'en', projectName: 'test' });
        }
        return '';
      });
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const configCalls = writeCalls.filter(c => String(c[0]).includes('config.json'));
      const hasFallback = configCalls.some(c => {
        const content = JSON.parse(String(c[1]));
        return content.fallback_provider === 'gemini';
      });
      expect(hasFallback).toBe(true);
    });

    it('merges provider config into existing config.json', async () => {
      vi.mocked(existsSync).mockImplementation((p) => String(p).includes('config.json'));
      vi.mocked(readFileSync).mockImplementation((p) => {
        if (String(p).includes('config.json')) {
          return JSON.stringify({ mode: 'max_plan', language: 'en', projectName: 'test', customField: 'keep' });
        }
        return '';
      });
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const configCalls = writeCalls.filter(c => String(c[0]).includes('config.json'));
      const lastConfig = JSON.parse(String(configCalls[configCalls.length - 1]![1]));
      expect(lastConfig.brain_provider).toBe('claude');
      expect(lastConfig.customField).toBe('keep');
    });
  });

  // ─── Doctor integration ──────────────────────────────────────────

  describe('doctor integration', () => {
    it('calls runDoctorChecks during init', async () => {
      await runCommand(['init', '--auto']);
      expect(runDoctorChecks).toHaveBeenCalledWith('/mock/root');
    });

    it('prints health issue message when doctor returns not-ok', async () => {
      vi.mocked(runDoctorChecks).mockReturnValue({
        ok: false,
        checks: [{ name: 'Claude', passed: false, required: true, message: 'Claude not found' }],
      });
      await runCommand(['init', '--auto']);
      const calls = vi.mocked(print).mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('Health check') && c.includes('1 issue'))).toBe(true);
    });

    it('does NOT print health message when doctor returns ok', async () => {
      vi.mocked(runDoctorChecks).mockReturnValue({ ok: true, checks: [] });
      await runCommand(['init', '--auto']);
      const calls = vi.mocked(print).mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('Health check'))).toBe(false);
    });

    it('continues if runDoctorChecks throws', async () => {
      vi.mocked(runDoctorChecks).mockImplementationOnce(() => { throw new Error('doctor fail'); });
      await runCommand(['init', '--auto']);
      // Should still complete
      expect(mkdirSync).toHaveBeenCalled();
    });
  });

  // ─── Environment: CLAUDE.md (vscode/shell) ────────────────────────

  describe('CLAUDE.md for vscode/shell environment', () => {
    it('calls ensureDeckentImport for CLAUDE.md in shell environment', async () => {
      vi.mocked(detectEnvironment).mockReturnValue('shell');
      await runCommand(['init', '--auto']);
      expect(ensureDeckentImport).toHaveBeenCalledWith(
        expect.stringContaining('CLAUDE.md'),
      );
    });

    it('calls ensureDeckentImport for CLAUDE.md in vscode environment', async () => {
      vi.mocked(detectEnvironment).mockReturnValue('vscode');
      await runCommand(['init', '--auto']);
      expect(ensureDeckentImport).toHaveBeenCalledWith(
        expect.stringContaining('CLAUDE.md'),
      );
    });

    it('does NOT write GEMINI.md in shell environment', async () => {
      vi.mocked(detectEnvironment).mockReturnValue('shell');
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const geminiCall = writeCalls.find(c => String(c[0]).endsWith('GEMINI.md'));
      expect(geminiCall).toBeUndefined();
    });

    it('does NOT write cursor rules in shell environment', async () => {
      vi.mocked(detectEnvironment).mockReturnValue('shell');
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const cursorCall = writeCalls.find(c => String(c[0]).includes('deckent.mdc'));
      expect(cursorCall).toBeUndefined();
    });
  });

  // ─── IDE environment flags ─────────────────────────────────────────

  describe('IDE environment flags', () => {
    it('registers --cursor flag', () => {
      const program = new Command();
      registerInit(program);
      const cmd = program.commands.find(c => c.name() === 'init');
      expect(cmd!.options.some(o => o.long === '--cursor')).toBe(true);
    });

    it('registers --claude-code flag', () => {
      const program = new Command();
      registerInit(program);
      const cmd = program.commands.find(c => c.name() === 'init');
      expect(cmd!.options.some(o => o.long === '--claude-code')).toBe(true);
    });

    it('calls getMCPGuidance during init', async () => {
      await runCommand(['init', '--auto']);
      expect(getMCPGuidance).toHaveBeenCalled();
    });

    it('uses cursor IDE when --cursor flag is passed', async () => {
      await runCommand(['init', '--auto', '--cursor']);
      expect(getMCPGuidance).toHaveBeenCalledWith('cursor');
    });

    it('uses claude-code IDE when --claude-code flag is passed', async () => {
      await runCommand(['init', '--auto', '--claude-code']);
      expect(getMCPGuidance).toHaveBeenCalledWith('claude-code');
    });

    it('calls detectIDEEnvironment when no IDE flag is passed', async () => {
      await runCommand(['init', '--auto']);
      expect(detectIDEEnvironment).toHaveBeenCalled();
    });

    it('does NOT call detectIDEEnvironment when --cursor is passed', async () => {
      await runCommand(['init', '--auto', '--cursor']);
      expect(detectIDEEnvironment).not.toHaveBeenCalled();
    });

    it('does NOT call detectIDEEnvironment when --claude-code is passed', async () => {
      await runCommand(['init', '--auto', '--claude-code']);
      expect(detectIDEEnvironment).not.toHaveBeenCalled();
    });

    it('prints MCP guidance lines', async () => {
      vi.mocked(getMCPGuidance).mockReturnValue([
        'Cursor detected — add deckent MCP to ~/.cursor/mcp.json:',
      ]);
      await runCommand(['init', '--auto', '--cursor']);
      const calls = vi.mocked(print).mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('Cursor detected'))).toBe(true);
    });
  });
});

// ─── Human-Friendly Output Format Tests ─────────────────────────────────

import {
  formatWelcomeBanner,
  formatDetectedSetup,
  formatSetupProgress,
  formatNextSteps,
  applyEnvConfig,
} from '../../../src/cli/commands/init.js';
import type { DetectedSetup, SetupStep, EnvName } from '../../../src/cli/commands/init.js';

describe('human-friendly init output', () => {
  // ─── formatWelcomeBanner ────────────────────────────────────────────

  describe('formatWelcomeBanner', () => {
    it('includes "Welcome to Deckent!"', () => {
      expect(formatWelcomeBanner()).toContain('Welcome to Deckent!');
    });
  });

  // ─── formatDetectedSetup ───────────────────────────────────────────

  describe('formatDetectedSetup', () => {
    it('shows "I detected your setup:" header', () => {
      const setup: DetectedSetup = { providers: [] };
      expect(formatDetectedSetup(setup)).toContain('I detected your setup');
    });

    it('shows Node.js version when provided', () => {
      const setup: DetectedSetup = { nodeVersion: 'v22.1.0', providers: [] };
      expect(formatDetectedSetup(setup)).toContain('Node.js v22.1.0');
    });

    it('shows available providers with auth method', () => {
      const setup: DetectedSetup = {
        providers: [{ name: 'claude', available: true, authMethod: 'session' }],
      };
      const output = formatDetectedSetup(setup);
      expect(output).toContain('Claude CLI');
      expect(output).toContain('session');
    });

    it('shows unavailable providers as "Not configured"', () => {
      const setup: DetectedSetup = {
        providers: [{ name: 'gemini', available: false }],
      };
      expect(formatDetectedSetup(setup)).toContain('Not configured');
    });

    it('shows project stack from analysis', () => {
      const setup: DetectedSetup = {
        providers: [],
        stack: { language: 'typescript', framework: 'react' },
      };
      const output = formatDetectedSetup(setup);
      expect(output).toContain('Typescript + React');
      expect(output).toContain('detected from package.json');
    });

    it('skips unknown stack values', () => {
      const setup: DetectedSetup = {
        providers: [],
        stack: { language: 'unknown', framework: 'unknown' },
      };
      const output = formatDetectedSetup(setup);
      expect(output).not.toContain('Project:');
    });

    it('skips framework "none" in stack', () => {
      const setup: DetectedSetup = {
        providers: [],
        stack: { language: 'typescript', framework: 'none' },
      };
      const output = formatDetectedSetup(setup);
      expect(output).toContain('Typescript');
      expect(output).not.toContain('None');
    });

    it('shows provider version when provided', () => {
      const setup: DetectedSetup = {
        providers: [{ name: 'claude', available: true, version: '2.1.0' }],
      };
      expect(formatDetectedSetup(setup)).toContain('v2.1.0');
    });

    it('handles multiple providers', () => {
      const setup: DetectedSetup = {
        providers: [
          { name: 'claude', available: true, authMethod: 'session' },
          { name: 'codex', available: true, authMethod: 'API key' },
          { name: 'gemini', available: false },
        ],
      };
      const output = formatDetectedSetup(setup);
      expect(output).toContain('Claude');
      expect(output).toContain('Codex');
      expect(output).toContain('Gemini');
      expect(output).toContain('Not configured');
    });
  });

  // ─── formatSetupProgress ──────────────────────────────────────────

  describe('formatSetupProgress', () => {
    it('includes "Setting up your AI development team..." header', () => {
      const output = formatSetupProgress([]);
      expect(output).toContain('Setting up your AI development team');
    });

    it('shows completed steps with ✓ icon', () => {
      const steps: SetupStep[] = [
        { label: 'Created .deckent/ configuration', done: true },
      ];
      const output = formatSetupProgress(steps);
      expect(output).toContain('✓');
      expect(output).toContain('Created .deckent/ configuration');
    });

    it('shows incomplete steps with · icon', () => {
      const steps: SetupStep[] = [
        { label: 'Pending step', done: false },
      ];
      const output = formatSetupProgress(steps);
      expect(output).toContain('·');
      expect(output).toContain('Pending step');
    });

    it('shows multiple steps in order', () => {
      const steps: SetupStep[] = [
        { label: 'Step A', done: true },
        { label: 'Step B', done: true },
        { label: 'Step C', done: false },
      ];
      const output = formatSetupProgress(steps);
      const indexA = output.indexOf('Step A');
      const indexB = output.indexOf('Step B');
      const indexC = output.indexOf('Step C');
      expect(indexA).toBeLessThan(indexB);
      expect(indexB).toBeLessThan(indexC);
    });
  });

  // ─── formatNextSteps ──────────────────────────────────────────────

  describe('formatNextSteps', () => {
    it('includes numbered steps 1-3 in English', () => {
      const output = formatNextSteps('en');
      expect(output).toContain('1. Write your goals');
      expect(output).toContain('2. Plan the sprint');
      expect(output).toContain('3. Start working');
    });

    it('includes deckent set-directives command example', () => {
      const output = formatNextSteps('en');
      expect(output).toContain('deckent set-directives');
    });

    it('includes deckent plan command', () => {
      const output = formatNextSteps('en');
      expect(output).toContain('deckent plan');
    });

    it('includes deckent start command', () => {
      const output = formatNextSteps('en');
      expect(output).toContain('deckent start');
    });

    it('includes zero-config mode hint with deckent start + description', () => {
      const output = formatNextSteps('en');
      expect(output).toContain('Or just tell me what to build');
      expect(output).toContain('deckent start "Add JWT');
    });

    it('includes "You\'re ready!" message in English', () => {
      const output = formatNextSteps('en');
      expect(output).toContain("You're ready!");
    });

    it('returns Turkish steps when language is tr', () => {
      const output = formatNextSteps('tr');
      expect(output).toContain('Hazırsınız!');
      expect(output).toContain('1. Hedeflerinizi yazın');
      expect(output).toContain('2. Sprint planlayın');
      expect(output).toContain('3. Çalışmaya başlayın');
    });

    it('includes Turkish zero-config hint', () => {
      const output = formatNextSteps('tr');
      expect(output).toContain('doğrudan ne yapılacağını söyleyin');
    });

    it('defaults to English for unknown language', () => {
      const output = formatNextSteps('de');
      expect(output).toContain("You're ready!");
    });
  });

  // ─── Splash ─────────────────────────────────────────────────────────

  describe('splash on init', () => {
    it('calls showSplash during init', async () => {
      await runCommand(['init', '--auto']);
      expect(showSplash).toHaveBeenCalled();
    });

    it('prints splash output', async () => {
      vi.mocked(showSplash).mockReturnValueOnce('KRAKEN ART');
      await runCommand(['init', '--auto']);
      const calls = vi.mocked(print).mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('KRAKEN ART'))).toBe(true);
    });

    it('continues if showSplash throws', async () => {
      vi.mocked(showSplash).mockImplementationOnce(() => { throw new Error('splash fail'); });
      await runCommand(['init', '--auto']);
      // Should still complete — check that directories were created
      expect(mkdirSync).toHaveBeenCalled();
    });
  });

  // ─── Environment-Aware Config Files ─────────────────────────────────

  describe('environment-aware config', () => {
    it('calls detectEnvironment during init', async () => {
      await runCommand(['init', '--auto']);
      expect(detectEnvironment).toHaveBeenCalled();
    });

    it('creates AGENTS.md template when codex environment detected', async () => {
      vi.mocked(detectEnvironment).mockReturnValue('codex');
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const agentsCall = writeCalls.find(c => String(c[0]).endsWith('AGENTS.md'));
      // AGENTS.md is written (either default or codex template)
      expect(agentsCall).toBeDefined();
    });

    it('AGENTS.md for codex contains Deckent Integration header', async () => {
      vi.mocked(detectEnvironment).mockReturnValue('codex');
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const agentsCall = writeCalls.find(c => String(c[0]).endsWith('AGENTS.md') && String(c[1]).includes('Deckent Integration'));
      expect(agentsCall).toBeDefined();
    });

    it('creates GEMINI.md template when gemini environment detected', async () => {
      vi.mocked(detectEnvironment).mockReturnValue('gemini');
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const geminiCall = writeCalls.find(c => String(c[0]).endsWith('GEMINI.md'));
      expect(geminiCall).toBeDefined();
    });

    it('GEMINI.md contains correct context reference', async () => {
      vi.mocked(detectEnvironment).mockReturnValue('gemini');
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const geminiCall = writeCalls.find(c => String(c[0]).endsWith('GEMINI.md'));
      expect(String(geminiCall?.[1])).toContain('@DECKENT.md');
    });

    it('creates .cursor/rules/deckent.mdc when cursor environment detected', async () => {
      vi.mocked(detectEnvironment).mockReturnValue('cursor');
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const cursorCall = writeCalls.find(c => String(c[0]).includes('deckent.mdc'));
      expect(cursorCall).toBeDefined();
    });

    it('cursor rule file contains DECKENT.md reference', async () => {
      vi.mocked(detectEnvironment).mockReturnValue('cursor');
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const cursorCall = writeCalls.find(c => String(c[0]).includes('deckent.mdc'));
      expect(String(cursorCall?.[1])).toContain('@DECKENT.md');
    });

    it('prints environment info line in summary for any environment', async () => {
      await runCommand(['init', '--auto']);
      const calls = vi.mocked(print).mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('Environment:'))).toBe(true);
    });

    it('prints environment info in summary', async () => {
      vi.mocked(detectEnvironment).mockReturnValue('gemini');
      await runCommand(['init', '--auto']);
      const calls = vi.mocked(print).mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('Environment: gemini'))).toBe(true);
    });

    it('prints codex-specific message for codex environment', async () => {
      vi.mocked(detectEnvironment).mockReturnValue('codex');
      await runCommand(['init', '--auto']);
      const calls = vi.mocked(print).mock.calls.map(c => String(c[0]));
      expect(calls.some(c => c.includes('AGENTS.md') && c.includes('Codex'))).toBe(true);
    });
  });

  // ─── Multi-environment support (--env / --all-envs) ─────────────────

  describe('multi-environment support', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(promptSelect).mockResolvedValue('max_plan' as any);
      vi.mocked(promptText).mockResolvedValue('my-project');
      vi.mocked(detectEnvironment).mockReturnValue('shell');
      vi.mocked(showSplash).mockReturnValue('KRAKEN SPLASH');
      vi.mocked(createDeckTemplate).mockImplementation(() => {});
      vi.mocked(detectAvailableProviders).mockResolvedValue([
        { name: 'claude', available: true, version: '1.0.0', authMethod: 'session', models: ['opus', 'sonnet', 'haiku'] } as any,
      ]);
      vi.mocked(buildProviderWizardSteps).mockReturnValue({
        autoConfig: {
          brain_provider: 'claude' as any,
          worker_provider: 'claude' as any,
          selectedProviders: ['claude'] as any[],
        },
        steps: [],
      });
      vi.mocked(formatProviderAuthGuidance).mockReturnValue([]);
      vi.mocked(getMCPGuidance).mockReturnValue(['Terminal mode']);
      vi.mocked(detectIDEEnvironment).mockReturnValue('terminal' as any);
      vi.mocked(detectFullStack).mockReturnValue({
        language: 'typescript',
        framework: 'express',
        buildTool: 'tsc',
        testFramework: 'vitest',
        commands: { build: 'npx tsc', test: 'npx vitest run', lint: 'npx eslint' },
      });
    });

    it('registers --env flag', () => {
      const program = new Command();
      registerInit(program);
      const cmd = program.commands.find(c => c.name() === 'init');
      expect(cmd!.options.some(o => o.long === '--env')).toBe(true);
    });

    it('registers --all-envs flag', () => {
      const program = new Command();
      registerInit(program);
      const cmd = program.commands.find(c => c.name() === 'init');
      expect(cmd!.options.some(o => o.long === '--all-envs')).toBe(true);
    });

    it('default init (no --env) does NOT call generateCodexConfig', async () => {
      await runCommand(['init', '--auto']);
      expect(generateCodexConfig).not.toHaveBeenCalled();
    });

    it('default init (no --env) does NOT call generateGeminiConfig', async () => {
      await runCommand(['init', '--auto']);
      expect(generateGeminiConfig).not.toHaveBeenCalled();
    });

    it('--env codex calls generateCodexConfig', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto', '--env', 'codex']);
      expect(generateCodexConfig).toHaveBeenCalledWith('/mock/root');
    });

    it('--env codex writes AGENTS.md via generateAgentsMd', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto', '--env', 'codex']);
      expect(generateAgentsMd).toHaveBeenCalled();
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const agentsCall = writeCalls.find(c => String(c[0]).endsWith('AGENTS.md') && String(c[1]).includes('Deckent Integration'));
      expect(agentsCall).toBeDefined();
    });

    it('--env gemini calls generateGeminiConfig', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto', '--env', 'gemini']);
      expect(generateGeminiConfig).toHaveBeenCalledWith('/mock/root');
    });

    it('--env gemini writes GEMINI.md via generateGeminiMd', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto', '--env', 'gemini']);
      expect(generateGeminiMd).toHaveBeenCalled();
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const geminiCall = writeCalls.find(c => String(c[0]).endsWith('GEMINI.md') && String(c[1]).includes('Deckent Integration'));
      expect(geminiCall).toBeDefined();
    });

    it('--env cursor calls generateCursorConfig', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto', '--env', 'cursor']);
      expect(generateCursorConfig).toHaveBeenCalledWith('/mock/root');
    });

    it('--env cursor writes cursor rules via generateCursorRules', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto', '--env', 'cursor']);
      expect(generateCursorRules).toHaveBeenCalled();
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const cursorCall = writeCalls.find(c => String(c[0]).includes('deckent.mdc') && String(c[1]).includes('Deckent'));
      expect(cursorCall).toBeDefined();
    });

    it('--env codex,cursor creates both environment configs', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto', '--env', 'codex,cursor']);
      expect(generateCodexConfig).toHaveBeenCalled();
      expect(generateCursorConfig).toHaveBeenCalled();
    });

    it('--all-envs calls generateCodexConfig, generateGeminiConfig, and generateCursorConfig', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto', '--all-envs']);
      expect(generateCodexConfig).toHaveBeenCalled();
      expect(generateGeminiConfig).toHaveBeenCalled();
      expect(generateCursorConfig).toHaveBeenCalled();
    });

    it('--all-envs writes AGENTS.md, GEMINI.md, and cursor rules', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto', '--all-envs']);
      expect(generateAgentsMd).toHaveBeenCalled();
      expect(generateGeminiMd).toHaveBeenCalled();
      expect(generateCursorRules).toHaveBeenCalled();
    });

    it('multi_ide_mode set in config when --env has multiple values', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto', '--env', 'codex,cursor']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const configCalls = writeCalls.filter(c => String(c[0]).includes('config.json'));
      const hasMultiIde = configCalls.some(c => {
        try {
          const content = JSON.parse(String(c[1]));
          return content.multi_ide_mode === true;
        } catch { return false; }
      });
      expect(hasMultiIde).toBe(true);
    });

    it('multi_ide_mode set when --all-envs is used', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto', '--all-envs']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const configCalls = writeCalls.filter(c => String(c[0]).includes('config.json'));
      const hasMultiIde = configCalls.some(c => {
        try {
          const content = JSON.parse(String(c[1]));
          return content.multi_ide_mode === true;
        } catch { return false; }
      });
      expect(hasMultiIde).toBe(true);
    });

    it('multi_ide_mode NOT set when only single env specified', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto', '--env', 'codex']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const configCalls = writeCalls.filter(c => String(c[0]).includes('config.json'));
      const hasMultiIde = configCalls.some(c => {
        try {
          const content = JSON.parse(String(c[1]));
          return content.multi_ide_mode === true;
        } catch { return false; }
      });
      expect(hasMultiIde).toBe(false);
    });

    it('detectFullStack is called for stack-aware templates when --env is used', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto', '--env', 'codex']);
      expect(detectFullStack).toHaveBeenCalledWith('/mock/root');
    });

    it('stack info is passed to template generators', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto', '--env', 'codex']);
      expect(generateAgentsMd).toHaveBeenCalledWith(expect.objectContaining({
        language: 'typescript',
        framework: 'express',
        commands: expect.objectContaining({ build: 'npx tsc' }),
      }));
    });

    it('gracefully handles detectFullStack failure', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      // Use mockImplementation (not Once) since detectFullStack is now called multiple times
      vi.mocked(detectFullStack).mockImplementation(() => { throw new Error('stack detection fail'); });
      await runCommand(['init', '--auto', '--env', 'codex']);
      // Should still complete with fallback info
      expect(generateAgentsMd).toHaveBeenCalledWith(expect.objectContaining({
        language: 'unknown',
      }));
    });

    it('ignores invalid env names in --env flag', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto', '--env', 'invalid,codex']);
      expect(generateCodexConfig).toHaveBeenCalled();
      // invalid should have been filtered out, no crash
    });
  });

  // ─── .deck template ─────────────────────────────────────────────────

  describe('.deck template creation', () => {
    it('calls createDeckTemplate during init', async () => {
      await runCommand(['init', '--auto']);
      expect(createDeckTemplate).toHaveBeenCalledWith('/mock/root');
    });

    it('continues if createDeckTemplate throws', async () => {
      vi.mocked(createDeckTemplate).mockImplementationOnce(() => { throw new Error('deck fail'); });
      await runCommand(['init', '--auto']);
      // Should still complete
      expect(mkdirSync).toHaveBeenCalled();
    });
  });
  // ─── Task 056-003: New UX features ──────────────────────────────────

  describe('detectSystemLanguage', () => {
    it('returns "tr" when LANG=tr_TR.UTF-8', async () => {
      const { detectSystemLanguage } = await import('../../../src/cli/commands/init.js');
      const origLang = process.env['LANG'];
      process.env['LANG'] = 'tr_TR.UTF-8';
      const lang = detectSystemLanguage();
      expect(lang).toBe('tr');
      if (origLang === undefined) delete process.env['LANG'];
      else process.env['LANG'] = origLang;
    });

    it('returns "en" when LANG=en_US.UTF-8', async () => {
      const { detectSystemLanguage } = await import('../../../src/cli/commands/init.js');
      const origLang = process.env['LANG'];
      process.env['LANG'] = 'en_US.UTF-8';
      const lang = detectSystemLanguage();
      expect(lang).toBe('en');
      if (origLang === undefined) delete process.env['LANG'];
      else process.env['LANG'] = origLang;
    });

    it('falls back to "en" when no LANG env and Intl unavailable', async () => {
      const { detectSystemLanguage } = await import('../../../src/cli/commands/init.js');
      const origLang = process.env['LANG'];
      const origLCAll = process.env['LC_ALL'];
      const origLanguage = process.env['LANGUAGE'];
      delete process.env['LANG'];
      delete process.env['LC_ALL'];
      delete process.env['LANGUAGE'];
      const lang = detectSystemLanguage();
      expect(typeof lang).toBe('string');
      expect(lang.length).toBeGreaterThanOrEqual(2);
      if (origLang !== undefined) process.env['LANG'] = origLang;
      if (origLCAll !== undefined) process.env['LC_ALL'] = origLCAll;
      if (origLanguage !== undefined) process.env['LANGUAGE'] = origLanguage;
    });
  });

  describe('formatRecommendations', () => {
    it('returns empty string for empty reasons', async () => {
      const { formatRecommendations } = await import('../../../src/cli/commands/init.js');
      expect(formatRecommendations([])).toBe('');
    });

    it('formats reasons with arrow prefix', async () => {
      const { formatRecommendations } = await import('../../../src/cli/commands/init.js');
      const result = formatRecommendations(['reason one', 'reason two']);
      expect(result).toContain('→ reason one');
      expect(result).toContain('→ reason two');
      expect(result).toContain('Recommendation reasons:');
    });
  });

  describe('--auto language detection', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(detectFullStack).mockReturnValue({
        language: 'typescript', framework: 'express', buildTool: 'tsc', testFramework: 'vitest',
        commands: { build: 'npx tsc', test: 'npx vitest run', lint: 'npx eslint' },
      });
      vi.mocked(generateSetupRecommendation).mockReturnValue({
        mode: 'max_plan', maxWorkers: 4, brainModel: 'opus', defaultModel: 'sonnet',
        planning: 'ai', reasons: ['test reason'],
      } as any);
      vi.mocked(getSystemProfile).mockReturnValue({ cpus: 8, ram: 16 } as any);
      vi.mocked(detectSubscription).mockReturnValue({ detected: 'max', plan: 'max' } as any);
      vi.mocked(analyzeProject).mockReturnValue({ language: 'typescript', framework: 'none' } as any);
      vi.mocked(detectEnvironment).mockReturnValue('shell');
      vi.mocked(showSplash).mockReturnValue('KRAKEN SPLASH');
      vi.mocked(createDeckTemplate).mockImplementation(() => {});
      vi.mocked(ensureDeckGitignore).mockImplementation(() => {});
      vi.mocked(runDoctorChecks).mockReturnValue({ ok: true, checks: [] });
      vi.mocked(detectAvailableProviders).mockResolvedValue([
        { name: 'claude', available: true, version: '1.0.0', authMethod: 'session', models: ['opus', 'sonnet', 'haiku'] },
      ] as any);
      vi.mocked(buildProviderWizardSteps).mockReturnValue({
        autoConfig: { brain_provider: 'claude', worker_provider: 'claude', selectedProviders: ['claude'] },
        steps: [],
      } as any);
      vi.mocked(getMCPGuidance).mockReturnValue(['MCP guidance line']);
      vi.mocked(formatProviderAuthGuidance).mockReturnValue([]);
      vi.mocked(detectIDEEnvironment).mockReturnValue('terminal');
      vi.mocked(readFileSync).mockReturnValue('{}');
      vi.mocked(promptSelect).mockResolvedValue('max_plan' as any);
      vi.mocked(promptText).mockResolvedValue('my-project');
    });

    it('detects language from system locale in --auto mode', async () => {
      const origLang = process.env['LANG'];
      process.env['LANG'] = 'tr_TR.UTF-8';
      vi.mocked(generateSetupRecommendation).mockReturnValue({
        mode: 'max_plan',
        maxWorkers: 4,
        brainModel: 'opus',
        defaultModel: 'sonnet',
        planning: 'ai',
        reasons: ['test reason'],
      } as any);
      await runCommand(['init', '--auto']);
      // Language should be detected from LANG env
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const configCall = writeCalls.find(c => String(c[0]).includes('config.json'));
      if (configCall) {
        const written = JSON.parse(String(configCall[1]));
        expect(written.language).toBe('tr');
      }
      if (origLang === undefined) delete process.env['LANG'];
      else process.env['LANG'] = origLang;
    });
  });

  describe('recommendation display in --auto mode', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(detectFullStack).mockReturnValue({
        language: 'typescript', framework: 'express', buildTool: 'tsc', testFramework: 'vitest',
        commands: { build: 'npx tsc', test: 'npx vitest run', lint: 'npx eslint' },
      });
      vi.mocked(generateSetupRecommendation).mockReturnValue({
        mode: 'max_plan', maxWorkers: 4, brainModel: 'opus', defaultModel: 'sonnet',
        planning: 'ai', reasons: ['test reason'],
      } as any);
      vi.mocked(getSystemProfile).mockReturnValue({ cpus: 8, ram: 16 } as any);
      vi.mocked(detectSubscription).mockReturnValue({ detected: 'max', plan: 'max' } as any);
      vi.mocked(analyzeProject).mockReturnValue({ language: 'typescript', framework: 'none' } as any);
      vi.mocked(detectEnvironment).mockReturnValue('shell');
      vi.mocked(showSplash).mockReturnValue('KRAKEN SPLASH');
      vi.mocked(createDeckTemplate).mockImplementation(() => {});
      vi.mocked(ensureDeckGitignore).mockImplementation(() => {});
      vi.mocked(runDoctorChecks).mockReturnValue({ ok: true, checks: [] });
      vi.mocked(detectAvailableProviders).mockResolvedValue([
        { name: 'claude', available: true, version: '1.0.0', authMethod: 'session', models: ['opus', 'sonnet', 'haiku'] },
      ] as any);
      vi.mocked(buildProviderWizardSteps).mockReturnValue({
        autoConfig: { brain_provider: 'claude', worker_provider: 'claude', selectedProviders: ['claude'] },
        steps: [],
      } as any);
      vi.mocked(getMCPGuidance).mockReturnValue(['MCP guidance line']);
      vi.mocked(formatProviderAuthGuidance).mockReturnValue([]);
      vi.mocked(detectIDEEnvironment).mockReturnValue('terminal');
      vi.mocked(readFileSync).mockReturnValue('{}');
      vi.mocked(promptSelect).mockResolvedValue('max_plan' as any);
      vi.mocked(promptText).mockResolvedValue('my-project');
    });

    it('shows recommendation reasons after auto-detect', async () => {
      vi.mocked(generateSetupRecommendation).mockReturnValue({
        mode: 'max_plan',
        maxWorkers: 4,
        brainModel: 'opus',
        defaultModel: 'sonnet',
        planning: 'ai',
        reasons: ['Detected Max subscription', 'Multi-core system'],
      } as any);
      await runCommand(['init', '--auto']);
      const printCalls = vi.mocked(print).mock.calls.map(c => String(c[0]));
      const hasRecommendation = printCalls.some(msg => msg.includes('Recommendation reasons') || msg.includes('Detected Max'));
      expect(hasRecommendation).toBe(true);
    });

    it('does not show recommendations when reasons array is empty', async () => {
      vi.mocked(generateSetupRecommendation).mockReturnValue({
        mode: 'max_plan',
        maxWorkers: 4,
        brainModel: 'opus',
        defaultModel: 'sonnet',
        planning: 'ai',
        reasons: [],
      } as any);
      await runCommand(['init', '--auto']);
      const printCalls = vi.mocked(print).mock.calls.map(c => String(c[0]));
      const hasRecommendation = printCalls.some(msg => msg.includes('Recommendation reasons:'));
      expect(hasRecommendation).toBe(false);
    });
  });

  describe('DECKENT.md dynamic build/test commands', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(detectFullStack).mockReturnValue({
        language: 'typescript',
        framework: 'express',
        buildTool: 'tsc',
        testFramework: 'vitest',
        commands: { build: 'npx tsc', test: 'npx vitest run', lint: 'npx eslint' },
      });
      vi.mocked(generateSetupRecommendation).mockReturnValue({
        mode: 'max_plan', maxWorkers: 4, brainModel: 'opus', defaultModel: 'sonnet',
        planning: 'ai', reasons: ['test reason'],
      } as any);
      vi.mocked(getSystemProfile).mockReturnValue({ cpus: 8, ram: 16 } as any);
      vi.mocked(detectSubscription).mockReturnValue({ detected: 'max', plan: 'max' } as any);
      vi.mocked(analyzeProject).mockReturnValue({ language: 'typescript', framework: 'none' } as any);
      vi.mocked(detectEnvironment).mockReturnValue('shell');
      vi.mocked(showSplash).mockReturnValue('KRAKEN SPLASH');
      vi.mocked(createDeckTemplate).mockImplementation(() => {});
      vi.mocked(ensureDeckGitignore).mockImplementation(() => {});
      vi.mocked(runDoctorChecks).mockReturnValue({ ok: true, checks: [] });
      vi.mocked(detectAvailableProviders).mockResolvedValue([
        { name: 'claude', available: true, version: '1.0.0', authMethod: 'session', models: ['opus', 'sonnet', 'haiku'] },
      ] as any);
      vi.mocked(buildProviderWizardSteps).mockReturnValue({
        autoConfig: { brain_provider: 'claude', worker_provider: 'claude', selectedProviders: ['claude'] },
        steps: [],
      } as any);
      vi.mocked(getMCPGuidance).mockReturnValue(['MCP guidance line']);
      vi.mocked(formatProviderAuthGuidance).mockReturnValue([]);
      vi.mocked(detectIDEEnvironment).mockReturnValue('terminal');
      vi.mocked(readFileSync).mockReturnValue('{}');
      vi.mocked(promptSelect).mockResolvedValue('max_plan' as any);
      vi.mocked(promptText).mockResolvedValue('my-project');
    });

    it('uses commands from detectFullStack in DECKENT.md', async () => {
      vi.mocked(detectFullStack).mockReturnValue({
        language: 'python',
        framework: 'flask',
        buildTool: 'pip',
        testFramework: 'pytest',
        commands: { build: 'pip install .', test: 'pytest', lint: 'flake8' },
      });
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const deckentCall = writeCalls.find(c => String(c[0]).includes('DECKENT.md'));
      expect(deckentCall).toBeDefined();
      const content = String(deckentCall![1]);
      expect(content).toContain('Build: pip install .');
      expect(content).toContain('Test: pytest');
      expect(content).toContain('Lint: flake8');
    });

    it('falls back to tsc defaults when detectFullStack throws', async () => {
      vi.mocked(detectFullStack).mockImplementation(() => { throw new Error('fail'); });
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const deckentCall = writeCalls.find(c => String(c[0]).includes('DECKENT.md'));
      expect(deckentCall).toBeDefined();
      const content = String(deckentCall![1]);
      expect(content).toContain('Build: tsc');
      expect(content).toContain('Test: npx vitest run');
    });
  });

  describe('--upgrade flag', () => {
    it('registers --upgrade flag', () => {
      const program = new Command();
      registerInit(program);
      const cmd = program.commands.find(c => c.name() === 'init');
      expect(cmd!.options.some(o => o.long === '--upgrade')).toBe(true);
    });

    it('overwrites DECKENT.md when --upgrade is passed', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ mode: 'pro_plan', language: 'en', projectName: 'old' }));
      await runCommand(['init', '--auto', '--upgrade']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const deckentCall = writeCalls.find(c => String(c[0]).includes('DECKENT.md'));
      // With --upgrade, should write even though file exists
      expect(deckentCall).toBeDefined();
    });
  });

  describe('--env conflict warning', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(detectFullStack).mockReturnValue({
        language: 'typescript', framework: 'express', buildTool: 'tsc', testFramework: 'vitest',
        commands: { build: 'npx tsc', test: 'npx vitest run', lint: 'npx eslint' },
      });
      vi.mocked(generateSetupRecommendation).mockReturnValue({
        mode: 'max_plan', maxWorkers: 4, brainModel: 'opus', defaultModel: 'sonnet',
        planning: 'ai', reasons: ['test reason'],
      } as any);
      vi.mocked(getSystemProfile).mockReturnValue({ cpus: 8, ram: 16 } as any);
      vi.mocked(detectSubscription).mockReturnValue({ detected: 'max', plan: 'max' } as any);
      vi.mocked(analyzeProject).mockReturnValue({ language: 'typescript', framework: 'none' } as any);
      vi.mocked(detectEnvironment).mockReturnValue('shell');
      vi.mocked(showSplash).mockReturnValue('KRAKEN SPLASH');
      vi.mocked(createDeckTemplate).mockImplementation(() => {});
      vi.mocked(ensureDeckGitignore).mockImplementation(() => {});
      vi.mocked(runDoctorChecks).mockReturnValue({ ok: true, checks: [] });
      vi.mocked(detectAvailableProviders).mockResolvedValue([
        { name: 'claude', available: true, version: '1.0.0', authMethod: 'session', models: ['opus', 'sonnet', 'haiku'] },
      ] as any);
      vi.mocked(buildProviderWizardSteps).mockReturnValue({
        autoConfig: { brain_provider: 'claude', worker_provider: 'claude', selectedProviders: ['claude'] },
        steps: [],
      } as any);
      vi.mocked(getMCPGuidance).mockReturnValue(['MCP guidance line']);
      vi.mocked(formatProviderAuthGuidance).mockReturnValue([]);
      vi.mocked(detectIDEEnvironment).mockReturnValue('terminal');
      vi.mocked(readFileSync).mockReturnValue('{}');
      vi.mocked(promptSelect).mockResolvedValue('max_plan' as any);
      vi.mocked(promptText).mockResolvedValue('my-project');
    });

    it('warns when env file already exists without --upgrade', async () => {
      vi.mocked(existsSync).mockImplementation((p) => String(p).includes('AGENTS.md'));
      await runCommand(['init', '--auto', '--env', 'codex']);
      const printCalls = vi.mocked(print).mock.calls.map(c => String(c[0]));
      const hasWarning = printCalls.some(msg => msg.includes('already exists') && msg.includes('--force'));
      expect(hasWarning).toBe(true);
    });

    it('does not warn when --upgrade is passed', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ mode: 'pro_plan' }));
      await runCommand(['init', '--auto', '--env', 'codex', '--upgrade']);
      const printCalls = vi.mocked(print).mock.calls.map(c => String(c[0]));
      const hasWarning = printCalls.some(msg => msg.includes('already exists') && msg.includes('--force'));
      expect(hasWarning).toBe(false);
    });
  });

  describe('--repair flag', () => {
    it('registers --repair flag', () => {
      const program = new Command();
      registerInit(program);
      const cmd = program.commands.find(c => c.name() === 'init');
      expect(cmd!.options.some(o => o.long === '--repair')).toBe(true);
    });
  });

  describe('error recovery messaging', () => {
    it('shows retry hint when init fails', async () => {
      vi.mocked(detectAvailableProviders).mockRejectedValueOnce(new Error('network error'));
      await runCommand(['init', '--auto']);
      const printCalls = vi.mocked(print).mock.calls.map(c => String(c[0]));
      const hasRetryHint = printCalls.some(msg => msg.includes('--upgrade'));
      expect(hasRetryHint).toBe(true);
    });
  });

  // ─── Task 056-002: deepMerge, .deck security, provider fallback, analyzeProject dedup ──

  describe('deepMerge config (056-002-A)', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(detectEnvironment).mockReturnValue('shell');
      vi.mocked(showSplash).mockReturnValue('KRAKEN SPLASH');
      vi.mocked(createDeckTemplate).mockImplementation(() => {});
      vi.mocked(ensureDeckGitignore).mockImplementation(() => {});
      vi.mocked(runDoctorChecks).mockReturnValue({ ok: true, checks: [] });
      vi.mocked(buildProviderWizardSteps).mockReturnValue({
        autoConfig: { brain_provider: 'claude' as any, worker_provider: 'claude' as any, selectedProviders: ['claude'] as any[] },
        steps: [],
      });
      vi.mocked(detectAvailableProviders).mockResolvedValue([
        { name: 'claude', available: true, version: '1.0.0', authMethod: 'session', models: ['opus', 'sonnet', 'haiku'] },
      ] as any);
      vi.mocked(formatProviderAuthGuidance).mockReturnValue([]);
      vi.mocked(getMCPGuidance).mockReturnValue(['Terminal mode']);
      vi.mocked(detectIDEEnvironment).mockReturnValue('terminal');
    });

    it('uses deepMerge instead of shallow Object.assign for config merge', async () => {
      vi.mocked(existsSync).mockImplementation((p) => String(p).includes('config.json'));
      vi.mocked(readFileSync).mockImplementation((p) => {
        if (String(p).includes('config.json')) {
          return JSON.stringify({ mode: 'old', skill_routing: { auto: true, custom: 'keep' } });
        }
        return '';
      });
      await runCommand(['init', '--auto']);
      expect(deepMerge).toHaveBeenCalled();
    });

    it('preserves nested fields during config merge', async () => {
      vi.mocked(existsSync).mockImplementation((p) => String(p).includes('config.json'));
      vi.mocked(readFileSync).mockImplementation((p) => {
        if (String(p).includes('config.json')) {
          return JSON.stringify({ mode: 'old', skill_routing: { auto: true, custom: 'keep' } });
        }
        return '';
      });
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const configCalls = writeCalls.filter(c => String(c[0]).includes('config.json'));
      const hasNestedPreserved = configCalls.some(c => {
        const content = JSON.parse(String(c[1]));
        return content.skill_routing?.custom === 'keep';
      });
      expect(hasNestedPreserved).toBe(true);
    });
  });

  describe('.deck gitignore security (056-002-B)', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(detectEnvironment).mockReturnValue('shell');
      vi.mocked(showSplash).mockReturnValue('KRAKEN SPLASH');
      vi.mocked(createDeckTemplate).mockImplementation(() => {});
      vi.mocked(ensureDeckGitignore).mockImplementation(() => {});
      vi.mocked(runDoctorChecks).mockReturnValue({ ok: true, checks: [] });
      vi.mocked(buildProviderWizardSteps).mockReturnValue({
        autoConfig: { brain_provider: 'claude' as any, worker_provider: 'claude' as any, selectedProviders: ['claude'] as any[] },
        steps: [],
      });
      vi.mocked(detectAvailableProviders).mockResolvedValue([
        { name: 'claude', available: true, version: '1.0.0', authMethod: 'session', models: ['opus', 'sonnet', 'haiku'] },
      ] as any);
      vi.mocked(formatProviderAuthGuidance).mockReturnValue([]);
      vi.mocked(getMCPGuidance).mockReturnValue(['Terminal mode']);
      vi.mocked(detectIDEEnvironment).mockReturnValue('terminal');
    });

    it('calls ensureDeckGitignore after createDeckTemplate', async () => {
      await runCommand(['init', '--auto']);
      expect(ensureDeckGitignore).toHaveBeenCalledWith('/mock/root');
    });

    it('ensureDeckGitignore is called when createDeckTemplate succeeds', async () => {
      vi.mocked(createDeckTemplate).mockImplementation(() => {});
      await runCommand(['init', '--auto']);
      expect(createDeckTemplate).toHaveBeenCalled();
      expect(ensureDeckGitignore).toHaveBeenCalled();
    });

    it('skips ensureDeckGitignore if createDeckTemplate throws', async () => {
      vi.mocked(createDeckTemplate).mockImplementationOnce(() => { throw new Error('fail'); });
      await runCommand(['init', '--auto']);
      expect(ensureDeckGitignore).not.toHaveBeenCalled();
    });
  });

  describe('deepMerge provider config (056-002-A2)', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(detectEnvironment).mockReturnValue('shell');
      vi.mocked(showSplash).mockReturnValue('KRAKEN SPLASH');
      vi.mocked(createDeckTemplate).mockImplementation(() => {});
      vi.mocked(ensureDeckGitignore).mockImplementation(() => {});
      vi.mocked(runDoctorChecks).mockReturnValue({ ok: true, checks: [] });
      vi.mocked(buildProviderWizardSteps).mockReturnValue({
        autoConfig: { brain_provider: 'claude' as any, worker_provider: 'claude' as any, selectedProviders: ['claude'] as any[] },
        steps: [],
      });
      vi.mocked(detectAvailableProviders).mockResolvedValue([
        { name: 'claude', available: true, version: '1.0.0', authMethod: 'session', models: ['opus', 'sonnet', 'haiku'] },
      ] as any);
      vi.mocked(formatProviderAuthGuidance).mockReturnValue([]);
      vi.mocked(getMCPGuidance).mockReturnValue(['Terminal mode']);
      vi.mocked(detectIDEEnvironment).mockReturnValue('terminal');
    });

    it('uses deepMerge for provider config merge with existing config', async () => {
      vi.mocked(existsSync).mockImplementation((p) => String(p).includes('config.json'));
      vi.mocked(readFileSync).mockImplementation((p) => {
        if (String(p).includes('config.json')) {
          return JSON.stringify({ mode: 'max_plan', modes: { max_plan: { workers: 8 } } });
        }
        return '';
      });
      await runCommand(['init', '--auto']);
      // deepMerge should be called for both initial config merge and provider config merge
      expect(deepMerge).toHaveBeenCalledTimes(2);
    });

    it('writes fresh config when no existing config exists', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const configCalls = writeCalls.filter(c => String(c[0]).includes('config.json'));
      expect(configCalls.length).toBeGreaterThanOrEqual(1);
      const firstConfig = JSON.parse(String(configCalls[0]![1]));
      expect(firstConfig).toHaveProperty('mode');
    });
  });

  describe('provider wizard --auto fallback (056-002-C)', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(detectEnvironment).mockReturnValue('shell');
      vi.mocked(showSplash).mockReturnValue('KRAKEN SPLASH');
      vi.mocked(createDeckTemplate).mockImplementation(() => {});
      vi.mocked(ensureDeckGitignore).mockImplementation(() => {});
      vi.mocked(runDoctorChecks).mockReturnValue({ ok: true, checks: [] });
      vi.mocked(formatProviderAuthGuidance).mockReturnValue([]);
      vi.mocked(getMCPGuidance).mockReturnValue(['Terminal mode']);
      vi.mocked(detectIDEEnvironment).mockReturnValue('terminal');
    });

    it('assigns fallback_provider when multiple providers available in --auto mode', async () => {
      vi.mocked(buildProviderWizardSteps).mockReturnValue({
        autoConfig: null,
        steps: [],
      });
      vi.mocked(detectAvailableProviders).mockResolvedValue([
        { name: 'claude', available: true, models: ['opus', 'sonnet', 'haiku'] },
        { name: 'codex', available: true, models: ['gpt-4.1'] },
      ] as any);
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const configCalls = writeCalls.filter(c => String(c[0]).includes('config.json'));
      const hasFallback = configCalls.some(c => {
        const content = JSON.parse(String(c[1]));
        return content.fallback_provider === 'codex';
      });
      expect(hasFallback).toBe(true);
    });

    it('does not set fallback_provider when only one provider in --auto mode', async () => {
      vi.mocked(buildProviderWizardSteps).mockReturnValue({
        autoConfig: null,
        steps: [],
      });
      vi.mocked(detectAvailableProviders).mockResolvedValue([
        { name: 'claude', available: true, models: ['opus', 'sonnet', 'haiku'] },
        { name: 'codex', available: false, models: [] },
      ] as any);
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['init', '--auto']);
      const writeCalls = vi.mocked(writeFileSync).mock.calls;
      const configCalls = writeCalls.filter(c => String(c[0]).includes('config.json'));
      const hasFallback = configCalls.some(c => {
        const content = JSON.parse(String(c[1]));
        return content.fallback_provider !== undefined;
      });
      expect(hasFallback).toBe(false);
    });
  });

  describe('analyzeProject dedup (056-002-D)', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(detectEnvironment).mockReturnValue('shell');
      vi.mocked(showSplash).mockReturnValue('KRAKEN SPLASH');
      vi.mocked(createDeckTemplate).mockImplementation(() => {});
      vi.mocked(ensureDeckGitignore).mockImplementation(() => {});
      vi.mocked(runDoctorChecks).mockReturnValue({ ok: true, checks: [] });
      vi.mocked(buildProviderWizardSteps).mockReturnValue({
        autoConfig: { brain_provider: 'claude' as any, worker_provider: 'claude' as any, selectedProviders: ['claude'] as any[] },
        steps: [],
      });
      vi.mocked(detectAvailableProviders).mockResolvedValue([
        { name: 'claude', available: true, version: '1.0.0', authMethod: 'session', models: ['opus', 'sonnet', 'haiku'] },
      ] as any);
      vi.mocked(formatProviderAuthGuidance).mockReturnValue([]);
      vi.mocked(getMCPGuidance).mockReturnValue(['Terminal mode']);
      vi.mocked(detectIDEEnvironment).mockReturnValue('terminal');
    });

    it('reuses detectedAnalysis for PROJECT-IDENTITY.md in --auto mode', async () => {
      await runCommand(['init', '--auto']);
      // analyzeProject should be called only once (at the top of --auto mode)
      expect(analyzeProject).toHaveBeenCalledTimes(1);
    });

    it('does not call analyzeProject in interactive mode', async () => {
      vi.mocked(promptSelect).mockResolvedValue('max_plan' as any);
      vi.mocked(promptText).mockResolvedValue('my-project');
      await runCommand(['init']);
      expect(analyzeProject).not.toHaveBeenCalled();
    });
  });
});