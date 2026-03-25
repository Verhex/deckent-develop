import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DOCS_ROOT = join(process.cwd(), 'docs');

// ─── Directory Structure ───────────────────────────────────────────

describe('docs/ directory structure', () => {
  it('docs/guide/ directory exists', () => {
    expect(existsSync(join(DOCS_ROOT, 'guide'))).toBe(true);
  });

  it('docs/reference/ directory exists', () => {
    expect(existsSync(join(DOCS_ROOT, 'reference'))).toBe(true);
  });

  it('docs/architecture/ directory exists', () => {
    expect(existsSync(join(DOCS_ROOT, 'architecture'))).toBe(true);
  });

  it('docs/development/ directory exists', () => {
    expect(existsSync(join(DOCS_ROOT, 'development'))).toBe(true);
  });

  it('docs/release/ directory exists', () => {
    expect(existsSync(join(DOCS_ROOT, 'release'))).toBe(true);
  });

  it('docs/directives/ directory exists', () => {
    expect(existsSync(join(DOCS_ROOT, 'directives'))).toBe(true);
  });
});

// ─── Guide Files ──────────────────────────────────────────────────

describe('docs/guide/ content', () => {
  const GUIDE = join(DOCS_ROOT, 'guide');

  it('guide/getting-started.md exists', () => {
    expect(existsSync(join(GUIDE, 'getting-started.md'))).toBe(true);
  });

  it('guide/quickstart.md exists', () => {
    expect(existsSync(join(GUIDE, 'quickstart.md'))).toBe(true);
  });

  it('guide/ has at least 3 files', () => {
    const files = readdirSync(GUIDE).filter(f => f.endsWith('.md'));
    expect(files.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── Reference Files ──────────────────────────────────────────────

describe('docs/reference/ content', () => {
  const REF = join(DOCS_ROOT, 'reference');

  it('reference/api.md exists', () => {
    expect(existsSync(join(REF, 'api.md'))).toBe(true);
  });

  it('reference/config-reference.md exists', () => {
    expect(existsSync(join(REF, 'config-reference.md'))).toBe(true);
  });

  it('reference/mcp-guide.md exists', () => {
    expect(existsSync(join(REF, 'mcp-guide.md'))).toBe(true);
  });

  it('reference/ has at least 5 files', () => {
    const files = readdirSync(REF).filter(f => f.endsWith('.md'));
    expect(files.length).toBeGreaterThanOrEqual(5);
  });
});

// ─── Architecture Files ───────────────────────────────────────────

describe('docs/architecture/ content', () => {
  const ARCH = join(DOCS_ROOT, 'architecture');

  it('architecture/ has at least 1 file', () => {
    const files = readdirSync(ARCH).filter(f => f.endsWith('.md'));
    expect(files.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Development Files ────────────────────────────────────────────

describe('docs/development/ content', () => {
  const DEV = join(DOCS_ROOT, 'development');

  it('development/ has at least 2 files', () => {
    const files = readdirSync(DEV).filter(f => f.endsWith('.md'));
    expect(files.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Release Files ────────────────────────────────────────────────

describe('docs/release/ content', () => {
  const REL = join(DOCS_ROOT, 'release');

  it('release/ has at least 2 files', () => {
    const files = readdirSync(REL).filter(f => f.endsWith('.md'));
    expect(files.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── .claude/rules/ ───────────────────────────────────────────────

describe('.claude/rules/ files exist', () => {
  const RULES = join(process.cwd(), '.claude', 'rules');

  it('brain.md exists', () => {
    expect(existsSync(join(RULES, 'brain.md'))).toBe(true);
  });

  it('worker-default.md exists', () => {
    expect(existsSync(join(RULES, 'worker-default.md'))).toBe(true);
  });

  it('auditor.md exists', () => {
    expect(existsSync(join(RULES, 'auditor.md'))).toBe(true);
  });
});
