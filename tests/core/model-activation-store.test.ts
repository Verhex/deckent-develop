// MODEL-ACTIVATION-001 — the owner's allow-decision over the auto-detected pool.
//
// Measured 2026-08-09: `model-auto-detect` registers every model a provider
// offers, with no notion of activation, so old generations (`gpt-5-mini`,
// `gpt-4.1`, `o3`, …) sat beside the current ones and the AI planner picked one.
// These pins hold the two properties that make the store safe to ship: an
// unrecorded model stays ACTIVE (no silent narrowing), and a deactivated model
// actually leaves the executable registry (not just the discovery list).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ModelActivationStore,
  ModelActivationStoreError,
  activationKey,
  readInactiveModels,
} from '../../src/core/model-activation-store.js';
import { detectAndRegisterModels } from '../../src/core/model-auto-detect.js';
import { ModelRegistry } from '../../src/core/model-registry.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'model-activation-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function open(): ModelActivationStore {
  return new ModelActivationStore(root, { now: () => '2026-08-09T00:00:00.000Z' });
}

describe('ModelActivationStore — default-preserving activation', () => {
  it('an UNRECORDED model is active, so installing the store narrows nothing', () => {
    const store = open();
    try {
      expect(store.isActive('codex', 'gpt-5.6-terra')).toBe(true);
      expect(store.isActive('claude', 'anything-at-all')).toBe(true);
      expect(store.list()).toEqual([]);
    } finally {
      store.close();
    }
  });

  it('records a deactivation and reports it', () => {
    const store = open();
    try {
      store.setActivation('codex', 'gpt-5-mini', false, 'owner');
      expect(store.isActive('codex', 'gpt-5-mini')).toBe(false);
      expect(store.list()).toEqual([{
        provider: 'codex',
        modelId: 'gpt-5-mini',
        active: false,
        updatedAt: '2026-08-09T00:00:00.000Z',
        actor: 'owner',
      }]);
    } finally {
      store.close();
    }
  });

  it('re-activating overwrites the decision rather than duplicating it', () => {
    const store = open();
    try {
      store.setActivation('codex', 'gpt-5-mini', false);
      store.setActivation('codex', 'gpt-5-mini', true);
      expect(store.list()).toHaveLength(1);
      expect(store.isActive('codex', 'gpt-5-mini')).toBe(true);
    } finally {
      store.close();
    }
  });

  it('clearing a decision restores the default (active)', () => {
    const store = open();
    try {
      store.setActivation('codex', 'o3', false);
      expect(store.clearActivation('codex', 'o3')).toBe(true);
      expect(store.isActive('codex', 'o3')).toBe(true);
      expect(store.clearActivation('codex', 'o3')).toBe(false);
    } finally {
      store.close();
    }
  });

  it('decisions are per-provider — the same model id under another provider is untouched', () => {
    const store = open();
    try {
      store.setActivation('codex', 'shared-id', false);
      expect(store.isActive('codex', 'shared-id')).toBe(false);
      expect(store.isActive('gemini', 'shared-id')).toBe(true);
    } finally {
      store.close();
    }
  });

  it('refuses empty provider/model input instead of writing a junk row', () => {
    const store = open();
    try {
      expect(() => store.setActivation('', 'm', false)).toThrowError(ModelActivationStoreError);
      expect(() => store.setActivation('codex', '   ', false)).toThrowError(/modelId/u);
      expect(store.list()).toEqual([]);
    } finally {
      store.close();
    }
  });

  it('persists across connections (the decision is durable, not in-memory)', () => {
    const first = open();
    try {
      first.setActivation('codex', 'gpt-4.1', false);
    } finally {
      first.close();
    }
    expect(existsSync(join(root, '.deckent', 'models.db'))).toBe(true);
    const second = open();
    try {
      expect(second.isActive('codex', 'gpt-4.1')).toBe(false);
    } finally {
      second.close();
    }
  });
});

describe('readInactiveModels — the registration path lookup', () => {
  it('is empty and NEVER throws when no store exists (fail-safe discovery)', () => {
    const missing = mkdtempSync(join(tmpdir(), 'model-activation-none-'));
    try {
      expect(readInactiveModels(missing).size).toBe(0);
    } finally {
      rmSync(missing, { recursive: true, force: true });
    }
  });

  it('returns exactly the deactivated pairs, keyed by provider+model', () => {
    const store = open();
    try {
      store.setActivation('codex', 'gpt-5-mini', false);
      store.setActivation('codex', 'gpt-5.6-terra', true);
      store.setActivation('claude', 'claude-opus-4-8', false);
    } finally {
      store.close();
    }

    const inactive = readInactiveModels(root);
    expect(inactive.has(activationKey('codex', 'gpt-5-mini'))).toBe(true);
    expect(inactive.has(activationKey('claude', 'claude-opus-4-8'))).toBe(true);
    expect(inactive.has(activationKey('codex', 'gpt-5.6-terra'))).toBe(false);
    expect(inactive.size).toBe(2);
  });
});

// ═══ Enforcement: a deactivated model leaves the executable registry ═════════
// Filtering the discovery LIST alone is not enough — cloud models are already in
// the registry from the bundled catalog, so a planner could still name one.
describe('detectAndRegisterModels — activation enforcement', () => {
  it('unregisters a deactivated model so nothing downstream can select it', async () => {
    const registry = new ModelRegistry();
    const before = registry.getAllModels().filter((m) => m.provider === 'claude');
    expect(before.length).toBeGreaterThan(0);
    const victim = before[0]!.id;

    const [result] = await detectAndRegisterModels(registry, {
      providers: ['claude'],
      offline: true,
      cacheDir: root,
      inactiveModels: new Set([activationKey('claude', victim)]),
    });

    expect(registry.has(victim)).toBe(false);
    expect(result?.discovered).not.toContain(victim);
  });

  it('leaves every model registered when nothing is deactivated (default path)', async () => {
    const registry = new ModelRegistry();
    const claudeIds = registry.getAllModels()
      .filter((m) => m.provider === 'claude').map((m) => m.id);

    await detectAndRegisterModels(registry, {
      providers: ['claude'],
      offline: true,
      cacheDir: root,
      inactiveModels: new Set(),
    });

    for (const id of claudeIds) expect(registry.has(id)).toBe(true);
  });

  it('omitting projectRoot AND inactiveModels keeps the pre-store behaviour', async () => {
    const registry = new ModelRegistry();
    const claudeIds = registry.getAllModels()
      .filter((m) => m.provider === 'claude').map((m) => m.id);

    await detectAndRegisterModels(registry, {
      providers: ['claude'],
      offline: true,
      cacheDir: root,
    });

    for (const id of claudeIds) expect(registry.has(id)).toBe(true);
  });
});
