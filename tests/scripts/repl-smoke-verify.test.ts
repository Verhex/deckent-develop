/**
 * Sprint 223 Task 223-010 — repl-smoke-verify hermetic unit tests.
 *
 * Hermetic: no real subprocess spawning, no dist dependency, no gitignored state.
 * Tests drive exported pure-function helpers from the smoke script in isolation,
 * plus the dist-missing skip path of runSmoke().
 */

import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkDistExists,
  evaluateHelpQuick,
  evaluateStatusLine,
  evaluatePerfReuse,
  evaluateLayoutSeparation,
  runSmoke,
} from '../../scripts/repl-smoke-verify.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');

// ─── checkDistExists ──────────────────────────────────────────────────────────

describe('checkDistExists', () => {
  it('returns false for a path that does not exist', () => {
    expect(checkDistExists('/nonexistent/dist/cli/entry.js')).toBe(false);
  });

  it('returns true for package.json (always present in repo)', () => {
    const pkgPath = resolve(PROJECT_ROOT, 'package.json');
    expect(checkDistExists(pkgPath)).toBe(true);
  });
});

// ─── evaluateHelpQuick ────────────────────────────────────────────────────────

describe('evaluateHelpQuick — /help quick check', () => {
  it('passes when stdout has help keywords and elapsed is well under 1000ms', () => {
    const result = evaluateHelpQuick('Komutlar:\n  /help     Kullanılabilir komutları listele\n  /exit', 200);
    expect(result.pass).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('passes when stdout contains "help" keyword and elapsed < 1000ms', () => {
    const result = evaluateHelpQuick('/help show help\n/exit', 350);
    expect(result.pass).toBe(true);
  });

  it('fails when elapsed exceeds 1000ms', () => {
    const result = evaluateHelpQuick('Komutlar:\n  /help', 1500);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/1500ms/);
  });

  it('fails when stdout contains no help keywords', () => {
    const result = evaluateHelpQuick('', 100);
    expect(result.pass).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('fails when stdout is blank even if elapsed is fast', () => {
    const result = evaluateHelpQuick('   ', 50);
    expect(result.pass).toBe(false);
  });
});

// ─── evaluateStatusLine ───────────────────────────────────────────────────────

describe('evaluateStatusLine — status-line visible', () => {
  it('passes when stdout contains "deckent" (from renderStatusLine)', () => {
    const result = evaluateStatusLine('deckent  claude  /workspace/my-project\nKomutlar:');
    expect(result.pass).toBe(true);
  });

  it('passes when "deckent" appears anywhere in output', () => {
    const result = evaluateStatusLine('some prefix\ndeckent  ollama  ~/proj\n');
    expect(result.pass).toBe(true);
  });

  it('fails when stdout is empty', () => {
    const result = evaluateStatusLine('');
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('deckent');
  });

  it('fails when stdout does not contain "deckent"', () => {
    const result = evaluateStatusLine('Komutlar:\n  /help   kullanılabilir komutlar\n');
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('deckent');
  });
});

// ─── evaluatePerfReuse ────────────────────────────────────────────────────────

describe('evaluatePerfReuse — 2-message persistent reuse perf', () => {
  it('passes when elapsed is well under 8000ms', () => {
    const result = evaluatePerfReuse('Komutlar:\nKomutlar:\n', 400);
    expect(result.pass).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('passes at exactly 7999ms', () => {
    const result = evaluatePerfReuse('output', 7999);
    expect(result.pass).toBe(true);
  });

  it('fails when elapsed exceeds 8000ms', () => {
    const result = evaluatePerfReuse('output', 9500);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/9500ms/);
  });

  it('fails at exactly 8001ms', () => {
    const result = evaluatePerfReuse('x', 8001);
    expect(result.pass).toBe(false);
  });
});

// ─── evaluateLayoutSeparation ─────────────────────────────────────────────────

describe('evaluateLayoutSeparation — user/deckent layout separation', () => {
  it('passes when stdout contains the "›" user-message prefix', () => {
    const result = evaluateLayoutSeparation('deckent  claude  /proj\n› hello\n● deckent\n');
    expect(result.pass).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('passes with just the "›" prefix even without assistant header', () => {
    const result = evaluateLayoutSeparation('› hello world\n');
    expect(result.pass).toBe(true);
  });

  it('fails when stdout is empty (REPL produced no output)', () => {
    const result = evaluateLayoutSeparation('');
    expect(result.pass).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('fails when stdout has content but no "›" prefix (layout not wired)', () => {
    const result = evaluateLayoutSeparation('deckent  claude  /proj\n[chat-native] error: spawn failed\n');
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('layout');
  });
});

// ─── runSmoke — dist-not-found skip ──────────────────────────────────────────

describe('runSmoke — dist-not-found skip guard', () => {
  it('returns skipped=true and pass=true when entryPath does not exist', async () => {
    const result = await runSmoke({ entryPath: '/nonexistent/path/dist/cli/entry.js' });
    expect(result.skipped).toBe(true);
    expect(result.pass).toBe(true);
  });

  it('populates scenarios with SKIP entries when dist is absent', async () => {
    const result = await runSmoke({ entryPath: '/nonexistent/entry.js' });
    expect(Array.isArray(result.scenarios)).toBe(true);
    expect(result.scenarios.length).toBeGreaterThan(0);
    expect(result.scenarios.every((s: string) => s.startsWith('SKIP'))).toBe(true);
  });

  it('does NOT mark as failed when dist is missing (skip ≠ failure)', async () => {
    const result = await runSmoke({ entryPath: '/no/dist/entry.js' });
    expect(result.pass).toBe(true);
    expect(result.skipped).toBe(true);
  });
});
