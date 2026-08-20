# Unified Approval Surface & Perpetual Autonomous Operation — Design

**Status:** DESIGN — **DOGRULANACAK / UNVERIFIED** (owner manual verification pending,
Alperen directive 2026-08-20: verifier routes unavailable — codex usage-source down,
cursor docker-CLI unwired [7091], gemini CANCELLED as a verifier [API-only service]).
No claim in §1 may be treated as CONFIRMED until the owner or a live verifier seals it.
(owner-commissioned 2026-08-20; implementation slices land under
MASTER 4056 APPROVAL-SURFACE-UNIFICATION-001 and 3112 AUTONOMOUS-PERPETUAL-001).
**Owner problem statement:** approvals are scattered across `deckent approvals`,
`deckent confirmations`, Nervous accept/reject, autonomous approve/reject, checkpoint,
cost/prompt/scope gate acknowledgements and Brain procedures — a user or an AI locks up
deciding WHERE to answer WHAT. There must be ONE approval surface every request lands
on, with visible origin, effortless deciding on every channel (Telegram/gateway,
terminal, desktop, CLI, MCP where admissible), and rigorously designed certainty,
consistency, bypass-resistance and blocking semantics. Autonomous perpetual loops
(scheduled watchers, event-triggered processes) must integrate with the same surface.
**Verification contract:** design, implementation and result steps each carry an
xverify seal (owner directive).

---

## 1. Inventory (measured 2026-08-20, file:line evidence)

### 1.1 The strong core that already exists — the ApprovalBroker family

One durable contract (`src/core/approval-contract.ts:112-189`): request with MANDATORY
`expiresAt`, MAC-signed decision authorization envelope (keyring per ADR-G-039),
`closureReason:'expired'`. Storage `.deckent/approvals/<id>.request.json` +
`.decision.json` + `.tombstone.json` (`src/core/approval-store.ts:238,257`). TTL sweep
(`src/core/approval-expiry-driver.ts:70-84`) bound to every status read
(`src/core/pending-approvals.ts:113-140`). First-writer-wins, forged/stale/duplicate
fail-closed. Producers already on it: xverify evidence-probe `aprp-`
(`src/core/attended-execution-approval.ts:583-619`), attended-execution hard-stop
`aex-` (`:707-738`), WorkerApprovalGate (`src/core/approval-worker-gate.ts:183-205`),
question bridge (flag-off, `src/orchestra/question-approval-bridge.ts:297-328`),
autonomous v2 mission work-items (`mission-approval-coordinator.ts:71-77,205`),
recovery notifications (`src/nervous/recovery-notification.ts:180-186`), and a
nervous→broker forwarding bridge (`src/nervous/approval-bridge.ts:96-134`).

Decision surfaces on the core: CLI `deckent approvals decide` with interactive-TTY
re-authentication (`src/cli/commands/approvals.ts:131-237`); HTTP decision endpoint
behind `approval.api_decide` + fresh OIDC step-up + idempotency key
(`src/api/server.ts:1816-1900`) consumed by the Desktop shell
(`src/desktop/src/renderer/shell/Shell.tsx:700-728`); REPL approval card; MCP
`deckent_approvals` deliberately READ-ONLY (operating rule §12.2). Written but NOT
live: Telegram/Slack/Teams relay channels (`src/connectors/approval-telegram.ts` et
al. — no production call-site) and the VS Code `approval.decide` TERM-RPC handler
(`src/api/rpc-write-handlers.ts:160-181` — absent from the server handler map,
`src/api/server.ts:648-651`).

### 1.2 The scattered second layer (the problem)

