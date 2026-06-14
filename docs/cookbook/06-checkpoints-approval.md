# Cookbook: Checkpoints and Approval

Human checkpoints are predefined pause points in the sprint workflow where deckent stops and waits for your explicit go-ahead before continuing. They let you review work-in-progress at critical phases without giving up full automation.

## What Triggers a Checkpoint?

Checkpoints are written to `.deckent/checkpoints/checkpoint-{sprintId}-{phase}.json` by Brain during sprint execution when a checkpoint gate is reached. The gate pauses execution until the checkpoint file's `status` field is updated to `approved` or `rejected`.

## Listing Checkpoints

```bash
deckent checkpoint list
```

Output:

```
Sprint           Phase     Status   Summary                                    Created
sprint-286       SPAWN     pending  6 workers spawned, 0 errors                2026-06-14T09:12:44Z
sprint-285       EVALUATE  approved All tasks GO or GO_WITH_TECH_DEBT          2026-06-13T17:30:01Z
```

Filter to only pending checkpoints:

```bash
deckent checkpoint list --pending
```

Output as JSON (useful for scripting):

```bash
deckent checkpoint list --json
```

## Approving a Checkpoint

```bash
deckent checkpoint approve <sprintId> <phase>
```

Example:

```bash
deckent checkpoint approve sprint-286 SPAWN
# Checkpoint sprint-286/SPAWN approved.
```

Once approved, Brain resumes execution from the paused phase.

## Rejecting a Checkpoint

```bash
deckent checkpoint reject <sprintId> <phase>
```

Example:

```bash
deckent checkpoint reject sprint-286 SPAWN
# Checkpoint sprint-286/SPAWN rejected.
```

Rejection marks the checkpoint as rejected. Brain's FIX/recovery logic then decides whether to retry, escalate, or stop the sprint — depending on the phase and sprint configuration.

## Checkpoint File Format

Stored in `.deckent/checkpoints/`:

```json
{
  "phase": "SPAWN",
  "summary": "6 workers spawned, 0 errors",
  "status": "pending",
  "createdAt": "2026-06-14T09:12:44.000Z"
}
```

Filename pattern: `checkpoint-{sprintId}-{phase}.json`

Status values: `pending` | `approved` | `rejected`

## MCP `deckent_checkpoint`

The `deckent_checkpoint` MCP tool provides the same operations for IDE integrations and external automation:

```
# List checkpoints
deckent_checkpoint({ action: "list" })
deckent_checkpoint({ action: "list", filter: "pending" })

# Approve
deckent_checkpoint({ action: "approve", sprintId: "sprint-286", phase: "SPAWN" })

# Reject
deckent_checkpoint({ action: "reject", sprintId: "sprint-286", phase: "SPAWN" })
```

## Workflow Example

1. A sprint starts and hits a checkpoint gate at the `SPAWN` phase.
2. Execution pauses. Brain logs the checkpoint and waits.
3. You review the spawned workers: `deckent status --json | jq '.workers'`.
4. Everything looks good — approve: `deckent checkpoint approve sprint-286 SPAWN`.
5. Brain resumes the `EXECUTE` phase automatically.

If something is wrong, reject instead. Brain interprets the rejection and either retries, requests a FIX, or surfaces a `NO_GO` result for the sprint.
