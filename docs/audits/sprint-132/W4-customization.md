# W4 — Customization & Extensibility Audit (Sprint 132)

## Executive Summary

Deckent, enterprise müşterilerin ihtiyaçlarına uyarlanabilir güçlü bir genişletilebilirlik altyapısına sahip. Plugin sistemi (4 hook point, npm/git/local install), 3 katmanlı config merge, managed-docs template engine (i18n desteğiyle), marketplace scaffold (RegistryClient, DependencyResolver, RatingSystem, SkillSandbox, MarketplaceAuth), ve intent-based routing engine (v2) önemli extension point'ler sunuyor. Ancak **plugin API versioning** bulunmuyor, marketplace registry (registry.deckent.dev) canlı değil, routing engine'e plugin hook'u eklenemez durumda, ve managed-docs generator'ları MJS desteği için async yol henüz pipeline'a bağlanmamış. Toplamda 6 MEDIUM, 5 LOW ve 3 INFO seviyesinde 14 bulgu tespit edildi. CRITICAL veya HIGH bulgu yok — mevcut genişletilebilirlik yüzeyi sağlam temeller üzerine inşa edilmiş.

## Methodology

**Statik analiz kapsamı:**

- `src/core/plugin.ts` (456 satır) — Plugin lifecycle, install, remove, create
- `src/core/plugin-hooks.ts` (797 satır) — Hook registry, CI guardian, pre/post sprint validation
- `src/core/config.ts` (1110 satır) — 3-layer merge, validation, CONFIG_METADATA
- `src/core/mode-presets.ts` (113 satır) — Tier-based model strategy presets
- `src/orchestra/managed-docs/` (9 dosya) — Template renderer, content generators, plugin loader, docs config, section updater, doc cache, types
- `src/core/marketplace/` (5 dosya) — RegistryClient, DependencyResolver, RatingSystem, MarketplaceAuth, SkillSandbox
- `src/core/routing-engine.ts` (554 satır) — V2 intent-based routing, override resolution, skill budget
- `src/orchestra/temp-skill-generator.ts` (392 satır) — Template-based skill/agent generation
- `src/agents/adaptive-agent.ts` (213 satır) — Prompt effectiveness analysis, suggestion generation
- `src/agents/prompt-evolution.ts` — Evolution event logging
- `.deckent/plugins/` (3 plugin örnekleri: test-runner, doc-writer, code-reviewer)

**Tarama pattern'leri:** Plugin lifecycle fonksiyonları, hook registration noktaları, config metadata alanları, template engine mekanizmaları, marketplace API surface, routing override path'leri.

**Karşılaştırma:** VSCode Extension API, Obsidian plugin model, Grafana plugin SDK pattern'leri ile karşılaştırma yapıldı.

## Findings

