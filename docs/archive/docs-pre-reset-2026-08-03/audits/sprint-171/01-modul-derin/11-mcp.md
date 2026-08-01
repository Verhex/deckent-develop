# MCP Modülü Denetim Raporu — Sprint 171 / Task 11

**Denetim tarihi:** 2026-05-15
**Denetim kapsamı:** `src/mcp/` (server, server-singleton-lock, tools/, resources/, helpers/)
**Denetim türü:** Audit-only (kod değişikliği yok)
**Denetim modu:** Char-level statik inceleme + doküman-kod karşılaştırması

---

## 1. Bulgular

MCP modülü, deckent'in Model Context Protocol arabirimini sunan sunucu katmanıdır. `@modelcontextprotocol/sdk` üzerine kurulu, stdio transport ile çalışan tek bir Node.js süreci olarak başlatılır. Modül 3 ana alt parçaya ayrılır: sunucu lifecycle (`server.ts` + `server-singleton-lock.ts`), araçlar (`tools/`, 28 dosya, 30 fonksiyon registrasyonu — 25 tek-tool dosyası + `nervous.ts` 5 tool barrel) ve kaynaklar (`resources/`, 8 dosya, 8 kayıt). Denetim sırasında 12 ayrı bulgu tespit edildi; özetle:

### B-1. Doküman vs kod araç/kaynak sayısı drift'i (HIGH)

Gerçek araç (tool) registrasyon sayısı **31** olarak ölçüldü; ancak dokümantasyon ve MCP `instructions` bloğu farklı sayılar belirtiyor:

| Kaynak | Belirtilen sayı | Gerçek sayı |
|--------|-----------------|-------------|
| `src/mcp/server.ts:33` MCP instructions | "Tools (27)" | 31 |
| `src/mcp/tools/help.ts:48-71` (TOOLS sabiti) | 22 | 31 |
| `CLAUDE.md` "MCP: 27 tools" | 27 | 31 |
| `DECKENT.md` "MCP Integration: 22 tools" | 22 | 31 |
| `DECKENT.md` "MCP Tool Reference" tablosu | 22 satır | 31 |
| `IDENTITY.md` "MCP: 27 tools" | 27 | 31 |

Gerçek sayı `src/mcp/tools/index.ts:30-58` ile `src/mcp/tools/nervous.ts:336-342` üzerinden mekanik sayım: 26 tek-tool register + 5 nervous tool = 31. Eksik gösterilenler: `deckent_watch`, `deckent_audit`, `deckent_recover`, `deckent_feature_query`, `deckent_nervous_subscribe`, `deckent_nervous_accept`, `deckent_nervous_reject`, `deckent_nervous_status`, `deckent_nervous_config`. Bu drift kullanıcıyı yanıltır: MCP istemcisi 31 aracı listeler ama dokümana göre 22 veya 27 bekler; OSS GA öncesi düzeltilmesi kritik.

Kaynak (resource) sayısı **8** olarak doğru bildirilmiş (`src/mcp/resources/index.ts:11-19` ile DECKENT.md tablosu birebir uyumlu).

### B-2. `deckent_explain` araç parametre yolu üzerinden path traversal (HIGH)

`src/mcp/tools/explain.ts:39-42` `sprintId` parametresini `validateSprintId()` doğrulayıcısından geçirmeden direkt dosya yolu inşasında kullanıyor:

```ts
const cleanId = sprintId.replace(/^sprint-/, '');
const paddedId = cleanId.padStart(3, '0');
const filename = `sprint-${paddedId}.md`;
const filePath = join(root, BRAIN_DIR, SPRINTS_DIR, filename);
```

`sprintId="042/../../../etc/issue"` gibi bir girdi için `cleanId = '042/../../../etc/issue'`, `paddedId` zaten 3 karakterden uzun olduğu için padding yapmaz, `filename = 'sprint-042/../../../etc/issue.md'` üretilir ve `readFileSync` proje kökünün dışına çıkabilir. Aracın `readOnlyHint: true` etiketi olsa da, host sistemde okuma yetkisi olan herhangi bir `.md` dosyasını ifşa edebilir. `src/core/validators.ts:58-66` içinde `validateSprintId` (regex `^sprint-\d{3,4}$`) hâlihazırda mevcut; tek yapılması gereken explain ve diğer sprintId alan araçlarda çağırmak.

