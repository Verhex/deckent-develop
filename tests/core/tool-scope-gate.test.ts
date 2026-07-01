/**
 * TOOL-SCOPE gate (Sprint 352 Task 352-010, pivot-P0 "scope'u prompt yerine
 * TOOL ile çöz" — ADR-G-017 / ADR-G-020).
 *
 * `createScopeGate` is a pure, realpath-based containment check — the core-
 * layer counterpart to src/orchestra/authority-enforcer.ts's `isWithinScope`
 * (mirrors its algorithm without importing it, see docImpact note in
 * .tasks/task-352-010.result: ADR-D-004 C1 forbids core/ importing
 * orchestra/, and authority-enforcer.ts is outside this task's write scope).
 *
 * Hermetic: all fixtures live under a fresh `os.tmpdir()` directory created
 * in `beforeEach` and removed in `afterEach`. No project-root files are read.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createScopeGate } from '../../src/core/tool-scope-gate.js';

let projectRoot: string;
let outsideRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'tool-scope-gate-project-'));
  outsideRoot = mkdtempSync(join(tmpdir(), 'tool-scope-gate-outside-'));

  mkdirSync(join(projectRoot, 'src', 'core'), { recursive: true });
  mkdirSync(join(projectRoot, 'src', 'cli'), { recursive: true });
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
  rmSync(outsideRoot, { recursive: true, force: true });
});

// ═══ checkWrite — symlink-escape denial ══════════════════════════════

describe('createScopeGate.checkWrite — symlink-escape denial', () => {
  it('flags a symlink inside scope.directories that resolves outside scope as a violation', () => {
    const secretFile = join(outsideRoot, 'secret.ts');
    writeFileSync(secretFile, 'export const secret = 1;\n');

    const evilLink = join(projectRoot, 'src', 'core', 'evil-link.ts');
    symlinkSync(secretFile, evilLink);

    const gate = createScopeGate(
      { directories: ['src/core/'] },
      { projectRoot },
    );
    const result = gate.checkWrite('src/core/evil-link.ts');

    expect(result.violation).toBe(true);
  });

  it('flags a symlink inside scope.filesWrite that resolves outside scope as a violation', () => {
    const secretFile = join(outsideRoot, 'secret.ts');
    writeFileSync(secretFile, 'export const secret = 1;\n');

    const evilLink = join(projectRoot, 'src', 'core', 'evil-link.ts');
    symlinkSync(secretFile, evilLink);

    const gate = createScopeGate(
      { filesWrite: ['src/core/evil-link.ts'] },
      { projectRoot },
    );
    const result = gate.checkWrite('src/core/evil-link.ts');

    expect(result.violation).toBe(true);
  });

  it('rejects a symlink cycle (ELOOP) as a violation instead of throwing', () => {
    const linkA = join(projectRoot, 'src', 'core', 'cycle-a');
    const linkB = join(projectRoot, 'src', 'core', 'cycle-b');
    symlinkSync(linkB, linkA);
    symlinkSync(linkA, linkB);

    const gate = createScopeGate({ directories: ['src/core/'] }, { projectRoot });

    expect(() => {
      const result = gate.checkWrite('src/core/cycle-a/file.ts');
      expect(result.violation).toBe(true);
    }).not.toThrow();
  });
});

// ═══ checkWrite — allow paths ═════════════════════════════════════════

describe('createScopeGate.checkWrite — allow paths', () => {
  it('allows an ordinary in-scope existing path matched via directory', () => {
    const realFile = join(projectRoot, 'src', 'core', 'tool-scope-gate.ts');
    writeFileSync(realFile, 'export const x = 1;\n');

    const gate = createScopeGate({ directories: ['src/core/'] }, { projectRoot });
    const result = gate.checkWrite('src/core/tool-scope-gate.ts');

    expect(result.allowed).toBe(true);
    expect(result.violation).toBe(false);
    expect(result.matchedVia).toBe('directory');
  });

  it('allows a new (non-existent) in-scope path — parent-realpath handling', () => {
    const gate = createScopeGate({ directories: ['src/core/'] }, { projectRoot });
    const result = gate.checkWrite('src/core/brand-new/nested/new-file.ts');

    expect(result.allowed).toBe(true);
    expect(result.matchedVia).toBe('directory');
  });

  it('allows a new (non-existent) file matched via scope.filesWrite exact entry', () => {
    const gate = createScopeGate({ filesWrite: ['src/core/tool-scope-gate.ts'] }, { projectRoot });
    const result = gate.checkWrite('src/core/tool-scope-gate.ts');

    expect(result.allowed).toBe(true);
    expect(result.matchedVia).toBe('filesWrite');
  });

  it('flags a path genuinely outside assigned scope as a violation', () => {
    writeFileSync(join(projectRoot, 'src', 'cli', 'entry.ts'), 'export {};\n');

    const gate = createScopeGate(
      { directories: ['src/core/'], filesWrite: ['src/core/tool-scope-gate.ts'] },
      { projectRoot },
    );
    const result = gate.checkWrite('src/cli/entry.ts');

    expect(result.violation).toBe(true);
  });

  it('flags every write as a violation when no scope is declared (fail-closed)', () => {
    const gate = createScopeGate({}, { projectRoot });
    const result = gate.checkWrite('src/core/anything.ts');

    expect(result.violation).toBe(true);
  });
});

// ═══ mode: advisory vs enforce ════════════════════════════════════════

describe('createScopeGate — advisory vs enforce mode', () => {
  it('defaults to advisory mode when options.mode is omitted', () => {
    const gate = createScopeGate({ directories: ['src/core/'] }, { projectRoot });
    expect(gate.mode).toBe('advisory');
  });

  it('advisory mode never blocks: violation stays true, allowed stays true', () => {
    const gate = createScopeGate({ directories: ['src/core/'] }, { projectRoot, mode: 'advisory' });
    const result = gate.checkWrite('src/cli/entry.ts');

    expect(result.violation).toBe(true);
    expect(result.allowed).toBe(true);
    expect(result.mode).toBe('advisory');
  });

  it('enforce mode blocks on violation: allowed mirrors violation', () => {
    const gate = createScopeGate({ directories: ['src/core/'] }, { projectRoot, mode: 'enforce' });
    const result = gate.checkWrite('src/cli/entry.ts');

    expect(result.violation).toBe(true);
    expect(result.allowed).toBe(false);
    expect(result.mode).toBe('enforce');
  });

  it('enforce mode still allows an in-scope write', () => {
    const gate = createScopeGate({ directories: ['src/core/'] }, { projectRoot, mode: 'enforce' });
    const result = gate.checkWrite('src/core/new-file.ts');

    expect(result.allowed).toBe(true);
    expect(result.violation).toBe(false);
  });
});

// ═══ checkRead ═════════════════════════════════════════════════════════

describe('createScopeGate.checkRead', () => {
  it('allows a path matched via scope.filesRead', () => {
    const gate = createScopeGate({ filesRead: ['src/core/config.ts'] }, { projectRoot });
    const result = gate.checkRead('src/core/config.ts');

    expect(result.allowed).toBe(true);
    expect(result.matchedVia).toBe('filesRead');
  });

  it('allows a path matched via scope.filesWrite (write implies read)', () => {
    const gate = createScopeGate({ filesWrite: ['src/core/tool-scope-gate.ts'] }, { projectRoot });
    const result = gate.checkRead('src/core/tool-scope-gate.ts');

    expect(result.allowed).toBe(true);
    expect(result.matchedVia).toBe('filesWrite');
  });

  it('allows a path matched via scope.directories', () => {
    const gate = createScopeGate({ directories: ['src/core/'] }, { projectRoot });
    const result = gate.checkRead('src/core/anything.ts');

    expect(result.allowed).toBe(true);
    expect(result.matchedVia).toBe('directory');
  });

  it('flags a path outside declared read scope as a violation (fail-closed)', () => {
    const gate = createScopeGate({ directories: ['src/core/'] }, { projectRoot });
    const result = gate.checkRead('src/cli/entry.ts');

    expect(result.violation).toBe(true);
  });
});

// ═══ projectRoot default ════════════════════════════════════════════════

describe('createScopeGate — projectRoot default', () => {
  it('falls back to process.cwd() when projectRoot is omitted', () => {
    const gate = createScopeGate({ directories: ['src/core/'] });
    const result = gate.checkRead('src/core/tool-scope-gate.ts');

    expect(result.allowed).toBe(true);
  });
});
