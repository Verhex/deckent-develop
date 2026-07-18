#!/usr/bin/env node
// ═══ 589 REBORN — NOVA tasarım göz-döngüsü koşucusu ═════════════════════════
//
// Tasarım-iterasyonunun üç bacağını tek komutla ayağa kaldırır (anayasa E4:
// GERÇEK-VERİ zorunlu, statik-mock yasak):
//   1. İzole deckent-daemon (:3179) — token'ı KENDİ üretir; SPRINT BAŞLATMAZ,
//      Alperen'in daemon'una (:3100) ve koşan sprint'lere dokunmaz.
//   2. Referans-sunucu (:3180/nova) — Alperen'in ONAYLADIĞI statik prototip
//      (589-prototip-A-nova.html); piksel-sadakat karşılaştırma tabanı.
//   3. Gerçek-renderer (:5173) — Electron'SUZ programatik vite ('electron-vite
//      dev' Electron'u koşulsuz başlattığı için vite doğrudan çağrılır;
//      config electron.vite.config.ts renderer-bloğunun birebir eşi).
//      Tarayıcı, hash'teki port+token ile daemon'a bağlanır
//      (renderer/shell/dev-hash-session.ts — yalnız bridge-yokken devrede).
//
// Kullanım:  node scripts/nova-tasarim-loop.mjs [--open]
//   --open  → WSL'de URL'leri Windows-tarayıcıda da aç (varsayılan: kapalı —
//             göz-döngüsü Playwright'la headless koşarken sekme fırlatmasın).
// Kapatmak: Ctrl+C → daemon + iki sunucu birlikte söner.
//
// İleri-iş (ŞİMDİ DEĞİL): --replay <jsonl> — .deckent/runtime/scheduler-shadow
// kayıtlarından /api/sprint/live + worker-SSE'yi zaman-çizelgesiyle yeniden
// oynatan stand-in sunucu (kayıt = gerçek veri, mock değil).

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3179;
const VIEW_PORT = PORT + 1;
const VITE_PORT = 5173;
const TOKEN = randomBytes(24).toString('hex');
const AUTO_OPEN = process.argv.includes('--open');

const entry = join(repoRoot, 'dist/cli/entry.js');
if (!existsSync(entry)) {
  console.error('✗ dist/cli/entry.js yok — önce `npm run build` gerekir (sprint koşuyorsa build YASAK; önce Alperen\'e sor).');
  process.exit(1);
}

// ── 1. İzole daemon ─────────────────────────────────────────────────────────
const daemon = spawn(process.execPath, [entry, 'serve', '--port', String(PORT)], {
  cwd: repoRoot,
  stdio: ['ignore', 'ignore', 'inherit'],
  env: { ...process.env, DECKENT_API_TOKEN: TOKEN, DECKENT_CONTROL_MUTATIONS: '1' },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let healthy = false;
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/health`);
    if (res.ok) { healthy = true; break; }
  } catch { /* bekle */ }
  await sleep(250);
}
if (!healthy) {
  console.error(`✗ Daemon :${PORT} üzerinde ${60 * 250 / 1000}s içinde sağlıklı olmadı — port dolu olabilir.`);
  try { daemon.kill('SIGTERM'); } catch { /* ölü */ }
  process.exit(1);
}

// ── 2. Referans-sunucu (onaylı prototip) ────────────────────────────────────
const PAGES = { '/nova': join(repoRoot, 'docs/analysis/589-prototip-A-nova.html') };
const viewServer = createServer((req, res) => {
  const path = (req.url || '/').split('#')[0].split('?')[0];
  const file = PAGES[path];
  if (!file) { res.writeHead(302, { Location: '/nova' }); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(readFileSync(file, 'utf-8'));
});
viewServer.listen(VIEW_PORT, '127.0.0.1');

// ── 3. Gerçek-renderer: programatik vite (Electron'suz) ─────────────────────
const desktopRequire = createRequire(join(repoRoot, 'src/desktop/package.json'));
const vite = await import(desktopRequire.resolve('vite'));
const react = (await import(desktopRequire.resolve('@vitejs/plugin-react'))).default;
const viteServer = await vite.createServer({
  configFile: false,
  root: join(repoRoot, 'src/desktop/src/renderer'),
  plugins: [react()],
  server: { host: '127.0.0.1', port: VITE_PORT, strictPort: true },
  logLevel: 'warn',
});
await viteServer.listen();

// ── URL'ler + kapanış ───────────────────────────────────────────────────────
const hash = `#port=${PORT}&token=${TOKEN}`;
const urlRef = `http://127.0.0.1:${VIEW_PORT}/nova${hash}`;
const urlReal = `http://127.0.0.1:${VITE_PORT}/${hash}`;
console.log('\n🛰  Göz-döngüsü hazır — daemon http://127.0.0.1:' + PORT);
console.log('\n  REFERANS (onaylı prototip) : ' + urlRef);
console.log('  GERÇEK  (renderer, vite)   : ' + urlReal);
console.log('\nCanlı-his için sprint\'i AYRI terminalden Alperen başlatır.');
console.log('Kapatmak: Ctrl+C\n');

if (AUTO_OPEN && process.env.WSL_DISTRO_NAME) {
  for (const u of [urlRef, urlReal]) {
    try { spawn('cmd.exe', ['/c', 'start', '', u], { stdio: 'ignore', detached: true }).unref(); } catch { /* elle-aç */ }
    await sleep(400);
  }
}

const shutdown = async () => {
  try { daemon.kill('SIGTERM'); } catch { /* ölü */ }
  try { viewServer.close(); } catch { /* kapalı */ }
  try { await viteServer.close(); } catch { /* kapalı */ }
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
