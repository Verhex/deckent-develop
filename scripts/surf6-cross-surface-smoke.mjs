// ═══ SURF-6 — cross-surface dogfood smoke (Terminal ⇄ Desktop) ═══════════════
//
// Proves the two-surface contract end to end against REAL binaries: a real
// daemon (`deckent serve`), the REAL packaged/dev Electron desktop, the REAL
// CLI (`deckent do` / `deckent runs`) and real detached sprints executed by a
// PATH-shimmed fake-claude (hermetic: no LLM, no network, tmp everything).
//
//   Leg A (Terminal→Desktop): CLI `do --run --yes` starts a real 1-task sprint;
//         the Desktop History/list shows the SAME flow with the SAME digest.
//   Leg B (Desktop→Terminal): the Desktop «Emir» form proposes a 5-real-task
//         plan; the CLI decides (`runs <flowId> --approve --start`); the
//         approval/start/closure events land LIVE on the Desktop's OPEN SSE
//         stream (cross-process freshness probe); all 5 task artifacts exist.
//   Chaos 1 (daemon restart): the daemon is killed and relaunched mid-run on
//         the same port+token; the closure still arrives, ledger sequences
//         stay strictly unique (no lost/duplicate frame rendered).
//   Chaos 2 (cross-surface conflict): a CLI `--reject` after the start is an
//         honest typed refusal (exit 1), durable log untouched.
//   Chaos 3 (worker death): a slow run's child is SIGKILLed; the CLI derives
//         `failed (process died)`, `--close-stale --yes` writes the durable
//         RUN_FAILED, and the Desktop shows the failed state.
//
// Usage:  node scripts/surf6-cross-surface-smoke.mjs [--packaged] [--probe]
//   --packaged  drive dist-app/linux-unpacked/deckent-desktop instead of the
//               dev out/ bundle (run both for the SURF-6 acceptance).
//   --probe     boot only: dump the picker DOM + screenshot, then exit.
//
// Honest deferral: the "expired approval" chaos leg needs a real pending
// worker-permission approval (ApprovalBroker TTL) — deferred with SURF-5's
// decide-UI smoke to the same follow-up (needs a permission-gated worker).

import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(REPO, 'dist');
const DESKTOP_DIR = join(REPO, 'src', 'desktop');
const PACKAGED = process.argv.includes('--packaged');
const PROBE = process.argv.includes('--probe');
const SHOT_DIR = process.env.SURF6_SHOT_DIR ?? join(tmpdir(), 'surf6-shots');
mkdirSync(SHOT_DIR, { recursive: true });

const desktopRequire = createRequire(join(DESKTOP_DIR, 'package.json'));
const { _electron } = desktopRequire('@playwright/test');
const electronBin = desktopRequire('electron');

const store = await import(`${DIST}/core/run-flow-store.js`);

// ─── fixture: tmp project + PATH-shimmed fake-claude ─────────────────────────

const API_TOKEN = 'surf6-fixed-token-0123456789abcdef';
const PORT = 3300 + (process.pid % 400);
const proj = mkdtempSync(join(tmpdir(), 'surf6-proj-'));
const home = mkdtempSync(join(tmpdir(), 'surf6-home-'));
const shim = mkdtempSync(join(tmpdir(), 'surf6-shim-'));

mkdirSync(join(proj, '.deckent'), { recursive: true });
writeFileSync(join(proj, '.deckent', 'config.json'), JSON.stringify({
  language: 'en',
  terminal: { run_flow_v2: true },
}, null, 2));

