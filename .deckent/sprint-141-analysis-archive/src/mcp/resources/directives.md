# Analysis: src/mcp/resources/directives.ts
**Task ID:** 141-004 | **LoC:** 27

## 1. Amaci (1-2 cumle)
`deckent://directives` MCP resource handler'ı. `DIRECTIVES.md` dosyasını okuyarak mevcut sprint hedeflerini ve görev tanımlarını markdown formatında döndürür. Sprint planlama araçları ve izleme araçları için sprint direktiflerine erişim noktası görevi görür.

## 2. Public API (export listesi)
- `registerDirectivesResource(server: McpServer): void` — MCP server'a `deckent://directives` resource handler'ını kaydeder; mime-type: `text/markdown`

## 3. Ic + Dis Bagimliliklar
**İç bağımlılıklar:**
- `core/constants.js` — `DIRECTIVES_FILE` sabiti (`DIRECTIVES.md` tam yolu)

**Dış bağımlılıklar:**
- `node:fs` — `readFileSync`
- `node:path` — `join` (constants içinde kullanılıyor)
- MCP server instance (parametre olarak alınır)

**Kayda değer:** Hiçbir orchestra veya brain modülüne bağımlılık yoktur. Modül tamamen dosya sistemi okuma işlemine dayanır.

## 4. Complexity (fonksiyon sayisi, cyclomatic rough)
- Exported fonksiyon: **1** (`registerDirectivesResource`)
- İç mantık: sabiti al → dosyayı oku → string döndür
- Cyclomatic complexity: ~2 (dosya mevcut mu yoksa hata yönetimi)
- Toplam satır: 27 LoC — MCP resource handler'ları arasında en küçüklerden biri
- Genel karmaşıklık: minimal

## 5. Type Safety (any, @ts-ignore, non-null assertion)
- `any` kullanımı: **0**
- `@ts-ignore` / `@ts-expect-error`: **0**
- Non-null assertion (`!`): **0**
- `readFileSync` `string` döndürür (encoding belirtildiğinde) — tip güvenli
- Dönüş tipi açık annotation gerektirmiyor, çıkarım yeterli

## 6. ADR Compliance (ADR-006/008/010/037/039/040)
- **ADR-006 (spawnSync Security Pattern):** İlgili değil.
- **ADR-008 (Brain Merkezi Import):** UYUMLU — brain/orchestra bağımlılığı yok.
- **ADR-010 (Tek Runtime Dependency):** UYUMLU — yalnızca Node.js built-in'ler.
- **ADR-022 (CLI/MCP Feature Parity):** UYUMLU — `deckent directives` CLI komutu ve `deckent://directives` resource tutarlı veri kaynağı kullanmalıdır.
- **ADR-036 (ADR Governance):** `DIRECTIVES.md` dosya tabanlı olduğu doğru; ADR'ler Memory V2 DB'de, DIRECTIVES çalışma dosyası olarak dosya sisteminde tutulur.
- **ADR-039/040:** İlgili değil.

## 7. Test Coverage (src/X → tests/X.test.ts eslesmesi)
Beklenen test dosyası: `tests/mcp/resources/directives.test.ts`

Beklenen test senaryoları:
- `DIRECTIVES.md` mevcut olduğunda içerik string olarak döner
- `DIRECTIVES.md` mevcut olmadığında uygun hata mesajı döner (crash değil)
- Dönen içeriğin `text/markdown` mime-type ile etiketlendiği
- Büyük direktif dosyasının (uzun sprint) tam okunduğu

## 8. TODO/FIXME/HACK inventory
Kaynak dosyada herhangi bir `TODO`, `FIXME` veya `HACK` yorumu tespit edilmemiştir.

## 9. Dead Code Candidates
Dead code tespit edilmemiştir. 27 LoC minimal implementasyon; hiçbir fazlalık içermiyor.

## 10. Security Findings
Güvenlik değerlendirmesi:
- **Path sabiti:** `DIRECTIVES_FILE` `core/constants.js`'den gelir; kullanıcı girdisinden etkilenmez. Path traversal riski yoktur.
- **İçerik güvenliği:** `DIRECTIVES.md` markdown metin içerir; kod çalıştırma riski yoktur. Ancak direktif içeriği proje görevlerini ve stratejik bilgileri barındırdığından MCP ortamı dışına ifşa edilmesi istenmiyor olabilir.
- **Dosya boyutu:** Sprint 140 direktifleri gibi uzun direktif dosyaları (`readFileSync` ile) belleğe tamamen yüklenir. 10MB+ direktif dosyaları teorik bellek baskısı yaratabilir (pratikte bu boyuta ulaşılmaz).

## 11. Memory V2 Uyumu (DB-first mi, eski .md parse var mi?)
`DIRECTIVES.md` Memory V2 SQLite DB kapsamı dışındadır; bu mimari olarak bilinçli bir tasarım kararıdır. Direktifler:
- Sprint'e özgü çalışma belgesidir (ephemeral)
- Git ile takip edilmesi gerekir (CI/auditability için)
- DB'ye alınmasına gerek yoktur

Bu implementasyon Memory V2 mimarisiyle tamamen uyumludur. DIRECTIVES dosya tabanlı kalmalı, Memory V2 yalnızca kalıcı bilgi (ADR, sprint learnings, debt, patterns) için kullanılmalıdır.

Uyum durumu: **N/A** (DIRECTIVES dosya tabanlı olması kasıtlı ve doğru).

## 12. Oneriler (Sprint 142+ input)
1. **Düşük (P3):** `DIRECTIVES.md` bulunamadığında boş string veya `"No active directives"` mesajı döndür — `readFileSync` hata fırlatmak yerine graceful fallback sağlamalı. Bu özellikle `deckent_init` sonrası sprint henüz planlanmamışken önemlidir.
2. **Düşük (P3):** Direktif dosyasının son değişiklik zamanını (`mtime`) response metadata'sına ekle — tüketicilerin direktifin ne zaman güncellendiğini bilmesi yararlıdır.

## 13. Verdict: ANALYZED
