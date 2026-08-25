#!/usr/bin/env node
// lint-directives — start-öncesi DIRECTIVES.md doğrulayıcısı (owner decision 2026-08-25).
//
// DIRECTIVES.md'yi ÜRETİMİN KENDİ parser'ıyla (dist/orchestra/task-builder.js →
// parseStructuredDirectives) parse eder ve sprint başlatılmadan önce, sprint-663
// (gramer) ve sprint-670 (Reads-eksiği → 8/13 NO_GO) sınıfı hataları typed olarak
// yakalar. Reimplementasyon YOKTUR: parser drift'i yapısal olarak imkânsızdır,
// çünkü doğrulayan kodla koşan kod aynı derlenmiş modüldür.
//
// Neyi KANITLAMAZ: task içeriğinin işe-uygunluğunu, provider/model çözümünü,
// planner-katmanı gate'lerini (scope-satisfiability, prompt-gate) — onlar
// `deckent plan --dry-run` önizlemesinin işidir; bu gate onun ÖN-koşuludur.
//
// Exit: 0 = temiz (WARN olabilir), 1 = BLOCK bulundu, 2 = altyapı (dosya yok,
// dist bayat/eksik, parse-crash).

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');

export const SEVERITY = Object.freeze({ BLOCK: 'BLOCK', WARN: 'WARN' });

/**
 * Bir test/kaynak dosyasının DOĞRUDAN src-importlarını deterministik çıkarır.
 * `from '…/src/x/y.js'` ve `vi.mock('…/src/x/y.js')` biçimleri; yol dosyanın
 * kendi dizinine göre çözülür, repo-göreli `src/**.ts` olarak döner.
 * LLM-algısı yoktur; regex + path-resolution + disk-varlık kontrolü.
 */
