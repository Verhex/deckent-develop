import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

describe('CI Workflow (.github/workflows/ci.yml)', () => {
  const ciPath = resolve('.github/workflows/ci.yml');
  // 535 (CI-ACTIONS-ECONOMY-001): the coverage job moved to its own scheduled
  // workflow — coverage pins read coverage.yml, everything else stays on ci.yml.
  const coveragePath = resolve('.github/workflows/coverage.yml');
  const dashboardBuildPath = resolve('.github/workflows/dashboard-build.yml');
  let content: string;
  let coverageContent: string;
  let dashboardBuildContent: string;

  beforeAll(() => {
    content = readFileSync(ciPath, 'utf-8');
    coverageContent = readFileSync(coveragePath, 'utf-8');
    dashboardBuildContent = readFileSync(dashboardBuildPath, 'utf-8');
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

    it('keys every root npm cache explicitly from npm-shrinkwrap.json', () => {
      const lines = content.split('\n');
      const cacheLines = lines
        .map((line, index) => ({ line: line.trim(), index }))
        .filter(({ line }) => line === 'cache: npm');
      expect(cacheLines.length).toBeGreaterThan(0);
      for (const { index } of cacheLines) {
        const authority = lines[index + 1]?.trim();
        if (authority === 'cache-dependency-path: npm-shrinkwrap.json') continue;
        expect(authority).toBe('cache-dependency-path: |');
        expect(lines[index + 2]?.trim()).toBe('npm-shrinkwrap.json');
      }
    });

    it('uses the independent dashboard lock in every CI job that caches dashboard dependencies', () => {
      const exactDashboardCache = /cache: npm\s*\n\s*cache-dependency-path: \|\s*\n\s*npm-shrinkwrap\.json\s*\n\s*src\/dashboard\/package-lock\.json/gu;
      expect(content.match(exactDashboardCache)).toHaveLength(3);
    });

    it('regenerates the npm lock graph but diffs only the canonical root shrinkwrap', () => {
      const lockSync = content.slice(content.indexOf('lockfile-sync:'), content.indexOf('\n\n  typecheck:'));
      expect(lockSync).toContain('npm install --package-lock-only --ignore-scripts');
      expect(lockSync).toContain('if [ -e package-lock.json ]; then');
      expect(lockSync).toContain('::error file=package-lock.json::Root package-lock.json was generated');
      expect(lockSync).toMatch(/if \[ -e package-lock\.json \]; then[\s\S]*?exit 1[\s\S]*?fi/u);
      expect(lockSync).toContain('git diff --quiet -- npm-shrinkwrap.json');
      expect(lockSync).not.toContain('-- package-lock.json');
    });
  });

  describe('A) Coverage artifact upload', () => {
    it('keys the coverage cache from root shrinkwrap plus the independent dashboard lock', () => {
      expect(coverageContent).toMatch(
        /cache: npm\s*\n\s*cache-dependency-path: \|\s*\n\s*npm-shrinkwrap\.json\s*\n\s*src\/dashboard\/package-lock\.json/u,
      );
    });
    it('should have a coverage job', () => {
      expect(coverageContent).toContain('coverage:');
    });

    it('should run test:coverage command', () => {
      expect(coverageContent).toContain('npm run test:coverage');
    });

    it('should upload coverage artifact', () => {
      expect(coverageContent).toContain('actions/upload-artifact@v4');
      expect(coverageContent).toContain('name: coverage-report');
    });

    it('should set retention days for coverage artifact', () => {
      expect(coverageContent).toContain('retention-days:');
    });

    it('should upload coverage/ directory', () => {
      expect(coverageContent).toContain('path: coverage/');
    });

    it('coverage workflow is scheduled + dispatchable (535: no per-merge run)', () => {
      // The standalone workflow has no sibling test jobs to `needs` — its
      // admission contract is the schedule/dispatch trigger pair instead.
      expect(coverageContent).toContain('schedule:');
      expect(coverageContent).toContain('workflow_dispatch:');
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

    it('should run the docs-scripts flake canary env on the existing step (523-004)', () => {
      // Pin so the canary env cannot silently drop off the step it was wired
      // onto — the wiring itself is the deliverable, not just the presence of
      // the flag string somewhere in the job.
      const docsSection = content.substring(
        content.indexOf('test-docs-scripts:'),
        content.indexOf('\n\n  test-dashboard:')
      );
      expect(docsSection).toContain('VITEST_DOCS_SCRIPTS_SERIAL');
    });

    it('test-docs-scripts should keep continue-on-error until the RCA acceptance series is met', () => {
      const docsSection = content.substring(
        content.indexOf('test-docs-scripts:'),
        content.indexOf('\n\n  test-dashboard:')
      );
      expect(docsSection).toContain('continue-on-error: true');
    });
  });

  describe('D) Dashboard build verification', () => {
    it('keys both dashboard workflow caches from root shrinkwrap plus the dashboard lock', () => {
      const exactDashboardCache = /cache: npm\s*\n\s*cache-dependency-path: \|\s*\n\s*npm-shrinkwrap\.json\s*\n\s*src\/dashboard\/package-lock\.json/gu;
      expect(dashboardBuildContent.match(exactDashboardCache)).toHaveLength(2);
      expect(dashboardBuildContent).toContain("- 'npm-shrinkwrap.json'");
      expect(dashboardBuildContent).toContain("- 'src/dashboard/package-lock.json'");
      expect(dashboardBuildContent).not.toContain("- 'package-lock.json'");
    });

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

    it('uses the durable runner-temp packed-networkless receipt as proof authority', () => {
      const proofStart = content.indexOf(
        '- name: Prove packed Linux native package contract (networkless, fresh private cache)',
      );
      const proofEnd = content.indexOf('- name: Upload CI packed-networkless receipt', proofStart);
      expect(proofStart).toBeGreaterThan(-1);
      expect(proofEnd).toBeGreaterThan(proofStart);
      const proof = content.slice(proofStart, proofEnd);
      expect(proof).toContain(
        'PACKED_NETWORKLESS_RECEIPT: ${{ runner.temp }}/ci-linux-packed-networkless-receipt.json',
      );
      expect(proof).toContain('--receipt-file "$PACKED_NETWORKLESS_RECEIPT"');
      expect(proof).not.toMatch(/verify-packed-networkless-install\.mjs[^\n]*>/u);
      const topLevelFields = proof
        .match(/const expectedTopLevelFields = \[([\s\S]*?)\]\.sort\(\);/u)?.[1]
        .match(/"([^"]+)"/gu)
        ?.map((field) => field.slice(1, -1))
        .sort();
      expect(topLevelFields).toEqual([
        'cacheAuthority',
        'event',
        'expectedEnvironmentKind',
        'installNetworkMode',
        'installedCliReceipt',
        'installedNpmShrinkwrapSha256',
        'nativeReceipt',
        'schemaVersion',
        'sourceNpmShrinkwrapSha256',
        'tarballSha256',
      ].sort());
      const installedCliFields = proof
        .match(/const expectedInstalledCliFields = \[([\s\S]*?)\]\.sort\(\);/u)?.[1]
        .match(/"([^"]+)"/gu)
        ?.map((field) => field.slice(1, -1))
        .sort();
      expect(installedCliFields).toEqual([
        'event',
        'outputSha256',
        'packageVersion',
        'schemaVersion',
      ].sort());
      expect(proof).toContain(
        'JSON.stringify(Object.keys(installedCliReceipt ?? {}).sort())',
      );
      expect(proof).toContain('installedCliReceipt.packageVersion !== sourcePackageVersion');
      expect(proof).toContain('!sha256.test(installedCliReceipt.outputSha256)');
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
