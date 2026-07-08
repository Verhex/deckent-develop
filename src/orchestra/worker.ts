// ═══ orchestra/worker.ts — WorkerApprovalGate re-export shim (born-573 REDO, task 382-001) ═
//
// Sprint-1 (380-003/born-573) implemented the real WorkerApprovalGate
// instantiation logic in THIS file — but the assigned scope.filesWrite named
// 'src/orchestra/worker.ts', a path that did not exist anywhere in the repo
// or git history at that assignment time (worktree-untracked only), so the
// worker created a brand-new file here instead of touching the real,
// always-imported worker-lifecycle module. Nothing ever imported it in
// production (audit: only its own test did) — the classic orphan pattern.
//
// The canonical implementation now lives in `src/agents/worker.ts` (689
// lines pre-existing, imported by http-agentic-worker.ts,
// agentic-worker-entry.ts, cli/, spawn-backend-docker.ts, debt-manager.ts,
// sprint-lifecycle.ts, sprint-spawner.ts, and more) — the file every real
// worker entrypoint actually depends on. This file is kept only as a thin
// re-export so `tests/orchestra/worker-approval-gate-wire.test.ts` (which
// still imports these 4 names from here) keeps resolving a SINGLE canonical
// definition rather than a second, duplicated copy — the same
// re-export-after-relocation pattern ADR-D-004 already sanctions for
// `orchestra/event-stream.ts` (D004-E2, `export * from '../core/event-stream.js'`
// after the Sprint-279 move into `core/`). No independent
// ApprovalBroker/WorkerApprovalGate construction remains in this file.
//
// orchestra/ -> agents/worker.ts is an established, existing import
// direction in this codebase (spawn-backend-docker.ts, debt-manager.ts,
// sprint-lifecycle.ts, sprint-spawner.ts already do this) — introduces no
// new cycle, since agents/worker.ts's own import graph never reaches back
// to this file.

export {
  RISKY_APPROVAL_SCOPES,
  classifyRiskyWorkerCommand,
  createOrchestraWorkerApprovalGate,
  guardRiskyWorkerAction,
} from '../agents/worker.js';
