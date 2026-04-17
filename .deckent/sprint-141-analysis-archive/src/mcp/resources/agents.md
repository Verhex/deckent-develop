# Analysis: src/mcp/resources/agents.ts
**Task ID:** 141-004 | **LoC:** 47

## 1. Amaci (1-2 cumle)
`deckent://agents` MCP resource handler'ı. `.deckent/agents/*/agent.json` dosyalarını okuyarak kayıtlı tüm agent'ların (built-in + temp) manifest verilerini JSON formatında döndürür.

## 2. Public API (export listesi)
- `registerAgentsResource(server: McpServer): void` — MCP server'a `deckent://agents` resource handler'ını kaydeder

## 3. Ic + Dis Bagimliliklar
**İç bağımlılıklar:**
- `core/constants.js` — `DECKENT_DIR` sabiti (`.deckent/` dizin yolu)

**Dış bağımlılıklar:**
- `node:fs` — `readdirSync`, `readFileSync`, `statSync`
- `node:path` — `join`
- MCP server instance (parametre olarak alınır)

**Türetilen sabitler:**
- `AGENTS_DIR = join(DECKENT_DIR, 'agents')` — agent manifest dosyalarının tutulduğu dizin

## 4. Complexity (fonksiyon sayisi, cyclomatic rough)
- Exported fonksiyon: **1** (`registerAgentsResource`)
- İç mantık: dizin listesi al → her alt dizin için `agent.json` varsa oku → JSON.parse → agents dizisine ekle
- Cyclomatic complexity: ~3-4 (dizin listesi dönme, her item için dosya var mı kontrolü, JSON parse hatası yakalamak)
- Genel karmaşıklık: düşük, anlaşılır akış

## 5. Type Safety (any, @ts-ignore, non-null assertion)
- `agents` dizisi `unknown[]` olarak tanımlanmış — JSON.parse çıktısı için doğru ve güvenli seçim
- `any` kullanımı: **0** (unknown tercih edilmiş)
- `@ts-ignore` / `@ts-expect-error`: **0**
- Non-null assertion (`!`): **0**
- JSON.parse hataları try/catch bloğuyla ele alınmaktadır (malformed agent.json dosyaları sessizce atlanır)

## 6. ADR Compliance (ADR-006/008/010/037/039/040)
- **ADR-005 (Synchronous I/O):** Bu ADR deprecated olarak işaretlenmiş olsa da `readdirSync` + `readFileSync` kullanımı mevcuttur. MCP resource handler'larının her istek geldiğinde dosya sistemi taraması yapması I/O darboğazı yaratabilir. İzlenecek bir nokta.
- **ADR-006 (spawnSync Security Pattern):** İlgili değil — sistem komutu çalıştırılmaz.
- **ADR-008 (Brain Merkezi Import):** UYUMLU — brain/orchestra modülü import yok.
- **ADR-010 (Tek Runtime Dependency):** UYUMLU — yalnızca Node.js built-in'ler kullanılır.
- **ADR-037 (RBAC):** MCP resource erişiminde RBAC uygulanmıyor; ancak resource'lar read-only ve sadece agent manifest okur, risk kabul edilebilir.
- **ADR-039/040:** İlgili değil.

## 7. Test Coverage (src/X → tests/X.test.ts eslesmesi)
Beklenen test dosyası: `tests/mcp/resources/agents.test.ts`

Beklenen test senaryoları:
- `.deckent/agents/` dizini boş olduğunda boş dizi döner
- Geçerli `agent.json` içeren agent'lar parse edilerek döndürülür
- Malformed `agent.json` olan dizinler sessizce atlanır (hata fırlatmaz)
- `agent.json` içermeyen alt dizinler yoksayılır

## 8. TODO/FIXME/HACK inventory
Kaynak dosyada herhangi bir `TODO`, `FIXME` veya `HACK` yorumu tespit edilmemiştir.

## 9. Dead Code Candidates
Dead code tespit edilmemiştir. 47 LoC'lık küçük ve odaklı modül; fazladan sembol içermiyor.

## 10. Security Findings
Güvenlik değerlendirmesi:
- **Path traversal riski:** `AGENTS_DIR` sabiti `core/constants.js`'den gelir ve derleme zamanında belirlenir. Kullanıcı girdisiyle oluşturulan bir yol değildir; path traversal riski yoktur.
- **JSON injection:** `JSON.parse` çıktısı `unknown[]` olarak işlenir; doğrudan kod çalıştırma yok.
- **Dosya izinleri:** Yalnızca `.deckent/agents/` dizini okunur, sistem dosyalarına erişim yoktur.
- **Hata ifşası:** JSON.parse hatası catch bloğunda sessizce atlanır; sunucuya hata bilgisi sızdırılmaz (iyi pratik).

## 11. Memory V2 Uyumu (DB-first mi, eski .md parse var mi?)
Agent manifest verileri (`agent.json` dosyaları) Memory V2 DB'de tutulmamaktadır; bu mimari olarak doğru bir tasarım kararıdır. Agent havuzu dosya tabanlı yönetilmekte, `AgentPoolManager` LRU eviction için bu dosyaları kullanmaktadır. Memory V2 yalnızca `entries` tipi (ADR, memory, sprint, debt, pattern, retro) için geçerlidir.

Uyum durumu: **N/A** (agent manifest'ler kasıtlı olarak dosya tabanlıdır).

## 12. Oneriler (Sprint 142+ input)
1. **Normal (P2):** In-process önbellekleme (memoization) ekle — her MCP resource isteğinde tüm `.deckent/agents/` dizinini yeniden tarayan sync I/O, yüksek frekanslı isteklerde performans sorunu yaratabilir. Basit bir `Map<string, unknown>` cache ve dosya mtime karşılaştırması yeterli olabilir.
2. **Normal (P2):** `AgentPoolManager` üzerinden agent verisi okumayı değerlendir — `readdirSync` mantığını doğrudan resource handler içinde tekrar uygulamak yerine mevcut pool manager'ı kullanmak DRY prensibini sağlar.
3. **Düşük (P3):** Her agent'ın `agent.json` şemasını doğrulamak için Zod veya manuel tip guard ekle — şu an `unknown[]` döndürülmekte, downstream tüketiciler kör trust uygular.

## 13. Verdict: ANALYZED
