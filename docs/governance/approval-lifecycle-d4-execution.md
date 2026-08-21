# Approval lifecycle D4 execution contract

Status: implementation-ready; formal design seal deferred by owner after typed
provider HOLD; Opus 5 advisor blockers incorporated before dispatch
Owner outcome: MASTER 4056 / D4
Measured at: 2026-08-21

## 1. Outcome and authority

D4 removes every expiry-less pending approval from the confirmation,
autonomous-trigger, gateway-pairing and broker-native classes. The only lifecycle
authority is the resolved `approval.lifecycle` snapshot. Task 3 owns the shared
clock contract, risk mapping and origin-specific timeout-disposition allowlist
consumed by every producer/store/broker/fallback/relay. A producer-local timeout,
consumer-local risk table or decision-time expiry reset is forbidden.

The accepted production unit is the complete chain:

`config -> policy snapshot -> producer -> durable store/broker -> pending index ->
SLA/outbox -> relay/channel -> timeout settle-back -> audit/read view`.

No individual field, schema or unit test closes D4 on its own.

## 2. Measured inventory corrections

The first read-only inventory invalidated the narrower 22-task draft in
`unified-approval-surface.md` D4.7. This document is the additive execution
authority for D4; the sealed parent design and earlier D1-D3 evidence remain intact.

### 2.1 Confirmation

- `ConfirmationRequest` has `requestedAt` but no expiry, risk envelope or SLA.
- Human, LLM and code adapters can remain pending indefinitely.
- The broker mirror is created only at decision time and starts a local 24-hour
  clock then; it does not expire the original confirmation.
- Broker timeout has no confirmation settle-back consumer. The existing mapping
  also labels a system result as human.
- Corrupt records can break the whole store read; there is no quarantine.
- A confirmation verdict can be downgraded even if its durable write failed.
- The current id ignores evidence/revision/generation and settled always wins.
  Expiry would otherwise tombstone that logical confirmation forever.

### 2.2 Autonomous

- Legacy v1 `pending.json` records are expiry-less and lose their source
  EffectClass/risk. Direct CLI, MCP, API and bot decisions do not check age.
- A lazy broker mirror can expire while the original pending record remains
  approvable. There is no timeout settle-back and no no-replay closure.
- Goal-v2 has a local 15-minute TTL, but starts it at `item.createdAt`; delayed
  dependency readiness can therefore publish a request already expired.
- `ApprovalBroker.expire()` and `ApprovalStore.sweepExpired()` do not currently
  produce byte-equivalent typed closure evidence.

### 2.3 Gateway pairing

- Production writes an object-map, while the federated inbox accepts only an
  array fixture. A real pairing becomes `unreadable` in the unified inbox.
- The producer stores neither exact project/tenant scope nor an opaque durable id;
  the six-digit code is both primary identity and human alias.
- Access state is loaded once. CLI and daemon processes can overwrite one another
  from stale snapshots, resurrect a removed pairing, or miss a fresh allowlist.
- Pairing approve is not crash-atomic across pairing removal and allowlist grant.
- Pairing has no TTL, sweep, quarantine or timeout receipt. Current live inventory
  is zero pending pairings; absence of live rows is not proof of lifecycle safety.

### 2.4 Risk and channel consumers

The v1 five-level request field `risk` remains a backward-compatible input. D4 adds
the three-level `riskTier` (`routine | elevated | critical`) envelope and makes it
authoritative for channel, automation and lifecycle decisions. Every existing
channel, authenticator and rule consumer must read the normalized tier. Only the
lifecycle resolver maps legacy `none/low -> routine`, `medium/high -> elevated`,
`critical -> critical`; consumer-local mapping tables are forbidden. A compatibility
reader may derive the tier without mutating the source record; no producer may
write a downgraded tier.

Signed v1 decisions add a second compatibility invariant: the request digest is
version-aware and hashes the exact source contract shape. Reading a stored v1
record must not inject an enumerable default and thereby invalidate an already
signed MAC after restart. Normalization therefore carries source version/digest
lineage; authorization validation chooses the matching canonical digest shape.

Critical guards in policy, fallback, worker gate, allow-scope and Nervous are part
of the same authority closure. Updating only button/render consumers would leave
runtime authorization bypasses, so all five are explicit tasks below.

## 3. Default policy

All durations are UTC epoch arithmetic. `slaMs` contains the due offsets for
`renotify`, `alternate-channel` and `park-alert`; `initial` is emitted at creation
and `expired` is emitted at `ttlMs`.

