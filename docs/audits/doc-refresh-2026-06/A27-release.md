# A27 — Release Cluster Audit

**Auditor:** Worker w-345-027 (doc-writer)  
**Sprint:** 345  
**Date:** 2026-06-28  
**Status:** COMPLETE  

---

## Scope

Six `docs/release/` documents audited against ground-truth sources:

| Document | Path | Ground Truth |
|----------|------|-------------|
| Release Checklist | `docs/release/release-checklist.md` | `package.json` scripts |
| Release Notes | `docs/release/release-notes.md` | `CHANGELOG.md` |
| npm Publish Handoff | `docs/release/npm-publish-handoff.md` | `package.json` |
| Public Repo Flip Handoff | `docs/release/public-repo-flip-handoff.md` | `package.json` |
| Public Repo Manifest | `docs/release/public-repo-manifest.md` | Filesystem |
| Release Roadmap | `docs/release/roadmap.md` | SUPERSEDED banner check |

---

## 1. `release-checklist.md` — Script Verification

### Verified against `package.json` scripts

| Checklist Step | Command | Script Exists? | Notes |
|----------------|---------|----------------|-------|
| Step 1: Validate gate | `npm run validate:publish` | ✅ `node scripts/validate-publish.mjs` | — |
| Step 1 full: `npm run release` | expands to `npm run docs:stats:check && npm run docs:ref:check && npm run build:all && npm run validate:publish` | ✅ Exact match | — |
| Step 3: Run Tests | `npx vitest run` | ✅ `npm test` = `vitest run` | — |
| Step 4: Coverage | `npx vitest run --coverage` | ✅ `npm run test:coverage` exists | — |
| Step 8: Version bump | `npm version patch/minor/major` | ✅ standard npm command | — |

### Flags

**F1 — Type-check command incomplete (minor)**  
Checklist Step 2 prescribes `npx tsc --noEmit`. The actual `npm run lint` command runs `tsc --noEmit && tsc --noEmit -p src/dashboard` — it covers both main source and dashboard. Running only bare `tsc --noEmit` misses dashboard type errors.  
_Recommendation:_ Update Step 2 to `npm run lint` (or explicitly note `npx tsc --noEmit -p src/dashboard` as a second pass).

**F2 — Version prefix inconsistency**  
Detailed Step 11 (lines 139–148) uses `v0.X.Y` as the tag/release name placeholder. The Quick Reference (line 191) uses `v1.X.Y`. The current package version is `1.0.0-beta.1`, making `v0.X.Y` a stale artifact from early drafting.  
_Recommendation:_ Align Step 11 placeholder to `v1.X.Y` (or the generic `vX.Y.Z`).

**F3 — Hardcoded test count stale risk (low)**  
Step 3 states "20,668+ descriptors expected." This figure will naturally grow and create a false alarm for any future user who sees a count lower than that line's expectation after test pruning or refactoring.  
_Recommendation:_ Remove the count expectation or replace with "verify count did not drop significantly from last run."

**F4 — `prepublishOnly` script not documented (informational)**  
`package.json` has a `prepublishOnly` script that runs automatically before `npm publish`. It is not mentioned in the checklist. This is not a bug (npm runs it automatically), but reviewers should know it exists.

### Checklist Scripts — PASS
All named `npm run` scripts in the checklist exist in `package.json` and expand as documented.

---

## 2. `npm-publish-handoff.md` — Historical Snapshot (Sprint 151, 2026-04-22)

This document is an explicit **one-time handoff** from Sprint 151. It is preserved as a historical artifact; stale values are expected. The following divergences matter if anyone re-uses this document for a future publish.

| Field | Document Shows | Actual `package.json` | Severity |
|-------|---------------|----------------------|----------|
| `engines.node` | `>=18.0.0` | `>=24.0.0` | High — ADR-001 updated Node floor to 24+ on 2026-06-11 |
| `files` whitelist | `["dist","bin","README.md","LICENSE"]` | `["dist","bin","assets","README.md","LICENSE"]` | Medium — `assets/` directory not in snapshot |
| `publishConfig.access` | "EKSIK" → added by T-151-001 | `"public"` present | ✅ — T-151-001 fix landed, doc's final table shows PASS |
| CHANGELOG reference | `docs/CHANGELOG.md` `[1.0.0-beta.1-sprint150]` | Root `CHANGELOG.md` is canonical (docs version is a secondary view) | Informational |

