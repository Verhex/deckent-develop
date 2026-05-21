# OSS Launch Initiative — Master Spec

- **Status:** spec
- **Decided:** 2026-05-21 (Alperen + Claude, post-Sprint-183 Crisis Stabilization closure)
- **Target sprints:** Sprint 184–189 (6-sprint arc)
- **Constraint:** `v1.0.0-beta.1` publish-ready as of Sprint 183 (final smoke 6/6 GREEN); publish gate is Alperen-manual. No external time-box on this initiative — publish happens when this initiative declares ready.
- **Predecessors:** Crisis Stabilization Initiative (Sprint 177–183, closed 2026-05-21) — see `2026-05-21-crisis-stabilization-initiative.md`
- **Successors:** Sub-project #3 (multi-tenant + k8s + mTLS, Sprint 185+ executed on clean clone) and Sub-project #4 (enterprise SSO + SIEM + compliance, Sprint 189+)

---

## 1. Context — Why This Master Spec Exists

Crisis Stabilization Initiative closed with `v1.0.0-beta.1` validated as **publish-ready**: `npm run validate:publish` returns 6/6 GREEN, tarball is 2.7MB / 923 files, all P0 bugs from Sprint 182 dogfood landed in Sprint 183. The code is shippable.

The repository is not.

Eight months of high-velocity dogfooding (Sprint 134→183 = ~50 sprints of self-modifying work) accumulated:

- **388+ markdown files** in `docs/` of mixed currency — some current, some 6 months stale, some superseded by ADRs
- **180+ sprint log files** in `.brain/sprints/` that are runtime artifacts but commit-tracked
- **Likely dead code** in `src/` from deprecated features (ADR-038 Sprint 139 audit results need recheck)
- **Mixed-purpose repository** at `VerhexIO/deckent-develop` containing dev artifacts (`.brain/`, `.tasks/`, `.deckent/`, `.locks/`) alongside the source intended for OSS users
- **Nervous System documentation outdated** — `docs/guide/nervous-system.md` reflects Sprint 149 state, missing Sprint 180-183 runtime wire changes
- **No clean OSS-facing repository** — `VerhexIO/deckent` (the intended public name) is empty; the dev repo (`VerhexIO/deckent-develop`) carries dogfood baggage

OSS launch on the dev repo would expose dogfood scaffolding to first-time users. **Two repos** is the locked decision: `VerhexIO/deckent-develop` remains the dogfood lab (this repo); `VerhexIO/deckent` becomes the clean public face.

This initiative produces the clean public repo, the user-facing docs, the validated `package.json`, and the Alperen-pulled `npm publish`.

---

## 2. Three Locked Decisions (Alperen 2026-05-21)

### 2.1 Nervous activation environment

Nervous System is BUILT & WIRED, GATE-CLOSED. The natural activation environment is **the clean clone, not deckent-dev**. deckent-dev runs self-modifying sprints (its own `src/nervous/*` is in scope during normal work); the Observer instance caches code that may be rewritten mid-sprint. The clean clone has no self-modify hazard.

**Sprint 188 turns on Nervous Phase 0 (observability-only, 0 detectors active) in the clean clone.** Phase 1 (3 detectors strict, `auto_restore: false`) waits for 2-3 sprints of baseline data after `VerhexIO/deckent` goes live.

### 2.2 Self-audit is DOC-ONLY

Phase 2 is a Brain sprint where every worker is **forbidden from writing source code**. Three enforcement layers:

1. **DIRECTIVES task scope:** `Scope: docs/audits/<area>/` — no source directory in scope
2. **Worker prompt:** `filesWrite: ["docs/audits/<area>.md"]` — single-file whitelist
3. **Auditor scan:** Source file write → boundary violation → NO_GO + scope-bounded rollback (Sprint 181 W0 mechanism)

Task type is `doc-write` (ADR-053 taxonomy), agent is `doc-writer`, skill is `documentation-writer`. Brain Quality Scorer is configured for doc rubric (correctness=accuracy, coverage=area-percent-walked, scope=zero-source-writes, documentation=output-quality).

This separates **observation from intervention**. Sprint 187 is where audit findings are implemented; Sprint 185 just reports them.

