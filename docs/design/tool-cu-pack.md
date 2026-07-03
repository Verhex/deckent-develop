# TOOL-CU — Computer-Use/Browser Opsiyonel Automation-Pack Tasarım Notu (MASTER-PLAN #83 / Sıra-83)

**ADR Reference:** taslak (bkz. §9 "Önerilen Karar" — henüz kabul edilmedi)
**Status:** Design-note / kanıt+öneri paketi (Alperen karar-kapısı — bu doküman KARAR VERMEZ,
kod/config/i18n/ADR-DB değişikliği İÇERMEZ; `nogo: kod` bu task'ı bağlar)
**Date:** 2026-07-03
**Author:** worker (sprint-363, task 363-013)
**İlişkili dokümanlar:** `docs/MASTER-PLAN.md` #83 (TOOL-CU, "Computer-use/browser opsiyonel
automation pack", CX, P2, §6 P2) · `DIRECTIVES.md` Task 12 (Sıra-83) · `docs/design/term5-risk-language.md`
(TERM-5 risk-dili — bu dokümanın §4'ü onunla tutarlı kalır) · `docs/design/nl-dispatch-default-decision.md`
(bu dokümanın biçim-emsali) — bu üç doküman aynı "kanıt+öneri, Alperen karar verir" kalıbını izler.

---

## 1. Bağlam & mevcut durum (disk-verify)

`docs/MASTER-PLAN.md:98`, satır 83: `TOOL-CU | TOOL | Computer-use/browser opsiyonel automation
pack | CX | P2 | — | ⬜ | — | §6 P2` — durum hâlâ ⬜ (başlanmadı), bağımlılık yok, öncelik P2.
`DIRECTIVES.md:196-208` (Task 12) bu satırı şu dört alt-soruya ayırıyor: (a) mevcut emsal
(playwright-MCP), (b) risk-sınıfı (Danger-tier), (c) approval-zorunluluğu, (d) sandbox-gereksinimi
— artı bir uygulama-zamanlama önerisi ("post-7-Tem").

**Disk-doğrulama — bugün depoda NE VAR:**
- Proje kökünde `.mcp.json` YOK (kontrol edildi: `find /workspace -maxdepth 1 -iname ".mcp.json"`
  sonuç boş) — yani playwright-mcp veya başka bir harici browser-automation MCP sunucusu bu
  depoya BUGÜN bağlı DEĞİL. "playwright-MCP mevcut-emsali" ifadesi, depo-içi bir entegrasyona
  değil, **ekosistem-emsaline** (Microsoft'un `@playwright/mcp` paketi — MCP protokolüyle
  browser-otomasyonu sunan, herhangi bir MCP host'a (Claude Code dahil) `.mcp.json` üzerinden
  eklenebilen, yaygın kullanılan harici bir sunucu) işaret eder.
- `src/mcp/tools/index.ts:1-33` deckent'in KENDİ MCP sunucusudur (deckent'in tool'larını dışa
  açar — `registerInitTool`, `registerPlanTool`, ... 30+ `register*Tool` çağrısı). Bu, playwright-mcp
  gibi bir sunucunun deckent'e **client olarak bağlanacağı** yön ile TERSTİR: deckent burada
  MCP-server, olası bir browser-pack ise deckent worker'larının **tükettiği** ayrı bir MCP-server
  olur.
- `src/core/tool-registry.ts:8-16` bu iki yönü zaten ayırt eden bir köprü tanımlıyor:
  `ToolSourceShape` (yapısal/duck-typed, `McpServer#registerTool`'un 2. argümanını taklit eder)
  — core/ paketi mcp/ paketini import ETMEZ (ADR-D-004 C1), ama şekli uyan HERHANGİ bir kaynak
  (harici bir MCP sunucusunun tool tanımları dahil) registry'yi besleyebilir. Bu, bir browser-pack'in
  tool-registry'ye **kod değişikliği gerektirmeden** (yalnız seed-çağrısıyla) girebileceği anlamına
  gelir — §7'de bu köprü kullanılıyor.

---

## 2. Kapsam (scope)

**Kapsam-İÇİ (bu pack'in amacı):** worker'lara, dosya-sistemi/shell dışında bir üçüncü
"gerçek-dünya etkileşim" kanalı açan **opsiyonel** bir tool ailesi — sayfa gezinme (navigate),
DOM okuma/screenshot, form doldurma/tıklama, bekleme/assert. "Opsiyonel" = varsayılan-kapalı,
proje `.deckent/config.json`'da açıkça etkinleştirilmeden hiçbir worker'a sunulmaz (bkz. §7
mevcut `toolsets.json` enable/disable emsali, MASTER-PLAN #24 TOOL-REG, `src/core/config.ts`).

**Kapsam-DIŞI (bu doküman + önerilen ilk uygulama dilimi):**
- Anthropic'in native "computer use" (tam ekran/işletim-sistemi kontrolü, klavye/fare
  event-injection) YOK — yalnız **browser-scoped** otomasyon (playwright-mcp'nin kendi kapsamı da
  budur). Tam masaüstü kontrolü çok daha geniş bir tehdit-yüzeyi açar ve bu P2 dilimine dahil
  değildir; ayrı bir gelecekteki MASTER-PLAN satırı olmalı (§10).
- Kimlik-bilgisi/oturum yönetimi (otomatik login, kayıtlı-parola doldurma) YOK — §6'daki
  sandbox-profili bunu açıkça reddediyor.
- Bu doküman **kod yazmaz** (`nogo: kod`) — yalnız sınırları ve entegrasyon sırasını tanımlar.
- Worker-tarafı otomatik dispatch YOK: `src/core/tool-dispatch.ts:12-14` bugün ApprovalBroker'a
  KABLOSUZ (bkz. §5) — bu pack, o kablo döşenmeden hiçbir gerçek eylem çalıştıramaz; bu bir
  tasarım kısıtı değil, mevcut bir **sıralama bağımlılığıdır** (§7).

---

## 3. Mevcut emsal — playwright-MCP + deckent'in kendi MCP-seed köprüsü

playwright-mcp modeli (ekosistem-emsali) üç ilkeye dayanır: (1) her tool çağrısı ayrı bir
zod-şemalı komut (`browser_navigate`, `browser_click`, `browser_snapshot`, ...), (2) sunucu
kendi headless/headful Chromium/Firefox/WebKit örneğini yönetir (deckent'in worker'ı yalnız
MCP protokolü üzerinden konuşur, tarayıcı süreciyle DOĞRUDAN konuşmaz), (3) `readOnlyHint`/
`destructiveHint`-tarzı annotation'lar tool-tanımına eklenebilir (ör. `browser_snapshot` salt-okunur,
`browser_click`/`browser_fill` yıkıcı-potansiyelli).

deckent tarafında bu üç ilke, mevcut ÜÇ modülle **kod değişikliği olmadan** hizalanıyor:
- `src/core/tool-registry.ts:45-51` (`deriveRiskFromAnnotations`) — `destructiveHint`→destructive,
  `readOnlyHint`→safe, aksi→moderate. playwright-mcp'nin annotation'ları BU fonksiyona doğrudan
  beslenebilir.
- `src/core/tool-registry.ts:28-34` (`TOOL_CATEGORIES`) — `'automation'` kategorisi zaten var
  ("autonomous, process, nervous_*" örnekleriyle) ve browser-pack'in doğal ev sahibi.
  Yeni bir kategori eklemek GEREKMEZ.
- `src/core/tool-catalog.ts:45-48` (`ToolCatalogSource` = `'builtin'|'project'|'mcp'|'enterprise'`)
  — playwright-mcp seed'i `source: 'mcp'` olarak sınıflanır; bu **zaten var olan** bir değerdir,
  yeni bir source-türü gerekmiyor.

**Sonuç:** playwright-mcp'nin (veya benzeri herhangi bir browser-MCP sunucusunun) deckent'e
bağlanması için tool-registry/tool-catalog katmanında **yeni tip tanımı gerekmiyor** — yalnız
bir seed-çağrısı (§7) ve §4'teki risk-override gerekiyor.

---

## 4. Risk-sınıfı (Danger-tier) — satır-ref'li öneri

deckent'te risk üç bağımsız yerde ayrı ayrı temsil ediliyor (`docs/design/term5-risk-language.md`
§3'ün 8-sözlük envanterinin bir alt-kümesi); browser-pack'in HER ÜÇÜNDE de nasıl sınıflanması
gerektiği aşağıda satır-referanslı olarak öneriliyor:

| Sözlük | Kaynak | Önerilen değer | Gerekçe |
|---|---|---|---|
| `ToolCatalogRiskLevel` | `tool-catalog.ts:38-41` (`'safe'\|'moderate'\|'destructive'\|'critical'`) | **`critical`** (annotation'dan bağımsız, HARD-CODE override) | `tool-catalog.ts:73-76` (`classifyToolTrust`) zaten `riskLevel==='critical'` durumunda kaynağı ne olursa olsun `'Danger'`'a clamp ediyor — bu davranışı KULLANMAK, yeni kod gerektirmeden istenen sonucu verir. `deriveRiskFromAnnotations` (`tool-registry.ts:45-51`) playwright-mcp'nin annotation'larına göre bazı komutları (`browser_snapshot`) `safe` üretebilir — ama browser-otomasyonu dosya-okuma gibi kapalı bir sistemde değil, **canlı, üçüncü-taraf, deckent'in kontrolü dışındaki web sayfaları** üzerinde çalışır; bir "salt-okunur" DOM-okuma bile prompt-injection (sayfa içeriği agent bağlamına geri akar — bkz. `approval-contract.ts:8-9`'un `rawArgsRef` redaksiyon-öncül gerekçesiyle aynı sınıf tehdit) taşıyabilir. Öneri: annotation-türetimini KULLANMA, tüm browser-pack tool'larını (okuma dahil) toptan `critical`'a sabitle. |
| `ToolTrustTier` | `tool-catalog.ts:31-34` (5 değer) | **`Danger`** | Doğrudan yukarıdaki `critical` clamp'inin sonucu — ayrı bir karar gerekmiyor. |
| `CommandRisk` (TERM-5) | `command-registry.ts:38` (`'Oku'\|'Değiştir'\|'Çalıştır'\|'Otonom'`) | **`Çalıştır`**, tekil-komut olarak dışa açılırsa | `term5-risk-language.md` §6 satır 212-215, `kill`/`autonomous` örnekleriyle aynı ayrım mantığı: browser-pack TEKİL bir eylemdir (bir sayfa-etkileşim dizisi), `command-registry.ts:36`'daki "sürekli/makine-başlatımlı karar döngüsü" (Otonom'un tanımı) DEĞİLDİR — insan hâlâ her adımı (approval üzerinden, §5) onaylıyor. `term5-risk-language.md` §4'ün kill/cleanup/recover'daki tutarsızlık-bulgusunu (bir `Danger`-kategori komutunun `Değiştir` yerine `Çalıştır` olması gerektiği) burada TEKRARLAMAMAK için: browser-pack `COMMAND_REGISTRY`'ye eklenirse `entry('browser', 'Danger', 'Çalıştır', ...)` deseni kullanılmalı — `command-registry.ts:177` (`kill`) ile birebir aynı satır-kalıbı. |
| `ApprovalRisk` | `approval-contract.ts:39` (5 değer) | **`critical`** | §5'te detaylandırılıyor. |

**Not — annotation-güvenmeme kararı gerekçesi:** `tool-registry.ts:47-52`'nin türetim kuralı
(`readOnlyHint`→safe) *dosya-sistemi/API tool'ları* için makuldür (kapalı, deterministik sistem).
Browser-otomasyonu için makul DEĞİLDİR çünkü "salt-okunur" bir DOM-snapshot, saldırganın
kontrolündeki bir web sayfasının HTML/JS içeriğini agent'ın bağlamına taşıyabilir (klasik
prompt-injection vektörü) — annotation'ın işaretlediği "dosya sistemine yazmıyor" garantisi,
"agent'ın karar sürecini etkilemiyor" garantisini VERMEZ. Bu yüzden §4 tablosu, playwright-mcp'nin
kendi annotation'larını görmezden gelip TÜM browser-pack tool'larını `critical`'a sabitlemeyi
öneriyor — bu, Alperen'in §9'da onaylayacağı açık bir tasarım kararıdır.

