#!/usr/bin/env node
// gen-repair-directives — repair-sınıfı DIRECTIVES üreticisi (owner decision 2026-08-25).
//
// Kırmızı-test-dosya listesinden deterministik DIRECTIVES.md üretir: dosyalar
// sıralanıp dizin-yakınlıklı kümelenir; her kümenin `Reads:` listesi test-
// dosyalarının DOĞRUDAN src-importlarının taranmasından (scanDirectSrcImports —
// lint-directives ile AYNI fonksiyon) çıkar. LLM serbest-metni yoktur; gövde
// şablon-sabittir. Çıktı her zaman `lint-directives.mjs` + `deckent plan
// --dry-run` kapılarından geçirilerek kullanılır (süreç: current-flow contract).
//
// Kullanım: node scripts/gen-repair-directives.mjs --files <liste.txt> [--chunk 14] [--out DIRECTIVES.md]
// Exit: 0 üretildi, 2 girdi/altyapı hatası.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanDirectSrcImports } from './lint-directives.mjs';

const REPO_ROOT = resolve(new URL('..', import.meta.url).pathname);

export function chunkFiles(files, chunkSize) {
  const sorted = [...new Set(files)].sort();
  const chunks = [];
  for (let i = 0; i < sorted.length; i += chunkSize) chunks.push(sorted.slice(i, i + chunkSize));
  return chunks;
}

export function buildRepairDirectives({ repoRoot, files, chunkSize }) {
  const chunks = chunkFiles(files, chunkSize);
  const parts = [`# FULL-SUITE TRUTH REPAIR (generated ${'-'}- deterministic)

## Goal

Listedeki kirmizi test dosyalarini BUGUNKU landed src kontratina hizala. Kirmizilar
bayat pin / eski kontrat sinifidir; urun regresyonu kanitlanirsa dosyaya dokunmadan
NO_GO + exact kanit yazilir.

## Execution Contract

- Otorite: main'deki src davranisi. Assertion ZAYIFLATILMAZ, test silinmez/skip'lenmez.
- Yalnizca kendi Files listendeki test dosyalarina yaz; Reads listendeki src
  dosyalarini kontrati ogrenmek icin OKU (yazma).
- Testler hermetik kalir; VITEST_MAX_FORKS=2 disina cikma.
- Her dosya icin kosum kaniti .result notes'ta; urun-bug kanitinda NO_GO + src dosya:satir.
`];
  chunks.forEach((chunk, index) => {
    const n = index + 1;
    const reads = new Set();
    const missing = [];
    for (const f of chunk) {
      const scan = scanDirectSrcImports(repoRoot, f);
      if (!scan.exists) { missing.push(f); continue; }
      for (const s of scan.srcImports) reads.add(s);
    }
    const readsList = [...reads].sort();
    const domains = [...new Set(chunk.map((f) => f.split('/')[1] ?? 'misc'))].sort().join('/');
    parts.push(`
## Task ${n}: Align failing ${domains} suites (cluster ${n}) to landed contracts
- Files: ${chunk.join(', ')}
- Reads: ${readsList.join(', ')}
- Priority: HIGH
- Test: VITEST_MAX_FORKS=2 npx vitest run ${chunk.join(' ')}
### Description
Once Test komutunu kos ve kirmizi dosyalarin exact hatalarini topla. Sonra her
kirmizi testi Reads listesindeki src kontratlarini OKUYARAK guncel davranisa
hizala: bayat pin -> guncel deger, tasinan kontrat -> yeni sekil, eksik zorunlu
fixture -> testte kur. Assertion zayiflatmak YASAK. Urun-bug kanitinda dosyaya
dokunmadan NO_GO + exact src dosya:satir kaniti. Bitiste Test komutu bu kumede
TAM YESIL olmali; kosum ciktisi .result notes'a.${missing.length > 0 ? `\nNot: diskte bulunamayan girdiler: ${missing.join(', ')} (listeyi dogrula).` : ''}
`);
  });
  return { content: parts.join('\n'), chunkCount: chunks.length, total: chunks.reduce((s, c) => s + c.length, 0) };
}

function isMain() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  const argv = process.argv.slice(2);
  let listPath = null; let chunkSize = 14; let outPath = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--files') listPath = argv[++i];
    else if (argv[i] === '--chunk') chunkSize = Number(argv[++i]);
    else if (argv[i] === '--out') outPath = argv[++i];
    else { console.error(`[gen-repair-directives] bilinmeyen bayrak: ${argv[i]}`); process.exit(2); }
  }
  if (!listPath || !existsSync(listPath) || !Number.isInteger(chunkSize) || chunkSize < 1) {
    console.error('[gen-repair-directives] --files <liste.txt> zorunlu (satir-basi bir test yolu), --chunk >= 1');
    process.exit(2);
  }
  const files = readFileSync(listPath, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  const { content, chunkCount, total } = buildRepairDirectives({ repoRoot: REPO_ROOT, files, chunkSize });
  if (outPath) { writeFileSync(resolve(outPath), content); console.error(`[gen-repair-directives] ${chunkCount} task / ${total} dosya -> ${outPath}`); }
  else process.stdout.write(content);
}
