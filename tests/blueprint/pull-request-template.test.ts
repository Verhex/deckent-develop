import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const TEMPLATE_PATH = join(ROOT, '.github', 'pull_request_template.md');

describe('PR Template — Deckent-specific', () => {
  it('pull_request_template.md exists', () => {
    expect(existsSync(TEMPLATE_PATH)).toBe(true);
  });

  it('template is non-empty', () => {
    const content = readFileSync(TEMPLATE_PATH, 'utf-8');
    expect(content.trim().length).toBeGreaterThan(0);
  });

  it('contains Summary section', () => {
    const content = readFileSync(TEMPLATE_PATH, 'utf-8');
    expect(content).toContain('## Summary');
  });

  it('contains Changes section', () => {
    const content = readFileSync(TEMPLATE_PATH, 'utf-8');
    expect(content).toContain('## Changes');
  });

  it('contains Test Plan section with vitest', () => {
    const content = readFileSync(TEMPLATE_PATH, 'utf-8');
    expect(content).toContain('Test Plan');
    expect(content).toContain('vitest');
  });

  it('contains Related Issues section', () => {
    const content = readFileSync(TEMPLATE_PATH, 'utf-8');
    expect(content).toContain('## Related Issues');
  });

  it('contains Checklist section', () => {
    const content = readFileSync(TEMPLATE_PATH, 'utf-8');
    expect(content).toContain('## Checklist');
  });

  it('contains Deckent-specific checklist items', () => {
    const content = readFileSync(TEMPLATE_PATH, 'utf-8');
    expect(content).toContain('circular dependencies');
    expect(content).toContain('scope boundaries');
  });

  it('contains tsc --noEmit check', () => {
    const content = readFileSync(TEMPLATE_PATH, 'utf-8');
    expect(content).toContain('tsc --noEmit');
  });
});
