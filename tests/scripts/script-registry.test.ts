// Tests for scripts/lint-script-registry.mjs — the row-270 script-lifecycle registry gate.
// Covers: pure-function unit tests, the real repo (registry must cover the live scripts/
// directory exactly), and fixture violations driven through the real CLI via async spawn
// in a hermetic tmpdir (no spawnSync — CUSTOM Test Hermeticity, karpathy-discipline.md).

import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listRealTopLevelScripts,
  readRegistry,
  validateRegistry,
} from '../../scripts/lint-script-registry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const LINT_SCRIPT_PATH = path.join(PROJECT_ROOT, 'scripts', 'lint-script-registry.mjs');
const REGISTRY_PATH = path.join(PROJECT_ROOT, 'scripts', 'script-registry.json');

function baseEntry(overrides: Record<string, unknown> = {}) {
  return {
    file: 'scripts/a.mjs',
    class: 'gate',
    owner: 'owner-x',
    npmScript: null,
    input: 'in',
    output: 'out',
    expiry: 'none',
    ...overrides,
  };
}

async function runLint(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const captureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-script-registry-capture-'));
  const stdoutPath = path.join(captureRoot, 'stdout.log');
  const stderrPath = path.join(captureRoot, 'stderr.log');

  try {
    let code: number | null;
    const stdoutFd = fs.openSync(stdoutPath, 'w', 0o600);
    try {
      const stderrFd = fs.openSync(stderrPath, 'w', 0o600);
      try {
        code = await new Promise<number | null>((resolvePromise, rejectPromise) => {
          // Some sandbox adapters preserve a grandchild's exit code but do not
          // forward pipe bytes from a hermetic Vitest worker. File descriptors
          // keep the real async CLI boundary while making capture host-neutral.
          const child = spawn(process.execPath, [LINT_SCRIPT_PATH, ...args], {
            cwd: PROJECT_ROOT,
            stdio: ['ignore', stdoutFd, stderrFd],
            shell: false,
          });
          child.once('error', rejectPromise);
          child.once('close', resolvePromise);
        });
      } finally {
        fs.closeSync(stderrFd);
      }
    } finally {
      fs.closeSync(stdoutFd);
    }

    return {
      code,
      stdout: fs.readFileSync(stdoutPath, 'utf8'),
      stderr: fs.readFileSync(stderrPath, 'utf8'),
    };
  } finally {
    fs.rmSync(captureRoot, { recursive: true, force: true });
  }
}

// ─── listRealTopLevelScripts ─────────────────────────────────────────────

describe('listRealTopLevelScripts', () => {
  it('finds known top-level .mjs scripts in the real repo', () => {
    const files = listRealTopLevelScripts(PROJECT_ROOT);
    expect(files).toContain('scripts/adr-validator.mjs');
    expect(files).toContain('scripts/lint-script-registry.mjs');
    expect(files.length).toBeGreaterThan(50);
  });

  it('excludes non-.mjs files (.ts/.sh/.json)', () => {
    const files = listRealTopLevelScripts(PROJECT_ROOT);
    expect(files).not.toContain('scripts/generate-cli-docs.ts');
    expect(files).not.toContain('scripts/bump-version.sh');
    expect(files).not.toContain('scripts/audit-exceptions.json');
  });

  it('excludes files inside scripts/ subdirectories (non-recursive)', () => {
    const files = listRealTopLevelScripts(PROJECT_ROOT);
    expect(files.some((f) => f.includes('hermeticity/'))).toBe(false);
    expect(files.some((f) => f.includes('memory/'))).toBe(false);
    expect(files.some((f) => f.includes('platform-probe/'))).toBe(false);
    expect(files.some((f) => f.includes('security/'))).toBe(false);
    expect(files.some((f) => f.includes('archive/'))).toBe(false);
  });

  it('returns a sorted, de-duplicated list', () => {
    const files = listRealTopLevelScripts(PROJECT_ROOT);
    const sorted = [...files].sort();
    expect(files).toEqual(sorted);
    expect(new Set(files).size).toBe(files.length);
  });
});

// ─── readRegistry ─────────────────────────────────────────────────────────

describe('readRegistry', () => {
  it('reads and parses the real scripts/script-registry.json', () => {
    const { registry, error } = readRegistry(REGISTRY_PATH);
    expect(error).toBeNull();
    expect(registry).not.toBeNull();
    expect(Array.isArray(registry.entries)).toBe(true);
  });

  it('returns E_REGISTRY_MISSING for a nonexistent path', () => {
    const { registry, error } = readRegistry('/nonexistent/script-registry.json');
    expect(registry).toBeNull();
    expect(error).toContain('E_REGISTRY_MISSING');
  });

  describe('unparsable JSON', () => {
    const TMP_ROOT = path.join(os.tmpdir(), 'lint-script-registry-readRegistry-test');
    afterEach(() => { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); });

    it('returns E_REGISTRY_UNPARSABLE for malformed JSON', () => {
      fs.mkdirSync(TMP_ROOT, { recursive: true });
      const badPath = path.join(TMP_ROOT, 'bad.json');
      fs.writeFileSync(badPath, '{ not valid json', 'utf8');
      const { registry, error } = readRegistry(badPath);
      expect(registry).toBeNull();
      expect(error).toContain('E_REGISTRY_UNPARSABLE');
    });
  });
});

