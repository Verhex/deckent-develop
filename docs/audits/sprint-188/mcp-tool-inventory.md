# W1-T02 — MCP Araç ve Resource Envanteri

**Sprint:** 188 | **Worker:** w-188-002 | **Tarih:** 2026-05-22  
**Kapsam:** `src/mcp/` (tools/, resources/, server.ts)  
**Yöntem:** ANALYSIS-ONLY — kaynak kod değiştirilmedi

---

## 1. Gerçek Tool Sayısı — Kanıt

`src/mcp/tools/` altındaki **31 adet `server.registerTool()` çağrısı** doğrulandı:

```
src/mcp/tools/init.ts:62
src/mcp/tools/directives.ts:31
src/mcp/tools/plan.ts:38
src/mcp/tools/start.ts:24
src/mcp/tools/status.ts:278
src/mcp/tools/doctor.ts:11
src/mcp/tools/retro.ts:48
src/mcp/tools/history.ts:29
src/mcp/tools/analyze.ts:17
src/mcp/tools/sync.ts:9
src/mcp/tools/config.ts:11
src/mcp/tools/review.ts:68
src/mcp/tools/run.ts:20
src/mcp/tools/kill.ts:80
src/mcp/tools/cleanup.ts:55
src/mcp/tools/help.ts:195
src/mcp/tools/agent-list.ts:69
src/mcp/tools/skill-list.ts:55
src/mcp/tools/checkpoint.ts:78
src/mcp/tools/docs.ts:13
src/mcp/tools/explain.ts:47
src/mcp/tools/memory-query.ts:10
src/mcp/tools/watch.ts:23
src/mcp/tools/feature-query.ts:43
src/mcp/tools/audit.ts:9
src/mcp/tools/recover.ts:15
src/mcp/tools/nervous.ts:201   (deckent_nervous_subscribe)
src/mcp/tools/nervous.ts:246   (deckent_nervous_accept)
src/mcp/tools/nervous.ts:314   (deckent_nervous_reject)
src/mcp/tools/nervous.ts:346   (deckent_nervous_status)
src/mcp/tools/nervous.ts:400   (deckent_nervous_config)
```

**Gerçek tool sayısı: 31**

Tüm bu tool'lar `src/mcp/tools/index.ts:30-58` içindeki `registerTools()` fonksiyonu aracılığıyla `src/mcp/server.ts:143` üzerinden sunucuya bağlanmaktadır. Ölü (registered ama wire edilmemiş) tool bulunmamaktadır.

---

## 2. Belge Tutarsızlığı — 31 vs 27 Uyuşmazlığı

Aynı sayıyı üç belge farklı biçimde ifade etmektedir:

| Belge | İfade | Gerçek Durum |
|-------|-------|--------------|
| `DECKENT.md` (satır 30) | "31 tools" + 31 ayrı isim | **DOĞRU** |
| `IDENTITY.md` Project Status bölümü | "MCP Tools: 27" | **YANLIŞ** |
| `src/mcp/server.ts:33` (`DECKENT_MCP_INSTRUCTIONS`) | "## Tools (27)" | **YANLIŞ** |

`server.ts:33-60` arasındaki `DECKENT_MCP_INSTRUCTIONS` gömülü dize, aşağıdaki **4 aracı listelemektedir**:

| Eksik Tool | Ekleme Sprinti |
|------------|---------------|
| `deckent_watch` | Sprint 145, Task 145-014 (`src/mcp/tools/watch.ts:1`) |
| `deckent_feature_query` | (`src/mcp/tools/feature-query.ts`) |
| `deckent_audit` | (`src/mcp/tools/audit.ts`) |
| `deckent_recover` | (`src/mcp/tools/recover.ts`) |

Bu 4 tool `tools/index.ts:24,26,27,28` satırlarında import edilmekte; `index.ts:53,55,56,57` satırlarında wire edilmektedir. Sorun registrasyon değil; `DECKENT_MCP_INSTRUCTIONS` sabit dizesinin güncellenmemiş olmasıdır.

