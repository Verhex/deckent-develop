# Worker-Quality Comparison — Sprints 357 · 358 · 359

**Analysis type:** CODEX-DOGFOOD-A (analysis-power test, task 360-014).
**Method:** read-only forensic review of every `.result` file under
`.brain/archive/sprint-357-tasks/`, `.brain/archive/sprint-358-tasks/`, and
`.brain/archive/sprint-359-tasks/`. No code or tests were run; no archive file was modified.

> **Naming note.** The original task label "GERÇEK codex-worker" refers to *who was meant to run
> this analysis* (a Codex-CLI dogfood), not to the workers under study. Every worker row across all
> three sprints is a **Claude** worker (`sonnet` by default; `fable` on the two heaviest tasks,
> `357-004` and `358-006`). This is therefore a **Claude-worker consistency study across three
> consecutive sprints**, not a cross-provider comparison. The irony worth recording: the Codex
> execution of *this very task* was itself killed (`360-014` NO_GO), so the comparison is delivered
> by the Claude fix-path instead.

---

## 1. Scope and dimensions

Four quality dimensions, taken verbatim from the task brief:

1. **Self-assessment honesty** — does the worker's `selfAssessment` match the Brain's final
   `brainEvaluation`, and how are the gaps handled?
2. **Notes depth** — how much verifiable evidence (grep, disk-verify, line references, diff
   matrices) the `notes` field carries.
3. **Scope discipline** — staying inside `scope.filesWrite`; how out-of-scope needs are surfaced.
4. **Debt-justification quality** — for `GO_WITH_TECH_DEBT`, the rigor of *why* it is debt and what
   the follow-up is.

Evidence rule: every claim below is anchored to at least one verbatim `notes` quote, and each sprint
carries **three or more** distributed quotes.

---

## 2. Outcome distribution (from the `brainEvaluation` field)

`-fix` slots are folded into their parent slot as the resolved outcome.

| Sprint | Slots | DONE | GO_WITH_TECH_DEBT | NO_GO (unreconciled) | Worker models |
|--------|:-----:|:----:|:-----------------:|:--------------------:|---------------|
| 357    | 16    | 12   | 4                 | 0 (after `015-fix`)  | sonnet (fable ×1) |
| 358    | 17    | 13   | 4                 | 0 (after `017-fix`)  | sonnet (fable ×1) |
| 359    | 16    | 10   | 6                 | 0                    | sonnet only |

**Debt ratio:** 357 ≈ 25% → 358 ≈ 24% → 359 ≈ 38% (rising).

The rising debt ratio is **not** declining quality — §3.1 shows the debt became progressively more
*self-declared* and better-justified. The headline metric is not the debt count but the shrinking
**self-assessment ↔ Brain divergence**:

| Sprint | Over-claims (self=DONE → brain=DEBT) | Dishonest/spurious NO_GO | Self-declared debt (self=DEBT) |
|--------|:-----------------------------------:|:------------------------:|:------------------------------:|
| 357    | 2 (`357-009`, `357-014`)            | 1 dishonest stub (`357-015`) | 2 (`357-010`, `357-016`) |
| 358    | 3 (`358-003/004/005`, all disclosed in notes) | 1 spurious brain-side (`358-017`) | 1 (`358-009`) |
| 359    | 1 (`359-013`, mechanical Tier-1 smoke gate) | 0 | 5 of 6 debt tasks |

---

## 3. Four-dimension comparison

| Dimension | Sprint 357 | Sprint 358 | Sprint 359 |
|-----------|------------|------------|------------|
| **Self-assessment honesty** | Mostly aligned; **one crash produced a dishonest `DONE` stub** caught by the honest-gate; two silent over-claims (`009`, `014`) downgraded by Brain. | Debt now **fully disclosed in notes** even when self-labeled `DONE`; a worker (`358-011`) explicitly *cross-checks* self-vs-Brain divergence in the archive. One **spurious** brain-side NO_GO (`358-017`). | **Tightest calibration.** 5 of 6 debt tasks self-declared `DEBT`; the lone divergence (`013`) is an automatic surface-smoke gate, not a judgment miss. |
| **Notes depth** | Deep — grep-evidence, disk-verify, an embedded behavior-diff **matrix** in code. | Deeper — reproduces a prior sprint's state to root-cause; discloses a transient out-of-scope write and its revert. | Deepest — disk-verified line numbers, "found N *more* instances", latent-defect discovery beyond the task ask. |
| **Scope discipline** | Strong "did NOT touch X" + `git diff --stat` proofs; exhaustive out-of-scope exception lists. | Strong; one worker honestly reports a **scope near-miss** (`--write` on real repo) and its immediate revert. | Strongest — workers **audit the scope definition itself** and flag generation defects upstream (`359-012`). |
| **Debt-justification quality** | Good: DoD-met-vs-narrative-gap reasoning + an executable ratchet. | Better: **structural-unavoidability proofs** ("no alternate design satisfies both…"). | Best: each debt names the exact out-of-scope file + line + the **literal follow-up diff** to apply. |

