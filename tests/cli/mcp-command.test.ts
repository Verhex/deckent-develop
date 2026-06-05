// Hermetic tests for `deckent mcp` CLI (Sprint 229 · Task 229-004).
// Verifies add/list/remove/get + scope flag, all running in-process
// against tmpdir-sandboxed HOME + project root (no spawnSync, no
// dependency on the developer's real ~/.deckent).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  registerMcp,
  handleAdd,
  handleList,
  handleRemove,
  handleGet,
} from '../../src/cli/commands/mcp.js';

function captureStdout(fn: () => void | Promise<void>): Promise<string> {
  const captured: string[] = [];
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    captured.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  });
  const restore = (): void => spy.mockRestore();
  const result = fn();
  if (result instanceof Promise) {
    return result.finally(restore).then(() => captured.join(''));
  }
  restore();
  return Promise.resolve(captured.join(''));
}

describe('deckent mcp CLI (229-004)', () => {
  let root: string;
  let home: string;
  let originalHome: string | undefined;
  let originalLang: string | undefined;
  let originalLcAll: string | undefined;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'mcp-cli-root-'));
    home = mkdtempSync(join(tmpdir(), 'mcp-cli-home-'));
    originalHome = process.env['HOME'];
    originalLang = process.env['LANG'];
    originalLcAll = process.env['LC_ALL'];
    process.env['HOME'] = home;
    // Pin to English so i18n assertions stay hermetic regardless of host locale
    process.env['LANG'] = 'en';
    process.env['LC_ALL'] = 'en';
    process.exitCode = undefined;
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env['HOME'];
    else process.env['HOME'] = originalHome;
    if (originalLang === undefined) delete process.env['LANG'];
    else process.env['LANG'] = originalLang;
    if (originalLcAll === undefined) delete process.env['LC_ALL'];
    else process.env['LC_ALL'] = originalLcAll;
    rmSync(root, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  it('add → writes stdio entry to .mcp.json (project scope default)', async () => {
    const out = await captureStdout(() =>
      handleAdd('everything', 'npx', ['-y', '@modelcontextprotocol/server-everything'], { root }),
    );
    const filePath = join(root, '.mcp.json');
    expect(existsSync(filePath)).toBe(true);
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    expect(parsed['everything']).toEqual({
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-everything'],
    });
    expect(out).toContain('everything');
    expect(out).toContain('project');
  });

  it('add http URL auto-detects transport=http and writes to .mcp.json', () => {
    handleAdd('remote-mcp', 'https://mcp.example.com/sse', [], { root });
    const parsed = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf-8')) as Record<string, unknown>;
    expect(parsed['remote-mcp']).toEqual({
      transport: 'http',
      url: 'https://mcp.example.com/sse',
    });
  });

  it('list → lists all merged servers across scopes', async () => {
    // project scope entry
    writeFileSync(
      join(root, '.mcp.json'),
      JSON.stringify({
        srv1: { transport: 'stdio', command: 'echo' },
      }),
      'utf-8',
    );
    // local scope entry
    writeFileSync(
      join(root, '.mcp.local.json'),
      JSON.stringify({
        srv2: { transport: 'http', url: 'http://localhost:9999' },
      }),
      'utf-8',
    );

    const out = await captureStdout(() => handleList({ root }));
    expect(out).toContain('srv1');
    expect(out).toContain('srv2');
    expect(out).toContain('stdio');
    expect(out).toContain('http');
  });

  it('list (empty) → friendly i18n message, no exception', async () => {
    const out = await captureStdout(() => handleList({ root }));
    expect(out.toLowerCase()).toContain('no mcp servers');
  });

  it('remove → deletes entry from project scope file', async () => {
    writeFileSync(
      join(root, '.mcp.json'),
      JSON.stringify({
        toKeep: { transport: 'stdio', command: 'a' },
        toRemove: { transport: 'stdio', command: 'b' },
      }),
      'utf-8',
    );

    const out = await captureStdout(() => handleRemove('toRemove', { root }));
    const parsed = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf-8')) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty('toRemove');
    expect(parsed).toHaveProperty('toKeep');
    expect(out).toContain('toRemove');
  });

  it('--scope local honored — add writes to .mcp.local.json (not .mcp.json)', () => {
    handleAdd('secret-srv', 'my-bin', [], { root, scope: 'local' });
    expect(existsSync(join(root, '.mcp.local.json'))).toBe(true);
    expect(existsSync(join(root, '.mcp.json'))).toBe(false);
    const parsed = JSON.parse(readFileSync(join(root, '.mcp.local.json'), 'utf-8')) as Record<string, unknown>;
    expect(parsed['secret-srv']).toEqual({ transport: 'stdio', command: 'my-bin' });
  });

  it('--scope user honored — add writes to $HOME/.deckent/mcp.json', () => {
    handleAdd('global-srv', 'tool', [], { root, scope: 'user' });
    const userFile = join(home, '.deckent', 'mcp.json');
    expect(existsSync(userFile)).toBe(true);
    const parsed = JSON.parse(readFileSync(userFile, 'utf-8')) as Record<string, unknown>;
    expect(parsed['global-srv']).toEqual({ transport: 'stdio', command: 'tool' });
  });

  it('get → prints details of registered server', async () => {
    writeFileSync(
      join(root, '.mcp.json'),
      JSON.stringify({
        foo: { transport: 'stdio', command: 'foo-bin', args: ['--debug'] },
      }),
      'utf-8',
    );
    const out = await captureStdout(() => handleGet('foo', { root }));
    expect(out).toContain('foo');
    expect(out).toContain('stdio');
    expect(out).toContain('foo-bin');
    expect(out).toContain('--debug');
  });

  it('get unknown name throws not-found error', () => {
    expect(() => handleGet('nope', { root })).toThrow(/not found|bulunamadı/i);
  });

  it('remove unknown name throws not-found error', () => {
    expect(() => handleRemove('nope', { root })).toThrow(/not found|bulunamadı/i);
  });

  it('add --transport http requires URL target', () => {
    expect(() => handleAdd('bad', 'not-a-url', [], { root, transport: 'http' })).toThrow(
      /URL|http:\/\//i,
    );
  });

  it('add --scope invalid throws', () => {
    expect(() => handleAdd('bad', 'x', [], { root, scope: 'production' })).toThrow(/scope/i);
  });

  it('CLI wiring — registerMcp wires `mcp` as a subcommand', () => {
    const program = new Command();
    registerMcp(program);
    const mcpCmd = program.commands.find((c) => c.name() === 'mcp');
    expect(mcpCmd).toBeDefined();
    const subnames = mcpCmd!.commands.map((c) => c.name());
    expect(subnames).toEqual(expect.arrayContaining(['add', 'list', 'remove', 'get']));
  });

  it('CLI wiring — `mcp` subcommand description is non-empty', () => {
    const program = new Command();
    registerMcp(program);
    const mcpCmd = program.commands.find((c) => c.name() === 'mcp');
    expect(mcpCmd?.description()).toBeTruthy();
    const addCmd = mcpCmd?.commands.find((c) => c.name() === 'add');
    expect(addCmd?.description()).toBeTruthy();
  });

  it('add then remove round-trip — file ends without the entry', () => {
    handleAdd('rt', 'r', [], { root });
    expect(existsSync(join(root, '.mcp.json'))).toBe(true);
    handleRemove('rt', { root });
    // File still exists but no entry
    const parsed = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf-8')) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty('rt');
  });

  it('add with --env writes env map', () => {
    handleAdd('with-env', 'svc', [], {
      root,
      env: ['DEBUG=1', 'API_KEY=secret'],
    });
    const parsed = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf-8')) as Record<string, unknown>;
    const entry = parsed['with-env'] as { env?: Record<string, string> };
    expect(entry.env).toEqual({ DEBUG: '1', API_KEY: 'secret' });
  });

  it('list precedence — local entry wins over project for same name (via loadMcpServers)', async () => {
    mkdirSync(join(home, '.deckent'), { recursive: true });
    writeFileSync(
      join(root, '.mcp.json'),
      JSON.stringify({ shared: { transport: 'stdio', command: 'project-cmd' } }),
      'utf-8',
    );
    writeFileSync(
      join(root, '.mcp.local.json'),
      JSON.stringify({ shared: { transport: 'stdio', command: 'local-cmd' } }),
      'utf-8',
    );
    const out = await captureStdout(() => handleList({ root }));
    expect(out).toContain('local-cmd');
    expect(out).not.toContain('project-cmd');
  });
});
