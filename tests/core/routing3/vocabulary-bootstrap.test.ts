// tests/core/routing3/vocabulary-bootstrap.test.ts
//
// Sprint-445 Task 445-022 — vocabulary bootstrap generator. Hermetic: every
// fixture project lives under a throwaway os.tmpdir() sandbox created per
// test and removed in afterEach (CUSTOM Test Hermeticity) — this suite NEVER
// touches the real project's `.deckent/routing/vocabulary.json` (real
// bootstrap run against this repo is host-side, by Brain, post-sprint).

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  bootstrapProjectVocabulary,
  writeVocabulary,
} from '../../../src/core/routing3/vocabulary-bootstrap.js';
import { PROJECT_VOCABULARY_RELATIVE_PATH } from '../../../src/core/routing3/vocabulary.js';
import type { ProjectStack } from '../../../src/core/skill-types.js';
import type { DomainDef } from '../../../src/core/routing3/types.js';

const sandboxes: string[] = [];

function makeSandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), 'deckent-vocab-bootstrap-'));
  sandboxes.push(dir);
  return dir;
}

function writeSrcFile(root: string, relativePath: string, content = '// fixture\n'): void {
  const fullPath = join(root, 'src', relativePath);
  mkdirSync(join(fullPath, '..'), { recursive: true });
  writeFileSync(fullPath, content);
}

function makeEmptyDir(root: string, relativeDir: string): void {
  mkdirSync(join(root, 'src', relativeDir), { recursive: true });
}

function makeStack(overrides: Partial<ProjectStack> = {}): ProjectStack {
  return {
    language: 'typescript',
    framework: 'unknown',
    dependencies: [],
    buildTool: 'tsc',
    testFramework: 'vitest',
    detectedAt: '2026-07-14T00:00:00.000Z',
    ...overrides,
  };
}

