# DIRECTIVES — Sprint 072: Faz 2 — Genel Kullanılabilirlik

## Goal: Provider/tier generalizasyonu, init wizard genel provider seçimi, model isimleri güncellemesi, README.md güncel özellikler, sprint-controller god object split başlangıcı. Deckent'i Claude-only olmaktan çıkarıp multi-provider ready hale getir.

---

## Task 1: Plan Tier Generalizasyonu — Claude-Specific → Genel
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/core/config-types.ts, src/core/config.ts, src/cli/commands/init.ts
- Scope: src/core/, src/cli/commands/

### Description
Mevcut plan tier'ları Claude subscription'a bağlı: `max_plan`, `max5x_plan`, `pro_plan`, `api`. Bunlar kullanıcıya anlamsız — "Max plan ne demek?"

Yeni tier isimleri:
- `max_plan` → `performance` (8 worker, Opus brain)
- `max5x_plan` → `balanced` (5 worker, Sonnet brain)
- `pro_plan` → `economic` (3 worker, Sonnet only)
- `api` → `api` (değişmez — pay-as-you-go)

Yapılacaklar:
A) `config-types.ts`'de `PlanMode` tipini güncelle — eski isimleri de kabul et (backward compat):
```typescript
type PlanMode = 'performance' | 'balanced' | 'economic' | 'api' | 'max_plan' | 'max5x_plan' | 'pro_plan';
```

B) `config.ts`'de `loadConfig()` eski tier → yeni tier mapping ekle (migration):
```typescript
if (mode === 'max_plan') mode = 'performance';
if (mode === 'max5x_plan') mode = 'balanced';
if (mode === 'pro_plan') mode = 'economic';
```

C) `init.ts` wizard'da yeni isimler göster:
```
- Performance ($200/mo) — 8 workers, Opus brain
- Balanced ($100/mo) — 5 workers, Sonnet brain
- Economic ($20/mo) — 3 workers, Sonnet only
- API (pay-as-you-go) — 10 workers, any model
```

D) Config `modes` objesi içindeki anahtarları da güncelle ama eski config'ler kırılmasın.

**Kanıt:** `grep "performance\|balanced\|economic" src/core/config-types.ts` → yeni tier'lar var

**Test:** 4+ test (yeni tier'lar çalışıyor, eski tier'lar migrate ediliyor, config merge doğru)

---

## Task 2: Init Wizard Genel Provider Seçimi
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/cli/commands/init.ts, src/cli/helpers/wizard.ts
- Scope: src/cli/commands/, src/cli/helpers/

### Description
Init wizard şu anda "Select your Claude plan" diyor — Claude-specific. Genel provider seçimi olmalı.

Yeni wizard akışı:
1. "Select your plan tier:" → performance/balanced/economic/api (Task 1'deki yeni isimler)
2. Provider auto-detection sonuçlarını göster (mevcut — zaten çalışıyor)
3. "Select your Claude plan" ifadesini kaldır — tier seçimi provider-agnostic

`promptSelect` çağrısındaki label'ları güncelle:
```typescript
mode = await promptSelect<PlanMode>('Select your plan:', [
  { label: 'Performance — 8 workers, premium model brain', value: 'performance' },
  { label: 'Balanced — 5 workers, standard model brain', value: 'balanced' },
  { label: 'Economic — 3 workers, standard model only', value: 'economic' },
  { label: 'API (pay-as-you-go) — 10 workers, any model', value: 'api' },
]);
```

Dollar amount'ları kaldır (Claude-specific pricing) — sadece özellik bazlı açıklama.

**Kanıt:** `grep "Select your Claude" src/cli/commands/init.ts` → 0 eşleşme

**Test:** 2+ test (yeni wizard options, eski tier backward compat)

---

## Task 3: Model İsimleri Güncelliği + Doğrulama
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/core/task-types.ts, src/core/constants.ts, src/providers/claude.ts, src/providers/codex-adapter.ts, src/providers/gemini-adapter.ts
- Scope: src/core/, src/providers/

### Description
Model isimleri kontrol ve güncelleme:

A) Claude: `opus`, `sonnet`, `haiku` — güncel mi? Claude 4.5/4.6 model ID'leri:
- opus → `claude-opus-4-6`
- sonnet → `claude-sonnet-4-6`
- haiku → `claude-haiku-4-5-20251001`
Model alias'ları doğru mapping yapıyor mu kontrol et.

