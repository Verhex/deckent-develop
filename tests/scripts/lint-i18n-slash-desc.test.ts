// tests/scripts/lint-i18n-slash-desc.test.ts
// TERMINAL-TOOLS-001 — i18n gate extension: slash-catalog `desc:` literals.
//
// The gate scanned commander `.description(...)` calls and MCP `description:`
// props but NOT the REPL slash catalog's `desc:` props, so 39 hardcoded
// Turkish descriptions in src/cli/commands/chat-slash-registry.ts passed the
// lint for months. This suite proves the gate now fails on a natural-language
// `desc:` literal in src/cli/commands/*.ts and stays clean when the entry
// carries a `descKey` instead.
//
// Hermetic (same pattern as lint-cli-surface.test.ts): the on-disk script is
// copied into a mkdtemp root next to a synthetic src tree, then spawned there
// (the script resolves its project root relative to its own location). Async
// spawn only — no spawnSync.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const I18N_HARDCODE_SRC = fileURLToPath(new URL('../../scripts/lint-i18n-hardcode.mjs', import.meta.url));

function runScript(scriptPath: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [scriptPath]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => resolvePromise({ code, stdout, stderr }));
  });
}

function writeFileEnsuringDir(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/** Minimal tree the i18n gate can scan: script copy + the roots it reads. */
function buildTree(tmpRoot: string, registryEntry: string): string {
  writeFileEnsuringDir(join(tmpRoot, 'scripts', 'lint-i18n-hardcode.mjs'), readFileSync(I18N_HARDCODE_SRC, 'utf8'));
  mkdirSync(join(tmpRoot, 'src', 'desktop', 'src', 'main'), { recursive: true });
  mkdirSync(join(tmpRoot, 'src', 'mcp', 'tools'), { recursive: true });
  writeFileEnsuringDir(
    join(tmpRoot, 'src', 'cli', 'index.ts'),
    [
      "import { getMessage, getLanguage } from './helpers/messages.js';",
      'export function buildProgram(program) {',
      "  program.description(getMessage('cli.program.desc', getLanguage(undefined)));",
      '}',
      '',
    ].join('\n'),
  );
  writeFileEnsuringDir(
    join(tmpRoot, 'src', 'cli', 'commands', 'chat-slash-registry.ts'),
    [
      'const SLASH_CATALOG = [',
      '  {',
      "    name: '/help',",
      `    ${registryEntry}`,
      '  },',
      '];',
      'export function buildSlashRegistry() { return SLASH_CATALOG.slice(); }',
      '',
    ].join('\n'),
  );
  return join(tmpRoot, 'scripts', 'lint-i18n-hardcode.mjs');
}

describe('lint-i18n-hardcode — slash catalog `desc:` literal gate', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
  });

  it('fails (exit 1) on a natural-language `desc:` literal in a src/cli/commands catalog', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-i18n-slash-desc-'));
    roots.push(tmpRoot);
    const script = buildTree(tmpRoot, "desc: 'Kullanılabilir komutları listele',");
    const result = await runScript(script);
    expect(result.code, result.stdout + result.stderr).toBe(1);
    expect(result.stdout).toContain('src/cli/commands/chat-slash-registry.ts');
    expect(result.stdout).toContain('Kullanılabilir komutları listele');
  });

  it('stays clean (exit 0) when the entry carries a `descKey` instead of a literal', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-i18n-slash-desc-'));
    roots.push(tmpRoot);
    const script = buildTree(tmpRoot, "descKey: 'tui.slash.desc.help',");
    const result = await runScript(script);
    expect(result.code, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain('i18n gate clean');
  });

  it('ignores short technical tokens below the natural-language threshold (same heuristic as every other scan)', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-i18n-slash-desc-'));
    roots.push(tmpRoot);
    const script = buildTree(tmpRoot, "desc: 'v2',");
    const result = await runScript(script);
    expect(result.code, result.stdout + result.stderr).toBe(0);
  });
});
