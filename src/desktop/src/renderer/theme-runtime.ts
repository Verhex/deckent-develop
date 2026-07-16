/**
 * D4-1 (SURF-4) — renderer theme runtime: applies a watch (vardiya) to the
 * document by materializing the three token layers as CSS custom properties
 * and stamping `data-theme` on the root element.
 *
 * All token KNOWLEDGE lives in ../shared/theme-tokens.ts (SSOT — primitives,
 * watches, component map, builder); this module is the thin DOM edge. It is
 * deliberately typed against a structural `ThemeTargetElement` instead of
 * `HTMLElement`, so vitest.desktop.config.ts (environment: node, no DOM) can
 * exercise it with a fake element.
 *
 * Applied synchronously at renderer entry (main.ts) BEFORE the first render,
 * so there is no unthemed flash; the persisted preference arrives over IPC a
 * beat later and is re-applied on top (same code path — idempotent).
 */
import {
  buildCssVariables,
  DEFAULT_PREFERENCES,
  type DesktopPreferences,
  type SemanticTokenName,
  type WatchName,
} from '../shared/theme-tokens.js';

/** Structural subset of HTMLElement the runtime touches (node-testable). */
export interface ThemeTargetElement {
  style: {
    setProperty(name: string, value: string): void;
  };
  setAttribute(name: string, value: string): void;
}

export interface AppliedTheme {
  watch: WatchName;
  /** Exact CSS-variable map that was set (tests assert the layer chain). */
  variables: Record<string, string>;
}

/**
 * Apply `preferences` (watch + custom semantic overrides) to `root`.
 * Idempotent: the variable KEY SET is constant across watches, so re-applying
 * fully replaces the previous watch — no stale-property cleanup needed.
 */
export function applyWatch(
  root: ThemeTargetElement,
  preferences: Pick<DesktopPreferences, 'watch' | 'customTokens'> = DEFAULT_PREFERENCES,
): AppliedTheme {
  const customTokens = preferences.customTokens as Partial<Record<SemanticTokenName, string>>;
  const variables = buildCssVariables(preferences.watch, customTokens);
  for (const [name, value] of Object.entries(variables)) {
    root.style.setProperty(name, value);
  }
  root.setAttribute('data-theme', preferences.watch);
  return { watch: preferences.watch, variables };
}
