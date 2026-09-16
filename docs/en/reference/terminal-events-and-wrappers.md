# Terminal, event, and worker-wrapper contracts

## Product-user perspective

Deckent has three related but distinct terminal surfaces: the native CLI/Ink REPL, the embedded web terminal over HTTP/WebSocket, and Desktop's client of that server contract. They share product language and execution authority, but they do not share process or authentication state by assumption. [Evidence: `.deckent/workspace/IDENTITY.md:8-9,16`; `src/cli/repl/app.tsx`; `src/api/terminal/session-manager.ts`; `src/desktop/src/shared/desktop-api.ts`]

### Native REPL interaction contract

The native REPL owns line editing, history, queued turns, slash/tool dispatch, approval cards, run-flow inbox, live footer and provider/session control through separated modules. Tool execution passes through a permission classifier and registered bridge; rendering a tool name is not permission to execute it. [Evidence: `src/cli/repl/line-edit.ts`; `src/cli/repl/input-history.ts`; `src/cli/repl/input-queue.ts`; `src/cli/repl/tool-permissions.ts`; `src/cli/repl/native-tool-registry.ts`]

Input behavior has pure seams for cursor movement, Home/End, deletion, Ctrl bindings, history, single-line paste and width-aware footer rendering. Bracketed multi-line paste, raw-mode negotiation, terminal-specific escape bytes and Ink's real resize behavior still require a PTY/terminal smoke; pure tests cannot certify them. [Evidence: `tests/cli/repl/term-compat-matrix.test.ts:1-39,58-224`; `src/cli/repl/input-bar.tsx`; `scripts/repl-smoke-verify.mjs`]

Use `--no-color` or `NO_COLOR` to suppress color; `FORCE_COLOR` has higher precedence. Truecolor/256-color output is selected only when explicitly forced or a dark background is safely identified; otherwise output degrades to ANSI16. The palette maps semantic roles such as success, error, warning, info, muted and accent instead of embedding feature-local escape codes. [Evidence: `src/cli/helpers/theme.ts:1-109,119-163`; `src/cli/helpers/generated/palette.ts`]

### Plain risk language

Command discovery has four canonical plain-language classes: `Oku` (read-only), `Değiştir` (local-state modification), `Çalıştır` (execution/process or stronger confirmation) and `Otonom` (continuous-loop control). `Otonom` is a different control mode, not a claim that it is linearly more dangerous than every `Çalıştır` action. The registry attaches one class to each cross-surface command; native chat and term-mode use that metadata for confirmation or mode gates. [Evidence: `src/cli/command-registry.ts:34-38,55-73`; `src/cli/commands/chat-native.ts:666-676`; `src/cli/repl/term-mode.ts:25-38,94-126`]

Deckent retains its domain-specific internal vocabularies—approval risk, Nervous risk, tool risk/trust and REPL permission—and defines pure, display-only mappings into `CommandRisk`. Localized EN/TR labels and descriptions exist in the message catalog. The renderer itself currently has no production importer, so the complete localized ladder is not yet a live discovery surface. [Evidence: `src/cli/helpers/risk-language.ts:1-20,31-59,62-173`; `src/cli/helpers/messages.ts:4783-4806`; source import scan, 2026-08-01]

`cleanup` and `recover` expose an unresolved cross-layer mismatch: their command-registry class is `Değiştir`, while the non-bypassable every-call confirmation tier maps to `Çalıştır`. The tests preserve this discrepancy explicitly rather than selecting a product-authority answer. Therefore clients must not infer approval policy solely from the registry label; OQ-27 records the required owner decision. [Evidence: `src/cli/command-registry.ts:204-207`; `src/cli/repl/tool-permissions.ts:15-35`; `src/cli/helpers/risk-language.ts:65-78`; `tests/cli/risk-language.test.ts:70-92`]

### Embedded terminal security

Terminal session creation/list/termination and the WebSocket gateway use terminal-specific types, session manager, backend and authentication. Command and prompt guards constrain what a session can execute; outbound limits prevent an unbounded client from becoming a resource authority. [Evidence: `src/api/terminal/types.ts`; `src/api/terminal/session-manager.ts`; `src/api/terminal/session-backend.ts`; `src/api/terminal/command-guard.ts`; `src/api/terminal/prompt-guard.ts`; `src/api/terminal/outbound-limiter.ts`]

The bootstrap token endpoint is loopback-only and requires valid API bearer context. A WebSocket token is validated by the terminal auth path, not by treating the generic API-auth bypass as sufficient. Terminal audit modules record actions and integrity evidence separately. [Evidence: `src/api/server.ts:2567-2708`; `src/api/terminal/ws-gateway.ts`; `src/api/terminal/auth-provider.ts`; `src/api/terminal/audit.ts`; `src/api/terminal/audit-integrity.ts`]

### Event envelope

The persisted event protocol is version `1.0`:

| Field | Meaning |
|---|---|
| `timestamp` | ISO event time. |
| `sequence` | Monotonic per-run sequence. |
| `protocol_version` | Literal `1.0`. |
| `source`, `target` | Brain, Worker, Auditor, Deckent, user, broadcast, or an extension identity. |
| `channel` | Stable channel code. |
| `payload` | Channel-specific structured data. |
| `correlationId`, `causationId` | Optional execution-request lineage. |

