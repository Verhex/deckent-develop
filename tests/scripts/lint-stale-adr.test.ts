/**
 * Tests for the 563-003 MESSAGES-catalog stale-ADR ratchet addition to
 * scripts/lint-i18n-hardcode.mjs.
 *
 * Hermetic: fixtures live under mkdtempSync(tmpdir()), torn down in
 * afterEach. The script resolves its project root via
 * `dirname(fileURLToPath(import.meta.url)) + '..'` — relative to the
 * SCRIPT's own location, not `cwd` — so a fixture copies the current on-disk
 * script into `<tmp>/scripts/lint-i18n-hardcode.mjs` alongside a minimal
 * synthetic `<tmp>/src/...` tree, then spawns the copy. Async spawn only —
 * no spawnSync. The real-repo case spawns the actual on-disk script with no
 * fixture tree at all.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const I18N_HARDCODE_SRC = fileURLToPath(new URL('../../scripts/lint-i18n-hardcode.mjs', import.meta.url));

function runScript(scriptPath: string, args: string[] = []): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [scriptPath, ...args]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => resolvePromise({ code, stdout, stderr }));
  });
}

/** writeFileSync that creates the parent directory first (writeFileSync does not). */
function writeFileEnsuringDir(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/**
 * Minimal fixture tree: the script unconditionally readdirSync()s
 * src/cli/commands, src/desktop/src/main and src/mcp/tools, and
 * readFileSync()s src/cli/index.ts and src/cli/helpers/messages.ts — all
 * must exist even when empty/no-op, or the scan throws ENOENT before it
 * reaches the catalog check under test.
 */
function buildMinimalTree(tmpRoot: string, messagesContent: string): void {
  writeFileEnsuringDir(join(tmpRoot, 'scripts', 'lint-i18n-hardcode.mjs'), readFileSync(I18N_HARDCODE_SRC, 'utf8'));
  mkdirSync(join(tmpRoot, 'src', 'cli', 'commands'), { recursive: true });
  mkdirSync(join(tmpRoot, 'src', 'desktop', 'src', 'main'), { recursive: true });
  mkdirSync(join(tmpRoot, 'src', 'mcp', 'tools'), { recursive: true });
  writeFileEnsuringDir(join(tmpRoot, 'src', 'cli', 'index.ts'), 'export function buildProgram() {}\n');
  writeFileEnsuringDir(join(tmpRoot, 'src', 'cli', 'helpers', 'messages.ts'), messagesContent);
}

function messagesWith(entries: string): string {
  return [
    'type MessageMap = Record<string, Record<string, string>>;',
    'const MESSAGES: MessageMap = {',
    entries,
    '};',
    'export const MESSAGE_KEYS: readonly string[] = Object.freeze(Object.keys(MESSAGES));',
    "export function getMessage(key: string, lang: string): string {",
    '  return MESSAGES[key]?.[lang] ?? key;',
    '}',
    '',
  ].join('\n');
}

describe('lint-i18n-hardcode.mjs — MESSAGES catalog stale-ADR ratchet (563-003)', () => {
  let tmpRoot: string | undefined;
  afterEach(() => {
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
    tmpRoot = undefined;
  });

  it('fails (exit 1) on a NEW un-allowlisted numeric-ADR catalog value', async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'lint-stale-adr-'));
    buildMinimalTree(
      tmpRoot,
      messagesWith(
        [
          "  'new.leak.key': {",
          "    en: 'This references ADR-088 directly.',",
          "    tr: 'Bu doğrudan ADR-088 atıfı yapar.',",
          '  },',
        ].join('\n'),
      ),
    );

    const result = await runScript(join(tmpRoot, 'scripts', 'lint-i18n-hardcode.mjs'));
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('ADR-088');
  });

  it('passes (exit 0) when the only numeric-ADR hit is the grandfathered ADR-037 (workspace.worker.contract)', async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'lint-stale-adr-'));
    buildMinimalTree(
      tmpRoot,
      messagesWith(
        [
          "  'workspace.worker.contract': {",
          "    en: 'Section on ADR-037 authority and, later, ADR-037 authority again.',",
          "    tr: 'ADR-037 yetkisi bölümü ve daha sonra tekrar ADR-037 yetkisi.',",
          '  },',
        ].join('\n'),
      ),
    );

    const result = await runScript(join(tmpRoot, 'scripts', 'lint-i18n-hardcode.mjs'));
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('i18n gate clean');
  });

  it('does not flag ADR-G-0NN / ADR-D-0NN governance ids (positive control for the digit-first regex)', async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'lint-stale-adr-'));
    buildMinimalTree(
      tmpRoot,
      messagesWith(
        [
          "  'safe.key': {",
          "    en: 'See ADR-G-020 and ADR-D-004 for the current authority scheme.',",
          "    tr: 'Güncel yetki şeması için ADR-G-020 ve ADR-D-004.',",
          '  },',
        ].join('\n'),
      ),
    );

    const result = await runScript(join(tmpRoot, 'scripts', 'lint-i18n-hardcode.mjs'));
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('i18n gate clean');
  });

  it('does not flag comment-only legacy ADR ids (out of this ratchet\'s scope — catalog VALUES only)', async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'lint-stale-adr-'));
    const messages = [
      'type MessageMap = Record<string, Record<string, string>>;',
      '// ─── some command (ADR-091) ─────────────────────────────',
      'const MESSAGES: MessageMap = {',
      "  'clean.key': {",
      "    en: 'Nothing legacy here.',",
      "    tr: 'Burada eski bir şey yok.',",
      '  },',
      '};',
      'export const MESSAGE_KEYS: readonly string[] = Object.freeze(Object.keys(MESSAGES));',
      "export function getMessage(key: string, lang: string): string {",
      '  return MESSAGES[key]?.[lang] ?? key;',
      '}',
      '',
    ].join('\n');
    buildMinimalTree(tmpRoot, messages);

    const result = await runScript(join(tmpRoot, 'scripts', 'lint-i18n-hardcode.mjs'));
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('i18n gate clean');
  });

  it('real repo: node scripts/lint-i18n-hardcode.mjs exits 0', async () => {
    const result = await runScript(I18N_HARDCODE_SRC);
    expect(result.code, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain('i18n gate clean');
  });
});
