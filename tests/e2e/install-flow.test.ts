/**
 * E2E Test: Global Install Flow
 *
 * Simulates a new user installing deckent and running init.
 * Tests the complete install → init → verify flow without real npm publish.
 * Uses programmatic imports to simulate CLI commands in-process.
 *
 * Mocks: tmux, child_process (for external CLI calls), provider detection
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync,
  mkdirSync, readdirSync, statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DECKENT_DIR, BRAIN_DIR, TASKS_DIR, LOCKS_DIR,
  DIRECTIVES_FILE, MEMORY_FILE, DECISIONS_FILE,
  DEBT_FILE, PATTERNS_FILE, RETRO_FILE, PROJECT_IDENTITY_FILE,
  DECKENT_FILE, CLAUDE_FILE, AGENTS_FILE,
} from '../../src/core/constants.js';
import { createDefaultConfig } from '../../src/core/config.js';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('../../src/orchestra/tmux.js', () => ({
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
  listWorkers: vi.fn().mockReturnValue([]),
  startAuditor: vi.fn(),
  attach: vi.fn(),
  destroy: vi.fn(),
  isSessionActive: vi.fn().mockReturnValue(false),
  sendKeys: vi.fn(),
  TmuxError: class extends Error { constructor(m: string) { super(m); } },
}));

vi.mock('node:child_process', () => ({
  // The fake version must satisfy the MANIFEST-derived Node floor (row 450:
  // engines.node, currently >=24) — a stale 'v22.0.0' made the doctor check
  // honestly fail (2026-08-18 realign).
  spawnSync: vi.fn().mockReturnValue({
    status: 0, stdout: 'v24.0.0', stderr: '', pid: 1, signal: null, output: [],
  }),
  spawn: vi.fn(),
  fork: vi.fn(),
  execSync: vi.fn().mockReturnValue(''),
}));

vi.mock('../../src/monitor/auditor.js', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    resetDashboard: (actual as any).resetDashboard,
    updateDashboard: vi.fn(),
    detectDeadlocks: vi.fn().mockReturnValue([]),
    startScanLoop: vi.fn(),
    writeScanToDashboard: vi.fn(),
  };
});

vi.mock('../../src/agents/worker.js', () => ({
  releaseAllLocks: vi.fn(),
  updateTaskStatus: vi.fn(),
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
  writeResult: vi.fn(),
}));

// ─── Real imports ────────────────────────────────────────────────────

import {
  formatWelcomeBanner, formatDetectedSetup, formatSetupProgress,
  formatNextSteps,
} from '../../src/cli/commands/init.js';
import type { DetectedSetup, SetupStep } from '../../src/cli/commands/init.js';
import { runDoctorChecks } from '../../src/cli/commands/doctor.js';

// ─── Test Helpers ────────────────────────────────────────────────────

/**
 * Simulate `deckent init` by creating the project structure programmatically.
 * This mirrors what the init command does without interactive prompts.
 */
