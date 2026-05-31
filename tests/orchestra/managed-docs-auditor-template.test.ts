import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadTemplate } from '../../src/core/rule-generator.js';

// Template is at src/core/rule-templates/auditor.template.md (not src/orchestra/managed-docs/templates/)
// Rule-generator claudeAdapter and cursorAdapter also contain paths maps that were regressed.

const TEMPLATE_PATH = join(process.cwd(), 'src', 'core', 'rule-templates', 'auditor.template.md');

describe('managed-docs auditor template regression (198-003)', () => {
  it('(a) template has no PATTERNS.md reference', () => {
    const content = readFileSync(TEMPLATE_PATH, 'utf-8');
    expect(content).not.toMatch(/PATTERNS\.md/);
  });

  it('(b) template has no "Append new patterns" instruction', () => {
    const content = readFileSync(TEMPLATE_PATH, 'utf-8');
    expect(content).not.toMatch(/Append new patterns/i);
  });

  it('(c) template contains memory.db pattern upsert instruction', () => {
    const content = readFileSync(TEMPLATE_PATH, 'utf-8');
    expect(content).toMatch(/store\.insert\(\s*\{\s*type:\s*['"]pattern['"]/);
  });

  it('(d) loadTemplate("auditor") returns template without PATTERNS.md', () => {
    const tpl = loadTemplate('auditor');
    expect(tpl).not.toMatch(/PATTERNS\.md/);
    expect(tpl).not.toMatch(/Append new patterns/i);
  });

  it('(e) .claude/rules/auditor.md paths frontmatter does not include .brain/PATTERNS.md', () => {
    const auditorMd = readFileSync(join(process.cwd(), '.claude', 'rules', 'auditor.md'), 'utf-8');
    // paths frontmatter line should not contain PATTERNS.md
    const pathsLine = auditorMd.split('\n').find(l => l.startsWith('paths:'));
    expect(pathsLine).toBeDefined();
    expect(pathsLine).not.toContain('.brain/PATTERNS.md');
    expect(pathsLine).toContain('.dashboard');
  });
});
