import type { Command } from 'commander';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { MemoryStore } from '../../core/memory-store.js';
import {
  loadOrCreateAuditKey,
  verifyAuditChain,
} from '../../api/terminal/audit-integrity.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getLanguage, getMessage } from '../helpers/messages.js';

/**
 * `deckent audit-verify` — walk the audit HMAC chain in `.brain/memory.db`
 * and report whether any row has been tampered with.
 *
 * Exit codes:
 *   0 — clean chain (or no audit rows yet)
 *   1 — tamper detected; prints the first invalid row id
 *   2 — operator error (missing DB, missing key, etc.)
 */
export function registerAuditVerify(program: Command): void {
  program
    .command('audit-verify')
    .description(getMessage('cli.audit_verify.desc', getLanguage(undefined)))
    .option('--json', 'Output raw JSON only')
    .action((opts: { json?: boolean }) => {
      const root = resolveProjectRoot();
      const dbPath = join(root, '.brain', 'memory.db');
      if (!existsSync(dbPath)) {
        printError(`audit-verify: memory DB not found at ${dbPath}`);
        process.exitCode = 2;
        return;
      }
      let store: MemoryStore | undefined;
      try {
        const secret = loadOrCreateAuditKey(root);
        store = new MemoryStore(dbPath);
        const result = verifyAuditChain({ store: store as unknown as { queryAuditChain: () => never[] }, secret });
        if (opts.json) {
          print(JSON.stringify(result, null, 2));
        } else if (result.ok) {
          print(`  Audit chain OK — ${result.rowsVerified} row(s) verified.`);
          if (result.note) print(`  Note: ${result.note}`);
        } else {
          print(`  TAMPER DETECTED — first invalid row id=${result.firstTamperedRowId}`);
          print(`  Rows verified before tamper: ${result.rowsVerified}`);
          if (result.note) print(`  Note: ${result.note}`);
        }
        process.exitCode = result.ok ? 0 : 1;
      } catch (error) {
        printError(error);
        process.exitCode = 2;
      } finally {
        if (store) store.close();
      }
    });
}
