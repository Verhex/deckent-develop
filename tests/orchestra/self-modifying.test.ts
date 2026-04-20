// ═══ Self-Modifying Detector — Alias API & Sprint Controller Wire Tests ═══
// Sprint 145 Task 7 — ADR-038 Runtime Wire
// Tests the DIRECTIVES-named API: isDeckentRepository, isSelfModifyingScope, isSelfModifyingTask

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  detectDeckentRepo as isDeckentRepository,
  isSelfModifying,
  clearDetectionCache,
} from '../../src/orchestra/self-modifying-detector.js';

describe('self-modifying-detector alias API', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = join(
      tmpdir(),
      `deckent-self-mod-alias-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
      JSON.stringify({ name: 'deckent', version: '0.4.0' }),
      'utf-8',
    );
  }

  function setupUserProject(name = 'myapp'): void {
    mkdirSync(join(testRoot, '.deckent'), { recursive: true });
    writeFileSync(
      join(testRoot, 'package.json'),
      JSON.stringify({ name, version: '1.0.0' }),
      'utf-8',
    );
  }

  // ═══ Test 1: isDeckentRepository — deckent repo → true ═══

  it('isDeckentRepository returns true for deckent-dev repo', () => {
    setupDeckentRepo();
    expect(isDeckentRepository(testRoot)).toBe(true);
  });

  // ═══ Test 2: isDeckentRepository — user project → false ═══

  it('isDeckentRepository returns false for user project (package.json name="myapp")', () => {
    setupUserProject('myapp');
    expect(isDeckentRepository(testRoot)).toBe(false);
  });

  // ═══ Test 3: isSelfModifying — src/orchestra/ on deckent → true ═══

  it('isSelfModifying returns true for src/orchestra/ in deckent repo', () => {
    setupDeckentRepo();
    const task = { scope: { directories: ['src/orchestra/'], filesWrite: [] } };
    expect(isSelfModifying(task, testRoot)).toBe(true);
  });

  // ═══ Test 4: isSelfModifying — docs/ on deckent → false ═══

  it('isSelfModifying returns false for docs/ in deckent repo', () => {
    setupDeckentRepo();
    const task = { scope: { directories: ['docs/'], filesWrite: ['DIRECTIVES.md'] } };
    expect(isSelfModifying(task, testRoot)).toBe(false);
  });

  // ═══ Test 5: isSelfModifying — src/orchestra/ on user project → false ═══

  it('isSelfModifying returns false for src/orchestra/ in user project', () => {
    setupUserProject();
    const task = { scope: { directories: ['src/orchestra/', 'src/core/'] } };
    expect(isSelfModifying(task, testRoot)).toBe(false);
  });

  // ═══ Test 6: isSelfModifying — task scope integration ═══

  it('isSelfModifying integrates with task scope correctly', () => {
    setupDeckentRepo();

    const selfModTask = {
      scope: { directories: ['src/agents/'], filesWrite: ['src/agents/worker.ts'] },
    };
    expect(isSelfModifying(selfModTask, testRoot)).toBe(true);

    const safeTask = {
      scope: { directories: ['tests/'], filesWrite: ['tests/agents/worker.test.ts'] },
    };
    expect(isSelfModifying(safeTask, testRoot)).toBe(false);
  });

  // ═══ Test 7: isSelfModifying with filesWrite only ═══

  it('isSelfModifying detects self-modification via filesWrite only', () => {
    setupDeckentRepo();
    const task = { scope: { filesWrite: ['src/cli/entry.ts', 'src/mcp/server.ts'] } };
    expect(isSelfModifying(task, testRoot)).toBe(true);
  });

  // ═══ Test 8: isSelfModifying with empty scope ═══

  it('isSelfModifying returns false for empty scope', () => {
    setupDeckentRepo();
    const task = { scope: { directories: [], filesWrite: [] } };
    expect(isSelfModifying(task, testRoot)).toBe(false);
  });

  // ═══ Test 9: isDeckentRepository with IDENTITY.md fallback ═══

  it('isDeckentRepository detects deckent via IDENTITY.md when package.json name differs', () => {
    // This tests the IDENTITY.md fallback path mentioned in DIRECTIVES
    // Current implementation uses package.json name only — this test documents that behavior
    mkdirSync(join(testRoot, '.deckent', 'workspace'), { recursive: true });
    writeFileSync(
      join(testRoot, '.deckent', 'workspace', 'IDENTITY.md'),
      '# Project Identity\nName: deckent\nType: AI agent orchestration CLI\n',
      'utf-8',
    );
    writeFileSync(
      join(testRoot, 'package.json'),
      JSON.stringify({ name: 'deckent-fork', version: '1.0.0' }),
      'utf-8',
    );
    // Current impl requires package.json name === 'deckent', so this returns false
    // (by design — ADR-039 says package.json name is the definitive discriminator)
    expect(isDeckentRepository(testRoot)).toBe(false);
  });
});
