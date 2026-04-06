# DIRECTIVES — Sprint 097: Model Registry + Provider Config Evrimi (Enterprise Refactor)

## Goal: 118 hard-coded model referansını tek kaynağa (ModelRegistry) indir. Config'i provider-agnostic tier sisteme evir. haiku_allowed → min_tier, brain_model → brain_tier. Yeni modeller ekle (gemini-3.1-pro-preview, o3, gpt-4.1-mini). Codex/Gemini CLI uyumluluğunu güncelle. Her adım backward compatible. 0 breaking change.

---

## Task 1: ModelRegistry Class + BUILTIN_MODELS Kataloğu
- Model: opus
- Effort: high
- Agent: architecture-planner
- Skills: system-architect, typescript-expert
- Files: src/core/model-registry.ts (new)
- Scope: src/core/

### Description
Tüm model tanımlarının tek kaynağı olacak ModelRegistry class'ını oluştur.

A) `src/core/model-registry.ts` yeni dosya:

ModelTier type: `'economy' | 'standard' | 'premium' | 'premium_plus'`

ModelDefinition interface:
- id: string (dahili kısa ad: 'opus', 'gpt-5')
- apiId: string (provider API tam adı: 'claude-opus-4-6')
- provider: ProviderName
- tier: ModelTier
- contextWindow: number
- costPerMillion: { input: number; output: number }
- capabilities: { streaming, toolUse, vision, codeExecution, reasoning: boolean }
- status: 'ga' | 'preview' | 'deprecated'
- maxOutputTokens?: number

B) BUILTIN_MODELS array — tüm 15 model:

Claude (3): opus (premium, 1M, $15/$75), sonnet (standard, 200K, $3/$15), haiku (economy, 200K, $0.8/$4)

OpenAI (6): o3 (premium_plus, 200K, $10/$40, reasoning:true), gpt-5 (premium, 1M, $5/$15), gpt-4.1 (standard, 1M, $2/$8), o4-mini (standard, 200K, $1.1/$4.4, reasoning:true), gpt-5-mini (economy, 1M, $1.25/$5), gpt-4.1-mini (economy, 1M, $0.4/$1.6)

Gemini (4): gemini-3.1-pro-preview (premium_plus, 2M, preview, $2.5/$15), gemini-2.5-pro (premium, 1M, $2.5/$15), gemini-2.5-flash (standard, 1M, $0.15/$0.6), gemini-2.0-flash (economy, 1M, $0.1/$0.4)

C) ModelRegistry class metodları:
- get(id), getOrThrow(id), has(id)
- getByProvider(provider), getByTier(tier)
- getByProviderAndTier(provider, tier) — tier'daki ilk GA model
- getEquivalent(modelId, targetProvider) — tier-based cross-provider eşleştirme
- getTier(modelId), compareTiers(a, b), isAtLeastTier(modelId, minTier)
- register(definition), unregister(id) — runtime genişletme
- estimateCost(modelId, inputTokens, outputTokens)
- resolveApiId(modelId)
- getAllModelIds(), getAllProviders()

D) Singleton export: `export const modelRegistry = new ModelRegistry()`

E) BuiltinModelId type: `typeof BUILTIN_MODELS[number]['id']` — compile-time güvenlik

F) Backward compat re-export'lar:
- `export type ModelType = BuiltinModelId | (string & {})`

**Kanıt:** `grep "class ModelRegistry" src/core/model-registry.ts` → 1 eşleşme. `grep "BUILTIN_MODELS" src/core/model-registry.ts | wc -l` → 2+

**Test:** `tsc --noEmit` temiz.

---

## Task 2: task-types.ts Delegasyonu — Registry'den Re-export
- Model: opus
- Effort: high
- Agent: architecture-planner
- Skills: system-architect, typescript-expert
- Files: src/core/task-types.ts, src/core/model-equivalence.ts
- Scope: src/core/

### Description
Mevcut hard-coded model tanımlarını ModelRegistry'den türet. Mevcut export imzaları AYNEN korunur — 0 breaking change.

A) `src/core/task-types.ts`'de:
- PROVIDER_MODEL_MAP → `modelRegistry.getAllProviders()` ile otomatik türet, mevcut Record<ProviderName, readonly ModelType[]> tipi korunur
- ALL_MODELS → `modelRegistry.getAllModelIds()` ile türet
- MODEL_API_IDS → `Object.fromEntries(modelRegistry.getAllModels().map(m => [m.id, m.apiId]))` ile türet
- getModelTier() → `modelRegistry.getTier()` delegate
- resolveApiModelId() → `modelRegistry.resolveApiId()` delegate
- ClaudeModel, OpenAIModel, GeminiModel type alias'ları @deprecated ama korunur
- GeminiModel'e 'gemini-3.1-pro-preview' eklenmeli

