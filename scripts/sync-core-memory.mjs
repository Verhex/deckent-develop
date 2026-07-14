#!/usr/bin/env node
/**
 * sync-core-memory.mjs — Memory backup auto-sync (user-memory ↔ core-memory)
 *
 * Prevents data loss on session logout by syncing Claude user memory to
 * the git-tracked docs/core-memory/ directory.
 *
 * Usage:
 *   node scripts/sync-core-memory.mjs [--backup|--restore|--bidirectional] [--dry-run]
 *
 * Modes:
 *   --backup        (default) user-memory → docs/core-memory/
 *   --restore       docs/core-memory/ → user-memory
 *   --bidirectional timestamp-based newer-wins merge
 *   --dry-run       show what would happen without writing
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, statSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { homedir } from 'node:os';

// ─── Config ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const mode = args.includes('--restore')
  ? 'restore'
  : args.includes('--bidirectional')
    ? 'bidirectional'
    : 'backup';

const projectRoot = resolve(process.env.DECKENT_PROJECT_ROOT || process.cwd());

const userMemoryDir = resolve(
  process.env.DECKENT_USER_MEMORY_PATH ||
  join(homedir(), '.claude', 'projects', '-home-alperen-deckent-dev', 'memory')
);

const coreMemoryDir = resolve(
  process.env.DECKENT_CORE_MEMORY_PATH ||
  // 2026-07-14 memory-reformu (Alperen): tek repo-içi ayna = .deckent/docs/core-memory
  // (izleme+müdahale noktası); docs/core-memory kopyası kaldırıldı.
  join(projectRoot, '.deckent', 'docs', 'core-memory')
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function listMarkdownFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.md'));
}

function readFile(path) {
  try { return readFileSync(path, 'utf-8'); } catch { return null; }
}

function writeFile(path, content) {
  if (dryRun) return;
  writeFileSync(path, content, 'utf-8');
}

function mtime(path) {
  try { return statSync(path).mtimeMs; } catch { return 0; }
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ─── Sync logic ──────────────────────────────────────────────────────────────

function syncBackup() {
  if (!existsSync(userMemoryDir)) {
    console.log(`[sync] User memory dir not found: ${userMemoryDir}`);
    console.log('[sync] Synced 0 entries');
    return { synced: 0, skipped: 0 };
  }

  ensureDir(coreMemoryDir);
  const files = listMarkdownFiles(userMemoryDir);
  // MIRROR (2026-07-14): hedefte olup kaynakta olmayan .md dosyaları SİLİNİR —
  // aksi halde kaynaktan silinen eski memory'ler aynada hayalet olarak yaşar
  // (bugünkü kirliliğin kökü). archive/ alt-dizini kaynak-listeye girmediği
  // için aynaya hiç taşınmaz.
  const srcSet = new Set(files);
  for (const stale of listMarkdownFiles(coreMemoryDir)) {
    if (!srcSet.has(stale)) {
      if (!dryRun) unlinkSync(join(coreMemoryDir, stale));
      console.log(`[sync] mirror-removed stale: ${stale}`);
    }
  }
  let synced = 0;
  let skipped = 0;

  for (const file of files) {
    const src = join(userMemoryDir, file);
    const dst = join(coreMemoryDir, file);
    const srcContent = readFile(src);
    const dstContent = readFile(dst);

    if (srcContent === dstContent) {
      skipped++;
      continue;
    }

    console.log(`[sync] ${dryRun ? 'would copy' : 'copy'} ${file}`);
    writeFile(dst, srcContent);
    synced++;
  }

  console.log(`[sync] Synced ${synced} entries (${skipped} unchanged)`);
  return { synced, skipped };
}

function syncRestore() {
  if (!existsSync(coreMemoryDir)) {
    console.log(`[sync] Core memory dir not found: ${coreMemoryDir}`);
    console.log('[sync] Synced 0 entries');
    return { synced: 0, skipped: 0 };
  }

  ensureDir(userMemoryDir);
  const files = listMarkdownFiles(coreMemoryDir);
  let synced = 0;
  let skipped = 0;

  for (const file of files) {
    const src = join(coreMemoryDir, file);
    const dst = join(userMemoryDir, file);
    const srcContent = readFile(src);
    const dstContent = readFile(dst);

    if (srcContent === dstContent) {
      skipped++;
      continue;
    }

    console.log(`[sync] ${dryRun ? 'would restore' : 'restore'} ${file}`);
    writeFile(dst, srcContent);
    synced++;
  }

  // Stale detection: files in userDir not in coreDir
  if (existsSync(userMemoryDir)) {
    const userFiles = new Set(listMarkdownFiles(userMemoryDir));
    const coreFiles = new Set(files);
    const userOnly = [...userFiles].filter(f => !coreFiles.has(f));
    if (userOnly.length > 0) {
      console.log(`[sync] WARN: ${userOnly.length} user-only entries not in core-memory:`);
      for (const f of userOnly) console.log(`  - ${f}`);
    }
  }

  // Check if user memory is complete (all entries present)
  const missing = files.filter(f => !existsSync(join(userMemoryDir, f)));
  if (missing.length === 0 && synced === 0) {
    console.log('[sync] All entries present');
  }
  console.log(`[sync] Synced ${synced} entries (${skipped} unchanged)`);
  return { synced, skipped };
}

function syncBidirectional() {
  ensureDir(coreMemoryDir);
  ensureDir(userMemoryDir);

  const userFiles = new Set(listMarkdownFiles(userMemoryDir));
  const coreFiles = new Set(listMarkdownFiles(coreMemoryDir));
  const allFiles = new Set([...userFiles, ...coreFiles]);

  let synced = 0;
  let skipped = 0;
  const userOnly = [];
  const coreOnly = [];

  for (const file of allFiles) {
    const userPath = join(userMemoryDir, file);
    const corePath = join(coreMemoryDir, file);
    const inUser = userFiles.has(file);
    const inCore = coreFiles.has(file);

    if (inUser && !inCore) {
      userOnly.push(file);
      console.log(`[sync] user-only: ${file} — ${dryRun ? 'would copy' : 'copying'} to core`);
      writeFile(corePath, readFile(userPath));
      synced++;
      continue;
    }

    if (inCore && !inUser) {
      coreOnly.push(file);
      console.log(`[sync] core-only: ${file} — ${dryRun ? 'would copy' : 'copying'} to user`);
      writeFile(userPath, readFile(corePath));
      synced++;
      continue;
    }

    // Both exist — newer wins
    const userMtime = mtime(userPath);
    const coreMtime = mtime(corePath);
    const userContent = readFile(userPath);
    const coreContent = readFile(corePath);

    if (userContent === coreContent) { skipped++; continue; }

    if (userMtime >= coreMtime) {
      console.log(`[sync] user newer: ${file} — ${dryRun ? 'would update' : 'updating'} core`);
      writeFile(corePath, userContent);
    } else {
      console.log(`[sync] core newer: ${file} — ${dryRun ? 'would update' : 'updating'} user`);
      writeFile(userPath, coreContent);
    }
    synced++;
  }

  if (userOnly.length > 0 || coreOnly.length > 0) {
    console.log(`[sync] WARN: stale divergence — user-only: ${userOnly.length}, core-only: ${coreOnly.length}`);
  }

  console.log(`[sync] Synced ${synced} entries (${skipped} unchanged)`);
  return { synced, skipped };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

if (dryRun) console.log('[sync] DRY RUN — no files will be written');
console.log(`[sync] mode=${mode}, user=${userMemoryDir}, core=${coreMemoryDir}`);

let result;
if (mode === 'restore') result = syncRestore();
else if (mode === 'bidirectional') result = syncBidirectional();
else result = syncBackup();

export { syncBackup, syncRestore, syncBidirectional };