B) OpenAI/Codex: `gpt-5`, `gpt-4.1`, `gpt-5-mini` — güncel mi?
Codex adapter'da model mapping kontrol et.

C) Gemini: `gemini-2.5-pro`, `gemini-2.5-flash` — güncel mi?
Gemini adapter'da model mapping kontrol et.

D) `PROVIDER_MODEL_MAP` sabitindeki tüm model ID'lerini doğrula.

E) DECKENT.md ve docs/'taki model referanslarını güncelle.

**Kanıt:** `grep "PROVIDER_MODEL_MAP" src/core/` → güncel model listesi

**Test:** 3+ test (model validation, alias mapping, tier equivalence)

---

## Task 4: README.md Güncel Özellikler
- Model: opus
- Effort: high
- Skills: documentation-writer
- Files: README.md
- Scope: README.md

### Description
README.md eski veriler içeriyor. Güncellenecekler:

A) Test sayısı: 12,100+ → 12,160+
B) Sprint sayısı: 69+ → 71+
C) Windows desteği: Tam native Windows desteği (subprocess backend, shell:true)
D) Yeni özellikler:
- Stack-aware init (Python, Go, Rust, Java, C#, Swift, Ruby, PHP, Dart, Kotlin)
- TempSkill + TempAgent otomatik oluşturma
- .deckent/docs/ rehber sistemi (quick-start, directives-guide, config-reference)
- `deckent upgrade --local` beta workflow
- Subprocess heartbeat periodic update
- Review archive fallback
E) Bug fix özeti: 22 dogfooding bug düzeltildi
F) Version: v0.2.0-beta.3
G) Provider bölümü: Claude (default) + Codex + Gemini multi-provider
H) MCP bölümü: 16 tools + 9 resources (güncel mi kontrol et)

README markdown kalitesi yüksek olmalı — badge'ler, tablolar, emoji kullanma.

**Kanıt:** `head -5 README.md` → güncel versiyon ve test sayısı

**Test:** Bu task test gerektirmez — dokümantasyon.

---

## Task 5: sprint-controller.ts God Object Split — Faz 1
- Model: opus
- Effort: high
- Skills: typescript-expert, refactoring-expert
- Files: src/orchestra/sprint-controller.ts, src/orchestra/sprint-phases.ts
- Scope: src/orchestra/

### Description
`sprint-controller.ts` 2300+ satır — god object. İlk split fazı: Sprint phase'lerini ayrı modüle çıkar.

Yeni dosya: `src/orchestra/sprint-phases.ts`

Taşınacak fonksiyonlar (sprint lifecycle):
- `runPlanPhase()` — PLAN fazı (DIRECTIVES okuma, task planlama)
- `runSpawnPhase()` — SPAWN fazı (worker başlatma)
- `runEvaluatePhase()` — EVALUATE fazı (result değerlendirme)
- `runFixPhase()` — FIX fazı (retry logic)
- `runRetroPhase()` — RETRO fazı (retrospektif yazma)
- `runDecayPhase()` — DECAY fazı (memory trimming)
- `runCleanupPhase()` — CLEANUP fazı (dosya silme)

sprint-controller.ts'de bu fonksiyonları import edip çağır — `executeSprint()` orchestration layer olarak kalır.

Re-export pattern: sprint-controller.ts public API değişmez (backward compat).

DİKKAT: Bu büyük bir refactoring. Sadece phase fonksiyonlarını extract et, iç mantığı DEĞİŞTİRME.

**Kanıt:** `wc -l src/orchestra/sprint-controller.ts` → öncekinden kısa + `wc -l src/orchestra/sprint-phases.ts` → yeni dosya var

**Test:** Mevcut testler regression-free geçmeli. Yeni test gerekmez (extract only).

---

## Quality Rules
- tsc --noEmit MUST pass
- All new tests MUST pass
- Existing tests: 0 regression
- Backward compat: Eski config tier'ları (`max_plan`, `max5x_plan`, `pro_plan`) çalışmaya devam etmeli
- Model isimleri tüm provider'larda tutarlı olmalı
- %100 GO hedefli — NO_GO KABUL EDİLMEZ
