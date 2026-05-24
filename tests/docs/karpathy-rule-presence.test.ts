import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const RULES_DIR = join(ROOT, '.claude', 'rules');
const KARPATHY_FILE = join(RULES_DIR, 'karpathy-discipline.md');
const WORKER_DEFAULT_FILE = join(RULES_DIR, 'worker-default.md');

describe('karpathy-discipline.md — file presence', () => {
  it('(a) .claude/rules/karpathy-discipline.md exists', () => {
    expect(existsSync(KARPATHY_FILE)).toBe(true);
  });

  it('(b) file has at least 80 lines', () => {
    const content = readFileSync(KARPATHY_FILE, 'utf-8');
    const lines = content.split('\n').length;
    expect(lines).toBeGreaterThanOrEqual(80);
  });

  it('(c) file contains frontmatter with paths field', () => {
    const content = readFileSync(KARPATHY_FILE, 'utf-8');
    expect(content).toMatch(/^---\s*\n/);
    expect(content).toContain('paths:');
  });
});

describe('karpathy-discipline.md — 4 discipline structure', () => {
  it('(a) contains Discipline 1 — Think Before Coding', () => {
    const content = readFileSync(KARPATHY_FILE, 'utf-8');
    expect(content).toContain('Think Before Coding');
  });

  it('(b) contains Discipline 2 — Simplicity First', () => {
    const content = readFileSync(KARPATHY_FILE, 'utf-8');
    expect(content).toContain('Simplicity First');
  });

  it('(c) contains Discipline 3 — Surgical Changes', () => {
    const content = readFileSync(KARPATHY_FILE, 'utf-8');
    expect(content).toContain('Surgical Changes');
  });

  it('(d) contains Discipline 4 — Goal-Driven Execution', () => {
    const content = readFileSync(KARPATHY_FILE, 'utf-8');
    expect(content).toContain('Goal-Driven Execution');
  });

  it('(e) contains Quick Reference Checklist section', () => {
    const content = readFileSync(KARPATHY_FILE, 'utf-8');
    expect(content).toContain('Quick Reference Checklist');
  });

  it('(f) contains Source attribution section', () => {
    const content = readFileSync(KARPATHY_FILE, 'utf-8');
    expect(content).toContain('Karpathy');
  });
});

describe('worker-default.md — karpathy-discipline reference', () => {
  it('(a) worker-default.md exists', () => {
    expect(existsSync(WORKER_DEFAULT_FILE)).toBe(true);
  });

  it('(b) worker-default.md references karpathy-discipline.md', () => {
    const content = readFileSync(WORKER_DEFAULT_FILE, 'utf-8');
    expect(content).toContain('karpathy-discipline');
  });

  it('(c) reference is in the CUSTOM section (not AUTO-generated)', () => {
    const content = readFileSync(WORKER_DEFAULT_FILE, 'utf-8');
    const customStart = content.indexOf('<!-- CUSTOM-START -->');
    const customEnd = content.indexOf('<!-- CUSTOM-END -->');
    const karpathyIdx = content.indexOf('karpathy-discipline');
    expect(customStart).toBeGreaterThan(-1);
    expect(customEnd).toBeGreaterThan(-1);
    expect(karpathyIdx).toBeGreaterThan(customStart);
    expect(karpathyIdx).toBeLessThan(customEnd);
  });
});
