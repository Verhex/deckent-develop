// ═══ term-simple-mode — Simple-Mode edition tests (Sprint 359 T-359-008, Sıra-53) ══
//
// Covers the NEW Simple-Mode surface added to chat-mode.ts:
//   - resolveSimpleMode(config)              — config → boolean resolution
//   - filterRegistryForSimpleMode(registry)  — ≤7-command core-set allowlist
//   - getVisibleCommands(mode, simpleMode?)  — mode-filter composed with simple-filter
//
// Also disk-verifies the task's required architecture invariant: chat-mode.ts (a pure
// /help visibility filter) has NO import coupling with ../repl/term-mode.ts (the Ask/
// Run/Control EXECUTION state machine) — simple-mode is a second orthogonal visibility
// filter, never a new term-mode state.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  resolveSimpleMode,
  filterRegistryForSimpleMode,
  filterRegistryByMode,
  getVisibleCommands,
  type ChatMode,
} from '../../src/cli/commands/chat-mode.js';
import { buildSlashRegistry, type SlashCommand } from '../../src/cli/commands/chat-slash-registry.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const STATUS_SLASH: SlashCommand = { name: '/status', desc: 'Sprint durumu', agenticTool: 'deckent_status' };
const PLAN_SLASH: SlashCommand = { name: '/plan', desc: 'Sprint planla', agenticTool: 'deckent_plan' };
const DO_SLASH: SlashCommand = { name: '/do', desc: 'Golden-flow: hedeften sprint planla' };
const HELP_SLASH: SlashCommand = { name: '/help', desc: 'Komutları listele' };
const RESUME_SLASH: SlashCommand = { name: '/resume', desc: 'Önceki sohbeti sürdür' };
const MODEL_SLASH: SlashCommand = { name: '/model', desc: 'Modeli değiştir' };
const EXIT_SLASH: SlashCommand = { name: '/exit', desc: "REPL'den çık" };

const RECALL_SLASH: SlashCommand = { name: '/recall', desc: 'Hafızada ara', agenticTool: 'deckent_memory_query' };
const AGENTS_SLASH: SlashCommand = { name: '/agents', desc: 'Agent havuzunu listele' };
const CONFIG_SLASH: SlashCommand = { name: '/config', desc: 'Yapılandırmayı göster/değiştir' };
const AUDIT_SLASH: SlashCommand = { name: '/audit', desc: 'Audit raporu', agenticTool: 'deckent_audit' };
const RBAC_SLASH: SlashCommand = { name: '/rbac', desc: 'RBAC yönet' };

const CORE_NAMES = ['/status', '/plan', '/do', '/help', '/resume', '/model', '/exit'];

const FULL_REGISTRY: readonly SlashCommand[] = [
  HELP_SLASH,
  STATUS_SLASH,
  PLAN_SLASH,
  DO_SLASH,
  RESUME_SLASH,
  MODEL_SLASH,
  EXIT_SLASH,
  RECALL_SLASH,
  AGENTS_SLASH,
  CONFIG_SLASH,
  AUDIT_SLASH,
  RBAC_SLASH,
];

// ─── resolveSimpleMode ─────────────────────────────────────────────────────────

describe('resolveSimpleMode — terminal.simple_mode config resolution', () => {
  it('defaults to false (off) with an empty config', () => {
    expect(resolveSimpleMode({})).toBe(false);
  });

  it('defaults to false when terminal block is absent', () => {
    expect(resolveSimpleMode({ terminal: undefined })).toBe(false);
  });

  it('defaults to false when simple_mode key is absent', () => {
    expect(resolveSimpleMode({ terminal: {} })).toBe(false);
  });

  it('returns true when terminal.simple_mode === true', () => {
    expect(resolveSimpleMode({ terminal: { simple_mode: true } })).toBe(true);
  });

  it('returns false when terminal.simple_mode === false', () => {
    expect(resolveSimpleMode({ terminal: { simple_mode: false } })).toBe(false);
  });

  it('treats truthy-but-non-boolean values as off (strict === true check)', () => {
    expect(resolveSimpleMode({ terminal: { simple_mode: 'true' } })).toBe(false);
    expect(resolveSimpleMode({ terminal: { simple_mode: 1 } })).toBe(false);
  });

  it('roundtrips: setting true then false resolves independently each time (pure, no hidden state)', () => {
    expect(resolveSimpleMode({ terminal: { simple_mode: true } })).toBe(true);
    expect(resolveSimpleMode({ terminal: { simple_mode: false } })).toBe(false);
    expect(resolveSimpleMode({ terminal: { simple_mode: true } })).toBe(true);
  });
});

// ─── filterRegistryForSimpleMode ────────────────────────────────────────────────

