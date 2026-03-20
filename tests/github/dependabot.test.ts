import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('dependabot.yml Configuration', () => {
  const dependabotPath = path.join(process.cwd(), '.github', 'dependabot.yml');
  let fileContent: string;

  it('should exist', () => {
    expect(fs.existsSync(dependabotPath)).toBe(true);
  });

  it('should be readable', () => {
    expect(() => {
      fileContent = fs.readFileSync(dependabotPath, 'utf8');
    }).not.toThrow();
  });

  it('should have version 2', () => {
    expect(fileContent).toContain('version: 2');
  });

  it('should have updates section', () => {
    expect(fileContent).toContain('updates:');
  });

  describe('npm ecosystem', () => {
    it('should exist in file', () => {
      expect(fileContent).toContain('package-ecosystem: "npm"');
    });

    it('should have weekly schedule', () => {
      const npmSection = fileContent.substring(
        fileContent.indexOf('package-ecosystem: "npm"'),
        fileContent.indexOf('package-ecosystem: "github-actions"')
      );
      expect(npmSection).toContain('interval: "weekly"');
    });

    it('should have open-pull-requests-limit', () => {
      const npmSection = fileContent.substring(
        fileContent.indexOf('package-ecosystem: "npm"'),
        fileContent.indexOf('package-ecosystem: "github-actions"')
      );
      expect(npmSection).toMatch(/open-pull-requests-limit:\s*\d+/);
    });

    it('should have commit-message prefix', () => {
      const npmSection = fileContent.substring(
        fileContent.indexOf('package-ecosystem: "npm"'),
        fileContent.indexOf('package-ecosystem: "github-actions"')
      );
      expect(npmSection).toContain('prefix: "deps"');
    });

    it('should have labels', () => {
      const npmSection = fileContent.substring(
        fileContent.indexOf('package-ecosystem: "npm"'),
        fileContent.indexOf('package-ecosystem: "github-actions"')
      );
      expect(npmSection).toContain('labels:');
      expect(npmSection).toContain('dependencies');
    });

    it('should have ignore configuration', () => {
      const npmSection = fileContent.substring(
        fileContent.indexOf('package-ecosystem: "npm"'),
        fileContent.indexOf('package-ecosystem: "github-actions"')
      );
      expect(npmSection).toContain('ignore:');
      expect(npmSection).toContain('dependency-name:');
    });
  });

  describe('github-actions ecosystem', () => {
    it('should exist in file', () => {
      expect(fileContent).toContain('package-ecosystem: "github-actions"');
    });

    it('should have weekly schedule', () => {
      const ghSection = fileContent.substring(
        fileContent.indexOf('package-ecosystem: "github-actions"')
      );
      expect(ghSection).toContain('interval: "weekly"');
    });

    it('should have open-pull-requests-limit', () => {
      const ghSection = fileContent.substring(
        fileContent.indexOf('package-ecosystem: "github-actions"')
      );
      expect(ghSection).toMatch(/open-pull-requests-limit:\s*\d+/);
    });

    it('should have commit-message prefix', () => {
      const ghSection = fileContent.substring(
        fileContent.indexOf('package-ecosystem: "github-actions"')
      );
      expect(ghSection).toContain('prefix: "ci"');
    });

    it('should have labels', () => {
      const ghSection = fileContent.substring(
        fileContent.indexOf('package-ecosystem: "github-actions"')
      );
      expect(ghSection).toContain('labels:');
      expect(ghSection).toContain('ci/cd');
    });
  });

  describe('configuration structure', () => {
    it('should have proper indentation', () => {
      expect(fileContent).not.toMatch(/\t/); // No tabs, use spaces
    });

    it('should not have duplicate ecosystems', () => {
      const npmCount = (fileContent.match(/package-ecosystem: "npm"/g) || [])
        .length;
      const ghCount = (fileContent.match(/package-ecosystem: "github-actions"/g) || [])
        .length;
      expect(npmCount).toBe(1);
      expect(ghCount).toBe(1);
    });
  });
});
