#!/usr/bin/env node
/**
 * check-dependency-audit.mjs — fail-closed dependency-vulnerability gate (SEC-05).
 *
 * Replaces the old advisory-only `npm audit --audit-level=high` + `continue-on-error: true`
 * CI step. Runs `npm audit --json --omit=dev` (async spawn, no shell:true — ADR-D-002/
 * ADR-G-002), and FAILS the gate on any unaddressed high/critical finding.
 *
 * The ONLY way to suppress a finding is a signed exception record in
 * `scripts/audit-exceptions.json` — an array of:
 *   { advisoryId, package, reason, owner, expires }
 * All five fields are mandatory strings; `expires` must be a valid ISO-8601 date. An expired
 * exception is INVALID (the finding it covers still fails) and every exception actually used
 * is named in the report — there is no silent bypass.
 *
 * Fail-closed: if the audit itself could not run (network/registry error, unparseable output,
 * spawn failure), that is reported and treated as a FAILURE, never as "clean".
 *
 * Exit codes: 0 = clean (or every finding covered by a valid, unexpired exception),
 *             1 = one or more unaddressed findings, OR the audit could not run.
 *
 * Usage: node scripts/check-dependency-audit.mjs
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(SCRIPT_DIR, '..');
export const EXCEPTIONS_PATH = join(REPO_ROOT, 'scripts', 'audit-exceptions.json');

const FAIL_SEVERITIES = new Set(['high', 'critical']);
const REQUIRED_EXCEPTION_FIELDS = ['advisoryId', 'package', 'reason', 'owner', 'expires'];

// ─── npm audit execution ────────────────────────────────────────────────────

/**
 * Async-spawn `npm audit --json --omit=dev`. Never rejects — a spawn-level failure (e.g. npm
 * not found) resolves with exitCode: null so the caller can fail-closed on it, same as any
 * other "audit could not run" condition.
 * @param {string} cwd
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number | null}>}
 */
export function runNpmAudit(cwd = REPO_ROOT) {
  return new Promise((resolvePromise) => {
    const child = spawn('npm', ['audit', '--json', '--omit=dev'], { cwd, shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (err) => {
      resolvePromise({
        stdout,
        stderr: stderr || `spawn error: ${err instanceof Error ? err.message : String(err)}`,
        exitCode: null,
      });
    });
    child.on('close', (code) => {
      resolvePromise({ stdout, stderr, exitCode: code });
    });
  });
}

// ─── Audit output parsing ───────────────────────────────────────────────────

/**
 * Parse `npm audit --json` stdout. Distinguishes a genuine audit report from npm's own
 * error shape (`{"error": {...}}`, emitted on registry/network failure) and from unparseable
 * or empty output — all of the latter classify as "could not run".
 * @param {string} stdout
 * @returns {{ok: true, report: object} | {ok: false, reason: string, detail?: unknown}}
 */
export function parseAuditOutput(stdout) {
  const trimmed = (stdout ?? '').trim();
  if (!trimmed) return { ok: false, reason: 'empty-output' };

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, reason: 'unparseable-json' };
  }

  if (parsed && typeof parsed === 'object' && parsed.error) {
    return { ok: false, reason: 'audit-error', detail: parsed.error };
  }
  if (!parsed || typeof parsed !== 'object' || (!parsed.vulnerabilities && !parsed.advisories)) {
    return { ok: false, reason: 'unrecognized-shape' };
  }
  return { ok: true, report: parsed };
}

/**
 * Extract every high/critical finding from a parsed `npm audit --json` report. Primary shape
 * is npm audit-report-version 2 (`vulnerabilities[pkg].via[]` advisory objects); a legacy v1
 * `advisories` map is supported defensively.
 * @param {object} report
 * @returns {Array<{advisoryId: string, package: string, severity: string, title: string, url?: string}>}
 */
