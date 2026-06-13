/**
 * Tests for scripts/lint-mcp-instructions.mjs
 *
 * Verifies that the lint script correctly detects drift between
 * DECKENT_MCP_INSTRUCTIONS and registered tools in src/mcp/tools/*.ts
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const SCRIPT_PATH = join(process.cwd(), 'scripts', 'lint-mcp-instructions.mjs');

/**
 * Run lint-mcp-instructions.mjs and return { exitCode, stdout, stderr }
 */
function runLintScript(): { exitCode: number; stdout: string; stderr: string } {
  const result = spawnSync('node', [SCRIPT_PATH], {
    encoding: 'utf-8',
    cwd: process.cwd(),
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe('lint-mcp-instructions.mjs', () => {
  it('(a) exits 0 with OK message when no drift', () => {
    const { exitCode, stdout } = runLintScript();
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/^OK: \d+ tools, \d+ in instructions/);
  });

  it('(b) exit 0 output contains correct tool count (34)', () => {
    const { exitCode, stdout } = runLintScript();
    expect(exitCode).toBe(0);
    expect(stdout).toContain('34 tools');
    expect(stdout).toContain('34 in instructions');
  });

  it('(c) server.ts DECKENT_MCP_INSTRUCTIONS lists all 4 previously-missing tools', () => {
    const serverTs = readFileSync(
      join(process.cwd(), 'src', 'mcp', 'server.ts'),
      'utf-8',
    );
    expect(serverTs).toContain('deckent_watch');
    expect(serverTs).toContain('deckent_feature_query');
    expect(serverTs).toContain('deckent_audit');
    expect(serverTs).toContain('deckent_recover');
  });

  it('(d) server.ts DECKENT_MCP_INSTRUCTIONS header shows Tools (34)', () => {
    const serverTs = readFileSync(
      join(process.cwd(), 'src', 'mcp', 'server.ts'),
      'utf-8',
    );
    expect(serverTs).toContain('## Tools (34)');
  });

  it('(e) lint script detects drift when a tool is removed from instructions (temp file test)', () => {
    // Create a temp directory with a modified server.ts that omits one tool
    const tmpDir = join(tmpdir(), `lint-test-${randomBytes(6).toString('hex')}`);
    mkdirSync(join(tmpDir, 'src', 'mcp', 'tools'), { recursive: true });
    mkdirSync(join(tmpDir, 'scripts'), { recursive: true });

    // Write a minimal server.ts with only 1 tool in instructions
    const minimalServerTs = `
export const DECKENT_MCP_INSTRUCTIONS = \`
## Tools (1)
- deckent_init: Initialize Deckent
\`.trim();
`;
    writeFileSync(join(tmpDir, 'src', 'mcp', 'server.ts'), minimalServerTs, 'utf-8');

    // Write a tool file that registers 2 tools
    const fakeToolTs = `
export function registerAll(server) {
  server.registerTool('deckent_init', {}, async () => {});
  server.registerTool('deckent_plan', {}, async () => {});
}
`;
    writeFileSync(join(tmpDir, 'src', 'mcp', 'tools', 'fake.ts'), fakeToolTs, 'utf-8');

    // Run the lint script from the temp dir
    const result = spawnSync('node', [SCRIPT_PATH], {
      encoding: 'utf-8',
      cwd: tmpDir,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/deckent_plan/);
  });
});
