# TERM-5 — Sade Risk-Dili Karar Paketi (MASTER-PLAN #45, Sıra-45 🔬→karar)

**ADR Reference:** taslak (bkz. §9 "Önerilen Karar" — henüz kabul edilmedi)
**Status:** Evidence + mapping-proposal package (Alperen karar-kapısı — bu doküman KARAR VERMEZ,
kod/config/i18n/ADR-DB değişikliği İÇERMEZ)
**Date:** 2026-07-03
**Author:** worker (sprint-363, task 363-008)
**İlişkili dokümanlar:** `docs/MASTER-PLAN.md` #45 (TERM-5, "Görsel+işlevsel tutarlı/yormayan dil
+ sade risk-dili (Oku/Değiştir/Çalıştır/Otonom)", durum 🔬) · `docs/MASTER-PLAN.md` #42 (TERM-3,
command-registry) · `docs/MASTER-PLAN.md` #26 (TERM-CAT, catalog-render) · `src/cli/command-registry.ts`
· `tests/cli/command-registry.test.ts` · bu doküman biçim olarak
`docs/design/nl-dispatch-default-decision.md`'yi (Sıra-57 karar-paketi) örnek alır.

---

## 1. Bağlam & mevcut durum (disk-verify)

TERM-5 satırı MASTER-PLAN'da hâlâ 🔬 ("araştır") durumunda, ama kod-tabanı taranınca **hedef
4-seviyeli merdiven zaten kısmen inşa edilmiş** çıkıyor:

- `CommandRisk` tipi (`src/cli/command-registry.ts:38`) tam olarak istenen sözcükleri taşıyor:
  `'Oku' | 'Değiştir' | 'Çalıştır' | 'Otonom'` — ve satır 35-37'deki doc-comment onu zaten
  "TERM-5 plain-risk-language ladder" olarak adlandırıyor.
- Bu tip, `COMMAND_REGISTRY`'deki **75 komutun TAMAMINA** atanmış durumda (satır 91-188) ve
  `tests/cli/command-registry.test.ts:29-31,48-51` tarafından "spec-valid TERM-5" olarak
  test-korumalı.

Ama üç boşluk var:

1. **i18n YOK.** `messages.ts`'te `cmdCatalog.*` önekli TEK bir anahtar bile yok (grep: 0 sonuç) —
   `entry()` fabrikasının ürettiği `summaryKey: cmdCatalog.${name}.summary` (command-registry.ts:82)
   hâlâ hiçbir gerçek metne çözülmüyor, ladder'ın 4 kelimesinin (Oku/Değiştir/Çalıştır/Otonom)
   kendisi için de İngilizce/Türkçe karşılık tanımlı değil.
2. **UI-wiring YOK.** command-registry.ts'in dosya-başı yorumu (satır 28-29) bunu açıkça işaretliyor:
   "UI wiring (REPL slash-menu grouping, i18n message-key population...) is an explicit follow-up."
   Bugün gerçekte render edilen tek katalog yüzeyi (`/help`, `chat-native.ts:451-466`) `CommandRisk`'i
   HİÇ kullanmıyor — kendi ayrı, dar bir risk ölçeğini kullanıyor (bkz. §2.4).
3. **Tek-eşleme YOK.** Kod-tabanında TERM-5'in 4-kelimesi dahil **8 farklı risk/güven sözlüğü**
   birbirinden bağımsız yaşıyor (§2), aralarında hiçbir merkezi çeviri tablosu yok — bazı yerlerde
   (chat-native.ts:414-424) aynı 3 kaynak-değer için AYNI DOSYADA iki paralel elle-yazılmış eşleme
   tablosu bile var. Bu doküman §6'da TEK bir kanonik eşleme önerir.

---

## 2. Disk-verified envanter — mevcut risk/güven yüzeyleri

### 2.1 command-registry risk-etiketleri (TERM-5'in kendi hedef merdiveni)