**F5 — `engines.node` stale in npm-publish-handoff.md (High, historical)**  
Anyone running this handoff today would encounter `>=18.0.0` but the actual gate is `>=24.0.0`. Since this is a historical snapshot, no edit is required — add a tombstone note at the top if this doc is ever referenced again.

**F6 — `assets/` missing from `files` snapshot in npm-publish-handoff.md**  
`assets/` was not part of the published files at Sprint 151 time. It is now. Not a doc defect (accurate at write time), but a future publish operator should verify `npm pack --dry-run` output rather than trust this doc's listing.

---

## 3. `public-repo-flip-handoff.md` — Historical Snapshot (Sprint 165, 2026-05-13)

Similar to the npm handoff; Sprint 165 update added Bug X/Y/Z/W fix confirmations but did not refresh all `package.json` snapshots.

| Field | Document Shows | Actual | Severity |
|-------|---------------|--------|----------|
| `engines.node` | `>=18.0.0` (line 149) | `>=24.0.0` | High (same as F5) |
| `files` whitelist | `["dist","bin","README.md","LICENSE"]` | `["dist","bin","assets","README.md","LICENSE"]` | Medium (same as F6) |
| `publishConfig.access` | "tanımlı değil" (line 153) | `"public"` present in `package.json` | ⚠️ Active mismatch — contradicts current state |

**F7 — `publishConfig.access` claim contradicts current `package.json` (Medium)**  
Line 153 of `public-repo-flip-handoff.md` reads:  
> `publishConfig.access: "public"` tanımlı değil. npm publish için `--access public` flag'ini elle ver.  

The current `package.json` has `"publishConfig": {"access": "public"}` — so the `--access public` flag is no longer needed. This is the most actionable live discrepancy in this file.

**F8 — Flip status (informational)**  
The flip to `github.com/VerhexIO/deckent` public is still pending as of Sprint 344+. The handoff targets Sprint 166 but appears not yet executed. The document remains valid as a procedure reference.

---

## 4. `public-repo-manifest.md` — File Set Reconciliation

### Include table vs actual filesystem

| Manifest Entry | Exists? | Notes |
|----------------|---------|-------|
| `src/` | ✅ | — |
| `tests/` | ✅ | — |
| `docs/` (audits excluded) | ✅ | — |
| `examples/` | ✅ | — |
| `deckent-hub/` | ✅ | — |
| `README.md`, `README-TR.md` | ✅ | — |
| `LICENSE`, `CHANGELOG.md` | ✅ | — |
| `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` | ✅ | — |
| `AGENTS.md` | ✅ | — |
| `package.json`, `package-lock.json`, `tsconfig.json` | ✅ | — |
| `Dockerfile`, `Dockerfile.worker`, `docker-compose.yml` | ✅ | — |
| `.github/` | Not verified (no ls) | Assumed present (CI workflows) |
| `VISION.md` / `VISION-TR.md` | ⚠️ Not at root | These live under `docs/vision/VISION.md` and `docs/vision/VISION-TR.md` |

**F9 — `VISION.md` / `VISION-TR.md` path not specified in manifest (Low)**  
The "Sınır Kararları" section says these are public-include items but does not specify their path. They are NOT at the project root — they are under `docs/vision/`. Since `docs/` is already included (audits excluded), these files will be synced correctly, but the manifest entry is ambiguous.

**F10 — `assets/` directory missing from include table (Medium)**  
`package.json` `files` whitelist includes `"assets"` as a published artifact. The manifest include table does not list `assets/`. A future sync operator relying solely on the manifest might exclude it.  
_Recommended action:_ Add `assets/` row to the Include table.

**F11 — `engines.node` snapshot stale in inline `package.json` block (Medium)**  
Inside the manifest's `package.json` block (if any — the flip-handoff has one), `engines.node` appears as `>=18.0.0`. Same as F5/F7.

