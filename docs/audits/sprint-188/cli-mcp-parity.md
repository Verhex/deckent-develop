# W2-T10 — CLI ↔ MCP Parity Tam Haritası

**Sprint:** 188 | **Worker:** w-188-010 | **Tarih:** 2026-05-22
**Mod:** ANALYSIS-ONLY — kaynak kod değiştirilmedi
**Bağımlılıklar:** 188-001 (CLI envanteri), 188-002 (MCP envanteri)
**ADR referansı:** ADR-022 (Sprint 044) + ADR-022-v2 (Sprint 085) — CLI/MCP Feature Parity

---

## 1. Kapsam ve Yöntem

Bu denetim W1-T01 ve W1-T02 rapor sonuçlarını ground-truth kabul eder:
- CLI envanteri: 46 üst-düzey komut + ~65 alt-komut (`docs/audits/sprint-188/cli-command-inventory.md:114-145`).
- MCP envanteri: 31 tool + 8 resource (`docs/audits/sprint-188/mcp-tool-inventory.md:47`).

Her MCP tool için (a) CLI eşleşmesi, (b) parametre paritesi (`inputSchema` ↔ `.option()`), (c) çekirdek mantık paylaşımı (import grafı), (d) davranış farkları sütunlarına göre değerlendirildi. CLI-only komutlar için MCP tarafında eksiklik kasıtlı/eksik etiketi verildi.

**Kanıt yöntemi:** her satır `dosya:satır` referansı verir; örnek `src/mcp/tools/start.ts:30-36` (Zod inputSchema), `src/cli/commands/start.ts:155-161` (Commander `.option()`).

---

## 2. Tam Eşleme Tablosu — MCP Tool ↔ CLI Komutu

`deckent_` ön ekini kaldırıp CLI ismiyle karşılaştır.

