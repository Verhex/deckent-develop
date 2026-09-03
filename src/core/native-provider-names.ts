// src/core/native-provider-names.ts
// ═══ TERMINAL-PROVIDER-VOCAB-001 — the native transport names (SSOT) ═══
//
// The providers whose native tool-use transport exists (codex / gemini /
// cursor are subscription-CLI providers and stay orchestrator-side). Lives
// in core so config validation (`native_provider`) and the REPL's transport
// resolver (src/cli/repl/native-transport.ts re-exports it) share ONE array —
// the picker's "save as default" can never write a value validation refuses.
//
// The transport KIND beside each name is the "via" fact the picker shows so
// every surface speaks one vocabulary: the row is labeled by its registry
// owner, the transport is a fact.

// Leaf module on purpose (no imports): config.ts, the REPL and the auth probe
// all depend on it, so it must never pull the provider graph back in.

export const NATIVE_PROVIDER_NAMES = ['claude', 'openai', 'ollama', 'deepseek', 'qwen', 'glm', 'local-llm'] as const;

/** The subscription-CLI providers the auth probe knows — reached "via host
 *  CLI" on the host surfaces. provider-auth-probe.ts derives its
 *  AuthProbeProvider type from this array (one source). */
export const AUTH_PROBE_PROVIDERS = ['claude', 'codex', 'gemini', 'cursor'] as const;

export type NativeProviderName = (typeof NATIVE_PROVIDER_NAMES)[number];

/** How a provider is reached from the Terminal. */
export type ProviderVia = 'host-cli' | 'api' | 'local';

const NATIVE_PROVIDER_VIA: Readonly<Record<NativeProviderName, ProviderVia>> = {
  claude: 'api',
  openai: 'api',
  ollama: 'local',
  deepseek: 'api',
  qwen: 'api',
  glm: 'api',
  'local-llm': 'local',
};

export function isNativeProviderName(value: unknown): value is NativeProviderName {
  return typeof value === 'string' && (NATIVE_PROVIDER_NAMES as readonly string[]).includes(value);
}

/** The via kind of a native transport (unknown names count as API). */
export function nativeProviderVia(provider: string): ProviderVia {
  return isNativeProviderName(provider) ? NATIVE_PROVIDER_VIA[provider] : 'api';
}

/** The via kind on the host-CLI surfaces (readline / legacy proxy): the
 *  subscription-CLI providers are reached through their host CLI, local
 *  transports stay local, everything else is an API. */
export function hostProviderVia(provider: string): ProviderVia {
  if ((AUTH_PROBE_PROVIDERS as readonly string[]).includes(provider)) return 'host-cli';
  return nativeProviderVia(provider);
}
