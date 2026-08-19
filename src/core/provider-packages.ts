// ─── Provider Packages — SSOT for npm-installable provider CLI names ─────
// Closes ADR-G-030's honest-scope gap (row 207, PKG-NAME-SSOT): the install-
// EXECUTION package mapping was already centralized in provisioner.ts
// (planInstall/NPM_PKG), but the install-HINT strings shown across provider
// diagnostics, doctor, onboard, chat, and error messages were duplicated as
// raw string literals in 13+ places. A vendor rename (e.g. `claude-code` →
// a new package name) required editing every one of those sites by hand.
//
// This module is the single source of truth for {npmPkg, binName,
// installHint} per provider CLI. Callers that currently hardcode one of
// these values should import from here instead (see docs/adr/adr-g-030
// for the list of known call-sites — conversion tracked as a follow-up,
// this task's write scope is limited to this module + its test).

export type CliProviderId = 'claude' | 'codex' | 'gemini';

export interface ProviderPackageInfo {
  /** npm registry package name, installed globally (`npm install -g <npmPkg>`). */
  readonly npmPkg: string;
  /** Executable name on PATH once installed (used by spawnSync/spawn probes). */
  readonly binName: string;
  /** Canonical install command — derived from npmPkg, never a separate literal. */
  readonly installHint: string;
}

function formatInstallHint(npmPkg: string): string {
  return `npm install -g ${npmPkg}`;
}

function definePackage(npmPkg: string, binName: string): ProviderPackageInfo {
  return Object.freeze({ npmPkg, binName, installHint: formatInstallHint(npmPkg) });
}

/**
 * Single source of truth for npm-installable provider CLI package identity.
 * Values MUST match the executables spawned by src/providers/{claude,codex,gemini}.ts
 * (`spawnSync(binName, ['--version'], ...)`) and the npm packages published by each
 * vendor. Renaming a vendor package is a one-line change here.
 */
export const PROVIDER_PACKAGES: Readonly<Record<CliProviderId, ProviderPackageInfo>> = Object.freeze({
  claude: definePackage('@anthropic-ai/claude-code', 'claude'),
  codex: definePackage('@openai/codex', 'codex'),
  gemini: definePackage('@google/gemini-cli', 'gemini'),
});

const CLI_PROVIDER_IDS: readonly CliProviderId[] = Object.freeze(
  Object.keys(PROVIDER_PACKAGES) as CliProviderId[],
);

/** Type guard — narrows an arbitrary string (e.g. a ToolId or provider name) to CliProviderId. */
export function isCliProviderId(value: string): value is CliProviderId {
  return (CLI_PROVIDER_IDS as readonly string[]).includes(value);
}

/** Look up package identity for a known CLI provider. */
export function getProviderPackage(id: CliProviderId): ProviderPackageInfo {
  return PROVIDER_PACKAGES[id];
}

// ─── Binary-only provider CLIs (vendor installer, never npm) ─────────────
//
// PROVIDER_PACKAGES above is — by name, by doc and by its own test invariant
// (`installHint === 'npm install -g ' + npmPkg`) — the SSOT for CLIs published
// on the npm registry. Some vendor CLIs are simply not distributed there, so
// forcing them into that record would require either inventing an npm name
// that does not exist or breaking the derived-installHint invariant. Both are
// dishonest, so binary-only CLIs get their own explicit registry and the two
// are read through one accessor ({@link getProviderCliInfo}).

/** Provider CLIs distributed ONLY as a vendor binary (no npm package). */
export type BinaryOnlyProviderId = 'cursor';

export interface BinaryOnlyProviderInfo {
  /** Never published on npm — `null` is the honest value, not a placeholder name. */
  readonly npmPkg: null;
  /** Executable name on PATH. NOTE: cursor's CLI binary is `cursor-agent`; the
   *  bare `cursor` name belongs to the editor/IDE `detected_env` namespace. */
  readonly binName: string;
  /** Vendor-installer pointer — never an `npm install` line. */
  readonly installHint: string;
}

/**
 * Single source of truth for provider CLIs that ship outside npm. Values MUST
 * match the executable spawned by the matching provider adapter.
 */
export const BINARY_ONLY_PROVIDER_PACKAGES: Readonly<Record<BinaryOnlyProviderId, BinaryOnlyProviderInfo>> =
  Object.freeze({
    cursor: Object.freeze({
      npmPkg: null,
      binName: 'cursor-agent',
      installHint: 'https://cursor.com/cli — official Cursor CLI installer, not published on npm',
    }),
  });

/** Every CLI-backed provider id — npm-published or vendor-binary. */
export type ProviderCliId = CliProviderId | BinaryOnlyProviderId;

const BINARY_ONLY_PROVIDER_IDS: readonly BinaryOnlyProviderId[] = Object.freeze(
  Object.keys(BINARY_ONLY_PROVIDER_PACKAGES) as BinaryOnlyProviderId[],
);

/** Type guard — narrows an arbitrary string to a binary-only (non-npm) provider CLI id. */
export function isBinaryOnlyProviderId(value: string): value is BinaryOnlyProviderId {
  return (BINARY_ONLY_PROVIDER_IDS as readonly string[]).includes(value);
}

/**
 * Unified CLI identity lookup across both registries — the single place a
 * caller resolves "what binary do I spawn / how is this CLI installed?" for a
 * provider, without having to know whether it comes from npm.
 */
export function getProviderCliInfo(id: ProviderCliId): ProviderPackageInfo | BinaryOnlyProviderInfo {
  return isBinaryOnlyProviderId(id) ? BINARY_ONLY_PROVIDER_PACKAGES[id] : PROVIDER_PACKAGES[id];
}
