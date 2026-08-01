# NL-Dispatch Default Kararı — `agenticDispatch` Kanıt Paketi (MASTER-PLAN #57 / Sıra-57)

**ADR Reference:** taslak (bkz. §6 "Önerilen Karar" — henüz kabul edilmedi)
**Status:** Evidence package (Alperen karar-kapısı — bu doküman KARAR VERMEZ, kod/config/ADR-DB
değişikliği İÇERMEZ)
**Date:** 2026-07-02
**Author:** worker (sprint-359, task 359-009)
**İlişkili dokümanlar:** `docs/MASTER-PLAN.md` #57 (NL-DISPATCH-DECISION, not "G-034 #4;
default-off"), `tests/cli/nl-dispatch-evidence.test.ts` (bu dokümanın kanıt kaynağı — her satır
kod-çalıştırılarak doğrulandı, tahmin değil)

---

## 1. Bağlam & mevcut davranış (disk-verify)

`agenticDispatch` (`src/cli/commands/chat-native.ts:249`), `runChatNativeLoop`'un opt-in bir
bayrağıdır: `true` olduğunda her REPL satırı önce `classifyAgenticIntent`
(`src/cli/commands/chat-agentic-dispatch.ts:106-113`) ile saf-regex tabanlı bir niyet
sınıflandırıcıdan geçer; eşleşirse satır provider'a (LLM) hiç gitmeden doğrudan bir
`deckent_status` / `deckent_history` / `deckent_memory_query` / `deckent_plan` MCP-tool
çağrısına dönüştürülür (`chat-native.ts:918-940`).

**Bugünkü fiili durum iki farklı yüzeyde FARKLIDIR** — bu doküman bunu ilk kez tek yerde kanıtla:

| Çağıran | Dosya:satır | `agenticDispatch` geçiriliyor mu? | Sonuç |
|---|---|---|---|
| `deckent` bare REPL (non-Ink native loop) | `src/cli/entry.ts:733-759` | **HAYIR** — opts objesinde `agenticDispatch` anahtarı yok | NL-dispatch KAPALI; her satır provider'a gider |
| Ink REPL, legacy `runChatNativeLoop` dalı | `src/cli/repl/app.tsx:777-802` | **HAYIR** — aynı şekilde anahtar yok | NL-dispatch KAPALI |
| Ink REPL, `nativeEngine` dalı (varsayılan aktifse) | `src/cli/repl/app.tsx:762-775` | N/A — bu dal `runChatNativeLoop`'u hiç çağırmıyor, `nativeEngine` ayrı bir motor | NL-dispatch mekanizması bu dalda YOK |
| Messaging connector'lar (Telegram/Discord/WhatsApp) | `src/connectors/chat-bridge.ts:392-410` (bayrak: satır 402) | **EVET** — `agenticDispatch: true` açıkça set | NL-dispatch AÇIK |

