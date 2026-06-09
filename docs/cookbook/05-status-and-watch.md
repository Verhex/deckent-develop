# Cookbook: Status and Watch

Check live run progress from the terminal.

```bash
deckent status         # current task count, completion %, active workers
deckent status --watch # auto-refreshes every 2s until you press Ctrl+C
deckent status --json  # raw JSON for piping into scripts or dashboards
```

Use `--watch` during long autonomous runs to monitor progress without logs. Use `--json` with `jq` to extract metrics (e.g., `deckent status --json | jq '.tasks.completed'`).