| Alan | Kaynak |
|---|---|
| Tip tanımı | `src/cli/command-registry.ts:38` — `export type CommandRisk = 'Oku' \| 'Değiştir' \| 'Çalıştır' \| 'Otonom';` |
| Ladder semantiği (doc-comment) | `command-registry.ts:34-37` — "read-only < local-state modification < execute/spawn a process < autonomous continuous-loop control" |
| Ayrı/orthogonal boyut | `command-registry.ts:32` — `CommandCategory` ('Core'\|'Run'\|'Memory'\|'MCP'\|'Enterprise'\|'Danger') AYNI dosyada, AYNI entry'de, risk'ten BAĞIMSIZ bir ikinci etiket |
| `entry()` fabrikası | `command-registry.ts:74-83` |
| Uygulama | `command-registry.ts:91-188` — 75 `entry(...)` çağrısı, hepsi bir `risk` değeri taşıyor |
| Sorgu API | `byRisk()` — `command-registry.ts:196-198` |
| Test-koruması | `tests/cli/command-registry.test.ts:29-31` (`VALID_RISKS`), `:48-51` (spec-valid kontrolü) |

**Node ile disk-üzerinde sayılan dağılım** (`entry(name, category, risk, ...)` regex-parse, 75 kayıt):

| Risk | Adet | Örnek komutlar |
|---|---|---|
| Oku | 23 | status, doctor, analyze, watch, retro, history, recall, resources, usage, kpi |
| Değiştir | 30 | init, config, sync, plan, review, checkpoint, remember, model, provider, **cleanup, recover** |
| Çalıştır | 19 | upgrade, do, audit, start, spawn, serve, run, test, resume, process, **kill** |
| Otonom | 3 | autonomous, autonomous-mission, gateway-runtime — SADECE bu üçü |

`Otonom` diğer üç seviyeden yapısal olarak farklı: "en tehlikeli" anlamına gelmiyor, "sürekli/
makine-başlatımlı karar döngüsü" anlamına geliyor (bkz. §6'daki tasarım notu).

### 2.2 Tool trust-tier

| Alan | Kaynak |
|---|---|
| `ToolTrustTier` (5 değer) | `src/core/tool-catalog.ts:31-34` — `'Core' \| 'Project' \| 'MCP' \| 'Enterprise' \| 'Danger'` |
| `ToolCatalogRiskLevel` (4 değer, girdi) | `tool-catalog.ts:38-41` — `[...TOOL_RISK_LEVELS, 'critical']` (yani `'safe'\|'moderate'\|'destructive'\|'critical'`) |
| Taban 3-seviye | `src/core/tool-registry.ts:24-26` — `TOOL_RISK_LEVELS = ['safe','moderate','destructive']`, MCP `annotations`'tan türetilir |
| Türetme kuralı | `tool-registry.ts:47-52` (`deriveRiskFromAnnotations`) — `destructiveHint`→destructive, `readOnlyHint`→safe, aksi→moderate |
| Sınıflandırıcı | `tool-catalog.ts:73-76` (`classifyToolTrust`) — `riskLevel==='critical'` HER ZAMAN `Danger`'a clamp'lenir (kaynak ne olursa olsun); aksi halde `source` 1:1 tier'a eşlenir (`SOURCE_TRUST_TIER`, satır 58-63: builtin→Core, project→Project, mcp→MCP, enterprise→Enterprise) |
| Gerçek tüketici (`/help` katalog) | `src/cli/commands/chat-native.ts:414-465` — REPL'in KENDİ 3-seviyeli `ToolPermission`'ını (§2.4) BU 4-seviyeli ölçeğe elle eşliyor (`HELP_CATALOG_RISK_TO_CATALOG_RISK`, satır 414-418: read→safe, confirm→moderate, always→critical) |

`ToolTrustTier` teknik olarak bir "risk" ölçeği değil — `(source, risk)` çiftinden türeyen bir
**UX güven rozeti**. Ama pratikte kullanıcıya görünen tek gerçek-zamanlı "ne kadar tehlikeli"
sinyali bu (renk kodlu, `catalog-render.ts:70-76` `TIER_ANSI`), bu yüzden TERM-5 eşlemesinde
hesaba katılması gerekiyor.

### 2.3 Approval risk-5'lisi

