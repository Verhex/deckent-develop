# Analysis: src/core/provider.ts
**Task ID:** 142-004 | **Model:** opus | **LoC:** 610 | **Effort:** max

## 1. Amaci
ProviderAdapter interface'ini, ProviderRegistry singleton'unu, provider auto-detection (CLI+env var), fallback chain mekanizmasini, .deck secret yonetimini ve bootstrapProviders() orkestrasyonunu tanimlar. Brain'in multi-provider desteginin temel konfigurasyonu. Sprint lifecycle boyunca provider secimi, fallback, health check ve secret injection bu modulden saglanir.

## 2. Public API
- `interface ProviderSpawnOptions` — spawn opsiyonlari (allowedTools, autoApprove, projectDir, logPath, env)
- `interface ProviderWorkerInfo` — worker bilgi tipi (taskId, model, spawnedAt, pid)
- `interface ProviderAdapter` — soyut provider arayuzu (name, supportedModels, spawn, kill, listWorkers, isAvailable, buildCommand, buildPlannerCommand?)
- `class ProviderError extends Error` — base hata sinifi (providerName field)
- `class ProviderNotFoundError extends ProviderError` — kayitli olmayan provider
- `class ProviderUnavailableError extends ProviderError` — erisilemez provider
- `class ProviderRegistry` — registerProvider, getProvider, listProviders, getDefault, setDefault, hasProvider, unregisterProvider, clear, size
- `const providerRegistry: ProviderRegistry` — global singleton
- `interface DetectedProvider` — detection sonucu (name, available, version, authMethod, models)
- `function detectCliVersion(cmd, args?): string | undefined` — CLI version tespiti
- `function detectAvailableProviders(): Promise<DetectedProvider[]>` — tum providerlari tespit et
- `function formatDetectedProviders(providers): string` — display formati
- `interface FallbackResult` — fallback sonuc tipi
- `function resolveProviderWithFallback(...)`: Promise<FallbackResult>` — fallback chain
- `function applyDeckSecretsToEnv(secrets): Record<string, Record<string, string>>` — .deck env injection
- `interface BootstrapResult` — bootstrap sonuc tipi (connector, registered, skipped, defaultProvider, providerEnvOverrides)
- `function bootstrapProviders(config, projectRoot?, registry?): Promise<BootstrapResult>` — full bootstrap

JSDoc: **MEVCUT** — tum public fonksiyon ve interface'lerde detayli JSDoc var. Yeterli.

## 3. Ic Bagimliliklar
- `./types.js` → ModelType, ProviderName
- `./config-types.js` → ResolvedConfig
- `./task-types.js` → PROVIDER_MODEL_MAP
- `./model-equivalence.js` → getEquivalentModel
- `./deck-file.js` → loadDeckSecrets
- `../orchestra/connector.js` → Connector **⚠️ ADR-008 POTANSIYEL IHLAL**: core/ → orchestra/ import. Ancak Connector provider lifecycle management icindir, brain-specific degil. Core'un orchestra'ya bagimli olmasi mimariye aykiri.

Dongusel bagimllik riski: **YOK** (tek yonlu import chain).

## 4. Dis Bagimliliklar
- `node:child_process` → spawnSync (ADR-006 uyumlu)
- Runtime dep yok (ADR-010 uyumlu)

## 5. Complexity
- Fonksiyon sayisi: 14 (detectClaude, detectCodex, detectGemini, detectAvailableProviders, formatDetectedProviders, resolveProviderWithFallback, applyDeckSecretsToEnv, bootstrapProviders, detectCliVersion, + 5 ProviderRegistry method)
- Max cyclomatic complexity: `bootstrapProviders()` (satir 490-609) — ~8 branchli, en karmasik fonksiyon
- ProviderRegistry methodlari basit, dusuk complexity

## 6. Type Safety
- `any` sayisi: **0**
- `@ts-ignore` / `@ts-expect-error`: **0**
- `as unknown`: **0**
- Non-null `!`: satir 572 (`registered[0]!`) — guvenli: `registered.length > 0` check edilmis
- Unsafe cast: satir 552 `Object.create(adapter, ...) as ProviderAdapter` — Object.create ile yeni obje olusturup type assertion. Teknik olarak guvenli ama fragile.

## 7. ADR Compliance
- **ADR-006** (spawnSync): ✅ detectCliVersion() uses spawnSync with 5s timeout, encoding='utf-8'
- **ADR-008** (brain import): ⚠️ core/provider.ts imports from `../orchestra/connector.js` — core→orchestra bagimlilik. Connector provider lifecycle icin kullaniliyor, ancak core modulunun orchestra'ya bagimli olmasi ADR-008 ruhuna aykiri. **P2 seviyesinde mimari concern.**
- **ADR-010** (tek runtime dep): ✅ sadece node: built-in
- **ADR-022** (CLI/MCP parity): N/A (altyapi modulu)
- **ADR-033** (product vision): ✅ provider-agnostic tasarim
- **ADR-037** (RBAC): N/A
- **ADR-039** (self-modifying): N/A
- **Memory V2**: N/A (provider modulu, memory ile iliskisi yok)

## 8. Test Coverage
- `tests/core/provider.test.ts` — ProviderRegistry (20 test), Error classes (4 test), applyDeckSecretsToEnv (11 test), BootstrapResult contract (5 test) = **40 test**
- `tests/core/provider-fallback.test.ts` — resolveProviderWithFallback (15 test) = **15 test**
- `tests/core/provider-bootstrap.test.ts` — bootstrapProviders (20+ test, .deck secret loading 12 test) = **32 test**
- `tests/core/provider-detection.test.ts` — detectCliVersion (6 test), detectAvailableProviders (12 test), formatDetectedProviders (4 test) = **22 test**
- **Toplam: ~109 test** — EXCELLENT coverage
- Mock kalitesi: Iyi. spawnSync mock, env var save/restore, Connector integration test.
- Edge case: Empty string API key, subscription auth_mode skip, unhealthy provider keep, health check failure resilience.
- **EKSIK:** Windows platform branch (spawnSync `shell: isWindows`) test edilmiyor.

## 9. TODO/FIXME/HACK Inventory
Yok.

## 10. Dead Code
- `ProviderWorkerInfo` interface (satir 20-25): Grep ile kontrol — baska modullerde kullaniliyor olabilir. Dosya icinde kullanilmiyor. **P3 — verify usage across codebase.**

## 11. Security
- **Secret exposure riski**: `applyDeckSecretsToEnv()` API key'leri `process.env`'e yaziyor — bu standard pattern ama process.env global state. Worker spawn'a per-provider env override gonderilmesi iyi practice.
- **spawnSync injection riski**: `detectCliVersion(cmd)` — cmd parametresi hardcoded ('claude', 'codex', 'gemini'), user input degil. ✅ Guvenli.
- **Windows shell:true**: satir 234 — `shell: isWindows` — Windows'ta command injection riski var ama cmd sadece hardcoded CLI tool isimleri. ✅ Kabul edilebilir.
- **Bare catch**: Satir 238, 556, 604 — hatalar sessizce yutuluyor. Bootstrap icin kabul edilebilir (fail-safe pattern) ancak debugLog ile loglanmasi iyi olurdu.

## 12. Memory V2 Uyumu
N/A — provider modulu, memory sistemiyle dogrudan iliskisi yok.

## 13. i18n
- Hata mesajlari ve format ciktilari **Ingilizce** — CLI/MCP output icin uygun.
- formatDetectedProviders() — "Providers:", "not configured" gibi hardcoded EN string'ler. Dashboard'a gitmiyorsa sorun degil.

## 14. Dokumantasyon Tutarliligi
- JSDoc ↔ gercek davranis: ✅ Uyumlu
- DECKENT.md'de "3 providers (Claude, Codex, Gemini)" → ✅ Dogru
- IDENTITY.md "Providers: Claude, Codex, Gemini" → ✅ Dogru
- detectAvailableProviders() her zaman 3 provider doner — tutarli

## 15. Performance
- `spawnSync` x3 — `detectAvailableProviders()` 3 CLI call yapar. Her biri 5s timeout. Sequential calisir. Bootstrap'ta bir kez cagrilir — kabul edilebilir.
- `bootstrapProviders()` — async adapter factory + health check. Hot path degil (bir kez cagrilir).
- Sync I/O: spawnSync (3x) — P3, sadece startup'ta.

## 16. Oneriler
1. **P2 — ADR-008 core→orchestra import**: `Connector` import'u core/'dan orchestra/'ya bagimlilik yaratiyor. Connector ya core/'a tasinmali ya da bootstrapProviders disi bir orkestrasyon katmaninda yapilmali.
2. **P3 — Object.create type assertion**: Satir 552 — `Object.create(adapter, ...) as ProviderAdapter` — fragile pattern. Wrapper class veya spread ile daha type-safe hale getirilebilir.
3. **P3 — Windows branch test**: `shell: isWindows` dalinin unit test'i yok.
4. **P3 — Bare catch logging**: Satir 238, 556, 604 — `debugLog` ile loglanmali.
5. **P3 — ProviderWorkerInfo dead code**: Kullanim dogrulanmali.

## Verdict: ANALYZED