[Evidence: `src/core/event-stream.ts:22-54,67-80`]

Events append to `.deckent/<run>-events.jsonl` with a separate sequence file. Legacy heartbeat/result artifacts coexist for compatibility. Per-run reads can filter source, target, channel and minimum sequence; the in-process event bus adds sprint/channel subscriptions without replacing the durable log. [Evidence: `src/core/event-stream.ts:1-20,197-215,322-430`; `src/orchestra/event-bus.ts:27-126`]

### Channel families

| Family | Canonical examples | Intended consumer |
|---|---|---|
| Brain↔Worker | `TASK_ASSIGN`, `HEARTBEAT`, `RESULT`, `QUESTION`, `ANSWER` | Task coordination and liveness. |
| Worker/Auditor→Brain | `CODE_VERIFY_REQUEST`, `VERIFICATION_RESULT`, `SCOPE_COLLISION_DETECTED`, `ADR_VIOLATION`, `GATE_COMPUTED` | Independent verification and gating. |
| Broadcast/progress | `ACTIVITY`, `METRIC_EMITTED`, `SPRINT_PHASE_CHANGE`, `PROGRESS` | CLI watch, MCP watch, terminal/Desktop projections. |
| Recovery | terminalization started/reused/authorized/settled/completed/held | Recovery-only sequence without fabricating ordinary phase replay. |
| User approval | `NOTIFY`, `NERVOUS_NOTIFICATION`, `NERVOUS_APPROVAL_CONSUMED` | Cross-surface request and consumption acknowledgement. |
| Safety/failure | authority violation, timeout, never-dispatched, spawn-blocked, dependency-blocked, auth-failed, path-sanitized | Typed diagnosis and policy response. |

[Evidence: `src/core/event-stream.ts:83-193`]

The event stream is evidence, not sole state authority. Consumers reconcile it with canonical stores, task/result artifacts and terminal receipts; missing event delivery must not turn a failed or held attempt into success. [Evidence: `src/core/run-status-authority.ts`; `src/core/task-settlement-authority.ts`; `src/core/sprint-terminal-publication.ts`]

### Worker wrapper behavior

Worker launchers must preserve these cross-backend invariants:

1. Capture the provider/worker exit status before subsequent shell steps can overwrite it. [Evidence: `src/orchestra/spawn-backend-docker.ts:5570-5597`; `src/orchestra/tmux.ts:250-264`]
2. Treat timeout markers as timeout-pure: only TERM-timeout/KILL outcomes such as 124/137 qualify, and never overwrite an already-written result. [Evidence: `src/orchestra/spawn-backend-docker.ts:5585-5597`; `src/orchestra/tmux.ts:261-263`]
3. Translate controlled SIGTERM to exit 143 and retain the provider observation outcome. [Evidence: `src/orchestra/spawn-backend-docker.ts:5570-5597`; `src/agents/worker.ts:465-505`]
4. Keep heartbeats durable/atomic enough for host liveness checks, while recognizing that stale/missing heartbeat needs process/backend evidence. [Evidence: `src/agents/worker-lifecycle.ts:1-112`; `src/core/worker-heartbeat-authority.ts`; `src/orchestra/sprint-checkpoint.ts:523-566`]
5. Union tracked diff with untracked files so a new file is not invisible to result/disk attribution. [Evidence: `src/agents/agentic-worker-entry.ts:190-270`; `src/orchestra/disk-verify.ts:135-207`; `src/orchestra/result-assembler.ts:322-455`]
6. Re-derive allowed tools from the exact persisted task scope/contract rather than trusting worker-authored or stale launch text. [Evidence: `src/orchestra/spawn-backend-docker.ts:3522-3585,5364-5375`; `src/core/tool-allowlist.ts`]

Exit 137 is only SIGKILL. Docker's OOM flag can strengthen an OOM diagnosis, but a false or unavailable flag does not prove memory was uninvolved; current code deliberately emits an undetermined explanation when evidence cannot select the cause. [Evidence: `src/orchestra/spawn-backend-docker.ts:567-613`]

## Dogfood / repository reality

| Surface | State | Current constraint |
|---|---|---|
| Native REPL source | ✅ live | Bare interactive entry and native chat are wired; `chat --local` help text is stale relative to implementation. |
| Plain risk classes | ⚠️ partial | Registry metadata drives selected gates, but the localized renderer has no production importer and `cleanup`/`recover` disagree across registry and permission layers (OQ-27). |
| Pure terminal compatibility matrix | ✅ test source | Editing/history/width/color seams are covered; this docs pass did not execute the test. |
| Real PTY/platform matrix | ⚠️ HOLD | Multi-line paste, raw mode, escape sequences and actual resize were not exercised on macOS/Windows/WSL2. |
| Embedded terminal server | ✅ live source | Auth/session/ws/audit modules and routes exist; no live server/browser mutation was run here. |
| Event log and bus | ✅ live | Durable JSONL plus in-process subscriptions coexist; long-lived autonomous logs rotate at a bounded threshold. [Evidence: `src/core/event-stream.ts:207-215`] |
| Wrapper invariants | ⚠️ partial | Docker/tmux/source and focused tests cover the contract; full backend×provider×platform certification was not run. |

See [Interactive surfaces](../guide/interactive-surfaces.md), [Evidence and settlement](../operations/evidence-and-settlement.md), and [Platform security](platform-security.md).
