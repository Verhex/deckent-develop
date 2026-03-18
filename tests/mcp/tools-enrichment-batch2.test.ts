import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('MCP Enrichment Tools Batch 2', () => {
  const toolsDir = '/home/alperen/deckent-dev/src/mcp/tools';
  const enricherPath = '/home/alperen/deckent-dev/src/mcp/helpers/enrich.ts';

  describe('Tool imports verification', () => {
    it('doctor.ts should import enrichResponse', () => {
      const content = readFileSync(join(toolsDir, 'doctor.ts'), 'utf-8');
      expect(content).toContain("import { enrichResponse } from '../helpers/enrich.js'");
    });

    it('init.ts should import enrichResponse', () => {
      const content = readFileSync(join(toolsDir, 'init.ts'), 'utf-8');
      expect(content).toContain("import { enrichResponse } from '../helpers/enrich.js'");
    });

    it('retro.ts should import enrichResponse', () => {
      const content = readFileSync(join(toolsDir, 'retro.ts'), 'utf-8');
      expect(content).toContain("import { enrichResponse } from '../helpers/enrich.js'");
    });

    it('history.ts should import enrichResponse', () => {
      const content = readFileSync(join(toolsDir, 'history.ts'), 'utf-8');
      expect(content).toContain("import { enrichResponse } from '../helpers/enrich.js'");
    });

    it('sync.ts should import enrichResponse', () => {
      const content = readFileSync(join(toolsDir, 'sync.ts'), 'utf-8');
      expect(content).toContain("import { enrichResponse } from '../helpers/enrich.js'");
    });

    it('analyze.ts should import enrichResponse', () => {
      const content = readFileSync(join(toolsDir, 'analyze.ts'), 'utf-8');
      expect(content).toContain("import { enrichResponse } from '../helpers/enrich.js'");
    });
  });

  describe('Tool response field mappings', () => {
    it('doctor should have recommendations field', () => {
      const content = readFileSync(join(toolsDir, 'doctor.ts'), 'utf-8');
      expect(content).toContain("response['recommendations']");
      expect(content).toContain("enrichResponse('doctor', response)");
    });

    it('init should have nextSteps field', () => {
      const content = readFileSync(join(toolsDir, 'init.ts'), 'utf-8');
      expect(content).toContain('nextSteps');
      expect(content).toContain("enrichResponse('init'");
    });

    it('retro should have highlights field', () => {
      const content = readFileSync(join(toolsDir, 'retro.ts'), 'utf-8');
      expect(content).toContain('highlights');
      expect(content).toContain("enrichResponse('retro'");
    });

    it('history should have trend field', () => {
      const content = readFileSync(join(toolsDir, 'history.ts'), 'utf-8');
      expect(content).toContain('trend');
      expect(content).toContain("enrichResponse('history'");
    });

    it('sync should have changeCount field', () => {
      const content = readFileSync(join(toolsDir, 'sync.ts'), 'utf-8');
      expect(content).toContain('changeCount');
      expect(content).toContain("enrichResponse('sync'");
    });

    it('analyze should have configSuggestion field', () => {
      const content = readFileSync(join(toolsDir, 'analyze.ts'), 'utf-8');
      expect(content).toContain('configSuggestion');
      expect(content).toContain("enrichResponse('analyze'");
    });
  });

  describe('Enrichment helper', () => {
    it('enrich.ts should define Enriched type with _enriched field', () => {
      const content = readFileSync(enricherPath, 'utf-8');
      expect(content).toContain('type Enriched<T> = T & { _enriched: EnrichedMeta }');
      expect(content).toContain('_enriched');
    });

    it('enrich.ts should have EnrichedMeta interface', () => {
      const content = readFileSync(enricherPath, 'utf-8');
      expect(content).toContain('interface EnrichedMeta');
      expect(content).toContain('summary:');
      expect(content).toContain('hints:');
      expect(content).toContain('timestamp:');
    });

    it('enrich.ts should support localization', () => {
      const content = readFileSync(enricherPath, 'utf-8');
      expect(content).toContain("lang === 'tr'");
      expect(content).toContain("context?.lang");
    });

    it('enrich.ts should have SUMMARIES for all tools', () => {
      const content = readFileSync(enricherPath, 'utf-8');
      expect(content).toContain('doctor: (_r, lang)');
      expect(content).toContain('init: (_r, lang)');
      expect(content).toContain('retro: (_r, lang)');
      expect(content).toContain('history: (_r, lang)');
      expect(content).toContain('sync: (_r, lang)');
      expect(content).toContain('analyze: (_r, lang)');
    });

    it('enrich.ts should have HINTS for all tools', () => {
      const content = readFileSync(enricherPath, 'utf-8');
      const hintsSection = content.slice(content.indexOf('const HINTS'));
      expect(hintsSection).toContain('doctor: ()');
      expect(hintsSection).toContain('init: ()');
      expect(hintsSection).toContain('retro: ()');
      expect(hintsSection).toContain('history: ()');
      expect(hintsSection).toContain('sync: ()');
      expect(hintsSection).toContain('analyze: ()');
    });
  });

  describe('Backwards compatibility', () => {
    it('enrichResponse should preserve existing response fields', () => {
      const content = readFileSync(enricherPath, 'utf-8');
      // Verifies spreading behavior: { ...response, _enriched: meta }
      expect(content).toContain('{ ...response, _enriched: meta }');
    });

    it('doctor.ts should not break existing response structure', () => {
      const content = readFileSync(join(toolsDir, 'doctor.ts'), 'utf-8');
      expect(content).toContain('response: Record<string, unknown>');
      expect(content).toContain('const enriched = enrichResponse');
    });

    it('init.ts should support language parameter for localization', () => {
      const content = readFileSync(join(toolsDir, 'init.ts'), 'utf-8');
      expect(content).toContain('enrichResponse(\'init\'');
      expect(content).toContain('{ lang: language }');
    });
  });
});
