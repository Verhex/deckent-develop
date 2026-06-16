import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractArtifactSeeds } from '../../../src/orchestra/autonomous/artifact-ref.js';

let dir: string | undefined;
afterEach(() => { if (dir) { rmSync(dir, { recursive: true, force: true }); dir = undefined; } });

function write(content: string): string {
  dir = mkdtempSync(join(tmpdir(), 'artref-'));
  const p = join(dir, 'PLAN.md');
  writeFileSync(p, content, 'utf-8');
  return p;
}

describe('extractArtifactSeeds', () => {
  it('returns all open checklist items of a whole file', () => {
    const p = write('# X\n- [ ] alpha\n- [x] done\n- [ ] beta\n');
    expect(extractArtifactSeeds(p)).toEqual(['alpha', 'beta']);
  });
  it('scopes to a section anchor (until the next heading of same/higher level)', () => {
    const p = write('## A\n- [ ] a1\n## B\n- [ ] b1\n');
    expect(extractArtifactSeeds(`${p}#b`)).toEqual(['b1']);
  });
  it('returns [] for a missing file', () => {
    expect(extractArtifactSeeds('/no/such/file.md')).toEqual([]);
  });
});
