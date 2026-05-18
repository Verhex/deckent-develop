# Analysis: src/mcp/resources/tasks.ts
**Task ID:** 141-004 | **LoC:** 42

## 1. Amaci (1-2 cumle)
`deckent://tasks` MCP resource handler'ı. `.tasks/` dizinindeki tüm görev JSON dosyalarını okuyarak aktif sprint görev listesini ve durumlarını JSON formatında döndürür. Sprint izleme araçları için görev durumu sorgulama noktası görevi görür.

## 2. Public API (export listesi)
- `registerTasksResource(server: McpServer): void` — MCP server'a `deckent://tasks` resource handler'ını kaydeder; mime-type: `application/json`

## 3. Ic + Dis Bagimliliklar
**İç bağımlılıklar:**
- `core/constants.js` — `TASKS_DIR` sabiti (`.tasks/` dizin yolu)

**Dış bağımlılıklar:**
- `node:fs` — `readdirSync`, `readFileSync`
- `node:path` — `join`
- MCP server instance (parametre olarak alınır)

## 4. Complexity (fonksiyon sayisi, cyclomatic rough)
- Exported fonksiyon: **1** (`registerTasksResource`)
- İç mantık: TASKS_DIR listesi al → `.json` ile biten dosyaları filtrele → her dosya için readFileSync + JSON.parse → tasks dizisine ekle
- Cyclomatic complexity: ~3-4 (dizin yoksa fallback, filtre koşulu, her dosya için parse)
- Hata yönetimi: Malformed JSON için try/catch ile sessiz atlama
- `.result`, `.hb`, `.plan` gibi task-adjacent dosyalar filtre ile dışarıda bırakılır (yalnızca `.json` dosyaları)
- Genel karmaşıklık: düşük

## 5. Type Safety (any, @ts-ignore, non-null assertion)
- `tasks` dizisi `unknown[]` olarak tanımlanmış — `JSON.parse` çıktısı için doğru ve güvenli tip seçimi
- Downstream tüketiciler `unknown[]` alır ve kendi tip dönüşümlerini yapmak zorundadır
- `any` kullanımı: **0** (`unknown` tercih edilmiş — doğru)
- `@ts-ignore` / `@ts-expect-error`: **0**
- Non-null assertion (`!`): **0**

## 6. ADR Compliance (ADR-006/008/010/037/039/040)
- **ADR-005 (Synchronous I/O — deprecated):** `readdirSync` + `readFileSync` kullanımı mevcut. Her MCP resource isteğinde tüm `.tasks/` dizini taranır. Sprint başında 50+ task dosyası olabilir; bu sync I/O darbesi kabul edilebilir ama izlenmesi gereken bir nokta.
- **ADR-006 (spawnSync Security Pattern):** İlgili değil.
- **ADR-008 (Brain Merkezi Import):** UYUMLU — brain/orchestra bağımlılığı yok.
- **ADR-010 (Tek Runtime Dependency):** UYUMLU — yalnızca Node.js built-in'ler.
- **ADR-037 (RBAC):** Task resource read-only; ancak task içerikleri worker prompt'larını ve görev açıklamalarını barındırabilir. Erişim kontrolü uygulanmıyor.
- **ADR-039/040:** İlgili değil — task dosyaları DB'de değil (doğru tasarım).

## 7. Test Coverage (src/X → tests/X.test.ts eslesmesi)
Beklenen test dosyası: `tests/mcp/resources/tasks.test.ts`

Beklenen test senaryoları:
- `.tasks/` dizini boş olduğunda boş dizi döner
- Geçerli `task-001.json` dosyası parse edilerek diziye eklenir
- Malformed JSON içeren dosya sessizce atlanır (crash yok)
- `.result`, `.hb`, `.plan` gibi non-JSON dosyaları filtrelenir
- Birden fazla task dosyası doğru sayıda döner

## 8. TODO/FIXME/HACK inventory
Kaynak dosyada herhangi bir `TODO`, `FIXME` veya `HACK` yorumu tespit edilmemiştir.

## 9. Dead Code Candidates
Dead code tespit edilmemiştir. 42 LoC odaklı implementasyon.

Potansiyel eksiklik (dead feature): Görev durum filtresi yok. Arşivlenmiş, tamamlanmış (DONE) ve aktif (PENDING/CLAIMING/EXECUTING) görevlerin tümü aynı yanıtta döner. Sprint 139 sonrası 50+ task dosyası arşivlenmişse bu dosyalar `.tasks/` altında kalmıyordur (`deckent_cleanup` arşivler); ancak cleanup öncesi dönemde yanıt boyutu büyük olabilir.

## 10. Security Findings
Güvenlik değerlendirmesi:
- **Path traversal:** `TASKS_DIR` sabiti `core/constants.js`'den alınır; kullanıcı girdisine bağlı değil. Risk: **sıfır**.
- **JSON injection:** `JSON.parse` çıktısı `unknown[]` olarak tutulur; kod çalıştırma riski yok.
- **Veri ifşası:** Task dosyaları worker prompt içeriklerini, dosya yollarını ve proje yapısını içerebilir. MCP güven sınırı içinde kalındığı varsayılır.
- **Boyut sınırı:** Çok fazla task dosyası (sprint sonu temizlik yapılmamış durumda) yüzlerce görev döndürebilir; yanıt boyutu sınırlaması yok.

## 11. Memory V2 Uyumu (DB-first mi, eski .md parse var mi?)
Task dosyaları (`.tasks/*.json`) Memory V2 SQLite DB kapsamı dışındadır; bu mimari olarak bilinçli bir tasarım kararıdır. Task JSON'ları:
- File-locking sistemini (`.locks/`) kullanır
- Heartbeat dosyalarıyla (`.hb`) eşleşir
- Worker'lar tarafından doğrudan dosya I/O ile yönetilir
- Sprint sonunda arşivlenir (`.deckent/archive/sprint-NNN/`)

Bu tasarım ADR-016 (file-based task lifecycle) ile uyumlu; Memory V2 DB yalnızca kalıcı bilgi (ADR, memory, debt, patterns) için kullanılır.

Uyum durumu: **N/A** (task dosyaları DB'de tutulmaz, kasıtlı ve doğru tasarım).

## 12. Oneriler (Sprint 142+ input)
1. **Normal (P2):** Varsayılan olarak yalnızca **aktif** görevleri döndür (PENDING, CLAIMED, EXECUTING, TESTING durumları); tamamlanmış ve NO_GO görevler `?includeAll=true` parametresiyle isteğe bağlı eklensin. Bu değişiklik yanıt boyutunu önemli ölçüde azaltır ve tüketicilerin ilgili görevi bulmasını kolaylaştırır.
2. **Normal (P2):** Task şemasını doğrula — `unknown[]` yerine `TaskJson[]` gibi tip guard eklenerek geçersiz task dosyaları filtrelenebilir ve tüketicilere tutarlı yapı sunulabilir.
3. **Düşük (P3):** In-process önbellekleme ekle — her MCP isteğinde tüm `.tasks/` dizinini yeniden taramak yerine dosya mtime kontrolüyle invalidation yapılabilir.
4. **Düşük (P3):** `.result` dosyalarını eşleştirerek task'lara `evaluationDecision` bilgisi ekle — tüketiciler DONE görevlerin GO/NO_GO kararına kolayca erişebilir.

## 13. Verdict: ANALYZED
