// tests/cli/autonomous-i18n.test.ts
//
// Sprint 228 — Task 228-001: verify `deckent autonomous` CLI is fully i18n-clean
// (uses central getMessage(key, lang) catalog, no hardcoded user-facing strings,
// honors --lang en|tr, and interpolates placeholders correctly).
//
// Hermetic: all I/O under tmpdir; no HOME/config dependency.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  handleStatus,
  handleStop,
} from '../../src/cli/commands/autonomous.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

function mkRoot(): string {
  return mkdtempSync(join(tmpdir(), 'autonomous-i18n-'));
}

function captureStdout(fn: () => void | Promise<void>): Promise<string> {
  const captured: string[] = [];
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    captured.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  });
  const restore = (): void => spy.mockRestore();
  const result = fn();
  if (result instanceof Promise) {
    return result.finally(restore).then(() => captured.join(''));
  }
  restore();
  return Promise.resolve(captured.join(''));
}

describe('autonomous CLI i18n (228-001)', () => {
  let root: string;

  beforeEach(() => {
    root = mkRoot();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('status (en, default) → English strings sourced from the central catalog', async () => {
    const out = await captureStdout(() => handleStatus({ root, lang: 'en' }));
    // Catalog ground-truth — must match getMessage output verbatim.
    expect(out).toContain(getMessage('autonomous.status_header', 'en'));
    expect(out).toContain(getMessage('autonomous.status_pending', 'en', { count: '0' }));
    expect(out).toContain(getMessage('autonomous.status_no_audit', 'en'));
    // Explicit English ground-truth check (so a catalog regression to TR text is caught).
    expect(out).toContain('Autonomous runtime status');
    expect(out).toContain('Pending approvals: 0');
    expect(out).toContain('No audit events yet.');
  });

  it('status (tr) → Turkish strings sourced from the central catalog', async () => {
    const out = await captureStdout(() => handleStatus({ root, lang: 'tr' }));
    expect(out).toContain(getMessage('autonomous.status_header', 'tr'));
    expect(out).toContain(getMessage('autonomous.status_pending', 'tr', { count: '0' }));
    expect(out).toContain(getMessage('autonomous.status_no_audit', 'tr'));
    // Explicit Turkish ground-truth.
    expect(out).toContain('Otonom runtime durumu');
    expect(out).toContain('Bekleyen onay: 0');
    expect(out).toContain('Henüz audit kaydı yok.');
    // English fallback strings must NOT leak through in tr mode.
    expect(out).not.toContain('Autonomous runtime status');
    expect(out).not.toContain('No audit events yet.');
  });

  it('pending-count interpolation honors {count} placeholder', async () => {
    const pendingDir = join(root, '.deckent', 'autonomous');
    mkdirSync(pendingDir, { recursive: true });
    writeFileSync(
      join(pendingDir, 'pending.json'),
      JSON.stringify([
        { triggerId: 'a' },
        { triggerId: 'b' },
        { triggerId: 'c' },
      ]),
      'utf-8',
    );

    const outEn = await captureStdout(() => handleStatus({ root, lang: 'en' }));
    expect(outEn).toContain('Pending approvals: 3');

    const outTr = await captureStdout(() => handleStatus({ root, lang: 'tr' }));
    expect(outTr).toContain('Bekleyen onay: 3');
  });

  it('recent-audit header uses i18n with {count}', async () => {
    const eventsFile = join(root, '.deckent', 'recently-works', 'autonomous-events.jsonl');
    mkdirSync(join(root, '.deckent', 'recently-works'), { recursive: true });
    writeFileSync(eventsFile, JSON.stringify({
      timestamp: '2026-06-04T00:00:00.000Z',
      payload: {
        timestamp: '2026-06-04T00:00:00.000Z',
        action: 'mrp.refresh',
        outcome: 'denied',
        reason: 'default-deny',
      },
    }) + '\n', 'utf-8');

    const outEn = await captureStdout(() => handleStatus({ root, lang: 'en' }));
    expect(outEn).toContain(getMessage('autonomous.status_recent_audit', 'en', { count: '1' }));
    expect(outEn).toContain('Recent audit (1):');

    const outTr = await captureStdout(() => handleStatus({ root, lang: 'tr' }));
    expect(outTr).toContain(getMessage('autonomous.status_recent_audit', 'tr', { count: '1' }));
    expect(outTr).toContain('Son audit (1):');
  });

  it('stop → i18n message in both en and tr, marker file written', async () => {
    const outEn = await captureStdout(() => handleStop({ root, lang: 'en' }));
    expect(outEn).toContain(getMessage('autonomous.stop_marker_written', 'en'));
    expect(outEn).toContain('Stop signal written');
    expect(existsSync(join(root, '.deckent', 'autonomous', 'stop'))).toBe(true);

    // Reset for tr.
    rmSync(join(root, '.deckent', 'autonomous'), { recursive: true, force: true });

    const outTr = await captureStdout(() => handleStop({ root, lang: 'tr' }));
    expect(outTr).toContain(getMessage('autonomous.stop_marker_written', 'tr'));
    expect(outTr).toContain('Durdurma sinyali yazıldı');
    // English text must not leak in tr mode.
    expect(outTr).not.toContain('Stop signal written');
  });

  it('autonomous source has zero hardcoded user-facing console output', () => {
    // Sanity check the kanit invariants live in the actual source file.
    const src = readFileSync(
      join(process.cwd(), 'src', 'cli', 'commands', 'autonomous.ts'),
      'utf-8',
    );
    // getMessage usage threshold per task spec (≥5).
    const getMessageCount = (src.match(/getMessage/g) ?? []).length;
    expect(getMessageCount).toBeGreaterThanOrEqual(5);
    // No `console.log("Foo")` / `console.error('Bar')` with hardcoded English.
    const hardcodedConsole = src.match(/console\.(log|error)\(['"`][A-Z]/g) ?? [];
    expect(hardcodedConsole.length).toBe(0);
  });
});
