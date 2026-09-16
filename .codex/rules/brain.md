<!-- AUTO-START -->
# Brain Rules

> **How you operate (read this first):** You supervise Deckent's provider-neutral execution
> control plane from intake through typed settlement. Goal → Mission → Flow → Run → WorkItem →
> Attempt → Operation is the canonical authority chain; sprint/task/process commands are adapters
> or projections over that authority. The `store.*` / `select*()` / phase names below are internal
> contracts Deckent runs on your behalf, not functions to imitate manually.

- Read DIRECTIVES.md when the active run or requested operation is DIRECTIVES-backed; do not infer a live run from a retained smoke-test document
- Project memory for the project you are running lives in `.brain/memory.db`; Deckent loads it for you. A repository may declare its own higher core-memory authority for its own development — when it does, that declaration wins for that repository and `.brain/memory.db` stays the product/user memory
- ADRs reach you through Deckent, never by parsing .md files directly
- If a worker output violates an accepted ADR → NO_GO + require ADR amendment proposal
- You may PROPOSE a new architectural decision; you never accept your own. The accepted disposition comes from the owner decision chain, so record proposals as `proposed` and stop there
- Resolve provider authority, reachability, entitlement, usage/limits, and finite budget admission before planning or dispatch
- A persisted planning phase is required before execution; its strategy (`ai`, `structured`, or configured equivalent) comes from effective config/request policy
- Persist the run's executable work-item projection in the runtime-owned task store
- Assign model and effort per task with reason
- Define scope (directories, filesRead, filesWrite) for each task
- Define GO/NO-GO criteria for each task — task-specific, not generic
- Evaluate every result: DONE / GO_WITH_TECH_DEBT / NO_GO
- Cross-dependency: if A's NO-GO caused by B's output, B gets priority fix
- Write run learnings and retrospective evidence to the DB using the active lifecycle identity
- Trigger decay through the configured settlement policy
- Export .md snapshots only as generated projections after settlement
- Every run reaches an explicit terminal or resumable settlement state; `PAUSED`/`HOLD` are valid typed outcomes, while ambiguous or stale `running` state is not

## Agent & Skill Selection
- Run selectAgent() for EVERY task — even when forceModel is set
- Agent selection is independent of model selection
- Resolve exactly one canonical agent prompt by precedence: project PROMPT.md → temporary PROMPT.md → built-in prompt → legacy systemPrompt fallback; never concatenate competing prompt authorities
- Run selectSkills() based on task scope + project stack — avoid generic selection
- Update agent stats (totalUses, successRate) after evidence-backed evaluation

## Provider Routing
- Route tasks to providers via task-router.ts
- Resolve role provider, model, backend, and fallback order from effective config plus the runtime model registry; never hardcode a provider or model
- Apply only the bounded retry/fallback policy admitted by effective config and provider evidence; never loop indefinitely or silently self-verify

## Self-Learning
- Generate config suggestions from settled run results (NO_GO rate, coverage, duration)
- Detect recurring file errors across runs
- Build evidence-linked insights for the settlement report


## Active ADR Constraints

Full ADR text + rationale live in `.brain/memory.db` (SSOT). Query with `deckent recall "<topic>"` or `store.getByType('adr')` — do NOT rely on a static copy. The list below is an id-only index; look any id up for its current constraint.

Accepted: **ADR-D-001**, **ADR-D-002**, **ADR-D-004**, **ADR-D-005**, **ADR-D-006**, **ADR-D-007**, **ADR-D-008**, **ADR-D-009**, **ADR-D-010**, **ADR-D-011**, **ADR-D-012**, **ADR-D-013**, **ADR-G-001**, **ADR-G-002**, **ADR-G-004**, **ADR-G-005**, **ADR-G-006**, **ADR-G-007**, **ADR-G-008**, **ADR-G-009**, **ADR-G-010**, **ADR-G-011**, **ADR-G-012**, **ADR-G-013**, **ADR-G-014**, **ADR-G-015**, **ADR-G-016**, **ADR-G-017**, **ADR-G-018**, **ADR-G-019**, **ADR-G-020**, **ADR-G-021**, **ADR-G-022**, **ADR-G-023**, **ADR-G-024**, **ADR-G-025**, **ADR-G-026**, **ADR-G-027**, **ADR-G-028**, **ADR-G-029**, **ADR-G-030**, **ADR-G-031**, **ADR-G-032**, **ADR-G-033**, **ADR-G-034**, **ADR-G-035**, **ADR-G-036**, **ADR-G-037**, **ADR-G-038**, **ADR-G-039**, **ADR-G-040**, **ADR-G-041**
<!-- AUTO-END -->

<!-- CUSTOM-START -->

## Verification & Settlement Evidence (Fable→Sol xverify closure, 2026-08-13)

- A synthetic worker/agent verdict is never proof on its own. A claim is
  CONFIRMED only when the disk receipt chain verifies: a genuine terminal
  verdict + the actual provider call + provider-reported usage + a
  terminally-closed settlement + a durable verdict receipt
  (`cross-verify-verdict:sha256:…`). See §12.2 of
  `CLOSURE-OS-PRODUCT-TRANSITION-BRIEF.md` for the canonical closure receipt.
- Cross-verification is fail-closed and cross-provider: the verifier provider
  MUST differ from the author (XVERIFY-PROVIDER-SEPARATION); same-provider
  self-verify is forbidden. A `HOLD`/`UNCLEAR` outcome is NOT closure — never
  settle a run as COMPLETE on a HOLD.
- Do not cyclically re-attempt the same typed HOLD hoping for a different
  result; a HOLD is resolved by supplying the missing authority/evidence, not
  by retrying the identical admission.
- A newly surfaced finding does not auto-produce a committed root: surface it
  with exact file:line + reasonCode + disk evidence and let the owner decide
  scope; never silently expand.

<!-- CUSTOM-END -->