### 2.3 Clean clone repository strategy

`VerhexIO/deckent` is initialized as an **empty repo**. A single initial commit titled `Initial Open Source Release v1.0.0-beta.1` lands the final source tree, tests, user-facing docs, package.json, LICENSE, README, and CI workflows. **No git history transfer** from `deckent-develop`. The dev repo remains the canonical archive of the development trajectory; the OSS repo starts at the deliverable.

This is a one-time, unidirectional cut. Subsequent development continues in `deckent-develop` (where the dogfood loop and Nervous System work live), with cherry-picks or periodic clean-resync pushes to `deckent`.

---

## 3. Sprint-by-Sprint Phases

### Phase 1 — Sprint 184 — Nervous Documentation + Bootstrap Audit

**Goal:** Bring Nervous System documentation current with Sprint 180-183 runtime reality; produce a config template; audit bootstrap edge cases before Phase 4 turns it on.

**Tasks (estimated ~6-8):**

1. **W1-1** — `docs/guide/nervous-system.md` full rewrite. References: Sprint 180 W3-1 (initNervousSystemForSprint runtime wire), Sprint 183 W1-1 (FSWatcher 500ms debounce + EXECUTE-only phase guard), Sprint 183 W1-2 (DEPENDENCY_BLOCKED debounce). Cover: 6-step pipeline, 12 detectors with default Phase status, Authority Matrix 4 modes + safety floor, MCP/CLI tool reference, activation walkthrough Phase 0→1→2→3.
2. **W1-2** — `NERVOUS-TODO.md` §11.2 Step A-F status sync. Mark Steps A (bootstrap.ts), B (sprint-state-tracker getSprintStateSnapshot), D (sprint-controller wire) as DONE Sprint 180; mark Step C (action handlers) as PARTIAL (8/30 real, 22 stub); mark Step E (MCP IPC executor wire) as DONE; mark Step F (config schema 6 detector gap) status check.
3. **W1-3** — Create `.deckent/config.json.example` Phase 0/1/2/3 templates. Four config blocks for each Phase with comments. Note: this file is `.example` — not auto-applied. User copies to `.deckent/config.json` and edits.
4. **W2-1** — Bootstrap edge-case audit (DOC). Read `src/nervous/bootstrap.ts` + `src/orchestra/sprint-controller.ts:579-583, 982` line-by-line. Document: behavior when config is missing, when `enabled: false`, when `enabled: true` but no detectors enabled (Phase 0), when sprint-controller errors after init but before dispose (resource leak risk).
5. **W2-2** — Phase 0 (PRE-SMOKE) addition to `NERVOUS-TODO.md` §11.3 phase plan. Document the 2-3 sprint observability-only baseline period: enabled=true, all detectors enabled=false, history JSONL accumulates events without detection — answers "what would Phase 1 thresholds look like for this project?"
6. **W3-1** — Activation safety checklist in `docs/guide/nervous-system.md`: deckent-dev self-modify warning, DIRECTIVES mid-sprint edit incompatibility with `auto_restore: true`, wave dispatch compatibility note (Sprint 183 fixes), recovery procedure (`enabled: false` rollback path).

