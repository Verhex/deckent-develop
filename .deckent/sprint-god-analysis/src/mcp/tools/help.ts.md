# Analysis: src/mcp/tools/help.ts
**Task ID:** 142-025 | **Model:** opus | **LoC:** 237 | **Effort:** max

## 1. Amaç (detaylı, 3-5 cümle)
Deckent runtime yetenekleri ve proje durumu gösteren MCP help tool'u. Proje initialization durumu, sprint aktifliği, agent/skill sayıları, routing engine versiyonu tespit eder. Tool ve resource katalogunu döner. Bağlama göre "sonraki adım" önerir (init → set_directives → plan → start → status). En büyük MCP tool dosyası (237 satır).

## 2. Public API
- `registerHelpTool(server: McpServer): void` — JSDoc YOK → **EKSİK**
- Module-private: HelpToolInfo, HelpResourceInfo, HelpState, HelpResponse interfaces
- Module-private: TOOLS array (16 tool), RESOURCES array (8 resource), detectState, determineNextAction

## 3. İç Bağımlılıklar
- `../../core/constants.js` → DECKENT_DIR, PROJECT_CONFIG_PATH, DIRECTIVES_FILE, DASHBOARD_FILE, DECKENT_VERSION, JOBS_DIR
- Döngüsel bağımlılık: YOK

## 4. Dış Bağımlılıklar
- `@modelcontextprotocol/sdk`, `node:fs`, `node:path` — ADR-010 uyumlu
- **Not:** zod import yok — parametre almıyor

## 5. Complexity
- Fonksiyon sayısı: 3 (detectState, determineNextAction, handler)
- Max cyclomatic: ~12 (detectState — 7 existsSync check + JSON.parse + readdirSync)
- En karmaşık: `detectState` satır 78-169 — **92 satır, yüksek**

## 6. Type Safety
- `as { active?: boolean }` satır 97 — JSON.parse cast, güvenli
- `as { sprintId?: string }` satır 114 — JSON.parse cast, güvenli
- `as { last_sprint_id?: string }` satır 128 — JSON.parse cast, güvenli
- `as { routing_engine?: string }` satır 138 — JSON.parse cast, güvenli
- Non-null `!` satır 115: `jobFiles[0]!` — ama length check satır 113'te var → güvenli
- **İYİ** — tüm cast'lar optional field'lı, try/catch içinde

## 7. ADR Compliance
- **ADR-008**: ✅
- **ADR-010**: ✅
- **ADR-022**: ✅ — CLI `deckent help` karşılığı

### ⚠️ **KRİTİK: TOOLS dizisinde 6 tool EKSİK**
TOOLS array'inde 16 tool listeleniyor ama gerçek tool sayısı 22:
**Eksik 6 tool:**
1. `deckent_agent_list`
2. `deckent_skill_list`
3. `deckent_checkpoint`
4. `deckent_docs`
5. `deckent_explain`
6. `deckent_memory_query`

**Bu P0 TUTARSIZLIK** — help tool 16 tool bildiriyor, gerçekte 22 tool kayıtlı (index.ts'de 22 register çağrısı).

## 8. Test Coverage
- Dedicated test: ✅ `tests/mcp/tools/help.test.ts` mevcut
- **Ama test'in tool sayısı doğrulaması var mı kontrol edilmeli**

## 9. TODO/FIXME/HACK Inventory
- Yok ✅

## 10. Dead Code
- Yok — ama TOOLS array'i eksik, dead code değil ama **stale data**

## 11. Security
- Düşük risk — parametre almıyor, salt-okunur
- Config dosyaları try/catch ile okunuyor

## 12. Memory V2 Uyumu
- RESOURCES array'inde `memory` kaynağı: "Brain memory: learned patterns from past sprints (.brain/MEMORY.md)" satır 70
- **ESKİ AÇIKLAMA** — Memory V2'de birincil kaynak memory.db, MEMORY.md export dosyası
- **P2 — açıklama güncellenmeli**
- `deckent_memory_query` tool TOOLS dizisinde YOK → **P0**

## 13. i18n
- `determineNextAction` satır 172-186 — **Türkçe** mesajlar döndürüyor: "deckent_init ile projeyi baslatin"
- Ama RESOURCES array İngilizce → **karma dil**
- TOOLS descriptions İngilizce → **tutarsız**
- **P2 i18n tutarsızlığı**

## 14. Dokümantasyon Tutarlılığı
- Tool description: ✅ İyi
- **TOOLS sayısı tutarsız** — 16 listeleniyor, 22 olmalı
- **RESOURCES açıklamaları Memory V2'ye güncellenmemiş**

## 15. Performance
- detectState: 7 existsSync + 3 readFileSync + 2 readdirSync — her çağrıda
- Hot path DEĞİL — kabul edilebilir

## 16. Öneriler
- **P0:** TOOLS dizisine 6 eksik tool ekle: agent_list, skill_list, checkpoint, docs, explain, memory_query
- **P2:** RESOURCES memory açıklaması Memory V2'ye güncellenmeli
- **P2:** i18n tutarsızlığı — ya tümü TR ya tümü EN olmalı (veya locale config)
- **P2:** detectState 92 satır — helper fonksiyonlara bölünmeli
- **P3:** JSDoc

## Verdict: ANALYZED
