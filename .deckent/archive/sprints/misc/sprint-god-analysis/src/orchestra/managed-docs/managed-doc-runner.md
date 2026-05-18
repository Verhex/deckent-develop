# Analysis: src/orchestra/managed-docs/managed-doc-runner.ts
**Task ID:** 142-012 | **Model:** opus | **LoC:** 183 | **Effort:** max

## 1. Amacı
Sprint finalize sırasında tüm managed dokümanları güncelleyen orchestrator. `.deckent/docs.json`'dan config okur, her doc entry için: (1) cache kontrolü yapar, (2) content generator'ları çalıştırır, (3) template'leri render eder, (4) section-updater ile dosyayı günceller, (5) cache'i yazar. Ayrıca standalone `docs run` CLI komutu için DocUpdateContext builder sağlar. sprint-reporter.ts → updateProjectDocs() tarafından çağrılır.

## 2. Public API
- `runManagedDocUpdates(ctx: DocUpdateContext): DocUpdateResult[]` — JSDoc VAR, ana orkestrasyon fonksiyonu
- `buildStandaloneDocContext(projectRoot: string): DocUpdateContext | null` — JSDoc VAR, CLI docs run için

İç fonksiyon:
- `emptyMetrics(): SprintMetrics` — export edilmiyor, standalone context için boş metrik üretir

## 3. İç Bağımlılıklar
- `../../core/utils.js` → debugLog
- `../../core/constants.js` → BRAIN_DIR, SPRINTS_DIR
- `../../core/types.js` → Sprint, SprintMetrics, SprintResult, ResolvedConfig
- `../doc-updaters/types.js` → DocUpdateContext, DocUpdateResult
- `./docs-config.js` → loadDocsConfig
- `./content-generators.js` → generateAllSections
- `./section-updater.js` → updateDocSections, trimToMaxLines
- `./template-renderer.js` → renderTemplate
- `./plugin-loader.js` → loadUserGeneratorsSync
- `./doc-cache.js` → contentHash, readDocCache, writeDocCache

Döngüsel bağımlılık riski: YOK — tüm sibling ve core importları tek yönlü.

## 4. Dış Bağımlılıklar
- `node:fs` — existsSync, readFileSync, writeFileSync, readdirSync
- `node:path` — join

ADR-010 uyumu: TAMAM.

## 5. Complexity
- 3 fonksiyon (2 export + 1 internal)
- Max cyclomatic: runManagedDocUpdates (~15 branch: entry.enabled, existsSync, hasAutoSections, hasTemplates, cache hit, generated.size, content !== final, etc.)
- runManagedDocUpdates ana loop'u iyi yapılandırılmış: early return pattern ile karmaşıklık yönetiliyor

