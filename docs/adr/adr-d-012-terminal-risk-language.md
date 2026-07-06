# ADR-D-012: Terminal Risk Language (Oku / Değiştir / Çalıştır / Otonom)

**Class:** ADR-D (Dogfooding / Dev) · **Scope:** `src/cli/command-registry.ts`, `src/cli/repl/tool-permissions.ts`, `src/cli/commands/chat-native.ts`, `src/cli/commands/chat-mcp-bridge.ts`, `src/cli/repl/native-tool-registry.ts`, `src/cli/helpers/catalog-render.ts`, `src/cli/helpers/messages.ts` (future i18n keys), `src/dashboard/` (forward constraint, no current consumer) · **Immutable:** no · **Source:** publisher+contributor · **Enforcement:** today=none (no lint/test enforces `CommandRisk` as the user-facing word; `tests/cli/command-registry.test.ts:29-31,48-51` only validates ladder-membership, not display or approval-tier consistency) → tomorrow=RISK-DRIFT-GUARD invariant test (§ Open Questions) + `cmdCatalog.*` i18n wiring + named registry-fix task(s), each closing before this ADR's Status graduates past `proposed`
**Status:** proposed (acceptance: Alperen) · **Date:** 2026-07-05 (re-verified against disk 2026-07-06, task 373-002 — two stale citation line-ranges corrected, no substantive claim changed) · **Absorbs:** the evidence package in `docs/design/term5-risk-language.md` (sprint-363, task 363-008) — this ADR is that document's §9 "Önerilen Karar" carried into ADR form, re-verified against disk on 2026-07-05, plus a new registry/approval-tier consistency check (§ Decision, item 4) beyond what that document itself measured
**Crosswalk:** MASTER-PLAN #45 (TERM-5, "Görsel+işlevsel tutarlı/yormayan dil + sade risk-dili", row status 🔬 at authoring time)

> **Origin note:** `docs/design/term5-risk-language.md` found that TERM-5's target 4-level ladder (`CommandRisk`) already exists in code (`command-registry.ts:34-38`) and is applied to all 75 registry entries, but has no i18n, no UI consumer, and coexists with 7 other risk/trust dictionaries with no central translation table. That document's §9 sketched a decision but explicitly stated it was not an ADR file and not recorded in `.brain/memory.db`. This document is that conversion, re-checked against the current source tree rather than copied verbatim.

---

## Context

`CommandRisk` (`'Oku' | 'Değiştir' | 'Çalıştır' | 'Otonom'`, `command-registry.ts:38`) is a plain-language, four-step risk ladder already assigned to every one of the 75 entries in `COMMAND_REGISTRY` (`command-registry.ts:91-188`). Its doc-comment already states the ladder semantics: read-only < local-state modification < execute/spawn a process < autonomous continuous-loop control (`command-registry.ts:34-37`).

Three gaps keep it from being a real user-facing risk language:

1. **No i18n.** Zero `cmdCatalog.*` keys exist in `messages.ts` (grep-verified 2026-07-05) — the `entry()` factory already emits `summaryKey: cmdCatalog.${name}.summary` (`command-registry.ts:82`), but nothing resolves it, and the ladder's four words themselves have no `getMessage` entry.
2. **No UI wiring.** The file's own header says so directly: "UI wiring (REPL slash-menu grouping, i18n message-key population...) is an explicit follow-up" (`command-registry.ts:28-29`). The one surface that renders a risk badge today, the REPL `/help` catalog (`chat-native.ts:414-477`), does not read `CommandRisk` at all — it derives its own badge from `ToolPermission` (`tool-permissions.ts`) through a private mapping table (`HELP_CATALOG_RISK_TO_RENDER_RISK`, `chat-native.ts:420-424`).
3. **No single mapping.** At least eight independent risk/trust vocabularies exist in the codebase (`CommandRisk`; `ToolTrustTier`; `ToolCatalogRiskLevel`; `ApprovalRisk`; `ToolPermission`; `CatalogRenderEntry.riskLevel`; nervous `RiskLevel`; base `ToolRiskLevel`) with no central translation table between them — `docs/design/term5-risk-language.md` §2-3 inventories all eight with source citations.

A concrete, disk-verified consequence of gap 3 is that the REPL/MCP-bridge confirm-gating tier (`ToolPermission`, the actual enforcement mechanism for what silently runs vs. what prompts) disagrees with the registry's `CommandRisk` tag for several commands — see Decision item 4 below, which re-verifies and extends the design document's own finding.

---

## Decision

### 1. The four-class risk language (canonical, user-facing)

`CommandRisk` is adopted as the **single canonical, user-facing** risk vocabulary for every surface that shows a command/tool to a human. The other seven internal dictionaries are **not** deleted, merged, or changed in behavior by this ADR — they continue to serve their own engineering purposes (approval-workflow timing, REPL confirm-gating, MCP trust badges). Each keeps a pure, display-only translation *into* `CommandRisk`, never the reverse.