| # | MCP Tool | CLI Komutu | Eşleme | Çekirdek mantık |
|---|----------|------------|--------|-----------------|
| 1 | `deckent_init` | `deckent init` | TAM (isim) | Ayrışmış — MCP `init.ts:62-280`, CLI `init.ts:117-364` çağrı zinciri ortak `core/`, ama MCP yalın, CLI 11 opsiyon |
| 2 | `deckent_set_directives` | `deckent set-directives` | TAM | MCP `directives.ts:30-87` `writeFileSync`+baseline; CLI `set-directives.ts:33-…` ayrıca `--file/--stdin` desteği |
| 3 | `deckent_plan` | `deckent plan` | TAM | **Paylaşılan** — her ikisi `planSprint` (`orchestra/brain.js`) çağırır |
| 4 | `deckent_start` | `deckent start [description]` | TAM (isim) | **Ayrışmış** — CLI in-process `runSprint`; MCP detached `fork` (`start.ts:163-188`) — Sprint 143 |
| 5 | `deckent_status` | `deckent status` | TAM | **Paylaşılan** dashboard reader (`readDashboardSafe`, `formatStatus`) |
| 6 | `deckent_doctor` | `deckent doctor` | TAM | **Paylaşılan** — MCP `doctor.ts:1` `runDoctorChecks` CLI'den import eder |
| 7 | `deckent_retro` | `deckent retro` | TAM | Paylaşılan `MemoryStore` (`retro.ts:1-92`, `cli/retro.ts:340-…`) |
| 8 | `deckent_history` | `deckent history` | TAM | **Paylaşılan** — `collectSprintFiles` (`orchestra/sprint-reporter.js`) |
| 9 | `deckent_analyze_project` | `deckent analyze` | KISMİ (isim) | Paylaşılan — `analyzeProject` (`core/analyzer.js`) |
| 10 | `deckent_sync` | `deckent sync` | KISMİ | **Ayrışmış** — MCP yalnız `ensureDeckentImport`; CLI ek `--git-only`/`--adapters-only`/`--dry-run` ve git change detection |
| 11 | `deckent_config` | `deckent config (read/get/set)` | TAM | Paylaşılan `loadConfig`+`setNestedValue` |
| 12 | `deckent_review` | `deckent review` | TAM | Paylaşılan `getNextSprintId`+task file scan |
| 13 | `deckent_run` | `deckent run <description>` | TAM | Paylaşılan `SpawnBackendFactory`+`buildWorkerPrompt` |
| 14 | `deckent_kill` | `deckent kill [taskId]` | TAM | Ayrışmış implementasyon — MCP `killTaskById`/`killAllTasks` (`kill.ts:14-77`); CLI `kill.ts:303-…` panic-guard kontrolü ile |
| 15 | `deckent_cleanup` | `deckent cleanup` | TAM | Paylaşılan `runDecay` (`orchestra/brain.js`) |
| 16 | `deckent_help` | `deckent help-info` | KISMİ (isim) | MCP `help.ts:194-242` tool katalogu döner; CLI yerel `messages` |
| 17 | `deckent_agent_list` | `deckent agent list` | KISMİ (alt-komut) | MCP yalnız list; CLI 8 alt-komut (create/stats/enable/disable/delete/edit/info) |
| 18 | `deckent_skill_list` | `deckent skill list` | KISMİ (alt-komut) | MCP yalnız list; CLI 10 alt-komut (create/install/update/enable/disable/delete/info/search/publish) |
| 19 | `deckent_checkpoint` | `deckent checkpoint (list/approve/reject)` | TAM | Action enum vs. ayrı alt-komut — ADR-022-v2 paralel |
| 20 | `deckent_docs` | `deckent docs (add/remove/list/update/run)` | TAM | Paylaşılan `addDoc/removeDoc/loadDocsConfig` |
| 21 | `deckent_explain` | `deckent explain` | KISMİ | MCP yalnız `sprintId`; CLI ayrıca `--task` routing-decision log |
| 22 | `deckent_memory_query` | `deckent recall <query>` | KISMİ (isim) | **Paylaşılan** `searchMemory` — MCP'de `status` filtresi ekstradan VAR; CLI'de yok |
| 23 | `deckent_watch` | `deckent watch` | KISMİ (semantik) | **Semantik ayrışma** — MCP `eventBus` SSE event stream; CLI tmux split view (`cli/watch.ts:114-116`) |
| 24 | `deckent_feature_query` | `deckent features` | KISMİ (isim) | Paylaşılan — `.deckent/features-manifest.json` |
| 25 | `deckent_audit` | `deckent audit <sprint-id>` | TAM | **Paylaşılan** `runSelfAuditGate` (`orchestra/sprint-finalizer.js`) |
| 26 | `deckent_recover` | `deckent recover <sprint-id>` | TAM | **Paylaşılan** `cleanOrphanIpcDirs`+`clearStaleLocks`+`runSelfAuditGate` |
| 27 | `deckent_nervous_subscribe` | _(yok)_ | MCP-ONLY | CLI tarafı `nervous log --follow` (file tail) — SSE değil |
| 28 | `deckent_nervous_accept` | `deckent nervous accept <id>` | TAM | Paylaşılan IPC queue |
| 29 | `deckent_nervous_reject` | `deckent nervous reject <id>` | TAM | Paylaşılan IPC queue |
| 30 | `deckent_nervous_status` | `deckent nervous` (dashboard) | KISMİ (semantik) | Default-action vs ayrı tool |
| 31 | `deckent_nervous_config` | `deckent config nervous (set/override/list/reset)` | KISMİ (namespace) | Üst-düzey config'in alt-namespace genişlemesi (`config-nervous.ts:361`) |

**Sonuç:** 31 MCP tool'unun **30'u** CLI tarafında bir karşılığa sahiptir (bazen alt-komut). Yalnızca **`deckent_nervous_subscribe` MCP-ONLY**. 30 eşleşmenin **yaklaşık 14'ü TAM**, **16'sı KISMİ** (isim, semantik veya parametre paritesi farkı).

---

## 3. Yalnız-CLI (MCP-ONLY-Tek-Taraf) Yetenek Envanteri

CLI'da var, MCP'de tool karşılığı OLMAYAN üst-düzey komutlar (`docs/audits/sprint-188/cli-command-inventory.md:237-244` listesinden):

