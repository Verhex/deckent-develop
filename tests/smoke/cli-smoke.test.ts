import { existsSync } from 'fs';
import { describe, it, expect } from 'vitest';

describe('CLI Smoke — docs/cli-smoke/ files exist', () => {
  it('docs/cli-smoke/a.md should exist', () => {
    expect(existsSync('docs/cli-smoke/a.md')).toBe(true);
  });

  it('docs/cli-smoke/b.md should exist', () => {
    expect(existsSync('docs/cli-smoke/b.md')).toBe(true);
  });

  it('docs/cli-smoke/c.md should exist', () => {
    expect(existsSync('docs/cli-smoke/c.md')).toBe(true);
  });
});
