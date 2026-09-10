# Cursor → Astra closure package (ENTRY 180)

## Scope delivered (single landing commit)

1. **P4 native read permission resource parity** (`native-permission-resource.ts`)
   - `permissionResource` aligned with `chat-tool-exec`: `String(args['path'] ?? default)`, no trim, no `file_path` alias for list_dir authority.
   - grep/glob: explicit `path` (including `"."` and `""`) → resource = `String(path)`; absent path → pattern-only (fixes deny regression on `deckent_grep(.)` with `{ path: ".", pattern }`).
   - Classifiers + REPL bridge use same helper; nested `call_tool` read parity in registry tests.

2. **Terminal transcript UX (Workline)**
   - Calm tool lines: `formatToolTranscriptVerb` + `describeToolTarget` (no `deckent_* — tool ran`).
   - Assistant markdown: per-line `truncate-end`; **narrow TTY**: `maxTerminalWidth` on `renderMarkdown` degrades wide tables to compact bullet rows (`header: value · …`).
   - Live footer: `formatToolActivityDisplay` → `{tool}` placeholder shows verb+target, not raw tool id.

3. **Context budget (operator clarity)**
   - Turn stop on `ToolResultContextBudgetError` already surfaces localized `native.TOOL_RESULT_CONTEXT_BUDGET_EXHAUSTED` via bridge `error` event (not a permission defect).

## LOCAL_VERIFIED (this host)

```text
npx vitest run tests/agent/native-tool-approval.test.ts tests/agent/native-read-approval-registry.test.ts tests/agent/native-permission-session.test.ts tests/cli/repl/native-permission-round.test.tsx  → 50/50
npx vitest run --config docs/execution/evidence/terminal-winddown-20260910/p4-permission-rca/vitest.config.ts  → 7/7
npx vitest run tests/cli/repl/transcript-turn-view.test.tsx tests/cli/repl/tool-target.test.ts tests/cli/repl/interaction-flow.test.ts tests/cli/repl/native-tool-activity.test.tsx tests/cli/native-agent-bridge.test.ts tests/cli/chat-render-markdown.test.ts  → 62/62
npx tsc --noEmit  → exit 0
```

Owner may have run `npm run build:all` separately; agent did not run build during sprint (policy).

## Prior commits in chain

- `0ec9f9479` — first transcript UX slice
- `54b9fae0a` — P4 landing (partial; superseded by final commit for 176/178 fixes + UX limits)

## HOLD (unchanged — not in this package)

| Item | Class |
|------|--------|
| Live PTY / full operator session proof | RELATED — owner gate |
| P2 work/idle accounting on outer run | RELATED — parallel track |
| Model workflow under heavy parallel grep/bash (context governor) | RELATED — product guidance, not P4 |

## Evidence paths

- `docs/execution/evidence/terminal-winddown-20260910/p4-permission-rca/`
- `docs/execution/evidence/terminal-winddown-20260910/owner-pty-p1-p2-session-20260911.md`
- `docs/execution/evidence/terminal-winddown-20260910/astra-terminal-flow-analysis-20260911.md`

## Request to Astra

One-shot **ACCEPT / REVISE** on this package: permission semantics, test matrix, transcript/footer/table limits, and explicit HOLD list. No per-micro-step READY chain.
