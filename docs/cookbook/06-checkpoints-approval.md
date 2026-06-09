# Recover a Stuck Sprint

Human checkpoints are a crucial mechanism in Deckent for introducing human oversight and approval into the sprint execution flow. This allows you to pause the agentic workflow, review progress, and make critical decisions before the sprint proceeds.

## `deckent checkpoint`

The `deckent checkpoint` command is used to interact with these human checkpoints directly from the CLI.

-   **Approve:** When a checkpoint is hit, the sprint pauses, awaiting human input. You can approve the checkpoint, allowing the sprint to continue its execution.
    ```bash
    deckent checkpoint approve
    ```
-   **Reject:** If the state at the checkpoint is not satisfactory, you can reject it. This typically marks the current task or sprint as `NO_GO`, requiring re-evaluation or manual intervention.
    ```bash
    deckent checkpoint reject
    ```

## What is a Checkpoint Gate?

A checkpoint gate is a predefined point in the sprint workflow where the system automatically pauses and waits for explicit human approval. These are often configured in `DIRECTIVES.md` or within the task definition to ensure critical steps are human-verified.

## MCP `deckent_checkpoint`

For programmatic interaction, the MCP (Multi-Control Plane) provides the `deckent_checkpoint` tool. This allows external systems or integrated development environments to approve or reject checkpoints, facilitating automation within a broader human-in-the-loop workflow.

```typescript
// Example MCP call to approve a checkpoint
deckent_checkpoint({ action: 'approve' });

// Example MCP call to reject a checkpoint
deckent_checkpoint({ action: 'reject', reason: 'Review failed' });
```

For more details on specific flags and advanced usage, refer to `deckent help checkpoint`.
