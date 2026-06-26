# Design — Worker Output Contract & Observability

> **Date:** 2026-06-26 · **Status:** design-ready (brainstorm-approved).
> **One-line:** Make every worker's `.result` and `.log` a strict, complete, **provider-agnostic**,
> orchestrator-owned, validated, archived, live-streamable artifact — killing the inconsistent
> hand-authored results and the dead worker-log stream.
> **No ADR references** (the ADR set is being overhauled; decisions stand on capability merit).

## Why
- `.result` is hand-authored by each worker → inconsistent (some long/short, lines-added present or
  not, checklist or not). The schema is loose; nothing assembles or validates it authoritatively.
- The token counter has never worked (the user's standing pain): `worker.ts:61` writes
  `inputTokens:0, outputTokens:0` placeholders; the provider-adapter's real usage is discarded.
- `cost_usd` is never written to a result, despite a working cross-provider `cost-calculator.ts`.
- The worker `.log` archived for sprint-325 was **3 lines / 463 bytes** — only the final summary, NOT
  the full execution trace. The live dashboard stream is **dead** (`OutputCollector.collect()` has no
  production caller), so the user cannot watch a worker run.

## Non-negotiable principles (Laws #1, #2, #3)
1. **Provider-agnostic.** Works for Claude · Codex · Gemini · Ollama · vLLM · DeepSeek/Qwen
   (openai-compatible) · any local model. **No Claude-CLI dependency.** Each provider adapter
   normalizes its own usage + output stream into a common shape.
2. **Orchestrator/adapter-owned, not worker-self-authored.** The worker can only contribute
   subjective signals; everything measurable is derived authoritatively. A worker cannot produce an
   inconsistent artifact.
3. **Validated + archived + versioned + million-scale.** Zod-validated at write, Auditor-validated as
   a second layer (finding-lifecycle), archived and never lost, `schemaVersion` on every artifact.
4. **God-level, no MVP.** Comprehensive schema; nothing left "for later".

---

## Pillar 1 — Result Contract

### 1.1 Ownership (who fills what)
| Group | Owner | Source |
|-------|-------|--------|
| identity/provenance, timing | **Orchestrator** | sprint/task state + spawn→result timestamps |
| `filesChanged[]` (per-file added/modified/deleted + lines), totals, `diskVerified`, `boundaryViolations` | **Orchestrator** | `git diff --numstat` (already run for boundary checks — reuse, ~ms) |
| `tokenUsage` | **Orchestrator via provider adapter** | adapter `extractUsage()` (already parses the response — capture, not re-count: **zero added latency**) |
| `cost` | **Orchestrator** | `cost-calculator(tokenUsage, model, provider)` (arithmetic; local → $0) |
| `tests`, `tsc` | **Worker runs + reports; Orchestrator captures** (verify optional, config-gated, default-off) | worker verify-loop |
| `selfAssessment`, `goCriteria[]`, `notes` | **Worker** (bounded/structured) | the only genuinely subjective signals |
| `brainEvaluation*`, `rubricScores`, `honestGate` | **Brain** (post-eval) | EVALUATE phase |
| `auditorValidation` | **Auditor** (2nd layer) | post-write validation |

**Performance:** the measurable fields capture data that already flows through (git already run,
adapter already parses, cost is arithmetic, timestamps free). The only potentially-slow path —
orchestrator RE-running tests — is config-gated and default-off. So orchestrator-ownership adds
**no meaningful latency**; today's behavior (worker writes `0/0`, adapter usage discarded) is the waste.

### 1.2 Schema (`schemaVersion: "1.0"`, Zod-validated)
```jsonc
{ "schemaVersion": "1.0",
  // identity/provenance
  "taskId","sprintId","workerId", "provider","model","modelEffort","agent","skills":[...],
  "attempt":1, "isPriorityFix":false, "fixForTaskId":null,
  // timing (orchestrator)
  "spawnedAt","startedAt","completedAt","durationMs",
  // work output (orchestrator, git-authoritative)
  "filesChanged":[{"path","status":"added|modified|deleted","linesAdded","linesRemoved"}],
  "totalLinesAdded","totalLinesRemoved","diskVerified":true,"boundaryViolations":[{"path","reason"}],
  // resource accounting (orchestrator, provider-agnostic)
  "tokenUsage":{"inputTokens","outputTokens","cacheReadTokens","cacheCreationTokens","totalTokens",
                "source":"provider-adapter|tokenizer-fallback"},
  "cost":{"usd","currency":"USD","pricingSource","isLocal":false},
  // verification (worker-run, orchestrator-captured)
  "tests":{"passed","failed","total","coverage","command","orchestratorVerified":false},
  "tsc":{"clean":true,"errors":0},
  // assessment (worker + brain)
  "selfAssessment":"DONE|GO_WITH_TECH_DEBT|NO_GO",
  "goCriteria":[{"id","description","met":true,"evidence"}],
  "notes":"<bounded>",
  "brainEvaluation":"DONE|GO_WITH_TECH_DEBT|NO_GO","brainEvaluationReason","rubricScores":{...},"totalScore",
  "honestGate":{"flagged":false,"violation":null},
  // comms (optional)
  "handoffNotes":null,"sharedNotes":[],
  // auditor (2nd layer)
  "auditorValidation":{"status":"OK|INCOMPLETE","checkedAt","missingFields":[],"findingId":null,"resolved":true} }
```

### 1.3 Provider-agnostic token capture
Each adapter implements `extractUsage(rawProviderOutput): TokenUsage`, normalizing its native format:
Anthropic/Claude `input_tokens/output_tokens/cache_*` · OpenAI-compatible (DeepSeek/Qwen/vLLM)
`prompt_tokens/completion_tokens` · Ollama `prompt_eval_count/eval_count` · Gemini
`usageMetadata.*`. **Already present** for claude/gemini/ollama/bedrock/openai-compatible; **codex
needs it added.**

**Tokenizer fallback** (provider reports no usage): a tokenizer registry maps `model → tokenizer`
(Anthropic tokenizer for claude-family, `tiktoken`/cl100k for OpenAI-family, the model's HF tokenizer
for Qwen/DeepSeek/Llama, a `bytes/4` heuristic as a last-resort marked clearly). The fallback counts
the actual input-prompt + output-text **externally** (deckent counts the text, never the LLM
self-reporting). `tokenUsage.source` records `provider-adapter` vs `tokenizer-fallback` for honesty.

### 1.4 Cost (cross-provider)
`cost-calculator.ts` is already zero-hard-code + cross-provider (`ollama → local → $0`, per-model
input/output/cache pricing). Wire it into the assembler: `cost = costCalculator(tokenUsage, model,
provider)`. Local/self-hosted → `isLocal:true, usd:0` (optional compute-cost estimate later).

### 1.5 Conflict behavior (authoritative wins)
The orchestrator-derived fields are **canonical**. Where a worker-reported field is verifiable
(`tests`, `tsc`) and orchestrator-verify is enabled, on conflict the **authoritative source wins**,
the worker-claim is preserved verbatim, and the discrepancy raises a `honestGate` signal (a worker
claiming `testsPassed:true` while `tsc` fails is a dishonesty signal, not a silent overwrite).

### 1.6 Estimate vs actual reconciliation
At sprint end: sum actual `tokenUsage`/`cost.usd` across results; compare to the start-of-sprint
`estimateSprintFull`. Emit a reconciliation report — per-task + sprint-total variance %, and
optimization signals (which tasks/models over- or under-ran their estimate). Surfaced in the sprint
summary + dashboard.

---

## Pillar 2 — Log Contract

### 2.1 Complete capture (provider-agnostic)
Capture the **full** worker subprocess stream — every turn, `tool_use`, `tool_result`, `text`,
`stderr`, `usage` — not just the final summary. Claude `--output-format stream-json` is already a
JSON event stream; Ollama/vLLM stream their own format. Each adapter/spawn-backend normalizes its
stream into the common log event below.

### 2.2 Structured JSONL log contract
`task-<id>.log` is JSONL — one event per line:
```jsonc
{ "ts":"2026-06-26T10:27:01.123Z", "seq":1,
  "type":"turn|tool_use|tool_result|text|stderr|usage|lifecycle",
  "content": { /* type-specific */ } }
```
Parseable + renderable + provider-agnostic. The final `usage` event feeds Pillar-1 token capture
(single source of truth).

### 2.3 Live streaming (fix the dead stream)
Wire `OutputCollector` → the `/api/output-stream` SSE so the dashboard tails the live JSONL and
renders events in real time (turns, tool-calls, text). This closes the dead-stream gap
(`OutputCollector.collect()` currently has no production caller). Backpressure via the existing
CircularBuffer; per-task channel.

### 2.4 Persistence + archive
The **complete** JSONL log is archived (`.brain/archive/sprint-<n>-tasks/task-<id>.log`), never
deleted before archive, retained. Cleanup removes only the live `.tasks/` copy **after** a verified
archive write (archive-then-delete, with an archive-integrity check).

---

## Auditor — second-layer validation (event-driven, finding-lifecycle)
NOT a continuous re-scan. On each `.result`/`.log` **write event**, the Auditor validates **once**
against the schema and reports to the orchestrator: `{taskId, artifact:"result|log", status:"OK|
INCOMPLETE", missingFields:[...]}`. Findings have a lifecycle: `open → (orchestrator re-derives) →
recheck (that artifact only) → closed`. An `OK` artifact is never re-checked; an `INCOMPLETE` finding
is **tracked to resolution** (followed until OK). A per-sprint finding-ledger persists open findings.

---

## Architecture / components
- **`result-assembler`** (orchestrator-side, new) — collects from git-stat + adapter-usage +
  cost-calculator + timestamps + worker-report → builds + Zod-validates the canonical `TaskResult`.
- **`TaskResult` Zod schema** (`src/core/types.ts` + a schema module) — versioned, strict.
- **adapter `extractUsage()`** (per provider; codex added) + **`tokenizer-fallback`** registry (new).
- **`cost-calculator` wire** into the assembler.
- **`log-writer`** (spawn-backend side) — normalizes the provider stream → structured JSONL.
- **`OutputCollector` → SSE wire** (`output-collector.ts` + `api/server.ts /api/output-stream`).
- **dashboard** — live log-renderer + structured result-display + reconciliation panel.
- **Auditor** (`monitor/auditor.ts`) — result + log validation + finding-ledger.
- **reconciler** (sprint-end, new) — estimate vs actual.

## Data flow
spawn → backend captures full stream → `log-writer` emits JSONL (live → OutputCollector → SSE →
dashboard; persisted → `.tasks/task-X.log`) → on completion, adapter `extractUsage()` from the
stream's `usage` event → `result-assembler` builds canonical result (git-stat + tokens + cost +
timestamps + worker subjective) → Zod-validate → write `.result` → Auditor validates (finding-
lifecycle) → EVALUATE (brain) → archive (result + log) → sprint-end reconciliation.

