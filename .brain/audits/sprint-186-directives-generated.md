# DIRECTIVES — Sprint 186: Per-File Full Coverage Audit (479 Task, DOC-ONLY)

## Goal
`.brain/audits/pilot-479-manifest.json` icindeki 479 src/ TypeScript dosyasinin her biri icin satir-satir audit. Output: `docs/audits/per-file-2026-05-21/<flat>.md` per file. Doc-only — kod yazimi YASAK.

Her audit task standart 9-section template uygular: Inventory + Baglam + Debt Risk + Dead Code + Documentation Gaps + ADR Compliance + Refactor Recommendations + Sprint 187 Follow-up + Summary.

## Brain Planning Instructions
- Mode: structured (manifest-driven, AI mode 479 task uretemiyor)
- dependency_pipeline_enabled: false (manuel wave gate)
- nervous_system.enabled: false (deckent-dev self-modify riski)
- max_workers: 6
- Provider: claude (subscription, opus model)
- Effort: dosya LoC bazli (low <200, normal 200-600, high 600+)

## Task 186-001: Audit src/agents/adaptive-agent.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__agents__adaptive-agent.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/agents/adaptive-agent.ts` dosyasini satir-satir oku (214 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__agents__adaptive-agent.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__agents__adaptive-agent.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__agents__adaptive-agent.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__agents__adaptive-agent.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-002: Audit src/agents/agent-genealogy.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__agents__agent-genealogy.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/agents/agent-genealogy.ts` dosyasini satir-satir oku (188 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__agents__agent-genealogy.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__agents__agent-genealogy.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__agents__agent-genealogy.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__agents__agent-genealogy.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-003: Audit src/agents/agent-retirement.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__agents__agent-retirement.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/agents/agent-retirement.ts` dosyasini satir-satir oku (207 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__agents__agent-retirement.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__agents__agent-retirement.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__agents__agent-retirement.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__agents__agent-retirement.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-004: Audit src/agents/auditor.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__agents__auditor.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/agents/auditor.ts` dosyasini satir-satir oku (13 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__agents__auditor.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__agents__auditor.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__agents__auditor.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__agents__auditor.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-005: Audit src/agents/cross-sprint-analyzer.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__agents__cross-sprint-analyzer.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/agents/cross-sprint-analyzer.ts` dosyasini satir-satir oku (243 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__agents__cross-sprint-analyzer.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__agents__cross-sprint-analyzer.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__agents__cross-sprint-analyzer.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__agents__cross-sprint-analyzer.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-006: Audit src/agents/index.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__agents__index.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/agents/index.ts` dosyasini satir-satir oku (19 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__agents__index.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__agents__index.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__agents__index.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__agents__index.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-007: Audit src/agents/permission-guard.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__agents__permission-guard.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/agents/permission-guard.ts` dosyasini satir-satir oku (220 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__agents__permission-guard.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__agents__permission-guard.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__agents__permission-guard.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__agents__permission-guard.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-008: Audit src/agents/prompt-ab-test.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__agents__prompt-ab-test.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/agents/prompt-ab-test.ts` dosyasini satir-satir oku (10 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__agents__prompt-ab-test.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__agents__prompt-ab-test.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__agents__prompt-ab-test.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__agents__prompt-ab-test.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-009: Audit src/agents/prompt-analytics.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__agents__prompt-analytics.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/agents/prompt-analytics.ts` dosyasini satir-satir oku (474 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__agents__prompt-analytics.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__agents__prompt-analytics.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__agents__prompt-analytics.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__agents__prompt-analytics.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-010: Audit src/agents/prompt-evolution.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__agents__prompt-evolution.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/agents/prompt-evolution.ts` dosyasini satir-satir oku (133 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__agents__prompt-evolution.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__agents__prompt-evolution.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__agents__prompt-evolution.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__agents__prompt-evolution.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-011: Audit src/agents/prompt-metrics.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__agents__prompt-metrics.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/agents/prompt-metrics.ts` dosyasini satir-satir oku (6 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__agents__prompt-metrics.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__agents__prompt-metrics.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__agents__prompt-metrics.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__agents__prompt-metrics.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-012: Audit src/agents/prompt-rollback.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__agents__prompt-rollback.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/agents/prompt-rollback.ts` dosyasini satir-satir oku (151 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__agents__prompt-rollback.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__agents__prompt-rollback.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__agents__prompt-rollback.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__agents__prompt-rollback.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-013: Audit src/agents/prompt-version.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__agents__prompt-version.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/agents/prompt-version.ts` dosyasini satir-satir oku (227 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__agents__prompt-version.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__agents__prompt-version.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__agents__prompt-version.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__agents__prompt-version.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-014: Audit src/agents/shared-context.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__agents__shared-context.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/agents/shared-context.ts` dosyasini satir-satir oku (121 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__agents__shared-context.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__agents__shared-context.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__agents__shared-context.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__agents__shared-context.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-015: Audit src/agents/specialization-drift.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__agents__specialization-drift.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/agents/specialization-drift.ts` dosyasini satir-satir oku (108 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__agents__specialization-drift.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__agents__specialization-drift.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__agents__specialization-drift.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__agents__specialization-drift.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-016: Audit src/agents/worker-ipc.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__agents__worker-ipc.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/agents/worker-ipc.ts` dosyasini satir-satir oku (370 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__agents__worker-ipc.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__agents__worker-ipc.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__agents__worker-ipc.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__agents__worker-ipc.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-017: Audit src/agents/worker-lifecycle.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__agents__worker-lifecycle.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/agents/worker-lifecycle.ts` dosyasini satir-satir oku (579 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__agents__worker-lifecycle.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__agents__worker-lifecycle.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__agents__worker-lifecycle.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__agents__worker-lifecycle.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-018: Audit src/agents/worker-log.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__agents__worker-log.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/agents/worker-log.ts` dosyasini satir-satir oku (195 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__agents__worker-log.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__agents__worker-log.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__agents__worker-log.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__agents__worker-log.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-019: Audit src/agents/worker-rollback.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__agents__worker-rollback.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/agents/worker-rollback.ts` dosyasini satir-satir oku (330 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__agents__worker-rollback.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__agents__worker-rollback.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__agents__worker-rollback.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__agents__worker-rollback.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-020: Audit src/agents/worker-verify.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__agents__worker-verify.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/agents/worker-verify.ts` dosyasini satir-satir oku (515 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__agents__worker-verify.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__agents__worker-verify.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__agents__worker-verify.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__agents__worker-verify.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-021: Audit src/agents/worker.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__agents__worker.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/agents/worker.ts` dosyasini satir-satir oku (593 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__agents__worker.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__agents__worker.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__agents__worker.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__agents__worker.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-022: Audit src/api/auth.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__api__auth.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/api/auth.ts` dosyasini satir-satir oku (113 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__api__auth.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__api__auth.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__api__auth.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__api__auth.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-023: Audit src/api/chat-handler.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__api__chat-handler.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/api/chat-handler.ts` dosyasini satir-satir oku (29 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__api__chat-handler.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__api__chat-handler.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__api__chat-handler.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__api__chat-handler.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-024: Audit src/api/rate-limiter.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__api__rate-limiter.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/api/rate-limiter.ts` dosyasini satir-satir oku (96 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__api__rate-limiter.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__api__rate-limiter.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__api__rate-limiter.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__api__rate-limiter.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-025: Audit src/api/server.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__api__server.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/api/server.ts` dosyasini satir-satir oku (1053 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__api__server.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__api__server.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__api__server.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__api__server.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-026: Audit src/api/terminal/audit-integrity.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__api__terminal__audit-integrity.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/api/terminal/audit-integrity.ts` dosyasini satir-satir oku (153 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__api__terminal__audit-integrity.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__api__terminal__audit-integrity.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__api__terminal__audit-integrity.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__api__terminal__audit-integrity.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-027: Audit src/api/terminal/audit.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__api__terminal__audit.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/api/terminal/audit.ts` dosyasini satir-satir oku (110 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__api__terminal__audit.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__api__terminal__audit.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__api__terminal__audit.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__api__terminal__audit.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-028: Audit src/api/terminal/auth-provider.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__api__terminal__auth-provider.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/api/terminal/auth-provider.ts` dosyasini satir-satir oku (55 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__api__terminal__auth-provider.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__api__terminal__auth-provider.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__api__terminal__auth-provider.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__api__terminal__auth-provider.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-029: Audit src/api/terminal/command-guard.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__api__terminal__command-guard.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/api/terminal/command-guard.ts` dosyasini satir-satir oku (65 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__api__terminal__command-guard.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__api__terminal__command-guard.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__api__terminal__command-guard.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__api__terminal__command-guard.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-030: Audit src/api/terminal/outbound-limiter.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__api__terminal__outbound-limiter.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/api/terminal/outbound-limiter.ts` dosyasini satir-satir oku (92 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__api__terminal__outbound-limiter.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__api__terminal__outbound-limiter.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__api__terminal__outbound-limiter.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__api__terminal__outbound-limiter.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-031: Audit src/api/terminal/prompt-guard.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__api__terminal__prompt-guard.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/api/terminal/prompt-guard.ts` dosyasini satir-satir oku (48 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__api__terminal__prompt-guard.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__api__terminal__prompt-guard.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__api__terminal__prompt-guard.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__api__terminal__prompt-guard.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-032: Audit src/api/terminal/session-backend.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__api__terminal__session-backend.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/api/terminal/session-backend.ts` dosyasini satir-satir oku (55 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__api__terminal__session-backend.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__api__terminal__session-backend.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__api__terminal__session-backend.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__api__terminal__session-backend.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-033: Audit src/api/terminal/session-manager.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__api__terminal__session-manager.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/api/terminal/session-manager.ts` dosyasini satir-satir oku (153 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__api__terminal__session-manager.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__api__terminal__session-manager.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__api__terminal__session-manager.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__api__terminal__session-manager.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-034: Audit src/api/terminal/types.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__api__terminal__types.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/api/terminal/types.ts` dosyasini satir-satir oku (35 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__api__terminal__types.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__api__terminal__types.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__api__terminal__types.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__api__terminal__types.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-035: Audit src/api/terminal/ws-gateway.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__api__terminal__ws-gateway.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/api/terminal/ws-gateway.ts` dosyasini satir-satir oku (233 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__api__terminal__ws-gateway.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__api__terminal__ws-gateway.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__api__terminal__ws-gateway.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__api__terminal__ws-gateway.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-036: Audit src/api/watcher.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__api__watcher.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/api/watcher.ts` dosyasini satir-satir oku (29 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__api__watcher.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__api__watcher.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__api__watcher.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__api__watcher.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-037: Audit src/cli/auto-setup.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__auto-setup.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/auto-setup.ts` dosyasini satir-satir oku (113 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__auto-setup.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__auto-setup.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__auto-setup.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__auto-setup.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-038: Audit src/cli/commands/agent.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__agent.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/agent.ts` dosyasini satir-satir oku (535 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__agent.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__agent.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__agent.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__agent.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-039: Audit src/cli/commands/analyze.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__analyze.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/analyze.ts` dosyasini satir-satir oku (45 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__analyze.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__analyze.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__analyze.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__analyze.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-040: Audit src/cli/commands/archive-debt.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__archive-debt.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/archive-debt.ts` dosyasini satir-satir oku (200 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__archive-debt.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__archive-debt.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__archive-debt.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__archive-debt.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-041: Audit src/cli/commands/attach.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__attach.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/attach.ts` dosyasini satir-satir oku (79 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__attach.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__attach.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__attach.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__attach.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-042: Audit src/cli/commands/audit-verify.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__audit-verify.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/audit-verify.ts` dosyasini satir-satir oku (58 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__audit-verify.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__audit-verify.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__audit-verify.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__audit-verify.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-043: Audit src/cli/commands/audit.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__audit.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/audit.ts` dosyasini satir-satir oku (45 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__audit.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__audit.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__audit.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__audit.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-044: Audit src/cli/commands/checkpoint.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__checkpoint.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/checkpoint.ts` dosyasini satir-satir oku (154 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__checkpoint.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__checkpoint.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__checkpoint.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__checkpoint.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-045: Audit src/cli/commands/cleanup.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__cleanup.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/cleanup.ts` dosyasini satir-satir oku (255 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__cleanup.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__cleanup.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__cleanup.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__cleanup.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-046: Audit src/cli/commands/config-nervous.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__config-nervous.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/config-nervous.ts` dosyasini satir-satir oku (416 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__config-nervous.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__config-nervous.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__config-nervous.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__config-nervous.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-047: Audit src/cli/commands/config.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__config.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/config.ts` dosyasini satir-satir oku (270 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__config.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__config.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__config.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__config.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-048: Audit src/cli/commands/cost.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__cost.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/cost.ts` dosyasini satir-satir oku (246 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__cost.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__cost.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__cost.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__cost.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-049: Audit src/cli/commands/dashboard.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__dashboard.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/dashboard.ts` dosyasini satir-satir oku (214 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__dashboard.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__dashboard.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__dashboard.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__dashboard.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-050: Audit src/cli/commands/docs.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__docs.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/docs.ts` dosyasini satir-satir oku (158 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__docs.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__docs.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__docs.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__docs.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-051: Audit src/cli/commands/doctor-checks.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__doctor-checks.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/doctor-checks.ts` dosyasini satir-satir oku (481 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__doctor-checks.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__doctor-checks.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__doctor-checks.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__doctor-checks.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-052: Audit src/cli/commands/doctor-format.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__doctor-format.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/doctor-format.ts` dosyasini satir-satir oku (360 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__doctor-format.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__doctor-format.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__doctor-format.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__doctor-format.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-053: Audit src/cli/commands/doctor.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__doctor.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/doctor.ts` dosyasini satir-satir oku (1081 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__doctor.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__doctor.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__doctor.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__doctor.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-054: Audit src/cli/commands/explain.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__explain.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/explain.ts` dosyasini satir-satir oku (435 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__explain.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__explain.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__explain.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__explain.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-055: Audit src/cli/commands/features.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__features.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/features.ts` dosyasini satir-satir oku (149 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__features.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__features.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__features.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__features.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-056: Audit src/cli/commands/finalize.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__finalize.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/finalize.ts` dosyasini satir-satir oku (194 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__finalize.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__finalize.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__finalize.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__finalize.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-057: Audit src/cli/commands/heartbeat.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__heartbeat.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/heartbeat.ts` dosyasini satir-satir oku (85 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__heartbeat.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__heartbeat.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__heartbeat.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__heartbeat.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-058: Audit src/cli/commands/help.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__help.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/help.ts` dosyasini satir-satir oku (142 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__help.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__help.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__help.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__help.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-059: Audit src/cli/commands/history.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__history.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/history.ts` dosyasini satir-satir oku (310 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__history.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__history.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__history.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__history.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-060: Audit src/cli/commands/init-steps.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__init-steps.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/init-steps.ts` dosyasini satir-satir oku (703 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__init-steps.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__init-steps.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__init-steps.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__init-steps.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-061: Audit src/cli/commands/init-templates.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__init-templates.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/init-templates.ts` dosyasini satir-satir oku (635 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__init-templates.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__init-templates.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__init-templates.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__init-templates.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-062: Audit src/cli/commands/init-wizard.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__init-wizard.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/init-wizard.ts` dosyasini satir-satir oku (172 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__init-wizard.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__init-wizard.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__init-wizard.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__init-wizard.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-063: Audit src/cli/commands/init.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__init.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/init.ts` dosyasini satir-satir oku (378 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__init.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__init.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__init.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__init.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-064: Audit src/cli/commands/kill.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__kill.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/kill.ts` dosyasini satir-satir oku (327 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__kill.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__kill.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__kill.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__kill.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-065: Audit src/cli/commands/memory.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__memory.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/memory.ts` dosyasini satir-satir oku (232 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__memory.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__memory.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__memory.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__memory.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-066: Audit src/cli/commands/mode.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__mode.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/mode.ts` dosyasini satir-satir oku (126 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__mode.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__mode.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__mode.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__mode.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-067: Audit src/cli/commands/nervous.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__nervous.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/nervous.ts` dosyasini satir-satir oku (669 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__nervous.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__nervous.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__nervous.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__nervous.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-068: Audit src/cli/commands/onboard.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__onboard.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/onboard.ts` dosyasini satir-satir oku (238 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__onboard.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__onboard.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__onboard.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__onboard.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-069: Audit src/cli/commands/output.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__output.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/output.ts` dosyasini satir-satir oku (140 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__output.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__output.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__output.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__output.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-070: Audit src/cli/commands/plan.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__plan.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/plan.ts` dosyasini satir-satir oku (113 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__plan.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__plan.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__plan.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__plan.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-071: Audit src/cli/commands/plugin.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__plugin.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/plugin.ts` dosyasini satir-satir oku (244 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__plugin.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__plugin.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__plugin.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__plugin.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-072: Audit src/cli/commands/quick-start.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__quick-start.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/quick-start.ts` dosyasini satir-satir oku (85 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__quick-start.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__quick-start.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__quick-start.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__quick-start.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-073: Audit src/cli/commands/recall.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__recall.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/recall.ts` dosyasini satir-satir oku (58 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__recall.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__recall.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__recall.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__recall.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-074: Audit src/cli/commands/recover.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__recover.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/recover.ts` dosyasini satir-satir oku (168 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__recover.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__recover.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__recover.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__recover.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-075: Audit src/cli/commands/remember.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__remember.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/remember.ts` dosyasini satir-satir oku (47 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__remember.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__remember.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__remember.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__remember.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-076: Audit src/cli/commands/resume.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__resume.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/resume.ts` dosyasini satir-satir oku (148 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__resume.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__resume.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__resume.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__resume.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-077: Audit src/cli/commands/retro-formatter.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__retro-formatter.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/retro-formatter.ts` dosyasini satir-satir oku (112 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__retro-formatter.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__retro-formatter.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__retro-formatter.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__retro-formatter.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-078: Audit src/cli/commands/retro-parser.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__retro-parser.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/retro-parser.ts` dosyasini satir-satir oku (214 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__retro-parser.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__retro-parser.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__retro-parser.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__retro-parser.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-079: Audit src/cli/commands/retro.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__retro.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/retro.ts` dosyasini satir-satir oku (454 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__retro.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__retro.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__retro.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__retro.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-080: Audit src/cli/commands/review.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__review.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/review.ts` dosyasini satir-satir oku (312 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__review.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__review.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__review.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__review.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-081: Audit src/cli/commands/run.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__run.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/run.ts` dosyasini satir-satir oku (333 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__run.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__run.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__run.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__run.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-082: Audit src/cli/commands/serve.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__serve.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/serve.ts` dosyasini satir-satir oku (141 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__serve.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__serve.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__serve.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__serve.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-083: Audit src/cli/commands/set-directives.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__set-directives.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/set-directives.ts` dosyasini satir-satir oku (85 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__set-directives.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__set-directives.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__set-directives.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__set-directives.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-084: Audit src/cli/commands/skill-marketplace.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__skill-marketplace.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/skill-marketplace.ts` dosyasini satir-satir oku (272 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__skill-marketplace.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__skill-marketplace.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__skill-marketplace.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__skill-marketplace.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-085: Audit src/cli/commands/skill.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__skill.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/skill.ts` dosyasini satir-satir oku (657 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__skill.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__skill.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__skill.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__skill.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-086: Audit src/cli/commands/spawn.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__spawn.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/spawn.ts` dosyasini satir-satir oku (145 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__spawn.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__spawn.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__spawn.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__spawn.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-087: Audit src/cli/commands/start.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__start.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/start.ts` dosyasini satir-satir oku (450 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__start.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__start.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__start.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__start.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-088: Audit src/cli/commands/status.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__status.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/status.ts` dosyasini satir-satir oku (452 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__status.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__status.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__status.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__status.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-089: Audit src/cli/commands/sync.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__sync.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/sync.ts` dosyasini satir-satir oku (535 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__sync.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__sync.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__sync.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__sync.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-090: Audit src/cli/commands/test-run.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__test-run.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/test-run.ts` dosyasini satir-satir oku (272 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__test-run.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__test-run.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__test-run.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__test-run.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-091: Audit src/cli/commands/upgrade.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__upgrade.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/upgrade.ts` dosyasini satir-satir oku (387 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__upgrade.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__upgrade.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__upgrade.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__upgrade.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-092: Audit src/cli/commands/watch.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__watch.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/watch.ts` dosyasini satir-satir oku (178 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__watch.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__watch.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__watch.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__watch.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-093: Audit src/cli/commands/web.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__commands__web.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/commands/web.ts` dosyasini satir-satir oku (60 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__commands__web.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__commands__web.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__commands__web.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__commands__web.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-094: Audit src/cli/entry.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__entry.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/entry.ts` dosyasini satir-satir oku (41 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__entry.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__entry.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__entry.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__entry.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-095: Audit src/cli/helpers/agent-performance.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__agent-performance.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/agent-performance.ts` dosyasini satir-satir oku (77 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__agent-performance.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__agent-performance.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__agent-performance.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__agent-performance.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-096: Audit src/cli/helpers/agent-templates.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__agent-templates.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/agent-templates.ts` dosyasini satir-satir oku (96 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__agent-templates.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__agent-templates.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__agent-templates.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__agent-templates.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-097: Audit src/cli/helpers/ansi.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__ansi.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/ansi.ts` dosyasini satir-satir oku (30 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__ansi.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__ansi.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__ansi.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__ansi.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-098: Audit src/cli/helpers/change-categorizer.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__change-categorizer.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/change-categorizer.ts` dosyasini satir-satir oku (103 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__change-categorizer.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__change-categorizer.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__change-categorizer.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__change-categorizer.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-099: Audit src/cli/helpers/codex-config.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__codex-config.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/codex-config.ts` dosyasini satir-satir oku (109 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__codex-config.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__codex-config.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__codex-config.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__codex-config.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-100: Audit src/cli/helpers/config-reader.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__config-reader.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/config-reader.ts` dosyasini satir-satir oku (21 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__config-reader.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__config-reader.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__config-reader.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__config-reader.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-101: Audit src/cli/helpers/cursor-config.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__cursor-config.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/cursor-config.ts` dosyasini satir-satir oku (90 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__cursor-config.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__cursor-config.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__cursor-config.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__cursor-config.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-102: Audit src/cli/helpers/dashboard-dir.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__dashboard-dir.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/dashboard-dir.ts` dosyasini satir-satir oku (31 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__dashboard-dir.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__dashboard-dir.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__dashboard-dir.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__dashboard-dir.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-103: Audit src/cli/helpers/debt-counter.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__debt-counter.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/debt-counter.ts` dosyasini satir-satir oku (39 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__debt-counter.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__debt-counter.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__debt-counter.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__debt-counter.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-104: Audit src/cli/helpers/error-handler.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__error-handler.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/error-handler.ts` dosyasini satir-satir oku (85 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__error-handler.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__error-handler.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__error-handler.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__error-handler.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-105: Audit src/cli/helpers/eta-calculator.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__eta-calculator.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/eta-calculator.ts` dosyasini satir-satir oku (62 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__eta-calculator.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__eta-calculator.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__eta-calculator.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__eta-calculator.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-106: Audit src/cli/helpers/gemini-config.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__gemini-config.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/gemini-config.ts` dosyasini satir-satir oku (64 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__gemini-config.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__gemini-config.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__gemini-config.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__gemini-config.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-107: Audit src/cli/helpers/hints.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__hints.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/hints.ts` dosyasini satir-satir oku (59 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__hints.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__hints.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__hints.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__hints.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-108: Audit src/cli/helpers/i18n.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__i18n.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/i18n.ts` dosyasini satir-satir oku (109 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__i18n.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__i18n.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__i18n.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__i18n.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-109: Audit src/cli/helpers/messages.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__messages.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/messages.ts` dosyasini satir-satir oku (359 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__messages.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__messages.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__messages.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__messages.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-110: Audit src/cli/helpers/output-mode.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__output-mode.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/output-mode.ts` dosyasini satir-satir oku (79 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__output-mode.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__output-mode.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__output-mode.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__output-mode.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-111: Audit src/cli/helpers/output.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__output.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/output.ts` dosyasini satir-satir oku (648 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__output.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__output.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__output.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__output.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-112: Audit src/cli/helpers/process.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__process.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/process.ts` dosyasini satir-satir oku (23 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__process.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__process.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__process.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__process.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-113: Audit src/cli/helpers/progress-persistence.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__progress-persistence.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/progress-persistence.ts` dosyasini satir-satir oku (109 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__progress-persistence.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__progress-persistence.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__progress-persistence.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__progress-persistence.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-114: Audit src/cli/helpers/progress.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__progress.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/progress.ts` dosyasini satir-satir oku (75 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__progress.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__progress.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__progress.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__progress.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-115: Audit src/cli/helpers/prompt.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__prompt.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/prompt.ts` dosyasini satir-satir oku (62 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__prompt.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__prompt.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__prompt.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__prompt.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-116: Audit src/cli/helpers/queue-display.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__queue-display.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/queue-display.ts` dosyasini satir-satir oku (54 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__queue-display.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__queue-display.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__queue-display.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__queue-display.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-117: Audit src/cli/helpers/recommendations.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__recommendations.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/recommendations.ts` dosyasini satir-satir oku (97 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__recommendations.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__recommendations.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__recommendations.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__recommendations.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-118: Audit src/cli/helpers/review-actions.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__review-actions.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/review-actions.ts` dosyasini satir-satir oku (107 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__review-actions.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__review-actions.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__review-actions.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__review-actions.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-119: Audit src/cli/helpers/review-summary.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__review-summary.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/review-summary.ts` dosyasini satir-satir oku (127 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__review-summary.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__review-summary.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__review-summary.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__review-summary.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-120: Audit src/cli/helpers/selective-retry.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__selective-retry.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/selective-retry.ts` dosyasini satir-satir oku (91 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__selective-retry.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__selective-retry.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__selective-retry.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__selective-retry.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-121: Audit src/cli/helpers/splash.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__splash.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/splash.ts` dosyasini satir-satir oku (62 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__splash.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__splash.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__splash.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__splash.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-122: Audit src/cli/helpers/sprint-comparison.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__sprint-comparison.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/sprint-comparison.ts` dosyasini satir-satir oku (75 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__sprint-comparison.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__sprint-comparison.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__sprint-comparison.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__sprint-comparison.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-123: Audit src/cli/helpers/sprint-summary-rich.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__sprint-summary-rich.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/sprint-summary-rich.ts` dosyasini satir-satir oku (421 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__sprint-summary-rich.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__sprint-summary-rich.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__sprint-summary-rich.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__sprint-summary-rich.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-124: Audit src/cli/helpers/sprint-summary.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__sprint-summary.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/sprint-summary.ts` dosyasini satir-satir oku (122 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__sprint-summary.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__sprint-summary.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__sprint-summary.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__sprint-summary.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-125: Audit src/cli/helpers/status-renderer.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__status-renderer.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/status-renderer.ts` dosyasini satir-satir oku (380 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__status-renderer.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__status-renderer.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__status-renderer.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__status-renderer.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-126: Audit src/cli/helpers/terminal-utils.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__terminal-utils.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/terminal-utils.ts` dosyasini satir-satir oku (76 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__terminal-utils.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__terminal-utils.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__terminal-utils.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__terminal-utils.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-127: Audit src/cli/helpers/theme.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__theme.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/theme.ts` dosyasini satir-satir oku (94 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__theme.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__theme.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__theme.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__theme.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-128: Audit src/cli/helpers/wizard.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__wizard.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/wizard.ts` dosyasini satir-satir oku (355 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__wizard.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__wizard.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__wizard.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__wizard.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-129: Audit src/cli/helpers/worker-status.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__helpers__worker-status.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/helpers/worker-status.ts` dosyasini satir-satir oku (89 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__helpers__worker-status.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__helpers__worker-status.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__helpers__worker-status.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__helpers__worker-status.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-130: Audit src/cli/index.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__index.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/index.ts` dosyasini satir-satir oku (123 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__index.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__index.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__index.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__index.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-131: Audit src/cli/version-info.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__cli__version-info.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/cli/version-info.ts` dosyasini satir-satir oku (37 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__cli__version-info.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__cli__version-info.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__cli__version-info.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__cli__version-info.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-132: Audit src/connectors/base-connector.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__connectors__base-connector.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/connectors/base-connector.ts` dosyasini satir-satir oku (81 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__connectors__base-connector.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__connectors__base-connector.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__connectors__base-connector.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__connectors__base-connector.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-133: Audit src/connectors/connector-pool.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__connectors__connector-pool.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/connectors/connector-pool.ts` dosyasini satir-satir oku (114 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__connectors__connector-pool.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__connectors__connector-pool.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__connectors__connector-pool.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__connectors__connector-pool.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-134: Audit src/connectors/discord.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__connectors__discord.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/connectors/discord.ts` dosyasini satir-satir oku (75 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__connectors__discord.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__connectors__discord.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__connectors__discord.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__connectors__discord.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-135: Audit src/connectors/incoming-router.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__connectors__incoming-router.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/connectors/incoming-router.ts` dosyasini satir-satir oku (188 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__connectors__incoming-router.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__connectors__incoming-router.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__connectors__incoming-router.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__connectors__incoming-router.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-136: Audit src/connectors/telegram.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__connectors__telegram.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/connectors/telegram.ts` dosyasini satir-satir oku (113 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__connectors__telegram.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__connectors__telegram.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__connectors__telegram.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__connectors__telegram.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-137: Audit src/connectors/types.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__connectors__types.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/connectors/types.ts` dosyasini satir-satir oku (83 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__connectors__types.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__connectors__types.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__connectors__types.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__connectors__types.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-138: Audit src/connectors/whatsapp.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__connectors__whatsapp.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/connectors/whatsapp.ts` dosyasini satir-satir oku (69 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__connectors__whatsapp.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__connectors__whatsapp.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__connectors__whatsapp.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__connectors__whatsapp.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-139: Audit src/core/activation-engine.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__activation-engine.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/activation-engine.ts` dosyasini satir-satir oku (321 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__activation-engine.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__activation-engine.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__activation-engine.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__activation-engine.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-140: Audit src/core/active-workers.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__active-workers.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/active-workers.ts` dosyasini satir-satir oku (91 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__active-workers.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__active-workers.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__active-workers.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__active-workers.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-141: Audit src/core/adr-file-sync.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__adr-file-sync.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/adr-file-sync.ts` dosyasini satir-satir oku (245 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__adr-file-sync.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__adr-file-sync.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__adr-file-sync.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__adr-file-sync.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-142: Audit src/core/adr-seed.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__adr-seed.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/adr-seed.ts` dosyasini satir-satir oku (470 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__adr-seed.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__adr-seed.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__adr-seed.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__adr-seed.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-143: Audit src/core/agent-cache.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__agent-cache.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/agent-cache.ts` dosyasini satir-satir oku (172 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__agent-cache.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__agent-cache.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__agent-cache.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__agent-cache.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-144: Audit src/core/agent-pool.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__agent-pool.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/agent-pool.ts` dosyasini satir-satir oku (589 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__agent-pool.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__agent-pool.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__agent-pool.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__agent-pool.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-145: Audit src/core/agent-selector.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__agent-selector.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/agent-selector.ts` dosyasini satir-satir oku (198 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__agent-selector.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__agent-selector.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__agent-selector.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__agent-selector.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-146: Audit src/core/agent-types.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__agent-types.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/agent-types.ts` dosyasini satir-satir oku (97 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__agent-types.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__agent-types.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__agent-types.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__agent-types.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-147: Audit src/core/analyzer.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__analyzer.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/analyzer.ts` dosyasini satir-satir oku (345 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__analyzer.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__analyzer.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__analyzer.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__analyzer.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-148: Audit src/core/anthropic-http-client.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__anthropic-http-client.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/anthropic-http-client.ts` dosyasini satir-satir oku (337 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__anthropic-http-client.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__anthropic-http-client.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__anthropic-http-client.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__anthropic-http-client.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-149: Audit src/core/cascade-detector.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__cascade-detector.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/cascade-detector.ts` dosyasini satir-satir oku (171 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__cascade-detector.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__cascade-detector.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__cascade-detector.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__cascade-detector.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-150: Audit src/core/ci-learning.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__ci-learning.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/ci-learning.ts` dosyasini satir-satir oku (461 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__ci-learning.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__ci-learning.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__ci-learning.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__ci-learning.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-151: Audit src/core/condition-evaluator.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__condition-evaluator.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/condition-evaluator.ts` dosyasini satir-satir oku (161 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__condition-evaluator.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__condition-evaluator.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__condition-evaluator.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__condition-evaluator.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-152: Audit src/core/config-migration.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__config-migration.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/config-migration.ts` dosyasini satir-satir oku (637 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__config-migration.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__config-migration.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__config-migration.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__config-migration.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-153: Audit src/core/config-types.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__config-types.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/config-types.ts` dosyasini satir-satir oku (697 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__config-types.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__config-types.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__config-types.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__config-types.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-154: Audit src/core/config-validator.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__config-validator.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/config-validator.ts` dosyasini satir-satir oku (7 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__config-validator.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__config-validator.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__config-validator.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__config-validator.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-155: Audit src/core/config.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__config.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/config.ts` dosyasini satir-satir oku (1704 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__config.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__config.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__config.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__config.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-156: Audit src/core/constants.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__constants.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/constants.ts` dosyasini satir-satir oku (130 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__constants.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__constants.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__constants.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__constants.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-157: Audit src/core/cost-calculator.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__cost-calculator.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/cost-calculator.ts` dosyasini satir-satir oku (477 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__cost-calculator.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__cost-calculator.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__cost-calculator.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__cost-calculator.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-158: Audit src/core/cost-config-loader.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__cost-config-loader.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/cost-config-loader.ts` dosyasini satir-satir oku (373 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__cost-config-loader.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__cost-config-loader.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__cost-config-loader.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__cost-config-loader.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-159: Audit src/core/credential-encryption.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__credential-encryption.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/credential-encryption.ts` dosyasini satir-satir oku (140 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__credential-encryption.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__credential-encryption.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__credential-encryption.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__credential-encryption.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-160: Audit src/core/credentials.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__credentials.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/credentials.ts` dosyasini satir-satir oku (266 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__credentials.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__credentials.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__credentials.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__credentials.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-161: Audit src/core/debug-log.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__debug-log.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/debug-log.ts` dosyasini satir-satir oku (67 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__debug-log.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__debug-log.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__debug-log.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__debug-log.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-162: Audit src/core/decision-config.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__decision-config.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/decision-config.ts` dosyasini satir-satir oku (195 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__decision-config.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__decision-config.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__decision-config.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__decision-config.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-163: Audit src/core/decision-types.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__decision-types.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/decision-types.ts` dosyasini satir-satir oku (95 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__decision-types.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__decision-types.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__decision-types.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__decision-types.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-164: Audit src/core/deck-file.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__deck-file.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/deck-file.ts` dosyasini satir-satir oku (199 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__deck-file.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__deck-file.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__deck-file.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__deck-file.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-165: Audit src/core/deck-interpolation.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__deck-interpolation.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/deck-interpolation.ts` dosyasini satir-satir oku (39 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__deck-interpolation.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__deck-interpolation.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__deck-interpolation.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__deck-interpolation.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-166: Audit src/core/environment.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__environment.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/environment.ts` dosyasini satir-satir oku (53 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__environment.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__environment.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__environment.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__environment.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-167: Audit src/core/errors.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__errors.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/errors.ts` dosyasini satir-satir oku (624 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__errors.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__errors.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__errors.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__errors.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-168: Audit src/core/file-lock.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__file-lock.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/file-lock.ts` dosyasini satir-satir oku (633 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__file-lock.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__file-lock.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__file-lock.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__file-lock.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-169: Audit src/core/global-config.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__global-config.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/global-config.ts` dosyasini satir-satir oku (74 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__global-config.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__global-config.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__global-config.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__global-config.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-170: Audit src/core/heartbeat-types.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__heartbeat-types.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/heartbeat-types.ts` dosyasini satir-satir oku (39 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__heartbeat-types.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__heartbeat-types.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__heartbeat-types.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__heartbeat-types.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-171: Audit src/core/identity-generator.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__identity-generator.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/identity-generator.ts` dosyasini satir-satir oku (447 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__identity-generator.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__identity-generator.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__identity-generator.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__identity-generator.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-172: Audit src/core/index.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__index.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/index.ts` dosyasini satir-satir oku (37 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__index.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__index.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__index.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__index.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-173: Audit src/core/intent-classifier.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__intent-classifier.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/intent-classifier.ts` dosyasini satir-satir oku (467 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__intent-classifier.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__intent-classifier.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__intent-classifier.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__intent-classifier.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-174: Audit src/core/lazy-loader.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__lazy-loader.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/lazy-loader.ts` dosyasini satir-satir oku (146 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__lazy-loader.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__lazy-loader.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__lazy-loader.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__lazy-loader.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-175: Audit src/core/manifest-migrator.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__manifest-migrator.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/manifest-migrator.ts` dosyasini satir-satir oku (64 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__manifest-migrator.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__manifest-migrator.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__manifest-migrator.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__manifest-migrator.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-176: Audit src/core/marketplace/dependency-resolver.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__marketplace__dependency-resolver.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/marketplace/dependency-resolver.ts` dosyasini satir-satir oku (272 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__marketplace__dependency-resolver.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__marketplace__dependency-resolver.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__marketplace__dependency-resolver.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__marketplace__dependency-resolver.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-177: Audit src/core/marketplace/marketplace-auth.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__marketplace__marketplace-auth.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/marketplace/marketplace-auth.ts` dosyasini satir-satir oku (151 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__marketplace__marketplace-auth.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__marketplace__marketplace-auth.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__marketplace__marketplace-auth.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__marketplace__marketplace-auth.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-178: Audit src/core/marketplace/rating-system.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__marketplace__rating-system.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/marketplace/rating-system.ts` dosyasini satir-satir oku (201 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__marketplace__rating-system.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__marketplace__rating-system.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__marketplace__rating-system.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__marketplace__rating-system.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-179: Audit src/core/marketplace/registry-client.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__marketplace__registry-client.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/marketplace/registry-client.ts` dosyasini satir-satir oku (196 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__marketplace__registry-client.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__marketplace__registry-client.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__marketplace__registry-client.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__marketplace__registry-client.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-180: Audit src/core/marketplace/skill-sandbox.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__marketplace__skill-sandbox.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/marketplace/skill-sandbox.ts` dosyasini satir-satir oku (391 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__marketplace__skill-sandbox.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__marketplace__skill-sandbox.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__marketplace__skill-sandbox.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__marketplace__skill-sandbox.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-181: Audit src/core/memory-export.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__memory-export.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/memory-export.ts` dosyasini satir-satir oku (365 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__memory-export.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__memory-export.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__memory-export.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__memory-export.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-182: Audit src/core/memory-import.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__memory-import.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/memory-import.ts` dosyasini satir-satir oku (531 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__memory-import.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__memory-import.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__memory-import.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__memory-import.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-183: Audit src/core/memory-normalize.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__memory-normalize.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/memory-normalize.ts` dosyasini satir-satir oku (39 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__memory-normalize.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__memory-normalize.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__memory-normalize.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__memory-normalize.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-184: Audit src/core/memory-query.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__memory-query.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/memory-query.ts` dosyasini satir-satir oku (416 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__memory-query.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__memory-query.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__memory-query.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__memory-query.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-185: Audit src/core/memory-store.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__memory-store.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/memory-store.ts` dosyasini satir-satir oku (960 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__memory-store.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__memory-store.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__memory-store.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__memory-store.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-186: Audit src/core/memory-types.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__memory-types.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/memory-types.ts` dosyasini satir-satir oku (226 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__memory-types.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__memory-types.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__memory-types.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__memory-types.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-187: Audit src/core/mode-presets.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__mode-presets.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/mode-presets.ts` dosyasini satir-satir oku (113 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__mode-presets.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__mode-presets.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__mode-presets.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__mode-presets.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-188: Audit src/core/model-equivalence.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__model-equivalence.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/model-equivalence.ts` dosyasini satir-satir oku (149 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__model-equivalence.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__model-equivalence.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__model-equivalence.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__model-equivalence.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-189: Audit src/core/model-registry.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__model-registry.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/model-registry.ts` dosyasini satir-satir oku (316 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__model-registry.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__model-registry.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__model-registry.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__model-registry.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-190: Audit src/core/monitoring-types.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__monitoring-types.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/monitoring-types.ts` dosyasini satir-satir oku (124 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__monitoring-types.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__monitoring-types.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__monitoring-types.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__monitoring-types.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-191: Audit src/core/multi-ide.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__multi-ide.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/multi-ide.ts` dosyasini satir-satir oku (169 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__multi-ide.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__multi-ide.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__multi-ide.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__multi-ide.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-192: Audit src/core/nervous-types.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__nervous-types.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/nervous-types.ts` dosyasini satir-satir oku (332 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__nervous-types.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__nervous-types.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__nervous-types.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__nervous-types.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-193: Audit src/core/notification-config.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__notification-config.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/notification-config.ts` dosyasini satir-satir oku (96 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__notification-config.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__notification-config.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__notification-config.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__notification-config.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-194: Audit src/core/notification-dispatcher.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__notification-dispatcher.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/notification-dispatcher.ts` dosyasini satir-satir oku (200 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__notification-dispatcher.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__notification-dispatcher.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__notification-dispatcher.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__notification-dispatcher.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-195: Audit src/core/notification-providers/discord.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__notification-providers__discord.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/notification-providers/discord.ts` dosyasini satir-satir oku (111 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__notification-providers__discord.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__notification-providers__discord.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__notification-providers__discord.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__notification-providers__discord.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-196: Audit src/core/notification-providers/slack.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__notification-providers__slack.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/notification-providers/slack.ts` dosyasini satir-satir oku (96 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__notification-providers__slack.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__notification-providers__slack.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__notification-providers__slack.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__notification-providers__slack.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-197: Audit src/core/notification-providers/webhook.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__notification-providers__webhook.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/notification-providers/webhook.ts` dosyasini satir-satir oku (91 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__notification-providers__webhook.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__notification-providers__webhook.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__notification-providers__webhook.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__notification-providers__webhook.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-198: Audit src/core/notifications.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__notifications.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/notifications.ts` dosyasini satir-satir oku (119 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__notifications.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__notifications.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__notifications.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__notifications.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-199: Audit src/core/notify-adapters/cli-adapter.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__notify-adapters__cli-adapter.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/notify-adapters/cli-adapter.ts` dosyasini satir-satir oku (80 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__notify-adapters__cli-adapter.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__notify-adapters__cli-adapter.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__notify-adapters__cli-adapter.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__notify-adapters__cli-adapter.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-200: Audit src/core/notify-adapters/file-adapter.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__notify-adapters__file-adapter.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/notify-adapters/file-adapter.ts` dosyasini satir-satir oku (42 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__notify-adapters__file-adapter.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__notify-adapters__file-adapter.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__notify-adapters__file-adapter.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__notify-adapters__file-adapter.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-201: Audit src/core/notify-adapters/mcp-adapter.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__notify-adapters__mcp-adapter.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/notify-adapters/mcp-adapter.ts` dosyasini satir-satir oku (85 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__notify-adapters__mcp-adapter.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__notify-adapters__mcp-adapter.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__notify-adapters__mcp-adapter.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__notify-adapters__mcp-adapter.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-202: Audit src/core/notify-registry.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__notify-registry.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/notify-registry.ts` dosyasini satir-satir oku (43 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__notify-registry.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__notify-registry.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__notify-registry.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__notify-registry.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-203: Audit src/core/notify.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__notify.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/notify.ts` dosyasini satir-satir oku (103 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__notify.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__notify.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__notify.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__notify.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-204: Audit src/core/observability-rotation.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__observability-rotation.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/observability-rotation.ts` dosyasini satir-satir oku (171 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__observability-rotation.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__observability-rotation.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__observability-rotation.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__observability-rotation.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-205: Audit src/core/observability.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__observability.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/observability.ts` dosyasini satir-satir oku (480 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__observability.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__observability.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__observability.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__observability.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-206: Audit src/core/orphan-cleaner.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__orphan-cleaner.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/orphan-cleaner.ts` dosyasini satir-satir oku (432 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__orphan-cleaner.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__orphan-cleaner.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__orphan-cleaner.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__orphan-cleaner.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-207: Audit src/core/output-collector.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__output-collector.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/output-collector.ts` dosyasini satir-satir oku (460 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__output-collector.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__output-collector.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__output-collector.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__output-collector.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-208: Audit src/core/output-formatter.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__output-formatter.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/output-formatter.ts` dosyasini satir-satir oku (235 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__output-formatter.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__output-formatter.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__output-formatter.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__output-formatter.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-209: Audit src/core/panic-guard.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__panic-guard.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/panic-guard.ts` dosyasini satir-satir oku (142 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__panic-guard.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__panic-guard.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__panic-guard.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__panic-guard.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-210: Audit src/core/pid-liveness.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__pid-liveness.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/pid-liveness.ts` dosyasini satir-satir oku (32 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__pid-liveness.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__pid-liveness.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__pid-liveness.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__pid-liveness.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-211: Audit src/core/plugin-hooks.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__plugin-hooks.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/plugin-hooks.ts` dosyasini satir-satir oku (834 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__plugin-hooks.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__plugin-hooks.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__plugin-hooks.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__plugin-hooks.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-212: Audit src/core/plugin-loader.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__plugin-loader.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/plugin-loader.ts` dosyasini satir-satir oku (162 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__plugin-loader.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__plugin-loader.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__plugin-loader.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__plugin-loader.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-213: Audit src/core/plugin.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__plugin.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/plugin.ts` dosyasini satir-satir oku (489 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__plugin.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__plugin.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__plugin.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__plugin.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-214: Audit src/core/pricing-updater.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__pricing-updater.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/pricing-updater.ts` dosyasini satir-satir oku (530 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__pricing-updater.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__pricing-updater.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__pricing-updater.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__pricing-updater.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-215: Audit src/core/provider-capabilities.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__provider-capabilities.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/provider-capabilities.ts` dosyasini satir-satir oku (157 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__provider-capabilities.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__provider-capabilities.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__provider-capabilities.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__provider-capabilities.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-216: Audit src/core/provider.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__provider.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/provider.ts` dosyasini satir-satir oku (625 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__provider.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__provider.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__provider.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__provider.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-217: Audit src/core/provisioner.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__provisioner.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/provisioner.ts` dosyasini satir-satir oku (230 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__provisioner.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__provisioner.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__provisioner.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__provisioner.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-218: Audit src/core/redact-sensitive.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__redact-sensitive.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/redact-sensitive.ts` dosyasini satir-satir oku (40 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__redact-sensitive.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__redact-sensitive.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__redact-sensitive.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__redact-sensitive.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-219: Audit src/core/routing-engine.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__routing-engine.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/routing-engine.ts` dosyasini satir-satir oku (687 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__routing-engine.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__routing-engine.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__routing-engine.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__routing-engine.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-220: Audit src/core/routing-types.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__routing-types.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/routing-types.ts` dosyasini satir-satir oku (228 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__routing-types.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__routing-types.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__routing-types.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__routing-types.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-221: Audit src/core/rule-generator.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__rule-generator.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/rule-generator.ts` dosyasini satir-satir oku (418 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__rule-generator.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__rule-generator.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__rule-generator.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__rule-generator.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-222: Audit src/core/session-interface.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__session-interface.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/session-interface.ts` dosyasini satir-satir oku (177 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__session-interface.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__session-interface.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__session-interface.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__session-interface.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-223: Audit src/core/signature.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__signature.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/signature.ts` dosyasini satir-satir oku (84 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__signature.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__signature.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__signature.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__signature.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-224: Audit src/core/skill-cache.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__skill-cache.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/skill-cache.ts` dosyasini satir-satir oku (197 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__skill-cache.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__skill-cache.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__skill-cache.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__skill-cache.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-225: Audit src/core/skill-pool.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__skill-pool.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/skill-pool.ts` dosyasini satir-satir oku (307 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__skill-pool.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__skill-pool.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__skill-pool.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__skill-pool.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-226: Audit src/core/skill-registry.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__skill-registry.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/skill-registry.ts` dosyasini satir-satir oku (135 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__skill-registry.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__skill-registry.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__skill-registry.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__skill-registry.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-227: Audit src/core/skill-selector.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__skill-selector.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/skill-selector.ts` dosyasini satir-satir oku (200 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__skill-selector.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__skill-selector.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__skill-selector.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__skill-selector.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-228: Audit src/core/skill-types.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__skill-types.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/skill-types.ts` dosyasini satir-satir oku (115 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__skill-types.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__skill-types.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__skill-types.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__skill-types.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-229: Audit src/core/spawn-safety.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__spawn-safety.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/spawn-safety.ts` dosyasini satir-satir oku (169 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__spawn-safety.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__spawn-safety.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__spawn-safety.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__spawn-safety.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-230: Audit src/core/sprint-file-retention.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__sprint-file-retention.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/sprint-file-retention.ts` dosyasini satir-satir oku (355 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__sprint-file-retention.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__sprint-file-retention.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__sprint-file-retention.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__sprint-file-retention.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-231: Audit src/core/sprint-types.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__sprint-types.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/sprint-types.ts` dosyasini satir-satir oku (167 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__sprint-types.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__sprint-types.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__sprint-types.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__sprint-types.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-232: Audit src/core/stack-detector.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__stack-detector.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/stack-detector.ts` dosyasini satir-satir oku (737 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__stack-detector.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__stack-detector.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__stack-detector.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__stack-detector.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-233: Audit src/core/subscription.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__subscription.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/subscription.ts` dosyasini satir-satir oku (155 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__subscription.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__subscription.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__subscription.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__subscription.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-234: Audit src/core/system-capacity.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__system-capacity.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/system-capacity.ts` dosyasini satir-satir oku (93 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__system-capacity.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__system-capacity.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__system-capacity.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__system-capacity.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-235: Audit src/core/system-profile.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__system-profile.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/system-profile.ts` dosyasini satir-satir oku (31 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__system-profile.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__system-profile.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__system-profile.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__system-profile.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-236: Audit src/core/task-types.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__task-types.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/task-types.ts` dosyasini satir-satir oku (368 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__task-types.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__task-types.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__task-types.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__task-types.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-237: Audit src/core/telemetry.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__telemetry.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/telemetry.ts` dosyasini satir-satir oku (67 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__telemetry.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__telemetry.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__telemetry.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__telemetry.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-238: Audit src/core/token-counter.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__token-counter.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/token-counter.ts` dosyasini satir-satir oku (204 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__token-counter.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__token-counter.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__token-counter.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__token-counter.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-239: Audit src/core/types.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__types.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/types.ts` dosyasini satir-satir oku (14 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__types.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__types.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__types.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__types.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-240: Audit src/core/utils.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__utils.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/utils.ts` dosyasini satir-satir oku (341 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__utils.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__utils.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__utils.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__utils.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-241: Audit src/core/validators.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__core__validators.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/core/validators.ts` dosyasini satir-satir oku (123 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__core__validators.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__core__validators.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__core__validators.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__core__validators.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-242: Audit src/dashboard/analytics/agent-comparison-data.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__analytics__agent-comparison-data.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/analytics/agent-comparison-data.ts` dosyasini satir-satir oku (121 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__analytics__agent-comparison-data.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__analytics__agent-comparison-data.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__analytics__agent-comparison-data.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__analytics__agent-comparison-data.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-243: Audit src/dashboard/analytics/analytics-data.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__analytics__analytics-data.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/analytics/analytics-data.ts` dosyasini satir-satir oku (166 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__analytics__analytics-data.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__analytics__analytics-data.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__analytics__analytics-data.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__analytics__analytics-data.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-244: Audit src/dashboard/analytics/skill-heatmap-data.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__analytics__skill-heatmap-data.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/analytics/skill-heatmap-data.ts` dosyasini satir-satir oku (147 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__analytics__skill-heatmap-data.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__analytics__skill-heatmap-data.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__analytics__skill-heatmap-data.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__analytics__skill-heatmap-data.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-245: Audit src/dashboard/analytics/success-chart-data.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__analytics__success-chart-data.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/analytics/success-chart-data.ts` dosyasini satir-satir oku (113 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__analytics__success-chart-data.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__analytics__success-chart-data.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__analytics__success-chart-data.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__analytics__success-chart-data.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-246: Audit src/dashboard/api/output-stream.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__api__output-stream.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/api/output-stream.ts` dosyasini satir-satir oku (266 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__api__output-stream.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__api__output-stream.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__api__output-stream.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__api__output-stream.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-247: Audit src/dashboard/src/App.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__App.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/App.tsx` dosyasini satir-satir oku (34 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__App.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__App.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__App.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__App.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-248: Audit src/dashboard/src/components/ActivityFeed.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__ActivityFeed.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/ActivityFeed.tsx` dosyasini satir-satir oku (199 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__ActivityFeed.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__ActivityFeed.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__ActivityFeed.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__ActivityFeed.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-249: Audit src/dashboard/src/components/AgentDetail.tsx
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__AgentDetail.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/AgentDetail.tsx` dosyasini satir-satir oku (234 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__AgentDetail.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__AgentDetail.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__AgentDetail.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__AgentDetail.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-250: Audit src/dashboard/src/components/DebtTable.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__DebtTable.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/DebtTable.tsx` dosyasini satir-satir oku (92 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__DebtTable.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__DebtTable.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__DebtTable.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__DebtTable.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-251: Audit src/dashboard/src/components/DockPanel.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__DockPanel.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/DockPanel.tsx` dosyasini satir-satir oku (68 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__DockPanel.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__DockPanel.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__DockPanel.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__DockPanel.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-252: Audit src/dashboard/src/components/EmptyState.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__EmptyState.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/EmptyState.tsx` dosyasini satir-satir oku (34 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__EmptyState.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__EmptyState.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__EmptyState.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__EmptyState.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-253: Audit src/dashboard/src/components/Layout.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__Layout.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/Layout.tsx` dosyasini satir-satir oku (164 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__Layout.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__Layout.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__Layout.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__Layout.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-254: Audit src/dashboard/src/components/NewSprintModal.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__NewSprintModal.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/NewSprintModal.tsx` dosyasini satir-satir oku (171 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__NewSprintModal.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__NewSprintModal.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__NewSprintModal.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__NewSprintModal.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-255: Audit src/dashboard/src/components/SimpleMarkdown.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__SimpleMarkdown.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/SimpleMarkdown.tsx` dosyasini satir-satir oku (99 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__SimpleMarkdown.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__SimpleMarkdown.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__SimpleMarkdown.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__SimpleMarkdown.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-256: Audit src/dashboard/src/components/Skeleton.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__Skeleton.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/Skeleton.tsx` dosyasini satir-satir oku (78 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__Skeleton.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__Skeleton.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__Skeleton.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__Skeleton.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-257: Audit src/dashboard/src/components/SprintChart.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__SprintChart.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/SprintChart.tsx` dosyasini satir-satir oku (124 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__SprintChart.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__SprintChart.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__SprintChart.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__SprintChart.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-258: Audit src/dashboard/src/components/SprintPhaseTimeline.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__SprintPhaseTimeline.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/SprintPhaseTimeline.tsx` dosyasini satir-satir oku (96 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__SprintPhaseTimeline.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__SprintPhaseTimeline.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__SprintPhaseTimeline.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__SprintPhaseTimeline.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-259: Audit src/dashboard/src/components/SprintSummary.tsx
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__SprintSummary.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/SprintSummary.tsx` dosyasini satir-satir oku (404 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__SprintSummary.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__SprintSummary.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__SprintSummary.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__SprintSummary.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-260: Audit src/dashboard/src/components/TaskCard.tsx
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__TaskCard.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/TaskCard.tsx` dosyasini satir-satir oku (380 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__TaskCard.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__TaskCard.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__TaskCard.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__TaskCard.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-261: Audit src/dashboard/src/components/ThemeProvider.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__ThemeProvider.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/ThemeProvider.tsx` dosyasini satir-satir oku (34 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__ThemeProvider.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__ThemeProvider.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__ThemeProvider.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__ThemeProvider.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-262: Audit src/dashboard/src/components/WorkerCard.tsx
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__WorkerCard.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/WorkerCard.tsx` dosyasini satir-satir oku (209 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__WorkerCard.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__WorkerCard.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__WorkerCard.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__WorkerCard.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-263: Audit src/dashboard/src/components/terminal/TerminalPanel.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__terminal__TerminalPanel.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/terminal/TerminalPanel.tsx` dosyasini satir-satir oku (64 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__terminal__TerminalPanel.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__terminal__TerminalPanel.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__terminal__TerminalPanel.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__terminal__TerminalPanel.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-264: Audit src/dashboard/src/components/terminal/TerminalTabs.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__terminal__TerminalTabs.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/terminal/TerminalTabs.tsx` dosyasini satir-satir oku (55 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__terminal__TerminalTabs.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__terminal__TerminalTabs.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__terminal__TerminalTabs.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__terminal__TerminalTabs.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-265: Audit src/dashboard/src/components/terminal/TerminalView.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__terminal__TerminalView.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/terminal/TerminalView.tsx` dosyasini satir-satir oku (46 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__terminal__TerminalView.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__terminal__TerminalView.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__terminal__TerminalView.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__terminal__TerminalView.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-266: Audit src/dashboard/src/components/terminal/useTerminalSocket.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__terminal__useTerminalSocket.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/terminal/useTerminalSocket.ts` dosyasini satir-satir oku (66 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__terminal__useTerminalSocket.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__terminal__useTerminalSocket.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__terminal__useTerminalSocket.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__terminal__useTerminalSocket.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-267: Audit src/dashboard/src/components/ui/badge.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__badge.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/ui/badge.tsx` dosyasini satir-satir oku (37 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__badge.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__badge.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__badge.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__badge.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-268: Audit src/dashboard/src/components/ui/button.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__button.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/ui/button.tsx` dosyasini satir-satir oku (49 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__button.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__button.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__button.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__button.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-269: Audit src/dashboard/src/components/ui/card.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__card.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/ui/card.tsx` dosyasini satir-satir oku (44 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__card.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__card.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__card.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__card.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-270: Audit src/dashboard/src/components/ui/dialog.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__dialog.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/ui/dialog.tsx` dosyasini satir-satir oku (183 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__dialog.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__dialog.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__dialog.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__dialog.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-271: Audit src/dashboard/src/components/ui/input.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__input.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/ui/input.tsx` dosyasini satir-satir oku (24 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__input.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__input.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__input.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__input.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-272: Audit src/dashboard/src/components/ui/label.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__label.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/ui/label.tsx` dosyasini satir-satir oku (23 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__label.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__label.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__label.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__label.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-273: Audit src/dashboard/src/components/ui/progress.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__progress.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/ui/progress.tsx` dosyasini satir-satir oku (42 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__progress.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__progress.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__progress.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__progress.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-274: Audit src/dashboard/src/components/ui/scroll-area.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__scroll-area.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/ui/scroll-area.tsx` dosyasini satir-satir oku (18 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__scroll-area.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__scroll-area.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__scroll-area.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__scroll-area.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-275: Audit src/dashboard/src/components/ui/select.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__select.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/ui/select.tsx` dosyasini satir-satir oku (25 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__select.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__select.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__select.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__select.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-276: Audit src/dashboard/src/components/ui/separator.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__separator.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/ui/separator.tsx` dosyasini satir-satir oku (28 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__separator.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__separator.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__separator.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__separator.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-277: Audit src/dashboard/src/components/ui/sheet.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__sheet.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/ui/sheet.tsx` dosyasini satir-satir oku (126 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__sheet.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__sheet.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__sheet.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__sheet.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-278: Audit src/dashboard/src/components/ui/table.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__table.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/ui/table.tsx` dosyasini satir-satir oku (80 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__table.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__table.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__table.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__table.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-279: Audit src/dashboard/src/components/ui/tabs.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__tabs.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/ui/tabs.tsx` dosyasini satir-satir oku (124 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__tabs.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__tabs.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__tabs.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__tabs.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-280: Audit src/dashboard/src/components/ui/textarea.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__textarea.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/components/ui/textarea.tsx` dosyasini satir-satir oku (24 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__textarea.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__textarea.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__textarea.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__components__ui__textarea.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-281: Audit src/dashboard/src/hooks/useApi.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__hooks__useApi.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/hooks/useApi.ts` dosyasini satir-satir oku (33 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__hooks__useApi.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__hooks__useApi.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__hooks__useApi.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__hooks__useApi.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-282: Audit src/dashboard/src/hooks/useSSE.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__hooks__useSSE.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/hooks/useSSE.ts` dosyasini satir-satir oku (58 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__hooks__useSSE.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__hooks__useSSE.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__hooks__useSSE.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__hooks__useSSE.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-283: Audit src/dashboard/src/i18n/LanguageProvider.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__i18n__LanguageProvider.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/i18n/LanguageProvider.tsx` dosyasini satir-satir oku (68 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__i18n__LanguageProvider.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__i18n__LanguageProvider.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__i18n__LanguageProvider.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__i18n__LanguageProvider.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-284: Audit src/dashboard/src/i18n/en.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__i18n__en.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/i18n/en.ts` dosyasini satir-satir oku (417 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__i18n__en.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__i18n__en.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__i18n__en.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__i18n__en.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-285: Audit src/dashboard/src/i18n/tr.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__i18n__tr.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/i18n/tr.ts` dosyasini satir-satir oku (417 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__i18n__tr.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__i18n__tr.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__i18n__tr.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__i18n__tr.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-286: Audit src/dashboard/src/i18n/types.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__i18n__types.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/i18n/types.ts` dosyasini satir-satir oku (24 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__i18n__types.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__i18n__types.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__i18n__types.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__i18n__types.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-287: Audit src/dashboard/src/lib/api.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__lib__api.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/lib/api.ts` dosyasini satir-satir oku (30 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__lib__api.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__lib__api.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__lib__api.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__lib__api.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-288: Audit src/dashboard/src/lib/terminal-api.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__lib__terminal-api.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/lib/terminal-api.ts` dosyasini satir-satir oku (60 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__lib__terminal-api.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__lib__terminal-api.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__lib__terminal-api.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__lib__terminal-api.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-289: Audit src/dashboard/src/lib/utils.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__lib__utils.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/lib/utils.ts` dosyasini satir-satir oku (7 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__lib__utils.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__lib__utils.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__lib__utils.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__lib__utils.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-290: Audit src/dashboard/src/main.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__main.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/main.tsx` dosyasini satir-satir oku (11 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__main.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__main.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__main.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__main.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-291: Audit src/dashboard/src/pages/ChatPage.tsx
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__pages__ChatPage.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/pages/ChatPage.tsx` dosyasini satir-satir oku (319 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__pages__ChatPage.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__pages__ChatPage.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__pages__ChatPage.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__pages__ChatPage.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-292: Audit src/dashboard/src/pages/ConfigPage.tsx
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__pages__ConfigPage.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/pages/ConfigPage.tsx` dosyasini satir-satir oku (519 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__pages__ConfigPage.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__pages__ConfigPage.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__pages__ConfigPage.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__pages__ConfigPage.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-293: Audit src/dashboard/src/pages/DashboardPage.tsx
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__pages__DashboardPage.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/pages/DashboardPage.tsx` dosyasini satir-satir oku (400 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__pages__DashboardPage.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__pages__DashboardPage.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__pages__DashboardPage.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__pages__DashboardPage.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-294: Audit src/dashboard/src/pages/HistoryPage.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__pages__HistoryPage.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/pages/HistoryPage.tsx` dosyasini satir-satir oku (165 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__pages__HistoryPage.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__pages__HistoryPage.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__pages__HistoryPage.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__pages__HistoryPage.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-295: Audit src/dashboard/src/pages/MemoryPage.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__pages__MemoryPage.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/pages/MemoryPage.tsx` dosyasini satir-satir oku (81 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__pages__MemoryPage.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__pages__MemoryPage.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__pages__MemoryPage.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__pages__MemoryPage.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-296: Audit src/dashboard/src/pages/SettingsPage.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__pages__SettingsPage.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/pages/SettingsPage.tsx` dosyasini satir-satir oku (6 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__pages__SettingsPage.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__pages__SettingsPage.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__pages__SettingsPage.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__pages__SettingsPage.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-297: Audit src/dashboard/src/pages/StatusPage.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__pages__StatusPage.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/pages/StatusPage.tsx` dosyasini satir-satir oku (69 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__pages__StatusPage.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__pages__StatusPage.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__pages__StatusPage.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__pages__StatusPage.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-298: Audit src/dashboard/src/routes.tsx
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__routes.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/routes.tsx` dosyasini satir-satir oku (14 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__routes.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__routes.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__routes.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__routes.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-299: Audit src/dashboard/src/types/index.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__src__types__index.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/src/types/index.ts` dosyasini satir-satir oku (99 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__src__types__index.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__src__types__index.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__src__types__index.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__src__types__index.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-300: Audit src/dashboard/vite.config.d.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__vite.config.d.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/vite.config.d.ts` dosyasini satir-satir oku (3 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__vite.config.d.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__vite.config.d.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__vite.config.d.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__vite.config.d.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-301: Audit src/dashboard/vite.config.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__vite.config.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/vite.config.ts` dosyasini satir-satir oku (17 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__vite.config.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__vite.config.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__vite.config.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__vite.config.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-302: Audit src/dashboard/vitest.config.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__dashboard__vitest.config.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/dashboard/vitest.config.ts` dosyasini satir-satir oku (17 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__dashboard__vitest.config.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__dashboard__vitest.config.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__dashboard__vitest.config.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__dashboard__vitest.config.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-303: Audit src/extensions/vscode/extension.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__extensions__vscode__extension.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/extensions/vscode/extension.ts` dosyasini satir-satir oku (90 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__extensions__vscode__extension.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__extensions__vscode__extension.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__extensions__vscode__extension.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__extensions__vscode__extension.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-304: Audit src/index.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__index.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/index.ts` dosyasini satir-satir oku (5 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__index.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__index.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__index.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__index.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-305: Audit src/mcp/helpers/enrich.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__helpers__enrich.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/helpers/enrich.ts` dosyasini satir-satir oku (99 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__helpers__enrich.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__helpers__enrich.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__helpers__enrich.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__helpers__enrich.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-306: Audit src/mcp/helpers/format.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__helpers__format.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/helpers/format.ts` dosyasini satir-satir oku (324 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__helpers__format.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__helpers__format.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__helpers__format.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__helpers__format.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-307: Audit src/mcp/helpers/index.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__helpers__index.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/helpers/index.ts` dosyasini satir-satir oku (23 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__helpers__index.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__helpers__index.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__helpers__index.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__helpers__index.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-308: Audit src/mcp/resources/agents.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__resources__agents.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/resources/agents.ts` dosyasini satir-satir oku (47 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__resources__agents.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__resources__agents.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__resources__agents.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__resources__agents.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-309: Audit src/mcp/resources/config.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__resources__config.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/resources/config.ts` dosyasini satir-satir oku (37 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__resources__config.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__resources__config.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__resources__config.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__resources__config.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-310: Audit src/mcp/resources/dashboard.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__resources__dashboard.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/resources/dashboard.ts` dosyasini satir-satir oku (33 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__resources__dashboard.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__resources__dashboard.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__resources__dashboard.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__resources__dashboard.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-311: Audit src/mcp/resources/debt.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__resources__debt.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/resources/debt.ts` dosyasini satir-satir oku (51 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__resources__debt.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__resources__debt.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__resources__debt.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__resources__debt.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-312: Audit src/mcp/resources/directives.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__resources__directives.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/resources/directives.ts` dosyasini satir-satir oku (27 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__resources__directives.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__resources__directives.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__resources__directives.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__resources__directives.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-313: Audit src/mcp/resources/index.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__resources__index.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/resources/index.ts` dosyasini satir-satir oku (21 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__resources__index.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__resources__index.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__resources__index.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__resources__index.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-314: Audit src/mcp/resources/memory.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__resources__memory.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/resources/memory.ts` dosyasini satir-satir oku (37 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__resources__memory.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__resources__memory.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__resources__memory.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__resources__memory.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-315: Audit src/mcp/resources/retro.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__resources__retro.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/resources/retro.ts` dosyasini satir-satir oku (37 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__resources__retro.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__resources__retro.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__resources__retro.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__resources__retro.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-316: Audit src/mcp/resources/tasks.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__resources__tasks.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/resources/tasks.ts` dosyasini satir-satir oku (42 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__resources__tasks.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__resources__tasks.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__resources__tasks.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__resources__tasks.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-317: Audit src/mcp/server-singleton-lock.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__server-singleton-lock.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/server-singleton-lock.ts` dosyasini satir-satir oku (128 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__server-singleton-lock.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__server-singleton-lock.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__server-singleton-lock.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__server-singleton-lock.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-318: Audit src/mcp/server.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__server.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/server.ts` dosyasini satir-satir oku (225 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__server.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__server.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__server.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__server.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-319: Audit src/mcp/tools/agent-list.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__tools__agent-list.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/tools/agent-list.ts` dosyasini satir-satir oku (112 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__tools__agent-list.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__tools__agent-list.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__tools__agent-list.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__tools__agent-list.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-320: Audit src/mcp/tools/analyze.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__tools__analyze.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/tools/analyze.ts` dosyasini satir-satir oku (49 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__tools__analyze.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__tools__analyze.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__tools__analyze.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__tools__analyze.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-321: Audit src/mcp/tools/audit.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__tools__audit.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/tools/audit.ts` dosyasini satir-satir oku (58 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__tools__audit.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__tools__audit.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__tools__audit.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__tools__audit.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-322: Audit src/mcp/tools/checkpoint.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__tools__checkpoint.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/tools/checkpoint.ts` dosyasini satir-satir oku (149 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__tools__checkpoint.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__tools__checkpoint.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__tools__checkpoint.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__tools__checkpoint.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-323: Audit src/mcp/tools/cleanup.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__tools__cleanup.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/tools/cleanup.ts` dosyasini satir-satir oku (139 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__tools__cleanup.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__tools__cleanup.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__tools__cleanup.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__tools__cleanup.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-324: Audit src/mcp/tools/config.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__tools__config.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/tools/config.ts` dosyasini satir-satir oku (88 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__tools__config.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__tools__config.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__tools__config.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__tools__config.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-325: Audit src/mcp/tools/directives.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__tools__directives.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/tools/directives.ts` dosyasini satir-satir oku (88 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__tools__directives.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__tools__directives.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__tools__directives.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__tools__directives.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-326: Audit src/mcp/tools/docs.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__tools__docs.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/tools/docs.ts` dosyasini satir-satir oku (144 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__tools__docs.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__tools__docs.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__tools__docs.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__tools__docs.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-327: Audit src/mcp/tools/doctor.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__tools__doctor.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/tools/doctor.ts` dosyasini satir-satir oku (90 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__tools__doctor.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__tools__doctor.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__tools__doctor.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__tools__doctor.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-328: Audit src/mcp/tools/explain.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__tools__explain.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/tools/explain.ts` dosyasini satir-satir oku (150 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__tools__explain.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__tools__explain.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__tools__explain.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__tools__explain.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-329: Audit src/mcp/tools/feature-query.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__tools__feature-query.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/tools/feature-query.ts` dosyasini satir-satir oku (146 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__tools__feature-query.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__tools__feature-query.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__tools__feature-query.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__tools__feature-query.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-330: Audit src/mcp/tools/help.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__tools__help.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/tools/help.ts` dosyasini satir-satir oku (243 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__tools__help.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__tools__help.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__tools__help.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__tools__help.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-331: Audit src/mcp/tools/history.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__tools__history.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/tools/history.ts` dosyasini satir-satir oku (87 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__tools__history.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__tools__history.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__tools__history.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__tools__history.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-332: Audit src/mcp/tools/index.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__tools__index.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/tools/index.ts` dosyasini satir-satir oku (59 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__tools__index.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__tools__index.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__tools__index.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__tools__index.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-333: Audit src/mcp/tools/init.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__tools__init.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/tools/init.ts` dosyasini satir-satir oku (313 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__tools__init.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__tools__init.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__tools__init.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__tools__init.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-334: Audit src/mcp/tools/job-runner.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__tools__job-runner.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/tools/job-runner.ts` dosyasini satir-satir oku (98 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__tools__job-runner.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__tools__job-runner.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__tools__job-runner.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__tools__job-runner.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-335: Audit src/mcp/tools/kill.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__tools__kill.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/tools/kill.ts` dosyasini satir-satir oku (125 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__tools__kill.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__tools__kill.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__tools__kill.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__tools__kill.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-336: Audit src/mcp/tools/memory-query.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__tools__memory-query.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/tools/memory-query.ts` dosyasini satir-satir oku (73 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__tools__memory-query.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__tools__memory-query.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__tools__memory-query.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__tools__memory-query.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-337: Audit src/mcp/tools/nervous.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__tools__nervous.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/tools/nervous.ts` dosyasini satir-satir oku (509 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__tools__nervous.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__tools__nervous.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__tools__nervous.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__tools__nervous.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-338: Audit src/mcp/tools/plan.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__tools__plan.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/tools/plan.ts` dosyasini satir-satir oku (111 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__tools__plan.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__tools__plan.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__tools__plan.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__tools__plan.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-339: Audit src/mcp/tools/recover.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__tools__recover.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/tools/recover.ts` dosyasini satir-satir oku (128 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__tools__recover.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__tools__recover.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__tools__recover.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__tools__recover.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-340: Audit src/mcp/tools/retro.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__tools__retro.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/tools/retro.ts` dosyasini satir-satir oku (109 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__tools__retro.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__tools__retro.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__tools__retro.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__tools__retro.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-341: Audit src/mcp/tools/review.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__tools__review.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/tools/review.ts` dosyasini satir-satir oku (134 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__tools__review.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__tools__review.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__tools__review.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__tools__review.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-342: Audit src/mcp/tools/run.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__tools__run.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/tools/run.ts` dosyasini satir-satir oku (114 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__tools__run.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__tools__run.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__tools__run.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__tools__run.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-343: Audit src/mcp/tools/skill-list.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__tools__skill-list.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/tools/skill-list.ts` dosyasini satir-satir oku (101 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__tools__skill-list.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__tools__skill-list.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__tools__skill-list.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__tools__skill-list.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-344: Audit src/mcp/tools/start.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__tools__start.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/tools/start.ts` dosyasini satir-satir oku (238 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__tools__start.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__tools__start.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__tools__start.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__tools__start.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-345: Audit src/mcp/tools/status.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__tools__status.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/tools/status.ts` dosyasini satir-satir oku (488 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__tools__status.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__tools__status.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__tools__status.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__tools__status.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-346: Audit src/mcp/tools/sync.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__tools__sync.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/tools/sync.ts` dosyasini satir-satir oku (50 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__tools__sync.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__tools__sync.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__tools__sync.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__tools__sync.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-347: Audit src/mcp/tools/watch.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__mcp__tools__watch.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/mcp/tools/watch.ts` dosyasini satir-satir oku (130 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__mcp__tools__watch.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__mcp__tools__watch.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__mcp__tools__watch.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__mcp__tools__watch.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-348: Audit src/monitor/alert-emitter.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__monitor__alert-emitter.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/monitor/alert-emitter.ts` dosyasini satir-satir oku (70 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__monitor__alert-emitter.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__monitor__alert-emitter.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__monitor__alert-emitter.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__monitor__alert-emitter.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-349: Audit src/monitor/auditor.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__monitor__auditor.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/monitor/auditor.ts` dosyasini satir-satir oku (2851 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__monitor__auditor.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__monitor__auditor.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__monitor__auditor.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__monitor__auditor.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-350: Audit src/monitor/dashboard-manager.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__monitor__dashboard-manager.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/monitor/dashboard-manager.ts` dosyasini satir-satir oku (259 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__monitor__dashboard-manager.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__monitor__dashboard-manager.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__monitor__dashboard-manager.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__monitor__dashboard-manager.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-351: Audit src/monitor/index.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__monitor__index.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/monitor/index.ts` dosyasini satir-satir oku (13 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__monitor__index.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__monitor__index.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__monitor__index.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__monitor__index.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-352: Audit src/monitor/sprint-state.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__monitor__sprint-state.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/monitor/sprint-state.ts` dosyasini satir-satir oku (64 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__monitor__sprint-state.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__monitor__sprint-state.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__monitor__sprint-state.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__monitor__sprint-state.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-353: Audit src/nervous/action-handlers.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__nervous__action-handlers.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/nervous/action-handlers.ts` dosyasini satir-satir oku (197 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__nervous__action-handlers.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__nervous__action-handlers.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__nervous__action-handlers.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__nervous__action-handlers.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-354: Audit src/nervous/action-registry.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__nervous__action-registry.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/nervous/action-registry.ts` dosyasini satir-satir oku (329 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__nervous__action-registry.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__nervous__action-registry.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__nervous__action-registry.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__nervous__action-registry.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-355: Audit src/nervous/authority-matrix.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__nervous__authority-matrix.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/nervous/authority-matrix.ts` dosyasini satir-satir oku (185 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__nervous__authority-matrix.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__nervous__authority-matrix.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__nervous__authority-matrix.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__nervous__authority-matrix.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-356: Audit src/nervous/bootstrap.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__nervous__bootstrap.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/nervous/bootstrap.ts` dosyasini satir-satir oku (143 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__nervous__bootstrap.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__nervous__bootstrap.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__nervous__bootstrap.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__nervous__bootstrap.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-357: Audit src/nervous/decision-engine.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__nervous__decision-engine.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/nervous/decision-engine.ts` dosyasini satir-satir oku (117 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__nervous__decision-engine.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__nervous__decision-engine.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__nervous__decision-engine.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__nervous__decision-engine.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-358: Audit src/nervous/detector-registry.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__nervous__detector-registry.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/nervous/detector-registry.ts` dosyasini satir-satir oku (203 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__nervous__detector-registry.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__nervous__detector-registry.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__nervous__detector-registry.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__nervous__detector-registry.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-359: Audit src/nervous/detectors/agent-routing-anomaly.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__nervous__detectors__agent-routing-anomaly.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/nervous/detectors/agent-routing-anomaly.ts` dosyasini satir-satir oku (114 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__nervous__detectors__agent-routing-anomaly.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__nervous__detectors__agent-routing-anomaly.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__nervous__detectors__agent-routing-anomaly.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__nervous__detectors__agent-routing-anomaly.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-360: Audit src/nervous/detectors/agent-routing.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__nervous__detectors__agent-routing.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/nervous/detectors/agent-routing.ts` dosyasini satir-satir oku (139 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__nervous__detectors__agent-routing.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__nervous__detectors__agent-routing.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__nervous__detectors__agent-routing.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__nervous__detectors__agent-routing.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-361: Audit src/nervous/detectors/build-failure-recurrence.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__nervous__detectors__build-failure-recurrence.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/nervous/detectors/build-failure-recurrence.ts` dosyasini satir-satir oku (193 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__nervous__detectors__build-failure-recurrence.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__nervous__detectors__build-failure-recurrence.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__nervous__detectors__build-failure-recurrence.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__nervous__detectors__build-failure-recurrence.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-362: Audit src/nervous/detectors/dead-event-stream.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__nervous__detectors__dead-event-stream.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/nervous/detectors/dead-event-stream.ts` dosyasini satir-satir oku (161 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__nervous__detectors__dead-event-stream.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__nervous__detectors__dead-event-stream.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__nervous__detectors__dead-event-stream.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__nervous__detectors__dead-event-stream.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-363: Audit src/nervous/detectors/debt-trend.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__nervous__detectors__debt-trend.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/nervous/detectors/debt-trend.ts` dosyasini satir-satir oku (118 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__nervous__detectors__debt-trend.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__nervous__detectors__debt-trend.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__nervous__detectors__debt-trend.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__nervous__detectors__debt-trend.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-364: Audit src/nervous/detectors/directives-protection.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__nervous__detectors__directives-protection.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/nervous/detectors/directives-protection.ts` dosyasini satir-satir oku (92 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__nervous__detectors__directives-protection.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__nervous__detectors__directives-protection.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__nervous__detectors__directives-protection.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__nervous__detectors__directives-protection.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-365: Audit src/nervous/detectors/notification-delivery-health.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__nervous__detectors__notification-delivery-health.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/nervous/detectors/notification-delivery-health.ts` dosyasini satir-satir oku (124 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__nervous__detectors__notification-delivery-health.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__nervous__detectors__notification-delivery-health.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__nervous__detectors__notification-delivery-health.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__nervous__detectors__notification-delivery-health.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-366: Audit src/nervous/detectors/scope-collision-rate.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__nervous__detectors__scope-collision-rate.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/nervous/detectors/scope-collision-rate.ts` dosyasini satir-satir oku (101 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__nervous__detectors__scope-collision-rate.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__nervous__detectors__scope-collision-rate.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__nervous__detectors__scope-collision-rate.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__nervous__detectors__scope-collision-rate.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-367: Audit src/nervous/detectors/scope-collision.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__nervous__detectors__scope-collision.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/nervous/detectors/scope-collision.ts` dosyasini satir-satir oku (197 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__nervous__detectors__scope-collision.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__nervous__detectors__scope-collision.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__nervous__detectors__scope-collision.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__nervous__detectors__scope-collision.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-368: Audit src/nervous/detectors/stale-worker.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__nervous__detectors__stale-worker.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/nervous/detectors/stale-worker.ts` dosyasini satir-satir oku (62 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__nervous__detectors__stale-worker.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__nervous__detectors__stale-worker.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__nervous__detectors__stale-worker.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__nervous__detectors__stale-worker.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-369: Audit src/nervous/detectors/task-mode-idle.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__nervous__detectors__task-mode-idle.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/nervous/detectors/task-mode-idle.ts` dosyasini satir-satir oku (73 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__nervous__detectors__task-mode-idle.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__nervous__detectors__task-mode-idle.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__nervous__detectors__task-mode-idle.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__nervous__detectors__task-mode-idle.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-370: Audit src/nervous/detectors/token-spike.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__nervous__detectors__token-spike.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/nervous/detectors/token-spike.ts` dosyasini satir-satir oku (140 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__nervous__detectors__token-spike.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__nervous__detectors__token-spike.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__nervous__detectors__token-spike.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__nervous__detectors__token-spike.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-371: Audit src/nervous/dispatcher.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__nervous__dispatcher.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/nervous/dispatcher.ts` dosyasini satir-satir oku (345 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__nervous__dispatcher.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__nervous__dispatcher.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__nervous__dispatcher.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__nervous__dispatcher.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-372: Audit src/nervous/executor.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__nervous__executor.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/nervous/executor.ts` dosyasini satir-satir oku (300 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__nervous__executor.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__nervous__executor.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__nervous__executor.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__nervous__executor.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-373: Audit src/nervous/history.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__nervous__history.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/nervous/history.ts` dosyasini satir-satir oku (143 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__nervous__history.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__nervous__history.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__nervous__history.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__nervous__history.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-374: Audit src/nervous/ipc-queue.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__nervous__ipc-queue.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/nervous/ipc-queue.ts` dosyasini satir-satir oku (238 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__nervous__ipc-queue.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__nervous__ipc-queue.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__nervous__ipc-queue.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__nervous__ipc-queue.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-375: Audit src/nervous/observer.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__nervous__observer.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/nervous/observer.ts` dosyasini satir-satir oku (427 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__nervous__observer.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__nervous__observer.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__nervous__observer.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__nervous__observer.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-376: Audit src/nervous/proposer.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__nervous__proposer.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/nervous/proposer.ts` dosyasini satir-satir oku (158 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__nervous__proposer.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__nervous__proposer.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__nervous__proposer.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__nervous__proposer.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-377: Audit src/nervous/runtime-scope-check.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__nervous__runtime-scope-check.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/nervous/runtime-scope-check.ts` dosyasini satir-satir oku (56 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__nervous__runtime-scope-check.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__nervous__runtime-scope-check.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__nervous__runtime-scope-check.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__nervous__runtime-scope-check.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-378: Audit src/orchestra/adr-selector.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__adr-selector.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/adr-selector.ts` dosyasini satir-satir oku (389 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__adr-selector.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__adr-selector.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__adr-selector.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__adr-selector.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-379: Audit src/orchestra/authority-enforcer.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__authority-enforcer.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/authority-enforcer.ts` dosyasini satir-satir oku (674 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__authority-enforcer.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__authority-enforcer.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__authority-enforcer.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__authority-enforcer.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-380: Audit src/orchestra/baseline-tracker.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__baseline-tracker.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/baseline-tracker.ts` dosyasini satir-satir oku (281 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__baseline-tracker.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__baseline-tracker.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__baseline-tracker.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__baseline-tracker.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-381: Audit src/orchestra/batch-stats.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__batch-stats.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/batch-stats.ts` dosyasini satir-satir oku (141 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__batch-stats.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__batch-stats.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__batch-stats.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__batch-stats.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-382: Audit src/orchestra/brain-context.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__brain-context.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/brain-context.ts` dosyasini satir-satir oku (268 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__brain-context.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__brain-context.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__brain-context.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__brain-context.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-383: Audit src/orchestra/brain.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__brain.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/brain.ts` dosyasini satir-satir oku (54 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__brain.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__brain.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__brain.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__brain.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-384: Audit src/orchestra/ci-reporter.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__ci-reporter.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/ci-reporter.ts` dosyasini satir-satir oku (244 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__ci-reporter.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__ci-reporter.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__ci-reporter.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__ci-reporter.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-385: Audit src/orchestra/conflict-resolver.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__conflict-resolver.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/conflict-resolver.ts` dosyasini satir-satir oku (277 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__conflict-resolver.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__conflict-resolver.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__conflict-resolver.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__conflict-resolver.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-386: Audit src/orchestra/connector.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__connector.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/connector.ts` dosyasini satir-satir oku (8 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__connector.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__connector.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__connector.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__connector.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-387: Audit src/orchestra/coverage-validator.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__coverage-validator.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/coverage-validator.ts` dosyasini satir-satir oku (324 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__coverage-validator.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__coverage-validator.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__coverage-validator.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__coverage-validator.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-388: Audit src/orchestra/debt-manager.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__debt-manager.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/debt-manager.ts` dosyasini satir-satir oku (599 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__debt-manager.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__debt-manager.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__debt-manager.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__debt-manager.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-389: Audit src/orchestra/decision-engine.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__decision-engine.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/decision-engine.ts` dosyasini satir-satir oku (228 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__decision-engine.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__decision-engine.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__decision-engine.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__decision-engine.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-390: Audit src/orchestra/decision-logger.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__decision-logger.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/decision-logger.ts` dosyasini satir-satir oku (150 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__decision-logger.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__decision-logger.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__decision-logger.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__decision-logger.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-391: Audit src/orchestra/decision-replay.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__decision-replay.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/decision-replay.ts` dosyasini satir-satir oku (150 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__decision-replay.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__decision-replay.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__decision-replay.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__decision-replay.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-392: Audit src/orchestra/decision-steps/agent-step.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__decision-steps__agent-step.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/decision-steps/agent-step.ts` dosyasini satir-satir oku (83 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__decision-steps__agent-step.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__decision-steps__agent-step.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__decision-steps__agent-step.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__decision-steps__agent-step.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-393: Audit src/orchestra/decision-steps/scope-step.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__decision-steps__scope-step.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/decision-steps/scope-step.ts` dosyasini satir-satir oku (92 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__decision-steps__scope-step.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__decision-steps__scope-step.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__decision-steps__scope-step.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__decision-steps__scope-step.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-394: Audit src/orchestra/dependency-scheduler.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__dependency-scheduler.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/dependency-scheduler.ts` dosyasini satir-satir oku (688 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__dependency-scheduler.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__dependency-scheduler.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__dependency-scheduler.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__dependency-scheduler.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-395: Audit src/orchestra/doc-updaters/changelog.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__changelog.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/doc-updaters/changelog.ts` dosyasini satir-satir oku (92 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__changelog.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__changelog.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__changelog.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__changelog.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-396: Audit src/orchestra/doc-updaters/health-check.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__health-check.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/doc-updaters/health-check.ts` dosyasini satir-satir oku (78 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__health-check.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__health-check.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__health-check.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__health-check.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-397: Audit src/orchestra/doc-updaters/index.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__index.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/doc-updaters/index.ts` dosyasini satir-satir oku (19 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__index.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__index.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__index.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__index.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-398: Audit src/orchestra/doc-updaters/metrics-updater.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__metrics-updater.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/doc-updaters/metrics-updater.ts` dosyasini satir-satir oku (92 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__metrics-updater.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__metrics-updater.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__metrics-updater.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__metrics-updater.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-399: Audit src/orchestra/doc-updaters/readme-metrics.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__readme-metrics.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/doc-updaters/readme-metrics.ts` dosyasini satir-satir oku (58 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__readme-metrics.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__readme-metrics.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__readme-metrics.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__readme-metrics.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-400: Audit src/orchestra/doc-updaters/registry.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__registry.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/doc-updaters/registry.ts` dosyasini satir-satir oku (29 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__registry.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__registry.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__registry.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__registry.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-401: Audit src/orchestra/doc-updaters/sprint-log.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__sprint-log.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/doc-updaters/sprint-log.ts` dosyasini satir-satir oku (64 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__sprint-log.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__sprint-log.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__sprint-log.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__sprint-log.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-402: Audit src/orchestra/doc-updaters/types.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__types.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/doc-updaters/types.ts` dosyasini satir-satir oku (29 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__types.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__types.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__types.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__doc-updaters__types.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-403: Audit src/orchestra/ecosystem-intelligence.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__ecosystem-intelligence.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/ecosystem-intelligence.ts` dosyasini satir-satir oku (194 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__ecosystem-intelligence.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__ecosystem-intelligence.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__ecosystem-intelligence.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__ecosystem-intelligence.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-404: Audit src/orchestra/evaluation-audit-trail.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__evaluation-audit-trail.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/evaluation-audit-trail.ts` dosyasini satir-satir oku (192 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__evaluation-audit-trail.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__evaluation-audit-trail.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__evaluation-audit-trail.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__evaluation-audit-trail.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-405: Audit src/orchestra/event-bus.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__event-bus.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/event-bus.ts` dosyasini satir-satir oku (254 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__event-bus.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__event-bus.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__event-bus.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__event-bus.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-406: Audit src/orchestra/event-stream.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__event-stream.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/event-stream.ts` dosyasini satir-satir oku (528 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__event-stream.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__event-stream.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__event-stream.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__event-stream.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-407: Audit src/orchestra/handoff-protocol.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__handoff-protocol.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/handoff-protocol.ts` dosyasini satir-satir oku (152 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__handoff-protocol.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__handoff-protocol.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__handoff-protocol.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__handoff-protocol.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-408: Audit src/orchestra/heartbeat-daemon.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__heartbeat-daemon.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/heartbeat-daemon.ts` dosyasini satir-satir oku (308 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__heartbeat-daemon.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__heartbeat-daemon.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__heartbeat-daemon.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__heartbeat-daemon.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-409: Audit src/orchestra/index.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__index.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/index.ts` dosyasini satir-satir oku (110 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__index.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__index.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__index.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__index.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-410: Audit src/orchestra/ipc-registry.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__ipc-registry.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/ipc-registry.ts` dosyasini satir-satir oku (271 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__ipc-registry.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__ipc-registry.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__ipc-registry.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__ipc-registry.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-411: Audit src/orchestra/managed-docs/content-generators.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__content-generators.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/managed-docs/content-generators.ts` dosyasini satir-satir oku (672 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__content-generators.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__content-generators.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__content-generators.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__content-generators.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-412: Audit src/orchestra/managed-docs/doc-cache.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__doc-cache.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/managed-docs/doc-cache.ts` dosyasini satir-satir oku (139 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__doc-cache.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__doc-cache.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__doc-cache.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__doc-cache.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-413: Audit src/orchestra/managed-docs/docs-config.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__docs-config.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/managed-docs/docs-config.ts` dosyasini satir-satir oku (170 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__docs-config.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__docs-config.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__docs-config.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__docs-config.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-414: Audit src/orchestra/managed-docs/index.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__index.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/managed-docs/index.ts` dosyasini satir-satir oku (9 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__index.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__index.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__index.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__index.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-415: Audit src/orchestra/managed-docs/managed-doc-runner.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__managed-doc-runner.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/managed-docs/managed-doc-runner.ts` dosyasini satir-satir oku (199 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__managed-doc-runner.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__managed-doc-runner.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__managed-doc-runner.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__managed-doc-runner.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-416: Audit src/orchestra/managed-docs/plugin-loader.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__plugin-loader.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/managed-docs/plugin-loader.ts` dosyasini satir-satir oku (113 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__plugin-loader.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__plugin-loader.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__plugin-loader.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__plugin-loader.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-417: Audit src/orchestra/managed-docs/section-updater.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__section-updater.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/managed-docs/section-updater.ts` dosyasini satir-satir oku (146 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__section-updater.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__section-updater.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__section-updater.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__section-updater.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-418: Audit src/orchestra/managed-docs/template-renderer.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__template-renderer.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/managed-docs/template-renderer.ts` dosyasini satir-satir oku (136 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__template-renderer.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__template-renderer.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__template-renderer.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__template-renderer.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-419: Audit src/orchestra/managed-docs/types.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__types.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/managed-docs/types.ts` dosyasini satir-satir oku (75 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__types.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__types.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__types.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__managed-docs__types.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-420: Audit src/orchestra/mid-sprint-adapter.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__mid-sprint-adapter.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/mid-sprint-adapter.ts` dosyasini satir-satir oku (633 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__mid-sprint-adapter.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__mid-sprint-adapter.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__mid-sprint-adapter.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__mid-sprint-adapter.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-421: Audit src/orchestra/model-selector.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__model-selector.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/model-selector.ts` dosyasini satir-satir oku (283 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__model-selector.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__model-selector.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__model-selector.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__model-selector.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-422: Audit src/orchestra/monitor-adapter.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__monitor-adapter.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/monitor-adapter.ts` dosyasini satir-satir oku (212 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__monitor-adapter.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__monitor-adapter.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__monitor-adapter.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__monitor-adapter.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-423: Audit src/orchestra/multi-agent.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__multi-agent.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/multi-agent.ts` dosyasini satir-satir oku (121 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__multi-agent.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__multi-agent.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__multi-agent.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__multi-agent.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-424: Audit src/orchestra/outcome-tracker.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__outcome-tracker.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/outcome-tracker.ts` dosyasini satir-satir oku (502 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__outcome-tracker.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__outcome-tracker.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__outcome-tracker.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__outcome-tracker.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-425: Audit src/orchestra/parallel-pipeline.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__parallel-pipeline.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/parallel-pipeline.ts` dosyasini satir-satir oku (125 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__parallel-pipeline.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__parallel-pipeline.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__parallel-pipeline.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__parallel-pipeline.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-426: Audit src/orchestra/pattern-reader.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__pattern-reader.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/pattern-reader.ts` dosyasini satir-satir oku (164 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__pattern-reader.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__pattern-reader.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__pattern-reader.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__pattern-reader.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-427: Audit src/orchestra/pattern-recorder.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__pattern-recorder.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/pattern-recorder.ts` dosyasini satir-satir oku (96 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__pattern-recorder.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__pattern-recorder.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__pattern-recorder.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__pattern-recorder.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-428: Audit src/orchestra/planner.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__planner.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/planner.ts` dosyasini satir-satir oku (672 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__planner.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__planner.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__planner.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__planner.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-429: Audit src/orchestra/post-sprint-smoke.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__post-sprint-smoke.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/post-sprint-smoke.ts` dosyasini satir-satir oku (314 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__post-sprint-smoke.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__post-sprint-smoke.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__post-sprint-smoke.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__post-sprint-smoke.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-430: Audit src/orchestra/promotion-pipeline.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__promotion-pipeline.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/promotion-pipeline.ts` dosyasini satir-satir oku (287 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__promotion-pipeline.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__promotion-pipeline.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__promotion-pipeline.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__promotion-pipeline.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-431: Audit src/orchestra/prompt-god-template.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__prompt-god-template.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/prompt-god-template.ts` dosyasini satir-satir oku (640 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__prompt-god-template.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__prompt-god-template.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__prompt-god-template.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__prompt-god-template.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-432: Audit src/orchestra/prompt-token-optimizer.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__prompt-token-optimizer.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/prompt-token-optimizer.ts` dosyasini satir-satir oku (154 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__prompt-token-optimizer.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__prompt-token-optimizer.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__prompt-token-optimizer.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__prompt-token-optimizer.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-433: Audit src/orchestra/quality-assessor.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__quality-assessor.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/quality-assessor.ts` dosyasini satir-satir oku (211 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__quality-assessor.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__quality-assessor.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__quality-assessor.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__quality-assessor.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-434: Audit src/orchestra/result-collector.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__result-collector.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/result-collector.ts` dosyasini satir-satir oku (753 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__result-collector.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__result-collector.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__result-collector.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__result-collector.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-435: Audit src/orchestra/result-evaluator.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__result-evaluator.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/result-evaluator.ts` dosyasini satir-satir oku (2086 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__result-evaluator.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__result-evaluator.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__result-evaluator.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__result-evaluator.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-436: Audit src/orchestra/result-merger.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__result-merger.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/result-merger.ts` dosyasini satir-satir oku (101 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__result-merger.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__result-merger.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__result-merger.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__result-merger.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-437: Audit src/orchestra/result-watcher.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__result-watcher.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/result-watcher.ts` dosyasini satir-satir oku (73 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__result-watcher.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__result-watcher.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__result-watcher.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__result-watcher.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-438: Audit src/orchestra/rollback.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__rollback.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/rollback.ts` dosyasini satir-satir oku (354 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__rollback.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__rollback.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__rollback.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__rollback.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-439: Audit src/orchestra/rubric-registry.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__rubric-registry.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/rubric-registry.ts` dosyasini satir-satir oku (316 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__rubric-registry.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__rubric-registry.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__rubric-registry.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__rubric-registry.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-440: Audit src/orchestra/rule-evolver.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__rule-evolver.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/rule-evolver.ts` dosyasini satir-satir oku (279 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__rule-evolver.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__rule-evolver.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__rule-evolver.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__rule-evolver.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-441: Audit src/orchestra/scope-sanitizer.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__scope-sanitizer.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/scope-sanitizer.ts` dosyasini satir-satir oku (155 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__scope-sanitizer.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__scope-sanitizer.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__scope-sanitizer.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__scope-sanitizer.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-442: Audit src/orchestra/self-modifying-detector.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__self-modifying-detector.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/self-modifying-detector.ts` dosyasini satir-satir oku (164 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__self-modifying-detector.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__self-modifying-detector.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__self-modifying-detector.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__self-modifying-detector.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-443: Audit src/orchestra/sensitive-redactor.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__sensitive-redactor.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/sensitive-redactor.ts` dosyasini satir-satir oku (62 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__sensitive-redactor.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__sensitive-redactor.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__sensitive-redactor.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__sensitive-redactor.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-444: Audit src/orchestra/shared-memory.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__shared-memory.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/shared-memory.ts` dosyasini satir-satir oku (143 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__shared-memory.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__shared-memory.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__shared-memory.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__shared-memory.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-445: Audit src/orchestra/spawn-backend-docker.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__spawn-backend-docker.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/spawn-backend-docker.ts` dosyasini satir-satir oku (1059 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__spawn-backend-docker.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__spawn-backend-docker.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__spawn-backend-docker.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__spawn-backend-docker.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-446: Audit src/orchestra/spawn-backend-mock.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__spawn-backend-mock.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/spawn-backend-mock.ts` dosyasini satir-satir oku (108 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__spawn-backend-mock.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__spawn-backend-mock.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__spawn-backend-mock.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__spawn-backend-mock.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-447: Audit src/orchestra/spawn-backend.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__spawn-backend.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/spawn-backend.ts` dosyasini satir-satir oku (373 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__spawn-backend.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__spawn-backend.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__spawn-backend.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__spawn-backend.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-448: Audit src/orchestra/sprint-checkpoint.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__sprint-checkpoint.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/sprint-checkpoint.ts` dosyasini satir-satir oku (644 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__sprint-checkpoint.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__sprint-checkpoint.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__sprint-checkpoint.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__sprint-checkpoint.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-449: Audit src/orchestra/sprint-controller.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__sprint-controller.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/sprint-controller.ts` dosyasini satir-satir oku (985 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__sprint-controller.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__sprint-controller.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__sprint-controller.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__sprint-controller.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-450: Audit src/orchestra/sprint-docs-helpers.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__sprint-docs-helpers.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/sprint-docs-helpers.ts` dosyasini satir-satir oku (350 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__sprint-docs-helpers.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__sprint-docs-helpers.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__sprint-docs-helpers.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__sprint-docs-helpers.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-451: Audit src/orchestra/sprint-docs-updater.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__sprint-docs-updater.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/sprint-docs-updater.ts` dosyasini satir-satir oku (835 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__sprint-docs-updater.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__sprint-docs-updater.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__sprint-docs-updater.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__sprint-docs-updater.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-452: Audit src/orchestra/sprint-estimator.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__sprint-estimator.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/sprint-estimator.ts` dosyasini satir-satir oku (278 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__sprint-estimator.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__sprint-estimator.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__sprint-estimator.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__sprint-estimator.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-453: Audit src/orchestra/sprint-finalizer.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__sprint-finalizer.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/sprint-finalizer.ts` dosyasini satir-satir oku (1311 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__sprint-finalizer.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__sprint-finalizer.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__sprint-finalizer.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__sprint-finalizer.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-454: Audit src/orchestra/sprint-lifecycle.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__sprint-lifecycle.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/sprint-lifecycle.ts` dosyasini satir-satir oku (604 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__sprint-lifecycle.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__sprint-lifecycle.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__sprint-lifecycle.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__sprint-lifecycle.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-455: Audit src/orchestra/sprint-metrics.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__sprint-metrics.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/sprint-metrics.ts` dosyasini satir-satir oku (615 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__sprint-metrics.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__sprint-metrics.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__sprint-metrics.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__sprint-metrics.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-456: Audit src/orchestra/sprint-phases.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__sprint-phases.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/sprint-phases.ts` dosyasini satir-satir oku (1369 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__sprint-phases.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__sprint-phases.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__sprint-phases.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__sprint-phases.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-457: Audit src/orchestra/sprint-pid-manager.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__sprint-pid-manager.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/sprint-pid-manager.ts` dosyasini satir-satir oku (252 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__sprint-pid-manager.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__sprint-pid-manager.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__sprint-pid-manager.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__sprint-pid-manager.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-458: Audit src/orchestra/sprint-planner.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__sprint-planner.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/sprint-planner.ts` dosyasini satir-satir oku (847 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__sprint-planner.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__sprint-planner.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__sprint-planner.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__sprint-planner.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-459: Audit src/orchestra/sprint-reporter.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__sprint-reporter.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/sprint-reporter.ts` dosyasini satir-satir oku (185 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__sprint-reporter.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__sprint-reporter.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__sprint-reporter.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__sprint-reporter.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-460: Audit src/orchestra/sprint-retro-writer.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__sprint-retro-writer.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/sprint-retro-writer.ts` dosyasini satir-satir oku (744 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__sprint-retro-writer.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__sprint-retro-writer.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__sprint-retro-writer.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__sprint-retro-writer.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-461: Audit src/orchestra/sprint-runner-entry.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__sprint-runner-entry.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/sprint-runner-entry.ts` dosyasini satir-satir oku (334 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__sprint-runner-entry.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__sprint-runner-entry.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__sprint-runner-entry.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__sprint-runner-entry.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-462: Audit src/orchestra/sprint-spawner.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__sprint-spawner.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/sprint-spawner.ts` dosyasini satir-satir oku (1085 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__sprint-spawner.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__sprint-spawner.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__sprint-spawner.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__sprint-spawner.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-463: Audit src/orchestra/sprint-state-tracker.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__sprint-state-tracker.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/sprint-state-tracker.ts` dosyasini satir-satir oku (114 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__sprint-state-tracker.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__sprint-state-tracker.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__sprint-state-tracker.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__sprint-state-tracker.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-464: Audit src/orchestra/sprint-utils.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__sprint-utils.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/sprint-utils.ts` dosyasini satir-satir oku (362 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__sprint-utils.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__sprint-utils.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__sprint-utils.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__sprint-utils.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-465: Audit src/orchestra/task-analyzer.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__task-analyzer.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/task-analyzer.ts` dosyasini satir-satir oku (141 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__task-analyzer.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__task-analyzer.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__task-analyzer.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__task-analyzer.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-466: Audit src/orchestra/task-builder.ts
- Model: opus
- Effort: high
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__task-builder.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/task-builder.ts` dosyasini satir-satir oku (1162 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__task-builder.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__task-builder.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__task-builder.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__task-builder.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-467: Audit src/orchestra/task-mode-runner.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__task-mode-runner.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/task-mode-runner.ts` dosyasini satir-satir oku (123 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__task-mode-runner.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__task-mode-runner.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__task-mode-runner.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__task-mode-runner.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-468: Audit src/orchestra/task-restoration.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__task-restoration.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/task-restoration.ts` dosyasini satir-satir oku (269 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__task-restoration.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__task-restoration.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__task-restoration.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__task-restoration.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-469: Audit src/orchestra/task-retry.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__task-retry.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/task-retry.ts` dosyasini satir-satir oku (93 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__task-retry.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__task-retry.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__task-retry.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__task-retry.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-470: Audit src/orchestra/task-router.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__task-router.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/task-router.ts` dosyasini satir-satir oku (319 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__task-router.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__task-router.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__task-router.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__task-router.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-471: Audit src/orchestra/temp-skill-generator.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__temp-skill-generator.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/temp-skill-generator.ts` dosyasini satir-satir oku (392 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__temp-skill-generator.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__temp-skill-generator.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__temp-skill-generator.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__temp-skill-generator.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-472: Audit src/orchestra/timeout-estimator.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__timeout-estimator.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/timeout-estimator.ts` dosyasini satir-satir oku (186 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__timeout-estimator.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__timeout-estimator.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__timeout-estimator.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__timeout-estimator.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-473: Audit src/orchestra/timeout-watcher.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__timeout-watcher.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/timeout-watcher.ts` dosyasini satir-satir oku (306 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__timeout-watcher.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__timeout-watcher.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__timeout-watcher.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__timeout-watcher.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-474: Audit src/orchestra/tmux.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__orchestra__tmux.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/orchestra/tmux.ts` dosyasini satir-satir oku (401 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__orchestra__tmux.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__orchestra__tmux.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__orchestra__tmux.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__orchestra__tmux.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-475: Audit src/providers/claude.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__providers__claude.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/providers/claude.ts` dosyasini satir-satir oku (276 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__providers__claude.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__providers__claude.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__providers__claude.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__providers__claude.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-476: Audit src/providers/codex.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__providers__codex.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/providers/codex.ts` dosyasini satir-satir oku (372 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__providers__codex.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__providers__codex.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__providers__codex.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__providers__codex.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-477: Audit src/providers/gemini.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__providers__gemini.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/providers/gemini.ts` dosyasini satir-satir oku (578 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__providers__gemini.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__providers__gemini.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__providers__gemini.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__providers__gemini.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-478: Audit src/providers/sandbox.ts
- Model: opus
- Effort: low
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__providers__sandbox.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/providers/sandbox.ts` dosyasini satir-satir oku (162 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__providers__sandbox.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__providers__sandbox.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__providers__sandbox.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__providers__sandbox.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## Task 186-479: Audit src/providers/subprocess.ts
- Model: opus
- Effort: normal
- Skills: typescript-expert, documentation-writer, security-specialist
- Files: docs/audits/per-file-2026-05-21/src__providers__subprocess.md
- Scope: docs/audits/per-file-2026-05-21/

### Description
`src/providers/subprocess.ts` dosyasini satir-satir oku (328 LoC), 9-section markdown audit raporu yaz: `docs/audits/per-file-2026-05-21/src__providers__subprocess.md`.

**Sections (zorunlu hepsi):**
1. Inventory — LoC, last modified, public exports, direct imports, reverse dependencies
2. Baglam — Architectural context, ADR-related notes
3. Debt Risk — table: Risk Area | Severity | Evidence (file:line) | Recommendation
4. Dead Code Candidates — exported but zero-caller (grep evidence)
5. Documentation Gaps — public API JSDoc eksik, stale comments
6. ADR Compliance Check — table: ADR | Relevant | Compliant | Evidence
7. Refactor Recommendations — concrete actions with file:line
8. Sprint 187 Follow-up Items — P0/P1/P2 numbered list
9. Summary — overall health + top 3 priorities

**Kanit:** `wc -l docs/audits/per-file-2026-05-21/src__providers__subprocess.md` >= 50 satir. `grep "^## " docs/audits/per-file-2026-05-21/src__providers__subprocess.md | wc -l` >= 9 section.

**Worker contract:** Sadece docs/audits/per-file-2026-05-21/src__providers__subprocess.md dosyasi yazilir. src/, tests/, package.json, .deckent/, .brain/ YASAK. TDD kapsam disi (doc-only).

---

## GO/NO_GO

- **GO** = >=430/479 DONE (gate-2 output completeness)
- **GO_WITH_TECH_DEBT** = 380-429/479 DONE
- **NO_GO** = <380/479 DONE veya src/ git diff non-empty (gate-1 doc-only violation)
