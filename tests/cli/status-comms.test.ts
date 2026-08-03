import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  watch: vi.fn().mockReturnValue({ close: vi.fn() }),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 2, mtimeMs: 0 })),
  mkdirSync: vi.fn(),
}));

vi.mock('../../src/cli/helpers/messages.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/cli/helpers/messages.js')>();
  return {
    ...actual,
    // Use real getMessage so i18n works correctly
    getMessage: actual.getMessage,
  };
});

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildWorkerCommsSection } from '../../src/cli/commands/status.js';

const existsSyncMock = vi.mocked(existsSync);
const readFileSyncMock = vi.mocked(readFileSync);
const readdirSyncMock = vi.mocked(readdirSync);

const ROOT = '/mock/root';

/** Helper: set up config with worker_comms.enabled */
function mockConfig(enabled: boolean): void {
  const cfgPath = join(ROOT, '.deckent', 'config.json');
  existsSyncMock.mockImplementation((p) => {
    if (p === cfgPath) return true;
    return false;
  });
  readFileSyncMock.mockImplementation((p) => {
    if (p === cfgPath) return JSON.stringify({ worker_comms: { enabled } });
    return '';
  });
  readdirSyncMock.mockReturnValue([]);
}

describe('buildWorkerCommsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when worker_comms.enabled is false', () => {
    mockConfig(false);
    const result = buildWorkerCommsSection(ROOT, 'en');
    expect(result).toBeNull();
  });

  it('returns null when config file does not exist', () => {
    existsSyncMock.mockReturnValue(false);
    const result = buildWorkerCommsSection(ROOT, 'en');
    expect(result).toBeNull();
  });

  it('shows no-shared message when shared dir is empty', () => {
    const cfgPath = join(ROOT, '.deckent', 'config.json');
    const sharedDir = join(ROOT, '.tasks', 'shared');
    const handoffsDir = join(ROOT, '.tasks', 'handoffs');

    existsSyncMock.mockImplementation((p) => {
      if (p === cfgPath) return true;
      if (p === sharedDir) return true;
      if (p === handoffsDir) return false;
      return false;
    });
    readFileSyncMock.mockImplementation((p) => {
      if (p === cfgPath) return JSON.stringify({ worker_comms: { enabled: true } });
      return '';
    });
    readdirSyncMock.mockImplementation((p) => {
      if (p === sharedDir) return [];
      return [];
    });

    const result = buildWorkerCommsSection(ROOT, 'en');
    expect(result).not.toBeNull();
    expect(result).toContain('No shared context.');
  });

  it('shows shared entries when worker_comms.enabled and entries exist', () => {
    const cfgPath = join(ROOT, '.deckent', 'config.json');
    const sharedDir = join(ROOT, '.tasks', 'shared');
    const handoffsDir = join(ROOT, '.tasks', 'handoffs');

    existsSyncMock.mockImplementation((p) => {
      if (p === cfgPath) return true;
      if (p === sharedDir) return true;
      if (p === handoffsDir) return false;
      return false;
    });
    readFileSyncMock.mockImplementation((p) => {
      if (p === cfgPath) return JSON.stringify({ worker_comms: { enabled: true } });
      if (p === join(sharedDir, 'api-schema.json')) {
        return JSON.stringify({ value: 'schema content', writerId: '278-003', writtenAt: new Date().toISOString() });
      }
      if (p === join(sharedDir, 'test-results.json')) {
        return JSON.stringify({ value: 'passed', writerId: '278-004', writtenAt: new Date().toISOString() });
      }
      return '';
    });
    readdirSyncMock.mockImplementation((p) => {
      if (p === sharedDir) return ['api-schema.json', 'test-results.json'];
      return [];
    });

    const result = buildWorkerCommsSection(ROOT, 'en');
    expect(result).not.toBeNull();
    expect(result).toContain('Shared context: 2 key(s)');
    expect(result).toContain('api-schema (by 278-003)');
    expect(result).toContain('test-results (by 278-004)');
  });

  it('shows handoff counts when handoffs exist', () => {
    const cfgPath = join(ROOT, '.deckent', 'config.json');
    const sharedDir = join(ROOT, '.tasks', 'shared');
    const handoffsDir = join(ROOT, '.tasks', 'handoffs');

    existsSyncMock.mockImplementation((p) => {
      if (p === cfgPath) return true;
      if (p === sharedDir) return false;
      if (p === handoffsDir) return true;
      return false;
    });
    readFileSyncMock.mockImplementation((p) => {
      if (p === cfgPath) return JSON.stringify({ worker_comms: { enabled: true } });
      if (p === join(handoffsDir, 'task1-to-task2.json')) {
        return JSON.stringify({ id: 'task1-to-task2', fromTaskId: 'task1', toTaskId: 'task2', status: 'pending', artifacts: ['src/a.ts'], createdAt: new Date().toISOString() });
      }
      if (p === join(handoffsDir, 'task1-to-task3.json')) {
        return JSON.stringify({ id: 'task1-to-task3', fromTaskId: 'task1', toTaskId: 'task3', status: 'ready', artifacts: ['src/b.ts'], createdAt: new Date().toISOString() });
      }
      return '';
    });
    readdirSyncMock.mockImplementation((p) => {
      if (p === handoffsDir) return ['task1-to-task2.json', 'task1-to-task3.json'];
      return [];
    });

    const result = buildWorkerCommsSection(ROOT, 'en');
    expect(result).not.toBeNull();
    expect(result).toContain('Handoffs: 1 pending / 1 executed');
  });

  it('uses Turkish strings when lang=tr', () => {
    const cfgPath = join(ROOT, '.deckent', 'config.json');
    const sharedDir = join(ROOT, '.tasks', 'shared');

    existsSyncMock.mockImplementation((p) => {
      if (p === cfgPath) return true;
      if (p === sharedDir) return true;
      return false;
    });
    readFileSyncMock.mockImplementation((p) => {
      if (p === cfgPath) return JSON.stringify({ worker_comms: { enabled: true } });
      return '';
    });
    readdirSyncMock.mockImplementation((p) => {
      if (p === sharedDir) return [];
      return [];
    });

    const result = buildWorkerCommsSection(ROOT, 'tr');
    expect(result).not.toBeNull();
    expect(result).toContain('Worker İletişim');
    expect(result).toContain('Paylaşılan bağlam yok.');
  });

  it('section header is always present when enabled', () => {
    const cfgPath = join(ROOT, '.deckent', 'config.json');
    existsSyncMock.mockImplementation((p) => p === cfgPath);
    readFileSyncMock.mockImplementation((p) => {
      if (p === cfgPath) return JSON.stringify({ worker_comms: { enabled: true } });
      return '';
    });
    readdirSyncMock.mockReturnValue([]);

    const result = buildWorkerCommsSection(ROOT, 'en');
    expect(result).not.toBeNull();
    expect(result).toContain('--- Worker Comms ---');
  });

  it('skips expired entries based on TTL', () => {
    const cfgPath = join(ROOT, '.deckent', 'config.json');
    const sharedDir = join(ROOT, '.tasks', 'shared');

    existsSyncMock.mockImplementation((p) => {
      if (p === cfgPath) return true;
      if (p === sharedDir) return true;
      return false;
    });
    readFileSyncMock.mockImplementation((p) => {
      if (p === cfgPath) return JSON.stringify({ worker_comms: { enabled: true } });
      if (p === join(sharedDir, 'old-key.json')) {
        // Written 2 hours ago, TTL 1 hour — expired
        const writtenAt = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
        return JSON.stringify({ value: 'v', writerId: 'w1', writtenAt, ttlMs: 3600000 });
      }
      return '';
    });
    readdirSyncMock.mockImplementation((p) => {
      if (p === sharedDir) return ['old-key.json'];
      return [];
    });

    const result = buildWorkerCommsSection(ROOT, 'en');
    expect(result).not.toBeNull();
    // Expired entry is skipped — should show "no shared context"
    expect(result).toContain('No shared context.');
  });
});