export function scanDirectSrcImports(repoRoot, repoRelFile) {
  const abs = join(repoRoot, repoRelFile);
  if (!existsSync(abs)) return { exists: false, srcImports: [] };
  const text = readFileSync(abs, 'utf8');
  const specs = new Set();
  for (const re of [/from\s+['"]([^'"]+)['"]/g, /vi\.mock\(\s*['"]([^'"]+)['"]/g, /import\(\s*['"]([^'"]+)['"]/g]) {
    for (const m of text.matchAll(re)) specs.add(m[1]);
  }
  const out = new Set();
  for (const spec of specs) {
    if (!spec.startsWith('.')) continue;
    const resolved = resolve(dirname(abs), spec);
    if (!resolved.startsWith(join(repoRoot, 'src') + '/')) continue;
    const rel = resolved.slice(repoRoot.length + 1);
    const ts = rel.replace(/\.js$/u, '.ts');
    if (existsSync(join(repoRoot, ts))) out.add(ts);
  }
  return { exists: true, srcImports: [...out].sort() };
}

function coveredByScope(srcPath, scope) {
  if (scope.filesRead.includes(srcPath) || scope.filesWrite.includes(srcPath)) return true;
  return scope.directories.some((d) => {
    const prefix = d.endsWith('/') ? d : `${d}/`;
    return srcPath.startsWith(prefix) || srcPath === d.replace(/\/$/u, '');
  });
}

/** Ham DIRECTIVES metninde aynı satırda hem Reads: hem Files: tuzağını arar. */
export function findSameLineReadsFiles(content) {
  const hits = [];
  content.split('\n').forEach((line, index) => {
    if (/\b(?:Reads?|Oku|Okuma)\s*:/iu.test(line) && /\b(?:Files?|Dosya)\s*:/iu.test(line)) {
      hits.push(index + 1);
    }
  });
  return hits;
}

/**
 * Saf çekirdek: parse edilmiş task listesi + ham içerik üzerinden typed problem
 * listesi ve tablo-projeksiyonu üretir. Parser dışarıdan enjekte edilir (testler
 * dist'e dokunmadan sahte-parser verebilir; üretim CLI dist'ten yükler).
 */
export function checkDirectives({ repoRoot, content, tasks, validateScopeFilesWrite = undefined }) {
  const problems = [];
  const table = [];

  for (const line of findSameLineReadsFiles(content)) {
    problems.push({ code: 'D_SAME_LINE_READS_FILES', severity: SEVERITY.BLOCK, task: null,
      detail: `satır ${line}: aynı satırda hem Reads: hem Files: — parser Reads'te erken döner, write-yetkisi SESSİZCE kaybolur` });
  }

  const writesSeen = new Map();
  tasks.forEach((task, index) => {
    const id = `task-${index + 1}`;
    const scope = task.scope ?? { directories: [], filesRead: [], filesWrite: [] };
    table.push({ id, title: task.title, filesWrite: scope.filesWrite, filesRead: scope.filesRead,
      directories: scope.directories, test: task.testTarget ?? null,
      dependencies: task.dependencies ?? [], priority: task.priority ?? null,
      agent: task.forceAgent ?? null, model: task.forceModel ?? null });

    if (scope.filesWrite.length === 0 && scope.filesRead.length === 0 && scope.directories.length === 0) {
      problems.push({ code: 'D_EMPTY_SCOPE', severity: SEVERITY.BLOCK, task: id,
        detail: 'scope tamamen boş — plan geçer ama EXECUTE landing DECKENT_E077 ile ölür' });
    }
    if (scope.filesWrite.length > 0 && !task.testTarget) {
      problems.push({ code: 'D_NO_TEST', severity: SEVERITY.WARN, task: id,
        detail: 'yazma-yetkili task Test: satırı taşımıyor — worker doğrulamasız kalır' });
    }
    for (const f of scope.filesWrite) {
      if (writesSeen.has(f)) {
        problems.push({ code: 'D_WRITE_COLLISION', severity: SEVERITY.BLOCK, task: id,
          detail: `${f} hem ${writesSeen.get(f)} hem ${id} filesWrite'ında — file-lock çatışması` });
      } else writesSeen.set(f, id);
    }

    const uncovered = new Map();
    const missingFiles = [];
    for (const f of scope.filesWrite) {
      if (!/\.test\.[cm]?[jt]sx?$/u.test(f)) continue;
      const scan = scanDirectSrcImports(repoRoot, f);
      if (!scan.exists) { missingFiles.push(f); continue; }
      for (const src of scan.srcImports) {
        if (!coveredByScope(src, scope)) {
          if (!uncovered.has(src)) uncovered.set(src, []);
          uncovered.get(src).push(f);
        }
      }
    }
    if (uncovered.size > 0) {
      problems.push({ code: 'D_NO_READS_FOR_SRC', severity: SEVERITY.BLOCK, task: id,
        detail: `test-dosyalarının doğrudan import ettiği ${uncovered.size} src-modülü Reads/Files/directories kapsamında değil — worker kontratı okuyamaz (sprint-670 dersi)`,
        uncoveredSrc: [...uncovered.keys()] });
    }
    for (const f of missingFiles) {
      problems.push({ code: 'D_WRITE_TARGET_MISSING', severity: SEVERITY.WARN, task: id,
        detail: `${f} diskte yok — yeni dosya kasıtlı mı?` });
    }

    if (typeof validateScopeFilesWrite === 'function') {
      // Üretimde hiç çağrılmayan doğrulayıcıyı burada canlandırıyoruz —
      // bare-token/basename tespitleri parser'ın KENDİ koduyla yapılır.
      for (const w of validateScopeFilesWrite(scope.filesWrite)?.errors ?? []) {
        problems.push({ code: 'D_BARE_TOKEN', severity: SEVERITY.WARN, task: id, detail: String(w) });
      }
    }
  });

  if (tasks.length === 0) {
    problems.push({ code: 'D_NO_TASKS', severity: SEVERITY.BLOCK, task: null,
      detail: 'parser sıfır task döndürdü — başlık grameri (## Task N: …) eşleşmiyor' });
  }

  const blocks = problems.filter((p) => p.severity === SEVERITY.BLOCK);
  return { ok: blocks.length === 0, taskCount: tasks.length, problems, table };
}

function renderTable(table) {
  const lines = [];
  for (const row of table) {
    const w = row.filesWrite;
    lines.push(`  ${row.id}  ${row.title}`);
    lines.push(`      write(${w.length}): ${w.slice(0, 3).join(', ')}${w.length > 3 ? ', …' : ''}`);
    lines.push(`      read(${row.filesRead.length})  dirs(${row.directories.length})  deps(${row.dependencies.length})  prio=${row.priority ?? '-'}  test=${row.test ? 'VAR' : 'YOK'}${row.agent ? `  agent=${row.agent}` : ''}${row.model ? `  model=${row.model}` : ''}`);
  }
  return lines.join('\n');
}

function isMain() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

async function runCli(argv) {
  let file = 'DIRECTIVES.md'; let root = REPO_ROOT; let json = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--file') file = argv[++i];
    else if (argv[i] === '--root') root = resolve(argv[++i]);
    else if (argv[i] === '--json') json = true;
    else { console.error(`[directives-lint] bilinmeyen bayrak: ${argv[i]}`); process.exit(2); }
  }
  const filePath = resolve(root, file);
  if (!existsSync(filePath)) { console.error(`[directives-lint] ✗ dosya yok: ${filePath}`); process.exit(2); }

  const distParser = join(REPO_ROOT, 'dist/orchestra/task-builder.js');
  const srcParser = join(REPO_ROOT, 'src/orchestra/task-builder.ts');
  if (!existsSync(distParser)) { console.error('[directives-lint] ✗ D_DIST_MISSING — önce build gerekir (gerçek parser dist\'ten yüklenir)'); process.exit(2); }
  if (existsSync(srcParser) && statSync(distParser).mtimeMs < statSync(srcParser).mtimeMs) {
    console.error('[directives-lint] ✗ D_DIST_STALE — dist parser src\'den eski; bayat parser\'la doğrulama yalan olur. build:all sonrası tekrar koş.');
    process.exit(2);
  }

  const tb = await import(distParser);
  const content = readFileSync(filePath, 'utf8');
  let tasks;
  try {
    tasks = tb.parseStructuredDirectives(content);
  } catch (error) {
    console.error(`[directives-lint] ✗ D_PARSE_THROW — üretim parser'ı fırlattı: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const result = checkDirectives({ repoRoot: root, content, tasks, validateScopeFilesWrite: tb.validateScopeFilesWrite });

  if (json) { console.log(JSON.stringify(result, null, 2)); }
  else {
    console.log(`[directives-lint] ${file} — ${result.taskCount} task`);
    console.log(renderTable(result.table));
    for (const p of result.problems) {
      const where = p.task ? ` ${p.task}` : '';
      console.log(`  [${p.severity}]${where} ${p.code} — ${p.detail}${p.uncoveredSrc ? `\n      eksik-Reads: ${p.uncoveredSrc.join(', ')}` : ''}`);
    }
    console.log(result.ok ? '[directives-lint] OK — BLOCK yok, start-öncesi doğrulama geçti.' : '[directives-lint] ✗ BLOCK bulundu — start ETME.');
  }
  process.exit(result.ok ? 0 : 1);
}

if (isMain()) await runCli(process.argv.slice(2));
