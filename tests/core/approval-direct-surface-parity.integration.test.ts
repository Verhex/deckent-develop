import { describe, expect, it, vi } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerConfirmationsCommand } from '../../src/cli/commands/confirmations.js';
import { handleGatewayPairApprove, handleGatewayPairReject } from '../../src/cli/commands/gateway.js';
import { bootstrapConnectorCommands } from '../../src/connectors/connector-bootstrap.js';
import { loadGatewayAccess } from '../../src/connectors/gateway/gateway-access.js';
import type { IMessageConnector, IncomingMessage } from '../../src/connectors/types.js';
import { loadConfig } from '../../src/core/config.js';
import { resolveApprovalLifecyclePolicy } from '../../src/core/approval-lifecycle-policy.js';
import {
  confirmationContentDigest,
  createConfirmationRequest,
  readConfirmation,
  type ConfirmationIdentity,
} from '../../src/core/confirmation-store.js';
import { registerAutonomousApproveTool } from '../../src/mcp/tools/autonomous-approval.js';
import { registerAutonomousTool } from '../../src/mcp/tools/autonomous.js';
import { call, startTestServer, type TestServerHandle } from '../api/test-server-helper.js';

type McpResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};
type McpHandler = (args: Record<string, unknown>) => Promise<McpResult>;

function captureMcpHandler(register: (server: McpServer) => void): McpHandler {
  let handler: McpHandler | undefined;
  register({
    registerTool: (_name: string, _config: unknown, candidate: McpHandler) => { handler = candidate; },
  } as unknown as McpServer);
  if (!handler) throw new Error('MCP handler was not registered');
  return handler;
}

function writeAutonomousPending(root: string, triggerId: string, enqueuedAt: string): void {
  const dir = join(root, '.deckent', 'autonomous');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'pending.json'), JSON.stringify([{
    triggerId,
    action: 'autonomous.execute',
    requestedBy: 'lifecycle-parity',
    enqueuedAt,
  }]), 'utf8');
}

function readDecision(root: string, triggerId: string): Record<string, unknown> {
  const decisions = JSON.parse(readFileSync(
    join(root, '.deckent', 'autonomous', 'decisions.json'),
    'utf8',
  )) as Record<string, Record<string, unknown>>;
  const decision = decisions[triggerId];
  if (!decision) throw new Error(`decision missing for ${triggerId}`);
  return decision;
}

