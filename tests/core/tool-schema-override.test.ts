// ─── tool-schema-override.ts tests (TOOL-REG-2 slice, task 359-006) ──────────
// Covers both independent pieces: (a) loadToolOverridesConfig + applyToolOverrides
// — tmpdir round-trip, fail-soft on missing/corrupt/schema-invalid config, enum
// narrowing, default-value validation, unknown-field/non-object fail-soft — and
// (b) ToolDescribeMemo — content-hash memoization + invalidation on source change.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z, ZodObject } from 'zod';
import { loadToolOverridesConfig, applyToolOverrides, ToolDescribeMemo } from '../../src/core/tool-schema-override.js';
import type { ToolOverridesConfig } from '../../src/core/tool-schema-override.js';
import type { ToolDefinition } from '../../src/core/tool-registry.js';

// ─── (a) loadToolOverridesConfig + applyToolOverrides ────────────────────────

function demoDef(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name: 'deckent_demo',
    description: 'original description',
    paramsSchema: z.object({
      mode: z.enum(['fast', 'slow', 'careful']).optional(),
    }),
    risk: 'safe',
    category: 'catalog',
    handlerRef: 'demo:handler',
    ...overrides,
  };
}

describe('loadToolOverridesConfig', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'tool-schema-override-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('a fresh project has no overrides (empty config)', () => {
    expect(loadToolOverridesConfig(projectRoot)).toEqual({ version: 1, tools: {} });
  });

  it('loads a valid tmpdir tool-overrides.json', () => {
    const dir = join(projectRoot, '.deckent', 'settings');
    mkdirSync(dir, { recursive: true });
    const config: ToolOverridesConfig = {
      version: 1,
      tools: {
        deckent_demo: {
          description: 'overridden description',
          fields: { mode: { enum: ['fast', 'slow'], default: 'fast', description: 'narrowed mode' } },
        },
      },
    };
    writeFileSync(join(dir, 'tool-overrides.json'), JSON.stringify(config), 'utf-8');

    expect(loadToolOverridesConfig(projectRoot)).toEqual(config);
  });

  it('a corrupt tool-overrides.json fails soft to empty config', () => {
    const dir = join(projectRoot, '.deckent', 'settings');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'tool-overrides.json'), '{ not valid json', 'utf-8');

    expect(loadToolOverridesConfig(projectRoot)).toEqual({ version: 1, tools: {} });
  });

  it('a schema-invalid (but parseable) tool-overrides.json fails soft to empty config', () => {
    const dir = join(projectRoot, '.deckent', 'settings');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'tool-overrides.json'), JSON.stringify({ version: 1, tools: 'not-an-object' }), 'utf-8');

    expect(loadToolOverridesConfig(projectRoot)).toEqual({ version: 1, tools: {} });
  });

  it('an unknown top-level key fails soft to empty config (strict schema)', () => {
    const dir = join(projectRoot, '.deckent', 'settings');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'tool-overrides.json'),
      JSON.stringify({ version: 1, tools: {}, unexpected: true }),
      'utf-8',
    );

    expect(loadToolOverridesConfig(projectRoot)).toEqual({ version: 1, tools: {} });
  });
});

