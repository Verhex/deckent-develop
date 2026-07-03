/**
 * tests/cli/openrouter-probe.test.ts — Sprint 365 Task 365-004 (OPENROUTER-LIVE-PREP)
 *
 * Hermetic tests for `deckent openrouter-probe [--json]`. All fs I/O runs under
 * a real os.tmpdir() fixture (never the project root); `fetchOpenRouterModels`'s
 * network seam is exercised via an injected `fetchImpl` stub — no real network
 * I/O anywhere in this file (mirrors tests/core/openrouter-models.test.ts's own
 * fixture style and tests/cli/limits-command.test.ts's CLI-layer structure).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FetchFn } from '../../src/core/openrouter-models.js';
import { FREE_MODEL_CACHE_FILE } from '../../src/core/openrouter-models.js';
import {
  runOpenRouterProbeCommand,
  registerOpenRouterProbe,
  type OpenRouterProbeDeps,
} from '../../src/cli/commands/openrouter-probe.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    json: async () => body,
  } as unknown as Response;
}

const FREE_MODELS_FIXTURE = {
  data: [
    {
      id: 'meta-llama/llama-3.1-8b-instruct:free',
      pricing: { prompt: '0', completion: '0' },
      context_length: 131072,
      architecture: { modality: 'text->text' },
    },
    {
      id: 'google/gemma-2-9b-it:free',
      pricing: { prompt: '0', completion: '0' },
      context_length: 8192,
      architecture: { modality: 'text->text' },
    },
    {
      // paid model, no ":free" suffix -> excluded from the count
      id: 'anthropic/claude-3.5-sonnet',
      pricing: { prompt: '0.000003', completion: '0.000015' },
      context_length: 200000,
      architecture: { modality: 'text->text' },
    },
  ],
};

function withKey(): Record<string, string> {
  return { OPENROUTER_API_KEY: 'sk-or-test-fixture-key' };
}

function withoutKey(): Record<string, string> {
  return {};
}

// ─── Fixture root (real tmpdir, hermetic) + shared deps ───────────────────────

let root: string;

function baseDeps(overrides: Partial<OpenRouterProbeDeps> = {}): OpenRouterProbeDeps {
  return {
    resolveProjectRootFn: () => root,
    getLangFn: () => 'en',
    loadSecretsFn: withoutKey,
    ...overrides,
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'deckent-openrouter-probe-test-'));
  process.exitCode = undefined;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ─── Key-absent path — honest-unavailable, exit 0 ─────────────────────────────

describe('runOpenRouterProbeCommand — key absent (honest-unavailable)', () => {
  it('prints an honest unavailable message and leaves process.exitCode at 0/undefined', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runOpenRouterProbeCommand({}, baseDeps());
    const printed = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    writeSpy.mockRestore();

    expect(printed).toContain('OpenRouter probe unavailable');
    expect(printed).toContain('OPENROUTER_API_KEY');
    expect(process.exitCode).not.toBe(1);
  });

  it('never calls fetchImpl when the key is absent (no live network attempt)', async () => {
    const fetchImpl = vi.fn() as unknown as FetchFn;
    await runOpenRouterProbeCommand({}, baseDeps({ fetchImpl }));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never writes the cache file when the key is absent', async () => {
    await runOpenRouterProbeCommand({}, baseDeps());
    expect(existsSync(join(root, FREE_MODEL_CACHE_FILE))).toBe(false);
  });

  it('--json emits {available:false, reason} and stays at exit 0', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runOpenRouterProbeCommand({ json: true }, baseDeps());
    const printed = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    writeSpy.mockRestore();

    const parsed = JSON.parse(printed);
    expect(parsed.available).toBe(false);
    expect(typeof parsed.reason).toBe('string');
    expect(parsed.reason).toContain('OPENROUTER_API_KEY');
    expect(process.exitCode).not.toBe(1);
  });

  it('renders the Turkish unavailable message when getLangFn returns tr', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runOpenRouterProbeCommand({}, baseDeps({ getLangFn: () => 'tr' }));
    const printed = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    writeSpy.mockRestore();

    expect(printed).toContain('kullanılamıyor');
  });
});

// ─── Key-present path — live fetch (fake-fetch injected) + cache write ────────

describe('runOpenRouterProbeCommand — key present (fake-fetch live path)', () => {
  it('calls the injected fetchImpl exactly once against the OpenRouter models URL', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(FREE_MODELS_FIXTURE)) as unknown as FetchFn;
    await runOpenRouterProbeCommand({}, baseDeps({ loadSecretsFn: withKey, fetchImpl }));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith('https://openrouter.ai/api/v1/models');
  });

  it('writes the free-model cache to .deckent/settings/openrouter-models.json (only ":free" entries)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(FREE_MODELS_FIXTURE)) as unknown as FetchFn;
    await runOpenRouterProbeCommand({}, baseDeps({ loadSecretsFn: withKey, fetchImpl }));

    const cachePath = join(root, FREE_MODEL_CACHE_FILE);
    expect(existsSync(cachePath)).toBe(true);
    const onDisk = JSON.parse(readFileSync(cachePath, 'utf-8'));
    expect(onDisk.models).toHaveLength(2);
    expect(onDisk.models.map((m: { id: string }) => m.id)).toEqual([
      'meta-llama/llama-3.1-8b-instruct:free',
      'google/gemma-2-9b-it:free',
    ]);
  });

  it('prints a table summary with the free-model count and cache path', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(FREE_MODELS_FIXTURE)) as unknown as FetchFn;
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runOpenRouterProbeCommand({}, baseDeps({ loadSecretsFn: withKey, fetchImpl }));
    const printed = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    writeSpy.mockRestore();

    expect(printed).toContain('OpenRouter Live Probe');
    expect(printed).toContain('2 free model(s) found');
    expect(printed).toContain(FREE_MODEL_CACHE_FILE);
    expect(printed).toContain('meta-llama/llama-3.1-8b-instruct:free');
  });

  it('--json emits available:true + count + models + cacheFile', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(FREE_MODELS_FIXTURE)) as unknown as FetchFn;
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runOpenRouterProbeCommand({ json: true }, baseDeps({ loadSecretsFn: withKey, fetchImpl }));
    const printed = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    writeSpy.mockRestore();

    const parsed = JSON.parse(printed);
    expect(parsed.available).toBe(true);
    expect(parsed.count).toBe(2);
    expect(parsed.cacheFile).toBe(FREE_MODEL_CACHE_FILE);
    expect(Array.isArray(parsed.models)).toBe(true);
    expect(parsed.models).toHaveLength(2);
    expect(typeof parsed.generatedAt).toBe('string');
  });

  it('resolves the key via the DECKENT_-prefixed convention too', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [] })) as unknown as FetchFn;
    await runOpenRouterProbeCommand(
      {},
      baseDeps({ loadSecretsFn: () => ({ DECKENT_OPENROUTER_API_KEY: 'sk-or-prefixed' }), fetchImpl }),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('leaves process.exitCode at 0/undefined on a successful live probe', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(FREE_MODELS_FIXTURE)) as unknown as FetchFn;
    await runOpenRouterProbeCommand({}, baseDeps({ loadSecretsFn: withKey, fetchImpl }));
    expect(process.exitCode).not.toBe(1);
  });
});

// ─── Key present but live fetch fails — honest failure, exit 1 ────────────────

describe('runOpenRouterProbeCommand — key present, live fetch fails', () => {
  it('sets process.exitCode = 1 and prints an honest fetch-failed message on a network error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as FetchFn;
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runOpenRouterProbeCommand({}, baseDeps({ loadSecretsFn: withKey, fetchImpl }));
    const printed = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    writeSpy.mockRestore();

    expect(printed).toContain('OpenRouter live fetch failed');
    expect(process.exitCode).toBe(1);
  });

  it('never writes the cache file when the live fetch fails', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, { ok: false, status: 503, statusText: 'Service Unavailable' })) as unknown as FetchFn;
    await runOpenRouterProbeCommand({}, baseDeps({ loadSecretsFn: withKey, fetchImpl }));
    expect(existsSync(join(root, FREE_MODEL_CACHE_FILE))).toBe(false);
  });

  it('--json emits {available:true, error} on a fetch failure', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('boom');
    }) as unknown as FetchFn;
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runOpenRouterProbeCommand({ json: true }, baseDeps({ loadSecretsFn: withKey, fetchImpl }));
    const printed = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    writeSpy.mockRestore();

    const parsed = JSON.parse(printed);
    expect(parsed.available).toBe(true);
    expect(typeof parsed.error).toBe('string');
  });
});

// ─── CLI wiring (commander) ────────────────────────────────────────────────

describe('registerOpenRouterProbe (CLI wiring)', () => {
  it('registers a working `openrouter-probe --json` command', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { Command } = await import('commander');
    const program = new Command();
    program.exitOverride();
    registerOpenRouterProbe(program);

    const names = program.commands.map((c) => c.name());
    expect(names).toContain('openrouter-probe');

    writeSpy.mockRestore();
  });

  it('buildProgram() registers openrouter-probe alongside the rest of the CLI surface', async () => {
    const { buildProgram } = await import('../../src/cli/index.js');
    const program = buildProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).toContain('openrouter-probe');
  });
});
