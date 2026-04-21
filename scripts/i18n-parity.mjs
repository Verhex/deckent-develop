#!/usr/bin/env node
/**
 * i18n-parity.mjs — TR ↔ EN document section parity checker
 *
 * Checks that TR translations have matching sections for all EN docs.
 * Reports missing sections, extra sections, and structural differences.
 *
 * Usage: node scripts/i18n-parity.mjs [--json] [--report]
 *   --json    Output JSON instead of human-readable
 *   --report  Write markdown report to docs/audits/sprint-149/i18n-parity-report.md
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const args = process.argv.slice(2);
const OUTPUT_JSON = args.includes('--json');
const WRITE_REPORT = args.includes('--report');

// Document pairs: [EN path, TR path, pair name]
const DOC_PAIRS = [
  ['README.md', 'README-TR.md', 'README'],
  ['VISION.md', 'VISION-TR.md', 'VISION'],
  ['BETA-TRACKER.md', 'BETA-TRACKER-TR.md', 'BETA-TRACKER'],
  ['DECKENT-MASTER-BLUEPRINT.md', 'DECKENT-ANA-PLAN-TR.md', 'MASTER-BLUEPRINT / ANA-PLAN'],
];

/**
 * Normalize a heading for comparison:
 * - Remove emojis
 * - Lowercase
 * - Normalize Turkish chars to ASCII equivalents
 * - Collapse whitespace
 * - Remove markdown special chars (##, bold markers)
 */
