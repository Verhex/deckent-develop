# R24 — Fresh lifecycle publication ordering

MASTER3178, owner-authorized ADR-D-007 repair. Prior actual start763 failed after500.984s before worker birth. Real stored flow now confirmed FAILED at2026-09-14T15:18:36.441Z; no fabricated terminal receipt.

Root cause: fresh controller published coordinator read-model before writeSprintState; durable old terminal state precedes the new hint/active marker in canonical reader selection. Resume already publishes state first. Same actual controller regression with previous ABORTED/COMPLETE reproduced exact INVALID_MODEL error (2fail,1pass; exit1). After moving initial state publication after successful exact admission and before strict coordinator snapshot, both cases pass. Reader guards unchanged; state publication failure cannot bypass them. Later routed-state write remains.

Changed src/orchestra/sprint-controller.ts:3247 and tests/orchestra/exact-controller-terminal-fanin.test.ts:207. Scoped suite83pass exit0, tsc exit0, build:all exit0/31.528s, compiled identity MATCH. An intermediate full scoped run before the code edit also failed; preserved separately. No commit/push/auth or manual runtime mutation.

Next: one real start with same admitted four document scopes, force-scope acknowledging intentional new directories, max4 effective config; no new outcome. Do not claim worker birth or product closure from these tests. Cross-provider verification remains unclaimed. Source and build frozen during actual run.