// ─── validateRegistry (fixture violations) ────────────────────────────────

describe('validateRegistry', () => {
  it('passes for a registry that exactly covers the real files', () => {
    const real = ['scripts/a.mjs', 'scripts/b.mjs'];
    const registry = { entries: [baseEntry({ file: 'scripts/a.mjs' }), baseEntry({ file: 'scripts/b.mjs' })] };
    const { ok, violations } = validateRegistry(registry, real);
    expect(ok).toBe(true);
    expect(violations).toHaveLength(0);
  });

  it('rejects a non-object registry root', () => {
    const { ok, violations } = validateRegistry(null, []);
    expect(ok).toBe(false);
    expect(violations[0]).toContain('E_REGISTRY_ROOT_NOT_OBJECT');
  });

  it('rejects a registry with entries not an array', () => {
    const { ok, violations } = validateRegistry({ entries: 'nope' }, []);
    expect(ok).toBe(false);
    expect(violations[0]).toContain('E_REGISTRY_ENTRIES_MISSING');
  });

  it('flags a real file with no registry entry', () => {
    const real = ['scripts/a.mjs', 'scripts/b.mjs'];
    const registry = { entries: [baseEntry({ file: 'scripts/a.mjs' })] };
    const { ok, violations } = validateRegistry(registry, real);
    expect(ok).toBe(false);
    expect(violations.some((v) => v.includes('E_REAL_FILE_UNREGISTERED') && v.includes('scripts/b.mjs'))).toBe(true);
  });

  it('flags a registry entry for a file that does not really exist', () => {
    const real = ['scripts/a.mjs'];
    const registry = { entries: [baseEntry({ file: 'scripts/a.mjs' }), baseEntry({ file: 'scripts/ghost.mjs' })] };
    const { ok, violations } = validateRegistry(registry, real);
    expect(ok).toBe(false);
    expect(violations.some((v) => v.includes('E_ENTRY_FILE_NOT_REAL') && v.includes('scripts/ghost.mjs'))).toBe(true);
  });

  it('flags a duplicate file entry', () => {
    const real = ['scripts/a.mjs'];
    const registry = { entries: [baseEntry({ file: 'scripts/a.mjs' }), baseEntry({ file: 'scripts/a.mjs' })] };
    const { ok, violations } = validateRegistry(registry, real);
    expect(ok).toBe(false);
    expect(violations.some((v) => v.includes('E_ENTRY_FILE_DUPLICATE'))).toBe(true);
  });

  it('flags an invalid class enum value', () => {
    const real = ['scripts/a.mjs'];
    const registry = { entries: [baseEntry({ file: 'scripts/a.mjs', class: 'not-a-real-class' })] };
    const { ok, violations } = validateRegistry(registry, real);
    expect(ok).toBe(false);
    expect(violations.some((v) => v.includes('E_ENTRY_CLASS_INVALID'))).toBe(true);
  });

  it.each(['owner', 'input', 'output', 'expiry'])('flags a missing required field: %s', (field) => {
    const real = ['scripts/a.mjs'];
    const entry = baseEntry({ file: 'scripts/a.mjs' }) as Record<string, unknown>;
    entry[field] = '';
    const registry = { entries: [entry] };
    const { ok, violations } = validateRegistry(registry, real);
    expect(ok).toBe(false);
    expect(violations.some((v) => v.includes('E_ENTRY_FIELD_MISSING') && v.includes(`.${field}`))).toBe(true);
  });

  it('flags an invalid npmScript type', () => {
    const real = ['scripts/a.mjs'];
    const registry = { entries: [baseEntry({ file: 'scripts/a.mjs', npmScript: 42 })] };
    const { ok, violations } = validateRegistry(registry, real);
    expect(ok).toBe(false);
    expect(violations.some((v) => v.includes('E_ENTRY_NPMSCRIPT_INVALID'))).toBe(true);
  });

  it('accepts npmScript as null or a string', () => {
    const real = ['scripts/a.mjs', 'scripts/b.mjs'];
    const registry = {
      entries: [
        baseEntry({ file: 'scripts/a.mjs', npmScript: null }),
        baseEntry({ file: 'scripts/b.mjs', npmScript: 'lint:x' }),
      ],
    };
    expect(validateRegistry(registry, real).ok).toBe(true);
  });

  it('accepts every enum class value on an otherwise-valid entry', () => {
    for (const klass of ['gate', 'recurring-proof', 'admin-migration', 'one-shot', 'retired']) {
      const real = ['scripts/a.mjs'];
      const registry = { entries: [baseEntry({ file: 'scripts/a.mjs', class: klass })] };
      expect(validateRegistry(registry, real).ok, klass).toBe(true);
    }
  });
});

