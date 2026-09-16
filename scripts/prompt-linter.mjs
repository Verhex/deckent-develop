#!/usr/bin/env node
// Prompt Quality Linter — scores worker prompt files for quality issues
// Exit codes: 0 = avg >= 75, 1 = avg < 75, 2 = no prompt files found

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * @typedef {{ score: number, issues: string[], checks: Record<string, { passed: boolean, deduction: number, detail: string }> }} PromptLintResult
 */

/**
 * Score a prompt string for quality issues.
 * @param {string} content - Raw prompt content
 * @returns {PromptLintResult}
 */
export function scorePrompt(content) {
  const issues = [];
  const checks = {};
  let score = 100;

  // ── Check 1: ADR ratio ───────────────────────────────────────────────────
  const adrRatio = computeAdrRatio(content);
  if (adrRatio > 0.7) {
    const deduction = 30;
    score -= deduction;
    issues.push(`ADR ratio ${(adrRatio * 100).toFixed(1)}% > 70% (-${deduction}pts)`);
    checks['adr_ratio'] = { passed: false, deduction, detail: `ratio=${adrRatio.toFixed(3)}` };
  } else if (adrRatio > 0.5) {
    const deduction = 15;
    score -= deduction;
    issues.push(`ADR ratio ${(adrRatio * 100).toFixed(1)}% > 50% (-${deduction}pts)`);
    checks['adr_ratio'] = { passed: false, deduction, detail: `ratio=${adrRatio.toFixed(3)}` };
  } else {
    checks['adr_ratio'] = { passed: true, deduction: 0, detail: `ratio=${adrRatio.toFixed(3)}` };
  }

  // ── Check 2: Agent truncation ────────────────────────────────────────────
  if (content.includes('Clean up fil')) {
    score -= 20;
    issues.push('Agent truncation detected: "Clean up fil" pattern (-20pts)');
    checks['agent_truncation'] = { passed: false, deduction: 20, detail: 'truncation pattern found' };
  } else {
    checks['agent_truncation'] = { passed: true, deduction: 0, detail: 'no truncation' };
  }

  // ── Check 3: Empty filler headers ────────────────────────────────────────
  const emptyHeaderCount = countEmptyFillerHeaders(content);
  if (emptyHeaderCount > 0) {
    score -= 5;
    issues.push(`${emptyHeaderCount} empty filler header(s) found (-5pts)`);
    checks['empty_filler_headers'] = { passed: false, deduction: 5, detail: `count=${emptyHeaderCount}` };
  } else {
    checks['empty_filler_headers'] = { passed: true, deduction: 0, detail: 'no empty headers' };
  }

  // ── Check 4: Rubric spec present ─────────────────────────────────────────
  if (containsRubricSpec(content)) {
    score -= 10;
    issues.push('Rubric spec present in prompt (should be removed post-Sprint-146) (-10pts)');
    checks['rubric_spec'] = { passed: false, deduction: 10, detail: 'rubric keywords found' };
  } else {
    checks['rubric_spec'] = { passed: true, deduction: 0, detail: 'no rubric spec' };
  }

  // ── Check 5: Char count > 40000 ──────────────────────────────────────────
  if (content.length > 40000) {
    score -= 10;
    issues.push(`Char count ${content.length} > 40000 (-10pts)`);
    checks['char_count'] = { passed: false, deduction: 10, detail: `chars=${content.length}` };
  } else {
    checks['char_count'] = { passed: true, deduction: 0, detail: `chars=${content.length}` };
  }

  // ── Check 6: Duplicate scope paths ───────────────────────────────────────
  const dupeCount = countDuplicateScopePaths(content);
  if (dupeCount > 0) {
    score -= 5;
    issues.push(`${dupeCount} duplicate scope path(s) detected (-5pts)`);
    checks['duplicate_scope_paths'] = { passed: false, deduction: 5, detail: `dupes=${dupeCount}` };
  } else {
    checks['duplicate_scope_paths'] = { passed: true, deduction: 0, detail: 'no duplicates' };
  }

  return { score: Math.max(0, score), issues, checks };
}

/**
 * Compute the ratio of ADR-related content to total content.
 * ADR sections are detected by "adr-NNN" patterns, "## ADR", or "**Status:**" blocks.
 * @param {string} content
 * @returns {number} ratio between 0 and 1
 */