export function extractFindings(report) {
  const findings = [];
  const vulns = report?.vulnerabilities;

  if (vulns && typeof vulns === 'object') {
    for (const [pkgName, entry] of Object.entries(vulns)) {
      const via = Array.isArray(entry?.via) ? entry.via : [];
      for (const v of via) {
        if (!v || typeof v !== 'object') continue; // string entries are transitive dep names
        if (!FAIL_SEVERITIES.has(v.severity)) continue;
        findings.push({
          advisoryId: String(v.source ?? v.url ?? `${pkgName}:${v.title ?? 'unknown'}`),
          package: pkgName,
          severity: v.severity,
          title: v.title ?? '(untitled advisory)',
          url: v.url,
        });
      }
    }
    return findings;
  }

  const advisories = report?.advisories;
  if (advisories && typeof advisories === 'object') {
    for (const adv of Object.values(advisories)) {
      if (!adv || !FAIL_SEVERITIES.has(adv.severity)) continue;
      findings.push({
        advisoryId: String(adv.id ?? adv.url ?? adv.title ?? 'unknown'),
        package: adv.module_name ?? 'unknown',
        severity: adv.severity,
        title: adv.title ?? '(untitled advisory)',
        url: adv.url,
      });
    }
  }
  return findings;
}

// ─── Exception allowlist ────────────────────────────────────────────────────

/**
 * Structural validation only (not expiry) — all five fields must be non-empty strings and
 * `expires` must parse as a valid date.
 * @param {unknown} record
 * @returns {{valid: true} | {valid: false, reason: string}}
 */
export function validateExceptionRecord(record) {
  if (!record || typeof record !== 'object') return { valid: false, reason: 'not an object' };
  for (const field of REQUIRED_EXCEPTION_FIELDS) {
    if (typeof record[field] !== 'string' || record[field].trim() === '') {
      return { valid: false, reason: `missing/empty required field "${field}"` };
    }
  }
  if (Number.isNaN(new Date(record.expires).getTime())) {
    return { valid: false, reason: `"expires" is not a valid ISO-8601 date: ${record.expires}` };
  }
  return { valid: true };
}

/**
 * @param {{expires: string}} exception
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isExceptionExpired(exception, now = new Date()) {
  return new Date(exception.expires).getTime() < now.getTime();
}

/**
 * Load + schema-validate `scripts/audit-exceptions.json`. A missing file is treated as "no
 * exceptions" (empty array), not an error. Malformed entries (bad JSON root, missing fields,
 * bad date) are collected separately and NEVER grant an exception.
 * @param {string} path
 * @returns {{valid: object[], invalid: Array<{record: unknown, reason: string}>}}
 */
export function loadExceptions(path = EXCEPTIONS_PATH) {
  if (!existsSync(path)) return { valid: [], invalid: [] };

  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (err) {
    return {
      valid: [],
      invalid: [{ record: null, reason: `audit-exceptions.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}` }],
    };
  }
  if (!Array.isArray(raw)) {
    return { valid: [], invalid: [{ record: raw, reason: 'audit-exceptions.json root must be an array' }] };
  }

  const valid = [];
  const invalid = [];
  for (const record of raw) {
    const result = validateExceptionRecord(record);
    if (result.valid) valid.push(record);
    else invalid.push({ record, reason: result.reason });
  }
  return { valid, invalid };
}

/**
 * Evaluate findings against the (already schema-valid) exception list.
 * @param {Array<{advisoryId: string, package: string}>} findings
 * @param {object[]} validExceptions
 * @param {Date} [now]
 * @returns {{unaddressed: object[], excepted: Array<{finding: object, exception: object}>, expiredUsed: Array<{finding: object, exception: object}>}}
 */
export function evaluateFindings(findings, validExceptions, now = new Date()) {
  const unaddressed = [];
  const excepted = [];
  const expiredUsed = [];

  for (const finding of findings) {
    const match = validExceptions.find(
      (ex) => ex.advisoryId === finding.advisoryId && ex.package === finding.package,
    );
    if (!match) {
      unaddressed.push(finding);
      continue;
    }
    if (isExceptionExpired(match, now)) {
      expiredUsed.push({ finding, exception: match });
      unaddressed.push(finding);
      continue;
    }
    excepted.push({ finding, exception: match });
  }

  return { unaddressed, excepted, expiredUsed };
}