---

## 5. Approval-zorunluluğu — satır-ref'li zincir + açık boşluk

§4'ün `critical` sınıflandırması, deckent'in MEVCUT approval altyapısına şu zincirle bağlanır
(hiçbiri bu doküman kapsamında değişmiyor — hepsi zaten var):

1. `src/core/approval-rules-load.ts:54-60` (`SAFE_DEFAULT_APPROVAL_RULES`) — `risk:'critical'`
   → `action:'require-approval'` (ilk satır, en kısıtlayıcı).
2. `src/core/approval-policy.ts:70,98,118-122` — `critical` asla `'auto-approve'`'a çözülemez;
   bu bir HARD clamp (kural-tablosu ne derse desin).
3. `src/core/approval-fallback.ts:19-20,109-110` — `risk==='critical'` VE erişilebilir bir
   eskalasyon-kanalı yoksa → `'deny'` (fail-safe). Yani bir browser-pack eylemi, onay-akışı
   (Telegram/Discord/dashboard/terminal) hiç bağlı değilse SESSİZCE ÇALIŞMAZ — güvenli varsayılan.
4. `src/core/approval-broker.ts:169,211` (`submit()`/`decide()`) — bu zincirin çalışma-zamanı
   yürütücüsü; her browser-pack eylemi çağrılmadan önce `ApprovalBroker.submit()` ile bir istek
   açmalı ve `awaitDecision`/`decide()` sonucunu beklemelidir.

