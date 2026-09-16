#!/usr/bin/env node
// ═══ 583/N3 «Makine Dairesi» — gerçek-binary smoke ══════════════════════════
//
// Kanıtlanan zincir (Electron'suz, gerçek daemon + gerçek PTY):
//   1. dist `deckent serve` tmp-projede ayağa kalkar (terminal localhost'ta
//      default-AÇIK, serve.ts:84);
//   2. Desktop'ın yolu birebir: API-bearer ile GET /api/terminal/token
//      (ADR-G-029 inv#2b) → terminal-token;
//   3. inv#1 negatif: Bearer'sız → 401 (bypass-bağımsız fail-CLOSED);
//   4. terminal-bearer ile POST /api/terminal/sessions (kind=shell) → GERÇEK
//      @lydell/node-pty shell;
//   5. WS `Sec-WebSocket-Protocol: deckent.<token>` → attach → `echo …`
//      yazılır → output-frame'lerde yankı doğrulanır (Desktop frame-kodek
//      kontratının canlı-teli);
//   6. DELETE ile oturum kapatılır, daemon SIGTERM'le söndürülür.
//
// Çalıştırma: node scripts/n3-desktop-pty-smoke.mjs

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(repoRoot, 'package.json'));
const { WebSocket } = require('ws');

const PORT = 3000 + Math.floor(Math.random() * 2000);
const BASE = `http://127.0.0.1:${PORT}`;
const root = mkdtempSync(join(tmpdir(), 'n3-pty-smoke-'));

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ` (${extra})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const daemon = spawn(process.execPath, [join(repoRoot, 'dist/cli/entry.js'), 'serve', '--port', String(PORT)], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let daemonLog = '';
daemon.stdout.on('data', (d) => { daemonLog += String(d); });
daemon.stderr.on('data', (d) => { daemonLog += String(d); });

async function cleanup(code) {
  try { daemon.kill('SIGTERM'); } catch { /* ölmüş */ }
  await sleep(400);
  try { daemon.kill('SIGKILL'); } catch { /* ölmüş */ }
  rmSync(root, { recursive: true, force: true });
  process.exit(code);
}

try {
  // ── 1 · daemon hazır olana dek bekle ──
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/api/status`);
      if (res.status === 200 || res.status === 401) { ready = true; break; }
    } catch { /* henüz değil */ }
    await sleep(250);
  }
  check('daemon ayakta (/api/status cevap veriyor)', ready);
  if (!ready) { console.log(daemonLog.slice(-800)); await cleanup(1); }

  // ── 2 · runtime token dosyalarından API-bearer al (Desktop-main'in adopt
  //        akışının okuduğu handshake ile aynı sırlar) ──
  const apiToken = readFileSync(join(root, '.deckent', 'runtime', 'api-token'), 'utf-8').trim();
  check('api-token runtime-dosyası yazılmış', apiToken.length > 0);

  // ── 3 · inv#1 negatifi: Bearer'sız → 401 ──
  const noAuth = await fetch(`${BASE}/api/terminal/token`);
  check('Bearer\'sız GET /api/terminal/token → 401 (fail-CLOSED)', noAuth.status === 401, `status=${noAuth.status}`);

  // ── 4 · Desktop yolu: API-bearer → terminal-token ──
  const tokenRes = await fetch(`${BASE}/api/terminal/token`, { headers: { Authorization: `Bearer ${apiToken}` } });
  check('API-bearer ile → 200 + no-store', tokenRes.status === 200 && tokenRes.headers.get('cache-control') === 'no-store');
  const { token: terminalToken } = await tokenRes.json();
  check('terminal-token alındı ve API-token\'dan farklı', typeof terminalToken === 'string' && terminalToken.length > 0 && terminalToken !== apiToken);

  // ── 5 · gerçek PTY oturumu (kind=shell) ──
  const createRes = await fetch(`${BASE}/api/terminal/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${terminalToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'shell' }),
  });
  check('POST sessions (shell) → 201', createRes.status === 201, `status=${createRes.status}`);
  const sess = await createRes.json();
  check('session-meta id/kind döndü', typeof sess.id === 'string' && sess.kind === 'shell');

  // ── 6 · WS attach + echo roundtrip (Desktop frame-kodek kontratı) ──
  const MARKER = 'makine-dairesi-583-n3';
  const echoed = await new Promise((resolve) => {
    let out = '';
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/api/terminal/ws`, [`deckent.${terminalToken}`]);
    const timer = setTimeout(() => { ws.close(); resolve(null); }, 12_000);
    ws.on('open', () => {
      ws.send(JSON.stringify({ t: 'attach', sessionId: sess.id }));
      setTimeout(() => ws.send(JSON.stringify({ t: 'input', data: `echo ${MARKER}\r` })), 600);
    });
    ws.on('message', (raw) => {
      try {
        const frame = JSON.parse(String(raw));
        if (frame.t === 'output' && typeof frame.data === 'string') {
          out += frame.data;
          // yankı = komut-satırı-echo'su DEĞİL, komutun kendi stdout satırı:
          // marker'ın satır-başında (prompt-sonrası newline'la) görünmesi.
          if (out.split(MARKER).length > 2 || /\r?\n[^\n]*makine-dairesi-583-n3/.test(out)) {
            clearTimeout(timer);
            ws.close();
            resolve(out);
          }
        }
      } catch { /* JSON-dışı frame yok sayılır */ }
    });
    ws.on('error', () => { clearTimeout(timer); resolve(null); });
  });
  check('WS attach + `echo` → output-frame\'de GERÇEK PTY yankısı', echoed !== null && echoed.includes(MARKER));

  // ── 7 · oturumu kapat ──
  const del = await fetch(`${BASE}/api/terminal/sessions/${sess.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${terminalToken}` },
  });
  check('DELETE session → 200', del.status === 200);

  console.log(`\n${pass} PASS / ${fail} FAIL`);
  await cleanup(fail === 0 ? 0 : 1);
} catch (err) {
  console.error('SMOKE-HATA:', err);
  console.log(daemonLog.slice(-800));
  await cleanup(1);
}
