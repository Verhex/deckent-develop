# Analysis: src/orchestra/managed-docs/plugin-loader.ts
**Task ID:** 142-012 | **Model:** opus | **LoC:** 113 | **Effort:** max

## 1. Amacı
`.deckent/generators/` dizininden kullanıcı tanımlı section generator'ları yükler. İki format desteklenir: (1) Declarative JSON — güvenli, kod çalıştırmaz, template string ile section üretir; (2) Executable MJS — dynamic import ile Node process'inde çalışır, güvenilir kaynaklardan yüklenmeli. ADR-030 (Template Engine + Plugin Loader) implementasyonunun loader tarafı. managed-doc-runner.ts tarafından kullanılır.

## 2. Public API
- `loadUserGeneratorsSync(projectRoot: string): SectionGenerator[]` — JSDoc VAR, sync-only JSON loading
- `loadUserGeneratorsAsync(projectRoot: string): Promise<SectionGenerator[]>` — JSDoc VAR, JSON + MJS loading

İç fonksiyon:
- `specToGenerator(spec: JsonGeneratorSpec, sourceFile: string): SectionGenerator | null` — export edilmiyor

Interface:
- `JsonGeneratorSpec` — internal, 4 alan (id?, patterns?, patternsByLang?, template?)

## 3. İç Bağımlılıklar
- `../../core/utils.js` → debugLog
- `../doc-updaters/types.js` → DocUpdateContext
- `./types.js` → SectionGenerator
- `./template-renderer.js` → renderTemplate

Döngüsel bağımlılık riski: YOK.

## 4. Dış Bağımlılıklar
- `node:fs` — existsSync, readdirSync, readFileSync, statSync
- `node:path` — join

ADR-010 uyumu: TAMAM.

## 5. Complexity
- 3 fonksiyon (2 export + 1 internal)
- Max cyclomatic: loadUserGeneratorsSync (~6 branch: existsSync, try/catch, file loop, isFile, endsWith, specToGenerator null)
- loadUserGeneratorsAsync: sync sonuçlarını genişletir, .mjs dynamic import — orta karmaşıklık
- specToGenerator: Basit validation + generator factory

## 6. Type Safety
- `any` sayısı: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Unsafe cast: `JSON.parse(readFileSync(fullPath, 'utf-8')) as JsonGeneratorSpec` (satır 54) — JsonGeneratorSpec tüm alanları optional, parse sonrası doğrulama specToGenerator'da yapılıyor (patterns array?, template string?). Kabul edilebilir.
- `mod.default` (satır 84-85): dynamic import sonucu `as { default?: SectionGenerator }` — mod.default validation'ı mevcut (typeof object, Array.isArray patterns). Kabul edilebilir.
- Non-null `!`: 0

## 7. ADR Compliance
- **ADR-006:** UYUMLU — spawnSync yok
- **ADR-008:** UYUMLU
- **ADR-010:** UYUMLU
- **ADR-029:** UYUMLU — plugin loader managed-docs alt sisteminin parçası
- **ADR-030 (Template Engine + Plugin Loader):** UYUMLU — bu modülün kendisi ADR-030'un plugin loader implementasyonu
- **ADR-031:** N/A
- **ADR-032 (i18n):** UYUMLU — JSON spec'lerde patternsByLang desteği var
- **ADR-033:** UYUMLU
- **Memory V2:** N/A

## 8. Test Coverage
- Test dosyası: tests/orchestra/managed-docs/ altında ayrı plugin-loader.test.ts YOK
- managed-doc-runner.test.ts veya universalization.test.ts içinde dolaylı test olabilir
- **Coverage gap:** loadUserGeneratorsSync JSON parsing, specToGenerator validation, loadUserGeneratorsAsync MJS loading — dedicated test YOK
- **Severity:** P2 — plugin mekanizması test edilmeli, özellikle malformed JSON edge case'leri

## 9. TODO/FIXME/HACK Inventory
Hiçbiri yok.

## 10. Dead Code
- `loadUserGeneratorsAsync` — JSDoc "Not currently wired into the sprint pipeline — reserved for CLI `docs run --with-plugins`" — şu an kullanılmıyor olabilir. CLI docs komutu kontrol edilmeli.
- Potansiyel dead code ama reserv kapsamında tutulmuş.

## 11. Security
- **⚠️ CRITICAL: MJS Plugin Execution** — `loadUserGeneratorsAsync` (satır 84) `await import(fullPath)` ile kullanıcı dizinindeki .mjs dosyalarını Node process'inde çalıştırıyor. Bu arbitrary code execution. Modül başı yorum "only load from trusted sources" uyarısı var ama runtime enforcement YOK.
  - Risk: `.deckent/generators/` altına kötü amaçlı .mjs yerleştirilirse tüm process erişimi elde edilir
  - Mitigation önerisi: sandbox (vm module), file permission check, veya sadece JSON desteği (MJS kaldır)
  - **Severity: P1** — güvenlik açığı. Ancak loadUserGeneratorsAsync şu an wired-in değil, bu riski azaltıyor.
- JSON loading: Güvenli — sadece data parse, kod çalıştırmıyor. Template rendering dolaylı olarak renderTemplate'e geçiyor ama fonksiyon çağırma scope'ta sınırlı.
- Directory traversal: GENERATORS_DIR sabit `.deckent/generators` — path join ile sınırlı

## 12. Memory V2 Uyumu
- N/A — plugin loader memory ile ilgili değil

## 13. i18n
- JsonGeneratorSpec.patternsByLang: i18n pattern desteği VAR
- specToGenerator patternsByLang'ı SectionGenerator'a geçiriyor → findGenerator i18n eşleşme yapabilir
- turkishNormalize: YOK — findGenerator seviyesinde eksik (content-generators.ts analizi ile aynı sorun)

## 14. Dokümantasyon Tutarlılığı
- Modül başı yorum kapsamlı: 2 format açıklaması, güvenlik uyarısı — iyi
- JSDoc ↔ davranış: UYUMLU
- "Synchronous JSON loading only. For MJS plugin support, use loadUserGeneratorsAsync." — doğru

## 15. Performance
- Sync I/O: loadUserGeneratorsSync — readdirSync + statSync + readFileSync per JSON file
- loadUserGeneratorsAsync: Ek olarak dynamic import per MJS file — I/O + module parse
- Her runManagedDocUpdates çağrısında loadUserGeneratorsSync çalışıyor — generators cache'lenmiyor
- **Öneri:** Sık sprint çalıştırılıyorsa generator'ları cache'lemek mantıklı olabilir

## 16. Öneriler
| Severity | Öneri |
|----------|-------|
| P1 | loadUserGeneratorsAsync MJS execution güvenlik riski — sandbox veya kaldır. Şu an unwired ama gelecekte wire edilirse tehlikeli |
| P2 | Dedicated plugin-loader.test.ts ekle — JSON parsing, malformed spec, empty dir, MJS loading |
| P3 | Generator sonuçlarını cache'le (loadUserGeneratorsSync) — sprint başına 1 kez yeterli |
| P3 | loadUserGeneratorsAsync wired-in olup olmadığını docs/CLI'da netleştir |

## Verdict: ANALYZED