| Alan | Kaynak |
|---|---|
| `ApprovalRisk` (5 değer) | `src/core/approval-contract.ts:42` — `z.enum(['none','low','medium','high','critical'])`, tip: satır 120, `ALL_APPROVAL_RISKS`: satır 126 |
| Kapsam | `ApprovalRequest.risk` (satır 71) — **komuta değil, TEK BİR isteğe (request'e) bağlı**, dinamik atanır |
| Sıralı rank | `src/core/approval-allowscope.ts:105` (`RISK_RANK`) — none<low<medium<high<critical |
| Varsayılan statik politika tablosu | `src/core/approval-rules-load.ts:54-60` (`SAFE_DEFAULT_APPROVAL_RULES`) — critical/high→require-approval, medium→notify, low/none→auto-approve |
| `critical` clamp (asla otomatik onay) | `src/core/approval-policy.ts:118-122` |
| `critical` + kaçış-kanalı-yok → deny (fail-safe) | `src/core/approval-fallback.ts:109-110` |
| Worker-tarafı gate | `src/core/approval-worker-gate.ts:77,106,194,242,246,294` — `risk: ApprovalRisk` guard edilen her eylemde taşınıyor; `critical` bu seam'den asla geçemiyor (satır 242) |
| i18n anahtarları | `messages.ts:2245-2249` (`approval_card.risk_none/low/medium/high/critical`, en+tr) — **TANIMLI ama bugün YETİM**: `src/cli/repl/app.tsx:363-375`'teki `DEFAULT_APPROVAL_CARD_LABELS` bu anahtarları KULLANMIYOR, sabit İngilizce literal döndürüyor; kod-yorumu (359-362) bunu "Messages round-8 (Task 15, MESSAGES-KEYS-4)" adlı gelecek bir işe bağlıyor |

Bu üçü arasında **i18n'i olan TEK yüzey** approval risk-5'lisi — ama o bile henüz gerçek UI'a
bağlanmamış.

### 2.4 İlişkili/besleyen 5 yüzey (envanterin TAM resmi için gerekli — §6'daki eşleme bunları da hesaba katar)

| Yüzey | Değerler | Kaynak | Not |
|---|---|---|---|
| `ToolPermission` | `'read'\|'confirm'\|'always'` | `src/cli/repl/tool-permissions.ts:15`, sınıflar: 18-22 (`ALWAYS_CONFIRM`: kill/cleanup/recover), 25-31 (`CONFIRM_TOOLS`), fonksiyon: 43-64 | REPL dispatch'in confirm-gating SSOT'u; `classifyExternalTool` (95-101) harici MCP tool'ları için 2-seviyeli (`always` hiç dönmez) |
| `CatalogRenderEntry.riskLevel` | `'low'\|'medium'\|'high'\|'critical'` | `src/cli/helpers/catalog-render.ts:31` | Render-mekanizmasının KENDİ dar ölçeği; doc-comment (26-30) bunu tool-catalog'un ölçeğinden **kasıtlı olarak ayrı** tutuyor ve "unifying further is YAGNI (358-017)" diyor — bu, §6 önerisinin saygı duyması/açıkça yeniden ele alması gereken ÖNCEKİ bir mimari karar |
| Nervous `RiskLevel` | `'low'\|'medium'\|'high'` | `src/core/nervous-types.ts:32` | + ayrı 4-değerli kategori etiketi (`'low-risk'\|'medium-risk'\|'high-risk'\|'safety-floor'`, satır 308); `AuthorityMode` (14-24) × `riskPolicyMap` (147-148) ile eşleşiyor |
| `config_nervous.col_*` i18n | low/medium/high | `messages.ts:590-592` | Nervous config UI'ının KENDİ, approval_card'dan bağımsız üçüncü bir low/medium/high çeviri seti |
| Taban `ToolRiskLevel` | `'safe'\|'moderate'\|'destructive'` | `tool-registry.ts:24-26` | §2.2'nin girdisi, MCP annotation-türetimi |

---

## 3. Envanter özet tablosu — 8 sözlük yan yana

| # | Sözlük | Seviye sayısı | Değerler | Statik/Dinamik | i18n bugün var mı |
|---|---|---|---|---|---|
| 1 | `CommandRisk` (TERM-5 hedefi) | 4 | Oku/Değiştir/Çalıştır/Otonom | Statik (komut-başına) | HAYIR (0 `cmdCatalog.*` anahtarı) |
| 2 | `ToolTrustTier` | 5 | Core/Project/MCP/Enterprise/Danger | Statik (source+risk'ten türer) | HAYIR (rozet glifi var, metin yok — `catalog-render.ts` string-free) |
| 3 | `ToolCatalogRiskLevel` | 4 | safe/moderate/destructive/critical | Statik | HAYIR |
| 4 | `ApprovalRisk` | 5 | none/low/medium/high/critical | **Dinamik** (request-başına) | VAR ama YETİM (§2.3) |
| 5 | `ToolPermission` | 3 | read/confirm/always | Statik (tool-adı-başına) | HAYIR |
| 6 | `CatalogRenderEntry.riskLevel` | 4 | low/medium/high/critical | Statik (render-girdisi) | HAYIR (glif, metin değil) |
| 7 | Nervous `RiskLevel` | 3 (+4 kategori) | low/medium/high (+safety-floor) | Statik/heuristik-karma | VAR (`config_nervous.col_*`), üçüncü bağımsız set |
| 8 | Taban `ToolRiskLevel` | 3 | safe/moderate/destructive | Statik | HAYIR |

---

## 4. Kanıtlanan tutarsızlık: kill / cleanup / recover

`ALWAYS_CONFIRM` seti (`tool-permissions.ts:18-22`) kill/cleanup/recover'ı **eşit derecede** en
yüksek temkin seviyesinde tutar ("ask EVERY time... never auto-approvable", satır 17) — bu üçü
`WORKER-GUIDE`/`brain.md`/`CLAUDE.md` gotchas'ta da tekrarlanan aynı "safety floor" ailesi
(sprint-kill, canlı-sprint-cleanup: Alperen onayı şart).

Ama `COMMAND_REGISTRY`'de (aynı `'Danger'` kategorisi altında, satır 176-179) risk-etiketleri
**FARKLI**:

```
entry('kill',    'Danger', 'Çalıştır', ...)   // satır 177
entry('cleanup', 'Danger', 'Değiştir', ...)   // satır 178
entry('recover', 'Danger', 'Değiştir', ...)   // satır 179
```

`Değiştir`, ladder'da `Çalıştır`'dan DAHA DÜŞÜK bir seviye (command-registry.ts:35-37) — yani
bugünkü etiketleme, tool-permissions.ts'in "üçü de eşit-en-yüksek-temkin" kuralıyla ÇELİŞİYOR.
Bu, tek bir merkezi kaynak olmadan üç ayrı görevde/zamanda elle atanmış etiketlerin doğal
sürüklenmesi (drift) — §6'daki tek-eşleme tablosunun tam olarak önlemeyi hedeflediği durum budur.

---

## 5. Tek-eşleme tablosu önerisi

**Öneri:** `CommandRisk` (Oku/Değiştir/Çalıştır/Otonom) **tek kanonik, kullanıcıya-görünen**
sözlük olarak belirlenir. Diğer 7 sözlük **silinmez/birleştirilmez** — her biri kendi
mühendislik alanında (approval iş akışı zamanlaması, REPL confirm-gating, MCP güven rozeti)
farklı bir amaca hizmet ediyor ve `catalog-render.ts:26-30`'un zaten belgelediği gibi bu
ayrımların bazıları bilinçli önceki kararlar. Bunun yerine her sözlükten `CommandRisk`'e **saf,
test edilebilir bir çeviri fonksiyonu** tanımlanır — yalnızca GÖRÜNTÜLEME amaçlı, iç mantığı
değiştirmez.

| Kaynak sözlük | Kaynak değer | → `CommandRisk` | Gerekçe |
|---|---|---|---|
| `ToolPermission` | `read` | **Oku** | salt-okunur, sessiz çalışır (tool-permissions.ts:9) |
| `ToolPermission` | `confirm` | **Değiştir** | tek-seferlik onay = yerel-durum mutasyonu varsayımı (tool-permissions.ts:10, 24-31) |
| `ToolPermission` | `always` | **Çalıştır** | kill/cleanup/recover TEK irreversible eylemler, sürekli-döngü DEĞİL — bkz. §4'ün düzeltmesi: üçü de `Çalıştır` olmalı, `Değiştir` DEĞİL |
| `ToolCatalogRiskLevel` | `safe` | **Oku** | tool-registry.ts:47-52 `readOnlyHint`→safe ile birebir |
| `ToolCatalogRiskLevel` | `moderate` | **Değiştir** | annotation yok/belirsiz varsayılan (tool-registry.ts:48,51) |
| `ToolCatalogRiskLevel` | `destructive` | **Çalıştır** | `destructiveHint`→destructive (tool-registry.ts:49) |
| `ToolCatalogRiskLevel` | `critical` | **Çalıştır** | catalog-only clamp-to-Danger (tool-catalog.ts:74) — yıkıcı ama döngüsel değil; `Otonom` DEĞİL |
| `ApprovalRisk` | `none` | **Oku** | RISK_RANK en düşük (approval-allowscope.ts:105) |
| `ApprovalRisk` | `low` | **Değiştir** | SAFE_DEFAULT auto-approve sınırında (approval-rules-load.ts:58-59) |
| `ApprovalRisk` | `medium` | **Değiştir** | notify-tier (approval-rules-load.ts:57) — sınır-vaka, bkz. not aşağıda |
| `ApprovalRisk` | `high` | **Çalıştır** | require-approval (approval-rules-load.ts:56) |
| `ApprovalRisk` | `critical` | **Çalıştır** | asla-otomatik + fail-safe-deny (approval-policy.ts:118-122, approval-fallback.ts:109-110) — yine `Otonom` DEĞİL |
| Nervous `RiskLevel` | `low`/`medium`/`high` | **Değiştir / Değiştir / Çalıştır** | approval risk-5'lisiyle aynı sınır mantığı (nervous-types.ts:32) |

**Eşlenemeyen hücre — `Otonom`:** Yukarıdaki 7 kaynak sözlüğün HİÇBİRİ `Otonom`'a doğrudan
eşlenmez. Sebebi yapısal: `Otonom`, "ne kadar tehlikeli" ekseninde değil, **"bu komut sürekli/
makine-başlatımlı bir karar döngüsünü açıp-kapatıyor mu"** eksenindedir (command-registry.ts:36
"autonomous continuous-loop control"). Diğer 7 sözlüğün TAMAMI yalnız tekil-eylem şiddetini
(severity) ölçer. Otonom modun İÇİNDEKİ her bireysel eylem zaten kendi `ApprovalRisk`/nervous
`RiskLevel` etiketini taşımaya devam eder (`autonomous` komutunu ÇALIŞTIRMAK bir kerelik "Çalıştır"
benzeri bir eylemdir; ama SONUCU, insan-döngü-dışı kalıcı bir karar-üretim sürecidir — bu ikisi
farklı şeyler). **Tasarım sonucu:** `Otonom` yalnız `COMMAND_REGISTRY`'de El İLE atanan, hiçbir
otomatik-türetme kuralının üretemeyeceği 4. bir rozet olarak kalmalı (bugün zaten öyle — sadece
3 komut, satır 170-171,174) — bu, §9'daki açık bir tasarım kararı olarak Alperen'e taşınıyor.

**Sınır-vaka notu (`medium`):** `ApprovalRisk.medium` ve nervous `RiskLevel.medium`'u `Değiştir`'e
mi yoksa `Çalıştır`'a mı eşlemeli sorusu ölçülebilir değil (her ikisi de makul) — SAFE_DEFAULT
tablosunun `medium`→`notify` (auto-approve değil ama require-approval de değil) ara-politikası
`Değiştir`'in "yerel-durum mutasyonu, geri-alınabilir" semantiğine `Çalıştır`'ın "işlem başlatma,
genelde geri-alınamaz" semantiğinden daha yakın olduğu için `Değiştir` önerildi; Alperen bu tekil
hücreyi değiştirebilir.

---

## 6. 10 örnek-komut: önce/sonra dili

Aşağıdaki 10 komut, `COMMAND_REGISTRY`'den (disk-değerleri) + varsa `ToolPermission`'dan
seçildi; §4'teki bulguyu (kill/cleanup/recover) ve §5'in `Otonom` ayrımını somutlaştırır.

| # | Komut | ÖNCE (bugünkü ham teknik etiketler) | SONRA (TERM-5 sade dil, önerilen) |
|---|---|---|---|
| 1 | `status` | category=Core, risk=Oku (command-registry.ts:94); ToolPermission=read (default) | **Oku** — "Bilgi görüntüler, hiçbir şeyi değiştirmez." |
| 2 | `plan` | category=Run, risk=Değiştir (127); ToolPermission=confirm (tool-permissions.ts:26) | **Değiştir** — "Yerel plan/görev dosyalarını günceller; onay ister." |
| 3 | `sync` | category=Core, risk=Değiştir (108); ToolPermission=confirm (27) | **Değiştir** — "Proje durumunu senkronize eder; onay ister." |
| 4 | `docs` | category=Core, risk=Değiştir (111); ToolPermission=confirm (29) | **Değiştir** — "Dokümantasyon dosyalarını günceller; onay ister." |
| 5 | `checkpoint` | category=Run, risk=Değiştir (140); ToolPermission=confirm (30) | **Değiştir** — "Bir kontrol-noktası kaydeder; onay ister." |
| 6 | `start` | category=Run, risk=Çalıştır (126); ToolPermission=read (dispatch bridge'de yok, spawn işlemi) | **Çalıştır** — "Bir sprint sürecini başlatır (spawn)." |
| 7 | `kill` | category=Danger, risk=Çalıştır (177); ToolPermission=**always** (tool-permissions.ts:19) | **Çalıştır** *(⚠️ her seferinde onay — safety floor)* — "Çalışan bir agent/sprint'i SONLANDIRIR, geri alınamaz." |
| 8 | `cleanup` | category=Danger, risk=**Değiştir** (178) ⚠️ TUTARSIZ | **Çalıştır** *(⚠️ her seferinde onay — safety floor)* — "Sprint durumunu TEMİZLER, geri alınamaz." *(bkz. §4: bugünkü etiket düzeltme adayı)* |
| 9 | `recover` | category=Danger, risk=**Değiştir** (179) ⚠️ TUTARSIZ | **Çalıştır** *(⚠️ her seferinde onay — safety floor)* — "Yarım kalmış sprint durumunu KURTARIR, durum-değiştirici." *(bkz. §4)* |
| 10 | `autonomous` | category=Enterprise, risk=**Otonom** (170) — TEK, ToolPermission mapping'i YOK (REPL bridge'de yer almıyor) | **Otonom** — "Sürekli, insan-döngü-dışı bir karar/iş üretim döngüsü açar; içindeki HER eylem kendi ayrı onay-riskini taşımaya devam eder." |

---

## 7. `getMessage`-key taslağı (TASLAK — messages.ts'e yazılmadı, write-scope dışı)

`CLAUDE.md` i18n-FIRST kuralı gereği (`getMessage(key, lang)`, en/tr, İngilizce default) —
mevcut `messages.ts` biçimine (bkz. `approval_card.risk_*`, satır 2245-2249) birebir uyan taslak:

```ts
// cmdCatalog.* — TERM-5 plain-risk-language ladder (CommandRisk badge text)
// Namespace precedent: command-registry.ts:82 zaten `cmdCatalog.${name}.summary` üretiyor;
// bu anahtarlar aynı namespace altında risk-rozeti alt-alanı olur.
'cmdCatalog.risk.oku':       { en: 'Read',     tr: 'Oku' },
'cmdCatalog.risk.degistir':  { en: 'Modify',   tr: 'Değiştir' },
'cmdCatalog.risk.calistir':  { en: 'Execute',  tr: 'Çalıştır' },
'cmdCatalog.risk.otonom':    { en: 'Autonomous', tr: 'Otonom' },

// Kısa açıklama (ör. /help detay görünümü veya dashboard tooltip için) — opsiyonel 2. katman
'cmdCatalog.risk.oku.desc':      { en: 'Displays information only — nothing changes.',
                                   tr: 'Yalnızca bilgi gösterir — hiçbir şey değişmez.' },
'cmdCatalog.risk.degistir.desc': { en: 'Modifies local project state; asks for confirmation.',
                                   tr: 'Yerel proje durumunu değiştirir; onay ister.' },
'cmdCatalog.risk.calistir.desc': { en: 'Starts/spawns a process or performs an irreversible action.',
                                   tr: 'Bir süreç başlatır veya geri alınamaz bir işlem yapar.' },
'cmdCatalog.risk.otonom.desc':   { en: 'Opens a continuous, human-out-of-the-loop decision loop.',
                                   tr: 'Sürekli, insan-döngü-dışı bir karar döngüsü açar.' },
```

Konsuma edilecek noktalar (bu taslağın gelecekteki bir wiring task'ının kapsamı, bu task'ın
DEĞİL): `chat-native.ts:451-466` (`buildHelpCatalogEntries`/`buildHelpCatalogLabels`) ve
`src/dashboard/src/i18n/{tr,en}.ts` (komut-katalog paneli varsa).

---

## 8. Alperen'in karar vermesi gereken noktalar (özet)

1. §5'teki tek-eşleme tablosunu (7 kaynak sözlük → `CommandRisk`) kanonik-öneri olarak kabul
   etmek — özellikle `medium`→`Değiştir` sınır-vaka kararı (§5 son not).
2. §4'teki kill/cleanup/recover tutarsızlığını bir **ayrı, küçük düzeltme task'ı** olarak
   onaylamak (command-registry.ts:178-179'da `risk: 'Değiştir'` → `'Çalıştır'` — bu doküman bu
   değişikliği YAPMAZ, yalnız kanıtlar; `nogo: kod` bu task'ı bağlıyor).
3. `Otonom`'un yalnız el-ile-atanan, otomatik-türetilemeyen 4. rozet olarak kalmasını (§5,
   "Eşlenemeyen hücre") onaylamak.
4. §7'deki `getMessage` taslağının gerçek `messages.ts`'e yazılmasını + `/help` katalog +
   dashboard wiring'ini ayrı bir follow-up task olarak sıraya almak.

---

## 9. Önerilen Karar (ADR-taslak — status: PROPOSED, Alperen onayı bekliyor)

> Bu bölüm ADR formatındadır ama bir `docs/adr/*.md` dosyası DEĞİLDİR ve `.brain/memory.db`'ye
> `store.insert({type:'adr', ...})` ile KAYDEDİLMEMİŞTİR. Alperen onaylarsa, bu bölüm ayrı bir
> `docs/adr/adr-d-009-term5-risk-language.md` dosyasına + ADR-DB kaydına dönüştürülür.

**Class:** ADR-D (proje-özel, terminal/CLI UX) · **Scope:** `src/cli/command-registry.ts`,
`src/cli/helpers/messages.ts`, `src/cli/commands/chat-native.ts`, `src/cli/helpers/catalog-render.ts`
· **Status:** proposed (NOT accepted)

### Context
TERM-5'in hedef 4-seviyeli sade risk-dili (`CommandRisk`) zaten `command-registry.ts`'de
kod-seviyesinde var (§1), ama (a) i18n'i yok, (b) hiçbir UI'a bağlı değil, (c) kod-tabanında
onunla örtüşen/çelişen 7 başka risk sözlüğü var (§2-3), ve (d) en az bir somut cross-surface
tutarsızlık ölçüldü (§4, kill/cleanup/recover).

### Decision (önerilen, henüz kabul değil)
1. `CommandRisk` (Oku/Değiştir/Çalıştır/Otonom), kullanıcıya-görünen TÜM yüzeylerde (REPL `/help`,
   dashboard komut paleti, gelecekteki CLI `--help`) gösterilecek **tek kanonik risk-dili** olarak
   benimsenir.
2. Diğer 7 iç sözlük (§2-3) **korunur, silinmez** — her biri kendi mühendislik-amacına hizmet
   etmeye devam eder (approval zamanlama politikası, REPL confirm-gating, MCP güven rozeti
   sınıflandırması). Bu ADR onların davranışını DEĞİŞTİRMEZ.
3. §5'teki tek-eşleme tablosu, her iç sözlükten `CommandRisk`'e **salt-görüntüleme amaçlı, saf
   fonksiyon** olarak kod-tabanına eklenecek bir follow-up task'ın SPESİFİKASYONU olur (bu ADR
   kapsamında YAZILMAZ — nogo: kod).
