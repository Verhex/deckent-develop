import type { Command } from 'commander';
import {
  getDeprecatedForwardingSurface,
  registerDeprecatedForwarding,
} from '../helpers/compatibility-command-help.js';
import { bindArgumentDescriptions } from '../helpers/message-catalog/cli-run.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { printError } from '../helpers/output.js';
import { withCommandLocalShutdown } from '../helpers/shutdown-hooks.js';
import { executeApprovalDecision } from './approvals.js';

const CHECKPOINT_PHASES = new Set(['plan', 'evaluate', 'fix']);
const SAFE_CHECKPOINT_SPRINT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;
const MAX_CHECKPOINT_SPRINT_ID_LENGTH = 128;

export function checkpointApprovalRequestId(sprintId: string, phase: string): string | undefined {
  if (
    sprintId.length > MAX_CHECKPOINT_SPRINT_ID_LENGTH
    || !SAFE_CHECKPOINT_SPRINT_ID.test(sprintId)
    || !CHECKPOINT_PHASES.has(phase)
  ) return undefined;
  return `checkpoint-${sprintId}-${phase}`;
}

interface CheckpointDecisionOpts {
  readonly lang?: string;
}

function resolveCallerLocalLanguage(requested: string | undefined): string {
  const normalized = requested?.slice(0, 2).toLowerCase();
  return normalized === 'en' || normalized === 'tr' ? normalized : getLanguage(undefined);
}

function registerCheckpointDecision(
  checkpoint: Command,
  action: 'approve' | 'reject',
  helpLanguage: string,
): void {
  bindArgumentDescriptions(
    checkpoint.command(`${action} <sprintId> <phase>`),
    helpLanguage,
    {
      sprintId: 'cliContract.checkpoint.arg.sprintId',
      phase: 'cliContract.checkpoint.arg.phase',
    },
  )
    .description(getMessage(`cli.checkpoint.${action}.desc`, helpLanguage))
    .option('--lang <code>', getMessage('checkpoint.lang_option', helpLanguage))
    .allowExcessArguments(false)
    .action((sprintId: string, phase: string, opts: CheckpointDecisionOpts) =>
      withCommandLocalShutdown(async () => {
        const language = resolveCallerLocalLanguage(opts.lang);
        const requestId = checkpointApprovalRequestId(sprintId, phase);
        if (requestId === undefined) {
          printError(new Error(getMessage('approvals.decision_refused', language, {
            id: 'checkpoint-input',
            kind: 'invalid-input',
            reason: 'invalid-checkpoint-identity',
          })));
          process.exitCode = 1;
          return;
        }
        await executeApprovalDecision(
          requestId,
          action === 'approve' ? { allow: true } : { deny: true },
          { callerLocalLang: language, requiredFederatedOrigin: 'checkpoint' },
        );
      }));
}

/** Deprecated forwarding alias; replacement behavior remains registered elsewhere. */
export function registerCheckpoint(program: Command): void {
  const checkpoint = registerDeprecatedForwarding(
    program,
    getDeprecatedForwardingSurface('checkpoint')!,
  );
  const helpLanguage = getLanguage(undefined);
  registerCheckpointDecision(checkpoint, 'approve', helpLanguage);
  registerCheckpointDecision(checkpoint, 'reject', helpLanguage);
}
