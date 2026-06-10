/**
 * Tests for ADR render dedupe + operative-extract.
 * Sprint 273 — Task 273-012
 *
 * Covers:
 * (1) Dedupe: full mode outer header no longer emits **Status:** accepted
 * (2) Operative mode: content with markers → only operative section shown
 * (3) Operative mode: content without markers → full content fallback
 * (4) Mixed: some ADRs have markers, some don't
 * (5) adrRender='full' default === no operative extraction
 * (6) Config type: adr_render field accepted in PromptConfig
 * (7) Config default: adr_render === 'full' in DEFAULT_PROMPT_CONFIG
 * (8) Config validation: invalid adr_render value rejected
 */
import { describe, it, expect } from 'vitest';
import { buildAdrPromptSection, type AdrRelevance } from '../../src/orchestra/adr-selector.js';
import { DEFAULT_PROMPT_CONFIG, validateConfig, createDefaultConfig, ConfigValidationError } from '../../src/core/config.js';
import type { MemoryEntryV2 } from '../../src/core/memory-types.js';
import type { PromptConfig } from '../../src/core/config-types.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeAdr(id: string, title: string, content: string): MemoryEntryV2 {
  return {
    id,
    type: 'adr',
    source: 'system',
    content,
    summary: null,
    tag_text: '',
    title_norm: '',
    content_norm: '',
    summary_norm: '',
    tag_norm: '',
    status: 'accepted',
    priority: 'normal',
    sprint_id: null,
    sprint_num: 100,
    lang: 'en',
    decay_exempt: true,
    metadata: '{}',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    title,
  };
}

function makeRelevance(adrId: string, title: string): AdrRelevance {
  return { adrId, title, score: 0.9, matchReasons: ['scope-path-match'] };
}

// ─── Fixtures ────────────────────────────────────────────────────────

const CONTENT_WITH_MARKERS = `# ADR-001: TypeScript + ESM

**Status:** accepted

**Date:** 2026-04-16

---

Preamble content before operative section.

<!-- worker-operative-start -->
**Decision:** Use TypeScript with \`"type": "module"\` (ESM) as the project foundation.
**Consequence:** All imports must use \`.js\` extensions. CommonJS interop via \`esModuleInterop\`.
<!-- worker-operative-end -->

Additional notes after operative section.`;

const CONTENT_WITHOUT_MARKERS = `# ADR-008: Brain Merkezi Import

**Status:** accepted

**Date:** 2026-04-16

---

**Decision:** Brain is the only module that imports from tmux, auditor, worker.
**Context:** Circular imports cause undefined behavior in Node.js ESM.
**Consequence:** \`grep -r "from.*brain" src/orchestra/tmux.ts\` must always return empty.`;

const MOCK_ADRS: MemoryEntryV2[] = [
  makeAdr('adr-001', 'TypeScript + ESM', CONTENT_WITH_MARKERS),
  makeAdr('adr-008', 'Brain Merkezi Import — Tek Yönlü Bağımlılık', CONTENT_WITHOUT_MARKERS),
];

// ═══ Tests ═══════════════════════════════════════════════════════════

describe('buildAdrPromptSection — dedupe (default-ON)', () => {
  // Test 1: full mode outer header no longer emits **Status:** accepted
  it('does not emit **Status:** accepted in the outer header', () => {
    const adrs = [makeRelevance('adr-001', 'TypeScript + ESM')];
    const section = buildAdrPromptSection(adrs, 'full', MOCK_ADRS);

    // Outer header: ## adr-001: TypeScript + ESM — then directly content, no **Status:** accepted
    expect(section).toContain('## adr-001: TypeScript + ESM');
    // The outer wrapper must NOT repeat **Status:** accepted before content starts
    const headerEnd = section.indexOf('## adr-001: TypeScript + ESM') + '## adr-001: TypeScript + ESM'.length;
    const betweenHeaderAndContent = section.slice(headerEnd, headerEnd + 50);
    expect(betweenHeaderAndContent).not.toMatch(/\*\*Status:\*\* accepted/);
  });

  // Test 2: outer title header still present (navigation anchor preserved)
  it('still emits the ## adrId: title outer header', () => {
    const adrs = [makeRelevance('adr-008', 'Brain Merkezi Import — Tek Yönlü Bağımlılık')];
    const section = buildAdrPromptSection(adrs, 'full', MOCK_ADRS);

    expect(section).toContain('## adr-008: Brain Merkezi Import — Tek Yönlü Bağımlılık');
  });

  // Test 3: full content still present after dedupe
  it('preserves full content body after dedupe', () => {
    const adrs = [makeRelevance('adr-008', 'Brain Merkezi Import — Tek Yönlü Bağımlılık')];
    const section = buildAdrPromptSection(adrs, 'full', MOCK_ADRS);

    expect(section).toContain('Brain is the only module that imports from tmux, auditor, worker.');
    expect(section).toContain('Circular imports cause undefined behavior');
  });
});

