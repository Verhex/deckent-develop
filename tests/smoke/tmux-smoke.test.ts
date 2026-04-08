import { existsSync } from 'fs';
import { describe, it, expect } from 'vitest';

describe('Tmux Smoke — docs/tmux-smoke/ files exist', () => {
  it('docs/tmux-smoke/x.md should exist', () => {
    expect(existsSync('docs/tmux-smoke/x.md')).toBe(true);
  });

  it('docs/tmux-smoke/y.md should exist', () => {
    expect(existsSync('docs/tmux-smoke/y.md')).toBe(true);
  });

  it('docs/tmux-smoke/z.md should exist', () => {
    expect(existsSync('docs/tmux-smoke/z.md')).toBe(true);
  });
});