**Açık boşluk (bu dokümanın en önemli bulgusu):** `approval-contract.ts:31-39`'daki
`approvalScopeSchema` yalnız 7 değer taşıyor — `file-read`, `file-write`, `shell-exec`,
`git-mutation`, `network`, `credential`, `lifecycle`. **Bunların HİÇBİRİ "tarayıcı/UI-etkileşimi"
anlamına doğrudan gelmiyor.** İki seçenek var:

- **Seçenek A (yeniden-kullan):** `scope:'network'` + `risk:'critical'` ikilisiyle mevcut şemayı
  DEĞİŞTİRMEDEN kullan — browser-otomasyonu zaten ağ-üzerinden bir sayfaya erişim içerir, `network`
  scope'u anlamsal olarak en yakını. Dezavantaj: dashboard/approval-kartı kullanıcıya "network"
  gösterir, "bir web sayfasıyla etkileşim" değil — UX-belirsizliği.
- **Seçenek B (genişlet):** `approvalScopeSchema`'ya 8. bir değer ekle (ör. `'browser-action'`) —
  daha net UX, ama `approval-contract.ts`'i (ve ona bağlı her tüketiciyi) değiştirmek gerektirir;
  bu dosya bu doküman'ın write-scope'unda DEĞİL (`nogo: kod`), ayrı bir task olur.

