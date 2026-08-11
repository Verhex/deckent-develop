#!/usr/bin/env node
// RECOVERY-BORN intake checker — validates a drafted born-row text against
// follow-up-works/born-intake-template.md's mandatory `## <Field>` sections.
// Manual pre-insertion aid only; not wired into any lint/CI chain.
// Exit codes: 0 = valid, 1 = gaps found, 2 = file not found

import { readFileSync } from 'node:fs';

export const REQUIRED_FIELDS = [
  'Work ID',
  'Parent ID',
  'Title',
  'Priority',
  'Dependencies',
  'Trigger',
  'Affected surfaces',
  'Exact evidence',
  'Acceptance',
  'Negative scope',
  'Date',
];

const PLACEHOLDER_PATTERN = /^<.*>$/s;

/**
 * Parse a drafted born-intake text into a field-name -> body-text map.
 * Splits on `^## <Field>$` headings; body is everything up to the next
 * `##` heading (or EOF), trimmed.
 * @param {string} content
 * @returns {Record<string, string>}
 */
export function parseBornIntake(content) {
  const lines = content.split('\n');
  const fields = {};
  let currentField = null;
  let buffer = [];

  const flush = () => {
    if (currentField !== null) {
      fields[currentField] = buffer.join('\n').trim();
    }
  };

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+?)\s*$/);
    if (headingMatch) {
      flush();
      currentField = headingMatch[1];
      buffer = [];
      continue;
    }
    if (currentField !== null) {
      buffer.push(line);
    }
  }
  flush();

  return fields;
}

/**
 * Validate a drafted born-intake text against REQUIRED_FIELDS.
 * @param {string} content
 * @returns {{ valid: boolean, fields: Record<string,string>, gaps: Array<{field: string, type: 'MISSING_FIELD'|'EMPTY_FIELD'|'PLACEHOLDER_FIELD', message: string}> }}
 */
export function checkBornIntake(content) {
  const fields = parseBornIntake(content);
  const gaps = [];

  for (const field of REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(fields, field)) {
      gaps.push({
        field,
        type: 'MISSING_FIELD',
        message: `Missing required section: ## ${field}`,
      });
      continue;
    }

    const body = fields[field];
    if (body.length === 0) {
      gaps.push({
        field,
        type: 'EMPTY_FIELD',
        message: `Section is empty: ## ${field}`,
      });
      continue;
    }

    if (PLACEHOLDER_PATTERN.test(body)) {
      gaps.push({
        field,
        type: 'PLACEHOLDER_FIELD',
        message: `Section still holds template placeholder text: ## ${field}`,
      });
    }
  }

  return { valid: gaps.length === 0, fields, gaps };
}

/**
 * Run the checker against a file on disk.
 * @param {string} filePath
 * @returns {{ valid: boolean, fields: Record<string,string>, gaps: Array<object> } | { valid: false, fields: {}, gaps: Array<{field: string, type: 'FILE_NOT_FOUND', message: string}> }}
 */
export function checkBornIntakeFile(filePath) {
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    return {
      valid: false,
      fields: {},
      gaps: [{ field: '(file)', type: 'FILE_NOT_FOUND', message: `File not found: ${filePath}` }],
    };
  }
  return checkBornIntake(content);
}

// CLI entry point
if (process.argv[1] && (process.argv[1].endsWith('check-born-intake.mjs') || process.argv[1].endsWith('check-born-intake'))) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node scripts/check-born-intake.mjs <path-to-drafted-born-entry.md>');
    process.exit(2);
  }

  const result = checkBornIntakeFile(filePath);
  const fileNotFound = result.gaps.some((g) => g.type === 'FILE_NOT_FOUND');

  if (result.valid) {
    console.log(`\n✓ Born-intake draft valid: all ${REQUIRED_FIELDS.length} required fields present.`);
    process.exit(0);
  }

  console.error(`\n✗ Born-intake draft has ${result.gaps.length} gap(s):`);
  for (const gap of result.gaps) {
    console.error(`  - [${gap.type}] ${gap.message}`);
  }
  process.exit(fileNotFound ? 2 : 1);
}
