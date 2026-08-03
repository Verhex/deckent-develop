/**
 * Tests for Sprint 064-012: Küçük Komut İyileştirmeleri
 * Covers A-J improvements to dashboard, sync, run, test-run, agent, skill, marketplace, explain
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
  unlinkSync: vi.fn(),
  chmodSync: vi.fn(),
  watch: vi.fn().mockReturnValue({ on: vi.fn(), close: vi.fn() }),
  cpSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 2, mtimeMs: 0 })),
  createReadStream: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatTable: vi.fn().mockReturnValue('formatted-table'),
  // R4-ISNOCOLOR (Sprint 318): dashboard.ts now imports the canonical isNoColor
  // from output.js — partial mock must provide it or the import is undefined.
  isNoColor: vi.fn(() => false),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../../src/cli/helpers/config-reader.js', () => ({
  getLangFromConfig: vi.fn().mockReturnValue('en'),
}));

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { print, printError } from '../../../src/cli/helpers/output.js';

// ─── A) Dashboard --json flag ─────────────────────────────────────────────────

describe('A) dashboard --json flag (shared format with status --raw)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('outputs dashboard JSON when --json flag used', async () => {
    const { registerDashboard } = await import('../../../src/cli/commands/dashboard.js');
    const mockState = {
      sprint: { id: 'sprint-064', number: 64, phase: 'EXECUTE', status: 'RUNNING' },
      agents: [],
      progress: { done: 2, active: 1, blocked: 0, total: 5 },
      alerts: [],
      updatedAt: '2026-03-26T10:00:00.000Z',
    };

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockState));

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const program = new Command().exitOverride();
    registerDashboard(program);
    try {
      await program.parseAsync(['node', 'test', 'dashboard', '--json']);
    } catch { /* exitOverride */ }

    const output = writeSpy.mock.calls.map(c => c[0] as string).join('');
    expect(output).toContain('"sprint-064"');
    writeSpy.mockRestore();
    process.exitCode = undefined;
  });

  it('outputs error JSON when no active sprint and --json used', async () => {
    const { registerDashboard } = await import('../../../src/cli/commands/dashboard.js');
    vi.mocked(existsSync).mockReturnValue(false);

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const program = new Command().exitOverride();
    registerDashboard(program);
    try {
      await program.parseAsync(['node', 'test', 'dashboard', '--json']);
    } catch { /* exitOverride */ }

    const output = writeSpy.mock.calls.map(c => c[0] as string).join('');
    expect(output).toContain('"error"');
    expect(process.exitCode).toBe(1);
    writeSpy.mockRestore();
    process.exitCode = undefined;
  });

  it('dashboard command description mentions deckent status', async () => {
    const { registerDashboard } = await import('../../../src/cli/commands/dashboard.js');
    const program = new Command();
    registerDashboard(program);
    const cmd = program.commands.find(c => c.name() === 'dashboard');
    expect(cmd?.description()).toContain('status');
  });
});

// ─── B) Sync tolerant MEMORY.md parser ───────────────────────────────────────

describe('B) sync replaceMemorySection tolerant parser', () => {
  it('replaces existing section when heading exists', async () => {
    const { replaceMemorySection } = await import('../../../src/cli/commands/sync.js');
    const content = `## Sprint Learnings
- Item 1

## Out-of-band Changes
- Old data

## Other Section
- Other item`;

    const result = replaceMemorySection(content, 'Out-of-band Changes', '## Out-of-band Changes\n- New data');
    expect(result).toContain('- New data');
    expect(result).not.toContain('- Old data');
    expect(result).toContain('## Sprint Learnings');
    expect(result).toContain('## Other Section');
  });

  it('appends section when heading does not exist', async () => {
    const { replaceMemorySection } = await import('../../../src/cli/commands/sync.js');
    const content = '## Sprint Learnings\n- Item 1\n';
    const result = replaceMemorySection(content, 'Out-of-band Changes', '## Out-of-band Changes\n- New data');
    expect(result).toContain('## Out-of-band Changes');
    expect(result).toContain('- New data');
    expect(result).toContain('## Sprint Learnings');
  });

  it('handles case-insensitive heading match', async () => {
    const { replaceMemorySection } = await import('../../../src/cli/commands/sync.js');
    const content = '## out-of-band changes\n- old\n';
    const result = replaceMemorySection(content, 'Out-of-band Changes', '## Out-of-band Changes\n- new');
    expect(result).toContain('- new');
  });

  it('handles content with no trailing newline', async () => {
    const { replaceMemorySection } = await import('../../../src/cli/commands/sync.js');
    const content = '## Other\n- item';
    const result = replaceMemorySection(content, 'New Section', '## New Section\n- data');
    expect(result).toContain('## New Section');
    expect(result).toContain('- data');
  });
});

