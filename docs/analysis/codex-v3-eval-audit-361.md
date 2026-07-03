# Codex Dogfood V3 — Eval-Audit of Sprint 361 (task 362-013)

Third codex-dogfood attempt. Two parts, read+write only — no code, no tests:
(1) a runtime self-report of what actually executed this task, and (2) a mini-audit of
whether sprint-361's per-task `brainEvaluationReason` values are consistent. All claims are
anchored to `.brain/archive/sprint-361-tasks/*.result`.

## 1. Runtime self-report (proof-of-existence)

- **Executing runtime:** Claude **Opus 4.8** (`claude-opus-4-8`) via the Claude Code agent
  harness (advisor tool + skill surface present) — **not** codex-CLI / gpt-5.
- **Config vs. reality:** `task-362-013.json` declares `provider: "codex"`,
  `forceModel: "gpt-5"`, `backend: "subprocess"`. The process that actually ran it is Claude.
  Task `createdAt` `2026-07-02T22:58:55Z`; my first heartbeat `~2026-07-02T23:09Z`.
- **Verdict:** the codex routing gap survives into V3. This is the **third** consecutive
  confirmation — sprint-360 (`360-014`, real 429) and sprint-361 (`361-006` RCA,
  `docs/analysis/codex-dogfood-rca-361.md`) both also self-reported "executing runtime =
  Claude Opus." The dogfood keeps front-running its own fix (born-479 lands *after* this
  sprint's planning), so "codex" remains an untested label, not an exercised backend.

## 2. Eval-audit — method

Sample: 5 of sprint-361's 17 tasks, chosen to span the verdict range (2× DONE, 2× DEBT,
1× override). Fields extracted per `.result`: `selfAssessment`, `brainEvaluation` (verdict),
`brainEvaluationReason`.

| Task | What it was | self | brainEvaluation | brainEvaluationReason |
|---|---|---|---|---|
| 361-001 | debt-verify (crosswalk sweep) | DONE | NO_GO | `rubric total 0 → NO_GO` |
| 361-002 | LIMIT-GATE-WIRE (`deckent limits`) | GO_WITH_TECH_DEBT | GO_WITH_TECH_DEBT | `rubric total 89.33 → GO_WITH_TECH_DEBT` |
| 361-004 | POSTFIX-PENDING-SCAN (src+test) | DONE | DONE | `rubric total 78.75 → DONE` |
| 361-006 | CODEX-RETRY-RCA (the V2 doc) | DONE | DONE | `rubric total 100 → DONE` |
| 361-014 | DEFER-002-NERVOUS MCP undo/edit | GO_WITH_TECH_DEBT | GO_WITH_TECH_DEBT | `rubric total 89.33 → GO_WITH_TECH_DEBT` |

## 3. Findings (evidence-referenced)

1. **Score→verdict mapping is non-monotonic.** `361-004` scores **78.75 → DONE** while
   `361-002` scores **89.33 → GO_WITH_TECH_DEBT`. A *higher* rubric total received a *worse*
   verdict. So the numeric total does not gate the verdict — it cannot, or these two would
   be swapped.

2. **The verdict tracks `selfAssessment`, not the rubric.** Every DONE-self task closes DONE
   (scores 78.75 *and* 100 alike); every DEBT-self task closes DEBT (89.33). The rubric total
   is **decorative** in the reason string — an echo of the worker's own call, re-badged with a
   number. Consistent, but not an independent evaluation.

3. **Brain only overrides at the failure floor.** The one verdict that departs from
   `selfAssessment` is `361-001` (self=DONE → **NO_GO**, rubric **0**), and `361-001-fix`
   (self=TIMEOUT_WITH_WORK → DEBT, rubric 49.33). Override fires at rubric 0 but never in the
   78–89 band. The override policy is therefore a hard floor, not a graded function —
   defensible, but undocumented in the reason itself.

4. **`brainEvaluationReason` is a single template, not task-specific.** All 17 sprint-361
   reasons match `rubric total N → VERDICT`. None names the criterion met/unmet, the debt
   item, or why the DEBT is acceptable. `brain.md` requires "GO/NO-GO criteria … task-specific,
   not generic"; the *criteria* may have been specific, but the persisted *evaluation reason*
   is generic — a thin audit trail.

5. **The rubric decomposition is not persisted.** `brainEvaluation` stores only the verdict
   string ("DONE"/"NO_GO"); the dimensions that sum to `N` are absent from the `.result`. Two
   different tasks (`361-002`, `361-014`) share the identical total **89.33**, which reads as a
   shared deduction path but cannot be confirmed — the breakdown is gone.

6. **Within its two homogeneous groups, the audit trail IS internally consistent.** For
   non-failing tasks the verdict never contradicts `selfAssessment`, and identical situations
   get identical numbers. The inconsistency is structural (findings 1–2, 4–5), not per-task
   noise.

## 4. Recommendations

1. Persist the **per-dimension rubric breakdown** in `.result`, not just the total — so an
   auditor can see *why* 89.33 ≠ 100.
2. Make `brainEvaluationReason` name the **specific** criterion/debt driving the verdict
   (template → task-anchored), satisfying `brain.md`'s task-specific rule.
3. Decide explicitly whether the numeric rubric **gates** the verdict or merely annotates
   `selfAssessment`; today it is the latter, which the non-monotonic pair (finding 1) exposes.
4. Land the codex spawn/routing fix (born-479) and **assert `modelUsage` matches gpt-5** before
   any future task counts as a real codex run — otherwise V4 is a fourth Claude self-report.
