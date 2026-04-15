#!/usr/bin/env node
/**
 * Dead Code Audit — Sprint 139, Step 1 (READ-ONLY)
 *
 * Scans the codebase for unused exports, dormant modules, and dead code.
 * Does NOT delete any code — produces a categorized report.
 *
 * Categories:
 *   Dead     — exported but never imported in any src/ file
 *   Dormant  — module exists but protected by ADR or flagged @deprecated
 *   Lightly  — exported, imported by only 1 file (fragile coupling)
 *   Active   — exported, imported by 2+ files (healthy)
 *
 * Exit codes:
 *   0 — audit completed successfully
 *   1 — audit failed (I/O error or invalid project)
 *
 * Usage:
 *   node scripts/dead-code-audit.mjs [--root <path>] [--json]
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, relative, basename, dirname } from 'node:path';

// ─── CLI args ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const outputJson = args.includes('--json');
const rootIdx = args.indexOf('--root');
const projectRoot = rootIdx !== -1 && args[rootIdx + 1]
  ? resolve(args[rootIdx + 1])
  : process.cwd();

// ─── Known suspects (Sprint 132 audit + ADR-028) ──────────────────────────

const KNOWN_SUSPECTS = [
  {
    module: 'src/orchestra/decision-engine.ts',
    reason: 'V1 DecisionOrchestrator — deprecated by ADR-028, kept as reference',
    adrProtected: true,
  },
  {
    module: 'src/orchestra/decision-replay.ts',
    reason: 'V1 decision replay — deprecated by ADR-028, kept as reference',
    adrProtected: true,
  },
  {
    module: 'src/orchestra/decision-steps/agent-step.ts',
    reason: 'V1 agent step — deprecated by ADR-028, kept as reference',
    adrProtected: true,
  },
  {
    module: 'src/orchestra/decision-steps/scope-step.ts',
    reason: 'V1 scope step — deprecated by ADR-028, kept as reference',
    adrProtected: true,
  },
  {
    module: 'src/orchestra/learning-decay.ts',
    reason: 'Sprint 132 audit suspect — not imported by any src/ file',
    adrProtected: false,
  },
  {
    module: 'src/orchestra/learning-migration.ts',
    reason: 'Sprint 132 audit suspect — not imported by any src/ file',
    adrProtected: false,
  },
  {
    module: 'src/orchestra/combination-scorer.ts',
    reason: 'Sprint 132 audit suspect — not imported by any src/ file',
    adrProtected: false,
  },
  {
    module: 'src/orchestra/handoff-protocol.ts',
    reason: 'Sprint 132 audit suspect — not imported by any src/ file',
    adrProtected: false,
  },
  {
    module: 'src/orchestra/multi-agent.ts',
    reason: 'Pipeline orchestration — not imported by any src/ file',
    adrProtected: false,
  },
  {
    module: 'src/orchestra/batch-stats.ts',
    reason: 'Stats batching utility — not imported by any src/ file',
    adrProtected: false,
  },
  {
    module: 'src/orchestra/brain-context.ts',
    reason: 'Context enrichment functions — not imported by any src/ file',
    adrProtected: false,
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * List all TypeScript source files under src/ (excluding .d.ts)
 * @param {string} dir
 * @returns {string[]}
 */
function listSourceFiles(dir) {
  const result = spawnSync('find', [dir, '-name', '*.ts', '-not', '-name', '*.d.ts', '-not', '-path', '*/node_modules/*'], {
    cwd: projectRoot,
    encoding: 'utf-8',
    timeout: 30_000,
  });
  if (result.status !== 0) return [];
  return result.stdout.trim().split('\n').filter(Boolean);
}

/**
 * Extract exported identifiers from a TypeScript file.
 * Matches: export function, export class, export const, export interface,
 *          export type, export enum, export { ... }
 * @param {string} filePath
 * @returns {string[]}
 */
export function findExports(filePath) {
  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const exports = new Set();

  // export function/class/const/let/var/interface/type/enum NAME
  const declRegex = /export\s+(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/g;
  let m;
  while ((m = declRegex.exec(content)) !== null) {
    exports.add(m[1]);
  }

  // export { Name, Name as Alias }
  const braceRegex = /export\s*\{([^}]+)\}/g;
  while ((m = braceRegex.exec(content)) !== null) {
    const inner = m[1];
    for (const part of inner.split(',')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      // "Foo as Bar" — take the alias (Bar) since that's the public name
      const asMatch = trimmed.match(/(\w+)\s+as\s+(\w+)/);
      if (asMatch) {
        exports.add(asMatch[2]);
      } else {
        const nameOnly = trimmed.match(/^(\w+)/);
        if (nameOnly) exports.add(nameOnly[1]);
      }
    }
  }

  // export default — track as "default"
  if (/export\s+default\s/.test(content)) {
    exports.add('default');
  }

  return [...exports];
}

