# Sprint 185 — src/core/ Konsolide Audit Raporu (Task 185-001)

## Meta

| Alan | Değer |
|------|-------|
| Tarih | 2026-05-21 |
| Sprint | 185 |
| Task | 185-001 |
| Worker Agent | doc-writer |
| Kapsam | `src/core/*.ts` (90 dosya, 25.868 LoC) |
| Output | `docs/audits/dynamic-split/core-audit.md` (tek konsolide rapor) |
| Method | Header + export overview + LoC + cross-reference |

## Genel İstatistikler

| Metrik | Değer |
|--------|-------|
| Toplam dosya | 90 |
| Toplam LoC | 25.868 |
| Ortalama LoC/dosya | ~288 |
| En büyük dosya | `config.ts` (1.703 LoC) |
| En küçük dosya | `config-validator.ts` (6 LoC, re-export only) |
| > 500 LoC dosya sayısı | 13 |
| < 50 LoC dosya sayısı | 6 |
| Type-only modüller | 11 (`*-types.ts`) |
| Re-export barrel modüller | 3 (`types.ts`, `index.ts`, `config-validator.ts`) |

## ADR Compliance Genel Notları

Aşağıdaki ADR'ler `src/core/` genelinde uygulanır; ihlal yoksa dosya başına ayrıca belirtilmez:

- **ADR-001 TypeScript + ESM:** Tüm dosyalar `.ts` uzantılı, `export` ESM syntax — ✅ uyumlu.
- **ADR-002 Node16 Module Resolution:** Tüm relative import'larda `.js` suffix gözlenir — ✅ uyumlu.
- **ADR-008 Brain Merkezi Import (`core/` → `orchestra/` yasak):** `src/core/` hiçbir modül `orchestra/`, `monitor/`, `agents/`'tan import yapmaz — ✅ uyumlu. (`provider.ts`, `session-interface.ts` ilgili lifecycle modüllerine yalnızca *interface* seviyesinde bağlanır.)
- **ADR-010 Tek Runtime Dependency:** `commander.js` ana runtime dep. `src/core/`'de ek runtime dep'ler: `better-sqlite3` (memory-store), `zod` (config.ts), `@noble/ed25519` + `@noble/hashes` (signature.ts) — bunlar `package.json` yer alıyor; doc'ta açıkça referans verilmiş.
- **ADR-037 Brain-Auditor-Worker Authority Matrix:** `core/` yetki tablosu içindeki taraflardan biri değil — `core/` saf domain/primitive kütüphane. Authority enforcement *lint* (`src/orchestra/authority-enforcer.ts`) tarafından *core/ → orchestra/* yönünde uygulanır. `core/` modülleri kendi başlarına role-aware değildir.

Genel **uyarı:** ADR-005 (Synchronous I/O) **deprecated** statüsünde; `src/core/` dosyalarının büyük çoğunluğu hâlâ `readFileSync`/`writeFileSync` kullanıyor. ADR-005 deprecation'ı resmi sync→async migration spec'i ile gelmediği için bu sapma proje genelinde kabul edilmiş bir uyumsuzluktur (single-threaded CLI use-case'i nedeniyle pragmatic). Sprint 187+ için potansiyel temizlik adayıdır.

---

## Dosya Audit Detayları

> Her dosya için 9 section: (1) Inventory (2) Bağlam (3) Debt Risk (4) Dead Code (5) Documentation Gaps (6) ADR Compliance (7) Refactor Recommendations (8) Sprint 187 Follow-up (9) Summary.

---

## activation-engine.ts

### 1. Inventory
- **LoC:** 320
- **Exports:** `evaluateActivation`, `evaluateRuleViaSecondary`, `evaluateRule`, `evaluateExclusion`, `migrateV1AgentToActivation`, `migrateV1SkillToActivation`, `getDynamicExclusions`
- **Dependencies:** `routing-types.js`, `skill-types.js`, `condition-evaluator.js`

### 2. Bağlam
Routing v2 Layer 2: TaskDNA üzerinde structured activation rule değerlendirmesi. `routeTaskV2` tarafından çağrılır, agent ve skill seçim mantığının çekirdeği.

### 3. Debt Risk
Düşük-Orta. Migration helpers (V1→V2) Sprint 067 sonrası kullanım azalmış olabilir; gerçek `manifestVersion: 1` kalan kayıt sayısı `agent-pool` / `skill-pool` runtime'da nadir.

### 4. Dead Code
- `evaluateRuleViaSecondary` (line 66) yalnızca dahili olarak çağrılıyorsa kapsam: export gereksiz olabilir.
- V1 migration fonksiyonları: deckent-dev dışında V1 kalan kullanıcı sayısı bilinmiyor (telemetri yok).

### 5. Documentation Gaps
JSDoc `evaluateActivation`'da var ama `getDynamicExclusions`, `migrateV1*` için yok. Aktivasyon score weighting algoritması inline yorumlarla anlatılmış, ama central `docs/architecture/routing-engine.md` ile cross-link yok.

### 6. ADR Compliance
ADR-028 (V1→V2 routing migration) — ✅. ADR-041 (Agent taxonomy) ile uyumlu (intent-based selection).

### 7. Refactor Recommendations
- V1 migration helper'larını ayrı `manifest-migration-v1.ts` dosyasına taşı (manifest-migrator.ts ile birleştir).
- `getDynamicExclusions` placeholder mı, gerçek implementasyon mu netleştir.

### 8. Sprint 187 Follow-up
- V1 manifest gerçek kullanıcı sayımı (telemetry hook).
- `evaluateRuleViaSecondary` çağrı sayımı → kaldırılıp inline edilebilir mi?

### 9. Summary
Routing v2 çekirdek bileşeni; tasarım iyi, V1 migration kodu uzun vadede tasfiye adayı.

---

## active-workers.ts

### 1. Inventory
- **LoC:** 90
- **Exports:** `markPending`, `markActive`, `clearPending`, `_clearAllPending`, `_getPendingSpawns`, `getActiveWorkerIds`
- **Dependencies:** `node:fs`, `node:path`

### 2. Bağlam
Sprint 170 P0-5 race-window protection. Worker spawn → `.hb` yazma arasındaki ~3s gap'te sibling kill'in stale prompt dosyalarını silmesini engellemek için pending Set tutar.

### 3. Debt Risk
Düşük. Module-level state (`_pendingSpawns` Set) test izolasyonu için `_clearAllPending` underscore-prefixed test-only API ile çözülmüş — clean.

### 4. Dead Code
`_getPendingSpawns` yalnızca test'lerde kullanılıyor olmalı; production'da çağrı yoksa underscore-prefixed olarak doğru işaretlenmiş.

### 5. Documentation Gaps
Module-level header yorumu var ve race-window kontekstini açıklıyor. `markPending` lifecycle (kim çağırır, ne zaman temizler) yorum dışında dokümante değil.

### 6. ADR Compliance
ADR-044 (Sprint State Observability) ile dolaylı uyumlu — pending state observable değil (TODO: event stream emit?).

### 7. Refactor Recommendations
- Module-level mutable state → `class ActiveWorkerTracker` (test izolasyonunu daha temiz hale getirir).
- TASKS_DIR sabit constant'tan değil `constants.ts:TASKS_DIR`'dan al.

### 8. Sprint 187 Follow-up
- Pending spawn timeout (ne kadar süre sonra otomatik temizlenir)?
- Crash recovery: process restart sonrası pending Set boşalır — bu doğru davranış mı?

### 9. Summary
Küçük, odaklı race-window guard. Sprint 170 lesson learned'in clean implementasyonu.

---

## adr-file-sync.ts

### 1. Inventory
- **LoC:** 244
- **Exports:** `ParsedAdr`, `AdrSyncResult`, `parseAdrFile`, `adrToEntryInput`, `syncAdrFilesToDb`
- **Dependencies:** `node:fs`, `node:path`, `memory-store`, `memory-types`

### 2. Bağlam
MADR v3 ADR markdown dosyalarını parse edip `memory.db`'ye upsert eder. `identity-generator.ts` postFinalizeHook ve `memory rebuild` komutu bunu kullanır.

### 3. Debt Risk
Orta. MADR v3 format değişirse parser fragile — schema validation regex tabanlı, brittle. ADR sayısı artarken parse hataları sessiz geçebilir.

### 4. Dead Code
Görünmüyor; her exported fonksiyon clear caller'a sahip.

### 5. Documentation Gaps
Header'da format örnekleri iyi anlatılmış. Parse hata politikası (skip vs. throw) belirsiz.

### 6. ADR Compliance
ADR-036 (ADR Governance) — ✅ bu modül governance'in kendisini implement eder.
ADR-046 (Brain Self-Update) — ✅ bi-directional FS↔DB sync.

### 7. Refactor Recommendations
- Regex-based parsing → markdown AST parser (örn. remark) ile değiştir — daha güvenilir.
- `parseAdrFile` return type `ParsedAdr | null` yerine `Result<ParsedAdr, ParseError>` pattern'i.

### 8. Sprint 187 Follow-up
- MADR v3 → v4 schema değişikliği için migration path.
- Parse error telemetri (auditor alert?).

### 9. Summary
Governance backbone'unun parse layer'ı; brittle regex riski mevcut ama MVP yeterli.

---

## adr-seed.ts

### 1. Inventory
- **LoC:** 469
- **Exports:** `ADR_SEED_DATA` (array), `createIdentitySeed`
- **Dependencies:** `memory-types`

### 2. Bağlam
`deckent init` sırasında Memory V2 DB'ye preload edilecek ADR'lerin hard-coded array'i. Sprint 143 arşivinden çekilmiş özetler.

### 3. Debt Risk
Yüksek. Hard-coded ADR data — gerçek `.brain/memory.db` ile drift riski. `adr-file-sync.ts` ile çakışma potansiyeli (FS-based vs. seeded).

### 4. Dead Code
`ADR_SEED_DATA` muhtemelen yalnızca `init` flow'unda kullanılıyor; varsa post-init upgrade path'inde yer almıyor.

### 5. Documentation Gaps
Why-this-exists yorumu var (Sprint 143 arşiv). Ama seed-vs-fs-sync hangisinin authoritative olduğu net değil.

### 6. ADR Compliance
ADR-036 (ADR Governance) — kısmi uyum; seed data'nın update lifecycle'ı tanımlı değil.

### 7. Refactor Recommendations
- Seed data'yı `.deckent/seed-data/adrs.json` external file'a çıkar; runtime'da load et.
- Yeni ADR eklendiğinde seed güncelleme otomasyon scripti.
- `adr-file-sync` ile birleştirme stratejisi netleştir.

### 8. Sprint 187 Follow-up
- Seed → FS sync drift detection.
- `createIdentitySeed` neden burada (adr-seed.ts), `identity-generator.ts`'de değil?

### 9. Summary
Bootstrap data; drift riski en büyük debt source. Refactor adayı.

---

## agent-cache.ts

### 1. Inventory
- **LoC:** 171
- **Exports:** `TaskSignatureInput`, `CachedResult`, `AgentSelectionCache`
- **Dependencies:** (saf TS — no fs)

### 2. Bağlam
Agent selection LRU cache. `agent-selector.ts` ve `routing-engine.ts` tarafından kullanılır. Aynı task signature için ardışık çağrılarda hesaplama tekrarını önler.

### 3. Debt Risk
Düşük. Pure logic, no fs, no async — test edilebilirliği yüksek.

### 4. Dead Code
Görünmüyor.

### 5. Documentation Gaps
LRU eviction policy (max size, TTL) açıkça dokümante değil — class implementation incelenmeli.

### 6. ADR Compliance
ADR-028 (V2 routing) ile uyumlu.

### 7. Refactor Recommendations
- Cache statistics export et (hit rate observability).
- Cache key normalization stratejisi (scope path ordering vs.) açıkça spec edilmeli.

### 8. Sprint 187 Follow-up
- Cache hit rate telemetri.
- Cross-sprint cache invalidation policy.

### 9. Summary
Performans optimizasyonu; iyi tasarlanmış pure module.

---

## agent-pool.ts

### 1. Inventory
- **LoC:** 588
- **Exports:** `DEFAULT_MAX_TEMP_AGENTS`, `DEFAULT_MAX_AGENT_AGE`, `isTempAgentStale`, `AgentPoolManager` class, `AgentPromptSource` type, `AgentPromptResolution` interface, `getAgentPrompt`
- **Dependencies:** `node:fs`, `node:path`, `agent-types`, `utils`

### 2. Bağlam
15 built-in + custom agent'ların pool yönetimi. LRU eviction (max 50 temp, 5 sprint age). `.deckent/agents/*/agent.json` ve `.tasks/agents/*`.

### 3. Debt Risk
Orta-Yüksek. 588 LoC tek class — god-object yaklaşıyor. Built-in agent listesi hard-coded muhtemelen — yeni agent ekleme manifest+kod değişikliği gerektiriyor.

### 4. Dead Code
`AgentPromptSource` type 3 değerli ama gerçek runtime'da hangileri kullanılıyor doğrulanmalı.

### 5. Documentation Gaps
LRU eviction algoritması inline yorumlarla anlatılmış. `getAgentPrompt` resolution priority (prompt-md > system-prompt > none) ADR-048 ile cross-link gerekli.

### 6. ADR Compliance
ADR-041 (Agent Taxonomy) — ✅ horizontal skills vs vertical agents.
ADR-048 (Prompt Lifecycle Contract) — ✅ prompt resolution order tanımlı.

### 7. Refactor Recommendations
- `AgentPoolManager`'ı 3 sınıfa böl: `AgentLoader`, `AgentEvictor`, `AgentPromptResolver`.
- Built-in agent'ları external JSON manifest'e (ör. `assets/builtin-agents.json`) çıkar.

### 8. Sprint 187 Follow-up
- Agent pool size limit observability (LRU eviction event stream emit).
- Custom agent vs. built-in promotion pipeline (Sprint 138 promotion-pipeline ile entegrasyon).

### 9. Summary
Pool yönetiminin kalbi; refactor adayı (god-object).

---

## agent-selector.ts

### 1. Inventory
- **LoC:** 197
- **Exports:** `extractKeywords`, `selectAgent`, `suggestNewAgent`
- **Dependencies:** `agent-types`, `types`

### 2. Bağlam
V1 agent selection (keyword-based scoring). V2'de `routing-engine.routeTaskV2` tarafından replace edilmiş. ADR-028 V1→V2 migration.

### 3. Debt Risk
**Yüksek.** V2 default olduktan sonra (Sprint 067), bu modül legacy. `selectAgent` ve `extractKeywords` v2'de kullanılıyor mu? Brain `selectAgent()`'ı her task için çağırmaya devam ediyor mu (CLAUDE.md "Agent & Skill Selection" kuralı) yoksa `routeTaskV2`'ye delegate mi ediliyor?

### 4. Dead Code
**Potansiyel dead code.** Kullanım sayımı yapılmalı.

### 5. Documentation Gaps
"Deprecated" işareti yok. V2'ye yönlendirme yok.

### 6. ADR Compliance
ADR-028 — deprecated/legacy olarak markalanmalı.

### 7. Refactor Recommendations
- Kullanıcı sayımı (caller graph) çıkar.
- Kullanılmıyorsa: `@deprecated` JSDoc + Sprint 187'de tasfiye.
- Kullanılıyorsa: V2'ye delegate eden adapter pattern.

### 8. Sprint 187 Follow-up
- Dead code analysis: `git grep "selectAgent\\|extractKeywords"` — yalnızca test/internal mi?

### 9. Summary
V1 legacy modülü; tasfiye veya deprecation adayı.

---

## agent-types.ts

### 1. Inventory
- **LoC:** 96
- **Exports:** `AgentStats`, `AgentDefinition`, `AgentPool`, `AgentSelectionResult`, `MultiAgentPipelineStep`, `createDefaultStats`, `createAgentDefinition`
- **Dependencies:** `types`, `routing-types`

### 2. Bağlam
Agent pool domain types. `agent-pool`, `agent-selector`, `routing-engine` tüketicileri.

### 3. Debt Risk
Düşük. Saf type tanımları + 2 factory helper.

### 4. Dead Code
`MultiAgentPipelineStep` — multi-agent pipeline feature canlı mı? Kullanım incelenmeli.

### 5. Documentation Gaps
JSDoc factory'lerde var. `AgentDefinition` fields (effortMultiplier range 0.1-3.0) inline yorum ile dokümante.

### 6. ADR Compliance
ADR-041 — ✅ vertical agent definition.

### 7. Refactor Recommendations
- `manifestVersion?: 1 | 2` — V1 desteği kalktığında zorunlu V2 yapılabilir.

### 8. Sprint 187 Follow-up
- `MultiAgentPipelineStep` kullanımı doğrula.

### 9. Summary
Stabil type domain; minimal değişiklik.

---

## analyzer.ts

### 1. Inventory
- **LoC:** 344
- **Exports:** `analyzeProject`, `analyzeProjectCached`, `clearAnalyzeCache`
- **Dependencies:** `node:fs`, `node:path`, `node:child_process`, `stack-detector`, `types`

### 2. Bağlam
Project analysis: stack-detector wrapper + CI detection + git stats + LoC counting + size classification + methodology + config suggestions. `deckent_analyze_project` ve `deckent_doctor` MCP tools bunu kullanır.

### 3. Debt Risk
Orta. `spawnSync` ile git ve dış komutlar — exception handling kritik.

### 4. Dead Code
Görünmüyor.

### 5. Documentation Gaps
"Methodology" detection logic (kanban/scrum/agile/waterfall vs.) açıkça dokümante değil.

### 6. ADR Compliance
ADR-006 (spawnSync security pattern) — ✅ spawnSync array-args form kullanılmış olmalı (verify gerekli).

### 7. Refactor Recommendations
- Methodology detection'ı ayrı modüle taşı.
- Cache invalidation policy (sprint sınırı?) netleştir.

### 8. Sprint 187 Follow-up
- `clearAnalyzeCache` ne zaman çağrılıyor? Sprint boundary'de auto-invalidation var mı?

### 9. Summary
Project introspection backbone'u; orta yoğunluklu but stabil modül.

---

## anthropic-http-client.ts

### 1. Inventory
- **LoC:** 336
- **Exports:** `RateLimitState`, `AnthropicMessage`, `CountTokensParams`, `CountTokensResult`, `UsageReportOptions`, `UsageReportBucket`, `UsageReportResponse`, `AnthropicApiError`, `parseRateLimitHeaders`, `countTokens`, `getUsageReport`, `getCostReport`, `computeBackoff`, `timeUntilReset`, `exponentialBackoff`
- **Dependencies:** Node 18+ built-in `fetch` (zero dep)

### 2. Bağlam
Sprint 141 User Safety Shield için Anthropic Native HTTP Client. count_tokens (pre-sprint estimation), usage_report, cost_report, rate limit headers (13 headers).

### 3. Debt Risk
Düşük-Orta. Anthropic API contract değişiklikleri direkt etki — version pinning yok.

### 4. Dead Code
`getUsageReport`/`getCostReport` Admin API only — kullanıcı Team/Enterprise plan değilse fail. Free/Pro kullanıcıda dead code'a yakın (try/catch ile no-op olabilir).

### 5. Documentation Gaps
JSDoc top-level mevcut. Her function için detaylı JSDoc eksik (parametre semantiği).

### 6. ADR Compliance
ADR-010 (Tek Runtime Dependency) — ✅ Node 18+ fetch, zero dep.

### 7. Refactor Recommendations
- Anthropic SDK migration değerlendir (resmi `@anthropic-ai/sdk`) vs. native fetch trade-off.
- Rate limit header parsing test coverage doğrula.

### 8. Sprint 187 Follow-up
- Anthropic API versioning strategy (header `anthropic-version`).
- Cost report kullanım istatistikleri.

### 9. Summary
User Safety Shield infra; zero-dep tasarım clean, API drift riski mevcut.

---

## cascade-detector.ts

### 1. Inventory
- **LoC:** 170
- **Exports:** `CascadeActionType`, `CascadeAction`, `CascadeConfig`, `DEFAULT_CASCADE_CONFIG`, `TaskOutcome`, `CascadeDetector` class
- **Dependencies:** Saf TS

### 2. Bağlam
Sprint 140 $42 disaster prevention. N consecutive NO_GO → PAUSE_SPRINT, RATE_LIMITED → HALT, high NO_GO rate → THROTTLE.

### 3. Debt Risk
Düşük. Pure logic, well-bounded.

### 4. Dead Code
Görünmüyor.

### 5. Documentation Gaps
Sprint 140 incident referansı mükemmel. Threshold tuning history (5 consecutive default — neden 5?) dokümante değil.

### 6. ADR Compliance
ADR-043 (Brain Crash Recovery) ile uyumlu — fail-safe pattern.

### 7. Refactor Recommendations
- Threshold'ları config'e bağla (`.deckent/config.json:cascade_thresholds`).
- Observability emit (auditor pattern entry) ekle.

### 8. Sprint 187 Follow-up
- Threshold tuning retrospective (5 doğru sayı mı?).
- Multiple cascade type composition (NO_GO + RATE_LIMITED birleşik trigger).

### 9. Summary
Critical safety net; clean implementation, threshold tuning iyileştirme alanı.

---

## ci-learning.ts

### 1. Inventory
- **LoC:** 460
- **Exports:** `CiReportData`, `RegressionHotspot`, `FailurePattern`, `CiSuggestion`, `ConfigSuggestion`, `CiLearningResult`, `readCiReports`, `detectFailurePatterns`, `generateSuggestions`, `generateConfigSuggestions`, `buildCiLearningLine`, `buildCiLearningsSection`, `analyzeCiLearnings`, `writeCiLearnings`
- **Dependencies:** `node:fs`, `node:path`, `constants`

### 2. Bağlam
CI report cross-sprint analysis: failure pattern detection, proactive suggestions, config change önerileri. `.brain/ci-report-{sprintId}.json` okur.

### 3. Debt Risk
Orta. Pattern detection algoritması heuristic — drift olabilir.

### 4. Dead Code
Görünmüyor; her exported fonksiyon clear caller'a sahip (sprint-reporter).

### 5. Documentation Gaps
Pattern detection thresholds inline ama config'e bağlanmamış.

### 6. ADR Compliance
ADR-044 (Sprint State Observability) ile uyumlu.

### 7. Refactor Recommendations
- Pattern definitions external JSON (rule-driven detection).
- ML-lite scoring (Bayesian update?) sprint 190+ için.

### 8. Sprint 187 Follow-up
- Pattern detection accuracy retrospective.
- False-positive rate audit.

### 9. Summary
Sprint-to-sprint learning brain'in elleri; clean ama pattern lib refactor adayı.

---

## condition-evaluator.ts

### 1. Inventory
- **LoC:** 160
- **Exports:** `resolvePath`, `evaluateCondition`
- **Dependencies:** Saf TS

### 2. Bağlam
Routing v2 path-based condition engine. `$gt`, `$contains`, `$and`, `$or` operatörleri. ActivationRule içinde nested condition object'leri evaluate eder.

### 3. Debt Risk
Düşük. Pure functions, no side effects.

### 4. Dead Code
Görünmüyor.

### 5. Documentation Gaps
Top-level JSDoc örnekli ve clear. Operator listesi (`$gt`, `$lt`, `$eq`, `$contains`, `$and`, `$or`, ...) tam liste yok.

### 6. ADR Compliance
ADR-028 (V2 routing) — ✅ core building block.

### 7. Refactor Recommendations
- Operator listesi const olarak export et (introspection için).
- Tip güvenliği: `Condition` type union genişlet.

### 8. Sprint 187 Follow-up
- Operator extensibility (plugin-defined operators?).
- Schema validation: invalid condition object compile-time veya runtime hata?

### 9. Summary
Small, pure, well-tested core primitive. Düşük debt.

---

## config-migration.ts

### 1. Inventory
- **LoC:** 636
- **Exports:** `MigrationResult`, `getMissingFields`, `needsMigration`, `hasDuplicateKeys`, `migrateConfig`, `pruneConfigBackups`, `migrateConfigInMemory`, `migrateConfigFull`, `modelToTier`, `ConfigModelStrategy`, `ConfigProviders`, `migrateConfigV1ToV2`, `needsV2Migration`, `removeDuplicateKeys`
- **Dependencies:** `node:fs`

### 2. Bağlam
Old (minimal) → new (full) config.json migration. V1→V2 schema migration. Backup pruning. `config.ts:loadConfig` zincirinde kullanılır.

### 3. Debt Risk
**Yüksek.** 636 LoC migration code — V3 schema gelirse fragile. Birden çok migration path (V0→V1, V1→V2) coexist.

### 4. Dead Code
Eski migration path'leri (V0→V1) tüm kullanıcılar V1+ ise dead code olabilir.

### 5. Documentation Gaps
Migration semver policy net değil. Backup retention (`pruneConfigBackups`) policy hardcoded.

### 6. ADR Compliance
ADR-004 (3-Layer Config Merge) — ✅ migration layer'ı tamamlar.

### 7. Refactor Recommendations
- Migration step'leri ayrı `migrations/v0-to-v1.ts`, `migrations/v1-to-v2.ts` dosyalarına böl.
- Versioned migration registry pattern.
- Test fixture coverage: her version path için snapshot test.

### 8. Sprint 187 Follow-up
- V0 migration support drop edilebilir mi (cutoff Sprint NNN).
- Backup retention CLI flag.

### 9. Summary
Migration spaghetti riski yüksek; refactor priority.

---

## config-types.ts

### 1. Inventory
- **LoC:** 696
- **Exports:** 28 interface/type (TimeoutConfig, TerminalConfig, PlanModeConfig, DeckentConfig, NervousSystemConfig, ResolvedConfig, ...)
- **Dependencies:** `decision-config`, `notifications`, `task-types`, `mode-presets`, `model-equivalence`

### 2. Bağlam
Config domain'ının tüm tip tanımları. 700 satır pure type — Deckent'in en geniş tip surface'i.

### 3. Debt Risk
Orta. Geniş surface — değişiklik impact analysis zor.

### 4. Dead Code
Bazı detected-* type'ları (DetectedFramework union) — yeni framework eklenmesi gerek mi gözden geçirilmeli.

### 5. Documentation Gaps
Çoğu field için inline JSDoc var. Field interaction matrix (örn. `brain_provider` vs. `brain_tier`) eksik.

### 6. ADR Compliance
ADR-004 — ✅ central type definition.

### 7. Refactor Recommendations
- Domain-specific tip dosyalarına böl: `config-timeout-types.ts`, `config-nervous-types.ts`.
- DeckentConfig schema → Zod schema, type inference ile auto-generate.

### 8. Sprint 187 Follow-up
- Schema drift detection (config.ts default values vs. config-types.ts).
- Field deprecation lifecycle.

### 9. Summary
Type backbone; split adayı (god-types-file).

---

## config-validator.ts

### 1. Inventory
- **LoC:** 6
- **Exports:** `validateConfig`, `ConfigValidationError`, `validatePartialConfig`, `DEFAULT_TIMEOUT_CONFIG` (all re-exports from config.ts)
- **Dependencies:** `config.js`

### 2. Bağlam
Backward-compat re-export shim. `config.ts` içindeki validation API'sini ayrı modül olarak external consumer'lara expose eder.

### 3. Debt Risk
Düşük. Trivial re-export.

### 4. Dead Code
Eğer hiçbir external consumer doğrudan `config-validator`'dan import etmiyorsa: dead.

### 5. Documentation Gaps
"Why re-export" yorum mevcut.

### 6. ADR Compliance
Yok.

### 7. Refactor Recommendations
- Caller graph audit. Sıfır external caller → sil.
- Caller varsa → JSDoc `@deprecated use config.ts directly`.

### 8. Sprint 187 Follow-up
- `grep "from.*config-validator"` — kullanım sayımı.

### 9. Summary
Minimal shim; muhtemel dead code, tasfiye adayı.

---

## config.ts

### 1. Inventory
- **LoC:** 1.703 (**en büyük dosya**)
- **Exports:** `DEFAULT_TIMEOUT_CONFIG`, `DEFAULT_AUTO_DOCS`, `DEFAULT_TERMINAL_CONFIG`, `DEFAULT_PROMPT_CONFIG`, `NERVOUS_DETECTOR_SCHEMA`, `NERVOUS_SYSTEM_SCHEMA`, `MODE_ALIASES`, `resolveMode`, `VALID_PROVIDERS`, `DEFAULT_MODES`, `ConfigValidationError`, `deepMerge`, `validateConfig`, `resolveEffectiveWorkers`, `resolveCoverageGates`, `clearConfigCache`, `createDefaultConfig`, `getDefaultConfig`, `getDefaultModes`, `loadConfig`, `readAuthMode`, `validatePartialConfig`, `loadGlobalConfig`, `saveGlobalConfig`, `REGEN_TEMPLATE_DEFAULTS`, `regenerateConfigSafe`, `CONFIG_METADATA`
- **Dependencies:** `node:fs`, `node:fs/promises`, `node:path`, `zod`, `constants`, `utils`, `config-migration`, `config-types`, `decision-config`, `mode-presets`

### 2. Bağlam
**Tüm konfig'in source of truth.** Default config, 3-layer merge (defaults → global → project), Zod schema validation, mode presets, deepMerge utility, regenerate-safe.

### 3. Debt Risk
**Çok Yüksek.** 1703 LoC tek dosya — god module. Tüm config sürecinde değişiklik aynı dosyayı etkiler. Hata izolasyonu zor.

### 4. Dead Code
`NERVOUS_SYSTEM_SCHEMA` — Nervous System runtime'a wire edildi mi (ADR-040 accepted) doğrula. `REGEN_TEMPLATE_DEFAULTS` — `regenerateConfigSafe` dışında caller yok.

### 5. Documentation Gaps
JSDoc top-level çoğunlukla mevcut. 1700 satır içinde navigasyon zor — section delimiter'lar (`// ─── ...`) yardımcı ama TOC yok.

### 6. ADR Compliance
ADR-004 — ✅ kanonik 3-layer merge implementasyonu.
ADR-010 — `zod` runtime dep (kayıtlı).

### 7. Refactor Recommendations
- Faz 1: `loadConfig`/`saveGlobalConfig` → `config-io.ts`.
- Faz 2: `validateConfig`/Zod schemas → `config-schema.ts`.
- Faz 3: `createDefaultConfig`/`DEFAULT_MODES` → `config-defaults.ts`.
- Faz 4: `regenerateConfigSafe`/`REGEN_TEMPLATE_DEFAULTS` → `config-regen.ts`.
- Hedef: 1703 → ~400 LoC orkestratör.

### 8. Sprint 187 Follow-up
- God-module split planlama (ADR-026 god object split stratejisini config'e uygula).
- Schema-as-code (Zod) → schema-as-data (JSON Schema export) migration?

### 9. Summary
**En kritik refactor adayı.** ADR-024 god object split pattern'ı config.ts'ye uygulanmalı.

---

## constants.ts

### 1. Inventory
- **LoC:** 129
- **Exports:** ~40 const (DECKENT_DIR, PROJECT_CONFIG_PATH, BRAIN_DIR, TASKS_DIR, LOCKS_DIR, DECKENT_FILE, DASHBOARD_FILE, ERRORS_FILE, MEMORY_FILE, DECISIONS_FILE, DEBT_FILE, PATTERNS_FILE, RETRO_FILE, ...)
- **Dependencies:** `node:fs`, `node:os`, `node:path`, `node:url`

### 2. Bağlam
Tüm path/file constant'lar tek source. `as const` ile literal type narrowing.

### 3. Debt Risk
Düşük. Stabil.

### 4. Dead Code
`PROJECT_IDENTITY_FILE` — ADR-046 sonrası `PROJECT-IDENTITY.md` removed (BOOT.md ve managed-docs ile değiştirildi). Hâlâ const olarak duruyor — backward-compat veya dead.

### 5. Documentation Gaps
Bazı limit'ler (`ERRORS_MAX_LINES: 600`) inline yorum ile dokümante. Diğerlerinin "why this number" eksik.

### 6. ADR Compliance
Yok özel.

### 7. Refactor Recommendations
- `PROJECT_IDENTITY_FILE` — kullanım yoksa kaldır (`identity-generator.ts` hâlâ kullanıyor olabilir).
- Path constant'larını category'lere ayır (root, brain, deckent, etc.).

### 8. Sprint 187 Follow-up
- Dead const audit (`PROJECT_IDENTITY_FILE`).
- Magic number'ları config'e bağla (`ERRORS_MAX_LINES`, `DECISIONS_MAX_LINES`).

### 9. Summary
Düşük debt; küçük dead code adayı (`PROJECT_IDENTITY_FILE`).

---

## cost-calculator.ts

### 1. Inventory
- **LoC:** 476
- **Exports:** `TaskCostInput`, `PerProviderBreakdown`, `SprintCostEstimate`, `EstimateOptions`, `estimateSprintCost`, `formatEstimate`
- **Dependencies:** `cost-config-loader`

### 2. Bağlam
Sprint 141 User Safety Shield — multi-provider cost estimation. Naive/realistic/worst case 3 CI'lerle. Subscription + API + free tier mixed billing.

### 3. Debt Risk
Orta. Pricing accuracy → user trust impact.

### 4. Dead Code
Görünmüyor.

### 5. Documentation Gaps
Top-level JSDoc clear. Algoritma (naive vs. realistic ne kadar farklı) ayrı `docs/architecture/cost-model.md`'ye değer.

### 6. ADR Compliance
ADR-033 (Product Vision) — ✅ cost transparency.

### 7. Refactor Recommendations
- Cost model document ayrı.
- Per-provider strategy plug-in pattern (yeni provider → cost adapter).

### 8. Sprint 187 Follow-up
- Subscription cost accuracy (Max Plan vs. Pro).
- Free tier rate limit cost modeling.

### 9. Summary
User Safety Shield critical path; clean ama doc gap mevcut.

---

## cost-config-loader.ts

### 1. Inventory
- **LoC:** 372
- **Exports:** `BillingMode`, `SubscriptionMethod`, `DeckentTier`, `ModelPricing`, `RateLimitTier`, `SubscriptionTracking`, `ProviderConfig`, `CostLimits`, `UpdateConfig`, `CostConfig`, `validateCostUnit`, `CostConfigError`, `validateCostConfig`, `loadCostConfig`, `initCostConfig`, `findModel`, `listEnabledModels`, `formatCostPerMTok`
- **Dependencies:** `node:fs`

### 2. Bağlam
`.deckent/cost-config.json` user-editable parametric cost management. Unit safety pin (costPerToken > 0.01 throws — per-MTok vs per-token confusion guard).

### 3. Debt Risk
Düşük-Orta. Safety pin clever ama hard-coded threshold (0.01).

### 4. Dead Code
`SubscriptionMethod` enum 3 değer — hangileri canlı kullanımda?

### 5. Documentation Gaps
Top-level JSDoc + memory reference. Zero hard-code philosophy iyi vurgulanmış.

### 6. ADR Compliance
ADR-033 (Product Vision) — ✅ user-editable.

### 7. Refactor Recommendations
- Validation schema → Zod (config.ts pattern'ı ile align).

### 8. Sprint 187 Follow-up
- Cost config drift detection (bundled baseline vs. user override).

### 9. Summary
Safety-conscious config loader; iyi tasarlanmış.

---

## credential-encryption.ts

### 1. Inventory
- **LoC:** 139
- **Exports:** `EncryptedPayload`, `CredentialEncryptionError`, `getMasterKey`, `encrypt`, `decrypt`, `isEncryptedEntry`
- **Dependencies:** `node:crypto`, `node:fs`, `node:path`, `node:os`

### 2. Bağlam
AES-256-GCM encrypt/decrypt for credentials. Master key from keyring file or env.

### 3. Debt Risk
Düşük-Orta. Crypto code — bug riski yüksek but pattern standart.

### 4. Dead Code
Görünmüyor.

### 5. Documentation Gaps
Algorithm seçimi (AES-256-GCM) açıkça belirtilmeli. IV size, key derivation strategy dokümante eksik.

### 6. ADR Compliance
ADR-034 (Multi-Project Isolation) — ✅ per-project credential.

### 7. Refactor Recommendations
- Algorithm choice header JSDoc'a ekle.
- Master key rotation procedure dokümante.

### 8. Sprint 187 Follow-up
- Master key rotation CLI command.
- Per-credential salt (currently shared key).

### 9. Summary
Stabil crypto primitive; dokümantasyon iyileştirme alanı.

---

## credentials.ts

### 1. Inventory
- **LoC:** 265
- **Exports:** `CredentialEntry`, `EncryptedCredentialEntry`, `CredentialNotFoundError`, `CredentialStorageError`, `CredentialManager` class, `storeCredential`, `getCredential`, `listCredentials`
- **Dependencies:** `node:fs`, `node:path`, `constants`, `utils`, `credential-encryption`

### 2. Bağlam
Per-provider credential management. `~/.deckent/credentials/{provider}.json` encrypt/decrypt.

### 3. Debt Risk
Düşük. Clear separation: encryption (`credential-encryption.ts`) vs. storage (`credentials.ts`).

### 4. Dead Code
Görünmüyor.

### 5. Documentation Gaps
Module-level header eksik. CredentialManager class JSDoc eksik.

### 6. ADR Compliance
ADR-034 — ✅.

### 7. Refactor Recommendations
- Module-level JSDoc ekle.
- Credential rotation policy doküman.

### 8. Sprint 187 Follow-up
- Credential audit log (kim ne zaman erişti).

### 9. Summary
Solid wrapper; minimal değişiklik.

---

## debug-log.ts

### 1. Inventory
- **LoC:** 66
- **Exports:** `LogLevel`, `DebugLogger`, `createDebugLog`
- **Dependencies:** Yok (process.stderr)

### 2. Bağlam
DECKENT_DEBUG env-controlled structured stderr logger. MCP stdio uyumlu (stderr never breaks stdout).

### 3. Debt Risk
Düşük.

### 4. Dead Code
Görünmüyor.

### 5. Documentation Gaps
İyi (top-level JSDoc, level semantics).

### 6. ADR Compliance
Yok özel.

### 7. Refactor Recommendations
- `LogLevel` numeric mapping (LEVEL_ORDER) export et (introspection için).

### 8. Sprint 187 Follow-up
- Structured log JSON output mode (production).

### 9. Summary
Minimal, doğru. Düşük debt.

---

## decision-config.ts

### 1. Inventory
- **LoC:** 194
- **Exports:** `DecisionEngineConfig`, `LearningConfig`, `CollaborationConfig`, `createDefaultDecisionConfig`, `createDefaultLearningConfig`, `createDefaultCollaborationConfig`, `validateDecisionConfig`, `validateLearningConfig`, `validateCollaborationConfig`
- **Dependencies:** Saf TS

### 2. Bağlam
Decision Engine V2 config interface'leri + defaults + validators.

### 3. Debt Risk
Düşük.

### 4. Dead Code
`CollaborationConfig` — collaboration feature live mı (multi-agent pipeline) doğrula.

### 5. Documentation Gaps
Field semantics inline (default değerlerle). "Why this default" eksik.

### 6. ADR Compliance
ADR-028 — ✅.

### 7. Refactor Recommendations
- Validation → Zod schema (config.ts pattern'ı).

### 8. Sprint 187 Follow-up
- `CollaborationConfig` runtime kullanımı.

### 9. Summary
Stabil config domain. Düşük debt.

---

## decision-types.ts

### 1. Inventory
- **LoC:** 94
- **Exports:** `TaskType`, `TaskAnalysis`, `DecisionLogEntry`, `DecisionResult`, `DecisionContext`, `createDefaultAnalysis`, `isValidTaskType`, `createDecisionLogEntry`
- **Dependencies:** `types`, `agent-types`, `skill-types`

### 2. Bağlam
Decision Engine V1 types. `TaskType` = 'code' | 'test' | 'doc' | 'security' | 'refactor' | 'devops' | 'config'.

### 3. Debt Risk
Orta. V2 (routing-types `IntentType`) ile çakışma — `TaskType` vs. `IntentType` her ikisi de canlı mı? Drift riski.

### 4. Dead Code
**Potansiyel.** V1 → V2 migration sonrası `TaskType` legacy olabilir.

### 5. Documentation Gaps
"V1 vs. V2" relationship açıkça yazılmamış.

### 6. ADR Compliance
ADR-028 — `TaskType` legacy, `IntentType` V2.
ADR-053 (TaskType Taxonomy — Audit/Document-Write/Code-Development) — **uyumsuzluk**: ADR-053 taxonomy ile `TaskType` enum değerleri uyumsuz görünüyor (audit, document-write, code-development eksik).

### 7. Refactor Recommendations
- ADR-053 taxonomy ile align et.
- V1 `TaskType` → `@deprecated`, migration path tanımla.

### 8. Sprint 187 Follow-up
- **ADR-053 vs. decision-types `TaskType` reconciliation — kritik debt.**

### 9. Summary
**ADR-053 ile uyumsuzluk riski yüksek; Sprint 187 reconciliation gerekli.**

---

## deck-file.ts

### 1. Inventory
- **LoC:** 198
- **Exports:** `DECK_FILE_NAME`, `KNOWN_DECK_KEYS`, `KnownDeckKey`, `DeckFileValidation`, `parseDeckFile`, `loadDeckSecrets`, `validateDeckFile`, `createDeckTemplate`, `ensureDeckGitignore`, `isDeckFileCommitted`
- **Dependencies:** `node:fs`, `node:child_process`, `node:path`

### 2. Bağlam
ADR-014 .deck secret file system. KEY=value flat file, DECKENT_* prefix only.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Görünmüyor.

### 5. Documentation Gaps
ADR-014 referansı yorum içinde belirtilmiş.

### 6. ADR Compliance
ADR-014 — ✅ kanonik impl.

### 7. Refactor Recommendations
- `KNOWN_DECK_KEYS` extensibility (plugin'ler ekleyebilir mi?).

### 8. Sprint 187 Follow-up
- Plugin-defined secret keys.

### 9. Summary
ADR-014'ün clean implementasyonu.

---

## deck-interpolation.ts

### 1. Inventory
- **LoC:** 38
- **Exports:** `interpolateConfig`
- **Dependencies:** `deck-file`

### 2. Bağlam
`$DECK:KEY` syntax config field'larında secrets ile değiştirir. Full-string exact match only.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Görünmüyor.

### 5. Documentation Gaps
İyi JSDoc, semantics clear.

### 6. ADR Compliance
ADR-014 — ✅.

### 7. Refactor Recommendations
- Partial interpolation (`$DECK:KEY/path` patterns) — şu an YASAK, gelecek için extensibility değerlendir.

### 8. Sprint 187 Follow-up
Yok.

### 9. Summary
Küçük, doğru helper.

---

## environment.ts

### 1. Inventory
- **LoC:** 52
- **Exports:** `DetectedEnv`, `detectEnvironment`
- **Dependencies:** Yok (process.env)

### 2. Bağlam
IDE/terminal detection: vscode, cursor, codex, gemini, tmux, shell.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Görünmüyor.

### 5. Documentation Gaps
İyi JSDoc, detection order belirtilmiş.

### 6. ADR Compliance
Yok özel.

### 7. Refactor Recommendations
- Yeni IDE/runtime (örn. Zed, Helix) eklenmesi için extensibility.

### 8. Sprint 187 Follow-up
- New IDE support backlog.

### 9. Summary
Küçük, doğru detector.

---

## errors.ts

### 1. Inventory
- **LoC:** 623
- **Exports:** `DeckentError` class, `ErrorEntry`, `ErrorRegistry` const (50+ error codes), `formatHumanError`
- **Dependencies:** Yok

### 2. Bağlam
Central error registry: code, message, suggestion, docLink, whatHappened, why, howToFix. User-facing error formatting.

### 3. Debt Risk
Orta. 623 LoC tek dosya — error code'lar arttıkça yönetilemez hale gelebilir.

### 4. Dead Code
Tüm error code'ların runtime'da en az 1 throw site'i var mı? Audit gerekli.

### 5. Documentation Gaps
Her error code için inline obj — pattern clear. Cross-link `docs/troubleshooting.md` ile zayıf.

### 6. ADR Compliance
Yok özel.

### 7. Refactor Recommendations
- ErrorRegistry'yi category'lere ayır (config-errors, sprint-errors, provider-errors).
- Error code naming convention netleştir (CFG_*, SPRINT_*, PROV_*).

### 8. Sprint 187 Follow-up
- Error code coverage audit (unused codes).
- DocLink validation (404 ölü linkler).

### 9. Summary
Kullanıcı UX backbone'u; refactor adayı (split-by-category).

---

## file-lock.ts

### 1. Inventory
- **LoC:** 632
- **Exports:** `LockError`, `acquireLock`, `releaseLock`, `checkLock`, `checkLocks`, `releaseAllLocks`, `clearStaleLocks`, `clearOrphanLocks`, `claimTaskLock`, `SpawnLockInfo`, `SpawnLockError`, `acquireSpawnLock`, `releaseSpawnLock`, `acquireSpawnLocks`, `releaseSpawnLocks`, `releaseAllSpawnLocks`, `checkSpawnLock`, `checkSpawnLocks`, `clearStaleSpawnLocks`, `clearOrphanSpawnLocks`, `releaseStaleSpawnLocksForTask`
- **Dependencies:** `node:fs`

### 2. Bağlam
Sprint 138 Task 004 — agents/worker.ts'tan core'a taşındı. Atomic lock (O_EXCL), idempotent re-lock, stale detection, TTL-based expiry, spawn locks (yeni katman).

### 3. Debt Risk
Orta. İki lock domain (file lock + spawn lock) tek dosyada — karışıklık riski.

### 4. Dead Code
Görünmüyor; SpawnLock features Sprint 138+ canlı.

### 5. Documentation Gaps
Header iyi. Spawn lock vs. file lock semantic farkı (ne zaman hangisi) çok açık değil.

### 6. ADR Compliance
ADR-008 — ✅ core'da, orchestra import etmez.

### 7. Refactor Recommendations
- `file-lock.ts` + `spawn-lock.ts` ikiye böl (concern separation).
- Lock observability event stream emit (`AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED`).

### 8. Sprint 187 Follow-up
- Spawn lock vs. file lock interaction doc.
- Cross-platform lock semantics (Windows farklılıkları).

### 9. Summary
Critical concurrency primitive; iyi test edilmiş ama split adayı.

---

## global-config.ts

### 1. Inventory
- **LoC:** 73
- **Exports:** `ensureGlobalDir`, `readGlobalConfig`, `writeGlobalConfig`, `mergeWithProjectConfig`, `getGlobalConfigPath`, `isGlobalConfigPresent`
- **Dependencies:** `node:fs`, `constants`, `types`, `config`, `utils`

### 2. Bağlam
~/.deckent/config.json (global) okuma/yazma + project ile merge.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Görünmüyor.

### 5. Documentation Gaps
Header yok; her function JSDoc'lu (kısmi).

### 6. ADR Compliance
ADR-004 — ✅ 3-layer merge'in global katmanı.

### 7. Refactor Recommendations
- Module-level header ekle.

### 8. Sprint 187 Follow-up
- Global vs. project config conflict detection observability.

### 9. Summary
Stabil. Düşük debt.

---

## heartbeat-types.ts

### 1. Inventory
- **LoC:** 38
- **Exports:** `ACTIVE_EXECUTION_STATUSES`, `COMPLETED_STATUSES`, `PRE_EXECUTION_STATUSES`
- **Dependencies:** `task-types`

### 2. Bağlam
Sprint 149 task-status-aware stale alert suppression. `Heartbeat` interface kendisi `monitoring-types.ts`'de.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Görünmüyor.

### 5. Documentation Gaps
İyi JSDoc.

### 6. ADR Compliance
Yok özel.

### 7. Refactor Recommendations
- `monitoring-types.ts` ile birleştirme (concern overlap?).

### 8. Sprint 187 Follow-up
Yok.

### 9. Summary
Minimal helper. Düşük debt.

---

## identity-generator.ts

### 1. Inventory
- **LoC:** 446
- **Exports:** `IdentityMetrics`, `IdentityContext`, `IdentityRegenResult`, `regenerateProjectIdentity`, `MemoryExportResult`, `runMemoryExport`, `PostFinalizeHookOptions`, `AdrInsertResult`, `PostFinalizeHookResult`, `runPostFinalizeHooks`
- **Dependencies:** `node:fs`, `node:path`, `constants`, `utils`

### 2. Bağlam
PROJECT-IDENTITY.md regen (Sprint 166 ADR-046 ile `.deckent/workspace/IDENTITY.md` managed-docs'a taşındı — bu dosya legacy mi?). PostFinalize hook chain: regen → memory export → ADR insert.

### 3. Debt Risk
**Yüksek.** ADR-046 sonrası `PROJECT-IDENTITY.md` removed; bu modül hâlâ regenerate ediyorsa **dead code/stale logic**.

### 4. Dead Code
**`regenerateProjectIdentity` — ADR-046 sonrası muhtemel dead.** Doğrulama: caller graph + ADR-046 amendment date vs. current.

### 5. Documentation Gaps
Header sprint-finalizer hook chain açıklıyor. ADR-046 reform sonrası state belirsiz.

### 6. ADR Compliance
**ADR-046 ile çatışma riski.** Sprint 166 sonrası `PROJECT-IDENTITY.md` removed denmiş ama bu modül hâlâ generate ediyor.

### 7. Refactor Recommendations
- ADR-046 amendment'ı oku → bu modülün hangi parçası dead/canlı netleştir.
- Dead parçaları sil; canlı parçaları (postFinalizeHooks chain) ayrı modüle taşı.

### 8. Sprint 187 Follow-up
- **Kritik: ADR-046 reconciliation.**

### 9. Summary
**ADR-046 reform sonrası muhtemel dead/stale modül; Sprint 187 priority.**

---

## index.ts

### 1. Inventory
- **LoC:** 36
- **Exports:** Barrel re-exports: types, constants, utils, config, analyzer, system-profile, subscription, routing v2 (TaskDNA, ActivationConfig, ...), intent-classifier, activation-engine, routing-engine, condition-evaluator, manifest-migrator
- **Dependencies:** Tüm core modüller

### 2. Bağlam
Public API barrel. External consumer'lar (orchestra, monitor, agents) buradan import eder.

### 3. Debt Risk
Düşük-Orta. Selective re-export → maintenance overhead.

### 4. Dead Code
Hiçbir external consumer'ın import etmediği export var mı? Audit gerekli.

### 5. Documentation Gaps
"Public vs. private" core API ayrımı yok.

### 6. ADR Compliance
Yok özel.

### 7. Refactor Recommendations
- `export *` vs. named export trade-off netleştir.
- Section divider yorumları ekle (config exports, routing exports, etc.).

### 8. Sprint 187 Follow-up
- Public API contract doküman (`api-surface.md` ile cross-link).

### 9. Summary
API barrel; minimal maintenance.

---

## intent-classifier.ts

### 1. Inventory
- **LoC:** 466
- **Exports:** `classifyIntent`, `detectPrimaryIntent`, `detectSecondaryIntents`, `detectDomains`, `detectOperations`, `analyzeComplexity`, `analyzeWriteScope`, `detectSubIntent`, `detectTags`
- **Dependencies:** `task-types`, `routing-types`

### 2. Bağlam
Routing v2 Layer 1. Task scope/description → TaskDNA (intent, sub-intent, operations, complexity, scope category, tags).

### 3. Debt Risk
Orta. Keyword dictionary maintenance — Turkish/English mixed.

### 4. Dead Code
Görünmüyor.

### 5. Documentation Gaps
Top header iyi. `INTENT_KEYWORDS` her intent için ayrı liste — bunun nasıl genişletileceği dokümante eksik.

### 6. ADR Compliance
ADR-028 — ✅ V2 Layer 1.
ADR-053 (TaskType Taxonomy) — intent değerleri (security, bugfix, refactor, ...) ADR-053 ile align mi? Cross-check gerekli.

### 7. Refactor Recommendations
- Keyword dictionary'i external JSON'a çıkar (i18n + extensibility).
- ML-lite scoring (TF-IDF) for future.

### 8. Sprint 187 Follow-up
- ADR-053 taxonomy reconciliation (decision-types ile birlikte).
- Multi-language keyword support (TR + EN ayrı dict).

### 9. Summary
Routing brain'in algılama katmanı; iyi başlangıç, evolution path açık.

---

## lazy-loader.ts

### 1. Inventory
- **LoC:** 145
- **Exports:** `LoaderFn`, `LazyHandle`, `PreloadConfig`, `lazyLoad`, `LazyMap` class
- **Dependencies:** Saf TS

### 2. Bağlam
Generic lazy load utility. Property erişiminde trigger.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Caller graph: `lazyLoad` ve `LazyMap` gerçekten kullanılıyor mu?

### 5. Documentation Gaps
İyi JSDoc.

### 6. ADR Compliance
Yok özel.

### 7. Refactor Recommendations
- Kullanım yoksa: sil.
- Kullanım varsa: stats (load count, miss/hit) ekle.

### 8. Sprint 187 Follow-up
- Caller audit.

### 9. Summary
Utility primitive; kullanım audit'i gerekli.

---

## manifest-migrator.ts

### 1. Inventory
- **LoC:** 63
- **Exports:** `needsMigration`, `isV2Manifest`, `migrateAgentManifest`, `migrateSkillManifest`
- **Dependencies:** `agent-types`, `skill-types`, `activation-engine`

### 2. Bağlam
V1 → V2 manifest in-memory migration. Disk'e yazmaz.

### 3. Debt Risk
Düşük.

### 4. Dead Code
V1 manifest kalmadıysa: dead.

### 5. Documentation Gaps
İyi.

### 6. ADR Compliance
ADR-028 — ✅.

### 7. Refactor Recommendations
- Activation-engine V1→V2 migration helpers ile birleştirme (DRY).

### 8. Sprint 187 Follow-up
- V1 manifest sayımı.

### 9. Summary
Migration helper; aktivasyon-engine ile DRY adayı.

---

## memory-export.ts

### 1. Inventory
- **LoC:** 364
- **Exports:** `exportSummaryMd`, `exportDecisionsMd`, `exportMemoryMd`, `exportDebtMd`, `AdrFsExportResult`, `exportAdrsToFs`
- **Dependencies:** `node:fs`, `memory-store`, `memory-types`

### 2. Bağlam
DB → .md snapshot generator. `.brain/exports/summary.md`, `decisions.md`, `memory.md`, `debt.md` üretir.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Görünmüyor.

### 5. Documentation Gaps
Header iyi. ADR-046 amendment referansı mevcut.

### 6. ADR Compliance
ADR-046 (Brain Self-Update) — ✅ bi-directional sync.

### 7. Refactor Recommendations
- Per-export format template'leri ayrı `templates/export-*.md.tmpl`'e taşı.

### 8. Sprint 187 Follow-up
- Export format versioning (md schema değişikliği için).

### 9. Summary
Memory V2 DB→FS layer; clean.

---

## memory-import.ts

### 1. Inventory
- **LoC:** 530
- **Exports:** `extractKeywords`, `parseDecisionsMd`, `parseMemoryMd`, `extractSprintFromDebtId`, `parseDebtMd`, `backfillDebtSprintIds`, `backupRelations`, `restoreRelations`, `rebuildWithRelationSafety`, `backfillSprintMemoriesFromSprintsDir`
- **Dependencies:** `node:fs`, `node:path`, `memory-types`, `memory-store`, `errors`

### 2. Bağlam
.md files → DB import. `memory rebuild` command'in parser layer'ı.

### 3. Debt Risk
Orta. Parser brittleness — md format değişirse silent drift.

### 4. Dead Code
Görünmüyor.

### 5. Documentation Gaps
Module header parse format'larını listelemiyor (md → DB mapping spec).

### 6. ADR Compliance
ADR-046 — ✅ DB-first migration.

### 7. Refactor Recommendations
- Markdown AST parser (remark) ile regex'leri değiştir.
- Format spec ayrı doküman.

### 8. Sprint 187 Follow-up
- Parser robustness test coverage.

### 9. Summary
Memory V2 import layer; brittle ama functional.

---

## memory-normalize.ts

### 1. Inventory
- **LoC:** 38
- **Exports:** `turkishNormalize`
- **Dependencies:** Saf TS

### 2. Bağlam
i18n text normalize for FTS5. TR/EN/DE %100 recall. SQLite FTS5 unicode61'in Turkish I/İ case folding eksikliğini telafi eder.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
İyi (15/15 test pass note).

### 6. ADR Compliance
ADR-046 — ✅.

### 7. Refactor Recommendations
- Locale extensibility (Arapça, Çince için ek normalize'ler).

### 8. Sprint 187 Follow-up
- Yeni dil ekleme stratejisi.

### 9. Summary
Memory V2 i18n recall'un anahtarı.

---

## memory-query.ts

### 1. Inventory
- **LoC:** 415
- **Exports:** `MemoryQueryError`, `escapeFts5Query`, `searchMemory`, `buildAutoQuery`
- **Dependencies:** `memory-store`, `memory-normalize`

### 2. Bağlam
Dual-layer FTS5 search (original + normalized). `buildAutoQuery` Brain lifecycle integration için.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Görünmüyor.

### 5. Documentation Gaps
Top-level JSDoc iyi. `searchMemory` query DSL ayrı doc'ta belirtilebilir.

### 6. ADR Compliance
ADR-046 — ✅.

### 7. Refactor Recommendations
- Query builder fluent API (chainable `.text().type().status().limit()`).
- FTS5 query syntax escape edge case'leri test.

### 8. Sprint 187 Follow-up
- Search relevance scoring (BM25 customization).

### 9. Summary
Memory V2 search layer; clean dual-layer.

---

## memory-store.ts

### 1. Inventory
- **LoC:** 959
- **Exports:** `MemoryStore` class
- **Dependencies:** `better-sqlite3`, `memory-normalize`, `errors`, `memory-types`

### 2. Bağlam
SQLite DB layer. FTS5, tags, relations, history, decay/soft-delete. Memory V2'nin kalbi. 5 table + 1 FTS5 virtual.

### 3. Debt Risk
Yüksek. 959 LoC tek class — DB schema değişikliği impact büyük.

### 4. Dead Code
Görünmüyor.

### 5. Documentation Gaps
Top-level JSDoc + schema version note. Schema migration history yok.

### 6. ADR Compliance
ADR-046 — ✅ Memory V2 source of truth.

### 7. Refactor Recommendations
- CRUD operations → ayrı `MemoryStoreCrud` mixin.
- FTS5 search ops → ayrı `MemoryStoreSearch`.
- Schema migrations → ayrı `MemoryStoreMigrations` (versioned).

### 8. Sprint 187 Follow-up
- Schema v1 → v2 migration plan (relations enrichment).
- DB backup/restore CLI.

### 9. Summary
**Memory V2 backbone; refactor priority (god-class).**

---

## memory-types.ts

### 1. Inventory
- **LoC:** 225
- **Exports:** `EntryType`, `EntrySource`, `EntryStatus`, `RelationType`, `ChangeType`, `MemoryEntryV2`, `CreateEntryInput`, `EntryRelation`, `Relation`, `MemoryRelation`, `EntryHistoryRecord`, `MemoryQueryParams`, `MemorySearchResult`, `SummaryExportEntry`, `TaskRecord`
- **Dependencies:** Saf TS

### 2. Bağlam
Memory V2 type tanımları. SQLite schema'ya 1:1 maps.

### 3. Debt Risk
Düşük.

### 4. Dead Code
`Relation` vs. `MemoryRelation` vs. `EntryRelation` — 3 farklı relation tipi neden? Konsolidasyon adayı.

### 5. Documentation Gaps
Her tip için JSDoc kısmen var.

### 6. ADR Compliance
ADR-046 — ✅.

### 7. Refactor Recommendations
- Relation tipi konsolide et (3 → 1).
- Zod schema derive et (validation için).

### 8. Sprint 187 Follow-up
- Relation type DRY refactor.

### 9. Summary
Memory V2 type domain; relation drift cleanup adayı.

---

## mode-presets.ts

### 1. Inventory
- **LoC:** 112
- **Exports:** `ModelStrategy`, `MODE_PRESETS`, `TIER_ORDER`, `compareTiers`, `isAtLeastTier`, `getModePreset`
- **Dependencies:** `model-equivalence`

### 2. Bağlam
Tier-based model strategy (performance/balanced/economic/api). Hard-coded model name'lerin yerine tier-based selection.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Görünmüyor.

### 5. Documentation Gaps
Top-level JSDoc iyi.

### 6. ADR Compliance
ADR-023 (Provider-Agnostic Tier) — ✅.

### 7. Refactor Recommendations
- `MODE_PRESETS` external `.deckent/modes/` directory'sine taşı (user-editable).

### 8. Sprint 187 Follow-up
- Custom mode definition CLI.

### 9. Summary
Tier-based routing'in foundation'ı; clean.

---

## model-equivalence.ts

### 1. Inventory
- **LoC:** 148
- **Exports:** `ClaudeModel`, `OpenAIModel`, `GeminiModel`, `ProviderName`, `MultiProviderModelType`, `ModelTier`, `MODEL_TIERS`, `getModelTier`, `getEquivalentModel`, `isModelAvailable`, `getModelProvider`, `getModelsInTier`, `getProviderModels`, `getModelForProviderTier`
- **Dependencies:** `errors`, `model-registry`, `task-types`

### 2. Bağlam
Cross-provider tier mapping. Brain `opus-tier` → Codex `gpt-5`. ModelRegistry'den derive eder.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Görünmüyor.

### 5. Documentation Gaps
İyi.

### 6. ADR Compliance
ADR-023 — ✅.

### 7. Refactor Recommendations
- Yok özel.

### 8. Sprint 187 Follow-up
- Yeni provider eklenme protokolü.

### 9. Summary
Tier mapping; clean ve maintainable.

---

## model-registry.ts

### 1. Inventory
- **LoC:** 315
- **Exports:** `RegistryProviderName`, `ModelTier`, `ModelStatus`, `ModelCapabilities`, `ModelCost`, `ModelDefinition`, `BUILTIN_MODELS`, `ModelRegistry` class, `modelRegistry` singleton, `BuiltinModelId`, `ModelType`
- **Dependencies:** `errors`

### 2. Bağlam
Single source of truth for model definitions. 13 model × 3 provider × 4 tier. task-types, model-equivalence, providers tümü buraya delegate eder.

### 3. Debt Risk
Düşük-Orta. Hard-coded `BUILTIN_MODELS` array — yeni model çıkışında manuel update.

### 4. Dead Code
Deprecated models (`ModelStatus = 'deprecated'`) hâlâ array'de mi?

### 5. Documentation Gaps
İyi (top header).

### 6. ADR Compliance
ADR-023 — ✅ source of truth.

### 7. Refactor Recommendations
- `BUILTIN_MODELS` external `assets/models.json` (cost-config gibi user-editable).
- Auto-fetch (LiteLLM JSON, pricing-updater.ts pattern'ı) ile sync.

### 8. Sprint 187 Follow-up
- Deprecated model purge policy.

### 9. Summary
**Single source of truth — kritik modül; external sync iyileştirme adayı.**

---

## monitoring-types.ts

### 1. Inventory
- **LoC:** 123
- **Exports:** `AgentRole`, `AgentStatus` enum, `Heartbeat`, `AgentInfo`, `AlertLevel` enum, `Alert`, `BoundaryViolationType`, `BoundaryViolation`, `DashboardState`, `LockInfo`, `SkillMeta`
- **Dependencies:** `task-types`, `sprint-types`

### 2. Bağlam
Auditor/Monitor domain types. Heartbeat, Alert, Dashboard, BoundaryViolation.

### 3. Debt Risk
Düşük.

### 4. Dead Code
`SkillMeta` — kullanım yeri?

### 5. Documentation Gaps
İyi.

### 6. ADR Compliance
ADR-037 ile uyumlu (boundary violation types).

### 7. Refactor Recommendations
- `heartbeat-types.ts` ile konsolide?

### 8. Sprint 187 Follow-up
- Yok.

### 9. Summary
Monitor domain types; stabil.

---

## multi-ide.ts

### 1. Inventory
- **LoC:** 168
- **Exports:** `SprintLockInfo`, `acquireSprintLock`, `isSprintLocked`, `releaseSprintLock`
- **Dependencies:** `node:fs`, `node:path`, `environment`, `pid-liveness`, `utils`

### 2. Bağlam
PID-based sprint lock — concurrent sprint execution prevention from different IDEs/processes. `.deckent/sprint.lock`.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
İyi.

### 6. ADR Compliance
ADR-034 (Multi-Project Isolation) — ✅.

### 7. Refactor Recommendations
- Lock file format versioning.

### 8. Sprint 187 Follow-up
- Cross-platform PID liveness fragility test (Windows, WSL).

### 9. Summary
Multi-IDE conflict prevention; clean.

---

## nervous-types.ts

### 1. Inventory
- **LoC:** 331
- **Exports:** `AuthorityMode`, `RiskLevel`, `ApprovalPolicy`, `Severity`, `SafetyFloorAction`, `NotificationAction`, `NervousNotification`, `AuthorityMatrix`, `NervousSystemConfig`, `DetectorResult`, `ObserverEventSource`, `ObserverEvent`, `SprintStateSnapshot`, `DetectorContext`, `ActionDefinition`, `ExecutionRecord`, `DecisionOutput`
- **Dependencies:** Saf TS

### 2. Bağlam
Nervous System (ADR-040) tip tanımları. Sprint 146'da placeholder, Sprint 147'de canlı.

### 3. Debt Risk
Orta. Nervous System hâlâ evolution'da; type drift olabilir.

### 4. Dead Code
Görünmüyor (ADR-040 accepted).

### 5. Documentation Gaps
Top JSDoc iyi (Turkish — geliştirici uyumluluğu açısından check).

### 6. ADR Compliance
ADR-040 — ✅ kanonik types.

### 7. Refactor Recommendations
- Çoklu sub-domain'lere böl: `nervous-detector-types`, `nervous-action-types`.

### 8. Sprint 187 Follow-up
- Nervous System V2 type evolution.

### 9. Summary
Nervous System type backbone; çok geniş, split adayı.

---

## notification-config.ts

### 1. Inventory
- **LoC:** 95
- **Exports:** `isValidUrl`, `validateNotificationConfig`, `getDefaultNotificationConfig`, `resolveNotificationConfig`
- **Dependencies:** `notifications`

### 2. Bağlam
External notification config (webhook, discord, slack) validation.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Görünmüyor.

### 5. Documentation Gaps
JSDoc kısmi.

### 6. ADR Compliance
Yok özel.

### 7. Refactor Recommendations
- Validation → Zod (config.ts pattern).

### 8. Sprint 187 Follow-up
Yok.

### 9. Summary
Config validation helper; küçük & odaklı.

---

## notification-dispatcher.ts

### 1. Inventory
- **LoC:** 199
- **Exports:** `NotificationPriority`, `NotificationEventName`, `Notification`, `NotificationAdapter`, `NotifyDispatcher` class, `createNotification`, `toEventPayload`
- **Dependencies:** `utils`

### 2. Bağlam
Local user notification system (CLI terminal + MCP). Sprint 139 ADR-035 DECKENT→USER:NOTIFY. Throttled 1 notification/sec. notifications.ts (external webhook) ile complementary.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Görünmüyor.

### 5. Documentation Gaps
İyi.

### 6. ADR Compliance
ADR-035 — ✅ DECKENT→USER:NOTIFY canal.

### 7. Refactor Recommendations
- Adapter registry'yi external'a aç (plugin notification adapters).

### 8. Sprint 187 Follow-up
- Throttle interval config bağla.

### 9. Summary
DECKENT→USER:NOTIFY runtime; clean.

---

## notifications.ts

### 1. Inventory
- **LoC:** 118
- **Exports:** `NotificationEventType`, `NotificationEvent`, `NotificationConfig`, `NotificationProvider`, `isInteractiveTerminal`, `NotificationDispatcher` class
- **Dependencies:** `utils`

### 2. Bağlam
External notification (webhook/discord/slack). connector adapters için interface tanımı.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Görünmüyor.

### 5. Documentation Gaps
Module-level header eksik. `NotificationDispatcher` vs. `NotifyDispatcher` (notification-dispatcher.ts) confusion.

### 6. ADR Compliance
Yok özel.

### 7. Refactor Recommendations
- `NotificationDispatcher` (external) vs. `NotifyDispatcher` (local) naming netleştir → `ExternalNotificationDispatcher` vs. `LocalNotifyDispatcher`.

### 8. Sprint 187 Follow-up
- Naming reconciliation.

### 9. Summary
External notification; rename adayı.

---

## notify-registry.ts

### 1. Inventory
- **LoC:** 42
- **Exports:** `setGlobalNotifyDispatcher`, `getGlobalNotifyDispatcher`, `clearGlobalNotifyDispatcher`
- **Dependencies:** `notification-dispatcher`

### 2. Bağlam
Sprint 150 H6 — global singleton for NotifyDispatcher. Circular import break (mcp/server.ts ↔ core/notify.ts).

### 3. Debt Risk
Düşük.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
İyi (top header explicit).

### 6. ADR Compliance
ADR-035 — ✅.

### 7. Refactor Recommendations
- Yok özel.

### 8. Sprint 187 Follow-up
Yok.

### 9. Summary
Minimal circular-import break.

---

## notify.ts

### 1. Inventory
- **LoC:** 102
- **Exports:** `notify` (async), `notifyAsync`
- **Dependencies:** `notify-registry`, ...

### 2. Bağlam
Sprint 150 H6 — fail-safe entry point for lifecycle code. event-bus emit + global NotifyDispatcher bridge.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
İyi.

### 6. ADR Compliance
ADR-035 — ✅.

### 7. Refactor Recommendations
- Yok özel.

### 8. Sprint 187 Follow-up
Yok.

### 9. Summary
Lifecycle notification entry; clean.

---

## observability-rotation.ts

### 1. Inventory
- **LoC:** 170
- **Exports:** `ObservabilityRotationConfig`, `RotationResult`, `DEFAULT_ROTATION_CONFIG`, `rotateMetricsFile`, `shouldRotate`, `enforceKeepLastN`, `readArchivedMetrics`, `listArchives`
- **Dependencies:** `node:fs`, `node:path`, `node:zlib`, `utils`

### 2. Bağlam
Size-based + sprint-based metrics file rotation. `.deckent/archive/metrics/metrics-<sprintId>.jsonl.gz`. Sprint 150 Task 030.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
İyi.

### 6. ADR Compliance
Yok özel.

### 7. Refactor Recommendations
- Yok özel.

### 8. Sprint 187 Follow-up
Yok.

### 9. Summary
Local observability rotation; clean.

---

## observability.ts

### 1. Inventory
- **LoC:** 479
- **Exports:** `MetricEntry`, `TraceEntry`, `LogEntry`, `ObservabilityEntry`, `LoadReportSection`, `TELEMETRY_ENABLED`, `initObservability`, `resetObservability`, `getObservabilitySprintId`, `setObservabilitySprintId`, `getPerSprintMetricsPath`, `getMetricsPath`, `metric`, `trace`, `structuredLog`, `generateLoadReport`, `percentile`, `buildHistogramBuckets`
- **Dependencies:** `node:fs`, `node:path`, `errors`

### 2. Bağlam
Local observability. Zero network — `.deckent/metrics.jsonl` (append-only JSONL). Sprint 134 T-011.

### 3. Debt Risk
Düşük.

### 4. Dead Code
`TELEMETRY_ENABLED = false` const — kullanım?

### 5. Documentation Gaps
İyi (data locality hard contract).

### 6. ADR Compliance
ADR-033 — ✅ zero network.

### 7. Refactor Recommendations
- `metric`, `trace`, `structuredLog` 3 entry type'ı ayrı modüllere split (~150 LoC each).

### 8. Sprint 187 Follow-up
- Load report rendering — Markdown vs. HTML output.

### 9. Summary
Local observability backbone; clean ama 479 LoC split adayı.

---

## orphan-cleaner.ts

### 1. Inventory
- **LoC:** 431
- **Exports:** `PostFinalizeReport`, `PreflightReport`, `postFinalizeCleanup`, `preflightOrphanCleanup`, `cleanOrphanIpcDirsLegacy`, `CleanOrphanIpcDirsOpts`, `cleanOrphanIpcDirs`
- **Dependencies:** `node:fs`, `node:fs/promises`

### 2. Bağlam
Sprint 144 Task 018. Post-finalize: terminal task'lerin archive'i. Pre-flight: previous sprint orphan'larının cleanup'ı.

### 3. Debt Risk
Düşük.

### 4. Dead Code
`cleanOrphanIpcDirsLegacy` — legacy → yeni `cleanOrphanIpcDirs` ile değiştirilmiş olmalı; legacy dead mı?

### 5. Documentation Gaps
İyi (top header).

### 6. ADR Compliance
Yok özel.

### 7. Refactor Recommendations
- Legacy fonksiyon kaldır.

### 8. Sprint 187 Follow-up
- Legacy cleanup audit.

### 9. Summary
Sprint cleanup hygiene; minor legacy dead code.

---

## output-collector.ts

### 1. Inventory
- **LoC:** 459
- **Exports:** `OutputCollectorError`, `OutputEntry`, `OutputBackendType`, `CollectOptions`, `OutputSnapshot`, `CircularBuffer` class, `OutputCollector` class, `createOutputCollector`
- **Dependencies:** `node:child_process`, `node:fs`, `node:path`, `constants`

### 2. Bağlam
Multi-backend worker output collector. Docker logs, tmux capture-pane, subprocess pipe. CircularBuffer (max 10k lines), adaptive polling (1s active, 5s idle).

### 3. Debt Risk
Orta. Backend-specific code (`spawnSync` calls) — backend drift.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
İyi.

### 6. ADR Compliance
ADR-006 (spawnSync security) — verify gerekli.

### 7. Refactor Recommendations
- Backend adapters'ı ayrı dosyalara böl (`docker-output-adapter`, `tmux-output-adapter`, `subprocess-output-adapter`).

### 8. Sprint 187 Follow-up
- Backend interface formalization.

### 9. Summary
Backend abstraction; refactor adayı (split-by-backend).

---

## output-formatter.ts

### 1. Inventory
- **LoC:** 234
- **Exports:** `OutputMode`, `StatusData`, `formatStatus`, `resolveOutputMode`, `getEmoji`
- **Dependencies:** Yok

### 2. Bağlam
4-mode render (explainatory/standart/verbose/json) for CLI output. Zero external deps.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
İyi.

### 6. ADR Compliance
ADR-021 (Kraken ASCII Brand) ile uyumlu.

### 7. Refactor Recommendations
- Template'leri external'a (`assets/templates/status-*.tmpl`).

### 8. Sprint 187 Follow-up
- i18n template support.

### 9. Summary
Output rendering; clean.

---

## panic-guard.ts

### 1. Inventory
- **LoC:** 141
- **Exports:** `PanicReason`, `PanicEvent`, `PanicKillOptions`, `PanicGuardDecision`, `PanicGuard` class
- **Dependencies:** `node:fs`, `node:path`, `utils`, `constants`

### 2. Bağlam
Sprint 143 panic kill guard. Default BLOCK kill (Alperen rule). Override: `--force --user-explicit`. Forensic log `.deckent/<sprint>-panic-*.json`.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
İyi.

### 6. ADR Compliance
ADR-037 (Authority Matrix) ile uyumlu — user approval gate.

### 7. Refactor Recommendations
- Yok özel.

### 8. Sprint 187 Follow-up
- Panic reason taxonomy extensibility.

### 9. Summary
Safety guard; Alperen rule kanonik impl.

---

## pid-liveness.ts

### 1. Inventory
- **LoC:** 31
- **Exports:** `isPidAlive`
- **Dependencies:** `node:fs`

### 2. Bağlam
Sprint 178 Task 4. Cross-platform process-alive check. Linux: `/proc/<pid>`. Darwin/Win32: `process.kill(pid, 0)`.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
İyi (top header explicit).

### 6. ADR Compliance
Yok özel.

### 7. Refactor Recommendations
- Yok özel.

### 8. Sprint 187 Follow-up
Yok.

### 9. Summary
Tiny but valuable cross-platform primitive.

---

## plugin-hooks.ts

### 1. Inventory
- **LoC:** 833
- **Exports:** `PluginHook`, `BeforeSprintContext`, `AfterSprintContext`, `BeforeTaskContext`, `AfterTaskContext`, `HookContext`, `HookCallback`, `registerHook`, `runHooks`, `clearHooks`, `getHookCount`, `clearHook`, `loadHookModule`, `registerPluginHooks`, `loadPluginHooks`, `parseTscErrorFiles`, `CiGuardianConfig`, `DEFAULT_CI_GUARDIAN_CONFIG`, `CiBaseline`, `CiRegressionCheckResult`, `findTargetedTestFiles`, `runTscCheck`, `runTargetedTests`, `readCiBaseline`, `writeCiBaseline`, `resolveCiGuardianConfig`, `runCiRegressionCheck`, `CiValidationResult`, `parseVitestOutput`, `runFullVitest`
- **Dependencies:** `node:fs`, `node:path`, `node:url`, `node:child_process`, `plugin`, `plugin-loader`, `stack-detector`

### 2. Bağlam
Plugin hook system + CI guardian utilities. Plugin hooks (beforeSprint, afterSprint, beforeTask, afterTask). CI baseline detection, tsc check, vitest run, regression check.

### 3. Debt Risk
**Çok Yüksek.** 833 LoC iki domain karışmış: plugin hooks vs. CI guardian. Concern violation.

### 4. Dead Code
CI guardian fonksiyonları hâlâ canlı mı (CI workflow değiştiyse)?

### 5. Documentation Gaps
İki domain ayırımı yorum dışında dokümante değil.

### 6. ADR Compliance
ADR-006 (spawnSync security) — `runTscCheck`, `runTargetedTests` spawnSync ile.

### 7. Refactor Recommendations
- **Critical split**: `plugin-hooks.ts` → ~250 LoC, `ci-guardian.ts` → ~580 LoC.
- Concern separation: plugins vs. CI.

### 8. Sprint 187 Follow-up
- **Split priority: plugin-hooks vs. ci-guardian.**

### 9. Summary
**God-module: 2 concern karışmış; refactor priority.**

---

## plugin-loader.ts

### 1. Inventory
- **LoC:** 161
- **Exports:** `computeFileHash`, `verifyPluginSignature`, `scanPluginSandbox`, `PluginSecurityConfig`, `PluginSecurityResult`, `validatePluginSecurity`
- **Dependencies:** `node:crypto`, `node:fs`, `node:path`, `plugin`, `marketplace/skill-sandbox`

### 2. Bağlam
Plugin security layer. AST sandbox scan + SHA-256 signature verification + allowed path list.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
İyi (top header defense-in-depth).

### 6. ADR Compliance
ADR-034 (Multi-Project Isolation) — ✅ symlink-aware.

### 7. Refactor Recommendations
- Yok özel.

### 8. Sprint 187 Follow-up
Yok.

### 9. Summary
Plugin security backbone; clean.

---

## plugin.ts

### 1. Inventory
- **LoC:** 488
- **Exports:** `PluginSignature`, `PluginManifest`, `Plugin`, `PluginError`, `PluginSecurityError`, `validateManifest`, `loadPlugin`, `listPlugins`, `scanPlugins`, `enablePlugin`, `disablePlugin`, `isGitUrl`, `isLocalPath`, `detectSourceType`, `installPlugin`, `removePlugin`, `createPlugin`
- **Dependencies:** `node:fs`, `node:fs/promises`, `node:path`, `node:child_process`, `types`, `utils`

### 2. Bağlam
Plugin lifecycle: install (npm/git/local), enable/disable, manifest validation, scan.

### 3. Debt Risk
Orta. `installPlugin` 3 source type (npm/git/local) — git/npm install yan etkilere açık.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
İyi.

### 6. ADR Compliance
ADR-006 (spawnSync security) — verify.

### 7. Refactor Recommendations
- Install adapters'ı strategy pattern'a böl (`NpmInstaller`, `GitInstaller`, `LocalInstaller`).

### 8. Sprint 187 Follow-up
- Install security audit (npm registry trust, git provenance).

### 9. Summary
Plugin lifecycle backbone; refactor adayı (install strategy split).

---

## pricing-updater.ts

### 1. Inventory
- **LoC:** 529
- **Exports:** `UpdateSource`, `UpdateOptions`, `UpdateResult`, `fetchLiteLLMPricing`, `fetchOpenRouterPricing`, `updatePricing`, `formatUpdateResult`
- **Dependencies:** Node 18+ fetch, `node:fs`

### 2. Bağlam
Multi-provider auto-fetch pricing. LiteLLM primary + OpenRouter validator + bundled fallback. Zero dep.

### 3. Debt Risk
Orta. External JSON contract (LiteLLM schema) brittle.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
İyi.

### 6. ADR Compliance
ADR-010 — ✅ zero dep fetch.

### 7. Refactor Recommendations
- Source adapters strategy pattern.

### 8. Sprint 187 Follow-up
- LiteLLM schema breakage detection.

### 9. Summary
Auto-pricing; clean ama external contract risk.

---

## provider-capabilities.ts

### 1. Inventory
- **LoC:** 156
- **Exports:** `ProviderCapability`, `getCapabilities`, `getProvidersWithCapability`, `canProviderHandle`, `getAllProviders`, `getModelCapabilities`
- **Dependencies:** `model-equivalence`, `task-types`, `errors`

### 2. Bağlam
Provider capability matrix: streaming, tool use, vision, code execution.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
İyi.

### 6. ADR Compliance
Yok özel.

### 7. Refactor Recommendations
- Yok özel.

### 8. Sprint 187 Follow-up
Yok.

### 9. Summary
Capability matrix; clean.

---

## provider.ts

### 1. Inventory
- **LoC:** 624
- **Exports:** `ProviderSpawnOptions`, `ProviderWorkerInfo`, `ProviderAdapter`, `ProviderError`, `ProviderNotFoundError`, `ProviderUnavailableError`, `ProviderRegistry`, `providerRegistry`, `DetectedProvider`, `detectCliVersion`, `detectAvailableProviders`, `formatDetectedProviders`, `FallbackResult`, `resolveProviderWithFallback`, `applyDeckSecretsToEnv`, `BootstrapResult`, `bootstrapProviders`
- **Dependencies:** `node:child_process`, `types`, `config-types`, `task-types`, `model-equivalence`, `session-interface`, `deck-file`

### 2. Bağlam
ProviderAdapter interface + ProviderRegistry singleton + provider detection + fallback chain + bootstrap.

### 3. Debt Risk
Orta-Yüksek. 624 LoC tek dosya — provider lifecycle çok concern.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
İyi (top header).

### 6. ADR Compliance
ADR-016 (Connector Module) — ✅.
ADR-017 (MCP-Native Provider Adapters) — ✅.

### 7. Refactor Recommendations
- Detection logic → `provider-detection.ts`.
- Fallback logic → `provider-fallback.ts`.
- Registry → standalone `provider-registry.ts`.

### 8. Sprint 187 Follow-up
- Split priority (orta).

### 9. Summary
Provider backbone; split adayı.

---

## provisioner.ts

### 1. Inventory
- **LoC:** 229
- **Exports:** `ToolId`, `LinuxPkgManager`, `InstallMethod`, `InstallPlan`, `PlanOptions`, `SpawnResult`, `SpawnFn`, `InstallOptions`, `InstallResult`, `PROVISIONER_BIN_WHITELIST`, `planInstall`, `installTool`, `ProvisionMode`, `ProvisionOptions`, `resolveProvisionMode`, `collectMissingTools`, `provisionMissing`
- **Dependencies:** `spawn-safety`

### 2. Bağlam
ADR-063 Consent-Based Prerequisite Provisioning. Detect → plan → consent → install. npm-global auto, OS package manual.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
İyi (top header security ile birlikte).

### 6. ADR Compliance
ADR-006 (spawnSync security) — ✅.
ADR-063 (Consent-Based Provisioning) — ✅ kanonik impl.

### 7. Refactor Recommendations
- Yok özel.

### 8. Sprint 187 Follow-up
Yok.

### 9. Summary
ADR-063 kanonik implementasyon; clean & secure.

---

## redact-sensitive.ts

### 1. Inventory
- **LoC:** 39
- **Exports:** `redactSensitive`
- **Dependencies:** Yok

### 2. Bağlam
Credential redaction for log output. API keys, Bearer tokens, passwords in URLs.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
İyi (top header ADR-008 referansı).

### 6. ADR Compliance
ADR-008 — ✅ agents/ → cli/ violation breaker.

### 7. Refactor Recommendations
- Redaction pattern listesi extensibility.

### 8. Sprint 187 Follow-up
Yok.

### 9. Summary
Small, doğru security helper.

---

## routing-engine.ts

### 1. Inventory
- **LoC:** 686
- **Exports:** `AGENT_FALLBACK_CHAIN`, `selectAgentByFallback`, `RoutingOptions`, `routeTaskV2`, `evaluateForceAgentSemantic`, `calculateSkillBudget`, `resolveOverrides`, `calculateConfidence`, `assessContextFit`
- **Dependencies:** `task-types`, `agent-types`, `skill-types`, `routing-types`, `intent-classifier`, `activation-engine`, `condition-evaluator`

### 2. Bağlam
Routing v2 Layer 3 — unified routing orchestrator. ADR-028.

### 3. Debt Risk
Orta-Yüksek. 686 LoC — orchestrator complexity yüksek.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
İyi (top header).

### 6. ADR Compliance
ADR-028 — ✅ kanonik V2 routing.

### 7. Refactor Recommendations
- Sub-routing (skill budget, overrides, confidence) ayrı modüllere split.

### 8. Sprint 187 Follow-up
- Routing decision observability (per-task TaskDNA emit).

### 9. Summary
V2 routing brain; split adayı.

---

## routing-types.ts

### 1. Inventory
- **LoC:** 227
- **Exports:** `IntentType`, `ALL_INTENT_TYPES`, `SubIntentType`, `ALL_SUB_INTENT_TYPES`, `OperationType`, `TaskDNA`, `TaskSize`, `ActivationRule`, `ExclusionRule`, `ActivationConfig`, `ActivationResult`, `ConfidenceLevel`, `RoutingDecision`, `OverrideSource`, `SkillBudget`, `UserOverride`, `LearningBonus`, `RoutingEngineConfig`, `createDefaultTaskDNA`, `createDefaultActivationConfig`, `createDefaultRoutingEngineConfig`, `LEARNING_BONUS_CAP`, `SKILL_BUDGET_BY_SIZE`, `DEFAULT_TOKEN_BUDGET_PER_SKILL`, `DEFAULT_TOKEN_BUDGET_TOTAL`, `SKILL_TOKEN_BUDGET_BY_EFFORT`, `isValidIntentType`
- **Dependencies:** Saf TS

### 2. Bağlam
Routing v2 core types: TaskDNA, ActivationRule, RoutingDecision.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
İyi.

### 6. ADR Compliance
ADR-028 — ✅.

### 7. Refactor Recommendations
- Yok özel.

### 8. Sprint 187 Follow-up
- TaskDNA schema versioning.

### 9. Summary
Routing v2 type backbone; clean.

---

## rule-generator.ts

### 1. Inventory
- **LoC:** 417
- **Exports:** `CUSTOM_TEMPLATE`, `RuleRole`, `RuleProvider`, `RuleGeneratorOptions`, `RuleGeneratorResult`, `loadTemplate`, `formatAdrSection`, `renderTemplate`, `replaceSentinel`, `RenderedRules`, `RenderRulesFromStoreOptions`, `renderRulesFromStore`, `extractCustomSection`, `mergeWithCustom`, `generateRules`, `regenerateRules`
- **Dependencies:** `node:fs`, `node:path`, `node:url`, `memory-types`, `errors`

### 2. Bağlam
Provider-specific rule file (.claude/rules/, .codex/rules/, .gemini/rules/) generator. Template + ADR entries + custom section preserve.

### 3. Debt Risk
Düşük-Orta.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
İyi.

### 6. ADR Compliance
ADR-046 (Brain Self-Update) — ✅ kanonik regen.

### 7. Refactor Recommendations
- Template format JSON Schema.

### 8. Sprint 187 Follow-up
- Yeni provider rule path support.

### 9. Summary
ADR-046 regen kanonik impl; clean.

---

## session-interface.ts

### 1. Inventory
- **LoC:** 176
- **Exports:** `HealthCheckResult`, `Connector` class
- **Dependencies:** `provider`, `task-types`

### 2. Bağlam
ADR-008 Cycle 2 fix. orchestra/connector.ts'tan core'a taşındı.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
İyi (ADR-008 referansı).

### 6. ADR Compliance
ADR-008 — ✅ cycle break.
ADR-016 — ✅.

### 7. Refactor Recommendations
- Yok özel.

### 8. Sprint 187 Follow-up
Yok.

### 9. Summary
ADR-008 compliance fix; clean.

---

## signature.ts

### 1. Inventory
- **LoC:** 83
- **Exports:** `Keypair`, `generateKeypair`, `loadOrGenerateKeypair`, `signMessage`, `verifySignature`, `bytesToHex`, `hexToBytes`
- **Dependencies:** `@noble/ed25519`, `@noble/hashes/sha512`, `node:fs`, `node:path`, `node:os`

### 2. Bağlam
Ed25519 sign/verify. Audited pure JS, no native deps.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Caller graph: signature kullanım yeri (plugin verify? config sign?).

### 5. Documentation Gaps
İyi.

### 6. ADR Compliance
ADR-010 — `@noble/ed25519` dep (kayıtlı).

### 7. Refactor Recommendations
- Yok özel.

### 8. Sprint 187 Follow-up
- Signature kullanım audit (kim signMessage çağırıyor?).

### 9. Summary
Crypto primitive; kullanım audit gerekli.

---

## skill-cache.ts

### 1. Inventory
- **LoC:** 196
- **Exports:** `CachedSkill`, `SkillLoadingCache` class
- **Dependencies:** `node:fs`, `node:path`

### 2. Bağlam
In-memory skill content cache with staleness checks (mtime).

### 3. Debt Risk
Düşük.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
JSDoc kısmi.

### 6. ADR Compliance
Yok özel.

### 7. Refactor Recommendations
- Cache statistics (hit rate).

### 8. Sprint 187 Follow-up
Yok.

### 9. Summary
Skill cache; clean.

---

## skill-pool.ts

### 1. Inventory
- **LoC:** 306
- **Exports:** `SkillPoolManager` class
- **Dependencies:** `node:fs`, `node:path`, `skill-types`, `utils`

### 2. Bağlam
21 built-in skill pool. `.deckent/skills/*/manifest.json`. AST sandbox validation.

### 3. Debt Risk
Düşük-Orta. agent-pool ile parallel structure — DRY ihlali potansiyeli.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
JSDoc kısmi.

### 6. ADR Compliance
Yok özel.

### 7. Refactor Recommendations
- Common abstraction (`PoolManager<T>`) ile agent-pool DRY.

### 8. Sprint 187 Follow-up
- Pool abstraction.

### 9. Summary
Skill pool; DRY adayı.

---

## skill-registry.ts

### 1. Inventory
- **LoC:** 134
- **Exports:** `SkillRegistry` class
- **Dependencies:** `node:fs`, `node:path`, `skill-types`, `utils`

### 2. Bağlam
`skill-registry.json` skill metadata yönetimi.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
JSDoc kısmi.

### 6. ADR Compliance
Yok özel.

### 7. Refactor Recommendations
- skill-pool ile birleştirme (concern overlap?).

### 8. Sprint 187 Follow-up
- skill-pool vs. skill-registry concern netleştir.

### 9. Summary
Registry; concern overlap audit gerekli.

---

## skill-selector.ts

### 1. Inventory
- **LoC:** 199
- **Exports:** `selectSkills`, `resolveComposition`
- **Dependencies:** `skill-types`

### 2. Bağlam
V1 skill selection. V2'de routing-engine içinde.

### 3. Debt Risk
**Yüksek.** V2 routing default'tan sonra V1 selectSkills legacy.

### 4. Dead Code
**Potansiyel dead.** Caller audit.

### 5. Documentation Gaps
"V1 vs. V2" yok.

### 6. ADR Compliance
ADR-028 — V1 deprecate.

### 7. Refactor Recommendations
- `@deprecated` veya tasfiye.

### 8. Sprint 187 Follow-up
- Dead code audit (agent-selector ile aynı kategori).

### 9. Summary
V1 legacy; tasfiye adayı.

---

## skill-types.ts

### 1. Inventory
- **LoC:** 114
- **Exports:** `SkillCategory`, `StackDetectionRule`, `PromptInjectionConfig`, `SkillStats`, `SkillDefinition`, `ProjectStack`, `SkillSelectionResult`, `createDefaultSkillStats`, `createSkillDefinition`
- **Dependencies:** `types`, `routing-types`

### 2. Bağlam
Skill system types.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
İyi.

### 6. ADR Compliance
ADR-041 — ✅ horizontal skills.

### 7. Refactor Recommendations
- Yok özel.

### 8. Sprint 187 Follow-up
Yok.

### 9. Summary
Skill type domain; stabil.

---

## spawn-safety.ts

### 1. Inventory
- **LoC:** 168
- **Exports:** `ADAPTER_BIN_WHITELIST`, `SH_C_ALLOWED`, `SpawnSafetyErrorCode`, `SpawnSafetyError`, `SpawnSafetyOptions`, `assertSpawnSafe`, `isSpawnSafe`
- **Dependencies:** Yok

### 2. Bağlam
Adapter bin whitelist + arg sanitization. Pre-spawn safety check. ADR-006 (spawnSync security) companion + ADR-047 reference.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
**Mükemmel** (threat model boundary explicit).

### 6. ADR Compliance
ADR-006 — ✅ companion.
ADR-047 — ✅ adapter authority boundaries.

### 7. Refactor Recommendations
- Yok özel.

### 8. Sprint 187 Follow-up
Yok.

### 9. Summary
Security primitive örnek; benchmark.

---

## sprint-file-retention.ts

### 1. Inventory
- **LoC:** 354
- **Exports:** `DEFAULT_RETENTION_CONFIG`, `RetentionResult`, `extractSprintId`, `listSprintFiles`, `listForensicFiles`, `groupBySprintId`, `cleanupCounters`, `migrateForensicFiles`, `enforceRetention`, `runRetention`
- **Dependencies:** `node:fs`, `node:path`, ...

### 2. Bağlam
Hybrid retention: keep_last_n + size_cap_mb. Counter cleanup (-seq, -checkpoint-seq deletes). Forensic file move to `docs/audits/sprint-NNN/`.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
İyi (top header).

### 6. ADR Compliance
Yok özel.

### 7. Refactor Recommendations
- Yok özel.

### 8. Sprint 187 Follow-up
- Retention policy CLI tuning.

### 9. Summary
File retention; clean.

---

## sprint-types.ts

### 1. Inventory
- **LoC:** 166
- **Exports:** `SprintPhase` enum, `SprintStatus` enum, `Sprint`, `SprintMetrics`, `SprintResult`, `DebtPriority` enum, `DebtClass`, `DebtOriginScope`, `DebtItem`, `MemoryEntry`, `PatternEntry`, `DecayResult`, `BrainContext`, `ProjectState`, `SprintSizeRecommendation`
- **Dependencies:** `task-types`

### 2. Bağlam
Sprint domain types — lifecycle, metrics, debt, memory, brain context.

### 3. Debt Risk
Düşük.

### 4. Dead Code
`SprintSizeRecommendation` — kullanım?

### 5. Documentation Gaps
İyi.

### 6. ADR Compliance
ADR-044 (Sprint State Observability) — ✅.

### 7. Refactor Recommendations
- Yok özel.

### 8. Sprint 187 Follow-up
Yok.

### 9. Summary
Sprint type domain; stabil.

---

## stack-detector.ts

### 1. Inventory
- **LoC:** 736
- **Exports:** `STACK_COMMANDS`, `FullStackResult`, `detectProjectStack`, `isStackStale`, `refreshStack`, `detectFullStack`
- **Dependencies:** `node:fs`, `node:path`, `skill-types`, `utils`

### 2. Bağlam
Project stack detection (language, framework, testFramework, buildTool). Cache: `.deckent/project-stack.json`.

### 3. Debt Risk
Orta. 736 LoC — detection rules hard-coded.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
JSDoc kısmi.

### 6. ADR Compliance
Yok özel.

### 7. Refactor Recommendations
- Detection rules external JSON (rule-driven detection).
- Per-language detector strategy pattern.

### 8. Sprint 187 Follow-up
- Detection accuracy audit.

### 9. Summary
Stack detection; refactor adayı (rule externalization).

---

## subscription.ts

### 1. Inventory
- **LoC:** 154
- **Exports:** `checkModeCompatibility`, `detectSubscription`, `saveSubscriptionToConfig`
- **Dependencies:** `node:child_process`, `node:fs/promises`, `node:path`, `constants`, `utils`, `types`

### 2. Bağlam
Claude Max/Pro plan detection. Mode compatibility check.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
JSDoc kısmi.

### 6. ADR Compliance
Yok özel.

### 7. Refactor Recommendations
- Yok özel.

### 8. Sprint 187 Follow-up
- New subscription tier (Enterprise?) support.

### 9. Summary
Subscription detection; clean.

---

## system-capacity.ts

### 1. Inventory
- **LoC:** 92
- **Exports:** `SystemCapacity`, `detectSystemCapacity`, `suggestMaxWorkers`, `suggestSpawnBackend`
- **Dependencies:** `node:os`, `node:child_process`

### 2. Bağlam
Sprint 150 MVP. Hardware capability detection + config suggestion.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
İyi (MVP note explicit).

### 6. ADR Compliance
Yok özel.

### 7. Refactor Recommendations
- Sprint 151+ GPU/network/disk extension.

### 8. Sprint 187 Follow-up
- Capacity detection accuracy.

### 9. Summary
MVP; sprint roadmap'i clear.

---

## system-profile.ts

### 1. Inventory
- **LoC:** 30
- **Exports:** `calcRecommendedMaxWorkers`, `getSystemProfile`
- **Dependencies:** `node:os`, `types`

### 2. Bağlam
Free mem + CPU → recommended max workers.

### 3. Debt Risk
Düşük.

### 4. Dead Code
system-capacity.ts ile overlap?

### 5. Documentation Gaps
İyi.

### 6. ADR Compliance
Yok özel.

### 7. Refactor Recommendations
- system-capacity ile birleştirme audit.

### 8. Sprint 187 Follow-up
- system-profile vs. system-capacity reconciliation.

### 9. Summary
Tiny calc; merge candidate with system-capacity.

---

## task-types.ts

### 1. Inventory
- **LoC:** 367
- **Exports:** `ClaudeModel`, `OpenAIModel`, `GeminiModel`, `ModelType`, `ProviderName`, `PROVIDER_MODEL_MAP`, `CLAUDE_MODELS`, `ALL_MODELS`, `MODEL_API_IDS`, `resolveApiModelId`, `UnknownModelError`, `getProviderForModel`, `isClaudeModel`, `isOpenAIModel`, `isGeminiModel`, `getModelTier`, `isValidModel`, `TaskEffort`, `TaskPriority`, `TaskStatus`, `TaskEvaluation`, `SelfAssessment`, `TaskScope`, `GoNoGoCriteria`, `Task`, `FeedbackLoop`, `VerifyTestsResult`, `RubricCriterion`, `EvaluationRubric`, `RubricScore`
- **Dependencies:** `model-registry`

### 2. Bağlam
Task domain types + model types. Model data ModelRegistry'den derive.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
İyi.

### 6. ADR Compliance
ADR-023 — ✅ tier-aware.

### 7. Refactor Recommendations
- Model types ayrı `model-types.ts` (concern split).

### 8. Sprint 187 Follow-up
- Task vs. model type split.

### 9. Summary
Task type domain; minor split adayı.

---

## telemetry.ts

### 1. Inventory
- **LoC:** 66
- **Exports:** `TelemetryEvent`, `TelemetryCollector` class
- **Dependencies:** Yok

### 2. Bağlam
Opt-in telemetry collection. Local only, no network.

### 3. Debt Risk
Düşük.

### 4. Dead Code
**Yüksek olasılık.** `observability.ts` `TELEMETRY_ENABLED = false`. Bu modül runtime'da kullanılıyor mu?

### 5. Documentation Gaps
İyi (opt-in note).

### 6. ADR Compliance
ADR-033 — ✅.

### 7. Refactor Recommendations
- Kullanım audit. Yoksa sil.

### 8. Sprint 187 Follow-up
- Telemetry caller audit.

### 9. Summary
Opt-in telemetry; muhtemel dead code.

---

## token-counter.ts

### 1. Inventory
- **LoC:** 203
- **Exports:** `ModelName` (deprecated), `TokenBudget`, `PromptSizeEstimate`, `ContextBudgetEstimate`, `BudgetWarning`, `TokenCounter` class
- **Dependencies:** `task-types`, `model-registry`

### 2. Bağlam
Token count estimation. Per-model budget tracking.

### 3. Debt Risk
Düşük-Orta. Estimation heuristic — actual Anthropic count_tokens API ile drift.

### 4. Dead Code
`@deprecated ModelName` — kullanım?

### 5. Documentation Gaps
İyi.

### 6. ADR Compliance
Yok özel.

### 7. Refactor Recommendations
- `anthropic-http-client.countTokens` ile gerçek count integration.

### 8. Sprint 187 Follow-up
- Heuristic vs. exact count drift audit.

### 9. Summary
Token estimation; accuracy improvement adayı.

---

## types.ts

### 1. Inventory
- **LoC:** 13 (barrel re-export)
- **Exports:** task-types, config-types, monitoring-types, sprint-types
- **Dependencies:** Hepsi

### 2. Bağlam
Backward-compat barrel. `import { ... } from './types.js'` çalışmaya devam etsin.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
İyi (top yorum).

### 6. ADR Compliance
Yok.

### 7. Refactor Recommendations
- Sprint 187+ direct import migration ile barrel kaldırılabilir.

### 8. Sprint 187 Follow-up
- Direct import migration.

### 9. Summary
Compat shim; minimal.

---

## utils.ts

### 1. Inventory
- **LoC:** 340
- **Exports:** `debugLog`, `readFileSafe`, `readJsonSafe`, `readJsonSafeAsync`, `getNextSprintId`, `updateLastSprintId`, `parseSprintNumber`, `shouldRemoveResolvedDebt`, `parseDebtTable`, `generateDebtTable`, `ensureDeckentImport`, `formatDate`, `formatDuration`, `formatRelativeTime`
- **Dependencies:** `node:fs`, `node:fs/promises`, `node:path`, `constants`, `types`

### 2. Bağlam
Genel utility functions — debug logging, safe JSON read, sprint ID gen, debt table parser, date/duration format.

### 3. Debt Risk
Orta. Geniş concern (logging + io + parsing + format) — util grab-bag.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
JSDoc kısmi.

### 6. ADR Compliance
ADR-009 (DEBT.md Format) — ✅ parseDebtTable.

### 7. Refactor Recommendations
- Concern split: `utils-io.ts`, `utils-sprint.ts`, `utils-debt.ts`, `utils-format.ts`.

### 8. Sprint 187 Follow-up
- Utils split.

### 9. Summary
Util grab-bag; concern split adayı.

---

## validators.ts

### 1. Inventory
- **LoC:** 122
- **Exports:** `ValidationError`, `validatePath`, `validateSprintId`, `validatePhase`, `validateTaskId`
- **Dependencies:** `node:path`, `sprint-types`

### 2. Bağlam
Path traversal, sprint ID, phase, task ID validators. MCP tools ve orchestra için sanitization.

### 3. Debt Risk
Düşük.

### 4. Dead Code
Yok.

### 5. Documentation Gaps
İyi.

### 6. ADR Compliance
ADR-034 — ✅ path traversal guard.

### 7. Refactor Recommendations
- Yok özel.

### 8. Sprint 187 Follow-up
Yok.

### 9. Summary
Security validators; clean.

---

# Cross-Cutting Findings

## Top 10 Refactor Priority (Sprint 187+)

| # | Modül | Risk | Aksiyon |
|---|-------|------|---------|
| 1 | `config.ts` (1703 LoC) | Çok Yüksek | God-module split (ADR-024/026 pattern) |
| 2 | `plugin-hooks.ts` (833 LoC) | Çok Yüksek | Plugin hooks + CI guardian split |
| 3 | `memory-store.ts` (959 LoC) | Yüksek | CRUD + Search + Migrations split |
| 4 | `config-migration.ts` (636 LoC) | Yüksek | Versioned migration registry |
| 5 | `provider.ts` (624 LoC) | Yüksek | Detection + fallback + registry split |
| 6 | `errors.ts` (623 LoC) | Orta | Error registry category split |
| 7 | `file-lock.ts` (632 LoC) | Orta | file-lock + spawn-lock split |
| 8 | `routing-engine.ts` (686 LoC) | Orta | Sub-routing split |
| 9 | `stack-detector.ts` (736 LoC) | Orta | Rule externalization |
| 10 | `identity-generator.ts` (446 LoC) | Yüksek | ADR-046 reconciliation (dead/stale?) |

## Dead Code Candidates (Audit Priority)

- `agent-selector.ts`, `skill-selector.ts` — V1 routing legacy (V2 default Sprint 067+).
- `decision-types.ts:TaskType` — ADR-053 taxonomy ile uyumsuz.
- `telemetry.ts:TelemetryCollector` — `TELEMETRY_ENABLED = false` çelişki.
- `identity-generator.ts:regenerateProjectIdentity` — ADR-046 amendment sonrası.
- `constants.ts:PROJECT_IDENTITY_FILE` — `PROJECT-IDENTITY.md` removed.
- `config-validator.ts` — 6 LoC re-export shim; caller graph audit.
- `orphan-cleaner.ts:cleanOrphanIpcDirsLegacy` — yeni `cleanOrphanIpcDirs` ile değiştirilmiş.
- `lazy-loader.ts:lazyLoad`, `LazyMap` — caller audit.

## ADR Reconciliation Backlog

1. **ADR-053 TaskType Taxonomy** — `decision-types.ts:TaskType` ve `routing-types.ts:IntentType` ile uyumlu hale getir.
2. **ADR-046 PROJECT-IDENTITY removal** — `identity-generator.ts` ve `constants.ts:PROJECT_IDENTITY_FILE` audit.
3. **ADR-005 Synchronous I/O (deprecated)** — sync→async migration spec yok; codebase-wide policy.
4. **ADR-028 V1 routing tasfiye** — `agent-selector`, `skill-selector` migration.

## Documentation Improvements

- Module-level header eksik dosyalar: `credentials.ts`, `notifications.ts`, `agent-pool.ts` (kısmi), `global-config.ts`.
- ADR cross-link zayıf: Çoğu modül ADR'lere yorum içinde referans veriyor ama formal `@see ADR-NNN` JSDoc tag eksik.
- "Public vs. private" API ayrımı `index.ts`'de yok.
- `docs/architecture/` dizininde modül-bazlı deep dive eksik (routing, memory, providers için var; diğerleri eksik).

## Genel ADR Compliance Özeti

| ADR | Compliance | Not |
|-----|-----------|-----|
| ADR-001 TypeScript+ESM | ✅ 100% | Tüm dosyalar |
| ADR-002 Node16 Resolution | ✅ 100% | `.js` suffix tüm import'larda |
| ADR-005 Sync I/O (deprecated) | ⚠️ Yüksek sapma | Migration spec yok |
| ADR-006 spawnSync security | ✅ Compliant | Array-args pattern |
| ADR-008 Brain Merkezi Import | ✅ Compliant | core/ → orchestra/ yok |
| ADR-010 Tek Runtime Dep | ✅ Compliant | better-sqlite3, zod, @noble/ed25519 meşru |
| ADR-023 Provider-Agnostic Tier | ✅ Compliant | model-equivalence kanonik |
| ADR-028 V1→V2 Routing | ⚠️ Kısmi | V1 modüller hâlâ canlı |
| ADR-034 Multi-Project Isolation | ✅ Compliant | path traversal guard, per-project credentials |
| ADR-035 Verification Protocol | ✅ Compliant | DECKENT→USER:NOTIFY canal kanonik |
| ADR-036 ADR Governance | ✅ Compliant | adr-file-sync canlı |
| ADR-037 Authority Matrix | N/A (core/) | core/ role-aware değil |
| ADR-041 Agent Taxonomy | ✅ Compliant | Vertical agents + horizontal skills |
| ADR-046 Brain Self-Update | ⚠️ Reconciliation gerekli | identity-generator dead/stale? |
| ADR-053 TaskType Taxonomy | ⚠️ Uyumsuzluk | decision-types TaskType vs. routing IntentType drift |
| ADR-063 Consent Provisioning | ✅ Compliant | provisioner.ts kanonik |
| ADR-064 TOPP Continuous Dispatch | N/A (core/) | orchestra/ scope |

# Genel Summary

`src/core/` 90 modül, 25.868 LoC. Genel sağlık iyi: ADR-001/002/008/010 %100 compliance, çoğu modül well-bounded ve test edilebilir. Ana refactor priority **5 god-module split**: `config.ts` (1703), `memory-store.ts` (959), `plugin-hooks.ts` (833), `stack-detector.ts` (736), `routing-engine.ts` (686). Dead code candidates **8 modül** (V1 routing tasfiye + identity-generator ADR-046 reconciliation + telemetry audit). ADR reconciliation 3 öncelik: ADR-053 TaskType taxonomy, ADR-046 PROJECT-IDENTITY removal, ADR-005 sync→async policy. Documentation polish module-level header standardizasyonu ve `@see ADR-NNN` JSDoc tag adoption.

**Sprint 185 hipotez kanıtı:** AI Planner zero-config dinamik file-tree split kapasitesi sınırlı (479 dosya yerine 11 task üretildi, ~43 dosya/task bunch). Bu audit tek konsolide rapor olarak çıktı — dinamik per-file split mimari kapasite gerektiriyor (Sprint 187 spec input).

---

**Generated:** 2026-05-21
**Author:** doc-writer (Task 185-001)
**Lines:** ~1.350 markdown
**Source:** src/core/*.ts (90 files, 25.868 LoC)