describe('filterRegistryForSimpleMode — Simple-Mode core-set allowlist', () => {
  it('narrows the full fixture registry down to ≤7 commands', () => {
    const filtered = filterRegistryForSimpleMode(FULL_REGISTRY);
    expect(filtered.length).toBeLessThanOrEqual(7);
  });

  it('core-set is complete: exactly the 7 expected commands, nothing else', () => {
    const filtered = filterRegistryForSimpleMode(FULL_REGISTRY);
    const names = filtered.map((c) => c.name).sort();
    expect(names).toEqual([...CORE_NAMES].sort());
  });

  it('hides advanced user-mode commands (/recall /agents /config)', () => {
    const names = filterRegistryForSimpleMode(FULL_REGISTRY).map((c) => c.name);
    expect(names).not.toContain('/recall');
    expect(names).not.toContain('/agents');
    expect(names).not.toContain('/config');
  });

  it('hides enterprise commands too (/audit /rbac) — simple hides BOTH advanced and enterprise', () => {
    const names = filterRegistryForSimpleMode(FULL_REGISTRY).map((c) => c.name);
    expect(names).not.toContain('/audit');
    expect(names).not.toContain('/rbac');
  });

  it('empty registry returns empty array', () => {
    expect(filterRegistryForSimpleMode([]).length).toBe(0);
  });

  it('tolerates a registry missing some core names (no throw, just fewer results)', () => {
    const partial = FULL_REGISTRY.filter((c) => c.name !== '/do');
    const filtered = filterRegistryForSimpleMode(partial);
    expect(filtered.map((c) => c.name)).not.toContain('/do');
    expect(filtered.length).toBeLessThanOrEqual(6);
  });
});

// ─── getVisibleCommands(mode, simpleMode) — composition + off-state parity ─────

describe('getVisibleCommands — off-state parity (byte-identical to pre-359-008 behavior)', () => {
  const modes: ChatMode[] = ['user', 'enterprise'];

  for (const mode of modes) {
    it(`mode="${mode}" with simpleMode omitted equals the pre-existing filterRegistryByMode(mode) result`, () => {
      const before = filterRegistryByMode(buildSlashRegistry(), mode);
      const after = getVisibleCommands(mode);
      expect(after).toEqual(before);
    });

    it(`mode="${mode}" with simpleMode=false explicitly equals the same pre-existing result`, () => {
      const before = filterRegistryByMode(buildSlashRegistry(), mode);
      const after = getVisibleCommands(mode, false);
      expect(after).toEqual(before);
    });
  }
});

describe('getVisibleCommands — Simple-Mode on (live SLASH_CATALOG)', () => {
  it('user mode + simple=true: visible-command count is ≤7', () => {
    const visible = getVisibleCommands('user', true);
    expect(visible.length).toBeLessThanOrEqual(7);
  });

  it('user mode + simple=true: every visible command is in the declared core set', () => {
    const visible = getVisibleCommands('user', true);
    for (const cmd of visible) {
      expect(CORE_NAMES).toContain(cmd.name);
    }
  });

  it('enterprise mode + simple=true: STILL narrows to the core set (simple hides enterprise regardless of mode)', () => {
    const visible = getVisibleCommands('enterprise', true);
    const names = visible.map((c) => c.name);
    expect(names).not.toContain('/audit');
    expect(names).not.toContain('/rbac');
    expect(names).not.toContain('/flow');
    expect(names).not.toContain('/cost');
    for (const cmd of visible) {
      expect(CORE_NAMES).toContain(cmd.name);
    }
  });

  it('core commands still resolve via the FULL registry when simple-mode hides them from /help (capability always present)', () => {
    const fullRegistry = buildSlashRegistry();
    const namesInFullRegistry = fullRegistry.map((c) => c.name);
    // /status /plan /help /resume /model /exit exist today in the live catalog
    // (chat-slash-registry.ts) — Simple-Mode never removes capability, only /help
    // visibility, exactly like the existing enterprise filter's own invariant.
    expect(namesInFullRegistry).toContain('/status');
    expect(namesInFullRegistry).toContain('/plan');
    expect(namesInFullRegistry).toContain('/help');
    expect(namesInFullRegistry).toContain('/resume');
    expect(namesInFullRegistry).toContain('/model');
    expect(namesInFullRegistry).toContain('/exit');
  });
});

// ─── Architecture invariant: chat-mode.ts stays decoupled from term-mode.ts ─────

describe('architecture — chat-mode.ts (visibility filter) vs. term-mode.ts (execution state machine)', () => {
  it('disk-verify: chat-mode.ts does not import ../repl/term-mode.ts (simple-mode is a visibility filter, not a term-mode state)', () => {
    const source = readFileSync(join(__dirname, '../../src/cli/commands/chat-mode.ts'), 'utf-8');
    expect(source).not.toMatch(/from ['"].*term-mode\.js['"]/);
  });

  it('disk-verify: term-mode.ts does not import chat-mode.ts (no reverse coupling either)', () => {
    const source = readFileSync(join(__dirname, '../../src/cli/repl/term-mode.ts'), 'utf-8');
    expect(source).not.toMatch(/from ['"].*chat-mode\.js['"]/);
  });
});
