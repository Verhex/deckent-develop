import { describe, it, expect } from 'vitest';
import { matchGlob } from '../../../src/core/doc-tracking/glob.js';

describe('matchGlob', () => {
  it('matches ** across path segments', () => {
    expect(matchGlob('docs/adr/090-x.md', 'docs/adr/**')).toBe(true);
    expect(matchGlob('docs/reference/api.md', 'docs/adr/**')).toBe(false);
  });
  it('matches * within a single segment only', () => {
    expect(matchGlob('a/b.md', '**/*.md')).toBe(true);
    expect(matchGlob('foo.template.md', '**/*.template.md')).toBe(true);
  });
  it('matches exact literal paths', () => {
    expect(matchGlob('CLAUDE.md', 'CLAUDE.md')).toBe(true);
    expect(matchGlob('docs/CLAUDE.md', 'CLAUDE.md')).toBe(false);
  });
  it('matches node_modules anywhere', () => {
    expect(matchGlob('node_modules/x/y.md', 'node_modules/**')).toBe(true);
    expect(matchGlob('a/node_modules/y.md', '**/worktrees/**')).toBe(false);
  });
});
