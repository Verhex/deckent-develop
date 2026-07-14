# DIRECTIVES — ROUTING-V3 live smoke (2 tasks)

## Goal
Two-task live smoke of RoutingEngineV3 plan-time assignment. Not for execution.

## Task 1: Add retry helper to connector send path
- Files: src/connectors/retry.ts, tests/connectors/retry.test.ts
- Scope: src/connectors/, tests/connectors/
- Dependencies: none
### Description
Implement a retry-with-backoff helper and wire it into the telegram connector send path. Ship tests with the code.
### goNogo
- goCriteria: helper implemented with tests green.
- nogo: no tests NO_GO.

## Task 2: Document the agent lint command
- Files: docs/reference/agent-lint.md
- Scope: docs/
- Dependencies: none
### Description
Write the reference page for deckent agent lint: reachability, gaps, overlaps sections and exit-code contract.
### goNogo
- goCriteria: reference page complete and accurate.
- nogo: missing exit-code contract NO_GO.
