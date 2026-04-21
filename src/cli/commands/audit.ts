import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { runSelfAuditGate } from '../../orchestra/sprint-finalizer.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

export function registerAudit(program: Command): void {
  program
    .command('audit <sprint-id>')
    .description('Run Brain Self-Audit Gate for a sprint (tsc + vitest + honesty + observability)')
    .option('--json', 'Output raw JSON only')
    .action(async (sprintId: string, opts: { json?: boolean }) => {
      const root = resolveProjectRoot();

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
