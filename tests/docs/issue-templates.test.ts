import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const TEMPLATES_DIR = join(ROOT, '.github', 'ISSUE_TEMPLATE');

describe('GitHub Issue Templates', () => {
  describe('bug_report.md', () => {
    const bugPath = join(TEMPLATES_DIR, 'bug_report.md');

    it('file exists', () => {
      expect(existsSync(bugPath)).toBe(true);
    });

    it('is written in English', () => {
      const content = readFileSync(bugPath, 'utf-8');
      expect(content).toContain('Description');
      expect(content).toContain('Steps to Reproduce');
      expect(content).toContain('Expected Behavior');
    });

    it('has proper YAML frontmatter', () => {
      const content = readFileSync(bugPath, 'utf-8');
      expect(content.startsWith('---')).toBe(true);
      expect(content).toContain('name: Bug Report');
      expect(content).toContain('labels: bug');
    });

    it('has environment section', () => {
      const content = readFileSync(bugPath, 'utf-8');
      expect(content).toContain('## Environment');
    });
  });

  describe('feature_request.md', () => {
    const featurePath = join(TEMPLATES_DIR, 'feature_request.md');

    it('file exists', () => {
      expect(existsSync(featurePath)).toBe(true);
    });

    it('is written in English', () => {
      const content = readFileSync(featurePath, 'utf-8');
      expect(content).toContain('Problem');
      expect(content).toContain('Proposed Solution');
    });

    it('has proper YAML frontmatter', () => {
      const content = readFileSync(featurePath, 'utf-8');
      expect(content.startsWith('---')).toBe(true);
      expect(content).toContain('name: Feature Request');
      expect(content).toContain('labels: enhancement');
    });

    it('has Alternatives Considered section', () => {
      const content = readFileSync(featurePath, 'utf-8');
      expect(content).toContain('## Alternatives Considered');
    });
  });
});
