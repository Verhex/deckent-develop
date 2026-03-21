import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  cpSync: vi.fn(),
  rmSync: vi.fn(),
  statSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatTable: vi.fn().mockReturnValue('formatted-table'),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../../src/core/skill-types.js', () => ({
  createSkillDefinition: vi.fn((partial: Record<string, unknown>) => ({
    id: partial.id,
    name: partial.name,
    version: '0.1.0',
    description: partial.description ?? '',
    entrypoint: 'SKILL.md',
    category: 'tool',
    triggers: [],
    stackDetection: { files: [], dependencies: [], commands: [] },
    composableWith: [],
    priority: 0,
    promptInjection: { position: 'append', maxTokens: 1500 },
    enabled: true,
    stats: { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '' },
    ...partial,
  })),
  createDefaultSkillStats: vi.fn(() => ({
    totalUses: 0,
    successRate: 0,
    avgCoverage: 0,
    lastUsedInSprint: '',
  })),
}));

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, cpSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { print, printError, formatTable } from '../../../src/cli/helpers/output.js';
import { registerSkill } from '../../../src/cli/commands/skill.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSkillManifest(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: 'test-skill',
    name: 'Test Skill',
    version: '0.1.0',
    description: 'A test skill',
    entrypoint: 'SKILL.md',
    category: 'language',
    triggers: ['test', 'spec'],
    stackDetection: { files: [], dependencies: [], commands: [] },
    composableWith: [],
    priority: 5,
    promptInjection: { position: 'append', maxTokens: 1500 },
    enabled: true,
    stats: { totalUses: 10, successRate: 0.85, avgCoverage: 75, lastUsedInSprint: 'sprint-001' },
    ...overrides,
  };
}

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerSkill(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride throws on --help / exit
  }
}

// ─── Task 18: skill list ─────────────────────────────────────────────────────

describe('skill command registration', () => {
  it('registers skill command on program', () => {
    const program = new Command();
    registerSkill(program);
    const cmd = program.commands.find(c => c.name() === 'skill');
    expect(cmd).toBeDefined();
    expect(cmd!.description()).toContain('skill');
  });

  it('has list subcommand', () => {
    const program = new Command();
    registerSkill(program);
    const cmd = program.commands.find(c => c.name() === 'skill')!;
    const list = cmd.commands.find(c => c.name() === 'list');
    expect(list).toBeDefined();
  });

  it('has create subcommand', () => {
    const program = new Command();
    registerSkill(program);
    const cmd = program.commands.find(c => c.name() === 'skill')!;
    const create = cmd.commands.find(c => c.name() === 'create');
    expect(create).toBeDefined();
  });

  it('has install subcommand', () => {
    const program = new Command();
    registerSkill(program);
    const cmd = program.commands.find(c => c.name() === 'skill')!;
    const install = cmd.commands.find(c => c.name() === 'install');
    expect(install).toBeDefined();
  });
});

