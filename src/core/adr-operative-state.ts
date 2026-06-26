// src/core/adr-operative-state.ts

/**
 * ADR operative-state — machine-readable enforcement schema (Sprint 330, Task 330-020).
 *
 * Spec Pillar 6 (protected-set diff pre-condition). Today an ADR's enforcement
 * semantics — whether a rule is `soft` (advisory/warn) or `hard` (block), which
 * residual exceptions are sanctioned, and any feature-flag gate — live ONLY in
 * prose (e.g. `authority-enforcer.ts` soft-only by comment, ADR-008-W residual as
 * a code comment). The Auditor cannot read prose reliably, so it issues false
 * NO_GOs. This module makes that state a machine-readable FIELD on the ADR record.
 *
 * Storage: there is **no schema migration**. Operative-state is persisted inside the
 * existing `metadata` JSON blob (memory-store already round-trips
 * `CreateEntryInput.metadata` → `MemoryEntryV2.metadata` as a JSON string) under a
 * single namespaced key (`OPERATIVE_KEY`) to stay collision-safe with other metadata.
 *
 * Read from the FIELD, never from prose: `readOperativeState(adr)` is the single
 * accessor consumers (Auditor, diff-check) use.
 */

// ─── Operative State Schema ──────────────────────────────────────────

/** Enforcement strength of an ADR constraint. `soft` = advisory/warn (ADR-037 V1.0); `hard` = block. */
export type EnforcementLevel = 'soft' | 'hard';

/**
 * Machine-readable enforcement state for an ADR.
 *
 * @property enforcementLevel - `soft` (advisory/warn, does not block) or `hard` (blocks).
 * @property exceptions - Sanctioned residual violations / carve-outs that must NOT be
 *   flagged as NO_GO (e.g. tracked work-items, sanctioned adapter bindings). Each entry
 *   is a human-readable description anchored to a tracking id where one exists.
 * @property flagGating - Optional config/feature-flag key that gates the rule (the rule
 *   only applies when the flag is on). Omitted when the rule is unconditional.
 */
export interface OperativeState {
  enforcementLevel: EnforcementLevel;
  exceptions: string[];
  flagGating?: string;
}

/**
 * Structural shape this module reads/writes. Both `MemoryEntryV2` (metadata: string)
 * and `CreateEntryInput` (metadata?: Record) satisfy it — operative-state is form-agnostic.
 */
export interface OperativeAdrLike {
  metadata?: string | Record<string, unknown> | null;
}

/** Namespaced key under which operative-state lives inside the metadata blob. */
export const OPERATIVE_KEY = 'operative';

// ─── Operative Section Markers (canonical) ───────────────────────────
// Mirror of the markers in src/orchestra/adr-selector.ts. This module is the
// canonical home for the `worker-operative` extraction (completing the half-step
// at adr-selector.ts:411 — that private copy can later import from here).

const OPERATIVE_START = '<!-- worker-operative-start -->';
const OPERATIVE_END = '<!-- worker-operative-end -->';

/**
 * Extract the operative section from ADR content when the
 * `<!-- worker-operative-start --> / <!-- worker-operative-end -->` markers are present.
 *
 * @returns the trimmed section between the markers, or `null` when no valid marker
 *   pair is found (caller falls back to full content). Byte-for-byte compatible with
 *   the private `extractOperativeSection` in adr-selector.ts.
 */
export function extractOperative(content: string): string | null {
  const startIdx = content.indexOf(OPERATIVE_START);
  const endIdx = content.indexOf(OPERATIVE_END);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return null;
  return content.slice(startIdx + OPERATIVE_START.length, endIdx).trim();
}

// ─── Metadata Blob Helpers ───────────────────────────────────────────

/**
 * Coerce a metadata value (JSON string from the DB, an in-memory object, or null)
 * into a plain object. Never throws — malformed JSON yields an empty object so
 * reads stay defensive against legacy/corrupt rows.
 */
function parseMetadata(
  metadata: string | Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (metadata == null) return {};
  if (typeof metadata === 'string') {
    const trimmed = metadata.trim();
    if (trimmed === '') return {};
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }
  return metadata;
}

/** Normalize an OperativeState for storage — copy arrays, drop empty/undefined flagGating. */
function normalizeState(state: OperativeState): OperativeState {
  const normalized: OperativeState = {
    enforcementLevel: state.enforcementLevel,
    exceptions: [...(state.exceptions ?? [])],
  };
  if (typeof state.flagGating === 'string' && state.flagGating.trim() !== '') {
    normalized.flagGating = state.flagGating;
  }
  return normalized;
}

