# .plan File Diagnostic Report — Sprint 139

**Date:** 2026-04-15
**Task:** 139-021
**Agent:** doc-writer + typescript-expert

---

## Executive Summary

Sprint 139'da 22 task'tan sadece 5'i (% 22.7) `.plan` dosyası yazmıştır. Sprint 138'de 12 result'tan sadece 1 tanesi (% 8.3) `.plan` dosyası oluşturmuştur. Bu tutarsızlık, `.plan` yazma talimatının worker prompt pipeline'ına doğrudan enjekte edilmemesinden kaynaklanmaktadır.

---

## Root Cause Analysis

### Bulgu 1: `buildWorkerPrompt()` .plan Talimatı İçermiyor

`src/orchestra/task-builder.ts:729-859` içindeki `buildWorkerPrompt()` fonksiyonu worker'a 4 adımlı bir iş akışı talimat eder:

1. Read the task scope
2. Write the code changes
3. Document: update relevant docs
4. Report: write your result file

**`.plan` yazma talimatı bu 4 adımda YOKTUR.**

### Bulgu 2: `.plan` Talimatı Yalnızca `.claude/rules/worker-default.md:8`'de

```
- Write execution plan to `.tasks/task-XXX.plan` before coding
```

Bu kural, Claude Code'un CLAUDE.md → DECKENT.md → `.claude/rules/worker-default.md` referans zinciri üzerinden inject edilir. Ancak bu zincir:
- Worker backend'e (tmux/subprocess/docker) göre değişir
- LLM'in bağlam penceresinde bu kuralı görmesi ve uygulaması **non-deterministik**tir
- Context truncation durumunda bu kural ilk düşenlerden biri olabilir

### Bulgu 3: `WORKER-GUIDE.md` da `.plan` İçermiyor

`buildWorkerPrompt()` satır 787'de `WORKER-GUIDE.md` dosyasına referans verir:
```
See .deckent/workspace/WORKER-GUIDE.md for heartbeat format, result format, and error handling rules.
```

Ancak `WORKER-GUIDE.md` dosyasında `.plan` yazma talimatı **bulunmaz**. Heartbeat, result ve error handling bölümleri var ama `.plan` section yok.

### Bulgu 4: Effort Korelasyonu Belirsiz

Sprint 138'de tek `.plan` yazan task-138-004 `effort: high` idi. Sprint 139'da .plan yazan 5 task'ın effort seviyeleri:
- 139-006, 139-007, 139-008, 139-010, 139-014 — çeşitli effort seviyeleri

Effort-based correlation **kanıtlanamadı**. `.plan` yazma davranışı effort'a bağlı değil, LLM'in kural dosyasını bağlamında alıp almadığına bağlıdır.

### Bulgu 5: `writeTaskPlan()` Fonksiyonu Mevcut Ama Pasif

`src/agents/worker.ts:167-171` `writeTaskPlan()` fonksiyonu tanımlı ve çalışır durumda:
```typescript
export function writeTaskPlan(projectRoot: string, plan: TaskPlan): void {
  ensureDir(join(projectRoot, TASKS_DIR));
  const path = planFilePath(projectRoot, plan.taskId);
  writeFileSync(path, JSON.stringify(plan, null, 2), 'utf-8');
}
```

Ancak bu fonksiyon hiçbir yerden otomatik çağrılmaz. Worker'ın kendi insiyatifine bırakılmıştır.

---

## Sprint 138-139 .plan Coverage

| Sprint | Total Tasks | .plan Yazanlar | Oran |
|--------|------------|----------------|------|
| Sprint 138 | 12 | 1 (task-138-004) | 8.3% |
| Sprint 139 | 22 | 5 (006, 007, 008, 010, 014) | 22.7% |

### Sprint 139 Detay

| Task ID | .plan | .result | Notes |
|---------|-------|---------|-------|
| 139-001 | ❌ | timeout | - |
| 139-002 | ❌ | ✅ | - |
| 139-003 | ❌ | timeout | - |
| 139-004 | ❌ | ✅ | - |
| 139-005 | ❌ | ✅ | - |
| 139-006 | ✅ | ✅ | 854 bytes |
| 139-007 | ✅ | ✅ | 1811 bytes |
| 139-008 | ✅ | ✅ | 1002 bytes |
| 139-009 | ❌ | ✅ | - |
| 139-010 | ✅ | ✅ | 1781 bytes |
| 139-011 | ❌ | ✅ | - |
| 139-012 | ❌ | ✅ | - |
| 139-013 | ❌ | ✅ | - |
| 139-014 | ✅ | ✅ | 1879 bytes |
| 139-015 | ❌ | ✅ | - |
| 139-016 | ❌ | ✅ | - |
| 139-017 | ❌ | - | - |
| 139-018 | ❌ | ✅ | - |
| 139-019 | ❌ | ✅ | - |
| 139-020 | ❌ | ✅ | - |
| 139-021 | - | - | (this task) |
| 139-022 | - | - | - |

---

## Root Cause Verdict

**Primary Root Cause: Missing `.plan` instruction in `buildWorkerPrompt()` template.**

`.plan` yazma talimatı yalnızca `.claude/rules/worker-default.md` dosyasında tanımlanmıştır. Bu kural dosyası Claude Code'un referans zinciri aracılığıyla inject edilir, ancak:

1. Worker prompt template'inde (task-builder.ts) `.plan` adımı **yoktur**
2. WORKER-GUIDE.md'de `.plan` bölümü **yoktur**
3. Sonuç: LLM'in `.plan` yazma olasılığı context window ve kural injection'a bağlı — **non-deterministik**

**Fix:** `buildWorkerPrompt()` template'ine `.plan` yazma talimatını doğrudan enjekte etmek ve `WORKER-GUIDE.md`'ye `.plan` bölümü eklemek.

---

## Recommended Actions

### Sprint 139 (Soft Warning — This Task)
1. ✅ `buildWorkerPrompt()` "What To Do" bölümüne `.plan` adımı ekle
2. ✅ `WORKER-GUIDE.md`'ye `.plan` bölümü ekle
3. ✅ `docs/worker-guide.md` oluştur (public-facing)
4. ✅ Soft warning: `.plan` yoksa `console.warn` + result'a `planWarning` flag

### Sprint 140 (Hard Enforcement — Tech Debt)
- `postTaskWriteValidation()` fonksiyonunda `.plan` yoksa `GO_WITH_TECH_DEBT` downgrade
- Auditor scan loop'unda `.plan` varlık kontrolü
- Sprint metrics'e `.plan` coverage oranı eklenmesi