---

### 3.1 Self-assessment honesty

**Sprint 357** — the honest-gate caught a crashed worker that had emitted a `DONE` stub. From
`task-357-015.result` (the raw, pre-fix result):

> `[honest-gate] DISHONEST_DONE_STUB: selfAssessment=DONE claimed but linesAdded=0 testsPassed=null — worker likely crashed.`

Brain's reason was `rubric total 46.67 → NO_GO (cause: DISHONEST_DONE_STUB)`; the slot was then
reconciled by `357-015-fix`. This is the sharpest honesty signal in the corpus — a self-report the
system had to override. Separately, `357-009` and `357-014` self-assessed `DONE` but were downgraded
to `GO_WITH_TECH_DEBT` by Brain (silent over-claims), while `357-016` was the inverse — the worker
was *stricter* than Brain, self-assessing `GO_WITH_TECH_DEBT` on a task Brain scored `DONE`.

**Sprint 358** — the divergences are still present (`358-003/004/005` self-`DONE` → brain-`DEBT`) but
the debt is **fully written into the notes**, so these are labeling-threshold differences, not
concealment. The standout is `358-011`, which reads the prior sprint's archive and explicitly
reasons about the self-vs-Brain gap:

> `several tasks' selfAssessment disagreed with brainEvaluation (e.g. 357-009 selfAssessment=DONE vs brainEvaluation=GO_WITH_TECH_DEBT; 357-016 selfAssessment=GO_WITH_TECH_DEBT vs brainEvaluation=DONE) -- confirms Brain's final verdict is authoritative and diverges from the worker's own claim.`

The one NO_GO here was **spurious** — a brain-side scoring error, not worker dishonesty. From
`task-358-017-fix.result`:

> `The original 358-017 result was self-assessed DONE with this exact evidence but received brainEvaluation: NO_GO / brainEvaluationReason: rubric total 0 — no functional defect was ever described … this is confirmed DONE rather than re-derived from scratch.`

**Sprint 359** — self-assessment and Brain agree on all but one slot. Five of six debt tasks
(`001`, `003`, `008`, `011`, `012`) self-declared `GO_WITH_TECH_DEBT` proactively; the only
divergence, `359-013` (self-`DONE` → brain-`DEBT`), is the automatic **Tier-1 proof-of-function**
smoke gate firing on a dashboard/API surface task, not a missed defect. Honesty is also expressed as
empirical verification rather than assertion — `359-003`:

> `GNU coreutils timeout REQUIRES -k N to precede the DURATION positional arg to actually take effect — empirically verified in this sandbox: timeout 2 -k 1 sleep 5 -> 'failed to run command -k' (127); timeout -k 1 2 sleep 5 -> works (124).`

**Trend.** Calibration tightened overall (357 → 359). Raw over-claims are *not* monotonic —
they run 2 → 3 → 1 (358 has the most) — but **concealment severity falls monotonically**, which is
the axis that matters: a genuinely dishonest crash-stub (`357-015`) → debt that is fully disclosed in
prose but mis-*labeled* `DONE` (`358-003/004/005`) → a single **mechanical** smoke-gate downgrade
with no concealment at all (`359-013`). In parallel, debt shifts from Brain-imposed to
worker-declared: **357** self-declared 2 debt tasks, **359** self-declared 5 of 6. So the honest
reading is not "fewer disagreements every sprint" but "the disagreements that remain are
progressively more benign, and workers increasingly pre-empt them."

---

### 3.2 Notes depth

All three sprints run far above a bare "done, tests pass" note. The progression is in *kind* of
evidence, not merely length.

