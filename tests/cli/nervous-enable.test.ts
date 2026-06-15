// tests/cli/nervous-enable.test.ts
// make-usable #2 (nervous half) — `deckent nervous enable [--mode]` flips the
// project config flag with one command, preserving keys; default stays OFF.
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleEnableNervous, describeApproveTimeout } from '../../src/cli/commands/config-nervous.js';

const dirs: string[] = [];
function sandbox(): string {
  const d = mkdtempSync(join(tmpdir(), 'nervous-enable-'));
  dirs.push(d);
  mkdirSync(join(d, '.deckent'), { recursive: true });
  return d;
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const cfgPath = (d: string) => join(d, '.deckent', 'config.json');

describe('deckent nervous enable', () => {
  it('flips nervous_system.enabled=true with the default balanced authority', () => {
    const d = sandbox();
    handleEnableNervous(d, 'en');
    const cfg = JSON.parse(readFileSync(cfgPath(d), 'utf-8'));
    expect(cfg.nervous_system.enabled).toBe(true);
    expect(cfg.nervous_system.mode).toBe('balanced');
  });

  it('accepts an explicit authority preset and preserves unrelated keys', () => {
    const d = sandbox();
    writeFileSync(cfgPath(d), JSON.stringify({ max_workers: 4 }));
    handleEnableNervous(d, 'tr', 'strict');
    const cfg = JSON.parse(readFileSync(cfgPath(d), 'utf-8'));
    expect(cfg.max_workers).toBe(4);
    expect(cfg.nervous_system.enabled).toBe(true);
    expect(cfg.nervous_system.mode).toBe('strict');
  });

  it('rejects an invalid authority preset (sets exit code, does not enable)', () => {
    const d = sandbox();
    const prevExit = process.exitCode;
    handleEnableNervous(d, 'en', 'bogus-preset');
    expect(process.exitCode).toBe(1);
    process.exitCode = prevExit; // restore for the runner
  });
});

describe('describeApproveTimeout (make-usable #3 transparency)', () => {
  it('states the auto-apply window when a positive timeout is configured', () => {
    expect(describeApproveTimeout(10_000, 'en')).toMatch(/10s/);
    expect(describeApproveTimeout(30_000, 'tr')).toMatch(/30s/);
  });
  it('states auto-proceed is DISABLED when the timeout is <= 0', () => {
    expect(describeApproveTimeout(0, 'en')).toMatch(/DISABLED/i);
    expect(describeApproveTimeout(-1, 'tr')).toMatch(/KAPALI/i);
  });
});
