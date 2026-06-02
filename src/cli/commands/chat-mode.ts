// ═══ chat-mode — User / Enterprise REPL mode resolution ══════════════════════
//
// Sprint 221 Task 221-009.
//
// Resolves the REPL operating mode (user | enterprise) from config and env.
// Enterprise mode makes audit/rbac/flow/cost slash commands visible in /help;
// user mode hides them (capability always present — "kullanılmasa da kullanılabilir").
//
// Karpathy D2: pure functions, no runtime deps, no disk I/O.

import type { SlashCommand } from './chat-slash-registry.js';

/** REPL operating mode. Defaults to 'user'. */
export type ChatMode = 'user' | 'enterprise';

// ─── Enterprise slash names ────────────────────────────────────────────────────
//
// Source of truth for which slash commands belong to the enterprise group.
// These are hidden in /help in user mode but always resolve when typed directly.
// config chat.mode: enterprise → show; user (default) → hide from /help.
//
const ENTERPRISE_SLASH_NAMES = new Set(['/audit', '/rbac', '/flow', '/cost']);

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve the REPL chat mode from config and environment.
 *
 * Priority (highest → lowest):
 *   1. `DECKENT_CHAT_MODE` env var  ('user' | 'enterprise')
 *   2. `config.chat.mode`           ('user' | 'enterprise')
 *   3. default: 'user'
 *
 * Invalid / unknown values are silently treated as the default ('user').
 */
export function resolveChatMode(config: { chat?: { mode?: unknown } }): ChatMode {
  const envMode = process.env['DECKENT_CHAT_MODE'];
  if (envMode === 'enterprise') return 'enterprise';
  if (envMode === 'user') return 'user';

  const cfgMode = config?.chat?.mode;
  if (cfgMode === 'enterprise') return 'enterprise';
  return 'user';
}

/**
 * Filter a slash registry for /help display based on the current mode.
 *
 * - `enterprise`: returns the full registry (all commands visible in /help)
 * - `user`: removes enterprise commands (/audit /rbac /flow /cost) from the list
 *
 * IMPORTANT: pass the FULL (unfiltered) registry to `resolveSlash()` so that
 * enterprise commands still work when typed directly in user mode.
 */
export function filterRegistryByMode(
  registry: readonly SlashCommand[],
  mode: ChatMode,
): readonly SlashCommand[] {
  if (mode === 'enterprise') return registry;
  return registry.filter((cmd) => !ENTERPRISE_SLASH_NAMES.has(cmd.name));
}

/**
 * Return true when `name` belongs to the enterprise slash group.
 * Useful for grouping commands in /help output or conditional rendering.
 */
export function isEnterpriseSlash(name: string): boolean {
  return ENTERPRISE_SLASH_NAMES.has(name.toLowerCase());
}
