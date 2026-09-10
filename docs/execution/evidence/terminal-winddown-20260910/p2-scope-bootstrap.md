# P2 — session lifecycle (scoped delivery)

**Commit target:** post P1 `1dfc9441e`  
**Status:** code slice complete pending owner bulk PTY check

## Delivered

| Capability | Where |
|------------|--------|
| Work budget snapshot (rounds/tools/tokens/wall) | `work-budget-snapshot.ts` → `sessionLifecycle.workBudget` |
| User idle vs work wall (idle does not consume wall budget) | `lastUserActivityAtMs` + lifecycle labels |
| Operation phase | `idle` · `turn` · `compact` · `reference` · `permission-wait` · `budget-blocked` |
| Attempt counter | `turnSequence` on lifecycle snapshot |
| Surfaces | `/context` (`formatContextSnapshot`) · `/status` (`nativeStatusDetail`) |

## Explicit HOLD (full P2 rapor)

- Durable job/attempt/operation registry + `/queue` parity
- Authorized resume after internal lease (P3 compaction dependency)
- Real binary proof

## Owner bulk check (suggested)

1. Native REPL → `/context` — lifecycle block + P1 measurement block  
2. `/status` — same lifecycle lines appended to local chat context  
3. Mid-turn `/context` — `operation: turn in flight`  
4. After `/renew` — work budget epoch increments; user idle keeps counting separately  

Evidence: `p2-local-verify.json`