/**
 * Count how many src/ files import a given identifier (excludes the defining file).
 * Uses grep for performance.
 * @param {string} identifier
 * @param {string} definingFile - relative path of the file that defines it
 * @returns {number}
 */
function countImporters(identifier, definingFile) {
  const result = spawnSync('grep', [
    '-r', '-l',
    '--include=*.ts',
    '--exclude-dir=node_modules',
    '--exclude-dir=dist',
    '--exclude-dir=tests',
    identifier,
    join(projectRoot, 'src'),
  ], { encoding: 'utf-8', timeout: 15_000 });

  if (result.status !== 0 && result.status !== 1) return 0;
  const files = (result.stdout || '').trim().split('\n').filter(Boolean);

  // Exclude the defining file itself
  const defFull = resolve(projectRoot, definingFile);
  return files.filter(f => resolve(f) !== defFull).length;
}

/**
 * Check if a module file is imported anywhere in src/ (by its module path).
 * @param {string} modulePath - e.g. "src/orchestra/learning-decay.ts"
 * @returns {{ importedBy: string[], count: number }}
 */
function findModuleImporters(modulePath) {
  // Build search patterns: both .js (ESM import) and bare name
  const baseName = basename(modulePath, '.ts');
  const dirName = basename(dirname(modulePath));

  // Search for imports like: from './learning-decay.js' or from '../orchestra/learning-decay.js'
  const result = spawnSync('grep', [
    '-r', '-l',
    '--include=*.ts',
    '--exclude-dir=node_modules',
    '--exclude-dir=dist',
    `${baseName}`,
    join(projectRoot, 'src'),
  ], { encoding: 'utf-8', timeout: 15_000 });

  if (result.status !== 0 && result.status !== 1) return { importedBy: [], count: 0 };
  const files = (result.stdout || '').trim().split('\n').filter(Boolean);

  // Exclude the file itself
  const selfFull = resolve(projectRoot, modulePath);
  const importers = files
    .filter(f => resolve(f) !== selfFull)
    .map(f => relative(projectRoot, f));

  return { importedBy: importers, count: importers.length };
}

/**
 * Audit known suspects from Sprint 132 and other investigations.
 * @returns {Array<{ module: string, category: string, reason: string, importCount: number, importedBy: string[], lineCount: number }>}
 */
export function auditKnownSuspects() {
  const results = [];

  for (const suspect of KNOWN_SUSPECTS) {
    const fullPath = join(projectRoot, suspect.module);
    if (!existsSync(fullPath)) continue;

    const content = readFileSync(fullPath, 'utf-8');
    const lineCount = content.split('\n').length;
    const { importedBy, count } = findModuleImporters(suspect.module);

    let category;
    if (suspect.adrProtected) {
      category = 'Dormant';
    } else if (count === 0) {
      category = 'Dead';
    } else if (count === 1) {
      category = 'Lightly-Used';
    } else {
      category = 'Active';
    }

    results.push({
      module: suspect.module,
      category,
      reason: suspect.reason,
      importCount: count,
      importedBy,
      lineCount,
    });
  }

  return results;
}

/**
 * Find unused exports across all src/ files.
 * @returns {Array<{ file: string, export: string, importCount: number }>}
 */
export function findUnusedExports() {
  const srcDir = join(projectRoot, 'src');
  if (!existsSync(srcDir)) return [];

  const files = listSourceFiles(srcDir);
  const unused = [];

  for (const file of files) {
    const relPath = relative(projectRoot, file);
    // Skip index/barrel files (re-exports are not "usage")
    if (basename(file) === 'index.ts') continue;
    // Skip test files, declaration files
    if (relPath.startsWith('tests/')) continue;
    if (file.endsWith('.d.ts')) continue;

    const exports = findExports(file);
    for (const exp of exports) {
      // Skip common non-meaningful exports
      if (exp === 'default') continue;
      // Skip TypeScript type-only exports (interface/type often re-exported)
      // We still check them but with lower priority

      const count = countImporters(exp, relPath);
      if (count === 0) {
        unused.push({ file: relPath, export: exp, importCount: 0 });
      }
    }
  }

  return unused;
}

