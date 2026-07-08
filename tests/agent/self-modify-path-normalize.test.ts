// tests/agent/self-modify-path-normalize.test.ts
// born-542 — checkSelfModifying() must normalize write-target paths before
// comparing against DECKENT_SOURCE_PATTERNS, so an absolute-path variant of
// a blocked target cannot bypass the guard (ADR-039 SEC).
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkSelfModifying } from '../../src/agent/guards/self-modifying.js';
import { clearDetectionCache } from '../../src/orchestra/self-modifying-detector.js';

const made: string[] = [];
function deckentRoot(): string {
  const d = mkdtempSync(join(tmpdir(), 'sm-norm-deckent-'));
  made.push(d);
  mkdirSync(join(d, '.deckent'), { recursive: true });
  writeFileSync(join(d, 'package.json'), JSON.stringify({ name: 'deckent' }));
  return d;
}
afterEach(() => {
  clearDetectionCache();
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('checkSelfModifying — path normalization (born-542)', () => {
  it('elevates when the write target is the absolute-path variant of a blocked source path', () => {
    const root = deckentRoot();
    const v = checkSelfModifying(root, [join(root, 'src/core/config.ts')]);
    expect(v.elevated).toBe(true);
    expect(v.reason).toContain(join(root, 'src/core/config.ts'));
  });

  it('elevates when the write target has a ./ prefix', () => {
    const root = deckentRoot();
    const v = checkSelfModifying(root, ['./src/core/config.ts']);
    expect(v.elevated).toBe(true);
  });

  it('elevates when the write target uses .. segments that still resolve inside a source dir', () => {
    const root = deckentRoot();
    const v = checkSelfModifying(root, ['src/orchestra/../core/config.ts']);
    expect(v.elevated).toBe(true);
    expect(v.reason).toContain('src/orchestra/../core/config.ts');
  });

  it('does not elevate for the absolute-path variant of a legitimate non-source write', () => {
    const root = deckentRoot();
    const v = checkSelfModifying(root, [join(root, 'notes/todo.md')]);
    expect(v.elevated).toBe(false);
  });

  it('does not elevate when an absolute path escapes the repo root entirely', () => {
    const root = deckentRoot();
    const v = checkSelfModifying(root, ['/etc/passwd']);
    expect(v.elevated).toBe(false);
  });
});