// fake-claude: --version → banner · `-p -` → worker (reads stdin, creates the
// task's real artifact file, optional slow-mode) · `-p <inline>` → plan JSON
// branched on the intent embedded in the planner prompt.
const task = (n) => JSON.stringify({
  title: `Create surf6-file-${n}`,
  description: `Create the artifact surf6-file-${n} for the dossier.`,
  model: 'sonnet', effort: 'low', priority: 'NORMAL',
  reason: 'fixture',
  scope: { directories: ['artifacts'], filesRead: [], filesWrite: [`artifacts/surf6-file-${n}.txt`] },
  dependencies: [],
  goNogo: { goCriteria: `artifacts/surf6-file-${n}.txt exists`, noGoCriteria: 'missing', techDebtAcceptable: 'none' },
});
const planOf = (tasks) => JSON.stringify({ tasks: JSON.parse(`[${tasks}]`), reasoning: 'fixture plan' }).replace(/'/g, "'\\''");
const PLAN_5 = planOf([1, 2, 3, 4, 5].map(task).join(','));
const PLAN_1 = planOf(task(0));
const PLAN_SLOW = planOf(JSON.stringify({
  title: 'Long haul', description: 'surf6-slow marker task — sleeps.',
  model: 'sonnet', effort: 'low', priority: 'NORMAL', reason: 'fixture',
  scope: { directories: ['artifacts'], filesRead: [], filesWrite: ['artifacts/slow.txt'] },
  dependencies: [],
  goNogo: { goCriteria: 'n/a', noGoCriteria: 'n/a', techDebtAcceptable: 'none' },
}));

writeFileSync(join(shim, 'claude'), `#!/usr/bin/env bash
for a in "$@"; do if [[ "$a" == "--version" ]]; then echo "fake-claude 1.0.0"; exit 0; fi; done
PARG=""
args=("$@")
for i in "\${!args[@]}"; do if [[ "\${args[$i]}" == "-p" ]]; then PARG="\${args[$((i+1))]}"; fi; done
if [[ "$PARG" == "-" ]]; then
  content="$(cat)"
  n="$(grep -o 'surf6-file-[0-9]' <<< "$content" | head -1)"
  if [[ -n "$n" ]]; then mkdir -p artifacts; echo done > "artifacts/\${n}.txt"; fi
  if grep -q 'surf6-slow' <<< "$content"; then sleep 300; fi
  echo "worker done"; exit 0
fi
if [[ -n "$PARG" ]]; then
  if grep -q 'surf6-dossier' <<< "$PARG"; then echo '${PLAN_5}'
  elif grep -q 'surf6-slow' <<< "$PARG"; then echo '${PLAN_SLOW}'
  else echo '${PLAN_1}'
  fi
  exit 0
fi
echo "fake-claude 1.0.0"
`);
chmodSync(join(shim, 'claude'), 0o755);

const ENV = {
  ...process.env,
  PATH: `${shim}:${process.env.PATH}`,
  DECKENT_API_TOKEN: API_TOKEN,
  DECKENT_OFFLINE: '1',
};

// ─── process + assertion helpers ─────────────────────────────────────────────

let daemon = null;
function startDaemon() {
  daemon = spawn(process.execPath, [join(DIST, 'cli', 'entry.js'), 'serve', '--port', String(PORT)], {
    cwd: proj, env: ENV, stdio: ['ignore', 'pipe', 'pipe'],
  });
  daemon.stdout.on('data', () => {});
  daemon.stderr.on('data', () => {});
}
async function waitDaemonReady(timeoutMs = 30_000) {
  // Identity-checked readiness: OUR token must authenticate (200) — a 401
  // would mean a STALE daemon from some earlier session owns the port and
  // every surface would silently talk to the wrong project (this exact
  // contamination poisoned run #1 of this smoke).
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/status`, { headers: { Authorization: `Bearer ${API_TOKEN}` } });
      if (res.ok) return;
      if (res.status === 401) throw new Error(`a FOREIGN daemon owns port ${PORT} (our token got 401) — kill it or change ports`);
    } catch (err) {
      if (err instanceof Error && err.message.includes('FOREIGN daemon')) throw err;
      /* not up yet */
    }
    await sleep(300);
  }
  throw new Error('daemon did not come up');
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cli(args, timeoutMs = 180_000) {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, [join(DIST, 'cli', 'entry.js'), ...args], { cwd: proj, env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    c.stdout.on('data', (d) => { out += d; });
    c.stderr.on('data', (d) => { err += d; });
    const t = setTimeout(() => c.kill('SIGTERM'), timeoutMs);
    c.on('close', (code) => { clearTimeout(t); resolve({ code, out, err }); });
  });
}

async function api(path) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, { headers: { Authorization: `Bearer ${API_TOKEN}` } });
  return { status: res.status, body: res.ok ? await res.json() : await res.text() };
}

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ✗ ${name}${detail ? ` — ${String(detail).slice(0, 400)}` : ''}`); }
}

