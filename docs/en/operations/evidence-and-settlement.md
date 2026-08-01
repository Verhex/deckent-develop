# Evidence and settlement

## Product-user perspective

Deckent separates a worker's claim from orchestrator-owned proof. A useful result answers four questions: what attempt ran, what changed inside its authority, what verification ran, and which terminal authority accepted or rejected it. [Evidence: `src/core/task-result-schema.ts:205-300`; `src/core/task-settlement-authority.ts`; `src/core/invocation-receipt.ts`]

### Evidence layers

| Layer | What it records | Authority boundary |
|---|---|---|
| Task scope | Allowed read/write directories and exact files. | Declared write scope limits attribution and boundary checks. [Evidence: `src/core/task-types.ts`; `src/orchestra/disk-verify.ts:151-207`] |
| Attempt receipt | Role, purpose, provider/model, transport/backend, timing, disposition, reason, evidence state. | Receipt identifies the exact invocation; it does not by itself prove desired output. [Evidence: `src/core/invocation-receipt.ts:3-148`] |
| Worker result | Changed-file claim, token/cost, tests, TypeScript check, self-assessment, criteria, honesty, cross-verify and production-wiring evidence. | Zod `TaskResultV1` is the versioned structural contract. [Evidence: `src/core/task-result-schema.ts:205-300`] |
| Host disk evidence | Scoped tracked diff and untracked files. | Orchestrator computes attribution from Git under the task's own write paths. [Evidence: `src/orchestra/disk-verify.ts:135-207`] |
| Brain evaluation | GO/NO_GO, reason and rubric result. | Must remain distinct from worker self-assessment. [Evidence: `src/core/task-result-schema.ts:277-288`; `src/orchestra/result-evaluator.ts`] |
| Auditor/gate | Validation record and whole-run self-audit outcome. | Gate may constrain the run but must agree with canonical logical progress. [Evidence: `src/core/task-result-schema.ts:220-229,294-296`; `src/orchestra/sprint-finalizer.ts:3036-3185`] |
| Terminal receipt | Fenced publication after outcome-shaping gates settle. | Exactly one terminal publication is claimed for a receipt. [Evidence: `src/orchestra/sprint-controller.ts:2900-2938`; `src/orchestra/sprint-finalizer.ts:3036-3185`] |

### Reading a result safely

Use this order when diagnosing a run:

1. Match `taskId`, `sprintId`, `attempt`, `workerId`, provider, model, and timestamps. [Evidence: `src/core/task-result-schema.ts:238-259`]
2. Compare declared scope with `filesChanged`, `boundaryViolations`, `workAttribution`, and host disk diff. [Evidence: `src/core/task-result-schema.ts:261-269`; `src/orchestra/disk-verify.ts:135-207`]
3. Inspect actual test/tsc evidence and each GO criterion; a textual self-assessment is not sufficient. [Evidence: `src/core/task-result-schema.ts:274-288`]
4. Check honest-gate, cross-provider verification, and production-wiring evidence where the task requires them. [Evidence: `src/core/task-result-schema.ts:283-291`; `AGENTS.md:42-55,72-80`]
5. Reconcile task state, summary, gate, and terminal receipt before accepting run completion. [Evidence: `PAZARTESI.md:54-60`]

### Disk truth and its limit

`computeScopedDiskChanges` reads tracked changes with `git diff --numstat HEAD` and untracked paths with `git ls-files --others --exclude-standard`, restricted to the task's write authority. This prevents sibling work in a shared read directory from being attributed to the wrong worker. [Evidence: `src/orchestra/disk-verify.ts:135-207`]

The older synthetic-NO_GO probe is fail-open: Git/read errors yield no evidence so an infrastructure failure cannot silently become a false GO. Therefore “no disk evidence” needs diagnostic context; it is not universal proof that no work happened. [Evidence: `src/orchestra/disk-verify.ts:67-106`]

### Cross-verification

When XVerify is required, the verifier must use a different provider from the producer and be resolved from effective config, registry, capability, reachability, entitlement, and budget evidence. If no fresh second-provider authority exists, the result is typed `unavailable/HOLD`; same-provider self-verification is forbidden. [Evidence: `AGENTS.md:66-80`; `src/core/task-result-schema.ts:283-291`]

### Settlement and retention

`finalizeSprint` aggregates attempt results, emits lifecycle events, runs the self-audit gate, writes the gate projection, applies learning/decay and publishes terminal evidence. Its comments identify `memory.db` as the source for managed identity projection rather than a hand-written identity file. [Evidence: `src/orchestra/sprint-finalizer.ts:2185-2240,3036-3185`]

Cleanup follows terminal-receipt publication; it is skipped when configured and can be delayed. It clears scan state and delegates artifact cleanup/tool-inventory cleanup. [Evidence: `src/orchestra/sprint-controller.ts:2900-2938`; `src/orchestra/sprint-phases.ts:4170-4207`]

## Dogfood / repository reality

| Check | State | Current finding |
|---|---|---|
| Versioned result schema | ✅ live | `TaskResultV1` is inferred from one Zod schema and includes explicit evidence fields. |
| Scoped disk attribution | ✅ live | Host-side tracked/untracked calculation exists and is write-scope limited. |
| Invocation receipt validation | ✅ live | Stored receipts validate schema, role and structured reason fields before acceptance. [Evidence: `src/core/invocation-receipt-store.ts:500-660`] |
| Atomic result collection | ⚠️ partial | PAZARTESI records three malformed result cases and a required atomic-write/recovery closure. [Evidence: `PAZARTESI.md:39-44`] |
| Collect→evaluate→status transaction | ⚠️ partial | A valid result can still be observed while its task remains EXECUTING; closure is explicitly pending. [Evidence: `PAZARTESI.md:43-45`] |
| Gate/summary/task/receipt agreement | ⚠️ partial | Sprints 476/478/481 had all root tasks NO_GO while final gate was PASS. [Evidence: `PAZARTESI.md:54-58`] |
| Unattended settlement certification | 🔜 roadmap | Required ladder ends with three consecutive intervention-free COMPLETE+PASS runs and consistency conditions; it has not been certified. [Evidence: `PAZARTESI.md:54-60`] |

Until those gaps close, the repository truth is `HOLD` for publish-grade autonomous settlement, even though individual evidence components are live. [Evidence: `PAZARTESI.md:36-60`]