Bu doküman Seçenek A'yı **ilk-dilim önerisi** olarak öneriyor (sıfır şema-değişikliği, hemen
kullanılabilir) — Seçenek B, §10'da bir follow-up olarak bırakılıyor. Alperen §9'da bu tercihi
onaylar/değiştirir.

**Blocking sıralama-notu:** `tool-dispatch.ts:12-14` bu zincirin worker-tarafı `confirm` seam'ini
ApprovalBroker'a bağlamayı "explicitly future work" olarak işaretliyor — yani BUGÜN, hiçbir
tool-dispatch çağrısı gerçekten ApprovalBroker'a uğramıyor. Browser-pack bu kabloyu KENDİSİ
DÖŞEMEMELİ (scope-dışı) — operating_rules'ün P0 önceliği olan "runtime-wide ApprovalBroker"
(CLAUDE.md `<operating_rules>` "Aktif Yön" notu) tamamlanana kadar bu pack'in gerçek-yürütme
dilimi BAŞLAYAMAZ. §7 ve §8 bu bağımlılığı sıralamaya yansıtıyor.

---

## 6. Sandbox-gereksinimi — mevcut izolasyon emsalinin genişletilmesi

deckent worker'ları zaten varsayılan olarak Docker'da izole çalışıyor
(`src/core/config.ts:1188-1189`, `spawn_backend:'docker'`; `src/orchestra/spawn-backend-docker.ts:1-4`,
"Each worker gets its own filesystem namespace"; `Dockerfile.worker` depo kökünde mevcut). Bu,
browser-pack için TABAN izolasyon katmanıdır — ayrıca şu üç sertleştirme öneriliyor:

