// ═══ ERP connector convenience module — ERP-1 read-side wire ════════════════
//
// Provides two public surfaces over the existing erp/ subsystem:
//
//   buildErpConnectorFromDeck   — deck-aware factory: loads ERP credentials
//     from the project's `.deck` secret file (ADR-014), merges them over the
//     caller-supplied env, then delegates to `buildErpConnectorFromConfig`.
//     Secret never lands in config.json; the `.deck` file is the only source.
//
//   installErpHandlerWithApprovalGate — installs `erp.read` on a registry
//     with an optional synchronous/async approval gate. When the gate is
//     provided, every invocation is pre-checked before forwarding to the
//     connector driver (risk-tagged, medium-risk per work-model.ts). Gate
//     absent → plain `installErpHandler` (exact backward-safe behaviour).
//
// ADR-008: core-only imports. ADR-010: no new runtime deps. ADR-014: secrets
// read from .deck, never stored in config. Additive, flag-gated (approval gate
// is opt-in default-off).

import { loadDeckSecrets } from './deck-file.js';
import { buildErpConnectorFromConfig } from './erp/factory.js';
import type { ErpRuntimeConfig } from './erp/factory.js';
import type { ErpConnector } from './erp/connector.js';
import { createErpReadHandler, installErpHandler } from './erp/handler.js';
import type { ErpReadHandlerOptions } from './erp/handler.js';
import type { CapabilityRegistry, InvocationContext } from './capability-broker.js';
import type { Capability, ActorContext } from './work-model.js';
import { DeckentError } from './errors.js';

// ─── Deck-aware connector factory ────────────────────────────────────────────

/**
 * Build a live {@link ErpConnector} from declarative config with credentials
 * loaded from the project's `.deck` file (ADR-014 secret hygiene). The `.deck`
 * secrets are merged over `baseEnv` in a fresh Record — `process.env` is never
 * mutated. The result is passed to `buildErpConnectorFromConfig`.
 *
 * Returns `undefined` when `cfg` is absent or `cfg.enabled` is falsy (backward-safe).
 * Throws (DECKENT_E004) on an opted-in misconfiguration (missing credential, etc.).
 */
export function buildErpConnectorFromDeck(
  projectRoot: string,
  cfg: ErpRuntimeConfig | undefined,
  baseEnv: NodeJS.ProcessEnv = process.env,
): ErpConnector | undefined {
  if (!cfg?.enabled) return undefined;
  const deckSecrets = loadDeckSecrets(projectRoot);
  const mergedEnv: NodeJS.ProcessEnv = { ...baseEnv, ...deckSecrets };
  return buildErpConnectorFromConfig(cfg, mergedEnv);
}

// ─── Approval-gate type ────────────────────────────────────────────────────

/**
 * Synchronous or async gate checked before every `erp.read` invocation.
 * Return `true` to allow; `false` (or throw) to deny. The gate receives the
 * raw entity name and the invocation actor for RBAC/policy decisions.
 *
 * Tagged medium-risk by work-model.ts (`erp-read` ∈ MEDIUM_RISK_CAPABILITIES).
 * A gate throwing is treated as denial (fail-closed).
 */
export type ErpApprovalGateFn = (
  entity: string,
  actor: ActorContext | undefined,
) => boolean | Promise<boolean>;

// ─── Approval-gated handler installer ─────────────────────────────────────────

/**
 * Install the `erp.read` capability handler on `registry`.
 *
 * - `gate` absent → delegates to {@link installErpHandler} unchanged (backward-safe).
 * - `gate` provided → wraps the base handler: every invocation calls the gate
 *   BEFORE forwarding to the connector driver. Gate denial raises DECKENT_E039.
 *   This implements the risk-tagged approval pattern for `erp.read` operations.
 */
export function installErpHandlerWithApprovalGate(
  registry: CapabilityRegistry,
  opts: ErpReadHandlerOptions,
  gate?: ErpApprovalGateFn,
): void {
  if (!gate) {
    installErpHandler(registry, opts);
    return;
  }

  const baseHandler = createErpReadHandler(opts);

  registry.register('erp.read', {
    requiredCapability: 'erp.read' as Capability,
    description: 'Approval-gated erp.read — risk-tagged medium-risk, gate checked before dispatch.',
    invoke: async (args: Record<string, unknown>, ctx: InvocationContext) => {
      const entity = typeof args.entity === 'string' ? args.entity : '';
      let approved: boolean;
      try {
        approved = await gate(entity, ctx.actor);
      } catch {
        approved = false;
      }
      if (!approved) {
        throw new DeckentError(
          'DECKENT_E039',
          `erp.read denied by approval gate for entity '${entity}'`,
        );
      }
      return baseHandler.invoke(args, ctx);
    },
  });
}
