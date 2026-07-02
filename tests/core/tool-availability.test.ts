// ─── tool-availability.ts tests (TOOL-REG slice, task 357-003) ───────────────
// Covers both independent pieces: (a) ToolAvailabilityCache TTL memoization
// with an injected fake clock, and (b) the persisted toolset enable/disable
// set — atomic write, restart-survive (tmpdir round-trip), fail-soft on a
// corrupt file.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ToolAvailabilityCache,
  loadToolsetsConfig,
  setToolEnabled,
  isToolDisabled,
  getToolsetStatus,
} from '../../src/core/tool-availability.js';

// ─── (a) ToolAvailabilityCache — TTL memoization ─────────────────────────────

describe('ToolAvailabilityCache', () => {
  it('probes once and memoizes within the TTL window', async () => {
    let ts = 1000;
    let calls = 0;
    const cache = new ToolAvailabilityCache({ now: () => ts });
    const probe = () => {
      calls++;
      return true;
    };

    expect(await cache.checkAvailability('mcp-x', probe, { ttlMs: 5000 })).toBe(true);
    expect(await cache.checkAvailability('mcp-x', probe, { ttlMs: 5000 })).toBe(true);
    ts += 4999;
    expect(await cache.checkAvailability('mcp-x', probe, { ttlMs: 5000 })).toBe(true);
    expect(calls).toBe(1);
  });

  it('re-probes after the TTL expires (fake clock)', async () => {
    let ts = 1000;
    let calls = 0;
    const cache = new ToolAvailabilityCache({ now: () => ts });
    const probe = () => {
      calls++;
      return calls === 1;
    };

    expect(await cache.checkAvailability('mcp-x', probe, { ttlMs: 5000 })).toBe(true);
    ts += 5000; // at exact expiry boundary: expired (nowMs < expiresAt is false)
    expect(await cache.checkAvailability('mcp-x', probe, { ttlMs: 5000 })).toBe(false);
    expect(calls).toBe(2);
  });

  it('supports async probes', async () => {
    const cache = new ToolAvailabilityCache({ now: () => 1000 });
    const probe = async () => {
      await Promise.resolve();
      return true;
    };
    expect(await cache.checkAvailability('mcp-async', probe)).toBe(true);
  });

  it('applies defaultTtlMs when checkAvailability omits ttlMs', async () => {
    let ts = 1000;
    let calls = 0;
    const cache = new ToolAvailabilityCache({ now: () => ts, defaultTtlMs: 1000 });
    const probe = () => {
      calls++;
      return true;
    };
    await cache.checkAvailability('mcp-y', probe);
    ts += 999;
    await cache.checkAvailability('mcp-y', probe);
    expect(calls).toBe(1);
    ts += 1;
    await cache.checkAvailability('mcp-y', probe);
    expect(calls).toBe(2);
  });

  it('caches independently per id', async () => {
    let calls = 0;
    const cache = new ToolAvailabilityCache({ now: () => 1000 });
    const probe = () => {
      calls++;
      return true;
    };
    await cache.checkAvailability('a', probe, { ttlMs: 5000 });
    await cache.checkAvailability('b', probe, { ttlMs: 5000 });
    expect(calls).toBe(2);
    expect(cache.size).toBe(2);
  });

  it('invalidate() forces the next call to re-probe', async () => {
    let calls = 0;
    const cache = new ToolAvailabilityCache({ now: () => 1000 });
    const probe = () => {
      calls++;
      return true;
    };
    await cache.checkAvailability('a', probe, { ttlMs: 5000 });
    cache.invalidate('a');
    await cache.checkAvailability('a', probe, { ttlMs: 5000 });
    expect(calls).toBe(2);
  });

  it('clear() drops all entries', async () => {
    const cache = new ToolAvailabilityCache({ now: () => 1000 });
    await cache.checkAvailability('a', () => true, { ttlMs: 5000 });
    await cache.checkAvailability('b', () => true, { ttlMs: 5000 });
    expect(cache.size).toBe(2);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

// ─── (b) Toolset enable/disable persistence ──────────────────────────────────

describe('toolset enable/disable persistence', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'tool-availability-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('a fresh project has every tool enabled (empty config)', () => {
    expect(isToolDisabled(projectRoot, 'deckent_status')).toBe(false);
    expect(getToolsetStatus(projectRoot, 'deckent_status')).toEqual({
      id: 'deckent_status',
      isDisabled: false,
    });
  });

  it('setToolEnabled(false) disables a tool: isDisabled=true', () => {
    setToolEnabled(projectRoot, 'deckent_kill', false);
    expect(getToolsetStatus(projectRoot, 'deckent_kill').isDisabled).toBe(true);
  });

  it('disable persists across a simulated restart (tmpdir round-trip, no shared instance)', () => {
    setToolEnabled(projectRoot, 'deckent_kill', false);

    // Simulate a fresh process: no in-memory state carried over, only projectRoot.
    const reloaded = loadToolsetsConfig(projectRoot);
    expect(reloaded.disabled).toContain('deckent_kill');
    expect(isToolDisabled(projectRoot, 'deckent_kill')).toBe(true);
  });

  it('re-enabling removes the id from the disabled set (no unbounded growth)', () => {
    setToolEnabled(projectRoot, 'deckent_kill', false);
    setToolEnabled(projectRoot, 'deckent_kill', true);
    const config = loadToolsetsConfig(projectRoot);
    expect(config.disabled).not.toContain('deckent_kill');
    expect(isToolDisabled(projectRoot, 'deckent_kill')).toBe(false);
  });

  it('writes toolsets.json atomically (tmp file never left behind)', () => {
    setToolEnabled(projectRoot, 'deckent_kill', false);
    const dir = join(projectRoot, '.deckent', 'settings');
    const entries = existsSync(dir) ? readdirSync(dir) : [];
    expect(entries).toContain('toolsets.json');
    expect(entries.some((f) => f.endsWith('.tmp'))).toBe(false);
  });

  it('a corrupt toolsets.json fails soft to all-enabled', () => {
    const dir = join(projectRoot, '.deckent', 'settings');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'toolsets.json'), '{ not valid json', 'utf-8');

    const config = loadToolsetsConfig(projectRoot);
    expect(config.disabled).toEqual([]);
    expect(isToolDisabled(projectRoot, 'anything')).toBe(false);
  });

  it('a schema-invalid (but parseable) toolsets.json fails soft to all-enabled', () => {
    const dir = join(projectRoot, '.deckent', 'settings');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'toolsets.json'), JSON.stringify({ disabled: 'not-an-array' }), 'utf-8');

    const config = loadToolsetsConfig(projectRoot);
    expect(config.disabled).toEqual([]);
  });

  it('creates the settings directory when missing', () => {
    const dir = join(projectRoot, '.deckent', 'settings');
    expect(existsSync(dir)).toBe(false);
    setToolEnabled(projectRoot, 'deckent_status', false);
    expect(existsSync(dir)).toBe(true);
    const raw = readFileSync(join(dir, 'toolsets.json'), 'utf-8');
    expect(JSON.parse(raw).disabled).toContain('deckent_status');
  });
});