**Sprint 357** — evidence is put *into the code*, not just the note. `357-011` embeds a full
behavior-diff matrix as a JSDoc block:

> `Behavior-diff matrix (full table also embedded as a JSDoc block directly above buildReplProvider in entry.ts, so it's discoverable from the code, not just this note)`

**Sprint 358** — evidence extends to reproducing prior state. `358-011` reconstructs the sprint-357
archive to root-cause a metric bug and cross-checks the underlying data:

> `DISK-VERIFY (reproduced with the sprint-357 archive): .brain/sprints/sprint-357.md (writeSprintLog) correctly shows 'Tech Debt | 5', and .deckent/runtime/jobs/sprint-357.json confirms 5 tasks with final evaluation=GO_WITH_TECH_DEBT.`

**Sprint 359** — notes routinely surface **latent defects the task never asked about**. `359-016`
discovered a pre-existing architecture-rule violation while building an adjacent module:

> `KEY FINDING: the existing deckent_autonomous tool (autonomous.ts) already covers backlog … but does so via an mcp/ -> cli/ import that ADR-D-004 C3 forbids … This new module instead talks directly to orchestra/autonomous/backlog.ts — the ADR-compliant mcp/ -> orchestra/ path — so it is NOT a functional duplicate, it is the compliant replacement path.`

**Trend.** Depth escalated from *code-embedded evidence* (357) → *reproduced-state root-cause* (358)
→ *latent-defect discovery beyond scope* (359).

---

### 3.3 Scope discipline

Discipline is uniformly high — every sprint pairs "did NOT touch X" with a `git diff --stat` proof —
but the *sophistication* of scope handling rises.

**Sprint 357** — the baseline pattern: refuse the out-of-scope edit, list the exceptions
exhaustively. `357-016`:

> `Per the Scope Rules fallback ('note it in .result notes instead of editing it') I did not touch any file outside scope … 7 non-DISTINCT-FILE files with 13 occurrences remain unconverted and require a follow-up task with correct write authority.`

**Sprint 358** — a worker honestly reports a **scope near-miss** and its remediation rather than
hiding it. `358-012`:

> `I initially ran --write directly against the real repo to test the regex fix … which transiently modified docs/adr/README.md and docs/reference/cli.md on disk … Both were git checkout-reverted immediately; final git status shows zero changes to either file — verified clean before writing this result.`

**Sprint 359** — workers **audit the scope definition itself**. `359-012` caught that its own
declared scope path did not exist and refused to manufacture dead weight to satisfy it:

> `SCOPE-DEFECT self-flag (found before coding …): declared scope.directories name src/cli/builtins/skills/… but that path does not exist anywhere in the repo and is NOT the real builtins-SSOT … deliberately did NOT create a src/cli/builtins/ tree — it would be dead weight nothing in the codebase ever reads, which is exactly the tech-debt the quality bar forbids.`

**Trend.** Scope handling matured from *obey-and-list* (357) → *self-report near-misses* (358) →
*validate the scope spec and flag upstream generation bugs* (359).

---

### 3.4 Debt-justification quality

**Sprint 357** — debt is justified by separating the structured DoD from the narrative goal.
`357-016`:

> `structured goNogo DoD (tsc clean + targeted tests pass) is 100% met -> not NO_GO. But the task narrative's broader goCriteria … is only partially satisfiable from this write scope … Hence GO_WITH_TECH_DEBT, not DONE.`

**Sprint 358** — debt is justified by *proving* it is structurally unavoidable. `358-009`:

> `GO_WITH_TECH_DEBT (not DONE) because goCriteria 'mevcut pipeline testleri yesil' does not fully hold … I verified no alternate design satisfies both 'map DONE to its taxonomy label' and 'keep asserting literal DONE passthrough' for the same field.`

**Sprint 359** — debt notes hand the follow-up worker the **exact diff**. `359-011`:

> `index.ts is NOT in this task's scope.filesWrite, so I could not add the 1-line wiring myself … Follow-up diff needed in src/mcp/tools/index.ts: (1) add import { registerCatalogParityTools } … (2) add registerCatalogParityTools(server); inside registerTools(), (3) add 3 TOOL_CATALOG entries …`

`359-013` goes further and pre-solves a routing hazard the follow-up would otherwise hit:

