// ═══ Dep-supply Phase 0a (task 522-012) — report-only install-ingress census ═══
// These pins hold the census's detection contract: verb coverage, file-and-line
// site shape, the explicit unknown-ingress-class typing, and digest stability.
// Unlike its sibling audit-operation-ingress.test.ts, this test does NOT assert
// against a committed baseline file — scripts/install-ingress-baseline.json is
// outside this task's write authority, so no baseline is committed in this slice.
import { describe, it, expect } from 'vitest';
import { auditInstallIngress } from '../../scripts/audit-install-ingress.mjs';

type InstallIngressSite = {
  source: 'workflow' | 'package.json' | 'nested-package.json' | 'docker-backend';
  file: string;
  line: number | null;
  verb: 'npm-ci' | 'npm-install' | 'npx' | 'yarn';
  command: string;
  scriptKey: string | null;
  ignoreScriptsPosture: string;
};

type InstallIngressReport = {
  schemaVersion: number;
  verbsCovered: string[];
  totals: Record<string, number>;
  bySource: Record<string, number>;
  nestedNpmRoots: string[];
  dockerBackendFileExists: boolean;
  ignoreScriptsSummary: Record<string, number>;
  sites: InstallIngressSite[];
  unknownIngressClasses: Array<{ id: string; description: string }>;
  digest: string;
};

describe('audit-install-ingress — report-only npm ci/install/npx/yarn census', () => {
  const report = auditInstallIngress() as InstallIngressReport;

  it('covers exactly the four owner-specified verb classes', () => {
    expect(report.verbsCovered).toEqual(['npm-ci', 'npm-install', 'npx', 'yarn']);
    expect(report.totals.all).toBe(report.sites.length);
    const summedVerbTotals = report.verbsCovered.reduce((sum, v) => sum + (report.totals[v] ?? 0), 0);
    expect(summedVerbTotals).toBe(report.totals.all);
  });

  it('finds real npm ci sites in .github/workflows (a known non-empty surface)', () => {
    const ciSites = report.sites.filter(s => s.source === 'workflow' && s.verb === 'npm-ci');
    expect(ciSites.length).toBeGreaterThan(0);
    expect(ciSites.every(s => s.file.startsWith('.github/workflows/') && typeof s.line === 'number')).toBe(true);
  });

  it('finds the 3x npm ci chain in the root package.json install:all script', () => {
    const installAllSites = report.sites.filter(s => s.source === 'package.json' && s.scriptKey === 'install:all');
    expect(installAllSites.length).toBe(3);
    expect(installAllSites.every(s => s.verb === 'npm-ci')).toBe(true);
  });

  it('never claims npm rebuild as covered — out-of-verb-scope subcommands are excluded from sites', () => {
    const rebuildSites = report.sites.filter(s => s.command.includes('npm rebuild'));
    expect(rebuildSites.length).toBe(0);
  });

  it('filters echo-embedded prose mentions of npm install (ci.yml lockfile-sync guard)', () => {
    const falsePositive = report.sites.find(
      s => s.file === '.github/workflows/ci.yml' && s.command.includes('locally and commit'),
    );
    expect(falsePositive).toBeUndefined();
  });

  it('reports on the Docker worker-spawn backend without claiming an install site that is not there', () => {
    expect(report.dockerBackendFileExists).toBe(true);
    const dockerSites = report.sites.filter(s => s.source === 'docker-backend');
    expect(Array.isArray(dockerSites)).toBe(true);
  });

  it('discovers at least one nested npm root beyond the repo-root package.json', () => {
    expect(report.nestedNpmRoots.length).toBeGreaterThan(0);
    expect(report.nestedNpmRoots.every(p => p.endsWith('package.json') && !p.startsWith('node_modules/'))).toBe(true);
  });

  it('types the unknown-ingress class explicitly — never a closed-world coverage claim', () => {
    expect(report.unknownIngressClasses.length).toBeGreaterThan(0);
    for (const cls of report.unknownIngressClasses) {
      expect(typeof cls.id).toBe('string');
      expect(cls.id.length).toBeGreaterThan(0);
      expect(typeof cls.description).toBe('string');
      expect(cls.description.length).toBeGreaterThan(0);
    }
    const ids = report.unknownIngressClasses.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every site carries an explicit ignoreScriptsPosture, never a silent guess', () => {
    for (const site of report.sites) {
      expect(site.ignoreScriptsPosture).toBeTruthy();
      expect(
        site.ignoreScriptsPosture.startsWith('explicit:')
        || site.ignoreScriptsPosture.startsWith('derived-from-target-npmrc:')
        || site.ignoreScriptsPosture.startsWith('derived-from-context-npmrc:')
        || site.ignoreScriptsPosture === 'unknown-config-layering',
      ).toBe(true);
    }
  });

  it('is deterministic — same source tree, same digest, no wall-clock drift', () => {
    const second = auditInstallIngress() as InstallIngressReport;
    expect(second.digest).toBe(report.digest);
    expect(second.totals.all).toBe(report.totals.all);
  });
});
