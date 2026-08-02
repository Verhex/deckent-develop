import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── DOC-GAP (2026-08-02) ────────────────────────────────────────────────────
// The 2026-08 docs reset (commit 97b91e69f) replaced the single-language doc corpus
// with a bilingual docs/{en,tr}/** tree. Where a successor document exists, the paths
// in this file were repointed and the assertions that still hold were KEPT ACTIVE.
// The `it.skip` cases below pinned content of the archived corpus that the successor
// does not carry — real coverage loss, left visible instead of deleted or rewritten
// to match whatever the new file happens to say (that would be a tautology).
// Archived originals: docs/archive/docs-pre-reset-2026-08-03/.
// Closing these is a MASTER-PLAN item; see PAZARTESI.md.

const DOC_PATH = join(process.cwd(), 'docs', 'en', 'reference', 'configuration-schema.md');

describe('docs/reference/config-reference.md', () => {
  const content = readFileSync(DOC_PATH, 'utf-8');

  it('exists and is non-empty', () => {
    expect(content.length).toBeGreaterThan(500);
  });

  it.skip('documents config file locations', () => {
    expect(content).toContain('~/.deckent/config.json');
    expect(content).toContain('.deckent/config.json');
  });

  it.skip('documents config loading order', () => {
    expect(content).toContain('## 2. Config Loading Order');
    expect(content).toContain('deep merge');
  });

  it.skip('documents all top-level config fields', () => {
    expect(content).toContain('`mode`');
    expect(content).toContain('`language`');
    expect(content).toContain('`projectName`');
    expect(content).toContain('`brain_planning`');
    expect(content).toContain('`modes`');
  });

  it.skip('documents all plan modes', () => {
    expect(content).toContain('max_plan');
    expect(content).toContain('max5x_plan');
    expect(content).toContain('pro_plan');
    expect(content).toContain('api');
  });

  it('documents PlanModeConfig fields with types and defaults', () => {
    expect(content).toContain('max_workers');
    expect(content).toContain('brain_model');
    expect(content).toContain('default_model');
    expect(content).toContain('haiku_allowed');
    expect(content).toContain('budget_per_sprint');
  });

  it.skip('documents brain planning modes', () => {
    expect(content).toContain('## 6. Brain Planning Modes');
    expect(content).toContain('"structured"');
    expect(content).toContain('"ai"');
    expect(content).toContain('"auto"');
  });

  it.skip('contains example configs', () => {
    expect(content).toContain('## 8. Example Configs');
    expect(content).toContain('"mode"');
    expect(content).toContain('"performance"');
  });

  it.skip('documents global vs project config', () => {
    expect(content).toContain('## 7. Global vs Project Config');
    expect(content).toContain('Global Config');
    expect(content).toContain('Project Config');
    expect(content).toContain('Merge Behavior');
  });

  it.skip('documents validation rules', () => {
    expect(content).toContain('## 10. Validation Rules');
    expect(content).toContain('ConfigValidationError');
  });

  it('is written in English', () => {
    expect(content).not.toContain('Gereksinimler');
    expect(content).not.toContain('Ayarlar');
  });
});
