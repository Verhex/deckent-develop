#!/usr/bin/env node
/**
 * Font-aday turu kart üreticisi (DESIGN-SYSTEM-001 · 2026-07-31 turu).
 * Kullanım: node generate-font-round.mjs <fonts-cache-dir>
 *   <fonts-cache-dir>: fetch-fonts.mjs çıktısı (woff2 + manifest.json).
 * Üç zıt-yön kartını AYNI şablondan üretir — spesimenler bire-bir aynı olduğundan
 * yönler adil karşılaştırılır. Renkler design/tokens NOVA değerleri (elle hex yok).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CACHE = process.argv[2];
if (!CACHE) {
  console.error('kullanım: node generate-font-round.mjs <fonts-cache-dir>');
  process.exit(1);
}
const OUT_DIR = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(join(CACHE, 'manifest.json'), 'utf8'));

// NOVA renkleri token SSOT'undan okunur — script'te elle hex yok (design-critic 2026-07-31 #7).
const chartPrimitives = JSON.parse(
  readFileSync(join(OUT_DIR, '..', '..', 'tokens', 'primitives.tokens.json'), 'utf8'),
).color.chart;
const NOVA_VARS = {
  bg: 'novaDeep', surface: 'novaRaised', line: 'novaLine', text: 'novaText',
  muted: 'novaTextMuted', glow: 'novaGlow', 'glow-deep': 'novaGlowDeep',
  amber: 'novaAmber', go: 'novaGo', abort: 'novaAbort',
};
const ROOT_COLORS = Object.entries(NOVA_VARS)
  .map(([cssVar, prim]) => `--${cssVar}:${chartPrimitives[prim].$value};`)
  .join(' ');

const DIRECTIONS = [
  {
    slug: 'font-a-makine-izi',
    name: 'MAKİNE İZİ',
    letter: 'A',
    display: 'Tektur', body: 'Chakra Petch', mono: 'Spline Sans Mono',
    displayWeight: 700, bodyWeights: '400 / 600', monoWeights: '400 / 600',
    rationale:
      'Alet gerçekliği köşeli harfte. Tektur’un kesik köşeleri sahne başlıklarına ' +
      'enstrüman-paneli sertliği verir; Chakra Petch aynı DNA’yı gövdeye düşük dozda taşır; ' +
      'Spline Sans Mono veriyi keskin ama sakin tutar.',
    shine: 'Komuta/HUD başlıkları, durum etiketleri, "çelik" his — NOVA’nın koyu sahnesinde otorite.',
    risk:
      'Sertlik uzun okumada yorabilir; gövdenin köşeli karakteri yoğun metinli ekranlarda dozunda ' +
      'tutulmalı. Yaygınlık: Chakra Petch gaming/esports şablonlarında sık görülür — gövdede düşük ' +
      'doz bilinçli tercih; Tektur (2023) ve Spline Sans Mono görece temiz.',
  },
  {
    slug: 'font-b-sicak-tuhaf',
    name: 'SICAK TUHAF',
    letter: 'B',
    display: 'Eczar', body: 'Schibsted Grotesk', mono: 'Sometype Mono',
    displayWeight: 600, bodyWeights: '400 / 600', monoWeights: '400 / 600',
    rationale:
      'İnsan eli + mürekkep: Eczar’ın sivri, mürekkep-ağır serifi kütüphane değil atölye kokar — ' +
      '"teknolojik ama yapay olmayan"ın serif yorumu. Schibsted Grotesk karakterli ama son derece ' +
      'okunaklı gövde; Sometype Mono yumuşak, ekran-dostu veri sesi.',
    shine: 'Uzun okuma, onboarding, doküman-ağır ekranlar; markaya beklenmedik, edebi bir kişilik.',
    risk:
      'Serif display bir HUD’da alışılmadık; Eczar’ın sivriliği büyük puntoda agresifleşebilir. ' +
      'Yaygınlık: Eczar batı arayüz-şablonlarında nadirdir (Devanagari dünyasında bilinir) — ' +
      'klişe-riski düşük, yabancılık-riski var. Menşe: Schibsted Grotesk marka-menşelidir ' +
      '(Bakken & Bæck, Schibsted Media Group için; kamu tanınırlığı düşük) — bilerek seçilmeli; ' +
      'istenirse nötr-menşeli gövde alternatifi turu yapılır.',
  },
  {
    slug: 'font-c-pano',
    name: 'PANO',
    letter: 'C',
    display: 'Doto', body: 'Onest', mono: 'Azeret Mono',
    displayWeight: 700, bodyWeights: '400 / 600', monoWeights: '400 / 600',
    rationale:
      'Enstrüman panosu: Doto’nun nokta-matrisi kalkış panosu / kayıt cihazı gerçekliğidir — süs ' +
      'değil alet. Onest kendini silen, sakin gövde; Azeret Mono tok, çağdaş veri yüzü. Ne ' +
      'makine-sert ne organik-sıcak: üçüncü kutup, "kayıt tutan makine".',
    shine: 'Insights/telemetri, sayı-önde ekranlar, boot/durum panoları — deckent’in kanıt-zinciri / kayıt-tutma kimliğiyle doğrudan örtüşür.',
    risk:
      'Nokta-matris display yalnız büyük puntoda okunur, küçükte dağılır — sıkı display-only ' +
      'disiplin ister. Yaygınlık: Doto çok yeni (2024, klişeleşmedi) ama az test edilmiş; Azeret ' +
      'Mono yoğun kolonlarda geniş kaçabilir. Onest nötr ailedendir ve yaygınlaşıyor — C’nin ' +
      'kimliği display’e yaslanır; gövdede karakter arıyorsan bu yön onu bilerek vermez.',
    mockNote:
      'Not: yukarıdaki 15px KOMUTA başlığı bilinçli sınır-altı stres örneğidir — üründe Doto ' +
      'yalnız display-floor üstünde kullanılır.',
  },
];

const cssName = (f) => `'${f}'`;
const b64 = (file) => readFileSync(join(CACHE, file)).toString('base64');

function fontFaces(families) {
  return manifest
    .filter((m) => families.includes(m.family))
    .map(
      (m) =>
        `@font-face{font-family:'${m.family}';font-style:normal;font-weight:${m.weight};font-display:swap;` +
        `src:url(data:font/woff2;base64,${b64(m.file)}) format('woff2');unicode-range:${m.range};}`,
    )
    .join('\n');
}

function familyKb(family) {
  return Math.round(manifest.filter((m) => m.family === family).reduce((a, m) => a + m.bytes, 0) / 1024);
}

function card(d) {
  const faces = fontFaces([d.display, d.body, d.mono]);
  return `<!-- @dsCard group="Rounds" -->
<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Deckent DS — Font Turu · ${d.letter} «${d.name}»</title>
<style>
/* self-host woff2 data-URI (OFL, Google Fonts) — latin + latin-ext (Türkçe tam) */
${faces}
/* Renkler: design/tokens/primitives.tokens.json'dan üretim anında okunur */
:root{
  ${ROOT_COLORS}
  --f-d:${cssName(d.display)},system-ui,sans-serif;
  --f-b:${cssName(d.body)},system-ui,sans-serif;
  --f-m:${cssName(d.mono)},ui-monospace,monospace;
}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--text);font-family:var(--f-b);padding:48px;line-height:1.55}
.wrap{max-width:1040px;margin:0 auto}
.eyebrow{font-family:var(--f-m);font-size:11px;letter-spacing:.18em;color:var(--glow);text-transform:uppercase}
h1{font-family:var(--f-d);font-weight:${d.displayWeight};font-size:44px;margin:12px 0 8px}
.sub{color:var(--muted);max-width:66ch}
section{margin-top:40px;border-top:1px solid var(--line);padding-top:22px}
.label{font-family:var(--f-m);font-size:11px;letter-spacing:.14em;color:var(--muted);text-transform:uppercase;margin-bottom:16px}
.specimen{font-family:var(--f-d);font-weight:${d.displayWeight};font-size:58px;line-height:1.08;letter-spacing:-.005em}
.digits{font-family:var(--f-d);font-weight:${d.displayWeight};font-size:30px;color:var(--glow);margin-top:12px}
.bodycopy{max-width:56ch;font-size:16px}
.mono{font-family:var(--f-m);font-size:13px;font-variant-numeric:tabular-nums}
.glyphs div{padding:6px 0;border-bottom:1px dashed var(--line);font-size:20px}
.glyphs .gd{font-family:var(--f-d);font-weight:${d.displayWeight}}
.glyphs .gb{font-family:var(--f-b)}
.glyphs .gm{font-family:var(--f-m);font-size:16px}
.glyphs em{font-style:normal;font-family:var(--f-m);font-size:10px;letter-spacing:.12em;color:var(--muted);display:block;margin-top:2px}
.mock{border:1px solid var(--line);background:var(--surface)}
.mock .bar{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line)}
.mock .bar b{font-family:var(--f-d);font-weight:${d.displayWeight};font-size:15px;letter-spacing:.04em}
.mock .bar span{font-family:var(--f-m);font-size:10px;color:var(--glow)}
.mock .row{padding:14px 16px;font-size:14px}
.mock .tele{padding:0 16px 14px;font-family:var(--f-m);font-size:12px;color:var(--muted)}
.pills{display:flex;gap:6px;padding:0 16px 16px}
.pill{font-family:var(--f-m);font-size:10px;letter-spacing:.08em;padding:3px 8px;color:var(--bg)}
table{width:100%;border-collapse:collapse;font-size:14px}
td,th{text-align:left;padding:10px 14px 10px 0;border-bottom:1px solid var(--line)}
th{font-family:var(--f-m);font-size:11px;letter-spacing:.1em;color:var(--muted);text-transform:uppercase;font-weight:400}
td:first-child{font-family:var(--f-m);color:var(--glow);font-size:12px;white-space:nowrap}
.verdict{display:grid;gap:10px}
.verdict p{font-size:14px;max-width:72ch}
.verdict b{font-family:var(--f-m);font-weight:400;font-size:11px;letter-spacing:.12em}
footer{margin-top:44px;border-top:1px solid var(--line);padding-top:14px;font-family:var(--f-m);font-size:11px;color:var(--muted)}
</style>
</head>
<body>
<div class="wrap">
  <div class="eyebrow">Deckent Design System · Font-Aday Turu · Yön ${d.letter}/3</div>
  <h1>«${d.name}»</h1>
  <p class="sub">${d.rationale}</p>

  <section>
    <div class="label">Display — ${d.display} ${d.displayWeight}</div>
    <div class="specimen">Akışlar uyanık.<br>Onay bende.</div>
    <div class="digits">0123456789</div>
  </section>

  <section>
    <div class="label">Gövde — ${d.body} ${d.bodyWeights}</div>
    <p class="bodycopy">Koşu başladığında sahne uyanır: telemetri satırları kaynağından doğar,
    nehre süzülür. Onay kolunu çektiğinde makine cevap verir — ara durum yok. Worker izinleri
    sahne-diyaloğu olarak düşer; karar klavyeden bir tuş. <strong>Kalın vurgu</strong> ve
    <em>eğik olmayan vurgu</em> hiyerarşiyi taşır.</p>
  </section>

  <section>
    <div class="label">Veri — ${d.mono} ${d.monoWeights}</div>
    <p class="mono">runs 271 · go 243 · debt 19 · no_go 9 · p95 412ms<br>
    0123456789 — tabular; kolonlar oynamaz. path/to/worker-07.result</p>
  </section>

  <section>
    <div class="label">Türkçe glifler — Iı/İi ayrımı dahil</div>
    <div class="glyphs">
      <div class="gd">ĞIİŞÇÖÜ ığüşöç — «İğne İpliği» <em>display</em></div>
      <div class="gb">Ağır yol, iğne, ışık, şölen, çekirdek, düğüm, İstanbul <em>gövde</em></div>
      <div class="gm">GÖREV=İĞ-07 · durum=IŞIK · yol=/şölen/çıktı.log <em>veri</em></div>
    </div>
  </section>

  <section>
    <div class="label">Birlikte — mini sahne</div>
    <div class="mock">
      <div class="bar"><b>KOMUTA</b><span>EXECUTE · 07:41</span></div>
      <div class="row">Worker-07 dosya kilidini bıraktı; sonuç değerlendirmeye süzülüyor.</div>
      <div class="pills">
        <span class="pill" style="background:var(--go)">GO</span>
        <span class="pill" style="background:var(--amber)">DEBT</span>
        <span class="pill" style="background:var(--abort)">NO_GO</span>
      </div>
      <div class="tele">tele › w07 claim src/core/routing-engine.ts · +214ms</div>
    </div>${d.mockNote ? `\n    <p class="sub" style="font-size:12px;margin-top:10px">${d.mockNote}</p>` : ''}
  </section>

  <section>
    <div class="label">Aday seti</div>
    <table>
      <tr><th>Rol</th><th>Aile</th><th>Ağırlık</th><th>Boyut (latin+ext)</th><th>Lisans</th></tr>
      <tr><td>font.display</td><td>${d.display}</td><td>${d.displayWeight}</td><td>${familyKb(d.display)} KB</td><td>OFL · self-host</td></tr>
      <tr><td>font.body</td><td>${d.body}</td><td>${d.bodyWeights}</td><td>${familyKb(d.body)} KB</td><td>OFL · self-host</td></tr>
      <tr><td>font.data</td><td>${d.mono}</td><td>${d.monoWeights}</td><td>${familyKb(d.mono)} KB</td><td>OFL · self-host</td></tr>
    </table>
  </section>

  <section>
    <div class="label">Dürüst değerlendirme</div>
    <div class="verdict">
      <p><b style="color:var(--go)">PARLAR</b> — ${d.shine}</p>
      <p><b style="color:var(--amber)">RİSK</b> — ${d.risk}</p>
    </div>
  </section>

  <footer>Seçim: A · B · C ya da karışım (örn. display=C + veri=A). Seçilen set font.* token-seti olur;
  kişiselleştirme gereği diğer setler de seçilebilir kalabilir. Bu kart spesimendir — seçim,
  token-flip’ten önce gerçek-veri prototipiyle doğrulanır (statik mock nihai kanıt değildir). · 2026-07-31</footer>
</div>
</body>
</html>
`;
}

for (const d of DIRECTIONS) {
  const html = card(d);
  const out = join(OUT_DIR, `${d.slug}.html`);
  writeFileSync(out, html);
  console.log(`${d.slug}.html — ${Math.round(html.length / 1024)} KB`);
}
