// src/cli/commands/process.ts
//
// `deckent process` CLI command — ADR-022 CLI/MCP parity for process-mode.
// The MCP surface (`deckent_process`) is the prior art; this is the thin CLI
// adapter over the same process-runtime (`src/cli/helpers/process-runtime.ts`).
//
// Subcommands:
//   submit <description>   — Submit an ExecutionRequest; prints the executionId
//   status <executionId>   — Poll status of a prior submission
//   result <executionId>   — Show full result (status + lastResult) of a submission
//
// ADR-012: register<Process>(program) pattern.
// ADR-022: CLI/MCP feature parity.

import type { Command } from 'commander';
import { join } from 'node:path';
import { print, printError } from '../helpers/output.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { buildProcessController } from '../helpers/process-runtime.js';
import { loadBacklog } from '../../orchestra/autonomous/backlog.js';
import type { ProcessController } from '../../orchestra/process-controller.js';

// ─── Factory type (injectable for tests) ─────────────────────────────────────

export type ProcessControllerFactory = (root: string) => Promise<ProcessController>;

function backlogPath(root: string): string {
  return join(root, '.deckent', 'autonomous', 'backlog.json');
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

export interface ProcessSubmitOptions {
  root?: string;
  lang?: string;
  kind?: 'task' | 'sprint' | 'capability';
  scopeDir?: string;
  provider?: string;
  model?: string;
}

export async function handleProcessSubmit(
  description: string,
  opts: ProcessSubmitOptions,
  factory: ProcessControllerFactory = buildProcessController,
): Promise<void> {
  const lang = getLanguage(opts.lang);
  const root = opts.root ?? resolveProjectRoot();
  if (!description || !description.trim()) {
    throw new Error(getMessage('process.description_required', lang));
  }
  const controller = await factory(root);
  const result = await controller.submit({
    description: description.trim(),
    origin: 'cli',
    ...(opts.kind ? { kind: opts.kind } : {}),
    ...(opts.scopeDir ? { scopeDir: opts.scopeDir } : {}),
    ...(opts.provider ? { provider: opts.provider } : {}),
    ...(opts.model ? { model: opts.model } : {}),
  });
  print(getMessage('process.submit_success', lang, {
    executionId: result.executionId,
    status: result.status,
  }));
}

export interface ProcessStatusOptions {
  root?: string;
  lang?: string;
}

export async function handleProcessStatus(
  executionId: string,
  opts: ProcessStatusOptions,
  factory: ProcessControllerFactory = buildProcessController,
): Promise<void> {
  const lang = getLanguage(opts.lang);
  const root = opts.root ?? resolveProjectRoot();
  if (!executionId || !executionId.trim()) {
    throw new Error(getMessage('process.executionId_required', lang));
  }
  const controller = await factory(root);
  const record = controller.status(executionId.trim());
  if (!record) {
    print(getMessage('process.not_found', lang, { executionId }));
    return;
  }
  print(getMessage('process.status_found', lang, {
    executionId: record.id,
    status: record.status,
    title: record.title,
    kind: record.kind,
  }));
}

export interface ProcessResultOptions {
  root?: string;
  lang?: string;
}

export async function handleProcessResult(
  executionId: string,
  opts: ProcessResultOptions,
  factory: ProcessControllerFactory = buildProcessController,
): Promise<void> {
  const lang = getLanguage(opts.lang);
  const root = opts.root ?? resolveProjectRoot();
  if (!executionId || !executionId.trim()) {
    throw new Error(getMessage('process.executionId_required', lang));
  }
  // Read from backlog directly (same source as MCP result action) to surface lastResult.
  await factory(root); // ensure controller is wired (backlog file initialised if needed)
  const entry = loadBacklog(backlogPath(root)).entries.find((e) => e.id === executionId.trim());
  if (!entry) {
    print(getMessage('process.not_found', lang, { executionId }));
    return;
  }
  const resultStr = entry.lastResult ? JSON.stringify(entry.lastResult) : 'null';
  print(getMessage('process.result_found', lang, {
    executionId: entry.id,
    status: entry.status,
    title: entry.title,
    result: resultStr,
  }));
}

// ─── register ─────────────────────────────────────────────────────────────────

export function registerProcess(program: Command): void {
  const cmd = program
    .command('process')
    .description('Process-mode execution surface — submit tasks/capabilities and poll their status (ADR-022 CLI/MCP parity)');

  cmd
    .command('submit <description>')
    .description('Submit an ExecutionRequest (policy-gated: read-only auto-runs, side-effecting parks for approval)')
    .option('--kind <kind>', 'Execution kind: task (default), sprint, capability')
    .option('--scope-dir <dir>', 'Scope directory for a code task (drives risk classification)')
    .option('--provider <provider>', 'Provider override')
    .option('--model <model>', 'Model override')
    .option('--root <path>', 'Project root override')
    .option('--lang <code>', 'Language override (en|tr)')
    .action(async (description: string, opts: ProcessSubmitOptions) => {
      try {
        await handleProcessSubmit(description, opts);
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  cmd
    .command('status <executionId>')
    .description('Poll the status of a prior submission by executionId')
    .option('--root <path>', 'Project root override')
    .option('--lang <code>', 'Language override (en|tr)')
    .action(async (executionId: string, opts: ProcessStatusOptions) => {
      try {
        await handleProcessStatus(executionId, opts);
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  cmd
    .command('result <executionId>')
    .description('Show the full result of a submission (status + lastResult)')
    .option('--root <path>', 'Project root override')
    .option('--lang <code>', 'Language override (en|tr)')
    .action(async (executionId: string, opts: ProcessResultOptions) => {
      try {
        await handleProcessResult(executionId, opts);
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });
}
