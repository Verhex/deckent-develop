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
import { cliContractMessage, bindArgumentDescriptions } from '../helpers/message-catalog/cli-run.js';
import { DeckentError } from '../../core/errors.js';

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
    throw new DeckentError('E_PROCESS_DESCRIPTION_REQUIRED', getMessage('process.description_required', lang));
  }
  const controller = await factory(root);
  try {
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
  } finally {
    controller.close();
  }
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
    throw new DeckentError('E_PROCESS_EXECUTION_ID_REQUIRED', getMessage('process.executionId_required', lang));
  }
  const controller = await factory(root);
  try {
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
  } finally {
    controller.close();
  }
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
    throw new DeckentError('E_PROCESS_EXECUTION_ID_REQUIRED', getMessage('process.executionId_required', lang));
  }
  const controller = await factory(root);
  try {
    // Read from backlog directly (same source as MCP result action) to surface lastResult.
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
  } finally {
    controller.close();
  }
}

// ─── register ─────────────────────────────────────────────────────────────────

export function registerProcess(program: Command): void {
  const helpLang = getLanguage(undefined);
  const cmd = program
    .command('process')
    .description(getMessage('cli.process.desc', getLanguage(undefined)));

  bindArgumentDescriptions(cmd.command('submit <description>'), helpLang, { description: 'cliContract.process.arg.description' })
    .description(getMessage('cli.process.submit.desc', helpLang))
    .option('--kind <kind>', cliContractMessage('cliContract.process.opt.kind', helpLang))
    .option('--scope-dir <dir>', cliContractMessage('cliContract.process.opt.scope_dir', helpLang))
    .option('--provider <provider>', cliContractMessage('cliContract.process.opt.provider', helpLang))
    .option('--model <model>', cliContractMessage('cliContract.process.opt.model', helpLang))
    .option('--root <path>', cliContractMessage('cliContract.process.opt.root', helpLang))
    .option('--lang <code>', cliContractMessage('cliContract.process.opt.lang', helpLang))
    .action(async (description: string, opts: ProcessSubmitOptions) => {
      try {
        await handleProcessSubmit(description, opts);
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  bindArgumentDescriptions(cmd.command('status <executionId>'), helpLang, { executionId: 'cliContract.process.arg.executionId' })
    .description(getMessage('cli.process.status.desc', helpLang))
    .option('--root <path>', cliContractMessage('cliContract.process.opt.root', helpLang))
    .option('--lang <code>', cliContractMessage('cliContract.process.opt.lang', helpLang))
    .action(async (executionId: string, opts: ProcessStatusOptions) => {
      try {
        await handleProcessStatus(executionId, opts);
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  bindArgumentDescriptions(cmd.command('result <executionId>'), helpLang, { executionId: 'cliContract.process.arg.executionId' })
    .description(getMessage('cli.process.result.desc', helpLang))
    .option('--root <path>', cliContractMessage('cliContract.process.opt.root', helpLang))
    .option('--lang <code>', cliContractMessage('cliContract.process.opt.lang', helpLang))
    .action(async (executionId: string, opts: ProcessResultOptions) => {
      try {
        await handleProcessResult(executionId, opts);
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });
}