| # | Severity | Category | Location | Description | Impact | Recommendation |
|---|----------|----------|----------|-------------|--------|----------------|
| 1 | MEDIUM | PluginAPI | src/core/plugin.ts:10-22 | `PluginManifest` interface'inde API version field'ı yok. Plugin'in hangi Deckent API versiyonuyla uyumlu olduğu belli değil. VSCode'un `engines.vscode` field'ına benzer bir mekanizma eksik. | Deckent güncellemesi sonrası eski plugin'ler sessizce kırılabilir. | `manifest.json`'a `deckentApiVersion: "^0.4.0"` field'ı ekle, `validateManifest()` bunu kontrol etsin. |
| 2 | MEDIUM | PluginAPI | src/core/plugin-hooks.ts:16-17 | Sadece 4 hook tipi mevcut: `beforeSprint`, `afterSprint`, `beforeTask`, `afterTask`. `beforeRouting`, `afterRouting`, `beforeEvaluate`, `afterEvaluate` gibi kritik lifecycle noktaları hook olarak expose edilmemiş. | Plugin yazarları routing kararlarını veya değerlendirme sürecini özelleştiremez. | Hook tiplerini en azından `beforeRouting`, `afterEvaluate`, `onWorkerSpawn`, `onWorkerComplete` ile genişlet. |
| 3 | MEDIUM | PluginAPI | src/core/plugin-hooks.ts:117 | `VALID_HOOK_NAMES` sadece `beforeSprint` ve `afterSprint` için hook path'i doğruluyor (satır 77-82), ancak manifest hooks objesinde `beforeTask` ve `afterTask` key'lerinin string olup olmadığı kontrol edilmiyor. | `beforeTask`/`afterTask` hook path'leri manifest'te geçersiz tiple (örn. number) tanımlanabilir — sessizce skip edilir. | `validateManifest()` fonksiyonunda 4 hook key'in hepsini doğrula. |
| 4 | MEDIUM | Marketplace | src/core/marketplace/registry-client.ts:59 | `DEFAULT_REGISTRY_URL = 'https://registry.deckent.dev'` — bu URL henüz canlı bir servis değil. Tüm marketplace modülleri (RegistryClient, DependencyResolver, RatingSystem, MarketplaceAuth) sadece schema ve interface tanımlı; gerçek bir kayıt defteri backend'i yok. | Üçüncü taraf skill/agent yayınlama akışı kullanılamaz durumda. Marketplace "scaffold" seviyesinde, "production" değil. | Registry backend'i launch edilene kadar marketplace CLI komutlarını `[EXPERIMENTAL]` olarak işaretle; local-only mod ekle. |
| 5 | MEDIUM | ManagedDocs | src/orchestra/managed-docs/plugin-loader.ts:60-66 | JSON generator'lar senkron yükleniyor, MJS generator'lar sadece async `loadUserGeneratorsAsync()` ile yüklenebilir. Ancak async variant **hiçbir yerde sprint pipeline'ına bağlanmamış** — sadece CLI `docs run --with-plugins` için ayrılmış (satır 71 yorum). | Kullanıcıların .mjs generator yazma kapasitesi var ama sprint sırasında otomatik çağrılmıyor. | `runManagedDocUpdates()` içinde `loadUserGeneratorsAsync()` opsiyonel olarak çağrılsın veya MJS desteğini belge/planlayıcıya açıkça ekle. |
| 6 | MEDIUM | ConfigLayer | src/core/config.ts:710-993 | `CONFIG_METADATA` 40+ alan tanımlıyor ancak bazı yeni alanlar eksik: `evaluation_rubric`, `rubric_max_retries`, `adaptive_thresholds`, `adaptive_config`, `routing_config`, `ai_planner_timeout` gibi `createDefaultConfig()` ve `loadConfig()` return objesinde olan alanlar metadata'da yok. | `generateConfigReference()` ile üretilen doküman eksik kalıyor — enterprise kullanıcılar bazı config seçeneklerini keşfedemiyor. | `CONFIG_METADATA`'ya eksik alanları ekle; bir test yazılarak senkronizasyon zorlanabilir. |
| 7 | LOW | RoutingHook | src/core/routing-engine.ts:67-153 | `routeTaskV2()` fonksiyonu tamamen kapalı — plugin'lerden veya config'den routing kararına müdahale edecek hook/callback mekanizması yok. `resolveOverrides()` sadece task-level `UserOverride` destekliyor, runtime plugin hook'u yok. | Enterprise müşteriler kendi routing mantığını inject edemez (örn. "tüm security task'larını özel agent'a yönlendir" gibi dinamik kurallar). | `routeTaskV2()`'ye optional `beforeRouting` / `afterRouting` callback parametreleri ekle veya plugin hook sistemiyle entegre et. |
| 8 | LOW | UndocumentedKnob | src/core/config.ts:396-450 | `createDefaultConfig()` birçok alan döndürüyor (`claude_backend`, `auth_mode`, `human_checkpoints`, `skill_routing`, `search_enabled`, `search_provider`, `search_cache_ttl`, `notify_on_complete`, `notify_channel`, `notify_url`, `telemetry_enabled`, `telemetry_anonymous`, vb.) ancak bazıları `CONFIG_METADATA`'da tanımlı olmasına rağmen `.deckent/config.json` schema dokümantasyonunda yer almıyor. | Kullanıcılar bu "gizli" ayarları bilmeden varsayılanlarla kullanmak zorunda. | `deckent config list` ve `deckent help config` çıktılarının CONFIG_METADATA ile tam senkron olduğunu doğrula. |
| 9 | LOW | ManagedDocs | src/orchestra/managed-docs/content-generators.ts:70-104 | `generators` array'i modül seviyesinde `register()` ile dolduruluyor — yani her import'ta aynı generator'lar yeniden register ediliyor. Ancak idempotent: her `findGenerator()` çağrısı pool'u yeniden taramıyor; `getAllGenerators()` tüm listeyi veriyor. Kullanıcı override mekanizması `extraGenerators` parametresiyle sağlanıyor ama bunu kullanmak için TypeScript yazma bilgisi gerekiyor. | JSON generator'lar bu sorundan muaf (plugin-loader üzerinden yükleniyor), ama yeni bir built-in generator eklemek için kaynak koda dokunmak gerekiyor. | Generator registry'yi config-driven yaparak `.deckent/generators/*.json` formatını birincil genişletme noktası olarak daha belirgin belge. |
| 10 | LOW | BreakingRisk | src/core/plugin.ts:10-22 | `PluginManifest` interface'inde `hooks` objesinin key'leri string literal union (`beforeSprint | afterSprint | beforeTask | afterTask`) ama sadece `beforeSprint` ve `afterSprint` string olarak doğrulanıyor (satır 77-82). Yeni hook tipi eklenmesi breaking change olmayacak ama mevcut plugin'ler yeni hook'ları tanımamış olacak. | Forward compatibility sorunsuz, ama plugin yazarları hangi hook'ların mevcut olduğunu runtime'da sorgulayamıyor. | `getAvailableHooks(): PluginHook[]` gibi bir discovery API ekle. |
| 11 | LOW | Marketplace | src/core/marketplace/skill-sandbox.ts:38-49 | `SUSPICIOUS_PATTERNS` regex tabanlı tarama 10 pattern içeriyor — AST tarama (satır 77-175) daha kapsamlı ama sadece .ts/.js dosyalarını tarıyor. Markdown (.md) SKILL dosyaları taranmıyor, ki bu dosyalar `entrypoint` olarak kullanılıyor. | SKILL.md içinde `eval()` gibi pattern'ler regex ile yakalanır ama AST tarama bunları atlıyor — düşük risk, çünkü .md dosyaları genelde kod çalıştırmaz. | Sandbox raporu `.md` dosyaları için sadece regex taraması yaptığını açıkça belirt. |
| 12 | INFO | PluginAPI | .deckent/plugins/ | 3 örnek plugin mevcut (test-runner, doc-writer, code-reviewer). Her biri `manifest.json` + `SKILL.md` yapısında. Hooks bölümü `null` değerlerle tanımlı — yani hiçbir hook aktif değil. | Mevcut plugin'ler sadece skill tanımı; hook mekanizmasını kullanmıyorlar. İyi örnekler eksik. | Hook kullanan bir örnek plugin oluştur (örn. Slack notification after sprint). |
| 13 | INFO | ConfigLayer | src/core/mode-presets.ts:35-80 | 4 preset tanımlı: `performance`, `balanced`, `economic`, `api`. Kullanıcı custom preset tanımlayamıyor — sadece mevcut preset'lerin üzerine `model_strategy` override yapabiliyor. | Enterprise kullanıcılar "compliance" veya "high-security" gibi özel modlar oluşturamıyor. | Custom mode preset tanımlama desteği ekle (`config.custom_modes` alanı). |
| 14 | INFO | ManagedDocs | src/orchestra/managed-docs/template-renderer.ts:120-134 | Template engine sadece `{{path.to.value}}` placeholder'larını destekliyor — conditional (`{{#if}}`) veya loop (`{{#each}}`) yok. | Karmaşık template'ler yazılamıyor. JSON generator'lar veya MJS generator'lar bunun yerine kullanılmalı. | Mevcut basitlik kasıtlı — karmaşık ihtiyaçlar için MJS generator yolunu dokümante et. Handlebars/Mustache ekleme gerekmez. |

