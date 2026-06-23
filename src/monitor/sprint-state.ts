// ═══ Sprint State — getCurrentSprintId re-export ══════════════════════
// R4-SPRINTID (Sprint 318): the `active→state` resolution that used to live
// here is now the CANONICAL implementation in `core/event-stream.ts` (core is
// the base layer — monitor/cli/orchestra all import from it under ADR-008).
// This module re-exports it so existing `monitor/sprint-state.js` importers
// (status/output CLI, MCP status/watch, connectors) keep working unchanged.
// Behavior is byte-for-byte the same active→state fallback this module had.

export { getCurrentSprintId } from '../core/event-stream.js';
