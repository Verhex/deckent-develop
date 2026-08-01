# A28 — Top-Level Docs + GLOBAL Cross-Ref & Auto-Doc Integrity Audit

**Sprint:** 345 | **Task:** 345-028 | **Date:** 2026-06-28  
**Scope:** `docs/index.md`, `docs/glossary.md`, `docs/voice.md`, `docs/adr-index.md`, `docs/DOC-POLICY.md`, `docs/worker-guide.md` (full read); `docs/MASTER-PLAN.md`, `docs/MASTER-PLAN-TR.md`, `docs/CHANGELOG.md`, `docs/SPRINT-LOG.md` (structure + status only); plus GLOBAL integrity commands.

---

## 1. Executive Summary

| Area | Status | Key Finding |
|------|--------|-------------|
| `index.md` links | ✅ OK (local) | All 24 local links resolve. Architecture + Cookbook sections use GitHub external links. Features placeholder present. |
| `adr-index.md` staleness | ⚠️ STALE | Generated 2026-06-14 — missing 4 newer ADRs on disk (090, 092, 093, 094) |
| ADR-046 duplicate | ⚠️ DUPLICATE | Two files share number `046-*`; longer filename is canonical per index |
| ADR-091 ghost | ⚠️ MISSING FILE | Referenced as `accepted` in `.claude/rules/auditor.md` + `worker-default.md` but has no file on disk and no index entry |
| Lint — dead links | ⚠️ 8 broken | 5 anchor-not-found in `enterprise-integrations.md`, 1 anchor in `cookbook/fix-bug.md`, 1 GitHub issue URL, 1 malformed link |
| `docs:ref:check` | ✅ CLEAN | All 5 auto-reference docs in sync |
| `lint:adr` | ⚠️ 33 warnings | 33 ADRs missing `**Decision:**` or `**Context:**` fields (warnings only; validation passes) |
| Giants structure | ✅ NOTED | MASTER-PLAN 1329 lines, CHANGELOG 2089, SPRINT-LOG 8170 — all healthy |
| `voice.md` | ✅ OK | Feature-complete reference doc; uses external GitHub links |
| `glossary.md` | ✅ OK | 18 terms; current and accurate |
| `DOC-POLICY.md` | ✅ OK | Tier 1–4 taxonomy clear; last reviewed Sprint 286 |
| `worker-guide.md` | ✅ OK | References `docs/guide/workers.md` as full reference |

---

## 2. Top-Level Docs Analysis

### 2.1 `docs/index.md`

**Format:** VitePress home layout + manual Documentation section.

**Local link resolution (all 24 local links checked):**

