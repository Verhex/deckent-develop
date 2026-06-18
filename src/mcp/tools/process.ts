// src/mcp/tools/process.ts
//
// `deckent_process` MCP tool — the process-mode execution surface over MCP.
// Mirrors the REST /api/process/* routes: submit an ExecutionRequest (policy-gated,
// safe-by-default) and poll status/result. Delegates to the SAME process-controller
// the REST endpoint uses (buildProcessController) — no reimplemented orchestration.
//
// ADR-022 (CLI/MCP parity), ADR-067/071 (process mode + governance).

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod/v4';
import { join } from 'node:path';
import { enrichResponse } from '../helpers/enrich.js';
import { loadBacklog } from '../../orchestra/autonomous/backlog.js';
import { buildProcessController } from '../../cli/helpers/process-runtime.js';
import type { ProcessSubmitCtx } from '../../orchestra/process-controller.js';
import type { CapabilityTarget } from '../../core/work-model.js';

function backlogPath(root: string): string {
  return join(root, '.deckent', 'autonomous', 'backlog.json');
}

function jsonText(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

export function registerProcessTool(server: McpServer): void {
  server.registerTool(
    'deckent_process',
    {
      title: 'Process Mode',
      description:
        'Process-mode execution surface (continuous request-handling for ERP / business ' +
        'automation). action=submit injects an ExecutionRequest (policy-gated: read-only ' +
        'capabilities auto-run, side-effecting ones park for approval); action=status|result ' +
        'polls a prior submission by executionId.',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      inputSchema: z.object({
        action: z.enum(['submit', 'status', 'result']).describe('submit | status | result'),
        root: z.string().optional().describe('Project root (default: cwd)'),
        // submit fields
        description: z.string().optional().describe('submit: what to do (task description or capability intent)'),
        kind: z.enum(['task', 'sprint', 'capability']).optional().describe('submit: execution kind (inferred capability when a capability verb is set)'),
        capability: z.string().optional().describe('submit kind=capability: dotted verb (e.g. erp.read, erp.write, db.query)'),
        capabilityArgs: z.string().optional().describe('submit kind=capability: JSON object of handler args'),
        connector: z.string().optional().describe('submit kind=capability: preferred backend (e.g. odoo, imap, postgres)'),
        scopeDir: z.string().optional().describe('submit kind=task: scope directory (drives risk classification)'),
        provider: z.string().optional().describe('submit: provider override'),
        model: z.string().optional().describe('submit: model override'),
        tenant: z.string().optional().describe('submit: tenant id (audit isolation)'),
        actorId: z.string().optional().describe('submit: actor id (RBAC + audit lineage)'),
        // status/result field
        executionId: z.string().optional().describe('status|result: the id returned by a prior submit'),
      }).shape,
    },
    async ({ action, root: rootParam, description, kind, capability, capabilityArgs, connector, scopeDir, provider, model, tenant, actorId, executionId }) => {
      const root = rootParam ?? process.cwd();
      try {
        if (action === 'submit') {
          if (!description) throw new Error('description is required for submit');
          let capabilityTarget: CapabilityTarget | undefined;
          if (capability) {
            let args: Record<string, unknown> | undefined;
            if (capabilityArgs !== undefined) {
              const parsed: unknown = JSON.parse(capabilityArgs);
              if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('capabilityArgs must be a JSON object');
              args = parsed as Record<string, unknown>;
            }
            capabilityTarget = {
              capability,
              ...(args !== undefined ? { args } : {}),
              ...(connector !== undefined ? { connector } : {}),
            };
          }
          const ctx: ProcessSubmitCtx = {
            description,
            origin: 'mcp',
            ...(kind ? { kind } : {}),
            ...(capabilityTarget ? { capabilityTarget } : {}),
            ...(scopeDir ? { scopeDir } : {}),
            ...(provider ? { provider } : {}),
            ...(model ? { model } : {}),
            ...(tenant ? { tenant } : {}),
            ...(actorId ? { actor: { id: actorId, ...(tenant ? { tenantId: tenant } : {}) } } : {}),
          };
          const controller = await buildProcessController(root);
          const result = await controller.submit(ctx);
          return jsonText(enrichResponse('process', { action: 'submit', ...result }));
        }

        // status | result — read the durable backlog entry by id
        if (!executionId) throw new Error('executionId is required for status/result');
        const entry = loadBacklog(backlogPath(root)).entries.find((e) => e.id === executionId);
        if (!entry) {
          return jsonText(enrichResponse('process', { action, executionId, found: false }));
        }
        return jsonText(enrichResponse('process', {
          action,
          id: entry.id,
          title: entry.title,
          kind: entry.kind,
          status: entry.status,
          lastResult: entry.lastResult,
        }));
      } catch (err) {
        return jsonText(enrichResponse('process', { action, error: err instanceof Error ? err.message : String(err) }));
      }
    },
  );
}
