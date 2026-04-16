# Analysis: src/orchestra/managed-docs/template-renderer.ts
**Task ID:** 142-012 | **Model:** opus | **LoC:** 135 | **Effort:** max

## 1. Amacı
`{{path.to.value}}` placeholder'larını DocUpdateContext scope'undan resolve ederek user-defined template string'leri render eder. Built-in generator yazmak yerine basit template'ler ile section içeriği üretmek isteyenler için hafif bir alternatif. ADR-030 (Template Engine + Plugin Loader) implementasyonunun template engine tarafı. Scope builder sprint verileri, proje istatistikleri (agent/skill/provider sayısı), package.json bilgileri ve task count'ları sağlar.

## 2. Public API
- `buildTemplateScope(ctx: DocUpdateContext): Record<string, unknown>` — JSDoc VAR
- `resolvePath(scope: unknown, path: string): unknown` — JSDoc VAR, dotted path resolution
- `renderTemplate(template: string, ctx: DocUpdateContext): string` — JSDoc VAR

Tüm fonksiyonlar export ve JSDoc'lu.

## 3. İç Bağımlılıklar
- `../../core/constants.js` → BRAIN_DIR, SPRINTS_DIR
- `../../core/types.js` → TaskEvaluation
- `../../core/agent-pool.js` → AgentPoolManager
- `../../core/skill-pool.js` → SkillPoolManager
- `../../core/model-registry.js` → modelRegistry
- `../doc-updaters/types.js` → DocUpdateContext

Döngüsel bağımlılık riski: YOK.

İlginç paralel: content-generators.ts ile neredeyse aynı importları paylaşıyor (AgentPoolManager, SkillPoolManager, modelRegistry). DRY ihlali potansiyeli — scope builder ve project-status generator benzer veri topluyor.

## 4. Dış Bağımlılıklar
- `node:fs` — existsSync, readdirSync, readFileSync
- `node:path` — join

ADR-010 uyumu: TAMAM.

## 5. Complexity
- 3 fonksiyon
- Max cyclomatic: buildTemplateScope (~12 branch: 5 try/catch bloku, existsSync kontrolleri, filter'lar)
- resolvePath: ~5 branch (null/undefined, Map, object, else) — düşük karmaşıklık
- renderTemplate: regex replace callback — basit

## 6. Type Safety
- `any` sayısı: 0 (doğrudan) — ancak "any segment misses" JSDoc'ta var (documentation, kod değil)
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 0
- Unsafe cast:
  - `(current as Record<string, unknown>)[seg]` (satır 103) — typeof object check sonrası, kabul edilebilir
  - `JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>` (satır 79) — explicit cast, kabul edilebilir
  - `(value as () => unknown)()` (satır 128) — typeof function check sonrası, güvenli
- resolvePath return type `unknown` — doğru, tip güvenli

## 7. ADR Compliance
- **ADR-006:** UYUMLU
- **ADR-008:** UYUMLU
- **ADR-010:** UYUMLU
- **ADR-029:** UYUMLU
- **ADR-030 (Template Engine + Plugin Loader):** UYUMLU — bu modülün kendisi ADR-030'un template engine implementasyonu
- **ADR-031:** N/A
- **ADR-032 (i18n):** Scope'ta `language` alanı var (satır 29) — template'ler `{{language}}` ile dil bilgisine erişebilir
- **ADR-033:** UYUMLU
- **Memory V2 DB-first:** ⚠️ KISMEN — buildTemplateScope sprint verilerini `.brain/sprints/*.md` dosyalarından okuyor (satır 67-72). content-generators.ts ile aynı sorun.

## 8. Test Coverage
- Test dosyası: tests/orchestra/managed-docs/ altında ayrı template-renderer.test.ts YOK
- managed-doc-runner.test.ts veya universalization.test.ts içinde dolaylı test olabilir
- **Coverage gap:** buildTemplateScope, resolvePath, renderTemplate için dedicated test YOK
- **Severity:** P2 — template engine core logic test edilmeli, özellikle:
  - resolvePath edge case'ler: boş path, nested Map, null intermediate, function value
  - renderTemplate: unresolved placeholder → empty string, nested objects → JSON.stringify

## 9. TODO/FIXME/HACK Inventory
Hiçbiri yok.

## 10. Dead Code
- buildTemplateScope içinde scope alanlarının tümü template'ler tarafından kullanılıyor mu? Bilinmiyor — kullanıcı template'lerine bağlı
- `latestSprintId`, `totalSprints`, `projectName` gibi scope alanları documentation'da listelenmeli ki kullanıcılar bilebilsin

## 11. Security
- **Template Injection:** renderTemplate sadece `{{...}}` placeholder'ları resolve ediyor — template string kullanıcı tanımlı (docs.json templates). Kullanıcı kendi template'ini yazıyor, XSS riski yok (markdown çıktı).
- **Fonksiyon çağırma:** satır 128 `(value as () => unknown)()` — scope'taki fonksiyonlar çağrılabilir. Şu an scope'ta doğrudan fonksiyon yok ama gelecekte eklenirse risk oluşabilir. Scope builder fonksiyon eklememeli.
- **File system read:** buildTemplateScope readFileSync ile package.json ve sprint dosyaları okuyor — scope üzerinden bu veriler template'lere sızıyor. package.json sensitive bilgi içerebilir (private registry URL'leri, scripts).
- **Severity:** P3 — mevcut durumda düşük risk, fonksiyon çağırma mekanizması potansiyel risk

