// tests/core/readonly-argv-realshell.test.ts
// ═══ 7111 — argv semantics proven against the REAL shell ═══════════════════
// Quoting/escaping only affects word splitting: the program still receives the
// option. For every case below bash+sort really WRITES a file inside a
// disposable tmpdir (exit 0, bytes on disk) — so the classifier MUST say NOT
// read-only. The controls at the end prove the inverse (a genuine read writes
// nothing and stays read-only). Hermetic: tmpdir + async spawn, skipped
// honestly when bash/sort are unavailable on the host.
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
// A root that is NOT on disk keeps the classifier in pure lexical mode (`/project` may exist on a host).
const NO_DISK_ROOT = '/__deckent_7111_not_on_disk__/project';
import { classifyReadOnlyShellCommand, defaultCaseSensitivePaths } from '../../src/core/shell-readonly-classifier.js';

async function run(command: string, cwd: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['-c', command], { cwd, stdio: 'ignore' });
    child.on('error', reject);
    child.on('close', resolve);
  });
}

let bashAvailable = false;
beforeAll(async () => {
  bashAvailable = await run('command -v sort >/dev/null', tmpdir()).then((code) => code === 0, () => false);
});

const MUTATING = [
  `sort '--output=out' input`,
  `sort '-o' out input`,
  `sort \\-o out input`,
  `sort ''-o out input`,
  `sort "-o" out input`,
  `sort -'o' out input`,
  `sort '--outp'ut=out input`,
];