---

## 3. Tool Kayıt Mimarisi

`src/mcp/tools/index.ts` **28 import** içermektedir:
- 23 bireysel `registerXxxTool` fonksiyonu
- 1 `registerWatch` (barrel olmayan, `watch.ts:22`)
- 1 `registerNervousTools` barrel'ı (`nervous.ts:502`) → içeriden 5 bireysel tool çağırır

`src/mcp/server.ts:137-158` `createServer()` akışı:
1. `registerTools(server)` → `src/mcp/tools/index.ts:30` (31 tool)
2. `registerResources(server)` → `src/mcp/resources/index.ts:11` (8 resource)
3. `McpNotificationAdapter` bağlama (satır 147)
4. `NotifyDispatcher` başlatma (satır 151)

**Singleton guard:** `src/mcp/server-singleton-lock.ts` — PID dosyası tabanlı kilit, `bootSingletonGuard()` `server.ts:161`.

---

## 4. ADR-012 İsimlendirme Uyumu

ADR-012, `register<Name>(program)` desenini zorunlu kılmaktadır. Tüm tool'lar `registerXxxTool(server)` biçimini kullanmaktadır; **tek istisna:**

- `src/mcp/tools/watch.ts:22` → `export function registerWatch(server: McpServer)` — `registerWatchTool` olmalı
- `src/mcp/tools/nervous.ts:502` → `export function registerNervousTools(server: McpServer)` — bu bir barrel wrapper olduğu için `Tool` son eki olmadan `Tools` çoğulu kullanımı tartışmalı, ancak bireysel fonksiyonlar (`registerNervousSubscribeTool` vb.) kurala uygundur

Önem derecesi: **düşük** (fonksiyonellik etkilenmiyor).

---

## 5. Zod inputSchema ve Annotations Bütünlüğü

31 tool'un tamamı şu alanları taşımaktadır:
- `inputSchema` — Zod `.object({...})` şeması
- `annotations.readOnlyHint` — boolean
- `annotations.destructiveHint` — boolean

**idempotentHint** durumu — tüm tool'lar bu alanı içermektedir (satır bazlı doğrulama):

| Tool | readOnly | destructive | idempotent | Kaynak |
|------|----------|-------------|------------|--------|
| deckent_init | false | false | true | init.ts:67 |
| deckent_start | false | false | false | start.ts:29 |
| deckent_kill | false | **true** | false | kill.ts:85 |
| deckent_cleanup | false | **true** | false | cleanup.ts:60 |
| deckent_status | **true** | false | true | status.ts:283 |
| deckent_watch | **true** | false | true | watch.ts:31 |
| deckent_recover | false | **true** | false | recover.ts:20 |
| deckent_plan | **true** | false | true | plan.ts:43 |
| deckent_review | **true** | false | true | review.ts:73 |
| deckent_memory_query | **true** | false | true | memory-query.ts:18 |
| deckent_nervous_subscribe | false | false | true | nervous.ts:209 |
| deckent_nervous_accept | false | false | false | nervous.ts:254 |
| deckent_nervous_reject | false | false | false | nervous.ts:321 |
| deckent_nervous_status | **true** | false | true | nervous.ts:352 |
| deckent_nervous_config | false | false | false | nervous.ts:406 |

`openWorldHint` yalnızca `watch.ts:35` içinde açıkça `false` olarak belirtilmiştir; diğer tool'lar bu alanı tanımlamamıştır (MCP SDK varsayılanı `true`). Bu boşluk küçük ama `deckent_kill` ve `deckent_recover` gibi yıkıcı araçlar için `openWorldHint: false` belirtmek daha doğru olurdu.

---

## 6. MCP Resource Kaydı (8 Adet)

`src/mcp/resources/index.ts:11-20` içinde 8 resource kayıtlıdır:

