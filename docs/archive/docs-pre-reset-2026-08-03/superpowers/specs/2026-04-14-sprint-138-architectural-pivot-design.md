# Sprint 138 — Architectural Pivot Design (Verification Protocol Foundation + Recovery Completion + Vizyon Foundation)

**Date:** 2026-04-14
**Sprint:** sprint-138
**Theme:** Architectural Pivot — Verification Protocol Foundation
**Previous:** sprint-137 (9/17 Layer 3, readiness 4.00, GO_WITH_TECH_DEBT, meta-dogfood breakthrough)
**Author:** Claude Opus 4.6 (1M context) — brainstorming session 2026-04-14
**Execution Model:** Phased Hybrid Wave (4 waves, 10 tasks, ~6-7 saat natural, 7 saat hard cap)
**Commit count expectation:** 2 (feat + docs, Sprint 134+ pattern)

---

## 1. Context & Problem Statement

Sprint 137 tamamlandı **2026-04-14** 35m 52s natural execution (en hızlı 4-sprint), zero coordinator crash, zero NO_GO (helper retrospektif DONE relabel sayesinde, 3-sprint sonra ilk). Final label: **GO_WITH_TECH_DEBT** — 9/17 Layer 3 criteria, readiness ~4.00/5 (ilk kez 4.00 eşiği aşıldı, 4-sprint 3.86/3.93/3.925/4.00 trend).

**🏆 Sprint 137 büyük kazanım:** `tryCodeVerifiedDone` helper ilk kez in-sprint canlı çalıştı. Task 137-001 worker Docker HB shutdown bug pattern'ına düştü (HB sequence 99 + `status: DONE + exitCode: 0` yazdı, `.result` yazmadan container öldü), Brain synthetic NO_GO yazdı, FIX worker spawn etti, sonra **Brain finalize phase'inde helper otomatik çağrıldı**, git diff'te `tests/orchestra/brain.test.ts +88`, `task-queue.test.ts +24`, `task-limit.test.ts +20` kod değişikliklerini tespit etti, `.result` dosyasını overwrite etti: `selfAssessment: DONE, codeVerified: CODE_VERIFIED_DONE`. 4-sprint'lik Docker HB shutdown bug için **ilk otomatik retrospektif çözüm**.

**⚠ Sprint 137 kritik bulgu — worker dürüstlük sınırı:** Helper "file change varlığı" ile DONE verdi ama Task 137-001 functional sadece %51 (vitest 123 → 63 fail, 63 hâlâ kırık). `feedback_worker_honest_assessment.md` canlı kanıt oluştu: "helper bile yalan söylüyor — kod var ≠ kod çalışıyor." Sprint 138 bu gap'i kapatmalı.

**⚠ Sprint 137 Layer 4 runtime wire devam fail:** Sprint 136-137 üst üste 3 sprint'tir `gate.json + load-report.md + metrics.jsonl` runtime'da oluşmuyor. Worker'lar "wire satır 10b/10c'de mevcut" diyor ama runtime fail. Bu **architectural root cause** — Task 8 refactor (`sprint-controller.ts` 1890→209) sonrası `finalizeSprint()` call path bozuk, hook'lar dead code path'te.

**⚠ Sprint 137 retrospektif pivot kararı (bu spec'in doğuşu):** Sprint 137 closing retro'sunda Alperen **mimari pivot** kararı verdi. 4 sprint boyunca (134-137) Brain ↔ Auditor ↔ Worker iletişim sorunu semptomlarla uğraşıldı (helper fix, wire fix, auto-archive fix). Asıl sorun: **protokol standardizasyonu yok**, auditor passive scanner, worker self-assessment doğrulanmıyor, collision detection Docker'da kopuk, ADR governance enforcement eksik. Sprint 138 bu kök sorunlara pivot.

**Sprint 138'in özel bir direktifi:** ADR governance kullanıcı-facing product feature olmalı. Açık repoya geçtiğimizde (Sprint 147 GA) kullanıcılar kendi projelerinde `.brain/DECISIONS.md` yazıp Deckent'tan bu ADR'leri **zorla uygulatmasını** bekleyecek. Şu an bu çalışmıyor — worker'lar ADR'leri hiç okumuyor.

**Ek alınan karar — Sprint 139 preview:** Alperen BS-4 Section 3'te "Deckent→User push channel" fikri önerdi (Claude Code chat bar'a notification). Sprint 138 zaten 10 task/7 saat scope'ta olduğu için Sprint 139'a alındı. Sprint 138 sadece ADR-035'te `DECKENT→USER:NOTIFY` kanal code'unu tanımlar (protokol), Sprint 139 dispatcher + 2 adapter (CLI + MCP) implement eder.

---

## 2. Goals & Success Criteria

**Ana hedef:** Brain ↔ Auditor ↔ Worker iletişimini standardize, doğrula, zorla. Mimari pivot + Sprint 137 recovery completion + vizyon foundation hibrit.

**Ölçülebilir hedefler:**

| Metrik | Sprint 137 | Sprint 138 Hedef | Delta |
|--------|-----------|------------------|-------|
| Layer 3 criteria | 9/17 | **≥14/17** | **+5 bounce** |
| Readiness | 4.00/5 | **≥4.15/5** | +0.15 |
| Vitest fail count | 63 | **0** | -63 |
| Vitest pass count | 12658 | **≥12721** | +63 |
| Architectural Pivot Evidence | 0 | **6 deliverable + 2-3 meta-dogfood** | yeni eksen |
| Coordinator crash | 0 | **0** | unchanged (4 sprint parity) |
| Manual recovery | 0 (minor) | **0** | cleaner |
| Carry-over debt | 11 | **≤6** | -5 |
| Clean GO | ❌ | **✅** | — |
| Docker HB bug mitigation | helper mevcut | **functional check + event stream** | sistematik |

**Sprint 138 sonu durum:** Recovery completion + mimari foundation atıldı. Sprint 139 Multi-Provider + Notification Dispatcher için hazır.

**Revised roadmap (Sprint 138 sonrası):**
- Sprint 138 (bu sprint): Architectural Pivot
- Sprint 139: Multi-Provider + Multi-Platform + Notification Dispatcher
- Sprint 140: Long-Running Sprint Live Test (50 task) + AI-to-human notify
- Sprint 141-142: Async I/O Full Migration + Docker HB Core Fix
- Sprint 143-144: Dogfood Dormant Features + Security Hardening
- Sprint 145: 100 Task Live Test + Public Beta Packaging
- Sprint 146: Documentation Finalization (388 .md review)
- Sprint 147: **Public Beta GA**

Toplam Sprint 138 → Sprint 147 = **10 sprint, ~3-4 hafta**.

---

## 3. Scope (Full Pivot — 10 Task)

**In scope (9 zorunlu + 1 opsiyonel):**

1. Task 138-000 — ADR Governance Integration (Task 1'den önce, Sprint 138'in gerçek başlangıcı)
2. Task 138-001 — ADR-035 Verification Protocol Standard
3. Task 138-002 — Auditor Authority Extension
4. Task 138-003 — Structured Event Stream + Plan-Time Scope Collision Detection (high effort)
5. Task 138-004 — Test Restoration Tam Tamamlama (Sprint 137 carry-over)
6. Task 138-005 — Layer 4 Runtime Wire Forensic Fix
7. Task 138-006 — Auto-Archive Partial Regression Fix
8. Task 138-007 — Worker Honest Assessment Calibration v2
9. Task 138-008 — Long-Running Sprint Resume Capability MVP
10. Task 138-009 — MCP/CLI Parity Audit (OPSİYONEL, kapasite kalırsa)

**Out of scope (Sprint 139 chain):**
- Notification Dispatcher (CLI + MCP adapter) — Sprint 138 sadece protocol tanımlar
- Codex + Gemini simultaneous test
- macOS + Windows dogfood

**Out of scope (Sprint 140+ chain):**
- Long-running sprint 50-task canlı test
- Async I/O full migration
- Docker HB shutdown bug core fix
- Heartbeat daemon 24h stability
- Human checkpoint canlı sprint
- Agent evolution dogfood
- Security hardening (MCP auth, plugin sandbox, Docker hardening)
- npm publish preparation
- 388 .md doc finalization (Sprint 146)

**Sprint 138 yasakları:**

