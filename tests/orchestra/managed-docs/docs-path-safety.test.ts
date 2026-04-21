import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { addDoc, validateDocPath, loadDocsConfig } from '../../../src/orchestra/managed-docs/docs-config.js';

const TEST_ROOT = path.join(process.cwd(), '.test-path-safety-' + process.pid);
const DECKENT_DIR = path.join(TEST_ROOT, '.deckent');

function cleanup() {
  if (fs.existsSync(TEST_ROOT)) fs.rmSync(TEST_ROOT, { recursive: true, force: true });
}

beforeEach(() => {
  cleanup();
  fs.mkdirSync(DECKENT_DIR, { recursive: true });
});

afterEach(cleanup);

// ─── validateDocPath ─────────────────────────────────────────────────────

describe('validateDocPath', () => {
  it('accepts valid relative paths', () => {
    expect(() => validateDocPath(TEST_ROOT, 'CLAUDE.md')).not.toThrow();
    expect(() => validateDocPath(TEST_ROOT, 'docs/architecture.md')).not.toThrow();
    expect(() => validateDocPath(TEST_ROOT, 'src/readme.md')).not.toThrow();
  });

  it('rejects absolute Unix paths', () => {
    expect(() => validateDocPath(TEST_ROOT, '/etc/passwd')).toThrow('Absolute paths not allowed');
  });

  it('rejects absolute Windows paths', () => {
    expect(() => validateDocPath(TEST_ROOT, 'C:\\Users\\file.md')).toThrow('Absolute paths not allowed');
    expect(() => validateDocPath(TEST_ROOT, 'D:/docs/file.md')).toThrow('Absolute paths not allowed');
  });

  it('rejects path traversal with ..', () => {
    expect(() => validateDocPath(TEST_ROOT, '../../etc/passwd')).toThrow('Path traversal not allowed');
    expect(() => validateDocPath(TEST_ROOT, 'docs/../../../secret.md')).toThrow('Path traversal not allowed');
    expect(() => validateDocPath(TEST_ROOT, '../outside.md')).toThrow('Path traversal not allowed');
  });
});

// ─── addDoc path safety integration ──────────────────────────────────────

describe('addDoc path safety', () => {
  it('rejects path traversal and does not modify config', () => {
    // Pre-seed a config
    addDoc(TEST_ROOT, { path: 'valid.md' });
    const before = loadDocsConfig(TEST_ROOT);
    expect(before!.docs).toHaveLength(1);

    // Attempt traversal
    expect(() => addDoc(TEST_ROOT, { path: '../../etc/passwd' })).toThrow('Path traversal not allowed');

    // Config unchanged
    const after = loadDocsConfig(TEST_ROOT);
    expect(after!.docs).toHaveLength(1);
    expect(after!.docs[0]!.path).toBe('valid.md');
  });

  it('rejects absolute path and does not modify config', () => {
    expect(() => addDoc(TEST_ROOT, { path: '/absolute/x.md' })).toThrow('Absolute paths not allowed');
    // No config created
    const config = loadDocsConfig(TEST_ROOT);
    expect(config).toBeNull();
  });

  it('accepts valid nested paths', () => {
    const id = addDoc(TEST_ROOT, { path: 'docs/architecture.md' });
    expect(id).toBe('docs-architecture-md');
    const config = loadDocsConfig(TEST_ROOT);
    expect(config!.docs).toHaveLength(1);
  });

  it('accepts .deckent/ relative paths', () => {
    const id = addDoc(TEST_ROOT, { path: '.deckent/workspace/IDENTITY.md' });
    expect(id).toBe('deckent-workspace-identity-md');
  });
});
