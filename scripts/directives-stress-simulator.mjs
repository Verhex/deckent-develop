// scripts/directives-stress-simulator.mjs
//
// EXECUTE phase içinde deliberate olarak DIRECTIVES.md'yi template'e dönüştür
// (sadece test amacıyla, 5 saniye sonra otomatik restore edilir)
//
// Sprint 148 Task 11 — DirectivesMidSprintProtection Canlı Stress Test
// Usage: node scripts/directives-stress-simulator.mjs /path/to/project

import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];

if (!root) {
  console.error('[stress-sim] Usage: node directives-stress-simulator.mjs <project-root>');
  process.exit(1);
}

const backupPath = join(root, '.directives-backup.md');
const directivesPath = join(root, 'DIRECTIVES.md');

if (!existsSync(directivesPath)) {
  console.error(`[stress-sim] DIRECTIVES.md not found at ${directivesPath}`);
  process.exit(1);
}

// Backup original
const original = readFileSync(directivesPath, 'utf-8');
writeFileSync(backupPath, original);

// Overwrite with template (triggers detector)
const template = `# DIRECTIVES — (Sprint 149 için hazırlanıyor)\n\n## Task 1: (Task başlığı)\n- Model: sonnet\n`;
writeFileSync(directivesPath, template);

console.log('[stress-sim] DIRECTIVES overwritten, detector should alert within 5s');

// Auto-restore after 5s (safety)
setTimeout(() => {
  writeFileSync(directivesPath, original);
  console.log('[stress-sim] DIRECTIVES auto-restored');

  // Cleanup backup
  if (existsSync(backupPath)) {
    unlinkSync(backupPath);
    console.log('[stress-sim] Backup file cleaned up');
  }

  process.exit(0);
}, 5000);