## Metrics

- Dosya tarandı: 22
- Toplam bulgu: 14
- CRITICAL: 0, HIGH: 0, MEDIUM: 6, LOW: 5, INFO: 3
- Extension point kategori: PluginAPI (4), Marketplace (2), ManagedDocs (3), ConfigLayer (2), RoutingHook (1), UndocumentedKnob (1), BreakingRisk (1)

## Evidence

### Bulgu #1 — Plugin API Versioning Eksik
```typescript
// src/core/plugin.ts:10-22
export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  entrypoint: string;
  // v2 fields
  triggers?: string[];
  permissions?: string[];
  hooks?: { beforeSprint?: string; afterSprint?: string; beforeTask?: string; afterTask?: string };
  model?: ModelType;
  enabled?: boolean;
  dependencies?: string[];
  // NOT PRESENT: deckentApiVersion, minDeckentVersion, or engines field
}
```

### Bulgu #2 — Sınırlı Hook Tipleri
```typescript
// src/core/plugin-hooks.ts:16-17
export type PluginHook = 'beforeSprint' | 'afterSprint' | 'beforeTask' | 'afterTask';
// Missing: beforeRouting, afterRouting, beforeEvaluate, afterEvaluate, onWorkerSpawn, onWorkerComplete
```

### Bulgu #3 — Manifest hooks doğrulaması eksik
```typescript
// src/core/plugin.ts:71-82
if (obj['hooks'] !== undefined) {
  // ...
  const hooks = obj['hooks'] as Record<string, unknown>;
  for (const hookKey of ['beforeSprint', 'afterSprint'] as const) {
    // ONLY validates beforeSprint and afterSprint
    // beforeTask and afterTask are NOT validated here
  }
}
```

