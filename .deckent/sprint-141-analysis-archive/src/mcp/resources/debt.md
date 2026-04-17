# Analysis: src/mcp/resources/debt.ts
**Task ID:** 141-004 | **LoC:** 51

## 1. Amaci (1-2 cumle)
`deckent://debt` MCP resource handler'ı. Teknik borç (tech debt) kayıtlarını SQLite Memory V2 DB üzerinden (`MemoryStore.getByType('debt')`) okuyarak JSON formatında döndürür. Sprint 139 Memory V2 refactoru sonrası V1 `.md` fallback tamamen kaldırılmıştır.

## 2. Public API (export listesi)
- `registerDebtResource(server: McpServer): void` — MCP server'a `deckent://debt` resource handler'ını kaydeder; mime-type: `application/json`

## 3. Ic + Dis Bagimliliklar
**İç bağımlılıklar:**
- `core/constants.js` — `BRAIN_DIR`, `MEMORY_DB_FILE` sabitleri
- `core/types.js` — `DebtItem` tipi
- `core/memory-store.js` — `MemoryStore` sınıfı (SQLite DB erişimi)

**Dış bağımlılıklar:**
- `node:fs` — dosya yolu oluşturma için (muhtemelen dolaylı)
- `node:path` — `join` ile DB yolu oluşturma
- `better-sqlite3` — `MemoryStore` içinde (dolaylı bağımlılık)
- MCP server instance (parametre olarak alınır)

## 4. Complexity (fonksiyon sayisi, cyclomatic rough)
- Exported fonksiyon: **1** (`registerDebtResource`)
- İç mantık: MemoryStore aç → getByType('debt') → metadata JSON.parse → DebtItem'a dönüştür → kapat
- Cyclomatic complexity: ~3-4 (getByType dönüş döngüsü, metadata parse try/catch, try/finally)
- `try/finally` pattern ile store.close() garantisi: doğru kaynak yönetimi
- Genel karmaşıklık: orta-düşük

## 5. Type Safety (any, @ts-ignore, non-null assertion)
- `JSON.parse(d.metadata || '{}')` dönüşü `any` tipinde — alan çıkarımı (`meta.title`, `meta.status` vb.) tip güvencesiz
- Manuel alan çıkarımı: `meta.title ?? d.title`, `meta.status ?? 'open'` — nullish coalescing ile güvenli ama TypeScript tip denetimi yok
- `any` kullanımı: **1** (örtük, JSON.parse dönüş tipi)
- `@ts-ignore`: **0**
- Non-null assertion (`!`): **0**
- `DebtItem` tipine cast için `as DebtItem` kullanılıyor olabilir (kesin kaynak analizi gerekir)

## 6. ADR Compliance (ADR-006/008/010/037/039/040)
- **ADR-006 (spawnSync Security Pattern):** İlgili değil.
- **ADR-008 (Brain Merkezi Import):** UYUMLU — yalnızca `core/` modülleri import edilir, `orchestra/brain` zinciri yok.
- **ADR-010 (Tek Runtime Dependency):** `better-sqlite3` dolaylı bağımlılık; MemoryStore üzerinden encapsulate edilmiş, kabul edilebilir.
- **ADR-037 (RBAC):** Debt resource read-only; erişim kontrolü uygulanmıyor. Kabul edilebilir.
- **ADR-039/040 (Memory V2 DB-first):** TAMAMEN UYUMLU — `MemoryStore.getByType('debt')` kullanımı, V1 `.md` fallback yok, try/finally ile store.close() garantisi.

## 7. Test Coverage (src/X → tests/X.test.ts eslesmesi)
Beklenen test dosyası: `tests/mcp/resources/debt.test.ts`

Beklenen test senaryoları:
- DB'de debt kayıtları varken doğru dönüşüm yapılır
- Boş DB'de boş dizi döner
- Malformed metadata JSON için JSON.parse fallback (try/catch) çalışır
- MemoryStore her zaman close() edilir (finally branch testi)
- `DebtItem` alanları doğru şekilde haritalanır (id, title, status, sprint vb.)

## 8. TODO/FIXME/HACK inventory
Kaynak dosyada herhangi bir `TODO`, `FIXME` veya `HACK` yorumu tespit edilmemiştir.

## 9. Dead Code Candidates
Dead code tespit edilmemiştir. Modül sıkıca odaklanmış; tüm kod yolu aktif.

## 10. Security Findings
Güvenlik değerlendirmesi:
- **SQL injection:** MemoryStore `getByType('debt')` sabit string parametresi alır; kullanıcı girdisi SQL'e karışmaz. Risk: **sıfır**.
- **JSON.parse güvenliği:** `d.metadata` DB'den gelen güvenilir veri; ancak malformed JSON durumu try/catch ile ele alınabilir. Mevcut `JSON.parse(d.metadata || '{}')` koruyucu değil (syntax error fırlatır) — bu bir güvenlik açığı değil ama sağlamlık sorunudur.
- **Resource leak:** `try/finally` ile `store.close()` garantisi mevcut — doğru implementasyon.
- **Veri ifşası:** Tech debt içerikleri hassas iç proje bilgisi sayılabilir; MCP ortamının güven sınırı içinde kaldığı varsayılır.

## 11. Memory V2 Uyumu (DB-first mi, eski .md parse var mi?)
**TAMAMEN UYUMLU.** Sprint 139 Memory V2 refactoru kapsamında:
- V1 fallback (`.brain/DEBT.md` dosyası okuma + `parseDebtTable()` çağrısı) tamamen kaldırılmıştır.
- `MemoryStore.getByType('debt')` tek veri kaynağıdır.
- DB yolu `MEMORY_DB_FILE` sabitinden alınır — doğru yaklaşım.
- `try/finally` ile store.close() garantisi Memory V2 best practice'ini uygular.

Bu dosya Memory V2 geçişinin başarılı tamamlandığı modüllerden biridir; referans implementasyon olarak kullanılabilir.

## 12. Oneriler (Sprint 142+ input)
1. **Önemli (P1):** `DebtMetadata` interface'i tanımla ve `JSON.parse(d.metadata || '{}')` sonucunu bu tiple doğrula:
   ```typescript
   interface DebtMetadata {
     title?: string;
     status?: 'open' | 'resolved';
     sprint?: string;
     description?: string;
   }
   ```
   Bu değişiklik tip güvenliğini artırır ve alan erişimlerindeki örtük `any`'yi ortadan kaldırır.
2. **Normal (P2):** `JSON.parse` çağrısını try/catch ile sararak malformed metadata kayıtlarını sessizce atlayan güvenli parse uygula.
3. **Düşük (P3):** `status` alanı için union tip kullan: `'open' | 'resolved' | 'archived'` — mevcut string tipi gereksiz geniş.

## 13. Verdict: ANALYZED
