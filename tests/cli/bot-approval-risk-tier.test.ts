import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { setupBotApprovalRelay } from '../../src/cli/commands/bot.js';
import { ApprovalBroker } from '../../src/core/approval-broker.js';
import { shortCodeFor } from '../../src/core/approval-short-code.js';
import type { ApprovalAuthorityRuntimeOpenResult } from '../../src/core/approval-authority-runtime.js';
import type { DeckentConfig } from '../../src/core/types.js';

describe('bot approval effective riskTier', () => {
  it('rejects a high+critical request before channel authentication', async () => {
    const root = mkdtempSync(join(tmpdir(), 'bot-approval-tier-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    const broker = new ApprovalBroker(root);
    const pending = broker.submit({
      id: 'bot-critical-tier-1', requester: { role: 'worker', instanceId: 'w1' },
      summary: 'bounded action', details: {}, scopeId: 'project', scope: 'shell-exec', risk: 'high',
      policy: 'require-approval', defaultAction: 'deny', tenantId: 'main', userId: 'owner',
      createdAt: new Date(Date.now() - 1_000).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    vi.spyOn(broker, 'getRequest').mockReturnValue({ ...pending, riskTier: 'critical' } as never);
    const decideChannel = vi.fn();
    const opened = {
      state: 'ready', authorityEvidenceRef: 'test',
      service: { broker, decideChannel, close: vi.fn() },
    } as unknown as ApprovalAuthorityRuntimeOpenResult;
    const config = {
      approval: { relay_enabled: true, authority: { enabled: true, tenant_id: 'main' } },
    } as unknown as DeckentConfig;
    const handle = setupBotApprovalRelay({
      root, config, lang: 'en', print: vi.fn(), openRuntime: () => opened,
    });
    expect(handle).not.toBeNull();

    const reply = await handle!.brkDecider({
      version: 'dk1', ns: 'brk', action: 'approve', shortCode: shortCodeFor(pending.id), nonce: '0123abcd',
    }, {
      connector: 'telegram', fromUser: 'owner', channelId: 'chat',
      resolvePrincipal: () => ({
        userId: 'owner', role: 'owner', permissions: [], tenantId: 'main', verified: true, source: 'test',
      }),
      isAuthorized: () => true,
    });

    expect(reply).toContain('Decide via CLI');
    expect(decideChannel).not.toHaveBeenCalled();
    handle!.dispose();
  });
});