function computeAdrRatio(content) {
  if (content.length === 0) return 0;

  // Find lines that are part of ADR sections
  const lines = content.split('\n');
  let inAdrSection = false;
  let adrLines = 0;

  for (const line of lines) {
    // Detect start of ADR section
    if (
      /^## adr-\d+/i.test(line) ||
      /^## ADR-\d+/i.test(line) ||
      /^### adr-\d+/i.test(line) ||
      /=== Mandatory Architecture Rules/i.test(line) ||
      /=== ADR/i.test(line)
    ) {
      inAdrSection = true;
    }

    // Detect end of ADR section (new top-level section that is NOT an ADR)
    if (inAdrSection && /^## [^a]/i.test(line) && !/^## adr-/i.test(line) && !/^## ADR-/i.test(line)) {
      inAdrSection = false;
    }

    if (inAdrSection) {
      adrLines++;
    }
  }

  const adrChars = lines
    .filter((_, i) => {
      // Re-run scan to get char count per line
      return false; // We'll use a simpler approach below
    })
    .join('\n').length;

  // Simpler approach: count chars in ADR-related segments
  const adrSegmentChars = extractAdrSegmentChars(content);
  return adrSegmentChars / content.length;
}

/**
 * Extract total character count of ADR-related segments.
 * @param {string} content
 * @returns {number}
 */
function extractAdrSegmentChars(content) {
  let totalAdrChars = 0;

  // Strategy: split by section markers and classify each section
  // Sections start with "=== ... ===" or "## ..."
  const sectionPattern = /(?:^|\n)(===\s*[^=\n]+\s*===|##\s+[^\n]+)/g;
  const sectionMatches = [...content.matchAll(sectionPattern)];

  if (sectionMatches.length === 0) {
    // No sections — check if entire content looks like ADR injection
    if (/\*\*Status:\*\*\s*(accepted|deprecated)/i.test(content)) {
      return content.length;
    }
    return 0;
  }

  for (let i = 0; i < sectionMatches.length; i++) {
    const matchStart = sectionMatches[i].index + (sectionMatches[i][0].startsWith('\n') ? 1 : 0);
    const nextMatchStart = i + 1 < sectionMatches.length
      ? sectionMatches[i + 1].index + (sectionMatches[i + 1][0].startsWith('\n') ? 1 : 0)
      : content.length;

    const sectionHeader = sectionMatches[i][1].trim();
    const sectionContent = content.slice(matchStart, nextMatchStart);

    const isAdrSection =
      /^===\s*Mandatory Architecture Rules/i.test(sectionHeader) ||
      /^===\s*ADR/i.test(sectionHeader) ||
      /^##\s+adr-\d+/i.test(sectionHeader) ||
      /^##\s+ADR-\d+/i.test(sectionHeader);

    if (isAdrSection) {
      totalAdrChars += sectionContent.length;
    }
  }

  return totalAdrChars;
}

/**
 * Count empty filler headers — headers like `=== Section ===` followed by blank content.
 * @param {string} content
 * @returns {number}
 */
function countEmptyFillerHeaders(content) {
  // Pattern: === Section Header === followed only by whitespace then === or end of file
  const fillerPattern = /===\s*[^=\n]+\s*===\s*\n(\s*\n)*(?:===|$)/g;
  const matches = content.match(fillerPattern);
  return matches ? matches.length : 0;
}

/**
 * Check if prompt contains rubric spec keywords.
 * @param {string} content
 * @returns {boolean}
 */
function containsRubricSpec(content) {
  return (
    /rubricScores\s*[:=]/i.test(content) ||
    /\bRUBRIC\s+SPEC\b/i.test(content) ||
    /## Rubric/i.test(content) ||
    /=== Rubric/i.test(content) ||
    /\bcorrectness\s*:\s*\d+\b/.test(content) ||
    /\btest_coverage\s*:\s*\d+\b/.test(content)
  );
}

/**
 * Count duplicate file paths in scope sections.
 * Looks for file path patterns (src/..., tests/..., etc.) that appear more than once.
 * @param {string} content
 * @returns {number} number of paths that appear more than once
 */
function countDuplicateScopePaths(content) {
  // Match file paths: word chars with slashes and dots, must have extension or be a directory path
  const pathPattern = /\b(?:src|tests|scripts|docs|dist|\.deckent|\.brain)\S+/g;
  const allPaths = content.match(pathPattern) || [];

  const pathCounts = new Map();
  for (const p of allPaths) {
    // Normalize: strip trailing punctuation
    const normalized = p.replace(/[,;)}\]"']+$/, '');
    pathCounts.set(normalized, (pathCounts.get(normalized) || 0) + 1);
  }

  let dupeCount = 0;
  for (const count of pathCounts.values()) {
    if (count > 1) dupeCount++;
  }
  return dupeCount;
}

