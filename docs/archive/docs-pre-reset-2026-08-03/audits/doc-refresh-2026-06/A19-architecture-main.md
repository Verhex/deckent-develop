# A19 — architecture/architecture.md Deep Verify

**Sprint:** 345 | **Task:** 345-019 | **Date:** 2026-06-28  
**Target file:** `docs/architecture/architecture.md` (~78 KB, 1519 lines)  
**Method:** Full read of §2 Module Map + data-flow sections; file-by-file cross-check against `src/` tree (`find`, `ls`); load-bearing modules from `CLAUDE.md` verified. Narrative sections (§6–§9, §11) skimmed — design-pattern prose with no filenames to cross-check.

---

## Coverage Note (Explicit)

| Section | Coverage Level | Rationale |
|---------|---------------|-----------|
| §2 Module Map | **Deep** — every named dir/file verified against disk | Core audit target |
| §3 Module Responsibilities | **Deep** — key exports + boundary rules cross-checked | Structural |
| §4 Import Rules (ADR-008) | **Deep** — verified against known ADR-008 state | Architectural |
| §5 Data-Flow Diagrams | **Deep** — function names cross-checked against orchestra/ files | Behavioral |
| §6 Config Layers | Skim | Pure design doc, no filenames |
| §7 Memory System | Skim | References `memory.db` + `exports/` (correct), no new filenames |
| §8 Plugin System | Skim | No filenames beyond `plugin.ts` / `plugin-hooks.ts` (verified) |
| §9 Security Model | Skim | Permission matrix / threat model — no filenames to cross-check |
| §10 File Structure Reference | **Deep** — full `.deckent/` + `.brain/` tree verified | Reference |
| §11 Sprint Lifecycle | Skim | Phase table consistent with orchestration finding |
| §12 HTTP API & Dashboard | **Spot-check** — endpoint list vs actual `src/api/` files | Partial |
| Routing v2 Engine section | **Deep** — layer 1/2/3 files verified | Routing |
| Related Documentation links | Spot-check — primary linked docs confirmed present | Links |

The 78 KB document was read in full. Code snippets within the doc were compared against actual file locations; narrative prose was not line-by-line audited.

---

## Summary: Verdict by Module

| Module | Status | Severity |
|--------|--------|----------|
| `src/agent/` (singular) | **UNDOCUMENTED** — entirely missing from §2 | High |
| `src/mcp-client/` | **UNDOCUMENTED** — missing from §2 | Medium |
| `src/training/` | **UNDOCUMENTED** — missing from §2 | Low |
| `src/providers/bedrock.ts` | **UNDOCUMENTED** provider adapter | Medium |
| `src/providers/cache-adapter*` | **UNDOCUMENTED** caching layer | Medium |
| `spawn-backend-docker/mock/subprocess.ts` | **UNDOCUMENTED** — doc claims single file | Medium |
| `src/monitor/finding-ledger.ts` | **UNDOCUMENTED** — 6th module omitted | Low |
| `src/agents/` new agentic-worker files | **UNDOCUMENTED** | Medium |
| `cli/helpers/` Sprint-32 table (10 files) | **STALE** — listed files absent from disk | High |
| `cli/commands/` ~25+ undocumented commands | **UNDOCUMENTED** | Medium |
| `src/api/terminal/` subsystem | **UNDOCUMENTED** | Medium |
| `src/connectors/identity/`, `voice/` | **UNDOCUMENTED** subdirs | Medium |
| Core module map tables (§3) | **STALE** — many new `core/` files omitted | Medium |
| MCP tools count (34) | ACCURATE | — |
| MCP resources count (8) | ACCURATE | — |
| `src/orchestra/` named modules | Mostly accurate + many undocumented extras | Low |

---

## Finding 1 — UNDOCUMENTED: `src/agent/` (Singular)

**Severity: High**

A major new top-level module `src/agent/` (singular, distinct from `src/agents/`) is entirely absent from the Module Map in §2. It contains the native/agentic agent runtime:

```
src/agent/
├── assets/
├── events.ts
├── guards/
│   ├── cost.ts
│   ├── recursion.ts
│   └── self-modifying.ts
├── identity.ts
├── loop.ts              ← agent execution loop
├── permission-policy.ts
├── permission-store.ts
├── permission-types.ts
├── permission.ts
├── provider-detect.ts
├── provider-tooluse/
│   ├── anthropic.ts
│   ├── ollama.ts
│   ├── openai.ts
│   ├── sse.ts
│   └── types.ts
├── session.ts
├── tools/
│   ├── registry.ts
│   └── types.ts
├── trace-recorder.ts
└── transcript.ts
```