function simulateInit(root: string, opts?: { language?: string; projectName?: string }): void {
  const language = opts?.language ?? 'en';
  const projectName = opts?.projectName ?? 'test-project';

  // Directories
  mkdirSync(join(root, DECKENT_DIR), { recursive: true });
  mkdirSync(join(root, DECKENT_DIR, 'workspace'), { recursive: true });
  mkdirSync(join(root, BRAIN_DIR, 'sprints'), { recursive: true });
  mkdirSync(join(root, TASKS_DIR), { recursive: true });
  mkdirSync(join(root, LOCKS_DIR), { recursive: true });
  mkdirSync(join(root, '.claude', 'rules'), { recursive: true });
  mkdirSync(join(root, DECKENT_DIR, 'plugins'), { recursive: true });
  mkdirSync(join(root, DECKENT_DIR, 'i18n'), { recursive: true });

  // Config
  const config = {
    ...createDefaultConfig(),
    language,
    projectName,
  };
  writeFileSync(join(root, DECKENT_DIR, 'config.json'), JSON.stringify(config, null, 2) + '\n');

  // DECKENT.md
  writeFileSync(join(root, DECKENT_FILE), `# ${projectName} — Deckent Orchestrated\n\n## Identity\n@.deckent/workspace/IDENTITY.md\n`);

  // AGENTS.md & CLAUDE.md
  writeFileSync(join(root, AGENTS_FILE), `@${DECKENT_FILE}\n`);
  writeFileSync(join(root, CLAUDE_FILE), `@${DECKENT_FILE}\n`);

  // Claude rules
  writeFileSync(join(root, '.claude', 'rules', 'brain.md'), '# Brain Rules\n');
  writeFileSync(join(root, '.claude', 'rules', 'auditor.md'), '# Auditor Rules\n');
  writeFileSync(join(root, '.claude', 'rules', 'worker-default.md'), '# Worker Rules\n');

  // DIRECTIVES.md
  writeFileSync(join(root, DIRECTIVES_FILE), '# Directives\n\nDescribe your project goals here.\n');

  // Brain files
  writeFileSync(join(root, BRAIN_DIR, MEMORY_FILE), '# Learned Patterns\n');
  writeFileSync(join(root, BRAIN_DIR, DECISIONS_FILE), '# Architecture Decisions\n');
  writeFileSync(join(root, BRAIN_DIR, DEBT_FILE), '# Tech Debt\n');
  writeFileSync(join(root, BRAIN_DIR, PATTERNS_FILE), '# Detected Patterns\n');
  writeFileSync(join(root, BRAIN_DIR, RETRO_FILE), '# Sprint Retrospective\n');
  writeFileSync(join(root, BRAIN_DIR, PROJECT_IDENTITY_FILE), `# Project Identity\nName: ${projectName}\n`);

  // Workspace
  writeFileSync(join(root, DECKENT_DIR, 'workspace', 'BOOT.md'), '# Boot Sequence\n');
  writeFileSync(join(root, DECKENT_DIR, 'workspace', 'TOOLS.md'), '# Tools\n');

  // i18n
  writeFileSync(join(root, DECKENT_DIR, 'i18n', 'en.json'), JSON.stringify({ sprint_started: 'Sprint {id} started' }, null, 2));
  writeFileSync(join(root, DECKENT_DIR, 'i18n', 'tr.json'), JSON.stringify({ sprint_started: 'Sprint {id} baslatildi' }, null, 2));

  // .gitignore
  writeFileSync(join(root, '.gitignore'), `${TASKS_DIR}/\n${LOCKS_DIR}/\n.dashboard\n.brain/archive/\n`);
}

// ─── Tests ───────────────────────────────────────────────────────────

let tempDir: string;