1. ❌ Yeni user-facing feature eklemek (mimari pivot + recovery, feature değil)
2. ❌ `sprint-controller.ts`'e dokunmak (Sprint 136'da stabilize, Sprint 137 sağlam)
3. ❌ Async I/O migration'ı Sprint 138'e sıkıştırmak (Sprint 141+)
4. ❌ Docker HB core fix'i Sprint 138'de denemek (Sprint 141+, helper functional upgrade yeterli mitigation)
5. ❌ Heartbeat/checkpoint/agent-evolution dogfood (Sprint 143+)
6. ❌ Notification dispatcher implementation (Sprint 139)
7. ❌ `git add -A`, `commit --amend`, `git reset --hard`
8. ❌ FINAL report Section N+1 append ederken Section 1 inline update'i atlamak
9. ❌ Worker dürüstlük v2 calibration'ı "yeterince yaptık" sanmak (Sprint 138 canlı downgrade kanıtı şart)
10. ❌ Layer 4 runtime wire'ı 4. sprint üst üste fail bırakmak (Sprint 136-137-138 kritik eşik)
11. ❌ ADR Governance'ı Sprint 138'de sadece dokümante etmek — **runtime enforcement** zorunlu (Task 2 Alt-iş C)
12. ❌ Plan-time collision detection'ı Sprint 138 Task 3'te minimal sanmak — Sprint 138'in kendi task 5-6 collision'ı **canlı dogfood** olarak çalışmalı

---

## 4. 17-Criterion Verification Framework (Sprint 134+ Parity)

**Önemli:** Sprint 138 yeni mimari deliverable'lar için **17-criterion değiştirilmez** (Sprint 134-137 trend line korunur). Yeni 3 canlı dogfood kanıtı scorecard'ın ayrı "Architectural Pivot Evidence" section'ında değerlendirilir, 17-criterion'a girmez. (BS-4 Section 6 A+B hibrit kararı)

### Layer 1 — Deckent Self-Evaluation (3 criteria)

1. **≥8/10 task DONE** — target: 10 × 0.8 = 8 (Sprint 137: 5/6 = 83% parity)
2. **HIGH/CRITICAL effort tasks DONE or TD, not NO_GO** — Task 0, 2, 3, 4, 5 CRITICAL; Task 1, 6, 7, 8 HIGH; NO_GO olmamalı
3. **Brain rubric avg ≥75/100** — result dosyalarında rubricScores field

### Layer 2 — Technical Verification (3 criteria)

4. **`npx tsc --noEmit` → 0 errors**
5. **`npx vitest run` → 0 fail, ≥12721 pass** (Task 4 hedef)
6. **Dashboard regression = 0**

### Layer 3 — Manual Verification (3 criteria)

7. **Per-task physical grep proof (10/10 task)** — git diff'te her task fiziken kod yazdı
8. **Scope compliance — 0 boundary violation**
9. **Auto-archive canlı (otomatik, manuel değil)** — Task 6'nın output'u, `.brain/archive/DIRECTIVES-sprint-138.md` + DIRECTIVES.md Sprint 139 reset

### Layer 4 — Runtime Artifact Generation (3 criteria)

10. **metrics.jsonl canlı ≥50 line** — Task 5 runtime wire fix
11. **`docs/audits/sprint-138/load-test-report.md` runtime oluştu** — Task 5
12. **`.deckent/sprint-138-gate.json` overallGate === "PASS" or "WARNING"** — Task 5

### Layer 5 — Product Vision Regression (4 criteria)

13. **ADR-033 + ADR-034 immutable** — `.brain/DECISIONS.md` vision ADR'leri değişmedi
14. **docs/vision/roadmap.md immutable**
15. **Forbidden terms audit** (saas/cloud-hosted/paywall/enterprise edition)
16. **Per-task vision lens (10/10 vision-audited)**

### Layer 6 — Kur-Çalıştır Readiness Score (1 criterion)

17. **Readiness ≥4.15/5** — weighted axis scoring