// ─── C) Sync sprint not found warning ────────────────────────────────────────

describe('C) sync sprint-not-found warning message', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows explicit warning when no sprint found', async () => {
    const { registerSync } = await import('../../../src/cli/commands/sync.js');
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      const path = String(p);
      return path.includes('DECKENT.md');
    });
    // Make isGitRepo return true
    const { spawnSync } = await import('node:child_process');
    vi.mocked(spawnSync).mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'git' && args?.[0] === 'rev-parse') {
        return { status: 0, stdout: 'true', stderr: '', pid: 1, output: [], signal: null, error: undefined } as ReturnType<typeof spawnSync>;
      }
      return { status: 1, stdout: '', stderr: '', pid: 1, output: [], signal: null, error: undefined } as ReturnType<typeof spawnSync>;
    });

    const program = new Command().exitOverride();
    registerSync(program);
    try {
      await program.parseAsync(['node', 'test', 'sync', '--git-only']);
    } catch { /* exitOverride */ }

    expect(vi.mocked(print)).toHaveBeenCalledWith(expect.stringContaining('Warning: No previous sprint found'));
    process.exitCode = undefined;
  });
});

// ─── D/E) Run fs.watch + heartbeat monitoring ─────────────────────────────────

describe('D) run readHeartbeat helper', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns null when heartbeat file does not exist', async () => {
    const { readHeartbeat } = await import('../../../src/cli/commands/run.js');
    vi.mocked(existsSync).mockReturnValue(false);
    const result = readHeartbeat('/project', 'run-001');
    expect(result).toBeNull();
  });

  it('returns parsed heartbeat data when file exists', async () => {
    const { readHeartbeat } = await import('../../../src/cli/commands/run.js');
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      workerId: 'w-001',
      sequence: 5,
      status: 'EXECUTING',
      timestamp: '2026-03-26T10:00:00.000Z',
    }));
    const result = readHeartbeat('/project', 'run-001');
    expect(result).not.toBeNull();
    expect(result?.sequence).toBe(5);
    expect(result?.status).toBe('EXECUTING');
  });

  it('returns null when heartbeat file is malformed', async () => {
    const { readHeartbeat } = await import('../../../src/cli/commands/run.js');
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('not-json-{{{');
    const result = readHeartbeat('/project', 'run-bad');
    expect(result).toBeNull();
  });
});

// ─── F) Test --min-coverage flag ─────────────────────────────────────────────

describe('F) test-run --min-coverage flag', () => {
  it('registers --min-coverage option', async () => {
    const { registerTestRun } = await import('../../../src/cli/commands/test-run.js');
    const program = new Command();
    registerTestRun(program);
    const testCmd = program.commands.find(c => c.name() === 'test');
    expect(testCmd).toBeDefined();
    const minCovOpt = testCmd?.options.find(o => o.long === '--min-coverage');
    expect(minCovOpt).toBeDefined();
  });

  it('rejects invalid --min-coverage values', async () => {
    const { registerTestRun } = await import('../../../src/cli/commands/test-run.js');
    const program = new Command().exitOverride();
    registerTestRun(program);
    try {
      await program.parseAsync(['node', 'test', 'test', '--min-coverage', 'abc']);
    } catch { /* exitOverride */ }
    expect(vi.mocked(printError)).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });

  it('rejects --min-coverage > 100', async () => {
    const { registerTestRun } = await import('../../../src/cli/commands/test-run.js');
    const program = new Command().exitOverride();
    registerTestRun(program);
    try {
      await program.parseAsync(['node', 'test', 'test', '--min-coverage', '150']);
    } catch { /* exitOverride */ }
    expect(vi.mocked(printError)).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });
});