| Profile | ttlMs | slaMs | riskTier floor | timeout disposition |
|---|---:|---|---|---|
| confirmation | 28,800,000 (8h) | 300,000; 1,800,000; 7,200,000 | elevated | `UNDECIDABLE` and park |
| autonomous-trigger | 3,600,000 (1h) | 120,000; 600,000; 1,800,000 | elevated | park-with-alert, never replay |
| gateway-pairing | 600,000 (10m) | 60,000; 180,000; 420,000 | critical | deny/expire, never grant |
| broker-native | 1,800,000 (30m ceiling) | 120,000; 600,000; 1,200,000 | routine | request default, critical never allow/proceed |

These defaults balance interactive UX and bounded security exposure. Confirmation
allows a work session; autonomous work parks within an hour; pairing codes have a
short attack window; broker-native preserves a producer-requested shorter expiry
but can never exceed its profile ceiling:
`effectiveExpiresAt = min(producerExpiresAt, createdAt + profile.ttlMs)`. The
30-minute value is a maximum/fallback, never a replacement for existing shorter
producer windows. A request whose effective expiry precedes a later SLA threshold
skips that stage with typed `effective-expiry-precedes-stage` evidence and expires;
the clock is never reset.

`riskTier` is a floor, not a replacement value:

`effectiveRiskTier = max(profile.riskTier, mapLegacyRisk(producerRisk))`.

Confirmation security kinds and autonomous destructive/risk-tagged work resolve to
critical even though their origin floors are elevated. Pairing is critical and is
never decidable by the requesting chat identity. Routine broker `proceed-warn` is
available only to an exact allowlisted request kind; legacy `defaultAction` alone
cannot grant it.

Override invariants are fail-closed. A tenant/project layer may shorten TTL, advance
SLA, raise risk or strengthen the blocking disposition. It may not lengthen TTL,
delay SLA, lower risk, turn a blocking timeout into proceed/allow, or disable the
critical guard. Invalid values are rejected, never clamped.

## 4. Durable lifecycle contract

- New records carry a version, origin, `createdAt`, `expiresAt`, `riskTier`, typed
  `blocking`, `policySnapshotDigest`, source reference and current SLA stage.
- Confirmation identity includes source/evidence/revision digest plus an explicit
  attempt/generation-bound successor key minted by the sprint-phase producer.
  Identical bytes remain idempotent, while a reviewed reissue can create a new
  request without deleting the expired tombstone.
- Legacy records are read side-effect-free. Migration derives time from the
  original source timestamp; sweep time is never a new origin. Invalid or absent
  timestamps enter typed quarantine and emit audit evidence.
- Every record pins its authored policy snapshot, while a later config revision may
  only tighten in-flight TTL/SLA/risk/disposition. The driver writes one monotonic
  `policy-transition` receipt and an `appliedPolicyDigest`; weakening is ignored for
  that record. Stable event identity is
  `requestId + lifecycleGeneration + stage`, with authored/applied policy digests in
  the payload rather than the id. Thus a tightening can expire earlier without
  replaying an already-delivered stage. State and outbox cursor are durable,
  monotonic and first-writer-wins across restart/retry.
- Restart catch-up advances durable stage/audit ordinally but coalesces outbound
  delivery to the highest currently actionable stage; it never floods three stale
  reminders. Expiry emits one terminal notification.
- Timeout is a system action: `actor=system:expiry`,
  `kind=timeout-disposition`. It is never rendered as a human deny.
- A human decision racing timeout is first-writer-wins. The loser observes the
  durable terminal result and cannot replay, grant access or revive state.
- Every broker/store `decide` entrypoint performs an expiry-aware CAS with injected
  `now` before accepting a decision; it does not depend on a background sweep.
  Autonomous and pairing accept/approve transitions fresh-read durable closure
  under the same rule, so cached in-memory state cannot win after another process
  expires the request.
- Broker, store, fallback and relay share the same origin-specific disposition
  allowlist. Critical expiry is always deny or park even when a legacy request says
  `defaultAction=allow`; reachable dashboard/API state cannot weaken that floor.
  `park-alert` is an SLA escalation stage, not terminal park; only TTL closes.
- Status/list/read paths may trigger an idempotent sweep but never create an empty
  store, reset an expiry or hide a corrupt origin.
- `approval.lifecycle.enabled=false` is fail-closed rollback: it blocks creation of
  new governed pending records with typed `lifecycle-disabled/HOLD`, but continues
  compatibility reads, sweeps, SLA/timeout settle-back and audit for already durable
  records. It never resumes expiry-less writes or revives a terminal item.