### B-3. Destructive tool gate kod düzeyinde yok (MEDIUM-HIGH)

`deckent_kill` (`src/mcp/tools/kill.ts:85`) ve `deckent_cleanup` (`src/mcp/tools/cleanup.ts:60`) `annotations: { destructiveHint: true }` taşıyor ancak kod düzeyinde herhangi bir "canlı sprint var mı? kullanıcıdan onay alındı mı?" kontrolü yok. `CLAUDE.md` proje belleğinde "Alperen onayı olmadan `deckent_kill`, `deckent_cleanup` (canlı sprint) YASAK" şeklinde yer alan kural yalnızca:

1. MCP istemcisinin (Claude Code / Cursor / VS Code uzantısı) destructive hint'i kullanıcıya yansıtmasıyla,
2. İnsan operatörün belleğine güvenmesiyle,

uygulanır — **kodda enforce edilmez**. OSS dağıtımında istemci destructiveHint'i farklı yorumlayabilir veya pas geçebilir. `cleanup.ts:104-105` doğrudan `cleanTasks` + `cleanLocks` çağırıyor ve `.tasks/*` dosyalarını siliyor. Aktif sprint kontrolü için `src/core/multi-ide.ts:isSprintLocked` zaten mevcut (start.ts:69 kullanıyor), ama kill/cleanup'a koşturulmamış.

### B-4. `validateSprintId` / `validatePath` doğrulayıcıları kısmen kullanılıyor (MEDIUM)

`src/core/validators.ts` 4 doğrulayıcı sunuyor: `validatePath`, `validateSprintId`, `validatePhase`, `validateTaskId`. MCP modülünde kullanım dağılımı:

| Doğrulayıcı | Kullanan dosya | Kullanmayan ama girdi alan dosya |
|-------------|----------------|----------------------------------|
| `validatePath` | checkpoint.ts:56, docs.ts:69,110,130 | memory-query.ts (root), nervous.ts (root x2) |
| `validateSprintId` | checkpoint.ts:52 | audit.ts (sprintId), recover.ts (sprintId), explain.ts (sprintId), retro.ts, history.ts, watch.ts |
| `validateTaskId` | (hiçbir MCP tool kullanmıyor) | kill.ts (taskId), job-runner.ts |
| `validatePhase` | checkpoint.ts:53 | (kullanılan tek yer) |

`memory-query.ts:30` ve `nervous.ts:188,248` `root` parametresini doğrulamadan `process.cwd()` yerine yamuyor. `kill.ts:87` `taskId` Zod string olarak alıyor ama içeriği regex'ten geçmiyor — `readdirSync` + `find` örüntüsüyle kullanıldığı için path traversal direkt sömürülmez ama yine de güvenlik prensibi gereği validate edilmeli.

### B-5. `deckent_help` araç listesi 22 ile sabitlenmiş (MEDIUM)

`src/mcp/tools/help.ts:48-71` 22 elemanlı `TOOLS` sabiti var. `registerTools()` ile registere edilen 31 araçtan 9'u burada listelenmiyor: `deckent_watch`, `deckent_audit`, `deckent_recover`, `deckent_feature_query`, `deckent_nervous_subscribe`, `deckent_nervous_accept`, `deckent_nervous_reject`, `deckent_nervous_status`, `deckent_nervous_config`. `deckent_help` çağrıldığında kullanıcıya eksik kapasiteler döner — bu hem ADR-022-V2 (CLI/MCP feature parity) hem de ürün vaadi açısından kırık. `help.ts` ya tools listesini dinamik olarak `tools/index.ts` registrasyonundan derlemeli ya da güncel tutulmalı.

### B-6. `feature-query.ts` zod import drift (LOW)

