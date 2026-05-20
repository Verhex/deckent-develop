// tests/nervous/directives-protection-baseline.test.ts
//
// TDD: directives_protection baseline-update hook — Sprint 177 Task 5
// Sprint 176 bug: kill+cleanup sonrası auto_restore Sprint 175 content'ini
// Sprint 176'nın üstüne yazdı (baseline hiç güncellenmemişti).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('directives_protection baseline-update hook (Sprint 177 Task 5)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'nervous-baseline-'));
    mkdirSync(join(tmp, '.deckent'), { recursive: true });
  });

  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('set_directives success refreshes the baseline', async () => {
    const directivesPath = join(tmp, 'DIRECTIVES.md');
    writeFileSync(directivesPath, '# Sprint 175\n');

    const { initDirectivesProtection } = await import('../../src/nervous/observer.js');
    const det = initDirectivesProtection({ root: tmp, autoRestore: true });

    // Initial baseline = Sprint 175 content
    expect(det.getBaselineHash()).toBe(det.computeHash('# Sprint 175\n'));

    // User calls deckent_set_directives — writes new content
    writeFileSync(directivesPath, '# Sprint 176\n');
    det.updateBaseline(); // Hook called after set_directives writes

    expect(det.getBaselineHash()).toBe(det.computeHash('# Sprint 176\n'));

    // Detector should NOT restore (baseline == current)
    det.scan();
    expect(readFileSync(directivesPath, 'utf-8')).toBe('# Sprint 176\n');
  });

  it('detects unauthorized change and restores when auto_restore=true', async () => {
    const directivesPath = join(tmp, 'DIRECTIVES.md');
    writeFileSync(directivesPath, '# Sprint 175\n');

    const { initDirectivesProtection } = await import('../../src/nervous/observer.js');
    const det = initDirectivesProtection({ root: tmp, autoRestore: true });

    // Baseline is now "# Sprint 175\n"
    expect(det.getBaselineHash()).toBe(det.computeHash('# Sprint 175\n'));

    // Adversary overwrites DIRECTIVES.md without calling updateBaseline()
    writeFileSync(directivesPath, '# adversary content\n');

    det.scan();

    // auto_restore should revert to baseline content
    expect(readFileSync(directivesPath, 'utf-8')).toBe('# Sprint 175\n');
  });

  it('CLI `deckent nervous baseline-refresh` updates baseline manually', async () => {
    const directivesPath = join(tmp, 'DIRECTIVES.md');
    writeFileSync(directivesPath, '# Sprint 175\n');

    const { initDirectivesProtection } = await import('../../src/nervous/observer.js');
    const det = initDirectivesProtection({ root: tmp, autoRestore: true });

    // Initial baseline = Sprint 175
    expect(det.getBaselineHash()).toBe(det.computeHash('# Sprint 175\n'));

    // User writes new sprint directives
    writeFileSync(directivesPath, '# Sprint 177\n');

    // CLI: deckent nervous baseline-refresh
    const { nervousBaselineRefresh } = await import('../../src/cli/commands/nervous.js');
    await nervousBaselineRefresh({ root: tmp });

    // Baseline should now be Sprint 177
    expect(det.getBaselineHash()).toBe(det.computeHash('# Sprint 177\n'));
  });
});