| CLI Komutu | MCP Karşılığı | Durum | Yorum |
|------------|---------------|-------|-------|
| `attach` (`attach.ts:25`) | yok | EKSİK | Çalışan tmux session'a iliştirme — MCP non-interactive |
| `spawn <taskId>` (`spawn.ts:85`) | yok | EKSİK | Tek task manuel spawn — MCP `run` ile karışmasın diye eksik |
| `archive-debt` (`archive-debt.ts:17`) | yok | EKSİK | Tech-debt raporu — basit eklenebilir |
| `dashboard` (`dashboard.ts:146`) | yok (resource var) | KASITLI | `deckent://dashboard` MCP resource olarak sağlanıyor |
| `serve` (`serve.ts:59`) | yok | KASITLI | HTTP API daemon — MCP zaten kendisi sunucu |
| `web` (`web.ts:27`) | yok | KASITLI | Web dashboard launcher — interaktif |
| `agent create/stats/enable/disable/delete/edit/info` (`agent.ts:256-503`) | yok | EKSİK | Agent yönetimi — MCP yalnız `list` |
| `skill create/install/update/enable/disable/delete/info/search/publish` (`skill.ts:246-598`,`skill-marketplace.ts:97-162`) | yok | EKSİK | Skill yönetimi — MCP yalnız `list` |
| `plugin install/remove/update/list/info/test/create` (`plugin.ts:16-217`) | yok | EKSİK | Plugin yaşam döngüsü |
| `memory rebuild/export/stats/relations` (`memory.ts:18-174`) | yok | EKSİK | Memory V2 DB-first komutları — kısmen `memory_query` ile örtüşür |
| `mode show/sprint/task/auto/global` (`mode.ts:44-108`) | yok | EKSİK | Deckent style modu — MCP `config` ile çözülebilir |
| `finalize` (`finalize.ts:114`) | yok | KASITLI | Sprint sonu manuel finalize — `start` zaten otomatik yapar |
| `heartbeat` (`heartbeat.ts:22`) | yok | KASITLI | Daemon — MCP non-daemon |
| `onboard` (`onboard.ts:222`) | yok | KASITLI | İlk kullanıcı wizard'ı — interaktif |
| `output <taskId>` (`output.ts:65`) | yok | EKSİK | Worker log tail — MCP-friendly |
| `cost show/update/budget` (`cost.ts:218-237`) | yok | EKSİK | Maliyet yönetimi |
| `remember <note>` (`remember.ts:11`) | yok | EKSİK | Memory.db'ye not yaz — `memory_query` ile asimetrik |
| `resume <sprintId>` (`resume.ts:24`) | yok | EKSİK | Checkpoint resume |
| `audit-verify` (`audit-verify.ts:23`) | yok | EKSİK | HMAC chain verify |
| `test-run` (`test-run.ts:87`) | yok | KASITLI | Test sprint — interaktif |
| `upgrade` (`upgrade.ts:360-367`) | yok | KASITLI | npm self-update |
| `nervous edit/undo/history/log/accept-panic/baseline-refresh` (`nervous.ts:610-660`) | yok | EKSİK | Nervous lifecycle eksik altı alt-komut |

**Yalın çıkarım:** 22 CLI üst-düzey komut MCP'de doğrudan tool karşılığına sahip değildir. Bunların yaklaşık **9'u KASITLI** (interaktif/daemon/web), **13'ü EKSİK** ve ADR-022-v2 parity'sini delip geçer (özellikle `agent`, `skill`, `plugin`, `memory`, `cost`, `remember`, `resume`, `audit-verify`, `nervous edit/undo/history/log/accept-panic/baseline-refresh`).

---

## 4. Yalnız-MCP (CLI-Tek-Taraf-Yok) Yetenek Envanteri

| MCP Tool | CLI Karşılığı | Yorum |
|----------|---------------|-------|
| `deckent_nervous_subscribe` (`nervous.ts:201`) | yok (yalnız `nervous log --follow` file tail) | SSE / push-event aboneliği yalnız MCP'de — CLI tarafı pull tail |

Bu, tek-yönlü MCP-only yetenektir. Programatik istemciler (Claude IDE, web dashboard) için anlamlıdır; CLI için file-tail yeterince eşdeğer kabul edilebilir ama **bilinçli belgelenmemiştir**.