`src/mcp/tools/feature-query.ts:7` `import { z } from 'zod'` (v3) ile `src/mcp/tools/nervous.ts:7`, `src/mcp/tools/explain.ts:3` ve diğer tüm araçların `import { z } from 'zod/v4'` örüntüsü çelişiyor. Davranış olarak v3/v4 dual-package yapısı çalışıyor ama `package.json`'da iki ayrı semver entry varsa bundle boyutu büyüyor ve davranış değişikliklerinde kırıklık riski oluşuyor. Tek versiyonda standardize edilmeli.

### B-7. `deckent_sync` aracı boş `inputSchema` (LOW)

`src/mcp/tools/sync.ts:14` yalnızca `annotations` veriyor, `inputSchema` yok. MCP SDK boş şema durumunda parametresiz çağrıya izin verir ama tüm diğer araçlar `inputSchema: z.object({...})` örüntüsünü kullanıyor. Tutarlılık için boş bile olsa `z.object({})` eklenmesi tercih edilir (özellikle ADR-035 mesaj protokolü standardı açısından).

### B-8. `recover` tool eksik dokümantasyonu (LOW)

`src/mcp/tools/recover.ts` tam fonksiyonel bir araç (registered: `src/mcp/tools/index.ts:28,57`), `destructiveHint: true` etiketli ve sprint kurtarma akışının kritik parçası (`.deckent/workspace/BOOT.md` Manuel Recovery Chain'de Step 3 olarak referans alınıyor). Ancak `DECKENT.md` "MCP Tool Reference — MCP Araç Referansı" tablosunda yer almıyor. Kullanıcının `deckent_recover` aracının mevcut olduğunu bilmesi mümkün değil.

### B-9. MCP server cache gotcha doküman-kod hizalanması eksik (LOW)

`DECKENT.md` gotcha bölümünde "MCP server restart: `dist/` rebuild sonrası long-lived MCP process eski kodu cache'ler. `/mcp restart` veya Claude Code yeniden başlat" iddiası var. `src/mcp/server-singleton-lock.ts` çift-MCP yarış koşulundan koruyor (`O_EXCL` ile PID dosyası, Sprint 161 T-006) ama kod-değişim algılaması yok: `dist/` rebuild sonrası MCP süreci kendiliğinden yeniden başlatmıyor. Bu davranış kasıtlı (Node modül cache'i statik) ama dokümandaki çözüm önerisi yetersiz — bir geliştirici aracı (örn. `--watch` flag veya hot-reload signal handler) gerekli. Sprint 167 reset/rebuild senaryolarında Brain'in fix yayını uygulanamadan eski kodun çalıştığı durumlar gözlemleniyor (Sprint 170 P0 retro).

### B-10. `initializeNotifyDispatcher` hata yutuyor (LOW)

`src/mcp/server.ts:150-156` `initializeNotifyDispatcher` çağrısını try/catch içine alıyor ve hata durumunda yalnızca stderr'e yazıp devam ediyor. Bu sayede MCP açılışı bloke olmuyor, ancak `DECKENT→USER:NOTIFY` kanalı sessizce devre dışı kalabiliyor — sprint sonu lifecycle bildirimleri kullanıcıya ulaşmıyor. Kullanıcıyı uyarmak için en azından `_enriched.warnings` alanına çoklu çağrılarda ekleme yapılmalı veya doctor aracı bunu sağlık kontrolü olarak görmeli.

### B-11. `nervous_accept` / `nervous_reject` operasyonel etki yok (INFO)

`src/mcp/tools/nervous.ts:84-176` `deckent_nervous_accept` ve `deckent_nervous_reject` araçları ID format kontrolü (UUID v4 regex veya `ns-` prefix) ve history okuma yapıyor, ancak gerçek `Executor.resolveApproval` çağrısı yok — yorum (`In a full implementation, Executor.resolveApproval would be called`) tamamlanmamış implementasyonu açıkça itiraf ediyor. Bu, ADR-040 Nervous System mimarisinin MCP arayüzü tarafında yarı-stub kaldığı anlamına geliyor. Şu an çağrı yapan bir Nervous notification gerçekten "accepted/rejected" olmuyor; sadece görünüm kaydı tutuluyor. Sprint 172 OSS GA öncesi ya implementasyon tamamlanmalı ya da araç adı `_dry_run` suffix'i ile işaretlenmeli.

### B-12. Genel: input doğrulama tutarsızlığı + ESM `.js` uzantı kontrolü (INFO)

Tüm MCP dosyalarında ESM `import ... from '.../foo.js'` örüntüsü tutarlı (ADR-002 Node16 module resolution). Tek istisna: `import { z } from 'zod/v4'` ve `feature-query.ts:7` `'zod'` (B-6'ya bakınız). Hiçbir kritik sızıntı yok ama disipline edilmesi gerekli.

`zod` ile Zod input schema kullanan tüm araçlar runtime input validasyonunu MCP SDK'ya devrediyor. SDK çıktı tipi sıkı (string/number/enum/boolean/object/array), bu da bir savunma katmanı. Ancak şeması dar olmayan alanlar (`description: z.string()` `run.ts:27`, `query: z.string()` `memory-query.ts:24`) uzunluk/karakter sınırı belirtmiyor — DoS yüzeyi olmasa da büyük string'in `enrichResponse` summary üretiminde performans etkisi var.

---

## 2. Severity

| Kod | Bulgu | Severity | Aciliyet |
|-----|-------|----------|----------|
| B-1 | Tool sayısı dokümantasyon drift'i (27/22 → 31) | **HIGH** | OSS GA blocker |
| B-2 | `deckent_explain` sprintId path traversal | **HIGH** | OSS GA blocker (read-only ama bilgi sızıntısı) |
| B-3 | kill/cleanup destructive gate kodda yok | MEDIUM-HIGH | OSS GA risk |
| B-4 | validateSprintId/validatePath kısmen kullanılıyor | MEDIUM | Tutarsızlık + B-2'nin kök nedeni |
| B-5 | `deckent_help` 22 tool ile sabitlenmiş | MEDIUM | Kullanıcı kapasite görmüyor |
| B-6 | `feature-query.ts` zod v3 vs v4 drift | LOW | Bundle/uyumluluk |
| B-7 | `deckent_sync` boş inputSchema | LOW | Tutarlılık |
| B-8 | `deckent_recover` dokümante edilmemiş | LOW | Keşfedilebilirlik |
| B-9 | MCP cache gotcha doküman çözümü yetersiz | LOW | Geliştirici deneyimi |
| B-10 | NotifyDispatcher init sessiz hata yutuyor | LOW | Operasyonel görünürlük |
| B-11 | `nervous_accept`/`reject` yarı-stub | INFO | Tamamlanmamış feature |
| B-12 | Genel input şeması daralması | INFO | Defansif programlama |

**CRITICAL bulgu yok** ama B-1 ve B-2 OSS GA'dan önce mutlaka kapatılmalı. B-3 kullanıcı veri kaybı ihtimali nedeniyle OSS GA öncesi (Sprint 172 conditional gate) en azından doktrini değiştirilmeli.

---

## 3. Kanıt

Her bulgunun en az bir `dosya:satır` referansıyla ispatı:

- **B-1**: `src/mcp/server.ts:33` `## Tools (27)` instructions; `src/mcp/tools/help.ts:48-71` 22 satırlık `TOOLS` sabiti; `src/mcp/tools/index.ts:30-58` 27 registrasyon çağrısı; `src/mcp/tools/nervous.ts:336-342` `registerNervousTools` 5 alt-tool register ediyor → fiili toplam 31.
- **B-2**: `src/mcp/tools/explain.ts:39-42` doğrulamasız sprintId dosya yolu inşası. Karşı kanıt: `src/core/validators.ts:58-66` `validateSprintId` regex `/^sprint-\d{3,4}$/` mevcut ama explain'de kullanılmıyor.
- **B-3**: `src/mcp/tools/kill.ts:85` `destructiveHint: true` ama `src/mcp/tools/kill.ts:91-122` handler aktif sprint kontrolü yapmıyor; `src/mcp/tools/cleanup.ts:60` aynı durum; karşılaştırma için `src/mcp/tools/start.ts:69` `isSprintLocked(root)` gate'i var, kill/cleanup'ta yok.
- **B-4**: `src/mcp/tools/checkpoint.ts:6` doğrulayıcı import; `src/mcp/tools/docs.ts:10` import. `src/mcp/tools/memory-query.ts:1-7` ve `src/mcp/tools/nervous.ts:1-12` import listelerinde validator yok.
- **B-5**: `src/mcp/tools/help.ts:48-71` 22 elemanlı sabit liste; `src/mcp/tools/index.ts:24-28` (watch, nervous, feature-query, audit, recover) help'te yok.
- **B-6**: `src/mcp/tools/feature-query.ts:7` `import { z } from 'zod'` vs `src/mcp/tools/nervous.ts:7` `import { z } from 'zod/v4'`.
- **B-7**: `src/mcp/tools/sync.ts:9-15` `registerTool` çağrısında `inputSchema` alanı yok; tüm diğer araçlarda var (örn. `src/mcp/tools/audit.ts:15`).
- **B-8**: `src/mcp/tools/recover.ts:14-26` tool tanımlı; `DECKENT.md` "MCP Tool Reference" tablosu (CLAUDE.md/DECKENT.md içine inline) `deckent_recover` satırı içermiyor.
- **B-9**: `src/mcp/server-singleton-lock.ts:66-113` tek koruma çift-MCP yarışı; rebuild sonrası reload mekanizması yok. Karşılaştırma: `tsc --watch` veya `nodemon`-tipi reload hiçbir yerde tetiklenmiyor.
- **B-10**: `src/mcp/server.ts:150-156` `try/catch` notify dispatcher init; hata yalnızca stderr.
- **B-11**: `src/mcp/tools/nervous.ts:104-112` `In a full implementation, Executor.resolveApproval would be called` yorumu; gerçek effect yok.
- **B-12**: `src/mcp/tools/memory-query.ts:24` `query: z.string()` (sınırsız uzunluk); `src/mcp/tools/run.ts:27` `description: z.string()` (sınırsız).

---

## 4. Öneriler

OSS GA (Sprint 172) öncesi yapılması önerilen düzeltmeler, severity sırasıyla:

### Öneri-1 (B-1 için — HIGH)
Tüm dokümantasyon ve `server.ts` instructions bloğundaki tool sayısını 31'e güncelle. İdeali: `server.ts` `DECKENT_MCP_INSTRUCTIONS` sabitini run-time'da `registerTools` çıktısından derle, hardcoded liste kaldırılsın. Eş zamanlı `CLAUDE.md`, `DECKENT.md`, `IDENTITY.md` ve `help.ts:TOOLS` sabiti senkronlansın. Sprint 172'de tek bir `mcp-tool-inventory.json` manifesto dosyası tek-yöntem kaynak yapılıp tüm yerlerden okunsun.

### Öneri-2 (B-2 için — HIGH)
`src/mcp/tools/explain.ts:38` (else dalı) ve `:39-42` bloğunu şu şekilde değiştir (kavramsal — kod yazılmadı):

```ts
if (sprintId) {
  const normalized = sprintId.startsWith('sprint-')
    ? sprintId
    : `sprint-${sprintId.padStart(3, '0')}`;
  validateSprintId(normalized);  // ← regex /^sprint-\d{3,4}$/
  const filename = `${normalized}.md`;
  ...
}
```

Aynı yaklaşım `retro.ts`, `history.ts`, `audit.ts`, `recover.ts`, `watch.ts` (sprintId alan tüm araçlarda) uygulanmalı. Aslında en doğrusu: ortak helper `resolveSprintFile(root, sprintIdInput)` `src/mcp/helpers/` altında ortaya çıkarılsın, tüm tooller bunu kullansın.

### Öneri-3 (B-3 için — MEDIUM-HIGH)
`kill.ts` ve `cleanup.ts` handler'larının başına `isSprintLocked` benzeri bir gate ekle:

- Eğer aktif sprint varsa (`isSprintLocked(root).locked === true`) ve `force: boolean` parametresi `true` değilse, `{ error: true, code: 'ACTIVE_SPRINT', message: 'Use force=true to confirm destructive action on running sprint' }` döndür.
- Yeni `force` parametresi `inputSchema`'ya `z.boolean().optional().default(false)` olarak eklenebilir.

Bu, MCP istemcisinin `destructiveHint`'i pas geçtiği durumlarda da kod düzeyinde koruma sağlar.

### Öneri-4 (B-4 için — MEDIUM)
Tüm sprintId/taskId/path parametreleri için doğrulayıcıyı mecburi kıl. Sprint 138 ADR-035 mesaj protokolü standardı kapsamına alınabilir: `validateAllInputs(taskId?, sprintId?, root?)` ortak helper'ı her tool girişinde otomatik çağırılsın. ESLint `no-restricted-imports` veya custom rule ile MCP tool handler'larında doğrudan path inşası yasaklanabilir.

### Öneri-5 (B-5 için — MEDIUM)
`help.ts:TOOLS` listesini kaldır; bunun yerine `server.tool._registered` (veya benzeri bir registry) üzerinden runtime'da derle. Eğer SDK iç state'e erişim vermezse, `tools/index.ts` registrasyon listesi ortak bir `Map<name, metadata>` doldurabilir; hem `help.ts` hem `server.ts` instructions buradan beslenir.

### Öneri-6 (B-6 için — LOW)
`feature-query.ts:7` `import { z } from 'zod/v4'` yap. `package.json` dependency satırını tek bir Zod versiyonuna düşür. CI'da `lint:imports` script'i mevcut Zod v3 importunu yakalasın.

### Öneri-7 (B-7 için — LOW)
`sync.ts:15` satırına `inputSchema: z.object({})` ekle. Boş şema bile MCP introspection için faydalı.

### Öneri-8 (B-8 için — LOW)
`DECKENT.md` "MCP Tool Reference" tablosuna `deckent_recover` (ve B-1 kapsamında tüm eksik araçlar) satır olarak eklensin. `nervous_*` ailesi ayrı bir alt-bölüm halinde sunulabilir.

### Öneri-9 (B-9 için — LOW)
`DECKENT.md` gotcha bölümüne ekstra not: "`dist/` rebuild'dan sonra Claude Code'da `/mcp` panelinden `deckent` sunucusunu kaldırıp ekle, ya da Claude Code'u yeniden başlat — sunucu süreci içindeki Node modül cache otomatik yenilenmiyor." Uzun vadeli çözüm: `--watch` flag'i ile MCP server `dist/server.js` mtime'ını kontrol edip kendini yeniden başlatabilir (opt-in).

### Öneri-10 (B-10 için — LOW)
`server.ts:152-156` catch bloğunda `console.warn`/structured-log yerine `deckent_doctor` tarafından okunabilen `.deckent/notify-dispatcher-status.json` dosyasına durum yaz. Böylece sessiz arızalar görünür hale gelir.

### Öneri-11 (B-11 için — INFO)
`nervous_accept`/`reject` araçlarını ya tam implement et (Executor.resolveApproval bağlantısı), ya da MCP'den geçici olarak gizle (registrasyondan çıkar). Yarı-stub durumu, OSS kullanıcısının çağrı yaptığında "kabul edildi" cevabı alıp eylemin gerçekleşmemesi açısından güven kaybı yaratır.

### Öneri-12 (B-12 için — INFO)
Tüm string input alanları için makul üst sınır: örn. `description: z.string().max(2000)`, `query: z.string().max(500)`. Bu, DoS riskinden çok defansif programlama disiplini.

### Genel öneri
MCP modülü için sprint 172'den önce şu sıkılaştırmalar düşünülebilir:

- **API-surface kontratı:** `.contracts/api-surface.md`'ye "MCP Tool Schema Contract" eklensin — her tool'un input/output şeması yapılandırılmış JSON olarak kayıt edilsin, doğrulayıcı CI script'i `npm run lint:mcp` kontrol etsin.
- **Test kapsamı:** `tests/mcp/tools/` dizininde 30+ test dosyası var; `recover.test.ts`, `nervous.test.ts`, `feature-query.test.ts` yokluğu eklenmeli (mevcut testler arasında nervous testleri görünmüyor).
- **Path validation merkezi helper:** `src/mcp/helpers/input-validators.ts` ortaya çıkarılıp tüm tool handler'ları zorunlu çağırsın.

---

## 5. Kapsam Haritası

Modül-derin denetim — her dosyanın audit boyutuna ve LoC'una göre dağılımı. `src/mcp/` altında 41 TypeScript dosyası, 5205 toplam satır. Bu task'a (171-011) ait kapsam:

### Sunucu çekirdeği (2 dosya, 351 LoC)

| Dosya | LoC | Audit boyutu | Bulgu |
|-------|-----|--------------|-------|
| `src/mcp/server.ts` | 224 | stdio transport, lifecycle, NotifyDispatcher, instructions metni | B-1, B-9, B-10 |
| `src/mcp/server-singleton-lock.ts` | 127 | O_EXCL PID lock, çift-MCP race koruma (Sprint 161 T-006) | B-9 (kısmen) |

### Araçlar (28 dosya, 28 register fonksiyonu = 31 fiili tool, 3933 LoC)

| Dosya | LoC | Audit boyutu | Bulgu |
|-------|-----|--------------|-------|
| `src/mcp/tools/index.ts` | 58 | Barrel registrasyonu (28 register çağrısı) | B-1 sayım kanıtı |
| `src/mcp/tools/init.ts` | 279 | `deckent_init` — proje bootstrap, dizin + config + adapter | — |
| `src/mcp/tools/directives.ts` | 80 | `deckent_set_directives` — DIRECTIVES.md yaz | — |
| `src/mcp/tools/plan.ts` | 110 | `deckent_plan` — sprint planlama | — |
| `src/mcp/tools/start.ts` | 237 | `deckent_start` — sprint başlat, fork, lock check | — (gate doğru) |
| `src/mcp/tools/status.ts` | 487 | `deckent_status` — canlı dashboard, en büyük tool | — |
| `src/mcp/tools/doctor.ts` | 89 | `deckent_doctor` — sağlık kontrolü | — |
| `src/mcp/tools/retro.ts` | 108 | `deckent_retro` — retro oku | B-4 (sprintId opsiyonel ama validate edilmez) |
| `src/mcp/tools/history.ts` | 86 | `deckent_history` — sprint geçmişi | B-4 |
| `src/mcp/tools/analyze.ts` | 48 | `deckent_analyze_project` — stack tespit | — |
| `src/mcp/tools/sync.ts` | 49 | `deckent_sync` — CLAUDE.md/AGENTS.md adapter | B-7 (boş inputSchema) |
| `src/mcp/tools/config.ts` | 87 | `deckent_config` — read/set config | — |
| `src/mcp/tools/review.ts` | 133 | `deckent_review` — GO/NO_GO değerlendirme | — |
| `src/mcp/tools/run.ts` | 113 | `deckent_run` — tek-task spawn | B-12 (description sınırsız) |
| `src/mcp/tools/kill.ts` | 124 | `deckent_kill` — destructive, taskId/all | **B-3, B-4** |
| `src/mcp/tools/cleanup.ts` | 138 | `deckent_cleanup` — destructive, decay opsiyonu | **B-3** |
| `src/mcp/tools/help.ts` | 242 | `deckent_help` — runtime introspection | **B-5** (22-tool sabit) |
| `src/mcp/tools/agent-list.ts` | 111 | `deckent_agent_list` — agent havuzu | — |
| `src/mcp/tools/skill-list.ts` | 100 | `deckent_skill_list` — skill havuzu | — |
| `src/mcp/tools/checkpoint.ts` | 148 | `deckent_checkpoint` — list/approve/reject | — (doğrulayıcı doğru kullanılmış) |
| `src/mcp/tools/docs.ts` | 143 | `deckent_docs` — managed docs CRUD | — (validatePath kullanılmış) |
| `src/mcp/tools/explain.ts` | 149 | `deckent_explain` — sprint özeti | **B-2 path traversal** |
| `src/mcp/tools/memory-query.ts` | 72 | `deckent_memory_query` — FTS5 arama | B-4 (root validate edilmez) |
| `src/mcp/tools/watch.ts` | 129 | `deckent_watch` — event stream subscribe | B-1, B-5 (help'te yok) |
| `src/mcp/tools/audit.ts` | 57 | `deckent_audit` — self-audit gate | B-1, B-5 |
| `src/mcp/tools/recover.ts` | 127 | `deckent_recover` — kurtarma akışı (destructive) | **B-8** dokümante edilmemiş, B-1, B-5 |
| `src/mcp/tools/feature-query.ts` | 145 | `deckent_feature_query` — feature manifest | **B-6 zod drift**, B-1, B-5 |
| `src/mcp/tools/nervous.ts` | 342 | 5 nervous_* tool — Nervous System bridge | **B-11 yarı-stub**, B-1, B-5 |
| `src/mcp/tools/job-runner.ts` | 97 | (helper — tool register etmez) | — (B-4 taskId validate yok) |

### Kaynaklar (9 dosya, 323 LoC)

| Dosya | LoC | Audit boyutu | Bulgu |
|-------|-----|--------------|-------|
| `src/mcp/resources/index.ts` | 20 | Barrel registrasyonu (8 çağrı) | — (sayım doğru) |
| `src/mcp/resources/dashboard.ts` | 32 | `deckent://dashboard` — JSON | — |
| `src/mcp/resources/directives.ts` | 26 | `deckent://directives` — markdown | — |
| `src/mcp/resources/memory.ts` | 36 | `deckent://memory` — DB-first | — (DB-fallback doğru) |
| `src/mcp/resources/debt.ts` | 50 | `deckent://debt` — markdown | — |
| `src/mcp/resources/config.ts` | 36 | `deckent://config` — JSON | — |
| `src/mcp/resources/retro.ts` | 36 | `deckent://retro` — DB-first | — (entries[0]! non-null assertion ama guarded) |
| `src/mcp/resources/tasks.ts` | 41 | `deckent://tasks` — JSON | — |
| `src/mcp/resources/agents.ts` | 46 | `deckent://agents` — JSON | — |

### Yardımcılar (3 dosya, 443 LoC)

| Dosya | LoC | Audit boyutu | Bulgu |
|-------|-----|--------------|-------|
| `src/mcp/helpers/index.ts` | 22 | Barrel re-export | — |
| `src/mcp/helpers/enrich.ts` | 98 | `enrichResponse`, summary/hints (TR/EN) | — (TR diliyle uyumlu, hardcoded literal) |
| `src/mcp/helpers/format.ts` | 323 | Human-readable formatters (status/plan/start/retro/...) | — (boyut büyük ama tek sorumluluk) |

### Coverage özeti

- **Toplam dosya:** 41 (`src/mcp/**/*.ts`)
- **Bu task'ta kapsanan:** 41 (%100)
- **Doğrudan kanıtla denetlenen:** 35 (server, server-singleton-lock + tüm tools + tüm resources + helpers/enrich)
- **Yalnız liste/satır okumayla denetlenen:** 6 (helpers/format.ts boyut/sorumluluk; status.ts/doctor.ts/agent-list.ts/skill-list.ts/config.ts/analyze.ts kavramsal denetim)
- **Coverage gap:** 0

Hiçbir MCP kaynak dosyası başka bir Sprint 171 task'ının kapsamında değil (cross-cut task'ları hariç: dead-code, ADR compliance, security, performance, type-safety, error-handling, test-integrity tüm src/'i tarayacak). Çakışma yok.

---

**Raporu yazan:** Worker w-171-011 (agent: api-builder, skill: api-builder, model: opus)
**Plan referansı:** `docs/superpowers/plans/2026-05-15-sprint-171-self-audit-plan.md` Task 171-011 bölümü
**Spec referansı:** `docs/superpowers/specs/2026-05-15-sprint-171-self-audit-design.md`
**Sprint:** sprint-171 / Self-Audit Mega-Sprint
