#!/usr/bin/env node
// lint-config-writers — G0-A containment gate (MASTER 471 CONFIG-AUTHORITY-001 dilimi,
// config-completion-audit CFG-007; owner onayı 2026-08-26 "öneri kabul edildi").
//
// Sözleşme: `.deckent/config.json` ailesine (PROJECT_CONFIG_PATH / GLOBAL_CONFIG_PATH /
// 'config.json' literal'i) src/** içinden DOĞRUDAN write-family fs çağrısı yapmak
// yasaktır; tek meşru yazım yolu `src/core/config-write-authority.ts` modülüdür
// (tmp+0600+fsync+lock+rename). Bu gate, sprint-680 kablolamasının geriye kaymasını
// yapısal olarak engeller: YENİ ihlal fail-closed (exit 1), baseline yalnız azalabilir.
//
// Tarama iki-adımlıdır (satır-metinsel, dosya-yerel):
//   1. config-family path taşıyan yerel bildirimleri topla
//      (const/let/var <id> = ... PROJECT_CONFIG_PATH | GLOBAL_CONFIG_PATH | '…config.json…')
//   2. write-family çağrılarının (writeFileSync/appendFileSync/truncateSync/
//      createWriteStream + promise/bare writeFile/appendFile/truncate) İLK argümanı
//      bir config-family literal'i, *_CONFIG_PATH tanımlayıcısı veya 1. adımda toplanan
//      bir yerel bildirim ise → ihlal.
// Bilinçli sınır: alias-zinciri/parametre-geçişli dolaylılık bu metinsel gate'in
// kapsamı dışındadır (tam AST emsali: lint-sprint-archive-writers.mjs); G1A tek-resolver
// kapanışında AST'ye terfi ettirilebilir. Bugünkü ölçülen gerçek: baseline BOŞ.
//
// CONFIG_WRITERS_BASELINE ledger'ı — hermeticity-gate deseni: her kalıcı istisna
// `file:line-fn-firstArg` anahtarıyla ve gerekçe yorumuyla burada yaşar; girişin
// kodda karşılığı kalmazsa gate STALE_BASELINE ile kırmızıya düşer (yalnız-azalma).
// 2026-08-26 kuruluş ölçümü: 0 kayıt (sprint-680 kablolama sonrası src temiz).
export const CONFIG_WRITERS_BASELINE = new Set([]);

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const AUTHORITY_MODULE = 'src/core/config-write-authority.ts';
const WRITE_CALL_RE = /\b(writeFileSync|appendFileSync|truncateSync|createWriteStream|writeFile|appendFile|truncate)\s*\(\s*([^,)]*)/g;
// Segment-sınırlı eşleşme: 'config.json' ya tek başına ya da '/config.json' olarak
// biter — 'cost-config.json' / 'docs-config.json' aileleri (10061/managed-docs domain'i)
// bu gate'in kapsamı DIŞINDADIR (bilinçli; G0-A yalnız canonical config ailesi).
const CONFIG_LITERAL_RE = /['"`](?:[^'"`]*\/)?config\.json['"`]/;
const CONFIG_PATH_SYMBOL_RE = /\b(?:PROJECT_CONFIG_PATH|GLOBAL_CONFIG_PATH)\b/;
const DECL_RE = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=([^;]*)/g;

function portablePath(value) {
  return String(value).replaceAll('\\', '/');
}

function sourceFiles(root) {
  const start = resolve(root, 'src');
  try { if (!statSync(start).isDirectory()) return []; } catch { return []; }
  const files = [];
  const ignored = new Set(['node_modules', 'dist', 'out', 'coverage', '.vite']);
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = resolve(directory, entry.name);
      if (entry.isDirectory() && !ignored.has(entry.name)) visit(full);
      else if (entry.isFile() && /\.[cm]?tsx?$/u.test(entry.name) && !/\.d\.[cm]?ts$/u.test(entry.name)) files.push(full);
    }
  };
  visit(start);
  return files;
}

function configFamilyExpression(text) {
  return CONFIG_LITERAL_RE.test(text) || CONFIG_PATH_SYMBOL_RE.test(text);
}

/** 1. adım: dosya-yerel config-family path bildirimleri. */
export function collectConfigPathIdentifiers(content) {
  const identifiers = new Set();
  for (const match of content.matchAll(DECL_RE)) {
    const [, name, initializer] = match;
    if (configFamilyExpression(initializer)) identifiers.add(name);
  }
  return identifiers;
}

/** 2. adım: write-family çağrılarının ilk argümanı config-family mi? */
export function inspectConfigWriterSource(content, filename) {
  const file = portablePath(filename);
  if (file === AUTHORITY_MODULE) return [];
  const identifiers = collectConfigPathIdentifiers(content);
  const problems = [];
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    if (/^\s*(?:\/\/|\*)/u.test(line)) return; // yorum satırı çağrı değildir
    for (const match of line.matchAll(WRITE_CALL_RE)) {
      const [, fn, firstArgRaw] = match;
      const firstArg = firstArgRaw.trim();
      if (!firstArg) continue;
      const identifierOnly = /^([A-Za-z_$][\w$]*)\s*$/u.exec(firstArg)?.[1];
      const violates = configFamilyExpression(firstArg)
        || (identifierOnly !== undefined && identifiers.has(identifierOnly));
      if (!violates) continue;
      const key = `${file}:${fn}:${identifierOnly ?? 'inline-config-literal'}`;
      problems.push({
        code: 'CONFIG_DIRECT_WRITE',
        file,
        line: index + 1,
        key,
        detail: `${fn}(${firstArg.slice(0, 60)}…) config-ailesine doğrudan yazıyor — src/core/config-write-authority.ts kullanılmalı`,
      });
    }
  });
  return problems;
}

export function checkConfigWriters(root = process.cwd()) {
  const problems = [];
  for (const filename of sourceFiles(root)) {
    const rel = portablePath(relative(root, filename));
    problems.push(...inspectConfigWriterSource(readFileSync(filename, 'utf8'), rel));
  }
  const fresh = problems.filter((p) => !CONFIG_WRITERS_BASELINE.has(p.key));
  const seenKeys = new Set(problems.map((p) => p.key));
  const stale = [...CONFIG_WRITERS_BASELINE].filter((entry) => !seenKeys.has(entry));
  fresh.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return { ok: fresh.length === 0 && stale.length === 0, fresh, stale };
}

function main(argv) {
  const rootAt = argv.indexOf('--root');
  const root = resolve(rootAt >= 0 && argv[rootAt + 1] ? argv[rootAt + 1] : process.cwd());
  const result = checkConfigWriters(root);
  if (result.ok) { process.stdout.write('config writers: OK (authority-only)\n'); return 0; }
  for (const problem of result.fresh) {
    process.stderr.write(`CONFIG_DIRECT_WRITE ${problem.file}:${problem.line}: ${problem.detail}\n`);
  }
  for (const entry of result.stale) {
    process.stderr.write(`CONFIG_WRITERS_STALE_BASELINE ${entry}: kodda karşılığı kalmadı — baseline'dan düşürün (yalnız-azalma ledger'ı)\n`);
  }
  return 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
