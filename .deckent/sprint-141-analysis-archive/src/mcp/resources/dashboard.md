# Analysis: src/mcp/resources/dashboard.ts
**Task ID:** 141-004 | **LoC:** 33

## 1. Amaci (1-2 cumle)
`deckent://dashboard` MCP resource handler'ı. Aktif sprint durumunu (worker'lar, fazlar, alertler, metrikler) `readDashboardSafe()` üzerinden okuyarak JSON formatında döndürür. Sprint takibi için gerçek zamanlı durum verisi sağlar.

## 2. Public API (export listesi)
- `registerDashboardResource(server: McpServer): void` — MCP server'a `deckent://dashboard` resource handler'ını kaydeder; mime-type: `application/json`

## 3. Ic + Dis Bagimliliklar
**İç bağımlılıklar:**
- `monitor/dashboard-manager.js` — `readDashboardSafe()` fonksiyonu (bozuk JSON'ı otomatik onaran güvenli okuma)
- `core/utils.js` — `debugLog()` (optional debug logging)

**Dış bağımlılıklar:**
- MCP server instance (parametre olarak alınır)
- `node:fs`, `node:path` — muhtemelen dolaylı (`dashboard-manager` içinde)

**ADR-008 perspektifi:** `monitor/dashboard-manager` bir `orchestra/` modülü değildir; izleme katmanından okuma ADR-008'i ihlal etmez.

## 4. Complexity (fonksiyon sayisi, cyclomatic rough)
- Exported fonksiyon: **1** (`registerDashboardResource`)
- İç mantık: `readDashboardSafe()` çağrısı → state'i spread et → content olarak döndür
- Cyclomatic complexity: ~2 (başarılı okuma + null/undefined state fallback)
- Genel karmaşıklık: çok düşük. En basit resource handler'lardan biri.

## 5. Type Safety (any, @ts-ignore, non-null assertion)
- `readDashboardSafe()` dönüş tipi dashboard manager modülünde tanımlıdır
- Spread operatörü `{ ...state }` ile kullanım tip-güvenlidir
- `any` kullanımı: **0**
- `@ts-ignore` / `@ts-expect-error`: **0**
- Non-null assertion (`!`): **0**
- `readDashboardSafe` null veya undefined döndürdüğünde spread operatörü runtime hatası verebilir; ancak "safe" ismi bu durumu ele aldığını ima eder

## 6. ADR Compliance (ADR-006/008/010/037/039/040)
- **ADR-006 (spawnSync Security Pattern):** İlgili değil.
- **ADR-008 (Brain Merkezi Import):** UYUMLU — `monitor/` modülünden import, `orchestra/brain` zincirinden import yok.
- **ADR-010 (Tek Runtime Dependency):** UYUMLU — ek npm bağımlılığı yok.
- **ADR-025 (Graceful Shutdown):** Dashboard resource, sprint fazını yansıtır; graceful shutdown sırasında dashboard state güncel tutulmalıdır.
- **ADR-037 (RBAC):** Dashboard resource okuma için erişim kontrolü uygulanmıyor; sprint çalışırken hassas görev detayları içerebilir. Read-only kabul edilebilir.
- **ADR-039/040:** İlgili değil.

## 7. Test Coverage (src/X → tests/X.test.ts eslesmesi)
Beklenen test dosyası: `tests/mcp/resources/dashboard.test.ts`

Beklenen test senaryoları:
- Sprint aktifken gerçek dashboard verisi döner
- Sprint yokken boş/default state döner
- `readDashboardSafe` bozuk JSON döndürdüğünde resource çökmez (safe okuma doğrulaması)
- Dönen içeriğin geçerli JSON olduğu (JSON.parse yapılabilir)

## 8. TODO/FIXME/HACK inventory
Kaynak dosyada herhangi bir `TODO`, `FIXME` veya `HACK` yorumu tespit edilmemiştir.

## 9. Dead Code Candidates
Dead code tespit edilmemiştir. 33 LoC'lık minimal modül; yalnızca bir görev üstlenir.

## 10. Security Findings
Güvenlik değerlendirmesi:
- **Veri ifşası:** Dashboard state aktif worker detaylarını, task açıklamalarını ve içerik hash'lerini içerebilir. Bu veriler hassas proje bilgisi sayılabilir; MCP ortamının güven sınırı dışına sızdırılması istenmiyor olabilir.
- **readDashboardSafe koruma:** Fonksiyon bozuk JSON'ı otomatik onararak crash'leri önler; bu güvenlik açısından olumlu bir özellik. Dışarıdan tetiklenen bir JSON corruption (DoS girişimi) resource'u çevrimdışı bırakamaz.
- **Path kontrolü:** Dashboard dosya yolu `dashboard-manager` içinde sabit; kullanıcı kontrolünde değil.

## 11. Memory V2 Uyumu (DB-first mi, eski .md parse var mi?)
Dashboard state dosya tabanlı bir monitör verisidir (`.dashboard` JSON dosyası). Memory V2 SQLite DB kapsamı dışındadır; sprint anlık izleme verisi DB'de tutulmaz, bu mimari olarak doğrudur. Dashboard state geçici (ephemeral) nitelikte olup sprint sona erince sıfırlanır.

Uyum durumu: **N/A** (dashboard verisi DB'de tutulmaz, doğru tasarım).

## 12. Oneriler (Sprint 142+ input)
1. **Normal (P2):** `readDashboardSafe` null döndürdüğünde spread öncesi null-guard ekle — `const state = readDashboardSafe() ?? {}` şeklinde defensive coding resource'u daha sağlam yapar.
2. **Düşük (P3):** Dashboard verisinden hassas alanları (örn. task description içeriği, worker ortam değişkenleri) filtrele — "need to know" prensibi MCP tüketicileri için daha az bilgi ifşa eder.
3. **Düşük (P3):** Resource açıklamasına dashboard şemasını (alan listesi + veri tipleri) ekle — tüketicilerin beklenen yapıyı anlamasını kolaylaştırır.

## 13. Verdict: ANALYZED
