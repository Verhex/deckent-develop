// tests/core/routing3/vocabulary-loader.test.ts
//
// Sprint-445 Task 445-003 — vocabulary 3-layer registry loader. Hermetic:
// every layer file lives under a throwaway os.tmpdir() sandbox created per
// test and removed in afterEach; loadVocabulary takes projectRoot/orgOverlayPath
// as explicit params so no HOME/env faking is needed (CUSTOM Test Hermeticity).

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadVocabulary,
  PROJECT_VOCABULARY_RELATIVE_PATH,
  VocabularyLayerParseError,
} from '../../../src/core/routing3/vocabulary.js';
import { BUILTIN_DOMAINS } from '../../../src/core/routing3/vocabulary-builtin.js';

const sandboxes: string[] = [];

function makeSandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), 'deckent-vocab-'));
  sandboxes.push(dir);
  return dir;
}

function writeProjectVocab(root: string, content: unknown): void {
  const dir = join(root, '.deckent', 'routing');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'vocabulary.json'), typeof content === 'string' ? content : JSON.stringify(content));
}

function writeOverlayFile(path: string, content: unknown): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content));
}

afterEach(() => {
  while (sandboxes.length > 0) {
    const dir = sandboxes.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('loadVocabulary — builtin-only (zero-config path)', () => {
  it('returns exactly the builtin domains when no project file and no org-overlay opt exist', async () => {
    const root = makeSandbox();
    const registry = await loadVocabulary(root);

    expect(registry.domains).toHaveLength(BUILTIN_DOMAINS.length);
    expect(registry.domains.map((d) => d.id).sort()).toEqual(BUILTIN_DOMAINS.map((d) => d.id).sort());
    expect(registry.mergeReport.layerCounts).toEqual({
      builtin: BUILTIN_DOMAINS.length,
      orgOverlay: 0,
      project: 0,
    });
    expect(registry.mergeReport.shadowed).toEqual([]);
    expect(registry.mergeReport.invalid).toEqual([]);
  });

  it('is absent-tolerant when opts.orgOverlayPath points at a nonexistent file', async () => {
    const root = makeSandbox();
    const registry = await loadVocabulary(root, { orgOverlayPath: join(root, 'nope', 'org-vocab.json') });

    expect(registry.mergeReport.layerCounts.orgOverlay).toBe(0);
    expect(registry.mergeReport.invalid).toEqual([]);
  });
});

describe('loadVocabulary — project layer override + shadow reporting', () => {
  it('project layer wins over builtin on duplicate id and reports the shadow', async () => {
    const root = makeSandbox();
    writeProjectVocab(root, {
      domains: [
        {
          id: 'api',
          aliases: ['custom-api-alias'],
          pathPatterns: ['custom/api/**'],
          stackMarkers: [],
          description: 'Project-overridden API domain.',
          surfaces: ['api'],
          exclusiveRoles: [],
        },
        {
          id: 'brand-new-domain',
          description: 'A domain that only this project defines.',
        },
      ],
    });

    const registry = await loadVocabulary(root);

    expect(registry.mergeReport.layerCounts.project).toBe(2);
    const api = registry.domains.find((d) => d.id === 'api');
    expect(api?.description).toBe('Project-overridden API domain.');
    expect(api?.aliases).toEqual(['custom-api-alias']);

    const brandNew = registry.domains.find((d) => d.id === 'brand-new-domain');
    expect(brandNew).toBeDefined();
    // Defaults fill in the omitted array fields.
    expect(brandNew?.aliases).toEqual([]);
    expect(brandNew?.pathPatterns).toEqual([]);

    expect(registry.mergeReport.shadowed).toContainEqual({
      domainId: 'api',
      shadowedLayer: 'builtin',
      shadowingLayer: 'project',
    });
    // The brand-new domain never collided with anything.
    expect(registry.mergeReport.shadowed.some((s) => s.domainId === 'brand-new-domain')).toBe(false);
  });

  it('resolves the full builtin -> org-overlay -> project shadow chain for the same id', async () => {
    const root = makeSandbox();
    const overlayPath = join(root, 'org', 'overlay.json');
    writeOverlayFile(overlayPath, {
      domains: [{ id: 'security', description: 'Org-overlay security override.' }],
    });
    writeProjectVocab(root, {
      domains: [{ id: 'security', description: 'Project security override.' }],
    });

    const registry = await loadVocabulary(root, { orgOverlayPath: overlayPath });

    const security = registry.domains.find((d) => d.id === 'security');
    expect(security?.description).toBe('Project security override.');

    expect(registry.mergeReport.shadowed).toContainEqual({
      domainId: 'security',
      shadowedLayer: 'builtin',
      shadowingLayer: 'org-overlay',
    });
    expect(registry.mergeReport.shadowed).toContainEqual({
      domainId: 'security',
      shadowedLayer: 'org-overlay',
      shadowingLayer: 'project',
    });
    expect(registry.mergeReport.layerCounts).toEqual({
      builtin: BUILTIN_DOMAINS.length,
      orgOverlay: 1,
      project: 1,
    });
  });

  it('reports an intra-layer duplicate id as shadowed too (last entry in the file wins)', async () => {
    const root = makeSandbox();
    writeProjectVocab(root, {
      domains: [
        { id: 'dup-domain', description: 'first' },
        { id: 'dup-domain', description: 'second' },
      ],
    });

    const registry = await loadVocabulary(root);

    const dup = registry.domains.filter((d) => d.id === 'dup-domain');
    expect(dup).toHaveLength(1);
    expect(dup[0]?.description).toBe('second');
    expect(registry.mergeReport.shadowed).toContainEqual({
      domainId: 'dup-domain',
      shadowedLayer: 'project',
      shadowingLayer: 'project',
    });
  });
});

describe('loadVocabulary — fail-soft on malformed layers', () => {
  it('skips a project layer with invalid JSON, reports it, and keeps builtin-only domains', async () => {
    const root = makeSandbox();
    writeProjectVocab(root, '{ this is not valid json');

    const registry = await loadVocabulary(root);

    expect(registry.domains).toHaveLength(BUILTIN_DOMAINS.length);
    expect(registry.mergeReport.layerCounts.project).toBe(0);
    expect(registry.mergeReport.invalid).toHaveLength(1);
    const entry = registry.mergeReport.invalid[0];
    expect(entry?.layer).toBe('project');
    expect(entry?.reason).toMatch(/invalid JSON/i);
    expect(entry?.error).toBeInstanceOf(VocabularyLayerParseError);
  });

  it('rejects an unknown field via zod strict mode and reports the layer as invalid', async () => {
    const root = makeSandbox();
    writeProjectVocab(root, {
      domains: [
        { id: 'weird-domain', description: 'has an unexpected field', notInSchema: true },
      ],
    });

    const registry = await loadVocabulary(root);

    expect(registry.domains.some((d) => d.id === 'weird-domain')).toBe(false);
    expect(registry.mergeReport.invalid).toHaveLength(1);
    expect(registry.mergeReport.invalid[0]?.layer).toBe('project');
  });

  it('rejects a domain entry missing the required id field', async () => {
    const root = makeSandbox();
    writeProjectVocab(root, {
      domains: [{ description: 'no id here' }],
    });

    const registry = await loadVocabulary(root);

    expect(registry.mergeReport.invalid).toHaveLength(1);
    expect(registry.mergeReport.invalid[0]?.reason.length).toBeGreaterThan(0);
  });

  it('a malformed org-overlay does not prevent a valid project layer from applying', async () => {
    const root = makeSandbox();
    const overlayPath = join(root, 'org', 'overlay.json');
    writeOverlayFile(overlayPath, '{ broken');
    writeProjectVocab(root, {
      domains: [{ id: 'still-applies', description: 'project layer still works' }],
    });

    const registry = await loadVocabulary(root, { orgOverlayPath: overlayPath });

    expect(registry.mergeReport.invalid).toHaveLength(1);
    expect(registry.mergeReport.invalid[0]?.layer).toBe('org-overlay');
    expect(registry.domains.some((d) => d.id === 'still-applies')).toBe(true);
  });
});

describe('loadVocabulary — frozen result (no mutable leak)', () => {
  it('deep-freezes the registry, its domains array/entries, and the merge report', async () => {
    const root = makeSandbox();
    writeProjectVocab(root, { domains: [{ id: 'freeze-check', description: 'x' }] });

    const registry = await loadVocabulary(root);

    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.isFrozen(registry.domains)).toBe(true);
    expect(Object.isFrozen(registry.domains[0])).toBe(true);
    expect(Object.isFrozen(registry.domains[0]?.aliases)).toBe(true);
    expect(Object.isFrozen(registry.mergeReport)).toBe(true);
    expect(Object.isFrozen(registry.mergeReport.shadowed)).toBe(true);
    expect(Object.isFrozen(registry.mergeReport.layerCounts)).toBe(true);

    expect(() => {
      (registry.domains as DomainDefArrayMutable).push({
        id: 'injected',
        aliases: [],
        pathPatterns: [],
        stackMarkers: [],
        description: '',
        surfaces: [],
        exclusiveRoles: [],
      });
    }).toThrow();
  });

  it('does not mutate the shared BUILTIN_DOMAINS module singleton as a side effect', async () => {
    const beforeFrozen = Object.isFrozen(BUILTIN_DOMAINS[0]);
    const root = makeSandbox();
    await loadVocabulary(root);
    // Calling loadVocabulary must clone builtin entries before freezing its
    // own result — the shared singleton's frozen-ness must be unaffected.
    expect(Object.isFrozen(BUILTIN_DOMAINS[0])).toBe(beforeFrozen);
    expect(BUILTIN_DOMAINS.find((d) => d.id === 'api')?.description).not.toBe('');
  });
});

describe('loadVocabulary — path resolution', () => {
  it('reads the project layer from the documented relative path', async () => {
    const root = makeSandbox();
    expect(PROJECT_VOCABULARY_RELATIVE_PATH).toBe('.deckent/routing/vocabulary.json');
    writeProjectVocab(root, { domains: [{ id: 'path-check', description: 'x' }] });
    const registry = await loadVocabulary(root);
    expect(registry.domains.some((d) => d.id === 'path-check')).toBe(true);
  });
});

// Local structural alias — the registry's `domains` field is typed readonly,
// this cast exists purely to exercise the runtime freeze in the mutation test.
type DomainDefArrayMutable = { push: (...items: unknown[]) => number };
