import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync as actualReadFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});

import { readFileSync } from 'node:fs';
import {
  healCorruptProjectConfig,
} from '../../src/core/config.js';

const mockedReadFileSync = vi.mocked(readFileSync);
const holdMessage =
  '[deckent] CONFIG_CONCURRENT_REVISION_HOLD: heal sırasında config başka bir ' +
  'writer tarafından yenilendi — dosyaya dokunulmadı; yeni revizyon geçerli sayılır';

let root: string;
let configPath: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'config-heal-preimage-'));
  configPath = join(root, 'config.json');
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

function replaceOnCanonicalRead(revision: string): void {
  mockedReadFileSync.mockImplementation((path, options) => {
    if (path === configPath && options === 'utf-8') {
      writeFileSync(configPath, revision, 'utf-8');
      return revision;
    }
    return actualReadFileSync(path, options as never);
  });
}

describe('healCorruptProjectConfig', () => {
  it('backs up the exact preimage and publishes fresh 0600 defaults', () => {
    const preimage = '{ broken';
    writeFileSync(configPath, preimage, 'utf-8');

    const result = healCorruptProjectConfig(configPath, preimage);

    expect(result.kind).toBe('healed');
    if (result.kind !== 'healed') throw new Error('expected healed result');
    expect(actualReadFileSync(result.backupPath, 'utf-8')).toBe(preimage);
    expect(JSON.parse(actualReadFileSync(configPath, 'utf-8'))).toEqual(result.config);
    expect(result.preimageIdentity.sha256).toBe(
      createHash('sha256').update(preimage).digest('hex'),
    );
    expect(result.preimageIdentity).toMatchObject({
      size: Buffer.byteLength(preimage),
    });
    if (process.platform !== 'win32') {
      expect(statSync(configPath).mode & 0o777).toBe(0o600);
    }
    expect(readdirSync(root).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('holds a valid concurrent revision unchanged and returns it for adoption', () => {
    const preimage = '{ broken';
    const revision = `${JSON.stringify({ mode: 'performance', marker: 'new' })}\n`;
    writeFileSync(configPath, preimage, 'utf-8');
    replaceOnCanonicalRead(revision);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = healCorruptProjectConfig(configPath, preimage);

    expect(result).toMatchObject({
      kind: 'heldConcurrentRevision',
      adoptedConfig: { mode: 'performance', marker: 'new' },
    });
    expect(actualReadFileSync(configPath, 'utf-8')).toBe(revision);
    expect(readdirSync(root)).toEqual(['config.json']);
    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(holdMessage);
  });

  it('holds a corrupt concurrent revision without touching the canonical file', () => {
    const preimage = '{ broken';
    const revision = '{ differently broken';
    writeFileSync(configPath, preimage, 'utf-8');
    replaceOnCanonicalRead(revision);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = healCorruptProjectConfig(configPath, preimage);

    expect(result.kind).toBe('heldConcurrentRevision');
    if (result.kind !== 'heldConcurrentRevision') {
      throw new Error('expected heldConcurrentRevision result');
    }
    expect(result.adoptedConfig).toBeUndefined();
    expect(actualReadFileSync(configPath, 'utf-8')).toBe(revision);
    expect(readdirSync(root)).toEqual(['config.json']);
    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(holdMessage);
  });
});
