// DEP669A — non-major dependency-bump slice (fast-uri, hono, path-to-regexp, undici, ws).
// Two layers of proof:
//   1. Offline-safe lockfile/manifest pins — guard against a future accidental downgrade
//      silently reintroducing one of the closed advisories (no network required).
//   2. A REAL run of scripts/check-dependency-audit.mjs's audit logic (real `npm audit`
//      subprocess, same as the CI SEC-05 gate step) — pins that the advisory IDs closed by
//      this bump no longer appear in the findings list, and that the gate now PASSes with
//      only the (untouched, out-of-scope) nodemailer exceptions in play.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');

function readJson(relPath: string): any {
  return JSON.parse(readFileSync(join(PROJECT_ROOT, relPath), 'utf-8'));
}

// Advisory IDs this bump closes — see docs/reference/dependencies.md "Security Bump Log".
const CLOSED_ADVISORY_IDS = [
  '1117870', // fast-uri — GHSA-q3j6-qgpj-74h6
  '1117884', // fast-uri — GHSA-v39h-62p7-jpjc
  '1120913', // hono — GHSA-88fw-hqm2-52qc
  '1115573', // path-to-regexp — GHSA-j3q9-mxjg-w52f
  '1121245', // undici — GHSA-vxpw-j846-p89q
  '1122891', // ws — GHSA-96hv-2xvq-fx4p
];

describe('DEP669A — dependency-bump slice (offline-safe lockfile/manifest pins)', () => {
  const lockfile = readJson('package-lock.json');
  const pkg = readJson('package.json');

  function lockedVersion(name: string): string {
    const entry = lockfile.packages[`node_modules/${name}`];
    expect(entry, `node_modules/${name} missing from package-lock.json`).toBeDefined();
    return entry.version;
  }

  it('fast-uri is bumped to >=3.1.2 (fix floor) and stays on the 3.x line (non-major)', () => {
    const version = lockedVersion('fast-uri');
    const [major, minor, patch] = version.split('.').map(Number);
    expect(major).toBe(3);
    expect(minor > 1 || (minor === 1 && patch >= 2)).toBe(true);
  });

  it('hono is bumped to >=4.12.25 (fix floor) and stays on the 4.x line (non-major)', () => {
    const version = lockedVersion('hono');
    const [major, minor, patch] = version.split('.').map(Number);
    expect(major).toBe(4);
    expect(minor > 12 || (minor === 12 && patch >= 25)).toBe(true);
  });

  it('path-to-regexp is bumped to >=8.4.0 (fix floor) and stays on the 8.x line (non-major)', () => {
    const version = lockedVersion('path-to-regexp');
    const [major, minor] = version.split('.').map(Number);
    expect(major).toBe(8);
    expect(minor).toBeGreaterThanOrEqual(4);
  });

  it('undici is bumped to >=6.27.0 (fix floor) and stays on the 6.x line (non-major)', () => {
    const version = lockedVersion('undici');
    const [major, minor] = version.split('.').map(Number);
    expect(major).toBe(6);
    expect(minor).toBeGreaterThanOrEqual(27);
  });

  it('ws is bumped to >=8.21.0 (fix floor) and stays on the 8.x line (non-major)', () => {
    const version = lockedVersion('ws');
    const [major, minor] = version.split('.').map(Number);
    expect(major).toBe(8);
    expect(minor).toBeGreaterThanOrEqual(21);
  });

  it('package.json carries a justified root override forcing undici past discord.js\'s exact 6.24.1 pin', () => {
    expect(pkg.overrides).toBeDefined();
    expect(pkg.overrides.undici).toBe('6.27.0');
  });

  it('nodemailer is on the 9.x line (DEP669B semver-major bump, CC-el 2026-07-12)', () => {
    expect(pkg.optionalDependencies.nodemailer).toBe('^9.0.3');
  });
});

describe('DEP669A — real audit-script run (SEC-05 gate, same mechanics as CI)', () => {
  it(
    'the real check-dependency-audit.mjs gate PASSes (exit 0) against the patched tree',
    async () => {
      const { main } = await import(join(PROJECT_ROOT, 'scripts', 'check-dependency-audit.mjs'));
      const { exitCode, report } = await main();
      expect(exitCode, `expected PASS, got:\n${report}`).toBe(0);
      expect(report).toContain('PASS');
    },
    30000,
  );

  it(
    'none of the advisory IDs closed by this bump appear in a real npm-audit findings extraction',
    async () => {
      const { runNpmAudit, parseAuditOutput, extractFindings } = await import(
        join(PROJECT_ROOT, 'scripts', 'check-dependency-audit.mjs')
      );
      const auditResult = await runNpmAudit(PROJECT_ROOT);
      const parsed = parseAuditOutput(auditResult.stdout);
      expect(parsed.ok, 'npm audit could not run — cannot assert on findings').toBe(true);
      if (!parsed.ok) return;

      const findings = extractFindings(parsed.report);
      const stillPresent = CLOSED_ADVISORY_IDS.filter((id) =>
        findings.some((f: { advisoryId: string }) => f.advisoryId === id),
      );
      expect(stillPresent, 'a closed advisory reappeared in npm audit — bump regressed').toEqual([]);
    },
    30000,
  );

  it('scripts/audit-exceptions.json is EMPTY — DEP669A+B closed every advisory (⏰-bıçak söküldü)', async () => {
    const { loadExceptions } = await import(join(PROJECT_ROOT, 'scripts', 'check-dependency-audit.mjs'));
    const exceptionsPath = join(PROJECT_ROOT, 'scripts', 'audit-exceptions.json');
    const { valid, invalid } = loadExceptions(exceptionsPath);
    expect(invalid).toEqual([]);

    const exceptedIds = valid.map((e: { advisoryId: string }) => e.advisoryId);
    for (const closedId of CLOSED_ADVISORY_IDS) {
      expect(exceptedIds, `stale exception for closed advisory ${closedId} was not removed`).not.toContain(closedId);
    }

    // Sıfır-istisna pini: yeni bir imzalı-istisna eklemek BİLİNÇLİ bir karardır —
    // bu pini aynı diff'te güncelle ki istisna review'da yüksek sesle görünsün.
    expect(valid).toEqual([]);
  });
});
