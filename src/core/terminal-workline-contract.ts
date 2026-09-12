// Shared Workline semantics for Terminal REPL and future Desktop operator chat.
// Authority: docs/design/DECKENT-TERMINAL-SINGLE-SURFACE.md (Causal Workline + Work Ledger).
// Provider-neutral — no host-CLI or competitor naming in this contract.

/** Composer paste collapse thresholds (display chip vs full wire on submit). */
export interface TerminalWorklineComposerConfig {
  /** Lines at or below stay inline in the draft; above → localized chip. Default 3. */
  paste_max_lines_inline?: number;
  /** Character count at or below stays inline; above → chip. Default 512. */
  paste_max_chars_inline?: number;
}

/** Live operator strip vs scrollback commit policy. */
export interface TerminalWorklineOperatorConfig {
  /** When true, assistant prose buffered during tool-active is discarded from scrollback until deliverable. Default true. */
  suppress_prose_during_tool_execution?: boolean;
}

export interface TerminalWorklineConfig {
  composer?: TerminalWorklineComposerConfig;
  operator?: TerminalWorklineOperatorConfig;
}

export const DEFAULT_TERMINAL_WORKLINE_COMPOSER: Required<TerminalWorklineComposerConfig> = {
  paste_max_lines_inline: 3,
  paste_max_chars_inline: 512,
};

export const DEFAULT_TERMINAL_WORKLINE_OPERATOR: Required<TerminalWorklineOperatorConfig> = {
  suppress_prose_during_tool_execution: true,
};

export function resolveTerminalWorklineComposer(
  workline: TerminalWorklineConfig | undefined,
): Required<TerminalWorklineComposerConfig> {
  return {
    paste_max_lines_inline: workline?.composer?.paste_max_lines_inline
      ?? DEFAULT_TERMINAL_WORKLINE_COMPOSER.paste_max_lines_inline,
    paste_max_chars_inline: workline?.composer?.paste_max_chars_inline
      ?? DEFAULT_TERMINAL_WORKLINE_COMPOSER.paste_max_chars_inline,
  };
}

export function resolveTerminalWorklineOperator(
  workline: TerminalWorklineConfig | undefined,
): Required<TerminalWorklineOperatorConfig> {
  return {
    suppress_prose_during_tool_execution: workline?.operator?.suppress_prose_during_tool_execution
      ?? DEFAULT_TERMINAL_WORKLINE_OPERATOR.suppress_prose_during_tool_execution,
  };
}
