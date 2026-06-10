// ═══ Structured Event Stream — Re-export Shim ═════════════════════════
// The implementation moved to `core/event-stream.ts` in Sprint 279 (WK-import)
// to remove the ADR-008 core→orchestra reverse-dependency: `core/audit-writer`
// and `core/audit-query` consume writeEvent/readEvents/DeckentEvent, which are
// core-level primitives that should not live under orchestra/.
//
// This file remains as a backward-compatible shim so every existing
// orchestra-side importer (worker, auditor, alert-emitter, brain, cli) and the
// large set of `tests/orchestra/*` importers keep working unchanged. All
// runtime values AND TypeScript types are re-exported — there is a single
// module instance, so module-level state (e.g. the DEPENDENCY_BLOCKED dedupe
// cache) stays shared across both import paths. Behavior is byte-for-byte
// identical to the pre-move module.
//
// New code should import from `../core/event-stream.js` directly.

export * from '../core/event-stream.js';