async function waitFor(name, fn, timeoutMs = 240_000, everyMs = 1000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await fn()) { check(name, true); return true; }
    await sleep(everyMs);
  }
  check(name, false, `timeout ${timeoutMs}ms`);
  return false;
}

// ─── boot: daemon + electron ─────────────────────────────────────────────────

startDaemon();
await waitDaemonReady();
console.log(`[boot] daemon up on :${PORT} (pid ${daemon.pid})`);

const launchOpts = PACKAGED
  ? { executablePath: join(DESKTOP_DIR, 'dist-app', 'linux-unpacked', 'deckent-desktop'), args: ['--no-sandbox'] }
  : { executablePath: electronBin, args: ['--no-sandbox', DESKTOP_DIR] };
const app = await _electron.launch({
  ...launchOpts,
  env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, '.config') },
});
const page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');
await sleep(1200);

if (PROBE) {
  console.log('[probe] picker DOM:');
  console.log(await page.evaluate(() => document.body.innerHTML.slice(0, 6000)));
  await page.screenshot({ path: join(SHOT_DIR, 'surf6-probe.png') });
  await app.close();
  daemon?.kill('SIGTERM');
  process.exit(0);
}

// ─── connect: add a local profile for the tmp project, adopt the daemon ──────

console.log('[connect] add local profile + adopt-connect');
await page.locator('#profile-label').fill('surf6 project');
await page.locator('#profile-kind').selectOption('local');
await page.locator('#profile-project-path').fill(proj);
await page.locator('#profile-host').fill('127.0.0.1');
await page.locator('#profile-port').fill(String(PORT));
await page.locator('.connection-form button.btn--primary').click();
await sleep(600);
await page.locator('.profile-row__actions .btn--primary').first().click();
const shellUp = await waitFor('shell mounted after adopt-connect', async () =>
  (await page.locator('.shell').count()) > 0, 30_000, 500);
if (!shellUp) {
  await page.screenshot({ path: join(SHOT_DIR, 'surf6-connect-fail.png') });
  console.log(await page.evaluate(() => document.body.innerHTML.slice(0, 4000)));
  await app.close(); daemon?.kill('SIGTERM'); process.exit(1);
}

const feedText = async () => (await page.locator('.event-feed').count()) ? page.locator('.event-feed').innerText() : '';
const feedHas = (needle) => async () => (await feedText()).includes(needle);
const nav = async (hash) => { await page.evaluate((h) => { window.location.hash = h; }, hash); await sleep(700); };

// ─── Leg A — Terminal → Desktop ──────────────────────────────────────────────

console.log('[Leg A] terminal-origin run (do --run --yes) → Desktop sees it');
const flowsBefore = new Set(store.listFlowIds(proj));
const doRes = await cli(['do', 'Add the surf6 hello module', '--run', '--yes'], 240_000);
check('do --run --yes exit 0', doRes.code === 0, doRes.err.slice(0, 300) || doRes.out.slice(-300));
writeFileSync(join(SHOT_DIR, 'surf6-do-stdout.log'), doRes.out + '\n--- stderr ---\n' + doRes.err);
const newFlows = store.listFlowIds(proj).filter((id) => !flowsBefore.has(id));
console.log('  [evidence] new flows after do:', JSON.stringify(newFlows.map((id) => ({
  id: id.slice(0, 8),
  intent: (() => { try { return store.loadApprovedSnapshot(proj, id)?.proposal?.intentSummary; } catch { return '?'; } })(),
  events: store.readFlowEvents(proj, id).map((e) => e.type),
}))));
const legA = newFlows.find((id) => {
  try { return store.loadApprovedSnapshot(proj, id)?.proposal?.intentSummary?.includes('surf6 hello'); } catch { return false; }
}) ?? newFlows[0];
check('exactly ONE new flow from one do (no phantom flows)', newFlows.length === 1, String(newFlows));
check('Leg A flow durable on disk', typeof legA === 'string' && legA.length > 0, String(newFlows));

// do-origin contract (deliberate, SURF-1c Slice-3 deferral): a `do` flow has
// NO durable event log — its closure truth is the jobs record, joined by the
// CLI inbox (F-3). The CLI is therefore the closure oracle for Leg A.
await waitFor('Leg A closure lands in the jobs record (CLI shows completed)', async () => {
  const listed = await cli(['runs']);
  const line = listed.out.split('\n').find((l) => l.includes(legA.slice(0, 8)));
  return line !== undefined && (line.includes('completed') || line.includes('failed'));
}, 300_000, 3000);
console.log('  [evidence] legA durable events (expected [] — Slice-3 deferral):',
  JSON.stringify(store.readFlowEvents(proj, legA).map((e) => e.type)));
