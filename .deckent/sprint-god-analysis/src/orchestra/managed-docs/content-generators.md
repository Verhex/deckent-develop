# Analysis: src/orchestra/managed-docs/content-generators.ts
**Task ID:** 142-012 | **Model:** opus | **LoC:** 468 | **Effort:** max

## 1. Amacı
En büyük modül. Sprint verileri ve proje durumundan otomatik olarak markdown bölüm içeriği üreten 9 adet built-in generator barındırır: sprint-metrics, active-debt, sprint-history, agent-performance, changelog, test-coverage, module-map, dependencies, project-status. Her generator bir `SectionGenerator` interface'ini implement eder ve pattern-based fuzzy matching ile section başlıklarına eşleşir. Sprint finalize aşamasında DocUpdateContext üzerinden çalışır, i18n desteğiyle TR/EN/DE/ES içerik üretir.

## 2. Public API
- `findGenerator(sectionTitle: string, extraGenerators?: SectionGenerator[]): SectionGenerator | null` — JSDoc VAR, doğru
- `getAllGenerators(): SectionGenerator[]` — JSDoc VAR, "Exposed for tests and plugin loaders"
- `generateAllSections(autoSections: string[], ctx: DocUpdateContext, extraGenerators?: SectionGenerator[]): Map<string, string>` — JSDoc VAR

Eksik: `register()` fonksiyonu internal ama export yok — doğru kapsülleme.

## 3. İç Bağımlılıklar
- `../../core/constants.js` → BRAIN_DIR, DEBT_FILE, SPRINTS_DIR
- `../../core/types.js` → TaskEvaluation enum
- `../../core/agent-pool.js` → AgentPoolManager (project-status generator)
- `../../core/skill-pool.js` → SkillPoolManager (project-status generator)
- `../../core/model-registry.js` → modelRegistry singleton
- `../doc-updaters/types.js` → DocUpdateContext type
- `./types.js` → SectionGenerator type

Döngüsel bağımlılık riski: YOK. Tüm importlar core/ veya sibling modüllerden.

## 4. Dış Bağımlılıklar
- `node:fs` — existsSync, readFileSync, readdirSync
- `node:path` — join

ADR-010 uyumu: TAMAM. Sadece Node built-in kullanıyor.

## 5. Complexity
- 12 fonksiyon (3 export + 1 internal `register` + 1 internal `i18n` + 9 generator.generate lambdas)
- Max cyclomatic complexity: `project-status` generator (~15 branch, satır 378-467) — en karmaşık
- `active-debt` generator (satır 164-188): string split + filter chain, orta karmaşıklık
- `findGenerator` (satır 80-98): nested loop — O(patterns × pool), kabul edilebilir

## 6. Type Safety
- `any` sayısı: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 4 adet — satır 24 (`match[1]!`), 31 (`nextMatch[1]!`), ve line array access
  - content-generators.ts satır 20 (`lines[i]!`) örtük — ama types.ts'de SectionGenerator.id optional, bu `!` gerektirmez
