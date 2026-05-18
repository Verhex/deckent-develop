# Analysis: src/mcp/tools/kill.ts
**Task ID:** 142-024 | **Model:** opus | **LoC:** 125 | **Effort:** max

## 1. Amacı
Worker durduran MCP tool. `deckent_kill` olarak kayıtlı. Tek bir worker'ı (taskId ile) veya tüm aktif worker'ları durdurur. Task status'unu PAUSED yapar, heartbeat dosyasını siler, file lock'ları serbest bırakır. Takılan sprint'leri kurtarmak için kullanılır.

## 2. Public API
- `registerKillTool(server: McpServer): void` — tek export
- JSDoc: **YOK**

## 3. İç Bağımlılıklar
- `../../core/constants.js` → TASKS_DIR, LOCKS_DIR
- `../helpers/enrich.js` → enrichResponse()
- Döngüsel bağımlılık riski: **YOK** — minimal import

## 4. Dış Bağımlılıklar
- `node:fs` (readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync), `node:path` (join) — Node built-in
- `zod/v4`, `@modelcontextprotocol/sdk` — standart
- ADR-010: ✅

## 5. Complexity
- Fonksiyon sayısı: 3 (killTaskById, killAllTasks, registerKillTool)
- Max cyclomatic: ~8 (killTaskById — dosya arama, JSON parse, lock temizleme)
- Okunabilir, iyi yapılandırılmış

## 6. Type Safety
- `any`: 0 (satır 84'deki description string'de "any" kelimesi var ama tip değil)
- `@ts-ignore`: 0
- `as unknown`: 0
- Non-null `!`: 1 — satır 110: `killTaskById(root, taskId!)` — ⚠️ Zod schema'da taskId optional, ama handler'da `!taskId && !all` kontrolü var (satır 95), bu yüzden runtime'da güvenli. Ancak `!` kullanımı yerine `taskId as string` veya early return pattern daha iyi.
- `TaskFileData` interface: düzgün tanımlı ✅
- `as { taskId?: string }` satır 47: ✅ JSON parse sonucu, güvenli

## 7. ADR Compliance
- **ADR-008 brain import**: ✅ UYUMLU — sadece core/ ve helpers/ import
- **ADR-022 CLI/MCP parity**: ✅ CLI `deckent kill` ile paralel. CLI `--all` flag'i, MCP `all: boolean` — eşdeğer.
- **ADR-033**: ✅
- **ADR-037 RBAC**: Kill operasyonu brain seviyesinde yetkili — MCP bağlamında kullanıcı tarafından çağrılır ✅

## 8. Test Coverage
- tests/mcp/tools/ altında kill.test.ts: **MEVCUT DEĞİL** ❌
- **P1 GAP**: Dedicated test yazılmalı — killTaskById, killAllTasks, edge cases (task bulunamadı, lock parse hatası)

## 9. TODO/FIXME/HACK Inventory
- **YOK**

## 10. Dead Code
- `TaskFileData.forceModel`: İnterface'de tanımlı ama hiç kullanılmıyor. **P3** — gereksiz field
- killAllTasks: DONE veya PAUSED durumundaki task'ları atlar — ✅ doğru davranış

## 11. Security
- **Task dosya yazma**: Status'u PAUSED'a çevirir — sınırlı yazma ✅
- **Lock dosya silme**: unlinkSync — kendi task'ının lock'unu siler ✅
- **Race condition**: İki istemci aynı task'ı kill etmeye çalışırsa — writeFileSync ve unlinkSync ENOENT hatası fırlatabilir ama try-catch ile yakalanıyor ✅
- **JSON parse hatası**: Lock dosyası bozuksa catch ile yakalanıyor ✅

## 12. Memory V2 Uyumu
- ✅ N/A — kill tool Memory DB'ye erişmiyor

## 13. i18n
- Hardcoded İngilizce: "Provide taskId or set all=true" — kabul edilebilir

## 14. Dokümantasyon Tutarlılığı
- Tool description: ✅ Detaylı
- annotations: readOnlyHint=false, destructiveHint=true, idempotentHint=false — ✅ DOĞRU (destructive)
- DECKENT.md MCP tablosunda destructive=Evet — ✅ Tutarlı

## 15. Performance
- Sync I/O: readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync — **14 sync I/O çağrısı** (killAllTasks'ta tüm task dosyalarını okur)
- Kill bağlamında kabul edilebilir — sık çağrılan bir tool değil

## 16. Öneriler
- **P1**: Dedicated test dosyası yazılmalı (tests/mcp/tools/kill.test.ts)
- **P2**: `taskId!` non-null assertion yerine `taskId as string` veya refactored control flow
- **P2**: kill tool tmux session'ı gerçekten öldürmüyor — sadece task status'unu PAUSED yapıyor. tmux/subprocess backend'lerinde gerçek process kill yapılmalı mı? CLI'daki `deckent kill` tmux kill-session çağırıyor mu? Parity kontrol edilmeli.
- **P3**: TaskFileData.forceModel gereksiz — kaldırılabilir

## Verdict: ANALYZED
