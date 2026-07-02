// ─── Provider-CLI Discovery (ONB-DISCOVERY, Sprint 356 Task 356-007) ───────
//
// PATH-level "which providers are installed?" discovery — distinct from
// `detectAvailableProviders()` (provider.ts), which also folds in
// env-var/API-key auth heuristics per provider. This module answers a
// narrower question — "is the CLI on PATH, what version, and (only if a
// caller supplies an auth probe) is it logged in?" — in the exact shape the
// `/connect` wizard's `ConnectProviderDetection` (cli/helpers/connect-wizard.ts)
// already uses: a `name`/version/`authState` tuple per CLI-backed provider.
//
// Reuse, not reinvention (disk-verified provider.ts):
//   - default version probe → `detectCliVersion` (spawnSync `<cli> --version`,
//     cross-platform via `buildCliInvocation`).
//   - version parsing → `parseSemverFromOutput` (extracts the first
//     `\d+\.\d+(\.\d+)?` substring from arbitrary CLI banner text).
//
// Every probe is injectable — `discoverProviders()` never touches
// `child_process` directly; the real spawnSync only happens inside the
// (already-tested) `detectCliVersion` default. Tests inject fake probes so no
// real subprocess is ever spawned here.
//
// `authState` defaults to `'unknown'` when no auth probe is supplied — this
// module deliberately does NOT wire a real login-state probe by default
// (that wiring, `probeProviderAuth`, is the `/connect` wizard's concern via
// `createDefaultConnectProbes`). A caller that wants real auth state passes
// its own `auth` probe.

import { detectCliVersion, parseSemverFromOutput } from './provider.js';
import type { AuthProbeProvider, AuthProbeState } from './provider-auth-probe.js';

/**
 * The three CLI-backed providers this module discovers — reuses
 * {@link AuthProbeProvider} rather than redefining the same
 * `'claude' | 'codex' | 'gemini'` tuple a third time (it already backs both
 * `provider-auth-probe.ts` and, transitively, the `/connect` wizard's
 * `ConnectProviderName`).
 */
export type DiscoverableProviderName = AuthProbeProvider;

/** Fixed iteration order — every discovery result array is built from this tuple. */
export const DISCOVERABLE_PROVIDERS: readonly DiscoverableProviderName[] = ['claude', 'codex', 'gemini'];

/** One provider's PATH-discovery snapshot. */
export interface ProviderDiscoveryResult {
  name: DiscoverableProviderName;
  /** CLI binary found on PATH (a successful `<cli> --version` invocation). */
  present: boolean;
  /** Parsed semver when present (falls back to the raw probe output if no semver substring is found). */
  version?: string;
  /** Real login state — `'unknown'` whenever no `auth` probe is supplied (see module doc). */
  authState: AuthProbeState;
}

/**
 * Raw CLI version probe — same contract as {@link detectCliVersion}: returns
 * the trimmed stdout of `<cli> --version` (unparsed), or `undefined` when the
 * CLI is absent/errored. Kept raw (not pre-parsed) so `discoverProviders`
 * exercises {@link parseSemverFromOutput} uniformly regardless of the probe source.
 */
export type ProviderVersionProbe = (name: DiscoverableProviderName) => string | undefined;

/** Real login-state probe — mirrors `probeProviderAuth`'s async, per-provider shape. */
export type ProviderAuthStateProbe = (name: DiscoverableProviderName) => Promise<AuthProbeState>;

/** Injectable seam bag for {@link discoverProviders}. Both probes are optional. */
export interface DiscoverProvidersProbes {
  /** Defaults to `(name) => detectCliVersion(name)` — real PATH probe via provider.ts. */
  version?: ProviderVersionProbe;
  /** Omitted → every result's `authState` is `'unknown'` (no auth probing by default). */
  auth?: ProviderAuthStateProbe;
}

const defaultVersionProbe: ProviderVersionProbe = (name) => detectCliVersion(name);

/**
 * Discover the three CLI-backed providers over PATH.
 *
 * For each of {@link DISCOVERABLE_PROVIDERS}: runs `probes.version` (default:
 * real `detectCliVersion`) to determine `present`/raw version output, then
 * normalizes that output through `parseSemverFromOutput` (falling back to the
 * raw string when no semver substring is found — a non-numeric version tag is
 * still more useful than dropping it). `authState` is resolved via
 * `probes.auth` when supplied, else left `'unknown'`.
 *
 * @param probes  Injectable version/auth probes (see {@link DiscoverProvidersProbes}).
 *                Omitted → real PATH probing for version, `'unknown'` auth for all.
 */
export async function discoverProviders(
  probes: DiscoverProvidersProbes = {},
): Promise<ProviderDiscoveryResult[]> {
  const versionProbe = probes.version ?? defaultVersionProbe;
  const authProbe = probes.auth;

  const results: ProviderDiscoveryResult[] = [];
  for (const name of DISCOVERABLE_PROVIDERS) {
    const raw = versionProbe(name);
    const present = raw !== undefined;
    const version = present ? (parseSemverFromOutput(raw) ?? raw) : undefined;
    const authState: AuthProbeState = authProbe ? await authProbe(name) : 'unknown';
    results.push({ name, present, version, authState });
  }
  return results;
}
