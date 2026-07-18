// ═══ /api/git/* — A1 «Changes» (KABUL Gün-1; N4-servisin HTTP-yüzü) ═════════
//
// Real git in the served project-root, real HTTP. The SURF-7 line holds:
// status/diff/proposal are monitoring READS (never gated); commit is a
// control MUTATION (gated + the human seal semantics of `runs --commit`).
// The suite-wide setup file keeps DECKENT_CONTROL_MUTATIONS=1; the gate pin
// deletes it to pin the default-off refusal (ratchet-spec pattern).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createHttpServer, type HttpApi } from '../../src/api/server.js';

function gitRun(cwd: string, args: string[]): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
    let stdout = '';
    child.stdout.on('data', (d: Buffer) => { stdout += String(d); });
    child.on('error', () => resolve({ code: -1, stdout }));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout }));
  });
}

async function initRepo(dir: string): Promise<void> {
  expect((await gitRun(dir, ['init', '--quiet', '-b', 'main'])).code).toBe(0);
  await gitRun(dir, ['config', '--local', 'core.hooksPath', '/dev/null']);
  await gitRun(dir, ['config', '--local', 'commit.gpgsign', 'false']);
  await gitRun(dir, ['config', '--local', 'user.name', 'test']);
  await gitRun(dir, ['config', '--local', 'user.email', 'test@example.com']);
  writeFileSync(join(dir, '.gitignore'), '.deckent/\n.tasks/\n.brain/\n', 'utf-8');
  writeFileSync(join(dir, 'base.txt'), 'baseline\n', 'utf-8');
  await gitRun(dir, ['add', '-A']);
  expect((await gitRun(dir, ['commit', '--quiet', '--no-gpg-sign', '-m', 'baseline'])).code).toBe(0);
}

let root: string;
let api: HttpApi | undefined;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'deckent-git-routes-'));
  await initRepo(root);
});

afterEach(async () => {
  process.env['DECKENT_CONTROL_MUTATIONS'] = '1'; // restore the suite default
  if (api) { await api.close(); api = undefined; }
  rmSync(root, { recursive: true, force: true });
});

async function base(): Promise<{ url: string; headers: Record<string, string> }> {
  api = createHttpServer(root, { port: 0, autoGenerateToken: true });
  if (!api.server.listening) {
    await new Promise<void>((resolve, reject) => {
      api!.server.once('listening', () => resolve());
      api!.server.once('error', reject);
    });
  }
  const addr = api.server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no address');
  return {
    url: `http://127.0.0.1:${addr.port}`,
    headers: { Authorization: `Bearer ${api.apiToken!}`, 'Content-Type': 'application/json' },
  };
}

describe('/api/git/* — the Changes view contract', () => {
  it('GET status → branch + entries; GET diff → the pending hunk (monitoring reads)', async () => {
    const { url, headers } = await base();
    writeFileSync(join(root, 'base.txt'), 'baseline\nplus\n', 'utf-8');

    const status = await (await fetch(`${url}/api/git/status`, { headers })).json() as { branch?: string; clean?: boolean };
    expect(status.branch).toBe('main');
    expect(status.clean).toBe(false);

    const diff = await (await fetch(`${url}/api/git/diff`, { headers })).json() as { text?: string };
    expect(diff.text).toContain('+plus');
  });

  it('GET proposal → clean-note on a clean tree; files + suggested message with a change (+flowId intent)', async () => {
    const { url, headers } = await base();
    const clean = await (await fetch(`${url}/api/git/proposal`, { headers })).json() as { note?: string };
    expect(clean.note).toBe('clean');

    writeFileSync(join(root, 'feat.ts'), 'export const f = 1;\n', 'utf-8');
    const proposal = await (await fetch(`${url}/api/git/proposal?flowId=flow-9&intent=add%20auth`, { headers })).json() as {
      files: Array<{ path: string }>; suggestedMessage: string;
    };
    expect(proposal.files.some((f) => f.path === 'feat.ts')).toBe(true);
    expect(proposal.suggestedMessage).toBe('add auth\n\ndeckent-run: flow-9');
  });

  it('POST commit {message} → REAL commit lands (stage-all + seal, runs--commit semantics)', async () => {
    const { url, headers } = await base();
    writeFileSync(join(root, 'sealed.ts'), 'export const s = 1;\n', 'utf-8');

    const res = await fetch(`${url}/api/git/commit`, {
      method: 'POST', headers, body: JSON.stringify({ message: 'feat: sealed from desktop' }),
    });
    expect(res.status).toBe(200);
    const outcome = await res.json() as { ok: boolean; sha: string | null; staged: number };
    expect(outcome.ok).toBe(true);
    expect(outcome.staged).toBe(1);
    expect(outcome.sha).toMatch(/^[0-9a-f]{7,}/);
    const subject = await gitRun(root, ['log', '-n1', '--pretty=%s']);
    expect(subject.stdout.trim()).toBe('feat: sealed from desktop');
  });

  it('empty message → 400; clean-tree commit → honest 500 with git\'s own error', async () => {
    const { url, headers } = await base();
    const empty = await fetch(`${url}/api/git/commit`, {
      method: 'POST', headers, body: JSON.stringify({ message: '   ' }),
    });
    expect(empty.status).toBe(400);
    const nothing = await fetch(`${url}/api/git/commit`, {
      method: 'POST', headers, body: JSON.stringify({ message: 'nothing staged' }),
    });
    expect(nothing.status).toBe(500);
  });

  it('RATCHET: with the flag off, POST commit answers the honest 403 — the GETs stay open (SURF-7 rule)', async () => {
    delete process.env['DECKENT_CONTROL_MUTATIONS'];
    const { url, headers } = await base();
    writeFileSync(join(root, 'x.ts'), 'x\n', 'utf-8');

    const commit = await fetch(`${url}/api/git/commit`, {
      method: 'POST', headers, body: JSON.stringify({ message: 'should be refused' }),
    });
    expect(commit.status).toBe(403);
    const subject = await gitRun(root, ['log', '-n1', '--pretty=%s']);
    expect(subject.stdout.trim()).toBe('baseline'); // nothing was sealed

    expect((await fetch(`${url}/api/git/status`, { headers })).status).toBe(200);
    expect((await fetch(`${url}/api/git/proposal`, { headers })).status).toBe(200);
  });
});
