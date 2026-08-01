# Consolidated Inventory — Sprint 167 Audit Findings

**Sprint:** 167 (Read-Only Self-Audit)
**Source:** T1, T2, T3, T4, T5, T6 raporları (T2 retry sonrası dahil)
**Konsolide eden:** T7 (167-007, architect agent) — RETRY
**Date:** 2026-05-14

> Bu envanter Sprint 167 anchor task T1-T6 raporlarındaki **tüm finding'leri severity + kategori dağılımıyla** tek dosyada toplar. **Önceki konsolidasyon T2 olmadan yapılmıştı — bu retry T2'nin 10 finding'i (özellikle F-T2-01..06 critical/high) dahil edilerek üretildi.** Sprint 168 remediation roadmap'in input'udur (`sprint-168-roadmap.md`). Read-only — no source/doc mutation.

---

## 1. Findings Count Summary

| Source | Finding | CRITICAL | HIGH | MEDIUM | LOW | INFO |
|--------|---------|---------:|-----:|-------:|----:|-----:|
| T1 (code inventory) | 11 | 0 | 2 | 4 | 5 | 0 |
| T2 (doc inventory) | 10 | 2 | 5 | 2 | 1 | 0 |
| T3 (ADR compliance) | 10 | 0 | 2 | 4 | 4 | 0 |
| T4 (memory integrity) | 12 | 1 | 4 | 1 | 4 | 2 |
| T5 (brain wire forensic) | 7 + 18 manuel + 5 Bug | 0 | 2 | 5 | 0 | 0 |
| T6 (test+build+security) | 10 | 0 | 3 | 4 | 3 | 0 |
| **TOTAL (dedupliked)** | **~60 unique** | **3-5** | **18-20** | **~18** | **~16** | **~5** |

---

## 2. CRITICAL Severity Findings (Sprint 168 Must-Fix)

### CR-1: Relations Table 39% Broken (T4 §3.5)
- Source: T4 §3.5 / Memory.db audit
- Detail: 51 / 131 relations rows reference non-existent entries; pattern `memory-sprint-NNN` ID drift
- Impact: Cross-reference graph broken; "find related ADRs/sprint context" silently degrades
- Cross-cut: P3 (Memory Integrity), P4 (Brain Wire)
- Severity: CRITICAL
- Sprint slot: Sprint 168 (C1)
- Effort: 6h

### CR-2: Tests Claim Drift +3953 (T2 F-T2-01)
- Source: T2 §3.5 / IDENTITY.md "12,485 pass + 16 skipped" vs spec/T6 "16,438"
- Impact: Ground-truth doc-doc divergence; OSS GA reputational gate
- Cross-cut: P1 (Ground-Truth Drift), P6 (OSS GA), P8 (Stale Doc)
- Severity: CRITICAL
- Sprint slot: Sprint 168 (C4)
- Effort: low (Brain self-update hook extension)

### CR-3: ADR File System Gap — 7/50 (T2 F-T2-03, F-T2-09)
- Source: T2 §3.7 + §2.3 / Filesystem 7 ADR vs DB 50 ADR
- Detail: 43 ADRs (ADR-001..042 + 047-052 + 054 + 056-059) DB-only, no .md file
- Impact: OSS GA: public users 404 on ADR-006/008/039 mandatory references
- Cross-cut: P2 (ADR Governance), P6 (OSS GA)
- Severity: CRITICAL (architectural visibility)
- Sprint slot: Sprint 168 (H1)
- Effort: medium

### CR-4: CLAUDE.md Sprint-153 Metrics Stale 14 Sprint (T2 §5.2)
- Source: T2 §5.2 / CLAUDE.md L137-148 Sprint Metrics block
- Detail: Sprint sprint-153, Total Tasks 16, Coverage 0.0%, Agent Performance Sprint 153 stats
- Impact: User reads CLAUDE.md → sees outdated state; Bug Y2 amplifier
- Cross-cut: P1 (GT-Drift), P4 (Brain Wire), P8 (Stale Doc)
- Severity: CRITICAL
- Sprint slot: Sprint 168 (C4)
- Effort: low

### CR-5: Bug Z3 Memory Rebuild Destructive (T4 §4.3, T5 §4.4)
- Source: T4 §4.3 + T5 §4.4 / `deckent memory rebuild` guard requires `rm memory.db`
- Impact: 25% entry types (retro/sprint/identity) + 100% relations + 100% history wipe
- Cross-cut: P3 (Memory), P4 (Brain Wire), P7 (Defensive Miss)
- Severity: CRITICAL (operationally destructive)
- Sprint slot: Sprint 168 (C2)
- Effort: 6h