describe('buildAdrPromptSection — operative mode', () => {
  // Test 4: operative mode with markers → only operative section shown
  it('emits only the operative section when markers are present (adrRender=operative)', () => {
    const adrs = [makeRelevance('adr-001', 'TypeScript + ESM')];
    const section = buildAdrPromptSection(adrs, 'full', MOCK_ADRS, 'operative');

    // The operative content must be present
    expect(section).toContain('Use TypeScript with `"type": "module"`');
    expect(section).toContain('All imports must use `.js` extensions');

    // Preamble BEFORE the markers must NOT appear
    expect(section).not.toContain('Preamble content before operative section.');

    // Additional notes AFTER the markers must NOT appear
    expect(section).not.toContain('Additional notes after operative section.');
  });

  // Test 5: operative mode appends footnote pointing to full content
  it('appends [full text: .brain/memory.db adr-NNN] footnote in operative mode', () => {
    const adrs = [makeRelevance('adr-001', 'TypeScript + ESM')];
    const section = buildAdrPromptSection(adrs, 'full', MOCK_ADRS, 'operative');

    expect(section).toContain('[full text: .brain/memory.db adr-001]');
  });

  // Test 6: operative mode without markers → full content fallback (no truncation)
  it('falls back to full content when no operative markers present (adrRender=operative)', () => {
    const adrs = [makeRelevance('adr-008', 'Brain Merkezi Import — Tek Yönlü Bağımlılık')];
    const section = buildAdrPromptSection(adrs, 'full', MOCK_ADRS, 'operative');

    // Full content intact
    expect(section).toContain('Brain is the only module that imports from tmux, auditor, worker.');
    // No footnote when no markers
    expect(section).not.toContain('[full text: .brain/memory.db adr-008]');
  });

  // Test 7: mixed — one ADR with markers, one without
  it('handles mixed ADRs: operative extraction where markers exist, full elsewhere', () => {
    const adrs = [
      makeRelevance('adr-001', 'TypeScript + ESM'),
      makeRelevance('adr-008', 'Brain Merkezi Import — Tek Yönlü Bağımlılık'),
    ];
    const section = buildAdrPromptSection(adrs, 'full', MOCK_ADRS, 'operative');

    // adr-001: should have operative section + footnote
    expect(section).toContain('Use TypeScript with `"type": "module"`');
    expect(section).toContain('[full text: .brain/memory.db adr-001]');
    expect(section).not.toContain('Preamble content before operative section.');

    // adr-008: should have full content, no footnote
    expect(section).toContain('Brain is the only module that imports from tmux, auditor, worker.');
    expect(section).not.toContain('[full text: .brain/memory.db adr-008]');
  });

  // Test 8: adrRender='full' (default) does NOT apply operative extraction
  it('does not apply operative extraction when adrRender=full (default)', () => {
    const adrs = [makeRelevance('adr-001', 'TypeScript + ESM')];
    const section = buildAdrPromptSection(adrs, 'full', MOCK_ADRS, 'full');

    // Preamble must be present (full content, not operative-extracted)
    expect(section).toContain('Preamble content before operative section.');
    // Marker comments themselves may appear in content
    // No footnote in full mode
    expect(section).not.toContain('[full text: .brain/memory.db');
  });
});

describe('PromptConfig — adr_render field', () => {
  // Test 9: DEFAULT_PROMPT_CONFIG has adr_render='full'
  it("DEFAULT_PROMPT_CONFIG.adr_render === 'full'", () => {
    expect((DEFAULT_PROMPT_CONFIG as PromptConfig).adr_render).toBe('full');
  });

  // Test 10: validateConfig accepts adr_render='operative' (no adr_render error)
  it("validateConfig accepts prompt.adr_render = 'operative'", () => {
    const config = createDefaultConfig();
    config.prompt = { adr_render: 'operative' };
    // Should not throw — no adr_render error
    try {
      validateConfig(config);
    } catch (e) {
      if (e instanceof ConfigValidationError) {
        const adrRenderErrors = e.errors.filter(msg => msg.includes('adr_render'));
        expect(adrRenderErrors).toHaveLength(0);
      }
    }
  });

  // Test 11: validateConfig rejects invalid adr_render value
  it("validateConfig rejects prompt.adr_render = 'invalid-value'", () => {
    const config = createDefaultConfig();
    config.prompt = { adr_render: 'invalid-value' as unknown as 'full' };
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    try {
      validateConfig(config);
    } catch (e) {
      if (e instanceof ConfigValidationError) {
        const adrRenderErrors = e.errors.filter(msg => msg.includes('adr_render'));
        expect(adrRenderErrors.length).toBeGreaterThan(0);
        expect(adrRenderErrors[0]).toContain('invalid-value');
      }
    }
  });
});
