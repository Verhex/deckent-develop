// ═══ SURF-7 — authority-cutover real-binary smoke ════════════════════════════
//
// Boots the REAL daemon (`deckent serve`) with the built dashboard and proves
// the cutover contract end to end:
//   1. Monitoring stays alive: GET /api/status + the served dashboard = 200.
//   2. Every former control endpoint answers the honest 403 (flag absent):
//      start/plan/kill/cleanup/config/directives/chat(+stream GET)/nervous/
//      autonomous — and the refusal names the terminal equivalents.
//   3. The served dashboard bundle carries ZERO mutation-control markers
//      (kill-all-btn / cleanup-btn / NewSprintModal) and DOES carry the
//      readonly-notice component + hints.
//   4. Emergency rollback clause: with api.control_mutations=true in config,
//      a gated endpoint passes through (non-403).
//
// Usage: node scripts/surf7-readonly-smoke.mjs

import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(REPO, 'dist');
const PORT = 3900 + (process.pid % 90);
const API_TOKEN = 'surf7-smoke-token-0123456789abcdef';

const proj = mkdtempSync(join(tmpdir(), 'surf7-proj-'));
mkdirSync(join(proj, '.deckent'), { recursive: true });
writeFileSync(join(proj, '.deckent', 'config.json'), JSON.stringify({ language: 'en' }));

const ENV = { ...process.env, DECKENT_API_TOKEN: API_TOKEN };
delete ENV.DECKENT_CONTROL_MUTATIONS; // the shipped default must hold

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${String(detail).slice(0, 300)}` : ''}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startDaemon() {
  const d = spawn(process.execPath, [join(DIST, 'cli', 'entry.js'), 'serve', '--port', String(PORT)], {
    cwd: proj, env: ENV, stdio: ['ignore', 'ignore', 'ignore'],
  });
  return d;
}
async function waitReady() {
  const until = Date.now() + 30_000;
  while (Date.now() < until) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/status`, { headers: { Authorization: `Bearer ${API_TOKEN}` } });
      if (res.ok) return true;
      if (res.status === 401) throw new Error(`FOREIGN daemon on :${PORT}`);
    } catch (e) { if (String(e).includes('FOREIGN')) throw e; }
    await sleep(300);
  }
  return false;
}
const call = (path, method = 'GET', body) => fetch(`http://127.0.0.1:${PORT}${path}`, {
  method,
  headers: { Authorization: `Bearer ${API_TOKEN}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});

let daemon = startDaemon();
check('daemon up (monitoring alive)', await waitReady());

console.log('[1] monitoring surfaces stay 200');
check('GET /api/status 200', (await call('/api/status')).status === 200);
check('GET /api/config 200 (read view feed)', (await call('/api/config')).status === 200);
const dashRes = await fetch(`http://127.0.0.1:${PORT}/`);
check('served dashboard HTML 200', dashRes.status === 200);

console.log('[2] every former control endpoint answers the honest 403');
const GATED = [
  ['POST', '/api/start'], ['POST', '/api/plan'], ['POST', '/api/cleanup'],
  ['POST', '/api/kill/all'], ['POST', '/api/kill/worker-1'],
  ['POST', '/api/set-directives'], ['POST', '/api/directives'], ['POST', '/api/config'],
  ['POST', '/api/chat'], ['GET', '/api/chat/stream?message=hi'],
  ['POST', '/api/nervous/accept/x'], ['POST', '/api/nervous/reject/x'],
  ['POST', '/api/nervous/recommendations/dismiss/x'],
  ['POST', '/api/autonomous/approve/x'], ['POST', '/api/autonomous/reject/x'],
];
for (const [method, path] of GATED) {
  const res = await call(path, method, method === 'POST' ? {} : undefined);
  const body = await res.text();
  check(`${method} ${path} → 403 + terminal pointer`,
    res.status === 403 && body.includes('deckent') && body.includes('api.control_mutations'),
    `status=${res.status} body=${body.slice(0, 120)}`);
}

console.log('[3] served bundle carries zero mutation markers + the notice');
const assetsDir = join(REPO, 'dist', 'dashboard', 'assets');
const bundle = readdirSync(assetsDir).filter((f) => f.endsWith('.js'))
  .map((f) => readFileSync(join(assetsDir, f), 'utf-8')).join('\n');
for (const marker of ['kill-all-btn', 'cleanup-btn', 'NewSprintModal', 'directives-save-btn']) {
  check(`bundle has NO ${marker}`, !bundle.includes(marker));
}
for (const marker of ['readonly-notice', 'deckent.dashboard.lang']) {
  check(`bundle carries ${marker}`, bundle.includes(marker));
}

console.log('[4] emergency rollback clause (flag on → pass-through)');
daemon.kill('SIGTERM');
await sleep(1200);
writeFileSync(join(proj, '.deckent', 'config.json'), JSON.stringify({ language: 'en', api: { control_mutations: true } }));
daemon = startDaemon();
check('daemon restarted with flag on', await waitReady());
const open = await call('/api/cleanup', 'POST', {});
check('POST /api/cleanup passes through (non-403)', open.status !== 403, `status=${open.status}`);

daemon.kill('SIGTERM');
console.log(`\nRESULT: ${pass} pass / ${fail} fail`);
rmSync(proj, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
