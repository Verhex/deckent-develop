import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';

import {
  ExecutionLockError,
  adoptExecutionLockAuthorityMount,
  type ExecutionLockMountAdoptionOptions,
  type ExecutionLockMountAdoptionResult,
} from '../../core/file-lock.js';
import { getMessage } from '../../cli/helpers/messages.js';
import { getMcpToolDescriptionLanguage, mcpToolDescription } from './description-catalog.js';

export interface ExecutionAuthorityToolDeps {
  readonly resolveProjectRoot?: () => string;
  readonly adoptMount?: (
    projectRoot: string,
    options?: ExecutionLockMountAdoptionOptions,
  ) => ExecutionLockMountAdoptionResult;
  readonly now?: () => number;
}

interface ExecutionAuthorityToolDto {
  readonly schemaVersion: 1;
  readonly tool: 'deckent_execution_authority';
  readonly action: 'mount-adopt';
  readonly mode: 'dry-run' | 'apply';
  readonly decision: ExecutionLockMountAdoptionResult['decision'];
  readonly authorityEpoch: string;
  readonly previous: ExecutionLockMountAdoptionResult['previous'];
  readonly current: ExecutionLockMountAdoptionResult['current'];
  readonly evidenceRefs: readonly string[];
}

function response(value: unknown, isError = false): {
  content: Array<{ type: 'text'; text: string }>;
  readonly isError?: true;
} {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    ...(isError ? { isError: true as const } : {}),
  };
}

export function registerExecutionAuthorityTool(
  server: McpServer,
  deps: ExecutionAuthorityToolDeps = {},
): void {
  const lang = getMcpToolDescriptionLanguage();
  server.registerTool(
    'deckent_execution_authority',
    {
      title: getMessage('execution_authority.mount_adopt.mcp_title', lang),
      description: mcpToolDescription('deckent_execution_authority'),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
      inputSchema: z.object({
        action: z.literal('mount-adopt')
          .default('mount-adopt')
          .describe(getMessage(
            'execution_authority.mount_adopt.mcp_action',
            lang,
          )),
        apply: z.boolean()
          .optional()
          .default(false)
          .describe(getMessage(
            'execution_authority.mount_adopt.opt_apply',
            lang,
          )),
        operator: z.string()
          .optional()
          .describe(getMessage(
            'execution_authority.mount_adopt.opt_operator',
            lang,
          )),
        justification: z.string()
          .optional()
          .describe(getMessage(
            'execution_authority.mount_adopt.opt_justification',
            lang,
          )),
      }),
    },
    async ({ apply, operator, justification }) => {
      if (apply && (!operator?.trim() || !justification?.trim())) {
        return response({
          schemaVersion: 1,
          error: true,
          code: 'operator-attestation-required',
        }, true);
      }
      try {
        const result = (deps.adoptMount ?? adoptExecutionLockAuthorityMount)(
          (deps.resolveProjectRoot ?? (() => process.cwd()))(),
          {
            apply,
            ...(operator?.trim() ? { operatorId: operator.trim() } : {}),
            ...(justification?.trim()
              ? { justification: justification.trim() }
              : {}),
            ...(deps.now ? { now: deps.now } : {}),
          },
        );
        const dto: ExecutionAuthorityToolDto = {
          schemaVersion: 1,
          tool: 'deckent_execution_authority',
          action: 'mount-adopt',
          mode: apply ? 'apply' : 'dry-run',
          decision: result.decision,
          authorityEpoch: result.authorityEpoch,
          previous: result.previous,
          current: result.current,
          evidenceRefs: [...result.evidenceRefs],
        };
        return response(dto);
      } catch (error) {
        return response({
          schemaVersion: 1,
          error: true,
          code: error instanceof ExecutionLockError
            ? error.reason
            : 'unknown',
        }, true);
      }
    },
  );
}
