// ═══ Self-Modifying Detector — Enforcement Tests ═══════════════════
// Sprint 230 — ADR-039: user-project flag-gated enforcement
// Tests enforceSelfModifyingTask() with flag-on/off + dogfood preservation.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  enforceSelfModifyingTask,
  clearDetectionCache,
} from '../../src/orchestra/self-modifying-detector.js';

describe('enforceSelfModifyingTask', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = join(
      tmpdir(),
      `deckent-self-mod-enforce-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testRoot, { recursive: true });
    clearDetectionCache();
  });

  afterEach(() => {
    try {
      rmSync(testRoot, { recursive: true, force: true });
    } catch {
      // cleanup best-effort
    }
  });

  // ─── Helpers ────────────────────────────────────────────────────

  function setupDeckentRepo(): void {
    mkdirSync(join(testRoot, '.deckent'), { recursive: true });
    writeFileSync(
      join(testRoot, 'package.json'),
      JSON.stringify({ name: 'deckent', version: '1.0.0' }),
      'utf-8',
    );
  }

  function setupUserProject(name: string = 'my-app'): void {
    mkdirSync(join(testRoot, '.deckent'), { recursive: true });
    writeFileSync(
      join(testRoot, 'package.json'),
      JSON.stringify({ name, version: '1.0.0' }),
      'utf-8',
    );
  }

  function makeTask(directories: string[], filesWrite: string[] = []) {
    return {
      scope: {
        directories,
        filesRead: [],
        filesWrite,
      },
    };
  }

  // ═══ Test 1: flag-on + user project → enforce ═══════════════════

  it('flag-on: user project task touching source patterns returns enforce mode', () => {
    setupUserProject();
    const task = makeTask(['src/core/'], ['src/core/types.ts']);
    const result = enforceSelfModifyingTask(task, testRoot, /* enforceEnabled */ true);

    expect(result.selfModifying).toBe(true);
    expect(result.mode).toBe('enforce');
    expect(result.reason).toContain('self_mod_enforce=true');
  });

  it('flag-on: user project task with src/orchestra/ scope returns enforce', () => {
    setupUserProject('my-orchestrated-app');
    const task = makeTask(['src/orchestra/']);
    const result = enforceSelfModifyingTask(task, testRoot, true);

    expect(result.mode).toBe('enforce');
    expect(result.selfModifying).toBe(true);
  });

  // ═══ Test 2: flag-off + user project → advisory ═════════════════

  it('flag-off: user project with self-mod scope returns advisory mode', () => {
    setupUserProject();
    const task = makeTask(['src/core/']);
    const result = enforceSelfModifyingTask(task, testRoot, /* enforceEnabled */ false);

    expect(result.selfModifying).toBe(true);
    expect(result.mode).toBe('advisory');
    expect(result.reason).toContain('false');
  });

  it('flag-off (default): non-self-mod scope also returns advisory', () => {
    setupUserProject();
    const task = makeTask(['src/components/']);
    const result = enforceSelfModifyingTask(task, testRoot, false);

    expect(result.selfModifying).toBe(false);
    expect(result.mode).toBe('advisory');
  });

  // ═══ Test 3: deckent-dev + flag-on → advisory (ADR-039 preserved) ═

  it('deckent-dev: advisory regardless of enforceEnabled=true (ADR-039)', () => {
    setupDeckentRepo();
    const task = makeTask(['src/core/'], ['src/core/config.ts']);
    const result = enforceSelfModifyingTask(task, testRoot, /* enforceEnabled */ true);

    expect(result.mode).toBe('advisory');
    expect(result.reason).toContain('ADR-039');
  });

  it('deckent-dev: advisory for non-self-mod scope too (ADR-039 preserved)', () => {
    setupDeckentRepo();
    const task = makeTask(['docs/']);
    const result = enforceSelfModifyingTask(task, testRoot, true);

    expect(result.mode).toBe('advisory');
  });

  // ═══ Bonus: user project non-self-mod scope → advisory ══════════

  it('user project with unrelated scope returns advisory with selfModifying=false', () => {
    setupUserProject();
    const task = makeTask(['.brain/', 'docs/']);
    const result = enforceSelfModifyingTask(task, testRoot, true);

    expect(result.selfModifying).toBe(false);
    expect(result.mode).toBe('advisory');
    expect(result.reason).toContain('does not write');
  });
});
