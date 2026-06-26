# Worker Output Contract & Observability — Implementation Plan

> **For agentic workers:** This plan runs **phase-by-phase as deckent dogfood sprints** (the user's
> execution model). Each PHASE = one deckent sprint; each TASK = one distinct-file worker-task. Tasks
> give the exact **interface/contract + faithful-test assertion + goNogo**; the worker writes the
> implementation body. Steps use `- [ ]` for tracking.

**Goal:** Make every worker `.result` and `.log` a strict, complete, provider-agnostic,
orchestrator-owned, validated, archived, live-streamable artifact.

**Architecture:** The orchestrator assembles the canonical result from authoritative sources (git
for files/lines, provider-adapter for tokens, cost-calculator for cost, timestamps for duration); the
worker contributes only subjective signals. Worker output is captured as a complete structured-JSONL
log, streamed live and archived. An event-driven Auditor validates both artifacts with a
finding-lifecycle. A sprint-end reconciler compares estimate vs actual.

**Tech Stack:** TypeScript/ESM (Node24, `.js` imports), Zod (already a dep), vitest. Spec:
`docs/superpowers/specs/2026-06-26-worker-output-contract-observability-design.md`.

## Global Constraints
- **Provider-agnostic (Law #2):** every path works for claude · codex · gemini · ollama · vLLM ·
  openai-compatible (DeepSeek/Qwen) · local. **No Claude-CLI dependency** anywhere.
- **Orchestrator/adapter-owned:** the worker never self-counts tokens and never authors measurable fields.
- **Flag/back-compat:** the new schema is **additive + versioned** (`schemaVersion`); existing readers
  keep working; behaviour byte-identical until a field is consumed.
- ESM `.js`. No `process.cwd()` (use `join(root, …)`). Hermetic tests (tmpdir, async spawn, no spawnSync,
  no HOME-leak). Faithful-regression (pre-fix RED / post-fix GREEN). `tsc --noEmit` clean per task.
- **Distinct-file per task** within a sprint (no two tasks write the same file).

## File Structure (created / modified)
| File | Responsibility | Phase |
|------|----------------|-------|
| `src/core/task-result-schema.ts` (new) | Zod schema + `TaskResultV1` type + `validateTaskResult()` | 1 |
| `src/core/types.ts` (mod) | re-export `TaskResult` from the schema (single source) | 1 |
| `src/orchestra/result-assembler.ts` (new) | `assembleResult()` — build canonical result from sources | 1 |
| `src/core/provider.ts` (mod) | add `extractUsage` to `ProviderAdapter` interface | 2 |
| `src/providers/codex.ts` (mod) | implement `extractUsage` (the one missing adapter) | 2 |
| `src/core/token-usage.ts` (new) | `normalizeUsage()` + `TokenUsage` type + `source` provenance | 2 |
| `src/core/tokenizer-fallback.ts` (new) | model→tokenizer registry + `countTokensExternal()` | 2 |
| `src/agents/worker.ts` (mod) | remove `inputTokens:0/outputTokens:0` self-count placeholder | 2 |
| `src/orchestra/result-assembler.ts` (mod) | wire `tokenUsage` + `cost` into assembly | 3 |
| `src/core/log-event.ts` (new) | `LogEvent` JSONL type + `writeLogEvent()` + `normalizeStreamEvent()` | 4 |
| `src/orchestra/spawn-backend*.ts` (mod) | capture full stream → structured JSONL | 4 |
| `src/cli/commands/cleanup.ts` (mod) | archive-then-delete `.log` with integrity check | 4 |
| `src/core/output-collector.ts` (mod) | wire `.collect()` to feed the live channel | 5 |
| `src/api/output-stream.ts` (mod) | SSE serves the live JSONL per task | 5 |
| `src/dashboard/src/**` (mod) | live log-renderer + structured result-display | 5 |
| `src/monitor/auditor.ts` (mod) | event-driven result/log validation + finding-ledger | 6 |
| `src/orchestra/reconciler.ts` (new) | sprint-end estimate-vs-actual + optimization signals | 7 |

---

## PHASE 1 (Sprint A) — Result schema + assembler (the spine)

### Task 1.1: Zod result schema + validator
**Files:** Create `src/core/task-result-schema.ts`; Test `tests/core/task-result-schema.test.ts`.
**Interfaces — Produces:**
- `TaskResultV1` (type inferred from the Zod schema, matching spec §1.2: identity/provenance, timing,
  `filesChanged[]{path,status,linesAdded,linesRemoved}`, `tokenUsage{...,source}`, `cost{usd,currency,
  pricingSource,isLocal}`, `tests`, `tsc`, `selfAssessment`, `goCriteria[]`, `notes`, `brainEvaluation*`,
  `honestGate`, `handoffNotes`, `sharedNotes`, `auditorValidation`).
- `export function validateTaskResult(obj: unknown): { ok: true; value: TaskResultV1 } | { ok: false; missingFields: string[]; errors: string[] }`
- `export const TASK_RESULT_SCHEMA_VERSION = '1.0'`

- [ ] **Step 1 — faithful test:** assert `validateTaskResult({})` → `{ok:false}` with `missingFields`
  including `'taskId'`,`'selfAssessment'`,`'tokenUsage'`,`'cost'`; and a fully-populated fixture →
  `{ok:true, value.schemaVersion==='1.0'}`; and `selfAssessment:'MAYBE'` → `ok:false` (enum).
- [ ] **Step 2 — run RED** (`npx vitest run tests/core/task-result-schema.test.ts` → fail, module absent).
- [ ] **Step 3 — implement** the Zod schema + `validateTaskResult` (worker writes it; must satisfy the test).
- [ ] **Step 4 — run GREEN** + `npx tsc --noEmit` clean.
- [ ] **Step 5 — commit.**

**goNogo:** schema is versioned + Zod-validated; missing/invalid → reported `missingFields` (not throw);
faithful RED→GREEN; tsc=0.

### Task 1.2: result-assembler (orchestrator-owned, git-authoritative)
**Files:** Create `src/orchestra/result-assembler.ts`; Test `tests/orchestra/result-assembler.test.ts`.
**Interfaces — Consumes:** `TaskResultV1`, `validateTaskResult` (Task 1.1).
**Produces:**
- `export async function assembleResult(input: AssembleInput): Promise<TaskResultV1>` where
  `AssembleInput = { projectRoot; task; workerSubjective: { selfAssessment; notes; goCriteria; tests; tsc; handoffNotes?; sharedNotes? }; tokenUsage; cost; timing: { spawnedAt; startedAt; completedAt } }`.
- assembler derives `filesChanged[]` + `totalLines*` + `diskVerified` + `boundaryViolations` from
  `git diff --numstat` against `task.scope` (reuse existing git-stat helper); fills `durationMs` from timing;
  copies the authoritative `tokenUsage`/`cost`; embeds the worker-subjective block; leaves `brainEvaluation*`
  null (filled in EVALUATE); validates via `validateTaskResult` before returning (throws `AssemblerError` on invalid).
- **Conflict rule:** if `workerSubjective.tsc.clean===false` but `selfAssessment==='DONE'` → set
  `honestGate.flagged=true, violation='claimed-done-tsc-fail'` (authoritative wins, claim preserved).

- [ ] **Step 1 — faithful test:** with a tmpdir git repo + 1 added file (3 lines) + injected
  `tokenUsage`/`cost`/timing + `selfAssessment:'DONE'`: assert `filesChanged[0].linesAdded===3`,
  `tokenUsage.inputTokens===<injected>`, `cost.usd===<injected>`, `durationMs===completed-spawned`,
  result passes `validateTaskResult`. Second test: `tsc.clean:false`+`DONE` → `honestGate.flagged===true`.
- [ ] **Step 2 — run RED.** [ ] **Step 3 — implement.** [ ] **Step 4 — GREEN + tsc=0.** [ ] **Step 5 — commit.**

**goNogo:** files/lines git-derived (not worker-claimed); conflict→honestGate; Zod-valid; faithful; tsc=0.

---

## PHASE 2 (Sprint B) — Provider-agnostic token capture

### Task 2.1: `extractUsage` adapter contract + codex + normalizer
**Files:** Modify `src/core/provider.ts` (interface), `src/providers/codex.ts`; Create `src/core/token-usage.ts`; Test `tests/core/token-usage.test.ts`, `tests/providers/codex-usage.test.ts`.
**Interfaces — Produces:**
- `src/core/token-usage.ts`: `TokenUsage = { inputTokens; outputTokens; cacheReadTokens; cacheCreationTokens; totalTokens; source: 'provider-adapter'|'tokenizer-fallback' }`; `export function normalizeUsage(raw: Partial<TokenUsage> & Record<string,number|undefined>): TokenUsage` (fills totals, defaults 0, sets `source:'provider-adapter'`).
- `ProviderAdapter.extractUsage?(rawOutput: string): TokenUsage | null` (optional; null = provider didn't report).
- `codex.ts` `extractUsage` parses its usage shape → `normalizeUsage`.

- [ ] **Step 1 — faithful test:** `normalizeUsage({inputTokens:10,outputTokens:5})` → `totalTokens===15,
  source==='provider-adapter', cacheReadTokens===0`; `codex.extractUsage(<codex output with usage>)` →
  correct tokens (pre-fix: codex has no extractUsage → test imports undefined → RED).
- [ ] **Step 2 — run RED.** [ ] **Step 3 — implement.** [ ] **Step 4 — GREEN + tsc=0.** [ ] **Step 5 — commit.**

**goNogo:** codex `extractUsage` lands; `normalizeUsage` provider-agnostic; faithful; tsc=0. (claude/gemini/
ollama/bedrock/openai-compatible already parse usage — verified, not re-touched here.)

### Task 2.2: tokenizer-fallback (report-less providers)
**Files:** Create `src/core/tokenizer-fallback.ts`; Test `tests/core/tokenizer-fallback.test.ts`.
**Interfaces — Consumes:** `TokenUsage`, `normalizeUsage` (2.1).
**Produces:**
- `export function countTokensExternal(input: { prompt: string; output: string; model: string; provider: string }): TokenUsage` — resolves a tokenizer from a `model→tokenizer` registry (anthropic-family, openai/cl100k for openai-compatible, a generic word/`bytes-÷4` estimator for others incl. qwen/deepseek/llama when no exact tokenizer), counts prompt+output **externally**, returns `normalizeUsage(...)` with `source:'tokenizer-fallback'`.
- Registry is data-driven (no hard-coded single provider); unknown model → `bytes/4` heuristic, never throws, never silently 0.

- [ ] **Step 1 — faithful test:** `countTokensExternal({prompt:'aaaa',output:'bbbb',model:'qwen2.5',provider:'ollama'})`
  → `inputTokens>0 && outputTokens>0 && source==='tokenizer-fallback'`; unknown-model path returns >0 (heuristic), not 0.
- [ ] **Step 2 — run RED.** [ ] **Step 3 — implement.** [ ] **Step 4 — GREEN + tsc=0.** [ ] **Step 5 — commit.**

**goNogo:** report-less providers get a real (external) count, marked `tokenizer-fallback`; never 0/throw; faithful; tsc=0.

### Task 2.3: remove worker self-count placeholder
**Files:** Modify `src/agents/worker.ts` (the `inputTokens:0/outputTokens:0` block ~line 61); Test `tests/agents/worker-no-selfcount.test.ts`.
**Interfaces — Consumes:** the result now comes from `assembleResult` (Phase 1) with orchestrator-supplied tokenUsage; worker stops emitting token fields.

- [ ] **Step 1 — faithful test:** the worker-produced raw result object **does not** contain a self-authored
  `tokenUsage` with `0/0` (worker only emits subjective block); assert the orchestrator path supplies tokenUsage
  (pre-fix: worker emits `inputTokens:0` → RED).
- [ ] **Step 2 — run RED.** [ ] **Step 3 — implement.** [ ] **Step 4 — GREEN + tsc=0.** [ ] **Step 5 — commit.**

**goNogo:** worker no longer self-counts; tokens come only from the authoritative path; faithful; tsc=0.

---

## PHASE 3 (Sprint B, same sprint as 2 or a tail task) — Cost wire

### Task 3.1: cost into every result
**Files:** Modify `src/orchestra/result-assembler.ts` (add cost), `src/core/cost-calculator.ts` (add per-task `calculateActualCost` if absent); Test `tests/orchestra/result-cost.test.ts`.
**Interfaces — Consumes:** `TokenUsage` (2.1), `assembleResult` (1.2).
**Produces:**
- `cost-calculator.ts`: `export function calculateActualCost(usage: TokenUsage, model: string, provider: string): { usd: number; currency: 'USD'; pricingSource: string; isLocal: boolean }` (reuse the existing per-model pricing; `ollama`/local → `{usd:0,isLocal:true}`).
- assembler calls it → `result.cost`.

- [ ] **Step 1 — faithful test:** opus usage → `cost.usd>0, isLocal:false`; ollama/local usage →
  `cost.usd===0, isLocal:true`; cost present on the assembled result (pre-fix: assembler has no cost → RED).
- [ ] **Step 2 — run RED.** [ ] **Step 3 — implement.** [ ] **Step 4 — GREEN + tsc=0.** [ ] **Step 5 — commit.**

**goNogo:** every result carries `cost.usd` (local→0); cross-provider; faithful; tsc=0.

---

## PHASE 4 (Sprint C) — Log contract (complete capture + JSONL + archive)

### Task 4.1: structured JSONL log-event + writer + stream-normalizer
**Files:** Create `src/core/log-event.ts`; Test `tests/core/log-event.test.ts`.
**Produces:**
- `LogEvent = { ts: string; seq: number; type: 'turn'|'tool_use'|'tool_result'|'text'|'stderr'|'usage'|'lifecycle'; content: unknown }`.
- `export function writeLogEvent(logPath: string, ev: Omit<LogEvent,'ts'|'seq'>, seq: number): void` (appends one JSONL line, stamps `ts`).
- `export function normalizeStreamEvent(raw: unknown, provider: string): LogEvent['type'] extends never ? never : { type; content } | null` — maps a provider stream chunk (Claude stream-json event, Ollama chunk, etc.) → common event; unknown → `{type:'text',content:raw}` (never dropped).

- [ ] **Step 1 — faithful test:** `normalizeStreamEvent(<claude tool_use json>,'claude')` → `type==='tool_use'`;
  `normalizeStreamEvent(<ollama chunk>,'ollama')` → `type==='text'`; `writeLogEvent` appends a parseable JSONL
  line with monotonic `seq` + ISO `ts`.
- [ ] **Step 2 — run RED.** [ ] **Step 3 — implement.** [ ] **Step 4 — GREEN + tsc=0.** [ ] **Step 5 — commit.**

**goNogo:** JSONL event contract + provider-agnostic normalizer; faithful; tsc=0.

### Task 4.2: capture the FULL stream into the log
**Files:** Modify the spawn-backend output path (`src/orchestra/spawn-backend*.ts` — the one that reads the worker subprocess stream); Test `tests/orchestra/log-complete-capture.test.ts`.
**Interfaces — Consumes:** `writeLogEvent`,`normalizeStreamEvent` (4.1).

- [ ] **Step 1 — faithful test:** feed a fake multi-event provider stream (3 turns + 2 tool_use + 1 usage)
  through the capture; assert the `.log` has **all 6** events as JSONL (pre-fix: only the final summary is
  captured → RED). Assert the final `usage` event is present (feeds Phase-2 token capture).
- [ ] **Step 2 — run RED.** [ ] **Step 3 — implement.** [ ] **Step 4 — GREEN + tsc=0.** [ ] **Step 5 — commit.**

**goNogo:** the complete worker stream is captured (not just the final message); usage event present; faithful; tsc=0.

### Task 4.3: archive-then-delete with integrity
**Files:** Modify `src/cli/commands/cleanup.ts`; Test `tests/cli/cleanup-log-archive.test.ts`.

- [ ] **Step 1 — faithful test:** with a live `.tasks/task-X.log`: cleanup must copy it to
  `.brain/archive/sprint-N-tasks/task-X.log` AND verify byte-equality BEFORE deleting the live copy; if the
  archive write fails/short, the live copy is **retained** (pre-fix: deletes without integrity → RED).
- [ ] **Step 2 — run RED.** [ ] **Step 3 — implement.** [ ] **Step 4 — GREEN + tsc=0.** [ ] **Step 5 — commit.**

**goNogo:** archive-then-delete with byte-integrity; never lose a log; faithful; tsc=0.

---

## PHASE 5 (Sprint D) — Live SSE streaming + dashboard

### Task 5.1: wire OutputCollector → live channel
**Files:** Modify `src/core/output-collector.ts`, `src/api/output-stream.ts`; Test `tests/api/output-stream-live.test.ts`.
**Interfaces — Consumes:** `LogEvent` (4.1).

- [ ] **Step 1 — faithful test:** writing JSONL log events for task-X then connecting the SSE
  `/api/output-stream?taskId=X` yields those events (backfill + push); a new appended event arrives live
  (pre-fix: `.collect()` never wired → stream empty → RED).
- [ ] **Step 2 — run RED.** [ ] **Step 3 — implement.** [ ] **Step 4 — GREEN + tsc=0.** [ ] **Step 5 — commit.**

**goNogo:** SSE serves live per-task JSONL (backfill+push); dead-stream gap closed; faithful; tsc=0.

### Task 5.2: dashboard live log-renderer + result-display
**Files:** Modify `src/dashboard/src/**` (a log viewer component consuming the SSE + a result panel); Test `tests/dashboard/log-viewer.test.tsx`.
**Interfaces — Consumes:** the SSE events (5.1), the `TaskResultV1` shape (1.1).

- [ ] **Step 1 — faithful test (DOM):** the log-viewer subscribes to the SSE and renders incoming events
  (turn/tool_use/text) in order; the result-panel renders the strict fields (tokens, cost, files, tests).
  (no-emoji, lucide-react icons per dashboard rules).
- [ ] **Step 2 — run RED.** [ ] **Step 3 — implement.** [ ] **Step 4 — GREEN + `npm run build:all`.** [ ] **Step 5 — commit.**

**goNogo:** live log on screen + structured result-display; build:all green; faithful DOM test.

---

## PHASE 6 (Sprint E) — Auditor 2nd-layer + finding-lifecycle

### Task 6.1: event-driven result/log validation + finding-ledger
**Files:** Modify `src/monitor/auditor.ts`; Create `src/monitor/finding-ledger.ts`; Test `tests/monitor/auditor-validation.test.ts`.
**Interfaces — Consumes:** `validateTaskResult` (1.1).
**Produces:**
- `finding-ledger.ts`: `export interface Finding { taskId; artifact:'result'|'log'; status:'open'|'closed'; missingFields:string[]; openedAt; closedAt?; rechecks:number }`; `openFinding/recheckFinding/closeFinding` persisted to `.deckent/findings/<sprint>.json`.
- auditor: on a result/log **write event**, validate ONCE → if OK and a finding was open, close it; if INCOMPLETE, open/keep the finding + report `{taskId,artifact,status,missingFields}` to the orchestrator; an OK artifact with no open finding is not re-validated.

- [ ] **Step 1 — faithful test:** validating an incomplete result (missing `linesAdded`) → opens a finding +
  reports `INCOMPLETE`; after the field is filled, recheck of **that** result closes it; a separate OK result
  is validated once and not re-checked; the ledger tracks open→closed (pre-fix: no validation/ledger → RED).
- [ ] **Step 2 — run RED.** [ ] **Step 3 — implement.** [ ] **Step 4 — GREEN + tsc=0.** [ ] **Step 5 — commit.**

**goNogo:** event-driven one-shot validation; finding tracked-to-resolution; OK never re-checked; faithful; tsc=0.

---

## PHASE 7 (Sprint E tail or F) — Estimate-vs-actual reconciliation

### Task 7.1: sprint-end reconciler
**Files:** Create `src/orchestra/reconciler.ts`; Modify the sprint-finalize summary to include it; Test `tests/orchestra/reconciler.test.ts`.
**Interfaces — Consumes:** per-task `TaskResultV1.cost`/`tokenUsage` (1-3), the start-of-sprint `estimateSprintCost` (cost-calculator).
**Produces:**
- `export function reconcileSprint(estimate: SprintCostEstimate, results: TaskResultV1[]): { estimatedUsd; actualUsd; variancePct; perTask: Array<{taskId; estimatedUsd; actualUsd; variancePct}>; optimizationSignals: string[] }` (signals e.g. "task X 3× over estimate on opus → consider sonnet").

- [ ] **Step 1 — faithful test:** with an estimate + 3 result fixtures → `actualUsd===sum`, `variancePct`
  correct, a per-task over-run produces an `optimizationSignals` entry (pre-fix: no reconciler → RED).
- [ ] **Step 2 — run RED.** [ ] **Step 3 — implement.** [ ] **Step 4 — GREEN + tsc=0.** [ ] **Step 5 — commit.**

**goNogo:** estimate-vs-actual + variance + optimization signals in the sprint summary; faithful; tsc=0.

---

## Self-review (coverage)
- Spec §1.1 ownership → 1.2 assembler. §1.2 schema → 1.1. §1.3 token capture → 2.1/2.2. §1.4 cost → 3.1.
  §1.5 conflict → 1.2 (honestGate). §1.6 reconciliation → 7.1. §2.1 complete capture → 4.2. §2.2 JSONL → 4.1.
  §2.3 live-stream → 5.1/5.2. §2.4 archive → 4.3. Auditor → 6.1. All spec sections have a task. ✓
- Type consistency: `TokenUsage` (2.1) used by 2.2/3.1/1.2; `TaskResultV1` (1.1) used by 1.2/5.2/6.1/7.1;
  `LogEvent` (4.1) used by 4.2/5.1. Names match. ✓
- No placeholders: every task has exact files + interface signatures + a concrete faithful-test assertion +
  goNogo. Implementation body is the deckent-worker's (per the execution model). ✓

## Execution (deckent-sprint per phase)
Each PHASE → one deckent sprint: I generate that phase's DIRECTIVES from the tasks above (distinct-file,
opus for the core assembler/auditor/reconciler, exact contracts + faithful-tests), `deckent plan` →
hand-verify models → `deckent start` → disk-verify → commit/push. Phases are ordered: 1 → 2 → 3 (result
spine) → 4 (log) → 5 (stream) → 6 (auditor) → 7 (reconciliation); later phases depend on earlier types.
