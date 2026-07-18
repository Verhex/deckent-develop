#!/usr/bin/env node
// ═══ 589 REBORN — prototip-daemon başlatıcısı ═══════════════════════════════
//
// İki zıt-yön prototipi (NOVA / PULSE) GERÇEK-VERİ ister (anayasa E4:
// statik-mock yasak). Bu başlatıcı: (1) deckent-dev kökünde kendi daemon'ını
// doğurur (token'ı KENDİ üretir → P8-bayat-dosya sorunu yok; env-twin'le
// chat/commit mandalları açık), (2) iki prototipin tarayıcı-URL'lerini
// (port+token hash'iyle) basar. Ctrl+C → daemon'ı söndürür.
//
// Kullanım:  node scripts/589-prototip-daemon.mjs   → URL'leri kopyala/aç

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3179;
const TOKEN = randomBytes(24).toString('hex');

const daemon = spawn(process.execPath, [join(repoRoot, 'dist/cli/entry.js'), 'serve', '--port', String(PORT)], {
  cwd: repoRoot,
  stdio: ['ignore', 'ignore', 'inherit'],
  env: { ...process.env, DECKENT_API_TOKEN: TOKEN, DECKENT_CONTROL_MUTATIONS: '1' },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/health`);
    if (res.ok) break;
  } catch { /* bekle */ }
  await sleep(250);
}

// Mini statik-sunucu: prototipler http://localhost'tan açılır (file://-zahmeti
// ve Windows-tarayıcı yol-çevirisi yok; CORS-origin'i de loopback olur).
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
const VIEW_PORT = PORT + 1;
const PAGES = {
  '/nova': join(repoRoot, 'docs/analysis/589-prototip-A-nova.html'),
  '/pulse': join(repoRoot, 'docs/analysis/589-prototip-B-pulse.html'),
};
createServer((req, res) => {
  const path = (req.url || '/').split('#')[0].split('?')[0];
  const file = PAGES[path];
  if (!file) { res.writeHead(302, { Location: '/nova' }); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(readFileSync(file, 'utf-8'));
}).listen(VIEW_PORT, '127.0.0.1');

const hash = `#port=${PORT}&token=${TOKEN}`;
const urlA = `http://127.0.0.1:${VIEW_PORT}/nova${hash}`;
const urlB = `http://127.0.0.1:${VIEW_PORT}/pulse${hash}`;
console.log('\n🛰  Prototip-daemon hazır — http://127.0.0.1:' + PORT);
console.log('\nTarayıcıda aç (ikisini de — yan yana sekmelerde):');
console.log('  A «NOVA»  : ' + urlA);
console.log('  B «PULSE» : ' + urlB);
console.log('\nCanlı-his için bir sprint başlat (ayrı terminal):  deckent do "<küçük iş>"');
console.log('Kapatmak: Ctrl+C\n');

// WSL→Windows varsayılan-tarayıcıda otomatik-aç (başarısızsa sessiz — URL'ler yukarıda).
if (process.env.WSL_DISTRO_NAME) {
  for (const u of [urlA, urlB]) {
    try { spawn('cmd.exe', ['/c', 'start', '', u], { stdio: 'ignore', detached: true }).unref(); } catch { /* elle-aç */ }
    await sleep(400);
  }
}

process.on('SIGINT', () => { try { daemon.kill('SIGTERM'); } catch { /* ölü */ } process.exit(0); });
process.on('SIGTERM', () => { try { daemon.kill('SIGTERM'); } catch { /* ölü */ } process.exit(0); });