## 5. Pairing storage correctness

`approval-file-cas.ts` owns the shared cross-platform private atomic storage adapter;
it reuses the established async Windows `icacls` pattern and returns typed
unsupported/HOLD where an OS cannot prove ACL/durability semantics.
`gateway-access.ts` owns the canonical parser and pairing transaction. Every
mutation uses reload-under-lock plus revision/CAS, private permissions and an atomic
journaled transition. Pairing identity is opaque and collision-resistant;
the short code is a separately unique alias. Project and tenant scope are captured
at request creation. Production object-map and legacy array inputs pass the same
parser; the next successful write is the normalized map.

The daemon must observe CLI decisions without restart. An expired or raced pairing
cannot grant access. D4 TTL applies only to pending pairing requests; it does not
silently expire an already-issued allowlist, session or identity binding.

## 6. Direct-surface compatibility

D5 owns final decision-surface retirement. During D4, retained legacy
confirmation/autonomous/pairing commands may remain, but they must call the same
expiry-aware store transition and return a typed late/stale result. None may write a
decision, trigger replay or grant access after lifecycle closure.

CLI and MCP lifecycle views remain read-only. User-visible lifecycle text is
resolved through `getMessage(key, lang)`; mechanism modules stay string-free.

## 7. Enablement and negative space

The single gate is `approval.lifecycle.enabled`. Schema validation, compatibility
readers and migration dry-run are available before enablement. The gate is enabled
only after all scoped batteries, integration negatives and real-binary smokes pass.

Quarantine is visible in CLI/MCP read views with source reference and typed reason.
D4 never silently re-admits corrupt bytes: the operator repairs the source or issues
an explicit successor/reissue, preserving the quarantine receipt. Dashboard has no
independent D4 decision store or risk consumer; it uses the API ingress owned by
Task 33, so no `src/dashboard/**` write is required.

Out of D4: Slack/Teams app-secret provisioning, authorization/session-grant
retention policy, D5 surface retirement, L1-L4/L6-L7, 24-hour canary, Closure OS
owner signature, and unrelated findings.

## 8. File-disjoint 50-task DAG

Each row owns every listed production and test file exclusively. Workers never run
repo-global `tsc`; Brain runs typecheck and the combined scoped battery at wave end.
Tier-1 rows carry a real-binary Smoke in `DIRECTIVES.md`.

