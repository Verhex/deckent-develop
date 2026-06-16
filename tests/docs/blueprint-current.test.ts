import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// NOTE: docs/vision/blueprint.md + blueprint-TR.md were intentionally retired —
// the 2989-line stale master-plan was moved to docs/archive/ (commit c12dac9c)
// and its vision/positioning role was superseded by docs/vision/VISION.md. The
// blueprint-specific assertions (positioning anchor, 6-scenario keywords, TR
// identity headings) are intentionally gone with the retired doc; the live
// positioning is now guarded against VISION.md below. (Mirrors the threat-model
// block removal in security-md-current.test.ts when a validated file is gone.)

const VISION_PATH = join(process.cwd(), 'docs/vision/VISION.md');

describe('Vision positioning — docs/vision/VISION.md (blueprint successor)', () => {
  it('VISION.md exists and carries the positioning anchor without anti-X / anti-Devin phrasing', () => {
    expect(existsSync(VISION_PATH)).toBe(true);
    const content = readFileSync(VISION_PATH, 'utf-8');
    expect(content).not.toMatch(/anti-Devin/i);
    expect(content).not.toMatch(/anti-X/);
    expect(content).toMatch(/open source for open world/i);
  });
});
