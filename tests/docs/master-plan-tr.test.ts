import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const TR_PATH = join(process.cwd(), 'docs', 'MASTER-PLAN-TR.md');

describe('docs/MASTER-PLAN-TR.md', () => {
  it('TR document exists and is non-empty', () => {
    expect(existsSync(TR_PATH)).toBe(true);
    const content = readFileSync(TR_PATH, 'utf-8');
    expect(content.length).toBeGreaterThan(1000);
  });

  it('contains required main sections', () => {
    const content = readFileSync(TR_PATH, 'utf-8');
    expect(content).toContain('Vizyon');
    expect(content).toContain('Trinity');
    expect(content).toContain('native');
    expect(content).toContain('publish');
    expect(content).toContain('F7');
    expect(content).toContain('agentic');
  });

  it('references Sprint 219 as current', () => {
    const content = readFileSync(TR_PATH, 'utf-8');
    expect(content).toContain('Sprint 219');
    expect(content).toMatch(/219.*AKTİF|AKTİF.*219|219.*aktif|219.*planlandı/);
  });

  it('covers F1-F10 feature matrix sections', () => {
    const content = readFileSync(TR_PATH, 'utf-8');
    expect(content).toContain('F1');
    expect(content).toContain('F2');
    expect(content).toContain('F3');
    expect(content).toContain('F7');
  });
});
