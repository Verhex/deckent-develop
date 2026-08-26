import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});

vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return { ...actual, readJsonSafeAsync: vi.fn(actual.readJsonSafeAsync) };
});

import { readFileSync } from 'node:fs';
import {
  clearConfigCache,
  healCorruptProjectConfig,
  loadConfig,
} from '../../src/core/config.js';
import {
  withConfigWriteLock,
  writeConfigJsonAtomic,
} from '../../src/core/config-write-authority.js';
import { readJsonSafeAsync } from '../../src/core/utils.js';

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedReadJsonSafeAsync = vi.mocked(readJsonSafeAsync);
const unmockedReadFileSync = mockedReadFileSync.getMockImplementation();
if (unmockedReadFileSync === undefined) {
  throw new Error('node:fs readFileSync mock did not retain its real implementation');
}
const holdMessage =
  '[deckent] CONFIG_CONCURRENT_REVISION_HOLD: heal sırasında config başka bir ' +
  'writer tarafından yenilendi — dosyaya dokunulmadı; yeni revizyon geçerli sayılır';

let root: string;
let configPath: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'config-heal-race-'));
  configPath = join(root, '.deckent', 'config.json');
  clearConfigCache();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  clearConfigCache();
  rmSync(root, { recursive: true, force: true });
});

function prepareConfigDirectory(): void {
  mkdirSync(dirname(configPath), { recursive: true });
  writeConfigJsonAtomic(join(root, '.deckent', '.authority-probe.json'), {});
  rmSync(join(root, '.deckent', '.authority-probe.json'));
}

describe('config heal adversarial interleavings and custody', () => {
  it('adopts a valid revision written between parse failure and the locked re-read', () => {
    prepareConfigDirectory();
    const corruptPreimage = '{ broken';
    const concurrentRevision = `${JSON.stringify({ mode: 'performance', revision: 2 })}\n`;
    writeFileSync(configPath, corruptPreimage, 'utf8');
    mockedReadFileSync.mockImplementation((path, options) => {
      if (path === configPath && options === 'utf-8') {
        writeFileSync(configPath, concurrentRevision, 'utf8');
        return concurrentRevision;
      }
      return unmockedReadFileSync(path, options as never);
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = healCorruptProjectConfig(configPath, corruptPreimage);

    expect(result).toMatchObject({
      kind: 'heldConcurrentRevision',
      adoptedConfig: { mode: 'performance', revision: 2 },
    });
    expect(unmockedReadFileSync(configPath, 'utf8')).toBe(concurrentRevision);
    expect(error).toHaveBeenCalledWith(holdMessage);
    expect(readdirSync(dirname(configPath))).toEqual(['config.json']);
  });

  it('keeps canonical JSON valid across a staged crash and unlinks the orphan on the next heal', () => {
    prepareConfigDirectory();
    const corruptPreimage = '{ crashed healer preimage';
    const canonicalRevision = { mode: 'performance', revision: 'writer-won' };
    const stagedPath = `${configPath}.${process.pid}.tmp`;
    writeConfigJsonAtomic(stagedPath, { mode: 'economic', revision: 'staged' });
    writeConfigJsonAtomic(configPath, canonicalRevision);
    const before = JSON.parse(unmockedReadFileSync(configPath, 'utf8')) as unknown;
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = healCorruptProjectConfig(configPath, corruptPreimage);

    expect(before).toEqual(canonicalRevision);
    expect(result.kind).toBe('heldConcurrentRevision');
    expect(JSON.parse(unmockedReadFileSync(configPath, 'utf8'))).toEqual(canonicalRevision);
    expect(readdirSync(dirname(configPath)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    expect(error).toHaveBeenCalledWith(holdMessage);
  });

  it('pins authority outputs to 0600 while a renamed backup preserves its pre-existing mode', () => {
    if (process.platform === 'win32') return;
    prepareConfigDirectory();
    const corruptPreimage = '{ broken';
    writeFileSync(configPath, corruptPreimage, { encoding: 'utf8', mode: 0o640 });
    const directAuthorityPath = join(dirname(configPath), 'authority.json');

    withConfigWriteLock(directAuthorityPath, () => {
      writeConfigJsonAtomic(directAuthorityPath, { written: true });
    });
    const result = healCorruptProjectConfig(configPath, corruptPreimage);

    expect(result.kind).toBe('healed');
    if (result.kind !== 'healed') throw new Error('expected healed result');
    expect(statSync(directAuthorityPath).mode & 0o777).toBe(0o600);
    expect(statSync(configPath).mode & 0o777).toBe(0o600);
    expect(statSync(result.backupPath).mode & 0o777).toBe(0o640);
  });

  it('serializes two heal contenders so exactly one heals and the successor holds', () => {
    prepareConfigDirectory();
    const corruptPreimage = '{ broken';
    writeFileSync(configPath, corruptPreimage, 'utf8');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const first = healCorruptProjectConfig(configPath, corruptPreimage);
    const second = healCorruptProjectConfig(configPath, corruptPreimage);

    expect([first.kind, second.kind]).toEqual(['healed', 'heldConcurrentRevision']);
    expect(
      readdirSync(dirname(configPath)).filter((name) => name.includes('.corrupted.')),
    ).toHaveLength(1);
    expect(JSON.parse(unmockedReadFileSync(configPath, 'utf8'))).toEqual(
      first.kind === 'healed' ? first.config : undefined,
    );
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('holds on an EMFILE read error without changing the config or leaving artifacts', async () => {
    prepareConfigDirectory();
    const original = `${JSON.stringify({ mode: 'performance', custody: 'keep' })}\n`;
    writeFileSync(configPath, original, { encoding: 'utf8', mode: 0o640 });
    mockedReadJsonSafeAsync.mockResolvedValue(null);
    mockedReadFileSync.mockImplementation((path, options) => {
      if (path === configPath && options === 'utf-8') {
        const error = new Error('EMFILE: too many open files') as NodeJS.ErrnoException;
        error.code = 'EMFILE';
        throw error;
      }
      return unmockedReadFileSync(path, options as never);
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.useFakeTimers();

    const loading = loadConfig(root, { force: true });
    await vi.runAllTimersAsync();
    await loading;

    expect(unmockedReadFileSync(configPath, 'utf8')).toBe(original);
    expect(readdirSync(dirname(configPath))).toEqual(['config.json']);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('CONFIG_READ_IO_HOLD'));
    expect(error).toHaveBeenCalledWith(expect.stringContaining('EMFILE'));
  });
});