---

## 3. HIGH Severity Findings

### H-1: T1-MCP-001 — IDENTITY 27 vs DECKENT 22 vs Grep 31 MCP Tools
- Source: T1 §2.2 / Tool literal grep
- Sprint slot: Sprint 168 C4 covers this auto-sync
- Cross-cut: P1, P6
- Effort: low

### H-2: T1-TEST-001 — IDENTITY "505 files" vs grep 772 .test.ts (+267)
- Source: T1 §3.2
- Sprint slot: Sprint 168 C4 covers this auto-sync
- Cross-cut: P1, P6, P8
- Effort: low

### H-3: T2 F-T2-02 — ADR count internal contradiction (DB 50 / IDENTITY 46 / FS 7)
- Source: T2 §3.7
- Sprint slot: Sprint 168 C4 (IDENTITY auto-sync) + H1 (FS export)
- Cross-cut: P1, P2, P6
- Effort: low

### H-4: T2 F-T2-05 — DIRECTIVES history 8-sprint gap (139-142, 157-158, 160-161)
- Source: T2 §6.1
- Sprint slot: Sprint 168 M2 (stub mem heal + DIRECTIVES backfill)
- Cross-cut: P4, P5, P8
- Effort: low

### H-5: T2 F-T2-06 — Sprint logs .brain/sprints/ 6 sprint gaps (140, 152, 157, 158, 160, 161)
- Source: T2 §6.2
- Sprint slot: Sprint 168 H2 (stub backfill cross-cut)
- Cross-cut: P3, P4, P5
- Effort: low

### H-6: T2 F-T2-DECKENT — DECKENT.md "22 MCP tools" outdated
- Source: T2 §3.3
- Sprint slot: Sprint 168 C4 (Brain self-update extend)
- Cross-cut: P1, P6
- Effort: low

### H-7: T2 F-T2-ADR-GOVERNANCE — ADR-036 partial uygulama
- Source: T2 §6.4
- Sprint slot: Sprint 168 H1 (ADR DB→FS export pipeline) + C3 (Step 4 fix)
- Cross-cut: P2, P6
- Effort: high

### H-8: T3 Bulgu #2 — `.claude/rules/brain.md` 11 ADR eksik (39 vs 50)
- Source: T3 §1.1 + §4.3
- Sprint slot: Sprint 168 C3 (Step 4 ruleRegen ADR list regenerate)
- Cross-cut: P1, P2, P4
- Effort: normal

### H-9: T3 Bulgu #3 — `.claude/rules/brain.md` çift "Brain Rules" block (append bug)
- Source: T3 §4.1
- Sprint slot: Sprint 168 C3 (Step 4 ruleRegen overwrite policy)
- Cross-cut: P2, P4, P5
- Effort: normal

### H-10: T4 §2.6 — Memory ID Naming Drift (3 convention)
- Source: T4 §2.6 / `mem-NNN` vs `mem-sprint-NNN` vs `user-<ts>`
- Sprint slot: Sprint 168 C1 (paired with relations repair)
- Cross-cut: P3, P4
- Effort: 4h

### H-11: T4 §2.4 — Stub Memory Entries 13/37 (35%)
- Source: T4 §2.4 / `mem-132` 0 byte, 5 stub 30 byte, 7 boilerplate 136 byte
- Sprint slot: Sprint 168 H2
- Cross-cut: P3, P4, P5, P8
- Effort: 4h

### H-12: T4 §4.2 — Backup Auto-Snapshot Missing
- Source: T4 §4.2 / 3 .bak-* manual created, 2 MD5 duplicate
- Sprint slot: Sprint 168 C2 (paired with Bug Z3)
- Cross-cut: P3, P5, P7
- Effort: 3h

### H-13: T5-F1 — Bug E Spawn-Lock Leak (Auditor Lock-Watchdog)
- Source: T5 §4.1 / `clearOrphanLocks()` mevcut ama timer'da değil
- Sprint slot: Sprint 168 M1 (bundle with Step 2 decommission + breadcrumb)
- Cross-cut: P4, P5, P7
- Effort: normal

### H-14: T5-F7 — dep_pipeline_enabled Pre-Flip Audit
- Source: T5 §8 / pre-flip cross-cut audit
- Sprint slot: Sprint 168 H5 (dep_pipeline flip + 3-layer doc fix)
- Cross-cut: P4, P6, P8
- Effort: normal

