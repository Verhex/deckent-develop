import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPolicy, SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';

const dirs: string[] = [];
function sandbox(): string {
  const d = mkdtempSync(join(tmpdir(), 'deckent-policy-'));
  dirs.push(d);
  mkdirSync(join(d, '.deckent'), { recursive: true });
  return d;
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('loadPolicy', () => {
  it('returns the safe default when no policy file exists', () => {
    const p = loadPolicy(sandbox());
    expect(p.defaultMode).toBe(SAFE_DEFAULT_POLICY.defaultMode);
    expect(p.alwaysFloor).toEqual(expect.arrayContaining(['deckent_kill', 'deckent_cleanup', 'deckent_recover']));
  });
  it('merges an enterprise-locked override (mode + extra floor)', () => {
    const d = sandbox();
    writeFileSync(join(d, '.deckent', 'permission-policy.json'), JSON.stringify({
      defaultMode: 'suggest',
      alwaysFloor: ['deckent_config'],
    }));
    const p = loadPolicy(d);
    expect(p.defaultMode).toBe('suggest');
    expect(p.alwaysFloor).toEqual(expect.arrayContaining(['deckent_kill', 'deckent_config']));
  });
  it('merges a solo-YOLO override (full-auto) but keeps the safe floor', () => {
    const d = sandbox();
    writeFileSync(join(d, '.deckent', 'permission-policy.json'), JSON.stringify({ defaultMode: 'full-auto' }));
    const p = loadPolicy(d);
    expect(p.defaultMode).toBe('full-auto');
    expect(p.alwaysFloor).toContain('deckent_cleanup');
  });
  it('falls back to safe default on malformed JSON (fail-safe)', () => {
    const d = sandbox();
    writeFileSync(join(d, '.deckent', 'permission-policy.json'), '{ not json');
    expect(loadPolicy(d).defaultMode).toBe(SAFE_DEFAULT_POLICY.defaultMode);
  });
  it('drops tierMap entries whose tier value is not silent/confirm/always (rejects bad tiers)', () => {
    const d = sandbox();
    writeFileSync(join(d, '.deckent', 'permission-policy.json'), JSON.stringify({
      tierMap: { bash: 'auto', deckent_read: 'silent', deckent_write: 'always' },
    }));
    const p = loadPolicy(d);
    expect(p.tierMap['bash']).toBeUndefined();         // invalid 'auto' is rejected, not silently applied
    expect(p.tierMap['deckent_read']).toBe('silent');  // valid tier kept
    expect(p.tierMap['deckent_write']).toBe('always'); // valid tier kept
  });
  it('cannot shrink the floor below baseline when alwaysFloor:[] is supplied', () => {
    const d = sandbox();
    writeFileSync(join(d, '.deckent', 'permission-policy.json'), JSON.stringify({ alwaysFloor: [] }));
    const p = loadPolicy(d);
    expect(p.alwaysFloor).toEqual(expect.arrayContaining(['deckent_kill', 'deckent_cleanup', 'deckent_recover']));
  });
});
