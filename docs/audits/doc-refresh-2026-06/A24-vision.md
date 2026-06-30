# Doc-Refresh Analysis — Vision Cluster (A24)
> Sprint: doc-refresh-2026-06 · Worker: doc-writer · Commit: b47dd98d

## Summary
- Docs analyzed: 4 · CURRENT 1 · MINOR_DRIFT 2 · BROKEN 1 · AUTO(skip) 0
- Top systemic issues across this cluster:
  - **Stale ADR count in protected prose** — "89 ADRs through ADR-089" appears in VISION.md and VISION-TR.md; current highest accepted ADR is ADR-094 (both Mission section and Distinctive table)
  - **Stale MCP tool count in protected prose** — Mission section says "34 MCP tools" in both EN and TR; Numbers table and MCP section say 35; protected prose lags the AUTO section
  - **VISION-TR.md has a stale duplicate AUTO block** — old "Sprint Metrikleri" (sprint-285 data) was never removed when the sprint-344 block was appended; EN does not have this drift
  - **roadmap.md is SUPERSEDED but missing the formal banner** — MASTER-PLAN.md explicitly names it superseded; `docs/release/roadmap.md` carries the correct `⚠️ SUPERSEDED` banner format; `docs/vision/roadmap.md` does not
  - **roadmap.md has 3 dead links** — `docs/ROADMAP-GOD-LEVEL.md` referenced three times; file does not exist

---

## Per-doc findings

### docs/vision/VISION.md

- **Audience:** both (user-facing: product presentation; dogfood: architecture context for contributors/Brain)
- **Status:** MINOR_DRIFT
- **Code-verified against:** `DIRECTIVES.md:18-20` (AUTO section policy), `docs/MASTER-PLAN.md:11-13` (sprint/state), `.claude/rules/auditor.md` (ADR list, highest = ADR-094), `docs/vision/VISION.md:70,126` (MCP tool count)

### Protected vs AUTO section map

| Section | Lines | Type |
|---------|-------|------|
| Vision | 7–11 | PROTECTED |
| Mission | 15–21 | PROTECTED |
| What Makes Deckent Distinctive | 25–41 | PROTECTED |
| Target Users | 44–51 | PROTECTED |
| Technology Decisions | 54–75 | PROTECTED |
| Roadmap | 78–105 | PROTECTED (narrative) |
| Values | 109–117 | PROTECTED |
| Deckent by the Numbers | 120–132 | **AUTO** |
| Sprint Metrics | 133–142 | **AUTO** |
| Sprint History | 144–145 | **AUTO** |

- **Findings:**
  - [stale-fact] Mission (line 19): "34 MCP tools" — evidence: `VISION.md:19` says 34; `VISION.md:70` (same protected MCP section) says 35; `VISION.md:126` (Numbers table, AUTO) says 35 — fix: update protected Mission prose from 34 → 35
  - [stale-fact] Mission (line 19): "ADR governance (89 ADRs through ADR-089)" — evidence: `VISION.md:19`; current accepted ADR list in `.claude/rules/auditor.md` reaches ADR-094; MASTER-PLAN §1B references ADR-094 — fix: update to "94 ADRs through ADR-094" (or remove specific count if kept narrative)
  - [stale-fact] What Makes Deckent Distinctive table (line 35): row "**89 ADRs + ADR governance**" — evidence: `VISION.md:35`; same stale count as Mission — fix: update row header to "94 ADRs + ADR governance"
- **Outbound internal links:**
  - `../MASTER-PLAN.md` (line 92) → OK
- **Missing cross-refs:** none critical
- **Fix effort:** low
- **Fix priority:** P1 (stale/incomplete — protected prose facts lag AUTO section)

---

### docs/vision/VISION-TR.md

- **Audience:** both (Turkish user-facing; parity target for VISION.md)
- **Status:** MINOR_DRIFT
- **Code-verified against:** `docs/vision/VISION.md` (parity reference), `DIRECTIVES.md:18-20` (AUTO section policy)