4. §4'teki kill/cleanup/recover tutarsızlığı, bu ADR'nin kabulünden BAĞIMSIZ, ayrı ve daha küçük
   bir düzeltme task'ı olarak ele alınabilir (tek satırlık risk-değeri değişikliği,
   command-registry.ts:178-179).
5. §7'deki `getMessage` taslağı, bu ADR kabul edilirse gerçek `messages.ts` girdilerine
   dönüştürülür (ayrı task, MESSAGES-KEYS ailesi — bkz. §2.3'teki "round-8" emsali).
6. Kalıcı kayıt: `docs/MASTER-PLAN.md` #45 durumu, bu dokümanın ürettiği kanıt/öneri ile
   🔬'dan "kanıt-hazır, Alperen kararı bekliyor" (🟡) durumuna geçebilir (MASTER-PLAN bu task'ın
   write-scope'u dışında — `docImpact` olarak `.result`'ta işaretlendi).

### Consequences
**(+)** Kod zaten büyük ölçüde hazır (`CommandRisk` + 75 komutun tamamına etiket) — bu ADR'nin
kabulü çoğunlukla i18n + UI-wiring + tek-küçük düzeltmeyi (kill/cleanup/recover) tetikler, yeni
bir mimari inşa etmez. **(+)** Diğer 7 sözlük dokunulmadan kalır — regresyon riski düşük.
**(−)** 7-sözlük sprawl'ı bu ADR ile ORTADAN KALKMAZ, yalnız kullanıcıya-görünen katmanda
maskelenir — ileride yeni bir 9. sözlük eklenirse (ör. yeni bir onay-akışı) aynı sürüklenme riski
tekrar oluşabilir; bu ADR bunu önleyecek bir lint/test-guard ÖNERMEZ (ayrı bir follow-up, §10).

