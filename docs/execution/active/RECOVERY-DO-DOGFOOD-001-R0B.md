# R0B — verified operation snapshot and status parity

OWNER_ACCEPTED: live "Sıradaki onarıma geçelim". Parent MASTER120 / R0 repair.
Epoch7 COMMITTED; DOGFOOD ON, HEALTH DEGRADED; typed ADR-D-007 seam, direct main.
No active748/749/750; only local-llm Docker container observed. R0 negative closure
and immutable evidence remain protected. No751, auth, ledger, commit/push or cleanup.

Defect: real planning-health201s without provider. Repeated admission/artifact/effect
validation plus legacy Dashboard/lock status disagreement. Evidence in r0/RESULT.md.
One implementation pass, one targeted verification, at most two changed-evidence
repairs; command budget600s, two Vitest forks. No repeated identical canary/audit.

Read/write scope: core custody Store + operation snapshot helper, Docker planning
read consumer, its execution-effect Store lifecycle/cleanup reader, canonical
run-status readers/projector and targeted tests. The effect-reader dependency was
confirmed by the native CPU profile at 2026-09-12T17:51Z; it blocks this same gate. No native
ABI change, no provider routing, no REPL, no new persisted authority/catalog.
Snapshot is operation-local, synchronous and bounded; only verified immutable reads
are reused. Files (including absence), durable effect markers and directory scans
must be reread before returning. No publication, mount or capability consumption
inside the snapshot. Existing historical readers may issue operation-local path
capabilities; the Store revokes newly issued capabilities before returning.
Only the existing discovery probe may retain an expected typed rejection as a
negative observation; it is reread and separately bound to the canonical immutable
no-effect quarantine. It never becomes absence or successful authority. Unclassified
read failure, any changed observation, mutation attempt, unsupported adapter or
exhausted budget invalidates the whole decision. No persistent liveness cache.

Status scope: current execution vs retained terminal history vs contradictory foreign
projection must remain distinct. Use verified authority, never erase foreign state.
Proof: hostile mutation/absence/policy/sibling/project/restart tests, actual native
cold and warm health latency/read counts, compiled real status reads and source/build
identity. Target ordinary p95<=5s; incomplete checks are HOLD. XVerify only a real
fresh different-provider receipt; not supplied author state or host self-review.
Return to official dogfood only after R0 closure gate is proven; do not use751 to
hide a failed performance/status check. Initial source hashes: /tmp/deckent-r0b-astra-20260912/baseline.json.

## Verification disposition

Canonical status repair is locally verified. The acceleration candidate failed its
native 10s / 64MiB admission budget and stays explicitly opt-in
(`verifiedReadSnapshot: true`) at the reader boundary. Normal production callers
retain the previous direct reader. This opt-in is not a user mode, persisted owner
authority, product completion, or permission to start751. Do not default-enable it
until its native memory/latency proof closes.

The second repair's identity-sharing correction preserved complete
identity/policy/admission/platform keys across reader instances; targeted proof
passed, but the measured candidate still failed. No further algorithm repair is
opened in this package. Capture final evidence, preserve state and return HOLD.
Detailed result: ../evidence/astra-recovery-20260912/r0b/RESULT.md.