### Bulgu #4 — Marketplace Registry canlı değil
```typescript
// src/core/marketplace/registry-client.ts:59
const DEFAULT_REGISTRY_URL = 'https://registry.deckent.dev';
// This URL is not a live service — all marketplace modules are schema-only
```

### Bulgu #5 — MJS Generator'lar pipeline'a bağlı değil
```typescript
// src/orchestra/managed-docs/plugin-loader.ts:60-66
// .mjs loading is async — intentionally not handled here.
// Users needing executable generators should call loadUserGeneratorsAsync.

// src/orchestra/managed-docs/managed-doc-runner.ts:30
// Only calls loadUserGeneratorsSync — MJS generators never loaded during sprint
const userGenerators = loadUserGeneratorsSync(ctx.projectRoot);
```

### Bulgu #6 — CONFIG_METADATA eksik alanlar
```typescript
// src/core/config.ts:710-993 — CONFIG_METADATA'da tanımlı alanlar (40+)
// Ancak loadConfig() return objesinde mevcut ama metadata'da eksik olanlar:
// evaluation_rubric, rubric_max_retries, adaptive_thresholds, adaptive_config,
// routing_config, routing_engine, ai_planner_timeout, cleanup_delay_ms,
// spawn_backend, docker_image, docker_timeout
```

### Bulgu #7 — Routing Engine hook'suz
```typescript
// src/core/routing-engine.ts:67-72
export function routeTaskV2(
  task: { title: string; description: string; scope: TaskScope },
  agentPool: AgentPool,
  skillPool: Map<string, SkillDefinition>,
  options?: RoutingOptions,
): RoutingDecision {
  // No plugin hook callback — routing decision is fully internal
  // UserOverride only available via options.overrides (task-level)
}
```

### Bulgu #10 — Hook discovery API eksik
```typescript
// src/core/plugin-hooks.ts:56-68
const hookRegistry = new Map<PluginHook, HookCallback[]>();
// No getAvailableHooks() or discoverHooks() API
// Plugin authors must hardcode hook names from documentation
```

## Extension Point Catalog

