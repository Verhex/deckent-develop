import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadConfig,
  clearConfigCache,
} from '../../src/core/config.js';

// Track statSync call count to distinguish cache hit vs miss
let statSyncCallCount = 0;
let projectMtimeMs = 1000;
let globalMtimeMs = 1000;

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  statSync: vi.fn().mockImplementation((filePath: string) => {
    statSyncCallCount++;
    return {
      mtimeMs: filePath.startsWith('/tmp/test-project/') ? projectMtimeMs : globalMtimeMs,
      size: 1,
      ino: 1,
    };
  }),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFile = vi.mocked(readFile);

beforeEach(() => {
  vi.clearAllMocks();
  clearConfigCache();
  statSyncCallCount = 0;
  projectMtimeMs = 1000;
  globalMtimeMs = 1000;
  mockedExistsSync.mockReturnValue(false);
  delete process.env['DECKENT_CONFIG_RELOAD'];
  delete process.env['ANTHROPIC_API_KEY'];
});

afterEach(() => {
  delete process.env['DECKENT_CONFIG_RELOAD'];
  delete process.env['ANTHROPIC_API_KEY'];
});

describe('loadConfig() module-level cache', () => {
  const projectRoot = '/tmp/test-project';

  it('first call performs full disk I/O (cold load)', async () => {
    const config1 = await loadConfig(projectRoot);
    expect(config1).toBeDefined();
    expect(config1.projectRoot).toBe(projectRoot);
    // statSync called at least once during the first load (for cache stamp)
    expect(statSyncCallCount).toBeGreaterThanOrEqual(1);
  });

  it('second call returns cached result without re-reading config files', async () => {
    const config1 = await loadConfig(projectRoot);
    const countAfterFirst = statSyncCallCount;

    const config2 = await loadConfig(projectRoot);

    // On cache hit, statSync is called once (mtime check), but readFile is NOT called again
    // The key assertion: both calls return the same object reference (cache hit)
    expect(config2).toBe(config1);
    // Both global and project authored layers participate in the cache identity.
    expect(statSyncCallCount).toBe(countAfterFirst + 2);
  });

  it('cache is invalidated when project config mtime changes', async () => {
    const config1 = await loadConfig(projectRoot);

    // Simulate file modification by changing the mtime
    projectMtimeMs = 2000;

    const config2 = await loadConfig(projectRoot);

    // Different mtime → cache miss → new object
    expect(config2).not.toBe(config1);
    // But values should be equivalent (same defaults)
    expect(config2.mode).toBe(config1.mode);
  });

  it('cache is invalidated when effective global config mtime changes', async () => {
    const config1 = await loadConfig(projectRoot);
    globalMtimeMs = 2000;

    const config2 = await loadConfig(projectRoot);

    expect(config2).not.toBe(config1);
    expect(config2.provider_limit_authority.authorityRef)
      .toBe(config1.provider_limit_authority.authorityRef);
  });

  it('force: true bypasses cache even when mtime is unchanged', async () => {
    const config1 = await loadConfig(projectRoot);
    const config2 = await loadConfig(projectRoot, { force: true });

    // force: true → cache miss → new object
    expect(config2).not.toBe(config1);
    expect(config2.mode).toBe(config1.mode);
  });

  it('DECKENT_CONFIG_RELOAD=1 env var bypasses cache', async () => {
    const config1 = await loadConfig(projectRoot);

    process.env['DECKENT_CONFIG_RELOAD'] = '1';
    const config2 = await loadConfig(projectRoot);

    // env var → cache miss → new object
    expect(config2).not.toBe(config1);
    expect(config2.mode).toBe(config1.mode);
  });

  it('different projectRoot invalidates cache', async () => {
    const config1 = await loadConfig(projectRoot);
    const config2 = await loadConfig('/tmp/other-project');

    // Different root → cache miss → new object
    expect(config2).not.toBe(config1);
    expect(config2.projectRoot).toBe('/tmp/other-project');
  });

  it('clearConfigCache() resets cache state', async () => {
    const config1 = await loadConfig(projectRoot);
    clearConfigCache();
    const config2 = await loadConfig(projectRoot);

    // After clear → cache miss → new object
    expect(config2).not.toBe(config1);
    expect(config2.mode).toBe(config1.mode);
  });
});