## 12. Memory V2 Uyumu
- sprint/sprints/ dosya okuma: satır 67-72 — file-based
- Diğer veriler ctx'den geliyor (DB-first bağlamda sorun yok)
- **Severity:** P3

## 13. i18n
- Scope'ta `language` field'ı mevcut — template'ler `{{language}}` ile erişebilir
- Template'ler kendileri i18n aware olabilir: `{{#if language === 'tr'}}...{{/if}}` — ANCAK bu syntax desteklenmiyor, sadece basit path resolution var
- Conditional rendering desteği yok — kullanıcı farklı diller için farklı template yazmalı
- turkishNormalize: N/A — template engine dil-agnostik

## 14. Dokümantasyon Tutarlılığı
- JSDoc ↔ davranış: UYUMLU
- renderTemplate JSDoc "Unresolved placeholders become empty string (non-fatal)" — doğru (satır 125 `return ''`)
- "Functions are called with no args and result is rendered" — doğru (satır 128)
- buildTemplateScope scope alanlarının dokümantasyonu: JSDoc'ta alan listesi yok. Kullanıcıların hangi `{{...}}` path'lerini kullanabileceği dokümante edilmeli.
- **Severity:** P2 — scope alanları kullanıcı-facing API, dokümantasyon eksik

## 15. Performance
- Sync I/O: buildTemplateScope ~5 sync I/O çağrısı
- AgentPoolManager/SkillPoolManager instantiation: content-generators.ts ile aynı (project-status generator) — her iki modülde de ayrı ayrı instantiate ediliyor = gereksiz tekrar
- renderTemplate regex: O(template length) — basit, hızlı
- resolvePath: O(path segments) — ihmal edilebilir

## 16. Öneriler
| Severity | Öneri |
|----------|-------|
| P2 | Dedicated template-renderer.test.ts ekle — resolvePath edge case'ler, renderTemplate placeholder resolution, buildTemplateScope alanları |
| P2 | buildTemplateScope scope alanlarını dokümante et — kullanıcılar için REFERENCE.md veya JSDoc |
| P2 | content-generators.ts project-status generator ile scope builder arasındaki DRY ihlalini azalt — ortak helper |
| P3 | Scope builder'dan fonksiyon çağırma mekanizmasını kaldır veya kısıtla (güvenlik) |
| P3 | Conditional template syntax desteği düşün (i18n için) |

## Verdict: ANALYZED
