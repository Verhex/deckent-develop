# Sprint-366 Debt-Note Close-Out (367-004)

Reads the sole sprint-366 `GO_WITH_TECH_DEBT` note (`.brain/archive/sprint-366-tasks/task-366-003.result`,
the `openrouter-probe` verify-and-close task), disk-re-verifies its open item, closes
what falls inside this task's write-authority, and documents the rest as a concrete
file+line recommendation. Write-authority for 367-004 is exactly two files:
`docs/analysis/debt-close-366.md` (this doc) and `tests/cli/openrouter-probe.test.ts` —
same narrow doc+test pair pattern as `debt-close-364.md` / `debt-close-363.md`; the task
title's "src/cli/" read-scope does not extend to `src/cli/command-registry.ts` write
access (Scope Rules: the write list is the single authority).

## 0 — Debt-note inventory (is there anything else to fold in?)

Ran `grep -n '"selfAssessment":\s*"(GO_WITH_TECH_DEBT|NO_GO)"' .brain/archive/sprint-366-tasks/task-366-*.result`
across all 8 sprint-366 task results. Exactly **one** match: `task-366-003.result`.
(`366-002` and `366-004`'s prose mentions `GO_WITH_TECH_DEBT`/`NO_GO` while discussing
*364-series* debts inherited from an earlier sprint, but their own `selfAssessment`
field is `DONE` — they are not 366-series debt notes and are out of this task's title
scope.) So there is nothing else to scan/fold in; this doc covers the one real note.

## 1 — debt-366-003: `command-registry.ts` missing the `openrouter-probe` entry

**366-003's claim:** `COMMAND_REGISTRY` (in `src/cli/command-registry.ts`) has no entry
for the `openrouter-probe` CLI command, so `tests/cli/command-registry.test.ts`'s
disk-truth coverage guard ("every registered top-level CLI command has a registry entry
with the `cli` surface") fails for it. 366-003 left this open because
`command-registry.ts` was outside its `filesWrite` scope.

**Disk-re-verified today (not trusting the old note):**

```
$ npx vitest run tests/cli/command-registry.test.ts
FAIL  … > every registered top-level CLI command has a registry entry with the "cli" surface
AssertionError: expected [ 'limits', 'openrouter-probe' ] to deeply equal []
```

`openrouter-probe` is confirmed **still absent**. `registerOpenRouterProbe` is wired
into `buildProgram()` (`src/cli/index.ts:71,168`) so the command genuinely runs — only
the registry catalog entry is missing.

**Cannot be closed by this task**: `src/cli/command-registry.ts` is not in 367-004's
`filesWrite` (same constraint 366-002 hit for its own out-of-scope 364-series items).
Closing it needs a follow-up task with that file in scope. Ready-to-paste entry,
modeled on the closest existing analog — `entry('models', 'Core', 'Değiştir', 'core',
['cli', 'mcp', 'repl'], ['deckent_models'])`, the other command that does a live network
refresh + local-cache write, same category/risk shape:

```ts
entry('openrouter-probe', 'Core', 'Değiştir', 'providers', ['cli']),
```

Rationale for the 4 fields:
- `category: 'Core'` — a diagnostic/data-refresh utility, not part of the sprint
  lifecycle (`Run`) or a destructive op (`Danger`).
- `risk: 'Değiştir'` — it writes `.deckent/settings/openrouter-models.json`
  (`FREE_MODEL_CACHE_FILE`); it is not a spawn/execute-class risk (`Çalıştır`).
- `scope: 'providers'` — its whole reason for existing is probing the OpenRouter
  provider integration (`core/openrouter-models.ts`), not a generic `core` concern.
- `surfaces: ['cli']` only — no `mcp` or `repl` registration exists for it today, so no
  `mcpNames` array.

**Not this task's scope, mentioned for context only:** the same test run also reports
`'limits'` missing from the cli-surface assertion, and 8 `deckent_*` MCP tool names
missing `mcpNames` coverage. Both are pre-existing gaps 366-003's own notes already
called out as unrelated to `openrouter-probe` — not a 366-series debt, not touched here.

## 2 — Test-eksiği found and closed (in-scope)

Read `tests/cli/openrouter-probe.test.ts` end-to-end against
`src/cli/commands/openrouter-probe.ts`. The `openrouter_probe.more` message (source
lines 142-156: the human-readable listing truncates to `MAX_LISTED_MODELS` (10) and
prints a "+N more" line) had **zero test coverage** — the suite's only fixture had 2
models, so the slice/truncation branch never executed.

Closed in this task, added to `tests/cli/openrouter-probe.test.ts`:
- `'truncates the human-readable listing to MAX_LISTED_MODELS (10) and prints an "N
  more" line'` — 13-model fixture, asserts only models 0-9 print and the `… and 3 more`
  line renders.
- `'does NOT truncate the --json model array even past MAX_LISTED_MODELS'` — same
  fixture, asserts `--json` returns all 13 models (the JSON branch returns before the
  slice logic, an intentional asymmetry now locked in by a test).

## 3 — i18n check

All 6 `openrouter_probe.*` message keys (`header`, `unavailable`, `fetch_failed`,
`summary`, `model_line`, `more`) have both `en` and `tr` entries in
`src/cli/helpers/messages.ts` (lines 2416-2439). No i18n gap for this command.

## Verify

- `npx tsc --noEmit` — clean, 0 errors, repo-wide.
- `npx vitest run tests/cli/openrouter-probe.test.ts` — 18/18 pass (16 pre-existing +
  2 added by this task).
- `git diff --stat` / `git status --short` on this task's write-authority files only —
  no file outside `docs/analysis/debt-close-366.md` and
  `tests/cli/openrouter-probe.test.ts` touched.
