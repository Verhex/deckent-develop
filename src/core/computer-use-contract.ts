// ═══ Computer-Use Contract — TOOL-CU dilim-1 (Sprint 369, Task 369-005) ═════
// Contract-only layer for a future computer-use capability pack: zod action/
// result schemas + a fixed security-class taxonomy + an honest availability
// resolver. NO adapter implementation lives here — no screenshot capture, no
// browser/OS driver, nothing that actually touches a screen. That is
// explicitly deferred to the next slice (adapter-impl dilim-2); this file is
// the sözleşme (contract) the adapter will be built against.
//
// ADR-D-004 (Layer-1 Import Direction) C1: core/ MUST NOT import cli/. The
// security-class taxonomy below therefore does NOT import
// `CommandRisk` from src/cli/command-registry.ts — it is a structurally
// independent mirror of that ladder's first three rungs ('Oku' < 'Değiştir' <
// 'Çalıştır'; 'Otonom' is omitted — a single bounded computer-use action never
// qualifies as a continuous-loop autonomous action). Consistency between the
// two ladders is a naming convention, not a compile-time coupling — same
// posture as ToolRiskLevel in tool-registry.ts.
//
// Capability-negotiation design (Law #2 — every environment, million-scale):
// availability is entirely config-driven (`ComputerUseConfig.allowed_capabilities`)
// and never assumes a specific OS/browser/adapter is present. A future adapter
// for any environment (headless browser, native desktop, mobile emulator, ...)
// negotiates its own capability subset through the same allowlist shape —
// nothing here hardcodes a single platform's capability set.

import { z } from 'zod';

// ─── Security-Class Taxonomy ────────────────────────────────────────────────

export const COMPUTER_USE_SECURITY_CLASSES = ['Oku', 'Değiştir', 'Çalıştır'] as const;
/** Mirrors the first three rungs of command-registry.ts's `CommandRisk` ladder
 *  (Oku < Değiştir < Çalıştır < Otonom) — see file header for why this is a
 *  structural mirror, not an import. */
export type ComputerUseSecurityClass = (typeof COMPUTER_USE_SECURITY_CLASSES)[number];

export const COMPUTER_USE_ACTION_KINDS = ['screenshot', 'click', 'type', 'navigate'] as const;
export type ComputerUseActionKind = (typeof COMPUTER_USE_ACTION_KINDS)[number];

/**
 * Fixed action → security-class mapping. Deliberately NOT a schema field the
 * caller can set — a `click` action claiming `Oku` would let a read-only
 * allowlist gate be bypassed by mislabeling. The class is always derived here,
 * never trusted from input.
 */
export const COMPUTER_USE_ACTION_SECURITY_CLASS: Readonly<Record<ComputerUseActionKind, ComputerUseSecurityClass>> = {
  screenshot: 'Oku',
  click: 'Değiştir',
  type: 'Değiştir',
  navigate: 'Çalıştır',
};

// ─── Action Schemas ──────────────────────────────────────────────────────────

/** Captures the current screen/viewport state. Read-only — never mutates. */
const screenshotActionSchema = z.object({
  kind: z.literal('screenshot'),
  /** Optional named region/selector to scope the capture (else full viewport). */
  region: z.string().min(1).optional(),
});

/** Simulates a pointer click at a coordinate. */
const clickActionSchema = z.object({
  kind: z.literal('click'),
  x: z.number().finite(),
  y: z.number().finite(),
  button: z.enum(['left', 'right', 'middle']).default('left'),
  clickCount: z.number().int().positive().max(3).default(1),
});

/** Simulates keyboard text entry into the currently focused control. */
const typeActionSchema = z.object({
  kind: z.literal('type'),
  text: z.string().min(1).max(10_000),
  /** Delay in ms between keystrokes (default: 0 — no artificial delay). */
  delayMs: z.number().int().min(0).max(5_000).default(0),
});

/** Directs the controlled surface to a URL. Highest security class — an
 *  arbitrary page load can trigger arbitrary script execution downstream. */
const navigateActionSchema = z.object({
  kind: z.literal('navigate'),
  url: z.string().url(),
  /** Wait condition before considering navigation complete (default: 'load'). */
  waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle']).default('load'),
});

/** Discriminated union (discriminant: `kind`) of every supported action. */
export const computerUseActionSchema = z.discriminatedUnion('kind', [
  screenshotActionSchema,
  clickActionSchema,
  typeActionSchema,
  navigateActionSchema,
]);

