# DIRECTIVES — MASTER3178 single comparison

## Goal
Owner-admitted diagnostic comparison. Single-worker control first, then twenty-task DAG with max4 concurrent workers resolved through config/capacity. No implementation or product closure in this measurement wave.

## Task 1: Single-worker control: result acceptance and derived directory evidence
- Files: docs/execution/active/dogfood-comparison/single/result/ANALYSIS.md
- Reads: src/orchestra/sprint-controller.ts, src/orchestra/spawn-backend-docker.ts, src/orchestra/scheduler-effects.ts, src/core/run-status-read-model.ts
- Scope: docs/execution/active/dogfood-comparison/single/result/
- Dependencies: none
### Description
Read only declared inputs. Deliver a concise, evidence-backed specification in the exact assigned document. Cite path:line and SHA256; separate measured fact, inference and unknown. No runtime/provider calls, no source/config changes, no build, no cleanup, no commit/push. Read predecessor documents only after their accepted dependency settlement; do not invent missing inputs or claim product DONE. The document must advance MASTER3178 recovery decisions for both dogfood and product operators, with cross-platform/tenant scope. Do not repeat whole predecessor reports; synthesize only this task contribution.
### goNogo
- goCriteria: Exact assigned document exists with attributable sources.; Declared predecessor inputs are cited by content digest.; Findings distinguish facts from hypotheses\; no fabricated receipts or test results.
- nogo: Missing required dependency output.; Any write outside assigned file or unsupported completion claim.