/**
 * Generate the full audit report.
 * @param {{ suspectResults: Array, unusedExports: Array }} data
 * @returns {string}
 */
export function generateReport(data) {
  const { suspectResults, unusedExports } = data;

  const dead = suspectResults.filter(r => r.category === 'Dead');
  const dormant = suspectResults.filter(r => r.category === 'Dormant');
  const lightlyUsed = suspectResults.filter(r => r.category === 'Lightly-Used');
  const active = suspectResults.filter(r => r.category === 'Active');

  const totalDeadLines = dead.reduce((sum, r) => sum + r.lineCount, 0);
  const totalDormantLines = dormant.reduce((sum, r) => sum + r.lineCount, 0);

  let md = `# Dead Code Audit Report — Sprint 139\n\n`;
  md += `**Date:** ${new Date().toISOString().split('T')[0]}\n`;
  md += `**Tool:** scripts/dead-code-audit.mjs\n`;
  md += `**Scope:** src/ directory (read-only analysis)\n\n`;

  md += `## Summary\n\n`;
  md += `| Category | Modules | Total Lines |\n`;
  md += `|----------|---------|-------------|\n`;
  md += `| Dead | ${dead.length} | ${totalDeadLines} |\n`;
  md += `| Dormant (ADR-protected) | ${dormant.length} | ${totalDormantLines} |\n`;
  md += `| Lightly-Used | ${lightlyUsed.length} | ${lightlyUsed.reduce((s, r) => s + r.lineCount, 0)} |\n`;
  md += `| Active | ${active.length} | ${active.reduce((s, r) => s + r.lineCount, 0)} |\n\n`;

  // Dead section
  md += `## Dead Code (safe to remove)\n\n`;
  if (dead.length === 0) {
    md += `No dead modules found among known suspects.\n\n`;
  } else {
    md += `These modules have **zero imports** in src/ and are not protected by any ADR.\n\n`;
    for (const r of dead) {
      md += `### ${r.module}\n`;
      md += `- **Lines:** ${r.lineCount}\n`;
      md += `- **Reason:** ${r.reason}\n`;
      md += `- **Imported by:** nobody\n`;
      md += `- **Action:** Safe to remove in Step 2\n\n`;
    }
  }

  // Dormant section
  md += `## Dormant Code (ADR-protected, do not remove)\n\n`;
  if (dormant.length === 0) {
    md += `No dormant modules found.\n\n`;
  } else {
    md += `These modules are deprecated but preserved by ADR decisions.\n\n`;
    for (const r of dormant) {
      md += `### ${r.module}\n`;
      md += `- **Lines:** ${r.lineCount}\n`;
      md += `- **Reason:** ${r.reason}\n`;
      md += `- **Imported by:** ${r.importCount > 0 ? r.importedBy.join(', ') : 'nobody (test-only)'}\n`;
      md += `- **Action:** Keep — requires ADR amendment to remove\n\n`;
    }
  }

  // Lightly-Used section
  md += `## Lightly-Used Code (single consumer)\n\n`;
  if (lightlyUsed.length === 0) {
    md += `No lightly-used modules found among known suspects.\n\n`;
  } else {
    md += `These modules are imported by only 1 file — fragile coupling.\n\n`;
    for (const r of lightlyUsed) {
      md += `### ${r.module}\n`;
      md += `- **Lines:** ${r.lineCount}\n`;
      md += `- **Reason:** ${r.reason}\n`;
      md += `- **Imported by:** ${r.importedBy.join(', ')}\n`;
      md += `- **Action:** Monitor — consider inlining if consumer is the only user\n\n`;
    }
  }

  // Active section
  md += `## Active Code (healthy usage)\n\n`;
  if (active.length === 0) {
    md += `No active modules among known suspects (all suspects confirmed as dead or dormant).\n\n`;
  } else {
    md += `These suspects turned out to be actively used.\n\n`;
    for (const r of active) {
      md += `- **${r.module}** — ${r.importCount} importers (${r.importedBy.join(', ')})\n`;
    }
    md += `\n`;
  }

  // Unused exports section (sampling)
  md += `## Unused Export Sampling\n\n`;
  if (unusedExports.length === 0) {
    md += `No unused exports found (or analysis was skipped).\n\n`;
  } else {
    md += `Found **${unusedExports.length}** potentially unused exports across src/.\n`;
    md += `Top 20 shown below (full list requires deeper analysis):\n\n`;
    md += `| File | Export | Import Count |\n`;
    md += `|------|--------|-------------|\n`;
    const top = unusedExports.slice(0, 20);
    for (const e of top) {
      md += `| ${e.file} | ${e.export} | ${e.importCount} |\n`;
    }
    md += `\n`;
  }

  // Recommendations
  md += `## Recommendations\n\n`;
  md += `1. **Step 2 (Sprint 140+):** Remove Dead modules (${dead.length} files, ~${totalDeadLines} LoC) with full test verification\n`;
  md += `2. **ADR Amendment:** If V1 decision engine is no longer needed as reference, amend ADR-028 to allow removal (~${totalDormantLines} LoC)\n`;
  md += `3. **Lightly-Used Review:** Consider inlining single-consumer modules to reduce coupling\n`;
  md += `4. **Unused Export Cleanup:** Review top unused exports for dead function-level code\n`;

  return md;
}