export type ComputerUseAction = z.infer<typeof computerUseActionSchema>;
export type ComputerUseScreenshotAction = z.infer<typeof screenshotActionSchema>;
export type ComputerUseClickAction = z.infer<typeof clickActionSchema>;
export type ComputerUseTypeAction = z.infer<typeof typeActionSchema>;
export type ComputerUseNavigateAction = z.infer<typeof navigateActionSchema>;

/** Derives the fixed security class for a validated action (never from raw input). */
export function securityClassForAction(action: ComputerUseAction): ComputerUseSecurityClass {
  return COMPUTER_USE_ACTION_SECURITY_CLASS[action.kind];
}

// ─── Result Schemas ──────────────────────────────────────────────────────────

export const COMPUTER_USE_RESULT_STATUSES = ['ok', 'error', 'unavailable'] as const;
export type ComputerUseResultStatus = (typeof COMPUTER_USE_RESULT_STATUSES)[number];

const computerUseResultBaseSchema = z.object({
  actionKind: z.enum(COMPUTER_USE_ACTION_KINDS),
  securityClass: z.enum(COMPUTER_USE_SECURITY_CLASSES),
  /** ISO-8601 timestamp the action completed (or was rejected) at. */
  timestamp: z.string().min(1),
});

const computerUseOkResultSchema = computerUseResultBaseSchema.extend({
  status: z.literal('ok'),
  /** base64-encoded PNG — populated for `screenshot`, omitted for other kinds. */
  screenshotBase64: z.string().optional(),
});

const computerUseErrorResultSchema = computerUseResultBaseSchema.extend({
  status: z.literal('error'),
  errorMessage: z.string().min(1),
});

const computerUseUnavailableResultSchema = computerUseResultBaseSchema.extend({
  status: z.literal('unavailable'),
  /** Honest reason the action could not run (flag off, capability not allowlisted, ...). */
  reason: z.string().min(1),
});

/** Discriminated union (discriminant: `status`) of every possible action outcome. */
export const computerUseResultSchema = z.discriminatedUnion('status', [
  computerUseOkResultSchema,
  computerUseErrorResultSchema,
  computerUseUnavailableResultSchema,
]);

export type ComputerUseResult = z.infer<typeof computerUseResultSchema>;

// ─── Config Shape (consumed by config-types.ts's DeckentConfig/ResolvedConfig) ──

/**
 * `computer_use` config block. Default-off — absent block or `enabled: false`
 * means every capability is unavailable, regardless of `allowed_capabilities`.
 * `allowed_capabilities` is an explicit allowlist (never a denylist) so a
 * fresh install with the flag flipped on grants ZERO capabilities until the
 * operator names them — least-privilege by construction.
 */
export interface ComputerUseConfig {
  /** Master switch — the block is inert unless true (default: false). */
  enabled?: boolean;
  /** Explicit allowlist of action kinds this deployment permits.
   *  Absent/empty while `enabled: true` = no capability granted (fail-closed). */
  allowed_capabilities?: string[];
}

// ─── Availability Resolver ───────────────────────────────────────────────────

export interface ComputerUseAvailability {
  available: boolean;
  /** Present whenever `available` is false — always a human-readable reason, never silent. */
  reason?: string;
  /** The subset of COMPUTER_USE_ACTION_KINDS this deployment currently grants. */
  allowedCapabilities: ComputerUseActionKind[];
}

function isKnownActionKind(value: string): value is ComputerUseActionKind {
  return (COMPUTER_USE_ACTION_KINDS as readonly string[]).includes(value);
}

/**
 * Resolves whether computer-use is available given a (possibly absent)
 * `computer_use` config block. Never assumes availability — disabled, absent,
 * or misconfigured input all resolve to an honest `unavailable` with a
 * specific reason. This is the capability-negotiation entrypoint any future
 * adapter (dilim-2+) queries before attempting a real action; no adapter code
 * exists yet, so callers today always see the flag-off path in production.
 */
export function resolveComputerUseAvailability(config?: ComputerUseConfig): ComputerUseAvailability {
  if (!config?.enabled) {
    return {
      available: false,
      reason: 'computer_use disabled (config.computer_use.enabled is false or the block is absent) — flag-gated, default-off',
      allowedCapabilities: [],
    };
  }

  const requested = config.allowed_capabilities ?? [];
  const allowedCapabilities = requested.filter(isKnownActionKind);

  if (allowedCapabilities.length === 0) {
    return {
      available: false,
      reason: 'computer_use enabled but allowed_capabilities grants no known capability — fail-closed allowlist',
      allowedCapabilities: [],
    };
  }

  return { available: true, allowedCapabilities };
}