## 6. Type Safety
- `any` sayısı: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown as Sprint` — satır 161: `{ id: sprintId, number: parseInt(...), tasks: [] } as unknown as Sprint` — Sprint interface'i daha fazla alan gerektiriyor, ama standalone context için sadece id/number/tasks kullanılıyor. **Güvenlik riski düşük ama type-unsafe.**
- Implicit any: `JSON.parse(readFileSync(configPath, 'utf-8'))` (satır 171) — `raw` değişkeni implicit any. `as Record<string, unknown>` olmalı.
- Non-null `!`: 0

## 7. ADR Compliance
- **ADR-006:** UYUMLU — spawnSync yok
- **ADR-008:** UYUMLU — brain import yok
- **ADR-010:** UYUMLU
- **ADR-029 (Managed-Docs Universalization):** UYUMLU — bu modülün kendisi ADR-029'un ana implementasyonu
- **ADR-030 (Template Engine + Plugin Loader):** UYUMLU — renderTemplate ve loadUserGeneratorsSync entegre
- **ADR-031 (Content Hash Cache):** UYUMLU — cache read/write/skip logic implementasyonu burada
- **ADR-032 (i18n):** UYUMLU — language config okunup ctx'e geçiriliyor (satır 167-174)
- **ADR-033:** UYUMLU
- **Memory V2 DB-first:** ⚠️ KISMEN — buildStandaloneDocContext sprint ID'yi `.brain/sprints/*.md` dosyalarından okuyor (satır 152-155). DB'den sprint bilgisi çekmek daha tutarlı olurdu. Ancak bu sadece standalone context için, normal sprint akışında ctx dışarıdan sağlanıyor.

## 8. Test Coverage
- Test dosyası: `tests/orchestra/managed-docs/managed-doc-runner.test.ts` — MEVCUT
- Cache logic, template rendering, section update, standalone context builder test ediliyor olmalı
- Edge case'ler: boş config, disabled entry, file_not_found, cache hit, no generators match

## 9. TODO/FIXME/HACK Inventory
Hiçbiri yok.

## 10. Dead Code
- `emptyMetrics()` — buildStandaloneDocContext tarafından kullanılıyor → aktif
- SprintMetrics import'undaki tüm alanlar emptyMetrics'te doldurulmuş
- Tüm export'lar aktif

## 11. Security
- writeFileSync: filePath `entry.path` + projectRoot join ile oluşturuluyor — path traversal riski: entry.path kullanıcı girişi olabilir (`docs add path`), ama `join(ctx.projectRoot, entry.path)` ile sınırlandırılmış. `../` ile escape riski VAR ama CLI validation katmanında kontrol edilmeli.
- JSON.parse: try/catch içinde
- Plugin loading: loadUserGeneratorsSync sadece JSON dosyaları yüklüyor (sync variant) — güvenli
- Template rendering: user template'leri renderTemplate üzerinden çalışıyor — template injection ile dosya sistemi erişimi mümkün mü? renderTemplate sadece scope üzerinden path resolution yapıyor, fonksiyon çağırabilir (template-renderer.ts satır 128) — **dikkat: scope'taki fonksiyonlar çağrılabilir**

## 12. Memory V2 Uyumu
- **DB-first mi?** Kısmen — runManagedDocUpdates ctx dışarıdan geliyor (DB-first bağlamda doğru), buildStandaloneDocContext file-based sprint ID okuma yapıyor
- **Eski .md parse:** buildStandaloneDocContext'te `readdirSync(sprintsDir)` ile sprint dosyaları okunuyor
- **Öneri:** buildStandaloneDocContext'te MemoryStore kullanılabilir (sprint bilgisi DB'den)
- **Severity:** P3 — sadece standalone context etkileniyor, ana akış DB-first

## 13. i18n
- Language detection: `raw.language === 'tr'` ile config.json'dan dil okunuyor (satır 172)
- Default: 'en'
- ResolvedConfig'e language, auto_docs geçiriliyor — downstream generator'lar i18n kullanabilir
- Sorun: `as ResolvedConfig` cast'ı (satır 179) — sadece language ve auto_docs set ediliyor, diğer alanlar eksik. Runtime'da erişilmezse sorun yok ama type-unsafe.

## 14. Dokümantasyon Tutarlılığı
- JSDoc ↔ davranış: UYUMLU
- "Non-fatal: errors in individual docs don't affect others or the sprint" — try/catch loop ile doğrulanıyor
- "Called from updateProjectDocs() in sprint-reporter.ts after built-in updaters" — gerçek çağrı zinciri doğrulanmalı

## 15. Performance
- Sync I/O: runManagedDocUpdates: entry başına ~3 sync I/O (existsSync, readFileSync, writeFileSync) + cache read/write
- Cache optimization: Cache hit durumunda generation tamamen atlanıyor — iyi optimizasyon
- Plugin loading: loadUserGeneratorsSync her runManagedDocUpdates çağrısında çalışıyor — sık sprint yoksa sorun değil
- buildStandaloneDocContext: readdirSync + sort + readFileSync — düşük maliyet

## 16. Öneriler
| Severity | Öneri |
|----------|-------|
| P2 | `as unknown as Sprint` (satır 161) yerine minimal Sprint interface tanımla veya Pick<Sprint, 'id'|'number'|'tasks'> kullan |
| P2 | `JSON.parse(readFileSync(configPath, 'utf-8'))` (satır 171) — `as Record<string, unknown>` cast ekle |
| P3 | buildStandaloneDocContext'te MemoryStore'dan sprint bilgisi çekmeyi düşün |
| P3 | `as ResolvedConfig` cast'ı (satır 179) — Partial<ResolvedConfig> daha type-safe olur |
| P3 | entry.path path traversal validation'ı ekle (../ içeriyorsa reject) |

## Verdict: ANALYZED
