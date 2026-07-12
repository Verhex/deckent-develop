import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

describe('CI Workflow (.github/workflows/ci.yml)', () => {
  const ciPath = resolve('.github/workflows/ci.yml');
  let content: string;

  beforeAll(() => {
    content = readFileSync(ciPath, 'utf-8');
  });

  it('should exist', () => {
    expect(existsSync(ciPath)).toBe(true);
  });

  describe('Workflow structure', () => {
    it('should have name CI', () => {
      expect(content).toContain('name: CI');
    });

    it('should trigger on push to main', () => {
      expect(content).toContain('branches: [main]');
    });

    it('should use checkout@v4', () => {
      const checkoutCount = (content.match(/actions\/checkout@v4/g) || []).length;
      expect(checkoutCount).toBeGreaterThan(0);
    });

    it('should use setup-node@v4', () => {
      expect(content).toContain('actions/setup-node@v4');
    });
  });

  describe('A) Coverage artifact upload', () => {
    it('should have a coverage job', () => {
      expect(content).toContain('coverage:');
    });

    it('should run test:coverage command', () => {
      expect(content).toContain('npm run test:coverage');
    });

    it('should upload coverage artifact', () => {
      expect(content).toContain('actions/upload-artifact@v4');
      expect(content).toContain('name: coverage-report');
    });

    it('should set retention days for coverage artifact', () => {
      expect(content).toContain('retention-days:');
    });

    it('should upload coverage/ directory', () => {
      expect(content).toContain('path: coverage/');
    });

    it('coverage job should depend on test jobs', () => {
      const coverageSection = content.substring(
        content.indexOf('coverage:'),
        content.indexOf('\n\n  build:')
      );
      expect(coverageSection).toContain('needs:');
      expect(coverageSection).toMatch(/test-core|test-orchestra|test-cli/);
    });
  });

  describe('B) npm audit security scanning', () => {
    it('should have a security job', () => {
      expect(content).toContain('security:');
    });

    it('should run the fail-closed dependency-audit gate (SEC-05, 419-003)', () => {
      // The old advisory `npm audit --audit-level=high` + continue-on-error
      // pair died with SEC-05: the audit is now a fail-closed script with a
      // signed-exception allowlist.
      expect(content).toContain('node scripts/check-dependency-audit.mjs');
    });

    it('should name the security audit step', () => {
      expect(content).toContain('Dependency audit (fail-closed, signed-exception allowlist; SEC-05)');
    });
  });

  describe('C) Docs + Scripts test isolation', () => {
    it('should have a test-docs-scripts job', () => {
      expect(content).toContain('test-docs-scripts:');
    });

    it('should run docs tests in the isolated job', () => {
      const docsSection = content.substring(
        content.indexOf('test-docs-scripts:'),
        content.indexOf('\n\n  test-dashboard:')
      );
      expect(docsSection).toContain('tests/docs/');
    });

    it('should run scripts tests in the isolated job', () => {
      const docsSection = content.substring(
        content.indexOf('test-docs-scripts:'),
        content.indexOf('\n\n  test-dashboard:')
      );
      expect(docsSection).toContain('tests/scripts/');
    });

    it('test-docs-scripts should not include docs or scripts in other jobs', () => {
      const remainingSection = content.substring(
        content.indexOf('test-remaining:'),
        content.indexOf('\n\n  test-docs-scripts:')
      );
      expect(remainingSection).not.toContain('tests/docs/');
      expect(remainingSection).not.toContain('tests/scripts/');
    });

    it('test-docs-scripts should depend on typecheck', () => {
      const docsSection = content.substring(
        content.indexOf('test-docs-scripts:'),
        content.indexOf('\n\n  test-dashboard:')
      );
      expect(docsSection).toContain('needs: typecheck');
    });
  });

  describe('D) Dashboard build verification', () => {
    it('should have a test-dashboard job', () => {
      expect(content).toContain('test-dashboard:');
    });

    it('should run npm run test:dashboard', () => {
      expect(content).toContain('npm run test:dashboard');
    });

    it('test-dashboard should depend on typecheck', () => {
      const dashboardSection = content.substring(
        content.indexOf('test-dashboard:'),
        content.indexOf('\n\n  test-windows:')
      );
      expect(dashboardSection).toContain('needs: typecheck');
    });

    it('build job should depend on test-dashboard', () => {
      const buildSection = content.substring(
        content.indexOf('\n  build:'),
        content.length
      );
      expect(buildSection).toContain('test-dashboard');
    });
  });

  describe('Existing jobs preserved', () => {
    it('should still have typecheck job', () => {
      expect(content).toContain('typecheck:');
    });

    it('should still have test-core job', () => {
      expect(content).toContain('test-core:');
    });

    it('should still have test-orchestra job', () => {
      expect(content).toContain('test-orchestra:');
    });

    it('should still have test-cli job', () => {
      expect(content).toContain('test-cli:');
    });

    it('should still have test-remaining job', () => {
      expect(content).toContain('test-remaining:');
    });

    it('should still have build job with dist verification', () => {
      expect(content).toContain('test -f dist/cli/index.js');
      expect(content).toContain('test -f dist/mcp/server.js');
    });

    it('should still have windows allow-failure job', () => {
      expect(content).toContain('test-windows:');
      expect(content).toContain('continue-on-error: true');
    });

    it('should still use matrix strategy for node versions', () => {
      expect(content).toContain('node-version: [24.x, 26.x]');
    });
  });

  describe('Job timeout settings', () => {
    it('coverage job should have timeout', () => {
      const coverageSection = content.substring(
        content.indexOf('\n  coverage:'),
        content.indexOf('\n\n  build:')
      );
      expect(coverageSection).toContain('timeout-minutes:');
    });

    it('test-docs-scripts job should have timeout', () => {
      const docsSection = content.substring(
        content.indexOf('test-docs-scripts:'),
        content.indexOf('\n\n  test-dashboard:')
      );
      expect(docsSection).toContain('timeout-minutes:');
    });
  });
});