| # | Extension Point | Type | Location | Stability | API Surface | How Users Extend | Example |
|---|----------------|------|----------|-----------|-------------|-----------------|---------|
| 1 | **Plugin Hooks** | Lifecycle callback | `src/core/plugin-hooks.ts` | Stable (4 hooks) | `registerHook()`, `runHooks()` | `.deckent/plugins/*/manifest.json` → hooks.beforeSprint/afterSprint/beforeTask/afterTask path → JS/MJS module with default export function | Plugin runs Slack notification after sprint |
| 2 | **Plugin Install** | Package management | `src/core/plugin.ts` | Stable | `installPlugin(source, pluginsDir)` | `deckent plugin install <npm|git|local>` → validates manifest → auto-enables | `deckent plugin install @company/custom-skill` |
| 3 | **Plugin Create** | Scaffolding | `src/core/plugin.ts` | Stable | `createPlugin(name, pluginsDir)` | `deckent plugin create my-plugin` → manifest.json + SKILL.md + README.md | Creates boilerplate in `.deckent/plugins/my-plugin/` |
| 4 | **Config 3-Layer Merge** | Configuration | `src/core/config.ts` | Stable | `loadConfig()`, `deepMerge()` | `~/.deckent/config.json` (global) → `.deckent/config.json` (project) → env vars (`DECKENT_*`) | Global: brain_provider=claude; Project: mode=performance |
| 5 | **Config Metadata** | Self-documenting config | `src/core/config.ts:710+` | Stable | `CONFIG_METADATA`, `getConfigHelp()`, `listConfigByCategory()`, `generateConfigReference()` | Auto-generated CONFIG-REFERENCE.md from metadata | `deckent config help mode` → returns description, type, default, options |
| 6 | **Mode Presets** | Model strategy | `src/core/mode-presets.ts` | Stable | `MODE_PRESETS`, `getModePreset()` | config.mode = 'performance' / 'balanced' / 'economic' / 'api' + `config.model_strategy` override | User overrides worker_tier to 'economy' in balanced mode |
| 7 | **Managed Docs — Auto Sections** | Document automation | `src/orchestra/managed-docs/` | Experimental (Sprint 131) | `.deckent/docs.json` → `autoSections[]`, `protectedSections[]` | JSON config: specify which sections Deckent auto-updates and which are protected | `{ "path": "README.md", "autoSections": ["Sprint Metrics", "Agent Performance"] }` |
| 8 | **Managed Docs — Templates** | Custom content | `src/orchestra/managed-docs/template-renderer.ts` | Experimental | `templates` field in docs.json entry | `{ "templates": { "KPI": "Coverage: {{metrics.coveragePercent}}%" } }` | Template overrides built-in generator for specific section |
| 9 | **Managed Docs — User Generators (JSON)** | Custom generators | `src/orchestra/managed-docs/plugin-loader.ts` | Experimental | `.deckent/generators/*.json` → `{ id, patterns, patternsByLang, template }` | JSON file with patterns + template string — no code execution | `{ "id": "custom-kpi", "patterns": ["kpi"], "template": "Score: {{metrics.coveragePercent}}" }` |
| 10 | **Managed Docs — User Generators (MJS)** | Advanced generators | `src/orchestra/managed-docs/plugin-loader.ts` | Experimental (not wired) | `.deckent/generators/*.mjs` → default export `SectionGenerator` | MJS module with `{ patterns, generate(ctx) }` — requires async path | Full code control over generated section content |
| 11 | **Managed Docs — i18n** | Multi-language support | `src/orchestra/managed-docs/content-generators.ts` | Stable | `patternsByLang` field on generators | Built-in generators support en/tr/de/es section title matching | Section "Sprint Metrikleri" → matches "sprint metrics" generator |
| 12 | **Managed Docs — Doc Cache** | Performance | `src/orchestra/managed-docs/doc-cache.ts` | Stable | `contentHash()`, `readDocCache()`, `writeDocCache()` | Automatic — skips re-generation when content+config unchanged | No user action needed; transparent caching per doc entry |
| 13 | **Marketplace — Registry Client** | Remote search/publish | `src/core/marketplace/registry-client.ts` | Experimental (no backend) | `searchSkills()`, `getSkillDetail()`, `publishSkill()` | Future: `deckent marketplace search "react"` → remote skill discovery | Not yet functional — registry.deckent.dev not live |
| 14 | **Marketplace — Dependency Resolver** | Dependency management | `src/core/marketplace/dependency-resolver.ts` | Experimental | `resolve()`, `detectCircular()`, `resolveConflicts()` | Topological sort for skill install ordering; circular dep detection | `resolver.resolve('my-skill')` → ordered install list |
| 15 | **Marketplace — Rating System** | Skill quality tracking | `src/core/marketplace/rating-system.ts` | Experimental | `calculateLocalRating()`, `submitRating()`, `getSkillRating()` | Auto-calculated: success*0.6 + coverage*0.3 + frequency*0.1; user submissions (1-5) | `rating.calculateLocalRating('my-skill', { successRate: 0.8, avgCoverage: 85, frequency: 10 })` |
| 16 | **Marketplace — Skill Sandbox** | Security scanning | `src/core/marketplace/skill-sandbox.ts` | Stable | `validateSkillSafety()`, `validateManifest()`, `quarantine()`, `trustSkill()` | Two-pass scan: regex (all files) + AST (.ts/.js); quarantine to `.quarantine/` | Installed skill auto-scanned before activation |
| 17 | **Marketplace — Auth** | Token management | `src/core/marketplace/marketplace-auth.ts` | Experimental | `login()`, `logout()`, `getToken()`, `isAuthenticated()` | `deckent marketplace login` → token stored in `~/.deckent/credentials/marketplace.json` (0o600) | Token-based auth for skill publishing |
| 18 | **Routing Engine — User Overrides** | Routing control | `src/core/routing-engine.ts` | Stable | `UserOverride` in `RoutingOptions`, `resolveOverrides()` | DIRECTIVES: `- Agent: security-auditor`, `- Skills: typescript-expert` | Force agent/skill per task via DIRECTIVES |
| 19 | **Routing Engine — Learning Bonus** | Adaptive routing | `src/core/routing-engine.ts` | Stable | `LearningBonus` in `RoutingOptions` | Automatic — sprint outcomes affect future routing scores | Recent success → +3 bonus, recent failure → -2 penalty |
| 20 | **Temp Skill Generator** | Auto-generated skills | `src/orchestra/temp-skill-generator.ts` | Stable | `generateProjectConventionsSkill()`, `generateDataDrivenSkills()`, `generateTempAgents()` | Automatic — project analysis creates temp skills/agents; no user action needed | TypeScript project → temp-react-ts-specialist agent auto-generated |
| 21 | **Adaptive Agent** | Prompt improvement | `src/agents/adaptive-agent.ts` | Stable | `analyzePromptEffectiveness()`, `suggestPromptChange()` | Automatic analysis; suggestions must be manually reviewed — never auto-applied | Low success rate → suggests "Error Handling" section additions |
| 22 | **Prompt Evolution Log** | History tracking | `src/agents/prompt-evolution.ts` | Stable | `recordEvolution()`, `getTimeline()` | Stored in `.deckent/agents/{id}/evolution.json` | Track agent prompt versions over time |
| 23 | **Human Checkpoints** | Approval gates | `src/core/config.ts` (human_checkpoints) | Stable | `config.human_checkpoints: string[]` | Config: `"human_checkpoints": ["after_plan", "before_fix"]` | Sprint pauses for human approval at configured points |
| 24 | **CI Guardian Config** | Build/test control | `src/core/plugin-hooks.ts` | Stable | `CiGuardianConfig`, `resolveCiGuardianConfig()` | `.deckent/config.json` → `ci_guardian: { block_on_tsc_fail, block_on_test_fail, track_coverage }` | Disable pre-sprint tsc check: `ci_guardian.block_on_tsc_fail: false` |
| 25 | **Env Var Overrides** | Runtime config | `src/core/config.ts:506-521` | Stable | `DECKENT_BRAIN_PROVIDER`, `DECKENT_WORKER_PROVIDER`, `DECKENT_MODE`, `DECKENT_LANGUAGE` | Set env vars to override config at runtime | `DECKENT_MODE=performance deckent start` |

