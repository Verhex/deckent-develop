import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DOC_PATH = join(process.cwd(), 'docs', 'reference', 'config-reference.md');

describe('docs/reference/config-reference.md', () => {
  const content = readFileSync(DOC_PATH, 'utf-8');

  it('exists and is non-empty', () => {
    expect(content.length).toBeGreaterThan(500);
  });

  it('documents config file locations', () => {
    expect(content).toContain('~/.deckent/config.json');
    expect(content).toContain('.deckent/config.json');
  });

  it('documents config loading order', () => {
    expect(content).toContain('## 2. Config Loading Order');
    expect(content).toContain('deep merge');
  });

  it('documents all top-level config fields', () => {
    expect(content).toContain('`mode`');
    expect(content).toContain('`language`');
    expect(content).toContain('`projectName`');
    expect(content).toContain('`brain_planning`');
    expect(content).toContain('`modes`');
  });

  it('documents all plan modes', () => {
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

  it('documents brain planning modes', () => {
    expect(content).toContain('## 6. Brain Planning Modes');
    expect(content).toContain('"structured"');
    expect(content).toContain('"ai"');
    expect(content).toContain('"auto"');
  });

  it('contains example configs', () => {
    expect(content).toContain('## 8. Example Configs');
    expect(content).toContain('"mode"');
    expect(content).toContain('"max_plan"');
  });

  it('documents global vs project config', () => {
    expect(content).toContain('## 7. Global vs Project Config');
    expect(content).toContain('Global Config');
    expect(content).toContain('Project Config');
    expect(content).toContain('Merge Behavior');
  });

  it('documents validation rules', () => {
    expect(content).toContain('## 10. Validation Rules');
    expect(content).toContain('ConfigValidationError');
  });

  it('is written in English', () => {
    expect(content).not.toContain('Gereksinimler');
    expect(content).not.toContain('Ayarlar');
  });
});
