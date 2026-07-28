import type { Command } from 'commander';

import {
  ExecutionLockError,
  adoptExecutionLockAuthorityMount,
  type ExecutionLockMountAdoptionOptions,
  type ExecutionLockMountAdoptionResult,
} from '../../core/file-lock.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

export interface ExecutionAuthorityCommandDeps {
  readonly resolveProjectRootFn?: () => string;
  readonly adoptMount?: (
    projectRoot: string,
    options?: ExecutionLockMountAdoptionOptions,
  ) => ExecutionLockMountAdoptionResult;
  readonly now?: () => number;
}

interface MountAdoptOptions {
  readonly apply?: boolean;
  readonly operator?: string;
  readonly justification?: string;
  readonly json?: boolean;
}

export interface ExecutionAuthorityMountAdoptDto {
  readonly schemaVersion: 1;
  readonly command: 'execution-authority.mount-adopt';
  readonly mode: 'dry-run' | 'apply';
  readonly decision: ExecutionLockMountAdoptionResult['decision'];
  readonly authorityEpoch: string;
  readonly previous: ExecutionLockMountAdoptionResult['previous'];
  readonly current: ExecutionLockMountAdoptionResult['current'];
  readonly evidenceRefs: readonly string[];
}

function toDto(
  result: ExecutionLockMountAdoptionResult,
  apply: boolean,
): ExecutionAuthorityMountAdoptDto {
  return {
    schemaVersion: 1,
    command: 'execution-authority.mount-adopt',
    mode: apply ? 'apply' : 'dry-run',
    decision: result.decision,
    authorityEpoch: result.authorityEpoch,
    previous: result.previous,
    current: result.current,
    evidenceRefs: [...result.evidenceRefs],
  };
}

function printHuman(
  dto: ExecutionAuthorityMountAdoptDto,
  lang: string,
): void {
  const key = dto.decision === 'adopted'
    ? 'execution_authority.mount_adopt.adopted'
    : dto.decision === 'eligible'
      ? 'execution_authority.mount_adopt.eligible'
      : 'execution_authority.mount_adopt.not_required';
  print(getMessage(key, lang, {
    authorityEpoch: dto.authorityEpoch,
    previousMountId: dto.previous.mountId,
    currentMountId: dto.current.mountId,
  }));
  print(getMessage('execution_authority.mount_adopt.evidence', lang, {
    evidenceRefs: dto.evidenceRefs.join(','),
  }));
}

export function registerExecutionAuthorityCommand(
  program: Command,
  deps: ExecutionAuthorityCommandDeps = {},
): void {
  const registerLang = getLanguage(undefined);
  const authority = program
    .command('execution-authority')
    .description(getMessage('execution_authority.cmd_desc', registerLang));

  authority
    .command('mount-adopt')
    .description(getMessage(
      'execution_authority.mount_adopt.desc',
      registerLang,
    ))
    .option(
      '--apply',
      getMessage('execution_authority.mount_adopt.opt_apply', registerLang),
    )
    .option(
      '--operator <id>',
      getMessage('execution_authority.mount_adopt.opt_operator', registerLang),
    )
    .option(
      '--justification <text>',
      getMessage(
        'execution_authority.mount_adopt.opt_justification',
        registerLang,
      ),
    )
    .option(
      '--json',
      getMessage('execution_authority.mount_adopt.opt_json', registerLang),
    )
    .action((options: MountAdoptOptions) => {
      const lang = getLanguage(undefined);
      if (options.apply
        && (!options.operator?.trim() || !options.justification?.trim())) {
        printError(new Error(getMessage(
          'execution_authority.mount_adopt.apply_guard',
          lang,
        )));
        process.exitCode = 1;
        return;
      }
      try {
        const result = (deps.adoptMount ?? adoptExecutionLockAuthorityMount)(
          (deps.resolveProjectRootFn ?? resolveProjectRoot)(),
          {
            apply: options.apply === true,
            ...(options.operator?.trim()
              ? { operatorId: options.operator.trim() }
              : {}),
            ...(options.justification?.trim()
              ? { justification: options.justification.trim() }
              : {}),
            ...(deps.now ? { now: deps.now } : {}),
          },
        );
        const dto = toDto(result, options.apply === true);
        if (options.json) print(JSON.stringify(dto, null, 2));
        else printHuman(dto, lang);
      } catch (error) {
        const reason = error instanceof ExecutionLockError
          ? error.reason
          : 'unknown';
        printError(new Error(getMessage(
          'execution_authority.mount_adopt.failed',
          lang,
          { reason },
        )));
        process.exitCode = 1;
      }
    });
}