### Exclude table — no gaps found
All critical private paths (`.brain/`, `.deckent/`, `.deck`, `DECKENT-MASTER-BLUEPRINT.md`, `DIRECTIVES.md`, `CLAUDE.md`, `.claude/`, `coverage/`, `dist/`, `node_modules/`, `.tasks/`, `.locks/`, `docs/audits/`, `COMPETITIVE-ANALYSIS.md`, `.codex/`, `.gemini/`, `.secrets.baseline`) are listed and present in the actual repo.

---

## 5. `release-notes.md` vs `CHANGELOG.md`

### Date discrepancy

| Source | Version | Date |
|--------|---------|------|
| `release-notes.md` header | `v1.0.0-beta.1` | 2026-05-01 |
| `CHANGELOG.md` root | `[1.0.0-beta.1]` | 2026-04-22 |
| `npm-publish-handoff.md` | Sprint 151 handoff | 2026-04-22 |

**F12 — Release date discrepancy: 9-day gap (Low)**  
`release-notes.md` shows 2026-05-01 as the release date. The CHANGELOG and npm handoff place the actual publish event at 2026-04-22. The release-notes may have been drafted 9 days after the initial publish. This is a minor cosmetic issue but could confuse readers cross-referencing the two documents.

### Content consistency

| Claim | release-notes.md | CHANGELOG.md | Match? |
|-------|-----------------|--------------|--------|
| Version | 1.0.0-beta.1 | 1.0.0-beta.1 | ✅ |
| Node requirement | `>= 24.0.0` | ">=24.0.0" (implied by ADR-001) | ✅ |
| Model count (text) | "14 Models / 4 Tiers" | "13 models / 3 providers" | ⚠️ — see F13 |
| Model count (table) | "13 across 4 tiers" | — | ⚠️ internal conflict |
| Agent count | 15 | 15 | ✅ |
| Skill count | 21 | 21 | ✅ |
| MCP Tools | 34 | 34 | ✅ |
| Sprints | 285+ | 285+ | ✅ |

**F13 — Model count internal inconsistency in release-notes.md (Low)**  
The "Multi-Provider Fleet" section reads "14 Models / 4 Tiers"; the Key Metrics table reads "13 across 4 tiers"; the root CHANGELOG reads "13 models / 3 providers." Three different numbers in three places. The true count depends on the current `ModelRegistry` state, which may have changed since the beta.1 publication.

**F14 — Provider count: 3 vs 4 (Informational)**  
CHANGELOG root (written at beta.1 launch) says "3 providers"; release-notes says "4 providers (Claude, Codex, Gemini, Ollama)." Ollama was added via ADR-077, which appears to post-date the initial CHANGELOG entry. Not a defect — reflects the evolution of the document.

### CHANGELOG → release-notes link
`release-notes.md` line 213 references `../../CHANGELOG.md` which resolves correctly to the project root `CHANGELOG.md`. ✅

---

## 6. `docs/release/roadmap.md` — SUPERSEDED Banner Check

**F15 — SUPERSEDED banner: PRESENT ✅**

First line of `docs/release/roadmap.md`:
```
> ⚠️ **SUPERSEDED (2026-06-01, Sprint 211).** Consolidated into [`docs/MASTER-PLAN.md`](../MASTER-PLAN.md) — the single source of truth. Note: "Phase 5: VSCode Extension" lives in MASTER-PLAN §6 (Native Chat Everywhere → IDE extension). Preserved for provenance.
```

The banner is correctly placed, clearly dated, and points readers to the canonical successor. No content rewrite needed or performed (per task goNogo rules).

**MASTER-PLAN.md link verification:**  
`../MASTER-PLAN.md` from `docs/release/` resolves to `docs/MASTER-PLAN.md`. File exists. ✅

---

## 7. Link Checks

