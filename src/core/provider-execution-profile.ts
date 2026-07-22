/** Economic provider metadata used by every execution-admission surface. */
export type ProviderExecutionCostClass = 'remote' | 'local';

/**
 * Built-in provider economics are catalog data, not routing heuristics.
 * Providers absent from this catalog are remote by default; a registered
 * adapter may explicitly declare otherwise.
 */
const BUILTIN_EXECUTION_COST_CLASS: Readonly<Record<string, ProviderExecutionCostClass>> = Object.freeze({
  ollama: 'local',
});

/**
 * Resolve one provider's economic class from the canonical built-in catalog
 * and, when present, its registered adapter declaration. Disagreement is an
 * authority conflict and must fail before a budget exemption is granted.
 */
export function resolveProviderExecutionCostClass(
  provider: string,
  adapterDeclaration?: ProviderExecutionCostClass,
): ProviderExecutionCostClass {
  const catalogDeclaration = BUILTIN_EXECUTION_COST_CLASS[provider];
  if (
    catalogDeclaration !== undefined
    && adapterDeclaration !== undefined
    && catalogDeclaration !== adapterDeclaration
  ) {
    throw new Error(
      `Provider execution-cost authority conflict for "${provider}": catalog=${catalogDeclaration}, adapter=${adapterDeclaration}`,
    );
  }
  return adapterDeclaration ?? catalogDeclaration ?? 'remote';
}
