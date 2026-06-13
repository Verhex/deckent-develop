// tests/agent/guard-self-modifying.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkSelfModifying } from '../../src/agent/guards/self-modifying.js';
import { clearDetectionCache } from '../../src/orchestra/self-modifying-detector.js';

const made: string[] = [];
function deckentRoot(): string {
  const d = mkdtempSync(join(tmpdir(), 'sm-deckent-'));
  made.push(d);
  mkdirSync(join(d, '.deckent'), { recursive: true });
  writeFileSync(join(d, 'package.json'), JSON.stringify({ name: 'deckent' }));
  return d;
}
function plainRoot(): string {
  const d = mkdtempSync(join(tmpdir(), 'sm-plain-'));
  made.push(d);
  writeFileSync(join(d, 'package.json'), JSON.stringify({ name: 'someone-app' }));
  return d;
}
afterEach(() => {
  clearDetectionCache();
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('checkSelfModifying', () => {
  it('elevates when a write targets deckent source inside the deckent repo', () => {
    const v = checkSelfModifying(deckentRoot(), ['src/core/config.ts']);
    expect(v.elevated).toBe(true);
    expect(v.reason).toContain('src/core/');
  });
  it('does not elevate for non-source writes inside the deckent repo', () => {
    const v = checkSelfModifying(deckentRoot(), ['notes/todo.md']);
    expect(v.elevated).toBe(false);
  });
  it('does not elevate in a non-deckent project (user editing their own src is normal)', () => {
    const v = checkSelfModifying(plainRoot(), ['src/core/config.ts']);
    expect(v.elevated).toBe(false);
  });
  it('does not elevate when there are no write targets', () => {
    expect(checkSelfModifying(deckentRoot(), []).elevated).toBe(false);
  });
});