---

## 5. Parametre Paritesi Tablosu (Kritik Tool'lar)

Aşağıda 11 kritik tool için MCP `inputSchema` alanları ve CLI `.option()` karşılıkları yan yana verilmiştir. ADR-022-v2 hedefi: eşit parametre yüzeyi.

### 5.1 `init` — MCP 6 alan vs CLI 11 opsiyon
- **MCP** (`init.ts:68-75`): `projectName`, `mode`, `language`, `force`, `auto`, `installMissing`
- **CLI** (`init.ts:121-131`): `--auto`, `--manual`, `--cursor`, `--claude-code`, `--env <envs>`, `--all-envs`, `--upgrade`, `--force`, `--repair`, `-y/--yes`, `--no-install`
- **MCP eksik:** `--manual`, `--cursor`, `--claude-code`, `--env`, `--all-envs`, `--upgrade`, `--repair` (7 opsiyon)
- **CLI eksik:** `projectName` argüman (CLI dirname'den türetir), `language` (interaktif prompt), `mode` (interaktif select), `installMissing` adıyla (CLI `-y`/`--yes`+`--no-install`)
- **PARITE BOŞLUĞU: 7 alan**

### 5.2 `start` — MCP 5 alan vs CLI 8 opsiyon (+1 argüman)
- **MCP** (`start.ts:30-36`): `autoApprove`, `dryRun`, `force`, `timeout`, `sandbox`
- **CLI** (`start.ts:152-161`): `[description]` (zero-config arg), `--auto-approve`, `--sandbox-mode`, `--dry-run`, `--force`, `--watch`, `--timeout`, `--force-directives`
- **MCP eksik:** `[description]` zero-config arg, `--watch`, `--force-directives` (3 ögee)
- **Davranış farkı:** CLI in-process `runSprint`, MCP detached fork. `--force` CLI'de hem lock-check hem doctor-pre-flight atlar; MCP'de yalnız lock-check (`start.ts:42-50` self-belgelendi — KASITLI DRIFT)
- **Davranış farkı:** CLI ayrıca pre-spawn cost gate (`start.ts:335-384`) çalıştırır; MCP'de yok — Sprint 141 sonrası eklendi, MCP'ye taşınmadı. **PARİTE EKSİK.**

### 5.3 `status` — MCP 3 alan vs CLI 8 opsiyon
- **MCP** (`status.ts:284-288`): `json`, `verbose`, `outputMode`
- **CLI** (`status.ts:232-241`): `--watch`, `-f/--follow`, `--json`, `--raw`, `--verbose`, `--no-color`, `--graph`, `--mode`
- **MCP eksik:** `--watch`, `--follow` (stdio sınırı — KASITLI), `--raw`, `--no-color`, `--graph` (4 alan)
- **CLI eksik:** `outputMode` vs CLI `--mode` — isim farklı ama anlam eşit (kısmi parite)

### 5.4 `kill` — MCP 2 alan vs CLI 4 opsiyon (+1 argüman)
- **MCP** (`kill.ts:86-89`): `taskId`, `all`
- **CLI** (`kill.ts:303-307`): `[taskId]` arg, `--all`, `--force`, `--user-explicit`
- **MCP eksik:** `--force` (panic-guard bypass), `--user-explicit` (explicit confirmation) — güvenlik gating
- **PARİTE EKSİK: panic-guard kontrolleri MCP'de yok**

### 5.5 `plan` — MCP 2 alan vs CLI 3 opsiyon
- **MCP** (`plan.ts:44-47`): `dryRun`, `mode (ai|structured|auto)`
- **CLI** (`plan.ts:16-20`): `--no-confirm`, `--structured`, `--dry-run`
- **Semantik fark:** CLI `--structured` boolean (yes/no); MCP `mode` enum (ai|structured|auto). MCP daha zengin ama davranış farklı.
- **MCP eksik:** `--no-confirm` (confirmation skip — interaktif değilse anlamsız, KASITLI)

### 5.6 `history` — MCP 2 alan vs CLI 5 opsiyon
- **MCP** (`history.ts:35-38`): `last`, `json`
- **CLI** (`history.ts:222-228`): `--agent`, `--skill`, `--json`, `--last`, `--trend`
- **MCP eksik:** `--agent`, `--skill`, `--trend` (3 filtre/analiz) — **PARİTE EKSİK**

### 5.7 `retro` — MCP 1 alan vs CLI 5 opsiyon
- **MCP** (`retro.ts:54-56`): `sprintId`
- **CLI** (`retro.ts:340-346`): `--raw`, `--compare`, `--json`, `--perf`, `--trend [n]`
- **CLI eksik:** `sprintId` (CLI yalnız son retro'yu gösterir — **MCP'de YENİ özellik, CLI'ye geri taşınmamış**)
- **MCP eksik:** `--compare`, `--perf`, `--trend`, `--raw` (4 alan)
- **Çift-yönlü parite eksiklikleri.**

### 5.8 `review` — MCP 1 alan vs CLI 4 opsiyon
- **MCP** (`review.ts:74-76`): `auto`
- **CLI** (`review.ts:191-196`): `--auto`, `--json`, `--approve-all`, `--reject-all`
- **MCP eksik:** `--approve-all`, `--reject-all`, `--json` (3 alan)

### 5.9 `doctor` — MCP 3 alan vs CLI 4 opsiyon
- **MCP** (`doctor.ts:17-21`): `includeProfile`, `profile (alias)`, `json`
- **CLI** (`doctor.ts:942-947`): `--profile`, `--legacy`, `--json`, `--pre-flight`
- **MCP eksik:** `--legacy` (eski format), `--pre-flight` (sprint öncesi stricter gate)

### 5.10 `run` — MCP 4 alan vs CLI 6 opsiyon
- **MCP** (`run.ts:26-31`): `description`, `model`, `scope`, `autoApprove`
- **CLI** (`run.ts:228-235`): `<description>` arg, `--model`, `--scope`, `--timeout`, `--keep`, `--auto-approve`, `--verbose`
- **MCP eksik:** `--timeout`, `--keep` (cleanup skip), `--verbose` (3 alan)

### 5.11 `memory_query` vs `recall`
- **MCP** (`memory-query.ts:23-31`): `query`, `type`, `status`, `limit`, `sprint_min`, `mode`, `root` (7 alan)
- **CLI** (`recall.ts:12-17`): `<query>` arg, `-t/--type`, `-n/--limit`, `--sprint-min`, `-m/--mode` (4 opsiyon)
- **CLI eksik:** `status` filtresi — **MCP daha zengin** (paritenin TERS yönü)

---

## 6. Çekirdek Mantık Drift Analizi

`src/mcp/tools/*.ts` import grafından (Bölüm 5'teki çapraz inceleme), 31 tool şu üç sınıfa düşmektedir:

### 6.1 Paylaşılan Çekirdek Mantık (~14 tool — DOĞRU)
- `plan`, `start` (dry-run yolu), `doctor`, `audit`, `recover`, `cleanup`, `analyze`, `config`, `history`, `memory_query`, `retro`, `explain`, `agent_list`, `skill_list`
- Hepsi `orchestra/brain.js` / `core/*.js` / `monitor/*.js` modüllerinden import eder; CLI tarafıyla aynı fonksiyonu çağırır. **Drift düşük.**

### 6.2 Yarı-Ayrışmış (~10 tool — ORTA DRIFT)
- `init`: MCP minimum dosya yazımı + `regenerateRules`; CLI 11 opsiyon ve doctor+provisioner+wizard akışı (`init.ts:117-364`). Aynı çıktı dosyaları yazılır, ama akış zincirleri farklı.
- `kill`: MCP içeride `killTaskById/killAllTasks` yazılı; CLI `nervous/panic-guard` katmanından geçer (`kill.ts:303-307`). Aynı task-file mutation paterni ama güvenlik kontrolleri farklı.
- `run`: aynı `SpawnBackendFactory` paylaşılır; sonuç bekleme/timeout/log farklı (`run.ts:26-31` vs `cli/run.ts:228-235`).
- `set_directives`: MCP `writeFileSync` + nervous baseline update; CLI ayrıca `--file` ve stdin desteği.
- `status`, `review`, `feature_query`, `docs`, `checkpoint`, `sync`: çekirdek paylaşılır ama opsiyon yüzeyi çok dar (Bölüm 5).

### 6.3 Tamamen Ayrışmış (~7 tool — YÜKSEK DRIFT)
- `start` (gerçek çalıştırma yolu): CLI in-process `runSprint`; MCP detached `fork(sprint-runner-entry)` — Sprint 143 dispatch fix (`start.ts:130-190`). **KASITLI MİMARİ AYRIŞMA**, belgede yok.
- `watch`: MCP push (eventBus SSE backfill 0-100); CLI pull (tmux split view) — semantik farklı, isim aynı.
- `help`: MCP tool katalogu serializer; CLI yerel `messages.ts` lookup.
- `nervous_subscribe`: yalnız MCP — CLI `nervous log --follow` push değil pull.
- `nervous_config`: MCP tek-tool action enum (read/set_preset/set_override/list_actions/reset); CLI'de `config nervous` alt-namespace (set/override/list/reset). Action listeleri aynı değil — MCP `list_actions` ekstra (`nervous.ts:407-415`).

---

## 7. Davranış Farkları — Çıktı Biçimi, Varsayılan Değer, Yan Etki

| Boyut | CLI | MCP | Etki |
|-------|-----|-----|------|
| Çıktı | İnsan-okur ANSI table/markdown | JSON wrap + opsiyonel `wrapResponse` summary | İstemci tarafında parse farkı; `outputMode/--mode` ile dengelendi |
| `--watch`/--follow | TTY refresh, tmux session, ANSI clear | Yok (stdio bloke olmasın diye) — `deckent_watch` SSE event stream alternatif | KASITLI |
| Confirmation/prompt | `promptConfirm` (`helpers/prompt.ts`) — TTY zorunlu | Hep auto-approve / no-confirm | KASITLI (MCP non-interactive) |
| `autoApprove` default | `false` (kullanıcı `--auto-approve` ister) | `true` (hardcoded, immutable — `start.ts:140`) | DRIFT — MCP standart=true, CLI standart=false |
| Cost gate | `start.ts:335-384` `estimateSprintCost`+`promptConfirm` | Yok | PARİTE EKSİK (Sprint 141'den sonra) |
| Provider cache | `cli/start.ts:42-68` `provider-cache.json` 1h TTL | Yok | KASITLI (MCP her seferinde bootstrap) |
| Doctor pre-flight | `start.ts:266-277` runDoctorChecks zorunlu | Yok (belgeli divergence — `start.ts:42-50`) | KASITLI |
| Sandbox restore | `restoreSandbox` finally bloğu | Aynı (MCP'de runner içinde) | PARİTE |
| Hata mesajları | `printError`+`process.exitCode = N` | `{ error: true, message }` JSON + `isError: true` | İstemci formatı farkı |

---

## 8. ADR-022 / ADR-022-v2 Uyumu Skoru

ADR-022 ve ADR-022-v2 "Parametre Eşitleme + Eksik Komutlar" hedefini koyar. Mevcut durum:

| ADR-022 Hedefi | Durum | Kanıt |
|----------------|-------|-------|
| 1 — Her CLI üst-düzey komut için MCP tool olmalı | EKSİK (22/46 ≈ %48 boşluk) | Bölüm 3 |
| 2 — Her MCP tool için CLI komutu olmalı | YAKIN TAM (30/31 ≈ %97) | Bölüm 4 |
| 3 — Parametre yüzeyi eşit olmalı (parametre paritesi) | EKSİK (Bölüm 5 — ortalama %50 parite) | Bölüm 5.1-5.11 |
| 4 — Aynı çekirdek mantığa gitmeli (drift yok) | KISMI (~14 paylaşılan, ~10 yarı, ~7 ayrışmış) | Bölüm 6 |
| 5 — Davranış (varsayılan, çıktı) eşit olmalı | KISMI (özellikle `autoApprove`, cost gate, doctor pre-flight) | Bölüm 7 |

**Genel skor:** ADR-022-v2 hedefinin yaklaşık **%55-60'ı** karşılanmaktadır. Tool-yüzeyi paritesi iyi (97%), ancak **parametre paritesi ve drift kontrolü zayıf**.

---

## 9. Kritik Parite Boşlukları (P1 — Yüksek Önem)

| # | Boşluk | Etki | Ciddiyet |
|---|--------|------|----------|
| 1 | `deckent_start` cost gate eksik (Sprint 141 sonrası CLI'ye eklenmiş, MCP'ye taşınmamış) | MCP üzerinden başlatılan sprint'ler bütçe kontrolünden geçmez — Sprint 140 $42 hatası MCP tarafında hala olası | YÜKSEK |
| 2 | `deckent_kill` `--force`/`--user-explicit` yok (panic-guard bypass) | MCP üzerinden PanicGuard tarafından bloklanan worker'lar açılamaz | YÜKSEK |
| 3 | `agent` ve `skill` yönetim alt-komutları MCP'de yok | Programatik istemciler agent/skill yaşam döngüsünü yönetemez | YÜKSEK |
| 4 | `cost show/update/budget` MCP'de yok | Maliyet tracking MCP-side eksik | ORTA |
| 5 | `memory rebuild/export/stats/relations` MCP'de yok | Memory V2 db management MCP-side eksik | ORTA |
| 6 | `nervous edit/undo/history/log/accept-panic/baseline-refresh` MCP'de yok | Nervous System yaşam döngüsünün 6 alt-komutu eksik | ORTA |
| 7 | `deckent_retro` MCP'de `--compare/--perf/--trend` yok | Retrospektif analiz yetenekleri MCP'de düşük | DÜŞÜK |
| 8 | `deckent_history` MCP'de `--agent/--skill/--trend` filtreleri yok | Sprint analizi MCP-side dar | DÜŞÜK |
| 9 | `deckent_review` MCP'de `--approve-all/--reject-all/--json` yok | Toplu inceleme MCP-side mümkün değil | DÜŞÜK |
| 10 | `autoApprove` varsayılan değer farkı (CLI false ↔ MCP true) | Aynı komut farklı davranır — istemci sürprizi | ORTA |

---

## 10. İsimlendirme Asimetrileri

| MCP Adı | CLI Adı | Yorum |
|---------|---------|-------|
| `deckent_help` | `deckent help-info` | CLI Commander'ın built-in `help` ile çakışmadan kaçınmış (`docs/audits/sprint-188/cli-command-inventory.md:179-184`). MCP `help` adı ise built-in çakışması olmadığı için sadeleştirilmiş. |
| `deckent_memory_query` | `deckent recall` | Tamamen farklı semantik — "query" vs "recall". |
| `deckent_feature_query` | `deckent features` | "query" eki MCP'de, CLI'de yok. |
| `deckent_analyze_project` | `deckent analyze` | MCP'de `_project` eki, CLI'de yok. |
| `deckent_set_directives` | `deckent set-directives` | snake_case vs kebab-case — convention farkı (kabul edilebilir). |

Bu asimetriler kullanıcı zihinsel modeli için sürtünme yaratır; ADR-022-v2'de eşit isimlendirme önerilmişti ancak uygulanmamış.

---

## Özet

| Bulgu | Kanıt | Önem |
|-------|-------|------|
| **31 MCP tool'un 30'u CLI'da bir karşılığa sahip** (≈%97) | Bölüm 2 | İYİ |
| **22 CLI üst-düzey komut MCP'de yok** — 13'ü gerçek eksiklik | Bölüm 3 | YÜKSEK |
| **Yalnız `nervous_subscribe` MCP-only** (CLI tarafı pull file tail) | Bölüm 4 | DÜŞÜK |
| **Parametre paritesi: kritik 11 tool'un ortalama %50'si** | Bölüm 5 | ORTA |
| **Cost gate `deckent_start` MCP'de eksik** — Sprint 141 sonrası kayma | Bölüm 7, 9 | YÜKSEK |
| **Panic-guard `--force`/`--user-explicit` MCP `kill`'de yok** | Bölüm 5.4, 9 | YÜKSEK |
| **`autoApprove` varsayılanı CLI false ↔ MCP true** — sessiz davranış farkı | Bölüm 7 | ORTA |
| **start runtime tamamen ayrışmış**: CLI in-process, MCP detached fork | Bölüm 6.3 | KASITLI |
| **`watch` tool semantik olarak farklı**: CLI tmux UI ↔ MCP SSE | Bölüm 6.3 | KASITLI |
| **`agent`/`skill`/`plugin` yönetimi yalnız CLI'de** (yalnız `list` MCP'de) | Bölüm 3 | YÜKSEK |
| **`retro`/`history`/`review` MCP versiyonları opsiyon eksik** | Bölüm 5.6-5.8 | ORTA |
| **5 isimlendirme asimetrisi** (`help`, `recall`/`memory_query`, vd.) | Bölüm 10 | DÜŞÜK |
| **Çekirdek mantık paylaşımı: 14/31 tam, 10/31 yarı, 7/31 ayrışmış** | Bölüm 6 | İYİ-ORTA |
| **ADR-022-v2 uyumu yaklaşık %55-60** | Bölüm 8 | İYİLEŞTİRİLEBİLİR |

---

## Sprint 189 Follow-up

1. **[P1] `deckent_start`'a pre-spawn cost gate ekleyin.** `mcp/tools/start.ts:38-50` öncesi `initCostConfig`+`estimateSprintCost`+`withinBudget` kontrolü taşıyın. Sprint 140 $42 hatası MCP tarafında hala mümkün — CLI parity'sini koruyun.
2. **[P1] `deckent_kill`'e `force`/`userExplicit` alanları ekleyin.** Panic-guard bypass MCP üzerinden mümkün olmalı (`kill.ts:86-89` schema genişletme).
3. **[P1] `autoApprove` varsayılanını CLI ile aynı yapın veya farkı belgelendirin.** CLI false ↔ MCP true sessiz davranış sürpriziyle sonuçlanır; en azından `start.ts:31` description'ında uyarı.
4. **[P1] `deckent_agent_manage` + `deckent_skill_manage` tools ekleyin.** Action enum (`create/enable/disable/delete/edit/info/stats`) ile CLI agent/skill alt-komutlarına parity.
5. **[P2] `deckent_history` filtreleri eklenmeli.** `agent`, `skill`, `trend` alanları (`history.ts:35-38`).
6. **[P2] `deckent_retro` opsiyonları:** `compare`, `perf`, `trend`, `raw` ekleyin (`retro.ts:54-56`).
7. **[P2] `deckent_review` opsiyonları:** `approveAll`, `rejectAll`, `json` ekleyin (`review.ts:74-76`).
8. **[P2] `deckent_run` opsiyonları:** `timeout`, `keep`, `verbose` ekleyin (`run.ts:26-31`).
9. **[P2] `deckent_explain` `task` alanı:** routing-decision log için (`explain.ts:53-57`).
10. **[P2] `deckent_memory_manage` tool.** `rebuild`/`export`/`stats`/`relations` actionları — Memory V2 DB-first parity.
11. **[P2] `deckent_cost` tool.** `show`/`update`/`budget` actionları — maliyet tracking.
12. **[P2] `deckent_nervous_extra` tool veya genişletme.** `edit`/`undo`/`history`/`log`/`accept-panic`/`baseline-refresh` action setleri.
13. **[P3] İsimlendirme asimetrilerini ortadan kaldırın veya belgelendirin.** ADR-022-v3 önerilebilir: `analyze_project→analyze`, `memory_query→recall`, `feature_query→features`, `help→help_info` veya tersi.
14. **[P3] Çekirdek lint kontrolü:** `scripts/lint-cli-mcp-parity.mjs` ekleyin — her CLI komut için MCP tool, her MCP tool için CLI komut zorunluluğu + parametre alan-isim uyumu.
15. **[P3] `deckent_audit_verify` tool ekleyin** — HMAC chain doğrulama MCP-side.
16. **[P3] `deckent_resume` tool ekleyin** — checkpoint resume MCP-side.
17. **[P3] `set_directives` MCP'sine `file`/`stdin` desteği** — CLI parity (`directives.ts:49-51`).
18. **[P3] `deckent_archive_debt` ve `deckent_remember` tools** — ufak ama ADR-022-v2 hedefi için gerekli.
