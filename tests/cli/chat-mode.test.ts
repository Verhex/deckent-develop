import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resolveChatMode,
  filterRegistryByMode,
  isEnterpriseSlash,
  type ChatMode,
} from '../../src/cli/commands/chat-mode.js';
import type { SlashCommand } from '../../src/cli/commands/chat-slash-registry.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const STATUS_SLASH: SlashCommand = { name: '/status', desc: 'Sprint durumu', agenticTool: 'deckent_status' };
const RECALL_SLASH: SlashCommand = { name: '/recall', desc: 'Hafızada ara', agenticTool: 'deckent_memory_query' };
const HELP_SLASH: SlashCommand = { name: '/help', desc: 'Komutları listele' };
const AUDIT_SLASH: SlashCommand = { name: '/audit', desc: 'Audit raporu', agenticTool: 'deckent_audit' };
const RBAC_SLASH: SlashCommand = { name: '/rbac', desc: 'RBAC yönet', agenticTool: 'deckent_rbac' };
const FLOW_SLASH: SlashCommand = { name: '/flow', desc: 'Flow yönet', agenticTool: 'deckent_flow' };
const COST_SLASH: SlashCommand = { name: '/cost', desc: 'Maliyet görüntüle', agenticTool: 'deckent_cost' };

const FULL_REGISTRY: readonly SlashCommand[] = [
  HELP_SLASH, STATUS_SLASH, RECALL_SLASH,
  AUDIT_SLASH, RBAC_SLASH, FLOW_SLASH, COST_SLASH,
];

// ─── Env-var save/restore helpers ────────────────────────────────────────────

let savedEnvMode: string | undefined;

function clearEnvMode(): void {
  savedEnvMode = process.env['DECKENT_CHAT_MODE'];
  delete process.env['DECKENT_CHAT_MODE'];
}

function restoreEnvMode(): void {
  if (savedEnvMode !== undefined) {
    process.env['DECKENT_CHAT_MODE'] = savedEnvMode;
  } else {
    delete process.env['DECKENT_CHAT_MODE'];
  }
}

// ─── resolveChatMode ─────────────────────────────────────────────────────────

describe('resolveChatMode — mode resolution', () => {
  beforeEach(clearEnvMode);
  afterEach(restoreEnvMode);

  it('defaults to user mode when no config and no env var', () => {
    const mode: ChatMode = resolveChatMode({});
    expect(mode).toBe('user');
  });

  it('returns user mode when config.chat.mode = "user"', () => {
    expect(resolveChatMode({ chat: { mode: 'user' } })).toBe('user');
  });

  it('returns enterprise mode when config.chat.mode = "enterprise"', () => {
    expect(resolveChatMode({ chat: { mode: 'enterprise' } })).toBe('enterprise');
  });

  it('DECKENT_CHAT_MODE=enterprise overrides config (enterprise wins)', () => {
    process.env['DECKENT_CHAT_MODE'] = 'enterprise';
    expect(resolveChatMode({ chat: { mode: 'user' } })).toBe('enterprise');
  });

  it('DECKENT_CHAT_MODE=user overrides config (user wins)', () => {
    process.env['DECKENT_CHAT_MODE'] = 'user';
    expect(resolveChatMode({ chat: { mode: 'enterprise' } })).toBe('user');
  });

  it('invalid config value falls back to user mode', () => {
    expect(resolveChatMode({ chat: { mode: 'admin' } })).toBe('user');
  });

  it('undefined chat config falls back to user mode', () => {
    expect(resolveChatMode({ chat: undefined })).toBe('user');
  });

  it('null-ish chat.mode falls back to user mode', () => {
    expect(resolveChatMode({ chat: { mode: undefined } })).toBe('user');
  });
});

// ─── filterRegistryByMode ─────────────────────────────────────────────────────

describe('filterRegistryByMode — /help visibility per mode', () => {
  it('user mode: hides all enterprise commands from /help list', () => {
    const filtered = filterRegistryByMode(FULL_REGISTRY, 'user');
    const names = filtered.map((c) => c.name);
    expect(names).not.toContain('/audit');
    expect(names).not.toContain('/rbac');
    expect(names).not.toContain('/flow');
    expect(names).not.toContain('/cost');
  });

  it('user mode: retains user-facing commands (/status, /recall, /help)', () => {
    const filtered = filterRegistryByMode(FULL_REGISTRY, 'user');
    const names = filtered.map((c) => c.name);
    expect(names).toContain('/status');
    expect(names).toContain('/recall');
    expect(names).toContain('/help');
  });

  it('enterprise mode: shows all commands including enterprise ones', () => {
    const filtered = filterRegistryByMode(FULL_REGISTRY, 'enterprise');
    const names = filtered.map((c) => c.name);
    expect(names).toContain('/audit');
    expect(names).toContain('/rbac');
    expect(names).toContain('/flow');
    expect(names).toContain('/cost');
    expect(names).toContain('/status');
    expect(names).toContain('/recall');
  });

  it('enterprise mode: returns full registry (no filtering)', () => {
    const filtered = filterRegistryByMode(FULL_REGISTRY, 'enterprise');
    expect(filtered.length).toBe(FULL_REGISTRY.length);
  });

  it('enterprise-slash hidden in user /help but full registry still has it (capability present)', () => {
    const userFiltered = filterRegistryByMode(FULL_REGISTRY, 'user');
    expect(userFiltered.some((c) => c.name === '/audit')).toBe(false);
    // Full registry (used by resolveSlash) still has /audit — "kullanılmasa da kullanılabilir"
    expect(FULL_REGISTRY.some((c) => c.name === '/audit')).toBe(true);
  });

  it('empty registry returns empty array for both modes', () => {
    expect(filterRegistryByMode([], 'user').length).toBe(0);
    expect(filterRegistryByMode([], 'enterprise').length).toBe(0);
  });
});

// ─── isEnterpriseSlash ────────────────────────────────────────────────────────

describe('isEnterpriseSlash — enterprise group classification', () => {
  it('/audit is enterprise', () => expect(isEnterpriseSlash('/audit')).toBe(true));
  it('/rbac is enterprise', () => expect(isEnterpriseSlash('/rbac')).toBe(true));
  it('/flow is enterprise', () => expect(isEnterpriseSlash('/flow')).toBe(true));
  it('/cost is enterprise', () => expect(isEnterpriseSlash('/cost')).toBe(true));
  it('/status is NOT enterprise', () => expect(isEnterpriseSlash('/status')).toBe(false));
  it('/help is NOT enterprise', () => expect(isEnterpriseSlash('/help')).toBe(false));
  it('/recall is NOT enterprise', () => expect(isEnterpriseSlash('/recall')).toBe(false));
});