function normalizeHeading(heading) {
  return heading
    .replace(/^#+\s*/, '')          // Remove ## markers
    .replace(/[\u{1F300}-\u{1FFFF}]/gu, '') // Remove emoji (Unicode ranges)
    .replace(/[✅❌🚀⚡🔥💡🎯📊🛡️🧠]/g, '') // Remove common emoji
    .replace(/ş/g, 's').replace(/Ş/g, 's')
    .replace(/ğ/g, 'g').replace(/Ğ/g, 'g')
    .replace(/ı/g, 'i').replace(/İ/g, 'i')
    .replace(/ö/g, 'o').replace(/Ö/g, 'o')
    .replace(/ü/g, 'u').replace(/Ü/g, 'u')
    .replace(/ç/g, 'c').replace(/Ç/g, 'c')
    .replace(/[*_`]/g, '')          // Remove markdown formatting
    .replace(/\s+/g, ' ')           // Collapse whitespace
    .trim()
    .toLowerCase();
}

/**
 * Extract headings (## and ###) from markdown content.
 * Returns array of {level, raw, normalized} objects.
 */
function extractHeadings(content) {
  const lines = content.split('\n');
  const headings = [];

  for (const line of lines) {
    const match = line.match(/^(#{2,3})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const raw = match[2].trim();
      headings.push({
        level,
        raw,
        normalized: normalizeHeading(raw),
      });
    }
  }

  return headings;
}

/**
 * Compare EN and TR heading sets.
 * Returns { missingInTR, extraInTR, matched, total }
 */
function compareHeadings(enHeadings, trHeadings) {
  const enNorm = new Set(enHeadings.map(h => h.normalized));
  const trNorm = new Set(trHeadings.map(h => h.normalized));

  const missingInTR = enHeadings.filter(h => !trNorm.has(h.normalized));
  const extraInTR = trHeadings.filter(h => !enNorm.has(h.normalized));
  const matched = enHeadings.filter(h => trNorm.has(h.normalized));

  return {
    missingInTR,
    extraInTR,
    matched,
    totalEN: enHeadings.length,
    totalTR: trHeadings.length,
    coverage: enHeadings.length > 0
      ? Math.round((matched.length / enHeadings.length) * 100)
      : 100,
  };
}

/**
 * Analyze a single document pair.
 */
function analyzePair(enPath, trPath, pairName) {
  const enFull = join(ROOT, enPath);
  const trFull = join(ROOT, trPath);

  const result = {
    pair: pairName,
    enPath,
    trPath,
    enExists: existsSync(enFull),
    trExists: existsSync(trFull),
    analysis: null,
    error: null,
  };

  if (!result.enExists) {
    result.error = `EN file not found: ${enPath}`;
    return result;
  }
  if (!result.trExists) {
    result.error = `TR file not found: ${trPath}`;
    return result;
  }

  try {
    const enContent = readFileSync(enFull, 'utf-8');
    const trContent = readFileSync(trFull, 'utf-8');

    const enHeadings = extractHeadings(enContent);
    const trHeadings = extractHeadings(trContent);

    result.analysis = compareHeadings(enHeadings, trHeadings);
    result.enLines = enContent.split('\n').length;
    result.trLines = trContent.split('\n').length;
    result.lineCoverage = result.enLines > 0
      ? Math.round((result.trLines / result.enLines) * 100)
      : 100;
  } catch (err) {
    result.error = err.message;
  }

  return result;
}

/**
 * Generate markdown report.
 */
function generateReport(results, timestamp) {
  const lines = [
    `# TR/EN Parity Report`,
    ``,
    `> Generated: ${timestamp}`,
    `> Script: scripts/i18n-parity.mjs`,
    ``,
    `## Summary`,
    ``,
    `| Document Pair | EN Sections | TR Sections | Missing in TR | Extra in TR | Coverage |`,
    `|---------------|-------------|-------------|---------------|-------------|----------|`,
  ];

  for (const r of results) {
    if (r.error) {
      lines.push(`| ${r.pair} | — | — | ERROR | ERROR | — |`);
    } else {
      const a = r.analysis;
      lines.push(
        `| ${r.pair} | ${a.totalEN} | ${a.totalTR} | ${a.missingInTR.length} | ${a.extraInTR.length} | ${a.coverage}% |`
      );
    }
  }

  lines.push('');
  lines.push('## Detailed Analysis');
  lines.push('');

  for (const r of results) {
    lines.push(`### ${r.pair}`);
    lines.push('');
    lines.push(`**Files:**`);
    lines.push(`- EN: \`${r.enPath}\` (${r.enExists ? `${r.enLines} lines` : 'NOT FOUND'})`);
    lines.push(`- TR: \`${r.trPath}\` (${r.trExists ? `${r.trLines} lines` : 'NOT FOUND'})`);
    lines.push('');

    if (r.error) {
      lines.push(`**Error:** ${r.error}`);
      lines.push('');
      continue;
    }

    const a = r.analysis;
    lines.push(`**Section Coverage:** ${a.coverage}% (${a.matched.length}/${a.totalEN} sections matched)`);
    lines.push(`**Line Ratio:** ${r.lineCoverage}% (TR has ${r.trLines} vs EN ${r.enLines} lines)`);
    lines.push('');

    if (a.missingInTR.length > 0) {
      lines.push(`**Missing in TR (${a.missingInTR.length} sections):**`);
      for (const h of a.missingInTR) {
        const prefix = '#'.repeat(h.level);
        lines.push(`- \`${prefix} ${h.raw}\``);
      }
      lines.push('');
    } else {
      lines.push(`**Missing in TR:** None ✅`);
      lines.push('');
    }

    if (a.extraInTR.length > 0) {
      lines.push(`**Extra in TR (${a.extraInTR.length} sections — TR-only content):**`);
      for (const h of a.extraInTR) {
        const prefix = '#'.repeat(h.level);
        lines.push(`- \`${prefix} ${h.raw}\``);
      }
      lines.push('');
    } else {
      lines.push(`**Extra in TR:** None`);
      lines.push('');
    }

    if (a.matched.length > 0) {
      lines.push(`**Matched Sections (${a.matched.length}):**`);
      for (const h of a.matched) {
        const prefix = '#'.repeat(h.level);
        lines.push(`- \`${prefix} ${h.raw}\` ✓`);
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('## Action Items');
  lines.push('');

  const withMissing = results.filter(r => r.analysis && r.analysis.missingInTR.length > 0);
  if (withMissing.length === 0) {
    lines.push('No missing sections found. All TR documents are in sync. ✅');
  } else {
    lines.push(`${withMissing.length} document(s) have missing TR sections:`);
    lines.push('');
    for (const r of withMissing) {
      lines.push(`- **${r.pair}**: ${r.analysis.missingInTR.length} section(s) missing in \`${r.trPath}\``);
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ─── Main ──────────────────────────────────────────────────────────────────

const timestamp = new Date().toISOString();
const results = DOC_PAIRS.map(([en, tr, name]) => analyzePair(en, tr, name));

if (OUTPUT_JSON) {
  console.log(JSON.stringify(results, null, 2));
} else {
  // Human-readable console output
  console.log('\n📋 TR/EN Parity Check\n');
  console.log('─'.repeat(70));

  for (const r of results) {
    const status = r.error
      ? '❌ ERROR'
      : r.analysis.coverage === 100
      ? '✅ PASS'
      : r.analysis.coverage >= 80
      ? '⚠️  PARTIAL'
      : '❌ FAIL';

    console.log(`\n${status} ${r.pair}`);
    console.log(`   EN: ${r.enPath} | TR: ${r.trPath}`);

    if (r.error) {
      console.log(`   Error: ${r.error}`);
      continue;
    }

    const a = r.analysis;
    console.log(`   Coverage: ${a.coverage}% | ${a.matched.length}/${a.totalEN} sections matched`);
    console.log(`   Line ratio: ${r.lineCoverage}% (TR ${r.trLines} / EN ${r.enLines} lines)`);

    if (a.missingInTR.length > 0) {
      console.log(`   Missing in TR (${a.missingInTR.length}):`);
      for (const h of a.missingInTR) {
        console.log(`     - ${'#'.repeat(h.level)} ${h.raw}`);
      }
    }

    if (a.extraInTR.length > 0) {
      console.log(`   TR-only sections (${a.extraInTR.length}):`);
      for (const h of a.extraInTR.slice(0, 5)) {
        console.log(`     + ${'#'.repeat(h.level)} ${h.raw}`);
      }
      if (a.extraInTR.length > 5) {
        console.log(`     ... and ${a.extraInTR.length - 5} more`);
      }
    }
  }

  console.log('\n' + '─'.repeat(70));

  const totalMissing = results.reduce((sum, r) => sum + (r.analysis?.missingInTR.length ?? 0), 0);
  const avgCoverage = results.filter(r => r.analysis).reduce((sum, r) => sum + r.analysis.coverage, 0) / results.filter(r => r.analysis).length;

  console.log(`\nSummary: ${results.filter(r => r.analysis).length}/${results.length} pairs analyzed`);
  console.log(`Average section coverage: ${Math.round(avgCoverage)}%`);
  console.log(`Total missing TR sections: ${totalMissing}`);
}

// Write report if requested
if (WRITE_REPORT) {
  const reportDir = join(ROOT, 'docs/audits/sprint-150');
  if (!existsSync(reportDir)) {
    mkdirSync(reportDir, { recursive: true });
  }
  const reportPath = join(reportDir, 'i18n-parity-report.md');
  const report = generateReport(results, timestamp);
  writeFileSync(reportPath, report, 'utf-8');
  console.log(`\n✓ Report written to: docs/audits/sprint-150/i18n-parity-report.md`);
}

// Exit 0 always (report findings without failing CI — findings are informational)
process.exit(0);
