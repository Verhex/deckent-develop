// tests/scripts/lint-terminal-readability.test.ts
// ═══ TERMINAL-READABILITY-001 — the Terminal readability ratchet ═══
//
// The gate that keeps the Terminal theme-mapped: inside the Terminal surface
// (src/cli/repl/** and the readline chat-*.ts renderers) no component may paint
// a hex literal, a named Ink color, a raw SGR color or the SGR dim attribute —
// every color comes from the generated palette through ink-palette / theme.ts.
// Hermetic: the on-disk script is copied into a mkdtemp root next to a
// synthetic src tree and spawned there (async spawn only — no spawnSync).

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_SRC = fileURLToPath(new URL('../../scripts/lint-terminal-readability.mjs', import.meta.url));

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

const roots: string[] = [];
function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'lint-readability-'));
  roots.push(root);
  mkdirSync(join(root, 'scripts'), { recursive: true });
  copyFileSync(SCRIPT_SRC, join(root, 'scripts', 'lint-terminal-readability.mjs'));
  return join(root, 'scripts', 'lint-terminal-readability.mjs');
}
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });

describe('lint-terminal-readability', () => {
  it('fails on a hex literal, a named Ink color, a raw SGR color and dim inside the Terminal surface', async () => {
    const script = makeRoot();
    const root = dirname(dirname(script));
    writeFileEnsuringDir(join(root, 'src/cli/repl/card.tsx'), [
      "const SELECTED = '#C4A855';",
      '<Text color="red">x</Text>',
      '<Text dimColor>y</Text>',
      "const DIM = '\\x1b[2m';",
      "const CYAN = '\\x1b[36m';",
    ].join('\n'));
    writeFileEnsuringDir(join(root, 'src/cli/commands/chat-render.ts'), "const T = '\\x1b[38;2;77;184;164m';\n");
    const r = await runScript(script);
    expect(r.code).toBe(1);
    for (const code of ['HEX_LITERAL', 'NAMED_COLOR', 'DIM_PROP', 'SGR_DIM', 'SGR_COLOR']) expect(r.stdout + r.stderr).toContain(code);
    expect(r.stdout + r.stderr).toContain('src/cli/repl/card.tsx:1');
    expect(r.stdout + r.stderr).toContain('src/cli/commands/chat-render.ts:1');
  });

  it('passes when colors come from the palette roles and only the caret uses inverse', async () => {
    const script = makeRoot();
    const root = dirname(dirname(script));
    writeFileEnsuringDir(join(root, 'src/cli/repl/card.tsx'), [
      "import { useInkPalette } from './ink-palette-context.js';",
      'const p = useInkPalette();',
      '<Text {...p.focus}>x</Text>',
      '<Text {...p.muted}>y</Text>',
      '<Text inverse>{at}</Text>',
      '<Box borderColor={p.accent.color} />',
    ].join('\n'));
    const r = await runScript(script);
    expect(r.code, r.stdout + r.stderr).toBe(0);
  });

  it('ignores test files and files outside the Terminal surface', async () => {
    const script = makeRoot();
    const root = dirname(dirname(script));
    writeFileEnsuringDir(join(root, 'src/cli/repl/card.test.tsx'), "const X = '#C4A855';\n");
    writeFileEnsuringDir(join(root, 'src/cli/helpers/theme.ts'), "const X = '\\x1b[36m';\n");
    const r = await runScript(script);
    expect(r.code, r.stdout + r.stderr).toBe(0);
  });

  it('a typed allowance comment exempts one line and names its reason', async () => {
    const script = makeRoot();
    const root = dirname(dirname(script));
    writeFileEnsuringDir(join(root, 'src/cli/repl/card.tsx'), "const X = '#C4A855'; // readability-allow: design-critic fixture (not rendered)\n");
    const r = await runScript(script);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    writeFileEnsuringDir(join(root, 'src/cli/repl/card.tsx'), "const X = '#C4A855'; // readability-allow\n");
    const r2 = await runScript(script);
    expect(r2.code).toBe(1);
    expect(r2.stdout + r2.stderr).toContain('ALLOW_WITHOUT_REASON');
  });

  it('the real Terminal surface is clean', async () => {
    // Runs the committed script against the committed tree (no copy) — the
    // ratchet itself, as CI sees it.
    const r = await runScript(SCRIPT_SRC);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(readFileSync(SCRIPT_SRC, 'utf-8')).toContain('readability-allow');
  });
});
