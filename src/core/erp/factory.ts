// ═══ ERP binding factory — config → driver → connector ════════════════════════
//
// The missing wire between the (already-built, tested) ErpDriver implementations
// and the live capability path. `buildErpConnectorFromConfig` turns a declarative,
// secret-free `ErpRuntimeConfig` into a ready `ErpConnector` (driver + entity
// allow-list), which process-runtime / autonomous pass to
// createAuditedCapabilityRegistry so `erp.read` actually round-trips.
//
// Opt-in + backward-safe: `enabled` falsy / config absent ⇒ returns `undefined`
// ⇒ no erp.read handler is installed (the registry behaves exactly as before).
//
// Secret hygiene: connection IDENTIFIERS live in config; the bearer token / api
// key / basic password is read ONLY from an environment variable (named by
// `tokenEnv`, default `DECKENT_ERP_TOKEN`) — a credential never lands in
// config.json (ADR-014 secret-file principle; aligns with ENT-4 vault).
//
// CORE-W5: IFS is the first real driver; odoo/sap/dynamics are reference impls
// behind the same seam. ADR-008: core/erp imports core/erp + core only.

import { createErpConnector, type ErpConnector, type ErpDriver, type ErpRow } from './connector.js';
import { createIfsErpDriver } from './ifs/driver.js';
import { createOdooErpDriver } from './odoo/driver.js';
import { createSapErpDriver } from './sap/driver.js';
import { createDynamicsErpDriver } from './dynamics/driver.js';
import { createInMemoryErpDriver } from './handler.js';
import { DeckentError } from '../errors.js';

// ─── Declarative config (secret-free) ─────────────────────────────────────────

/** Allow-listed entity declaration — only listed fields are selectable/filterable. */
export interface ErpEntityConfig {
  fields: string[];
  /** Physical source (table/model/entity set). Defaults to the entity name. */
  source?: string;
  /** Per-entity row ceiling (bounded by the connector `maxLimit`). */
  maxLimit?: number;
}

/** The vendors a runtime connector can be built for. */
export type ErpDriverKind = 'ifs' | 'odoo' | 'sap' | 'dynamics' | 'in-memory';

/**
 * Declarative ERP runtime config (lives in `.deckent/config.json` under `erp`).
 * Contains ONLY non-secret connection identifiers — the credential is read from
 * `tokenEnv` at build time, never stored here.
 */
export interface ErpRuntimeConfig {
  /** Opt-in. Falsy ⇒ no erp.read handler is installed (backward-safe). */
  enabled?: boolean;
  driver: ErpDriverKind;
  /** Env var holding the bearer token / api key / basic password. Default 'DECKENT_ERP_TOKEN'. */
  tokenEnv?: string;
  /** SAP only: 'basic' (username + env password) or 'bearer' (env token). Default 'bearer'. */
  authKind?: 'basic' | 'bearer';
  /** SAP basic-auth username (the password comes from `tokenEnv`). */
  username?: string;
  /** ifs / dynamics / sap service root (http/https). */
  baseUrl?: string;
  /** odoo JSON-RPC endpoint. */
  url?: string;
  /** ifs projection name. */
  projection?: string;
  /** odoo database name. */
  db?: string;
  /** odoo authenticated user id. */
  uid?: number;
  /** ifs / dynamics API version segment. */
  apiVersion?: string;
  /** Logical entity → physical model/entity-set (driver-specific). */
  entityModelMap?: Record<string, string>;
  /** Entity allow-list (entity → declared fields). At least one entity is required. */
  entities: Record<string, ErpEntityConfig>;
  /** Connector-level row ceiling for ANY query. */
  maxLimit?: number;
  /** Default row cap when a query omits one. */
  defaultLimit?: number;
  /** driver:'in-memory' only — seed tables keyed by physical source. */
  memoryTables?: Record<string, ErpRow[]>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function required(value: string | undefined, field: string, driver: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new DeckentError('DECKENT_E004', `erp config: driver '${driver}' requires a non-empty '${field}'`);
  }
  return value;
}

function readSecret(cfg: ErpRuntimeConfig, env: NodeJS.ProcessEnv): string {
  const name = cfg.tokenEnv ?? 'DECKENT_ERP_TOKEN';
  const value = env[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new DeckentError('DECKENT_E004',
      `erp config: driver '${cfg.driver}' needs a credential in env '${name}' (secrets never live in config.json)`,
    );
  }
  return value;
}

