// ═══ Computer-Use Platform Negotiation — TOOL-CU dilim-2 (Sprint 370, Task 370-004) ═══
// Platform-capability negotiation layered ON TOP OF the dilim-1 contract
// (computer-use-contract.ts). Still impl-free: no screenshot capture, no
// browser/OS driver, no real subprocess spawning happens in this file — that
// remains dilim-3 work. This module answers a narrower question honestly:
// "given this platform and this config, does a plausible external tool exist
// for each capability?" via an INJECTED, synchronous command-prober — the
// `command -v`-style tool-existence check a real adapter would eventually
// run. The prober being synchronous-by-construction is deliberate: it keeps
// this module structurally incapable of spawning a real subprocess itself.
//
// ADR-D-004 (Layer-1 Import Direction) C1: core/ MUST NOT import cli/ (or
// anything that transitively does). `src/connectors/capabilities/platform.ts`
// already has a `detectPlatform()`/`PlatformId` pair, but connectors/ imports
// from cli/helpers — importing it here would pull a forbidden edge into
// core/. The 4 platform ids below are therefore a structurally independent
// mirror of that module's `PlatformId` union (same posture as the
// security-class mirror documented in computer-use-contract.ts), not a
// re-export. A future adapter (dilim-3, likely living in connectors/) is
// expected to translate its own `detectPlatform()` result onto these ids
// before calling `negotiateComputerUseCapabilities`.
//
// Tool-requirement mapping is grounded, not invented, where an existing real
// adapter already exists: `screenshot`'s per-platform tool list mirrors
// `src/connectors/capabilities/builtin/screenshot.ts` (grim/scrot/import/
// gnome-screenshot on linux, screencapture on darwin, powershell.exe on
// win32/wsl) — that adapter is already shipped code, not a guess. `click`/
// `type` map to the standard per-OS UI-input-synthesis tool (xdotool on
// linux/X11, osascript/AppleScript System Events on darwin — a real macOS
// builtin, powershell.exe on win32/wsl reusing the exact tool the screenshot
// adapter already spawns there); no adapter for these exists yet, so this is
// documented as a known-tool hypothesis a future adapter would build against,
// not a claim that click/type are implemented. `navigate` requires a browser
// driver bridge (e.g. Playwright/Puppeteer) that does not exist anywhere in
// the codebase — honestly modeled as a constant "not implemented" requirement
// on every platform; a browser binary merely being installed would NOT mean
// deckent can control it, so this deliberately never turns into a tool-probe.

import {
  COMPUTER_USE_ACTION_KINDS,
  resolveComputerUseAvailability,
  type ComputerUseActionKind,
  type ComputerUseConfig,
} from './computer-use-contract.js';

// ─── Platform Identifiers ───────────────────────────────────────────────────

export const COMPUTER_USE_PLATFORMS = ['linux', 'wsl', 'darwin', 'win32'] as const;
/** Structural mirror of connectors/capabilities/platform.ts's `PlatformId` —
 *  see file header for why this is not an import. */
export type ComputerUsePlatform = (typeof COMPUTER_USE_PLATFORMS)[number];

export function isKnownComputerUsePlatform(value: string): value is ComputerUsePlatform {
  return (COMPUTER_USE_PLATFORMS as readonly string[]).includes(value);
}

// ─── Command Prober ─────────────────────────────────────────────────────────

/**
 * Synchronous, injectable `command -v`-style tool-existence check: returns
 * whether `command` is available on the host. Synchronous by construction —
 * this module never spawns a real subprocess itself; a real adapter (dilim-3)
 * supplies its own prober (e.g. a PATH scan or a cached `command -v` shell-out
 * result). No default prober ships here — negotiation without an injected
 * prober would either fabricate an answer or silently spawn, both dishonest.
 */
export type CommandProber = (command: string) => boolean;

// ─── Tool-Requirement Table ─────────────────────────────────────────────────

const NAVIGATE_NOT_IMPLEMENTED_REASON =
  'navigate requires a browser driver bridge (e.g. Playwright/Puppeteer) that is not integrated ' +
  'anywhere in the codebase yet — real browser control is TOOL-CU dilim-3 work, not dilim-2 negotiation';