B) `src/core/model-equivalence.ts`'de:
- MODEL_TIERS → modelRegistry'den türet
- PROVIDER_MODELS → modelRegistry'den türet
- TIER_PROVIDER_MAP → modelRegistry'den türet
- getEquivalentModel() → modelRegistry.getEquivalent() delegate
- getModelTier() → modelRegistry.getTier() delegate
- Eski fonksiyon imzaları AYNEN korunur

C) Mevcut tüm import'lar çalışmaya devam etmeli — dosya ismi, export ismi, parametre tipleri değişmez

**Kanıt:** `grep "modelRegistry" src/core/task-types.ts src/core/model-equivalence.ts | wc -l` → 5+

**Test:** `tsc --noEmit` temiz. `npx vitest run tests/core/types*.test.ts tests/core/model-equivalence*.test.ts` → 0 fail.

---

## Task 3: Provider Adapter Tier Duplicate Kaldırma
- Model: opus
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: src/providers/codex.ts, src/providers/gemini.ts, src/core/provider-capabilities.ts
- Scope: src/providers/, src/core/

### Description
Provider dosyalarındaki tier duplicate'larını kaldır, ModelRegistry'e yönlendir.

A) `src/providers/codex.ts`:
- CODEX_TIER_MODELS (satır 29-33) sabiti kaldır
- `getModelForTier()` metodu varsa `modelRegistry.getByProviderAndTier('codex', tier)` ile değiştir
- supportedModels getter'ı `modelRegistry.getByProvider('codex').map(m => m.id)` ile türet
- OpenAI model listesine gpt-4.1-mini ekle (mevcut listede eksik olabilir)

B) `src/providers/gemini.ts`:
- GEMINI_TIER_MODELS (satır 29-33) sabiti kaldır
- `getModelForTier()` metodu varsa modelRegistry delegate
- supportedModels getter'ı modelRegistry'den türet
- gemini-3.1-pro-preview model desteği ekle

C) `src/core/provider-capabilities.ts`:
- Provider-level capabilities'i model-level'a geçir
- `getCapabilities(modelId)` fonksiyonu ekle — modelRegistry'den okur
- Eski `PROVIDER_CAPABILITIES` record @deprecated ama korunur

**Kanıt:** `grep "CODEX_TIER_MODELS\|GEMINI_TIER_MODELS" src/providers/ | wc -l` → 0

**Test:** `tsc --noEmit` temiz. `npx vitest run tests/providers/*.test.ts` → 0 fail.

---

## Task 4: mode-presets.ts + model_strategy Config Yapısı
- Model: opus
- Effort: high
- Agent: architecture-planner
- Skills: system-architect, typescript-expert
- Files: src/core/mode-presets.ts (new), src/core/config-types.ts, src/core/config.ts
- Scope: src/core/

### Description
Mode preset'lerini ayrı dosyaya çıkar, model_strategy config yapısını ekle.

A) `src/core/mode-presets.ts` yeni dosya:
```typescript
export interface ModelStrategy {
  brain_tier: ModelTier;      // Brain için tier
  worker_tier: ModelTier;     // Worker default tier
  min_tier: ModelTier;        // İzin verilen minimum
  max_tier: ModelTier;        // İzin verilen maksimum
  auto_upgrade: boolean;      // Complexity yüksekse tier yükselt
  auto_downgrade: boolean;    // Doc/test task'larda tier düşür
}

export const MODE_PRESETS: Record<string, { model_strategy: ModelStrategy; max_workers: number }> = {
  performance: { model_strategy: { brain_tier: 'premium', worker_tier: 'premium', min_tier: 'economy', max_tier: 'premium_plus', auto_upgrade: true, auto_downgrade: false }, max_workers: 8 },
  balanced: { model_strategy: { brain_tier: 'standard', worker_tier: 'premium', min_tier: 'economy', max_tier: 'premium', auto_upgrade: true, auto_downgrade: true }, max_workers: 5 },
  economic: { model_strategy: { brain_tier: 'standard', worker_tier: 'standard', min_tier: 'economy', max_tier: 'standard', auto_upgrade: false, auto_downgrade: true }, max_workers: 3 },
  api: { model_strategy: { brain_tier: 'premium', worker_tier: 'standard', min_tier: 'economy', max_tier: 'premium_plus', auto_upgrade: true, auto_downgrade: true }, max_workers: 10 },
};
```

