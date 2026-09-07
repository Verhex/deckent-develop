import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const SCRIPT = fileURLToPath(new URL('../../scripts/lint-i18n-hardcode.mjs', import.meta.url));
const TYPESCRIPT = dirname(createRequire(import.meta.url).resolve('typescript/package.json'));
const roots: string[] = [];

function write(path: string, content: string): void { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); }
function fixture(replFiles: Record<string, string>): { root: string; script: string } {
  const root = mkdtempSync(join(tmpdir(), 'deckent-i18n-repl-')); roots.push(root);
  write(join(root, 'scripts/lint-i18n-hardcode.mjs'), readFileSync(SCRIPT, 'utf8'));
  for (const dir of ['src/cli/commands', 'src/desktop/src/main', 'src/mcp/tools']) mkdirSync(join(root, dir), { recursive: true });
  write(join(root, 'src/cli/index.ts'), 'export {};\n');
  for (const [path, content] of Object.entries(replFiles)) write(join(root, 'src/cli/repl', path), content);
  mkdirSync(join(root, 'node_modules'), { recursive: true });
  symlinkSync(TYPESCRIPT, join(root, 'node_modules/typescript'), platform() === 'win32' ? 'junction' : 'dir');
  return { root, script: join(root, 'scripts/lint-i18n-hardcode.mjs') };
}
function run(script: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, '--json'], { env: { PATH: process.env.PATH ?? '' } });
    let stdout = ''; let stderr = '';
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error('lint-i18n-hardcode fixture timed out after 10s'));
    }, 10_000);
    const append = (stream: 'stdout' | 'stderr', chunk: unknown): void => {
      const value = String(chunk);
      const nextBytes = Buffer.byteLength(stdout) + Buffer.byteLength(stderr) + Buffer.byteLength(value);
      if (nextBytes > 256 * 1024) {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          child.kill('SIGKILL');
          reject(new Error('lint-i18n-hardcode fixture output exceeded 256KiB'));
        }
        return;
      }
      if (stream === 'stdout') stdout += value;
      else stderr += value;
    };
    child.stdout.on('data', (chunk) => append('stdout', chunk));
    child.stderr.on('data', (chunk) => append('stderr', chunk));
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
  });
}

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('lint-i18n-hardcode recursive REPL surface', () => {
  it('finds nested TSX JSX, label properties, output and pushTurn prose with stable categories', async () => {
    const { script } = fixture({
      'nested/view.tsx': `export const View=({ok})=> <box title={('Visible title')}>{ok ? 'Visible body copy' : labels.body}</box>;\n`,
      'nested/controller.ts': `const card={label: ok ? 'Run this operation' : 'Choose another operation'}; output(('Operation ' + 'completed')); output('\\u001b[31mVisible failure message\\u001b[0m'); pushTurn('assistant', \`Queued ${'${id}'} for later\`);\n`,
    });
    const result = await run(script);
    const repeated = await run(script);
    expect(result.code).toBe(1);
    expect(repeated).toEqual(result);
    const report = JSON.parse(result.stdout) as { hits: Array<{ file: string; category: string }> };
    expect(report.hits.map((hit) => [hit.file, hit.category])).toEqual([
      ['src/cli/repl/nested/controller.ts', 'repl-label-property'],
      ['src/cli/repl/nested/controller.ts', 'repl-label-property'],
      ['src/cli/repl/nested/controller.ts', 'repl-output'],
      ['src/cli/repl/nested/controller.ts', 'repl-output'],
      ['src/cli/repl/nested/controller.ts', 'repl-pushTurn'],
      ['src/cli/repl/nested/view.tsx', 'repl-jsx-label'],
      ['src/cli/repl/nested/view.tsx', 'repl-jsx-text'],
    ]);
  });

  it('ignores catalog calls, injected labels and technical protocol/path/error/ANSI literals', async () => {
    const { script } = fixture({
      'clean.tsx': `output('CHECKPOINT_READ_FAILED'); output('./runtime/session.json'); output('https://example.invalid/status'); output('\\u001b[31mCHECKPOINT_READ_FAILED\\u001b[0m'); output('\\u001b[?1049hCHECKPOINT_READ_FAILED\\u001b[?1049l'); output(getMessage('done', lang)); pushTurn('seg', getMessage('done', lang)); pushTurn('seg', labels.done); export const V=()=> <box title={labels.title}>{labels.body}</box>;\n`,
    });
    const result = await run(script);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ decision: 'PASS', hits: [] });
  });
});