describe('skill list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('prints no skills message when directory does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(['skill', 'list']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('No skills found'));
  });

  it('prints no skills message when directory is empty', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([]);
    await runCommand(['skill', 'list']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('No skills found'));
  });

  it('prints formatted table when skills exist', async () => {
    const skill = makeSkillManifest();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'test-skill', isDirectory: () => true } as any,
    ]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(skill));
    await runCommand(['skill', 'list']);
    expect(formatTable).toHaveBeenCalledWith(
      ['Name', 'Category', 'Status', 'Triggers', 'Priority'],
      [['Test Skill', 'language', 'enabled', 'test, spec', '5']],
    );
    expect(print).toHaveBeenCalledWith('formatted-table');
  });

  it('outputs JSON when --json flag is used', async () => {
    const skill = makeSkillManifest();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'test-skill', isDirectory: () => true } as any,
    ]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(skill));
    await runCommand(['skill', 'list', '--json']);
    const printCalls = vi.mocked(print).mock.calls;
    const jsonCall = printCalls.find(c => {
      try { JSON.parse(c[0]); return true; } catch { return false; }
    });
    expect(jsonCall).toBeDefined();
    const parsed = JSON.parse(jsonCall![0]);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].name).toBe('Test Skill');
  });

  it('filters by category with --category', async () => {
    const langSkill = makeSkillManifest({ id: 'lang-skill', name: 'Lang Skill', category: 'language' });
    const toolSkill = makeSkillManifest({ id: 'tool-skill', name: 'Tool Skill', category: 'tool' });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'lang-skill', isDirectory: () => true } as any,
      { name: 'tool-skill', isDirectory: () => true } as any,
    ]);
    vi.mocked(readFileSync)
      .mockReturnValueOnce(JSON.stringify(langSkill))
      .mockReturnValueOnce(JSON.stringify(toolSkill));
    await runCommand(['skill', 'list', '--category', 'language']);
    expect(formatTable).toHaveBeenCalledWith(
      expect.any(Array),
      [expect.arrayContaining(['Lang Skill'])],
    );
  });

  it('shows disabled status for disabled skill', async () => {
    const skill = makeSkillManifest({ enabled: false });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'test-skill', isDirectory: () => true } as any,
    ]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(skill));
    await runCommand(['skill', 'list']);
    expect(formatTable).toHaveBeenCalledWith(
      expect.any(Array),
      [expect.arrayContaining(['disabled'])],
    );
  });

  it('handles multiple skills', async () => {
    const skill1 = makeSkillManifest({ id: 'alpha', name: 'Alpha' });
    const skill2 = makeSkillManifest({ id: 'beta', name: 'Beta', priority: 10 });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'alpha', isDirectory: () => true } as any,
      { name: 'beta', isDirectory: () => true } as any,
    ]);
    vi.mocked(readFileSync)
      .mockReturnValueOnce(JSON.stringify(skill1))
      .mockReturnValueOnce(JSON.stringify(skill2));
    await runCommand(['skill', 'list']);
    expect(formatTable).toHaveBeenCalledWith(
      expect.any(Array),
      expect.arrayContaining([
        expect.arrayContaining(['Alpha']),
        expect.arrayContaining(['Beta']),
      ]),
    );
  });

  it('sets exitCode=1 on error', async () => {
    vi.mocked(existsSync).mockImplementation(() => { throw new Error('access denied'); });
    await runCommand(['skill', 'list']);
    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('skips non-directory entries', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'not-a-dir', isDirectory: () => false } as any,
    ]);
    await runCommand(['skill', 'list']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('No skills found'));
  });

  it('skips malformed skill manifests', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'broken', isDirectory: () => true } as any,
    ]);
    vi.mocked(readFileSync).mockReturnValue('{invalid json');
    await runCommand(['skill', 'list']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('No skills found'));
  });

  it('truncates triggers longer than 3', async () => {
    const skill = makeSkillManifest({ triggers: ['a', 'b', 'c', 'd', 'e'] });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'test-skill', isDirectory: () => true } as any,
    ]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(skill));
    await runCommand(['skill', 'list']);
    expect(formatTable).toHaveBeenCalledWith(
      expect.any(Array),
      [expect.arrayContaining(['a, b, c...'])],
    );
  });

  it('shows empty triggers correctly', async () => {
    const skill = makeSkillManifest({ triggers: [] });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'test-skill', isDirectory: () => true } as any,
    ]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(skill));
    await runCommand(['skill', 'list']);
    expect(formatTable).toHaveBeenCalledWith(
      expect.any(Array),
      [expect.arrayContaining([''])],
    );
  });
});

// ─── Task 19: skill create ───────────────────────────────────────────────────

