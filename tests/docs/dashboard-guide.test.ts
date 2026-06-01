import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const filePath = join(process.cwd(), 'docs', 'guide', 'dashboard.md');
const content = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';

describe('docs/guide/dashboard.md', () => {
  it('exists and is non-empty', () => {
    expect(existsSync(filePath)).toBe(true);
    expect(content.length).toBeGreaterThan(500);
  });

  it('covers all 8 dashboard pages', () => {
    expect(content).toContain('Dashboard');
    expect(content).toContain('Chat');
    expect(content).toContain('History');
    expect(content).toContain('Memory');
    expect(content).toContain('Config');
    expect(content).toContain('Evolution');
    expect(content).toContain('Nervous');
    expect(content).toContain('Enterprise');
  });

  it('explains how to start the serve', () => {
    expect(content).toContain('serve');
    expect(content).toContain('deckent serve');
    expect(content).toContain('--port');
  });

  it('explains sprint start via directives editor', () => {
    expect(content).toContain('directives');
    expect(content).toContain('DIRECTIVES');
    expect(content).toContain('Start Sprint');
  });

  it('covers chat usage', () => {
    expect(content).toContain('chat');
    expect(content).toContain('/api/chat');
  });

  it('covers terminal usage', () => {
    expect(content).toContain('terminal');
    expect(content).toContain('Terminal');
  });

  it('covers evolution, nervous, enterprise pages', () => {
    expect(content).toContain('evolution');
    expect(content).toContain('nervous');
    expect(content).toContain('enterprise');
  });

  it('contains code examples', () => {
    expect(content).toContain('```bash');
    expect(content).toContain('```');
  });
});
