/**
 * scripts/lint-cli-mcp-parity.mjs — inputSchema field-description ratchet (7085).
 *
 * The gate must (1) pass on the real repository with ZERO literal/unknown
 * `.describe(` sites, (2) fail on a fixture tree carrying a literal or a free
 * expression, naming file:line:kind, and (3) pass on a fixture whose fields all
 * read the catalog. Fixtures are private tmpdirs; the script runs through an
 * async spawn (no spawnSync) with stdout/stderr collected in-process.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'lint-cli-mcp-parity.mjs');

function runGate(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += String(d); });
    child.stderr.on('data', (d: Buffer) => { stderr += String(d); });
    child.on('error', () => resolveRun({ code: -1, stdout, stderr }));
    child.on('close', (code) => resolveRun({ code, stdout, stderr }));
  });
}

let fixtureRoot: string;
beforeAll(() => { fixtureRoot = mkdtempSync(join(tmpdir(), 'deckent-7085-field-gate-')); });
afterAll(() => { rmSync(fixtureRoot, { recursive: true, force: true }); });

function fixture(name: string, files: Record<string, string>): string {
  const dir = join(fixtureRoot, name);
  mkdirSync(dir, { recursive: true });
  for (const [file, content] of Object.entries(files)) writeFileSync(join(dir, file), content, 'utf-8');
  return dir;
}

describe('lint-cli-mcp-parity — field-description ratchet (7085)', () => {
  it('passes on the real repository with zero literal and zero unknown `.describe(` sites', async () => {
    const result = await runGate([]);
    expect(result.code, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toMatch(/inputSchema field \.describe\(\) sites\s*: \d+ \(catalog \d+, literal 0, unknown 0\)/);
    expect(result.stdout).toContain('No NEW parity gaps beyond the accepted baseline');
  });

  it('fails on a fixture carrying a literal and a free-expression field description, naming file:line:kind', async () => {
    const dir = fixture('dirty', {
      'alpha.ts': [
        "import { z } from 'zod/v4';",
        "import { mcpFieldDescription } from './description-catalog.js';",
        'export function registerAlpha(server) {',
        "  server.registerTool('deckent_alpha', { inputSchema: z.object({",
        "    a: z.string().describe('a literal sentence'),",
        "    b: z.string().describe(mcpFieldDescription('deckent_alpha', 'b')),",
        '    c: z.string().describe(',
        '      someVariable),',
        '    d: z.string().describe(`template ${x}`),',
        '  }) }, async () => ({ content: [] }));',
        '}',
        '',
      ].join('\n'),
      // Skipped by name, exactly like the real binding module.
      'description-catalog.ts': "export const x = 1; z.describe('never scanned');\n",
    });
    const result = await runGate([`--field-scan-dir=${dir}`]);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('NEW field-description gap');
    expect(result.stdout).toContain('alpha.ts:5:literal');
    expect(result.stdout).toContain('alpha.ts:7:unknown');
    expect(result.stdout).toContain('alpha.ts:9:literal');
    expect(result.stdout).not.toContain('alpha.ts:6:');
    expect(result.stdout).toMatch(/sites\s*: 4 \(catalog 1, literal 2, unknown 1\)/);
  });

  it('passes on a fixture whose every field reads the catalog through any of the three accepted calls', async () => {
    const dir = fixture('clean', {
      'beta.ts': [
        "  server.registerTool('deckent_beta', { inputSchema: z.object({",
        "    a: z.string().describe(mcpFieldDescription('deckent_beta', 'a')),",
        "    b: z.string().describe(getMessage('beta.b_desc', registerLang)),",
        "    c: z.string().describe(cliContractMessage('cliContract.beta.c', lang)),",
        '  }) });',
        '',
      ].join('\n'),
    });
    const result = await runGate([`--field-scan-dir=${dir}`]);
    expect(result.code, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toMatch(/sites\s*: 3 \(catalog 3, literal 0, unknown 0\)/);
  });
});