1. **Ağ-kısıtlama:** `src/providers/sandbox.ts:9-17,28-41` (`SandboxOptions.blockNetwork`,
   `SandboxSpawnBackend`) bugün genel bir aç/kapa bayrağı — browser-pack'in doğası gereği ağ
   TAMAMEN kapatılamaz (sayfaya gitmesi gerekiyor). Öneri: `blockNetwork` yerine/yanında bir
   **domain-allowlist** modu (yalnız görev-kapsamındaki host'lara izin) — bu, mevcut
   `SandboxOptions` arayüzüne yeni bir alan eklemeyi gerektirir (kod-değişikliği, bu dokümanın
   scope'u dışında — follow-up, §10).
2. **Kalıcı-durum yok:** browser-profili (çerezler, localStorage, kayıtlı oturumlar) worker
   container'ı her sprint-task'ından sonra silinen bir konumda (container'ın kendi geçici
   dosya-sistemi, `.tasks/` paylaşımlı volume'unun DIŞINDA) tutulmalı — §2'nin "kimlik-bilgisi
   yönetimi kapsam-dışı" kararıyla tutarlı.
3. **Statik ön-tarama:** `src/core/marketplace/skill-sandbox.ts:9-16,30-39`'un regex+AST
   iki-geçişli tarama deseni (eval/Function/child_process/process.env kullanım tespiti,
   "quarantine" karar-modeli) — üçüncü-taraf bir MCP sunucusunun (playwright-mcp veya bir fork'unun)
   KENDİ kod tabanını, worker'a bağlanmadan ÖNCE aynı desenle taramak, marketplace skill'leri için
   zaten var olan bir emsali browser-pack'in tedarik-zincirine de uygulamak anlamına gelir — yeni
   bir mekanizma icat etmeden mevcut deseni yeniden kullanma önerisi.

---

## 7. Entegrasyon önerisi (satır-ref'li, somut sıralama)

Aşağıdaki adımlar **bu doküman TARAFINDAN yapılmıyor** (`nogo: kod`) — her biri ayrı, gelecekteki
bir task'ın spesifikasyonudur; sıralama bağımlılıkları açıkça işaretlidir.

1. **SEED (bağımsız, ilk-yapılabilir):** playwright-mcp'nin tool tanımlarını
   `tool-registry.ts:8-16`'daki `ToolSourceShape` köprüsünden geçirip registry'ye seed et;
   her girişte `riskLevel:'critical'` HARD-CODE et (§4 — annotation-türetimine GÜVENME).
   Kategori: mevcut `'automation'` (`tool-registry.ts:28-34`, değişiklik gerekmiyor).
2. **CATALOG (SEED'e bağımlı):** `tool-catalog.ts`'e `source:'mcp'` + `riskLevel:'critical'`
   girişleri ekle → `classifyToolTrust` otomatik olarak `'Danger'` tier üretir (`tool-catalog.ts:73-76`,
   kod-değişikliği YOK, yalnız veri-girişi).
3. **APPROVAL-WIRE (BLOKE — §5'in P0 bağımlılığı):** `tool-dispatch.ts`'in `confirm` seam'i
   runtime-wide ApprovalBroker'a bağlanana kadar (operating_rules P0 kalemi) bu adım
   BAŞLAYAMAZ. Bağlandığında: her browser-pack çağrısı `ApprovalBroker.submit()`
   (`approval-broker.ts:169`) ile `scope:'network'` (§5 Seçenek A) + `risk:'critical'` request'i
   açmalı.
4. **SANDBOX-HARDEN (bağımsız, paralel yapılabilir):** §6'nın 3 önerisi — domain-allowlist,
   geçici-profil, statik ön-tarama.
5. **COMMAND-ENTRY (opsiyonel, yalnız tekil-komut olarak dışa açılırsa):**
   `command-registry.ts`'e `entry('browser', 'Danger', 'Çalıştır', 'automation', [...], [...])`
   deseninde bir giriş (`kill` girişiyle, `command-registry.ts:177`, birebir aynı kalıp) —
   `term5-risk-language.md`'nin i18n-taslağıyla (o dokümanın §7'si) aynı yoldan `getMessage`
   anahtarları gerektirir (CLAUDE.md i18n-FIRST kuralı).

**Sıralama grafiği:** `SEED → CATALOG` bağımsız/hemen; `SANDBOX-HARDEN` paralel; `APPROVAL-WIRE`
runtime-wide ApprovalBroker P0'ına bloke; `COMMAND-ENTRY` yalnız `APPROVAL-WIRE` tamamlandıktan
SONRA anlamlı (onaysız bir Danger-tier komutu kullanıcıya sunmak yarı-özellik olur).

---

## 8. Post-7-Temmuz uygulama sıralaması (öneri — tarih taahhüdü değil, sıra önerisi)

Bugün 2026-07-03; DIRECTIVES.md Task 12'nin "post-7-Tem" notu depoda başka hiçbir yerde
tarihlenmiş bir plana bağlı değil (grepledi: `DIRECTIVES.md`/`docs/MASTER-PLAN.md` içinde tek
geçiş bu satırın kendisi) — bu yüzden bu bölüm yalnız bir **sıra önerisi**dir, taahhüt edilmiş
bir tarih değil:

1. Alperen §9'daki kararları onaylar/değiştirir (özellikle §5 Seçenek A/B, §4'ün
   annotation-güvenmeme kararı).
2. §7 adım 1-2 (SEED+CATALOG) — bağımsız, en düşük riskli, hemen kod-task'ı olabilir.
3. §7 adım 4 (SANDBOX-HARDEN) — paralel yürütülebilir, ayrı task.
4. runtime-wide ApprovalBroker P0'ı (operating_rules — bu dokümanın kapsamı DIŞINDA, deckent'in
   kendi öncelik-sırasında zaten P0) tamamlanır.
5. §7 adım 3 (APPROVAL-WIRE) — adım 4'e bağımlı, browser-pack'in GERÇEK yürütme yeteneği
   burada açılır.
6. §7 adım 5 (COMMAND-ENTRY) — opsiyonel, yalnız tekil-komut UX'i isteniyorsa.

---

## 9. Önerilen Karar (ADR-taslak — status: PROPOSED, Alperen onayı bekliyor)

> Bu bölüm ADR formatındadır ama bir `docs/adr/*.md` dosyası DEĞİLDİR ve `.brain/memory.db`'ye
> `store.insert({type:'adr', ...})` ile KAYDEDİLMEMİŞTİR. Alperen onaylarsa, bu bölüm ayrı bir
> `docs/adr/adr-d-0XX-tool-cu-pack.md` dosyasına + ADR-DB kaydına dönüştürülür.

**Class:** ADR-D (proje-özel, tool/güvenlik) · **Scope:** `src/core/tool-registry.ts`,
`src/core/tool-catalog.ts`, `src/core/approval-contract.ts` (yalnız Seçenek B seçilirse),
`src/providers/sandbox.ts`, `src/cli/command-registry.ts` (yalnız COMMAND-ENTRY seçilirse) ·
**Status:** proposed (NOT accepted)

### Context
MASTER-PLAN #83 (TOOL-CU) opsiyonel bir computer-use/browser automation-pack'i P2 olarak
işaretliyor ama sınırları tanımlı değildi. Bu doküman playwright-mcp'yi ekosistem-emsali alarak
dört sınırı (kapsam, risk, approval, sandbox) mevcut deckent altyapısına satır-ref'li olarak
bağladı (§2-6) ve bir entegrasyon sırası önerdi (§7-8).

### Decision (önerilen, henüz kabul değil)
1. Browser-pack, deckent'in kendi MCP-server'ına DEĞİL, worker'ların **tükettiği** harici bir
   MCP-server (playwright-mcp veya benzeri) olarak modellenir — `source:'mcp'` (§3).
2. TÜM browser-pack tool'ları, annotation'dan bağımsız, `riskLevel:'critical'` → `Danger`-tier
   → `ApprovalRisk:'critical'` olarak sabitlenir (§4) — "salt-okunur" bir browser-eylemi
   diye bir Oku-seviyesi kabul edilmez.
3. Approval-scope için Seçenek A (mevcut `'network'` scope'unu yeniden-kullan, şema
   değiştirme) ilk-dilim olarak benimsenir; Seçenek B (yeni `'browser-action'` scope'u) ayrı
   bir follow-up'a bırakılır (§5).
4. Bu pack'in GERÇEK yürütme yeteneği (yalnız katalog/seed değil), runtime-wide ApprovalBroker
   P0'ının `tool-dispatch.ts` confirm-seam'ini bağlamasına BLOKE'dir (§5 sıralama-notu, §7 adım 3).
5. Sandbox, mevcut Docker worker-izolasyonu üzerine üç ek sertleştirme alır: domain-allowlist,
   kalıcı-profil-yok, statik ön-tarama (§6) — bunlar ayrı follow-up kod-task'larıdır.
6. Kalıcı kayıt: `docs/MASTER-PLAN.md` #83 durumu, bu dokümanın önerisiyle ⬜'dan "kanıt-hazır,
   Alperen kararı bekliyor" (🟡) durumuna geçebilir (MASTER-PLAN bu task'ın write-scope'u
   dışında — `docImpact` olarak `.result`'ta işaretlendi).

### Consequences
**(+)** Sıfır yeni tip-tanımı gerekiyor tool-registry/tool-catalog katmanında (§3) — mevcut
`'mcp'` source + `'critical'` risk + `'automation'` kategori zaten yeterli. **(+)** Approval-zinciri
(§5) tamamen mevcut altyapıyı yeniden kullanıyor, yeni bir onay-mekanizması icat etmiyor.
**(−)** Annotation-güvenmeme kararı (§4), playwright-mcp'nin kendi risk-sinyallerini görmezden
geliyor — ileride playwright-mcp gerçekten güvenli-taranmış salt-okunur bir mod sunarsa, bu
"toptan-critical" politikası aşırı-kısıtlayıcı kalabilir; bu ADR bunun için bir gevşetme yolu
ÖNERMİYOR (bilinçli, ilk-dilim için tercih edilen fail-safe taraf). **(−)** APPROVAL-WIRE'ın
runtime-wide ApprovalBroker P0'ına blokajı, bu pack'in gerçek kullanılabilirliğini deckent'in
kendi ayrı önceliklendirmesine bağımlı kılıyor — bu doküman o bağımlılığı ÇÖZMÜYOR, yalnız
kaydediyor (§5, §8).

---

## 10. Açık sorular / follow-up iş kalemleri

- **CU-SCOPE-ADR:** §5 Seçenek A/B arası Alperen kararı — `'network'` yeniden-kullanımı mı,
  yoksa `approval-contract.ts:31-39`'a yeni bir `'browser-action'` scope-değeri mi eklensin.
- **CU-SANDBOX-ALLOWLIST:** `src/providers/sandbox.ts:9-17`'deki `SandboxOptions`'a bir
  domain-allowlist alanı eklenmesi (§6 madde 1) — ayrı kod-task, bu dokümanın scope'u dışında.
  ADR-D-005 (Dependency Policy) kapsamında yeni bir allowlist-kütüphanesi gerekip
  gerekmediği o task'ta değerlendirilmeli.
- **CU-SUPPLY-CHAIN-SCAN:** `skill-sandbox.ts`'nin statik-tarama desenini (§6 madde 3)
  harici MCP-sunucu kod-tabanlarına uygulayacak bir ayrı araç/script — bugün yalnız
  marketplace skill'lerine bağlı (`src/core/marketplace/`), browser-pack tedarik-zinciri için
  YENİDEN kullanılabilir mi yoksa genelleştirilmesi mi gerekiyor, ayrı bir araştırma gerektirir.
- **CU-DESKTOP-SCOPE (gelecek, bu P2 diliminin DIŞINDA):** Anthropic native computer-use
  (tam masaüstü) — §2'nin kasıtlı olarak dışarıda bıraktığı, çok daha geniş bir tehdit-yüzeyi;
  ayrı bir gelecekteki MASTER-PLAN satırı olarak ele alınmalı, bu doküman kapsamına dahil değil.
- **CU-COMMAND-I18N:** §7 adım 5 (COMMAND-ENTRY) seçilirse, `term5-risk-language.md` §7'nin
  `getMessage` taslağıyla aynı `cmdCatalog.*` namespace'ine yeni bir `browser` girdisi —
  CLAUDE.md i18n-FIRST kuralı gereği, TERM-5'in kendi wiring follow-up'ıyla (CMDCATALOG-I18N-WIRE,
  `term5-risk-language.md` §10) birlikte ele alınabilir, tekrar icat edilmemeli.
- **runtime-wide ApprovalBroker P0 durumu:** bu dokümanın §5/§7/§8'i bu P0'ın deckent'in kendi
  önceliklendirmesinde ne zaman tamamlanacağını VARSAYMIYOR — yalnız APPROVAL-WIRE adımının ona
  bağımlı olduğunu kaydediyor. O P0'ın ilerleme durumu bu dokümanın disk-verify kapsamı dışında.