> `the wire call … MUST be inserted BEFORE that :id block … or /api/approvals/history would 404 as an unknown id and never reach this endpoint.`

**Trend.** Justifications sharpened from *DoD-vs-narrative framing* (357) → *unavoidability proof*
(358) → *turn-key follow-up diff with hazards pre-cleared* (359).

---

## 4. Cross-sprint synthesis

- **Self-assessment calibration is the clearest trend and it improved.** Raw self-vs-Brain
  disagreements are not monotonic (over-claims run 2 → 3 → 1), but their *severity* narrows steadily:
  a dishonest crash-stub (357) → debt fully disclosed in prose yet mis-labeled `DONE` (358) → a lone
  mechanical smoke-gate downgrade with proactive debt self-declaration (359). The rising raw debt
  ratio (25% → 38%) reflects *more honest labeling*, not worse work.
- **The honest-gate and the fix-path both work.** A dishonest `DONE` was auto-caught (`357-015`) and
  a *spurious* NO_GO was auto-corrected (`358-017`) — the evaluation loop catches errors in both
  directions, worker-side and Brain-side.
- **Scope discipline is a solved baseline and is now advancing.** By 359 the frontier is no longer
  "stay in scope" (universally honored, `git diff --stat`-proven) but "**validate the scope spec**"
  — workers reject impossible or dead-weight scopes and flag the generation bug upstream.
- **Notes are a durable engineering asset, not a formality.** Across all three sprints they carry
  grep/disk-verify evidence, embed diff matrices in code, reproduce prior-sprint state, and surface
  latent ADR violations — repeatedly doing *more* forensic work than the task required.
- **One systemic friction shows up every sprint:** the split between a task's *narrative* goal and
  its narrower `scope.filesWrite` produces most of the tech debt (`357-010/016`, `358-003/004/005`,
  `359-001/005/008/011/013`). The debt is well-managed, but its **root cause is planning-side**: the
  scope granted is consistently narrower than the goal described.

---

## 5. Recommendations

Concrete, ordered by leverage:

1. **Standardize the "DoD-met vs narrative-gap" self-assessment rule.** `357-016`'s formulation —
   *structured DoD met → not NO_GO; narrative goal only partially reachable from write scope →
   `GO_WITH_TECH_DEBT`, not `DONE`* — is the single most predictive marker of self/Brain agreement
   (359's calibration gains come from workers applying exactly this). Promote it into
   `worker-default.md` as the canonical self-grading heuristic.

2. **Fix the planning-side root cause: align `scope.filesWrite` with the narrative goal.** Most debt
   is a task whose prose asks for a wire/config/i18n step in a file the worker cannot write
   (`config-types.ts`, `messages.ts`, `index.ts`, `server.ts`). Either widen the write scope to the
   files the goal names, or split the goal so the narrative matches the grant. This would convert a
   large fraction of the 38% debt in 359 into clean `DONE`.

3. **Adopt the `359-011`/`359-013` "turn-key follow-up diff" as the debt-note standard.** A debt note
   should name the exact out-of-scope file, the insertion point, and the literal diff (plus any
   hazard, per `359-013`'s 404-ordering catch). This makes follow-up tasks near-mechanical and
   shrinks their cost.

4. **Keep and formalize the archive cross-check (`358-011`).** Have the retro/auditor step routinely
   compare `selfAssessment` against `brainEvaluation` per task and log the divergence set — it is a
   direct, cheap calibration metric and 358 proves a worker can already compute it from the archive.

5. **Distinguish mechanical downgrades from judgment misses in metrics.** `359-013`'s
   `DONE`→`DEBT` is the Tier-1 smoke gate, not a worker error; counting it as a "divergence" understates
   359's calibration. Tag auto-gate downgrades separately from evaluation disagreements in sprint
   reporting.

6. **Preserve the two-way evaluation loop.** The honest-gate (catches dishonest `DONE`) and the
   spurious-NO_GO fix-path (catches brain-side scoring errors) are both load-bearing; `357-015` and
   `358-017` show each firing correctly. Do not weaken either.

---

*Sources: all `.result` files in `.brain/archive/sprint-357-tasks/`, `.brain/archive/sprint-358-tasks/`,
and `.brain/archive/sprint-359-tasks/`. Read-only analysis; no archive file was modified.*
