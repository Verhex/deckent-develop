import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let testRoot = '/tmp/test';

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => testRoot,
}));

vi.mock('../../../src/cli/helpers/config-reader.js', () => ({
  getLangFromConfig: () => 'en',
}));

vi.mock('../../../src/orchestra/brain.js', () => ({
  cleanup: vi.fn(),
  runDecay: vi.fn(),
}));

vi.mock('../../../src/orchestra/tmux.js', () => ({
  destroy: vi.fn(),
}));

const output: string[] = [];
vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: (msg: string) => output.push(msg),
  printError: (err: unknown) => output.push(String(err)),
}));

vi.mock('../../../src/cli/helpers/messages.js', () => ({
  getMessage: (key: string) => key,
  getLanguage: () => 'en',
  resolveLanguage: () => 'en',
}));

import { registerCleanup } from '../../../src/cli/commands/cleanup.js';
import { Command } from 'commander';
import { cleanup } from '../../../src/orchestra/brain.js';
import { destroy } from '../../../src/orchestra/tmux.js';

function runCleanup(...args: string[]): void {
  const program = new Command();
  program.exitOverride();
  registerCleanup(program);
  try {
    program.parse(['node', 'test', 'cleanup', ...args]);
  } catch {
    // exitOverride throws on exit
  }
}

describe('cleanup --dry-run', () => {
  beforeEach(() => {
    output.length = 0;
    vi.clearAllMocks();
    testRoot = join(tmpdir(), `cleanup-dryrun-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it('should list task files without deleting them', () => {
    const tasksDir = join(testRoot, '.tasks');
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(join(tasksDir, 'task-001.json'), '{}');
    writeFileSync(join(tasksDir, 'task-001.plan'), '');
    writeFileSync(join(tasksDir, 'task-001.hb'), '{}');

    runCleanup('--dry-run');

    const joined = output.join('\n');
    expect(joined).toContain('[dry-run]');
    expect(joined).toContain('3 task file(s)');
    expect(existsSync(join(tasksDir, 'task-001.json'))).toBe(true);
    expect(existsSync(join(tasksDir, 'task-001.plan'))).toBe(true);
    expect(existsSync(join(tasksDir, 'task-001.hb'))).toBe(true);
  });

  it('should not call cleanup() or destroy()', () => {
    mkdirSync(join(testRoot, '.tasks'), { recursive: true });

    runCleanup('--dry-run');

    expect(cleanup).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });

  it('should list lock files correctly', () => {
    const tasksDir = join(testRoot, '.tasks');
    const locksDir = join(testRoot, '.locks');
    mkdirSync(tasksDir, { recursive: true });
    mkdirSync(locksDir, { recursive: true });
    writeFileSync(join(locksDir, 'src__cli__config.lock'), '{}');
    writeFileSync(join(locksDir, 'src__core__utils.lock'), '{}');

    runCleanup('--dry-run');

    const joined = output.join('\n');
    expect(joined).toContain('2 lock file(s)');
    expect(joined).toContain('src__cli__config.lock');
    expect(readdirSync(locksDir)).toHaveLength(2);
  });

  it('does not advertise canonical execution-authority artifacts as cleanup targets', () => {
    const locksDir = join(testRoot, '.locks');
    mkdirSync(locksDir, { recursive: true });
    writeFileSync(join(locksDir, 'src__cli__config.lock'), '{}');
    writeFileSync(join(locksDir, 'execution-lock-authority.sqlite3'), 'authority');
    writeFileSync(join(locksDir, 'execution-lock-authority.sqlite3-wal'), 'wal');
    writeFileSync(join(locksDir, 'execution-lock-authority.sentinel.json'), '{}');
    writeFileSync(join(locksDir, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.executionlock'), '{}');
    mkdirSync(join(locksDir, 'execution-lock-authority-adoptions'));

    runCleanup('--dry-run');

    const joined = output.join('\n');
    expect(joined).toContain('1 lock file(s)');
    expect(joined).toContain('src__cli__config.lock');
    expect(joined).not.toContain('execution-lock-authority.sqlite3');
    expect(joined).not.toContain('.executionlock');
    expect(readdirSync(locksDir)).toHaveLength(6);
  });

  it('should list prompt files correctly', () => {
    const tasksDir = join(testRoot, '.tasks');
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(join(tasksDir, '.prompt-001.txt'), 'prompt');

    runCleanup('--dry-run');

    const joined = output.join('\n');
    expect(joined).toContain('1 prompt file(s)');
    expect(joined).toContain('.prompt-001.txt');
  });

  it('should handle empty directories without errors', () => {
    mkdirSync(join(testRoot, '.tasks'), { recursive: true });

    runCleanup('--dry-run');

    const joined = output.join('\n');
    expect(joined).toContain('0 task file(s)');
    expect(joined).toContain('0 lock file(s)');
    expect(joined).toContain('0 prompt file(s)');
  });

  it('should handle missing tasks directory', () => {
    runCleanup('--dry-run');

    const joined = output.join('\n');
    expect(joined).toContain('0 task file(s)');
  });

  it('should show tmux session info', () => {
    mkdirSync(join(testRoot, '.tasks'), { recursive: true });

    runCleanup('--dry-run');

    expect(output.join('\n')).toContain('tmux session: deckent-orchestra');
  });

  it('should show individual file names', () => {
    const tasksDir = join(testRoot, '.tasks');
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(join(tasksDir, 'task-sprint-055-001.json'), '{}');
    writeFileSync(join(tasksDir, 'task-sprint-055-001.result'), '');

    runCleanup('--dry-run');

    const joined = output.join('\n');
    expect(joined).toContain('task-sprint-055-001.json');
    expect(joined).toContain('task-sprint-055-001.result');
  });

  it('should count only matching extensions for task files', () => {
    const tasksDir = join(testRoot, '.tasks');
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(join(tasksDir, 'task-001.json'), '{}');
    writeFileSync(join(tasksDir, 'task-001.log'), '');
    writeFileSync(join(tasksDir, 'random.txt'), '');

    runCleanup('--dry-run');

    expect(output.join('\n')).toContain('2 task file(s)');
  });
});
