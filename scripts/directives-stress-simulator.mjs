// ╔══════════════════════════════════════════════════════════════════════╗
// ║  UYARI — Bu script DIRECTIVES.md'yi kasıtlı olarak üzerine yazar.  ║
// ║  Yanlışlıkla çalıştırırsanız aktif sprint direktifleri BOZULUR.    ║
// ║  Kullanmadan önce: DECKENT_STRESS_SIMULATE=1 env'i set edin        ║
// ║  VEYA --force bayrağı ile çağırın. Otomatik yedek alınır.          ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// scripts/directives-stress-simulator.mjs
//
// EXECUTE phase içinde deliberate olarak DIRECTIVES.md'yi template'e dönüştür
// (sadece test amacıyla, 5 saniye sonra otomatik restore edilir)
//
// Sprint 148 Task 11 — DirectivesMidSprintProtection Canlı Stress Test
// Sprint 189 Task 14 — Accidental-run protection + timestamped backup
//
// Usage (safe):
//   DECKENT_STRESS_SIMULATE=1 node scripts/directives-stress-simulator.mjs <root>
//   node scripts/directives-stress-simulator.mjs --force <root>

import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// ─── Safety gate ──────────────────────────────────────────────────────────
// Prevent accidental execution without explicit opt-in.
const hasForce = process.argv.includes('--force');
const hasEnvFlag = process.env.DECKENT_STRESS_SIMULATE === '1';

if (!hasForce && !hasEnvFlag) {
  console.error('[stress-sim] ERROR: This script deliberately overwrites DIRECTIVES.md.');
  console.error('[stress-sim] Running it without an explicit opt-in would corrupt your sprint.');
  console.error('[stress-sim]');
  console.error('[stress-sim] To run, choose one of:');
  console.error('[stress-sim]   DECKENT_STRESS_SIMULATE=1 node scripts/directives-stress-simulator.mjs <root>');
  console.error('[stress-sim]   node scripts/directives-stress-simulator.mjs --force <root>');
  console.error('[stress-sim]');
  console.error('[stress-sim] Exiting to protect your sprint directives.');
  process.exit(1);
}

// ─── Argument parsing ─────────────────────────────────────────────────────
// When --force is passed, skip it from argv so positional args stay intact.
const filteredArgs = process.argv.slice(2).filter(a => a !== '--force');
const root = filteredArgs[0];

if (!root) {
  console.error('[stress-sim] Usage: node directives-stress-simulator.mjs [--force] <project-root>');
  console.error('[stress-sim]    or: DECKENT_STRESS_SIMULATE=1 node directives-stress-simulator.mjs <project-root>');
  process.exit(1);
}

const backupPath = join(root, '.directives-backup.md');
const directivesPath = join(root, 'DIRECTIVES.md');

if (!existsSync(directivesPath)) {
  console.error(`[stress-sim] DIRECTIVES.md not found at ${directivesPath}`);
  process.exit(1);
}

// ─── Backup ───────────────────────────────────────────────────────────────
// Two backups: legacy root-level + timestamped in .tmp/ for traceability.
const original = readFileSync(directivesPath, 'utf-8');

// Legacy backup (kept for backward compat with existing tooling)
writeFileSync(backupPath, original);

// Timestamped backup in .tmp/
const tmpDir = join(root, '.tmp');
mkdirSync(tmpDir, { recursive: true });
const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
const timestampedBackup = join(tmpDir, `directives-backup-${dateStr}.md`);
writeFileSync(timestampedBackup, original);
console.log(`[stress-sim] Backup saved: ${timestampedBackup}`);

// ─── Stress: overwrite with template ──────────────────────────────────────
const template = `# DIRECTIVES — (Sprint 149 için hazırlanıyor)\n\n## Task 1: (Task başlığı)\n- Model: sonnet\n`;
writeFileSync(directivesPath, template);

console.log('[stress-sim] DIRECTIVES overwritten, detector should alert within 5s');

// ─── Auto-restore after 5s ────────────────────────────────────────────────
setTimeout(() => {
  writeFileSync(directivesPath, original);
  console.log('[stress-sim] DIRECTIVES auto-restored');

  // Cleanup legacy backup
  if (existsSync(backupPath)) {
    unlinkSync(backupPath);
    console.log('[stress-sim] Legacy backup cleaned up');
  }

  process.exit(0);
}, 5000);