| Surface | Store | Decision path | Auth | TTL | Blocks |
|---|---|---|---|---|---|
| Confirmations `cnf-` (ADR-G-040 ROUTE) | `.deckent/runtime/confirmations/` | `deckent confirmations decide/run` | TTY "yes" | **none** | task verdict parked |
| Nervous accept/reject (+short code) | `.deckent/nervous/nervous-pending.json` + IPC queue | CLI/MCP/API/bot text | **none** | prune only | parked action |
| PanicGuard `panic:<taskId>` | `.deckent/panic-ipc/pending/` | CLI/MCP accept | none | — | spawn (fail-closed) |
| Autonomous approve/reject (triggerId) | `.deckent/autonomous/pending.json` + `decisions.json` | CLI/MCP/API/Telegram button | **none** | **none** (waits forever) | trigger parked; replay-on-approve |
| Checkpoint `checkpoint-<sprint>-<phase>` | `.deckent/checkpoints/` | CLI/MCP file-status mutation | **none** | yes (timeout→park) | **sprint phase blocked** |
| Cost/prompt/scope gates | run state | `--force*` / MCP acknowledge flags | none | n/a | run start blocked |
| Bot risky-tool park `act-` | `.deckent/bot-actions/` | chat approve/reject + buttons | chat-id allowlist | 1h | tool not executed |
| Chat/REPL tool confirm | `.deckent/settings.local.json` allowlist | TTY inline | TTY | n/a | tool call |
| RunFlow start-consent | flow events | REPL inbox / `do --run --yes` | actor field | preview-bound | run start |
| Gateway pairing (code) | `pairings.json` | `deckent gateway` approve | none | none seen | channel access |
| Task-settlement / mount-adopt | projections | CLI `--apply --operator` | justification fields | — | held settlement |

Structural findings: (i) **auth asymmetry** — the broker family is MAC+TTY/OIDC-bound
while checkpoint/nervous/autonomous decisions are unauthenticated file mutations;
(ii) **TTL asymmetry** — broker requests MUST expire, second-layer requests can wait
forever; (iii) **channel fragmentation** — Telegram can decide autonomous/nervous/bot
items but not broker items (relay unwired); VS Code can decide nothing; (iv) i18n
violations in MCP nervous/autonomous decision messages (EN), checkpoint notify
(`sprint-lifecycle.ts:602-604`, TR hardcoded), gate messages (EN).

### 1.3 Autonomous/perpetual infrastructure (measured)

A real perpetual loop already exists: `runAutonomousLoop`
(`src/orchestra/autonomous/runtime-loop.ts:510-545`, `for(;;)` + interval sleep + stop
marker), trigger sources backlog/scheduled-flow/reactive/work-generator, hand-written
dependency-free cron (`src/core/scheduled-flow.ts:46,140`), recurring re-enqueue
(`backlog.ts:207`), durable webhook inbox (`webhook-reactive-source.ts:47`), repo-watch
and Nervous observer (cron tick + fs.watch + event bus, `observer.ts:125-397`),
run-on-approve replay with the NO-AUTO-APPROVE invariant
(`approval-adapter.ts:8-11,313-333`), v2 SQLite mission store with an engine lease
(`mission-engine-wire.ts:246-270`) and an honest guard that PARKS recurring triggers
because the occurrence authority does not exist yet
(`sqlite-mission-store.ts:898-978`, `TRIGGER_OCCURRENCE_AUTHORITY_REQUIRED`).
Multi-layer budget brakes exist per-run/per-execution (cost gate, execution admission,
live budget guard, cascade breaker) — but nothing loop-cumulative.

