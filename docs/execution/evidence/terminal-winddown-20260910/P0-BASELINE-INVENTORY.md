# P0 CLI baseline inventory (contract SSOT)

**Operator:** cursor-composer · **UTC:** 2026-09-10 · **Depends on:** accepted P0 registry inventory (`p0-astra-accepted.json`).

## Conclusion

CLI path-level baseline **exported from `CLI_COMMAND_CONTRACTS`** — 280 contract rows, 269 CLI-surface rows, 92 registry projections. Summary-binding debt **0** at catalog level. **Owner live binary baseline NOT_RUN** (bot/build HOLD). This completes the **catalog half** of full P0; runtime owner battery remains HOLD.

## Counts (from `p0-cli-baseline-inventory.json`)

| Metric | Value |
|--------|------:|
| Contract rows | 280 |
| CLI surface rows | 269 |
| COMMAND_REGISTRY entries | 92 |
| MCP catalog | 51 |
| Slash unique agentic tools | 24 |
| Option flags (catalog-bound) | 593 / 593 |
| Positional args (catalog-bound) | 117 / 117 |

## Verification (LOCAL)

```bash
npx tsx docs/execution/evidence/terminal-winddown-20260910/p0-cli-baseline-export.ts
npx vitest run tests/cli/command-registry.test.ts tests/cli/cli-surface-truth-battery.test.ts
```

**2026-09-10 local:** `cli-surface-truth-battery` exit **0**. `command-registry` exit **1** — known gaps: CLI `help` registry projection; REPL-only `/context`, `/compact` (run.tsx local handlers). Class: P4 registry parity, **not** P0 baseline export blocker. Details: [p0-baseline-local-verify.json](./p0-baseline-local-verify.json).

## Artifacts

- [p0-cli-baseline-inventory.json](./p0-cli-baseline-inventory.json)
- [p0-cli-baseline-export.ts](./p0-cli-baseline-export.ts)
- Registry slice: [p0-handler-inventory.json](./p0-handler-inventory.json) (schema v3, ACCEPTED)

## Open (not this deliverable)

- P1 identity/context truth (product code)
- Owner PTY battery + normal vs benchmark manifest + live run
- P4 per-handler contract tests beyond catalog SSOT
