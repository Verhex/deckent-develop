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
  fs.mkdirSync(DECKENT_DIR, { recursive: true });
});

afterEach(cleanup);

// ─── seedDocsConfig ──────────────────────────────────────────────────────

describe('seedDocsConfig', () => {
  it('creates docs.json with default template content', () => {
    // The seed template now includes both `claude-md` and `identity-md`
    // (see src/cli/commands/init-templates/docs.json.template). Only the
    // claude-md entry is asserted in detail; the identity-md addition is
    // covered by managed-docs identity tests elsewhere.
    seedDocsConfig(TEST_ROOT);
    const config = loadDocsConfig(TEST_ROOT);
    expect(config).not.toBeNull();
    expect(config!.version).toBe(1);
    expect(config!.docs.length).toBeGreaterThanOrEqual(1);
    const claudeEntry = config!.docs.find(d => d.id === 'claude-md');
    expect(claudeEntry).toBeDefined();
    expect(claudeEntry!.path).toBe('CLAUDE.md');
    expect(claudeEntry!.autoSections).toEqual(['Sprint Metrics']);
  });

  it('does not overwrite existing config', () => {
    // Create custom config first
    const customConfig = {
      version: 1 as const,
      docs: [{ id: 'custom', path: 'CUSTOM.md', autoSections: ['My Section'] }],
    };
    fs.writeFileSync(
      path.join(DECKENT_DIR, 'docs.json'),
      JSON.stringify(customConfig, null, 2),
      'utf-8',
    );

    // Seed should not overwrite
    seedDocsConfig(TEST_ROOT);
    const config = loadDocsConfig(TEST_ROOT);
    expect(config!.docs).toHaveLength(1);
    expect(config!.docs[0]!.id).toBe('custom');
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