### Protected vs AUTO section map (TR)

| Section | Lines | Type |
|---------|-------|------|
| Vizyon | 7–11 | PROTECTED |
| Misyon | 15–21 | PROTECTED |
| Deckent'i Öne Çıkaran Özellikler | 25–41 | PROTECTED |
| Hedef Kullanıcılar | 44–51 | PROTECTED |
| Teknoloji Kararları | 54–75 | PROTECTED |
| Yol Haritası | 78–105 | PROTECTED (narrative) |
| Değerler | 109–117 | PROTECTED |
| Sayılarla Deckent | 120–131 | **AUTO** (current, sprint-344) |
| Sprint Metrikleri (TR header) | 133–142 | **AUTO** — STALE (sprint-285 data) |
| Sprint History | 144–145 | **AUTO** |
| Sprint Metrics (EN header) | 147–157 | **AUTO** (current, sprint-344, duplicate) |

- **Findings:**
  - [stale-fact] Misyon (line 19): "34 MCP tool" — evidence: `VISION-TR.md:19`; parallel stale fact to EN — fix: update to 35 (parity with VISION.md fix)
  - [stale-fact] Misyon (line 19): "89 ADR, ADR-089'a kadar" — evidence: `VISION-TR.md:19`; stale, parallel to EN — fix: update to 94 / ADR-094
  - [stale-fact] Deckent'i Öne Çıkaran Özellikler table (line 34): "**89 ADR + ADR governance**" — evidence: `VISION-TR.md:34`; parallel to EN stale count — fix: update to 94 ADR
  - [stale-fact] AUTO drift — "Sprint Metrikleri" block (lines 133-142) contains sprint-285 data (8 tasks, 7 completed, 1 no-go, 49dk 50sn) — evidence: `VISION-TR.md:136` `Sprint | sprint-285`; EN counterpart (`VISION.md:134`) shows sprint-344 — fix: auto-generator should remove the old TR block; manual intervention prohibited (AUTO section)
  - [stale-fact] Duplicate AUTO block — lines 147-157 contain a second "Sprint Metrics" block in English appended to the TR file — evidence: `VISION-TR.md:147-157`; EN doc has only one clean block — fix: auto-generator cleanup needed

### VISION ↔ VISION-TR Parity Assessment

| Protected section | EN status | TR status | Parity |
|---|---|---|---|
| Vision / Vizyon | CURRENT | CURRENT | ✓ PARALLEL |
| Mission / Misyon | MINOR_DRIFT (34 MCP, 89 ADR) | MINOR_DRIFT (same) | ✓ PARALLEL drift |
| Distinctive / Öne Çıkaran | MINOR_DRIFT (89 ADR count) | MINOR_DRIFT (same) | ✓ PARALLEL drift |
| Target Users / Hedef Kullanıcılar | CURRENT | CURRENT | ✓ PARALLEL |
| Tech Decisions / Teknoloji | CURRENT | CURRENT | ✓ PARALLEL |
| Roadmap / Yol Haritası | CURRENT | CURRENT | ✓ PARALLEL |
| Values / Değerler | CURRENT | CURRENT | ✓ PARALLEL |
| AUTO: Numbers table | sprint-344 ✓ | sprint-344 ✓ | ✓ PARALLEL |
| AUTO: Sprint Metrics | sprint-344 (1 block) ✓ | sprint-285 block + sprint-344 block | ✗ DRIFT — TR has stale duplicate |

- **Outbound internal links:**
  - `../MASTER-PLAN.md` (line 92) → OK
- **Missing cross-refs:** none critical
- **Fix effort:** low (protected prose) + requires auto-generator fix (AUTO stale block)
- **Fix priority:** P1 (stale facts in protected sections; P0 for AUTO duplicate — misleading sprint metrics)