type ToolRequirement =
  | { readonly kind: 'any-of'; readonly tools: readonly string[] }
  | { readonly kind: 'not-implemented'; readonly reason: string };

const anyOf = (...tools: readonly string[]): ToolRequirement => ({ kind: 'any-of', tools });
const notImplemented = (reason: string): ToolRequirement => ({ kind: 'not-implemented', reason });

const CAPABILITY_TOOLS: Readonly<Record<ComputerUsePlatform, Readonly<Record<ComputerUseActionKind, ToolRequirement>>>> = {
  linux: {
    screenshot: anyOf('grim', 'scrot', 'import', 'gnome-screenshot'),
    click: anyOf('xdotool'),
    type: anyOf('xdotool'),
    navigate: notImplemented(NAVIGATE_NOT_IMPLEMENTED_REASON),
  },
  wsl: {
    screenshot: anyOf('powershell.exe'),
    click: anyOf('powershell.exe'),
    type: anyOf('powershell.exe'),
    navigate: notImplemented(NAVIGATE_NOT_IMPLEMENTED_REASON),
  },
  darwin: {
    screenshot: anyOf('screencapture'),
    click: anyOf('osascript'),
    type: anyOf('osascript'),
    navigate: notImplemented(NAVIGATE_NOT_IMPLEMENTED_REASON),
  },
  win32: {
    screenshot: anyOf('powershell.exe'),
    click: anyOf('powershell.exe'),
    type: anyOf('powershell.exe'),
    navigate: notImplemented(NAVIGATE_NOT_IMPLEMENTED_REASON),
  },
};

// ─── Negotiation ─────────────────────────────────────────────────────────────

export interface ComputerUseCapabilityAvailability {
  available: boolean;
  /** Present whenever `available` is false — always a human-readable reason, never silent. */
  reason?: string;
}

export type ComputerUseCapabilityMatrix = Record<ComputerUseActionKind, ComputerUseCapabilityAvailability>;

function allUnavailable(reason: string): ComputerUseCapabilityMatrix {
  const result = {} as ComputerUseCapabilityMatrix;
  for (const kind of COMPUTER_USE_ACTION_KINDS) {
    result[kind] = { available: false, reason };
  }
  return result;
}

/**
 * Negotiates per-capability availability for `platform`, layering platform
 * tool-detection on top of the dilim-1 config resolver. Never assumes
 * availability: an unknown platform, a disabled flag, or a missing tool all
 * resolve to an honest `unavailable` with a specific reason (Law #2 — every
 * environment fails honestly, never silently).
 *
 * Flag-off short-circuits before any platform/tool logic runs — `prober` is
 * called zero times when `computer_use` is disabled or has no allowlisted
 * capability, matching dilim-1's fail-closed posture.
 */
export function negotiateComputerUseCapabilities(
  platform: string,
  config: ComputerUseConfig | undefined,
  prober: CommandProber,
): ComputerUseCapabilityMatrix {
  const flagResolution = resolveComputerUseAvailability(config);
  if (!flagResolution.available) {
    return allUnavailable(flagResolution.reason ?? 'computer_use unavailable');
  }

  if (!isKnownComputerUsePlatform(platform)) {
    return allUnavailable(
      `unsupported platform '${platform}' — computer-use capability negotiation has no known tool-mapping for this platform`,
    );
  }

  const toolsForPlatform = CAPABILITY_TOOLS[platform];
  const result = {} as ComputerUseCapabilityMatrix;

  for (const kind of COMPUTER_USE_ACTION_KINDS) {
    if (!flagResolution.allowedCapabilities.includes(kind)) {
      result[kind] = { available: false, reason: `'${kind}' is not in the resolved allowed_capabilities allowlist` };
      continue;
    }

    const requirement = toolsForPlatform[kind];
    if (requirement.kind === 'not-implemented') {
      result[kind] = { available: false, reason: requirement.reason };
      continue;
    }

    const foundTool = requirement.tools.find((tool) => prober(tool));
    result[kind] = foundTool
      ? { available: true }
      : {
          available: false,
          reason: `no known tool present for '${kind}' on '${platform}' (checked: ${requirement.tools.join(', ')})`,
        };
  }

  return result;
}
