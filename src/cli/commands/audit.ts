import { writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { Command } from 'commander';
import { runSelfAuditGate } from '../../orchestra/sprint-finalizer.js';
import { queryAudit, readAuditEvents } from '../../core/audit-query.js';
import { generateComplianceReport, type ComplianceReport } from '../../core/compliance-report.js';
import { createSiemForwarder } from '../../core/siem-forwarder.js';
import { createHttpSiemTransport, type SiemFetchLike } from '../../core/siem-transport-http.js';
import { loadConfig } from '../../core/config.js';
import { print, printError } from '../helpers/output.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { resolveProjectRoot } from '../helpers/process.js';

interface AuditOpts {
  json?: boolean;
  sprint?: string;
  tenant?: string;
  action?: string;
  since?: string;
  role?: string;
  out?: string;
  url?: string;
  lang?: string;
}

// ─── Read-side helpers (gap #5 — compliance + SIEM over the live chain) ───────

/**
 * Build a compliance report over the live ENT-3 audit chain of a sprint.
 * Control flags are injected by the caller (CLI derives them from config).
 */
export function runComplianceReport(
  root: string,
  sprintId: string,
  flags: { rbacEnabled: boolean; tenantIsolation: boolean },
): ComplianceReport {
  return generateComplianceReport({
    rbacEnabled: flags.rbacEnabled,
    tenantIsolation: flags.tenantIsolation,
    auditEvents: readAuditEvents(root, sprintId),
  });
}

/**
 * Forward a sprint's audit chain through the SIEM forwarder into an NDJSON
 * file (the built-in file transport). Returns the record count + destination.
 * For real network forwarding see {@link runSiemHttpForward} (syslog CLI wire
 * remains an ENT-5 follow-up).
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

export function registerAudit(program: Command): void {
  program
    .command('audit [sprint-id]')
    .description('Run Brain Self-Audit Gate for a sprint, or query/export audit log events (query | compliance | forward)')
    .option('--json', 'Output raw JSON only')
    .option('--sprint <id>', 'Sprint ID for audit query/compliance/forward subcommands', 'sprint-001')
    .option('--tenant <id>', 'Filter audit events by tenant ID (used with query subcommand)')
    .option('--action <channel>', 'Filter audit events by action/channel (used with query subcommand)')
    .option('--since <timestamp>', 'Filter audit events at or after ISO 8601 timestamp (used with query subcommand)')
    .option('--role <role>', 'Caller role for RBAC enforcement: admin|operator|viewer (used with query subcommand)')
    .option('--out <path>', 'Output file for the forward subcommand (default: .deckent/siem-export.jsonl)')
    .option('--url <url>', 'POST audit records to an HTTP(S) SIEM endpoint (forward subcommand; takes precedence over --out)')
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
        // --url → HTTP transport (takes precedence over --out); default → NDJSON file.
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

        // Write gate result to .deckent/<sprint-id>-gate.json
        const deckentDir = join(root, '.deckent');
        if (!existsSync(deckentDir)) mkdirSync(deckentDir, { recursive: true });
        const gatePath = join(deckentDir, `${sprintId}-gate.json`);
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
