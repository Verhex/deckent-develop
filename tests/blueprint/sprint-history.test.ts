import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const BLUEPRINT_PATH = join(ROOT, 'DECKENT-MASTER-BLUEPRINT.md');

describe('Blueprint section numbers (Sprint 048 update)', () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(BLUEPRINT_PATH, 'utf-8');
  });

  it('MCP server section shows 20 tools', () => {
    expect(content).toContain('20 Tools');
  });

  it('MCP server section shows 8 resources', () => {
    // Both in the architecture diagram and in the Resources section
    expect(content).toContain('20 Tools + 8 Resources');
  });

  it('Resources section header shows (8)', () => {
    expect(content).toContain('## Resources (8)');
  });

  it('Sprint history table contains sprint 046 with 10K+ tests', () => {
    expect(content).toMatch(/\| 046 \| 10127/);
  });

  it('Sprint history table contains sprint 047', () => {
    expect(content).toMatch(/\| 047 \| 10127/);
  });

  it('Sprint history table contains sprints 039 through 047', () => {
    for (const sprint of ['039', '040', '041', '042', '043', '044', '045', '046', '047']) {
      expect(content).toContain(`| ${sprint} |`);
    }
  });

  it('CLI commands files count updated to 35', () => {
    expect(content).toContain('35 files');
  });

  it('10K tests milestone entry exists', () => {
    expect(content).toContain('10K tests milestone');
    expect(content).toContain('10,000');
  });
});