| Class | Ladder position | Meaning | Registry doc-comment source |
|---|---|---|---|
| **Oku** ("Read") | 1 (lowest) | Read-only — displays information, changes nothing. | `command-registry.ts:35` |
| **Değiştir** ("Modify") | 2 | Local-state modification — writes local project/session state, generally reversible. | `command-registry.ts:36` |
| **Çalıştır** ("Execute") | 3 | Executes or spawns a process/action — starts something, often not reversible by re-running it. | `command-registry.ts:36` |
| **Otonom** ("Autonomous") | 4 (orthogonal, not "worse") | Opens a continuous, human-out-of-the-loop decision/work loop. Every action taken *inside* the loop still carries its own independent risk tag from another dictionary (§3 below) — `Otonom` is a mode-entry marker, not a severity ceiling. | `command-registry.ts:36-37` |

`Otonom` is deliberately not derivable from any of the other seven dictionaries (none of them encode "opens a continuous loop") — it stays a manually-assigned fourth badge on exactly the registry entries tagged for it today (`autonomous`, `autonomous-mission`, `gateway-runtime` — 3 of 75 entries).

### 2. Per-surface display rule

| Surface | State today (disk-verified 2026-07-05) | Decision |
|---|---|---|
| **REPL** (`/help` catalog) | Renders `ToolPermission` → `CatalogRenderEntry.riskLevel` (`low`/`medium`/`high`/`critical`) via a private mapping (`chat-native.ts:414-424`), never reads `CommandRisk`. | Adopt `CommandRisk` as the word shown to the user, sourced via `getMessage('cmdCatalog.risk.<class>', lang)` (draft keys below). The existing `CatalogRenderEntry.riskLevel` internal render-scale is a documented, prior, intentional decision (`catalog-render.ts:26-30`: "unifying further is YAGNI, 358-017") and is **not** replaced — `CommandRisk` is the label text laid over it, not a schema change. |
| **CLI** (`--help` / command listing) | No consumer exists — verified no `CommandRisk`/registry-driven `--help` renderer in `src/cli/`. | When a CLI-native catalog view is built, it must show the same four words as plain text (no ANSI-only glyph substitute) so the label survives a non-tty pipe/redirect. |
| **MCP** | Tool metadata exposes `readOnlyHint`/`destructiveHint` annotations (`tool-registry.ts:47-52`) — protocol-level booleans, consumed by `deriveRiskFromAnnotations`. Not `CommandRisk`-shaped and not meant to be — MCP clients rely on the protocol's own hint vocabulary. | Do not change the MCP annotation schema. Where a tool's human-readable *description* text is authored, it may additionally name the `CommandRisk` class in English (project convention: command/tool tokens stay English-invariant regardless of UI language — `chat-native.ts:406-409`), so an integrator reading tool descriptions sees the same word REPL users see. This is prose-level, not protocol-level. |
| **Dashboard** | No command-catalog / command-palette consumer exists in `src/dashboard` (verified: no match for `CommandRisk`/`command-registry` under `src/dashboard`). | Forward constraint only, since nothing renders today: any future dashboard command-catalog panel MUST consume `cmdCatalog.risk.*` + `CommandRisk` directly — inventing a ninth dictionary for the same concept is out of bounds under this ADR. |

