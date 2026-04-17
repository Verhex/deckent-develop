#!/usr/bin/env node
// scripts/migrate-brain-v2.mjs
// One-time migration: .brain/*.md → .brain/memory.db
// 7-step verified migration per spec Section 10

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const root = process.argv[2] || process.cwd();
const brainDir = join(root, '.brain');
const dbPath = join(brainDir, 'memory.db');
const archiveDir = join(brainDir, 'archive', 'pre-v2');
const exportsDir = join(brainDir, 'exports');

if (!existsSync(brainDir)) {
  console.error('ERROR: .brain/ directory not found. Run deckent init first.');
  process.exit(1);
}

if (existsSync(dbPath)) {
  console.log('memory.db already exists. To re-migrate, delete it first.');
  process.exit(0);
}

console.log('═══ Deckent Memory V2 Migration ═══\n');

// ─── STEP 1: INVENTORY ─────────────────────────────────────────
console.log('Step 1: Inventory...');
const manifest = { files: {}, counts: {}, hashes: {}, refs: [] };
const mdFiles = ['DECISIONS.md', 'MEMORY.md', 'DEBT.md', 'PATTERNS.md', 'RETRO.md', 'PROJECT-IDENTITY.md'];

for (const file of mdFiles) {
  const filePath = join(brainDir, file);
  if (existsSync(filePath)) {
    const content = readFileSync(filePath, 'utf-8');
    manifest.files[file] = { lines: content.split('\n').length, bytes: content.length };
    manifest.hashes[file] = createHash('sha256').update(content).digest('hex');
  }
}