describe('applyToolOverrides', () => {
  it('is a no-op when the tool has no matching config entry (same reference)', () => {
    const def = demoDef();
    const config: ToolOverridesConfig = { version: 1, tools: {} };
    expect(applyToolOverrides(def, config)).toBe(def);
  });

  it('round-trips a tmpdir-loaded config into a visibly-overridden schema', () => {
    let projectRoot = '';
    try {
      projectRoot = mkdtempSync(join(tmpdir(), 'tool-schema-override-rt-'));
      const dir = join(projectRoot, '.deckent', 'settings');
      mkdirSync(dir, { recursive: true });
      const configOnDisk: ToolOverridesConfig = {
        version: 1,
        tools: {
          deckent_demo: {
            description: 'overridden description',
            fields: { mode: { enum: ['fast', 'slow'], default: 'fast', description: 'narrowed mode' } },
          },
        },
      };
      writeFileSync(join(dir, 'tool-overrides.json'), JSON.stringify(configOnDisk), 'utf-8');

      const def = demoDef();
      const config = loadToolOverridesConfig(projectRoot);
      const updated = applyToolOverrides(def, config);

      // Visible in the top-level description.
      expect(updated.description).toBe('overridden description');
      // Original def is untouched (pure function, no mutation).
      expect(def.description).toBe('original description');
      expect(updated).not.toBe(def);

      // Visible in the field schema: narrowed enum, field description, default.
      const shape = (updated.paramsSchema as ZodObject<Record<string, z.ZodTypeAny>>).shape;
      expect(shape.mode.description).toBe('narrowed mode');
      expect(updated.paramsSchema.safeParse({ mode: 'careful' }).success).toBe(false);
      expect(updated.paramsSchema.safeParse({ mode: 'fast' }).success).toBe(true);
      expect((updated.paramsSchema.parse({}) as { mode?: string }).mode).toBe('fast');

      // Original schema instance is untouched.
      expect(def.paramsSchema.safeParse({ mode: 'careful' }).success).toBe(true);
    } finally {
      if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('skips an enum override whose values are not a subset of the original enum', () => {
    const def = demoDef();
    const config: ToolOverridesConfig = {
      version: 1,
      tools: { deckent_demo: { fields: { mode: { enum: ['nonexistent'] } } } },
    };
    const updated = applyToolOverrides(def, config);
    expect(updated.paramsSchema.safeParse({ mode: 'careful' }).success).toBe(true);
  });

  it('skips a default override whose value does not validate against the field schema', () => {
    const def = demoDef();
    const config: ToolOverridesConfig = {
      version: 1,
      tools: { deckent_demo: { fields: { mode: { default: 'not-a-real-value' } } } },
    };
    const updated = applyToolOverrides(def, config);
    expect((updated.paramsSchema.parse({}) as { mode?: string }).mode).toBeUndefined();
  });

  it('ignores an override for a field name that does not exist on the schema', () => {
    const def = demoDef();
    const config: ToolOverridesConfig = {
      version: 1,
      tools: { deckent_demo: { fields: { doesNotExist: { description: 'x' } } } },
    };
    const updated = applyToolOverrides(def, config);
    expect(updated.paramsSchema.safeParse({ mode: 'fast' }).success).toBe(true);
  });

  it('is a no-op on field overrides when paramsSchema is not a ZodObject (fail-soft)', () => {
    const def = demoDef({ paramsSchema: z.string() });
    const config: ToolOverridesConfig = {
      version: 1,
      tools: { deckent_demo: { description: 'still applies', fields: { anything: { description: 'x' } } } },
    };
    const updated = applyToolOverrides(def, config);
    expect(updated.paramsSchema).toBe(def.paramsSchema);
    expect(updated.description).toBe('still applies');
  });
});

// ─── (b) ToolDescribeMemo — content-hash memoization ─────────────────────────

describe('ToolDescribeMemo', () => {
  it('generates once per id and memoizes while the source content is unchanged', () => {
    const memo = new ToolDescribeMemo<{ n: number }>();
    let calls = 0;
    const generate = () => ({ n: ++calls });

    const first = memo.describe('deckent_demo', 'v1', generate);
    const second = memo.describe('deckent_demo', 'v1', generate);

    expect(calls).toBe(1);
    expect(memo.generations).toBe(1);
    expect(second).toBe(first);
  });

  it('regenerates when the source content changes (fake-source hash invalidation)', () => {
    const memo = new ToolDescribeMemo<{ n: number }>();
    let calls = 0;
    const generate = () => ({ n: ++calls });

    const first = memo.describe('deckent_demo', 'v1', generate);
    const second = memo.describe('deckent_demo', 'v2', generate);

    expect(calls).toBe(2);
    expect(memo.generations).toBe(2);
    expect(second).not.toBe(first);
    expect(second.n).toBe(2);
  });

  it('invalidate(id) forces the next describe() call to regenerate even with the same content', () => {
    const memo = new ToolDescribeMemo<{ n: number }>();
    let calls = 0;
    const generate = () => ({ n: ++calls });

    memo.describe('deckent_demo', 'v1', generate);
    memo.invalidate('deckent_demo');
    memo.describe('deckent_demo', 'v1', generate);

    expect(calls).toBe(2);
  });

  it('memoizes independently per id', () => {
    const memo = new ToolDescribeMemo<{ n: number }>();
    let calls = 0;
    const generate = () => ({ n: ++calls });

    memo.describe('a', 'v1', generate);
    memo.describe('b', 'v1', generate);
    memo.describe('a', 'v1', generate);

    expect(calls).toBe(2);
    expect(memo.size).toBe(2);
  });

  it('clear() drops all entries (next describe() regenerates) without resetting the generations counter', () => {
    const memo = new ToolDescribeMemo<{ n: number }>();
    let calls = 0;
    const generate = () => ({ n: ++calls });

    memo.describe('a', 'v1', generate);
    expect(memo.size).toBe(1);
    memo.clear();
    expect(memo.size).toBe(0);
    expect(memo.generations).toBe(1);

    memo.describe('a', 'v1', generate);
    expect(calls).toBe(2);
    expect(memo.generations).toBe(2);
  });

  it('accepts an injectable hash function (deterministic, no real crypto needed in the test)', () => {
    const memo = new ToolDescribeMemo<{ n: number }>({ hash: (content) => `h:${content}` });
    let calls = 0;
    const generate = () => ({ n: ++calls });

    memo.describe('a', 'same', generate);
    memo.describe('a', 'same', generate);
    expect(calls).toBe(1);

    memo.describe('a', 'different', generate);
    expect(calls).toBe(2);
  });
});
