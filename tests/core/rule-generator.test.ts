import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  generateRules,
  loadTemplate,
  renderTemplate,
  formatAdrSection,
  extractCustomSection,
  mergeWithCustom,
  type RuleGeneratorOptions,
  type RuleProvider,
  type RuleRole,
} from '../../src/core/rule-generator.js';
import type { MemoryEntryV2 } from '../../src/core/memory-types.js';

// ─── Helpers ─────────────────────────────────────────────────────

const TEST_ROOT = join(process.cwd(), '.test-rule-gen-' + process.pid);

function makeAdr(overrides: Partial<MemoryEntryV2> = {}): MemoryEntryV2 {
  return {
    id: 'adr-001',
    type: 'adr',
    source: 'system',
    title: 'TypeScript + ESM',
    content: 'Use TypeScript with ESM modules for all source files.',
    summary: 'TypeScript + ESM standard',
    tag_text: 'typescript,esm',
    title_norm: 'typescript + esm',
    content_norm: 'use typescript with esm modules for all source files.',
    summary_norm: 'typescript + esm standard',
    tag_norm: 'typescript,esm',
    status: 'accepted',
    priority: 'high',
    sprint_id: 'sprint-001',
    sprint_num: 1,
    lang: 'en',
    decay_exempt: true,
    metadata: '{}',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

function setupTestDir(): void {
  mkdirSync(TEST_ROOT, { recursive: true });
}

function cleanupTestDir(): void {
  if (existsSync(TEST_ROOT)) {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  }
}

// ─── Tests ───────────────────────────────────────────────────────

describe('rule-generator', () => {
  beforeEach(setupTestDir);
  afterEach(cleanupTestDir);

  // ── Template Loading ───────────────────────────────────────────

  describe('loadTemplate', () => {
    it('loads brain template', () => {
      const tpl = loadTemplate('brain');
      expect(tpl).toContain('# Brain Rules');
      expect(tpl).toContain('{{ADR_SECTION}}');
    });

    it('loads auditor template', () => {
      const tpl = loadTemplate('auditor');
      expect(tpl).toContain('# Auditor Rules');
      expect(tpl).toContain('{{ADR_SECTION}}');
    });

    it('loads worker-default template', () => {
      const tpl = loadTemplate('worker-default');
      expect(tpl).toContain('# Worker Rules');
      expect(tpl).toContain('{{ADR_SECTION}}');
    });

    it('throws on missing template', () => {
      expect(() => loadTemplate('brain', '/nonexistent-dir')).toThrow('Rule template not found');
    });
  });

  // ── ADR Formatting ────────────────────────────────────────────

  describe('formatAdrSection', () => {
    it('returns empty string for no ADRs', () => {
      expect(formatAdrSection([])).toBe('');
    });

    it('formats accepted ADRs', () => {
      const adrs = [makeAdr(), makeAdr({ id: 'adr-002', title: 'Node16 Resolution', summary: 'Node16 module resolution' })];
      const section = formatAdrSection(adrs);
      expect(section).toContain('## Active ADR Constraints');
      expect(section).toContain('**ADR-001**');
      expect(section).toContain('**ADR-002**');
    });

    it('skips non-accepted ADRs', () => {
      const adrs = [makeAdr({ status: 'deprecated' }), makeAdr({ id: 'adr-002', status: 'accepted' })];
      const section = formatAdrSection(adrs);
      expect(section).not.toContain('ADR-001');
      expect(section).toContain('ADR-002');
    });

    it('uses content first line when summary is null', () => {
      const adrs = [makeAdr({ summary: null })];
      const section = formatAdrSection(adrs);
      expect(section).toContain('Use TypeScript with ESM modules');
    });

    it('truncates long summaries', () => {
      const longSummary = 'A'.repeat(200);
      const adrs = [makeAdr({ summary: longSummary })];
      const section = formatAdrSection(adrs);
      // Should be truncated to 120 chars
      expect(section).toContain('A'.repeat(120));
      expect(section).not.toContain('A'.repeat(121));
    });
  });

  // ── Template Rendering ────────────────────────────────────────

  describe('renderTemplate', () => {
    it('replaces ADR placeholder with ADR section', () => {
      const tpl = '# Rules\n\n{{ADR_SECTION}}\n';
      const adrs = [makeAdr()];
      const rendered = renderTemplate(tpl, adrs);
      expect(rendered).toContain('## Active ADR Constraints');
      expect(rendered).not.toContain('{{ADR_SECTION}}');
    });

    it('removes placeholder when no ADRs', () => {
      const tpl = '# Rules\n\n{{ADR_SECTION}}\n';
      const rendered = renderTemplate(tpl, []);
      expect(rendered).not.toContain('{{ADR_SECTION}}');
      expect(rendered).toContain('# Rules');
    });
  });

  // ── Custom Section Extraction ──────────────────────────────────

  describe('extractCustomSection', () => {
    it('extracts custom content between markers', () => {
      const content = '<!-- AUTO-START -->\nauto\n<!-- AUTO-END -->\n<!-- CUSTOM-START -->\nmy custom rule\n<!-- CUSTOM-END -->\n';
      const custom = extractCustomSection(content);
      expect(custom).toBe('\nmy custom rule\n');
    });

    it('returns null when no markers', () => {
      expect(extractCustomSection('just plain text')).toBeNull();
    });

    it('returns null when only start marker', () => {
      expect(extractCustomSection('<!-- CUSTOM-START -->\nstuff')).toBeNull();
    });
  });

  // ── Merge With Custom ──────────────────────────────────────────

  describe('mergeWithCustom', () => {
    it('preserves custom section from existing file', () => {
      const auto = '# New auto content\n';
      const existing = '<!-- AUTO-START -->\n# Old\n<!-- AUTO-END -->\n\n<!-- CUSTOM-START -->\nmy rule\n<!-- CUSTOM-END -->\n';
      const merged = mergeWithCustom(auto, existing);
      expect(merged).toContain('# New auto content');
      expect(merged).toContain('my rule');
      expect(merged).not.toContain('# Old');
    });

    it('creates empty custom section for new files', () => {
      const merged = mergeWithCustom('# Auto\n', null);
      expect(merged).toContain('<!-- AUTO-START -->');
      expect(merged).toContain('<!-- AUTO-END -->');
      expect(merged).toContain('<!-- CUSTOM-START -->');
      expect(merged).toContain('<!-- CUSTOM-END -->');
    });
  });

  // ── Provider Adapters ──────────────────────────────────────────

  describe('provider adapters', () => {
    it('claude adapter adds frontmatter with paths', () => {
      const opts: RuleGeneratorOptions = {
        projectRoot: TEST_ROOT,
        adrs: [],
        providers: ['claude'],
        roles: ['brain'],
      };
      const result = generateRules(opts);
      expect(result.filesWritten.length).toBe(1);
      const content = readFileSync(result.filesWritten[0]!, 'utf-8');
      expect(content).toContain('---');
      expect(content).toContain('paths:');
    });

    it('codex adapter generates plain markdown', () => {
      const opts: RuleGeneratorOptions = {
        projectRoot: TEST_ROOT,
        adrs: [],
        providers: ['codex'],
        roles: ['brain'],
      };
      const result = generateRules(opts);
      expect(result.filesWritten.length).toBe(1);
      const content = readFileSync(result.filesWritten[0]!, 'utf-8');
      expect(content).not.toContain('paths:');
      expect(content).toContain('# Brain Rules');
    });

    it('gemini adapter generates plain markdown', () => {
      const opts: RuleGeneratorOptions = {
        projectRoot: TEST_ROOT,
        adrs: [],
        providers: ['gemini'],
        roles: ['brain'],
      };
      const result = generateRules(opts);
      expect(result.filesWritten.length).toBe(1);
      const content = readFileSync(result.filesWritten[0]!, 'utf-8');
      expect(content).not.toContain('paths:');
      expect(content).toContain('# Brain Rules');
    });
  });

  // ── Full Generation ────────────────────────────────────────────

  describe('generateRules', () => {
    it('generates 12 files for all providers × all roles', () => {
      // Sprint 168 C0a-2: cursor provider added — 4 providers × 3 roles = 12.
      const result = generateRules({ projectRoot: TEST_ROOT, adrs: [] });
      expect(result.filesWritten.length).toBe(12);
      expect(result.errors.length).toBe(0);

      // Verify directory structure (cursor → .mdc, others → .md)
      for (const provider of ['claude', 'codex', 'gemini', 'cursor'] as const) {
        for (const role of ['brain', 'auditor', 'worker-default'] as const) {
          const dir = provider === 'claude' ? '.claude' : `.${provider}`;
          const ext = provider === 'cursor' ? 'mdc' : 'md';
          const filePath = join(TEST_ROOT, dir, 'rules', `${role}.${ext}`);
          expect(existsSync(filePath), `${filePath} should exist`).toBe(true);
        }
      }
    });

    it('includes ADR entries in generated rules', () => {
      const adrs = [makeAdr(), makeAdr({ id: 'adr-003', title: 'vitest over Jest' })];
      const result = generateRules({ projectRoot: TEST_ROOT, adrs });
      expect(result.errors.length).toBe(0);

      // Check one file has ADR content
      const brainPath = join(TEST_ROOT, '.claude', 'rules', 'brain.md');
      const content = readFileSync(brainPath, 'utf-8');
      expect(content).toContain('ADR-001');
      expect(content).toContain('ADR-003');
    });

    it('preserves custom sections on re-generation', () => {
      // First generation
      generateRules({ projectRoot: TEST_ROOT, adrs: [] });

      // Manually add custom content
      const brainPath = join(TEST_ROOT, '.codex', 'rules', 'brain.md');
      let content = readFileSync(brainPath, 'utf-8');
      content = content.replace(
        '<!-- CUSTOM-START -->\n<!-- CUSTOM-END -->',
        '<!-- CUSTOM-START -->\n## My Custom Brain Rule\n- Always drink coffee\n<!-- CUSTOM-END -->',
      );
      writeFileSync(brainPath, content, 'utf-8');

      // Re-generate
      const result = generateRules({ projectRoot: TEST_ROOT, adrs: [makeAdr()] });
      expect(result.errors.length).toBe(0);

      const newContent = readFileSync(brainPath, 'utf-8');
      expect(newContent).toContain('Always drink coffee');
      expect(newContent).toContain('ADR-001');
    });

    it('is idempotent — same output on repeated runs', () => {
      const adrs = [makeAdr()];
      generateRules({ projectRoot: TEST_ROOT, adrs });
      const first = readFileSync(join(TEST_ROOT, '.claude', 'rules', 'brain.md'), 'utf-8');

      generateRules({ projectRoot: TEST_ROOT, adrs });
      const second = readFileSync(join(TEST_ROOT, '.claude', 'rules', 'brain.md'), 'utf-8');

      expect(first).toBe(second);
    });

    it('handles subset of providers', () => {
      const result = generateRules({
        projectRoot: TEST_ROOT,
        adrs: [],
        providers: ['codex'],
      });
      expect(result.filesWritten.length).toBe(3);
      expect(existsSync(join(TEST_ROOT, '.codex', 'rules', 'brain.md'))).toBe(true);
      expect(existsSync(join(TEST_ROOT, '.claude', 'rules', 'brain.md'))).toBe(false);
    });

    it('handles subset of roles', () => {
      const result = generateRules({
        projectRoot: TEST_ROOT,
        adrs: [],
        roles: ['brain'],
      });
      // Sprint 168 C0a-2: 4 providers × 1 role = 4 (cursor added).
      expect(result.filesWritten.length).toBe(4);
    });

    it('preserves existing file content as custom when no markers present', () => {
      // Create a pre-existing file without markers
      const dir = join(TEST_ROOT, '.codex', 'rules');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'brain.md'), '# My Pre-existing Rules\n- Important legacy rule\n', 'utf-8');

      const result = generateRules({ projectRoot: TEST_ROOT, adrs: [], providers: ['codex'], roles: ['brain'] });
      expect(result.errors.length).toBe(0);

      const content = readFileSync(join(dir, 'brain.md'), 'utf-8');
      expect(content).toContain('<!-- AUTO-START -->');
      expect(content).toContain('# Brain Rules');
      expect(content).toContain('<!-- CUSTOM-START -->');
      expect(content).toContain('My Pre-existing Rules');
      expect(content).toContain('Important legacy rule');
    });

    it('creates directories that do not exist', () => {
      const result = generateRules({
        projectRoot: TEST_ROOT,
        adrs: [],
        providers: ['gemini'],
        roles: ['auditor'],
      });
      expect(result.filesWritten.length).toBe(1);
      expect(existsSync(join(TEST_ROOT, '.gemini', 'rules', 'auditor.md'))).toBe(true);
    });
  });

  // ── Claude Provider Specific ───────────────────────────────────

  describe('claude provider frontmatter', () => {
    it('brain gets task/brain paths', () => {
      generateRules({ projectRoot: TEST_ROOT, adrs: [], providers: ['claude'], roles: ['brain'] });
      const content = readFileSync(join(TEST_ROOT, '.claude', 'rules', 'brain.md'), 'utf-8');
      expect(content).toContain('.tasks/*');
      expect(content).toContain('.brain/*');
    });

    it('auditor gets dashboard path', () => {
      // Sprint 198-003 / 198-004 — auditor frontmatter paths no longer include
      // `.brain/PATTERNS.md`. Patterns are written to memory.db (SQLite), not
      // to a flat .md file. The auditor only needs `.dashboard` to operate.
      // See src/core/rule-generator.ts claudeAdapter() pathsMap.
      generateRules({ projectRoot: TEST_ROOT, adrs: [], providers: ['claude'], roles: ['auditor'] });
      const content = readFileSync(join(TEST_ROOT, '.claude', 'rules', 'auditor.md'), 'utf-8');
      expect(content).toContain('.dashboard');
      expect(content).not.toContain('PATTERNS.md');
    });

    it('worker gets src/tests paths', () => {
      generateRules({ projectRoot: TEST_ROOT, adrs: [], providers: ['claude'], roles: ['worker-default'] });
      const content = readFileSync(join(TEST_ROOT, '.claude', 'rules', 'worker-default.md'), 'utf-8');
      expect(content).toContain('src/**');
      expect(content).toContain('tests/**');
    });
  });

  // ── Cursor Provider Specific ───────────────────────────────────

  describe('cursor provider mdc', () => {
    it('emits .mdc files with MDC frontmatter on line 1', () => {
      const result = generateRules({ projectRoot: TEST_ROOT, adrs: [], providers: ['cursor'], roles: ['brain'] });
      expect(result.errors.length).toBe(0);
      const mdcPath = join(TEST_ROOT, '.cursor', 'rules', 'brain.mdc');
      expect(existsSync(mdcPath)).toBe(true);
      const content = readFileSync(mdcPath, 'utf-8');
      // Frontmatter must be the very first thing in the file (Cursor requirement)
      expect(content.startsWith('---\n')).toBe(true);
      expect(content).toContain('description: Deckent Brain');
      expect(content).toContain('globs:');
      expect(content).toContain('alwaysApply: false');
      // AUTO block follows the frontmatter
      expect(content).toContain('<!-- AUTO-START -->');
      expect(content).toContain('# Brain Rules');
    });

    it('does not emit a plain .md file for cursor', () => {
      generateRules({ projectRoot: TEST_ROOT, adrs: [], providers: ['cursor'], roles: ['brain'] });
      expect(existsSync(join(TEST_ROOT, '.cursor', 'rules', 'brain.md'))).toBe(false);
    });

    it('is idempotent across repeated runs', () => {
      const adrs = [makeAdr()];
      generateRules({ projectRoot: TEST_ROOT, adrs, providers: ['cursor'], roles: ['brain'] });
      const first = readFileSync(join(TEST_ROOT, '.cursor', 'rules', 'brain.mdc'), 'utf-8');
      generateRules({ projectRoot: TEST_ROOT, adrs, providers: ['cursor'], roles: ['brain'] });
      const second = readFileSync(join(TEST_ROOT, '.cursor', 'rules', 'brain.mdc'), 'utf-8');
      expect(first).toBe(second);
    });
  });

  // ── Error Handling ─────────────────────────────────────────────

  describe('error handling', () => {
    it('reports error for invalid template dir', () => {
      const result = generateRules({
        projectRoot: TEST_ROOT,
        adrs: [],
        templateDir: '/nonexistent-template-dir',
      });
      // Sprint 168 C0a-2: 4 providers × 3 roles = 12 (all fail).
      expect(result.errors.length).toBe(12);
      expect(result.filesWritten.length).toBe(0);
    });
  });
});
