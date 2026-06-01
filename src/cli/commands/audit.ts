import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { runSelfAuditGate } from '../../orchestra/sprint-finalizer.js';
import { queryAudit } from '../../core/audit-query.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

interface AuditOpts {
  json?: boolean;
  sprint?: string;
  tenant?: string;
  action?: string;
  since?: string;
  role?: string;
}

export function registerAudit(program: Command): void {
  program
    .command('audit [sprint-id]')
    .description('Run Brain Self-Audit Gate for a sprint, or query audit log events')
    .option('--json', 'Output raw JSON only')
    .option('--sprint <id>', 'Sprint ID for audit query (used with query subcommand)', 'sprint-001')
    .option('--tenant <id>', 'Filter audit events by tenant ID (used with query subcommand)')
    .option('--action <channel>', 'Filter audit events by action/channel (used with query subcommand)')
    .option('--since <timestamp>', 'Filter audit events at or after ISO 8601 timestamp (used with query subcommand)')
    .option('--role <role>', 'Caller role for RBAC enforcement: admin|operator|viewer (used with query subcommand)')
    .action(async (sprintId: string | undefined, opts: AuditOpts) => {
      const root = resolveProjectRoot();

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