| Task / wave | Exclusive write set | Goal | Depends |
|---|---|---|---|
| 1 / W1 | `src/core/config-types.ts`; `tests/core/approval-lifecycle-config-types.test.ts` | typed config and resolved shape | - |
| 2 / W1 | `src/core/config.ts`; `tests/core/approval-lifecycle-config-resolver.test.ts` | schema/default/override admission | 1 |
| 3 / W2 | `src/core/approval-lifecycle-policy.ts`; `tests/core/approval-lifecycle-policy.test.ts` | resolve/digest, shared clock/risk/disposition, monotonic tightening | 1,2 |
| 4 / W1 | `src/core/approval-contract.ts`; `tests/core/approval-contract-lifecycle.test.ts` | additive versioned envelope | - |
| 5 / W2 | `src/core/approval-store.ts`; `src/core/approval-file-cas.ts`; `tests/core/approval-store-lifecycle.test.ts`; `tests/core/approval-file-cas-platform.test.ts` | normalized store and private cross-platform CAS adapter | 3,4 |
| 6 / W3 | `src/core/approval-broker.ts`; `tests/core/approval-broker-timeout-receipt.test.ts` | one typed timeout receipt | 4,5 |
| 7 / W3 | `src/core/approval-lifecycle-migration.ts`; `tests/core/approval-lifecycle-migration.test.ts` | deterministic migration/quarantine | 3,4,5 |
| 8 / W2 | `src/core/approval-channel-authenticator.ts`; `tests/core/approval-channel-risk-tier.test.ts` | normalized tier authority | 3,4 |
| 9 / W3 | `src/core/approval-rules-engine.ts`; `tests/core/approval-rules-risk-tier.test.ts` | rules consume effective tier | 4,8 |
| 10 / W1 | `src/cli/helpers/messages.ts`; `tests/cli/approval-lifecycle-messages.test.ts` | EN/TR lifecycle catalog | - |
| 11 / W4 | `src/core/confirmation-store.ts`; `tests/core/confirmation-lifecycle.test.ts` | expiry/risk/park/quarantine and successor store | 3,5,7 |
| 12 / W5 | `src/orchestra/sprint-phases.ts`; `tests/orchestra/confirmation-durable-write.test.ts` | mint generation/source digest; downgrade only after durable create | 11 |
| 13 / W7 | `src/cli/commands/confirmations.ts`; `tests/cli/confirmations-lifecycle.test.ts` | expiry-aware legacy CLI | 10,11,27,29 |
| 14 / W4 | `src/orchestra/autonomous/approval-adapter.ts`; `tests/orchestra/autonomous/approval-lifecycle.test.ts` | v1 canonical risk/expiry/FWW store; broker is projection | 3,5,6,7 |
| 15 / W4 | `src/orchestra/autonomous/mission-store/mission-approval-coordinator.ts`; `tests/orchestra/autonomous/mission-store/mission-approval-lifecycle.test.ts` | v2 request-clock policy TTL | 3,6 |
| 16 / W6 | `src/cli/commands/autonomous.ts`; `tests/cli/autonomous-approval-lifecycle.test.ts` | production factory and direct CLI parity | 10,14,15,27 |
| 17 / W7 | `src/mcp/tools/autonomous-approval.ts`; `tests/mcp/autonomous-approval-lifecycle.test.ts` | focused MCP late-decision guard | 10,14,27,29 |
| 18 / W7 | `src/mcp/tools/autonomous.ts`; `tests/mcp/autonomous-broad-approval-lifecycle.test.ts` | broad MCP late-decision guard | 10,14,27,29 |
| 19 / W7 | `src/api/autonomous-endpoint.ts`; `tests/api/autonomous-approval-lifecycle.test.ts` | API pending/decision lifecycle parity | 10,14,27,29 |
| 20 / W7 | `src/connectors/incoming-command-resolver.ts`; `tests/connectors/incoming-approval-lifecycle.test.ts` | bot resolver rejects closed state | 10,14,27,29 |
| 21 / W4 | `src/connectors/gateway/gateway-access.ts`; `tests/connectors/gateway/gateway-access-lifecycle.test.ts` | scoped id/code, CAS, parser, TTL, atomic grant | 3,4,5,7 |
| 22 / W5 | `src/connectors/gateway/gateway-router.ts`; `tests/connectors/gateway/gateway-router-lifecycle.test.ts` | producer passes project/tenant scope | 21 |
| 23 / W5 | `src/connectors/gateway/gateway-daemon.ts`; `tests/connectors/gateway/gateway-daemon-access-reload.test.ts` | daemon read-after-write without restart | 21,22 |
| 24 / W7 | `src/cli/commands/gateway.ts`; `tests/cli/gateway-pair-lifecycle.test.ts` | expiry-aware CLI grant/reject | 10,21,27,29 |
| 25 / W5 | `src/core/approval-inbox-federation.ts`; `tests/core/approval-inbox-federation-parity.test.ts` | canonical parser and lifecycle projection | 11,14,21 |
| 26 / W5 | `src/core/pending-approvals.ts`; `tests/core/pending-approval-lifecycle-index.test.ts` | no expiry-less pending index | 5,7,11,14,21,25 |
| 27 / W6 | `src/core/approval-expiry-driver.ts`; `tests/core/approval-expiry-driver-lifecycle.test.ts` | startup/scheduled FWW closure | 6,11,14,21,26 |
| 28 / W6 | `src/core/approval-sla.ts`; `tests/core/approval-sla.test.ts` | monotonic SLA/outbox, typed short-TTL skip/coalesce | 3,27 |
| 29 / W6 | `src/orchestra/approval-decision-federation.ts`; `tests/orchestra/approval-decision-federation-timeout.test.ts` | timeout settle-back for three origins | 11,14,21,27 |
| 30 / W6 | `src/core/audit-writer.ts`; `tests/core/audit-writer-approval-lifecycle.test.ts` | system expiry/stage evidence | 27,28 |
| 31 / W7 | `src/core/approval-relay.ts`; `tests/core/approval-relay-sla.test.ts` | SLA route/idempotency and shared disposition guard | 3,5,6,28,30,48 |
| 32 / W7 | `src/connectors/approval-clients-wire.ts`; `tests/connectors/approval-clients-wire-sla.test.ts` | client attach and durable ack/cursor | 31 |
| 33 / W8 | `src/api/server.ts`; `tests/api/approval-lifecycle-runtime-wire.test.ts` | config to scheduled driver/relay composition | 2,27,28,29,30,31,32 |
| 34 / W8 | `src/cli/commands/approvals.ts`; `tests/cli/approvals-lifecycle-view.test.ts` | authenticated decision plus read-only lifecycle view | 10,25,29,30 |
| 35 / W8 | `src/mcp/tools/approvals.ts`; `tests/mcp/approvals-lifecycle-view.test.ts` | read-only lifecycle/audit view | 10,25,29,30 |
| 36 / W4 | `src/connectors/approval-telegram.ts`; `tests/connectors/approval-telegram-risk-tier.test.ts` | critical tier button/auth behavior | 8 |
| 37 / W4 | `src/connectors/approval-slack.ts`; `tests/connectors/approval-slack-risk-tier.test.ts` | normalized tier, no provisioning | 8 |
| 38 / W4 | `src/connectors/approval-teams.ts`; `tests/connectors/approval-teams-risk-tier.test.ts` | normalized tier, no provisioning | 8 |
| 39 / W4 | `src/cli/commands/bot.ts`; `tests/cli/bot-approval-risk-tier.test.ts` | bot renders effective tier | 8,10 |
| 40 / W9 | `tests/connectors/gateway/pairing-no-access-grant.integration.test.ts` | expiry/race never grants access | 21,22,23,24,27,29 |
| 41 / W9 | `tests/orchestra/autonomous/approval-no-replay.integration.test.ts` | timeout never calls replay | 14,16,17,18,19,20,27,29 |
| 42 / W9 | `tests/core/confirmation-expiry-park.integration.test.ts` | confirmation timeout parks UNDECIDABLE | 11,12,13,27,29 |
| 43 / W9 | `tests/core/approval-direct-surface-parity.integration.test.ts` | all retained direct surfaces reject late decisions | 13,16,17,18,19,20,24,29 |
| 44 / W9 | `tests/core/approval-lifecycle-closure.integration.test.ts` | full correlation across all origins | 25,27,28,29,30,31,32,33,34,35 |
| 45 / W9 | `tests/core/approval-lifecycle-concurrency-scale.integration.test.ts` | restart/race/10k pending and outbound coalesce idempotency | 5,6,7,21,27,28,29,31,32 |
| 46 / W9 | `scripts/lint-approval-lifecycle-authority.mjs`; `tests/scripts/lint-approval-lifecycle-authority.test.ts`; `tests/core/approval-lifecycle-platform.integration.test.ts` | authority ratchet plus POSIX/Windows atomic/private adapter proof | 5,7,21,27,28 |
| 47 / W3 | `src/core/approval-decision-ingress.ts`; `tests/core/approval-decision-ingress-versioned-digest.test.ts`; `tests/core/approval-v1-mac-restart.integration.test.ts` | v1 MAC restart compatibility and v2 lineage | 4,5,8 |
| 48 / W4 | `src/core/approval-policy.ts`; `src/core/approval-fallback.ts`; `src/core/approval-worker-gate.ts`; `tests/core/approval-policy-fallback-risk-tier.test.ts`; `tests/core/approval-worker-gate-risk-tier.test.ts` | critical policy, worker and unattended fail-safe | 8,47 |
| 49 / W4 | `src/core/approval-allowscope.ts`; `tests/core/approval-allowscope-risk-tier.test.ts` | grant scope consumes effective tier | 8,47 |
| 50 / W4 | `src/nervous/approval-bridge.ts`; `tests/nervous/approval-bridge-risk-tier.test.ts` | Nervous safety floor consumes effective tier | 8,47 |

## 9. Wave gates and acceptance

After each wave Brain runs `npx tsc --noEmit`, that wave's combined scoped tests,
`git diff --check`, and targeted greps for local TTL/risk tables. W9 also runs the
full D4 battery and real-binary smokes for confirmation/autonomous/gateway/
approvals/API surfaces. The repository full suite remains deferred under the active
provider-limit policy.

D4 is not DONE unless all of these are true:

- no new pending record lacks an effective expiry and policy digest;
- legacy timestamps migrate without resetting age;
- timeout settles all three legacy origins and broker-native requests;
- late decisions cannot replay, grant or revive;
- object-map pairing is visible in the inbox and cross-process CAS is proven;
- riskTier is authoritative across auth, rules and every channel;
- stored v1 signed decisions retain their exact digest validity after restart;
- SLA events are durable, monotonic, idempotent and restart-safe;
- short producer TTLs emit typed skipped-stage evidence without extending expiry;
- gate-off blocks new pending creation while draining already durable lifecycle work;
- `node scripts/lint-approval-lifecycle-authority.mjs` prevents local TTL/risk/
  disposition tables from regressing after landing;
- config gate is enabled only after scoped proof;
- design, implementation and result each carry a fresh different-provider seal.