This module implements the native agentic worker loop (`loop.ts`), session management (`session.ts`), per-provider tool-use adapters (`provider-tooluse/`), cost + recursion + self-modifying guards (`guards/`), permission system (`permission*.ts`), and transcript/trace recording. It appears to be the infrastructure powering the `agentic-worker-*` files in `src/agents/` (see Finding 5).

**Action required:** Add `src/agent/` as a new section in §2 Module Map. Describe its role as the native agent runtime layer; clarify its relationship to `src/agents/`.

---

## Finding 2 — UNDOCUMENTED: `src/mcp-client/`

**Severity: Medium**

`src/mcp-client/` (4 files: `broker.ts`, `config.ts`, `registry.ts`, `types.ts`) is entirely absent from the Module Map. This is the MCP *client* layer — used by deckent to connect to external MCP servers as a client, distinct from `src/mcp/` (the MCP *server* layer that exposes deckent tools to Claude Code).

**Action required:** Add `src/mcp-client/` to §2, distinguish from `src/mcp/` (server vs. client).

---

## Finding 3 — UNDOCUMENTED: `src/training/`

**Severity: Low**

`src/training/` contains `cc-trace-extractor.ts`. Not mentioned anywhere in the architecture doc. Likely a tooling module for extracting Claude Code traces for training/fine-tuning purposes.

**Action required:** Add brief entry to §2 or §10 File Structure Reference.

---

## Finding 4 — PROVIDERS: Missing Adapters

**Severity: Medium**

The providers table in §2 lists 8 files. The actual `src/providers/` directory contains 12:

| File | Doc Status |
|------|-----------|
| `bedrock.ts` | **MISSING** — AWS Bedrock provider adapter not documented |
| `cache-adapter.ts` | **MISSING** — provider response caching layer |
| `cache-adapter-resource.ts` | **MISSING** — resource-level cache adapter |
| `cross-provider-keys.ts` | **MISSING** — key normalization across providers |
| `session-usage-store.ts` | **MISSING** — per-session usage tracking |
| `claude.ts` | ✓ documented |
| `codex.ts` | ✓ documented |
| `gemini.ts` | ✓ documented |
| `ollama.ts` | ✓ documented |
| `openai-compatible.ts` | ✓ documented |
| `subprocess.ts` | ✓ documented |
| `sandbox.ts` | ✓ documented |

Specifically: `bedrock.ts` represents a new provider (AWS Bedrock) not mentioned anywhere in §2 or the Model Equivalence table. The `ProviderName` type documented as `'claude' | 'codex' | 'gemini' | 'ollama'` likely now includes `'bedrock'`.

**Action required:** Add `bedrock.ts` to provider table; update `ProviderName` union type; document cache-adapter and session-usage-store.

---

## Finding 5 — SPAWN-BACKEND: Single-File Claim is Stale

**Severity: Medium**

§2 describes `spawn-backend.ts` as containing "SpawnBackend interface, TmuxBackend, SubprocessBackend, factory" in a single file. Reality:

```
src/orchestra/
├── spawn-backend.ts          ← SpawnBackend interface + factory (base)
├── spawn-backend-docker.ts   ← DockerSpawnBackend (UNDOCUMENTED)
├── spawn-backend-mock.ts     ← MockSpawnBackend for tests (UNDOCUMENTED)
└── spawn-backend-subprocess.ts  ← SubprocessSpawnBackend (UNDOCUMENTED)
```

The SubprocessSpawnBackend was already referenced in the doc's worker section text ("SubprocessSpawnBackend provides an alternative to tmux") but the implementation was split into its own file. Docker and Mock backends are entirely new.

**Action required:** Update §2 module table and §3.2 orchestration description to list all 4 spawn-backend files. Note Docker backend for containerized worker support.

---

## Finding 6 — MONITOR: `finding-ledger.ts` Missing

**Severity: Low**

§2 claims `monitor/` has "5 modules" and lists: `auditor.ts`, `alert-emitter.ts`, `dashboard-manager.ts`, `sprint-state.ts`, `index.ts`. Actual content has a 6th: `finding-ledger.ts`.

**Action required:** Add `finding-ledger.ts` to the monitor/ module list; update module count.