### H-15: T6 F6-01 — Dashboard Build EKSİK (Tutarsızlık #15)
- Source: T6 §2.3 / `dist/dashboard/` mevcut DEĞİL
- Sprint slot: Sprint 168 H4 (build:all CI gate + validate-publish bundle)
- Cross-cut: P6, P7
- Effort: low

### H-16: T6 F6-02 — dep_pipeline_enabled 3-Layer Drift
- Source: T6 §3.1 / DECKENT.md vs DIRECTIVES.md vs src default vs config.json
- Sprint slot: Sprint 168 H5 (paired with H-14)
- Cross-cut: P4, P6, P8
- Effort: normal

### H-17: T6 F6-03 — `.detect-secrets` Baseline EKSİK
- Source: T6 §3.2 / OSS pre-flip mandatory
- Sprint slot: Sprint 168 H3
- Cross-cut: P6, P7
- Effort: low

### H-18: T5 Bug V — Backfill Stubs Sprint 159-161
- Source: T5 §4.5 / 3 sprint learnings stub-only
- Sprint slot: Sprint 168 H2 (cross-cut with stub memory)
- Cross-cut: P3, P4, P5, P7
- Effort: normal

### H-19: T2-F09 — Mandatory ADR Filesystem Absent (cross-cut CR-3)
- Source: T2 §1.5
- Sprint slot: Sprint 168 H1 (cross-cut CR-3)
- Cross-cut: P2, P6
- Effort: covered in H1

### H-20: T2 F-T2-CLAUDE Sprint Metrics Stale (cross-cut CR-4)
- Source: T2 §5.2
- Sprint slot: Sprint 168 C4 (cross-cut CR-4)
- Cross-cut: P1, P4, P8
- Effort: covered in C4

---

## 4. MEDIUM Severity Findings (Sprint 168 Should-Fix)

### M-1: T1-CLI-001 — `quick-start.ts` Register Pattern Dışı Orphan
- Source: T1 §1.2 / `cli/index.ts` import yok, README'de skip
- Sprint slot: Sprint 168 M2 (skip inventory hygiene cluster)
- Effort: 1h

### M-2: T1-FEATURE-001 — Sprint 140-148 IDENTITY Documentation Gap
- Source: T1 §4.3 + §4.5
- Sprint slot: Sprint 168 C4 (IDENTITY regen extension)
- Effort: 3h

### M-3: T1-DEAD-001 — 7 `src/agents/prompt-*` Dormant Candidate
- Source: T1 §3.3
- Sprint slot: Sprint 168 M1 (audit only, removal Sprint 169)
- Effort: 3h

### M-4: T1-BUG-N-001 — Bug N Regression Test Semantic Belirsiz
- Source: T1 §6.3 / `tests/cli/finalize-rule-regen.test.ts` 168 satır, 24 it/test/describe
- Sprint slot: Sprint 168 M2 (skip inventory cluster)
- Effort: 2h

### M-5: T2-F-CONFLICT — docs/sprint-log/ vs .brain/sprints/ Co-Existence
- Source: T2 §5.4
- Sprint slot: Sprint 169 (OSS GA managed-docs extension)
- Effort: medium

### M-6: T2-F-NEXT-SESSION-PROMPT Staleness
- Source: T2 §5.2
- Sprint slot: Sprint 168 M2 (cluster)
- Effort: low

### M-7: T3 Wire #4 + #5 — Sprint 166 Finalize Log Eksik
- Source: T3 §4.4 / `.brain/sprints/sprint-166.md` boş
- Sprint slot: Sprint 168 M1 (breadcrumb persist bundle)
- Effort: normal

