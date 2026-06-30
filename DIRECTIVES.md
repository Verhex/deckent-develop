# DIRECTIVES — DOC-REFRESH FIX (Phase 2 of 2): repair the live doc set from the A-audit

## Goal
Apply the code-verified fixes catalogued by the Phase-1 analysis sprint (sprint-345) to deckent's LIVE
documentation. Each FIX task reads its source findings file `docs/audits/doc-refresh-2026-06/A<NN>-*.md`,
**re-verifies each finding against the actual source code** (do NOT blindly trust the audit — disk-verify;
the audit is a prior worker's claim), and surgically edits ONLY its assigned docs so every claim becomes
TRUE against the current codebase and every cross-reference resolves.

Two audiences (3 Yasa #1): end users + deckent dogfood. Fixes must be correct for both.

## 🔒 BAĞLAYICI — her task (binding)
- **DISTINCT-FILE (KRİTİK):** each task's `Files:` list is its SOLE write set. No two tasks write the
  same physical doc. Never edit a doc not in your `Files:` list (note in result if you spot an issue
  elsewhere). This prevents the worktree merge-back collision seen in sprint-343.
- **RE-VERIFY before editing (disk-verify ground truth):** for every fix you apply, confirm the code
  truth yourself with `git grep`/Read and cite `file:line` in your result. If a finding is wrong or
  already-correct on disk, SKIP it and say so — do not introduce a regression to satisfy a stale finding.
- **Surgical / minimum-diff:** change ONLY what a finding flags. Preserve correct prose byte-for-byte.
  No reflow, no reorganform, no rewrite of a section that is already accurate. Prefer small edits.
- **NEVER touch AUTO sections or frozen tiers:**
  - AUTO (do not hand-edit): `docs/reference/mcp-tools.md` (whole file — `npm run docs:ref`), the
    `<!-- AUTOGEN:START … -->`/`END` blocks inside `docs/reference/cli.md` + `agents.md`, and the numeric
    "by the Numbers"/"Sprint History"/"Sprint Metrics" autoSections inside `docs/vision/VISION.md` /
    `VISION-TR.md`. Edit ONLY hand-curated/protected prose around them.
  - FROZEN Tier-4 (do not touch at all): `docs/audits/**` (except your own A-file is READ-only here),
    `docs/superpowers/**`, `docs/analysis/**`, `docs/archive/**`, `docs/adr/NNN-*.md` bodies.
- **Cross-refs:** fix dead links the audit found and add the missing cross-refs it recommends, using
  correct relative paths that resolve on disk.
- **i18n / language:** keep each doc in its existing language (TR docs stay TR, EN docs stay EN). Where
  the audit flags a TR↔EN parity gap, bring the lagging file up to parity in ITS language. Do not
  hardcode the other language.
- **3 YASA:** dual-lens · every-environment (fix wrong/single-platform claims to the full matrix) ·
  NO-MVP/god-level (replace "TODO/coming soon/MVP" placeholders with real, code-true content — or, if
  the feature genuinely does not exist, state its status honestly; never claim vision = shipped).
- **No build/install/login:** read-only verification only (`git grep`, Read). Do NOT run `npm run build`,
  `npm install`, `npm run docs:generate-cli`, or `/login`. (Host runs the final lint/build verification.)
- **Honest result:** list `files_changed`, the specific findings applied vs skipped (with reason), and a
  grep proof for at least the P0 fixes. selfAssessment reflects reality.
- **No haiku** (code-verification + technical prose).

---

## Task 1: F01 — fix guide onboarding-core
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer, typescript-expert
- Files: docs/guide/getting-started.md, docs/guide/getting-started-en.md, docs/guide/installation.md, docs/guide/quickstart.md
- Scope: docs/guide/, docs/audits/doc-refresh-2026-06/, src/cli/
### Description
Source findings: `docs/audits/doc-refresh-2026-06/A01-guide-onboarding-core.md`. Apply its fixes after
re-verifying vs `src/cli/`: correct the wrong `doctor` output examples in all four docs, fix the stale
MCP tool count, the quickstart init-ordering bug, and the TR/EN content drift between getting-started.md
and getting-started-en.md (both are EN — normalize the `--`/em-dash typography + wording). Do not alter
correct command examples.
### goNogo
- goCriteria: every A01 P0/P1 applied or explicitly skipped-with-reason; doctor examples match real
  `deckent doctor` output; all internal links resolve; diff is surgical (only flagged lines).
- nogo: editing docs outside Files; rewriting accurate sections; introducing a dead link.

## Task 2: F02 — fix guide concepts
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer, typescript-expert
- Files: docs/guide/first-sprint.md, docs/guide/concepts.md, docs/guide/deckent-nedir.md, docs/guide/feature-matrix.md, docs/guide/faq.md
- Scope: docs/guide/, docs/audits/doc-refresh-2026-06/, src/orchestra/, src/nervous/, src/cli/
### Description
Source: `A02-guide-concepts.md`. Re-verify vs `src/orchestra/` + `src/nervous/`. Fix the simplified FAQ
nervous pipeline (it omits 2 of the 8 stages — bring it to the full `observer→…→history` set or clearly
label it a simplified view), correct any stale concept/lifecycle claim, and fix first-sprint commands vs
`src/cli/`. Keep `deckent-nedir.md` in Turkish.
### goNogo
- goCriteria: A02 findings applied/skipped-with-reason; FAQ pipeline accurate or explicitly labelled
  simplified; lifecycle/concept claims verified; links resolve; surgical diff.
- nogo: out-of-scope edits; unverified rewrites.

## Task 3: F03 — fix guide autonomous & learning
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer, typescript-expert
- Files: docs/guide/autonomous.md, docs/guide/autonomous-engine.md, docs/guide/autonomous-operations.md, docs/guide/evolution-and-learning.md
- Scope: docs/guide/, docs/audits/doc-refresh-2026-06/, src/orchestra/
### Description
Source: `A03-guide-autonomous.md`. Re-verify vs `src/orchestra/`. Fix the stale §9 reactive "attach-only"
claim (superseded by the N1 fix), and add explicit cross-refs between the three overlapping autonomous
docs (keep one authoritative; have the others defer with a link rather than duplicating). Don't delete
accurate operational content.
### goNogo
- goCriteria: §9 stale claim corrected vs source; autonomous-trio cross-refs added; overlap reduced or
  cross-linked; links resolve; surgical diff.
- nogo: out-of-scope edits; deleting accurate content; unverified claims.

## Task 4: F04 — fix guide nervous, dashboard & REPL
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer, typescript-expert
- Files: docs/guide/nervous-system.md, docs/guide/dashboard.md, docs/guide/chat-mode.md, docs/guide/terminal.md, docs/guide/terminal-tr.md
- Scope: docs/guide/, docs/audits/doc-refresh-2026-06/, src/nervous/, src/dashboard/, src/api/, src/cli/
### Description
Source: `A04-guide-nervous-ui.md`. Re-verify vs `src/nervous/`, `src/dashboard/`, `src/api/`, `src/cli/`.
Fix the `NERVOUS-TODO.md` dead link and any other flagged gaps. Keep terminal.md (EN) ↔ terminal-tr.md
(TR) at feature parity in their respective languages. The 12 detectors were verified accurate — do not
change them.
### goNogo
- goCriteria: A04 findings applied; dead link fixed; terminal TR↔EN parity preserved; links resolve;
  surgical diff.
- nogo: out-of-scope edits; changing already-correct detector list.

## Task 5: F05 — fix guide workers, troubleshooting & misc
- Model: sonnet
- Effort: high
- Agent: doc-writer
- Skills: documentation-writer, typescript-expert
- Files: docs/guide/workers.md, docs/guide/architecture-overview.md, docs/guide/config-recovery.md, docs/guide/troubleshooting.md, docs/guide/ram-experiment.md
- Scope: docs/guide/, docs/audits/doc-refresh-2026-06/, src/agents/, src/core/
### Description
Source: `A05-guide-workers-ops.md`. workers.md is STALE/HIGH — re-verify vs `src/agents/worker.ts` +
the extracted `worker-lifecycle.ts`. Fix: missing lifecycle states, wrong `.plan` format, wrong lock
thresholds, incomplete API table; add the note that `worker.ts` is a re-export router since Sprint 144
and list the extracted modules. Fix architecture-overview module map vs `src/`. Keep ram-experiment data.
### goNogo
- goCriteria: workers.md lifecycle/plan/lock/API corrected vs `src/agents/` with grep proof; module map
  accurate; links resolve; surgical diff.
- nogo: out-of-scope edits; unverified lifecycle claims.

## Task 6: F06 — fix guide providers & backends
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer, typescript-expert
- Files: docs/guide/multi-provider.md, docs/guide/multi-provider-fleet.md, docs/guide/local-model-workers.md, docs/guide/docker-backend.md, docs/guide/docker-memory.md
- Scope: docs/guide/, docs/audits/doc-refresh-2026-06/, src/providers/, src/core/
### Description
Source: `A06-guide-providers.md`. The multi-provider-fleet.md routing table is factually WRONG — re-verify
vs `src/core/routing-engine.ts` / `model-registry.ts` and correct it. Model IDs were verified MATCH — keep
them. Fix any platform (WSL/macOS/Linux/Windows) claim flagged. Keep Docker content accurate to the spawn
backend.
### goNogo
- goCriteria: routing table corrected vs source with proof; model IDs unchanged (still registry-true);
  platform claims fixed; links resolve; surgical diff.
- nogo: changing correct model IDs; out-of-scope edits.

## Task 7: F07 — fix reference CLI (hand-curated only)
- Model: sonnet
- Effort: high
- Agent: doc-writer
- Skills: documentation-writer, typescript-expert
- Files: docs/reference/cli.md, docs/reference/cli-commands.md
- Scope: docs/reference/, docs/audits/doc-refresh-2026-06/, src/cli/
### Description
Source: `A07-reference-cli.md`. Re-verify EVERY change vs `src/cli/entry.ts` + `src/cli/commands/*`.
Add the 5 undocumented commands (gateway, kpi, image, process, autonomous-mission) to the hand-curated
sections; remove the phantom flags (`archive-debt --dry-run`/`--max-archive-size`) that trigger Commander
errors; add the missing flags (serve/doctor/recall/run/recover/init/plan/start per A07); update the
"Last updated Sprint 286" stamp. **Do NOT edit the `<!-- AUTOGEN:START id="cli" -->`…`END` block in
cli.md — it is in sync (A28). Edit only hand-curated prose/tables.**
### goNogo
- goCriteria: 5 missing commands added; phantom flags removed; missing flags added; all verified vs
  `src/cli/` with grep proof; AUTOGEN block untouched; links resolve.
- nogo: editing the AUTOGEN block; inventing flags not in source; out-of-scope edits.

## Task 8: F08 — fix reference config
- Model: sonnet
- Effort: high
- Agent: doc-writer
- Skills: documentation-writer, typescript-expert
- Files: docs/reference/config.md, docs/reference/config-reference.md
- Scope: docs/reference/, docs/audits/doc-refresh-2026-06/, src/core/
### Description
Source: `A08-reference-config.md`. Re-verify vs `src/core/config-types.ts` + `config.ts`. Fix the 5 wrong
defaults, add the 20 missing keys, remove the 4 phantom (doc-only) keys, and fix the stale claims
(`deckent_style` missing `'process'`, `docker_max_timeout` 6× constraint, `worker_memory_limit` default,
`max_workers` "inert", `cache_warm` phantom). Cite `config-types.ts:line` for each corrected default.
### goNogo
- goCriteria: 5 wrong defaults corrected, 20 missing keys added, 4 phantom keys removed — each verified
  vs `config-types.ts` with line proof; links resolve; surgical diff.
- nogo: adding keys not in source; out-of-scope edits.

## Task 9: F09 — fix reference API
- Model: sonnet
- Effort: high
- Agent: doc-writer
- Skills: documentation-writer, typescript-expert
- Files: docs/reference/api.md, docs/reference/api-endpoints.md, docs/reference/api-examples.md, docs/reference/api-surface.md
- Scope: docs/reference/, docs/audits/doc-refresh-2026-06/, src/api/, src/agents/, src/orchestra/
### Description
Source: `A09-reference-api.md`. Re-verify vs `src/api/`. CRITICAL P0: correct the auth model — GET
endpoints are NOT auth-exempt; all `/api/*` GET routes go through `bearerAuthMiddleware` since Sprint 191
(verify in `server.ts`). Fix the rate-limiter class name, add the ~15 undocumented endpoints, fix stale
line refs in api-endpoints.md, and the api-surface.md schema drift (`TaskResult.rubricScores` deprecated,
`TaskResult.crossVerify` not in task-types.ts, missing `TRANSITION`/`MANUAL_REVIEW_REQUIRED` phases).
api-surface.md is Tier-1 — keep it precise.
### goNogo
- goCriteria: auth model corrected with `server.ts:line` proof; rate-limiter name fixed; missing
  endpoints added; api-surface schema reconciled vs task-types.ts; links resolve.
- nogo: leaving the false "GET = no auth" claim; out-of-scope edits.

## Task 10: F10 — fix reference MCP (hand-authored only)
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer, typescript-expert
- Files: docs/reference/mcp-guide.md, docs/reference/mcp-overview.md, docs/reference/mcp-resources.md
- Scope: docs/reference/, docs/audits/doc-refresh-2026-06/, src/mcp/
### Description
Source: `A10-reference-mcp.md`. Re-verify vs `src/mcp/`. Fix the 7 hand-authored issues, notably the
resource table showing 5/8 in mcp-guide.md (add the missing retro/tasks/agents resources to reach 8).
**Do NOT edit `docs/reference/mcp-tools.md` — it is AUTO-generated and in sync (A28); it is not in your
Files list.** Tool count 37 is correct — keep it.
### goNogo
- goCriteria: 7 issues fixed; resource table 8/8 vs `src/mcp/`; mcp-tools.md untouched; links resolve.
- nogo: editing mcp-tools.md; changing the correct 37 count.

## Task 11: F11 — fix reference routing, execution & dependencies
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer, typescript-expert
- Files: docs/reference/stack-aware-routing.md, docs/reference/multi-provider.md, docs/reference/execution-request.md, docs/reference/event-channels.md, docs/reference/dependencies.md, docs/reference/provider-free.md
- Scope: docs/reference/, docs/audits/doc-refresh-2026-06/, src/core/, src/orchestra/, package.json
### Description
Source: `A12-reference-routing.md`. CRITICAL P0: `dependencies.md` lists `telegraf` but the actual dep is
`grammy` (verify in `package.json`) — fix it. Add the missing `RoutingResult` fields
(agentScore/skillScores/skillConfidence) to the doc per `routing-engine.ts`. Re-verify routing constants
vs `routing-engine.ts` (they were ✅ — keep). Note: `reference/multi-provider.md` is THIS task's file
(distinct from the guide one).
### goNogo
- goCriteria: telegraf→grammy fixed with `package.json` proof; RoutingResult fields added vs
  `routing-engine.ts`; correct constants unchanged; links resolve.
- nogo: editing guide/multi-provider.md (not yours); out-of-scope edits.

## Task 12: F12 — fix reference enterprise (+ broken self-anchors)
- Model: sonnet
- Effort: high
- Agent: doc-writer
- Skills: documentation-writer, typescript-expert
- Files: docs/reference/enterprise-depth.md, docs/reference/enterprise-foundation.md, docs/reference/enterprise-integrations.md
- Scope: docs/reference/, docs/audits/doc-refresh-2026-06/, src/core/, src/api/
### Description
Source: `A13-reference-enterprise.md` + the A28 global link ledger. P0: `enterprise-integrations.md`
describes `strict_tenant_isolation` as fully enforcing MemoryStore isolation, but the flag is NOT wired
into the main MemoryStore instantiation paths (only audit-CLI) — re-verify and rewrite the claim to state
the honest current state (do NOT claim vision = shipped; note the wiring gap). Fix the 5 broken in-page
ToC self-anchors in enterprise-integrations.md (#1-ssoidc-integration, #2-siem…, #3-compliance…,
#6-capability…, #13-enterprise-dashboard…) so they match current section slugs. Keep correctly-labelled
SHIPPED claims (policy-engine.ts:121, rbac.ts:90 verified).
### goNogo
- goCriteria: strict_tenant_isolation claim made honest with code proof; 5 self-anchors resolve (verify
  against the actual headings); SHIPPED labels accurate; links resolve.
- nogo: leaving vision-as-shipped; out-of-scope edits.

## Task 13: F13 — fix reference ops & security
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer, typescript-expert, security-specialist
- Files: docs/reference/performance.md, docs/reference/resource-profile.md, docs/reference/health-check.md, docs/reference/security.md, docs/reference/migration-guide.md
- Scope: docs/reference/, docs/audits/doc-refresh-2026-06/, src/
### Description
Source: `A14-reference-ops-security.md`. Fix the factually-wrong "Brain cannot write config" claim
(re-verify: `sprint-finalizer.ts` DOES write `.deckent/config.json`). Correct the budget example default
threshold. Ensure RBAC/ADR-037 is described as runtime-advisory/soft (not hard-blocking) per the actual
worker enforcement. Fix the Docker "hard block" overstatement. Verify health-check vs `deckent doctor`.
### goNogo
- goCriteria: config-write claim corrected with `sprint-finalizer.ts` proof; RBAC soft-enforcement
  accurate; doctor claims verified; links resolve; surgical diff.
- nogo: overstating RBAC as hard-blocking; out-of-scope edits.

## Task 14: F14 — fix reference features/glossary/lifecycle (+ glossary dedup)
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer, typescript-expert
- Files: docs/reference/features.md, docs/reference/lifecycle-diagram.md, docs/reference/glossary.md, docs/glossary.md
- Scope: docs/reference/, docs/audits/doc-refresh-2026-06/, src/orchestra/
### Description
Source: `A15-reference-misc.md`. P0: in features.md, `heartbeat-daemon`, `handoff-protocol`,
`shared-memory` are misclassified as Dormant but are wired/default-on — re-verify and move them to the
correct Active/Lightly-Used tables. Fix lifecycle-diagram.md (CLEANUP ≠ SprintPhase enum; add
DIRECTIVE/TRANSITION/COMPLETE) vs `src/orchestra/sprint-controller.ts`. Resolve the
`reference/glossary.md` ↔ `docs/glossary.md` DUPLICATION in ONE coherent move: make ONE canonical (the
fuller `reference/glossary.md`) and turn the other into a short pointer/redirect (keep its links alive);
fix the unresolvable Blueprint §-references in reference/glossary.md. You own BOTH glossary files.
### goNogo
- goCriteria: Dormant misclassifications fixed with source proof; lifecycle phases match the enum;
  glossary duplication resolved (one canonical + pointer) with no dead links; links resolve.
- nogo: leaving two competing glossaries; out-of-scope edits.

## Task 15: F15 — fix cookbook recipes 01–05 + index
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer, typescript-expert
- Files: docs/cookbook/index.md, docs/cookbook/01-first-sprint.md, docs/cookbook/02-multi-provider-fleet.md, docs/cookbook/03-memory-recall.md, docs/cookbook/04-autonomous-mode.md, docs/cookbook/05-status-and-watch.md
- Scope: docs/cookbook/, docs/audits/doc-refresh-2026-06/, src/cli/
### Description
Source: `A16-cookbook-01-05.md`. Recipes 01–05 mostly PASS — apply only flagged fixes after re-verifying
commands vs `src/cli/`. In index.md, add entries for the two files missing from the list
(`getting-started-en.md`, `multi-provider-and-cost-en.md`) OR mark them as superseded drafts — pick based
on whether they are current (they are owned by F17; just add the index links). Keep passing recipes intact.
### goNogo
- goCriteria: flagged recipe fixes applied vs `src/cli/`; index.md lists every existing recipe (no
  missing, no dead); links resolve; surgical diff.
- nogo: rewriting passing recipes; out-of-scope edits.

## Task 16: F16 — fix cookbook recipes 06–10
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer, typescript-expert
- Files: docs/cookbook/06-checkpoints-approval.md, docs/cookbook/07-tech-debt-tracking.md, docs/cookbook/08-cost-and-budget.md, docs/cookbook/09-recover-stuck-sprint.md, docs/cookbook/10-nervous-alerts.md
- Scope: docs/cookbook/, docs/audits/doc-refresh-2026-06/, src/cli/
### Description
Source: `A17-cookbook-06-10.md`. Apply flagged command/behavior fixes after re-verifying vs `src/cli/`
(checkpoint/approval, cost/budget gate, recover, nervous). Most commands verified ✅ — only fix the
flagged ones.
### goNogo
- goCriteria: flagged fixes applied with `src/cli/` proof; correct commands untouched; links resolve.
- nogo: rewriting accurate recipes; out-of-scope edits.

## Task 17: F17 — fix cookbook task-recipes & meta (+ fix-bug anchor)
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer, typescript-expert
- Files: docs/cookbook/add-rest-api.md, docs/cookbook/fix-bug.md, docs/cookbook/getting-started-en.md, docs/cookbook/multi-provider-and-cost-en.md, docs/cookbook/update-docs.md
- Scope: docs/cookbook/, docs/audits/doc-refresh-2026-06/, src/cli/, docs/DOC-POLICY.md
### Description
Source: `A18-cookbook-tasks.md` + A28 link ledger. Fix the Node version drift (≥18 → the real minimum;
verify in `package.json` engines), the `deckent@beta` → `deckent` install-tag drift, and the dead link in
fix-bug.md:229 (`/docs/architecture/sprint-lifecycle.md#fix` — the `#fix` anchor was removed; repoint to a
valid anchor or remove). Reconcile `update-docs.md` with `docs/DOC-POLICY.md` (read-only ref). Verify
commands vs `src/cli/`.
### goNogo
- goCriteria: Node version + install-tag corrected vs `package.json`; fix-bug #fix dead link resolved;
  update-docs consistent with DOC-POLICY; links resolve.
- nogo: out-of-scope edits; leaving the dead anchor.

## Task 18: F18 — fix architecture/architecture.md (the master map)
- Model: sonnet
- Effort: high
- Agent: doc-writer
- Skills: documentation-writer, system-architect, typescript-expert
- Files: docs/architecture/architecture.md
- Scope: docs/architecture/, docs/audits/doc-refresh-2026-06/, src/
### Description
Source: `A19-architecture-main.md`. Re-verify the module map vs the real `src/` tree. Add the
undocumented modules (`src/agent/` singular, `src/mcp-client/`, `src/training/`) to §2, correct the stale
"25 modules" count, and update the `worker.ts` lifecycle description (part now in `worker-lifecycle.ts`).
This is a large file — keep the diff surgical (only the flagged module-map sections).
### goNogo
- goCriteria: undocumented modules added; module count corrected vs `src/`; worker.ts description updated
  with proof; surgical diff; links resolve.
- nogo: rewriting accurate sections; out-of-scope edits.

## Task 19: F19 — fix architecture (authority, agents, memory, lifecycle, stray ADRs)
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer, system-architect, typescript-expert
- Files: docs/architecture/agent-skill-architecture.md, docs/architecture/agents.md, docs/architecture/authority-matrix.md, docs/architecture/memory-system.md, docs/architecture/sprint-lifecycle.md, docs/architecture/adr/010-single-runtime-dependency.md, docs/architecture/adr/adr-090-ink-repl.md
- Scope: docs/architecture/, docs/audits/doc-refresh-2026-06/, src/core/, src/agents/, src/orchestra/
### Description
Sources: `A20-architecture-authority.md` + `A21-architecture-memory-lifecycle.md`. Fix authority-matrix.md
(1 naming error + 1 omission) vs the real authority code; fix the 2 high-priority gaps + 3 stale line
numbers in memory-system.md vs `memory-store.ts`; reconcile sprint-lifecycle.md phases vs
`sprint-controller.ts`. For the two stray `architecture/adr/*` files: add a banner pointing to the
canonical `docs/adr/` (do NOT move/delete them). Memory/lifecycle models were mostly ✅ — surgical fixes only.
### goNogo
- goCriteria: authority naming/omission fixed; memory gaps + line numbers corrected vs `memory-store.ts`;
  lifecycle phases reconciled; stray-ADR pointer banner added; links resolve.
- nogo: moving/deleting ADRs; rewriting accurate sections; out-of-scope edits.

## Task 20: F20 — fix development core guides (+ worker-guide dedup)
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer, typescript-expert
- Files: docs/development/agent-guide.md, docs/development/brain-guide.md, docs/development/worker-guide.md, docs/development/smoke-verify.md, docs/worker-guide.md
- Scope: docs/development/, docs/audits/doc-refresh-2026-06/, src/orchestra/, src/agents/
### Description
Source: `A22-development-core.md`. Fix brain-guide.md `evaluateResult()` stale logic + add the missing
`evaluateWithRubric()` mention (verify vs `src/orchestra/`). CRITICAL: resolve the worker-guide
DUPLICATION — `docs/development/worker-guide.md` and top-level `docs/worker-guide.md` contradict on
heartbeat format, lifecycle states, and verify-loop scope. You own BOTH: make ONE canonical (verify the
correct heartbeat fields incl. `currentAction`/`currentFile` vs `src/agents/worker.ts`) and have the
other defer to it (pointer), with no contradictions. agent-guide.md + smoke-verify.md are publishable —
touch only if flagged.
### goNogo
- goCriteria: brain-guide evaluateResult corrected + evaluateWithRubric added; worker-guide contradiction
  resolved (one canonical, correct heartbeat fields vs source); links resolve.
- nogo: leaving the two worker-guides contradictory; out-of-scope edits.

## Task 21: F21 — fix development tool guides
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer, typescript-expert
- Files: docs/development/dashboard-guide.md, docs/development/plugin-guide.md, docs/development/repo-sync.md, docs/development/troubleshooting.md
- Scope: docs/development/, docs/audits/doc-refresh-2026-06/, src/dashboard/, scripts/
### Description
Source: `A23-development-tools.md`. Fix dashboard-guide.md stale page count (→ 20) + missing route rows +
output dir; fix repo-sync.md EXCLUDE path name; fix troubleshooting.md §2.1 nvm version. plugin-guide.md
was ✅ ACCURATE — leave it unless re-verify shows a flagged issue.
### goNogo
- goCriteria: page count + routes + output dir fixed vs `src/dashboard/`; repo-sync EXCLUDE path
  corrected; nvm version fixed; links resolve; surgical diff.
- nogo: editing accurate plugin-guide content; out-of-scope edits.

## Task 22: F22 — fix vision cluster (protected prose only)
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/vision/VISION.md, docs/vision/VISION-TR.md, docs/vision/agentic-run-ecosystem.md, docs/vision/roadmap.md
- Scope: docs/vision/, docs/audits/doc-refresh-2026-06/
### Description
Source: `A24-vision.md`. Fix the stale "89 ADRs / through ADR-089" in the PROTECTED prose of VISION.md +
VISION-TR.md (current highest accepted is ADR-094) — Mission section + Distinctive table. Remove the stale
duplicate "Sprint Metrikleri" (sprint-285) AUTO block left in VISION-TR.md. Add the `⚠️ SUPERSEDED →
MASTER-PLAN` banner to `docs/vision/roadmap.md` (match the format in `docs/release/roadmap.md`) and fix
its 3 dead `docs/ROADMAP-GOD-LEVEL.md` links (remove or repoint — that file does not exist). **Do NOT
edit the numeric "by the Numbers"/"Sprint History" AUTO sections in VISION.md/VISION-TR.md** beyond
removing the orphaned duplicate block. Keep VISION-TR in Turkish.
### goNogo
- goCriteria: ADR count corrected to current in both files' protected prose; orphan AUTO block removed;
  roadmap SUPERSEDED banner added; 3 dead links fixed; VISION↔TR parity; links resolve.
- nogo: editing live AUTO numeric sections; content-rewriting the superseded roadmap beyond the banner.

## Task 23: F23 — fix launch cluster
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/launch/announce-final.md, docs/launch/blog-devto-launch.md, docs/launch/blog-hashnode-launch.md, docs/launch/discord-bot-setup.md, docs/launch/telegram-bot-setup.md
- Scope: docs/launch/, docs/audits/doc-refresh-2026-06/, src/connectors/, package.json
### Description
Source: `A26-launch.md`. Repo URL + install command were ✅ — keep. Fix the inconsistent Node.js version
requirement (verify `package.json` engines) and the 2 bot-setup discrepancies vs `src/connectors/`
(re-verify the Telegram/Discord setup steps against the actual adapter/gateway code). Only edit the launch
files that A26 flagged (listed in Files). Do not touch announcement files with no findings.
### goNogo
- goCriteria: Node version made consistent vs `package.json`; bot-setup steps corrected vs
  `src/connectors/` with proof; no false product claims; links resolve.
- nogo: editing non-flagged launch files; out-of-scope edits.

## Task 24: F24 — fix top-level docs
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer, typescript-expert
- Files: docs/index.md, docs/adr-index.md, docs/voice.md, docs/DOC-POLICY.md
- Scope: docs/, docs/audits/doc-refresh-2026-06/, scripts/
### Description
Source: `A28-toplevel-global-integrity.md`. In index.md fix any dead doc-hub link and resolve the
"Features being rewritten" placeholder (either link the now-current feature docs or keep an honest
status). Reconcile adr-index.md against the ADRs actually present in `docs/adr/` (add missing / remove
extra) — note `docs:ref` owns `docs/adr/README.md`, but `adr-index.md` is hand-maintained. Apply any
DOC-POLICY.md correction A28 flagged. Do NOT touch the giant MASTER-PLAN/SPRINT-LOG/CHANGELOG bodies (out
of scope — structure only, no edits this sprint). glossary.md + worker-guide.md are owned by F14/F20 — not
yours.
### goNogo
- goCriteria: index.md links resolve + placeholder resolved honestly; adr-index reconciled vs `docs/adr/`;
  DOC-POLICY corrections applied; surgical diff.
- nogo: editing glossary.md/worker-guide.md (owned elsewhere); editing MASTER-PLAN/SPRINT-LOG bodies.