---

## Finding 7 — AGENTS: New Agentic Worker Files Undocumented

**Severity: Medium**

Several new files in `src/agents/` are absent from the doc:

| File | Description |
|------|------------|
| `agentic-worker-entry.ts` | Entry point for the new agentic (HTTP-based) worker |
| `agentic-worker-runner.ts` | Runner logic for agentic workers |
| `agentic-worker-tools.ts` | Tool dispatch for agentic workers |
| `http-agentic-worker.ts` | HTTP-transport agentic worker implementation |
| `scope-guard.ts` | Scope enforcement guard for workers |
| `worker-lifecycle.ts` | Worker lifecycle state machine (extracted from `worker.ts`) |
| `worker-log.ts` | Worker-side logging utilities |
| `worker-rollback.ts` | Worker rollback mechanism |
| `worker-verify.ts` | Verification step runner for workers |
| `auditor.ts` | An auditor module in agents/ (distinct from `monitor/auditor.ts`) |
| `prompt-ab-test.ts` | A/B test logic (doc says merged into prompt-analytics, but separate file exists) |
| `prompt-metrics.ts` | Prompt metrics collection |

The doc states "25 modules" for `agents/`; the actual count is higher. The `worker.ts` lifecycle description is partially stale — `worker-lifecycle.ts` now carries part of that responsibility.

**Action required:** Update agents/ module count and add agentic-worker cluster. Clarify `src/agents/auditor.ts` vs `src/monitor/auditor.ts`. Note worker-lifecycle extraction.

---

## Finding 8 — CLI HELPERS: Sprint-32 UX Table is Stale (10 files missing)

**Severity: High**

§2 lists a "cli/helpers/ — UX System (Sprint 32)" table with 13 files. Cross-checking against actual `src/cli/helpers/` directory: **10 of these files do not exist on disk**.

| Claimed File | Status |
|-------------|--------|
| `progress.ts` | **NOT FOUND** |
| `eta-calculator.ts` | **NOT FOUND** |
| `worker-status.ts` | **NOT FOUND** |
| `queue-display.ts` | **NOT FOUND** |
| `terminal-utils.ts` | **NOT FOUND** |
| `change-categorizer.ts` | **NOT FOUND** |
| `agent-performance.ts` | **NOT FOUND** |
| `recommendations.ts` | **NOT FOUND** |
| `sprint-comparison.ts` | **NOT FOUND** |
| `progress-persistence.ts` | **NOT FOUND** |
| `sprint-summary.ts` | ✓ EXISTS |
| `theme.ts` | ✓ EXISTS |
| `output-mode.ts` | ✓ EXISTS |

Actual `src/cli/helpers/` files not mentioned in the doc:

| Actual File | Status |
|------------|--------|
| `sprint-summary-rich.ts` | UNDOCUMENTED |
| `status-renderer.ts` | UNDOCUMENTED |
| `splash.ts` | UNDOCUMENTED |
| `ansi.ts` | UNDOCUMENTED |
| `i18n.ts` | UNDOCUMENTED |
| `agent-templates.ts` | UNDOCUMENTED |
| `codex-config.ts`, `cursor-config.ts`, `gemini-config.ts` | UNDOCUMENTED |
| `config-reader.ts` | UNDOCUMENTED |
| `dashboard-dir.ts` | UNDOCUMENTED |
| `debt-counter.ts` | UNDOCUMENTED |
| `mcp-attach.ts` | UNDOCUMENTED |
| `output.ts` | UNDOCUMENTED |
| `process-runtime.ts`, `process.ts` | UNDOCUMENTED |
| `prompt.ts` | UNDOCUMENTED |

Likely explanation: Sprint-32 UX helpers were either renamed, merged into `sprint-summary-rich.ts` / `status-renderer.ts`, or never extracted as separate files. The doc retains the sprint-32 plan but not the actual implementation structure.

**Action required:** Remove the 10 ghost entries; add the actual files present. High priority — readers looking for `progress.ts` etc. will not find them.

---

## Finding 9 — CLI COMMANDS: Many Undocumented Commands

**Severity: Medium**

The doc describes the CLI command set under named groups and a table. Actual `src/cli/commands/` has a significantly larger set. Undocumented commands (representative list):

