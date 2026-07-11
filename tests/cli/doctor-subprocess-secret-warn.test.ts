// Task 411-002 — RC1-B: subprocess-backend .deck visibility honesty-slice (SEC-02).
//
// ADR-G-005 accepts an open gap: the subprocess spawn backend runs a worker as
// a host process inside the project root, where `.deck` stays disk-readable —
// unlike the docker backend, which now shadows `.deck` with an empty overlay
// (DECK-WORKER-ISOLATION, docker half done). A full fix (host-side credential
// broker) is out of scope for RC-1; this slice is the honesty-first middle
// ground: `deckent doctor` must WARN (not silently pass) when spawn_backend is
// subprocess AND a real, non-empty `.deck` exists.
//
// RED-first (disk-verified): before this task, `checkDeckSubprocessVisibility`
// did not exist and `runDoctorChecks` in doctor-checks.ts never surfaced this
// risk — a subprocess-config + fully-populated-.deck project passed doctor
// with zero mention of the exposure. This suite pins the fixed (GREEN)
// behavior and locks in the false-positive guards (no .deck / empty .deck /
// non-subprocess backend must all stay silent-pass).
//
// Hermetic: real tmpdir + real fs (mkdtempSync/rmSync), no vi.mock('node:fs')
// — matches tests/core/deck-file-secret-lifecycle.test.ts. No spawnSync used
// by the function under test, so no child_process mocking is needed either.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  checkDeckSubprocessVisibility,
  runDoctorChecks,
} from '../../src/cli/commands/doctor-checks.js';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'deckent-doctor-subprocess-secret-'));
}

describe('checkDeckSubprocessVisibility (SEC-02, ADR-G-005 subprocess-visibility honesty-slice)', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempDir();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('non-subprocess backend (docker) → silent PASS even with a fully populated .deck', () => {
    writeFileSync(join(root, '.deck'), 'DECKENT_CLAUDE_API_KEY=sk-live-sentinel\n', 'utf-8');
    const check = checkDeckSubprocessVisibility(root, 'docker');
    expect(check.passed).toBe(true);
    expect(check.required).toBe(false);
  });

  it('non-subprocess backend (undefined / not configured) → silent PASS', () => {
    writeFileSync(join(root, '.deck'), 'DECKENT_CLAUDE_API_KEY=sk-live-sentinel\n', 'utf-8');
    const check = checkDeckSubprocessVisibility(root, undefined);
    expect(check.passed).toBe(true);
  });

  it('subprocess backend + no .deck file → silent PASS (false-positive guard)', () => {
    const check = checkDeckSubprocessVisibility(root, 'subprocess');
    expect(check.passed).toBe(true);
    expect(check.required).toBe(false);
  });

  it('subprocess backend + .deck exists but is a template (all empty values) → silent PASS (false-positive guard)', () => {
    writeFileSync(
      root + '/.deck',
      '# comment\nDECKENT_CLAUDE_API_KEY=\nDECKENT_OPENAI_API_KEY=\n',
      'utf-8',
    );
    const check = checkDeckSubprocessVisibility(root, 'subprocess');
    expect(check.passed).toBe(true);
  });

  it('subprocess backend + .deck exists with at least one non-empty secret → WARN (passed:false, required:false)', () => {
    writeFileSync(join(root, '.deck'), 'DECKENT_CLAUDE_API_KEY=sk-live-real-secret-value\n', 'utf-8');
    const check = checkDeckSubprocessVisibility(root, 'subprocess');
    expect(check.passed).toBe(false);
    expect(check.required).toBe(false);
    expect(check.name).toBe('.deck Subprocess Visibility');
  });

  it('WARN message never leaks the .deck key name or secret value (no content disclosure)', () => {
    writeFileSync(
      join(root, '.deck'),
      'DECKENT_TOTALLY_UNIQUE_KEY_NAME=super-secret-value-xyz123\n',
      'utf-8',
    );
    const check = checkDeckSubprocessVisibility(root, 'subprocess');
    expect(check.passed).toBe(false);
    expect(check.message).not.toContain('DECKENT_TOTALLY_UNIQUE_KEY_NAME');
    expect(check.message).not.toContain('super-secret-value-xyz123');
  });

  it('is i18n\'d via getMessage — en default text', () => {
    writeFileSync(join(root, '.deck'), 'DECKENT_CLAUDE_API_KEY=sk-live\n', 'utf-8');
    const check = checkDeckSubprocessVisibility(root, 'subprocess', 'en');
    expect(check.message.toLowerCase()).toMatch(/subprocess/);
    expect(check.message.toLowerCase()).toMatch(/docker/);
  });

  it('is i18n\'d via getMessage — tr text differs from en for the same WARN case', () => {
    writeFileSync(join(root, '.deck'), 'DECKENT_CLAUDE_API_KEY=sk-live\n', 'utf-8');
    const enCheck = checkDeckSubprocessVisibility(root, 'subprocess', 'en');
    const trCheck = checkDeckSubprocessVisibility(root, 'subprocess', 'tr');
    expect(trCheck.message).not.toBe(enCheck.message);
    expect(trCheck.message).toMatch(/subprocess/i);
  });

  it('treats a whitespace-only value as empty (false-positive guard — not a real secret)', () => {
    writeFileSync(join(root, '.deck'), 'DECKENT_CLAUDE_API_KEY=   \n', 'utf-8');
    const check = checkDeckSubprocessVisibility(root, 'subprocess');
    expect(check.passed).toBe(true);
  });
});

describe('runDoctorChecks — wires checkDeckSubprocessVisibility into the doctor-checks.ts checks array', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempDir();
    // runDoctorChecks touches several other project paths (.deckent/, .brain/,
    // .gitignore, etc.) — none need to exist for this assertion, missing paths
    // degrade to their own honest not-found checks.
    mkdirSync(join(root, '.tasks'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('end-to-end: subprocess backend + populated .deck → the new check appears and WARNs', () => {
    writeFileSync(join(root, '.deck'), 'DECKENT_CLAUDE_API_KEY=sk-live-e2e\n', 'utf-8');

    const result = runDoctorChecks(root, undefined, 'subprocess', 'en');
    const check = result.checks.find((c) => c.name === '.deck Subprocess Visibility');

    expect(check).toBeDefined();
    expect(check!.passed).toBe(false);
    expect(check!.required).toBe(false);
    // Advisory-only: never flips the overall required-checks gate.
    expect(result.checks.filter((c) => c.required).every((c) => c.passed)).toBe(result.ok);
  });

  it('end-to-end: docker backend + populated .deck → the new check appears and stays silent-pass', () => {
    writeFileSync(join(root, '.deck'), 'DECKENT_CLAUDE_API_KEY=sk-live-e2e\n', 'utf-8');

    const result = runDoctorChecks(root, undefined, 'docker', 'en');
    const check = result.checks.find((c) => c.name === '.deck Subprocess Visibility');

    expect(check).toBeDefined();
    expect(check!.passed).toBe(true);
  });
});