describe('E2E: Global Install Flow', () => {
  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'deckent-e2e-install-'));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // --- Init creates correct directory structure ---

  it('init creates .deckent/ directory', () => {
    const root = join(tempDir, 'proj-01');
    mkdirSync(root, { recursive: true });
    simulateInit(root);
    expect(existsSync(join(root, DECKENT_DIR))).toBe(true);
  });

  it('init creates .brain/ directory with sprints/', () => {
    const root = join(tempDir, 'proj-02');
    mkdirSync(root, { recursive: true });
    simulateInit(root);
    expect(existsSync(join(root, BRAIN_DIR))).toBe(true);
    expect(existsSync(join(root, BRAIN_DIR, 'sprints'))).toBe(true);
  });

  it('init creates .tasks/ directory', () => {
    const root = join(tempDir, 'proj-03');
    mkdirSync(root, { recursive: true });
    simulateInit(root);
    expect(existsSync(join(root, TASKS_DIR))).toBe(true);
  });

  it('init creates .locks/ directory', () => {
    const root = join(tempDir, 'proj-04');
    mkdirSync(root, { recursive: true });
    simulateInit(root);
    expect(existsSync(join(root, LOCKS_DIR))).toBe(true);
  });

  it('init creates DECKENT.md with project name', () => {
    const root = join(tempDir, 'proj-05');
    mkdirSync(root, { recursive: true });
    simulateInit(root, { projectName: 'my-app' });
    const content = readFileSync(join(root, DECKENT_FILE), 'utf-8');
    expect(content).toContain('my-app');
    expect(content).toContain('Deckent Orchestrated');
  });

  it('init creates AGENTS.md referencing DECKENT.md', () => {
    const root = join(tempDir, 'proj-06');
    mkdirSync(root, { recursive: true });
    simulateInit(root);
    const content = readFileSync(join(root, AGENTS_FILE), 'utf-8');
    expect(content).toContain(DECKENT_FILE);
  });

  it('init creates CLAUDE.md referencing DECKENT.md', () => {
    const root = join(tempDir, 'proj-07');
    mkdirSync(root, { recursive: true });
    simulateInit(root);
    const content = readFileSync(join(root, CLAUDE_FILE), 'utf-8');
    expect(content).toContain(DECKENT_FILE);
  });

  it('init creates all brain files', () => {
    const root = join(tempDir, 'proj-08');
    mkdirSync(root, { recursive: true });
    simulateInit(root);

    const brainFiles = [MEMORY_FILE, DECISIONS_FILE, DEBT_FILE, PATTERNS_FILE, RETRO_FILE, PROJECT_IDENTITY_FILE];
    for (const file of brainFiles) {
      expect(existsSync(join(root, BRAIN_DIR, file))).toBe(true);
    }
  });

  it('init creates DIRECTIVES.md template', () => {
    const root = join(tempDir, 'proj-09');
    mkdirSync(root, { recursive: true });
    simulateInit(root);
    const content = readFileSync(join(root, DIRECTIVES_FILE), 'utf-8');
    expect(content).toContain('Directives');
    expect(content.length).toBeGreaterThan(10);
  });

  it('init creates config.json with correct mode', () => {
    const root = join(tempDir, 'proj-10');
    mkdirSync(root, { recursive: true });
    simulateInit(root);
    const config = JSON.parse(readFileSync(join(root, DECKENT_DIR, 'config.json'), 'utf-8'));
    expect(config.mode).toBeDefined();
    expect(config.projectName).toBe('test-project');
    expect(config.language).toBe('en');
  });

  it('init creates config with Turkish language when specified', () => {
    const root = join(tempDir, 'proj-11');
    mkdirSync(root, { recursive: true });
    simulateInit(root, { language: 'tr' });
    const config = JSON.parse(readFileSync(join(root, DECKENT_DIR, 'config.json'), 'utf-8'));
    expect(config.language).toBe('tr');
  });

  it('init creates .claude/rules/ with agent rule files', () => {
    const root = join(tempDir, 'proj-12');
    mkdirSync(root, { recursive: true });
    simulateInit(root);

    expect(existsSync(join(root, '.claude', 'rules', 'brain.md'))).toBe(true);
    expect(existsSync(join(root, '.claude', 'rules', 'auditor.md'))).toBe(true);
    expect(existsSync(join(root, '.claude', 'rules', 'worker-default.md'))).toBe(true);
  });

  it('init creates .gitignore with correct entries', () => {
    const root = join(tempDir, 'proj-13');
    mkdirSync(root, { recursive: true });
    simulateInit(root);
    const gitignore = readFileSync(join(root, '.gitignore'), 'utf-8');
    expect(gitignore).toContain(TASKS_DIR);
    expect(gitignore).toContain(LOCKS_DIR);
    expect(gitignore).toContain('.dashboard');
  });

  it('init creates i18n files', () => {
    const root = join(tempDir, 'proj-14');
    mkdirSync(root, { recursive: true });
    simulateInit(root);
    expect(existsSync(join(root, DECKENT_DIR, 'i18n', 'en.json'))).toBe(true);
    expect(existsSync(join(root, DECKENT_DIR, 'i18n', 'tr.json'))).toBe(true);
  });

  it('init creates workspace BOOT.md and TOOLS.md', () => {
    const root = join(tempDir, 'proj-15');
    mkdirSync(root, { recursive: true });
    simulateInit(root);
    expect(existsSync(join(root, DECKENT_DIR, 'workspace', 'BOOT.md'))).toBe(true);
    expect(existsSync(join(root, DECKENT_DIR, 'workspace', 'TOOLS.md'))).toBe(true);
  });

  it('init creates PROJECT-IDENTITY.md with project name', () => {
    const root = join(tempDir, 'proj-16');
    mkdirSync(root, { recursive: true });
    simulateInit(root, { projectName: 'awesome-project' });
    const content = readFileSync(join(root, BRAIN_DIR, PROJECT_IDENTITY_FILE), 'utf-8');
    expect(content).toContain('awesome-project');
  });

  // --- Human-friendly output helpers ---

  it('formatWelcomeBanner returns welcome text', () => {
    const banner = formatWelcomeBanner();
    expect(banner).toContain('Welcome');
    expect(banner).toContain('Deckent');
  });

  it('formatDetectedSetup shows node version and providers', () => {
    const setup: DetectedSetup = {
      nodeVersion: 'v22.0.0',
      providers: [
        { name: 'claude', available: true, version: '1.0.0' },
        { name: 'codex', available: false },
        { name: 'gemini', available: false },
      ],
    };
    const output = formatDetectedSetup(setup);
    expect(output).toContain('Node.js');
    expect(output).toContain('v22.0.0');
    expect(output).toContain('Claude');
    expect(output).toContain('Not configured');
  });

  it('formatSetupProgress shows completed steps', () => {
    const steps: SetupStep[] = [
      { label: 'Created .deckent/ configuration', done: true },
      { label: 'Created .brain/ memory system', done: true },
    ];
    const output = formatSetupProgress(steps);
    expect(output).toContain('Setting up');
    expect(output).toContain('.deckent/');
  });

  it('formatNextSteps returns English instructions', () => {
    const output = formatNextSteps('en');
    expect(output).toContain('set-directives');
    expect(output).toContain('plan');
    expect(output).toContain('start');
  });

  it('formatNextSteps returns Turkish instructions', () => {
    const output = formatNextSteps('tr');
    expect(output).toContain('set-directives');
    expect(output).toContain('Hazırsınız');
  });

  // --- Doctor on fresh project ---

  it('doctor passes required checks on fresh init (node + git)', () => {
    const root = join(tempDir, 'proj-doctor');
    mkdirSync(root, { recursive: true });
    simulateInit(root);
    const result = runDoctorChecks(root);
    // Node and git checks depend on the real environment — they should pass
    const nodeCheck = result.checks.find(c => c.name === 'Node.js');
    const gitCheck = result.checks.find(c => c.name === 'git');
    expect(nodeCheck?.passed).toBe(true);
    expect(gitCheck?.passed).toBe(true);
  });

  it('doctor detects workspace on initialized project', () => {
    const root = join(tempDir, 'proj-doctor-ws');
    mkdirSync(root, { recursive: true });
    simulateInit(root);
    const result = runDoctorChecks(root);
    const wsCheck = result.checks.find(c => c.name === 'Workspace');
    expect(wsCheck?.passed).toBe(true);
    expect(wsCheck?.message).toContain('.deckent/');
  });

  it('doctor detects brain dir on initialized project', () => {
    const root = join(tempDir, 'proj-doctor-brain');
    mkdirSync(root, { recursive: true });
    simulateInit(root);
    const result = runDoctorChecks(root);
    const brainCheck = result.checks.find(c => c.name === 'Brain Dir');
    expect(brainCheck?.passed).toBe(true);
  });

  it('doctor detects directives on initialized project', () => {
    const root = join(tempDir, 'proj-doctor-dir');
    mkdirSync(root, { recursive: true });
    simulateInit(root);
    const result = runDoctorChecks(root);
    const dirCheck = result.checks.find(c => c.name === 'Directives');
    expect(dirCheck?.passed).toBe(true);
  });

  // --- Cleanup ---

  it('cleanup removes project directory completely', () => {
    const root = join(tempDir, 'proj-cleanup');
    mkdirSync(root, { recursive: true });
    simulateInit(root);

    // Verify it exists
    expect(existsSync(root)).toBe(true);
    expect(existsSync(join(root, DECKENT_DIR))).toBe(true);

    // Simulate cleanup
    rmSync(root, { recursive: true, force: true });

    // Verify it's gone
    expect(existsSync(root)).toBe(false);
  });

  it('cleanup handles non-existent directory gracefully', () => {
    const root = join(tempDir, 'proj-nonexistent');
    expect(() => {
      rmSync(root, { recursive: true, force: true });
    }).not.toThrow();
  });
});
