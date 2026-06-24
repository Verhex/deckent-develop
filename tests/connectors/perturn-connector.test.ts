import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parkBotAction, takeBotAction } from '../../src/connectors/bot-action-store.js';

describe('bot-action approvalMessageId', () => {
  it('round-trips approvalMessageId through park/take', () => {
    const root = mkdtempSync(join(tmpdir(), 'park-'));
    const id = parkBotAction(root, { tool: 'send_mail', args: { to: 'a@x.com' }, channelId: 'c1', approvalMessageId: 'msg-42' });
    const got = takeBotAction(root, id);
    expect(got?.approvalMessageId).toBe('msg-42');
  });
});
