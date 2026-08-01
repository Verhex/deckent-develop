# Sprint-363 Debt-Note Close-Out (364-006)

Reads the 3 debt-notes named by 364-006's task description (`005-brain-debt`, `009`,
`011` — resolved to `debt-363-005`, `debt-363-009`, `debt-363-011` in
`.brain/memory.db`/`.brain/exports/debt.md`, confirmed by `originTaskId` metadata)
out of `.brain/archive/sprint-363-tasks/` result files, closes what falls inside this
task's write-authority, and lists everything else as a concrete file+line+
recommendation followup. Write-authority for 364-006 is the **RPC-write family**
only (`src/api/rpc-write-handlers.ts`, `tests/api/rpc-write-handlers.test.ts`).

## In-authority: nothing to close (verified, not assumed)

None of the 3 named debt-notes' origin scope touches the RPC-write family:

| Debt | `originScope.filesWrite` (from `.brain/memory.db`) |
|---|---|
| `debt-363-005` | `src/cli/commands/onboard.ts`, `src/cli/index.ts`, `src/cli/helpers/messages.ts`, `tests/cli/onboard-command.test.ts` |
| `debt-363-009` | `src/mcp/tools/autonomous-approval.ts`, `tests/mcp/autonomous-approval.test.ts` |
| `debt-363-011` | `src/cli/helpers/health-snapshot.ts`, `tests/cli/session-warn.test.ts` |

`src/api/rpc-write-handlers.ts` / `tests/api/rpc-write-handlers.test.ts` appear in
none of the three. This task therefore made **zero** source edits — confirmed
already-correct, not silently skipped:

- `npx tsc --noEmit` → clean (0 errors), before and after.
- `npx vitest run tests/api/rpc-write-handlers.test.ts` → 16/16 passed, before and
  after.
- The RPC-write family's own known open item (`debt-363-003` — `server.ts` not yet
  wired to `buildRpcWriteHandlerMap`, documented in `rpc-write-handlers.ts:1-17`)
  is **not** one of the 3 debt-notes this task was scoped to and was left untouched.

## ⚠️ Root cause: all 3 "resolved" debts are self-resolved on creation, not fixed

Before trusting `.brain/exports/debt.md`'s "Resolved Technical Debt" status for
`debt-363-005/009/011` at face value, this task disk-verified each one's actual
open item (below) instead of the ledger label — per operating-rule "disk-verify
ground truth; don't trust synthetic status." **2 of 3 are still open on disk**
despite the ledger marking all 3 `resolved`, `resolvedInSprintId: sprint-363`
(same sprint they were created in), `sprintsOpen: 0` (never escalated once).

That pattern traces to a real, reproducible defect, not per-item bad luck:

- `src/orchestra/debt-manager.ts:339-343` (`handleEvaluation`, `GO_WITH_TECH_DEBT`
  branch) creates `debt-${task.id}` with `status: 'active'` via `recordDebtEntry`
  (`debt-manager.ts:87` — `debtId = \`debt-${task.id}\``).
- `src/orchestra/sprint-phases.ts:1742` calls `handleEvaluation(...)` for that same
  task, in the **same per-task EVALUATE-loop iteration**.
- Immediately after, `sprint-phases.ts:1787-1791`:
  ```
  if (evaluation === TaskEvaluation.DONE || evaluation === TaskEvaluation.GO_WITH_TECH_DEBT) {
    if (task.isPriorityFix && task.fixForTaskId) {
      resolveDebt(projectRoot, `debt-${task.fixForTaskId}`, sprint.id);
    }
    resolveDebt(projectRoot, `debt-${task.id}`, sprint.id);   // line 1791 — unconditional
  }
  ```
  Line 1791 sits **outside** the `isPriorityFix`/`fixForTaskId` guard (lines
  1788-1790) — it runs for *every* ordinary task that evaluates DONE or
  GO_WITH_TECH_DEBT, resolving `debt-${task.id}`, i.e. the exact entry
  `recordDebtEntry` just inserted one call earlier in the same pass.
  `resolveDebt` (`debt-manager.ts:563-580`) only guards against a missing or
  already-resolved entry (line 569) — it has no guard against "entry was created
  in this same evaluation pass and its follow-up item was never verified."

Net effect: **every non-fix task's own `GO_WITH_TECH_DEBT` debt entry is created
and self-resolved in the same instant**, regardless of whether the docImpact /
scopeGap item it describes ever lands. `sprintsOpen` never increments past 0
because the entry never survives to a second sprint's `escalateDebt` pass
(`debt-manager.ts:532-551`), so `injectCriticalDebtTasks`-style follow-up
injection never sees these items as `active` candidates. This is why sprint-363's
own leftover items (below) never resurfaced automatically and needed this manual
"DEBT-CLOSE" reading task instead — and, by the same code path, why most of the
dozens of other rows in debt.md's "Resolved Technical Debt" table (362-004,
361-002, 360-013, 359-001/003/008/011/012/013, 358-003/004/005/009, 357-009/010/
014/016, 354-001/010/011/012, …) are unverified self-resolutions rather than
confirmed fixes — this task did not re-audit all of them, only the 3 in its
brief, but the mechanism is identical for any of them created by an ordinary
(non-`isPriorityFix`) `GO_WITH_TECH_DEBT` task.

