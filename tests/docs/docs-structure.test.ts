import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DOCS_ROOT = join(process.cwd(), 'docs');
const LANGS = ['en', 'tr'] as const;

/**
 * Structural guard over the bilingual documentation corpus.
 *
 * Rewritten 2026-08-02. The previous version asserted the pre-reset single-language
 * layout (docs/guide, docs/reference, docs/architecture, docs/development,
 * docs/release). The 2026-08 docs reset replaced that corpus with a bilingual
 * docs/{en,tr}/** tree and this guard did not notice — 26 test files broke and CI
 * stayed red from commit 97b91e69f onward. The point of this file is that the *next*
 * corpus change cannot happen quietly.
 */

function mdFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...mdFiles(p));
    else if (entry.name.endsWith('.md')) out.push(p);
  }
  return out;
}

function relativeMd(dir: string): string[] {
  return mdFiles(dir).map((p) => p.slice(dir.length + 1));
}

// ─── Bilingual corpus ────────────────────────────────────────────────────────

describe('docs/ bilingual corpus structure', () => {
  for (const lang of LANGS) {
    it(`docs/${lang}/ exists and is non-trivial`, () => {
      const dir = join(DOCS_ROOT, lang);
      expect(existsSync(dir)).toBe(true);
      expect(mdFiles(dir).length).toBeGreaterThanOrEqual(20);
    });
  }

  it('EN and TR are structurally paired (same relative file set)', () => {
    const en = relativeMd(join(DOCS_ROOT, 'en')).sort();
    const tr = relativeMd(join(DOCS_ROOT, 'tr')).sort();
    expect(tr).toEqual(en);
  });

  it('every language tree carries the load-bearing sections', () => {
    for (const lang of LANGS) {
      const rel = relativeMd(join(DOCS_ROOT, lang));
      for (const section of ['guide/', 'reference/', 'operations/', 'governance/']) {
        expect(rel.some((f) => f.startsWith(section))).toBe(true);
      }
      expect(rel).toContain('overview.md');
      expect(rel).toContain('glossary.md');
    }
  });
});

// ─── Generated vs hand-written separation ────────────────────────────────────

describe('docs/ generated-vs-handwritten separation', () => {
  it('generated reference docs live under docs/generated/<lang>/reference/', () => {
    for (const lang of LANGS) {
      const dir = join(DOCS_ROOT, 'generated', lang, 'reference');
      expect(existsSync(dir)).toBe(true);
      const files = relativeMd(dir);
      for (const expected of ['mcp-tools.md', 'mcp-resources.md', 'cli.md', 'agents.md']) {
        expect(files).toContain(expected);
      }
    }
  });

  it('docs/generated/ carries its hand-edit ban notice', () => {
    const readme = join(DOCS_ROOT, 'generated', 'README.md');
    expect(existsSync(readme)).toBe(true);
    expect(readFileSync(readme, 'utf-8')).toMatch(/elle düzenlenmez|hand-edit/i);
  });

  it('generated output never lands inside the hand-written docs/<lang>/ tree', () => {
    for (const lang of LANGS) {
      const rel = relativeMd(join(DOCS_ROOT, lang));
      expect(rel.some((f) => f.split('/').includes('generated'))).toBe(false);
    }
  });
});

// ─── Pipeline-owned trees survive a docs reset ───────────────────────────────

describe('docs/ pipeline-owned trees', () => {
  it('docs/generated/master-plan-active.{md,json} projections exist', () => {
    expect(existsSync(join(DOCS_ROOT, 'generated', 'master-plan-active.md'))).toBe(true);
    expect(existsSync(join(DOCS_ROOT, 'generated', 'master-plan-active.json'))).toBe(true);
  });

  it('docs/adr/ holds the ADR corpus and its generated index', () => {
    const adrDir = join(DOCS_ROOT, 'adr');
    expect(existsSync(adrDir)).toBe(true);
    expect(existsSync(join(adrDir, 'README.md'))).toBe(true);
    expect(mdFiles(adrDir).length).toBeGreaterThanOrEqual(20);
  });

  it('docs/MASTER-PLAN.md (work SSOT) is present at the docs root', () => {
    expect(existsSync(join(DOCS_ROOT, 'MASTER-PLAN.md'))).toBe(true);
  });
});

// ─── Entry points ────────────────────────────────────────────────────────────

describe('docs/ entry points', () => {
  it('docs/index.md exists', () => {
    expect(existsSync(join(DOCS_ROOT, 'index.md'))).toBe(true);
  });

  it('both root READMEs exist with canonical names', () => {
    expect(existsSync(join(process.cwd(), 'README.md'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'README.tr.md'))).toBe(true);
  });
});

// ─── .claude/rules/ ──────────────────────────────────────────────────────────

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
