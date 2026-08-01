# Cookbook: Status and Watch

Monitor an active sprint from the terminal in real time.

## Basic Status Snapshot

```bash
deckent status
```

Shows the current sprint dashboard: worker list, task completion count, active phases, and any Auditor alerts.

## Auto-Refresh with `--watch`

```bash
deckent status --watch
```

Refreshes on file-change events (`fs.watch()`), with a 5-second heartbeat fallback; or polling every 2 seconds when file-watch is unavailable. Press `Ctrl+C` to exit. Use this during long sprints to keep an eye on progress without streaming logs.

## Event-Driven Follow Mode

```bash
deckent status --follow
```

Subscribes to the sprint's EventBus instead of polling. Updates arrive as soon as a worker writes a heartbeat or result. Falls back to 5-second polling if no events arrive. More responsive than `--watch` during active execution.

## JSON Output for Scripting

```bash
deckent status --json
```

Emits a raw JSON object. Pipe it into `jq` to extract specific fields:

```bash
# Count completed tasks
deckent status --json | jq '.tasks.completed'

# List active worker IDs
deckent status --json | jq '[.workers[] | select(.status == "EXECUTING") | .id]'
```

Add `--verbose` to include full agent and skill assignment detail in the JSON:

```bash
deckent status --json --verbose
```

## Dependency Graph

```bash
deckent status --graph
```

Prints the current sprint's task dependency graph as a Mermaid diagram (read from `.deckent/sprint-NNN-depgraph.mmd`). Paste the output into any Mermaid renderer to visualize wave ordering.

## Additional Flags

| Flag | Description |
|------|-------------|
| `--watch` | Event-driven refresh (`fs.watch` + 5s fallback); 2-second polling when file-watch unavailable |
| `--follow`, `-f` | Event-driven refresh (EventBus + 5s fallback) |
| `--json` | Raw JSON output |
| `--verbose` | Include agent/skill assignment detail |
| `--raw` | Legacy box-format dashboard |
| `--no-color` | Disable ANSI color codes (useful for log files) |
| `--graph` | Print dependency graph as Mermaid diagram |
| `--mode <mode>` | Output render mode: `standart` \| `explainatory` \| `verbose` \| `json` |

## Live Tmux Split with `deckent watch`

`deckent watch` opens a live tmux split view: the left pane streams the sprint dashboard, the right panes show individual worker output.

```bash
deckent watch
```

Docker workers stream via `docker logs -f`. Subprocess workers tail their log file. The split ratio adapts to your terminal width (70/30 for narrow terminals, 60/40 for wide terminals).

To attach directly to a specific worker's pane:

```bash
deckent watch --follow w-286-003
```

> **Note:** `deckent watch` requires an active tmux session. `deckent status --watch` works in any terminal without tmux.

## Standalone Mode (No Active Sprint)

`deckent status` also works when no sprint is running. It reads `.tasks/*.json` directly and shows the last-known task state. Useful for inspecting a sprint that completed or was cleaned up.