describe('approval direct-surface late-decision parity', () => {
  it('keeps every retained surface terminal: no replay, revival, or access grant', async () => {
    const roots: string[] = [];
    let api: TestServerHandle | undefined;
    const gatewayEnvBefore = process.env['DECKENT_GATEWAY_HOME'];
    const globalHomeBefore = process.env['DECKENT_HOME'];
    const lifecycle = resolveApprovalLifecyclePolicy({
      enabled: true,
      profiles: {
        'autonomous-trigger': { ttlMs: 1_000, slaMs: [100, 200, 500] },
        'gateway-pairing': { ttlMs: 1_000, slaMs: [100, 200, 500] },
      },
    });
    try {
      // Isolate loadConfig-backed MCP/API surfaces from the developer's live
      // machine-global config while retaining the real three-layer loader.
      const globalHome = mkdtempSync(join(tmpdir(), 'direct-parity-global-'));
      roots.push(globalHome);
      writeFileSync(join(globalHome, 'config.json'), '{}\n', 'utf8');
      process.env['DECKENT_HOME'] = globalHome;

      // Confirmation CLI: the first late decision writes one UNDECIDABLE
      // tombstone; the second cannot replace or revive it.
      const confirmationRoot = mkdtempSync(join(tmpdir(), 'direct-parity-confirmation-'));
      roots.push(confirmationRoot);
      let confirmationNow = new Date('2026-08-21T08:00:00.000Z');
      const identity: ConfirmationIdentity = {
        attemptId: 'direct-parity-confirmation', generation: 1,
        sourceDigest: confirmationContentDigest('source'),
        evidenceDigest: confirmationContentDigest('evidence'),
        revisionDigest: confirmationContentDigest('revision'),
      };
      const confirmation = createConfirmationRequest(confirmationRoot, {
        sprintId: 'sprint-parity', taskId: 'confirmation', itemIds: [],
        kind: 'audit', verdict: 'QUALIFIED', adapter: 'human',
        statements: ['late decisions stay terminal'], evidenceRequirements: [],
        requestedAt: confirmationNow.toISOString(), source: 'acceptance-matrix', identity,
      }, { lifecycle, identity, clock: () => confirmationNow });
      confirmationNow = new Date('2026-08-21T16:00:00.001Z');
      const confirmationProgram = new Command().exitOverride();
      registerConfirmationsCommand(confirmationProgram, {
        resolveProjectRootFn: () => confirmationRoot,
        confirmInteractiveFn: async () => true,
        clock: () => confirmationNow,
        loadConfigFn: (async () => ({ approval: { lifecycle } })) as unknown as typeof loadConfig,
      });
      process.exitCode = 0;
      await confirmationProgram.parseAsync([
        'node', 'deckent', 'confirmations', 'decide', confirmation.id,
        '--confirm', '--reason', 'late allow',
      ]);
      // The legacy command is now a non-authoritative route to
      // `deckent approvals decide`; successful routing is exit 0, while the
      // late confirmation remains terminal and cannot be revived below.
      expect(process.exitCode).toBe(0);
      const firstConfirmation = readConfirmation(
        confirmationRoot, confirmation.id, { lifecycle, clock: () => confirmationNow },
      );
      if (!firstConfirmation || firstConfirmation.state !== 'settled') {
        throw new Error('confirmation did not settle');
      }
      expect(firstConfirmation.request.outcome).toMatchObject({
        verdict: 'UNDECIDABLE', decidedBy: 'system:expiry',
        closureReason: 'expired', parked: true,
      });
      const confirmationTombstone = readFileSync(join(
        confirmationRoot, '.deckent', 'runtime', 'confirmations', 'settled', `${confirmation.id}.json`,
      ), 'utf8');
      await confirmationProgram.parseAsync([
        'node', 'deckent', 'confirmations', 'decide', confirmation.id,
        '--reject', '--reason', 'late deny',
      ]);
      expect(readFileSync(join(
        confirmationRoot, '.deckent', 'runtime', 'confirmations', 'settled', `${confirmation.id}.json`,
      ), 'utf8')).toBe(confirmationTombstone);
      process.exitCode = 0;

      // Focused and broad autonomous MCP surfaces observe the same durable
      // timeout. The broad retry cannot turn the focused call into approval.
      const mcpRoot = mkdtempSync(join(tmpdir(), 'direct-parity-mcp-'));
      roots.push(mcpRoot);
      mkdirSync(join(mcpRoot, '.deckent'), { recursive: true });
      writeFileSync(join(mcpRoot, '.deckent', 'config.json'), JSON.stringify({
        language: 'en',
        approval: {
          lifecycle: {
            enabled: true,
            profiles: {
              'autonomous-trigger': { ttlMs: 1_000, slaMs: [100, 200, 500] },
            },
          },
        },
      }), 'utf8');
      writeAutonomousPending(mcpRoot, 'late-mcp-parity', '2020-01-01T00:00:00.000Z');
      const focused = await captureMcpHandler(registerAutonomousApproveTool)({
        triggerId: 'late-mcp-parity', root: mcpRoot,
      });
      const focusedBody = JSON.parse(focused.content[0]!.text) as Record<string, unknown>;
      expect(focused.isError).toBe(true);
      expect(focusedBody).toMatchObject({
        code: 'APR_APPROVAL_CLOSED', reasonCode: 'expired', triggerId: 'late-mcp-parity',
      });
      const firstMcpDecision = readDecision(mcpRoot, 'late-mcp-parity');
      const broad = await captureMcpHandler(registerAutonomousTool)({
        action: 'approve', triggerId: 'late-mcp-parity', root: mcpRoot,
      });
      const broadBody = JSON.parse(broad.content[0]!.text) as Record<string, unknown>;
      expect(broad.isError).toBe(true);
      expect(broadBody).toMatchObject({
        code: 'APR_APPROVAL_CLOSED', reasonCode: 'expired', triggerId: 'late-mcp-parity',
      });
      expect(readDecision(mcpRoot, 'late-mcp-parity')).toEqual(firstMcpDecision);
      expect(firstMcpDecision).toMatchObject({
        outcome: 'rejected', kind: 'timeout', closureReason: 'expired', replayAllowed: false,
      });

      // HTTP API returns the same typed closed state and never writes allow.
      api = await startTestServer({
        disableAuth: true,
        seed: {
          config: {
            approval: {
              lifecycle: {
                enabled: true,
                profiles: {
                  'autonomous-trigger': { ttlMs: 1_000, slaMs: [100, 200, 500] },
                },
              },
            },
          },
        },
      });
      writeAutonomousPending(
        api.projectRoot,
        'late-api-parity',
        new Date(Date.now() - 5_000).toISOString(),
      );
      const apiResponse = await call(api, '/api/autonomous/approve/late-api-parity', { method: 'POST' });
      expect(apiResponse.status).toBe(409);
      expect(apiResponse.json()).toMatchObject({
        code: 'APR_APPROVAL_CLOSED', reasonCode: 'expired', triggerId: 'late-api-parity',
      });
      const firstApiDecision = readDecision(api.projectRoot, 'late-api-parity');
      expect(firstApiDecision).toMatchObject({
        outcome: 'rejected', kind: 'timeout', replayAllowed: false,
      });
      const apiReplay = await call(api, '/api/autonomous/approve/late-api-parity', { method: 'POST' });
      expect(apiReplay.status).toBe(409);
      expect(readDecision(api.projectRoot, 'late-api-parity')).toEqual(firstApiDecision);

      // Incoming connector bootstrap resolves through the same lifecycle gate.
      const incomingRoot = mkdtempSync(join(tmpdir(), 'direct-parity-incoming-'));
      roots.push(incomingRoot);
      writeAutonomousPending(incomingRoot, 'late-incoming-parity', '2026-08-21T10:00:00.000Z');
      let onMessage: ((message: IncomingMessage) => void) | undefined;
      const replies: string[] = [];
      const connector: IMessageConnector = {
        id: 'telegram', async start() {}, async stop() {},
        onMessage(handler) { onMessage = handler; },
        async sendMessage(message) { replies.push(message.text); },
      };
      const incomingHandle = await bootstrapConnectorCommands(incomingRoot, {
        telegram: { enabled: true, token: 'test-token', chat_id: 'ops' },
      }, {
        makeConnector: () => connector,
        approvalLifecycle: lifecycle,
        approvalNow: () => new Date('2026-08-21T10:00:01.500Z'),
      });
      onMessage?.({
        id: 'message-parity', connector: 'telegram', channelId: 'ops', fromUser: 'operator',
        text: 'approve late-incoming-parity', timestamp: new Date().toISOString(),
      });
      await vi.waitFor(() => {
        expect(existsSync(join(
          incomingRoot, '.deckent', 'autonomous', 'decisions.json',
        ))).toBe(true);
      });
      expect(readDecision(incomingRoot, 'late-incoming-parity')).toMatchObject({
        outcome: 'rejected', kind: 'timeout', replayAllowed: false,
      });
      expect(replies).toHaveLength(1);
      const firstIncomingDecision = readDecision(incomingRoot, 'late-incoming-parity');
      onMessage?.({
        id: 'message-parity-replay', connector: 'telegram', channelId: 'ops', fromUser: 'operator',
        text: 'approve late-incoming-parity', timestamp: new Date().toISOString(),
      });
      await vi.waitFor(() => expect(replies).toHaveLength(2));
      expect(readDecision(incomingRoot, 'late-incoming-parity')).toEqual(firstIncomingDecision);
      await incomingHandle.dispose();

      // Gateway pairing expiry is terminal deny: approve and reject retries
      // both preserve zero access grants.
      const gatewayHome = mkdtempSync(join(tmpdir(), 'direct-parity-gateway-'));
      roots.push(gatewayHome);
      process.env['DECKENT_GATEWAY_HOME'] = gatewayHome;
      const gateway = await loadGatewayAccess({
        clock: () => new Date('2026-01-01T00:00:00.000Z'),
        genCode: () => 'PARITY43',
        genPairingId: () => 'gwp-parity-43',
      });
      await gateway.requestPairing('telegram:parity', {
        tenantId: 'tenant-parity', projectPath: '/projects/parity', lifecycle,
        lifecycleGeneration: 'gateway-config:parity-43',
      });
      const gatewayOutput: string[] = [];
      await handleGatewayPairApprove({
        code: 'PARITY43', project: '/projects/parity', lang: 'en',
        print: line => gatewayOutput.push(line),
      });
      await handleGatewayPairReject({
        code: 'PARITY43', lang: 'en', print: line => gatewayOutput.push(line),
      });
      expect(gatewayOutput.join(' ')).toMatch(/expired|late|approvals\.(?:expired|late_decision)/iu);
      expect((await loadGatewayAccess()).isAuthorized('telegram:parity', '/projects/parity')).toBe(false);
    } finally {
      process.exitCode = 0;
      await api?.close();
      if (gatewayEnvBefore === undefined) delete process.env['DECKENT_GATEWAY_HOME'];
      else process.env['DECKENT_GATEWAY_HOME'] = gatewayEnvBefore;
      if (globalHomeBefore === undefined) delete process.env['DECKENT_HOME'];
      else process.env['DECKENT_HOME'] = globalHomeBefore;
      for (const root of roots) rmSync(root, { recursive: true, force: true });
    }
  });
});