**Success criteria:** `docs/guide/nervous-system.md` reads correctly to a first-time user (validate by reading as if you've never seen Deckent). NERVOUS-TODO.md reflects 2026-05-21 truth. Config example loads via `deckent config read` without errors after rename. Bootstrap edge-cases documented or filed as Sprint 187 cleanup items.

**Note:** Nervous System is **not turned on** in this sprint. Phase 4 turns it on in the clean clone.

---

### Phase 2 — Sprint 185 — Codebase Self-Audit (DOC-ONLY)

**Goal:** Produce one audit report per major code area documenting debt risk, dead code candidates, doc gaps, and refactor opportunities. Worker code writes are blocked. Output is read-only knowledge for Phases 3a/3b.

**Output directory:** `docs/audits/full-codebase-2026-05-21/`

**Task structure — one auditor task per area, ~13 tasks:**

| Task | Area | Modules | Output file |
|------|------|---------|-------------|
| W1-1 | `src/orchestra/` | 76 modules — sprint lifecycle, brain | `orchestra.md` |
| W1-2 | `src/core/` | 90 modules — types, config, pools, memory | `core.md` |
| W1-3 | `src/nervous/` | observer + detectors + handlers + bootstrap | `nervous.md` |
| W1-4 | `src/agents/` | 20 modules — worker, adaptive-agent, rollback | `agents.md` |
| W2-1 | `src/dashboard/` | React + Vite + Tailwind UI | `dashboard.md` |
| W2-2 | `src/mcp/` | 31 tools + 8 resources | `mcp.md` |
| W2-3 | `src/cli/` | 46+ commands | `cli.md` |
| W2-4 | `src/api/` | HTTP server + terminal + audit | `api.md` |
| W3-1 | `src/providers/` + `src/connectors/` + `src/monitor/` | Claude/Codex/Gemini adapters + Discord/Telegram + auditor scan | `integrations.md` |
| W3-2 | `tests/` | 16,697+ descriptors | `tests.md` |
| W3-3 | `docs/` (excluding `audits/`) | 388+ markdown files | `docs.md` |
| W3-4 | `scripts/` + `.github/workflows/` + root config | Build/lint/CI scripts | `tooling.md` |
| W4-1 | Cross-area synthesis | Read W1-W3 outputs, produce executive summary | `executive-summary.md` |

**Per-task rubric template** (each report follows the same structure):

```markdown
# <Area> Audit — 2026-05-21

## 1. Inventory
- File count, LoC total, last-modified distribution
- Key entry points, exports
- Module dependency graph (high-level)

## 2. Debt Risk
| File | Risk Level | Reason | Action |
|------|------------|--------|--------|
| ... | high/med/low | ... | keep/refactor/delete |

## 3. Dead Code Candidates
- Functions/exports with zero callers (grep evidence)
- Modules referenced only from deprecated paths
- ADR-038 cross-reference

## 4. Documentation Gaps
- Public APIs without JSDoc
- Modules without companion docs
- Stale comments contradicting code

## 5. Refactor Opportunities
- God-object split candidates (>500 LoC)
- Circular dependency risk
- Type safety holes

## 6. Recommendations for Sprint 187
- Top 5 cleanup actions ranked by impact/effort
```

**DOC-ONLY enforcement (three layers):**

```yaml
# DIRECTIVES task example
Task 1: W1-1 — src/orchestra audit
  Scope:
    directories: ["docs/audits/full-codebase-2026-05-21/"]
    filesRead: ["src/orchestra/**", "tests/orchestra/**", "docs/architecture/**"]
    filesWrite: ["docs/audits/full-codebase-2026-05-21/orchestra.md"]
  Agent: doc-writer
  Skills: documentation-writer
  ForceModel: opus (deep code-reading task)
```

The auditor's post-sprint scan verifies `git diff --stat src/` returns empty for all tasks. Any source diff → boundary violation → NO_GO + scope-bounded rollback (Sprint 181 W0 mechanism).

**Success criteria:** 13 audit reports produced, total ~30-50 KB markdown. Executive summary lists top 20 dead code candidates + top 10 refactor recommendations + top 10 doc gaps, each with file:line citations. `git diff src/` is empty.

---

### Phase 3a — Sprint 186 — Documentation Triaj

**Goal:** Resolve every markdown file in `docs/` (excluding audit outputs) into keep / archive / delete.

**Inputs:**
- `docs/audits/full-codebase-2026-05-21/docs.md` (Phase 2 W3-3 output)
- `docs/audits/full-codebase-2026-05-21/executive-summary.md`

**Tasks (~8-10):**

1. **W1-1** — ADR triaj. `docs/adr/*` — accepted/proposed/deprecated/superseded matrix. Memory.db `getByType('adr')` cross-check. Any ADR not in memory.db → re-insert or mark dead.
2. **W1-2** — Architecture docs triaj. `docs/architecture/*` — current architecture vs. doc claims. Outdated → archive to `docs/archive/architecture-pre-184/`.
3. **W1-3** — Guide docs triaj. `docs/guide/*` — user-facing freshness check. Sprint 149-era guides → rewrite or archive.
4. **W1-4** — Reference docs triaj. `docs/reference/*` — auto-generated (e.g., `mcp-tools.md`) — regenerate; manual (e.g., `api-surface.md`) — Phase 2 sync.
5. **W2-1** — Sprint logs archive. `.brain/sprints/*.md` (180+ files) → `.brain/archive/sprints-pre-184/` (still in repo for memory rebuild, but separated from current).
6. **W2-2** — Spec triaj. `docs/superpowers/specs/*` — keep current initiative specs (Crisis Stab, OSS Launch); archive completed sprint specs (`docs/superpowers/specs/archive-pre-184/`).
7. **W2-3** — Audit reports archive. `docs/audits/sprint-NNN/*` — move to `docs/audits/archive-pre-184/`, keep `docs/audits/full-codebase-2026-05-21/` (Phase 2 output) as the new current.
8. **W3-1** — README + CONTRIBUTING preview. Draft user-facing README rewrite for Sprint 188 clean clone (this sprint produces a draft `docs/preview/README-clean.md`; Sprint 188 promotes it to repo root in the new repo).

**Success criteria:** `docs/` tree has clear current/archive separation. Every kept file has a Phase 2 endorsement or is auto-generated. Archived files are in `archive-pre-184/` subdirectories preserving original paths.

---

### Phase 3b — Sprint 187 — Code Cleanup

**Goal:** Implement the cleanup recommendations from Phase 2 audit. **This sprint allows source writes** (unlike Phase 2).

**Tasks (~10-13):**

1. **W1-1 to W1-N** — Dead code removal per area, driven by Phase 2 reports. Each task = one area's `## 3. Dead Code Candidates` section, validated by `grep -r` cross-reference at sprint plan-time before deletion.
2. **W2-1 to W2-M** — Top-priority refactors from Phase 2 reports. Capped at 5-7 refactors total for sprint scope safety.
3. **W3-1** — Test cleanup. Phase 2 W3-2 (`tests.md`) lists stale/duplicate tests. Remove without lowering coverage.
4. **W3-2** — `.gitignore` final pass. Validate runtime artifacts (`.tasks/`, `.locks/`, `.brain/memory.db`, `dist/`, `node_modules/`, `.deckent/pids/`, `.deckent/archive/`) are all ignored. Cross-check against Sprint 188 clean clone scope.
5. **W4-1** — Final regression smoke: `npm run build:all` + `vitest run` + `npm run validate:publish` 6/6 GREEN must still pass after all deletions.

**Self-modify safety:** This sprint touches source code. Worker rollback scope-bounded mechanism (Sprint 181 W0) covers untracked file safety. Nervous System remains **off** (deckent-dev self-modify risk persists).

**Success criteria:** `src/` and `tests/` are minimal. `validate:publish` GREEN. No regression in test count or coverage.

---

### Phase 4 — Sprint 188 — VerhexIO/deckent Clean Clone

**Goal:** Initialize the OSS repository at `https://github.com/VerhexIO/deckent` with one initial commit; turn on Nervous Phase 0 in that clone.

**Procedure (~12 tasks, mostly devops):**

1. **W1-1** — `gh repo create VerhexIO/deckent --public --description "Local-first AI agent orchestration CLI"` (assumes repo is currently empty/non-existent; if it exists with content, Alperen confirms wipe).
2. **W1-2** — Clean clone preparation. In `deckent-develop`: `git ls-files` → filter to OSS-facing paths (src/, tests/, docs/ minus archives, scripts/, .github/, package.json, LICENSE, README.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, .gitignore, tsconfig.json, vitest configs). Stage these into a new orphan branch.
3. **W1-3** — README final rewrite. Sprint 186 W3-1 draft promoted to repo root. Two commands ("Install. Run.") at top. Trinity Vision summary. Link to `docs/vision/roadmap.md`. Link to `docs/guide/`. License + contribution invite.
4. **W2-1** — LICENSE file. MIT. Copyright "Alperen Sartacoglu" + year 2026. Cross-check `package.json` `license` field.
5. **W2-2** — CONTRIBUTING.md. How to dogfood, where to file issues, branch convention, commit style, ADR process pointer.
6. **W2-3** — CODE_OF_CONDUCT.md. Standard Contributor Covenant adoption.
7. **W2-4** — `.github/workflows/` migrate. CI workflows from `deckent-develop` adapted to clean repo paths. Test matrix, build, lint, npm pack validation.
8. **W3-1** — Push orphan branch to `VerhexIO/deckent:main`. Force-push acceptable (target repo is empty). Tag `v1.0.0-beta.1-rc1` (not the publish tag — that's Phase 5).
9. **W3-2** — Validate clean clone independently. Fresh `git clone https://github.com/VerhexIO/deckent` in `/tmp/`, run `npm install` + `npm run build:all` + `npm test` + `npm run validate:publish`. All green or no go.
10. **W4-1** — Nervous Phase 0 turn-on in the clone. Copy `.deckent/config.json.example` (Phase 0 block) to `.deckent/config.json` in the clone (uncommitted — `.deckent/config.json` is gitignored). Run one dogfood sprint in the clone (sprint topic: "smoke test the OSS clone"). Verify Observer accumulates events in `.deckent/nervous-history/` without firing detections.
11. **W4-2** — Document the dogfood result. `docs/audits/clean-clone-validation-2026-05-21.md` reports the smoke sprint outcome, Nervous Phase 0 evidence.
12. **W4-3** — `deckent-develop` README addendum. Note the relationship: "this is the development repo; the user-facing OSS repo is at VerhexIO/deckent; this repo retains full dogfood history and dev artifacts."

**Success criteria:** `https://github.com/VerhexIO/deckent` is live, public, MIT-licensed, with a single initial commit. Clean clone builds and tests pass independently. Nervous Phase 0 active in the clone, accumulating baseline events without disruption.

---

### Phase 5 — Sprint 189 — Packaging + Publish Gate

**Goal:** Bring the clean clone to npm-publish-ready state; Alperen pulls the publish trigger manually.

**Tasks (~6-8):**

1. **W1-1** — `package.json` final audit. Bin entries (`deckent`, `deckent-mcp`), `files` whitelist (no test files, no .brain, no docs/audits, no .deckent), `repository.url` → `VerhexIO/deckent`, `homepage`, `bugs.url`, `keywords`, `engines.node` (current minimum verified).
2. **W1-2** — npm provenance attestation setup. `.github/workflows/publish.yml` with `id-token: write` + `--provenance` flag on `npm publish` (when triggered).
3. **W1-3** — Release notes. `CHANGELOG.md` first entry: `## [1.0.0-beta.1] - 2026-05-XX` with summary of beta features, known limitations, upgrade path placeholder.
4. **W2-1** — Smoke test from clean clone via `npm pack` + install tarball in /tmp/ + run `npx deckent init` + `deckent --version` + `deckent doctor`. Confirms what end users will receive.
5. **W2-2** — Dry-run `npm publish --dry-run --provenance` from clean clone. Validate output matches `validate:publish` expectations (923 files, 2.7MB).
6. **W3-1** — Documentation final pass on clean clone. README + CONTRIBUTING reviewed for typos; links validated by `lint:link`.
7. **W3-2** — Publish gate write-up. `docs/release/v1.0.0-beta.1-readiness.md` summarizes: validation evidence, smoke test result, dry-run output, known limitations, **publish command for Alperen to run manually**. No automatic publish.

**Success criteria:** Clean clone has passing release pipeline. `npm publish --dry-run` is GREEN. Alperen runs `npm publish` from clean clone and `v1.0.0-beta.1` becomes available on npm registry. Initiative closes.

---

## 4. Cross-Cutting Concerns

### 4.1 Two-repo policy

After Phase 4: `deckent-develop` = dogfood lab (this repo); `deckent` = OSS face. Synchronization is one-way (develop → deckent) via clean-resync push, not git remote tracking. Rationale: dogfood may produce experimental code or sprints that fail; only validated, periodic releases reach the OSS repo.

### 4.2 Memory.db handling across the cut

Memory.db lives in `deckent-develop`. The clean clone starts with empty memory; OSS users build their own. ADR-related markdown exports (`.brain/exports/decisions.md`) are committed to the clean clone as snapshot reference for new users; they regenerate from the user's own memory.db as they accumulate sprints.

### 4.3 deckent-dev Nervous prohibition

deckent-dev (this repo) keeps `nervous_system.enabled: false` even after Phase 4. Self-modifying sprints break Observer instance caching. Nervous activation in the clean clone is safe because the clean clone is **not** used for self-modify; it's the OSS-facing release artifact.

### 4.4 Sprint-modify boundary on Sprint 185

Phase 2 is deliberately DOC-ONLY. If a worker's audit task requires running a tool that writes (e.g., `npm install` writing `node_modules/`), the worker is permitted — `node_modules/` is gitignored. The blocked surface is `src/` and `tests/`. Build outputs in `dist/` are also gitignored and may be regenerated.

### 4.5 Publish trigger control

`npm publish` is **never** run by a worker, Brain, or Claude Code. Alperen runs it manually after Phase 5 closes. The pre-existing memory `feedback_build_requires_user_approval` is load-bearing here.

---

## 5. Open Questions / Risks

1. **Repo `VerhexIO/deckent` current state** — needs Alperen verification. If empty: proceed with Phase 4 W1-1 as planned. If pre-populated: Alperen confirms wipe or chooses alternative name.
2. **Sprint 187 cleanup scope creep** — Phase 2 may produce more refactor candidates than fit in one sprint. Cap at top 5-7; remainder becomes Sprint 184+N backlog (after Sub-project #3 starts).
3. **Nervous Phase 0 sample size** — clean clone's first dogfood sprint produces N events. Whether N is enough to set Phase 1 thresholds is empirically determined; if too sparse, Phase 1 activation deferred until 2-3 sprints accumulate.
4. **CHANGELOG.md from scratch vs. distillation** — clean clone has no git history. CHANGELOG should distill the developmental arc (Sprints 1→183) into "1.0.0-beta.1 highlights" rather than recapitulate every sprint.
5. **License Copyright holder** — confirmed as "Alperen Sartacoglu" / @VerhexIO; or organizational entity if Verhex Inc. is the formal IP holder.

---

## 6. References

- Crisis Stabilization Initiative — `docs/superpowers/specs/2026-05-21-crisis-stabilization-initiative.md`
- Embedded Web Terminal sub-project #1 — `docs/superpowers/specs/2026-05-19-embedded-web-terminal-design.md`
- Worker Prompt Quality F1-F8 — `docs/superpowers/specs/2026-05-21-worker-prompt-quality-fixes.md`
- NERVOUS-TODO §11.2 activation plan — `NERVOUS-TODO.md`
- ADR-040 Nervous System Architecture — `.brain/exports/decisions.md`
- ADR-053 TaskType Taxonomy (doc-write) — `.brain/exports/decisions.md`
- ADR-064 TOPP Continuous Dispatch — `.brain/exports/decisions.md`
- Memory: `project_crisis_stabilization_initiative` (closure context), `project_nervous_activation_plan` (Phase 0 strategy), `feedback_no_retro_task_in_directives` (DIRECTIVES authoring discipline), `feedback_post_sprint_commit_mandatory` (commit gate between sprints)

---

## 7. Closure Criteria

Initiative declared closed when:

- [ ] Phase 1 — Nervous docs current; config example committed; bootstrap edge cases documented
- [ ] Phase 2 — 13 audit reports + executive summary in `docs/audits/full-codebase-2026-05-21/`
- [ ] Phase 3a — `docs/` tree triaged; current/archive separation visible
- [ ] Phase 3b — Dead code removed; validate:publish still 6/6 GREEN
- [ ] Phase 4 — `https://github.com/VerhexIO/deckent` live with initial commit; Nervous Phase 0 active there
- [ ] Phase 5 — `v1.0.0-beta.1` available on npm registry (Alperen manual publish)
- [ ] `docs/vision/roadmap.md` updated to reflect Sub-project #3/#4 starting in the clean clone, not deckent-develop
- [ ] Memory entry `project_oss_launch_initiative` written to `~/.claude/projects/-home-alperen-deckent-dev/memory/` with closure summary

Initiative artifact retained: this spec + Phase audit outputs + clean-clone-validation report = comprehensive evidence the OSS launch was deliberate, documented, and reversible (deckent-develop remains intact).