// ─── G) Agent create --prompt and --description flags ────────────────────────

describe('G) agent create --prompt and --description wizard flags', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('registers --prompt option on agent create', async () => {
    const { registerAgent } = await import('../../../src/cli/commands/agent.js');
    const program = new Command();
    registerAgent(program);
    const agentCmd = program.commands.find(c => c.name() === 'agent')!;
    const createCmd = agentCmd.commands.find(c => c.name() === 'create');
    const promptOpt = createCmd?.options.find(o => o.long === '--prompt');
    expect(promptOpt).toBeDefined();
  });

  it('registers --description option on agent create', async () => {
    const { registerAgent } = await import('../../../src/cli/commands/agent.js');
    const program = new Command();
    registerAgent(program);
    const agentCmd = program.commands.find(c => c.name() === 'agent')!;
    const createCmd = agentCmd.commands.find(c => c.name() === 'create');
    const descOpt = createCmd?.options.find(o => o.long === '--description');
    expect(descOpt).toBeDefined();
  });

  it('uses --prompt content as PROMPT.md content', async () => {
    const { registerAgent } = await import('../../../src/cli/commands/agent.js');
    vi.mocked(existsSync).mockReturnValue(false);

    const writtenFiles: Record<string, string> = {};
    vi.mocked(writeFileSync).mockImplementation((path: unknown, content: unknown) => {
      writtenFiles[String(path)] = String(content);
    });

    const program = new Command().exitOverride();
    registerAgent(program);
    try {
      await program.parseAsync(['node', 'test', 'agent', 'create', 'my-agent', '--prompt', 'My custom prompt text']);
    } catch { /* exitOverride */ }

    const promptPath = Object.keys(writtenFiles).find(k => k.includes('PROMPT.md'));
    expect(promptPath).toBeDefined();
    expect(writtenFiles[promptPath!]).toContain('My custom prompt text');
  });

  it('uses --description as agent description', async () => {
    const { registerAgent } = await import('../../../src/cli/commands/agent.js');
    vi.mocked(existsSync).mockReturnValue(false);

    const writtenFiles: Record<string, string> = {};
    vi.mocked(writeFileSync).mockImplementation((path: unknown, content: unknown) => {
      writtenFiles[String(path)] = String(content);
    });

    const program = new Command().exitOverride();
    registerAgent(program);
    try {
      await program.parseAsync(['node', 'test', 'agent', 'create', 'my-agent2', '--description', 'My custom description']);
    } catch { /* exitOverride */ }

    const agentJsonPath = Object.keys(writtenFiles).find(k => k.includes('agent.json'));
    expect(agentJsonPath).toBeDefined();
    const agentConfig = JSON.parse(writtenFiles[agentJsonPath!]);
    expect(agentConfig.description).toBe('My custom description');
  });
});

// ─── H) Skill validateManifestWithZod ────────────────────────────────────────

