# MASTER3178 — single-worker control: result acceptance and derived directory evidence

**Task:** 765-001  
**Evidence posture:** source-only, read-only inspection; no runtime/provider call, build, cleanup, or settlement was performed.  
**Scope:** dogfood and product operators; each decision is per task/attempt, tenant, project, run, and platform.

## Dependency gate

The declared predecessor directory `docs/execution/active/dogfood-comparison/single/result/` contained no files when inspected. Therefore no accepted predecessor document or predecessor content digest exists to cite. This is a required-input gap, not evidence that the run is complete. This document intentionally does not repeat or treat predecessor findings as settled.

## Measured facts

1. The run-status read model derives logical progress from task records, retains explicit holds, and hashes the semantic projection. A queued task or authority hold is not projected as an evaluation retry; only the current `NO_GO` attempt is eligible (`src/core/run-status-read-model.ts:195-229`, SHA256 `088feb014d05d83b3f08d241d347e208ca42518e703ec3149fa793eb8e31844e`). Missing task storage yields an empty task projection, while malformed task artifacts create a typed `malformed-task-artifact` hold (`src/core/run-status-read-model.ts:239-281`, same SHA256).
2. The read model records unresolved provider observations when open, run-owned intervals fall outside the current exact task/attempt set (`src/core/run-status-read-model.ts:297-342`, same SHA256). Readiness is `HOLD` when the model does not match authority and the run is neither reconciled-paused, proven active, nor quiescent (`src/core/run-status-read-model.ts:432-466`, same SHA256).
3. The exact scheduler registry has distinct `prepared`, `pending`, `accepted`, `not-dispatched`, and `hold` states; a hold may carry a safe, store-verified diagnostic (`src/orchestra/scheduler-effects.ts:290-327`, SHA256 `5f02dbeec9f38de61b3f43a858458490f547cb01738a55f4c9098a2383dc7185`). Lifecycle ownership is task-scoped, rather than inferred from a run default, so mixed-backend recovery lists, reconciles, and kills through the owner of that task (`src/orchestra/scheduler-effects.ts:329-348`, same SHA256).
4. Exact Docker capture treats `WORKER_RESULT`, `WORKER_IPC_QUESTION`, and `WORKER_LANDING_PROPOSAL` as separate capture stages (`src/orchestra/spawn-backend-docker.ts:894-896`, SHA256 `3ed921457730e26c60c9e435f8bea7ff565ad22cf64ded03790dd3d8606e8abd`). A missing landing proposal is a typed `PROPOSAL_MISSING` capture condition, and private-output sealing has explicit root, source, destination, reread, and directory-substitution failure codes (`src/orchestra/spawn-backend-docker.ts:940-969`, same SHA256; `src/orchestra/spawn-backend-docker.ts:4793-4820`, same SHA256).
5. The Docker custody root is derived from the canonical project root plus a platform-normalized global state directory (`src/orchestra/spawn-backend-docker.ts:5312-5326`, same SHA256). Runtime output inspection rejects an unresolved tenant and rejects a tenant mismatch; task, attempt, sprint, and dispatch identity mismatches are also denial outcomes (`src/orchestra/spawn-backend-docker.ts:17240-17337`, same SHA256). The backend reports worker inventory as `active`, `absent`, or `unknown` (`src/orchestra/spawn-backend-docker.ts:23386-23392`, same SHA256).
6. Handoff publication consumes exact terminal authority for exact tasks and throws a typed hold if that authority is not current; `NO_GO` and empty artifact sets do not create downstream handoffs (`src/orchestra/sprint-controller.ts:1086-1129`, SHA256 `02acb776e7f0d92112febb1653e2cf09c83e009c6dda136759771550cbdaaf42`). Checkpointing a terminal exact task requires a corresponding terminal authority (`src/orchestra/sprint-controller.ts:1364-1383`, same SHA256).
7. Recovery retirement is fail-closed: an accepted result can be retired as historical only after identity binding, earlier-run ordering, a decided settlement hold, and a durably terminal owning run; unknown, active, paused, unbound, current, concurrent, and future cases remain held (`src/orchestra/sprint-controller.ts:1788-1852`, same SHA256).

## Derived operator control

### Acceptance decision

Accept a worker result only when the exact task/attempt authority is current, the result is identity-bound to the expected tenant/project/run, the worker-result and landing-proposal captures are present and sealable, and the terminal authority can be re-read as current. A public `.result` claim is ingress evidence, not settlement authority. If any check is unavailable, contradictory, tenant-mismatched, platform-unresolved, or `unknown`, publish a typed `HOLD`; do not infer success from process exit, a directory name, or an absent file.

For product operators, keep the same per-attempt rule across Linux, WSL2, macOS, and Windows: platform differences select the normalized custody root and backend capability path, but must not relax identity, tenant, seal, or terminal-authority checks. For dogfood operators, a missing or stale derived directory is a recovery signal to inspect, not permission to delete or accept. Preserve the task-scoped lifecycle owner in mixed-backend runs.

### Derived directory evidence

Treat a directory as evidence only when its canonical root, tenant/project/run/attempt identity, platform, owner/mode, and sealed file identity are all attributable to the exact attempt. The source contract supports this boundary through platform-derived custody roots, tenant-scoped inspection, private-root anchoring, no-follow directory opens, source identity stability checks, and post-write rereads (`src/orchestra/spawn-backend-docker.ts:4776-4820`, same SHA256). A directory's existence alone proves none of those properties.

### Recovery sequence for MASTER3178

1. Read the canonical run model and its holds.
2. Resolve the exact task-scoped lifecycle owner and inspect worker inventory; `unknown` is a hold.
3. Re-read tenant/project/run/attempt/dispatch identity and both worker capture stages.
4. Validate private-output seal and derived-directory identity; reject substitution, replay, growth, or missing proposal.
5. Re-read exact terminal authority and consume the immutable evaluation receipt before releasing dependencies. Missing or unreadable receipts are holds (`src/orchestra/sprint-controller.ts:1951-1980`, SHA256 `02acb776e7f0d92112febb1653e2cf09c83e009c6dda136759771550cbdaaf42`).
6. Only then accept and wire artifacts. For recovery, retire history only under the stricter earlier-and-durably-terminal predicates above; otherwise leave the attempt held.

## Inference and unknowns

- **Inference:** The safest single-worker control is a conjunction, not a single status bit: canonical run readiness + exact authority + tenant/identity binding + sealed directory evidence + terminal receipt. This follows from the independent typed holds and revalidation paths cited above.
- **Inference:** `absent` is stronger than `unknown` for derived-directory recovery, but neither alone proves acceptance; absence must be paired with the exact custody and terminal records.
- **Unknown:** No runtime observation, provider result, Docker inspection, tenant binding, directory listing, receipt, `.verify-ran` marker, or accepted predecessor output was available in this task. No claim is made about MASTER3178's current production or dogfood state.
- **Unknown:** The source files establish the control paths but do not, by themselves, prove that a specific deployment wires every path identically on every host platform.

## Verdict

**NO_GO for settlement/completion of MASTER3178 in this attempt.** The required predecessor output is missing, and runtime/provider/directory evidence was not collected by instruction. The specification is delivered for the next operator decision; it is not a product-DONE claim.
