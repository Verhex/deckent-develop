import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BLUEPRINT_PATH = join(process.cwd(), 'docs/vision/blueprint.md');
const BLUEPRINT_TR_PATH = join(process.cwd(), 'docs/vision/blueprint-TR.md');
const VISION_PATH = join(process.cwd(), 'docs/vision/VISION.md');

describe('Blueprint current — Sprint 219 doc refresh (task 219-013)', () => {
  it('blueprint.md exists and contains current-Sprint references (≥4 matches of allowed identity markers)', () => {
    expect(existsSync(BLUEPRINT_PATH)).toBe(true);
    const content = readFileSync(BLUEPRINT_PATH, 'utf-8');
    const patterns: RegExp[] = [
      /Sprint 21[6-9]/g,
      /open source for open world/gi,
      /\botonom\b/gi,
      /\bautonomous\b/gi,
      /core.*enterprise-layer/gi,
      /everyone everywhere/gi,
    ];
    const matchingLines = content
      .split('\n')
      .filter(line => patterns.some(p => p.test(line)));
    expect(matchingLines.length).toBeGreaterThanOrEqual(4);
  });

  it('blueprint.md contains zero anti-X / anti-Devin opposition phrasing', () => {
    const content = readFileSync(BLUEPRINT_PATH, 'utf-8');
    expect(content).not.toMatch(/anti-Devin/i);
    expect(content).not.toMatch(/anti-X/);
  });

  it('blueprint.md carries the positioning anchor + 6-scenario keywords (greenfield/in-dev/maintained/daily/ERP/enterprise)', () => {
    const content = readFileSync(BLUEPRINT_PATH, 'utf-8');
    expect(content).toMatch(/open source for open world/i);
    expect(content).toMatch(/core.*enterprise-layer/i);
    const sixContexts = ['greenfield', 'in-dev', 'maintained', 'daily', 'ERP', 'enterprise'];
    const found = sixContexts.filter(kw => content.toLowerCase().includes(kw.toLowerCase())).length;
    expect(found).toBeGreaterThanOrEqual(5);
  });

  it('blueprint-TR.md exists with core identity headings (kimlik, mimari, konumlanma)', () => {
    expect(existsSync(BLUEPRINT_TR_PATH)).toBe(true);
    const content = readFileSync(BLUEPRINT_TR_PATH, 'utf-8');
    expect(content).toMatch(/KİMLİK|Kimlik/);
    expect(content).toMatch(/MİMARİ|Mimari/);
    expect(content).toMatch(/KONUMLANMA|Konumlanma/);
    expect(content).toMatch(/open source for open world/i);
    expect(content).toMatch(/6 SENARYO|6 Senaryo|everyone everywhere/i);
  });

  it('VISION.md positioning is in sync — no anti-Devin opposition phrasing', () => {
    expect(existsSync(VISION_PATH)).toBe(true);
    const content = readFileSync(VISION_PATH, 'utf-8');
    expect(content).not.toMatch(/anti-Devin/i);
    expect(content).toMatch(/open source for open world/i);
  });
});
