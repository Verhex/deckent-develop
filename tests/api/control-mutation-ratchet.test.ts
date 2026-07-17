// ═══ SURF-7 — orchestration-control mutation ratchet pins (ADR-G-033) ════════
//
// The authority-cutover contract: with `api.control_mutations` ABSENT (the
// shipped default), every former dashboard control endpoint answers an honest
// 403 pointing at the terminal/Desktop equivalents + the emergency re-enable
// key — while monitoring GETs stay untouched. With the flag true, requests
// pass through to their normal handlers (the emergency-rollback clause).
//
// NOTE: the suite opens the gate globally via DECKENT_CONTROL_MUTATIONS=1
// (tests/setup-control-mutations.ts) so endpoint-behavior specs keep testing
// their handlers; THIS spec deletes that env var to pin the real shipped
// default-OFF posture, and restores it afterwards.

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestServer, type TestServerHandle } from './test-server-helper.js';
import { isGatedControlMutation, CONTROL_MUTATION_DISABLED_MESSAGE } from '../../src/api/server.js';

let handle: TestServerHandle | null = null;
let envBefore: string | undefined;

beforeEach(() => {
  envBefore = process.env['DECKENT_CONTROL_MUTATIONS'];
  delete process.env['DECKENT_CONTROL_MUTATIONS'];
});

afterEach(async () => {
  if (envBefore !== undefined) process.env['DECKENT_CONTROL_MUTATIONS'] = envBefore;
  if (handle) {
    await handle.close();
    handle = null;
  }
});

/** The shipped default: a config WITHOUT any `api` block. */
function stripFlag(projectRoot: string): void {
  writeFileSync(join(projectRoot, '.deckent', 'config.json'), JSON.stringify({ language: 'en' }), 'utf-8');
}

describe('isGatedControlMutation — the governed set (pure)', () => {
  it('governs every former dashboard control endpoint, including the GET-that-writes chat stream', () => {
    for (const [method, url] of [
      ['POST', '/api/start'], ['POST', '/api/plan'], ['POST', '/api/cleanup'],
      ['POST', '/api/set-directives'], ['POST', '/api/directives'],
      ['POST', '/api/config'], ['POST', '/api/chat'],
      ['POST', '/api/kill/all'], ['POST', '/api/kill/worker-7'],
      ['POST', '/api/nervous/accept/id1'], ['POST', '/api/nervous/reject/id1'],
      ['POST', '/api/nervous/recommendations/dismiss/id1'],
      ['POST', '/api/autonomous/approve/t1'], ['POST', '/api/autonomous/reject/t1'],
      ['GET', '/api/chat/stream'], ['GET', '/api/chat/stream?message=hi'],
    ] as const) {
      expect(isGatedControlMutation(method, url), `${method} ${url}`).toBe(true);
    }
  });

  it('NEVER governs monitoring reads, run-flow, enterprise, auth or the VS Code rpc', () => {
    for (const [method, url] of [
      ['GET', '/api/status'], ['GET', '/api/config'], ['GET', '/api/directives'],
      ['GET', '/api/events'], ['GET', '/api/history'], ['GET', '/api/nervous/status'],
      ['POST', '/api/run-flow/propose'], ['POST', '/api/run-flow/f1/decision'],
      ['POST', '/api/enterprise/tenants'], ['POST', '/api/auth/oidc/exchange'],
      ['POST', '/api/rpc'], ['POST', '/api/approvals/a1/decision'],
      ['DELETE', '/api/enterprise/tenants/t1'],
    ] as const) {
      expect(isGatedControlMutation(method, url), `${method} ${url}`).toBe(false);
    }
  });
});

describe('control-mutation ratchet — default OFF (E2E real server)', () => {
  it('POST /api/start|kill/all|cleanup and GET /api/chat/stream answer the honest 403; monitoring GET stays 200', async () => {
    handle = await startTestServer({ disableAuth: true });
    stripFlag(handle.projectRoot);

    for (const [method, path] of [
      ['POST', '/api/start'], ['POST', '/api/kill/all'], ['POST', '/api/cleanup'],
      ['POST', '/api/config'], ['POST', '/api/directives'], ['GET', '/api/chat/stream?message=hi'],
    ] as const) {
      const res = await fetch(`${handle.baseUrl}${path}`, {
        method,
        ...(method === 'POST' ? { headers: { 'Content-Type': 'application/json' }, body: '{}' } : {}),
      });
      expect(res.status, `${method} ${path}`).toBe(403);
      const body = (await res.json()) as { error?: string };
      expect(body.error, `${method} ${path}`).toBe(CONTROL_MUTATION_DISABLED_MESSAGE);
    }

    const monitoring = await fetch(`${handle.baseUrl}/api/config`);
    expect(monitoring.status).toBe(200);
  });

  it('the refusal names the equivalent surfaces and the emergency key (deep-link v1)', () => {
    expect(CONTROL_MUTATION_DISABLED_MESSAGE).toContain('deckent runs <n> --approve');
    expect(CONTROL_MUTATION_DISABLED_MESSAGE).toContain('api.control_mutations');
    expect(CONTROL_MUTATION_DISABLED_MESSAGE).toContain('ADR-G-033');
  });
});

describe('control-mutation ratchet — emergency flag ON (rollback clause)', () => {
  it('with api.control_mutations: true in config the request reaches its normal handler (no 403)', async () => {
    handle = await startTestServer({
      disableAuth: true,
      seed: { config: { language: 'en', api: { control_mutations: true } } },
    });
    const res = await fetch(`${handle.baseUrl}/api/cleanup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).not.toBe(403);
  });
});