---

## 10. Açık sorular / follow-up iş kalemleri

- **RISK-DRIFT-GUARD:** §4'teki gibi bir tutarsızlığın gelecekte sessizce oluşmasını önleyecek bir
  test (ör. `tool-permissions.ts`'in `ALWAYS_CONFIRM` seti ile `COMMAND_REGISTRY`'nin
  `Çalıştır`/üstü etiketleri arasında bir invariant-test) — bu doküman kapsamı dışında, ayrı task.
- **CMDCATALOG-I18N-WIRE:** §7'deki taslağın gerçek `messages.ts`'e yazılması + `/help` ve
  dashboard tüketici-wire'ı (chat-native.ts:451-466 örneğini izleyerek) — ayrı task.
  `src/dashboard/src/i18n/{tr,en}.ts`'in de bu anahtarlara ihtiyacı olup olmadığı, dashboard'da
  komut-katalog paneli olup olmadığına bağlı — bu doküman bunu doğrulamadı (scope: `src/cli/`).
- **KILL-CLEANUP-RECOVER-FIX:** §4/§9 madde 4 — tek-satırlık düzeltme (`command-registry.ts:178-179`
  `risk: 'Değiştir'` → `'Çalıştır'`), `tests/cli/command-registry.test.ts`'in mevcut testlerini
  KIRMAZ (sadece VALID_RISKS üyeliğini kontrol ediyor, spesifik değer eşleşmesini değil — doğrulandı:
  satır 48-51'de `VALID_RISKS.includes(e.risk)` kontrolü var, sabit-değer assertion'ı yok).
- **APPROVAL-CARD-I18N-WIRE:** §2.3 — `approval_card.risk_*` anahtarları zaten var ama yetim;
  `app.tsx:363-375`'i `getMessage`'a bağlamak bu dokümanın kapsamı dışında ama TERM-5'ten BAĞIMSIZ
  olarak zaten bekleyen bir iş (kod-yorumunda "Messages round-8 (Task 15, MESSAGES-KEYS-4)" olarak
  anılıyor — bu görevin gerçekten var olup olmadığı/atanıp atanmadığı doğrulanmadı, yalnız kod
  içi referans kaydedildi).
- **ToolPermission KAPSAMAYAN komutlar:** §6 örnek #6 (`start`) ve #10 (`autonomous`) gösteriyor
  ki `tool-permissions.ts`'in `classifyTool` fonksiyonu yalnız REPL slash-dispatch üzerinden
  geçen komutları kapsıyor — CLI-only komutlar (`start`, `spawn`, `serve`, ...) için bir
  `ToolPermission` değeri YOK. §5'teki eşleme bu boşluğu DOLDURMAZ; `CommandRisk` zaten bu
  komutları da kapsadığı için TERM-5'in kanonik-sözlük olması bu boşluğu otomatik telafi ediyor.
