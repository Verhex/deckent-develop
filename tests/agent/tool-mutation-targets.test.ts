import { describe, it, expect, afterEach } from 'vitest';
import { mutationTargetsForSelfMod } from '../../src/agent/tool-mutation-targets.js';
import { checkSelfModifying } from '../../src/agent/guards/self-modifying.js';
import { clearDetectionCache } from '../../src/orchestra/self-modifying-detector.js';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('mutationTargetsForSelfMod', () => {
  it('returns no targets for read_file paths', () => {
    expect(mutationTargetsForSelfMod('deckent_read_file', { path: 'src/cli/repl/app.tsx' })).toEqual([]);
  });

  it('returns paths for write tools and custom path-bearing tools', () => {
    expect(mutationTargetsForSelfMod('deckent_write_file', { path: 'src/core/config.ts' })).toEqual(['src/core/config.ts']);
    expect(mutationTargetsForSelfMod('srcwriter', { path: 'src/core/config.ts' })).toEqual(['src/core/config.ts']);
  });
});

describe('read path does not elevate self-mod guard', () => {
  const made: string[] = [];
  afterEach(() => {
    clearDetectionCache();
    for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('deckent_read_file under deckent repo stays non-elevated', () => {
    const d = mkdtempSync(join(tmpdir(), 'sm-read-'));
    made.push(d);
    mkdirSync(join(d, '.deckent'), { recursive: true });
    writeFileSync(join(d, 'package.json'), JSON.stringify({ name: 'deckent' }));
    const targets = mutationTargetsForSelfMod('deckent_read_file', { path: 'src/cli/repl/app.tsx' });
    expect(checkSelfModifying(d, targets).elevated).toBe(false);
  });
});
