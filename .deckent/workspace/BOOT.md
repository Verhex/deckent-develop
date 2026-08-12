<!-- DECKENT:WORKSPACE id="boot" schema="1" authority="managed" provenance="workspace-artifact-registry" -->
# Boot

## Boot Sequence
<!-- DECKENT:CONTRACT id="boot" schema="1" sha256="b2c402d70097f4cffdca94bd949202f9df09a2ce3688cde161cfd378da425240" -->
1. **Load authority** — Brain reads `DIRECTIVES.md`, effective config and `.brain/memory.db`; generated projections never create policy.
2. **Plan and admit** — the exact DAG, provider/model/auth/budget/reachability and write scope are resolved before dispatch.
3. **Spawn** — the configured platform adapter launches only admitted workers.
4. **Execute** — workers publish host-observed heartbeat, activity and result-ingress artifacts.
5. **Evaluate** — Brain reconciles disk truth, tests, scope, cost and policy evidence into GO, FIX or typed HOLD/NO_GO.
6. **Fix** — eligible failures enter the bounded FIX DAG; `processQueue` never fabricates dependency completion.
7. **Finalize and archive** — terminal settlement, Retrospective, memory, trace and projections are published before canonical retention runs.
<!-- DECKENT:CONTRACT:END id="boot" -->

## Manual Recovery Chain
<!-- DECKENT:CONTRACT id="boot" schema="1" sha256="81120e8d9e25809bb2969357eb95df4002eeade2fd0d9504c3f001106669f7f7" -->
Recovery is diagnostics-first and fail-closed. Never start with kill or cleanup.

```bash
# 1. Inspect without mutation
deckent status --json
deckent doctor

# 2. Preview the canonical recovery operation
deckent recover <sprint-id> --dry-run

# 3. Resume only a canonically PAUSED/ORPHANED run
deckent recover <sprint-id> --resume

# 4. Execute mutating recovery only after exact owner approval
deckent recover <sprint-id>

# 5. Run a new one-shot description; this is not a historical task-id replay
deckent run "<description>"
```

MCP parity: `deckent_status {}` then `deckent_recover { sprintId, dryRun: true }`. A mutating MCP recovery additionally requires an exact identity/generation/fence-bound `approval`. `deckent_run` accepts `{ description }`, never `{ taskId }`. `kill` and `cleanup` are separate destructive operations and require their own live owner decision.
<!-- DECKENT:CONTRACT:END id="boot" -->