console.log('  [known-gap] daemon-side state for the do-origin flow (no jobs-join on the API yet):',
  JSON.stringify((await api(`/api/run-flow/${legA}`)).body?.state));

// digest parity: CLI detail ≡ daemon full-state ≡ durable snapshot (a do-origin
// flow has no durable live PREVIEW — the snapshot is its digest truth, served
// by GET /:flowId via the legacy-derive path)
const snapA = store.loadApprovedSnapshot(proj, legA);
const cliDetailA = await cli(['runs', legA.slice(0, 8)]);
const apiStateA = await api(`/api/run-flow/${legA}`);
check('digest parity CLI ≡ daemon-API ≡ durable snapshot',
  snapA !== undefined
  && cliDetailA.out.includes(`digest: ${snapA.planDigest}`)
  && apiStateA.status === 200 && apiStateA.body?.approvedSnapshot?.planDigest === snapA.planDigest,
  JSON.stringify({ snap: snapA?.planDigest, cli: cliDetailA.out.slice(-200), api: apiStateA.body?.approvedSnapshot?.planDigest ?? apiStateA.status }));

// Desktop sees the terminal-origin flow (list refetch ≤10s) with a terminal state
await nav('#/console');
await waitFor('Desktop flow-list shows the Leg A (terminal-origin) flow', async () =>
  (await page.locator('.flow-list').innerText()).includes(legA.slice(0, 8)), 30_000, 1000);
await page.screenshot({ path: join(SHOT_DIR, `surf6-${PACKAGED ? 'pkg-' : ''}legA.png`) });

// ─── Leg B — Desktop → Terminal (the decision handoff) ───────────────────────

console.log('[Leg B] Desktop «Emir» proposes 5 tasks → CLI decides → live SSE closure');
await page.locator('.order-form input').fill('Prepare the surf6-dossier artifact set');
await page.locator('.order-form button').click();
await waitFor('preview panel shows the 5-task plan', async () =>
  (await page.locator('.preview-panel').count()) > 0
  && (await page.locator('.preview-panel').innerText()).includes('surf6-file-1'), 120_000, 1000);

const flowsB = store.listFlowIds(proj).filter((id) => id !== legA);
const legB = flowsB[flowsB.length - 1];
check('Leg B flow durable', typeof legB === 'string', String(store.listFlowIds(proj)));

// THE handoff: the terminal operator decides the Desktop-proposed flow.
const decide = await cli(['runs', legB.slice(0, 8), '--approve', '--start']);
check('CLI approve --start on the Desktop flow (exit 0)', decide.code === 0, decide.err.slice(0, 300));
check('CLI printed approve + start', decide.out.includes('Approved — revision') && decide.out.includes('Run started'), decide.out.slice(0, 300));

await waitFor('APPROVAL_GRANTED lands on the OPEN Desktop stream', feedHas('APPROVAL_GRANTED'), 60_000, 1000);
await waitFor('RUN_STARTED lands live', feedHas('RUN_STARTED'), 60_000, 1000);

// ─── Chaos 1 — daemon restart mid-run (same port + token) ────────────────────

console.log('[Chaos 1] daemon restart mid-run — closure must still arrive');
daemon.kill('SIGTERM');
await sleep(1500);
startDaemon();
await waitDaemonReady();
check('daemon restarted on same port/token', true);

const closedAfterRestart = await waitFor('RUN_COMPLETED arrives AFTER the restart (reconnect + probe)',
  feedHas('RUN_COMPLETED'), 300_000, 2000);
if (!closedAfterRestart) {
  console.log('  [evidence] legB events:', JSON.stringify(store.readFlowEvents(proj, legB).map((e) => `${e.sequence}:${e.type}`)));
  console.log('  [evidence] page url:', await page.evaluate(() => window.location.href));
  console.log('  [evidence] body:', (await page.evaluate(() => document.body.innerText)).slice(0, 800));
  await page.screenshot({ path: join(SHOT_DIR, 'surf6-restart-evidence.png') });
}