| # | Kaynak Adı | URI | Kaynak Dosya | Fonksiyon |
|---|------------|-----|--------------|-----------|
| 1 | dashboard | `deckent://dashboard` | resources/dashboard.ts | registerDashboardResource |
| 2 | directives | `deckent://directives` | resources/directives.ts | registerDirectivesResource |
| 3 | memory | `deckent://memory` | resources/memory.ts | registerMemoryResource |
| 4 | debt | `deckent://debt` | resources/debt.ts | registerDebtResource |
| 5 | config | `deckent://config` | resources/config.ts | registerConfigResource |
| 6 | retro | `deckent://retro` | resources/retro.ts | registerRetroResource |
| 7 | tasks | `deckent://tasks` | resources/tasks.ts | registerTasksResource |
| 8 | agents | `deckent://agents` | resources/agents.ts | registerAgentsResource |

Tüm belgeler (DECKENT.md, IDENTITY.md, server.ts:62) resource sayısını **8** olarak doğru göstermektedir. Resource tarafında herhangi bir tutarsızlık bulunmamaktadır.

---

## 7. Utility Modül: job-runner.ts

`src/mcp/tools/job-runner.ts` bir **utility modüldür**; `server.registerTool()` çağrısı içermez ve `tools/index.ts`'te import edilmemektedir. Dosya `TaskSummary`, `JobState` interface'leri ve iş durumu yönetim fonksiyonları tanımlar. Tool envanterine dahil edilmez.

---

## 8. Tool Başlık ve Açıklama Bütünlüğü

Örnekleme yapılan tüm araç dosyalarında `title` ve `description` alanları mevcuttur. Herhangi bir araçta eksik `description` tespit edilmemiştir. `handler` (üçüncü argüman) tüm 31 `server.registerTool()` çağrısında async fonksiyon olarak mevcuttur.

---

## Özet

| Bulgu | Detay | Önem |
|-------|-------|------|
| **Gerçek tool sayısı** | **31** (DECKENT.md doğru; IDENTITY.md ve server.ts yanlış) | Kritik |
| **DECKENT_MCP_INSTRUCTIONS hatası** | `server.ts:33` "Tools (27)" — 4 araç belgelenmedi | Yüksek |
| **Eksik araçlar (belgede)** | watch, feature_query, audit, recover | Yüksek |
| **Resource sayısı** | **8** — tüm belgelerde doğru | Geçer |
| **Ölü tool** | Yok — tüm kayıtlı araçlar wire edilmiş | Geçer |
| **ADR-012 ihlali** | `registerWatch` → `registerWatchTool` olmalı | Düşük |
| **openWorldHint eksikliği** | Yıkıcı araçlarda belirtilmemiş | Düşük |
| **job-runner.ts** | Utility modül; tool olarak kayıtlı değil, doğru | Geçer |

---

## Sprint 189 Follow-up

1. **[P1] `server.ts:33` güncellenmeli** — `DECKENT_MCP_INSTRUCTIONS` içindeki "## Tools (27)" → "## Tools (31)" ve listenin sonuna `deckent_watch`, `deckent_feature_query`, `deckent_audit`, `deckent_recover` eklenmeli.
2. **[P1] `IDENTITY.md` güncellenmeli** — "MCP Tools: 27" → "MCP Tools: 31".
3. **[P2] `watch.ts:22`** — `registerWatch` → `registerWatchTool` yeniden adlandırılmalı (ADR-012 uyumu); `tools/index.ts:24,53` de güncellenecek.
4. **[P3] Yıkıcı araçlar** — `deckent_kill`, `deckent_cleanup`, `deckent_recover` için `openWorldHint: false` eklenmeli; böylece MCP istemcileri bu araçların kapsam dışı yan etki yaratmadığını bilebilir.
5. **[P3] Belge otomasyonu** — `DECKENT_MCP_INSTRUCTIONS` gömülü dize ile gerçek kayıtlı araç listesini karşılaştıran bir lint script'i (ör. `scripts/lint-mcp-instructions.mjs`) eklenebilir; böylece gelecekte bu kayma otomatik olarak yakalanır.
