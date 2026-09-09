import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';

const output = vi.hoisted(() => ({ lines: [] as string[], errors: [] as string[] }));
vi.mock('../../src/cli/helpers/output.js', () => ({
  print: (line: string) => output.lines.push(line),
  printError: (error: unknown) => output.errors.push(error instanceof Error ? error.message : String(error)),
}));

import { registerCheckpoint } from '../../src/cli/commands/checkpoint.js';

let root: string | undefined;

function checkpoint(name: string, value: unknown): void {
  writeFileSync(join(root!, '.deckent', 'checkpoints', name), JSON.stringify(value));
}

function setup(projectConfig: unknown = { approval: { authority: { enabled: true, tenant_id: 'tenant-a' } } }): void {
  root = mkdtempSync(join(tmpdir(), 'deckent-checkpoint-list-'));
  mkdirSync(join(root, '.deckent', 'checkpoints'), { recursive: true });
  mkdirSync(join(root, 'global'), { recursive: true });
  vi.stubEnv('DECKENT_HOME', join(root, 'global'));
  writeFileSync(join(root, '.deckent', 'config.json'), JSON.stringify(projectConfig));
}

async function run(args: string[]): Promise<void> {
  const program = new Command().exitOverride();
  registerCheckpoint(program);
  await program.parseAsync(['node', 'deckent', 'checkpoint', 'list', ...args]);
}

afterEach(() => {
  process.exitCode = undefined;
  output.lines = [];
  output.errors = [];
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
  vi.unstubAllEnvs();
});