describe('skill create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('creates skill directory and files', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(['skill', 'create', 'my-skill']);
    expect(mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('my-skill'),
      { recursive: true },
    );
    expect(writeFileSync).toHaveBeenCalledTimes(2); // manifest.json + SKILL.md
  });

  it('writes valid manifest.json with defaults', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(['skill', 'create', 'new-skill']);
    const jsonCall = vi.mocked(writeFileSync).mock.calls.find(
      c => String(c[0]).includes('manifest.json'),
    );
    expect(jsonCall).toBeDefined();
    const config = JSON.parse(String(jsonCall![1]));
    expect(config.id).toBe('new-skill');
    expect(config.name).toBe('new-skill');
    expect(config.enabled).toBe(true);
    expect(config.version).toBe('0.1.0');
  });

  it('writes SKILL.md template with skill name', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(['skill', 'create', 'code-fixer']);
    const skillCall = vi.mocked(writeFileSync).mock.calls.find(
      c => String(c[0]).includes('SKILL.md'),
    );
    expect(skillCall).toBeDefined();
    expect(String(skillCall![1])).toContain('code-fixer');
    expect(String(skillCall![1])).toContain('# Skill:');
  });

  it('prints success message with directory', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(['skill', 'create', 'my-skill']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('my-skill'));
    expect(print).toHaveBeenCalledWith(expect.stringContaining('created'));
  });

  it('rejects invalid name with special characters', async () => {
    await runCommand(['skill', 'create', 'bad skill!']);
    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Invalid skill name') }),
    );
    expect(process.exitCode).toBe(1);
  });

  it('rejects name with underscores', async () => {
    await runCommand(['skill', 'create', 'bad_name']);
    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Invalid skill name') }),
    );
    expect(process.exitCode).toBe(1);
  });

  it('rejects special character only name', async () => {
    await runCommand(['skill', 'create', '@#$']);
    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('rejects duplicate skill', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    await runCommand(['skill', 'create', 'existing-skill']);
    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('already exists') }),
    );
    expect(process.exitCode).toBe(1);
  });

  it('accepts alphanumeric name with hyphens', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(['skill', 'create', 'my-skill-v2']);
    expect(printError).not.toHaveBeenCalled();
    expect(print).toHaveBeenCalledWith(expect.stringContaining('my-skill-v2'));
  });

  it('prints file list after creation', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(['skill', 'create', 'test-writer']);
    expect(print).toHaveBeenCalledWith('  - manifest.json');
    expect(print).toHaveBeenCalledWith('  - SKILL.md');
  });

  it('sets exitCode=1 on filesystem error', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(mkdirSync).mockImplementation(() => { throw new Error('EACCES'); });
    await runCommand(['skill', 'create', 'test']);
    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

// ─── Task 20: skill install ─────────────────────────────────────────────────

describe('skill install — local path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('installs skill from local directory', async () => {
    const manifest = makeSkillManifest();
    vi.mocked(existsSync).mockImplementation((p: any) => {
      const pathStr = String(p);
      if (pathStr.includes('manifest.json') && pathStr.includes('/mock/root/')) return false;
      if (pathStr.includes('.deckent/skills/test-skill')) return false;
      return true;
    });
    vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as any);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(manifest));
    await runCommand(['skill', 'install', '/tmp/my-skill-source']);
    expect(cpSync).toHaveBeenCalled();
    expect(print).toHaveBeenCalledWith(expect.stringContaining('installed'));
  });

  it('rejects non-existent source path', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(['skill', 'install', '/nonexistent/path']);
    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Source path not found') }),
    );
    expect(process.exitCode).toBe(1);
  });

  it('rejects non-directory source', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(statSync).mockReturnValue({ isDirectory: () => false } as any);
    await runCommand(['skill', 'install', '/tmp/not-a-dir.txt']);
    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('must be a directory') }),
    );
    expect(process.exitCode).toBe(1);
  });

  it('rejects source without manifest.json', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => {
      if (String(p).includes('manifest.json')) return false;
      return true;
    });
    vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as any);
    await runCommand(['skill', 'install', '/tmp/no-manifest']);
    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('manifest.json') }),
    );
    expect(process.exitCode).toBe(1);
  });

  it('rejects invalid manifest.json', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as any);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ invalid: true }));
    await runCommand(['skill', 'install', '/tmp/bad-manifest']);
    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Invalid manifest.json') }),
    );
    expect(process.exitCode).toBe(1);
  });

  it('rejects duplicate without --force', async () => {
    const manifest = makeSkillManifest();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as any);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(manifest));
    await runCommand(['skill', 'install', '/tmp/my-skill-source']);
    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('already exists') }),
    );
    expect(process.exitCode).toBe(1);
  });

  it('overwrites existing with --force', async () => {
    const manifest = makeSkillManifest();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as any);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(manifest));
    await runCommand(['skill', 'install', '/tmp/my-skill-source', '--force']);
    expect(rmSync).toHaveBeenCalled();
    expect(cpSync).toHaveBeenCalled();
    expect(print).toHaveBeenCalledWith(expect.stringContaining('installed'));
  });

  it('sets exitCode=1 on filesystem error', async () => {
    vi.mocked(existsSync).mockImplementation(() => { throw new Error('EACCES'); });
    await runCommand(['skill', 'install', '/tmp/source']);
    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe('skill install — git URL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('clones from git URL and installs', async () => {
    const manifest = makeSkillManifest();
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stderr: '', stdout: '' } as any);
    vi.mocked(existsSync).mockImplementation((p: any) => {
      const pathStr = String(p);
      if (pathStr.includes('.tmp-clone') && !pathStr.includes('manifest.json') && !pathStr.includes('.git')) return true;
      if (pathStr.includes('.tmp-clone/manifest.json')) return true;
      if (pathStr.includes('.tmp-clone/.git')) return true;
      if (pathStr.includes('.deckent/skills/test-skill') && !pathStr.includes('.tmp-clone')) return false;
      return false;
    });
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(manifest));
    await runCommand(['skill', 'install', 'https://github.com/user/skill-repo.git']);
    expect(spawnSync).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['clone']),
      expect.objectContaining({ timeout: 30_000 }),
    );
    expect(cpSync).toHaveBeenCalled();
    expect(print).toHaveBeenCalledWith(expect.stringContaining('installed from git'));
  });

  it('handles git clone failure', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stderr: 'auth failed', stdout: '' } as any);
    await runCommand(['skill', 'install', 'https://github.com/user/bad-repo.git']);
    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Git clone failed') }),
    );
    expect(process.exitCode).toBe(1);
  });

  it('handles missing manifest in cloned repo', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stderr: '', stdout: '' } as any);
    vi.mocked(existsSync).mockImplementation((p: any) => {
      if (String(p).includes('manifest.json')) return false;
      if (String(p).includes('.tmp-clone')) return true;
      return false;
    });
    await runCommand(['skill', 'install', 'https://github.com/user/no-manifest.git']);
    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('manifest.json') }),
    );
    expect(rmSync).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('detects https:// as git URL', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stderr: 'fail', stdout: '' } as any);
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(['skill', 'install', 'https://github.com/user/repo']);
    expect(spawnSync).toHaveBeenCalledWith('git', expect.any(Array), expect.any(Object));
  });

  it('detects git@ as git URL', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stderr: 'fail', stdout: '' } as any);
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(['skill', 'install', 'git@github.com:user/repo.git']);
    expect(spawnSync).toHaveBeenCalledWith('git', expect.any(Array), expect.any(Object));
  });

  it('rejects duplicate from git without --force', async () => {
    const manifest = makeSkillManifest();
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stderr: '', stdout: '' } as any);
    vi.mocked(existsSync).mockImplementation((p: any) => {
      const pathStr = String(p);
      if (pathStr.includes('.tmp-clone')) return true;
      if (pathStr.includes('manifest.json')) return true;
      if (pathStr.includes('.deckent/skills/test-skill')) return true;
      return false;
    });
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(manifest));
    await runCommand(['skill', 'install', 'https://github.com/user/repo.git']);
    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('already exists') }),
    );
    expect(process.exitCode).toBe(1);
  });
});
