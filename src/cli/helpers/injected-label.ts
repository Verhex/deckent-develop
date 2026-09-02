// src/cli/helpers/injected-label.ts
// ═══ TERMINAL-TOOLS-001 — string-free mechanism guard ═══════════════════════
//
// AGENTS quality bar (i18n-FIRST): mechanism modules (TUI render/controller)
// carry no user-visible text; every label is injected by the caller from the
// message catalog (`getMessage(key, lang)`). A hardcoded fallback inside the
// mechanism would let a missing injection degrade silently to English, which
// is exactly the defect class this closure removed. This guard is the
// mechanism's only answer to a missing label: a typed, loud programmer-
// contract error (surfaced by ReplErrorBoundary / the boot path), never a
// substitute string.
//
// The error itself is ALSO string-free (main-session REVISE, 2026-09-02):
// `message` is the stable technical code — never prose — because
// ReplErrorBoundary renders `err.message`. The missing label lives in the
// structured `label` field; a user-facing explanation is resolved by the
// caller from the catalog (`tui.injected_label_missing`, run.tsx
// buildReplErrorDescriber) for the session language.

/** Stable technical code carried as the error message (no natural language). */
export const INJECTED_LABEL_MISSING_CODE = 'E_INJECTED_LABEL_MISSING' as const;

/** Thrown when a caller failed to inject a required label. */
export class InjectedLabelMissingError extends Error {
  readonly code: typeof INJECTED_LABEL_MISSING_CODE = INJECTED_LABEL_MISSING_CODE;
  readonly label: string;
  constructor(label: string) {
    super(INJECTED_LABEL_MISSING_CODE);
    this.name = 'InjectedLabelMissingError';
    this.label = label;
  }
}

/**
 * Return the injected label or throw {@link InjectedLabelMissingError}.
 * An empty string counts as missing — an empty label is not a rendered label.
 */
export function requireInjectedLabel(label: string, value: string | undefined): string {
  if (typeof value !== 'string' || value.length === 0) throw new InjectedLabelMissingError(label);
  return value;
}
