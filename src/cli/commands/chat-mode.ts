// ═══ chat-mode — User / Enterprise REPL mode resolution ══════════════════════
//
// Sprint 221 Task 221-009.
//
// Resolves the REPL operating mode (user | enterprise) from config and env.
// Enterprise mode makes audit/rbac/flow/cost slash commands visible in /help;
// user mode hides them (capability always present — "kullanılmasa da kullanılabilir").
//
// Karpathy D2: pure functions, no runtime deps, no disk I/O.
//
// Sprint 359 Task 359-008 (TERM-SIMPLE) — added Simple-Mode: a SECOND, ORTHOGONAL
// visibility filter (`resolveSimpleMode` + `filterRegistryForSimpleMode`) narrowing
// /help to a ≤7-command core set for basic users. This is NOT a third `ChatMode`
// state and NOT related to `../repl/term-mode.ts`'s Ask/Run/Control state machine —
// that module gates EXECUTION risk (`checkActionAllowed`), never /help display, and
// this file has zero import coupling with it (disk-verified). Simple-mode composes
// with the existing user/enterprise filter via `getVisibleCommands`'s new optional
// 2nd param; omitting it keeps every existing call site byte-identical.

import { buildSlashRegistry, type SlashCommand } from './chat-slash-registry.js';

/** REPL operating mode. Defaults to 'user'. */
export type ChatMode = 'user' | 'enterprise';

// ─── Enterprise slash names ────────────────────────────────────────────────────
//
// Source of truth for which slash commands belong to the enterprise group.
// These are hidden in /help in user mode but always resolve when typed directly.
// config chat.mode: enterprise → show; user (default) → hide from /help.
//
const ENTERPRISE_SLASH_NAMES = new Set(['/audit', '/rbac', '/flow', '/cost']);

// ─── Simple-Mode core slash names (Sprint 359 T-359-008, Sıra-53) ─────────────
//
// Source of truth for the basic-user "core set" — the ONLY commands shown in
// /help when Simple-Mode is on. Unlike ENTERPRISE_SLASH_NAMES (a blocklist),
// this is an ALLOWLIST: everything not named here is hidden, including both
// advanced user-mode commands AND enterprise commands.
//
// '/do' is the REPL-slash counterpart of the CLI golden-flow entrypoint
// (`deckent do "<goal>"`, orchestra/golden-flow.ts) — same forward-reference
// pattern already used above by ENTERPRISE_SLASH_NAMES for '/rbac'/'/flow'/
// '/cost', none of which exist in chat-slash-registry.ts's SLASH_CATALOG
// either yet: a name not (yet) present in a given registry is simply never
// matched by the filter below, never an error.
const SIMPLE_CORE_SLASH_NAMES = new Set(['/status', '/plan', '/do', '/help', '/resume', '/model', '/exit']);

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

/**
 * Resolve the Simple-Mode flag from config (Sprint 359 T-359-008, Sıra-53).
 *
 * Reads `config.terminal.simple_mode` — default-off (`false`) unless the value is
 * literally `true`. Mirrors `resolveChatMode`'s duck-typed narrow-param pattern
 * (no dependency on the full `DeckentConfig`/`TerminalConfig` type) so this stays
 * usable ahead of a follow-up wiring `simple_mode` into config-types.ts's
 * `TerminalConfig` interface (that file is outside this task's write scope — see
 * task notes).
 *
 * Invalid / unknown values are silently treated as the default (`false`).
 */
export function resolveSimpleMode(config: { terminal?: { simple_mode?: unknown } }): boolean {
  return config?.terminal?.simple_mode === true;
}

/**
 * Filter a slash registry down to the Simple-Mode core set for /help display.
 *
 * A basic-user allowlist (see SIMPLE_CORE_SLASH_NAMES) — hides both advanced
 * user-mode commands and enterprise commands, leaving only the ≤7-command core
 * set (status/plan/do/help/resume/model/exit). As with `filterRegistryByMode`,
 * this only affects /help VISIBILITY — pass the FULL registry to `resolveSlash()`
 * so every command still works when typed directly (capability always present).
 */
export function filterRegistryForSimpleMode(registry: readonly SlashCommand[]): readonly SlashCommand[] {
  return registry.filter((cmd) => SIMPLE_CORE_SLASH_NAMES.has(cmd.name));
}

/**
 * Mode-aware /help command list — the canonical entrypoint for `/help` rendering.
 *
 * Builds the live slash catalog and filters it for the given mode in one call, so
 * a `/help` consumer needs only `renderHelp(getVisibleCommands(mode))` instead of
 * separately calling `buildSlashRegistry()` + `filterRegistryByMode()`.
 *
 * `simpleMode` (Sprint 359 T-359-008) is an OPTIONAL 3rd-state-free 2nd param —
 * omitted (or `false`), every existing call site (chat-native.ts, all prior
 * tests) is byte-for-byte unaffected. Pass `true` (from `resolveSimpleMode`) to
 * further narrow the mode-filtered list down to the Simple-Mode core set.
 *
 * NOTE: this does NOT change what `resolveSlash()` accepts — dispatch must still
 * use the FULL (unfiltered) registry from `buildSlashRegistry()` so enterprise
 * commands keep working when typed directly in user mode (see filterRegistryByMode
 * doc comment above).
 */
export function getVisibleCommands(mode: ChatMode, simpleMode = false, lang?: string): readonly SlashCommand[] {
  // `lang` (TERMINAL-TOOLS-001 i18n closure) resolves the catalog descriptions
  // for the caller's session language; omitted → buildSlashRegistry's own
  // getLanguage() fallback, so every pre-existing call site keeps its shape.
  const modeFiltered = filterRegistryByMode(buildSlashRegistry(lang), mode);
  return simpleMode ? filterRegistryForSimpleMode(modeFiltered) : modeFiltered;
}
