import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const RULES_DIR = join(ROOT, '.claude', 'rules');

function readRuleFile(filename: string): string {
  const filePath = join(RULES_DIR, filename);
  return existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';
}

function getAllRuleFiles(): string[] {
  if (!existsSync(RULES_DIR)) return [];
  return readdirSync(RULES_DIR).filter((f) => f.endsWith('.md'));
}

describe('claude rules — no legacy .md paradigm references', () => {
  it('(a) PATTERNS.md reference count = 0 in all .claude/rules/*.md files', () => {
    const ruleFiles = getAllRuleFiles();
    expect(ruleFiles.length).toBeGreaterThan(0);

    for (const file of ruleFiles) {
      const content = readRuleFile(file);
      // Exclude ADR title mentions like "ADR-009: DEBT.md Markdown..." — those are names not instructions
      // We look for operational instructions referencing PATTERNS.md as a write target
      const operationalRef = /Append new patterns to `PATTERNS\.md`|write.*PATTERNS\.md|PATTERNS\.md.*append/gi;
      const matches = content.match(operationalRef);
      expect(
        matches,
        `${file} contains legacy PATTERNS.md operational reference: ${matches?.join(', ')}`
      ).toBeNull();
    }
  });

  it('(b) auditor.md contains memory.db pattern upsert instruction', () => {
    const content = readRuleFile('auditor.md');
    expect(content).toContain('memory.db');
    expect(content).toContain("type: 'pattern'");
    expect(content.toLowerCase()).toContain('upsert');
  });

  it('(c) auditor.md does not instruct appending to flat .md files for pattern storage', () => {
    const content = readRuleFile('auditor.md');
    // Should not have the old "Append new patterns to PATTERNS.md" instruction
    expect(content).not.toMatch(/Append new patterns to `PATTERNS\.md`/);
    // Should not reference .brain/PATTERNS.md as a write target in the frontmatter paths
    expect(content).not.toContain('.brain/PATTERNS.md');
  });
});
