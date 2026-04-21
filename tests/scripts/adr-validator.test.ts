import { describe, it, expect } from 'vitest';
import { parseADRs, validateADRs, validate } from '../../scripts/adr-validator.mjs';
import { resolve } from 'node:path';

// ─── parseADRs ────────────────────────────────────────────────────────────

describe('parseADRs', () => {
  it('parses well-formed ADR entries', () => {
    const content = `# Architecture Decision Records

## ADR-001: Test Decision

**Status:** accepted

**Decision:** Use TypeScript.
**Context:** We need types.
**Consequence:** All code is typed.
`;
    const { adrs } = parseADRs(content);
    expect(adrs).toHaveLength(1);
    expect(adrs[0].id).toBe('ADR-001');
    expect(adrs[0].title).toBe('Test Decision');
    expect(adrs[0].status).toBe('accepted');
  });

  it('parses multiple ADRs', () => {
    const content = `## ADR-001: First

**Status:** accepted
**Decision:** Do X.

## ADR-002: Second

**Status:** deprecated
**Decision:** Do Y.
`;
    const { adrs } = parseADRs(content);
    expect(adrs).toHaveLength(2);
    expect(adrs[0].id).toBe('ADR-001');
    expect(adrs[1].id).toBe('ADR-002');
    expect(adrs[1].status).toBe('deprecated');
  });

  it('handles status with parenthetical annotation', () => {
    const content = `## ADR-010: Some Rule

**Status:** ACCEPTED (Sprint 131)
**Decision:** Do Z.
`;
    const { adrs } = parseADRs(content);
    expect(adrs).toHaveLength(1);
    expect(adrs[0].status).toBe('accepted');
  });
});

// ─── validateADRs ─────────────────────────────────────────────────────────

describe('validateADRs', () => {
  it('returns no errors for valid ADRs', () => {
    const adrs = [
      { id: 'ADR-001', title: 'Test', line: 3, status: 'accepted', fields: ['Decision', 'Context'], raw: '' },
    ];
    const { errors } = validateADRs(adrs);
    expect(errors).toHaveLength(0);
  });

  it('detects missing Status field', () => {
    const adrs = [
      { id: 'ADR-001', title: 'Test', line: 3, status: null, fields: ['Decision'], raw: '' },
    ];
    const { errors } = validateADRs(adrs);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('Missing **Status:**');
  });

  it('detects invalid status value', () => {
    const adrs = [
      { id: 'ADR-001', title: 'Test', line: 3, status: 'invalid_status', fields: ['Decision'], raw: '' },
    ];
    const { errors } = validateADRs(adrs);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('Invalid status');
  });

  it('detects duplicate ID without superseded', () => {
    const adrs = [
      { id: 'ADR-001', title: 'First', line: 3, status: 'accepted', fields: ['Decision'], raw: '' },
      { id: 'ADR-001', title: 'Second', line: 20, status: 'accepted', fields: ['Decision'], raw: '' },
    ];
    const { errors } = validateADRs(adrs);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('Duplicate ID');
  });

  it('allows duplicate ID when one is superseded', () => {
    const adrs = [
      { id: 'ADR-022', title: 'V1', line: 3, status: 'superseded', fields: ['Decision'], raw: '' },
      { id: 'ADR-022', title: 'V2', line: 20, status: 'accepted', fields: ['Decision'], raw: '' },
    ];
    const { errors } = validateADRs(adrs);
    expect(errors).toHaveLength(0);
  });
});

// ─── validate (integration) ──────────────────────────────────────────────

describe('validate', () => {
  // Memory V2 migration (Sprint 150): .brain/DECISIONS.md retired in favor of
  // SQLite-backed `.brain/memory.db` with auto-generated `.brain/exports/decisions.md`.
  // Export format is a summary list (lowercase `adr-NNN`) — not the MADR v3 hybrid
  // the validator parses. These tests need a rewritten validator that reads from
  // MemoryStore (via `store.getByType('adr')`). Tracked as Sprint 151 debt item.
  it.skip('validates the real DECISIONS.md file', () => {
    const { existsSync } = require('node:fs');
    const exportPath = resolve(process.cwd(), '.brain', 'exports', 'decisions.md');
    const legacyPath = resolve(process.cwd(), '.brain', 'DECISIONS.md');
    const filePath = existsSync(exportPath) ? exportPath : legacyPath;
    const result = validate(filePath);
    expect(result.success).toBe(true);
    expect(result.adrs).toBeGreaterThanOrEqual(37);
  });

  it.skip('ADR-036 self-referential passes validation', () => {
    const { existsSync, readFileSync } = require('node:fs');
    const exportPath = resolve(process.cwd(), '.brain', 'exports', 'decisions.md');
    const legacyPath = resolve(process.cwd(), '.brain', 'DECISIONS.md');
    const filePath = existsSync(exportPath) ? exportPath : legacyPath;
    const result = validate(filePath);
    expect(result.success).toBe(true);

    // Parse and verify ADR-036 exists
    const content = readFileSync(filePath, 'utf8');
    const { adrs } = parseADRs(content);
    const adr036 = adrs.find((a: { id: string }) => a.id === 'ADR-036');
    expect(adr036).toBeTruthy();
    expect(adr036.status).toBe('accepted');
  });

  it('returns failure for nonexistent file', () => {
    const result = validate('/nonexistent/file.md');
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('File not found');
  });
});
