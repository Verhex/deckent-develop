import { writeFileSync, mkdirSync, existsSync, appendFileSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { Command } from 'commander';
import { runSelfAuditGate } from '../../orchestra/sprint-finalizer.js';
import { queryAudit, readAuditEvents, readArchivedAuditEvents } from '../../core/audit-query.js';
import { generateComplianceReport, type ComplianceReport } from '../../core/compliance-report.js';
import { createSiemForwarder } from '../../core/siem-forwarder.js';
import { createHttpSiemTransport, type SiemFetchLike } from '../../core/siem-transport-http.js';
import { createSyslogSiemTransport, type SyslogSendImpl } from '../../core/siem-transport-syslog.js';
import { planRetention, type RetentionPolicy } from '../../core/audit-retention.js';
import { AUDIT_EVENT_CHANNEL, type AuditEventPayload } from '../../core/audit-writer.js';
import { readEvents } from '../../orchestra/event-stream.js';
import { RECENT_WORKS_DIR } from '../../core/constants.js';
import { loadConfig } from '../../core/config.js';
import { print, printError } from '../helpers/output.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { DeckentError } from '../../core/errors.js';

interface AuditOpts {
  json?: boolean;
  sprint?: string;
  tenant?: string;
  action?: string;
  since?: string;
  role?: string;
  out?: string;
  url?: string;
  syslog?: string;
  syslogProtocol?: string;
  keepDays?: string;
  keepCount?: string;
  apply?: boolean;
  lang?: string;
}

const MS_PER_DAY = 86_400_000;
const DEFAULT_SYSLOG_PORT = 514;

// ─── Read-side helpers (gap #5 — compliance + SIEM over the live chain) ───────

/**
 * Build a compliance report over the FULL retained ENT-3 audit trail of a
 * sprint: the retention archive (chain HEAD partition, written by
 * `audit retention --apply`) prepended to the live stream — the live stream
 * alone is a truncated chain after an apply that dropped HMAC'd head records.
 * Control flags are injected by the caller (CLI derives them from config).
 *
 * Honest limit: `prune` (age-expired) records are truly deleted, not archived
 * — if HMAC'd records were pruned, the surviving chain reports broken by
 * design (true deletion is the GDPR-style tradeoff against tamper-evidence).
 */
export function runComplianceReport(
  root: string,
  sprintId: string,
  flags: { rbacEnabled: boolean; tenantIsolation: boolean },
): ComplianceReport {
  return generateComplianceReport({
    rbacEnabled: flags.rbacEnabled,
    tenantIsolation: flags.tenantIsolation,
    auditEvents: [...readArchivedAuditEvents(root, sprintId), ...readAuditEvents(root, sprintId)],
  });
}

/**
 * Forward a sprint's audit chain through the SIEM forwarder into an NDJSON
 * file (the built-in file transport). Returns the record count + destination.
 * For real network forwarding see {@link runSiemHttpForward} (HTTP) and
 * {@link runSiemSyslogForward} (RFC 5424 syslog).
 */
export async function runSiemExport(
  root: string,
  sprintId: string,
  outPath: string,
): Promise<{ count: number; out: string }> {
  const events = readAuditEvents(root, sprintId);
  const forwarder = createSiemForwarder({
    flushEvery: 0, // manual flush — no dangling timer in a one-shot CLI run
    transport: async (batch) => {
      mkdirSync(dirname(outPath), { recursive: true });
      appendFileSync(outPath, batch.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf-8');
    },
  });
  for (const event of events) forwarder.forward(event);
  await forwarder.flush();
  forwarder.dispose();
  return { count: events.length, out: outPath };
}

/**
 * Forward a sprint's audit chain to an HTTP(S) SIEM endpoint via
 * {@link createHttpSiemTransport}. Returns the record count + destination URL.
 *
 * Sync errors (malformed URL) throw before any forwarding; transport failures
 * (non-2xx / network) are retried then dropped by the forwarder per its
 * fail-safe contract — they never reject. `fetchImpl` is injectable for
 * hermetic tests.
 */
export async function runSiemHttpForward(
  root: string,
  sprintId: string,
  url: string,
  fetchImpl?: SiemFetchLike,
): Promise<{ count: number; url: string }> {
  const events = readAuditEvents(root, sprintId);
  const forwarder = createSiemForwarder({
    flushEvery: 0, // manual flush — no dangling timer in a one-shot CLI run
    transport: createHttpSiemTransport({ url, ...(fetchImpl ? { fetchImpl } : {}) }),
  });
  for (const event of events) forwarder.forward(event);
  await forwarder.flush();
  forwarder.dispose();
  return { count: events.length, url };
}

/**
 * Parse the `--syslog <host[:port]>` CLI value. A trailing `:NNN` numeric
 * suffix is treated as the port; anything else is the host with the default
 * syslog port (514). Exported for hermetic CLI-parsing tests.
 */
export function parseSyslogTarget(value: string): { host: string; port: number } {
  const idx = value.lastIndexOf(':');
  if (idx > 0 && idx < value.length - 1) {
    const portStr = value.slice(idx + 1);
    if (/^\d+$/.test(portStr)) {
      return { host: value.slice(0, idx), port: Number(portStr) };
    }
  }
  return { host: value, port: DEFAULT_SYSLOG_PORT };
}

/**
 * Forward a sprint's audit chain to a syslog collector via
 * {@link createSyslogSiemTransport} (RFC 5424, facility 13 "log audit").
 * Returns the record count + destination.
 *
 * Sync errors (empty host, bad port/protocol) throw at transport creation,
 * before any forwarding; send failures are retried then dropped by the
 * forwarder per its fail-safe contract — they never reject. `sendImpl` is
 * injectable for hermetic tests (no socket is opened when provided).
 */
export async function runSiemSyslogForward(
  root: string,
  sprintId: string,
  host: string,
  port: number,
  protocol: 'udp' | 'tcp',
  sendImpl?: SyslogSendImpl,
): Promise<{ count: number; host: string; port: number; protocol: 'udp' | 'tcp' }> {
  const events = readAuditEvents(root, sprintId);
  const forwarder = createSiemForwarder({
    flushEvery: 0, // manual flush — no dangling timer in a one-shot CLI run
    transport: createSyslogSiemTransport({ host, port, protocol, ...(sendImpl ? { sendImpl } : {}) }),
  });
  for (const event of events) forwarder.forward(event);
  await forwarder.flush();
  forwarder.dispose();
  return { count: events.length, host, port, protocol };
}

// ─── Retention (gap — audit retention CLI over planRetention) ─────────────────

/** Outcome of {@link runAuditRetention} — plan counts + whether it was applied. */
export interface RetentionRunResult {
  sprintId: string;
  /** Audit events found on the sprint stream (non-audit channels excluded). */
  scanned: number;
  keep: number;
  archive: number;
  prune: number;
  /** True only when --apply was given (even if nothing needed rewriting). */
  applied: boolean;
}

/**
 * Plan (and optionally apply) audit-log retention for a sprint stream.
 *
 * The partitioning logic is {@link planRetention} (audit-retention.ts) — this
 * helper only applies its plan to the stream file. Per the planner's
 * chain-contiguity contract, `prune` + `archive` are always the chain HEAD
 * (oldest), so the kept entries' internal prevHmac linkage stays intact.
 * Note: `verifyAuditChain` anchors at the genesis constant, so it remains
 * fully intact when the dropped head entries are legacy (hmac-less) records;
 * dropping hmac-bearing head entries re-anchors the surviving sub-chain.
 *
 * Apply semantics (NO writes happen in dry-run):
 *   1. `archive` partition events are appended to
 *      `.deckent/<sprintId>-events-archive.jsonl` BEFORE the stream is
 *      rewritten (no-data-loss ordering); `prune` events are dropped.
 *   2. The stream file is rewritten atomically (tmp file + rename) keeping
 *      every non-audit event and the audit `keep` partition in original order.
 *   3. When the plan drops nothing, the stream file is not touched at all.
 */
export function runAuditRetention(
  root: string,
  sprintId: string,
  policy: RetentionPolicy,
  apply: boolean,
): RetentionRunResult {
  const all = readEvents(root, sprintId);
  const auditIndices: number[] = [];
  const auditPayloads: AuditEventPayload[] = [];
  for (let i = 0; i < all.length; i++) {
    if (all[i]!.channel === AUDIT_EVENT_CHANNEL) {
      auditIndices.push(i);
      auditPayloads.push(all[i]!.payload as unknown as AuditEventPayload);
    }
  }

  const plan = planRetention(auditPayloads, policy);
  const result: RetentionRunResult = {
    sprintId,
    scanned: auditPayloads.length,
    keep: plan.keep.length,
    archive: plan.archive.length,
    prune: plan.prune.length,
    applied: apply,
  };

  if (!apply) return result; // dry-run — ZERO writes

  const dropCount = plan.prune.length + plan.archive.length;
  if (dropCount === 0) return result; // nothing to drop — leave the stream untouched

  // Archive first (no-data-loss ordering): the archive partition starts right
  // after the prune partition — both are contiguous head slices of the audit
  // index list, mirroring planRetention's [ prune | archive | keep ] layout.
  if (plan.archive.length > 0) {
    const archivePath = join(root, RECENT_WORKS_DIR, `${sprintId}-events-archive.jsonl`);
    const archivedLines = auditIndices
      .slice(plan.prune.length, dropCount)
      .map((i) => JSON.stringify(all[i]!));
    mkdirSync(dirname(archivePath), { recursive: true });
    appendFileSync(archivePath, archivedLines.join('\n') + '\n', 'utf-8');
  }

  // Atomic in-place rewrite: drop the pruned + archived audit events; preserve
  // all non-audit events and the keep partition in original stream order.
  const dropSet = new Set(auditIndices.slice(0, dropCount));
  const kept = all.filter((_, i) => !dropSet.has(i));
  const streamPath = join(root, RECENT_WORKS_DIR, `${sprintId}-events.jsonl`);
  const tmpPath = `${streamPath}.tmp`;
  writeFileSync(tmpPath, kept.length > 0 ? kept.map((e) => JSON.stringify(e)).join('\n') + '\n' : '', 'utf-8');
  renameSync(tmpPath, streamPath);

  return result;
}

export function registerAudit(program: Command): void {
  program
    .command('audit [sprint-id]')
    .description(getMessage('cli.audit.desc', getLanguage(undefined)))
    .option('--json', 'Output raw JSON only')
    .option('--sprint <id>', 'Sprint ID for audit query/compliance/forward/retention subcommands', 'sprint-001')
    .option('--tenant <id>', 'Filter audit events by tenant ID (used with query subcommand)')
    .option('--action <channel>', 'Filter audit events by action/channel (used with query subcommand)')
    .option('--since <timestamp>', 'Filter audit events at or after ISO 8601 timestamp (used with query subcommand)')
    .option('--role <role>', 'Caller role for RBAC enforcement: admin|operator|viewer (used with query subcommand)')
    .option('--out <path>', 'Output file for the forward subcommand (default: .deckent/siem-export.jsonl)')
    .option('--url <url>', 'POST audit records to an HTTP(S) SIEM endpoint (forward subcommand; takes precedence over --syslog and --out)')
    .option('--syslog <host[:port]>', 'Send audit records to a syslog collector, RFC 5424 (forward subcommand; takes precedence over --out)')
    .option('--syslog-protocol <protocol>', 'Syslog wire protocol: udp|tcp (forward subcommand)', 'udp')
    .option('--keep-days <n>', 'Retention: prune audit events older than n days (retention subcommand)')
    .option('--keep-count <n>', 'Retention: archive audit events beyond the most recent n (retention subcommand)')
    .option('--apply', 'Retention: apply the plan — without it the run is a dry-run (retention subcommand)')
    .option('--lang <code>', 'Language override (en|tr)')
    .action(async (sprintId: string | undefined, opts: AuditOpts) => {
      const root = resolveProjectRoot();
      const lang = getLanguage(opts.lang);

      if (sprintId === 'compliance') {
        // Compliance report over the live audit chain (gap #5 read-side).
        try {
          const cfg = await loadConfig(root);
          const report = runComplianceReport(root, opts.sprint ?? 'sprint-001', {
            rbacEnabled: cfg.autonomous?.rbac_policy?.enabled ?? false,
            tenantIsolation: cfg.strict_tenant_isolation ?? false,
          });
          if (opts.json) {
            print(JSON.stringify(report, null, 2));
          } else {
            print(getMessage('audit.compliance.summary', lang, {
              sprint: opts.sprint ?? 'sprint-001',
              count: String(report.eventCount),
              chain: report.controls.auditChainIntact,
              rbac: report.controls.rbacEnforcement,
              tenant: report.controls.tenantIsolation,
            }));
            for (const [actor, count] of Object.entries(report.actorBreakdown)) {
              print(getMessage('audit.compliance.actor_row', lang, { actor, count: String(count) }));
            }
          }
          process.exitCode = report.auditChainIntegrity.intact ? 0 : 1;
        } catch (error) {
          printError(error);
          process.exitCode = 2;
        }
        return;
      }

      if (sprintId === 'forward') {
        // SIEM forward of the live audit chain (gap #5 read-side):
        // precedence --url (HTTP) > --syslog (RFC 5424) > --out (NDJSON file).
        try {
          if (opts.url) {
            const result = await runSiemHttpForward(root, opts.sprint ?? 'sprint-001', opts.url);
            if (opts.json) {
              print(JSON.stringify(result, null, 2));
            } else {
              print(getMessage('audit.forward.sent', lang, {
                count: String(result.count),
                url: result.url,
              }));
            }
            process.exitCode = 0;
            return;
          }
          if (opts.syslog) {
            const { host, port } = parseSyslogTarget(opts.syslog);
            // Invalid values are rejected by createSyslogSiemTransport (fail-closed → exit 2).
            const protocol = (opts.syslogProtocol ?? 'udp') as 'udp' | 'tcp';
            const result = await runSiemSyslogForward(root, opts.sprint ?? 'sprint-001', host, port, protocol);
            if (opts.json) {
              print(JSON.stringify(result, null, 2));
            } else {
              print(getMessage('audit.forward.syslog_sent', lang, {
                count: String(result.count),
                host: result.host,
                port: String(result.port),
                protocol: result.protocol,
              }));
            }
            process.exitCode = 0;
            return;
          }
          const out = opts.out ?? join(root, '.deckent', 'siem-export.jsonl');
          const result = await runSiemExport(root, opts.sprint ?? 'sprint-001', out);
          if (opts.json) {
            print(JSON.stringify(result, null, 2));
          } else {
            print(getMessage('audit.forward.done', lang, {
              count: String(result.count),
              out: result.out,
            }));
          }
          process.exitCode = 0;
        } catch (error) {
          printError(error);
          process.exitCode = 2;
        }
        return;
      }

      if (sprintId === 'retention') {
        // Audit-log retention over planRetention (audit-retention.ts):
        // dry-run by default (plan summary, ZERO writes); --apply archives +
        // atomically rewrites the stream. Exit: dry-run 0, apply success 0, error 2.
        try {
          const policy: RetentionPolicy = {};
          if (opts.keepDays !== undefined) {
            const days = Number(opts.keepDays);
            if (!Number.isFinite(days) || days < 0) {
              throw new DeckentError('DECKENT_E004', getMessage('audit.retention.invalid_keep_days', lang, { value: String(opts.keepDays) }));
            }
            policy.maxAgeMs = days * MS_PER_DAY;
          }
          if (opts.keepCount !== undefined) {
            const count = Number(opts.keepCount);
            if (!Number.isInteger(count) || count < 0) {
              throw new DeckentError('DECKENT_E004', getMessage('audit.retention.invalid_keep_count', lang, { value: String(opts.keepCount) }));
            }
            policy.maxCount = count;
          }
          const result = runAuditRetention(root, opts.sprint ?? 'sprint-001', policy, opts.apply === true);
          if (opts.json) {
            print(JSON.stringify(result, null, 2));
          } else {
            print(getMessage(result.applied ? 'audit.retention.applied' : 'audit.retention.plan', lang, {
              sprint: result.sprintId,
              scanned: String(result.scanned),
              keep: String(result.keep),
              archive: String(result.archive),
              prune: String(result.prune),
            }));
          }
          process.exitCode = 0;
        } catch (error) {
          printError(error);
          process.exitCode = 2;
        }
        return;
      }

      if (sprintId === 'query') {
        // audit query subcommand: call queryAudit() with optional RBAC gate
        try {
          const result = queryAudit(
            root,
            opts.sprint ?? 'sprint-001',
            { tenantId: opts.tenant, channel: opts.action, from: opts.since },
            opts.role,
          );

          if (opts.json) {
            print(JSON.stringify(result, null, 2));
          } else {
            print(`\n  Audit Query: sprint=${result.sprintId}`);
            print(`  ─────────────────────────────────`);
            print(`  Scanned: ${result.totalScanned} events`);
            print(`  Matched: ${result.matched.length} events`);
            if (result.matched.length > 0) {
              for (const entry of result.matched) {
                print(`  [${entry.timestamp}] ${entry.channel} — ${entry.source} → ${entry.target}`);
              }
            }
            print(`  ─────────────────────────────────\n`);
          }

          process.exitCode = 0;
        } catch (error) {
          printError(error);
          process.exitCode = 1;
        }
        return;
      }

      if (!sprintId) {
        printError(new Error('audit: sprint-id required (e.g. deckent audit sprint-210) or use: deckent audit query [options]'));
        process.exitCode = 1;
        return;
      }

      try {
        const result = await runSelfAuditGate(sprintId, root);

        // Write gate result to .deckent/recently-works/<sprint-id>-gate.json
        const recentWorksDir = join(root, RECENT_WORKS_DIR);
        if (!existsSync(recentWorksDir)) mkdirSync(recentWorksDir, { recursive: true });
        const gatePath = join(recentWorksDir, `${sprintId}-gate.json`);
        writeFileSync(gatePath, JSON.stringify(result, null, 2) + '\n', 'utf-8');

        if (opts.json) {
          print(JSON.stringify(result, null, 2));
        } else {
          print(`\n  Self-Audit Gate: ${result.overallGate}`);
          print(`  ─────────────────────────────────`);
          print(`  tsc:           ${result.tsc.status}${result.tsc.errors.length > 0 ? ` (${result.tsc.errors.length} errors)` : ''}`);
          print(`  vitest:        ${result.vitest.status} (delta: +${result.vitest.delta.pass} pass, +${result.vitest.delta.fail} fail)`);
          print(`  honesty:       ${result.honesty.violations} violation(s)${result.honesty.flaggedTasks.length > 0 ? ` [${result.honesty.flaggedTasks.join(', ')}]` : ''}`);
          print(`  observability: ${result.observability.metricsJsonlExists ? `OK (${result.observability.lineCount} lines)` : 'WARNING — metrics.jsonl not found'}`);
          print(`  ─────────────────────────────────`);
          print(`  Written: ${gatePath}\n`);
        }

        process.exitCode = result.overallGate === 'PASS' ? 0 : 1;
      } catch (error) {
        printError(error);
        process.exitCode = 2;
      }
    });
}