// ─── Main ──────────────────────────────────────────────────────────────────

function main() {
  const srcDir = join(projectRoot, 'src');
  if (!existsSync(srcDir)) {
    console.error(`ERROR: src/ directory not found at ${srcDir}`);
    process.exit(1);
  }

  console.log('Dead Code Audit — Sprint 139 Step 1 (READ-ONLY)');
  console.log(`Project root: ${projectRoot}`);
  console.log('');

  // Phase 1: Audit known suspects
  console.log('Phase 1: Auditing known suspects...');
  const suspectResults = auditKnownSuspects();
  console.log(`  Found ${suspectResults.length} suspects analyzed`);

  for (const r of suspectResults) {
    const icon = r.category === 'Dead' ? '  [DEAD]' :
                 r.category === 'Dormant' ? '  [DORMANT]' :
                 r.category === 'Lightly-Used' ? '  [LIGHT]' : '  [ACTIVE]';
    console.log(`${icon} ${r.module} (${r.lineCount} lines, ${r.importCount} importers)`);
  }

  // Phase 2: Find unused exports (lightweight sampling — full scan is expensive)
  console.log('');
  console.log('Phase 2: Scanning for unused exports (sampling)...');

  // Only scan key directories to keep runtime reasonable
  const unusedExports = [];
  const keyDirs = ['src/orchestra', 'src/core', 'src/monitor', 'src/agents'];
  for (const dir of keyDirs) {
    const dirPath = join(projectRoot, dir);
    if (!existsSync(dirPath)) continue;
    const files = listSourceFiles(dirPath);
    for (const file of files) {
      const relPath = relative(projectRoot, file);
      if (basename(file) === 'index.ts') continue;
      const exports = findExports(file);
      for (const exp of exports) {
        if (exp === 'default') continue;
        const count = countImporters(exp, relPath);
        if (count === 0) {
          unusedExports.push({ file: relPath, export: exp, importCount: 0 });
        }
      }
    }
  }
  console.log(`  Found ${unusedExports.length} potentially unused exports`);

  // Phase 3: Generate report
  console.log('');
  console.log('Phase 3: Generating report...');
  const report = generateReport({ suspectResults, unusedExports });

  // Write markdown report
  const reportDir = join(projectRoot, 'docs', 'audits', 'sprint-139');
  mkdirSync(reportDir, { recursive: true });
  const reportPath = join(reportDir, 'dead-code-report.md');
  writeFileSync(reportPath, report, 'utf-8');
  console.log(`  Report written: ${relative(projectRoot, reportPath)}`);

  // JSON output
  if (outputJson) {
    const jsonOutput = {
      timestamp: new Date().toISOString(),
      suspectResults,
      unusedExports,
      summary: {
        dead: suspectResults.filter(r => r.category === 'Dead').length,
        dormant: suspectResults.filter(r => r.category === 'Dormant').length,
        lightlyUsed: suspectResults.filter(r => r.category === 'Lightly-Used').length,
        active: suspectResults.filter(r => r.category === 'Active').length,
        unusedExportCount: unusedExports.length,
      },
    };
    console.log(JSON.stringify(jsonOutput, null, 2));
  }

  console.log('');
  console.log('Audit complete (read-only — no code was modified).');
  process.exit(0);
}

// Only run main() when invoked directly (not when imported by tests)
const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isDirectRun) {
  main();
}