describe('7111 argv semantics — quoted/escaped option prefixes still mutate', () => {
  it.each(MUTATING)('%s writes a file with real bash+sort and is NOT read-only', async (command) => {
    const verdict = classifyReadOnlyShellCommand(command, { projectRoot: NO_DISK_ROOT });
    expect(verdict).toMatchObject({ readOnly: false, reasonCode: 'MUTATING_FLAG' });
    if (!bashAvailable) return;
    const root = await mkdtemp(join(tmpdir(), 'ro-argv-'));
    try {
      await writeFile(join(root, 'input'), 'b\na\n');
      expect(await run(command, root)).toBe(0);
      expect(await readFile(join(root, 'out'), 'utf8')).toBe('a\nb\n');
      expect(classifyReadOnlyShellCommand(command, { projectRoot: root }).readOnly).toBe(false);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('controls: a genuine read writes nothing and stays read-only; argv -- ends options', async () => {
    expect(classifyReadOnlyShellCommand('sort input', { projectRoot: NO_DISK_ROOT })).toMatchObject({ readOnly: true });
    expect(classifyReadOnlyShellCommand('sort -- -o', { projectRoot: NO_DISK_ROOT })).toMatchObject({ readOnly: true, paths: ['-o'] });
    // argv word `--` terminates options whether or not it was quoted (POSIX executables).
    expect(classifyReadOnlyShellCommand(`sort '--' -o out`, { projectRoot: NO_DISK_ROOT })).toMatchObject({ readOnly: true, paths: ['-o', 'out'] });
    expect(classifyReadOnlyShellCommand(`sort \\-\\- -o out`, { projectRoot: NO_DISK_ROOT })).toMatchObject({ readOnly: true });
    // A quoted unknown flag is still a flag (cat has no -z).
    expect(classifyReadOnlyShellCommand(`cat '-zz' f`, { projectRoot: NO_DISK_ROOT })).toMatchObject({ readOnly: false, reasonCode: 'FLAG_NOT_ALLOWLISTED' });
    // grep '-foo' is argv `-f oo` (pattern FILE oo) — a read, exactly as grep parses it.
    expect(classifyReadOnlyShellCommand(`grep '-foo' f`, { projectRoot: NO_DISK_ROOT })).toMatchObject({ readOnly: true, paths: ['oo', 'f'] });
    expect(classifyReadOnlyShellCommand(`grep -e '-foo' f`, { projectRoot: NO_DISK_ROOT })).toMatchObject({ readOnly: true });
    if (!bashAvailable) return;
    const root = await mkdtemp(join(tmpdir(), 'ro-argv-ctl-'));
    try {
      await writeFile(join(root, 'input'), 'b\na\n');
      expect(await run('sort input', root)).toBe(0);
      await expect(access(join(root, 'out'))).rejects.toBeDefined();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

describe('7111 case rule — documented defaults and protected matching', () => {
  it('sensitive on linux, insensitive on win32/darwin and for PowerShell', () => {
    expect(defaultCaseSensitivePaths('posix', 'linux')).toBe(true);
    expect(defaultCaseSensitivePaths('posix', 'darwin')).toBe(false);
    expect(defaultCaseSensitivePaths('posix', 'win32')).toBe(false);
    expect(defaultCaseSensitivePaths('powershell', 'linux')).toBe(false);
  });
  it('protected trees match case-insensitively where the filesystem does', () => {
    expect(classifyReadOnlyShellCommand('Get-Content .ENV', { dialect: 'powershell', projectRoot: 'C:\\project' })).toMatchObject({ readOnly: false, reasonCode: 'PATH_PROTECTED' });
    expect(classifyReadOnlyShellCommand('cat .ENV', { projectRoot: NO_DISK_ROOT, platform: 'darwin' })).toMatchObject({ readOnly: false, reasonCode: 'PATH_PROTECTED' });
    expect(classifyReadOnlyShellCommand('cat .Brain/MEMORY.DB', { projectRoot: NO_DISK_ROOT, platform: 'win32' })).toMatchObject({ readOnly: false, reasonCode: 'PATH_PROTECTED' });
    expect(classifyReadOnlyShellCommand('cat .ENV', { projectRoot: NO_DISK_ROOT, platform: 'linux' })).toMatchObject({ readOnly: true });
    expect(classifyReadOnlyShellCommand('cat .ENV', { projectRoot: NO_DISK_ROOT, platform: 'linux', caseSensitivePaths: false })).toMatchObject({ readOnly: false, reasonCode: 'PATH_PROTECTED' });
    const upper = `${NO_DISK_ROOT.toUpperCase()}/src/a.ts`;
    expect(classifyReadOnlyShellCommand(`cat ${upper}`, { projectRoot: NO_DISK_ROOT, platform: 'darwin' })).toMatchObject({ readOnly: true });
    expect(classifyReadOnlyShellCommand(`cat ${upper}`, { projectRoot: NO_DISK_ROOT, platform: 'linux' })).toMatchObject({ readOnly: false, reasonCode: 'PATH_OUTSIDE_ROOT' });
  });
});

describe('7111 symlink + existence rule when the project root is on disk', () => {
  it('a symlink inside the project pointing outside, a symlinked parent dir, and a missing path all fail closed; real files pass', async () => {
    const base = await mkdtemp(join(tmpdir(), 'ro-symlink-'));
    try {
      const project = join(base, 'project');
      const { mkdir, symlink } = await import('node:fs/promises');
      await mkdir(join(project, 'docs'), { recursive: true });
      await mkdir(join(base, 'elsewhere'));
      await writeFile(join(base, 'outside.txt'), 'OUTSIDE');
      await writeFile(join(base, 'elsewhere', 'secret.md'), 'S');
      await writeFile(join(project, 'docs', 'a.md'), 'A');
      await symlink(join(base, 'outside.txt'), join(project, 'link.txt'));
      await symlink(join(base, 'elsewhere'), join(project, 'linkdir'));
      const at = (command: string) => classifyReadOnlyShellCommand(command, { projectRoot: project, platform: 'linux' });
      expect(at('cat link.txt')).toMatchObject({ readOnly: false, reasonCode: 'PATH_OUTSIDE_ROOT' });
      expect(at('cat linkdir/secret.md')).toMatchObject({ readOnly: false, reasonCode: 'PATH_OUTSIDE_ROOT' });
      expect(at('grep -r x linkdir')).toMatchObject({ readOnly: false, reasonCode: 'PATH_OUTSIDE_ROOT' });
      expect(at('find linkdir -name x')).toMatchObject({ readOnly: false, reasonCode: 'PATH_OUTSIDE_ROOT' });
      expect(at('cat linkdir/*.md')).toMatchObject({ readOnly: false, reasonCode: 'PATH_OUTSIDE_ROOT' });
      expect(at('cat docs/missing.md')).toMatchObject({ readOnly: false, reasonCode: 'PATH_UNRESOLVED' });
      expect(at('cat missingdir/*.md')).toMatchObject({ readOnly: false, reasonCode: 'PATH_UNRESOLVED' });
      expect(at('cat docs/a.md')).toMatchObject({ readOnly: true, paths: ['docs/a.md'] });
      expect(at('grep -r x docs')).toMatchObject({ readOnly: true });
      expect(at('cat docs/*.md')).toMatchObject({ readOnly: true });
      expect(at('git show HEAD:docs/a.md')).toMatchObject({ readOnly: true });
      expect(at('wc -l < docs/a.md')).toMatchObject({ readOnly: true });
      expect(at('wc -l < link.txt')).toMatchObject({ readOnly: false, reasonCode: 'PATH_OUTSIDE_ROOT' });
      // The real shell WOULD escape — that is exactly why the classifier must refuse.
      if (bashAvailable) expect(await run('cat link.txt', project)).toBe(0);
    } finally { await rm(base, { recursive: true, force: true }); }
  });

  it('stays lexical when the root is not on disk (pure unit mode) or when resolveSymlinks is off', () => {
    expect(classifyReadOnlyShellCommand('cat docs/missing.md', { projectRoot: '/definitely/not/on/disk' })).toMatchObject({ readOnly: true });
    expect(classifyReadOnlyShellCommand('cat docs/missing.md', { projectRoot: tmpdir(), resolveSymlinks: false })).toMatchObject({ readOnly: true });
  });
});
