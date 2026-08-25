# FO07 adversarial parity proof plan

## Accepted hermetic boundary

The post-terminal scoped battery composes three actual production consumers:

- manual `registerSpawn()` in `tests/cli/spawn-lifecycle.test.ts`;
- initial `spawnWorkers()` in `tests/orchestra/spawn-spawner-wire.test.ts`;
- retry/FIX/continuation `executeSpawnTask()` in
  `tests/orchestra/scheduler-spawn-executor.test.ts`.

All consume the same canonical `Task.budget` + `Task.budgetPolicy` projection.
Valid grants reach Docker unchanged. Missing grant, policy/provider mismatch,
missing capability, and non-Docker executor raise the shared typed HOLD before
the backend spy records provider work. Docker-shaped missing-grant tests retain
`liveUsageBudgetSupport='measured-stream'`, proving the shared resolver—not the
legacy support fallback—owns the refusal. `maxUsd` is proven to bypass
wall-clock grant creation and reach the separate incremental-pricing refusal.

`tests/cli/spawn-final-only-parity.test.ts` additionally pins Linux
`auto→docker`, Windows `auto→subprocess` refusal, first-writer settlement,
conflicting replay rejection, and foreign/stale receipt rejection. There is no
expiry assertion: canonical task policy has no expiry field, and this outcome
does not invent one.

`tests/cli/spawn-final-only-real-binary.test.ts` runs the freshly built
`dist/cli/entry.js spawn` in a separate OS process and temporary project. Its
canonical Codex task has a live ceiling but no owner grant: the binary exits 1
with `owner-authorization-missing`, emits no worker-spawn success, and reaches no
Docker/provider work. This closes the negative user-surface smoke only.

## Required real-binary follow-up

Run through a temporary project/task projection with the built CLI and real
Docker backend. Retain exact task bytes, provider command capability, resolved
backend, container label/id, attempt/claim/settled/closed receipts, stream log,
terminal usage, and before/after task status.

| Scenario | Required observation |
| --- | --- |
| Valid manual `spawn --force` | Configured `auto` resolves to Docker; exact task-stamped grant reaches Docker; one provider process and one terminal attempt. |
| Missing/mismatched grant | CLI exits nonzero before container/provider creation; typed reason is rendered through i18n. |
| Hang | Docker stops/removes the exact container no later than the owner wall-clock ceiling; no false DONE. |
| Child process | Container/cgroup teardown leaves no escaped child. |
| Crash/restart | Reconciliation closes only after authoritative container absence; it never adopts a live foreign attempt. |
| Missing final usage/result | Terminal status remains HOLD/NO_GO; raw output cannot synthesize a closed settlement. |
| Duplicate/replay | One dispatch/claim owner; identical receipt is idempotent, conflicting terminal write is rejected, and the loser starts no provider process. |

This canary is still required for full FO-11 real-process closure. The current
slice is accepted only as manual-vs-initial-vs-continuation production-wiring
parity, not as the complete durable authorization lifecycle.
