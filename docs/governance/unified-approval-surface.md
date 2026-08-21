# Unified Approval Surface & Perpetual Autonomous Operation — Design

**Status:** DESIGN — **SEALED** (design-stage xverify: codex CONFIRMED
`cross-verify-verdict:sha256:7043476a326d2c73969cdb0b83344598f07c44abf02206af86fd1589691c21a3`,
2026-08-20 — after the verifier corrected one attribution: the stop MARKER lives in the
CLI layer's wrapped sleep, not in runtime-loop). Gemini is CANCELLED as a verifier
(API-only service); cursor's docker verifier CLI remains the 7091 residual.
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
(`src/orchestra/autonomous/runtime-loop.ts:510-545`, `for(;;)` + interval sleep +
abort/max-iteration guards; the stop MARKER is checked by the CLI layer's sleep,
`src/cli/commands/autonomous.ts:1370-1374`), trigger sources backlog/scheduled-flow/reactive/work-generator, hand-written
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
L6 **Supervisor**: NO new `deckent loops` surface (owner correction 2026-08-20 —
absorb, never invent): loop list/health/restart capabilities extend the EXISTING
`deckent autonomous` / `deckent process` / `deckent do` surfaces; plus documented
OS service templates (systemd/launchd/Task Scheduler) per EVERY-ENVIRONMENT;
crash → supervisor restart with backoff; reboot → service brings loops back.
L7 **Blocker taxonomy as data**: the measured taxonomy (parked-approval,
provider-authority-hold, recovery-hold, occurrence-authority, lease-lost, sprint
PAUSED classes, checkpoint timeout, cost/budget stops, cascade breaker, panic gate,
stop marker) becomes a typed registry consumed by loops, status surfaces and docs —
AI-legible codes with resolution paths.

### 3.5 Decision ergonomics (owner mandate 2026-08-20, solution-architect identity)

Ergonomics is a SECURITY property: a decision that is hard to give gets skipped,
deferred or rubber-stamped. Mandates: nobody types a 64-char sha256; every surface
shows source · reason · code at a glance; chat surfaces decide with buttons or
`y <code>` / `n <code>`; recurring decisions can be promoted to persistent,
trackable, REMOVABLE rules. Convenience NEVER widens authority: short codes are
addressing sugar only — identity mechanisms, MAC envelopes and the risk-tier
channel matrix are untouched, and critical-tier items can never be decided by a
rule, a timeout or a button habit.

**Short code.** Deterministic human code per pending item: first 25 bits of
sha256(requestId) → 5 chars of Crockford base32 (no O/0, I/1 confusion; ~33M
space vs tens of concurrent pendings; on collision extend to 6-7 chars). The SAME
code on every surface (CLI, REPL, desktop, Telegram). `decide` accepts short code
OR full id; short codes resolve only against the CURRENT pending set (a stale
code is a typed fail-closed rejection). Nervous's existing 5-char code generator
is ABSORBED by this contract in D2b (no second generator remains).

**Card triple.** One line everywhere:
`#K7X2M · [checkpoint] sprint-9/plan · reason: PLAN phase asks a human · decide: deckent approvals decide K7X2M --allow`

**Chat surfaces.** Inline Approve/Deny buttons (nonce-bound callbacks) for
routine/elevated; critical renders view-only with a deep-link to a live-auth
surface. Text fallback: `y K7X2M` / `n K7X2M`. An "always approve this kind"
button exists ONLY for routine tier and only PROPOSES a rule (below).

**approval-rules.json.** Persistent, trackable, removable automation:
`.deckent/settings/approval-rules.json` (tracked like settings — auditable in
git; no secrets inside):

```
{ schemaVersion: 1, rules: [{
    id: 'rule-<8hex>', createdAt, createdBy, reason,
    match: { origin, actionPattern?, riskTierMax: 'routine' | 'elevated' },
    decision: 'allow' | 'deny',
    source: 'manual' | 'promoted-from:<requestId>',
    expiresAt?, disabled?, disabledAt?, disabledBy?
}]}
```

Engine invariants: (i) critical is TYPE-EXCLUDED from riskTierMax — no rule can
ever match it; (ii) every rule application writes an audit row and the decision
envelope carries `decidedBy: 'rule:<id>'` — no invisible automation; (iii)
approvals bound to autonomous flows are represented as rules in the SAME file,
so `rules disable|remove` detaches them later — automation that cannot be
unwound is a design defect; (iv) NO-AUTO-APPROVE generalizes: a rule is born
only from an explicit owner `--always` promotion or manual authoring, never
minted by the system itself. CLI: `deckent approvals rules
list|show|disable|enable|remove` + `decide --always` (routine-tier promotion).

Slices: **DE1** short-code generator + card format on CLI list/decide and
federated rows; **DE2** approval-rules store + engine on the broker decide path
+ rules CLI + `--always` promotion; **DE3** chat buttons + y/n (merges into D3).
Each slice carries design/implementation/result seals.

## 4. Slices (each lands with tests + gates + xverify seal)

| Slice | Content | Exit proof |
|---|---|---|
| D1 | origin/riskTier/blocking envelope (additive) + federated read-only inbox across all stores + channel views | one `list` shows every pending item with origin; zero behavior change; seal |
| D2a | confirmations + checkpoint decisions through broker (adapter settle-back; auth asymmetry closed) | legacy decide paths delegate; parity pins; seal |
| D2b | autonomous + nervous decisions through broker (NO-AUTO-APPROVE preserved; short-codes kept as aliases) | same; Telegram buttons hit broker; seal |
| D3 | channel completion: Telegram/Slack/Teams relay wired live; VS Code decide wired; gate-acks formalized as routine-ack class | real-device proof per channel; seal |
| D4 | TTL + timeout-disposition normalization (confirmations/autonomous/pairing get TTLs; SLA escalation L5) | no pending item without expiry; seal |
| D5 | legacy decision-surface retirement + i18n debt closure (measured violations) + docs | grep-proof: one decision path per origin; seal |
| DE1 | short codes + source·reason·code card on every listing/decide | same code across surfaces; stale-code fail-closed; seal |
| DE2 | approval-rules.json store + engine + rules CLI + --always promotion | rule-decided envelopes carry decidedBy:rule; rules removable; critical type-excluded; seal |
| DE3 | chat buttons + y/n short text (merged into D3 wiring) | real-device proof; seal |
| L-slices | 3112: L1..L7 in order (lease/heartbeat → occurrence ledger → cumulative budget → SLA → supervisor → taxonomy registry) | real perpetual canary: 24h scheduled watcher loop surviving restart with full evidence chain; seal |

## 5. Explicitly out of scope / owner decision points

- Decision-ergonomics negative space: critical-tier automation stays impossible
  under EVERY convenience (rule, timeout, button habit) — changing that is a
  constitution-level owner amendment, not a slice. approval-rules.json is
  git-tracked by default (enterprise auditability); the owner may opt it into
  gitignore. Biometric/2FA decision channels are future work, not designed here.
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
Design-stage seal COMPLETED: codex CONFIRMED `…691c21a3` after the verifier
channel itself was repaired (the probe-debris shadowing defect below) and after
the verifier corrected the stop-marker attribution — both corrections are part
of this document's §1.3 now. The intermediate HOLD/REFUTED reports remain in
`.analysis/xverify/` as the honest chain.

## D3-delta (2026-08-21, yürütücü-kararı; owner-rapor edildi): risk→tier eşlemesi

Kanal-matrisi "critical view-only" kapısı, zarf-riskTier dilimi (§3.1) inene dek
MEVCUT `ApprovalRequest.risk` alanından türetilir (ikinci-şema açılmaz):
`critical → view-only (deep-link, kanal-karar YOK)`; `high | medium → elevated`;
`low | none → routine`. Tek çevirim-fonksiyonu `channelTierFor(risk)` —
riskTier-zarfı indiğinde bu fonksiyonun tek gövdesi değişir (geri-alınabilirlik).
Callback-payload'ları nonce'lu + ad-uzaylı + KISA-KOD tabanlıdır (Telegram
callback_data 64B sınırı; ham request-id asla payload'a binmez).

## D4 implementation blueprint (2026-08-21) — lifecycle normalization ve closure matrisi

> 2026-08-21 measured-inventory correction: D4.7'nin 22-task taslağı confirmation,
> autonomous direct-decision ve gateway cross-process closure dosyalarını eksik
> bırakıyordu. D4'ün implementation authority'si artık
> `docs/governance/approval-lifecycle-d4-execution.md` içindeki ölçülmüş 50-task
> DAG'dır; aşağıdaki bölüm tarihsel ilk tasarım ve parent design bağlamı olarak
> korunur.

Bu bölüm, SEALED ana tasarımın veya receipt'inin yerine geçmez. D4 için tek additive
blueprint'tir. Kabul birimi config ingress'ten timeout settle-back, audit ve read
view'lara uzanan kapalı production zinciridir; yalnız TTL alanı veya projection
üretmek tamamlanmış sayılmaz.

### D4.1 Tek lifecycle authority ve config görev sınırları

Tek authority, config resolver'ın ürettiği `approval.lifecycle` policy'sidir.
`confirmation`, `autonomous-trigger`, `gateway-pairing` ve `broker-native` origin
profilleri `ttlMs`, `riskTier`, typed `blocking` disposition ve strictly increasing
`slaMs` eşiklerini taşır.

Görev sınırları çakışmaz:

- `src/core/config-types.ts`, public config shape ve input tiplerinin tek sahibidir;
  lifecycle alanları burada additive olarak tanımlanır.
- `src/core/config.ts`, schema admission, defaults, environment/tenant override
  parsing ve ham config ingress'inin sahibidir; resolved policy üretmez.
- `src/core/approval-lifecycle-policy.ts` (**NEW**), admitted config'i tek
  `resolveApprovalLifecycle` yolunda validate/merge eder ve immutable snapshot ile
  `policySnapshotDigest` üretir; config schema/default kopyası tutmaz.

Producer, broker, expiry driver ve relay yalnız resolved snapshot'ı tüketir. Origin
veya consumer-local TTL/default/eşik tabloları yasaktır. Admission positive/finite
TTL ve SLA, SLA'nın strict artması ve TTL'den küçük olması, UTC instant kullanımı ve
critical profilin `proceed-warn`/`allow` olamaması kurallarını doğrular. Override;
risk'i düşüremez, TTL'yi uzatamaz, SLA'yı geciktiremez veya timeout sonucunu daha
izin verici kılamaz. İhlaller typed error ile fail eder; clamp edilmez. Durable
`lastStage` ve injected epoch clock authority'dir; process timer yalnız sweep'i
uyandırabilir.

### D4.2 Contract, broker mirror ve üç producer

`src/core/approval-contract.ts`, `ApprovalRequest` için additive versioned
`riskTier`, `blocking`, `expiresAt` ve digest zarfını tanımlar. Legacy `risk` yalnız
backward-compatible input'tur ve tek policy resolver üzerinden normalize edilir.
`src/core/approval-store.ts`, v1'i side-effect olmadan okuyup source version'ı korur;
yeni write/mirror yalnız normalized versioned envelope yazar. Parse failure'ı
routine'a düşürmek veya eksik alanları tekrar v1 olarak yazmak yasaktır.

Üç producer yeni kayıt anında `expiresAt = createdAt + ttlMs` ve digest üretir:

- Confirmation producer **ve store aynı mevcut yüzeydedir**:
  `src/core/confirmation-store.ts` içindeki `createConfirmationRequest`.
- Autonomous pending store ve producer mevcut
  `src/orchestra/autonomous/approval-adapter.ts` içindedir. Ayrı store extraction'ı
  ancak ölçülmüş bir modül sınırı ihtiyacıyla ileride gerekçelendirilebilir; D4'ün
  default wiring target'ı değildir.
- Pairing producer/store/parser'ın canonical mevcut yolu
  `src/connectors/gateway/gateway-access.ts`'dir. Production object-map
  `Record<pairingId, PendingPairing>` burada parse edilir ve yazılır.

Overflow/invalid instant typed write error'dür. `src/core/approval-lifecycle-migration.ts`
(**NEW**) expiry'siz legacy kayıtları deterministik ve idempotent biçimde sınıflandırır;
sweep anını yeni başlangıç yapamaz. Invalid timestamp quarantine + audit üretir.

### D4.3 Pairing parser parity — BLOCKS_CURRENT_DONE

Pairing object-map parity D4 kapsamında **BLOCKS_CURRENT_DONE**'dır. Canonical parser
`src/connectors/gateway/gateway-access.ts` içinde kalır; hem production store hem
`src/core/approval-inbox-federation.ts` federated object-map consumer'ı aynı parser
contract'ını kullanır. Federation içinde ikinci schema, array-only fixture parser'ı
veya shape reimplementation açılamaz. Gerekli legacy array branch'i canonical
parser'da duplicate/missing id ve invalid timestamp'i typed fail-honest quarantine
sonucuna çevirir; sonraki write object-map'tir. Bu production call-site ve fixture
kanıtı kapanmadan D4 done olamaz.

### D4.4 Timeout closure, SLA ve audit

Timeout insan kararı değildir. Receipt `actor: 'system:expiry'`,
`kind: 'timeout-disposition'`, policy digest ve önceki SLA stage'ini taşır; insan
allow/deny veya `decidedBy` gibi render edilmez.

| Origin | Timeout settle-back | Yasak sonuç |
|---|---|---|
| confirmation | typed `UNDECIDABLE`, confirmation `park` | allow/proceed veya sahte insan deny'ı |
| autonomous-trigger | replay çağırmadan `park-with-alert` | trigger replay/approve |
| gateway-pairing | `deny/expire`, access grant çağırmadan | pairing/token/access verme |
| broker-native | resolved blocking; critical için deny/park/escalate→park | critical allow/proceed |

`src/core/pending-approvals.ts` pending ingress'i sağlar;
`src/core/approval-expiry-driver.ts` first-writer-wins timeout closure ve critical
exhaustive guard'ı uygular. Mevcut
`src/orchestra/approval-decision-federation.ts`, timeout sonucunu origin adapter'ına
settle-back eden consumer'dır. Böylece no-proceed, no-expiry-less pending,
no-replay ve no-access-grant yolları production sınırlarında korunur.

`src/core/approval-sla.ts` (**NEW**) durable `initial -> renotify ->
alternate-channel -> park-alert -> expired` state/outbox zincirini kurar. Stable
`eventId = requestId + policySnapshotDigest + stage`, first-writer-wins receipt ve
outbox cursor restart/retry spam'ini önler; missed stages ordinal sırayla birer kez
catch-up edilir. Audit ikinci authority kurmaz: timeout ve stage receipt'leri mevcut
`src/core/audit-writer.ts` primitive'iyle yazılır. Ayrı durable schema/sink için
kanıtlanmış ihtiyaç oluşmadıkça yeni audit modülü yoktur.

Relay core canonical yolu `src/core/approval-relay.ts`'dir; durable SLA event'ini
route/idempotency contract'ıyla tüketir. Gerçek channel attach ingress'i
`src/connectors/approval-clients-wire.ts` üzerinden mevcut client'lara bağlanır ve
ack/cursor'ı durable kaydeder. CLI ve MCP yalnız read-only consumer'dır.

### D4.5 production wiring — exact closure chain

**production wiring** şu exact sırada kapanır:

1. `src/core/config-types.ts` → `src/core/config.ts` →
   `src/core/approval-lifecycle-policy.ts` (**NEW**): typed ingress, schema/default,
   validation/merge ve immutable resolve/digest.
2. Policy → `src/core/confirmation-store.ts#createConfirmationRequest` +
   `src/orchestra/autonomous/approval-adapter.ts` +
   `src/connectors/gateway/gateway-access.ts`: üç producer expiry/digest yazar.
3. Producers → `src/core/approval-contract.ts` → `src/core/approval-store.ts`:
   normalized broker mirror/store ve legacy source reference.
4. Pairing parser → `src/core/approval-inbox-federation.ts`: canonical object-map
   federated read; parity closure bu kenarda zorunludur.
5. Store/status → `src/core/pending-approvals.ts` →
   `src/core/approval-expiry-driver.ts` → `src/core/approval-sla.ts` (**NEW**):
   startup/scheduled sweep, durable SLA state, expiry receipt ve outbox.
6. Outbox → `src/core/approval-relay.ts` →
   `src/connectors/approval-clients-wire.ts`: relay routing ve gerçek channel attach.
7. Timeout → `src/orchestra/approval-decision-federation.ts` → üç mevcut origin
   adapter/store: typed settle-back; replay ve access-grant kenarları yoktur.
8. Closure → `src/core/audit-writer.ts` →
   `src/cli/commands/approvals.ts` ve `src/mcp/tools/approvals.ts`: shared durable
   audit primitive ve read-only views.

Tek enablement gate `approval.lifecycle.enabled`'dır. Gate açılmadan config validation
ve migration dry-run geçer. Origin-local hidden flag yoktur. Production proof aynı
request id için config→producer→broker→federated read→SLA/outbox→relay/channel→
settle-back→audit/read-view correlation'ını ve bütün fail-closed negative yolları
göstermelidir.

### D4.6 Geriye uyumluluk ve negative space

Stored v1 ve expiry'siz legacy kayıtlar tek adapter/migration yolundan okunur; yeni
write geriye dönmez. D5 decision-surface retirement/i18n, Slack/Teams credential
provision, L1–L4/L6–L7 ve 24h canary D4'e alınmaz. CLI/MCP stage, event veya decision
üretmez. D4, SEALED ana tasarımı ya da receipt'i değiştirmez.

### D4.7 File-disjoint micro-task DAG

**File-disjoint** kuralı: her production ve test dosyası yalnız bir task write-set'inde
bulunur. Shared choke-point'ler dependency ile serialize edilir. `NEW` etiketi yalnız
var olmayan yeni modülleri gösterir. Her task kendi scoped testini çalıştırır; hiçbir
task repo-global `tsc` çalıştırmaz. Bağımsız satırlar worker pool'da paralel yürür.

| Task / wave | Tekil write set | Hedef / proof | Depends | Scoped test |
|---|---|---|---|---|
| A / W1 config types | `src/core/config-types.ts`; `tests/core/config-types-approval-lifecycle.test.ts` | typed lifecycle ingress | — | `npx vitest run tests/core/config-types-approval-lifecycle.test.ts` |
| B / W1 config schema | `src/core/config.ts`; `tests/core/config-approval-lifecycle.test.ts` | schema/default/override admission | A | `npx vitest run tests/core/config-approval-lifecycle.test.ts` |
| C / W2 policy | `src/core/approval-lifecycle-policy.ts` (**NEW**); `tests/core/approval-lifecycle-policy.test.ts` | validate/resolve/digest; critical/weak override rejection | A, B | `npx vitest run tests/core/approval-lifecycle-policy.test.ts` |
| D / W1 contract | `src/core/approval-contract.ts`; `tests/core/approval-contract-lifecycle.test.ts` | additive versioned envelope | — | `npx vitest run tests/core/approval-contract-lifecycle.test.ts` |
| E / W2 broker store | `src/core/approval-store.ts`; `tests/core/approval-store-lifecycle.test.ts` | v1 read, normalized next-write/mirror | C, D | `npx vitest run tests/core/approval-store-lifecycle.test.ts` |
| F / W3 confirmation | `src/core/confirmation-store.ts`; `tests/core/confirmation-lifecycle.test.ts` | `createConfirmationRequest`, expiry/digest, park hook | C, E | `npx vitest run tests/core/confirmation-lifecycle.test.ts` |
| G / W3 autonomous | `src/orchestra/autonomous/approval-adapter.ts`; `tests/orchestra/autonomous/approval-lifecycle.test.ts` | pending producer/store, settle hook, no replay | C, E | `npx vitest run tests/orchestra/autonomous/approval-lifecycle.test.ts` |
| H / W3 pairing parser | `src/connectors/gateway/gateway-access.ts`; `tests/connectors/gateway/gateway-access-lifecycle.test.ts` | producer/store/parser, object-map + legacy branch, no grant | C, E | `npx vitest run tests/connectors/gateway/gateway-access-lifecycle.test.ts` |
| I / W4 federated inbox | `src/core/approval-inbox-federation.ts`; `tests/core/approval-inbox-federation-parity.test.ts` | canonical parser consumer; object-map parity | H | `npx vitest run tests/core/approval-inbox-federation-parity.test.ts` |
| J / W4 migration | `src/core/approval-lifecycle-migration.ts` (**NEW**); `tests/core/approval-lifecycle-migration.test.ts` | deterministic expiry-less sweep/quarantine | F, G, H | `npx vitest run tests/core/approval-lifecycle-migration.test.ts` |
| K / W4 pending ingress | `src/core/pending-approvals.ts`; `tests/core/pending-approvals-lifecycle.test.ts` | no-expiry-less status/startup ingress | E, J | `npx vitest run tests/core/pending-approvals-lifecycle.test.ts` |
| L / W5 expiry closure | `src/core/approval-expiry-driver.ts`; `tests/core/approval-expiry-driver-lifecycle.test.ts` | first-writer-wins matrix + critical no-proceed | C, K | `npx vitest run tests/core/approval-expiry-driver-lifecycle.test.ts` |
| M / W5 SLA/outbox | `src/core/approval-sla.ts` (**NEW**); `tests/core/approval-sla.test.ts` | monotonic durable stage/outbox, retry/restart | C, L | `npx vitest run tests/core/approval-sla.test.ts` |
| N / W6 settle-back | `src/orchestra/approval-decision-federation.ts`; `tests/orchestra/approval-decision-federation-timeout.test.ts` | confirmation/autonomous/pairing typed settle-back | F, G, H, L | `npx vitest run tests/orchestra/approval-decision-federation-timeout.test.ts` |
| O / W6 audit reuse | `src/core/audit-writer.ts`; `tests/core/audit-writer-approval-timeout.test.ts` | system-expiry/stage receipt on shared primitive | L, M | `npx vitest run tests/core/audit-writer-approval-timeout.test.ts` |
| P / W6 relay core | `src/core/approval-relay.ts`; `tests/core/approval-relay-sla.test.ts` | exact event route, durable idempotency contract | M | `npx vitest run tests/core/approval-relay-sla.test.ts` |
| Q / W7 channel attach | `src/connectors/approval-clients-wire.ts`; `tests/connectors/approval-clients-wire-sla.test.ts` | real client attach, ack/cursor, no-spam | P | `npx vitest run tests/connectors/approval-clients-wire-sla.test.ts` |
| R / W7 CLI view | `src/cli/commands/approvals.ts`; `tests/cli/approvals-sla-view.test.ts` | read-only receipt/audit view | I, N, O | `npx vitest run tests/cli/approvals-sla-view.test.ts` |
| S / W7 MCP view | `src/mcp/tools/approvals.ts`; `tests/mcp/approvals-sla-view.test.ts` | read-only receipt/audit view | I, N, O | `npx vitest run tests/mcp/approvals-sla-view.test.ts` |
| T / W7 pairing negative proof | `tests/connectors/gateway/pairing-no-access-grant.integration.test.ts` | parser→federation→timeout no-access-grant | H, I, L, N | `npx vitest run tests/connectors/gateway/pairing-no-access-grant.integration.test.ts` |
| U / W7 autonomous negative proof | `tests/orchestra/autonomous/approval-no-replay.integration.test.ts` | timeout settle-back never invokes replay | G, L, N | `npx vitest run tests/orchestra/autonomous/approval-no-replay.integration.test.ts` |
| V / W7 closure correlation | `tests/core/approval-lifecycle-closure.integration.test.ts` | config→three producers→broker→SLA→relay→settle→audit | F, G, H, I, M, N, O, P, Q | `npx vitest run tests/core/approval-lifecycle-closure.integration.test.ts` |

W1–W3 policy/contract ve producer hazırlığını geniş paralel dallarda kurar; W4 parity,
migration ve pending choke-point'lerini; W5 expiry/SLA'yı; W6 settle/audit/relay'i;
W7 channel, iki read view ve bağımsız negative/correlation proof'larını kapatır.
Pairing parity `I` ve `T` geçmeden current done değildir. Wave-sonu Brain gate ayrı
orchestrator adımıdır; repo-global typecheck yalnız orada, bütün file-disjoint
micro-task'lar tamamlandıktan sonra çalıştırılabilir.