B) `src/core/config-types.ts`'de:
- `DeckentConfig`'e `model_strategy?: Partial<ModelStrategy>` ekle
- `DeckentConfig`'e `providers?: { brain?: ProviderName; worker?: ProviderName; fallback?: ProviderName; overrides?: Record<string, ProviderName> }` ekle (mevcut brain_provider/worker_provider yanına, iki format da desteklenir)
- `PlanModeConfig`'e `min_tier?: ModelTier` ekle (haiku_allowed yanına, iki format da desteklenir)

C) `src/core/config.ts`'de:
- DEFAULT_MODES'u mode-presets.ts'den import et
- `loadConfig()` akışına mode preset uygulama adımı ekle: config.mode → preset → model_strategy merge
- haiku_allowed backward compat: haiku_allowed=false → min_tier='standard' çevirimi

**Kanıt:** `grep "ModelStrategy\|MODE_PRESETS\|model_strategy" src/core/mode-presets.ts src/core/config-types.ts | wc -l` → 5+

**Test:** `tsc --noEmit` temiz. `npx vitest run tests/core/config*.test.ts` → 0 fail.

---

## Task 5: model-selector.ts Tier-Based Refactor
- Model: opus
- Effort: high
- Agent: refactorer
- Skills: typescript-expert
- Files: src/orchestra/model-selector.ts
- Scope: src/orchestra/

### Description
model-selector.ts'deki hard-coded model isimlerini tier-based seçime çevir.

A) `calculateModelScore()` fonksiyonu aynen kalır (score hesaplama mantığı değişmez)

B) `inferModelFromDirective()` ve `suggestModelFromPatterns()`:
- `return 'opus'` → `return resolveTierToModel('premium', config)` gibi helper kullan
- `return 'sonnet'` → `return resolveTierToModel('standard', config)`
- `return 'haiku'` → `return resolveTierToModel('economy', config)`
- `resolveTierToModel(tier, config)`: config'deki worker provider'ı al, modelRegistry'den o provider+tier için model döndür

C) Plan access filter (isProPlan kontrolü):
- `mode === 'economic' || mode === 'pro_plan'` → `config.model_strategy?.max_tier` kontrolü
- `haiku_allowed` → `config.model_strategy?.min_tier ?? (config.activeModeConfig.haiku_allowed === false ? 'standard' : 'economy')` backward compat

D) Yeni helper fonksiyon:
```typescript
function resolveTierToModel(tier: ModelTier, config: ResolvedConfig): ModelType {
  const provider = config.worker_provider ?? config.brain_provider ?? 'claude';
  const model = modelRegistry.getByProviderAndTier(provider, tier);
  return model?.id ?? 'sonnet'; // fallback
}
```

**Kanıt:** `grep "'opus'\|'sonnet'\|'haiku'" src/orchestra/model-selector.ts | wc -l` → 0 (resolveTierToModel kullanılıyor)

**Test:** `tsc --noEmit` temiz. `npx vitest run tests/orchestra/model-selector*.test.ts tests/orchestra/resolve-task-model*.test.ts` → 0 fail.

---

## Task 6: Config Migration v1→v2 + config.json Güncelleme
- Model: opus
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: src/core/config-migration.ts, .deckent/config.json
- Scope: src/core/, .deckent/

### Description
Config migration'a v1→v2 çevirimi ekle.

A) `src/core/config-migration.ts`'de v1→v2 migration kuralları:
- `haiku_allowed: false` → `min_tier: 'standard'` (model_strategy altına)
- `haiku_allowed: true` → `min_tier: 'economy'`
- `brain_model: 'opus'` → `brain_tier: 'premium'` (model_strategy altına)
- `brain_model: 'sonnet'` → `brain_tier: 'standard'`
- `default_model: X` → `worker_tier: getTierForModel(X)` (model_strategy altına)
- `brain_provider` / `worker_provider` → `providers.brain` / `providers.worker` (eski format da okunur)
- Eski alanlar korunur (backward compat), yeni alanlar eklenir

B) `.deckent/config.json`'u v2 formatına güncelle:
- `model_strategy` bloğu ekle
- `providers` bloğu ekle
- Eski `brain_provider`/`worker_provider` alanları korunur (geriye uyumluluk)

**Kanıt:** `grep "model_strategy\|min_tier\|brain_tier" .deckent/config.json` → 3+ eşleşme

**Test:** `tsc --noEmit` temiz. `npx vitest run tests/core/config-migration*.test.ts` → 0 fail.