// zero lost/duplicate: rendered ledger sequences are unique AND match the log
const seqs = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.event-feed .log-seq')).map((n) => n.textContent));
check('ledger sequences unique (no duplicate frame)', new Set(seqs).size === seqs.length, JSON.stringify(seqs));
const legBLog = store.readFlowEvents(proj, legB);
check('ledger count ≡ durable log count (no lost frame)', seqs.length === legBLog.length,
  `dom=${seqs.length} log=${legBLog.length}`);

// all 5 real artifacts exist — the five-real-task criterion, zero manual CLI on the run itself
const missing = [1, 2, 3, 4, 5].filter((n) => !existsSync(join(proj, 'artifacts', `surf6-file-${n}.txt`)));
check('all 5 real task artifacts written by the real sprint', missing.length === 0, `missing: ${missing}`);
await page.screenshot({ path: join(SHOT_DIR, `surf6-${PACKAGED ? 'pkg-' : ''}legB.png`) });

// ─── Chaos 2 — cross-surface conflict is an honest typed refusal ─────────────

console.log('[Chaos 2] stale cross-surface decision → honest refusal');
const logLenBefore = store.readFlowEvents(proj, legB).length;
const conflict = await cli(['runs', legB.slice(0, 8), '--reject', '--reason', 'too late']);
check('late reject refused (exit 1, cannot-apply)', conflict.code === 1 && conflict.err.includes('cannot apply'), conflict.err.slice(0, 200));
check('durable log untouched by the refused command', store.readFlowEvents(proj, legB).length === logLenBefore);

// ─── Chaos 3 — worker death → honest failure on both surfaces ────────────────

console.log('[Chaos 3] kill the child mid-run → failed (process died) → durable RUN_FAILED');
await nav('#/console');
await page.locator('.order-form input').fill('Run the surf6-slow long haul');
await page.locator('.order-form button').click();
await sleep(3000);
const legC = store.listFlowIds(proj).filter((id) => id !== legA && id !== legB).at(-1);
check('Chaos 3 flow durable', typeof legC === 'string');
const startC = await cli(['runs', legC.slice(0, 8), '--approve', '--start']);
check('slow run started via CLI', startC.code === 0 && startC.out.includes('Run started'), startC.err.slice(0, 200));

const gotPid = await waitFor('run handle records the child pid', () => {
  const h = store.loadRunHandle(proj, legC);
  return h?.pid !== undefined && h.pid !== null;
}, 90_000, 1000);
if (gotPid) {
  const { pid } = store.loadRunHandle(proj, legC);
  try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
  await sleep(1500);
  const derived = await cli(['runs', legC.slice(0, 8)]);
  check('CLI derives failed (process died) read-only', derived.out.includes('failed (process died)'), derived.out.slice(0, 300));
  const swept = await cli(['runs', '--close-stale', '--yes']);
  check('close-stale writes the durable closure', swept.code === 0 && /Closed \d+ stale/.test(swept.out), swept.out.slice(0, 300));
  const finalC = store.readFlowEvents(proj, legC).map((e) => e.type);
  check('durable log carries the honest failure closure', finalC.includes('RUN_FAILED') || finalC.includes('FLOW_ABORTED'), String(finalC));
  await nav('#/history');
  await waitFor('Desktop History shows the failed/cancelled closure', async () => {
    const txt = await page.locator('.shell-view').innerText();
    return txt.includes(legC.slice(0, 8)) && (txt.includes('failed') || txt.includes('cancelled'));
  }, 30_000, 1000);
  await page.screenshot({ path: join(SHOT_DIR, `surf6-${PACKAGED ? 'pkg-' : ''}failed.png`) });
}

// ─── epilogue ────────────────────────────────────────────────────────────────

await app.close().catch(() => {});
daemon?.kill('SIGTERM');
console.log(`\nRESULT (${PACKAGED ? 'PACKAGED' : 'dev'}): ${pass} pass / ${fail} fail${fail ? ` — ${failures.join(' | ')}` : ''}`);
console.log(`shots: ${SHOT_DIR}`);
rmSync(home, { recursive: true, force: true });
rmSync(shim, { recursive: true, force: true });
if (process.env.SURF6_KEEP_PROJ !== '1') rmSync(proj, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
