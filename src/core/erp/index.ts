// ═══ ERP module — single public surface ══════════════════════════════════════
//
// The ERP capability subsystem as one cohesive, separable module (a step toward
// the planned deckent-solo / deckent-enterprise modular split — MASTER-PLAN
// MOD-SPLIT; ERP is an enterprise-layer concern). Stays under core/ so the
// dependency direction is core → core only (ADR-008); the future enterprise-layer
// extraction moves this whole folder as a unit behind this single index.
//
// Layout:
//   connector.ts       — the SSOT compiler + allow-list (ERP-agnostic infra)
//   handler.ts         — the erp.read capability bridge + in-memory reference driver
//   factory.ts         — config → driver+connector binding (driver-agnostic)
//   <vendor>/driver.ts — one concrete ErpDriver per vendor (each its own component)
//
// CORE-W5 (MASTER-PLAN): IFS is the FIRST real consumer of the ErpDriver seam;
// odoo/sap/dynamics are reference implementations behind the same seam.

// ─── SSOT connector + types ───────────────────────────────────────────────────
export {
  ErpConnector,
  createErpConnector,
  ErpQueryError,
} from './connector.js';
export type {
  ErpConnectorOptions,
  ErpDriver,
  ErpQuerySpec,
  ErpResultSet,
  ErpFilter,
  ErpFilterOp,
  ErpRow,
  ErpScalar,
  EntitySchema,
  CompiledQuery,
  CompiledPredicate,
  ErpErrorCode,
} from './connector.js';

// ─── Capability bridge + reference driver ─────────────────────────────────────
export {
  createErpReadHandler,
  installErpHandler,
  createInMemoryErpDriver,
} from './handler.js';
export type { ErpReadHandlerOptions } from './handler.js';

// ─── Concrete vendor drivers (each a separate component) ──────────────────────
export { createIfsErpDriver } from './ifs/driver.js';
export type { IfsErpDriverOptions, IfsFetchLike } from './ifs/driver.js';
export { createOdooErpDriver } from './odoo/driver.js';
export type { OdooErpDriverOptions, OdooFetchLike } from './odoo/driver.js';
export { createSapErpDriver } from './sap/driver.js';
export type { SapErpDriverOptions } from './sap/driver.js';
export { createDynamicsErpDriver } from './dynamics/driver.js';
export type { DynamicsErpDriverOptions, DynamicsFetchLike } from './dynamics/driver.js';