## Error handling
- Adapter usage absent → tokenizer-fallback (`source` marked). Tokenizer absent → `bytes/4` heuristic
  (marked, never silently 0).
- git-stat fails → `diskVerified:false` + Auditor INCOMPLETE finding (not a silent 0).
- Stream capture truncated → `lifecycle` event records truncation; Auditor flags.
- Archive write fails → live copy is NOT deleted (retry; never lose a log).
- All best-effort paths log honestly; nothing degrades to a silent placeholder.

## Testing
- Per-provider `extractUsage` unit tests (claude/gemini/ollama/openai-compatible/codex) + tokenizer-
  fallback. Cost-calc cross-provider (incl. local=$0). Assembler: git-authoritative fields, conflict
  behavior, Zod-reject on malformed. Log-writer: stream→JSONL normalization per provider. SSE live-
  stream e2e (dashboard renders). Auditor finding-lifecycle (open→recheck→closed; OK not re-checked).
  Reconciliation: estimate-vs-actual math. All hermetic.

## Implementation phases (decomposition for the plan)
1. **Result schema + assembler + Zod** (the spine; orchestrator-owned fields from git/timestamps).
2. **Provider-agnostic token capture** (adapter `extractUsage` + codex + tokenizer-fallback) → wire
   into assembler; remove worker `0/0` self-count.
3. **Cost** (cost-calculator wire → `cost_usd` in every result).
4. **Log contract** (structured JSONL capture + complete-stream + archive-then-delete).
5. **Live streaming** (OutputCollector → SSE → dashboard renderer).
6. **Auditor 2nd-layer** (result + log validation + finding-ledger lifecycle).
7. **Reconciliation** (sprint-end estimate vs actual + optimization signals).

Each phase is independently shippable; later phases depend on earlier (schema → tokens → cost; log →
stream; all → auditor/reconciliation).