Draft i18n keys (not written to `messages.ts` — outside this task's write scope, recorded here as the specification for that follow-up):

```
cmdCatalog.risk.oku:      { en: 'Read',       tr: 'Oku' }
cmdCatalog.risk.degistir: { en: 'Modify',     tr: 'Değiştir' }
cmdCatalog.risk.calistir: { en: 'Execute',    tr: 'Çalıştır' }
cmdCatalog.risk.otonom:   { en: 'Autonomous', tr: 'Otonom' }
```

### 3. Approval-threshold mapping (which class is automatic, which requires confirmation)

This is the *target* policy — i.e., what each `CommandRisk` class should mean for confirm-gating once surfaces are wired to it. It is derived from the REPL's existing, already-accepted three-tier hierarchy (`tool-permissions.ts:8-13`: `read` → silent, `confirm` → ask-once/remembered, `always` → ask-every-time/never-remembered), extended with the fourth class:

| `CommandRisk` | Target approval behavior | Rationale |
|---|---|---|
| **Oku** | Always auto — never prompts, on any surface. | Read-only, nothing to confirm (`tool-permissions.ts:9`). |
| **Değiştir** | Confirm-once per session; an "always allow" (`a`) answer is remembered. | Local-state mutation, generally reversible — matches existing `CONFIRM_TOOLS` tier (`tool-permissions.ts:24-31`). |
| **Çalıştır** | Confirm-once per session as the **baseline** — EXCEPT the safety-floor subset (commands that irreversibly end/mutate live sprint state — today: `kill`, `cleanup`, `recover`), which escalate to confirm-**every**-time, never auto-approvable even under a remembered "a" or full-auto mode. | Matches the existing, explicitly-documented `ALWAYS_CONFIRM` rule (`tool-permissions.ts:11-13,17-22`: "never run kill/cleanup without asking... these mutate live sprint state irreversibly") — this is not a new policy, it is `CommandRisk`'s job to correctly reflect it (see item 4, mismatches). |
| **Otonom** | Confirm-once to *enter* the loop (a single `Çalıştır`-shaped action). Every action taken *inside* the loop keeps its own, independent `ApprovalRisk`/nervous-`RiskLevel` gate — `Otonom` does not itself make every in-loop action stricter. | `autonomous`'s own entry has no dedicated `ToolPermission` case today and falls through to `confirm` for non-status actions (`tool-permissions.ts:51-56`) — consistent with "confirm-once to enter." |

### 4. Registry consistency check — mismatches against the target policy (disk-verified 2026-07-05)

Re-reading `command-registry.ts`, `tool-permissions.ts`, `chat-mcp-bridge.ts:270`, and `native-tool-registry.ts:332` together (beyond what `docs/design/term5-risk-language.md` §4 itself checked) surfaces five mismatched registry entries, in two distinct failure shapes:

| Command | Registry `CommandRisk` | Actual REPL/MCP-bridge tier (`classifyTool`) | Mismatch | Severity |
|---|---|---|---|---|
| `kill` | `Çalıştır` | `always` (`tool-permissions.ts:19`) | None — correctly matched. | — |
| `cleanup` | `Değiştir` | `always` (`tool-permissions.ts:20`) | **Yes** — tagged one rung below its real, safety-floor confirm-every-time behavior. | Wrong label, but the command still prompts every time — the confirm-gate itself is not weakened. |
| `recover` | `Değiştir` | `always` (`tool-permissions.ts:21`) | **Yes** — same as `cleanup`. | Same as above. |
| `start` | `Çalıştır` (has `mcpNames: ['deckent_start']`, routed through `classifyTool` at `chat-mcp-bridge.ts:270`) | `read` (no explicit case in `tool-permissions.ts:43-64` — falls through to the final `return 'read'` at line 64) | **Yes** — spawns a live sprint process with **zero** confirmation on the REPL/MCP-bridge surface, despite being tagged `Çalıştır`. | More material than the `cleanup`/`recover` case: the label is wrong AND the gate itself is silently absent, not merely mistiered. |
| `run` | `Çalıştır` (`mcpNames: ['deckent_run']`) | `read` (same fallthrough) | **Yes** — same shape as `start`. | Same as `start`. |
| `process` | `Çalıştır` (`mcpNames: ['deckent_process']`) | `read` (same fallthrough) | **Yes** — same shape as `start`. | Same as `start`. |

Two additional registry entries with a single static `CommandRisk` tag branch by sub-action/subcommand in `classifyTool` (`audit`: `gate`→`confirm`, else→`read`; `config`: `set`/`import`/`migrate`→`confirm`, else→`read`). This is **not** counted as a mismatch — it is a legitimate coarsening where one ladder-word summarizes finer runtime granularity, not a contradiction of it.

This ADR does not change `command-registry.ts` or `tool-permissions.ts` (task constraint: `nogo: kod`) — the six-row table above is the specification for a follow-up code task, not an in-place fix.

---

## Open Questions (explicitly separated from the Decision above — not yet resolved by this ADR)

1. **`Değiştir`/`Çalıştır` boundary at `medium`-equivalent risk.** When translating `ApprovalRisk.medium` or nervous `RiskLevel.medium` into `CommandRisk` (a mapping needed for the seven-dictionary crosswalk this ADR's §1 promises but does not itself write), both `Değiştir` and `Çalıştır` are defensible — `docs/design/term5-risk-language.md` §5 proposes `Değiştir` (closer to "notify-tier, not auto-approve but not require-approval either") but flags it as Alperen's call, not a measured fact.
2. **RISK-DRIFT-GUARD.** No test today prevents a future `command-registry.ts` entry from drifting out of sync with `tool-permissions.ts` the way `cleanup`/`recover`/`start`/`run`/`process` have (Decision item 4). A candidate shape: an invariant test asserting every registry entry with an `mcpNames` entry that is `always` in `tool-permissions.ts` is tagged `Çalıştır` or stricter, and every entry NOT explicitly classified in `tool-permissions.ts` is flagged rather than silently defaulting to `read`. Not built by this ADR.
3. **Whether/when to fix the five mismatched entries.** Decision item 4's table is a specification, not a patch. Whether `cleanup`/`recover` get retagged to `Çalıştır`, and whether `start`/`run`/`process` get an explicit `tool-permissions.ts` case (at minimum `confirm`), is a separate, smaller follow-up task this ADR recommends but does not authorize itself.
4. **i18n + UI wiring rollout order.** `cmdCatalog.risk.*` keys (§ Decision item 2) need to land in `messages.ts`, then `chat-native.ts:414-477`'s `buildHelpCatalogEntries`/`buildHelpCatalogLabels` need to consume `CommandRisk` directly instead of deriving through `ToolPermission`. Sequencing (i18n-keys-first vs. wiring-first) is not decided here.
5. **`approval_card.risk_*` orphan keys.** `messages.ts:2245-2249` already defines `approval_card.risk_none/low/medium/high/critical` (en+tr) but `app.tsx:363-375`'s `DEFAULT_APPROVAL_CARD_LABELS` does not use them yet (tracked in-code as a future "Messages round-8" item). Independent of `CommandRisk` but adjacent — not resolved here.

---

## Consequences

**(+)** `CommandRisk` requires no new architecture — the ladder, its semantics, and full 75-entry coverage already exist in `command-registry.ts`. Accepting this ADR mostly authorizes i18n + UI-wiring + the small registry-tag follow-ups in Decision item 4, not a new system. The other seven internal dictionaries stay untouched, keeping regression risk low for approval-workflow timing, REPL confirm-gating, and MCP trust badges.

**(−)** The eight-dictionary sprawl itself is not eliminated by this ADR, only masked at the user-facing layer — a ninth ad hoc risk vocabulary could still appear in future code without this ADR preventing it (Open Question 2, RISK-DRIFT-GUARD, is the not-yet-built safeguard for that). Decision item 4 also means this ADR ships with five *known*, *named*, *unfixed* label/gate mismatches in the current codebase rather than resolving them — accepting this ADR accepts that gap as tracked debt, not closed debt.

---

## References / Absorbed

- **Absorbs:** `docs/design/term5-risk-language.md` (sprint-363, task 363-008) — its §1-§6 evidence and §9 draft decision, re-verified against the source tree on 2026-07-05 rather than copied verbatim; its own §9 note that it is "not an ADR file, not recorded in `.brain/memory.db`" is resolved by this document's existence.
- **Evidence:** `src/cli/command-registry.ts` (lines 28-38, 82, 91-188, 96, 98, 105, 125, 128, 130-136, 140-143, 157, 160, 171, 182-183, 187-189) · `src/cli/repl/tool-permissions.ts` (full file, esp. lines 8-31, 43-65) · `src/cli/commands/chat-native.ts` (lines 395-477) · `src/cli/commands/chat-mcp-bridge.ts:270` · `src/cli/repl/native-tool-registry.ts:332` · `src/cli/helpers/catalog-render.ts` (lines 26-30, 70-76) · `src/core/tool-catalog.ts` (lines 31-41, 73-76) · `src/core/tool-registry.ts` (lines 24-26, 47-52) · `src/core/approval-contract.ts:42,71,120,126` · `src/core/approval-allowscope.ts:105` · `src/core/approval-rules-load.ts:54-60` · `src/core/nervous-types.ts:32,308` · `messages.ts:2245-2249,590-592` · `tests/cli/command-registry.test.ts:31-33,48-51` (re-verified 2026-07-06).
- **Cross-ref:** ADR-G-019 (ADR Governance & 4-Layer Taxonomy — the authoring standard this document follows, incl. the today/tomorrow honesty discipline applied throughout) · ADR-G-020 (Authority/Roles/Flow Enforcement — governs whether/when a future RISK-DRIFT-GUARD becomes a hard gate vs. advisory) · ADR-D-010 (REPL Input Stabilization — most recent sibling ADR-D, same header-block + Context/Decision/Open-Questions/Consequences shape this document follows) · ADR-G-011 (Surface Parity / Thin Wrapper — relevant to the CLI/MCP/dashboard "do not duplicate business logic per surface" framing in Decision item 2).
- **MASTER-PLAN:** #45 (TERM-5, "Görsel+işlevsel tutarlı/yormayan dil + sade risk-dili (Oku/Değiştir/Çalıştır/Otonom)") — this document is that row's ADR-draft deliverable; row status update to 🟡 is out of this task's write scope (recorded as `docImpact` in the `.result` file instead).
- **Born work-items (not yet filed in MASTER-PLAN):** RISK-DRIFT-GUARD invariant test (Open Question 2) · `cmdCatalog.*` i18n key population + REPL `/help` wiring (Open Question 4) · registry-tag fix for `cleanup`/`recover`/`start`/`run`/`process` (Decision item 4 / Open Question 3) · `approval_card.risk_*` orphan-key wiring (Open Question 5, independent of `CommandRisk` but adjacent).
