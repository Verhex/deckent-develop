# Manual recovery XVerify — exact plan authority

- At: 2026-07-28T20:50:50+03:00
- Producer: Codex / GPT-5.6 Sol
- Verifier: Claude / `claude-fable-5`
- Provider separation: PASS
- Execution mode: read-only bootstrap recovery (`Read,Grep,Glob` only)
- Verdict: `CONFIRMED`
- Claude session: `b3b5b866-b029-4dc0-ab62-2df2f76b8b71`
- Provider result UUID: `db65bff9-7bf8-4a32-81b7-97f772a0b909`
- Duration: 138.575 s
- Usage: input 5,217 · output 9,083 · cache read 536,444 · cache create 112,825
- Provider-reported cost envelope: USD 3.300334 (evidence, not an invoice)

## Why manual recovery was required

The canonical `deckent xverify` attempt
`xv-1785260483226-744426f9-fe95-43f8-83a5-2f40dd4b42f3` correctly returned
typed `HOLD` before provider dispatch:
`verifier-exact-invocation-composition-hold:xverify_provider_authority_unavailable`.
Current production authority has no authored `provider_limit_authority` layer,
and the separately documented strict Docker/subscription evidence gap remains.
This recovery attempt does not reinterpret that HOLD as strict-v2 success.

## Criterion map

- P1 — `planRunFlow` generates one real preview for a new flow, normalizes one
  executable `PENDING` Sprint, computes revision/digest context, persists it
  before approval, and reuses a matching durable record without replanning:
  supported by `src/orchestra/run-flow-plan-service.ts` and its direct tests.
- P2 — approval loads and binds the durable plan record and never calls a
  planner: supported.
- P3 — mutating CLI and MCP plan ingress use `planRunFlow`; CLI dry-run alone
  uses the read-only preview service: supported.
- P4 — exact start checks the approved snapshot and durable start-attempt CAS,
  passes `preplannedSprint`, and does not replan: supported.
- P5 — CLI plan inspects compatibility artifacts before approval, publishes
  after approval through atomic no-clobber hard links, preserves conflicts,
  and exact start reuses the same publisher: supported.
- P6 — sprint-461 legacy projection adoption and live worker start were
  explicitly not claimed complete; no contradiction found.

## Verifier risks retained as open scope

- MCP plan intentionally leaves compatibility artifact materialization to exact
  start; this is a surface asymmetry, not a contradiction.
- The MCP exact-start proof passes through `run-flow-decision-service.ts`,
  outside this finite evidence set; the verifier could corroborate it only
  indirectly.
- Non-exact legacy `deckent start` still retains dry-run/cost planning paths.
  The exact-path claim is valid, but default-ingress retirement remains open.
- Callers of low-level `admitExactRunAttempt` must inspect
  `lifecyclePublication: uncertain`; the canonical facade and CLI do so.

The verifier’s terminal line was:

`VERDICT: CONFIRMED`
