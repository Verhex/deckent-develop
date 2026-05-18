#!/usr/bin/env node
// ADR Validator — validates .brain/DECISIONS.md format (MADR v3 hybrid)
// Exit codes: 0 = valid, 1 = validation error, 2 = file not found

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const VALID_STATUSES = ['accepted', 'deprecated', 'superseded', 'proposed', 'rejected'];
const REQUIRED_FIELDS = ['Decision', 'Context', 'Consequence'];

/**
 * Parse DECISIONS.md into structured ADR entries.
 * @param {string} content - Raw markdown content
 * @returns {{ adrs: Array<{id: string, title: string, line: number, status: string|null, fields: string[], raw: string}> }}
 */
export function parseADRs(content) {
  const lines = content.split('\n');
  const adrs = [];
  let currentADR = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Sprint 172 fix: auto-generated .brain/exports/decisions.md emits lowercase
    // `## adr-NNN:` headers (canonical, matches DB id casing). Case-insensitive
    // so the validator matches the actual generated format (pre-existing drift).
    const adrMatch = line.match(/^## (ADR-\d+):\s*(.+)/i);

    if (adrMatch) {
      if (currentADR) {
        currentADR.raw = lines.slice(currentADR.line - 1, i).join('\n');
        adrs.push(currentADR);
      }
      currentADR = {
        id: adrMatch[1],
        title: adrMatch[2].trim(),
        line: i + 1,
        status: null,
        fields: [],
        raw: '',
      };
      continue;
    }

    if (currentADR) {
      // Check for Status field
      const statusMatch = line.match(/^\*\*Status:\*\*\s*(.+)/);
      if (statusMatch) {
        // Extract base status, ignoring parenthetical annotations like "(Sprint 131)"
        const rawStatus = statusMatch[1].trim().toLowerCase();
        const baseStatus = rawStatus.replace(/\s*\(.*?\)\s*/g, '').trim();
        currentADR.status = baseStatus;
      }

      // Check for other bold fields (Decision, Context, Consequence, etc.)
      const fieldMatch = line.match(/^\*\*(\w[\w\s]*?)(?:\s*\(.*?\))?:\*\*/);
      if (fieldMatch) {
        const fieldName = fieldMatch[1].trim();
        if (!currentADR.fields.includes(fieldName) && fieldName !== 'Status') {
          currentADR.fields.push(fieldName);
        }
      }

      // Also check for markdown heading-style fields within ADR
      const headingMatch = line.match(/^### (.+)/);
      if (headingMatch) {
        const fieldName = headingMatch[1].trim();
        if (!currentADR.fields.includes(fieldName)) {
          currentADR.fields.push(fieldName);
        }
      }
    }
  }

  // Push last ADR
  if (currentADR) {
    currentADR.raw = lines.slice(currentADR.line - 1).join('\n');
    adrs.push(currentADR);
  }

  return { adrs };
}

/**
 * Validate parsed ADR entries.
 * @param {Array<{id: string, title: string, line: number, status: string|null, fields: string[]}>} adrs
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateADRs(adrs) {
  const errors = [];
  const warnings = [];
  const seenIds = new Map();

  for (const adr of adrs) {
    const loc = `${adr.id} (line ${adr.line})`;

    // Duplicate ID check (allow ADR-022 v1/v2 pattern)
    if (seenIds.has(adr.id)) {
      const prev = seenIds.get(adr.id);
      // Only error if neither is superseded
      if (adr.status !== 'superseded' && prev.status !== 'superseded') {
        errors.push(`Duplicate ID: ${loc} — also at line ${prev.line}. One should be 'superseded'.`);
      }
    }
    seenIds.set(adr.id, adr);

    // Status field required
    if (!adr.status) {
      errors.push(`Missing **Status:** field in ${loc}`);
      continue;
    }

    // Valid status enum
    if (!VALID_STATUSES.includes(adr.status)) {
      errors.push(`Invalid status "${adr.status}" in ${loc}. Valid: ${VALID_STATUSES.join(', ')}`);
    }

    // Required fields check (relaxed — at least Decision OR Context)
    const hasDecision = adr.fields.some(f =>
      f.toLowerCase().includes('decision')
    );
    const hasContext = adr.fields.some(f =>
      f.toLowerCase().includes('context')
    );

    if (!hasDecision && !hasContext) {
      warnings.push(`${loc}: Missing both **Decision:** and **Context:** fields. At least one is recommended.`);
    }
  }

  return { errors, warnings };
}

/**
 * Run full validation pipeline.
 * @param {string} filePath - Path to DECISIONS.md
 * @returns {{ success: boolean, adrs: number, errors: string[], warnings: string[] }}
 */
export function validate(filePath) {
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    return { success: false, adrs: 0, errors: [`File not found: ${filePath}`], warnings: [] };
  }

  const { adrs } = parseADRs(content);

  if (adrs.length === 0) {
    return { success: false, adrs: 0, errors: ['No ADR entries found'], warnings: [] };
  }

  const { errors, warnings } = validateADRs(adrs);

  return {
    success: errors.length === 0,
    adrs: adrs.length,
    errors,
    warnings,
  };
}

// CLI entry point
if (process.argv[1] && (process.argv[1].endsWith('adr-validator.mjs') || process.argv[1].endsWith('adr-validator'))) {
  // Sprint 154 audit A9.F4 / C5: .brain/DECISIONS.md was deleted in Memory V2 migration.
  // Default fallback to auto-generated export. Source of truth = memory.db (entries WHERE type='adr').
  const decisionsExport = resolve(process.cwd(), '.brain', 'exports', 'decisions.md');
  const decisionsLegacy = resolve(process.cwd(), '.brain', 'DECISIONS.md');
  const filePath = process.argv[2] || decisionsExport;
  const result = validate(filePath);

  if (result.warnings.length > 0) {
    console.warn(`\n⚠ ${result.warnings.length} warning(s):`);
    for (const w of result.warnings) console.warn(`  - ${w}`);
  }

  if (result.success) {
    console.log(`\n✓ ADR validation passed: ${result.adrs} ADRs validated`);
    process.exit(0);
  } else {
    console.error(`\n✗ ADR validation failed: ${result.errors.length} error(s)`);
    for (const e of result.errors) console.error(`  - ${e}`);
    process.exit(result.errors[0]?.startsWith('File not found') ? 2 : 1);
  }
}
