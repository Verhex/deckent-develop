// scripts/check-dependency-audit.mjs — fail-closed dependency-audit gate (SEC-05).
// Five-path coverage via an injected `runAudit` (no real npm audit spawn — hermetic) and
// tmpdir exception fixtures: clean / high-finding-unaddressed / high-finding-excepted /
// expired-exception / audit-could-not-run (network-error shape + unparseable-output shape).

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../');

async function importAuditGate() {
  return import(path.join(PROJECT_ROOT, 'scripts', 'check-dependency-audit.mjs'));
}

const tmpFiles: string[] = [];

function writeTmpJson(content: unknown): string {
  const p = path.join(os.tmpdir(), `audit-exceptions-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(p, JSON.stringify(content, null, 2));
  tmpFiles.push(p);
  return p;
}

afterEach(() => {
  while (tmpFiles.length > 0) {
    const p = tmpFiles.pop()!;
    if (fs.existsSync(p)) fs.rmSync(p);
  }
});

const CLEAN_REPORT = {
  auditReportVersion: 2,
  vulnerabilities: {},
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } },
};

const HIGH_FINDING_REPORT = {
  auditReportVersion: 2,
  vulnerabilities: {
    'fast-uri': {
      name: 'fast-uri',
      severity: 'high',
      isDirect: false,
      via: [
        {
          source: 1117870,
          name: 'fast-uri',
          dependency: 'fast-uri',
          title: 'fast-uri vulnerable to path traversal via percent-encoded dot segments',
          url: 'https://github.com/advisories/GHSA-q3j6-qgpj-74h6',
          severity: 'high',
          range: '<=3.1.0',
        },
      ],
      effects: [],
      range: '<=3.1.0',
      nodes: ['node_modules/fast-uri'],
      fixAvailable: true,
    },
  },
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0, total: 1 } },
};

function okAudit(report: unknown) {
  return async () => ({ stdout: JSON.stringify(report), stderr: '', exitCode: report === CLEAN_REPORT ? 0 : 1 });
}

const VALID_EXCEPTION = {
  advisoryId: '1117870',
  package: 'fast-uri',
  reason: 'Transitive dep, upstream fix pending — tracked follow-up.',
  owner: 'deckent-security-triage',
  expires: '2099-01-01T00:00:00Z',
};

describe('check-dependency-audit.mjs — fail-closed gate (SEC-05)', () => {
  describe('five-path main() coverage (injected audit output)', () => {
    it('path 1 — clean: no findings → PASS, exit 0', async () => {
      const { main } = await importAuditGate();
      const exceptionsPath = writeTmpJson([]);
      const { exitCode, report } = await main({ exceptionsPath, runAudit: okAudit(CLEAN_REPORT) });
      expect(exitCode).toBe(0);
      expect(report).toContain('PASS');
    });

    it('path 2 — high-severity finding, no exception → FAIL, exit 1', async () => {
      const { main } = await importAuditGate();
      const exceptionsPath = writeTmpJson([]);
      const { exitCode, report } = await main({ exceptionsPath, runAudit: okAudit(HIGH_FINDING_REPORT) });
      expect(exitCode).toBe(1);
      expect(report).toContain('FAIL');
      expect(report).toContain('fast-uri');
      expect(report).toContain('1117870');
    });

    it('path 3 — high-severity finding covered by a valid, unexpired exception → PASS, exit 0, exception named in report', async () => {
      const { main } = await importAuditGate();
      const exceptionsPath = writeTmpJson([VALID_EXCEPTION]);
      const { exitCode, report } = await main({ exceptionsPath, runAudit: okAudit(HIGH_FINDING_REPORT) });
      expect(exitCode).toBe(0);
      expect(report).toContain('PASS');
      expect(report).toContain('covered by a signed exception');
      expect(report).toContain('owner=deckent-security-triage');
      expect(report).toContain('1117870');
    });

    it('path 4 — matching exception but EXPIRED → still FAIL, exit 1, expiry named in report', async () => {
      const { main } = await importAuditGate();
      const expiredException = { ...VALID_EXCEPTION, expires: '2020-01-01T00:00:00Z' };
      const exceptionsPath = writeTmpJson([expiredException]);
      const { exitCode, report } = await main({ exceptionsPath, runAudit: okAudit(HIGH_FINDING_REPORT) });
      expect(exitCode).toBe(1);
      expect(report).toContain('FAIL');
      expect(report).toContain('EXPIRED');
      expect(report).toContain('1117870');
    });

    it('path 5a — audit could not run (npm error JSON, e.g. network failure) → fail-closed, exit 1, never "PASS"', async () => {
      const { main } = await importAuditGate();
      const exceptionsPath = writeTmpJson([]);
      const networkErrorAudit = async () => ({
        stdout: JSON.stringify({ error: { code: 'ENOTFOUND', summary: 'request to https://registry.npmjs.org failed', detail: 'getaddrinfo ENOTFOUND' } }),
        stderr: '',
        exitCode: 1,
      });
      const { exitCode, report } = await main({ exceptionsPath, runAudit: networkErrorAudit });
      expect(exitCode).toBe(1);
      expect(report).toContain('could not run');
      expect(report).not.toContain('PASS');
    });

    it('path 5b — audit could not run (unparseable/empty stdout) → fail-closed, exit 1, never "PASS"', async () => {
      const { main } = await importAuditGate();
      const exceptionsPath = writeTmpJson([]);
      const brokenAudit = async () => ({ stdout: 'npm ERR! network timeout', stderr: 'ETIMEDOUT', exitCode: 1 });
      const { exitCode, report } = await main({ exceptionsPath, runAudit: brokenAudit });
      expect(exitCode).toBe(1);
      expect(report).toContain('could not run');
      expect(report).not.toContain('PASS');
    });

    it('path 5c — spawn itself throws → fail-closed, exit 1', async () => {
      const { main } = await importAuditGate();
      const exceptionsPath = writeTmpJson([]);
      const throwingAudit = async () => {
        throw new Error('ENOENT: npm not found');
      };
      const { exitCode, report } = await main({ exceptionsPath, runAudit: throwingAudit });
      expect(exitCode).toBe(1);
      expect(report).toContain('fail-closed');
    });
  });

  describe('exception schema — expires/owner/reason mandatory (goCriteria)', () => {
    it('validateExceptionRecord rejects a record missing "owner"', async () => {
      const { validateExceptionRecord } = await importAuditGate();
      const result = validateExceptionRecord({ advisoryId: '1', package: 'x', reason: 'r', expires: '2099-01-01T00:00:00Z' });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('owner');
    });

    it('validateExceptionRecord rejects a record missing "reason"', async () => {
      const { validateExceptionRecord } = await importAuditGate();
      const result = validateExceptionRecord({ advisoryId: '1', package: 'x', owner: 'o', expires: '2099-01-01T00:00:00Z' });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('reason');
    });

    it('validateExceptionRecord rejects a record missing "expires"', async () => {
      const { validateExceptionRecord } = await importAuditGate();
      const result = validateExceptionRecord({ advisoryId: '1', package: 'x', reason: 'r', owner: 'o' });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('expires');
    });

    it('validateExceptionRecord rejects an invalid (non-ISO) expires date', async () => {
      const { validateExceptionRecord } = await importAuditGate();
      const result = validateExceptionRecord({ advisoryId: '1', package: 'x', reason: 'r', owner: 'o', expires: 'not-a-date' });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('expires');
    });

    it('validateExceptionRecord accepts a fully-populated record', async () => {
      const { validateExceptionRecord } = await importAuditGate();
      expect(validateExceptionRecord(VALID_EXCEPTION)).toEqual({ valid: true });
    });

    it('a malformed exception entry does not silently grant coverage — reported as invalid, finding still fails', async () => {
      const { main } = await importAuditGate();
      const exceptionsPath = writeTmpJson([{ advisoryId: '1117870', package: 'fast-uri', reason: 'no owner or expires' }]);
      const { exitCode, report } = await main({ exceptionsPath, runAudit: okAudit(HIGH_FINDING_REPORT) });
      expect(exitCode).toBe(1);
      expect(report).toContain('malformed exception');
      expect(report).toContain('fast-uri');
    });
  });

  describe('isExceptionExpired', () => {
    it('returns true for a past expiry', async () => {
      const { isExceptionExpired } = await importAuditGate();
      expect(isExceptionExpired({ expires: '2020-01-01T00:00:00Z' }, new Date('2026-07-12T00:00:00Z'))).toBe(true);
    });

    it('returns false for a future expiry', async () => {
      const { isExceptionExpired } = await importAuditGate();
      expect(isExceptionExpired({ expires: '2099-01-01T00:00:00Z' }, new Date('2026-07-12T00:00:00Z'))).toBe(false);
    });
  });

  describe('loadExceptions — missing/malformed audit-exceptions.json', () => {
    it('a missing exceptions file is treated as "no exceptions", not an error', async () => {
      const { loadExceptions } = await importAuditGate();
      const result = loadExceptions(path.join(os.tmpdir(), 'does-not-exist-audit-exceptions.json'));
      expect(result).toEqual({ valid: [], invalid: [] });
    });

    it('a non-array JSON root is rejected wholesale', async () => {
      const { loadExceptions } = await importAuditGate();
      const p = writeTmpJson({ not: 'an array' });
      const result = loadExceptions(p);
      expect(result.valid).toEqual([]);
      expect(result.invalid.length).toBe(1);
    });
  });

  describe('the real scripts/audit-exceptions.json shipped with this repo', () => {
    it('is a valid array where every entry passes schema validation', async () => {
      const { loadExceptions } = await importAuditGate();
      const realPath = path.join(PROJECT_ROOT, 'scripts', 'audit-exceptions.json');
      const result = loadExceptions(realPath);
      expect(result.invalid).toEqual([]);
      expect(result.valid.length).toBeGreaterThan(0);
    });
  });
});