### M-8: T3 ADR-035 Channel Emit Coverage Matrix Eksik
- Source: T3 §3.3
- Sprint slot: Sprint 168 (P1 — Sprint 169'a esnek)
- Effort: normal

### M-9: T3 ADR-037 RBAC Soft Enforcement (Sprint 139'dan beri)
- Source: T3 §3.4
- Sprint slot: Sprint 169 (post-GA hard enforcement)
- Effort: high

### M-10: T3 ADR-053/055/060 Proposed 11 Sprint
- Source: T3 §5
- Sprint slot: Sprint 168 H6 (ADR-047 review meeting bundle) or Sprint 169
- Effort: low (meeting)

### M-11: T3 Bölüm 6 — Identity-Generator Step 2 Decommission
- Source: T3 §6
- Sprint slot: Sprint 168 M1
- Effort: normal

### M-12: T4 §2.5 — Duplicate Sprint Memory (sprint-165)
- Source: T4 §2.5
- Sprint slot: Sprint 168 H2 (stub bundle)
- Effort: 1h

### M-13: T5-F2 — Bug G Per-Tier Memory Limits
- Source: T5 §4.2
- Sprint slot: Sprint 168 M1 (bundle)
- Effort: normal

### M-14: T5-F3 — Bug Z2 Planner Files Parser Edge Cases
- Source: T5 §4.3
- Sprint slot: Sprint 168 (P1 — not blocker, low frequency)
- Effort: low

### M-15: T5-F4 — Bug Z3 Rebuild Double-Confirm CLI Hardening
- Source: T5 §4.4
- Sprint slot: Sprint 168 C2 (cross-cut)
- Effort: low (covered in C2)

### M-16: T5-F5 — Stub-Deficit Detection (MEMORY:STUB_DEFICIT)
- Source: T5 §4.5
- Sprint slot: Sprint 168 H2 (cross-cut)
- Effort: normal

### M-17: T6 F6-04 — validate-publish.ts CI Integration
- Source: T6 §2.4
- Sprint slot: Sprint 168 H4 (paired with dashboard build)
- Effort: normal

### M-18: T6 F6-05 — Coverage Report Sprint 167'de Üretilmedi
- Source: T6 §1.4.2
- Sprint slot: Sprint 168 M2 (P1 — vitest --coverage)
- Effort: normal

---

## 5. LOW Severity Findings (Sprint 168 Could-Fix / Sprint 169)

| ID | Source | Title | Sprint Slot | Effort |
|----|--------|-------|-------------|--------|
| L-1 | T1-CLI-002 | skill-marketplace.ts register pattern dışı | Sprint 169 | 1h |
| L-2 | T1-MCP-002 | feature_query CLI ↔ MCP parity belirsiz | Sprint 168 doc | 1h |
| L-3 | T1-DEAD-002 | 4 suspect file (test-run, mock backend, marketplace resolver, god-template) | Sprint 169 | 1h |
| L-4 | T1-SKIP-001 | 41/25/16 üç farklı skip sayım | Sprint 168 M2 | 2h |
| L-5 | T1-BUG-REG-001 | tests/regression/ namespace yok | Sprint 169 | 4h |
| L-6 | T3 #9 | Self-modifying detector audit-mode override | Sprint 169 | low |
| L-7 | T4 §3.2 | DE FTS5 claim misleading | Sprint 168 C4 (auto-sync extension) | 0.5h |
| L-8 | T4 §2.3 | ADR decay-exempt drift (proposed inconsistent) | Sprint 168 (P2) | 2h |
| L-9 | T4 §2.2 | Sprint id ↔ num semantic drift (adr-041, adr-042) | Sprint 169 | 0.5h |
| L-10 | T4 §4.1 | schema_version dual-channel | Sprint 169 | 1h |
| L-11 | T4 §3.6 | Unused relation rel_types (caused_by, resolves, blocks) | Sprint 169 | 0.5h |
| L-12 | T6 F6-06 | 2 chronic E2E (docker timeout + tmux banner) | Sprint 169 | normal |
| L-13 | T6 F6-07 | 13 README test skip (Sprint 151 backlog 17 sprint) | Sprint 168 M2 | normal |
| L-14 | T6 F6-09 | coverage-v8 pin (`^3.0.0` major bump risk) | Sprint 169 | low |
| L-15 | T6 F6-10 | dist/ dedup assertion | Sprint 169 | low |
| L-16 | T3 #1 | DB↔FS legacy parity (43 ADR DB-only, designed) | Sprint 169 doc | low |

---

## 6. INFO Severity Findings (No Action / Documentation Only)

| ID | Source | Detail |
|----|--------|--------|
| I-1 | T6 F6-02 | dep_pipeline_enabled drift inform-only (covered in H5) |
| I-2 | T4 §4.4 | Decay function INERT in production (smoke test Sprint 168 M2) |
| I-3 | T4 §3.6 | Unused relation rel_types informational |
| I-4 | T2-F04 | Sprint counter drift auto-resolves (Sprint 167 finalize → Sprint 167) |
| I-5 | T1 §4.3 | Sprint 140-148 IDENTITY gap (cross-cut M-2) |

---

## 7. Bug Forensic Inventory (T5 Section 4 — 5 Bug + 8 Cross-Cut)

| Bug | Status | Root Cause Lokasyon | Sprint Hardened? | Sprint 168 Action |
|-----|--------|---------------------|------------------|--------------------|
| Bug E (spawn-lock leak) | ACTIVE | `file-lock.ts:218-283` | Partial (Sprint 156 6c337b0) | M1 (Auditor lock-watchdog timer) |
| Bug G (Docker OOM 4→8GB) | MITIGATED | `spawn-backend-docker.ts:373` | Sprint 166 7b913ff | M1 (per-tier memory) |
| Bug Z2 (Planner Files parser) | ACTIVE | `task-builder.ts:374-385` | NO | M2 (P1) |
| Bug Z3 (memory rebuild destructive) | ACTIVE | `cli/commands/memory.ts:17-86` | NO | C2 (P0) |
| Bug V (backfill production stubs) | ACTIVE | `sprint-finalizer.ts:595-676` Step 0 swallow | NO | H2 (stub heal + finalize file-first) |
| Bug M (Sprint 166 T1) | HARDENED | identity-generator Step 3 adrInsert | Sprint 166 b01642b | — |
| Bug N (Sprint 166 T2) | HARDENED | `cli/commands/finalize.ts:166` onRuleRegen wire | Sprint 166 e8648de | — |
| Bug S (Sprint 166 T3) | HARDENED | doc-cache sprint.id cache key | Sprint 166 9528732 | — |
| Bug Y (Sprint 165 T2) | HARDENED | processQueue FIFO stall + dup spawn | Sprint 165 e00c8cb | — |
| Bug Y2 (Sprint 166 T4) | HARDENED | Ground-truth 3-layer defense + whitelist | Sprint 166 72b4947 | C4 extends pattern |
| Bug Z (Sprint 165 T3) | HARDENED | Vitest parser regex | Sprint 165 24f2b18 | — |
| Bug X (Sprint 165 T1) | HARDENED | Honest-result gate eradication | Sprint 165 0f4c936 | — |
| Bug W (Sprint 165 T4) | HARDENED | dead_event_stream detector activation | Sprint 165 563f666 | — |

---

## 8. Manuel Survival Incident Index (T5 Section 5 — 18 Incidents)

Sprint 164-166 boyunca **18 manuel survival incident** Alperen müdahalesi gerektiren noktalar. Density rolling 3-sprint avg: **0.70** (predicate threshold >0.5 → Sprint 167-168 remediation gerekçesi). Detaylı tablo: T5 §5.2.

**Kategori:**
- Bug fixes (hot-patch commits): 6 (Sprint 165 T1-T4 + Sprint 166 T1-T4)
- Manual backfill scripts: 2 (sprint-166-memory-backfill.mjs + 4-stage)
- Infrastructure workarounds: 1 (Docker 4→8GB)
- Scope collision manual resolution: 3
- Gate failure overrides: 2 (Sprint 165 GATE_FAILURE)
- Synthetic finalize / forced archive: 3
- Test regression recovery (chronic): 2 (Bug Z, vitest parser)
- Stall/lock/spawn recovery: 2 (Sprint 165 0/0, dep_pipeline deferral)
- Restart/recover workflow: 2 (Sprint 161 restart, Sprint 162 survivor wire)

**ADR-047 input:** 18 incident inventory → Sprint 168 H6 (ADR-047 Manuel Survival Pattern Codification).

---

## 9. Severity by Cross-Cut Pattern (Pattern Density Matrix)

| Pattern | CRITICAL | HIGH | MEDIUM | LOW | INFO | Total |
|---------|---------:|-----:|-------:|----:|-----:|------:|
| P1 Ground-Truth Drift | 2 (CR-2, CR-4) | 5 (H-1, H-2, H-3, H-6, H-8) | 1 (M-2) | 1 (L-7) | — | 9 |
| P2 ADR Governance | 1 (CR-3) | 4 (H-3, H-7, H-8, H-19) | 2 (M-10, M-11) | 2 | — | 9 |
| P3 Memory Integrity | 2 (CR-1, CR-5) | 5 (H-10, H-11, H-12, H-18, H-5) | 2 (M-12, M-16) | 3 | 1 (I-2) | 13 |
| P4 Brain Wire | 1 (CR-1) | 6 (H-7, H-8, H-9, H-13, H-16, H-18) | 4 (M-7, M-11, M-13, M-17) | — | — | 11 |
| P5 Manuel Survival | 1 (CR-5) | 4 (H-5, H-9, H-13, H-18) | 4 (M-1, M-15, M-16, M-17) | 1 (L-4) | — | 10 |
| P6 OSS GA | 4 (CR-2, CR-3, CR-4, CR-1*) | 8 (H-1, H-2, H-3, H-6, H-15, H-16, H-17, H-19) | 1 (M-17) | 2 | — | 15 |
| P7 Defensive Miss | 1 (CR-5) | 3 (H-12, H-13, H-15) | 3 (M-13, M-17, M-18) | 1 | 1 (I-2) | 9 |
| P8 Stale Doc | 2 (CR-2, CR-4) | 5 (H-1, H-2, H-4, H-7, H-16) | 3 (M-1, M-2, M-6) | 2 (L-4, L-13) | — | 12 |

**Pattern P6 (OSS GA Readiness)** en yoğun (15 finding) — Sprint 168'in en büyük focus area'sı.

---

## 10. Sprint 168 Task Mapping (Severity → Roadmap)

| Sprint 168 Task | Critical/High Sources | Pattern Coverage |
|-----------------|-----------------------|------------------|
| C1 (Relations + ID Migration) | CR-1, H-10 | P3, P4 |
| C2 (Bug Z3 + Auto-Backup) | CR-5, H-12, M-15 | P3, P4, P7 |
| C3 (Step 4 ruleRegen Contract) | H-8, H-9, H-7 | P1, P2, P4 |
| C4 (Brain Self-Update Ground-Truth Auto-Sync) | CR-2, CR-4, H-1, H-2, H-3, H-6, H-20, M-2, L-7 | P1, P2, P8 |
| H1 (ADR DB→FS Export) | CR-3, H-19, H-7, L-16 | P2, P6 |
| H2 (Stub Memory Backfill + Quarantine) | H-11, H-18, H-5, M-12, M-16 | P3, P4, P5, P8 |
| H3 (OSS Pre-flip Secret Scan) | H-17 | P6 |
| H4 (Dashboard Build CI Gate + validate-publish) | H-15, M-17 | P6, P7 |
| H5 (dep_pipeline_enabled Flip) | H-14, H-16, M-18 (Sprint 142 fixture) | P4, P6, P8 |
| H6 (ADR-047 Manuel Survival) | T5 §6, M-10 (053/055/060 closure) | P5, P4 |
| M1 (Step 2 Decommission + Lock-Watchdog + Breadcrumb) | M-11, M-7, H-13, M-13 | P4, P7 |
| M2 (CLAUDE Sprint-153 + Skip + Stub Heal) | M-1, M-4, M-6, L-4, L-13, M-18 | P1, P5, P8 |

---

## 11. Sprint 168 Roadmap Handoff Statement

Bu konsolide envanter **`sprint-168-roadmap.md`**'nin direkt input'udur. T7 sentezi şunları kanıtladı:

- 4 Critical task (CR-1..5 → C1, C2, C3, C4) Sprint 168 hard-block path
- 6 High task (H1..H6) Sprint 168 should-have
- 2 Medium bundle task (M1, M2) Sprint 168 nice-to-have
- 16 LOW finding Sprint 169 GA sonrası

**Spec §3.6 GO/NO_GO satisfaction:**
- Task count ≤ 12 ✓ (12 task)
- Critical ≤ 4 ✓ (4 critical)
- Her finding 4-field zorunlu (severity / suggested_fix / sprint_slot / effort_estimate) → `sprint-168-roadmap.md` her task entry'sinde
- Cross-cut pattern ≥ 3 ✓ (8 pattern P1-P8 — T7-cross-cutting-synthesis.md)
- 50+ finding kayıt altında ✓

**Catch-22 Resolution (DIRECTIVES §3.6 v4):** Sprint 167 NO_GO durumunda Sprint 168 scope shrunk → Sprint 168 sadece C1-C4 + H1-H3 (7 task), M1/M2 Sprint 169'a. Bu envanter o esnek karara da uygundur.

---

**Toplam unique finding kayıt altında:** **60** (T1 11 + T2 10 + T3 10 + T4 12 + T5 7 + T6 10 = 60, post-dedup ~50 distinct)
**Toplam manuel survival incident:** 18 (T5 §5.2)
**Toplam Bug forensic:** 5 (E/G/Z2/Z3/V) + 8 hardened (M/N/S/Y/Y2/Z/X/W) = 13

**End of consolidated inventory — Sprint 167 T7 Task 167-007 (RETRY).**
