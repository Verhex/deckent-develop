import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectSubscription, checkModeCompatibility, saveSubscriptionToConfig } from '../../src/core/subscription.js';
import type { SubscriptionProfile } from '../../src/core/types.js';

// ─── Mock node:child_process ──────────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

// ─── Mock node:fs ─────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

// ─── Mock node:fs/promises ────────────────────────────────────────────

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn(),
  readFile: vi.fn(),
}));

// ─── Helpers ──────────────────────────────────────────────────────────

async function getSpawnSync() {
  const mod = await import('node:child_process');
  return mod.spawnSync as ReturnType<typeof vi.fn>;
}

async function getExistsSync() {
  const mod = await import('node:fs');
  return mod.existsSync as ReturnType<typeof vi.fn>;
}

async function getWriteFile() {
  const mod = await import('node:fs/promises');
  return mod.writeFile as ReturnType<typeof vi.fn>;
}

async function getReadFile() {
  const mod = await import('node:fs/promises');
  return mod.readFile as ReturnType<typeof vi.fn>;
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('detectSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns detected: max when opus probe succeeds', async () => {
    const spawnSync = await getSpawnSync();

    // --version check (isClaudeCliAvailable)
    spawnSync.mockReturnValueOnce({ status: 0, error: undefined });
    // opus probe
    spawnSync.mockReturnValueOnce({ status: 0, error: undefined });

    const result = detectSubscription();

    expect(result.detected).toBe('max');
    expect(result.opusAvailable).toBe(true);
    expect(result.method).toBe('opus_probe');
    expect(result.testedAt).toBeTruthy();
  });

  it('returns detected: pro when opus probe fails with non-zero exit', async () => {
    const spawnSync = await getSpawnSync();

    spawnSync.mockReturnValueOnce({ status: 0, error: undefined }); // --version
    spawnSync.mockReturnValueOnce({ status: 1, error: undefined }); // opus probe fails

    const result = detectSubscription();

    expect(result.detected).toBe('pro');
    expect(result.opusAvailable).toBe(false);
    expect(result.method).toBe('opus_probe');
  });

  it('returns detected: unknown when claude CLI is not found', async () => {
    const spawnSync = await getSpawnSync();

    // --version check fails → CLI not available
    spawnSync.mockReturnValueOnce({ status: 1, error: new Error('ENOENT') });

    const result = detectSubscription();

    expect(result.detected).toBe('unknown');
    expect(result.opusAvailable).toBe(false);
    expect(result.method).toBe('cli_missing');
  });

  it('returns detected: unknown when claude CLI throws on --version', async () => {
    const spawnSync = await getSpawnSync();

    spawnSync.mockImplementationOnce(() => {
      throw new Error('ENOENT: spawn claude');
    });

    const result = detectSubscription();

    expect(result.detected).toBe('unknown');
    expect(result.method).toBe('cli_missing');
  });

  it('returns detected: unknown with method: timeout when probe times out', async () => {
    const spawnSync = await getSpawnSync();

    spawnSync.mockReturnValueOnce({ status: 0, error: undefined }); // --version
    // opus probe returns with SIGTERM (timeout)
    spawnSync.mockReturnValueOnce({
      status: null,
      error: new Error('ETIMEDOUT'),
    });

    const result = detectSubscription();

    expect(result.detected).toBe('unknown');
    expect(result.opusAvailable).toBe(false);
    expect(result.method).toBe('timeout');
  });

  it('returns detected: unknown with method: timeout when signal is SIGTERM', async () => {
    const spawnSync = await getSpawnSync();

    spawnSync.mockReturnValueOnce({ status: 0, error: undefined }); // --version
    spawnSync.mockReturnValueOnce({
      status: null,
      signal: 'SIGTERM',
      error: new Error('timeout'),
    });

    const result = detectSubscription();

    expect(result.detected).toBe('unknown');
    expect(result.method).toBe('timeout');
  });

  it('returns detected: unknown with method: error on non-timeout spawn error', async () => {
    const spawnSync = await getSpawnSync();

    spawnSync.mockReturnValueOnce({ status: 0, error: undefined }); // --version
    spawnSync.mockReturnValueOnce({
      status: null,
      error: new Error('EACCES: permission denied'),
    });

    const result = detectSubscription();

    expect(result.detected).toBe('unknown');
    expect(result.method).toBe('error');
  });

  it('includes a valid ISO testedAt timestamp', async () => {
    const spawnSync = await getSpawnSync();

    spawnSync.mockReturnValueOnce({ status: 0, error: undefined });
    spawnSync.mockReturnValueOnce({ status: 0, error: undefined });

    const before = new Date().toISOString();
    const result = detectSubscription();
    const after = new Date().toISOString();

    expect(new Date(result.testedAt).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
    expect(new Date(result.testedAt).getTime()).toBeLessThanOrEqual(new Date(after).getTime());
  });
});

// ─── checkModeCompatibility ───────────────────────────────────────────