afterEach(() => {
  while (sandboxes.length > 0) {
    const dir = sandboxes.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('bootstrapProjectVocabulary — candidate derivation', () => {
  it('returns empty candidates and skipped when there is no src/ directory at all', () => {
    const root = makeSandbox();
    const result = bootstrapProjectVocabulary(root, makeStack());
    expect(result.candidates).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it('proposes a candidate for a substantial, uncovered top-level src/ subdirectory (src/nervous -> nervous)', () => {
    const root = makeSandbox();
    writeSrcFile(root, 'nervous/observer.ts');

    const result = bootstrapProjectVocabulary(root, makeStack());

    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    expect(candidate?.domain.id).toBe('nervous');
    expect(candidate?.domain.pathPatterns).toEqual(['src/nervous/**']);
    expect(candidate?.domain.aliases).toEqual([]);
    expect(candidate?.domain.description.length).toBeGreaterThan(0);
    expect(candidate?.rationale).toMatch(/nervous/);
    expect(candidate?.rationale).toMatch(/not represented/);
  });

  it('skips an empty (non-substantial) subdirectory and records why', () => {
    const root = makeSandbox();
    makeEmptyDir(root, 'placeholder');

    const result = bootstrapProjectVocabulary(root, makeStack());

    expect(result.candidates).toEqual([]);
    expect(result.skipped).toContainEqual({
      name: 'placeholder',
      reason: 'not-substantial',
      detail: expect.stringContaining('no files'),
    });
  });

  it('skips a subdirectory already represented by a builtin domain id', () => {
    const root = makeSandbox();
    writeSrcFile(root, 'api/handler.ts');

    const result = bootstrapProjectVocabulary(root, makeStack());

    expect(result.candidates.some((c) => c.domain.id === 'api')).toBe(false);
    expect(result.skipped).toContainEqual(
      expect.objectContaining({ name: 'api', reason: 'already-represented' }),
    );
  });

  it('skips a subdirectory already represented by a builtin domain ALIAS (not just id)', () => {
    const root = makeSandbox();
    // 'orchestra' is an alias of the 'orchestration' builtin domain, not an id.
    writeSrcFile(root, 'orchestra/planner.ts');

    const result = bootstrapProjectVocabulary(root, makeStack());

    expect(result.candidates.some((c) => c.domain.id === 'orchestra')).toBe(false);
    expect(result.skipped).toContainEqual(
      expect.objectContaining({ name: 'orchestra', reason: 'already-represented' }),
    );
  });

  it('attaches matching stack dependencies as stackMarkers evidence on the candidate', () => {
    const root = makeSandbox();
    writeSrcFile(root, 'metrics/collector.ts');

    const result = bootstrapProjectVocabulary(
      root,
      makeStack({ dependencies: ['metrics', 'unrelated-pkg'] }),
    );

    const candidate = result.candidates.find((c) => c.domain.id === 'metrics');
    expect(candidate?.domain.stackMarkers).toEqual(['metrics']);
    expect(candidate?.rationale).toMatch(/stackMarker/);
  });

  it('does not attach unrelated dependencies as stackMarkers', () => {
    const root = makeSandbox();
    writeSrcFile(root, 'billing/invoice.ts');

    const result = bootstrapProjectVocabulary(root, makeStack({ dependencies: ['stripe-sdk'] }));

    const candidate = result.candidates.find((c) => c.domain.id === 'billing');
    expect(candidate?.domain.stackMarkers).toEqual([]);
  });

  it('proposes multiple independent candidates for multiple uncovered substantial subdirectories', () => {
    const root = makeSandbox();
    writeSrcFile(root, 'nervous/observer.ts');
    writeSrcFile(root, 'billing/invoice.ts');

    const result = bootstrapProjectVocabulary(root, makeStack());

    const ids = result.candidates.map((c) => c.domain.id).sort();
    expect(ids).toEqual(['billing', 'nervous']);
  });
});

describe('writeVocabulary — three-way overwrite protection', () => {
  const oneDef = (id: string, description = 'x'): DomainDef => ({
    id,
    aliases: [],
    pathPatterns: [],
    stackMarkers: [],
    description,
    surfaces: [],
    exclusiveRoles: [],
  });

  it('(c) creates the file when it does not exist yet', () => {
    const root = makeSandbox();
    const result = writeVocabulary(root, [oneDef('brand-new')]);

    expect(result.status).toBe('created');
    const targetPath = join(root, PROJECT_VOCABULARY_RELATIVE_PATH);
    const content = JSON.parse(readFileSync(targetPath, 'utf8')) as { domains: DomainDef[] };
    expect(content.domains).toHaveLength(1);
    expect(content.domains[0]?.id).toBe('brand-new');
  });

  it('(a) safely regenerates when the existing file is unedited since the last bootstrap write', () => {
    const root = makeSandbox();
    const first = writeVocabulary(root, [oneDef('v1')]);
    expect(first.status).toBe('created');

    const second = writeVocabulary(root, [oneDef('v2')]);
    expect(second.status).toBe('updated');

    const targetPath = join(root, PROJECT_VOCABULARY_RELATIVE_PATH);
    const content = JSON.parse(readFileSync(targetPath, 'utf8')) as { domains: DomainDef[] };
    expect(content.domains.map((d) => d.id)).toEqual(['v2']);
  });

  it('(b) refuses to overwrite a file that was locally edited by a user, and reports why', () => {
    const root = makeSandbox();
    writeVocabulary(root, [oneDef('v1')]);

    const targetPath = join(root, PROJECT_VOCABULARY_RELATIVE_PATH);
    const userEdited = JSON.stringify({ domains: [oneDef('v1', 'hand-edited by a user')] }, null, 2);
    writeFileSync(targetPath, userEdited, 'utf8');

    const result = writeVocabulary(root, [oneDef('v2')]);

    expect(result.status).toBe('kept-local');
    expect(result.reason).toBeTruthy();
    // The on-disk file must be untouched — never silently overwritten.
    expect(readFileSync(targetPath, 'utf8')).toBe(userEdited);
  });

  it('(b) refuses to overwrite a pre-existing file that bootstrap never generated (no baseline recorded)', () => {
    const root = makeSandbox();
    const targetPath = join(root, PROJECT_VOCABULARY_RELATIVE_PATH);
    mkdirSync(join(targetPath, '..'), { recursive: true });
    const handAuthored = JSON.stringify({ domains: [oneDef('hand-authored')] }, null, 2);
    writeFileSync(targetPath, handAuthored, 'utf8');

    const result = writeVocabulary(root, [oneDef('bootstrap-would-write-this')]);

    expect(result.status).toBe('kept-local');
    expect(readFileSync(targetPath, 'utf8')).toBe(handAuthored);
  });

  it('is idempotent (a repeat write with identical defs is a no-op "updated" status)', () => {
    const root = makeSandbox();
    writeVocabulary(root, [oneDef('same')]);
    const result = writeVocabulary(root, [oneDef('same')]);

    expect(result.status).toBe('updated');
    const targetPath = join(root, PROJECT_VOCABULARY_RELATIVE_PATH);
    const content = JSON.parse(readFileSync(targetPath, 'utf8')) as { domains: DomainDef[] };
    expect(content.domains.map((d) => d.id)).toEqual(['same']);
  });
});
