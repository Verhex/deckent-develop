import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  loadDocsConfig, saveDocsConfig, addDoc, removeDoc, getDoc, generateDocId,
} from '../../../src/orchestra/managed-docs/docs-config.js';

const TEST_ROOT = path.join(process.cwd(), '.test-docs-config-' + process.pid);
const DECKENT_DIR = path.join(TEST_ROOT, '.deckent');

function cleanup() {
  if (fs.existsSync(TEST_ROOT)) fs.rmSync(TEST_ROOT, { recursive: true, force: true });
}

beforeEach(() => {
  cleanup();
  fs.mkdirSync(path.join(DECKENT_DIR, 'settings'), { recursive: true });
});

afterEach(cleanup);

// ─── generateDocId ────────────────────────────────────────────────────────

describe('generateDocId', () => {
  it('converts file path to lowercase kebab id', () => {
    expect(generateDocId('CLAUDE.md')).toBe('claude-md');
  });

  it('handles nested paths', () => {
    expect(generateDocId('docs/ARCHITECTURE.md')).toBe('docs-architecture-md');
  });

  it('handles special characters', () => {
    expect(generateDocId('docs/my file (1).md')).toBe('docs-my-file-1-md');
  });
});

// ─── loadDocsConfig ───────────────────────────────────────────────────────

describe('loadDocsConfig', () => {
  it('returns null when config does not exist', () => {
    expect(loadDocsConfig(TEST_ROOT)).toBeNull();
  });

  it('loads valid config', () => {
    const config = { version: 1 as const, docs: [{ id: 'test', path: 'test.md' }] };
    fs.writeFileSync(path.join(DECKENT_DIR, 'settings', 'docs.json'), JSON.stringify(config), 'utf-8');
    const loaded = loadDocsConfig(TEST_ROOT);
    expect(loaded).not.toBeNull();
    expect(loaded!.docs).toHaveLength(1);
    expect(loaded!.docs[0]!.id).toBe('test');
  });

  it('returns null for invalid JSON', () => {
    fs.writeFileSync(path.join(DECKENT_DIR, 'settings', 'docs.json'), 'NOT JSON', 'utf-8');
    expect(loadDocsConfig(TEST_ROOT)).toBeNull();
  });

  it('returns null for missing docs array', () => {
    fs.writeFileSync(path.join(DECKENT_DIR, 'settings', 'docs.json'), '{"version":1}', 'utf-8');
    expect(loadDocsConfig(TEST_ROOT)).toBeNull();
  });
});

// ─── saveDocsConfig ───────────────────────────────────────────────────────

describe('saveDocsConfig', () => {
  it('creates config file', () => {
    saveDocsConfig(TEST_ROOT, { version: 1, docs: [] });
    const configPath = path.join(DECKENT_DIR, 'settings', 'docs.json');
    expect(fs.existsSync(configPath)).toBe(true);
  });

  it('writes valid JSON', () => {
    saveDocsConfig(TEST_ROOT, { version: 1, docs: [{ id: 'a', path: 'a.md' }] });
    const raw = fs.readFileSync(path.join(DECKENT_DIR, 'settings', 'docs.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.version).toBe(1);
    expect(parsed.docs).toHaveLength(1);
  });
});

// ─── addDoc ───────────────────────────────────────────────────────────────

describe('addDoc', () => {
  it('creates config and adds doc', () => {
    const id = addDoc(TEST_ROOT, { path: 'README.md', autoSections: ['Metrics'] });
    expect(id).toBe('readme-md');
    const config = loadDocsConfig(TEST_ROOT);
    expect(config!.docs).toHaveLength(1);
    expect(config!.docs[0]!.autoSections).toEqual(['Metrics']);
  });

  it('updates existing entry with same path', () => {
    addDoc(TEST_ROOT, { path: 'README.md', autoSections: ['A'] });
    addDoc(TEST_ROOT, { path: 'README.md', autoSections: ['B'] });
    const config = loadDocsConfig(TEST_ROOT);
    expect(config!.docs).toHaveLength(1);
    expect(config!.docs[0]!.autoSections).toEqual(['B']);
  });

  it('adds multiple docs', () => {
    addDoc(TEST_ROOT, { path: 'README.md' });
    addDoc(TEST_ROOT, { path: 'docs/ARCH.md' });
    const config = loadDocsConfig(TEST_ROOT);
    expect(config!.docs).toHaveLength(2);
  });

  it('accepts custom id', () => {
    const id = addDoc(TEST_ROOT, { id: 'custom', path: 'my-file.md' });
    expect(id).toBe('custom');
  });
});

// ─── removeDoc ────────────────────────────────────────────────────────────

describe('removeDoc', () => {
  it('removes doc by id', () => {
    addDoc(TEST_ROOT, { path: 'test.md' });
    const removed = removeDoc(TEST_ROOT, 'test-md');
    expect(removed).toBe(true);
    expect(loadDocsConfig(TEST_ROOT)!.docs).toHaveLength(0);
  });

  it('removes doc by path', () => {
    addDoc(TEST_ROOT, { path: 'test.md' });
    const removed = removeDoc(TEST_ROOT, 'test.md');
    expect(removed).toBe(true);
  });

  it('returns false for non-existent doc', () => {
    addDoc(TEST_ROOT, { path: 'test.md' });
    expect(removeDoc(TEST_ROOT, 'nope')).toBe(false);
  });

  it('returns false when no config exists', () => {
    expect(removeDoc(TEST_ROOT, 'anything')).toBe(false);
  });
});

// ─── getDoc ───────────────────────────────────────────────────────────────

describe('getDoc', () => {
  it('returns doc by id', () => {
    addDoc(TEST_ROOT, { path: 'test.md', autoSections: ['Metrics'] });
    const doc = getDoc(TEST_ROOT, 'test-md');
    expect(doc).not.toBeNull();
    expect(doc!.path).toBe('test.md');
  });

  it('returns doc by path', () => {
    addDoc(TEST_ROOT, { path: 'test.md' });
    expect(getDoc(TEST_ROOT, 'test.md')).not.toBeNull();
  });

  it('returns null for missing doc', () => {
    expect(getDoc(TEST_ROOT, 'nope')).toBeNull();
  });
});