- Unsafe cast: `JSON.parse(readFileSync(pkgPath, 'utf-8')).version` (satır 419) — `as { version?: string }` olmalı, implicit any risk. Ancak try/catch içinde, non-fatal.
- `JSON.parse(readFileSync(pkgPath, 'utf-8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }` (satır 354) — explicit cast, kabul edilebilir.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** UYUMLU — spawnSync kullanımı yok
- **ADR-008 (brain import):** UYUMLU — brain.ts import etmiyor, sadece core/ importları
- **ADR-010 (deps):** UYUMLU — sadece Node built-in
- **ADR-022 (CLI/MCP parity):** N/A — bu modül internal generator
- **ADR-029 (Managed-Docs Universalization):** UYUMLU — bu modülün kendisi ADR-029'un implementasyonu
- **ADR-030 (Template Engine + Plugin Loader):** UYUMLU — template ve plugin desteği sibling modüllerde
- **ADR-031 (Content Hash Cache):** UYUMLU — doc-cache.ts ile entegre (managed-doc-runner.ts üzerinden)
- **ADR-032 (i18n Pattern System):** UYUMLU — TR/EN/DE/ES i18n stringler mevcut
- **ADR-033 (product vision):** UYUMLU — telemetri yok
- **ADR-037 (RBAC):** N/A
- **ADR-039 (self-modifying):** N/A
- **Memory V2 DB-first:** ⚠️ İHLAL — `active-debt` generator (satır 172-188) DEBT.md dosyasını doğrudan readFileSync ile okuyor. Memory V2'de borç DB'de saklanıyor, ama bu generator hala file-based. `sprint-history` generator (satır 200-222) da .brain/sprints/*.md dosyalarını okuyor — bunlar DB'de de var ama file-based erişim devam ediyor.

## 8. Test Coverage
- Test dosyası: `tests/orchestra/managed-docs/content-generators.test.ts` — MEVCUT
- Mock kalitesi: Bilinmiyor (test dosyası okunmadı ama mevcut olması pozitif)
- Edge case: i18n fallback (ctx.config.language undefined → EN), boş evaluations map
- Memory V2 mock: N/A — bu modül Memory V2 kullanmıyor

## 9. TODO/FIXME/HACK Inventory
Hiçbiri yok. Temiz kod.

## 10. Dead Code
- `getAllGenerators()` — dışarıdan kullanılıyor mu? "Exposed for tests and plugin loaders" notu var. Test dosyasında kullanılıyor olabilir. KONTROL GEREKLİ ama muhtemelen aktif.
- i18n `DE` ve `ES` stringleri patternsByLang'da mevcut ama gerçek generate fonksiyonları sadece TR/EN üretiyor — patternsByLang DE/ES pattern eşleşmesi VAR ama çıktı dili sadece config.language'e bağlı (TR veya EN). Bu bir tutarsızlık: DE/ES pattern eşleşirse ama çıktı EN olacak.

## 11. Security
- Input validation: Generator fonksiyonları ctx parametresini doğrulamıyor — null ctx.sprintResult veya ctx.sprintResult.metrics patlayabilir
- Injection: readFileSync ile okunan DEBT.md içeriği doğrudan markdown çıktıya geçiyor — markdown injection riski düşük (internal kullanım)
- Secret exposure: YOK
- OWASP: N/A (no HTTP/SQL)

## 12. Memory V2 Uyumu
- **DB-first mi?** HAYIR — active-debt generator DEBT.md dosyasını readFileSync ile okuyor (satır 174-176)
- **Eski .md parse kaldı mı?** EVET — DEBT.md tablo parse'ı (satır 177-183), .brain/sprints/*.md okuma (satır 215)
- **readFileSync + DECISIONS/MEMORY/DEBT parse var mı?** EVET — DEBT.md parse mevcut
- **Öneri:** active-debt generator'ı MemoryStore'dan okuyacak şekilde refactor edilmeli. Sprint-history generator da DB'den sprint verisi çekebilir.
- **Severity:** P2 — çalışıyor ama Memory V2 felsefesine aykırı

## 13. i18n
- TR/EN i18n dictionary: MEVCUT ve kapsamlı (28 string çifti)
- patternsByLang: 4 dil (en implicit, tr, de, es) — generator eşleşme için
- Eksik: Çıktı dili sadece TR/EN — DE/ES generator eşleşse bile çıktı İngilizce olacak
- turkishNormalize: KULLANILMIYOR — findGenerator case-insensitive `.toLowerCase()` kullanıyor ama Türkçe İ/ı dönüşümü yok. "İstatistikler".toLowerCase() → "i̇statistikler" (not "istatistikler") — Türkçe locale sorunu.
- **Severity:** P2 — Türkçe section başlıkları ile pattern match hatası olabilir

## 14. Dokümantasyon Tutarlılığı
- JSDoc → gerçek davranış: UYUMLU
- `findGenerator` JSDoc "case-insensitive fuzzy match" — gerçekte `includes()` kullanıyor, bu fuzzy değil substring match. JSDoc yanıltıcı olabilir.
- i18n stringler tam ve tutarlı (TR/EN eşleşme sayısı eşit)
- ADR-032 uyumu: patternsByLang yapısı ADR'ye uygun

## 15. Performance
- Sync I/O: ~15 adet readFileSync/readdirSync/existsSync çağrısı — bunlar generate() fonksiyonları içinde
- Hot path: Sprint finalize sırasında her doc güncellemesi için çağrılır — orta sıcaklık
- `module-map` generator: readdirSync nested (src/ → her alt dizin) — büyük projelerde yavaşlayabilir
- `project-status`: 4 adet readdirSync + 2 adet readFileSync + AgentPoolManager/SkillPoolManager instantiation — en ağır generator
- `sprint-history`: Son 10 sprint dosyası için readFileSync loop — kabul edilebilir
- **Öneri:** AgentPoolManager/SkillPoolManager constructor'ları ağır olabilir — cache veya lazy init düşünülebilir

## 16. Öneriler
| Severity | Öneri |
|----------|-------|
| P2 | `active-debt` generator'ı MemoryStore'dan okuyacak şekilde refactor et (Memory V2 uyumu) |
| P2 | `sprint-history` generator'ı DB'den sprint verisi çekecek şekilde güncellenebilir |
| P2 | findGenerator'da turkishNormalize kullan — Türkçe İ/ı locale sorunu gider |
| P3 | `findGenerator` JSDoc'u "fuzzy match" → "substring match" olarak düzelt |
| P3 | DE/ES çıktı desteği ekle veya patternsByLang'dan DE/ES kaldır (tutarsızlık) |
| P3 | project-status generator'da AgentPoolManager/SkillPoolManager cache'le |

## Verdict: ANALYZED