## Recommendations (Sprint 133+)

### MEDIUM Priority

1. **Plugin API Versioning** — `PluginManifest`'e `deckentApiVersion: string` field'ı ekle. `validateManifest()` bunu kontrol etsin. Semver range desteği (`^0.4.0`). Bu, Deckent güncellemelerinde plugin uyumluluk kırılmalarını önleyecek. (Effort: low)

2. **Hook Genişletme** — `PluginHook` tipine `beforeRouting`, `afterEvaluate`, `onWorkerSpawn`, `onWorkerComplete` ekle. `sprint-phases.ts` ve `sprint-controller.ts`'de uygun noktalarda `runHooks()` çağrıları ekle. (Effort: normal)

3. **Manifest Hooks Doğrulama** — `validateManifest()` fonksiyonunda `beforeTask` ve `afterTask` hook path'lerini de string olarak doğrula. (Effort: low)

4. **Marketplace Durumu Netleştir** — Registry backend canlı olmadığı sürece marketplace CLI komutlarını `[EXPERIMENTAL]` olarak işaretle. Local-only mod desteği ekle: skill'ler `.deckent/skills/` altında offline yayınlanabilsin. (Effort: normal)

5. **MJS Generator Pipeline Entegrasyonu** — `runManagedDocUpdates()` içinde opsiyonel olarak async generator path'ini aktif et veya bu özelliği `docs run --with-plugins` ile sınırlı tutulduğunu açıkça dokümante et. (Effort: low)