/** Build the concrete {@link ErpDriver} for `cfg.driver`, reading the secret from env. */
function buildDriver(cfg: ErpRuntimeConfig, env: NodeJS.ProcessEnv): ErpDriver {
  switch (cfg.driver) {
    case 'in-memory':
      return createInMemoryErpDriver(cfg.memoryTables ?? {});
    case 'ifs':
      return createIfsErpDriver({
        baseUrl: required(cfg.baseUrl, 'baseUrl', 'ifs'),
        projection: required(cfg.projection, 'projection', 'ifs'),
        auth: { kind: 'bearer', token: readSecret(cfg, env) },
        ...(cfg.apiVersion ? { apiVersion: cfg.apiVersion } : {}),
        ...(cfg.entityModelMap ? { entityModelMap: cfg.entityModelMap } : {}),
      });
    case 'dynamics':
      return createDynamicsErpDriver({
        baseUrl: required(cfg.baseUrl, 'baseUrl', 'dynamics'),
        auth: { kind: 'bearer', token: readSecret(cfg, env) },
        ...(cfg.apiVersion ? { apiVersion: cfg.apiVersion } : {}),
        ...(cfg.entityModelMap ? { entityModelMap: cfg.entityModelMap } : {}),
      });
    case 'odoo':
      return createOdooErpDriver({
        url: required(cfg.url, 'url', 'odoo'),
        db: required(cfg.db, 'db', 'odoo'),
        uid: typeof cfg.uid === 'number' ? cfg.uid : (() => {
          throw new DeckentError('DECKENT_E004', "erp config: driver 'odoo' requires a numeric 'uid'");
        })(),
        apiKey: readSecret(cfg, env),
        ...(cfg.entityModelMap ? { entityModelMap: cfg.entityModelMap } : {}),
      });
    case 'sap': {
      const secret = readSecret(cfg, env);
      const auth = cfg.authKind === 'basic'
        ? { kind: 'basic' as const, username: required(cfg.username, 'username', 'sap'), password: secret }
        : { kind: 'bearer' as const, token: secret };
      return createSapErpDriver({
        baseUrl: required(cfg.baseUrl, 'baseUrl', 'sap'),
        auth,
        ...(cfg.entityModelMap ? { entityModelMap: cfg.entityModelMap } : {}),
      });
    }
    default:
      throw new DeckentError('DECKENT_E004', `erp config: unknown driver '${String(cfg.driver)}'`);
  }
}

// ─── Public factory ─────────────────────────────────────────────────────────

/**
 * Build a live {@link ErpConnector} from declarative config + env, or `undefined`
 * when ERP is not enabled (opt-in / backward-safe). The returned connector has
 * the chosen driver wired and every declared entity registered (the allow-list);
 * a caller passes it to createAuditedCapabilityRegistry as `{ erp: { connector } }`.
 *
 * Throws (DECKENT_E004) on a misconfiguration that IS opted-in — a missing
 * credential, a missing required connection field, or no entities — so a broken
 * ERP setup fails loudly at startup rather than silently disabling erp.read.
 */
export function buildErpConnectorFromConfig(
  cfg: ErpRuntimeConfig | undefined,
  env: NodeJS.ProcessEnv = process.env,
): ErpConnector | undefined {
  if (!cfg || !cfg.enabled) return undefined;

  const entries = Object.entries(cfg.entities ?? {});
  if (entries.length === 0) {
    throw new DeckentError('DECKENT_E004', 'erp config: at least one entity must be declared (the read allow-list)');
  }

  const driver = buildDriver(cfg, env);
  const connector = createErpConnector({
    driver,
    ...(typeof cfg.maxLimit === 'number' ? { maxLimit: cfg.maxLimit } : {}),
    ...(typeof cfg.defaultLimit === 'number' ? { defaultLimit: cfg.defaultLimit } : {}),
  });
  for (const [name, e] of entries) {
    connector.registerEntity(name, {
      fields: e.fields,
      ...(e.source ? { source: e.source } : {}),
      ...(typeof e.maxLimit === 'number' ? { maxLimit: e.maxLimit } : {}),
    });
  }
  return connector;
}
