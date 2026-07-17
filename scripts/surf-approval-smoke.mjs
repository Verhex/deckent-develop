// ═══ SURF-5/6 kuyruk-E — approval decide-UI + expiry real-binary smoke ═══════
//
// Closes the twice-deferred approval legs with REAL machinery end to end:
//   * a REAL pending ApprovalRequest enters the store via ApprovalBroker.submit
//     from a FOREIGN process (this script) — the daemon sees it cross-process
//     (GET /api/approvals is a fresh store read),
//   * the PACKAGED Desktop's Approval view renders the pending order-cards and
//     — with `approval.api_decide: true` — the Allow pull decides it through
//     POST /api/approvals/:id/decision (the SURF-5 deferred decide-UI leg),
//   * a short-TTL request expires via the daemon's ApprovalExpiryDriver sweep
//     (`approval.expiry_sweep_ms`) — the SURF-6 deferred expired-approval
//     chaos leg: pending → swept-expired, visible on both surfaces.
//
// Usage: node scripts/surf-approval-smoke.mjs

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(REPO, 'dist');
const DESKTOP_DIR = join(REPO, 'src', 'desktop');
const SHOT = process.env.SURF_APPROVAL_SHOT_DIR ?? join(tmpdir(), 'surf-approval-shots');
mkdirSync(SHOT, { recursive: true });
const PORT = 4100 + (process.pid % 90);
const API_TOKEN = 'surf-approval-token-0123456789abcdef';

const desktopRequire = createRequire(join(DESKTOP_DIR, 'package.json'));
const { _electron } = desktopRequire('@playwright/test');

const proj = mkdtempSync(join(tmpdir(), 'surf-approval-proj-'));
const home = mkdtempSync(join(tmpdir(), 'surf-approval-home-'));
mkdirSync(join(proj, '.deckent'), { recursive: true });
writeFileSync(join(proj, '.deckent', 'config.json'), JSON.stringify({
  language: 'en',
  terminal: { run_flow_v2: true },
  approval: { api_decide: true, expiry_sweep_ms: 5000 },
}, null, 2));

const ENV = { ...process.env, DECKENT_API_TOKEN: API_TOKEN };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${String(detail).slice(0, 300)}` : ''}`); }
};
async function waitFor(name, fn, timeoutMs = 120_000, everyMs = 1500) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await fn()) { check(name, true); return true; }
    await sleep(everyMs);
  }
  check(name, false, `timeout ${timeoutMs}ms`);
  return false;
}
const api = async (path) => {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, { headers: { Authorization: `Bearer ${API_TOKEN}` } });
  return { status: res.status, body: res.ok ? await res.json() : await res.text() };
};

// ─── boot daemon ─────────────────────────────────────────────────────────────
const daemon = spawn(process.execPath, [join(DIST, 'cli', 'entry.js'), 'serve', '--port', String(PORT)], {
  cwd: proj, env: ENV, stdio: ['ignore', 'ignore', 'ignore'],
});
{
  const until = Date.now() + 30_000;
  let up = false;
  while (Date.now() < until) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/status`, { headers: { Authorization: `Bearer ${API_TOKEN}` } });
      if (res.ok) { up = true; break; }
      if (res.status === 401) throw new Error(`FOREIGN daemon on :${PORT}`);
    } catch (e) { if (String(e).includes('FOREIGN')) throw e; }
    await sleep(300);
  }
  check('daemon up', up);
}

// ─── submit two REAL pending requests from THIS (foreign) process ────────────
const { ApprovalBroker } = await import(`${DIST}/core/approval-broker.js`);
const submitBroker = new ApprovalBroker(proj);
const now = Date.now();
const baseReq = (id, summary, expiresAt) => ({
  id,
  requester: { role: 'worker', instanceId: 'smoke-worker-1' },
  summary,
  details: { command: 'rm -rf build/', reason: 'approval-smoke fixture' },
  scopeId: 'sprint-smoke',
  scope: 'shell-exec',
  risk: 'high',
  policy: 'require-approval',
  defaultAction: 'deny',
  tenantId: 'local',
  userId: 'operator',
  createdAt: new Date(now).toISOString(),
  expiresAt,
});
submitBroker.submit(baseReq('apr-decide-1', 'Worker asks: run the build cleanup command', new Date(now + 10 * 60_000).toISOString()));
submitBroker.submit(baseReq('apr-expire-1', 'Worker asks: touch a protected path (will expire)', new Date(now + 20_000).toISOString()));
console.log('[submit] 2 gerçek pending request (foreign process) yazıldı');

await waitFor('daemon sees both pending cross-process (GET /api/approvals)', async () => {
  const { body } = await api('/api/approvals');
  const ids = JSON.stringify(body);
  return ids.includes('apr-decide-1') && ids.includes('apr-expire-1');
}, 30_000, 1000);

// ─── packaged Desktop: Approval view renders + Allow decides ─────────────────
const app = await _electron.launch({
  executablePath: join(DESKTOP_DIR, 'dist-app', 'linux-unpacked', 'deckent-desktop'),
  args: ['--no-sandbox'],
  env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, '.config') },
});
const page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');
await sleep(1200);
await page.locator('#profile-label').fill('approval smoke');
await page.locator('#profile-kind').selectOption('local');
await page.locator('#profile-project-path').fill(proj);
await page.locator('#profile-host').fill('127.0.0.1');
await page.locator('#profile-port').fill(String(PORT));
await page.locator('.connection-form button.btn--primary').click();
await sleep(600);
await page.locator('.profile-row__actions .btn--primary').first().click();
await waitFor('shell mounted', async () => (await page.locator('.shell').count()) > 0, 30_000, 500);
await page.evaluate(() => { window.location.hash = '#/approval'; });

await waitFor('Approval view shows BOTH pending order-cards', async () =>
  (await page.locator('.order-card').count()) >= 2, 30_000, 1000);
await page.screenshot({ path: join(SHOT, 'approval-pending.png') });

// Allow the long-TTL request via the UI (flag-on decide — the deferred leg)
const decideCard = page.locator('.order-card', { hasText: 'build cleanup' });
await decideCard.locator('.order-actions .tg--slow').click();
await waitFor('Allow decided it durably (approved category via API)', async () => {
  const { body } = await api('/api/approvals');
  return JSON.stringify(body.approved ?? '').includes('apr-decide-1');
}, 30_000, 1000);

// ─── expiry chaos leg: the short-TTL request is swept, honestly ──────────────
await waitFor('short-TTL request leaves pending and lands in expired (driver sweep)', async () => {
  const { body } = await api('/api/approvals');
  const pending = JSON.stringify(body.pending ?? '');
  const expired = JSON.stringify(body.expired ?? '');
  return !pending.includes('apr-expire-1') && expired.includes('apr-expire-1');
}, 90_000, 3000);

await waitFor('Desktop pending list drains to zero cards', async () =>
  (await page.locator('.order-card').count()) === 0, 30_000, 1000);
await page.screenshot({ path: join(SHOT, 'approval-after.png') });

await app.close().catch(() => {});
daemon.kill('SIGTERM');
console.log(`\nRESULT: ${pass} pass / ${fail} fail`);
console.log('shots:', SHOT);
rmSync(home, { recursive: true, force: true });
rmSync(proj, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
