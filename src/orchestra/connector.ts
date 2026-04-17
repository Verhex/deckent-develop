// ═══ orchestra/connector.ts — Backward Compatibility Re-export ═══════════════
//
// Connector class and HealthCheckResult interface have been extracted to
// core/session-interface.ts to break the core→orchestra circular dependency
// (ADR-008 Cycle 2). This module re-exports everything for backward compat.

export { Connector, type HealthCheckResult } from '../core/session-interface.js';