**Target breakdown:**
- Optimistic: 17/17 (Sprint 134'ten beri hiç tutmadı)
- **Realistic:** **14-16/17** (+5-7 bounce Sprint 137 9/17'den)
- Minimum acceptable: 12/17

---

## 5. Architecture — Phased Hybrid Wave Execution Model

### 5.1 Wave Structure

```
Wave 1 — Foundation Gate (Sequential intra-wave, ~1-1.5 saat)
  └─ Task 138-000: ADR Governance Integration (~45 dk, architect opus)
       Barrier: ADR format + workflow hazır olmadan Task 1 ADR-035 yazılamaz
  │
  └─ Task 138-001: ADR-035 Verification Protocol Standard (~20 dk, architecture-planner sonnet)
       Barrier: ADR-035 olmadan Task 2+3 mimari implementation anlamsız

Wave 2 — Mimari Core (Sequential intra-wave, ~1.5-2 saat)
  └─ Task 138-002: Auditor Authority Extension (~75 dk, architect opus)
       Barrier: auditor.ts + sprint-finalizer.ts collision ile Task 3 aynı dosyaya yazar
  │
  └─ Task 138-003: Structured Event Stream + Plan-Time Scope Collision Detection (~120 dk, architect opus HIGH)
       Barrier: Event stream foundation + collision detection hazır olmadan Wave 3 parallel etkin değil

Wave 3 — Recovery + Vizyon Batch 1 (3-parallel, ~60-75 dk wall time)
  ├─ Task 138-004: Test Restoration Tam Tamamlama (~60 dk, bug-fixer opus)
  │
  ├─ Task 138-005: Layer 4 Runtime Wire Forensic Fix (~60 dk, bug-fixer opus)
  │
  └─ Task 138-008: Long-Running Sprint Resume Capability MVP (~45 dk, architect sonnet)

Wave 4 — Recovery + Vizyon Batch 2 (3-parallel, ~60 dk wall time)
  ├─ Task 138-006: Auto-Archive Partial Regression Fix (~25 dk, refactorer sonnet)
  │    (Task 5 sonrası sprint-finalizer.ts üzerine yazar)
  │
  ├─ Task 138-007: Worker Honest Assessment Calibration v2 (~50 dk, architect sonnet)
  │    (Task 2 Auditor Authority API kullanır, Wave 2 tam bitmiş olmalı)
  │
  └─ Task 138-009: MCP/CLI Parity Audit (OPSİYONEL, ~30 dk, code-reviewer sonnet)
       Capacity permitting — drop edilebilir Sprint 139'a
```

**Toplam tahmin:** 6-7 saat natural execution, 7 saat (25200000 ms) hard cap.

### 5.2 Wave Barrier Rationale

**Wave 1 strict sequential (Task 0 → Task 1):** Task 1 (ADR-035) Task 0'ın MADR v3 hibrit format'ını **kullanmalı**. Format yazılmadan ADR yazımı bozuk olur.

**Wave 1 → Wave 2 barrier:** Task 2+3 ADR-035 protokolünü implement eder. ADR yazılmadan implementation belirsizdir.

**Wave 2 intra-sequential (Task 2 → Task 3):** Her iki task `auditor.ts` + `sprint-finalizer.ts`'e yazar. File collision riski → sequential zorunlu.

**Wave 2 → Wave 3 barrier:** Task 7 (Worker Honest v2) Task 2'nin Auditor Authority API'sini kullanır → Wave 4'te olması gerekli (Wave 2 tam bitsin).

**Wave 3 parallel (Task 4 + 5 + 8):** Task 4 `tests/orchestra/` (bağımsız), Task 5 `sprint-finalizer.ts` (Task 6 ile çakışma Wave 4 bekler), Task 8 `sprint-spawner.ts` + yeni `checkpoint.ts` (bağımsız). 3 worker slot dolu, paralel.

**Wave 4 parallel (Task 6 + 7 + 9):** Task 6 `sprint-finalizer.ts` (Task 5 sonrası sequential cross-wave), Task 7 `worker.ts` + `task-builder.ts` + `result-evaluator.ts` (bağımsız), Task 9 audit-only.

### 5.3 File Conflict Matrix

| Task | Primary Files | Wave | Collision Risk |
|------|--------------|------|----------------|
| 0 | `.brain/DECISIONS.md`, `DECKENT.md`, `.claude/rules/`, `scripts/adr-validator.mjs`, `task-builder.ts` | W1 | — (W1 intra sequential) |
| 1 | `.brain/DECISIONS.md` | W1 | ⚠ Task 0 ile — W1 sequential |
| 2 | `auditor.ts`, `result-evaluator.ts`, `sprint-finalizer.ts` | W2 | — (W2 intra sequential) |
| 3 | `auditor.ts`, `sprint-finalizer.ts`, yeni `event-stream.ts`, `file-lock.ts`, `sprint-spawner.ts`, `worker.ts` | W2 | ⚠ Task 2 ile — W2 sequential |
| 4 | `tests/orchestra/**` | W3 | — |
| 5 | `sprint-finalizer.ts`, `observability.ts` | W3 | ⚠ Task 6 ile — W3→W4 cross-wave sequential |
| 6 | `sprint-finalizer.ts`, `sprint-docs-helpers.ts` | W4 | ⚠ Task 5 sonrası |
| 7 | `worker.ts`, `task-builder.ts`, `result-evaluator.ts` | W4 | — |
| 8 | `sprint-spawner.ts`, yeni `sprint-checkpoint.ts`, `src/cli/commands/resume.ts` | W3 | — |
| 9 | `docs/audits/sprint-138/` (audit-only) | W4 | — |

**Meta-dogfood beklentisi:** Task 3 Plan-Time Scope Collision Detection canlı olduktan sonra, yukarıdaki çakışma matrisi **manuel değil otomatik** yönetilmeli. Sprint 138'in kendi DIRECTIVES'indeki Task 5 ↔ Task 6 `sprint-finalizer.ts` collision'ı Brain planner tarafından tespit edilir ve otomatik sequentialize edilir. Eğer bu çalışıyorsa Sprint 138 ikinci meta-dogfood canlı kanıt.

### 5.4 Coordinator Model

- **Backend:** Docker (Sprint 136-137-138 devam)
- **Brain planning:** structured (Sprint 136-137-138 devam)
- **max_workers:** 3 (Sprint 136-137 override devam)
- **autoApprove:** true
- **force:** true (Sprint 138 fresh)
- **Timeout:** 25200000 ms (7 saat hard cap)

### 5.5 Timeout Policy

| Level | Timeout | Aksiyon |
|-------|---------|---------|
| Task heartbeat stale | >2 dk | Auditor alert |
| Task execution hard | 90 dk | Kill worker, Brain NO_GO |
| Wave 1 total | 75 dk | Hard kill, manuel recovery |
| Wave 2 total | 180 dk | Hard kill, Task 2+3 mimari kritik |
| Wave 3 per task | 60 dk | Hard kill, bağımsız NO_GO |
| Wave 4 per task | 60 dk | Hard kill, bağımsız NO_GO |
| **Sprint total** | **420 dk (7 saat)** | `deckent_start timeout: 25200000` |

---

## 6. Task Specifications

### Task 138-000 — ADR Governance Integration

- **Agent:** architect
- **Model:** opus
- **Effort:** normal
- **Priority:** CRITICAL
- **Dependencies:** yok (Sprint 138 ilk task)
- **Skills:** typescript-expert, documentation-writer
- **Scope:** `.brain/`, `DECKENT.md`, `.claude/rules/`, `scripts/`, `src/orchestra/task-builder.ts`, `tests/scripts/`, `tests/orchestra/`
- **Wave:** 1

**Files:**
- Modify: `.brain/DECISIONS.md` (35 ADR'ye Status alanı, ADR-022 duplicate temizle, ADR-005 deprecated)
- Modify: `DECKENT.md` (`@.brain/DECISIONS.md` import ekle — CLAUDE.md'ye **eklemez**, ADR-013 DECKENT.md Adapter Pattern zincir)
- Modify: `.claude/rules/brain.md` + `.claude/rules/worker-default.md` (ADR mandatory read + violation rule)
- Modify: `src/orchestra/task-builder.ts` (worker prompt template ADR injection)
- Create: `scripts/adr-validator.mjs` (~150-200 LoC)
- Create: `tests/scripts/adr-validator.test.ts` (yeni, 5+ test)
- Modify: `tests/orchestra/task-builder.test.ts` (worker prompt ADR injection test)

**Description:**

Sprint 138'in **gerçek başlangıcı**. 4 alt-iş:

**Alt-iş A: ADR Format Audit & Migration (MADR v3 hibrit)**

Mevcut 35 ADR'ye **`**Status:**`** alanı ekle (Title'dan sonra, Decision'dan önce). Default: `accepted`.

Explicit exception'lar:
- **ADR-005** "Synchronous I/O" → `Status: deprecated`. Not: "Sprint 132 audit'te CRITICAL #1 olarak işaretlendi, Sprint 141+ async I/O full migration planlanıyor. Mevcut hot path'ler hâlâ sync ama yeni kod async olmalı."
- **ADR-022** ilk entry (sat 151) → `Status: superseded`, `**Superseded by:** ADR-022 (Sprint 085 update)`
- **ADR-022** ikinci entry (sat 218) → `Status: accepted`, `**Supersedes:** ADR-022 (Sprint 067)`

MADR v3 hibrit format:
- **Zorunlu alanlar:** Title, Status, Decision, Context, Consequence
- **Opsiyonel alanlar serbest:** Alternatives considered, Superseded by, Supersedes, References, Cost, Security, i18n impact

**Idempotency:** Script tekrar çalıştırılırsa aynı çıktıyı verir (Status zaten varsa dokunma).

**Alt-iş B: Mandatory Read Wiring (DECKENT.md only — ADR-013 pattern)**

`DECKENT.md` içine:
```markdown
## Mandatory Architecture Rules
@.brain/DECISIONS.md
```

**CLAUDE.md'ye eklenmez** — ADR-013 DECKENT.md Adapter Pattern gereği provider-specific dosyalar (CLAUDE.md, AGENTS.md, GEMINI.md) zaten DECKENT.md'yi import eder, zincir otomatik. Multi-provider consistency.

`.claude/rules/brain.md` güncellemesi:
```markdown
- Before planning any task, read .brain/DECISIONS.md
- Accepted ADRs are INVIOLABLE rules for all workers
- If a task requires violating an ADR, propose a new ADR or Status change instead
```

`.claude/rules/worker-default.md` yeni bölüm:
```markdown
## ADR Compliance
- Read .brain/DECISIONS.md before starting any task
- All accepted ADRs are MANDATORY rules
- Violation requires NO_GO with specific ADR citation + new ADR proposal
- Deprecated ADRs may be ignored
```

`src/orchestra/task-builder.ts` worker prompt injection:
```typescript
const adrContent = readFileSync('.brain/DECISIONS.md', 'utf-8');
prompt += `\n\n## Architecture Decisions (MANDATORY READ)\n\n${adrContent}\n\n`;
prompt += `\n## ADR Compliance Rule\nAll accepted ADRs above are INVIOLABLE. Violation requires NO_GO with specific citation.\n`;
```

**Alt-iş C: Parser + Validator Script (`scripts/adr-validator.mjs`)**

~150-200 LoC:
- Markdown parse: `## ADR-NNN: Title` başlık bulma, ADR bloğu ayrıştırma
- Structure validation: zorunlu alanlar (Title, Status, Decision, Context, Consequence)
- Status validation: `accepted | proposed | deprecated | superseded` enum
- Duplicate ID detection
- Status transition check (superseded ↔ bidirectional)
- Exit codes: 0 valid, 1 structural error, 2 semantic error
- Report: JSON (`--json` flag) veya human-readable

Usage:
```bash
node scripts/adr-validator.mjs
# "✓ 35 ADRs parsed, 33 accepted, 1 deprecated (ADR-005), 1 superseded (ADR-022 old), 0 errors"

# package.json: "lint:adr": "node scripts/adr-validator.mjs"
```

Test dosyası 5+ test: valid parse, missing required field, invalid status, duplicate ID, superseded chain bidirectional.

**Alt-iş D: ADR Naming Split Dokümantasyonu**

- `.brain/DECISIONS.md` → **ADR** (Architecture Decision Record, project-wide governance, MADR v3, mandatory read)
- `.deckent/decisions/*.json` → **SDL** (Sprint Decision Log, tactical sprint decisions, audit trail, not mandatory)

`DECKENT.md`'ye kısa bölüm:
```markdown
## Decision Records
- **ADR** (`.brain/DECISIONS.md`): Architecture-wide rules, MADR v3 format, mandatory read
- **SDL** (`.deckent/decisions/*.json`): Per-sprint tactical decisions, audit trail, not mandatory read
```

**Alt-iş E: ADR-036 — ADR Governance Standard (Self-Referential)**

Task 0'ın kendisini dokümante eden yeni ADR. Kullanıcıların kendi projelerinde ADR workflow'unu anlamak için referans ADR.

```markdown
## ADR-036: ADR Governance Standard (Sprint 138)

**Status:** accepted

**Decision:** Deckent projelerinde architecture decisions `.brain/DECISIONS.md` içinde MADR v3 hibrit format kullanılır. Worker'lar task'a başlamadan önce ADR'leri zorunlu okur, accepted ADR'leri ihlal edemez, ihlal gerekirse NO_GO + yeni ADR önerisi yazar. Auditor accepted ADR'lerin enforcement rule'larını worker kodu üzerinde kontrol eder.

**Context:** Sprint 134-137 boyunca 35 ADR yazıldı ama worker'lar bu ADR'leri okumuyordu, auditor enforcement yapmıyordu. ADR-005 Synchronous I/O hâlâ "accepted" ama Sprint 132'den beri ihlal ediliyor — governance kopuk. Kullanıcılar açık repoya geçtiğimizde kendi ADR'lerini yazıp Deckent'tan uygulatmasını bekleyecek. Sprint 138 bu gap'i kapatır.

**Consequence:**
1. MADR v3 hibrit format: zorunlu alanlar (Title, Status, Decision, Context, Consequence) + opsiyonel serbest
2. Status enum: accepted | proposed | deprecated | superseded
3. Worker prompt'una ADR content injection zorunlu (`task-builder.ts`)
4. Auditor pilot ADR'ler için enforcement rule check (Sprint 138'de 3-5 pilot: ADR-006, ADR-008, ADR-010)
5. `scripts/adr-validator.mjs` format + structure validation (`npm run lint:adr`)
6. `.brain/DECISIONS.md` (ADR, governance) vs `.deckent/decisions/*.json` (SDL, sprint tactical) naming split
7. Kullanıcılar açık repoda kendi ADR'lerini yazar, Deckent uygular — product feature

**Alternatives considered:**
- Tam MADR v3 strict (Rationale + Alternatives zorunlu): overkill, mevcut 35 ADR regresyonu büyük
- Y-Statements tek cümle: ultra-minimal, community yaygınlığı düşük
- ADR'siz enforcement (sadece code patterns): transparanlık yok, kullanıcı kontrolü yok

**References:**
- Sprint 138 Task 138-000: ADR Governance Integration (bu ADR'nin implementation'u)
- Sprint 138 Task 138-002 Alt-iş C: ADR compliance check (auditor enforcement)
- MADR v3 spec: https://adr.github.io/madr/
- Michael Nygard ADR template: klasik 3-alan + Status
```

Bu ADR Task 0'ın **self-dokümante** olmasını sağlar — Task 0 kodu yazarken ADR-036'yı da kendisinin kurduğu format'ta yazıyor. Meta-doğrulama: ADR-036 yazıldıktan sonra `npm run lint:adr` validator ADR-036'yı onaylamalı (kendi ADR'si kendi validator'ından geçer).

**Kanıt:**
- `grep -c "^\*\*Status:\*\*" .brain/DECISIONS.md` → ≥36 (35 migrate + 1 yeni ADR-036)
- `grep "^## ADR-005" -A5 .brain/DECISIONS.md` → `Status: deprecated`
- `grep "^## ADR-022" .brain/DECISIONS.md | wc -l` → 2 (biri `accepted`, biri `superseded`)
- `grep "^## ADR-036" .brain/DECISIONS.md` → hit (yeni ADR)
- `grep "@\.brain/DECISIONS" DECKENT.md` → 1 hit
- `npm run lint:adr` → exit 0 (ADR-036 kendi validator'ından geçer — meta-doğrulama)
- `npx vitest run tests/scripts/adr-validator.test.ts tests/orchestra/task-builder.test.ts` → 0 fail

**Test:** 6+ test (A+B+C+D+E combined):
1. adr-validator.mjs: valid parse
2. adr-validator.mjs: missing field detect
3. adr-validator.mjs: invalid status detect
4. adr-validator.mjs: duplicate ID detect
5. task-builder.test.ts: worker prompt contains ADR content + ADR Compliance Rule
6. adr-validator.mjs: ADR-036 passes (self-referential meta-doğrulama)

---

### Task 138-001 — ADR-035: Verification Protocol Standard

- **Agent:** architecture-planner
- **Model:** sonnet
- **Effort:** low
- **Priority:** CRITICAL
- **Dependencies:** 138-000 (Task 0 format olmadan ADR yazılamaz)
- **Skills:** documentation-writer
- **Scope:** `.brain/`
- **Wave:** 1

**Files:**
- Modify: `.brain/DECISIONS.md` (ADR-035 entry, Task 0 MADR v3 format)

**Description:**

ADR-035 Brain ↔ Worker ↔ Auditor mesaj protokolü için **tek kaynak**. Bu **dokümantasyon task'ı** — kod değişikliği yok, Task 2+3 bu ADR'yi implement edecek.

**ADR-035 içeriği (MADR v3 hibrit):**

```markdown
## ADR-035: Verification Protocol Standard (Sprint 138)

**Status:** accepted

**Decision:** Brain, Worker ve Auditor arasındaki tüm iletişim versiyonlanmış bir mesaj protokolü üzerinden yapılır. Dosya tabanlı state (`.hb`, `.result`) paralel devam eder ama **event stream kanonik truth** olur. Tüm mesajlar append-only event log'a yazılır, parseable format kullanır, fail-safe fallback içerir.

**Context:** Sprint 134-137 boyunca Brain ↔ Worker ↔ Auditor iletişimi dosya tabanlı idi. Race condition'a açık (Sprint 137 Docker HB bug), reconciliation zor (Sprint 136 chicken-egg), audit trail eksik. Kullanıcılar manuel verification yapmak zorunda kalıyor, kur-çalıştır vizyonuna zıt.

**Consequence:**
1. Event stream kanonik (`.deckent/sprint-NNN-events.jsonl`)
2. Kanal kodları zorunlu (her mesaj `BRAIN→WORKER:TASK_ASSIGN` gibi code taşır)
3. Versiyonlanmış protokol (`protocol_version: "1.0"`)
4. Fail-safe fallback (event stream write fail → file-based devam)
5. Backward compat (Sprint 138'de file-based paralel, Sprint 140+ soft-deprecate)
6. Sprint 142'de `.hb/.result` removed

### Protocol Version 1.0 — Kanal Kodları

| Kanal Code | Source → Target | Payload |
|------------|----------------|---------|
| `BRAIN→WORKER:TASK_ASSIGN` | Brain → Worker | {taskId, scope, agent, skills, model, timeout} |
| `WORKER→BRAIN:HEARTBEAT` | Worker → Brain | {workerId, taskId, status, sequence, phase} |
| `WORKER→BRAIN:RESULT` | Worker → Brain | {taskId, selfAssessment, filesChanged, notes} |
| `WORKER→BRAIN:QUESTION` | Worker → Brain | {taskId, question, context} |
| `BRAIN→WORKER:ANSWER` | Brain → Worker | {taskId, answer, authority} |
| `WORKER→AUDITOR:CODE_VERIFY_REQUEST` | Worker → Auditor | {taskId, filesChanged, evidence} |
| `AUDITOR→BRAIN:VERIFICATION_RESULT` | Auditor → Brain | {taskId, verdict, status, reason} |
| `AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED` | Auditor → Brain | {taskId, conflictingFiles, otherTaskId} |
| `AUDITOR→BRAIN:ADR_VIOLATION` | Auditor → Brain | {taskId, adrNumber, violationDetails} |
| `AUDITOR→BRAIN:GATE_COMPUTED` | Auditor → Brain | {sprintId, overallGate, scores} |
| `AUDITOR→BRAIN:LOAD_REPORT_WRITTEN` | Auditor → Brain | {sprintId, reportPath} |
| `BRAIN→*:METRIC_EMITTED` | Brain → All | {metric, value, context} |
| `BRAIN→WORKER:FIX_REQUEST` | Brain → Worker | {taskId, originalTaskId, fixReason} |
| `BRAIN→*:SPRINT_PHASE_CHANGE` | Brain → All | {sprintId, oldPhase, newPhase, timestamp} |
| `DECKENT→USER:NOTIFY` | Deckent → User | {priority, title, summary, details} |

### Message Format (JSON)

{
  "timestamp": "2026-04-14T12:34:56.789Z",
  "sequence": 42,
  "protocol_version": "1.0",
  "source": "brain",
  "target": "worker-138-001",
  "channel": "BRAIN→WORKER:TASK_ASSIGN",
  "payload": { ... }
}

**Alternatives considered:**
- gRPC/Protocol Buffers: overkill, dependency cost
- WebSocket duplex: Docker backend complexity
- Redis pub/sub: external service dependency, vision contradiction
- SQLite event store: iyi seçenek ama JSON-lines kadar basit değil

**References:**
- Sprint 135 T-004: askBrain extraction (IPC pattern seed)
- Sprint 136 Task 3: tryCodeVerifiedDone helper (code-aware reconciliation seed)
- Sprint 137 meta-dogfood: helper canlı çalıştı, retrospektif DONE relabel
```

**Not:** `DECKENT→USER:NOTIFY` kanalı Sprint 138'de sadece **protocol tanımlı**, dispatcher Sprint 139'da implement edilir (`project_sprint139_notification_dispatcher.md` memory).

**Kanıt:**
- `grep "^## ADR-035" .brain/DECISIONS.md` → hit
- `node scripts/adr-validator.mjs` → exit 0 (Task 0 validator Task 1 output'unu onaylamalı — **ilk canlı dogfood**)

**Test:** Yok (salt doc, adr-validator.mjs otomatik validation yeterli).

---

### Task 138-002 — Auditor Authority Extension

- **Agent:** architect
- **Model:** opus
- **Effort:** normal
- **Priority:** CRITICAL
- **Dependencies:** 138-001 (ADR-035 olmadan implementation belirsiz)
- **Skills:** typescript-expert, testing-expert
- **Scope:** `src/monitor/`, `src/orchestra/`, `tests/monitor/`, `tests/orchestra/`
- **Wave:** 2

**Files:**
- Modify: `src/monitor/auditor.ts` (650 → ~950 LoC, +~300)
- Modify: `src/orchestra/result-evaluator.ts` (1033 → ~750 LoC, -~280 helper extraction)
- Modify: `src/orchestra/sprint-finalizer.ts` (957 LoC, helper call path update)
- Modify: `tests/monitor/auditor.test.ts` (yeni test'ler)
- Modify: `tests/orchestra/result-evaluator.test.ts` (helper artık auditor'da, integration update)

**Description:**

Auditor passive scanner → active verifier. Worker self-assessment doğrulama (3-pipeline), ADR ihlal yakalama, event stream hook.

**Alt-iş A: tryCodeVerifiedDone Helper Migration**

Sprint 136'da yazılan helper (`result-evaluator.ts:729`) Sprint 137'de `sprint-finalizer.ts:493`'den canlı çağrıldı. Sprint 138'de auditor'a taşınacak — "code verification" auditor'ın doğal sorumluluğu.

1. `tryCodeVerifiedDone()` + helpers `result-evaluator.ts` → `auditor.ts`
2. `sprint-finalizer.ts:493` import path update: `from '../monitor/auditor.js'`
3. `result-evaluator.ts` sadece brain label evaluation logic tutar
4. **Sprint 137 meta-dogfood regression test** — helper hâlâ çalışmalı

**Alt-iş B: 3-Pipeline Verification (KILLER FEATURE)**

```typescript
export async function verifyWorkerResult(
  taskId: string, projectRoot: string, result: WorkerResult,
): Promise<VerificationResult> {
  switch (result.selfAssessment) {
    case 'NO_GO':
      return await tryCodeVerifiedDone(taskId, projectRoot);
    case 'GO_WITH_TECH_DEBT':
      return await validateTechDebt(taskId, projectRoot, result);
    case 'DONE':
      return await verifyFunctional(taskId, projectRoot, result);
  }
}

async function verifyFunctional(
  taskId: string, projectRoot: string, result: WorkerResult,
): Promise<VerificationResult> {
  const affectedTests = inferAffectedTests(result.filesChanged);
  if (affectedTests.length === 0) return { verdict: 'PASS', reason: 'no tests' };
  
  const vitestResult = await runVitestOnFiles(affectedTests);
  if (vitestResult.fail === 0) return { verdict: 'PASS', reason: 'all tests pass' };
  
  return {
    verdict: 'DOWNGRADE',
    newStatus: 'GO_WITH_TECH_DEBT',
    reason: `${vitestResult.fail} tests still failing`,
  };
}
```

**Sprint 137 Task 137-001 canlı kanıt:** Worker `status: DONE` dedi, helper `CODE_VERIFIED_DONE` flag bastı, ama gerçek vitest 63 fail kaldı. Sprint 138'de `verifyFunctional` bu kısayolu kırar — functional runtime check.

**Alt-iş C: ADR Compliance Check**

```typescript
export async function checkADRCompliance(
  projectRoot: string, changedFiles: string[],
): Promise<ADRViolation[]> {
  const adrs = parseADRs('.brain/DECISIONS.md');
  const violations: ADRViolation[] = [];
  
  for (const adr of adrs.filter(a => a.status === 'accepted')) {
    if (!adr.enforcementRule) continue;
    const violation = await checkRule(adr.enforcementRule, changedFiles, projectRoot);
    if (violation) violations.push({ adrNumber: adr.number, ...violation });
  }
  
  return violations;
}
```

**Pilot ADR'ler (Sprint 138 için sadece 3-5):**
- ADR-006 `spawnSync + array args` → rule: `grep "spawnSync.*shell.*true"` = hit → violation
- ADR-008 Brain merkezi import → rule: `grep "from.*brain" src/orchestra/tmux.ts src/monitor/auditor.ts src/agents/worker.ts` = hit → violation
- ADR-010 Tek runtime dependency → rule: `package.json` dependencies count check

Diğer ADR'ler Sprint 139+'da kademeli.

**Alt-iş D: Event Stream Hook Point**

Task 3 ile koordine — auditor event write hook'ları koyar:

```typescript
import { writeEvent } from '../orchestra/event-stream.js'; // Task 3'te oluşacak

writeEvent(projectRoot, {
  source: 'auditor',
  target: 'brain',
  channel: 'AUDITOR→BRAIN:VERIFICATION_RESULT',
  payload: { taskId, verdict, status, reason },
});
```

**Kanıt:**
- `grep -n "tryCodeVerifiedDone" src/monitor/auditor.ts` → hit
- `grep -n "tryCodeVerifiedDone" src/orchestra/result-evaluator.ts` → **miss**
- `grep -n "verifyFunctional" src/monitor/auditor.ts` → hit
- `grep -n "checkADRCompliance" src/monitor/auditor.ts` → hit
- Sprint 138 execute: ≥1 task'ın `DONE → TECH_DEBT downgrade` canlı yakalanması (functional check)

**Test:** 7+ test:
1. Helper migration regression
2. `verifyFunctional` happy path (vitest pass → DONE confirm)
3. `verifyFunctional` partial fail → TECH_DEBT downgrade
4. `verifyFunctional` no affected tests → PASS (edge case)
5. `verifyWorkerResult` 3-pipeline dispatch
6. `checkADRCompliance` ADR-006 violation detect
7. `checkADRCompliance` no violation happy path

---

### Task 138-003 — Structured Event Stream + Plan-Time Scope Collision Detection

- **Agent:** architect
- **Model:** opus
- **Effort:** **high**
- **Priority:** HIGH
- **Dependencies:** 138-002 (aynı dosyalara yazar — auditor.ts, sprint-finalizer.ts)
- **Skills:** typescript-expert, testing-expert
- **Scope:** `src/orchestra/`, `src/core/`, `src/monitor/`, `src/agents/`, `tests/`
- **Wave:** 2

**Files:**
- Create: `src/orchestra/event-stream.ts` (~200 LoC yeni)
- Modify: `src/core/file-lock.ts` (30 → ~200 LoC, real implementation — şu an placeholder/boş)
- Modify: `src/orchestra/conflict-resolver.ts` (147 → ~250 LoC, pre-emptive genişleme)
- Modify: `src/orchestra/sprint-spawner.ts` (316 LoC, collision-aware planning)
- Modify: `src/agents/worker.ts` (1206 LoC, acquireLock runtime delegate + event write)
- Modify: `src/monitor/auditor.ts` (event write integration, Task 2 sonrası)
- Create: `tests/orchestra/event-stream.test.ts`
- Modify: `tests/core/file-lock.test.ts` veya yeni
- Modify: `tests/orchestra/sprint-spawner.test.ts` (collision detection test)

**Description:**

Sprint 138'in **teknik omurgası**. 5 alt-iş:

**Alt-iş A: Event Stream (src/orchestra/event-stream.ts)**

```typescript
export interface DeckentEvent {
  timestamp: string;
  sequence: number;
  protocol_version: '1.0';
  source: 'brain' | 'worker' | 'auditor' | string;
  target: string;
  channel: string; // ADR-035 kanal codes
  payload: unknown;
}

export function writeEvent(projectRoot: string, event: Omit<DeckentEvent, 'timestamp' | 'sequence'>): void {
  // Append to .deckent/sprint-NNN-events.jsonl
  // Auto-fill timestamp + sequence (atomic counter)
  // Fail-safe: write fail → console.warn, don't throw
}

export function readEvents(projectRoot: string, filter?: EventFilter): DeckentEvent[] {
  // Read, optionally filter
}

export function reconstructState(projectRoot: string, sprintId: string): SprintState {
  // Replay events to reconstruct sprint state
}
```

**Fail-safe:** Event write fail → `console.warn` + file-based fallback.
**Backward compat:** Sprint 138'de `.hb/.result` paralel devam.

**Alt-iş B: File Lock Real Implementation (src/core/file-lock.ts)**

Şu an 30 satır, 0 export (placeholder). Sprint 138'de ~200 LoC real:

```typescript
export interface LockInfo {
  filePath: string;
  ownerWorkerId: string;
  acquiredAt: string;
  taskId: string;
  ttl?: number;
}

export function acquireLock(projectRoot, filePath, ownerWorkerId, taskId): LockInfo | null { ... }
export function releaseLock(projectRoot, lockInfo): void { ... }
export function checkLocks(projectRoot): LockInfo[] { ... }
export function clearStaleLocks(projectRoot, maxAgeMs): number { ... }
```

**Mevcut `worker.ts:173 acquireLock` delegation** — runtime lock merkezi core'a taşınır, worker logic sadece delegate eder.

**Alt-iş C: Plan-Time Scope Collision Detection (sprint-spawner.ts)**

```typescript
export function detectScopeCollisions(tasks: Task[]): CollisionMap {
  const collisions: CollisionMap = new Map();
  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      const intersection = intersectFilesWrite(tasks[i], tasks[j]);
      if (intersection.length > 0) {
        // Record collision both ways
      }
    }
  }
  return collisions;
}

export function buildCollisionAwareWaves(tasks: Task[], maxWorkers: number): Wave[] {
  // Topological sort with collision edges + Dependencies field (Sprint 137 parser)
  // Priority-based selection within wave
}
```

**Meta-dogfood:** Sprint 138 DIRECTIVES'te Task 5 (`sprint-finalizer.ts`) + Task 6 (`sprint-finalizer.ts`) = collision. Brain `detectScopeCollisions()` bunu yakalar → Task 5 Wave 3, Task 6 Wave 4 otomatik. **Manuel wave barrier ihtiyacı ortadan kalkar** (Sprint 138'in kendi pattern'ında canlı dogfood).

**Alt-iş D: Runtime Lock + Event Write Hook (worker.ts + auditor.ts)**

- `worker.ts`: File write öncesi `acquireLock()` + event write (`WORKER→BRAIN:FILE_LOCK_ACQUIRED`)
- `auditor.ts`: Scan loop'ta lock state event (`AUDITOR→BRAIN:LOCK_STATE_SNAPSHOT`)

**Alt-iş E: Collision Event Integration**

Collision detection event stream'e yazılır:
```typescript
writeEvent(projectRoot, {
  source: 'auditor',
  target: 'brain',
  channel: 'AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED',
  payload: { taskId, conflictingFiles, otherTaskId },
});
```

Brain wave scheduling dinamik.

**Kanıt:**
- `wc -l src/core/file-lock.ts` → ≥150
- `grep -n "acquireLock" src/orchestra/sprint-spawner.ts` → hit (plan-time)
- `ls .locks/` Sprint 138 execute sırasında dolu
- `ls .deckent/sprint-138-events.jsonl` runtime oluştu
- `wc -l .deckent/sprint-138-events.jsonl` → ≥50
- `grep "SCOPE_COLLISION_DETECTED" .deckent/sprint-138-events.jsonl` → hit (**canlı dogfood**)
- Brain Sprint 138 planning'de Task 5 ve Task 6'yı farklı wave'e koymuş

**Test:** 9+ test:
1. Event stream write + read roundtrip
2. State reconstruction from events
3. Event stream fail-safe
4. File lock acquire basic
5. File lock collision (2 workers same file)
6. Stale lock cleanup
7. `detectScopeCollisions` 2 task same file
8. `detectScopeCollisions` non-collision parallel
9. `buildCollisionAwareWaves` topological ordering
10. Docker bind mount lock integration

---

### Task 138-004 — Test Restoration Tam Tamamlama

- **Agent:** bug-fixer
- **Model:** opus
- **Effort:** normal
- **Priority:** CRITICAL
- **Dependencies:** 138-000 (ADR injection worker'lara gerekli)
- **Skills:** testing-expert, typescript-expert
- **Scope:** `tests/orchestra/`, `tests/e2e/`, `tests/docs/`
- **Wave:** 3

**Files (10 fail test dosyası):**
- `tests/orchestra/runsprint-debt-integration.test.ts`, `brain-rollback.test.ts`, `sprint2-debt.test.ts`, `sprint-controller.test.ts`, `dependency-pipeline.test.ts`, `agent-activation.test.ts`, `brain-provider.test.ts`, `spawn-prevention.test.ts`, `plan-improvements.test.ts`, `brain.test.ts` (1 timeout kalan) + `tests/e2e/docker-backend.test.ts`, `tests/docs/jsdoc.test.ts`

**Description:**

Sprint 137 Task 137-001 worker + FIX worker 60 test fix yaptı (123 → 63). Sprint 138'de kalan 63 temizlenecek. Aynı pattern: Task 8 refactor barrel re-export mock path update.

**Strateji:** Sprint 137 Task 137-001 worker'ın yazdığı fix pattern'ı (brain.test.ts mock update) diğer dosyalara uygula. Worker `npx vitest run <dosya>` ile fail sebebini okur, pattern match, fix.

**Hedef:** 63 → 0, 12658 → ≥12721, 10 fail file → 0.

**Kanıt:** `npx vitest run --reporter=basic 2>&1 | tail -5` → `Test Files 512 passed`, `Tests 0 failed | 12721+ passed`

**Test:** Baseline = kanıt

---

### Task 138-005 — Layer 4 Runtime Wire Forensic Fix

- **Agent:** bug-fixer
- **Model:** opus
- **Effort:** normal
- **Priority:** CRITICAL
- **Dependencies:** 138-003 (event stream hook için)
- **Skills:** typescript-expert
- **Scope:** `src/orchestra/`, `src/core/`, `tests/orchestra/`
- **Wave:** 3

**Files:**
- Modify: `src/orchestra/sprint-finalizer.ts` (forensic debug + fix)
- Modify: `src/core/observability.ts` (generateLoadReport call path)
- Modify: `tests/orchestra/sprint-finalizer.test.ts`

**Description:**

Sprint 136-137 üst üste 3-sprint runtime fail. Worker "wire satır 10b/10c'de" diyor ama runtime artifact 0/3.

**Forensic hipotezler:**
1. `finalizeSprint()` erken exit (koşul return hook'tan önce)
2. Hook path broken (Task 8 refactor import chain kırık)
3. Silently swallowed error (try-catch eat)

**Fix:** Breadcrumb logging eklenir, runtime'da hangi adım eksikse görülür, doğru hipotez bulunur, fix uygulanır. Breadcrumb logging permanent.

**Event stream integration (Task 3 sonrası):** gate.json + load-report write event stream'e de yazılır (`GATE_COMPUTED`, `LOAD_REPORT_WRITTEN`, `METRIC_EMITTED`).

**Kanıt:**
- `.deckent/sprint-138-gate.json` runtime oluştu
- `docs/audits/sprint-138/load-test-report.md` runtime oluştu
- `.deckent/sprint-138-metrics.jsonl` ≥30 satır
- Event stream'de 3 event (GATE_COMPUTED, LOAD_REPORT_WRITTEN, METRIC_EMITTED)

**Test:** 4+ test (gate.json, load-report, metrics integration, fail-safe)

---

### Task 138-006 — Auto-Archive Partial Regression Fix

- **Agent:** refactorer
- **Model:** sonnet
- **Effort:** low
- **Priority:** HIGH
- **Dependencies:** 138-005 (aynı dosya — sprint-finalizer.ts)
- **Skills:** typescript-expert
- **Scope:** `src/orchestra/`, `tests/orchestra/`
- **Wave:** 4

**Files:**
- Modify: `src/orchestra/sprint-finalizer.ts` (archive hook)
- Modify: `src/orchestra/sprint-docs-helpers.ts` (Sprint 135 T-010 extract)
- Modify: `tests/orchestra/` test dosyası

**Description:**

Sprint 135-136 auto-archive redemption, Sprint 137 partial regression:
- `.brain/sprints/sprint-137.md` ✅
- `.brain/archive/DIRECTIVES-sprint-137.md` ❌
- `DIRECTIVES.md` Sprint 138 reset ❌ (manuel yapıldı)

Root cause hipotezi: Task 8 refactor yan etkisi, Task 5 fix ile aynı alan. Task 6 specific olarak archive kısmı.

Fix: 3 adımın hepsi otomatik:
1. Sprint log write ✅
2. DIRECTIVES archive write ❌ → fix
3. DIRECTIVES reset (Sprint NEXT template) ❌ → fix

**Kanıt:**
- Sprint 138 finalize sonrası otomatik:
  - `.brain/sprints/sprint-138.md` ✅
  - `.brain/archive/DIRECTIVES-sprint-138.md` ✅
  - `DIRECTIVES.md` Sprint 139 template ✅

**Test:** 3+ test (sprint log, DIRECTIVES archive, DIRECTIVES reset)

---

### Task 138-007 — Worker Honest Assessment Calibration v2

- **Agent:** architect
- **Model:** sonnet
- **Effort:** normal
- **Priority:** HIGH
- **Dependencies:** 138-002 (Auditor Authority API)
- **Skills:** typescript-expert, testing-expert
- **Scope:** `src/agents/`, `src/orchestra/`, `tests/`
- **Wave:** 4

**Files:**
- Modify: `src/agents/worker.ts` (verify loop sertleştirme)
- Modify: `src/orchestra/task-builder.ts` (prompt template baseline diff)
- Modify: `src/orchestra/result-evaluator.ts` (TECH_DEBT downgrade logic)
- Modify: tests

**Description:**

Sprint 137 canlı kanıt (`feedback_worker_honest_assessment.md`): Task 137-001 worker `status: DONE exitCode: 0` yazdı ama %39 functional. Worker'lar "kod var → DONE" kısayolu. Sprint 138 kalibre.

**Alt-iş A: Worker Prompt Template Baseline Diff Instruction**

`task-builder.ts`'e worker prompt'a eklenir:
```
## Honest Self-Assessment Required

Before writing .result with selfAssessment: DONE, you MUST verify:
1. Baseline state: what was the test/code state before your work?
2. End state: what is it now?
3. Delta: how much of the task did you ACTUALLY complete?

If you completed <80%, write selfAssessment: GO_WITH_TECH_DEBT with specific gap.
If you completed <50%, write selfAssessment: NO_GO with explanation.

"DONE" means: functional outcome matches task spec fully.
"Code written" ≠ "DONE".
```

**Alt-iş B: Worker Verify Loop Sertleştirme**

`worker.ts enforceVerifyLoop()` genişlemesi:
- Test command auto-detect (vitest/jest)
- Baseline delta: start'ta filesChanged baseline count, end'de actual
- Delta < 80% → auto TECH_DEBT downgrade
- `.tasks/{id}.verify-delta.json` kanıt dosyası

**Alt-iş C: result-evaluator.ts TECH_DEBT Downgrade Logic**

Task 2 `verifyFunctional` zaten partial → TECH_DEBT downgrade. Task 7 bu logic'i result-evaluator'da **çift katman** olarak ekler.

**Kanıt:**
- `grep "Honest Self-Assessment" src/orchestra/task-builder.ts` → hit
- `grep "verify-delta" src/agents/worker.ts` → hit
- Sprint 138 execute: ≥1 downgrade canlı yakalanmalı
- rubricScores honest

**Test:** 5+ test (prompt injection, verify loop baseline, downgrade, full completion, 0% NO_GO)

---

### Task 138-008 — Long-Running Sprint Resume Capability MVP

- **Agent:** architect
- **Model:** sonnet
- **Effort:** normal
- **Priority:** HIGH
- **Dependencies:** yok (bağımsız)
- **Skills:** typescript-expert, system-architect
- **Scope:** `src/orchestra/`, `src/cli/`, `tests/orchestra/`
- **Wave:** 3

**Files:**
- Create: `src/orchestra/sprint-checkpoint.ts` (~150 LoC)
- Modify: `src/orchestra/sprint-spawner.ts` (checkpoint write hook)
- Create: `src/cli/commands/resume.ts`
- Create: `tests/orchestra/sprint-checkpoint.test.ts`

**Description:**

Sprint 140 (50-task) + Sprint 145 (100-task) zemini. MVP: sprint yarıda kalsa state'ten devam.

**Alt-iş A: Checkpoint Write**

```typescript
export interface SprintCheckpoint {
  sprintId: string;
  checkpointNumber: number;
  timestamp: string;
  completedTasks: string[];
  pendingTasks: string[];
  activeWorkers: WorkerState[];
  brainPhase: SprintPhase;
  eventStreamOffset: number;
}

export function writeCheckpoint(projectRoot, state): void { ... }
export function readCheckpoint(projectRoot, sprintId): SprintCheckpoint | null { ... }
```

**Alt-iş B: Resume Command**

```typescript
// src/cli/commands/resume.ts
program.command('resume <sprintId>').action(async (sprintId) => {
  const checkpoint = readCheckpoint(projectRoot, sprintId);
  if (!checkpoint) exit(1);
  await startSprint({ resumeFrom: checkpoint });
});
```

**Alt-iş C: Integration with Spawner**

`sprint-spawner.ts`: her N=5 task DONE/TD/NO_GO sonrası checkpoint write.

**Scope constraint (Sprint 138 MVP):**
- Checkpoint write ✅
- Basic resume command ✅
- Worker state restoration basic (running kill, pending respawn)
- **NOT included:** mid-worker resume, heartbeat daemon, external state store

Sprint 140'ta genişleyecek.

**Kanıt:**
- `ls src/orchestra/sprint-checkpoint.ts` + `src/cli/commands/resume.ts`
- `.deckent/sprint-138-checkpoint.json` runtime (en az 1 checkpoint)

**Test:** 3+ test (write+read, resume from middle, fresh start fallback)

---

### Task 138-009 — MCP/CLI Parity Audit (OPSİYONEL)

- **Agent:** code-reviewer
- **Model:** sonnet
- **Effort:** low
- **Priority:** NORMAL
- **Dependencies:** yok
- **Skills:** documentation-writer
- **Scope:** `docs/audits/sprint-138/`
- **Wave:** 4

**Files:**
- Create: `docs/audits/sprint-138/mcp-cli-parity-report.md`

**Description:**

ADR-022 enforcement check. Her CLI komutunun MCP tool eşdeğeri var mı? Eksiklik listesi + Sprint 139 debt candidate'ları.

**Opsiyonel:** Kapasite kalırsa. Sprint 138 6-7 saat hard cap, Task 1-8 bitince Task 9 eklenir.

**Kanıt:** `ls docs/audits/sprint-138/mcp-cli-parity-report.md` (eğer yapıldıysa)

**Test:** Yok (audit-only)

---

## 7. Error Handling & Fallback Strategy

### 7.1 Task NO_GO Fallback Chain (4-katman)

```
Worker execution
    ↓
    ├─ DONE → verifyFunctional (Task 2 auditor.ts, Sprint 138 YENİ)
    │           ├─ functional PASS → DONE confirmed
    │           └─ functional FAIL → TECH_DEBT downgrade
    │
    ├─ GO_WITH_TECH_DEBT → validateTechDebt → accept or honest NO_GO
    │
    └─ NO_GO
         ↓
         Brain FIX phase → fix worker
              ↓
              ├─ DONE (functional) → relabel
              └─ NO_GO → tryCodeVerifiedDone (Sprint 137 pattern)
                   ├─ verified=true → CODE_VERIFIED_DONE
                   └─ verified=false → honest NO_GO
```

### 7.2 Wave Barrier Failure Scenarios

**Scenario A:** Task 0 fail → manuel fix, devam
**Scenario B:** Task 1 fail → soft reference, devam
**Scenario C:** Task 2 fail → **en yüksek risk**, Task 7 Sprint 139'a kayar, Sprint 138 scope 10→9
**Scenario D:** Task 3 fail → partial delivery (Alt-iş A sadece event stream, Alt-iş C collision Sprint 139)
**Scenario E:** Wave 3/4 fail → helper retrospektif + bağımsız task'lar devam
**Scenario F:** Coordinator crash → Task 8 Resume Capability (eğer canlıysa), yoksa manuel

### 7.3 Dosya Lock & Conflict (Sprint 138 Ortasında Değişir)

- **Wave 1-2 sırasında:** Manuel wave barrier (Task 3 henüz canlı değil)
- **Wave 3-4 sırasında:** Brain `detectScopeCollisions` canlı → otomatik sequentialize

### 7.4 Timeout Policy

(Section 5.5 referans)

### 7.5 Sprint 137 Meta-Dogfood Regression Monitoring

Task 2 helper migration sonrası `tryCodeVerifiedDone` işlevi bozulmamalı. Integration test zorunlu (Sprint 137 pattern hâlâ çalışıyor).

### 7.6 Rollback Policy

Recovery sprint kurumsal disiplin: rollback yok, commit devam. `git reset --hard` yasak.

### 7.7 Docker HB Shutdown Bug Süreğen

4-sprint süreğen pattern. Sprint 138 mitigation:
1. Task 2 functional check (silent-DONE kırılır)
2. Task 3 event stream (race condition kalk)
3. Sprint 137 helper retrospektif devam

Core fix Sprint 141+.

---

## 8. Testing & Verification Strategy

### 8.1 Layer 1: Shell Watchdog (Background Bash, Primary)

Sprint 137 lesson: background subagent erken exit. Sprint 138'de sadece shell loop:

```bash
while true; do
  echo "=== $(date '+%H:%M:%S') ==="
  ls -la .deckent/sprint-138.pid
  docker ps --filter "name=deckent" --format "{{.Names}} {{.Status}}"
  echo "Results: $(ls .tasks/task-138-*.result 2>/dev/null | wc -l)/10"
  ls .locks/
  wc -l .deckent/sprint-138-events.jsonl
  wc -l .brain/MEMORY.md .brain/DECISIONS.md
  sleep 120
done > /tmp/sprint-138-shell-watchdog.log 2>&1
```

### 8.2 Layer 2: Watchdog (Explore Subagent Manuel)

Wave geçişlerinde manuel dispatch (4+ dispatch noktası).

### 8.3 Layer 3: 17-Criterion Verification Pipeline (Post-Sprint)

Sprint 134+ parity. **17-criterion sabit** (A+B hibrit kararı — Sprint 138 yeni eksenler ayrı "Architectural Pivot Evidence" section'ında, 17-criterion'a girmez).

### 8.4 Per-Task Physical Code Verification (10 task)

Grep suite sprint bitiminde. 10/10 hedef.

### 8.5 Meta-Dogfood Test (Sprint 138 2x)

1. **Helper functional upgrade canlı** — ≥1 `DONE → TECH_DEBT downgrade` yakalanmalı
2. **Plan-time scope collision detection canlı** — Sprint 138 Task 5 ↔ 6 otomatik sequentialize
3. **ADR compliance check canlı (bonus)** — pilot ADR runtime yakalaması

En az 2 canlı → "architectural breakthrough" scorecard notu.

### 8.6 Living Record Discipline (Sprint 134+)

FINAL report Section 1+5+6 inline + Section 20+21 append. Aynı commit.

### 8.7 Sprint 138 Scorecard Özel Section

`.deckent/sprint-138-layer3-scorecard.md`:
- Standart 17-criterion scoring
- **Architectural Pivot Evidence** (ayrı section, numerical sayıma girmez)
- Meta-dogfood evidence
- Sprint 139 preview

---

## 9. Product Vision Audit (Per-Task Vision Lens)

**ADR-033/034 ve roadmap.md immutable garanti.**

**Per-task vision lens (10/10):**

| Task | Vision Impact |
|------|---------------|
| 0 | ADR governance kullanıcı-facing product feature (açık repo + kullanıcı ADR yazabilir) |
| 1 | Verification protocol standart — Brain↔Worker dürüst iletişim |
| 2 | Auditor authority — kullanıcı manuel verification'dan kurtulur |
| 3 | Event stream + collision — "yaşayan organizma" vizyonunun altyapısı, Docker backend robust |
| 4 | Test baseline temiz = kur-çalıştır stabilite |
| 5 | Gözlemlenebilirlik artifact'lar kullanıcı-facing runtime kanıt |
| 6 | Auto-archive otomatik = manuel recovery yok |
| 7 | Worker dürüstlük = kullanıcı Brain label'a güvenir |
| 8 | Long-running sprint = 100-task sabah-akşam vizyon altyapısı |
| 9 | MCP/CLI parity = multi-environment consistency |

**Forbidden terms audit:** Sprint 138 diff'inde `saas`, `cloud-hosted`, `paywall`, `enterprise edition` **olmamalı**.

---

## 10. Forbidden Actions (Sprint 138 Yasakları)

1. ❌ Yeni user-facing feature eklemek
2. ❌ `sprint-controller.ts`'e dokunmak
3. ❌ Async I/O migration (Sprint 141+)
4. ❌ Docker HB core fix (Sprint 141+)
5. ❌ Heartbeat/checkpoint/agent-evolution dogfood (Sprint 143+)
6. ❌ Notification dispatcher implementation (Sprint 139)
7. ❌ `git add -A`, `commit --amend`, `git reset --hard`
8. ❌ Living record atlamak
9. ❌ Worker dürüstlük v2 "yeterince yaptık" — canlı downgrade şart
10. ❌ Layer 4 runtime wire 4. sprint fail bırakma
11. ❌ ADR Governance sadece dokümante, runtime enforcement eksik
12. ❌ Plan-time collision minimal sanmak — Sprint 138 kendi task 5-6 canlı dogfood şart

---

## 11. Success Metrics & Exit Criteria

### 11.1 Primary Success Criteria (10 checkbox, 8/10 = clean GO)

| # | Criterion | Ölçüm | Pass Eşiği |
|---|-----------|-------|------------|
| 1 | Vitest 0 fail | `npx vitest run` | 0 fail / ≥12721 pass |
| 2 | TSC 0 error | `npx tsc --noEmit` | exit 0 |
| 3 | ADR Governance canlı | lint:adr + DECKENT.md import | exit 0 + 35 ADR valid |
| 4 | Auditor Authority migration | helper + regression test | auditor.ts + Sprint 137 pattern |
| 5 | Event Stream foundation | events.jsonl runtime | ≥50 line |
| 6 | Layer 4 runtime wire | gate.json + load-report + metrics | 3 artifact |
| 7 | Auto-archive regression | archive + DIRECTIVES reset | otomatik |
| 8 | Worker Honest v2 canlı | prompt + en az 1 downgrade | prompt + live downgrade |
| 9 | Resume Capability MVP | checkpoint runtime | checkpoint yazıldı |
| 10 | Layer 3 ≥14/17 | scorecard total | ≥14/17 |

**Clean GO:** 8/10. Target: 8-10/10. Sprint 137: 5/10 (gerçek).

### 11.2 Architectural Pivot Evidence (Ayrı Section, Numerical Sayıma Girmez)

**Deliverables:** 6 arch (ADR-035 + Auditor Authority + Event Stream + Worker Honest v2 + Resume MVP + ADR Governance).

**Meta-dogfood evidence (2 canlı hedef):**
1. Helper functional upgrade canlı — en az 1 DONE → TECH_DEBT downgrade
2. Plan-time collision canlı — Sprint 138 Task 5↔6 otomatik sequentialize

**Bonus:** ADR compliance check canlı.

En az 2/3 kanıt → "architectural breakthrough" scorecard notu.

### 11.3 Readiness Target

**≥4.15/5** (Sprint 137: 4.00, +0.15 bounce).

**Axis:**
| Axis | S137 | S138 | Delta |
|------|------|------|-------|
| Kurulum | 4.15 | 4.2 | +0.05 |
| Bugsuz | 3.55 | **3.9** | +0.35 |
| Gözlemlenebilirlik | 3.9 | **4.2** | +0.3 |
| Güvenlik | 4.0 | 4.0 | 0 |
| Ölçeklenebilirlik | 4.25 | **4.4** | +0.15 |
| Uyumluluk | 4.0 | 4.0 | 0 |
| Ürün Kimliği | 4.55 | **4.65** | +0.1 |

**Weighted:** `(4.2×0.2 + 3.9×0.25 + 4.2×0.15 + 4.0×0.1 + 4.4×0.15 + 4.0×0.05 + 4.65×0.1) = 4.17/5`

Target ≥4.15 → **PASS projeksiyonu**.

### 11.4 Anti-Success Patterns

9 yasak pattern (Section 7.4):
1. Layer 3 <12/17
2. Vitest 0 fail ama test count <12721
3. ADR Governance kozmetik (worker'lar okumuyor)
4. Auditor Authority regression (helper bozuk)
5. Event stream yazıldı ama collision event yok
6. gate.json var ama `overallGate === "ERROR"`
7. Auto-archive yalan DONE
8. Worker Honest v2 canlı değil (downgrade yok)
9. Helper functional check yalan DONE (vitest run hiç çağrılmadı)

---

## 12. Sprint 139 Preview (Next Sprint Handoff)

**Sprint 139 theme:** "Multi-Provider + Multi-Platform Foundation + Notification Dispatcher"

**Tentative tasks:**
1. **Notification Dispatcher + 2 Adapter (CLI + MCP)** — Sprint 138 carry-over (`project_sprint139_notification_dispatcher.md` memory)
2. Codex + Gemini simultaneous test
3. macOS dogfood
4. Windows initial spike
5. Sprint 138 carry-over debt (varsa)

**Sprint 139 hazırlık:**
- Sprint 138 Task 1 output (ADR-035 `DECKENT→USER:NOTIFY` channel)
- Sprint 138 Task 3 output (event stream)
- Sprint 138 Task 8 output (resume capability)

---

## Appendix A — References

- `.brain/archive/DIRECTIVES-sprint-137.md`
- `.deckent/sprint-137-layer3-scorecard.md`
- `docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` Section 18+19 (Sprint 137 status + retro)
- `docs/superpowers/specs/2026-04-14-sprint-137-recovery-design.md`
- Memory: `project_sprint138_architectural_pivot.md` (brainstorming memory, detay)
- Memory: `project_sprint137_completed.md`
- Memory: `feedback_worker_honest_assessment.md`
- Memory: `project_sprint139_notification_dispatcher.md`
- Memory: `project_doc_finalization_sprint.md`

## Appendix B — Commit Ceremony (2 commit)

**Commit 1 — feat:** Sprint 138 source + tests (Task 0-8 + 9 if applied)
**Commit 2 — docs:** Closing ceremony — FINAL report Section 1+5+6 inline + Section 20+21 append + scorecard + spec + plan + BETA-TRACKER optional sync + auto-archive