| Undocumented Command File | Category |
|--------------------------|---------|
| `audit.ts`, `audit-verify.ts` | Audit / compliance |
| `autonomous.ts`, `autonomous-mission.ts` | Autonomous operation |
| `bot.ts` | Bot management |
| `chat.ts` + ~25 `chat-*.ts` helper files | Native chat REPL |
| `cost.ts` | Token / cost reporting |
| `docs.ts` | Documentation management |
| `evolve.ts` | Agent/skill evolution |
| `flow.ts` | Flow management |
| `gateway.ts` | Gateway control |
| `image.ts` | Image input |
| `kpi.ts` | KPI dashboard |
| `mcp.ts` | MCP management |
| `memory.ts` | Memory query |
| `mode.ts` | Mode switching |
| `models.ts` | Model listing |
| `nervous.ts` | Nervous system config |
| `rbac.ts` | Role-based access control |
| `recall.ts`, `recover.ts`, `remember.ts` | Memory ops |
| `resources.ts` | MCP resource listing |
| `resume.ts` | Session resume |
| `usage.ts` | Usage reporting |
| `agentic-confirm.ts`, `agentic-session.ts` | Agentic workflow |

The `chat.ts` + `chat-*.ts` cluster (~25 files) represents a full native chat REPL that is absent from the architecture description entirely.

**Action required:** Add `chat` command cluster (native chat/REPL interface) as a new module section. Update CLI command group table with the full set. Document `deckent autonomous`, `deckent flow`, `deckent gateway`, `deckent kpi` etc.

---

## Finding 10 — API MODULE: Terminal Subsystem + Many New Endpoints Undocumented

**Severity: Medium**

§2 claims "18 modules" for `api/`. Actual `src/api/` has ~28 files and includes an entire `terminal/` subsystem:

```
src/api/terminal/
├── audit-integrity.ts
├── audit.ts
├── auth-provider.ts
├── command-guard.ts
├── outbound-limiter.ts
├── prompt-guard.ts
├── session-backend.ts
├── session-manager.ts
├── types.ts
└── ws-gateway.ts          ← WebSocket gateway for terminal sessions
```

Undocumented `api/` endpoint files:

| File | Missing from doc |
|------|-----------------|
| `autonomous-endpoint.ts` | Yes |
| `chat-handler.ts`, `chat-stream.ts` | Yes |
| `coverage-endpoint.ts` | Yes |
| `docs-health-endpoint.ts` | Yes |
| `evolution-endpoint.ts` | Yes |
| `kpi-endpoint.ts`, `kpi-trend-endpoint.ts` | Yes |
| `live-events.ts` | Yes (doc only mentions `watcher.ts` for SSE) |
| `memory-search-endpoint.ts` | Yes |
| `middleware/token.ts` | Yes |
| `missions-route.ts` | Yes |
| `nervous-endpoint.ts` | Yes |
| `oidc-callback-endpoint.ts` | Yes |
| `output-stream.ts` | Yes |
| `process-endpoint.ts` | Yes |
| `reactive-endpoint.ts` | Yes |
| `sprint-job-runner.ts` | Yes |
| `status-reconcile.ts` | Yes |
| `worker-logs.ts` | Yes |

Also: `rate-limiter.ts` listed in §2 api table is NOT in `src/api/`; it lives in `src/core/rate-limiter.ts`.

**Action required:** Document `terminal/` as a WebSocket-based terminal session subsystem. Update endpoint count and list. Fix `rate-limiter.ts` location claim.

---

## Finding 11 — CONNECTORS: New Subdirs Undocumented

**Severity: Medium**

The doc describes connectors as "Discord, Telegram, WhatsApp, incoming-router" with an ellipsis. Actual `src/connectors/` has additional undocumented subdirectories and files:

| Addition | Notes |
|---------|-------|
| `identity/` subdir | `identity-store.ts`, `principal-resolver.ts`, `provider.ts`, `providers/`, `role-map.ts`, `verify-bind.ts` — identity management |
| `voice/` subdir | `health.ts`, `language.ts`, `local-voice.ts`, `modality.ts`, `openai-voice.ts`, `types.ts` — voice connector |
| `capabilities/` subdir | Not further explored |
| `bot-action-store.ts`, `bot-agentic.ts`, `bot-commands.ts`, `bot-daemon.ts` | Bot infrastructure |
| `callback-router.ts` | Callback routing |
| `connector-bootstrap.ts`, `connector-notify-adapter.ts`, `connector-pool.ts` | Infrastructure |
| `kpi-sprint-summary.ts`, `kpi-summary-dispatch.ts` | KPI integration |
| `stream-throttle.ts`, `markdown-to-html.ts` | Utilities |