Yani MASTER-PLAN #57'nin notu ("G-034 #4; default-off") **kod-seviyesinde doğrulanmıştır**: insan
kullanıcının gördüğü CLI/TUI REPL'de bugün NL→tool dispatch YOK; yalnız bot-connector köprüsünde
(kullanıcı deckent'e Telegram/Discord/WhatsApp üzerinden yazdığında) AÇIK. Bu tutarsızlık — aynı
mekanizmanın bir yüzeyde açık, diğerinde kapalı olması — §4'teki iki seçeneğin her ikisinin de
çözmesi gereken ortak problemdir.

---

## 2. Kod-referans envanteri

| Modül | Rol |
|---|---|
| `chat-native.ts:249-256` (`agenticDispatch`, `agenticConfirm` opts) | Bayrak tanımı + confirm-injection noktası |
| `chat-native.ts:909-940` | Wiring: slash-check'ten SONRA, provider turn'den ÖNCE; eşleşirse `continue` ile provider'ı atlar |
| `chat-agentic-dispatch.ts:51-61` (`normalize`) | Türkçe diyakritik temizleme (ç/ğ/ı/ö/ş/ü) + lowercase — regex'ler bu normalize edilmiş metin üzerinde çalışır |
| `chat-agentic-dispatch.ts:63-67` (`STATUS_RE`/`HISTORY_RE`/`RECALL_RE`/`RECALL_STRIP_RE`/`PLAN_RE`) | 4 niyetin TAMAMI — `\b`-sınırlı, TEK-kelime yeterli (semantik ayrım YOK) |
| `chat-agentic-dispatch.ts:69-97` (`RULES`) | Sıralı kural tablosu — ilk eşleşen kural kazanır, `classifyAgenticIntent` L106-113 tarafından taranır |
| `chat-agentic-dispatch.ts:127-141` (`dispatchAgenticIntent`) | Eşleşen niyeti gerçek `McpToolDispatcher`'a gönderir |
| `src/cli/repl/tool-permissions.ts:25-31,43-64` (`classifyTool`) | `deckent_plan` → **`confirm`** tier (y/N sorulur); `deckent_status`/`deckent_history`/`deckent_memory_query` → varsayılan **`read`** tier (sessizce çalışır) — bu ayrım §3'teki ciddiyet-sütununu belirler |
| `src/cli/commands/agentic-confirm.ts:23-37` (`classifyActionRisk`) — agentic-dispatch yolunun FİİLEN kullandığı gate | `SAFE_KEYWORDS` içinde `status`/`history`/`query` var → `deckent_status`, `deckent_history`, `deckent_memory_query` OTOMATİK onaylanır (sessiz); `deckent_plan` ne safe ne risky listede → fail-safe varsayılan **`risky`** → y/N sorulur |
| `tests/cli/chat-agentic-dispatch.test.ts` (mevcut, bu task'ın DIŞINDA) | 4 happy-path niyet + 2 trivial no-match — sınır-vaka/yanlış-pozitif kapsamı YOK (bu doküman + `nl-dispatch-evidence.test.ts` bu boşluğu dolduruyor) |

---

## 3. Kanıt: 20 sınır-vakası (`tests/cli/nl-dispatch-evidence.test.ts`, hepsi çalıştırılıp doğrulandı)

`npx vitest run tests/cli/nl-dispatch-evidence.test.ts` → **20/20 PASS** (16 yanlış-pozitif +
4 doğru-negatif sağlık kontrolü). Aşağıdaki tablo her satırı kaynak regex'e ve kullanıcı-görünür
ciddiyete bağlar:

| # | Girdi (kısaltılmış) | Sonuç | Tetikleyen regex (satır) | Kullanıcı-görünür ciddiyet |
|---|---|---|---|---|
| 1 | "işten çıkınca beni ara lütfen" (beni ara = call me) | `deckent_memory_query` (YANLIŞ) | `RECALL_RE` bare `ara` — `chat-agentic-dispatch.ts:65` | **Sessiz** — `read` tier, otomatik onay (`agentic-confirm.ts:24`), yanlış tool-sonucu transcript'e girer |
| 2 | "bu duruma göre karar verelim" | `deckent_status` (YANLIŞ) | `STATUS_RE` greedy `durum\w*` — `chat-agentic-dispatch.ts:63` | Sessiz |
| 3 | "olağanüstü durumda ne yapmalı" | `deckent_status` (YANLIŞ) | aynı greedy `durum\w*` | Sessiz |
| 4 | "I have a great memory for names" | `deckent_memory_query` (YANLIŞ) | `RECALL_RE` bare `memory` | Sessiz |
| 5 | "this laptop needs more memory" | `deckent_memory_query` (YANLIŞ) | aynı | Sessiz |
| 6 | "did you find the bug?" | `deckent_memory_query` (YANLIŞ) | `RECALL_RE` bare `find` | Sessiz |
| 7 | "can you find my keys" | `deckent_memory_query` (YANLIŞ) | aynı | Sessiz |
| 8 | "let's search for a new apartment" | `deckent_memory_query` (YANLIŞ) | `RECALL_RE` bare `search` | Sessiz |
| 9 | "what's the plan for tonight?" | `deckent_plan` (YANLIŞ) | `PLAN_RE` bare `plan` — `chat-agentic-dispatch.ts:67` | **Confirm-gated** — `classifyTool`'da `confirm` tier + `agentic-confirm.ts` fail-safe `risky` → y/N sorulur, kullanıcı iptal edebilir |
| 10 | "I need a diet plan" | `deckent_plan` (YANLIŞ) | aynı | Confirm-gated |
| 11 | "just checking on the status of my order" | `deckent_status` (YANLIŞ) | `STATUS_RE` bare `status` | Sessiz |
| 12 | "how is sprint going for you these days?" | `deckent_status` (YANLIŞ) | `STATUS_RE` literal `how\s+is\s+sprint` | Sessiz |
| 13 | "how are we doing today, feeling ok?" | `deckent_status` (YANLIŞ) | `STATUS_RE` literal `how\s+are\s+we` | Sessiz |
| 14 | "hafızam çok zayıf bu aralar" | `deckent_memory_query` (YANLIŞ) | `RECALL_RE` bare `hafiza\w*` (diyakritik-normalize edilmiş) | Sessiz |
| 15 | "geçmiş olsun, tekrar dene" | `deckent_history` (YANLIŞ) | `HISTORY_RE` bare `gecmis` (diyakritik-normalize) | Sessiz |
| 16 | "beni sonra ara" | `deckent_memory_query` (YANLIŞ) | `RECALL_RE` bare `ara` | Sessiz |
| 17 | "merhaba nasılsın bugün hava çok güzel" | `no_match` (DOĞRU) | — | — |
| 18 | "let's grab lunch tomorrow" | `no_match` (DOĞRU) | — | — |
| 19 | "thanks for the help earlier" | `no_match` (DOĞRU) | — | — |
| 20 | "kahve ister misin" | `no_match` (DOĞRU) | — | — |

**Ölçülen yanlış-pozitif oranı bu 16 örnekte:** 16/16 gündelik cümle → istenmeyen tool-çağrısı.
Bunlar rastgele değil — TAMAMI her 4 kuralın da (`STATUS_RE`/`HISTORY_RE`/`RECALL_RE`/`PLAN_RE`)
en az bir "bare-keyword, `\b`-sınırlı, semantik-ayrımsız" dalından kaynaklanıyor; yani kural
tablosunun YAPISAL özelliği — münferit bir kural bug'ı değil, TÜM RULES tasarımının doğal sonucu.

**Ciddiyet-dağılımı:** 16 yanlış-pozitiften **14'ü sessiz** (status/history/memory_query →
`read` tier, otomatik onay, kullanıcı hiç göremeden yanlış tool-sonucu context'e enjekte edilir);
**2'si confirm-gated** (`plan` → y/N sorulur, kullanıcı iptal şansı bulur). Sessiz-çoğunluk, "kanıt
kanıtlanmadıkça zararsız" savını zayıflatır — kullanıcı LLM'e "durumu nasıl, iyi misin, moralin
nasıl" gibi gündelik bir soru sorduğunda deckent_status sessizce tetiklenir ve LLM'in cevabı
YANLIŞ/alakasız bir tool-sonucuyla kirlenmiş bağlamdan üretilir; kullanıcı bunu FARK ETMEYEBİLİR.

---

## 4. İki seçenek — ölçülmüş artı/eksi

### Seçenek A — Default-ON (NL-dispatch her yerde açık; bugünkü connector davranışı CLI/TUI'ye de yayılır)

**Mekanizma.** `entry.ts:733` ve `app.tsx:777`'ye `agenticDispatch: true` eklenir — connector
köprüsü (`chat-bridge.ts:402`) ile CLI/TUI arasındaki §1'de kanıtlanan tutarsızlık ortadan kalkar.

| + | − |
|---|---|
| Hızlı-yol: "sprint durumu ne" gibi TAM-eşleşen sorular LLM round-trip'i (round-trip maliyeti: token + gecikme) olmadan yanıtlanır — connector kullanıcıları bugün zaten bu deneyimi yaşıyor | §3'teki 16/16 yanlış-pozitif oranı CLI/TUI'ye de yayılır — connector'da "az mesaj, çoğu net komut" varsayımı geçerliyken, CLI/TUI'de kullanıcı LLM'le SERBEST sohbet ediyor (kod tartışma, günlük konuşma, plan yapma) → çarpışma yüzeyi connector'dan ÇOK daha geniş |
| Connector ile CLI/TUI arasında davranış-paritesi (bugün İKİ FARKLI UX var, kullanıcı şaşırabilir: "Telegram'da 'ara' yazınca hafıza aranıyor, terminalde neden aranmıyor?") | 14/16 vaka SESSİZ (§3 ciddiyet sütunu) — kullanıcı yanlış tool-çağrısının farkına bile varmayabilir; bu "sessiz veri-kirliliği" connector'da da var ama CLI/TUI'nin daha uzun/karmaşık konuşma dokusunda payı büyür |
| Kod-değişikliği MİNİMAL (iki call-site'a bir bayrak eklemek) — mevcut mekanizma zaten var, test edilmiş, `nogo` ihlali YOK (bu seçenek mekanizmayı değiştirmiyor, yalnız iki yeni call-site'ta açıyor) | Regex tabanlı sınıflandırıcı büyüdükçe (yeni tool = yeni kural) yanlış-pozitif yüzeyi doğrusal BÜYÜR — `RECALL_RE`'nin tek harfli değil ama yine de çok genel kelimeleri (`find`/`search`/`memory`/`ara`) kapsaması bunun somut kanıtı |

### Seçenek B — Slash+tool-only (NL-dispatch YOK; yalnız açık `/status` vb. slash veya model-driven `tool_use`)

**Mekanizma.** `agenticDispatch` bayrağı hiçbir call-site'da `true` yapılmaz (bugünkü CLI/TUI
davranışı SABİT kalır); connector köprüsü de (`chat-bridge.ts:402`) `agenticDispatch: false`'a
çekilir — NL-classification mekanizması kod-tabanında KALIR (silinmez, `dispatchAgenticIntent`
başka bir opt-in yüzey için hâlâ kullanılabilir) ama HİÇBİR production call-site onu tetiklemez.
Kullanıcı niyeti ya açık slash (`/status`, `/recall <q>`, `/plan`) ya da tam bir LLM turu
(provider kendi `tool_use`'unu üretir, `chat-native.ts:1003-1028`'deki mevcut tool-hop döngüsü)
üzerinden karşılanır.

| + | − |
|---|---|
| §3'ün TAMAMI (20/20 sınır-vakası) sıfırlanır — gündelik cümle hiçbir zaman yanlış tool'a dönüşmez, çünkü sınıflandırıcı hiç devrede değil | Connector kullanıcıları bugünkü hızlı-yol deneyimini KAYBEDER (`chat-bridge.ts:402`'nin `agenticDispatch: true`'sı kaldırılırsa) — her "durum ne" sorusu artık tam bir LLM turu gerektirir (gecikme + token maliyeti) |
| Tek davranış, tüm yüzeylerde tutarlı (§1'deki connector/CLI çatallanması ortadan kalkar — ama "hepsi kapalı" yönünde, "hepsi açık" değil) | Slash-komutları bilmeyen/hatırlamayan kullanıcı için sürtünme artar — "durum ne" yazmak yerine `/status` yazması gerektiğini öğrenmesi lazım (discoverability maliyeti; `/help` katalog zaten var — `chat-native.ts:823-843` — ama kullanıcı önce onu çağırmalı) |
| Model-driven `tool_use` yolu ZATEN VAR ve regex'siz — LLM, kullanıcının "durumu göster" dediğini doğal-dil anlama ile çözüp kendi `tool_use`'unu üretebilir (§ konsept: aynı sonucu semantik-doğru şekilde, false-positive riski olmadan verir) — TEK maliyeti bir LLM turu gecikmesi | Connector tarafında bir "quick command" beklentisi varsa (ör. bot-arayüzünde kullanıcı LLM turunun pahalı/yavaş olduğunu biliyor, kısa komut istiyor) bu beklenti B ile karşılanmaz — connector-özel bir SLASH-benzeri kısa-komut sözdizimi (örn. `/status` connector'da da çalışır — `chat-native.ts:864-883`'teki slash-registry connector input'unda da aynı şekilde çalışır, `agenticDispatch`'ten bağımsız) ayrı bir iş kalemi gerektirir (bkz. §7) |
| `nogo` ile TAM uyumlu ("default değiştirmek" — B, bugünkü CLI/TUI default'unu (kapalı) DEĞİŞTİRMEZ; yalnız connector'ı CLI/TUI ile hizalar) | `chat-bridge.ts:402`'yi `false`'a çekmek connector'ın BUGÜNKÜ (production, kabul edilmiş) davranışını değiştirir — bu tek başına bir "default değişikliği" sayılabilir, dolayısıyla B'nin "connector hizalama" parçası bu task'ın nogo'suyla GERİLİM içindedir (aşağıda §5'te açıkça işaretlendi) |

---

## 5. Öneri (bağlayıcı değil — worker görüşü, Alperen karar verir)

Bu task'ın `nogo`'su hem "default değiştirmek" hem "dispatch-mantığı değişikliği"ni yasaklıyor;
dolayısıyla bu doküman NE Seçenek A'yı NE Seçenek B'yi UYGULAMAZ. Yine de kanıt ışığında:

- §3'teki 16/16 yanlış-pozitif oranı ve 14/16 SESSİZ ciddiyet-dağılımı, Seçenek A'nın CLI/TUI'ye
  genişletilmesini riskli kılıyor — regex tabanlı sınıflandırıcı `\b`-sınırlı tek-kelime eşleşmesi
  kullandığı SÜRECE (mevcut `dispatch-mantığı`, bu task'ın DEĞİŞTİRMEYE yetkili olmadığı kısım) bu
  oran yapısal olarak sabit kalır.
- Seçenek B'nin "connector'ı da kapat" parçası, connector'ın bugünkü ONAYLANMIŞ default'unu
  değiştirdiği için nogo ile gerilim içinde — B seçilirse bu parça AYRI bir Alperen-onayı
  gerektirir (bu doküman o onayı ÖNERMEZ, yalnız gerilimi görünür kılar).
- Orta-yol (bu dokümanın kapsamı DIŞINDA, §7'ye follow-up olarak taşındı): sınıflandırıcının
  KENDİSİ değişmeden (nogo'ya uyularak), `RULES` tablosuna güven-eşiği (ör. cümle uzunluğu ≤3
  kelime VEYA satırın TAMAMI tek bir anahtar-kelimeyse eşleş — "durum ne" eşleşir ama "bu duruma
  göre karar verelim" eşleşmez) eklemek §3'ün büyük kısmını (özellikle greedy `durum\w*` ve bare
  `ara`/`find`/`search`/`memory`/`plan` vakalarını) sıfırlayabilir — ANCAK bu bir "dispatch-mantığı
  değişikliği"dir, bu task'ın nogo'suna girer, ayrı bir task/ADR gerektirir.

**Net değerlendirme:** Kanıtlar Seçenek B (slash+tool-only, connector davranışı DEĞİŞTİRİLMEDEN —
yani yalnız CLI/TUI'nin bugünkü "kapalı" default'unu KORUMAK, Seçenek A'nın genişletmesini
YAPMAMAK) yönünde ağır basıyor; connector'ın kendi default'unu değiştirmek ayrı bir karar
gerektirir ve bu dokümanın kapsamı dışındadır.

---

## 6. Önerilen Karar (ADR-taslak — status: PROPOSED, Alperen onayı bekliyor)

> Bu bölüm ADR formatındadır ama bir `docs/adr/*.md` dosyası DEĞİLDİR ve `.brain/memory.db`'ye
> `store.insert({type:'adr', ...})` ile KAYDEDİLMEMİŞTİR. Alperen onaylarsa, bu bölüm ayrı bir
> `docs/adr/adr-d-0XX-nl-dispatch-default.md` dosyasına + ADR-DB kaydına dönüştürülür.

**Class:** ADR-D (proje-özel, chat/REPL dispatch) · **Scope:** `src/cli/commands/chat-native.ts`,
`src/cli/commands/chat-agentic-dispatch.ts`, `src/cli/entry.ts`, `src/cli/repl/app.tsx`,
`src/connectors/chat-bridge.ts` · **Status:** proposed (NOT accepted)

### Context
`agenticDispatch` bugün CLI/TUI'de kapalı, connector köprüsünde açık (§1). Regex tabanlı
`classifyAgenticIntent` `\b`-sınırlı tek-kelime eşleşmesi kullanıyor; bu, ölçülen 16/20 sınır-
vakasında (§3) gündelik cümleleri yanlışlıkla tool-çağrısına çeviriyor, bunların 14'ü kullanıcıya
hiçbir onay/görünürlük olmadan (sessiz `read`-tier auto-approve) gerçekleşiyor.

### Decision (önerilen, henüz kabul değil)
1. CLI/TUI'nin bugünkü default'u (`agenticDispatch` KAPALI, `entry.ts:733`/`app.tsx:777`
   değişmez) **korunur** — Seçenek A'nın genişletmesi YAPILMAZ.
2. Connector köprüsünün (`chat-bridge.ts:402`) bugünkü `agenticDispatch: true` default'u bu ADR
   kapsamında **değiştirilmez** (nogo ile gerilim, §4/§5) — ayrı bir Alperen-onay-kapısı gerektirir.
3. Sınıflandırıcı mantığı (`chat-agentic-dispatch.ts` RULES) bu ADR kapsamında **değiştirilmez**
   (nogo) — §5'teki güven-eşiği fikri ayrı bir follow-up task'a devredilir (§7).
4. Kalıcı kayıt: `docs/MASTER-PLAN.md` #57 "⬜" durumundan bu dokümanın ürettiği kanıtla
   "kanıt-hazır, Alperen kararı bekliyor" durumuna geçebilir (MASTER-PLAN write-scope dışı — bu
   task tarafından güncellenmedi, `notes` alanında `docImpact` olarak işaretlendi).

### Consequences
**(+)** Sıfır regresyon — hiçbir mevcut davranış değişmiyor, sadece kanıtlanıyor. Gelecekteki bir
"default aç" kararı artık varsayıma değil ölçülmüş 16/20 yanlış-pozitif oranına dayanabilir.
**(−)** §1'deki connector/CLI tutarsızlığı ÇÖZÜLMEDEN kalır — kullanıcı deneyimi iki yüzeyde farklı
olmaya devam eder; bu ADR'nin kapsamı yalnız "kanıt üretmek", tutarsızlığı gidermek değil.

---

## 7. Açık sorular / follow-up iş kalemleri

- **CONFIDENCE-THRESHOLD:** §5'teki güven-eşiği fikri (kısa/tam-eşleşen satırlarda dispatch,
  uzun/serbest cümlelerde dispatch etme) — `RULES` mantığını değiştirdiği için AYRI bir task,
  bu task'ın nogo'sunun dışında.
- **CONNECTOR-DEFAULT-REVIEW:** `chat-bridge.ts:402`'nin `agenticDispatch: true`'sunun kendi
  başına bir Alperen-onay-kapısından geçip geçmediğinin doğrulanması — bu doküman yalnız BUGÜNKÜ
  durumu kanıtlıyor, connector default'unun kendisini sorgulamıyor veya değiştirmeyi önermiyor.
- **SLASH-DISCOVERABILITY:** Seçenek B tercih edilirse, `/help` katalog zaten var
  (`chat-native.ts:823-843`) ama kullanıcı onu proaktif çağırmalı — ilk-turda otomatik bir
  "slash komutlarını görmek için /help yazın" ipucu (yalnız CLI/TUI'nin ilk turu, mesaj değil,
  scope dışı) ayrı bir küçük UX task'ı olabilir.
- **MASTER-PLAN #57 GÜNCELLEME:** Bu dokümanın kanıt-paketi hazır olduğu bilgisinin
  `docs/MASTER-PLAN.md` #57 satırına işlenmesi — write-scope dışı, Brain/Alperen tarafından
  yapılmalı (bkz. task `.result` `notes` `docImpact:` satırı).