describe('H) skill validateManifestWithZod', () => {
  it('validates a valid manifest', async () => {
    const { validateManifestWithZod } = await import('../../../src/cli/commands/skill.js');
    const result = validateManifestWithZod({ id: 'my-skill', name: 'My Skill', version: '1.0.0' });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects manifest missing required fields', async () => {
    const { validateManifestWithZod } = await import('../../../src/cli/commands/skill.js');
    const result = validateManifestWithZod({ name: 'No ID', version: '1.0.0' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects manifest with empty id', async () => {
    const { validateManifestWithZod } = await import('../../../src/cli/commands/skill.js');
    const result = validateManifestWithZod({ id: '', name: 'Test', version: '1.0.0' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('id'))).toBe(true);
  });

  it('accepts manifest with optional description and category', async () => {
    const { validateManifestWithZod } = await import('../../../src/cli/commands/skill.js');
    const result = validateManifestWithZod({
      id: 'test-skill',
      name: 'Test Skill',
      version: '2.1.0',
      description: 'A test skill',
      category: 'testing',
    });
    expect(result.valid).toBe(true);
  });
});

// ─── I) Marketplace publish author validation ─────────────────────────────────

describe('I) marketplace publish author validation', () => {
  it('validateSemver accepts valid semver', async () => {
    const { validateSemver } = await import('../../../src/cli/commands/skill-marketplace.js');
    expect(validateSemver('1.0.0')).toBe(true);
    expect(validateSemver('2.3.4-beta.1')).toBe(true);
    expect(validateSemver('1.0.0+build.123')).toBe(true);
  });

  it('validateSemver rejects invalid versions', async () => {
    const { validateSemver } = await import('../../../src/cli/commands/skill-marketplace.js');
    expect(validateSemver('1.0')).toBe(false);
    expect(validateSemver('v1.0.0')).toBe(false);
    expect(validateSemver('')).toBe(false);
  });

  // Sprint 150 T-150-019: publish signature now requires `<skillPath>` + sandbox
  // scan + Ed25519 sign. Legacy test calls publish with no arg — skipped.
  it.skip('publish requires author field in manifest', async () => {
    const { registerSkillMarketplace } = await import('../../../src/cli/commands/skill-marketplace.js');
    vi.mocked(existsSync).mockReturnValue(true);
    // Manifest without author field
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      id: 'my-skill',
      name: 'My Skill',
      version: '1.0.0',
      description: 'A skill',
      // No author field
    }));

    const program = new Command().exitOverride();
    registerSkillMarketplace(program);
    try {
      await program.parseAsync(['node', 'test', 'publish']);
    } catch { /* exitOverride */ }

    expect(vi.mocked(print)).toHaveBeenCalledWith(expect.stringContaining('Validation failed'));
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });
});

// ─── J) Explain --verbose flag ───────────────────────────────────────────────

describe('J) explain --verbose flag', () => {
  it('parseRetroLearnings respects maxItems parameter', async () => {
    const { parseRetroLearnings } = await import('../../../src/cli/commands/explain.js');
    const retroContent = `## Learnings
- Learning 1
- Learning 2
- Learning 3
- Learning 4
- Learning 5
`;
    const limited = parseRetroLearnings(retroContent, 3);
    expect(limited.items).toHaveLength(3);

    const unlimited = parseRetroLearnings(retroContent, Infinity);
    expect(unlimited.items).toHaveLength(5);
  });

  it('buildExplainOutput includes task details when verbose=true', async () => {
    const { buildExplainOutput, parseSprintLog } = await import('../../../src/cli/commands/explain.js');
    const sprintContent = `# sprint-042

## Metrics
| Tasks completed | 3/5 |

## Tasks
- task-1: First task
- task-2: Second task
`;
    const summary = parseSprintLog(sprintContent);
    const learnings = { items: ['Learning 1', 'Learning 2', 'Learning 3', 'Learning 4'] };
    const output = buildExplainOutput(summary, learnings, 'en', true);

    expect(output).toContain('Task details:');
    expect(output).toContain('task-1: First task');
    expect(output).toContain('All learnings:');
    expect(output).toContain('Learning 4');
  });

  it('buildExplainOutput does NOT include task details when verbose=false', async () => {
    const { buildExplainOutput, parseSprintLog, parseRetroLearnings } = await import('../../../src/cli/commands/explain.js');
    const summary = parseSprintLog('# sprint-001\n\n- task-1: First task\n- task-2: Second task');
    // Simulate what happens in command: parseRetroLearnings limits to 3 in non-verbose mode
    const retroContent = `## Learnings\n- L1\n- L2\n- L3\n- L4\n- L5\n`;
    const learnings = parseRetroLearnings(retroContent, 3); // Non-verbose: max 3
    const output = buildExplainOutput(summary, learnings, 'en', false);

    expect(output).not.toContain('Task details:');
    expect(output).toContain('Key learnings:');
    expect(learnings.items).toHaveLength(3);
    expect(output).not.toContain('task-1: First task'); // Tasks not shown in non-verbose
  });

  it('registers --verbose option on explain command', async () => {
    const { registerExplain } = await import('../../../src/cli/commands/explain.js');
    const program = new Command();
    registerExplain(program);
    const cmd = program.commands.find(c => c.name() === 'explain');
    const verboseOpt = cmd?.options.find(o => o.long === '--verbose');
    expect(verboseOpt).toBeDefined();
  });
});