`identity/` is particularly significant — it appears to implement connector-level identity and role mapping. `voice/` adds a new modality (voice input/output) entirely absent from the architecture.

**Action required:** Document `identity/`, `voice/`, and bot infrastructure in §2. Note voice as a new supported connector modality.

---

## Finding 12 — CORE MODULE MAP: Many Load-Bearing Files Omitted

**Severity: Medium**

§3.1 core/ table lists 9 files and is described as the "Foundation Layer." The actual `src/core/` directory contains ~150+ files. Beyond the expected growth, several load-bearing files mentioned implicitly in CLAUDE.md and other sections are missing from the explicit module table:

| Load-Bearing File | Status in §3.1 |
|------------------|---------------|
| `memory-store.ts` | MISSING (CLAUDE.md: "DB-first SQLite/FTS5") |
| `memory-query.ts` | MISSING (CLAUDE.md: same) |
| `routing-engine.ts` | MISSING (mentioned only in Routing v2 appendix section) |
| `activation-engine.ts` | MISSING (mentioned only in Routing v2 appendix section) |
| `intent-classifier.ts` | MISSING (mentioned only in Routing v2 appendix section) |
| `model-registry.ts` | MISSING from §3.1 (mentioned briefly in providers table) |
| `rbac.ts` | MISSING |
| `event-stream.ts` | MISSING (ADR-008 amendment says it was moved here from orchestra/) |
| `audit-writer.ts`, `audit-query.ts` | MISSING |
| `tenant-context.ts` | MISSING |
| `capability-*.ts` cluster | MISSING |
| `erp/` subdir, `erp-connector.ts` | MISSING |
| `kpi/` subdir | MISSING |
| `catalog/` subdir | MISSING |
| `doc-tracking/` subdir | MISSING |

**Action required:** The §3.1 table should be expanded or a note added that it shows only the original 9 seed files; reference the routing-engine, memory-store, memory-query as additional load-bearing core modules. Document the `erp/`, `kpi/`, `catalog/` subdirs.

---

## Finding 13 — ORCHESTRA: Many Undocumented Files (Non-Critical)

**Severity: Low**

The doc's §2 orchestra module table is a representative sample, not exhaustive. Many orchestra/ files exist that are not named anywhere in the doc. The most notable omissions:

| File | Notes |
|------|-------|
| `sprint-finalizer.ts` | End-of-sprint cleanup (CLAUDE.md lists it as Brain family) |
| `sprint-lifecycle.ts` | Sprint lifecycle state machine |
| `sprint-spawner.ts` | Worker spawning logic (CLAUDE.md: Brain family) |
| `sprint-planner.ts` | Planning subsystem |
| `sprint-state-tracker.ts` | Sprint state tracking |
| `sprint-runtime.ts`, `sprint-runner-entry.ts` | Runtime entry |
| `sprint-pid-manager.ts` | Process ID management |
| `managed-docs/` | CLAUDE.md lists "managed-docs/" as a key orchestra/ subdir — absent from §2 |
| `autonomous/` subdir | Autonomous orchestration mode |
| `autonomous-runtime.ts` | Autonomous mode runtime |
| `ecosystem-intelligence.ts` | Referenced in ADR-008 residual violation note |
| `honest-gate.ts` | Worker honest self-assessment gate |
| `proof-of-function.ts` | Proof-of-function verification |
| `event-bus.ts` | Internal event bus |
| `event-stream.ts` | Re-export shim (ADR-008 amendment) |
| `reconciler.ts` | State reconciler |
| `baseline-tracker.ts` | Sprint baseline tracking |
| `cross-verify-runner.ts` | Cross-verification runner |
| `rubric-registry.ts` | Evaluation rubric registry |
| `process-controller.ts` | Process lifecycle control |

The Brain family enumerated in the ADR-008 amendment (`sprint-controller`, `sprint-phases`, `sprint-spawner`, `sprint-lifecycle`, `sprint-finalizer`, `sprint-planner`, `sprint-utils`, `result-collector`, `result-evaluator`, `debt-manager`, `resource-monitor`, `spawn-backend` family, `brain.ts`) is largely present on disk but the doc's §2 table only names a subset.