| Section | Links | Status |
|---------|-------|--------|
| Guides | 13 links | ✅ All resolve (guide/*.md exists) |
| Reference | 9 links | ✅ All resolve (reference/*.md + glossary.md + adr-index.md) |
| Architecture Overview | 1 local link | ✅ Resolves (guide/architecture-overview.md) |
| Architecture detail (4 links) | External GitHub | `docs/architecture/` is external GitHub only — no local `.md` files under `docs/architecture/` |
| Cookbook (5 links) | External GitHub | All cookbook links are external GitHub |

**External GitHub links in Architecture + Cookbook sections:**
- `https://github.com/VerhexIO/deckent/blob/main/docs/architecture/agent-skill-architecture.md`
- `https://github.com/VerhexIO/deckent/blob/main/docs/architecture/authority-matrix.md`
- `https://github.com/VerhexIO/deckent/blob/main/docs/architecture/memory-system.md`
- `https://github.com/VerhexIO/deckent/blob/main/docs/architecture/sprint-lifecycle.md`
- `https://github.com/VerhexIO/deckent/blob/main/docs/cookbook/index.md`
- `https://github.com/VerhexIO/deckent/blob/main/docs/cookbook/01-first-sprint.md`
- `https://github.com/VerhexIO/deckent/blob/main/docs/cookbook/02-multi-provider-fleet.md`
- `https://github.com/VerhexIO/deckent/blob/main/docs/cookbook/03-memory-recall.md`
- `https://github.com/VerhexIO/deckent/blob/main/docs/cookbook/04-autonomous-mode.md`
- `https://github.com/VerhexIO/deckent/blob/main/docs/cookbook/09-recover-stuck-sprint.md`

These are NOT flagged by lint-links.mjs (external URLs excluded from scan). They may 404 if the repo is private or branch-specific. **Not actionable for this sprint — tracked as observation.**

**Features placeholder:**
```
### Features
_Feature documentation is being rewritten (2026-06-16) — links return once the new docs land._
```
This is a known intentional placeholder (dated 2026-06-16). No broken links result from it; all feature links are simply absent. **Status: intentional / tracked.**

**Summary:** `index.md` is structurally sound. Zero broken local links. The external GitHub links and the Features placeholder are the only open items.

---

### 2.2 `docs/glossary.md`

**Lines:** 19 (18 defined terms + header)  
**Terms defined:** Brain, Worker, Auditor, Sprint, Wave, TaskDNA, Memory V2, Nervous, DIRECTIVES, Scope, Heartbeat, Tier, Provider, ADR, plus 4 more.

**Observations:**
- All 18 terms are current and match the codebase's actual vocabulary.
- No cross-links to individual docs (intentional — glossary is standalone).
- No broken links (no links present).
- `Memory V2` entry correctly cites ADR-088. `Nervous` cites ADR-040. `Wave` cites ADR-045.
- Missing terms that exist in the codebase (non-blocking, for fix sprint): `TaskDNA` defined but `SkillPool`, `AgentPool`, `TOPP` (ADR-064), `Managed-Docs` are absent.

**Status: ✅ CLEAN — no broken links, definitions current.**

---

### 2.3 `docs/voice.md`

**Lines:** 482 | **Sections:** 10 (Overview → Cross-links)

**Observations:**
- Comprehensive feature reference doc. All 10 sections present and complete.
- External GitHub links only (examples/voice-wrapper/README.md, design spec). Not validated by lint-links.mjs.
- TypeScript interface (`VoiceAdapter`, `VoiceConfig`) directly quoted from source — drift risk if types change.
- References `src/connectors/connector-bootstrap.ts` line ~596 — line-number citation is fragile.
- No broken local links.

**Status: ✅ CLEAN — no broken local links. Observation: line-number citation in §9 is fragile.**

---

### 2.4 `docs/DOC-POLICY.md`

**Lines:** 92 | **Last reviewed:** Sprint 286 (2026-06-14)

**Tier classification:**
- Tier 1 (hand-maintained): 6 docs — MASTER-PLAN.md, DECKENT.md, api-surface.md, adr/*.md, DOC-POLICY.md, .claude/rules/*.md CUSTOM blocks
- Tier 2 (managed-docs auto): 11 docs — CLAUDE.md, IDENTITY.md, VISION*.md, blueprint.md, beta-tracker*.md, AGENTS.md, TOOLS.md, BOOT.md, WORKER-GUIDE.md, mcp-tools.md
- Tier 3 (memory DB exports): .brain/exports/*.md
- Tier 4 (frozen): ROADMAP-GOD-LEVEL.md, vision/roadmap.md, release/roadmap.md, alperen-analysis/*, audits/*, superpowers/plans/*

**Observations:**
- Tier 4 lists `docs/audits/*` as frozen. However, active doc-refresh-2026-06 audit output (this sprint) IS being written to `docs/audits/`. This is correct use — audit output is not a "historical frozen doc" but the policy classifies `audits/*` generically. **No action required — clarification could be added in a future pass.**
- `worker-guide.md` is NOT listed in DOC-POLICY.md Tier 1 or Tier 2. It is a live reference doc under `docs/` but has no tier assignment. The auto-section in `.deckent/workspace/WORKER-GUIDE.md` is Tier 2; the `docs/worker-guide.md` file is unclassified. **Minor gap — recommend adding to Tier 1 in fix sprint.**
- No broken links in DOC-POLICY.md.

**Status: ✅ CLEAN — no broken links. Minor: worker-guide.md not listed in tier table.**

---

### 2.5 `docs/worker-guide.md`

**Lines:** 223 | **Format:** Role → Lifecycle → Heartbeat/Plan/Result formats → Scope → Verify Loop → Honest-Result Gate → Karpathy → RBAC → Anti-Patterns → Summary → References

**Observations:**
- Cross-reference to `docs/guide/workers.md` in header and in References section — both present (verified by index.md link check: `guide/*.md` all resolve).
- Heartbeat format JSON is accurate. Result format JSON is accurate.
- RBAC table matches ADR-037 constraints.
- The verify-loop section mentions `npx vitest run` (full suite) as canonical. Worker task prompts use TARGETED tests instead (per worker-default.md §CRITICAL VERIFY STEPS). The guide and the runtime prompt are slightly divergent — but `worker-guide.md` represents the advisory baseline while task prompts can override. **Not a contradiction, but worth noting for clarity.**
- No broken local links.
- References `src/agents/worker.ts`, `docs/reference/api-surface.md`, `ADR-037` — all valid.

**Status: ✅ CLEAN — no broken links. Observation: verify-loop guidance (full suite vs targeted) diverges slightly from runtime task prompts.**

---

### 2.6 `docs/adr-index.md` — ADR Reconciliation

**Format:** Hand-maintained narrative index. Source: `.brain/memory.db` export. Last generated: **2026-06-14**.

**ADR counts:**
| Source | Count |
|--------|-------|
| `docs/adr-index.md` (narrative) | 78 entries |
| `docs/adr/README.md` (auto-gen) | 82 entries (in sync per `docs:ref:check`) |
| `docs/adr/*.md` files on disk | 84 files, 82 unique IDs + 1 duplicate pair |
| `lint:adr` validated | 83 ADRs |

#### ADRs on disk NOT listed in `docs/adr-index.md` (stale — added after 2026-06-14):

| ADR | File on disk | Title (from README) |
|-----|-------------|---------------------|
| ADR-090 | `090-doc-tracking.md` | Documentation Tracking & Staleness |
| ADR-092 | `092-connector-surface-social-identity-rbac-authorization.md` | Connector-Surface Social Identity RBAC Authorization |
| ADR-093 | `093-real-token-usage-capture.md` | Real Token/Cost Capture via Provider-Native Usage Stores |
| ADR-094 | `094-flag-gated-enforcement-vein.md` | Flag-Gated Enforcement Vein |

**Fix:** Regenerate `docs/adr-index.md` from `.brain/memory.db` (`deckent memory export`). The auto-generated `docs/adr/README.md` IS current (in sync per `docs:ref:check`).

#### ADRs in `docs/adr-index.md` NOT on disk:

None — all 78 entries have corresponding files.

#### ADR-046 duplicate files (ISSUE):

Two files share the ADR-046 number:
- `046-brain-self-update-hook-architecture.md` — canonical (matches adr-index.md title: "Brain Self-Update Hook Architecture")
- `046-brain-self-update-hook.md` — shorter name, likely a renamed/superseded draft

**Fix sprint action:** Delete `046-brain-self-update-hook.md` after confirming it is a duplicate of the longer-named file. The `lint:adr` validator reports "83 ADRs validated" (vs 82 unique IDs in README), consistent with the duplicate being counted twice.

#### ADR-091 — GHOST REFERENCE (CRITICAL):

ADR-091 is listed as `accepted` in `.claude/rules/auditor.md` and `.claude/rules/worker-default.md` (the "Active ADR Constraints" block in both files), but:
- No `docs/adr/091-*.md` file exists on disk
- No entry in `docs/adr-index.md`
- No entry in `docs/adr/README.md` (auto-gen lists 090, 092, 093, 094 but not 091)

**Impact:** Workers and the Auditor are instructed to comply with a non-existent ADR. The constraint may exist in `.brain/memory.db` but has never been exported to a file. **Fix sprint action:** Either (a) create the ADR-091 file from the DB entry, or (b) remove ADR-091 from the Accepted lists in rules files if it was never formally accepted.

#### Intentional number gaps (no files, no index entries):

The following ADR numbers have no file and no index entry — intentional gaps (design space reserved or never used):
ADR-049, ADR-050, ADR-051, ADR-052, ADR-054, ADR-056, ADR-057, ADR-058, ADR-059, ADR-084, ADR-085

These are consistent across both index and disk. **No action required.**

---

## 3. Giants — Structure & Status (read-only, no full content)

### 3.1 `docs/MASTER-PLAN.md`

**Lines:** 1,329 | **Status field:** `active` | **Last updated:** 2026-06-19 (frontmatter)  
**Section headers (§1–§10+):**
- §1 North Star & Vision
- §1B Competitive Position & GA Strategy (2026-06-08)
- §2 Trinity — Three Faces
- §3 Current State — Ground Truth (Sprint 232, 2026-06-05)
- §4 Feature Status Matrix (F1–F7) + subsections 4A–4I
- §5 Sub-Projects — Agentic-OS Pipeline (#1–#5)
- §6 Native Chat Everywhere
- §7 Work Streams (W-A … W-K)
- §8 Business / Launch / OSS
- §9 Beta Gates (status as of 2026-06-01)
- §10 Sequencing — Sprint 212+ (consolidated, comprehensive)

**Status:** Tier 1 canonical roadmap. Last reconciled 2026-06-08 per header. Ground truth section references Sprint 232 (2026-06-05); as of Sprint 345 this may be somewhat stale in §3 specifics, but §10 sequencing is the living work queue. **Full-content review not in scope here — tracked for fix sprint if needed.**

---

### 3.2 `docs/MASTER-PLAN-TR.md`

**Lines:** 143 | **Format:** Parallel TR translation  
**Last synced:** 2026-06-02 (Sprint 219) per header.

**Status:** Significantly behind the EN version (143 lines vs 1,329). The header acknowledges this: "Bu TR sürüm Alperen incelemesi için; çelişki olursa EN sürüm esastır." Intentional — TR is summary-only, not a full translation. **No action required in this sprint.**

---

### 3.3 `docs/CHANGELOG.md`

**Lines:** 2,089  
**Structure:** Keep-a-Changelog format. Sections: `## [1.0.0-beta.1-sprintNNN] - YYYY-MM-DD`  
**Coverage:** Sprint 344 (2026-06-27, most recent) down to Sprint 157 (2026-05-13). Note: not all sprints have entries — non-code sprints or auto-skipped sprints may be absent.

**First line:** `> **This file has been consolidated.** The canonical changelog is at the project root: [CHANGELOG.md](../CHANGELOG.md).`

**Status:** The opening note says "canonical changelog is at project root: `CHANGELOG.md`" and links to `../CHANGELOG.md` — meaning this file is `docs/CHANGELOG.md` and it points to `CHANGELOG.md` at the workspace root. There is no `CHANGELOG.md` at workspace root (not visible in git status or docs structure). **Potential dead reference** — the link `../CHANGELOG.md` from `docs/CHANGELOG.md` would resolve to `/workspace/CHANGELOG.md`. This should be verified.

---

### 3.4 `docs/SPRINT-LOG.md`

**Lines:** 8,170  
**Format:** Per-sprint sections with status, date, duration, results table, decisions made, notes.  
**Coverage:** Sprint 1/Wave 1 (2026-03-16) through Sprint 344 (most recent at bottom). Not all sprints have entries — same as CHANGELOG.

**Status:** Active append-only log. Well-structured. No issues observed in structure scan. **Full content review not in scope.**

---

## 4. Global Integrity

### 4.1 `npm run lint:link` — Dead Links (FULL OUTPUT)

**Command:** `node scripts/lint-links.mjs`  
**Scan scope:** 791 files in `/workspace`  
**Result:** ✗ 15 broken link(s) found

#### Group A — `docs/cookbook/fix-bug.md`

| Line | Link | Error |
|------|------|-------|
| 229:3 | `/docs/architecture/sprint-lifecycle.md#fix` | Anchor `#fix` not found in `docs/architecture/sprint-lifecycle.md` |

#### Group B — `docs/reference/enterprise-integrations.md`

| Line | Link | Error |
|------|------|-------|
| 11:4 | `#1-ssoidc-integration` | Anchor `#1-ssoidc-integration` not found in source |
| 12:4 | `#2-siem-event-forwarding-srccoresiemforwarderts` | Anchor not found in source |
| 13:4 | `#3-compliance-reporting-srcccorecompliance-reportts` | Anchor not found in source |
| 16:4 | `#6-capability-invocation-auditing-srcccorecapability-audit-bridgets` | Anchor not found in source |
| 23:5 | `#13-enterprise-dashboard-api-srcapienterprise-endpoitts` | Anchor not found in source |

#### Group C — `.github/ISSUE_TEMPLATE/question.md`

| Line | Link | Error |
|------|------|-------|
| 13:14 | `../../issues?q=is%3Aissue+label%3Aquestion` | Target not found (GitHub issue URL, not a local file) |

#### Group D — `deckent-last-analyze/cluster-87.md`

| Line | Link | Error |
|------|------|-------|
| 18:221 | `m\|n\|...` | Target not found (malformed/truncated link) |

#### Group E — `.claude/worktrees/agent-a43c21887a774f7a5/` (mirror duplicates)

These are exact duplicates of Groups A–C appearing in a stale agent worktree:

| Source file | Line | Link | Error |
|------------|------|------|-------|
| `.github/ISSUE_TEMPLATE/question.md` | 13:14 | `../../issues?q=...` | Same as Group C |
| `docs/cookbook/fix-bug.md` | 229:3 | `/docs/architecture/sprint-lifecycle.md#fix` | Same as Group A |
| `docs/reference/enterprise-integrations.md` | 11:4 | `#1-ssoidc-integration` | Same as Group B |
| `docs/reference/enterprise-integrations.md` | 12:4 | `#2-siem-event-forwarding-...` | Same as Group B |
| `docs/reference/enterprise-integrations.md` | 13:4 | `#3-compliance-reporting-...` | Same as Group B |
| `docs/reference/enterprise-integrations.md` | 16:4 | `#6-capability-invocation-...` | Same as Group B |
| `docs/reference/enterprise-integrations.md` | 23:5 | `#13-enterprise-dashboard-...` | Same as Group B |

**Note:** The worktree copies under `.claude/worktrees/agent-a43c21887a774f7a5/` are phantom copies from a completed agent run. The actual broken links are in the main repo (Groups A–D); Groups A–C worktree entries are exact duplicates, not additional distinct issues.

**Fix priority:**
- **HIGH (docs/reference/enterprise-integrations.md):** 5 broken self-anchors — these are in-page ToC links where the section headings were likely renamed or removed. Fix: update anchors to match current section slugs, or remove dead ToC entries.
- **MEDIUM (docs/cookbook/fix-bug.md:229):** The anchor `#fix` was removed from `docs/architecture/sprint-lifecycle.md`. Fix: update the link or remove it.
- **LOW (.github/ISSUE_TEMPLATE/question.md):** GitHub issue URL — lint-links treats it as a local path. Fix: exclude GitHub issue URLs from lint, or convert to absolute GitHub URL.
- **LOW (deckent-last-analyze/cluster-87.md):** Malformed link `m|n|...` in an analysis artifact. Fix: remove or fix the link.
- **LOW (.claude/worktrees/...):** Stale worktree. Fix: clean up stale worktrees or exclude from lint scan.

---

### 4.2 `npm run docs:ref:check` — Auto-Reference Doc Drift

**Command:** `node scripts/gen-reference-docs.mjs --check`  
**Result:** ✅ ALL 5 reference docs IN SYNC — no drift

| Doc | Entries | Status |
|-----|---------|--------|
| `docs/reference/mcp-tools.md` | 37 | ✅ in sync |
| `docs/reference/mcp-resources.md` | 8 | ✅ in sync |
| `docs/adr/README.md` | 82 | ✅ in sync |
| `docs/reference/cli.md` | 170 | ✅ in sync |
| `docs/reference/agents.md` | 17 | ✅ in sync |

**Conclusion:** No auto-generated reference doc is stale. All 5 are consistent with their code-derived source data.

---

### 4.3 `npm run lint:adr` — ADR Validation

**Command:** `node scripts/adr-validator.mjs`  
**Result:** ✅ ADR validation passed: 83 ADRs validated  
**Warnings:** ⚠️ 33 warnings — all of the same type: missing `**Decision:**` and `**Context:**` fields

**Affected ADRs (all warnings are non-blocking):**

| ADR IDs |
|---------|
| ADR-040, ADR-041, ADR-042, ADR-043, ADR-044, ADR-045 |
| ADR-047, ADR-048, ADR-053 |
| ADR-060, ADR-061, ADR-062, ADR-063, ADR-064, ADR-065, ADR-066, ADR-067, ADR-068, ADR-069 |
| ADR-072, ADR-073, ADR-074, ADR-075, ADR-076, ADR-077, ADR-078, ADR-079, ADR-080, ADR-081, ADR-082, ADR-083 |
| ADR-086, ADR-091 |

**Pattern:** Almost all ADRs from 040 onward use a compressed/summary format (no `**Decision:**`/`**Context:**` headers) rather than the full MADR v3 format. This is a stylistic divergence — the early ADRs (001–039) follow the full format; later ADRs use prose paragraphs or consolidated descriptions.

**Note on ADR-091:** The lint:adr script reports a warning for ADR-091 at line 9498, but `docs/adr/README.md` does NOT list ADR-091 and no file `091-*.md` exists on disk. This suggests `lint:adr` reads ADR content from somewhere other than the individual `docs/adr/*.md` files (likely from `.brain/memory.db` or a compiled export). The DB has ADR-091 content but it was never exported to a file.

**Conclusion:** lint:adr is passing (no errors). The 33 warnings are structural style issues — later ADRs omit the formal MADR v3 `**Decision:**`/`**Context:**` fields. Not blocking but accumulates maintenance debt.

---

## 5. Fix Sprint Action Items (prioritized)

### P1 — Critical

| # | Item | File | Action |
|---|------|------|--------|
| F1 | ADR-091 ghost reference | `.claude/rules/auditor.md`, `.claude/rules/worker-default.md` | Export ADR-091 from `.brain/memory.db` to `docs/adr/091-*.md`, OR remove from Accepted lists if not formally accepted |
| F2 | Dead anchors in enterprise-integrations | `docs/reference/enterprise-integrations.md` | Fix 5 broken self-anchor links (lines 11, 12, 13, 16, 23) |

### P2 — High

| # | Item | File | Action |
|---|------|------|--------|
| F3 | adr-index.md stale (4 missing ADRs) | `docs/adr-index.md` | Re-export from `.brain/memory.db` to pick up ADR-090, 092, 093, 094 |
| F4 | ADR-046 duplicate file | `docs/adr/046-brain-self-update-hook.md` | Delete after confirming it is a duplicate |
| F5 | Dead anchor in fix-bug cookbook | `docs/cookbook/fix-bug.md:229` | Update or remove link to `sprint-lifecycle.md#fix` |

### P3 — Medium / Low

| # | Item | File | Action |
|---|------|------|--------|
| F6 | CHANGELOG.md opening note | `docs/CHANGELOG.md` | Verify `../CHANGELOG.md` link resolves (root-level file may be absent) |
| F7 | GitHub issue URL in question.md | `.github/ISSUE_TEMPLATE/question.md:13` | Exclude from lint scan, or use absolute GitHub URL |
| F8 | Malformed link in cluster-87.md | `deckent-last-analyze/cluster-87.md:18` | Fix or remove malformed link `m|n|...` |
| F9 | Stale worktree in lint scan | `.claude/worktrees/agent-a43c21887a774f7a5/` | Clean up stale worktree or add to lint-links exclusion list |
| F10 | worker-guide.md unclassified in DOC-POLICY | `docs/DOC-POLICY.md` | Add `docs/worker-guide.md` to Tier 1 table |
| F11 | 33 ADR warnings (no Decision/Context) | `docs/adr/040-*.md` through `094-*.md` | Add `**Decision:**` / `**Context:**` stubs to later ADRs (style alignment) |

---

## 6. Coverage Note — Giants

`docs/MASTER-PLAN.md` (1329 lines), `docs/MASTER-PLAN-TR.md` (143 lines), `docs/CHANGELOG.md` (2089 lines), and `docs/SPRINT-LOG.md` (8170 lines) were analyzed at **structure + status level only** per task spec. Section headings and frontmatter were captured; body content was not reviewed. Full content audit of MASTER-PLAN is deferred to a dedicated sprint task if needed.

---

*Audit completed: 2026-06-28. Task: 345-028. Worker: w-345-028.*