describe('checkpoint list', () => {
  it('projects all canonical statuses and only pending when asked', async () => {
    setup();
    checkpoint('checkpoint-run1-plan.json', { phase: 'plan', summary: 'plan', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z' });
    checkpoint('checkpoint-run2-evaluate.json', { phase: 'evaluate', summary: 'eval', status: 'approved', createdAt: '2026-01-01T00:00:00.000Z' });
    checkpoint('checkpoint-run3-fix.json', { phase: 'fix', summary: 'fix', status: 'rejected', createdAt: '2026-01-01T00:00:00.000Z' });
    checkpoint('checkpoint-run4-plan.json', { phase: 'plan', summary: 'timeout', status: 'timeout', createdAt: '2026-01-01T00:00:00.000Z' });
    const previous = process.cwd(); process.chdir(root);
    try {
      await run(['--json']);
      expect(JSON.parse(output.lines[0]!)).toMatchObject({ state: 'ready', items: expect.arrayContaining([
        expect.objectContaining({ status: 'pending' }), expect.objectContaining({ status: 'approved' }),
        expect.objectContaining({ status: 'rejected' }), expect.objectContaining({ status: 'timeout' }),
      ]) });
      output.lines = [];
      await run(['--pending', '--json']);
      expect(JSON.parse(output.lines[0]!).items).toHaveLength(1);
      expect(JSON.parse(output.lines[0]!).items[0].status).toBe('pending');
    } finally { process.chdir(previous); }
  });

  it('fails closed before filtering a legacy checkpoint under strict isolation', async () => {
    setup({ strict_tenant_isolation: true, approval: { authority: { enabled: true, tenant_id: 'tenant-a' } } });
    checkpoint('checkpoint-run1-plan.json', { phase: 'plan', summary: 'legacy', status: 'approved', createdAt: '2026-01-01T00:00:00.000Z' });
    const previous = process.cwd(); process.chdir(root);
    try {
      await run(['--pending', '--json']);
      expect(JSON.parse(output.lines[0]!)).toMatchObject({ state: 'held', reasonCode: 'TENANT_SCOPE_UNRESOLVED' });
      expect(process.exitCode).toBe(1);
    } finally { process.chdir(previous); }
  });

  it('deep-merges readonly global then project policy, including tenant and language', async () => {
    setup({ language: 'tr', approval: { authority: { tenant_id: 'tenant-project' } } });
    writeFileSync(join(root!, 'global', 'config.json'), JSON.stringify({ language: 'en', approval: { authority: { enabled: true, tenant_id: 'tenant-global' } } }));
    checkpoint('checkpoint-run1-plan.json', { phase: 'plan', summary: 'ok', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z', tenantId: 'tenant-project' });
    const previous = process.cwd(); process.chdir(root!);
    try {
      await run(['--json']);
      expect(JSON.parse(output.lines[0]!)).toMatchObject({ state: 'ready', items: [expect.objectContaining({ tenantId: 'tenant-project' })] });
      rmSync(join(root!, '.deckent', 'checkpoints', 'checkpoint-run1-plan.json')); output.lines = [];
      await run([]);
      expect(output.lines[0]).toBe('Checkpoint bulunamadı.');
      vi.stubEnv('DECKENT_LANGUAGE', 'en'); output.lines = [];
      await run([]);
      expect(output.lines[0]).toBe('No checkpoints found.');
      vi.stubEnv('DECKENT_LANGUAGE', 'tr'); output.lines = [];
      await run(['--lang', 'en']);
      expect(output.lines[0]).toBe('No checkpoints found.');
    } finally { process.chdir(previous); }
  });

  it('holds invalid config without changing its bytes and preserves the disabled gate', async () => {
    setup({ approval: { authority: { enabled: false, tenant_id: 'tenant-a' } } });
    const previous = process.cwd(); process.chdir(root!);
    try {
      await run(['--json']);
      expect(JSON.parse(output.lines[0]!)).toMatchObject({ state: 'held', reasonCode: 'APPROVAL_AUTHORITY_DISABLED' });
      const config = join(root!, '.deckent', 'config.json');
      writeFileSync(config, '{invalid'); const before = readFileSync(config, 'utf8'); output.lines = [];
      await run(['--json']);
      expect(JSON.parse(output.lines[0]!)).toMatchObject({ state: 'held', reasonCode: 'CONFIG_INVALID' });
      expect(readFileSync(config, 'utf8')).toBe(before);
    } finally { process.chdir(previous); }
  });

  it('keeps unknown records during pending filtering and rejects scalar-shaped status values', async () => {
    setup();
    checkpoint('checkpoint-run1-plan.json', { phase: 'plan', summary: 'bad', status: ['pending'], createdAt: '2026-01-01T00:00:00.000Z' });
    checkpoint('checkpoint-run2-evaluate.json', { phase: 'evaluate', summary: 'done', status: 'approved', createdAt: '2026-01-01T00:00:00.000Z' });
    const previous = process.cwd(); process.chdir(root!);
    try {
      await run(['--pending', '--json']);
      const result = JSON.parse(output.lines[0]!);
      expect(result).toMatchObject({ state: 'partial', items: [expect.objectContaining({ state: 'unknown', reasonCode: 'INVALID_RECORD' })] });
      expect(process.exitCode).toBe(1);
    } finally { process.chdir(previous); }
  });

  it.each([
    ['invalid calendar date', '2026-02-30T00:00:00.000Z'],
    ['ANSI control', '2026-01-01T00:00:00.000Z\u001b[2J'],
    ['newline control', '2026-01-01T00:00:00.000Z\nnext'],
  ])('rejects createdAt with %s before terminal rendering', async (_label, createdAt) => {
    setup();
    checkpoint('checkpoint-run1-plan.json', { phase: 'plan', summary: 'safe', status: 'pending', createdAt });
    const previous = process.cwd(); process.chdir(root!);
    try {
      await run(['--pending', '--json']);
      const result = JSON.parse(output.lines[0]!);
      expect(result).toMatchObject({ state: 'partial', items: [expect.objectContaining({ state: 'unknown', reasonCode: 'INVALID_RECORD' })] });
      expect(JSON.stringify(output.lines)).not.toContain('\u001b[2J');
      expect(JSON.stringify(output.lines)).not.toContain('\nnext');
    } finally { process.chdir(previous); }
  });

  it('holds unsafe sources and bounds oversize records without displaying terminal controls', async () => {
    setup();
    const dir = join(root!, '.deckent', 'checkpoints');
    const target = join(root!, 'checkpoint-target.json');
    writeFileSync(target, JSON.stringify({ phase: 'plan', summary: 'safe', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z' }));
    symlinkSync(target, join(dir, 'checkpoint-run1-plan.json'));
    const previous = process.cwd(); process.chdir(root!);
    try {
      await run(['--json']);
      expect(JSON.parse(output.lines[0]!)).toMatchObject({ state: 'held', reasonCode: 'SOURCE_UNSAFE' });
      rmSync(join(dir, 'checkpoint-run1-plan.json'));
      checkpoint('checkpoint-run2-plan.json', { phase: 'plan', summary: 'x'.repeat(70_000), status: 'pending', createdAt: '2026-01-01T00:00:00.000Z' });
      output.lines = []; process.exitCode = undefined;
      await run(['--json']);
      expect(JSON.parse(output.lines[0]!)).toMatchObject({ state: 'partial', items: [expect.objectContaining({ reasonCode: 'OVERSIZE' })] });
      rmSync(join(dir, 'checkpoint-run2-plan.json'));
      checkpoint('checkpoint-run3-plan.json', { phase: 'plan', summary: 'a\u001b[2J\nb', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z' });
      output.lines = []; process.exitCode = undefined;
      await run([]);
      expect(output.lines.join('\n')).not.toContain('\u001b[2J');
      expect(output.lines.join('\n')).toContain('\\u001b[2J\\nb');
    } finally { process.chdir(previous); }
  });
});