const decisionsPath = join(brainDir, 'DECISIONS.md');
const decisionsContent = existsSync(decisionsPath) ? readFileSync(decisionsPath, 'utf-8') : '';
manifest.counts.adrs = (decisionsContent.match(/^## ADR-\d+/gm) || []).length;

const memoryPath = join(brainDir, 'MEMORY.md');
const memoryContent = existsSync(memoryPath) ? readFileSync(memoryPath, 'utf-8') : '';
manifest.counts.memorySections = (memoryContent.match(/^## Sprint/gm) || []).length;

console.log(`  ADRs: ${manifest.counts.adrs}, Memory sections: ${manifest.counts.memorySections}`);
console.log(`  Files inventoried: ${Object.keys(manifest.files).length}`);

// ─── STEP 2: BACKUP ────────────────────────────────────────────
console.log('\nStep 2: Backup...');
mkdirSync(archiveDir, { recursive: true });
for (const file of mdFiles) {
  const src = join(brainDir, file);
  if (existsSync(src)) {
    copyFileSync(src, join(archiveDir, file));
  }
}
mkdirSync(exportsDir, { recursive: true });
writeFileSync(join(archiveDir, 'migration-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`  Backed up to ${archiveDir}`);

// ─── STEP 3: PARSE + INSERT ────────────────────────────────────
console.log('\nStep 3: Parse + Insert...');

// Dynamic import from compiled dist/
const { MemoryStore } = await import(join(root, 'dist', 'core', 'memory-store.js'));
const { parseDecisionsMd, parseMemoryMd, parseDebtMd } = await import(join(root, 'dist', 'core', 'memory-import.js'));

const store = new MemoryStore(dbPath);
let insertCount = 0;

// ADRs
if (decisionsContent) {
  const adrs = parseDecisionsMd(decisionsContent);
  for (const adr of adrs) { store.insert(adr); insertCount++; }
  console.log(`  ADRs: ${adrs.length} inserted`);
}

// Memory
if (memoryContent) {
  const memories = parseMemoryMd(memoryContent);
  for (const mem of memories) { store.insert(mem); insertCount++; }
  console.log(`  Memory sections: ${memories.length} inserted`);
}

// Debt
const debtFilePath = join(brainDir, 'DEBT.md');
if (existsSync(debtFilePath)) {
  const debtContent = readFileSync(debtFilePath, 'utf-8');
  const debts = parseDebtMd(debtContent);
  for (const d of debts) { store.insert(d); insertCount++; }
  console.log(`  Debt items: ${debts.length} inserted`);
}

// Retro
const retroPath = join(brainDir, 'RETRO.md');
if (existsSync(retroPath)) {
  const retroContent = readFileSync(retroPath, 'utf-8');
  store.insert({ id: 'retro-latest', type: 'retro', title: 'Latest Retrospective',
    content: retroContent, source: 'brain' });
  insertCount++;
  console.log('  Retro: 1 inserted');
}

// Project Identity
const idPath = join(brainDir, 'PROJECT-IDENTITY.md');
if (existsSync(idPath)) {
  const idContent = readFileSync(idPath, 'utf-8');
  store.insert({ id: 'project-identity', type: 'identity', title: 'Project Identity',
    content: idContent, source: 'system', decay_exempt: true });
  insertCount++;
  console.log('  Project Identity: 1 inserted (decay_exempt)');
}

// Sprint logs
const sprintsDir = join(brainDir, 'sprints');
if (existsSync(sprintsDir)) {
  const sprintFiles = readdirSync(sprintsDir).filter(f => f.endsWith('.md'));
  for (const file of sprintFiles) {
    const content = readFileSync(join(sprintsDir, file), 'utf-8');
    const numMatch = file.match(/(\d+)/);
    const sprintNum = numMatch ? parseInt(numMatch[1], 10) : 0;
    store.insert({ id: `sprint-log-${sprintNum}`, type: 'sprint', title: `Sprint ${sprintNum} Log`,
      content, sprint_id: `sprint-${sprintNum}`, sprint_num: sprintNum, source: 'brain' });
    insertCount++;
  }
  console.log(`  Sprint logs: ${sprintFiles.length} inserted`);
}

console.log(`  Total: ${insertCount} entries`);

// ─── STEP 4: VERIFICATION GATE ─────────────────────────────────
console.log('\nStep 4: Verification gate...');
let gatePass = true;

// Count check
const dbAdrCount = store.getByType('adr').length;
if (dbAdrCount !== manifest.counts.adrs) {
  console.error(`  FAIL: ADR count mismatch. Expected ${manifest.counts.adrs}, got ${dbAdrCount}`);
  gatePass = false;
} else {
  console.log(`  PASS: ADR count: ${dbAdrCount}/${manifest.counts.adrs}`);
}

// Sample verification
const allAdrs = store.getByType('adr');
const sampleSize = Math.max(3, Math.ceil(allAdrs.length * 0.1));
const sample = allAdrs.slice(0, sampleSize);
let samplePass = true;
for (const adr of sample) {
  if (!adr.content || adr.content.length < 10) {
    console.error(`  FAIL: ADR ${adr.id} has empty/short content (${adr.content?.length ?? 0} chars)`);
    samplePass = false;
    gatePass = false;
  }
}
if (samplePass) console.log(`  PASS: Sample check: ${sample.length} ADRs verified (content length OK)`);

// Cross-reference check
const danglingRefs = store.getRawDb().prepare(
  'SELECT r.from_id, r.to_id FROM relations r LEFT JOIN entries e ON r.to_id = e.id WHERE e.id IS NULL'
).all();
if (danglingRefs.length > 0) {
  console.error(`  FAIL: ${danglingRefs.length} dangling relation(s) found`);
  gatePass = false;
} else {
  console.log(`  PASS: Cross-reference: 0 dangling relations`);
}

// FTS5 smoke test
const { searchMemory } = await import(join(root, 'dist', 'core', 'memory-query.js'));
const smokeResults = searchMemory(store, { text: 'TypeScript', type: ['adr'], limit: 3 });
if (smokeResults.length === 0 && manifest.counts.adrs > 0) {
  console.error('  FAIL: FTS5 smoke test: 0 results for "TypeScript" (expected >0)');
  gatePass = false;
} else {
  console.log(`  PASS: FTS5 smoke: ${smokeResults.length} results for "TypeScript"`);
}

if (!gatePass) {
  console.error('\n  VERIFICATION FAILED. Migration aborted. DB kept for inspection.');
  console.error(`  DB path: ${dbPath}`);
  store.close();
  process.exit(1);
}
console.log('  All checks PASSED.');

// ─── STEP 5: EXPORT ────────────────────────────────────────────
console.log('\nStep 5: Export...');
const { exportSummaryMd, exportDecisionsMd, exportMemoryMd, exportDebtMd } = await import(join(root, 'dist', 'core', 'memory-export.js'));

writeFileSync(join(exportsDir, 'summary.md'), exportSummaryMd(store));
writeFileSync(join(exportsDir, 'decisions.md'), exportDecisionsMd(store));
writeFileSync(join(exportsDir, 'memory.md'), exportMemoryMd(store));
writeFileSync(join(exportsDir, 'debt.md'), exportDebtMd(store));
console.log(`  Exported 4 .md files to ${exportsDir}`);

// ─── STEP 6: REFERENCE SWAP ────────────────────────────────────
console.log('\nStep 6: Reference swap...');
const refSwaps = [
  { path: join(root, 'CLAUDE.md'),  from: '@.brain/MEMORY.md',    to: '@.brain/exports/summary.md' },
  { path: join(root, 'DECKENT.md'), from: '@.brain/DECISIONS.md', to: '@.brain/exports/summary.md' },
  { path: join(root, 'DECKENT.md'), from: '@.brain/MEMORY.md',    to: '@.brain/exports/summary.md' },
  { path: join(root, 'AGENTS.md'),  from: '@.brain/MEMORY.md',    to: '@.brain/exports/summary.md' },
];

let swapCount = 0;
for (const ref of refSwaps) {
  if (!existsSync(ref.path)) continue;
  let content = readFileSync(ref.path, 'utf-8');
  if (content.includes(ref.from)) {
    content = content.replace(ref.from, ref.to);
    writeFileSync(ref.path, content);
    console.log(`  ${ref.path.split('/').pop()}: ${ref.from} -> ${ref.to}`);
    swapCount++;
  }
}
console.log(`  ${swapCount} reference(s) swapped`);

// ─── STEP 7: FINAL REPORT ──────────────────────────────────────
store.close();
console.log('\n═══ Migration Complete ═══');
console.log(`  Entries migrated: ${insertCount}`);
console.log(`  DB path: ${dbPath}`);
console.log(`  Exports: ${exportsDir}`);
console.log(`  Backup: ${archiveDir}`);
console.log(`  References swapped: ${swapCount}`);
console.log(`  Original .md files preserved in ${archiveDir}`);
console.log('\n  Next: run `npx tsc --noEmit && npx vitest run` to verify.');