// ─── Read / Write ────────────────────────────────────────────────────

/**
 * Read the machine-readable operative-state from an ADR's metadata blob.
 *
 * Reads from the FIELD, not prose. Returns `null` when the ADR has not been
 * annotated (or the stored value is malformed / missing a valid enforcementLevel) —
 * absence is meaningful: the consumer treats it as "unspecified", never as a default.
 */
export function readOperativeState(adr: OperativeAdrLike): OperativeState | null {
  const meta = parseMetadata(adr?.metadata);
  const raw = meta[OPERATIVE_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const obj = raw as Record<string, unknown>;
  const level = obj.enforcementLevel;
  if (level !== 'soft' && level !== 'hard') return null;

  const exceptions = Array.isArray(obj.exceptions)
    ? obj.exceptions.filter((e): e is string => typeof e === 'string')
    : [];

  const state: OperativeState = { enforcementLevel: level, exceptions };
  if (typeof obj.flagGating === 'string' && obj.flagGating.trim() !== '') {
    state.flagGating = obj.flagGating;
  }
  return state;
}

/**
 * Write operative-state into an ADR's metadata blob, preserving every other metadata
 * key and the blob's original FORM (string-in → JSON-string-out, object-in → object-out,
 * absent → object-out). No schema migration — the state lives under `OPERATIVE_KEY`.
 *
 * Returns a shallow copy of `adr` with the updated metadata, so
 * `readOperativeState(writeOperativeState(adr, state))` round-trips to `state`.
 */
export function writeOperativeState<T extends OperativeAdrLike>(
  adr: T,
  state: OperativeState,
): T {
  const meta = parseMetadata(adr?.metadata);
  const nextMeta: Record<string, unknown> = { ...meta, [OPERATIVE_KEY]: normalizeState(state) };
  const wasString = typeof adr?.metadata === 'string';
  return {
    ...adr,
    metadata: wasString ? JSON.stringify(nextMeta) : nextMeta,
  } as T;
}

/**
 * Build a bare metadata blob carrying just the operative-state — convenience for
 * seed/construction call-sites that have no prior metadata to merge.
 */
export function operativeMetadata(state: OperativeState): Record<string, unknown> {
  return { [OPERATIVE_KEY]: normalizeState(state) };
}

// ─── Render (prompt injection) ───────────────────────────────────────

/** Options for {@link renderOperativeState}. */
export interface RenderOperativeOptions {
  /**
   * Optional ADR id/label printed before the enforcement line (e.g. `ADR-037`),
   * so the worker knows which constraint the operative-state governs. Omitted when
   * the caller renders the block directly under an existing ADR header.
   */
  label?: string;
}

/**
 * Render the machine-readable operative-state into a deterministic prompt block —
 * the single SSOT both the CLI ADR-selector and the agentic worker-runner inject,
 * so the two worker paths carry the SAME enforcement semantics (Spec Pillar 1
 * parity: no CLI-path rule may be missing on the agentic path).
 *
 * Pure + deterministic (no Date/random) → safe under the prompt-determinism guard.
 * Returns `''` for a null/absent or structurally-invalid state (no stranded label —
 * mirrors the ADR-selector "omit the head when nothing usable" idiom), so callers
 * can splice the result unconditionally.
 *
 * @example
 *   renderOperativeState(readOperativeState(adr), { label: adr.id })
 */
export function renderOperativeState(
  state: OperativeState | null | undefined,
  options: RenderOperativeOptions = {},
): string {
  if (!state || (state.enforcementLevel !== 'soft' && state.enforcementLevel !== 'hard')) {
    return '';
  }

  const label = options.label?.trim();
  const prefix = label ? `${label} ` : '';
  const enforcement =
    state.enforcementLevel === 'hard'
      ? 'HARD — a violation blocks the task (NO_GO).'
      : 'SOFT — advisory/warn; a violation is flagged but does NOT block.';
  const lines: string[] = [`**${prefix}enforcement:** ${enforcement}`];

  const exceptions = state.exceptions
    .filter((e) => typeof e === 'string' && e.trim() !== '')
    .map((e) => e.trim());
  if (exceptions.length > 0) {
    lines.push('Sanctioned exceptions (do NOT flag these as violations):');
    for (const ex of exceptions) lines.push(`- ${ex}`);
  }

  const flag = state.flagGating?.trim();
  if (flag) {
    lines.push(`Gated by flag — applies only when \`${flag}\` is enabled.`);
  }

  return lines.join('\n');
}
