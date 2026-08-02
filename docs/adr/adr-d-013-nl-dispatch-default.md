# ADR-D-013: NL-Dispatch Default Policy (`agenticDispatch` — Natural-Language → MCP-Tool Direct Dispatch)

> **ACCEPTED DECISION (2026-07-06, Alperen):** Option C (risk-class-based: Oku=direct dispatch; Değiştir/Çalıştır/Otonom=confirm-gated — TERM-5/ADR-D-012 ladder)


**Class:** ADR-D (Dogfooding / Dev) · **Scope:** dev · **Immutable:** no · **Source:** publisher+contributor · **Enforcement:** today=none (the mechanism is live in code and test-covered, but no runtime gate or lint rule ties a specific default to this record — the flag's value at each call-site is simply whatever the last commit left it at) → tomorrow=once Alperen selects an option below, the chosen default is wired at the named call-sites plus a regression test asserting it, and this ADR's `Status` graduates from `proposed` to `accepted` · **Status:** accepted (Alperen, 2026-07-06) · **Date:** 2026-07-05 · **Absorbs:** `docs/design/nl-dispatch-default-decision.md` (sprint-359 task 359-009 evidence package — this ADR is that document's §6 "Önerilen Karar" promoted to a standalone, numbered governance record; the design doc remains on disk as the underlying evidence citation, not superseded/deleted) · **Crosswalk:** MASTER-PLAN #57 (NL-DISPATCH-DECISION, TERM, P2)

> **Origin note:** This document does not ship a new mechanism — `agenticDispatch` and its
> classifier have existed since Sprint 219 (tasks 219-002/219-004/219-005). It formalizes a
> decision MASTER-PLAN row 57 has carried as "🟡 evidence-ready, awaiting Alperen" since
> 2026-07-02, folds in two bodies of evidence produced since (the 359-009 false-positive audit and
> the 363-008 TERM-5 risk-language inventory), and adds a third analysis this task was
> specifically scoped to produce: what sprint-370/371's TOOL-CU descriptor/executor work
> (370-005, 371-004) actually changes — and does not change — about the NL-dispatch default
> question. Per this task's `nogo: kod`, nothing here flips a code default; it presents the
> options and a non-binding recommendation for Alperen to accept, reject, or amend.

---

## Context

`agenticDispatch` (`src/cli/commands/chat-native.ts:249`) is an opt-in boolean on
`runChatNativeLoop`. When `true`, every REPL line is first run through
`classifyAgenticIntent` (`src/cli/commands/chat-agentic-dispatch.ts:106-113`) — a pure,
bare-`\b`-keyword regex classifier with **no semantic disambiguation** — and, on a match,
short-circuits straight to a `deckent_status` / `deckent_history` / `deckent_memory_query` /
`deckent_plan` MCP-tool call (`chat-native.ts:918-940`), skipping the LLM turn entirely. A match
is gated through `requireConfirmIfRisky` (`src/cli/commands/agentic-confirm.ts:64-67`), whose
`classifyActionRisk` (`agentic-confirm.ts:23-37`) auto-approves anything whose tool name contains
a `SAFE_KEYWORDS` substring (`status`/`recall`/`history`/`query`/…) and only prompts y/N for the
rest (fail-safe default: unknown names are risky).

**The default is bifurcated today, and always has been — no single line ever set it uniformly:**

| Call-site | `agenticDispatch` passed? | Verified at |
|---|---|---|
| `deckent chat --native` (bare CLI, both once-shot and interactive) | **No** | `src/cli/commands/chat.ts:501-530` — the opts object literal has no `agenticDispatch` key |
| Ink REPL, legacy `runChatNativeLoop` branch | **No** | `src/cli/repl/app.tsx:865-889` — same, no key; the surrounding comment (`app.tsx:868-872`) explains agentic confirmation is deliberately owned by the Ink dispatcher's own gate instead (`tool-permissions.ts`, see below) |
| Ink REPL, `nativeEngine` branch (today's default when a native engine is wired) | N/A | `app.tsx:850-863` — this branch never calls `runChatNativeLoop`; the mechanism does not run here at all |
| Messaging connectors (Telegram/Discord/WhatsApp bridge) | **Yes** | per `docs/design/nl-dispatch-default-decision.md` §1, citing `src/connectors/chat-bridge.ts:402` (outside this task's read-scope; cited, not re-verified here) |

Two independent confirm-gates exist for two independent call paths, which is itself a small,
disk-verified instance of the sprawl §"TERM-5 Synergy" describes below: the Ink-REPL slash/tool
dispatcher uses `classifyTool` (`src/cli/repl/tool-permissions.ts:43-64` — `deckent_plan` →
`CONFIRM_TOOLS` → `'confirm'` tier), while the `agenticDispatch` branch specifically uses the
separate `classifyActionRisk` (`agentic-confirm.ts:23-37`) described above. Both happen to agree
on `deckent_plan` needing confirmation today, but they are two hand-maintained lists, not one.

### Evidence: the classifier's structural false-positive rate

`tests/cli/nl-dispatch-evidence.test.ts` (20 cases, sprint-359 task 359-009, all passing today —
i.e. this is *measured shipped behavior*, not a hypothetical) exercises ordinary sentences against
`classifyAgenticIntent`:

| Result | Count | Cause |
|---|---|---|
| False-positive → wrong `deckent_*` tool call | **16 / 20** | Every one of the 4 rules (`STATUS_RE`/`HISTORY_RE`/`RECALL_RE`/`PLAN_RE`, `chat-agentic-dispatch.ts:63-67`) fires on a bare, `\b`-bounded keyword ("ara", "memory", "find", "search", "plan", "durum…", "status", "how is/are") with zero context awareness |
| Correct no-match (true negative) | 4 / 20 | Sentences containing none of the trigger words |

Of the 16 false positives, **14 map to `deckent_status` / `deckent_history` /
`deckent_memory_query`** — all auto-approved silently by `classifyActionRisk`'s `SAFE_KEYWORDS`
match, with no confirmation and no user-visible indication that a tool ran at all. The remaining
2 map to `deckent_plan`, which the *existing* fail-safe-unknown rule in `classifyActionRisk`
already routes to a y/N confirm. This 16/16-structural / 14-silent split is the load-bearing
number for everything below — it is not a tail-case count, it is the *majority* outcome for
ordinary conversational input once the flag is on.

---

## Options Considered

This task was scoped to exactly three options (task 372-003 description); each is stated with its
mechanism and measured trade-offs, not just a label.

### Option A — Default-ON everywhere

**Mechanism:** add `agenticDispatch: true` at `chat.ts:501-530` and `app.tsx:865-889`, matching
`chat-bridge.ts:402`'s existing connector behavior. The classifier and confirm-gate are unchanged.

| + | − |
|---|---|
| Closes the connector/CLI parity gap (§ table above) — one behavior everywhere | The measured 16/20 false-positive rate (evidence table above) now applies to free-flowing human↔LLM conversation in the CLI/TUI, a much larger collision surface than a connector's typically shorter, more command-like messages |
| "sprint durumu ne" and equivalents skip an LLM round-trip (token + latency win) for the CLI/TUI too, matching what connector users already get | 14/16 of the false-positives are silent (`read`-tier auto-approve) — a user asking "how are we doing today, feeling ok?" gets `deckent_status`'s output silently spliced into context, corrupting the LLM's next answer with no visible sign anything unusual happened |
| Zero new mechanism — minimal-diff (two call-sites) | The false-positive surface grows **linearly with every new NL-dispatch rule** added later — `RECALL_RE`'s bare `find`/`search`/`memory`/`ara` is the structural cause, not an isolated bug, so this doesn't self-heal |

### Option B — Default-OFF + explicit opt-in flag (status quo, formalized)

**Mechanism:** no call-site changes. `agenticDispatch` stays absent (effectively `false`) at both
CLI/TUI call-sites; the connector bridge's existing `true` is *not* touched by this ADR (see Open
Questions — changing an already-accepted connector default is a separate approval gate). The
classifier code (`chat-agentic-dispatch.ts`) is not deleted — it remains available for any future
opt-in surface. User intent is served by an explicit `/status`, `/recall <q>`, `/plan` slash
(`chat-native.ts:823-843`'s existing `/help` catalog) or by the provider's own `tool_use` turn.

| + | − |
|---|---|
| All 20/20 evidence cases are moot — the classifier never runs on this path, so it cannot mis-fire | Connector/CLI parity gap (§ table) remains open — this ADR only states it, it does not resolve it |
| Zero regression risk — no existing behavior changes; a future "turn it on" decision would rest on this ADR's measured numbers instead of assumption | Users who don't know slash syntax pay a discoverability cost (`/help` exists but must be invoked first) |
| The model-driven `tool_use` path (`chat-native.ts:1003-1028`, existing) already gives semantically-correct, regex-free NL routing at the cost of one LLM turn — this option leans on that instead of a second, cruder classifier | Does not, by itself, touch the pre-existing connector/CLI inconsistency (§ table) — an explicit non-goal, not an oversight |

### Option C — Class-based dispatch (Oku = direct, others = confirm — TERM-5 synergy)

**Mechanism:** turn `agenticDispatch` on everywhere (as Option A), but replace
`classifyActionRisk`'s bespoke `SAFE_KEYWORDS`/`RISKY_KEYWORDS` substring lists with a derivation
from the canonical `CommandRisk` ladder (`src/cli/command-registry.ts:38`,
`'Oku' | 'Değiştir' | 'Çalıştır' | 'Otonom'`): resolve each dispatched intent's underlying command
via `getCommand()` and gate on `command.risk !== 'Oku'`, exactly as `buildMetaDispatch()` already
does for the unrelated onboarding-chat-flow intent set (`src/cli/helpers/onboarding-chat-flow.ts:211-217`,
`requiresConfirm: command.risk !== 'Oku'`). See the dedicated section below for why this is scoped
as its own option rather than a variant of A.

| + | − |
|---|---|
| Replaces a second, hand-maintained risk dictionary with a read from the single `CommandRisk` SSOT — directly closes one instance of the 8-dictionary sprawl `docs/design/term5-risk-language.md` §3 catalogs | **Does not reduce the false-positive rate at all** — see the dedicated section below: 14/16 of the measured false positives are already `Oku`-tier and would still auto-dispatch silently under this scheme |
| A working, tested precedent already exists one layer over (370-005's `buildMetaDispatch` + 371-004's `executeIntentDescriptor`) — this is not unproven design, it is "apply an existing pattern to a second call-site" | The precedent's classifier is a small, closed, structured intent set (4 onboarding meta-intents); porting only the *confirm-derivation* half without also replacing the free-text `RULES` table (out of this task's `nogo: kod` scope) leaves the actual wrong-tool-selection bug untouched |
| Strictly better governance than Option A's "keep the two independent keyword lists and just flip the flag" — if A or a variant of A is chosen, C's confirm-derivation should be adopted regardless | Still inherits every other Option-A downside (parity-closing means the false-positive surface reaches CLI/TUI) — C is a governance refinement *of* A, not a fix *for* A's core problem |

---

## TERM-5 Synergy — detailed analysis (task-required section)

`docs/design/term5-risk-language.md` (sprint-363 task 363-008) independently found that
`CommandRisk` (Oku/Değiştir/Çalıştır/Otonom) is the intended single canonical, user-facing risk
vocabulary, already applied to all 75 `COMMAND_REGISTRY` entries, but surrounded by **7 other**
risk/trust dictionaries in the codebase with no central translation table (its §3). That evidence
document has since been carried into its own governance record, **ADR-D-012** (`docs/adr/adr-d-012-terminal-risk-language.md`,
dated 2026-07-05, `Status: proposed`, same pending-Alperen acceptance gate as this document) —
ADR-D-012's Decision §3 "Approval-threshold mapping" independently derives a target confirm-gating
policy per `CommandRisk` class (`Oku` → always auto, `Değiştir`/`Çalıştır` → confirm-once baseline,
`Otonom` → confirm-to-enter), which is consistent with, and lends independent support to, Option
C's `requiresConfirm: command.risk !== 'Oku'` derivation below — two separate tasks reached the same
binary split from different angles. This task adds one more disk-verified data point to that
inventory: **sprint-370/371 already built and shipped a working `CommandRisk`-derived confirm-gate**,
independently of the TERM-5 document, ADR-D-012, and the NL-dispatch evidence document, for a
different feature:

- **370-005** (`src/cli/helpers/onboarding-chat-flow.ts:191-217`) added
  `OnboardingChatDispatchDescriptor { command, args, requiresConfirm }` for the 4 onboarding
  meta-intents (`connect_provider`/`show_limits`/`start_sprint`/`doctor`), with
  `requiresConfirm: command.risk !== 'Oku'` (line 217) resolved against `COMMAND_REGISTRY` via
  `getCommand()` — explicitly "so it can never drift from the registry SSOT" (per that task's own
  `.result` notes).
- **371-004** (`src/cli/helpers/chat-intent-executor.ts`) added the executor that actually honors
  `requiresConfirm` before invoking a runner — confirm-before-run, and an absent confirm function
  is treated as "cannot approve," never as implicit approval.

This is real, tested, shipped prior art for Option C's mechanism — the risk here is not "would
this work," it demonstrably already does, one layer over. **The limitation is scope, not
soundness:** that pipeline classifies from a small, closed, structurally-unambiguous set of 4
onboarding actions. `chat-agentic-dispatch.ts`'s `RULES` table classifies free natural-language
text via bare-keyword regex, and — critically — the two intents responsible for **all 16 measured
false-positive cases in `nl-dispatch-evidence.test.ts`** already resolve to commands whose
`CommandRisk` is `Oku` (`status`, `history`, `recall` are read-only entries in
`COMMAND_REGISTRY`). Deriving `requiresConfirm` from `CommandRisk` therefore reclassifies exactly
zero of the 14 silent false-positives — they were already the auto-approved tier, and remain so,
because the *problem* is that the classifier picked the wrong tool, not that the right
confirm-tier wasn't applied to it. Only the 2 `deckent_plan` false positives would gain a step
they don't already have via `classifyActionRisk`'s independent fail-safe-unknown rule (which
already treats `plan` as risky today, coincidentally reaching the same outcome).

**Conclusion for this ADR:** TERM-5 synergy is real and worth pursuing on its own governance
merits (one canonical risk vocabulary instead of two independent keyword lists feeding the same
kind of decision) — but it must not be mistaken for a fix to the false-positive classification
problem documented in `docs/design/nl-dispatch-default-decision.md`. The two are orthogonal:
"which tool fires" (classifier accuracy) vs. "how much friction that tool's execution has"
(confirm-tier derivation). Option C only improves the second axis.

---

## Risk Analysis

- **Severity is not uniform across the false-positive set.** 14/16 are silent (read-tier
  auto-approve, no user-visible signal); 2/16 are confirm-gated today (`deckent_plan`, fail-safe
  default). A "16/20 pass" framing understates risk; a "14/16 silent" framing is the honest one —
  this is why the option comparisons above lead with it rather than the aggregate count.
- **The false-positive rate is structural, not a fixable edge-case list.** All 4 `RULES` entries
  share the same `\b`-bounded, bare-keyword design (`chat-agentic-dispatch.ts:63-67`); adding more
  exceptions to any one regex only trades one false-positive shape for another, it does not change
  the class of bug. Any option that keeps this classifier live in the CLI/TUI (A, C) inherits this
  permanently unless the classifier itself changes — which is explicitly out of this task's
  `nogo: kod` and is instead named as the CONFIDENCE-THRESHOLD follow-up below.
  Deleting/replacing the classifier is not evaluated here; the closed set of 3 options in the task
  description does not include it.
- **Connector vs. CLI/TUI is not a symmetric risk surface even under one shared default.** A
  messaging-bot user's typical input skews toward short, command-like phrases; a CLI/TUI user's
  input skews toward free-flowing conversation with an LLM (code discussion, brainstorming,
  small talk) — the same classifier meets a much higher-volume, higher-diversity collision surface
  in the CLI/TUI. This asymmetry is why Option A's connector precedent does not straightforwardly
  justify extending the same default to CLI/TUI.
- **This ADR does not, by itself, change the connector's already-accepted `agenticDispatch: true`
  default** under any option — see Open Questions.

---

## Recommendation (non-binding — worker opinion; Alperen decides)

**Option B** (default-OFF + explicit flag, i.e. formalize today's CLI/TUI behavior) is
recommended as this ADR's accepted decision, for a reason that follows directly from the TERM-5
analysis above: **Option C cannot be adopted as a standalone fix**, because it leaves the dominant
failure mode (14/16 silent false-positives, all already `Oku`-tier) completely unaddressed — it
only improves the internal governance of a mechanism whose core classification is still broken by
Option A's own measured evidence. Recommending C without also fixing the classifier would let a
governance improvement masquerade as a safety fix. Since the classifier fix itself is out of this
task's scope (`nogo: kod` — see CONFIDENCE-THRESHOLD below), the only choice consistent with "the
evidence, not a hopeful reframing of it" is B.

**Independent of A/B/C:** if any future task turns `agenticDispatch` on anywhere (Option A now, or
after the classifier is fixed later), Option C's `CommandRisk`-derivation should be adopted
regardless of which base option wins — it is a strict governance improvement over
`classifyActionRisk`'s bespoke keyword lists with no downside identified in this analysis, it is
already a proven pattern (370-005/371-004), and adopting it costs nothing extra once A is already
being implemented.

---

## Open Questions

- **CONFIDENCE-THRESHOLD (classifier fix, separate task):** `docs/design/nl-dispatch-default-decision.md`
  §5 proposes a confidence heuristic (dispatch only on short/whole-line matches, e.g. "durum ne"
  but not "bu duruma göre karar verelim") that could close most of the 16/20 false-positive surface
  without deleting the mechanism. This changes `RULES` matching logic — explicitly a
  "dispatch-mantığı değişikliği," out of both that task's and this ADR's `nogo: kod`. If accepted
  in principle, it should be filed as its own task/ADR-amendment, and — per the analysis above —
  is the *only* change that would make Option A or C actually reduce the measured false-positive
  rate rather than just relabel its confirm-tier.
- **CONNECTOR-DEFAULT-REVIEW:** whether `chat-bridge.ts:402`'s existing `agenticDispatch: true`
  itself already passed an Alperen approval gate, and whether it should be revisited now that its
  false-positive exposure is quantified, is explicitly **not** decided by this ADR — this document
  only records the CLI/TUI default. Changing an already-shipped, accepted connector default is a
  separate approval gate per `docs/design/nl-dispatch-default-decision.md` §4/§5.
- **SLASH-DISCOVERABILITY:** if Option B is accepted, a first-turn "type /help to see commands"
  hint (CLI/TUI first turn only) would reduce Option B's stated discoverability cost — a small,
  separate UX task, not evaluated here.
- **TERM-5 canonical-mapping adoption:** accepting Option C's `CommandRisk`-derivation as the
  standing pattern for *any* future confirm-gate (not just this one) is the kind of cross-cutting
  call `docs/design/term5-risk-language.md` §8 already raises for Alperen independently of NL-
  dispatch, and which **ADR-D-012** now carries as its own pending, numbered decision (§ TERM-5
  Synergy above) — this ADR does not duplicate that decision, it only notes the 370-005/371-004
  precedent as fresh supporting evidence for it. Alperen accepting ADR-D-012 and this ADR are
  independent gates; neither is contingent on the other, but a reviewer weighing Option C here
  should read ADR-D-012's Decision §3 alongside it.
- **MASTER-PLAN #57 status update:** recording that this ADR now exists (moving row 57 from its
  current 🟡 "kanıt-hazır" note to point at `adr-d-013-nl-dispatch-default.md`) is out of this
  task's write-scope (`docs/MASTER-PLAN.md` is not in `scope.filesWrite`) — flagged as `docImpact`
  in this task's `.result` notes for the orchestrator to file as a follow-up.

---

## Consequences

**(+)** A single, numbered governance record now exists for a decision MASTER-PLAN has carried as
open since 2026-07-02, incorporating three independently-produced evidence bodies (359-009,
363-008, and this task's fresh 370-005/371-004 cross-analysis) instead of leaving them as three
separate design docs an implementer would have to discover and reconcile by hand. **(+)** The
TERM-5/NL-dispatch orthogonality finding (governance-fix ≠ classifier-fix) is now explicit and
citable, preventing a future task from adopting Option C under the mistaken belief that it closes
the false-positive gap. **(−)** Per `nogo: kod`, this ADR resolves nothing in code — the
connector/CLI parity gap and the classifier's structural false-positive rate both remain exactly
as measured until a follow-up task acts on the Open Questions above. **(−)** `Status: proposed`
means none of this is binding until Alperen accepts an option; until then, `agenticDispatch`'s
actual runtime default remains whatever the current call-sites already do (§ Context table),
unaffected by this document's existence.

---

## References / Absorbed

- **Absorbs:** `docs/design/nl-dispatch-default-decision.md` (359-009, full evidence + Option A/B
  analysis this ADR's §"Options Considered" A/B and §"Risk Analysis" build on directly).
- **Evidence:** `src/cli/commands/chat-native.ts:249,909-940` · `src/cli/commands/chat-agentic-dispatch.ts`
  (full file) · `src/cli/commands/agentic-confirm.ts` (full file) · `src/cli/repl/tool-permissions.ts`
  (full file) · `src/cli/repl/app.tsx:850-891` · `src/cli/commands/chat.ts:470-530` ·
  `src/cli/command-registry.ts:38` · `src/cli/helpers/onboarding-chat-flow.ts:191-217,508` ·
  `src/cli/helpers/chat-intent-executor.ts` (full file) · `tests/cli/nl-dispatch-evidence.test.ts`
  (full file, 20 cases).
- **Cross-ref:** `docs/design/term5-risk-language.md` (363-008, `CommandRisk` ladder + 8-dictionary
  sprawl inventory — this ADR's §"TERM-5 Synergy" section) · **ADR-D-012** (Terminal Risk Language —
  the formal ADR-ification of that same term5-risk-language.md evidence, also `proposed`/pending
  Alperen, dated 2026-07-05; its Decision §3 approval-threshold mapping directly informs this ADR's
  Option C and Open Questions above) · ADR-G-019 (ADR Governance & 4-Layer
  Taxonomy — the authoring standard this document follows) · ADR-D-009 (Worker-Result Boundary
  Normalization) and ADR-D-010 (REPL Input Stabilization) — the two most recent sibling ADR-D
  documents, same "proposed, acceptance: Alperen, today+tomorrow" shape this document follows.
- **MASTER-PLAN:** Row 57 (NL-DISPATCH-DECISION, TERM, P2) — this document is that row's ADR
  deliverable; the row itself is not updated by this task (write-scope; see Open Questions
  `docImpact`).