/**
 * Lint a prompt file and return its result.
 * @param {string} filePath
 * @returns {{ filePath: string, score: number, issues: string[], checks: object }}
 */
export function lintPromptFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const result = scorePrompt(content);
  return { filePath, ...result };
}

/**
 * Scan sprint prompt files and return all results.
 * @param {string} sprintId - e.g. "146"
 * @param {string} tasksDir - path to .tasks/ directory
 * @returns {{ results: Array, avgScore: number, passed: boolean }}
 */
export function lintSprintPrompts(sprintId, tasksDir) {
  const allFiles = readdirSync(tasksDir).filter(
    (f) => f.startsWith(`.prompt-${sprintId}-`) && f.endsWith('.txt')
  );

  if (allFiles.length === 0) {
    return { results: [], avgScore: 0, passed: false, noFiles: true };
  }

  const results = allFiles.map((f) => lintPromptFile(join(tasksDir, f)));
  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;

  return {
    results,
    avgScore: Math.round(avgScore * 10) / 10,
    passed: avgScore >= 75,
  };
}

// ── CLI entry ────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && process.argv[1].endsWith('prompt-linter.mjs');

if (isMain) {
  const args = process.argv.slice(2);
  const sprintIdx = args.indexOf('--sprint');
  const fileIdx = args.indexOf('--file');
  const jsonOutput = args.includes('--json');

  if (fileIdx !== -1 && args[fileIdx + 1]) {
    // Single file mode
    const filePath = resolve(args[fileIdx + 1]);
    try {
      const result = lintPromptFile(filePath);
      if (jsonOutput) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      } else {
        process.stdout.write(`File: ${result.filePath}\nScore: ${result.score}/100\n`);
        if (result.issues.length > 0) {
          process.stdout.write('Issues:\n' + result.issues.map((i) => `  - ${i}`).join('\n') + '\n');
        } else {
          process.stdout.write('No issues found.\n');
        }
      }
      process.exit(result.score >= 75 ? 0 : 1);
    } catch (err) {
      process.stderr.write(`Error reading file: ${err.message}\n`);
      process.exit(2);
    }
  } else if (sprintIdx !== -1 && args[sprintIdx + 1]) {
    // Sprint scan mode
    const sprintId = args[sprintIdx + 1];
    const projectRoot = args[args.indexOf('--root') + 1] || process.cwd();
    const tasksDir = resolve(projectRoot, '.tasks');

    try {
      const { results, avgScore, passed, noFiles } = lintSprintPrompts(sprintId, tasksDir);

      if (noFiles) {
        process.stderr.write(`No prompt files found for sprint ${sprintId} in ${tasksDir}\n`);
        process.stderr.write(`Expected pattern: .prompt-${sprintId}-*.txt\n`);
        process.exit(2);
      }

      if (jsonOutput) {
        process.stdout.write(JSON.stringify({ sprintId, avgScore, passed, results }, null, 2) + '\n');
      } else {
        process.stdout.write(`\nPrompt Quality Report — Sprint ${sprintId}\n`);
        process.stdout.write('='.repeat(50) + '\n\n');
        for (const r of results) {
          const fname = r.filePath.split('/').pop();
          process.stdout.write(`${fname}: ${r.score}/100`);
          if (r.issues.length > 0) {
            process.stdout.write('\n  Issues:\n' + r.issues.map((i) => `    - ${i}`).join('\n') + '\n');
          } else {
            process.stdout.write(' ✓\n');
          }
        }
        process.stdout.write(`\nAverage Score: ${avgScore}/100 ${passed ? '✓ PASS' : '✗ FAIL (< 75)'}\n`);
      }

      process.exit(passed ? 0 : 1);
    } catch (err) {
      process.stderr.write(`Error scanning sprint: ${err.message}\n`);
      process.exit(2);
    }
  } else {
    process.stderr.write('Usage: node scripts/prompt-linter.mjs --sprint <id> [--root <path>] [--json]\n');
    process.stderr.write('       node scripts/prompt-linter.mjs --file <path> [--json]\n');
    process.exit(2);
  }
}
