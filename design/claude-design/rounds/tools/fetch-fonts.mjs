// Font-aday turu: Google Fonts css2 → latin+latin-ext woff2 indir, manifest yaz.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const OUT = process.argv[2] ?? new URL("./fonts-cache", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const FAMILIES = [
  ['Tektur', 'wght@700'], ['Chakra Petch', 'wght@400;600'], ['Spline Sans Mono', 'wght@400;600'],
  ['Eczar', 'wght@600'], ['Schibsted Grotesk', 'wght@400;600'], ['Sometype Mono', 'wght@400;600'],
  ['Doto', 'wght@700'], ['Onest', 'wght@400;600'], ['Azeret Mono', 'wght@400;600'],
];
const manifest = [];
for (const [family, axes] of FAMILIES) {
  const url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:${axes}&display=swap`;
  const css = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
  // bloklar: /* subset */ @font-face { ... font-weight: W; src: url(U) ...; unicode-range: R; }
  const blocks = [...css.matchAll(/\/\* ([a-z-]+) \*\/\s*@font-face \{([^}]+)\}/g)];
  for (const [, subset, body] of blocks) {
    if (subset !== 'latin' && subset !== 'latin-ext') continue;
    const w = body.match(/font-weight:\s*([0-9 ]+);/)?.[1].trim().replace(/ /g, '-');
    const u = body.match(/src:\s*url\((https:[^)]+\.woff2)\)/)?.[1];
    const r = body.match(/unicode-range:\s*([^;]+);/)?.[1].trim();
    if (!u) continue;
    const fname = `${family.replace(/ /g, '')}-${w}-${subset}.woff2`;
    const buf = Buffer.from(await (await fetch(u, { headers: { 'User-Agent': UA } })).arrayBuffer());
    writeFileSync(join(OUT, fname), buf);
    manifest.push({ family, weight: w.replace('-', ' '), subset, file: fname, bytes: buf.length, range: r });
  }
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
const perFamily = {};
for (const m of manifest) { (perFamily[m.family] ??= new Set()).add(m.subset); }
for (const [f, s] of Object.entries(perFamily)) console.log(f.padEnd(18), [...s].join(' + '));
console.log('toplam dosya:', manifest.length, '· toplam KB:', Math.round(manifest.reduce((a, m) => a + m.bytes, 0) / 1024));
const missing = Object.entries(perFamily).filter(([, s]) => !s.has('latin-ext')).map(([f]) => f);
console.log(missing.length ? `WARN: latin-ext EKSIK: ${missing.join(', ')}` : 'OK: latin-ext (Turkce) 9/9 tam');
