import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const root = join(import.meta.dirname ?? __dirname, '../../');

describe('doc-honesty', () => {
  it('Gate #8 is marked PARTIAL in beta-tracker.md', () => {
    // beta-tracker.md was moved docs/release/ → docs/archive/ (superseded
    // internal-strategy doc, commit ebc55b03); its Gate #8 PARTIAL/Docker-runtime
    // honesty disclosure is preserved at the archive path.
    const content = readFileSync(join(root, 'docs/archive/beta-tracker.md'), 'utf8');
    expect(content).toMatch(/PARTIAL/);
    expect(content).toMatch(/Docker runtime/);
  });

  it('Path B chat.ts LIVE note is present in vision/roadmap.md', () => {
    const content = readFileSync(join(root, 'docs/vision/roadmap.md'), 'utf8');
    expect(content).toMatch(/Path B.*LIVE|chat\.ts.*Sprint 190/);
  });

  it('Sprint 185-200 section is marked historical in ROADMAP-GOD-LEVEL.md', () => {
    const content = readFileSync(join(root, 'docs/archive/ROADMAP-GOD-LEVEL.md'), 'utf8');
    const hasHistorical = /historical plan/i.test(content);
    const hasSuperseded = /superseded/i.test(content);
    const hasExecutionTracker = /EXECUTION TRACKER/i.test(content);
    expect(hasHistorical || hasSuperseded).toBe(true);
    expect(hasExecutionTracker).toBe(true);
  });
});
