// ─── Barrel Re-export ───────────────────────────────────────────────────────
// types.ts has been split into domain-specific files for maintainability.
// All exports are re-exported here for backward compatibility.
// Consumers can continue to import from './types.js' without changes.
//
// Sprint 179 W1-1: DebtItem extended with `class` + `originScope` (definitions
// live in sprint-types.ts; re-exported below). See sprint-planner.ts
// injectCriticalDebtTasks() for the auto-debt scope-inheritance + skip logic.

export * from './task-types.js';
export * from './config-types.js';
export * from './monitoring-types.js';
export * from './sprint-types.js';
export * from './invocation-receipt.js';

// ─── Ollama Provider Types (Sprint 190 W-F F-11) ────────────────────────────
// Additive type surface for the local-LLM provider. Full ProviderName widening
// lives in task-types.ts (out of scope for task 190-009 — tracked as tech debt);
// these aliases unblock the adapter, registry, and config layers that DO live
// in scoped files.

/** Ollama-served model identifiers (curated subset, registry holds full apiId). */
export type OllamaModel = 'qwen-coder-32b' | 'qwen-coder-7b' | 'llama-3-8b' | 'llama-3.2-3b';

/** Extended provider name — includes local Ollama and the OpenRouter HTTP
 *  gateway. Hand-mirrored with `ProviderName` (core/task-types.ts) and
 *  `RegistryProviderName` (core/model-registry-types.ts). */
export type ProviderNameExt = 'claude' | 'codex' | 'gemini' | 'ollama' | 'openrouter';

/** Runtime list of every provider Deckent knows about, including local Ollama
 *  and OpenRouter (OPENROUTER-PROVIDER, row 477). */
export const ALL_PROVIDER_NAMES: readonly ProviderNameExt[] = [
  'claude',
  'codex',
  'gemini',
  'ollama',
  'openrouter',
] as const;

// ─── Worker Output Contract — Result spine (Sprint 326 326-001) ──────────────
// ADDITIVE single-source re-export of the versioned, Zod-validated result contract
// (spec §1.2). `TaskResultV1` is the canonical worker-result shape; `validateTaskResult`
// is the non-throwing validator. This is intentionally NOT aliased to the legacy
// `TaskResult` interface (task-types.ts) — that interface has a different shape
// (filesChanged: string[], linesAdded, coverage) and dozens of live consumers, so
// aliasing would shadow it and break tsc. New consumers (Phase 1.2+) import TaskResultV1.
export {
  taskResultSchema,
  validateTaskResult,
  TASK_RESULT_SCHEMA_VERSION,
  type TaskResultV1,
  type ValidateTaskResult,
  type ValidateTaskResultOk,
  type ValidateTaskResultErr,
} from './task-result-schema.js';

// ─── Worker Comms — TaskResult augmentation (Sprint 278 COMM-1) ──────────────
// Extends TaskResult (defined in task-types.ts) with optional worker-to-worker
// communication fields: sharedNotes (for SharedMemory writes) and handoffNotes
// (free-text message to downstream workers via HandoffProtocol). Both fields are
// opt-in and additive — existing .result files without them remain valid.
declare module './task-types.js' {
  interface TaskResult {
    /** Structural notes written to SharedMemory when worker_comms.enabled (Sprint 278 COMM-1). */
    sharedNotes?: Array<{ key: string; value: string }>;
    /** Free-text message to downstream dependent workers via HandoffProtocol (Sprint 278 COMM-1). */
    handoffNotes?: string;
  }
}
