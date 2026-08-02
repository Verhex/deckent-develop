# ADR-G-037: Execution Budget Landing, Continuation & Metering Authority

**Status:** accepted

**Sprint:** _To be backfilled_

**Class:** ADR-G · **Scope:** global+project · **Immutable:** no · **Source:** user · **Enforcement-Level:** hard

---

ADR-G-037 — Execution Budget Landing, Continuation & Metering Authority

Owner: Alperen. Approved: 2026-07-23. Status: accepted.

## Context
Hard runtime ceilings contain spend but do not preserve useful work. Sprint-456 proved the double loss: three workers spent about 3.19M cache-read tokens and about USD 2.17 API-equivalent, crossed the hard ceiling, and produced zero successful outcomes. Docker SIGTERM can fsync an existing result but cannot cause a native provider CLI to create a semantic checkpoint. Live metering, hard containment, terminal task-result settlement and sprint-level checkpoint/resume are necessary but distinct authorities.

## Decision
1. The immutable owner-authored hard budget remains the primary ceiling across an execution lineage. Landing never widens, resets or replaces it; all continuation-attempt consumption is cumulative.
2. execution_budget.landing is owner-authored. reserve_ratio is finite and strictly between 0 and 1, is included in the policy digest, and has no product default. The approved 0.25 value is canary configuration only. Unknown fields fail loudly. attended_unsupported is hold|allow-hard-stop and defaults to hold. allow-hard-stop is valid only for explicitly attended execution and requires visible approval/risk evidence. Missing landing policy never manufactures reserve or capability; remote unattended dispatch HOLDs.
3. attended|unattended is explicit common-admission authority, never inferred from TTY, autoApprove, backend name or provider fallback. Autonomous/scheduled/webhook are unattended. Interactive terminal/CLI is attended only with a runtime-wide ApprovalBroker capable of durable decision evidence. MCP/API/IDE carries authenticated mode and approval evidence. Missing/contradictory evidence resolves to unattended. provider_fallback.unattended may govern reachability policy but is not attendance SSOT.
4. LiveUsageBudgetSupport and ExecutionLandingCapability are independent typed contracts. Landing capability is cooperative-landing|checkpoint-stop|unsupported; missing means unsupported. Actual called provider plus execution backend determines capability. measured-stream never implies landing. Docker remains unsupported until the host-owned checkpoint-stop protocol is binary-proven. Final-only providers remain unsupported for unattended execution.
5. Lifecycle is RUNNING -> LANDING_REQUESTED -> LANDED|HARD_STOP, or RUNNING -> HARD_STOP. Landing is requested when a measurable counter reaches its owner threshold at 1-reserve_ratio. Crossing the original hard ceiling always becomes HARD_STOP. LANDED requires an immutable host-owned checkpoint receipt and is neither DONE nor NO_GO. Failure to checkpoint before the hard ceiling is HARD_STOP.
6. The host-owned checkpoint binds tenant/project/task, original request/task digest, role/kind/attendance, configured/requested/resolved/called provider+model, backend/auth, policy and hard-budget digest, parent attempt/fence, cumulative usage and remaining hard budget, provider event sequence, scoped disk-diff/evidence refs, acceptance digest and timestamps. Worker semantic state is a proposal; the host stamps and hashes the receipt.
7. Continuation claim cites the landing-checkpoint digest and is first-writer-wins. Competing coordinators adopt the matching claim or HOLD. Continuation receives immutable checkpoint plus bounded current disk/evidence context, not the full original prompt corpus. It cannot reset counters or gain a new hard budget. Terminal product settlement remains separate and occurs only after a genuine terminal result.
8. Each applied provider observation records token deltas and a neutral consecutive distinct cache-read-event count. Ordinary cache reuse is not labelled waste. Duplicate/replayed events do not increment counters or streaks.
9. Brain, worker and auditor share policy, attendance, capability, receipt and fallback authorities. CLI/MCP/terminal/API/process/autonomous are thin producers/consumers. Subscription and API paths share token/cache truth; pricing evidence may add USD truth but cannot replace measured ceilings.

## Rollout
Land schema/state/capability contracts preserving hard-stop behavior; add host-owned checkpoint and attempt-retirement authority; add bounded continuation and crash/restart tests; enable reserve_ratio 0.25 only in explicit canary config; run one low-risk real-binary Docker canary only after separate owner approval; no default flip is authorized.

## Acceptance
Boundary tests below/at/above landing and hard ceilings; schema/digest and unknown-field tests; provider/backend capability matrix; unattended HOLD and attended explicit hard-only evidence; checkpoint corruption and competing-coordinator tests; cumulative-budget/no-full-replay continuation tests; Docker kill/landing matrix; targeted tests, lint, build:all, real binary proof and one finite Fable-5 verdict.

AMENDMENT 2026-07-25 — §4-a FINAL-ONLY USAGE CONTAINMENT (owner: Alperen, approved 2026-07-25)

4-a. A provider that reports final-only usage MAY execute when the owner has explicitly
authorized it AND it runs under host-enforced finite wall-clock containment. This authorization:
  - does NOT claim attendance; admission mode remains unattended. §3 attendance authority is untouched.
  - demotes token ceilings to POST-HOC settlement evidence; an in-flight token cap is never claimed.
  - applies only to the roles the owner names.
  - requires a finite positive wall-clock window, which may only NARROW an existing timeout, never widen it.
  - is absent by default; absence keeps the existing fail-closed refusal.
Metering and landing remain independent contracts: this clause adds nothing to
ExecutionLandingCapability, attended_unsupported or allow-hard-stop.

Rationale: codex exec --json emits a single terminal turn.completed usage envelope, so no owner
budget shape could satisfy hasLiveUsageCeiling — §4 as written made final-only providers
unusable in EVERY mode, wider than its own "unattended" wording. The §3 ApprovalBroker route is
unavailable here (api_oidc unconfigured), so attendance was NOT asserted.
Implementation: execution_budget.final_only_usage (action/roles/max_wall_clock_seconds);
authorized in this project as roles=[auditor], max_wall_clock_seconds=600.
Live proof 2026-07-25: codex/gpt-5.6-sol Docker verifier returned VERDICT: CONFIRMED.
Revocation gate: MASTER-PLAN 658 (codex incremental metering) must remove this authorization
from config as part of its completion criteria.
Proposal record: .analysis/adr-g-037-amendment-final-only-usage.md