**Honest gaps for perpetual operation:** (1) no supervisor/keep-alive (crash or reboot
kills the loop silently); (2) no occurrence ledger — missed cron cadences collapse
into one pending flip (ADR-G-039's deferred slice; MASTER 4191); (3) no loop
heartbeat file (Kanun-15 liveness evidence impossible); (4) no cumulative spend
ceiling per loop; (5) no approval SLA/escalation — a parked trigger can starve
forever; (6) v2 `runTask` is a HOLD stub (`autonomous.ts:1090-1094`); (7)
FlowScheduler `lastRunAt` is in-memory; (8) v1 has no cross-process loop fence
(only the MCP pid guard).

---

## 2. Design principles

P1 **Absorb, never duplicate.** The runtime-wide durable ApprovalBroker (MASTER 4050)
IS the unified surface. Every second-layer surface becomes a typed PRODUCER feeding
it; none keeps a private decision path. No second broker, ever (KANUN 10 applied to
authority: one approval SSOT).

P2 **Origin is first-class.** Every request carries a typed `origin` (producer class +
producing subsystem + subject refs) so any channel can render "WHAT is asking and
WHY" without knowing the producer's internals.

P3 **Deciding is trivial; authority is not.** One inbox, one id-shape, one decision
verb on every channel. The CHANNEL a decision may use is a function of the request's
risk tier, never of its producer. Ease of use comes from federation, never from
weakening the decision envelope (MAC + nonce + first-writer-wins + tombstone stay
mandatory for every origin).

P4 **Every pending request expires.** Class-specific TTLs with typed timeout
dispositions (deny / park / auto-proceed-with-warning / escalate). The current
"waits forever" states (autonomous pending, confirmations) are defects to migrate,
not options to keep. Safety floors (PanicGuard KILL-class) always require explicit
decision and never auto-proceed.

P5 **Blocking semantics are declared, not discovered.** Each request states what it
blocks (`run-phase` / `task-verdict` / `tool-call` / `trigger` / `none:advisory`) and
the timeout disposition; loops and sprints read that field instead of guessing.

P6 **Fail-closed on identity, fail-honest on absence.** Unknown/forged/stale/duplicate
decisions are typed rejections with audit; an unreachable channel never silently
downgrades to auto-approve (NO-AUTO-APPROVE invariant generalizes broker-wide).

P7 **Perpetual loops are governed processes.** A loop has a lease, a heartbeat file,
a cumulative budget ledger, an occurrence ledger for its cadences, and an approval-SLA
policy — or it does not run unattended.

## 3. Target architecture

### 3.1 Request envelope (extends the existing approval contract — additive)

```
ApprovalRequest (existing contract) +
  origin: {
    class: 'xverify-probe' | 'attended-execution' | 'worker-gate' | 'confirmation'
         | 'nervous' | 'panic-guard' | 'autonomous-trigger' | 'checkpoint'
         | 'cost-gate' | 'prompt-gate' | 'scope-gate' | 'bot-action'
         | 'runflow-consent' | 'gateway-pairing' | 'settlement-review'
         | 'recovery' | 'question';
    subsystem: string;            // producing module id
    subjectRefs: string[];        // sprintId/taskId/triggerId/flowId/...
    summaryKey: string;           // i18n key — channels render, never hardcode
    summaryParams: Record<string,string>;
  }
  riskTier: 'critical' | 'elevated' | 'routine';
  blocking: { effect: 'run-phase'|'task-verdict'|'tool-call'|'trigger'|'advisory';
              onTimeout: 'deny'|'park'|'proceed-warn'|'escalate' };
```

### 3.2 Decision-channel matrix (policy, config-resolved)

| Channel | routine | elevated | critical | Identity mechanism |
|---|---|---|---|---|
| CLI `deckent approvals decide` | ✔ | ✔ | ✔ | interactive TTY re-auth (existing) |
| Desktop / HTTP decision | ✔ | ✔ | ✔ | OIDC step-up + idempotency (existing) |
| REPL card | ✔ | ✔ | ✔ | in-process TTY |
| Telegram/Slack/Teams relay | ✔ | ✔ | ✖ (view+deep-link) | chat-id allowlist + per-decision nonce; wiring = slice D3 |
| VS Code TERM-RPC | ✔ | ✔ | ✖ | rpc channel + decidedBy; wire existing handler |
| MCP | read-only inbox; `ack`-class only (cost/prompt/scope acknowledgements, which are ALREADY MCP-exposed today) | ✖ | ✖ | unchanged §12.2 — widening MCP beyond ack-class is an explicit owner amendment, not a slice |

Rationale: §12.2 stays intact for broker decisions; the matrix legalizes exactly what
exists (MCP acknowledge flags) as the `routine-ack` class instead of pretending MCP
has no decision power today.

### 3.3 Federation before migration (how we avoid a big-bang)

D1 federates READS: `deckent approvals list` (+ API/desktop/REPL/Telegram views) shows
ALL pending items — broker-native rows plus adapter-projected rows from the legacy
stores (confirmations, nervous, autonomous, checkpoint, bot-actions, pairing), each
tagged with origin and its CURRENT decision command. One inbox immediately, zero
behavior change. D2+ then migrates decision paths origin-by-origin onto broker
decisions (adapter translates the settled broker decision back into the legacy
store's settle call), retiring each legacy decision surface only after its parity
proof. This mirrors the 4055 Nervous-settlement plan and the 3111 v2-cutover pattern.

### 3.4 Perpetual-loop governance (3112 scope)

L1 **Loop identity + lease**: every unattended loop (autonomous v1/v2, nervous
observer, monitor scan, heartbeat daemon, bot daemon) registers a LoopHandle
(id, lease, pid+start-token) — v2's MissionEngineLease generalized.
L2 **Loop heartbeat**: mtime-refreshed heartbeat file per loop (Kanun-15 evidence);
death-sweep generalized from run-flows to loops.
L3 **Occurrence ledger** (completes ADR-G-039's deferred slice / MASTER 4191):
cron cadences materialize as occurrence rows (id = flowId+scheduledAt), dedup,
missed-occurrence policy (`skip`/`coalesce`/`backfill-N`), audit.
L4 **Cumulative budget**: per-loop rolling spend/token ledger with a hard ceiling →
typed `LOOP_BUDGET_EXHAUSTED` park (never silent).
L5 **Approval SLA**: pending age thresholds per class → escalate channel
(re-notify → alternate channel → park-with-alert); starvation becomes visible,
never eternal.
L6 **Supervisor**: `deckent loops` surface (list/health/restart) + documented OS
service templates (systemd/launchd/Task Scheduler) per EVERY-ENVIRONMENT; crash →
supervisor restart with backoff; reboot → service brings loops back.
L7 **Blocker taxonomy as data**: the measured taxonomy (parked-approval,
provider-authority-hold, recovery-hold, occurrence-authority, lease-lost, sprint
PAUSED classes, checkpoint timeout, cost/budget stops, cascade breaker, panic gate,
stop marker) becomes a typed registry consumed by loops, status surfaces and docs —
AI-legible codes with resolution paths.

## 4. Slices (each lands with tests + gates + xverify seal)

| Slice | Content | Exit proof |
|---|---|---|
| D1 | origin/riskTier/blocking envelope (additive) + federated read-only inbox across all stores + channel views | one `list` shows every pending item with origin; zero behavior change; seal |
| D2a | confirmations + checkpoint decisions through broker (adapter settle-back; auth asymmetry closed) | legacy decide paths delegate; parity pins; seal |
| D2b | autonomous + nervous decisions through broker (NO-AUTO-APPROVE preserved; short-codes kept as aliases) | same; Telegram buttons hit broker; seal |
| D3 | channel completion: Telegram/Slack/Teams relay wired live; VS Code decide wired; gate-acks formalized as routine-ack class | real-device proof per channel; seal |
| D4 | TTL + timeout-disposition normalization (confirmations/autonomous/pairing get TTLs; SLA escalation L5) | no pending item without expiry; seal |
| D5 | legacy decision-surface retirement + i18n debt closure (measured violations) + docs | grep-proof: one decision path per origin; seal |
| L-slices | 3112: L1..L7 in order (lease/heartbeat → occurrence ledger → cumulative budget → SLA → supervisor → taxonomy registry) | real perpetual canary: 24h scheduled watcher loop surviving restart with full evidence chain; seal |

## 5. Explicitly out of scope / owner decision points

- Widening MCP decision power beyond the routine-ack class (operating-rule §12.2
  amendment — owner-only).
- Voice connectors (no approval surface exists; future channel).
- v2 `runTask` executor closure is 3111's own acceptance, a 3112 prerequisite.

## 6. Stage-based verification contract (owner directive, hardened 2026-08-20)

Design, implementation and RESULT are three SEPARATE verification processes —
a result-stage seal never substitutes for the design- or implementation-stage
seal; each stage seals BEFORE its closure. Current design-stage status:
UNVERIFIED — five codex attempts returned typed HOLD (`candidate_not_eligible`
← limit `source_unavailable`: the usage window could not be read at all, not a
saturation), gemini is CANCELLED as a verifier (API-only service, no
subscription CLI), cursor's docker verifier CLI is the planned 7091 residual.
Owner decision: the inventory claims in §1 stay marked DOGRULANACAK and the
owner verifies them manually; the HOLD reports live in `.analysis/xverify/`.
