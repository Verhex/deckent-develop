# DIRECTIVES — Sprint 124: Context-Aware Routing + Token Usage Tracker

## Goal: Deckent'in routing engine'ına context budget awareness ekle. Task'ın tahmini token boyutuna göre model seçimini optimize et. Worker sonuçlarına token kullanım verisi ekle ve RETRO.md'ye token summary tablosu yaz. Mevcut orphan token-counter.ts'i entegre et.

---

## Task 1: Context Estimator — Task Scope Token Tahmini
- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Agent: architect
- Files: src/core/token-counter.ts, src/orchestra/task-builder.ts
- Scope: src/core/, src/orchestra/

### Description
Mevcut `src/core/token-counter.ts` dosyasında `estimatePromptSize()` fonksiyonu var ama task-builder.ts'den çağrılmıyor. Entegre et:

1. `src/orchestra/task-builder.ts` → `buildWorkerPrompt()` fonksiyonunda prompt oluşturulduktan sonra `estimatePromptSize()` çağır. Sonucu task JSON'a `estimatedTokens` olarak yaz.

2. `src/core/token-counter.ts` → `estimateTaskContextBudget(task, agentPrompt, skillPrompts)` fonksiyonu ekle:
   - Task scope dosyalarının toplam boyutunu tahmin et (satır sayısı × avg tokens/line)
   - Agent prompt + skill prompts token tahmini
   - System prompt overhead (~2000 token sabit)
   - Return: `{ estimatedTokens, modelBudget, withinBudget, utilizationPercent }`

3. Task JSON'a yeni alan: `estimatedTokens?: number` — `.tasks/task-{id}.json`'a yaz.
   - `src/core/types.ts` veya ilgili task type dosyasına `estimatedTokens` ekle.

`tsc --noEmit` ve `npx vitest run tests/core/token-counter.test.ts` geçmeli.

**Kanıt:** `grep "estimateTaskContextBudget" src/core/token-counter.ts` → fonksiyon bulunmalı
**Test:** Mevcut token-counter testleri + yeni estimateTaskContextBudget testi geçmeli

---

## Task 2: Context-Aware Router — Model Seçimine Budget Faktörü Ekle
- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Agent: architect
- Files: src/core/routing-engine.ts, src/core/model-registry.ts, src/orchestra/task-router.ts
- Scope: src/core/, src/orchestra/

### Description
Routing engine'a context budget awareness ekle:

1. `src/core/routing-engine.ts` → `routeTaskV2()` fonksiyonunda context budget'ı faktör olarak kullan:
   - Task'ın `estimatedTokens` alanını oku
   - Model'in `contextWindow` değerini ModelRegistry'den al
   - Eğer `estimatedTokens > contextWindow * 0.75` → bu model uygun değil, bir üst tier'a yönlendir
   - Eğer `estimatedTokens > contextWindow * 0.90` → SPLIT önerisi logla (debugLog)
   - RoutingDecision'a `contextFit: 'ok' | 'tight' | 'overflow'` alanı ekle

2. `src/core/routing-types.ts` → `RoutingDecision` tipine `contextFit?: 'ok' | 'tight' | 'overflow'` ekle

3. Mevcut routing testleri kırılmamalı (yeni alan optional). `npx vitest run tests/core/routing-engine.test.ts` geçmeli.

**Kanıt:** `grep "contextFit" src/core/routing-types.ts` → bulunmalı
**Test:** Routing engine testleri + en az 1 yeni context-fit testi

---

## Task 3: Token Usage — Worker Result'a Token Verisi Ekle
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Agent: architect
- Files: src/agents/worker.ts, src/orchestra/result-evaluator.ts
- Scope: src/agents/, src/orchestra/

### Description
Worker sonuçlarına token kullanım verisi ekle:

1. `.contracts/api-surface.md` → Result dosya formatına `tokenUsage` alanı ekle:
   ```json
   "tokenUsage": {
     "inputTokens": 15420,
     "outputTokens": 3200,
     "cacheReadTokens": 89000,
     "provider": "claude",
     "model": "opus"
   }
   ```

2. `src/core/types.ts` → `TaskResult` tipine `tokenUsage?: TokenUsage` ekle. `TokenUsage` interface tanımla.

3. `src/agents/worker.ts` → Worker result yazarken token bilgisini dahil et. Claude worker'lar JSONL transcript'ten post-hoc parse yapabilir (opsiyonel, şu an için yapı hazırlığı yeterli).

4. `src/orchestra/result-evaluator.ts` → Evaluation sırasında tokenUsage'ı oku ve sprint metrics'e ekle (varsa).

`tsc --noEmit` geçmeli. Yeni alanlar optional — breaking change yok.

**Kanıt:** `grep "tokenUsage" src/core/types.ts` → TokenUsage interface bulunmalı
**Test:** Mevcut testler geçmeli (optional field)

---

## Task 4: Sprint Reporter Token Summary — RETRO.md Token Tablosu
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Agent: architect
- Files: src/orchestra/sprint-reporter.ts
- Scope: src/orchestra/

### Description
Sprint retrospektifine token kullanım özeti ekle:

1. `src/orchestra/sprint-reporter.ts` → `generateRetro()` veya `writeRetro()` fonksiyonunda, sprint sonuçlarındaki `tokenUsage` verilerini topla.

2. RETRO.md'ye yeni bölüm ekle:
   ```markdown
   ## Token Usage
   | Task | Model | Input | Output | Cache Read | Total |
   |------|-------|-------|--------|------------|-------|
   | 124-001 | opus | 15K | 3.2K | 89K | 107K |
   | Total | — | 45K | 9.6K | 267K | 321K |
   ```

3. Token verisi yoksa (henüz worker'lar tokenUsage yazmıyorsa) → bu bölümü atla veya "Token data not available" yaz.

`tsc --noEmit` geçmeli. `npx vitest run tests/orchestra/sprint-reporter.test.ts` geçmeli.

**Kanıt:** `grep "Token Usage" src/orchestra/sprint-reporter.ts` → bölüm template'i bulunmalı
**Test:** Sprint reporter testleri geçmeli

---

## Quality Rules
- `npx tsc --noEmit` temiz olmalı
- `npx vitest run tests/core/` geçmeli
- `npx vitest run tests/orchestra/` geçmeli
- Yeni alanlar optional — mevcut testlerde breaking change olmamalı
- Task bağımlılıkları: Task 2, Task 1'e bağımlı (estimatedTokens alanı). Task 4, Task 3'e bağımlı (tokenUsage alanı).
