import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { seedDocsConfig, loadDocsConfig, addDoc, validateDocPath } from '../../../src/orchestra/managed-docs/docs-config.js';

const TEST_ROOT = path.join(process.cwd(), '.test-docs-interactive-' + process.pid);
const DECKENT_DIR = path.join(TEST_ROOT, '.deckent');

function cleanup() {
  if (fs.existsSync(TEST_ROOT)) fs.rmSync(TEST_ROOT, { recursive: true, force: true });
}

beforeEach(() => {
  cleanup();
  fs.mkdirSync(path.join(DECKENT_DIR, 'settings'), { recursive: true });
});

afterEach(cleanup);

// ─── seedDocsConfig ──────────────────────────────────────────────────────

describe('seedDocsConfig', () => {
  it('creates docs.json with default template content (pure-adapter: no host files)', () => {
    // Under the pure-adapter law (ADR-G-004 / DOCS-PURE-ADAPTER) the seed
    // template seeds only the deckent-owned IDENTITY.md surface — host
    // instruction files (CLAUDE.md/AGENTS.md/…) are NOT managed-docs and must
    // not be seeded into new projects (that was the locale-leak root cause).
    seedDocsConfig(TEST_ROOT);
    const config = loadDocsConfig(TEST_ROOT);
    expect(config).not.toBeNull();
    expect(config!.version).toBe(1);
    expect(config!.docs.length).toBeGreaterThanOrEqual(1);
    // No host adapter file is ever seeded.
    expect(config!.docs.find(d => d.id === 'claude-md')).toBeUndefined();
    expect(config!.docs.find(d => d.path === 'CLAUDE.md')).toBeUndefined();
    expect(config!.docs.find(d => d.path === 'AGENTS.md')).toBeUndefined();
    // The deckent-owned IDENTITY.md surface remains a legitimate managed-doc.
    const identityEntry = config!.docs.find(d => d.id === 'identity-md');
    expect(identityEntry).toBeDefined();
    expect(identityEntry!.path).toBe('.deckent/workspace/IDENTITY.md');
  });

  it('does not overwrite existing config', () => {
    // Create custom config first
    const customConfig = {
      version: 1 as const,
      docs: [{ id: 'custom', path: 'CUSTOM.md', autoSections: ['My Section'] }],
    };
    fs.writeFileSync(
      path.join(DECKENT_DIR, 'settings', 'docs.json'),
      JSON.stringify(customConfig, null, 2),
      'utf-8',
    );

    // 83a1eebd2 (workspace-artifact authority): seed MERGES the
    // workspace-managed entries into an existing config — custom entries are
    // preserved, never clobbered, and the managed set is guaranteed present.
    seedDocsConfig(TEST_ROOT);
    const config = loadDocsConfig(TEST_ROOT);
    const custom = config!.docs.find((d) => d.id === 'custom');
    expect(custom).toBeDefined();
    expect(custom!.autoSections).toEqual(['My Section']);
    expect(config!.docs.length).toBeGreaterThan(1);
    expect(config!.docs.some((d) => d.id === 'identity-md')).toBe(true);
  });

  it('is idempotent — calling twice produces same result', () => {
    seedDocsConfig(TEST_ROOT);
    const first = loadDocsConfig(TEST_ROOT);
    seedDocsConfig(TEST_ROOT);
    const second = loadDocsConfig(TEST_ROOT);
    expect(first).toEqual(second);
  });
});

// ─── Non-interactive addDoc (CLI --no-prompt path) ───────────────────────

describe('non-interactive addDoc', () => {
  it('adds doc with all parameters specified', () => {
    const id = addDoc(TEST_ROOT, {
      path: 'docs/API.md',
      autoSections: ['Endpoints', 'Auth'],
      protectedSections: ['Overview'],
    });
    expect(id).toBe('docs-api-md');
    const config = loadDocsConfig(TEST_ROOT);
    expect(config!.docs[0]!.autoSections).toEqual(['Endpoints', 'Auth']);
    expect(config!.docs[0]!.protectedSections).toEqual(['Overview']);
  });

  it('adds doc with minimal parameters (path only)', () => {
    const id = addDoc(TEST_ROOT, { path: 'README.md' });
    expect(id).toBe('readme-md');
    const doc = loadDocsConfig(TEST_ROOT)!.docs[0]!;
    expect(doc.path).toBe('README.md');
  });
});

// ─── Path validation edge cases for interactive scenarios ────────────────

describe('interactive path validation edge cases', () => {
  it('validates empty-ish paths', () => {
    // Empty string resolves to project root — valid but weird
    expect(() => validateDocPath(TEST_ROOT, '')).not.toThrow();
  });

  it('validates deeply nested valid paths', () => {
    expect(() => validateDocPath(TEST_ROOT, 'a/b/c/d/e/f/g.md')).not.toThrow();
  });

  it('rejects sneaky traversal attempts', () => {
    expect(() => validateDocPath(TEST_ROOT, 'docs/../../secret.md')).toThrow('Path traversal not allowed');
  });
});