---

## Task 7: MCP + CLI Model Enum Genişletme
- Model: opus
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: src/mcp/tools/run.ts, src/mcp/tools/plan.ts, src/cli/commands/run.ts, src/cli/commands/agent.ts
- Scope: src/mcp/, src/cli/

### Description
MCP tool ve CLI komutlarındaki hard-coded model enum'larını genişlet.

A) `src/mcp/tools/run.ts`:
- `z.enum(['opus', 'sonnet', 'haiku'])` → `z.enum(modelRegistry.getAllModelIds() as [string, ...string[]])` veya tüm 15 modeli listele
- Default 'sonnet' korunsun

B) `src/mcp/tools/plan.ts`:
- Model parametresi varsa aynı şekilde genişlet

C) `src/cli/commands/run.ts`:
- CLI help text'teki model listesini ALL_MODELS'den türet
- `opts.model ?? 'sonnet'` korunsun

D) `src/cli/commands/agent.ts`:
- Agent oluşturma/düzenleme'deki model seçeneklerini genişlet

E) `src/cli/auto-setup.ts`:
- Hard-coded `'opus'`, `'sonnet'` → tier-based seçim

**Kanıt:** `grep "z.enum.*opus.*sonnet.*haiku" src/mcp/ | wc -l` → 0 (genişletilmiş enum)

**Test:** `tsc --noEmit` temiz.

---

## Task 8: Codex Adapter CLI Uyumluluk Güncellemesi
- Model: opus
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: src/providers/codex.ts
- Scope: src/providers/

### Description
Codex adapter'ı güncel Codex CLI (Rust rewrite) ile uyumlu hale getir.

A) buildArgs() güncelle:
- `codex exec --full-auto` → Context7'den doğrulanan format: `codex exec "prompt"` (exec zaten non-interactive)
- `--approval-mode full-auto` alternatif olarak destekle
- `--model <model>` parametresi doğru

B) supportedModels'e yeni modeller ekle (modelRegistry'den otomatik):
- gpt-4.1-mini (economy tier, eksikti)

C) buildPlannerCommand() güncelle:
- Güncel Codex CLI formatına uyumlu

D) isAvailable() kontrol:
- `codex --version` ile Rust vs Node sürüm tespiti

**Kanıt:** `grep "exec.*full-auto\|approval-mode" src/providers/codex.ts` → güncel format

**Test:** `tsc --noEmit` temiz. `npx vitest run tests/providers/codex*.test.ts` → 0 fail.

---

## Task 9: Gemini Adapter CLI Uyumluluk + gemini-3.1-pro-preview
- Model: opus
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: src/providers/gemini.ts
- Scope: src/providers/

### Description
Gemini adapter'ı güncel Gemini CLI ile uyumlu hale getir.

A) buildArgs() güncelle:
- `--model` → `-m` kısa flag da desteklenmeli (Gemini CLI docs: `-m gemini-2.5-flash`)
- `--approval-mode plan` ekle — non-interactive mod için (Gemini CLI docs: `gemini --approval-mode plan -p "..."`)

B) supportedModels'e gemini-3.1-pro-preview ekle (modelRegistry'den otomatik)

C) parseGeminiOutput() güncelle:
- `--output-format stream-json` desteği (yeni Gemini CLI özelliği)

D) isAvailable() kontrol:
- Gemini CLI sürüm tespiti

**Kanıt:** `grep "approval-mode\|gemini-3.1" src/providers/gemini.ts` → 2+ eşleşme

**Test:** `tsc --noEmit` temiz. `npx vitest run tests/providers/gemini*.test.ts` → 0 fail.

---

## Task 10: Init Wizard Provider-Agnostic Tier Seçimi
- Model: opus
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: src/cli/commands/init.ts, src/cli/commands/onboard.ts, src/cli/auto-setup.ts
- Scope: src/cli/

### Description
Init wizard'ı provider-agnostic tier seçimine geçir.

A) `src/cli/commands/init.ts`:
- Plan mode seçimi: mode preset (performance/balanced/economic/api) → model_strategy otomatik
- Skill isimleri zaten Sprint 096'da düzeltildi — doğrula

B) `src/cli/commands/onboard.ts`:
- Wizard'da model ismi yerine tier soracak şekilde güncelle
- "Which AI provider?" → "Which working mode?" akışı

C) `src/cli/auto-setup.ts`:
- Hard-coded `brainModel: 'opus'` → tier-based: `brain_tier: 'premium'`
- `defaultModel: 'sonnet'` → `worker_tier: 'standard'`
- Provider tespiti sonrasında uygun tier otomatik seçilsin

