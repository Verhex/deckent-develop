import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

describe('Blueprint file existence', () => {
  it('AGENTS.md exists and is non-empty', () => {
    const path = join(ROOT, 'AGENTS.md');
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf-8').trim().length).toBeGreaterThan(0);
  });

  it('.contracts/api-surface.md exists and is non-empty', () => {
    const path = join(ROOT, '.contracts', 'api-surface.md');
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf-8').trim().length).toBeGreaterThan(0);
  });

  it('.deckent/workspace/IDENTITY.md exists and is non-empty (skip in CI)', () => {
    const path = join(ROOT, '.deckent', 'workspace', 'IDENTITY.md');
    if (!existsSync(path)) return; // .deckent/ is gitignored — only exists locally after deckent init
    expect(readFileSync(path, 'utf-8').trim().length).toBeGreaterThan(0);
  });

  it('AGENTS.md contains Architecture section', () => {
    const content = readFileSync(join(ROOT, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('## Architecture');
    expect(content).toContain('brain_planning');
  });

  it('.contracts/api-surface.md contains task format', () => {
    const content = readFileSync(join(ROOT, '.contracts', 'api-surface.md'), 'utf-8');
    expect(content).toContain('.tasks/');
    expect(content).toContain('Module Import Rules');
  });
});
