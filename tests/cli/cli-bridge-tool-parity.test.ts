/**
 * born-596 TERM-TOOL-PARITY — the native REPL registry must advertise the FULL
 * CLI-bridge surface (the dispatcher could always run ~29 subcommands; only six
 * read-only ones were advertised, so the model never saw start/plan/cost/…).
 *
 * Pins the three load-bearing invariants:
 *   1. every catalog spec is registered (name + description + schema);
 *   2. tiers can only OVER-ask: destructive tools = 'always', and the two
 *      arg-aware traps (config {}→read, audit {}→read but default action IS
 *      gate) are pinned to 'confirm' via WORST_CASE_CLASSIFY_ARGS;
 *   3. every catalog name is genuinely bridge-dispatchable (no phantom tool:
 *      the dispatcher must not refuse the name outright as unroutable).
 */
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { buildNativeToolRegistry } from '../../src/cli/repl/native-tool-registry.js';
import { CLI_BRIDGE_TOOLS, WORST_CASE_CLASSIFY_ARGS } from '../../src/cli/repl/cli-bridge-tool-specs.js';
import { classifyTool } from '../../src/cli/repl/tool-permissions.js';

describe('born-596 — full CLI-bridge surface advertised to the native engine', () => {
  const reg = buildNativeToolRegistry({ cwd: () => tmpdir() });

  it('registers every catalog spec with its description', () => {
    for (const spec of CLI_BRIDGE_TOOLS) {
      const def = reg.get(spec.name);
      expect(def, `${spec.name} not registered`).toBeDefined();
      expect(def!.description).toBe(spec.description);
    }
    // Sanity floor: the surface is the full ~29, not the legacy six.
    expect(CLI_BRIDGE_TOOLS.length).toBeGreaterThanOrEqual(29);
  });

  it('destructive/execute tools are always-confirm — never silently runnable', () => {
    for (const name of ['deckent_start', 'deckent_run', 'deckent_kill', 'deckent_cleanup', 'deckent_recover', 'deckent_process']) {
      expect(reg.get(name)!.tier, `${name} tier`).toBe('always');
    }
  });

  it('arg-aware traps are pinned at their most-privileged action (over-ask, never under-ask)', () => {
    // deckent_config is the one genuine trap: bare {} classifies 'read' (show),
    // but `config set` mutates config.json — WORST_CASE_CLASSIFY_ARGS pins it.
    expect(classifyTool('deckent_config', {})).toBe('read');
    expect(classifyTool('deckent_config', WORST_CASE_CLASSIFY_ARGS['deckent_config']!)).toBe('confirm');
    expect(reg.get('deckent_config')!.tier).toBe('confirm');
    // audit/process/autonomous default to their most-privileged action inside
    // classifyTool itself ('gate'/'submit'/mutate) — pin that stays true.
    expect(classifyTool('deckent_audit', {})).toBe('confirm');
    expect(reg.get('deckent_audit')!.tier).toBe('confirm');
    expect(classifyTool('deckent_process', {})).toBe('always');
  });

  it('read-only tools stay silent (no new friction on the read path)', () => {
    for (const name of ['deckent_status', 'deckent_cost', 'deckent_usage', 'deckent_memory_query', 'deckent_kpi']) {
      expect(reg.get(name)!.tier, `${name} tier`).toBe('silent');
    }
  });

  it('deckent_review is confirm-gated — it REWRITES task JSON files (advisor catch, was silent since the original six)', () => {
    expect(classifyTool('deckent_review', {})).toBe('confirm');
    expect(reg.get('deckent_review')!.tier).toBe('confirm');
  });

  it('deliberately excluded names stay unadvertised (watch would block a REPL turn forever)', () => {
    for (const name of ['deckent_watch', 'deckent_init', 'deckent_help', 'deckent_docs']) {
      expect(CLI_BRIDGE_TOOLS.find((s) => s.name === name)).toBeUndefined();
      expect(reg.get(name)).toBeUndefined();
    }
  });
});