**Kanıt:** `grep "brain_tier\|worker_tier\|model_strategy" src/cli/auto-setup.ts` → 2+ eşleşme

**Test:** `tsc --noEmit` temiz.

---

## Task 11: token-counter.ts + sprint-reporter.ts Hard-Code Temizliği
- Model: opus
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: src/core/token-counter.ts, src/orchestra/sprint-reporter.ts, src/orchestra/sprint-utils.ts, src/cli/helpers/selective-retry.ts
- Scope: src/core/, src/orchestra/, src/cli/

### Description
Kalan hard-coded model referanslarını temizle.

A) `src/core/token-counter.ts`:
- Hard-coded model budget map → modelRegistry'den contextWindow okuyarak türet
- `'gpt-4.1': DEFAULT_BUDGET` gibi literal'ler kaldırılıp `modelRegistry.get(model)?.contextWindow` ile değiştirilir

B) `src/orchestra/sprint-reporter.ts`:
- Satır 712: `mode: 'performance'` (zaten düzeltildi, doğrula)
- Fallback config'deki model referansları tier-based mı kontrol et

C) `src/orchestra/sprint-utils.ts`:
- Satır 122: `buildCommand('opus' as ModelType, ...)` → config'den veya modelRegistry'den default model al

D) `src/cli/helpers/selective-retry.ts`:
- Satır 72: `original?.model ?? 'opus'` → `original?.model ?? modelRegistry.getByProviderAndTier('claude', 'premium')?.id ?? 'opus'`

**Kanıt:** Hard-coded 'opus', 'sonnet', 'haiku', 'gpt-*', 'gemini-*' literal sayısı — sadece type tanımları ve backward compat alias'larında kalmalı

**Test:** `tsc --noEmit` temiz.

---

## Task 12: Dashboard Test Fix + Integration Test
- Model: opus
- Effort: high
- Agent: test-writer
- Skills: typescript-expert, testing-expert
- Files: tests/dashboard/TaskCard.test.tsx, tests/dashboard/components.test.ts, tests/core/model-registry.test.ts (new)
- Scope: tests/

### Description
Dashboard'daki 12 failing testi düzelt ve ModelRegistry için integration test yaz.

A) Dashboard test fix:
- `tests/dashboard/TaskCard.test.tsx` — 9 fail: i18n key uyumsuzlukları (Sprint 092'de key'ler değişti). Test'lerdeki beklenen string'leri yeni i18n key çıktılarıyla eşleştir.
- `tests/dashboard/components.test.ts` — 3 fail: "No technical debt entries" → i18n key çıktısı

B) `tests/core/model-registry.test.ts` yeni dosya — ModelRegistry integration testleri:
- Tüm 15 builtin model yükleniyor
- getByProvider() doğru model sayısı döndürüyor (claude:3, codex:6, gemini:4)
- getByTier() tüm tier'lar için doğru sonuç
- getEquivalent() cross-provider eşleştirme (opus → gpt-5 → gemini-2.5-pro)
- getTier() doğru tier döndürüyor
- register() runtime ekleme çalışıyor
- resolveApiId() doğru API ID'leri
- estimateCost() hesaplama doğruluğu
- compareTiers() sıralama doğruluğu (economy < standard < premium < premium_plus)
- isAtLeastTier() kontrol

**Kanıt:** `npx vitest run tests/core/model-registry.test.ts` → 0 fail

**Test:** `tsc --noEmit` temiz. `npx vitest run` → 0 fail. `npx vitest run --config src/dashboard/vitest.config.ts` → 0 fail.

---

## Quality Rules
- tsc --noEmit MUST pass
- npx vitest run → 0 fail (11,852+ test)
- npx vitest run --config src/dashboard/vitest.config.ts → 0 fail (dashboard 12 fix dahil)
- ModelRegistry TEK KAYNAK — yeni model eklemek = 1 entry
- Mevcut export imzaları AYNEN korunur — 0 breaking change
- haiku_allowed backward compat korunur ama min_tier tercih edilir
- brain_model/default_model backward compat korunur ama brain_tier/worker_tier tercih edilir
- Codex CLI güncel format (exec komutu)
- Gemini CLI güncel format (-m flag, --approval-mode plan)
- 15 model kataloğu: 3 Claude + 6 OpenAI + 4 Gemini + 2 yeni (gemini-3.1-pro-preview, gpt-4.1-mini)
- %100 GO hedefli — gerçek veri doğrulaması yapılacak