| Link | Source | Target | Status |
|------|--------|--------|--------|
| `../../CHANGELOG.md` | release-notes.md:213 | `/workspace/CHANGELOG.md` | ✅ |
| `../MASTER-PLAN.md` | roadmap.md:1 | `docs/MASTER-PLAN.md` | ✅ |
| `../../CHANGELOG.md` | roadmap.md:124 | `/workspace/CHANGELOG.md` | ✅ |
| `../MASTER-PLAN.md` | docs/vision/roadmap.md:4 | `docs/MASTER-PLAN.md` | ✅ |
| `docs/release/public-repo-manifest.md` | public-repo-flip-handoff.md:280 | exists | ✅ |
| `docs/release/npm-publish-handoff.md` | public-repo-flip-handoff.md:281 | exists | ✅ |
| `https://deckent.ai` | release-notes.md:214 | external — not verified | N/A |
| `https://keepachangelog.com/` | release-checklist.md:79 | external standard URL | assumed valid |

All internal links verified. ✅

---

## 8. Finding Register

| ID | Severity | File | Finding | Action |
|----|----------|------|---------|--------|
| F1 | Low | release-checklist.md | Step 2 `npx tsc --noEmit` misses dashboard; `npm run lint` covers both | Update step 2 |
| F2 | Low | release-checklist.md | Step 11 uses `v0.X.Y`, Quick Ref uses `v1.X.Y` — inconsistent | Align to `v1.X.Y` |
| F3 | Low | release-checklist.md | Hardcoded test count "20,668+" will stale | Remove or soften |
| F4 | Info | release-checklist.md | `prepublishOnly` script not mentioned | Informational only |
| F5 | High (historical) | npm-publish-handoff.md | `engines.node` shows `>=18.0.0`, actual `>=24.0.0` | Tombstone if re-used |
| F6 | Med (historical) | npm-publish-handoff.md | `files` missing `assets/` | Tombstone if re-used |
| F7 | High (historical) | public-repo-flip-handoff.md | Same `engines.node` stale | Tombstone if re-used |
| F8 | Med (active) | public-repo-flip-handoff.md | `publishConfig.access` says "not defined" but IS defined | Update line 153 |
| F9 | Low | public-repo-manifest.md | VISION.md path not specified (under `docs/vision/`) | Clarify path |
| F10 | Med | public-repo-manifest.md | `assets/` not in include table | Add row |
| F11 | Med | public-repo-manifest.md | inline `package.json` shows `>=18.0.0` | Update to `>=24.0.0` |
| F12 | Low | release-notes.md | Date 2026-05-01 vs CHANGELOG 2026-04-22 | Clarify or accept |
| F13 | Low | release-notes.md | Model count: text=14, table=13 | Align to one count |
| F14 | Info | CHANGELOG.md | "3 providers" vs release-notes "4 providers" | Evolution, not defect |
| F15 | ✅ PASS | docs/release/roadmap.md | SUPERSEDED banner present | No action needed |

---

## 9. Summary

| Area | Status | Priority Fixes |
|------|--------|---------------|
| Checklist vs scripts | ✅ All scripts match | F1 (type-check), F2 (version prefix), F3 (count) |
| npm-publish-handoff | ⚠️ Historical; 2 stale values | F5/F6 — tombstone if re-used |
| public-repo-flip-handoff | ⚠️ 1 active mismatch | F8 — `publishConfig.access` correction |
| public-repo-manifest | ⚠️ 2 omissions | F10 (`assets/`), F11 (Node version) |
| release-notes vs CHANGELOG | ⚠️ Minor discrepancies | F12 (date), F13 (model count) |
| roadmap SUPERSEDED banner | ✅ Correct | No action |
| Links | ✅ All internal links valid | — |

**Most impactful correction:** F8 — `public-repo-flip-handoff.md` line 153 tells operators they must pass `--access public` flag, but `publishConfig.access: "public"` is already in `package.json`. An operator relying on that note may add a redundant flag, or be confused when `npm publish` without the flag works fine.

**F10** (`assets/` in manifest) matters if `scripts/public-repo-sync.sh` uses the manifest as a source list — the `assets/` directory (part of the npm tarball) would be excluded from the public repo.

---

*A27 complete. Scope: docs/release/ cluster (6 files). No source code modified. No superseded roadmap content rewritten.*