6. **CONFIG_METADATA Senkronizasyonu** — Eksik alanları (evaluation_rubric, adaptive_thresholds, routing_engine, cleanup_delay_ms vb.) metadata'ya ekle. Bir test yazarak `createDefaultConfig()` key'leriyle `CONFIG_METADATA` key'lerinin senkronizasyonunu zorla. (Effort: low)

### LOW Priority

7. **Routing Hook** — `routeTaskV2()`'ye optional `onBeforeRouting` ve `onAfterRouting` callback'ler ekle veya plugin hook sistemiyle entegre et. (Effort: normal)

8. **Hook Discovery API** — `getAvailableHooks(): PluginHook[]` fonksiyonu ekle. Plugin yazarları hangi hook'ların mevcut olduğunu programatik olarak sorgulayabilsin. (Effort: low)

9. **Custom Mode Presets** — `config.custom_modes` alanı ile kullanıcı tanımlı mode preset'leri destekle. (Effort: normal)

10. **Generator Dokümantasyonu** — `.deckent/generators/*.json` formatı için user-facing rehber yaz. Managed-docs genişletme yolunu ana README'ye veya DECKENT.md'ye ekle. (Effort: low)

## Context7 References

- **VSCode Extension API** — `engines.vscode` field'ı plugin uyumluluk garantisi sağlar. Deckent'in plugin manifest'inde benzer bir alan eksik.
- **Obsidian Plugin Model** — Obsidian plugin'leri manifest.json'da `minAppVersion` ile minimum uyumlu sürümü belirtir. Lifecycle hook'ları (onload/onunload) 2 adet; Deckent'in 4'ü daha zengin.
- **Grafana Plugin SDK** — Plugin'ler schema-driven, discovery API mevcut, marketplace backend canlı. Deckent'in marketplace scaffold'u Grafana'nın uygulamasına yakın yapıda ama backend eksik.
- **Clean Architecture / Open-Closed Principle** — Deckent'in plugin-hooks.ts ve managed-docs/plugin-loader.ts modülleri Open-Closed prensibi uyguluyor: mevcut kodu değiştirmeden yeni hook callback'ler ve yeni generator'lar eklenebilir.
- **Node.js Module Loading** — `import()` ile dinamik MJS yükleme güvenli ama sandbox dışında çalışıyor. Deckent'in `loadHookModule()` (plugin-hooks.ts:126-154) bunu kullanıyor; risk `SkillSandbox` tarafından hafifletiliyor ama plugin hook modülleri sandbox'tan geçmiyor (Bulgu #11 ilişkili).
