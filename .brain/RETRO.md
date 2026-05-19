# Sprint sprint-174 Retrospective

## Summary
Completed 5/7 tasks in 14 minutes 51s.

## Highlights
- 5 tasks completed on first try
- No boundary violations detected

## Issues
- Task 174-001 (Fix debt: Tech debt from 170-001-fix: Code physically verified despite missing .result (Sp) failed — Worker exited without writing result (exitCode=0)

## Metrics
| What | Value |
|------|-------|
| Tasks completed | 5/7 |
| Code changes | +858 / -0 |
| Sprint time | 14 minutes 51s |
| NO_GO rate | 29% (2/7) |


## Agent Performance
| Agent | Tasks | Done | Debt | NoGo | Avg Coverage |
|-------|-------|------|------|------|-------------|
| doc-writer | 5 | 5 | 0 | 0 | 0% |
| bug-fixer | 1 | 0 | 0 | 1 | 0% |


## Skill Performance
| Skill | Tasks | Done | Debt | NoGo | Avg Coverage |
|-------|-------|------|------|------|-------------|
| documentation-writer | 5 | 5 | 0 | 0 | 0% |

## Token Usage
| Task | Model | Input | Output | Cache Read | Total |
|------|-------|-------|--------|------------|-------|
| 174-001 | opus | 0 | 0 | 0 | 0 |
| 174-002 | sonnet | 8.5K | 2.8K | 4.2K | 15.5K |
| 174-003 | sonnet | 8.5K | 1.8K | 0 | 10.3K |
| 174-004 | sonnet | 3.2K | 620 | 0 | 3.8K |
| 174-005 | sonnet | 8.5K | 1.8K | 0 | 10.3K |
| 174-006 | sonnet | 12.0K | 2.2K | 0 | 14.2K |
| **Total** | — | 40.7K | 9.2K | 4.2K | 54.1K |

### Quality Dimensions (sprint-174)
| Task | Correctness | Coverage | Scope Adherence | Completeness | Overall |
|------|-------------|----------|-----------------|--------------|---------|
| 174-001 — Fix debt: Tech debt from 170-0 | 0 | 0 | 100 | 0 | 20 |
| 174-002 — Pitch deck — marketing-ai-pitc | 100 | 0 | 100 | 100 | 75 |
| 174-003 — Canva template map — canva-kit | 100 | 0 | 100 | 100 | 75 |
| 174-004 — Canva bulk CSV — canva-kit/can | 100 | 0 | 100 | 100 | 75 |
| 174-005 — Aylık üretim rehberi — canva-k | 100 | 0 | 100 | 100 | 75 |
| 174-006 — Kit index + tutarlılık — canva | 100 | 0 | 100 | 100 | 75 |
| **Sprint Avg** | — | — | — | — | **66** |

## Learnings
- Fix debt: Tech debt from 170-001-fix: Code physically verified despite missing .result (Sp: failed — Worker exited without writing result (exitCode=0)
- Open HIGH debt: ADR-019 reconciliation: language-agnostic verify not implemented
- Open CRITICAL debt: Tech debt from 170-001-fix: Code physically verified despite missing .result (Sp

### Gate Failure
Self-audit gate failed for sprint sprint-174. Status: GO_WITH_GATE_FAILURE.

- vitest: 2 failing tests
