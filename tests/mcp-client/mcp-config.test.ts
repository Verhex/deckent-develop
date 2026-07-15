import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadMcpServers } from '../../src/mcp-client/config.js';

function makeTempDir(): string {
  const dir = join(
    tmpdir(),
    `mcp-config-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('loadMcpServers', () => {
  let tmpRoot: string;
  let tmpHome: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tmpRoot = makeTempDir();
    tmpHome = makeTempDir();
    originalHome = process.env['HOME'];
    process.env['HOME'] = tmpHome;
  });

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env['HOME'];
    } else {
      process.env['HOME'] = originalHome;
    }
    rmSync(tmpRoot, { recursive: true, force: true });
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it('returns empty map when no config files exist', () => {
    const result = loadMcpServers(tmpRoot);
    expect(result).toEqual({});
  });

  it('parses stdio and http server definitions from project .mcp.json', () => {
    const config = {
      'my-stdio': { transport: 'stdio', command: 'npx', args: ['-y', 'my-server'] },
      'my-http': { transport: 'http', url: 'http://localhost:3000', headers: { 'X-Token': 'abc' } },
    };
    writeFileSync(join(tmpRoot, '.mcp.json'), JSON.stringify(config), 'utf-8');

    const result = loadMcpServers(tmpRoot);
    expect(result['my-stdio']).toEqual({ transport: 'stdio', command: 'npx', args: ['-y', 'my-server'] });
    expect(result['my-http']).toEqual({ transport: 'http', url: 'http://localhost:3000', headers: { 'X-Token': 'abc' } });
  });

  it('merges 3 scopes with local > project > user precedence', () => {
    mkdirSync(join(tmpHome, '.deckent'), { recursive: true });
    writeFileSync(
      join(tmpHome, '.deckent', 'mcp.json'),
      JSON.stringify({
        shared: { transport: 'stdio', command: 'user-cmd' },
        'user-only': { transport: 'stdio', command: 'user-only-cmd' },
        'project-vs-user': { transport: 'stdio', command: 'user-cmd' },
      }),
      'utf-8',
    );

    writeFileSync(
      join(tmpRoot, '.mcp.json'),
      JSON.stringify({
        shared: { transport: 'stdio', command: 'project-cmd' },
        'project-only': { transport: 'stdio', command: 'project-only-cmd' },
        'project-vs-user': { transport: 'stdio', command: 'project-cmd' },
      }),
      'utf-8',
    );

    writeFileSync(
      join(tmpRoot, '.mcp.local.json'),
      JSON.stringify({
        shared: { transport: 'stdio', command: 'local-cmd' },
        'local-only': { transport: 'stdio', command: 'local-only-cmd' },
      }),
      'utf-8',
    );

    const result = loadMcpServers(tmpRoot);

    // local wins over project and user for 'shared'
    expect((result['shared'] as { command: string }).command).toBe('local-cmd');
    // project wins over user for 'project-vs-user' (not in local)
    expect((result['project-vs-user'] as { command: string }).command).toBe('project-cmd');
    // all scopes' unique entries are present
    expect(result).toHaveProperty('user-only');
    expect(result).toHaveProperty('project-only');
    expect(result).toHaveProperty('local-only');
  });

  it('includeProjectScope:false drops the git-tracked project scope, keeps user + local (REPL-575 K1-C)', () => {
    mkdirSync(join(tmpHome, '.deckent'), { recursive: true });
    writeFileSync(
      join(tmpHome, '.deckent', 'mcp.json'),
      JSON.stringify({ 'user-only': { transport: 'stdio', command: 'user-cmd' } }),
      'utf-8',
    );
    writeFileSync(
      join(tmpRoot, '.mcp.json'),
      JSON.stringify({ 'project-only': { transport: 'stdio', command: 'project-cmd' } }),
      'utf-8',
    );
    writeFileSync(
      join(tmpRoot, '.mcp.local.json'),
      JSON.stringify({ 'local-only': { transport: 'stdio', command: 'local-cmd' } }),
      'utf-8',
    );

    const trusted = loadMcpServers(tmpRoot, { includeProjectScope: false });
    // The operator's own scopes remain…
    expect(trusted).toHaveProperty('user-only');
    expect(trusted).toHaveProperty('local-only');
    // …but the git-tracked project scope is gone.
    expect(trusted).not.toHaveProperty('project-only');

    // Default (and explicit true) still include every scope — backward-safe.
    expect(loadMcpServers(tmpRoot)).toHaveProperty('project-only');
    expect(loadMcpServers(tmpRoot, { includeProjectScope: true })).toHaveProperty('project-only');
  });
});
