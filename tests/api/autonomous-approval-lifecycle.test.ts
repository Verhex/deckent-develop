import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { call, startTestServer, type TestServerHandle } from './test-server-helper.js';

describe('autonomous API lifecycle parity', () => {
  let handle: TestServerHandle | undefined;

  afterEach(async () => {
    await handle?.close();
    handle = undefined;
  });

  it('returns typed 409 and cannot allow an expired autonomous request', async () => {
    handle = await startTestServer({
      disableAuth: true,
      seed: {
        config: {
          approval: {
            lifecycle: {
              enabled: true,
              profiles: {
                'autonomous-trigger': {
                  ttlMs: 1_000,
                  slaMs: [100, 200, 500],
                },
              },
            },
          },
        },
      },
    });
    const dir = join(handle.projectRoot, '.deckent', 'autonomous');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'pending.json'), JSON.stringify([{
      triggerId: 'late-api',
      action: 'autonomous.execute',
      requestedBy: 'legacy',
      // Five seconds old: expired only under the injected 1s policy, still
      // fresh under the adapter's 1h compatibility profile.
      enqueuedAt: new Date(Date.now() - 5_000).toISOString(),
    }]));

    const response = await call(handle, '/api/autonomous/approve/late-api', { method: 'POST' });
    expect(response.status).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'APR_APPROVAL_CLOSED',
      reasonCode: 'expired',
      triggerId: 'late-api',
    });
  });

  it('threads strict tenant authority and refuses a tenant-less API caller', async () => {
    handle = await startTestServer({
      disableAuth: true,
      seed: { config: { strict_tenant_isolation: true } },
    });
    const response = await call(handle, '/api/autonomous/pending');
    expect(response.status).toBe(403);
    expect(response.json()).toMatchObject({ code: 'TENANT_SCOPE_UNRESOLVED' });
  });
});
