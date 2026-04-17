import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';

// Mock resolveProjectRoot to point to a temp dir
let projectRoot: string;
vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => projectRoot,
}));

import { registerRemember } from '../../src/cli/commands/remember.js';

// ── Output capture ──────────────────────────────────────────────

let stdoutData: string[];
let stderrData: string[];
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

function captureOutput(): void {
  stdoutData = [];
  stderrData = [];
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data) => {
    stdoutData.push(String(data));
    return true;
  });
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((data) => {
    stderrData.push(String(data));
    return true;
  });
}

function restoreOutput(): void {
  stdoutSpy?.mockRestore();
  stderrSpy?.mockRestore();
}

function getStdout(): string { return stdoutData.join(''); }
function getStderr(): string { return stderrData.join(''); }

// ── Helpers ─────────────────────────────────────────────────────

function ensureDb(root: string): string {
  const { mkdirSync } = require('node:fs');
  const brainDir = join(root, '.brain');
  mkdirSync(brainDir, { recursive: true });
  const dbPath = join(brainDir, 'memory.db');
  const store = new MemoryStore(dbPath);
  store.close();
  return dbPath;
}

async function runRemember(args: string[]): Promise<string> {
  const program = new Command();
  program.exitOverride();
  registerRemember(program);
  try {
    await program.parseAsync(['node', 'test', 'remember', ...args]);
  } catch {
    // commander exit override throws
  }
  return getStdout();
}

// ── Tests ───────────────────────────────────────────────────────

describe('remember command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectRoot = mkdtempSync(join(tmpdir(), 'remember-test-'));
    captureOutput();
  });

  afterEach(() => {
    restoreOutput();
    try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('prints error when memory.db does not exist', async () => {
    await runRemember(['test note']);
    const stderr = getStderr();
    expect(stderr).toContain('Memory V2 DB not found');
  });

  it('inserts a basic note with default type', async () => {
    const dbPath = ensureDb(projectRoot);

    const output = await runRemember(['This is a test note']);
    expect(output).toContain('Stored');
    expect(output).toContain('[memory]');
    expect(output).toContain('This is a test note');

    // Verify in DB
    const store = new MemoryStore(dbPath);
    const entries = store.getByType('memory');
    expect(entries.length).toBeGreaterThanOrEqual(1);
    const found = entries.find(e => e.content === 'This is a test note');
    expect(found).toBeTruthy();
    store.close();
  });

  it('inserts with custom type via --type flag', async () => {
    const dbPath = ensureDb(projectRoot);

    const output = await runRemember(['Security finding note', '--type', 'pattern']);
    expect(output).toContain('[pattern]');

    const store = new MemoryStore(dbPath);
    const entries = store.getByType('pattern');
    expect(entries.length).toBe(1);
    expect(entries[0]!.content).toBe('Security finding note');
    store.close();
  });

  it('inserts with tags via --tags flag', async () => {
    const dbPath = ensureDb(projectRoot);

    const output = await runRemember(['Docker learning', '--tags', 'docker,backend']);
    expect(output).toContain('Tags: docker, backend');

    const store = new MemoryStore(dbPath);
    const entries = store.getByType('memory');
    const entry = entries.find(e => e.content === 'Docker learning');
    expect(entry).toBeTruthy();
    const tags = store.getTagsForEntry(entry!.id);
    expect(tags).toContain('docker');
    expect(tags).toContain('backend');
    store.close();
  });

  it('uses custom title via --title flag', async () => {
    const dbPath = ensureDb(projectRoot);

    const output = await runRemember(['Long detailed note content here', '--title', 'Custom Title']);
    expect(output).toContain('Custom Title');

    const store = new MemoryStore(dbPath);
    const entries = store.getByType('memory');
    const entry = entries.find(e => e.title === 'Custom Title');
    expect(entry).toBeTruthy();
    expect(entry!.content).toBe('Long detailed note content here');
    store.close();
  });

  it('truncates title to 60 chars + ellipsis when no --title given', async () => {
    const dbPath = ensureDb(projectRoot);
    const longNote = 'A'.repeat(80);

    await runRemember([longNote]);

    const store = new MemoryStore(dbPath);
    const entries = store.getByType('memory');
    const entry = entries.find(e => e.content === longNote);
    expect(entry).toBeTruthy();
    expect(entry!.title.length).toBeLessThanOrEqual(63); // 60 + '...'
    expect(entry!.title).toContain('...');
    store.close();
  });

  it('does not add ellipsis for short notes', async () => {
    const dbPath = ensureDb(projectRoot);

    await runRemember(['Short note']);

    const store = new MemoryStore(dbPath);
    const entries = store.getByType('memory');
    const entry = entries.find(e => e.content === 'Short note');
    expect(entry).toBeTruthy();
    expect(entry!.title).toBe('Short note');
    expect(entry!.title).not.toContain('...');
    store.close();
  });

  it('sets source as "user"', async () => {
    const dbPath = ensureDb(projectRoot);

    await runRemember(['User-sourced note']);

    const store = new MemoryStore(dbPath);
    const entries = store.getByType('memory');
    const entry = entries.find(e => e.content === 'User-sourced note');
    expect(entry).toBeTruthy();
    expect(entry!.source).toBe('user');
    store.close();
  });

  it('ignores empty tags', async () => {
    const dbPath = ensureDb(projectRoot);

    const output = await runRemember(['Note with empty tags', '--tags', ',,,']);
    // No tags line should be printed (empty tags filtered out)
    expect(output).not.toContain('Tags:');

    const store = new MemoryStore(dbPath);
    const entries = store.getByType('memory');
    const entry = entries.find(e => e.content === 'Note with empty tags');
    expect(entry).toBeTruthy();
    const tags = store.getTagsForEntry(entry!.id);
    expect(tags).toHaveLength(0);
    store.close();
  });

  it('handles special characters in note content', async () => {
    const dbPath = ensureDb(projectRoot);
    const specialNote = 'Note with "quotes" & <brackets> and Türkçe İĞÜŞÇÖ';

    await runRemember([specialNote]);

    const store = new MemoryStore(dbPath);
    const entries = store.getByType('memory');
    const entry = entries.find(e => e.content === specialNote);
    expect(entry).toBeTruthy();
    store.close();
  });

  it('generates unique IDs for multiple inserts', async () => {
    const dbPath = ensureDb(projectRoot);

    // Use a small delay to ensure different timestamps
    await runRemember(['First note']);
    await runRemember(['Second note']);

    const store = new MemoryStore(dbPath);
    const entries = store.getByType('memory');
    const ids = entries.map(e => e.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
    store.close();
  });
});
