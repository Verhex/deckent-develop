# DIRECTIVES — RUN-POLICY canary (tek no-op task)

## Goal

Prove the task-carried run-policy chain end-to-end with ONE no-op task:
plan-time stamp → persisted task JSON digest → worker digest echo →
evaluator/finalizer parity → terminal settlement.

## Execution Contract

- No build and no repository-wide/full-suite test run during this sprint.
- Effective concurrency is one; no parallel writer.
- The only writable PROJECT-CONTENT path is docs/execution/canary/CANARY-NOTE.md;
  any other project-content write is a boundary violation. Protocol-owned
  .tasks artifacts (your .plan, .result, .hb heartbeat) are required protocol
  writes and are NOT project content.
- Echo the policy digest in your .result as runPolicyEvidence exactly as the
  prompt's Result contract instructs.

## Task 1: Canary no-op doc touch
- Files: docs/execution/canary/CANARY-NOTE.md
- Scope: docs/execution/canary/

### Description
Create docs/execution/canary/CANARY-NOTE.md with the single line
"run-policy canary executed" and nothing else. Do not modify any other
project-content file.
