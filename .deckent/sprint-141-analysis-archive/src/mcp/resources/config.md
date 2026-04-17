# Analysis: src/mcp/resources/config.ts
**Task ID:** 141-004 | **LoC:** 37

## 1. Amaci (1-2 cumle)
`deckent://config` MCP resource handler'ı. `.deckent/config.json` dosyasını okuyarak proje konfigürasyonunu ham JSON formatında döndürür. Araçların ve kullanıcıların mevcut Deckent yapılandırmasını sorgulamasına olanak tanır.

## 2. Public API (export listesi)
- `registerConfigResource(server: McpServer): void` — MCP server'a `deckent://config` resource handler'ını kaydeder; mime-type: `application/json`

## 3. Ic + Dis Bagimliliklar
**İç bağımlılıklar:**
- `core/constants.js` — `PROJECT_CONFIG_PATH` sabiti (`.deckent/config.json` tam yolu)

**Dış bağımlılıklar:**
- `node:fs` — `readFileSync`
- `node:path` — `join` (muhtemelen constants içinde zaten kullanılıyor)
- MCP server instance (parametre olarak alınır)

## 4. Complexity (fonksiyon sayisi, cyclomatic rough)
- Exported fonksiyon: **1** (`registerConfigResource`)
- İç mantık: dosyayı oku → JSON.parse → döndür; dosya yoksa hata fırlat
- Cyclomatic complexity: ~2-3 (try/catch bloğu, dosya yoksa fallback)
- Genel karmaşıklık: çok düşük, modül tek bir sorumluluğa odaklanmış

## 5. Type Safety (any, @ts-ignore, non-null assertion)
- `any` kullanımı: **0**
- `@ts-ignore` / `@ts-expect-error`: **0**
- Non-null assertion (`!`): **0**
- `JSON.parse` dönüş tipi doğası gereği `any`'dir, ancak bunu ek tip annotation olmadan döndürmek mevcut resource API'siyle uyumlu (MCP içerik text olarak serialize edilir)
- try/catch ile JSON.parse hata yönetimi mevcut

## 6. ADR Compliance (ADR-006/008/010/037/039/040)
- **ADR-005 (Synchronous I/O — deprecated):** `readFileSync` kullanımı mevcut. Config dosyası küçük (~2-5 KB) olduğundan performans etkisi minimumdur; ancak async `fs.readFile` alternatifleriyle tutarlılık sağlanabilir.
- **ADR-006 (spawnSync Security Pattern):** İlgili değil.
- **ADR-008 (Brain Merkezi Import):** UYUMLU — brain/orchestra bağımlılığı yok.
- **ADR-010 (Tek Runtime Dependency):** UYUMLU — yalnızca Node.js built-in'ler.
- **ADR-037 (RBAC):** Config resource read-only ve kimlik doğrulama gerektirmiyor; MCP ortamında kabul edilebilir.
- **ADR-039/040:** İlgili değil.

## 7. Test Coverage (src/X → tests/X.test.ts eslesmesi)
Beklenen test dosyası: `tests/mcp/resources/config.test.ts`

Beklenen test senaryoları:
- Geçerli `config.json` mevcutsa içerik JSON olarak döner
- Dosya mevcut değilse hata fırlatır veya boş nesne döner
- Malformed JSON içeren dosya için hata yönetimi
- Dönen içeriğin `application/json` mime-type ile etiketlendiği

## 8. TODO/FIXME/HACK inventory
Kaynak dosyada herhangi bir `TODO`, `FIXME` veya `HACK` yorumu tespit edilmemiştir.

## 9. Dead Code Candidates
Dead code tespit edilmemiştir. 37 LoC'lık minimal modül; tek sorumluluğa odaklanmış.

## 10. Security Findings
Güvenlik değerlendirmesi:
- **Path sabiti:** `PROJECT_CONFIG_PATH` derleme zamanında belirlenir, kullanıcı girdisinden etkilenmez. Path traversal riski yoktur.
- **Veri ifşası:** Config dosyası `brain_provider`, API yapılandırması gibi hassas olmayan veriler içerebilir. Gerçek API anahtarları `.deck` secret dosya sisteminde (ADR-014) tutulmalı, `config.json`'da bulunmamalıdır. Eğer config içeriği MCP üzerinden dışarıya aktarılıyorsa hassas alan filtrelemesi düşünülmelidir.
- **JSON injection:** `JSON.parse` sonucu doğrudan text olarak serialize edilir; kod çalıştırma riski yok.

## 11. Memory V2 Uyumu (DB-first mi, eski .md parse var mi?)
Proje konfigürasyonu (`.deckent/config.json`) Memory V2 DB kapsamı dışındadır; bu kasıtlı bir tasarım kararıdır. Config dosyası Deckent'in kendi yapılandırmasıdır ve brain knowledge'ından (ADR, memory, debt) farklı bir endişe alanına aittir.

Ancak önemli bir kontrol noktası: `config.json` içinde `memory.backend`, `memory.search`, `memory.decay_after_sprints` alanları **Memory V2 konfigürasyonu** için mevcut olmalıdır. Bu resource bu alanları döndürüyorsa, MCP tüketiciler Memory V2 yapılandırmasını sorgulayabilir.

Uyum durumu: **N/A** (config dosyası DB'de tutulmaz, doğru tasarım).

## 12. Oneriler (Sprint 142+ input)
1. **Önemli (P1):** `loadConfig()` fonksiyonunu `core/config.ts`'den kullan — mevcut implementasyon yalnızca ham JSON okur ve 3-katmanlı config birleştirme (defaults → global → project) uygulamaz. `deckent_config` MCP tool'u ve `deckent://config` resource'u farklı değerler döndürüyor olabilir; bu tutarsızlık yanıltıcıdır.
2. **Normal (P2):** Hassas alan filtrelemesi ekle — gelecekte config'e secret-adjacent alanlar eklenirse bunlar MCP resource yanıtından çıkarılmalıdır.
3. **Düşük (P3):** Resource açıklamasına config şemasını (version, alan listesi) dahil et — tüketicilerin hangi alanların mevcut olduğunu anlamasını kolaylaştırır.

## 13. Verdict: ANALYZED