**Action required:** Add `managed-docs/` subdir, `autonomous/` subdir, and the full Brain-family list to §2. This is low-priority given the doc's intentional `...` truncation pattern.

---

## Finding 14 — MODULE COUNTS: Stale Numbers

**Severity: Low**

§2 module map claims specific counts:
- `core/`: "148 modules" — likely still in the right ballpark given 150+ files observed
- `orchestra/`: "94 modules" — actual file count is higher (~105+)
- `agents/`: "25 modules" — actual is ~26+ files
- `mcp/`: "34 tools + 8 resources" — verified accurate
- `api/`: "18 modules" — stale; actual is ~28+

**Action required:** Either remove specific module counts (drift-prone) or update them.

---

## Finding 15 — LINKS CHECK

Primary linked documents verified as present:

| Link in architecture.md | Exists? |
|------------------------|---------|
| `docs/vision/blueprint.md` | ✓ (referenced) |
| `docs/reference/api-surface.md` | ✓ |
| `docs/reference/mcp-tools.md` | ✓ (referenced in mcp section) |
| `docs/architecture/memory-system.md` | ✓ |
| `docs/architecture/agent-skill-architecture.md` | ✓ |
| `docs/architecture/sprint-lifecycle.md` | ✓ |
| `docs/adr/README.md` | to check separately (adr/ dir exists) |
| `docs/adr/065-develop-product-repo-split.md` | listed in Related Documentation |

`docs/architecture/adr/` directory exists. Reference links appear intact.

---

## Accurate Claims (What Is Correct)

- Top-level directory structure (orchestra/, core/, agents/, cli/, mcp/, api/, monitor/, connectors/, nervous/, extensions/, dashboard/, providers/) — all exist ✓
- `brain.ts` as re-export layer (~53 lines claim) — consistent with architecture ✓
- MCP tool count: 34 tool handlers verified ✓
- MCP resource count: 8 resources verified ✓
- Memory V2 `memory.db` as SSOT with `exports/` — accurate ✓
- ADR-008 import rules description — accurate and up-to-date ✓
- Routing v2 three-layer description (intent-classifier → activation-engine → routing-engine) — all 3 files confirmed in `src/core/` ✓
- `src/nervous/` structure (observer, detector-registry, decision-engine, dispatcher, executor) — all confirmed present; additional files expected ✓
- Sprint lifecycle phase table (DIRECTIVE → PLAN → SPAWN → AUDIT_START → EXECUTE → AUDIT_STOP → EVALUATE → FIX → RETRO → DECAY → TRANSITION) — consistent with orchestra/ files ✓
- Plugin system (`src/core/plugin.ts`, `src/core/plugin-hooks.ts`) — both confirmed ✓
- 4-layer config resolution — consistent with `src/core/config.ts` structure ✓

---

## Prioritized Fix List

| Priority | Finding | Action |
|---------|---------|--------|
| **P1** | F1 — `src/agent/` undocumented | Add new §2 module entry for native agent runtime |
| **P1** | F8 — Sprint-32 helpers ghost entries | Remove 10 non-existent files; add actual helpers |
| **P1** | F10 — `rate-limiter.ts` wrong location | Fix: it's `src/core/rate-limiter.ts` not `src/api/` |
| **P2** | F4 — `bedrock.ts` provider missing | Add to providers table; update ProviderName type doc |
| **P2** | F5 — spawn-backend split | Document 4 separate files |
| **P2** | F9 — chat command cluster undocumented | Add `chat` REPL section to CLI commands |
| **P2** | F10 — terminal/ subsystem | Add WebSocket terminal section to §3.6 or §12 |
| **P2** | F11 — connectors voice/identity | Document new modalities |
| **P2** | F2 — `src/mcp-client/` | Add to §2 |
| **P3** | F12 — core/ load-bearing omissions | Expand §3.1 to mention memory-store, routing-engine |
| **P3** | F6 — monitor finding-ledger | Add 6th module |
| **P3** | F7 — agents agentic-worker cluster | Add agentic worker section |
| **P3** | F13 — orchestra undocumented files | Add managed-docs/, autonomous/ at minimum |
| **P3** | F14 — stale module counts | Remove or update counts |
| **P3** | F3 — `src/training/` | Add brief entry |

---

*Audit completed 2026-06-28. Verification method: `find /workspace/src -maxdepth 2 -type d`, `ls` on all key subdirs, full read of `docs/architecture/architecture.md`. No source files were modified.*
