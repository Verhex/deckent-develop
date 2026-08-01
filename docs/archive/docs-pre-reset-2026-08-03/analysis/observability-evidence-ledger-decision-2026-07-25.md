# Observability evidence ledger — owner decision packet

**Date:** 2026-07-25
**Altitude:** design
**Scope:** non-Desktop evidence envelopes, sealed exports, readiness scorecards,
local-first SLI collection and retention
**MASTER-PLAN:** row 569 / `OBS-EVIDENCE-LEDGER`

## Outcome

Deckent has many durable evidence authorities—InvocationReceipt, provider
truth/limit stores, task settlement, termination ledger, RunFlow event logs and
trace records—but no common evidence envelope or release-readiness projection.
Delivery status in MASTER-PLAN is still the only consolidated product view.

Recent live proof is not fresh-clone reproducible:

- `.analysis/xverify/` contains 47 untracked reports and only one tracked report;
- `.tasks/` is ignored, so the M4 plan/evidence/result records are local runtime
  state;
- no exporter builds a redacted, content-addressed evidence package from those
  host authorities;
- no digest-pinned Community/Enterprise/SP-2 readiness scorecard joins machine
  evidence with explicit human product sign-off.

The answer is not to commit raw runtime directories. They can contain prompts,
provider output, local paths, identities, operational metadata and high-volume
logs. The durable product needs a schema-governed export with redaction,
integrity, retention and provenance.

No runtime artifact was moved, archived, deleted or committed by this packet.

## Negative space

- Do not make MASTER-PLAN delivery status double as runtime/product readiness.
- Do not commit raw `.tasks`, provider logs, auth/session state or entire
  `.analysis` trees.
- Do not claim reproducibility from a Markdown summary without source digests
  and verifier commands.
- Do not treat a test fixture evidence ref as live proof.
- Do not make telemetry upload a prerequisite for local evidence.
- Do not let evidence writer failure alter core scheduling outcome; it should
  make the relevant readiness gate red/HOLD.
- Do not sign evidence with provider or approval keys.
- Do not compact/delete evidence under retention or legal hold without a
  durable disposition receipt.

A concrete violation is marking a release live-proven from a MASTER-PLAN note
that cites `.tasks/task-...evidence` when that ignored file does not exist in a
fresh clone or exported package.

The obstacle blocks the current prose-reference approach, not the product goal.
The smallest durable alternative is one common envelope plus a safe sealed
export/readiness projection over existing specialized stores.

## Disk truth

| Layer | Current truth | Evidence status |
|---|---|---|
| Invocation receipts | Durable lifecycle/state/hash evidence exists. | code-present; tested |
| Provider truth/limits | Signed/content-addressed specialized stores and evidence refs exist. | code-present; tested; production coverage partial |
| Task settlement/termination | Host-authoritative attempt/result/usage/closure records exist. | wired on reviewed paths; parity still tracked elsewhere |
| RunFlow events | Flow/command/sequence durability and replay exist. | code-present; tested |
| Trace/feature truth | Specialized trace and code/wired/enabled proof surfaces exist. | partial |
| Common envelope | No shared `{commit,digest,tenant,actor,flowId,commandId,sequence}` projection across stores. | absent |
| Safe evidence export | No sealed, redacted, content-addressed package/manifest writer-reader-verifier. | absent |
| Readiness scorecards | Publish script has technical gates, but no evidence-tiered Community/Enterprise/SP-2 scorecard plus human sign-off. | absent |
| Local live artifacts | 47 current xverify reports untracked; `.tasks` evidence ignored. | local-only; fresh-clone unavailable |

## Verification

The bounded primitive matrix passed 7 files / 137 tests:

```text
npx vitest run \
  tests/core/invocation-receipt-store.test.ts \
  tests/core/provider-truth-store.test.ts \
  tests/core/provider-limit-store.test.ts \
  tests/core/task-result-settlement.test.ts \
  tests/core/run-flow-event-log.test.ts \
  tests/core/feature-truth.test.ts \
  tests/scripts/validate-publish-readiness.test.ts --reporter=dot
```

This proves the component stores and current technical publish-gate mechanics.
It does not prove a common evidence ledger, export portability, SLI collectors
or product readiness.

## Required architecture

### J1 — Canonical `EvidenceEnvelopeV1`

Every readiness-citable artifact projects an immutable common header:

- schema/evidence type and evidence tier;
- tenant/project/run/task/call/attempt/flow/command/sequence identities where
  applicable;
- producer component, actor/principal authority and execution role;
- source commit, source-tree digest, build/package digest and artifact digest;
- observed/generated time, validity window and environment/backend identity;
- parent/source evidence references and canonical payload digest;
- integrity domain, key ID/signature reference and redaction-policy revision.

Specialized payloads remain owned by their existing stores. The envelope is a
projection/index contract, not a second truth store.

### J2 — Sealed evidence package

A host-only exporter resolves refs from specialized stores and writes:

1. canonical manifest and dependency graph;
2. redacted immutable evidence payloads;
3. exact verification commands/tool versions;
4. source/build/package digests;
5. access issues and intentionally omitted sensitive fields;
6. retention/legal-hold metadata and integrity signature.

The package reader verifies every digest/reference offline. Missing,
unresolvable, stale, truncated or conflicting evidence is explicit and makes
dependent readiness criteria HOLD. Raw secrets, prompts and personal
identifiers are excluded or irreversibly redacted before packaging.

### J3 — Separate readiness scorecards

Keep MASTER-PLAN delivery status. Add digest-pinned machine scorecards for:

- Community release readiness;
- Enterprise Preview/GA assurance;
- SP-2/training-data readiness;
- optional deployment-specific profiles.

Each criterion records required evidence tier, envelope refs, verdict,
freshness, exceptions and owner. Human product sign-off is a distinct signed
decision over one immutable scorecard digest; it cannot overwrite machine
failure or missing evidence.

### J4 — Local-first SLI collectors and retention

Collect operational metadata locally by default for the M1–M10 journeys:
onboarding, plan, approval, dispatch, provider/budget, settlement, recovery,
verification, completion and update/release. Content telemetry and upload remain
opt-in.

Retention is tenant/profile-specific, size/time bounded and legal-hold aware.
Compaction preserves aggregate integrity and emits disposition receipts.
Multi-host enterprise storage requires external durable adapters; local files
must not claim distributed authority.

### J5 — Migration and rollout

1. Owner approves the evidence/readiness ADR proposal.
2. Envelope projection and resolver land without changing specialized stores.
3. Dual-read legacy refs; new writes emit envelope refs.
4. Provider-free fixtures prove export/import/tamper/redaction/fresh-clone.
5. Current M4 evidence is exported through the new path only after explicit
   owner approval of the exact artifact list.
6. Readiness gates become mandatory only through a separate owner default flip.
7. Publish remains an owner action.

## ADR boundary

This concerns ADR-G-018 event/evidence mechanism, ADR-G-019 governance,
ADR-G-031 enterprise audit/retention and the release-governance contract. The
existing decisions do not yet define a shared sealed evidence package or human
sign-off binding.

Accepted ADR bytes remain unchanged. Implementation requires an
owner-authorized ADR proposal/amendment first.

## Owner decision requested

Approve or revise J1–J5 and authorize the evidence/readiness ADR proposal.
Approval does not authorize moving/deleting existing artifacts, key
provisioning, telemetry upload, a paid canary, default flips, commit/push,
publish, Desktop implementation or repo migration.
