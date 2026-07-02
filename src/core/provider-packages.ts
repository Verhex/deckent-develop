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
