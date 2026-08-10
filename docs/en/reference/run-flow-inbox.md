# Run-flow inbox

`deckent runs` shows the run-flow inbox: the current set of flows that have
entered Deckent's run lifecycle. A run-flow carries a proposed run through a
decision, then (when approved and started) detached background execution and
its eventual terminal outcome. The inbox is the shared operator view for
seeing those flows and acting on one of them.

Run `deckent runs` to list the inbox. To inspect one flow, pass either its
current list position or a unique flow-id prefix:

```bash
deckent runs 2
deckent runs bbbb2222
```

List positions can change as the inbox is refreshed or re-sorted, while a
unique flow-id prefix is the stable handle. A prefix that does not identify
exactly one flow is not guessed.

## Decisions

Decision flags require a target (`<n>` or a unique flow-id prefix).

- `--approve` records approval for the selected flow (SLOW AHEAD). It does
  not start execution unless it is combined with `--start`.
- `--start` starts the selected approved flow as a detached background run.
  Starting an unapproved flow is refused by the run service. Combined with
  `--approve`, it approves and then starts the flow (FULL AHEAD).
- `--reject` records a STOP decision for the selected flow. It cannot be used
  with `--approve`.
- `--reason <text>` records a reason with `--reject`; it is invalid without
  `--reject`.

## Stale-run classification

Use `--close-stale` to classify flows that still claim to be live but have a
dead process or an unverifiable pre-process record. It is dry-run by default:
the command reports candidates and makes no writes. Add `--yes` to durably
close them: proven dead processes are closed as failed, while operator-consented
unverifiable records are closed as cancelled.

## Example

Inspect the inbox, then approve and start the flow currently at position 2:

```bash
deckent runs
deckent runs 2 --approve --start
```

The second command prints the refreshed detail for that flow, so the displayed
state reflects the resulting durable decision and start attempt.