---

### docs/vision/agentic-run-ecosystem.md

- **Audience:** both (user-facing: product positioning; dogfood: execution contract reference for builders)
- **Status:** CURRENT
- **Code-verified against:** `docs/MASTER-PLAN.md:§1,§3` (shipped state), `VISION.md` (consistent capabilities), DIRECTIVES task description (WM-1 / WM-7 reference)

- **Findings:** none
  - WM-1 (`ExecutionRequest` contract) described as current ("Today, `buildExecutionRequest()` and `resolveToTask()` unify…") — consistent with Sprint 255+ shipped state per MASTER-PLAN
  - WM-7 (stack-aware execution) described as shipped — consistent with MASTER-PLAN §3 current state
  - Trinity × Audience Matrix aligns with VISION.md and roadmap.md Trinity sections
  - Multi-Provider Fleet description (Claude, Codex, Gemini, Ollama, OpenAI-compatible) aligns with VISION.md
  - No internal outbound links present — no broken-link risk
  - "This Sprint 255 document set is itself a dogfood case" — document header; slightly historical phrasing but harmless in a concept doc
- **Outbound internal links:** none
- **Missing cross-refs:**
  - Could link to `docs/MASTER-PLAN.md` for live WM-1/WM-7 work sequencing (optional, P2)
  - Could link to `docs/reference/api-surface.md` for `ExecutionRequest` contract detail (optional, P2)
- **Fix effort:** low (P2 cross-refs only)
- **Fix priority:** P2 (no bugs or stale facts)

---

### docs/vision/roadmap.md

- **Audience:** user-facing (product roadmap for contributors and interested users)
- **Status:** SUPERSEDED (per MASTER-PLAN.md header) + BROKEN links

#### SUPERSEDED Banner Check — FAIL

MASTER-PLAN.md explicitly names this file superseded:
> **Supersedes (now historical, preserved for provenance):** `docs/ROADMAP-GOD-LEVEL.md`, `docs/vision/roadmap.md`, `docs/release/roadmap.md`, …

`docs/release/roadmap.md` carries the correct banner format:
> `⚠️ **SUPERSEDED (2026-06-01, Sprint 211).** Consolidated into [`docs/MASTER-PLAN.md`](../MASTER-PLAN.md) — the single source of truth… Preserved for provenance.`

`docs/vision/roadmap.md` has only an informational pointer at line 3:
> `> **Active development sequencing lives in [`docs/MASTER-PLAN.md`](../MASTER-PLAN.md)** — the single source of truth…`

This is a navigation hint, NOT the formal frozen/SUPERSEDED provenance banner. The banner is **missing**.

**Per DOC-POLICY Tier-4 (frozen/superseded):** no content rewrites are proposed. The only finding is the missing formal banner — adding the banner header is a structural metadata change, not a content rewrite.

- **Findings:**
  - [broken-link] Line 178: `docs/ROADMAP-GOD-LEVEL.md` referenced in "Conversational Shell" section — evidence: `roadmap.md:178` (`docs/ROADMAP-GOD-LEVEL.md ⚡ 2026-05-20`); file does not exist at that path — fix: update link to `docs/MASTER-PLAN.md` (but file is SUPERSEDED/frozen — fix deferred to FIX sprint; structural fix only, not content)
  - [broken-link] Line 196: same file `docs/ROADMAP-GOD-LEVEL.md` — evidence: `roadmap.md:196` — same fix
  - [broken-link] Line 207: same file `docs/ROADMAP-GOD-LEVEL.md` — evidence: `roadmap.md:207` — same fix
  - [placeholder] Missing formal SUPERSEDED banner — evidence: `docs/release/roadmap.md:1` has the correct banner format; `docs/vision/roadmap.md:1-3` has only a pointer; MASTER-PLAN.md preamble confirms superseded status — fix: add `⚠️ SUPERSEDED` banner matching `docs/release/roadmap.md` format
  - [stale-fact] Duplicate section "Three Faces, One Engine — The Trinity" appears at lines 29-48 AND lines 52-72 — evidence: both sections have identical `##` heading; EN doc was edited multiple times; not proposed for fix (SUPERSEDED/frozen)
  - [stale-fact] "Conversational Shell — Direction Under Consideration" (line 176): status "Pending architecture decision" — native REPL has shipped (ADR-081/082/083 per VISION.md Mission); NOT proposing content rewrite (SUPERSEDED/frozen; note only)
  - [stale-fact] "AI System Worker is ~50%", "AI Assistant is ~25%" (lines 69-72) — MASTER-PLAN §2 shows both at ~80% — NOT proposing content rewrite (SUPERSEDED/frozen; note only)
