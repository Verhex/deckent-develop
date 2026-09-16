#!/usr/bin/env node
// ═══ DT-1 «Telsiz» gerçek-binary smoke (583 tasarım-turu) ═══════════════════
//
// Kanıtlanan zincir (gerçek dist-daemon, Electron'suz):
//   1. env-twin'SİZ daemon: /api/chat/stream → 403 (SURF-7 ratchet default-OFF
//      CANLI pinlenir — Telsiz'in adopt-daemon dürüst-bandının sebebi);
//   2. DECKENT_CONTROL_MUTATIONS=1 daemon (Desktop-spawn simülasyonu):
//      aynı istek → 200 SSE + ilk frame {type:'error', no-adapter} (tel + auth
//      + gate + dürüst-adapter-yok frame'i — Telsiz'in inline-hata satırı);
//   3. POST /api/chat (env-on) → 200 {reply} (fallback-probe yolu).
//
// Çalıştırma: node scripts/dt1-telsiz-smoke.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ` (${extra})` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startDaemon(env) {
  const root = mkdtempSync(join(tmpdir(), 'dt1-smoke-'));
  const port = 3000 + Math.floor(Math.random() * 2000);
  const child = spawn(process.execPath, [join(repoRoot, 'dist/cli/entry.js'), 'serve', '--port', String(port)], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env },
  });
  let log = '';
  child.stdout.on('data', (d) => { log += String(d); });
  child.stderr.on('data', (d) => { log += String(d); });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/status`); if (r.status) break; } catch { /* bekle */ }
    await sleep(250);
  }
  const apiToken = readFileSync(join(root, '.deckent', 'runtime', 'api-token'), 'utf-8').trim();
  return { root, port, child, apiToken, getLog: () => log };
}
async function stopDaemon(d) {
  try { d.child.kill('SIGTERM'); } catch { /* ölü */ }
  await sleep(300);
  try { d.child.kill('SIGKILL'); } catch { /* ölü */ }
  rmSync(d.root, { recursive: true, force: true });
}

// ── 1 · gate default-OFF: 403 ──
const off = await startDaemon({});
try {
  const res = await fetch(`http://127.0.0.1:${off.port}/api/chat/stream?message=hi&token=${off.apiToken}`);
  check('gate-OFF daemon: /api/chat/stream → 403 (ratchet canlı)', res.status === 403, `status=${res.status}`);
} finally { await stopDaemon(off); }

// ── 2+3 · env-twin ON (Desktop-spawn simülasyonu) ──
const on = await startDaemon({ DECKENT_CONTROL_MUTATIONS: '1' });
try {
  const res = await fetch(`http://127.0.0.1:${on.port}/api/chat/stream?message=hi&token=${on.apiToken}`);
  check('env-twin daemon: stream → 200 SSE', res.status === 200 && (res.headers.get('content-type') ?? '').includes('text/event-stream'), `status=${res.status}`);
  const reader = res.body.getReader();
  let buffer = '';
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline && !buffer.includes('data:')) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += new TextDecoder().decode(value);
  }
  const frameLine = buffer.split('\n').find((l) => l.startsWith('data:'));
  const frame = frameLine ? JSON.parse(frameLine.slice(5)) : null;
  // İki dürüst sonuç da sözleşmelidir: gerçek-adapter çözülen makinede ilk
  // frame CANLI model-cevabı chunk'ıdır (en güçlü kanıt — tel gerçek sohbet
  // taşıdı); adapter'sız taze makinede dürüst no-adapter error-frame'i gelir.
  const liveReply = frame?.type === 'chunk' && typeof frame.text === 'string';
  const honestNoAdapter = frame?.type === 'error' && String(frame.message).includes('no adapter configured');
  check('ilk SSE-frame sözleşmeli (canlı-chunk VEYA dürüst adapter-yok)', liveReply || honestNoAdapter, JSON.stringify(frame)?.slice(0, 120));
  if (liveReply) console.log(`  ↳ CANLI model-cevabı alındı: ${JSON.stringify(frame.text.slice(0, 60))}`);
  reader.cancel().catch(() => {});

  const post = await fetch(`http://127.0.0.1:${on.port}/api/chat`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${on.apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'hello' }),
  });
  check('POST /api/chat (fallback-probe) → 200 + reply', post.status === 200 && typeof (await post.json()).reply === 'string', `status=${post.status}`);
} finally { await stopDaemon(on); }

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