// ─── Orchestration ───────────────────────────────────────────────────────────

/**
 * @param {{exceptionsPath?: string, runAudit?: typeof runNpmAudit, cwd?: string, now?: Date}} [opts]
 * @returns {Promise<{exitCode: number, report: string}>}
 */
export async function main(opts = {}) {
  const { exceptionsPath = EXCEPTIONS_PATH, runAudit = runNpmAudit, cwd = REPO_ROOT, now = new Date() } = opts;
  const lines = [];
  const log = (s) => lines.push(s);

  let auditResult;
  try {
    auditResult = await runAudit(cwd);
  } catch (err) {
    log(`[dependency-audit] FAIL — audit process threw: ${err instanceof Error ? err.message : String(err)}`);
    log('[dependency-audit] fail-closed: "audit could not run" is NOT treated as "clean".');
    return { exitCode: 1, report: lines.join('\n') };
  }

  const parsed = parseAuditOutput(auditResult.stdout);
  if (!parsed.ok) {
    log(`[dependency-audit] FAIL — audit could not run (${parsed.reason}).`);
    if (parsed.detail) log(`  detail: ${JSON.stringify(parsed.detail)}`);
    if (auditResult.stderr) log(`  stderr: ${auditResult.stderr.trim()}`);
    log('[dependency-audit] fail-closed: "audit could not run" != "clean" — treated as FAIL.');
    return { exitCode: 1, report: lines.join('\n') };
  }

  const findings = extractFindings(parsed.report);
  const { valid: validExceptions, invalid: invalidExceptions } = loadExceptions(exceptionsPath);
  const { unaddressed, excepted, expiredUsed } = evaluateFindings(findings, validExceptions, now);

  log(`[dependency-audit] npm audit completed — ${findings.length} high/critical finding(s) detected.`);

  if (invalidExceptions.length > 0) {
    log(`[dependency-audit] ${invalidExceptions.length} malformed exception entr${invalidExceptions.length === 1 ? 'y' : 'ies'} ignored (schema requires advisoryId, package, reason, owner, expires):`);
    for (const inv of invalidExceptions) log(`  - ${JSON.stringify(inv.record)} — ${inv.reason}`);
  }

  if (excepted.length > 0) {
    log(`[dependency-audit] ${excepted.length} finding(s) covered by a signed exception (named, not silently bypassed):`);
    for (const { finding, exception } of excepted) {
      log(`  - advisory ${finding.advisoryId} (${finding.package}, ${finding.severity}) — exception owner=${exception.owner} reason="${exception.reason}" expires=${exception.expires}`);
    }
  }

  if (expiredUsed.length > 0) {
    log(`[dependency-audit] ${expiredUsed.length} finding(s) had an EXPIRED exception — no longer valid, treated as unaddressed:`);
    for (const { finding, exception } of expiredUsed) {
      log(`  - advisory ${finding.advisoryId} (${finding.package}, ${finding.severity}) — exception expired ${exception.expires} (owner=${exception.owner})`);
    }
  }

  if (unaddressed.length > 0) {
    log(`[dependency-audit] FAIL — ${unaddressed.length} unaddressed high/critical finding(s):`);
    for (const f of unaddressed) {
      log(`  - ${f.package}: ${f.title} (advisory ${f.advisoryId}, severity ${f.severity})${f.url ? ` ${f.url}` : ''}`);
    }
    return { exitCode: 1, report: lines.join('\n') };
  }

  log('[dependency-audit] PASS — no unaddressed high/critical findings.');
  return { exitCode: 0, report: lines.join('\n') };
}

// ─── CLI ─────────────────────────────────────────────────────────────────

const isMain = (() => {
  try {
    return fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '');
  } catch {
    return false;
  }
})();

if (isMain) {
  const { exitCode, report } = await main();
  (exitCode === 0 ? process.stdout : process.stderr).write(report + '\n');
  process.exit(exitCode);
}
