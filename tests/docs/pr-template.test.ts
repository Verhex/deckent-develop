import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

describe('Pull Request Template', () => {
  const prTemplatePath = join(ROOT, '.github', 'pull_request_template.md');

  it('file exists', () => {
    expect(existsSync(prTemplatePath)).toBe(true);
  });

  it('has Summary, Changes, Test Plan, and Checklist sections', () => {
    const content = readFileSync(prTemplatePath, 'utf-8');
    expect(content).toContain('## Summary');
    expect(content).toContain('## Changes');
    expect(content).toContain('## Test Plan');
    expect(content).toContain('## Checklist');
  });

  it('checklist includes key items', () => {
    const content = readFileSync(prTemplatePath, 'utf-8');
    expect(content).toContain('Code follows project conventions');
    expect(content).toContain('vitest');
  });
});
