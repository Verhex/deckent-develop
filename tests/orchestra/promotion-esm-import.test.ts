// ─── Promotion Pipeline ESM Import Tests ────────────────────────────────────
// Verifies promotion-pipeline.ts uses ESM `import` for 'fs' (no CommonJS
// `require`), and that findTempEntityDir's sprint-scoped lookup (the code
// path that used to call `require('fs')`) still works after the import-form
// change.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { PromotionPipeline } from '../../src/orchestra/promotion-pipeline.js';

const SOURCE_FILE = fileURLToPath(
  new URL('../../src/orchestra/promotion-pipeline.ts', import.meta.url),
);

describe('promotion-pipeline.ts — ESM import form', () => {
  it('contains zero require( occurrences', () => {
    const source = readFileSync(SOURCE_FILE, 'utf-8');
    expect(source.match(/require\(/g)).toBeNull();
  });

  it('imports readdirSync via the top-level ESM `import ... from \'fs\'`', () => {
    const source = readFileSync(SOURCE_FILE, 'utf-8');
    expect(source).toMatch(/import\s*\{[^}]*\breaddirSync\b[^}]*\}\s*from\s*'fs';/);
  });
});

describe('PromotionPipeline — sprint-scoped temp lookup (findTempEntityDir)', () => {
  let tmpDir: string;

  function setupTmpDir(): string {
    tmpDir = mkdtempSync(join(tmpdir(), 'promo-esm-'));
    return tmpDir;
  }

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('promote() finds and promotes a sprint-scoped temp agent under .tasks/agents/', () => {
    // Arrange — sprint-scoped temp agent dir (not the persistent temp-{id} pool),
    // which forces promote() through findTempEntityDir's readdirSync lookup.
    const root = setupTmpDir();
    const entityId = 'esm-fix-agent';
    const sprintScopedDir = join(root, '.tasks', 'agents', `task-990-${entityId}`);
    mkdirSync(sprintScopedDir, { recursive: true });
    writeFileSync(
      join(sprintScopedDir, 'agent.json'),
      JSON.stringify({ id: entityId, name: 'ESM Fix Agent', source: 'temp', enabled: true }),
    );
    const pipeline = new PromotionPipeline(root);

    // Act
    const result = pipeline.promote(entityId, 'agent');

    // Assert — promotion succeeded via the sprint-scoped lookup path
    expect(result).toBe(true);
    const permAgent = join(root, '.deckent', 'agents', entityId, 'agent.json');
    expect(existsSync(permAgent)).toBe(true);
  });

  it('promote() returns false when no matching sprint-scoped temp dir exists', () => {
    // Arrange — empty .tasks/agents/, no matching entity
    const root = setupTmpDir();
    mkdirSync(join(root, '.tasks', 'agents'), { recursive: true });
    const pipeline = new PromotionPipeline(root);

    // Act
    const result = pipeline.promote('nonexistent-agent', 'agent');

    // Assert
    expect(result).toBe(false);
  });
});
