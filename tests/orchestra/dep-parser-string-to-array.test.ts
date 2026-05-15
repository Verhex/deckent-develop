import { describe, it, expect } from 'vitest';
import {
  parseDependencyField,
  parseDependenciesDirective,
} from '../../src/orchestra/task-builder.js';

// ─── Sprint 169 Task 2 — W3.2 Smoke Directive Dependency Parser Fix ──────
//
// Bug: DIRECTIVES.md "- Dependencies: [..]" JSON array literal stayed as a
// literal string in task.json because parseDependenciesDirective only did a
// raw split(',') — JSON brackets leaked into individual dependency ids and
// the dependency wiring failed downstream (Sprint 168 smoke test T3 RC).
//
// Fix: new parseDependencyField helper accepts 3 formats — bare string,
// comma-separated list, JSON array literal — and is idempotent.

describe('parseDependencyField — 3-format normalization', () => {
  it('parses a bare string into a single-element array', () => {
    expect(parseDependencyField('169-003')).toEqual(['169-003']);
  });

  it('parses a comma-separated list into a multi-element array', () => {
    expect(parseDependencyField('169-003, 169-007')).toEqual(['169-003', '169-007']);
  });

  it('parses a single-element JSON array literal', () => {
    expect(parseDependencyField('["169-003"]')).toEqual(['169-003']);
  });

  it('parses a multi-element JSON array literal', () => {
    expect(parseDependencyField('["169-007", "169-008"]')).toEqual(['169-007', '169-008']);
  });

  it('returns empty array for empty / whitespace / "none"', () => {
    expect(parseDependencyField('')).toEqual([]);
    expect(parseDependencyField('   ')).toEqual([]);
    expect(parseDependencyField('none')).toEqual([]);
    expect(parseDependencyField('NONE')).toEqual([]);
  });

  it('trims whitespace around comma-separated values', () => {
    expect(parseDependencyField('  169-003  ,   169-007   ')).toEqual(['169-003', '169-007']);
  });

  it('is idempotent — re-stringifying and re-parsing yields the same array', () => {
    const first = parseDependencyField('["169-003", "169-007"]');
    const second = parseDependencyField(JSON.stringify(first));
    expect(second).toEqual(first);
  });

  it('falls back to comma-split when JSON parsing fails', () => {
    // Malformed JSON should not crash — degrade to comma-split fallback
    expect(parseDependencyField('[broken')).toEqual(['[broken']);
  });
});

describe('parseDependenciesDirective — line-level integration with JSON arrays', () => {
  it('parses a JSON array dependencies line (Sprint 169 plan format)', () => {
    expect(parseDependenciesDirective('- Dependencies: ["169-003"]'))
      .toEqual(['169-003']);
  });

  it('parses a multi-element JSON array dependencies line', () => {
    expect(parseDependenciesDirective('- Dependencies: ["169-007", "169-008"]'))
      .toEqual(['169-007', '169-008']);
  });

  it('parses a bare-string dependencies line (back-compat)', () => {
    expect(parseDependenciesDirective('- Dependencies: 169-003')).toEqual(['169-003']);
  });

  it('parses a comma-separated dependencies line (back-compat)', () => {
    expect(parseDependenciesDirective('Dependencies: 134-005, 134-007'))
      .toEqual(['134-005', '134-007']);
  });

  it('returns undefined for missing line', () => {
    expect(parseDependenciesDirective(undefined)).toBeUndefined();
  });

  it('returns undefined for "none"', () => {
    expect(parseDependenciesDirective('- Dependencies: none')).toBeUndefined();
  });
});