// ─── Real repo: the registry covers exactly the live scripts/ directory ──

describe('real repo: registry vs live directory', () => {
  it('reports ZERO registry debt — the real directory is covered exactly', () => {
    // 2026-08-28 (F3): this case used to PIN THE DEBT — it asserted the exact list
    // of violations the repo was carrying (three gate entries with no `expiry`, and
    // scripts/authority-handoff.mjs never registered). Pinning a defect makes the
    // suite go red the moment someone repairs it, which is backwards. The debt was
    // repaired and scripts/lint-script-registry.mjs became a lint:gates member the
    // same day, so the invariant now asserted is the one worth keeping: the registry
    // covers the real directory exactly, and any future drift fails the chain.
    const realFiles = listRealTopLevelScripts(PROJECT_ROOT);
    const { registry, error } = readRegistry(REGISTRY_PATH);
    expect(error).toBeNull();
    const { ok, violations } = validateRegistry(registry, realFiles);
    expect(violations).toEqual([]);
    expect(ok).toBe(true);
  });
});

// ─── CLI integration (async spawn, hermetic tmpdir) ───────────────────────

describe('lint-script-registry.mjs CLI (async spawn)', () => {
  it('exits 0 against the repaired real repo root', async () => {
    // 2026-08-28 (F3): flipped with the case above — the real root is consistent now
    // and the gate is chained into lint:gates, so a red run here means real drift.
    const { code, stdout, stderr } = await runLint(['--root', PROJECT_ROOT]);
    expect(stderr).toBe('');
    expect(stdout).toContain('OK:');
    expect(stdout).toContain('covered exactly');
    expect(code).toBe(0);
  });

  describe('fixture repo (tmpdir)', () => {
    let tmpRoot: string | null = null;

    afterEach(() => {
      if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
      tmpRoot = null;
    });

    function makeFixture(): string {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-script-registry-cli-'));
      fs.mkdirSync(path.join(root, 'scripts'));
      fs.writeFileSync(path.join(root, 'scripts', 'a.mjs'), '#!/usr/bin/env node\n', 'utf8');
      fs.writeFileSync(path.join(root, 'scripts', 'b.mjs'), '#!/usr/bin/env node\n', 'utf8');
      return root;
    }

    it('exits 1 when the registry is missing an entry for a real file', async () => {
      tmpRoot = makeFixture();
      const registry = { entries: [baseEntry({ file: 'scripts/a.mjs' })] };
      fs.writeFileSync(path.join(tmpRoot, 'scripts', 'script-registry.json'), JSON.stringify(registry), 'utf8');
      const { code, stderr } = await runLint(['--root', tmpRoot]);
      expect(code).toBe(1);
      expect(stderr).toContain('E_REAL_FILE_UNREGISTERED');
      expect(stderr).toContain('scripts/b.mjs');
    });

    it('exits 1 when an entry has an invalid class', async () => {
      tmpRoot = makeFixture();
      const registry = {
        entries: [
          baseEntry({ file: 'scripts/a.mjs', class: 'bogus-class' }),
          baseEntry({ file: 'scripts/b.mjs' }),
        ],
      };
      fs.writeFileSync(path.join(tmpRoot, 'scripts', 'script-registry.json'), JSON.stringify(registry), 'utf8');
      const { code, stderr } = await runLint(['--root', tmpRoot]);
      expect(code).toBe(1);
      expect(stderr).toContain('E_ENTRY_CLASS_INVALID');
    });

    it('exits 0 when the fixture registry exactly covers the fixture directory', async () => {
      tmpRoot = makeFixture();
      const registry = {
        entries: [baseEntry({ file: 'scripts/a.mjs' }), baseEntry({ file: 'scripts/b.mjs' })],
      };
      fs.writeFileSync(path.join(tmpRoot, 'scripts', 'script-registry.json'), JSON.stringify(registry), 'utf8');
      const { code, stdout } = await runLint(['--root', tmpRoot]);
      expect(code).toBe(0);
      expect(stdout).toContain('OK:');
    });

    it('exits 2 when scripts/script-registry.json is missing entirely', async () => {
      tmpRoot = makeFixture();
      const { code, stderr } = await runLint(['--root', tmpRoot]);
      expect(code).toBe(2);
      expect(stderr).toContain('E_REGISTRY_MISSING');
    });

    it('exits 2 when scripts/script-registry.json is unparsable', async () => {
      tmpRoot = makeFixture();
      fs.writeFileSync(path.join(tmpRoot, 'scripts', 'script-registry.json'), '{ broken', 'utf8');
      const { code, stderr } = await runLint(['--root', tmpRoot]);
      expect(code).toBe(2);
      expect(stderr).toContain('E_REGISTRY_UNPARSABLE');
    });
  });
});