**Recommendation:** gate `sprint-phases.ts:1791` the same way lines 1788-1790
already are — only self-resolve `debt-${task.id}` when `task.isPriorityFix &&
task.fixForTaskId` is true (i.e. this task IS a fix, resolving its own residual
debt after a second pass), never on the first `GO_WITH_TECH_DEBT` verdict that
created the entry. A `GO_WITH_TECH_DEBT` task's own debt should only close via
`escalateDebt`/a real fix task/an explicit DEBT-CLOSE audit like this one — never
in the same breath it was opened. Out of 364-006's write authority
(`src/orchestra/sprint-phases.ts`, `src/orchestra/debt-manager.ts` not in scope —
only the RPC-write family + `docs/analysis/` is). Recommend a dedicated
Brain-scoped task (`src/orchestra/` write authority).

## Out-of-authority followups (per debt-note)

### 1. `debt-363-009` — MCP wiring gap: CLOSED (verified, no action needed here)

**Traces to:** "009" (`AUTONOMOUS-APPROVAL-MCP`).

363-009 left `deckent_autonomous_approve`/`deckent_autonomous_reject` implemented
in `src/mcp/tools/autonomous-approval.ts` but unregistered in
`src/mcp/tools/index.ts` / `src/mcp/server.ts` / `tests/mcp/tools/index.test.ts`
(its own write scope excluded all three). Disk-verified now-current state:

- `src/mcp/tools/index.ts:38` imports `registerAutonomousApprovalTools`;
  `:112-113` list both tools in `TOOL_CATALOG`; `:156` calls
  `registerAutonomousApprovalTools(server)`; `:117` `MCP_TOOL_COUNT =
  TOOL_CATALOG.length` → 46.
- `src/mcp/server.ts:27` — `## Tools (46)`.
- `tests/mcp/tools/index.test.ts:112-161` — hardcoded literals updated to `46`.

Closed by commits `0928d0e4` ("46-tool sayaç-senkronu"), `e987030b` ("autonomous
approve/reject TOOL_CATALOG girişleri"), `8f023735`
("registerAutonomousApprovalTools wire") — hand-coded fixes made ahead of this
sprint, outside the standard worker pipeline. No further action. (The ledger's
`resolved` status happens to be correct here — but that is coincidental
same-day hand-fixing, not evidence the self-resolve mechanism above is sound;
see the root-cause section.)

### 2. `debt-363-011` — `messages.ts` key still missing: OPEN

**Traces to:** "011" (`WATCH-SESSION-WARN`).

**File:** `src/cli/helpers/messages.ts` — no `health.session_warn` key exists
(`grep -n "health.session_warn" src/cli/helpers/messages.ts` → 0 hits, confirmed
today). 363-011 wired `renderHealthSnapshot()` in
`src/cli/helpers/health-snapshot.ts` to call
`getMessage('health.session_warn', lang, { count })` when ≥4 parallel sessions are
active, and explicitly designed the fail-soft path (raw key string, no crash) so
production stays safe until the key lands — but the key itself was named as
outside 363-011's own write scope (`{health-snapshot.ts, session-warn.test.ts}`)
and still has not been added by any later task.

**Recommendation:** add one key to `src/cli/helpers/messages.ts` (en+tr), exact
text already specified in 363-011's own notes:
```
'health.session_warn': {
  en: 'Warning: {count} parallel sessions active -- they share a single usage limit.',
  tr: 'Uyari: {count} paralel oturum aktif -- kullanim limiti paylasiliyor.',
}
```
No other code change needed — `RenderHealthSnapshotDeps.getMessageFn` already
defaults to the real `getMessage()`, so the warning starts rendering localized
text the moment the key exists. Out of 364-006's write authority
(`src/cli/helpers/messages.ts` not in scope).

### 3. `debt-363-005` — stale docstrings claiming keys are still unwired: OPEN

**Traces to:** "005-brain-debt" (`ONB-ENTRY-WIRE`).

363-005 added ~50 `onboarding.*`/`onboarding.ui.*`/`onboarding.plan.*` keys to
`src/cli/helpers/messages.ts` (confirmed: `grep -c "'onboarding\." messages.ts` →
50) and wired a real `getMessage`-backed `OnboardingLabelResolver` at
`src/cli/commands/onboard.ts:330` (`const resolveLabel: OnboardingLabelResolver =
(key, params) => getMessage(key, lang, params);`), consumed by
`runOnboardInkFlow` (`onboard.ts:318`). Two docstring blocks it does not own
still describe both facts as future work:

- **File:** `src/cli/helpers/onboarding-wizard.ts:14-18` — "New message keys this
  module introduces are NOT added to messages.ts here (out of this task's write
  scope) — see the worker's `.result` `docImpact` note." The keys ARE now in
  `messages.ts`; this text is stale.
- **File:** `src/cli/repl/onboarding-ui.tsx:20-24` — "Every label is a `*Key` the
  caller resolves via the injected `{@link OnboardingLabelResolver}`
  (**getMessage-backed in the entry-wire follow-up**)…" — the "follow-up" already
  landed (`onboard.ts:330`, above); this text now reads as still-pending when it
  is done.

**Recommendation:** in `onboarding-wizard.ts:14-18`, replace the "NOT added…out
of this task's write scope" sentence with a note that the keys live in
`messages.ts` (added by 363-005). In `onboarding-ui.tsx:20-24`, replace
"getMessage-backed in the entry-wire follow-up" with "getMessage-backed, wired at
the entry-wire (`cli/commands/onboard.ts:330`)". Both are comment-only edits,
zero behavior change. Out of 364-006's write authority (`src/cli/helpers/`,
`src/cli/repl/` not in scope).