describe('checkModeCompatibility', () => {
  const baseProfile: SubscriptionProfile = {
    detected: 'max',
    opusAvailable: true,
    testedAt: new Date().toISOString(),
    method: 'opus_probe',
  };

  it('returns null when subscription is unknown', () => {
    const profile: SubscriptionProfile = { ...baseProfile, detected: 'unknown' };
    expect(checkModeCompatibility(profile, 'max_plan')).toBeNull();
    expect(checkModeCompatibility(profile, 'pro_plan')).toBeNull();
  });

  it('returns null when max subscription uses max_plan (compatible)', () => {
    expect(checkModeCompatibility({ ...baseProfile, detected: 'max' }, 'max_plan')).toBeNull();
  });

  it('returns null when pro subscription uses pro_plan (compatible)', () => {
    expect(checkModeCompatibility({ ...baseProfile, detected: 'pro', opusAvailable: false }, 'pro_plan')).toBeNull();
  });

  it('warns when pro subscription uses max_plan (incompatible)', () => {
    const profile: SubscriptionProfile = { ...baseProfile, detected: 'pro', opusAvailable: false };
    const warning = checkModeCompatibility(profile, 'max_plan');
    expect(warning).not.toBeNull();
    expect(warning).toContain('Warning');
    expect(warning).toContain('max_plan');
    expect(warning).toContain('Pro');
  });

  it('warns when pro subscription uses max5x_plan (incompatible)', () => {
    const profile: SubscriptionProfile = { ...baseProfile, detected: 'pro', opusAvailable: false };
    const warning = checkModeCompatibility(profile, 'max5x_plan');
    expect(warning).not.toBeNull();
    expect(warning).toContain('max5x_plan');
  });

  it('gives an upgrade note when max subscription uses pro_plan', () => {
    const profile: SubscriptionProfile = { ...baseProfile, detected: 'max' };
    const note = checkModeCompatibility(profile, 'pro_plan');
    expect(note).not.toBeNull();
    expect(note).toContain('Note');
    expect(note).toContain('max_plan');
  });

  it('returns null for api mode regardless of subscription', () => {
    expect(checkModeCompatibility({ ...baseProfile, detected: 'max' }, 'api')).toBeNull();
    expect(checkModeCompatibility({ ...baseProfile, detected: 'pro', opusAvailable: false }, 'api')).toBeNull();
  });
});

// ─── saveSubscriptionToConfig ─────────────────────────────────────────

describe('saveSubscriptionToConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const profile: SubscriptionProfile = {
    detected: 'max',
    opusAvailable: true,
    testedAt: '2026-01-01T00:00:00.000Z',
    method: 'opus_probe',
  };

  it('creates config file with subscription when no existing file', async () => {
    const existsSync = await getExistsSync();
    const writeFile = await getWriteFile();

    existsSync.mockReturnValue(false);
    writeFile.mockResolvedValue(undefined);

    await saveSubscriptionToConfig(profile, '/tmp/test-project');

    expect(writeFile).toHaveBeenCalledOnce();
    const [, content] = (writeFile as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    const written = JSON.parse(content as string) as Record<string, unknown>;
    expect(written['subscription']).toEqual(profile);
  });

  it('merges subscription into existing config', async () => {
    const existsSync = await getExistsSync();
    const writeFile = await getWriteFile();
    const readFile = await getReadFile();

    existsSync.mockReturnValue(true);
    readFile.mockResolvedValue(JSON.stringify({ mode: 'pro_plan', version: '1.0.0' }));
    writeFile.mockResolvedValue(undefined);

    await saveSubscriptionToConfig(profile, '/tmp/test-project');

    const [, content] = (writeFile as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    const written = JSON.parse(content as string) as Record<string, unknown>;
    expect(written['mode']).toBe('pro_plan');
    expect(written['version']).toBe('1.0.0');
    expect(written['subscription']).toEqual(profile);
  });

  it('overwrites existing subscription field', async () => {
    const existsSync = await getExistsSync();
    const writeFile = await getWriteFile();
    const readFile = await getReadFile();

    existsSync.mockReturnValue(true);
    const oldProfile: SubscriptionProfile = { ...profile, detected: 'pro', opusAvailable: false };
    readFile.mockResolvedValue(JSON.stringify({ subscription: oldProfile }));
    writeFile.mockResolvedValue(undefined);

    await saveSubscriptionToConfig(profile, '/tmp/test-project');

    const [, content] = (writeFile as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    const written = JSON.parse(content as string) as Record<string, unknown>;
    expect((written['subscription'] as SubscriptionProfile).detected).toBe('max');
  });

  it('handles corrupt existing config gracefully', async () => {
    const existsSync = await getExistsSync();
    const writeFile = await getWriteFile();
    const readFile = await getReadFile();

    existsSync.mockReturnValue(true);
    readFile.mockResolvedValue('NOT_VALID_JSON{{{{');
    writeFile.mockResolvedValue(undefined);

    await expect(saveSubscriptionToConfig(profile, '/tmp/test-project')).resolves.not.toThrow();

    expect(writeFile).toHaveBeenCalledOnce();
  });
});
