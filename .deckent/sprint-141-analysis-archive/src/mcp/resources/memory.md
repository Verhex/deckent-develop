# Analysis: src/mcp/resources/memory.ts
**Task ID:** 141-004 | **LoC:** 37

## 1. Amaci (1-2 cumle)
`deckent://memory` MCP resource handler'ı. Sprint öğrenimleri ve proje hafızasını SQLite Memory V2 DB üzerinden (`MemoryStore.getByType('memory')`) okuyarak markdown formatında döndürür. V1 `.md` dosyası parse yöntemi tamamen kaldırılmış; "DB-first (only path)" yorum satırı bu değişikliği belgeler.

## 2. Public API (export listesi)
- `registerMemoryResource(server: McpServer): void` — MCP server'a `deckent://memory` resource handler'ını kaydeder; mime-type: `text/markdown`

## 3. Ic + Dis Bagimliliklar
**İç bağımlılıklar:**
- `core/constants.js` — `BRAIN_DIR`, `MEMORY_DB_FILE` sabitleri
- `core/memory-store.js` — `MemoryStore` sınıfı (SQLite DB erişimi)

**Dış bağımlılıklar:**
- `node:path` — `join` ile DB yolu oluşturma
- `better-sqlite3` — `MemoryStore` içinde (dolaylı bağımlılık)
- MCP server instance (parametre olarak alınır)

**Kayda değer:** `node:fs` import yoktur; dosya sistemi erişimi yalnızca DB yolu oluşturma için gerekli, doğrudan `.md` dosyası okuma yok.

## 4. Complexity (fonksiyon sayisi, cyclomatic rough)
- Exported fonksiyon: **1** (`registerMemoryResource`)
- İç mantık: MemoryStore aç → getByType('memory') → her entry için content'i formatla → string birleştir → kapat
- Cyclomatic complexity: ~3 (entries dönme döngüsü, boş entries kontrolü, try/finally)
- `try/finally` pattern ile store.close() garantisi: doğru kaynak yönetimi
- Genel karmaşıklık: düşük

## 5. Type Safety (any, @ts-ignore, non-null assertion)
- `any` kullanımı: **0**
- `@ts-ignore` / `@ts-expect-error`: **0**
- Non-null assertion (`!`): **0**
- `MemoryStore.getByType('memory')` dönüş tipi `MemoryEntryV2[]` — tam tip güvenli
- Entry içerik erişimi `e.content`, `e.title`, `e.sprint_id` alanları `MemoryEntryV2` interface'inden gelir

## 6. ADR Compliance (ADR-006/008/010/037/039/040)
- **ADR-006 (spawnSync Security Pattern):** İlgili değil.
- **ADR-008 (Brain Merkezi Import):** UYUMLU — yalnızca `core/` modülleri import edilir.
- **ADR-010 (Tek Runtime Dependency):** `better-sqlite3` MemoryStore üzerinden encapsulate edilmiş; kabul edilebilir.
- **ADR-037 (RBAC):** Memory resource read-only; erişim kontrolü uygulanmıyor. MCP ortamında kabul edilebilir.
- **ADR-040 (Memory V2 DB-first):** TAMAMEN UYUMLU — Kaynak kodda yorum: `// DB-first (only path)`. V1 `.md` parse yok. `MemoryStore.getByType('memory')` tek veri yolu.

## 7. Test Coverage (src/X → tests/X.test.ts eslesmesi)
Beklenen test dosyası: `tests/mcp/resources/memory.test.ts`

Beklenen test senaryoları:
- DB'de memory entries varken markdown formatında döner
- Boş DB'de `""` veya varsayılan mesaj döner
- `try/finally` branch'i: store.close() her zaman çağrılır
- catch bloğu: DB hatası (bozuk DB) durumunda fallback mesajı döner
- Dönen içeriğin `text/markdown` mime-type ile etiketlendiği

## 8. TODO/FIXME/HACK inventory
Kaynak dosyada herhangi bir `TODO`, `FIXME` veya `HACK` yorumu tespit edilmemiştir.
`// DB-first (only path)` yorum satırı V1→V2 geçişini belgeleyen açıklayıcı bir not; TODO değil.

## 9. Dead Code Candidates
Teknik olarak dead code değil, ancak dikkat çeken bir nokta:
- **Sessiz catch bloğu:** `catch {}` (boş catch) DB hatalarını hiçbir şey loglamadan yutar. Bu kasıtlı bir graceful degradation tasarımı gibi görünse de gerçek DB sorunlarını gizler. "Dead code" değil ama anti-pattern.

## 10. Security Findings
Güvenlik değerlendirmesi:
- **SQL injection:** `getByType('memory')` sabit string parametresi; kullanıcı girdisi SQL'e karışmaz.
- **Resource leak:** `try/finally` ile `store.close()` garantisi — doğru implementasyon.
- **Veri ifşası:** Sprint learnings içeriği proje yapısı ve kararları hakkında bilgi barındırır. MCP ortamı dışına aktarılması istenmiyor olabilir; ancak read-only olduğundan etki sınırlı.
- **Boş catch bloğu:** DB hatası durumunda `store.close()` atlanabilir (catch finally sırasına bağlı olarak); `try/finally` yapısı bu riski azaltır ama boş catch yerine catch-and-close daha açık olabilir.

## 11. Memory V2 Uyumu (DB-first mi, eski .md parse var mi?)
**TAMAMEN UYUMLU.** Bu modül Memory V2 DB-first mimarisinin referans implementasyonlarından biridir:
- `MemoryStore.getByType('memory')` — SQLite FTS5 DB üzerinden okuma
- `// DB-first (only path)` — kasıtlı yorum, V1 fallback'in kaldırıldığını belgeler
- `MEMORY_DB_FILE` sabitinden DB yolu — doğru yaklaşım
- `try/finally` store.close() — kaynak yönetimi doğru

V1 dönemindeki `.brain/MEMORY.md` dosyasından `readFileSync` + markdown parse yöntemi yoktur.

## 12. Oneriler (Sprint 142+ input)
1. **Normal (P2):** Boş catch bloğunu (`catch {}`) düzelt — DB hataları en azından `debugLog` veya `console.error` ile loglanmalı:
   ```typescript
   } catch (err) {
     debugLog('memory-resource: DB read error', err);
   }
   ```
   Bu değişiklik production ortamında debug edilebilirliği önemli ölçüde artırır.
2. **Düşük (P3):** Entry formatını zenginleştir — `sprint_id` bilgisini yanıt metnine dahil et: `## Sprint ${e.sprint_id}: ${e.title}` gibi bir başlık yapısı daha okunabilir markdown üretir.
3. **Düşük (P3):** Sonuç sayısını sınırla — çok fazla memory entries varsa yanıt çok büyüyebilir; `limit` parametresi veya "son N sprint" filtresi eklenebilir.

## 13. Verdict: ANALYZED