- **Outbound internal links:**
  - `../MASTER-PLAN.md` (line 3) → OK
  - `../MASTER-PLAN.md` (line 136) → OK
  - `docs/ROADMAP-GOD-LEVEL.md` (line 178) → DEAD (file not found)
  - `docs/ROADMAP-GOD-LEVEL.md` (line 196) → DEAD (file not found)
  - `docs/ROADMAP-GOD-LEVEL.md` (line 207) → DEAD (file not found)
  - `../MASTER-PLAN.md` (line 274) → OK
  - `.brain/exports/decisions.md` (line 275) → OK
  - `docs/reference/api-surface.md` (line 278) → OK
  - `docs/reference/mcp-tools.md` (line 279) → OK
  - `.deckent/workspace/IDENTITY.md` (line 281) → OK
- **Missing cross-refs:** N/A (SUPERSEDED — not updated)
- **Fix effort:** low (add formal banner; dead-link cleanup)
- **Fix priority:** P1 (missing SUPERSEDED banner — provenance/navigation correctness); P1 (3 dead links — even frozen docs should not link to non-existent files)

---

## Cross-cutting findings

| Finding | Affects | Priority |
|---------|---------|----------|
| Stale ADR count (89 → 94) in protected Mission + Distinctive sections | VISION.md, VISION-TR.md | P1 |
| Stale MCP tool count (34 → 35) in protected Mission section | VISION.md, VISION-TR.md | P1 |
| TR AUTO stale sprint-285 metrics block + EN duplicate appended | VISION-TR.md | P0 (misleading metrics) |
| roadmap.md missing formal SUPERSEDED banner | roadmap.md | P1 |
| roadmap.md 3 dead links to ROADMAP-GOD-LEVEL.md | roadmap.md | P1 |

## Fix sprint recommendations (FIX sprint scope)

1. **VISION.md protected prose** — two surgical edits: (a) Mission "34 MCP tools" → 35; (b) Mission "89 ADRs through ADR-089" → "94 ADRs through ADR-094"; (c) Distinctive table row "89 ADRs" → "94 ADRs". No section rewrites needed.
2. **VISION-TR.md protected prose** — same three parallel edits as EN.
3. **VISION-TR.md AUTO cleanup** — auto-generator must remove the stale sprint-285 "Sprint Metrikleri" block (lines 133-142) and the duplicate EN "Sprint Metrics" block (lines 147-157), leaving only the unified "Sayılarla Deckent" + "Sprint Metrics" structure matching EN.
4. **roadmap.md SUPERSEDED banner** — prepend `> ⚠️ **SUPERSEDED (2026-06-01, Sprint 211).** Consolidated into [docs/MASTER-PLAN.md](../MASTER-PLAN.md) — the single source of truth. Preserved for provenance.` at top of file.
5. **roadmap.md dead links** — update 3 references to `docs/ROADMAP-GOD-LEVEL.md` → either remove or redirect to `docs/MASTER-PLAN.md` (structure-only, no content rewrite).
6. **agentic-run-ecosystem.md** — no fixes needed; P2 cross-ref additions are optional.
