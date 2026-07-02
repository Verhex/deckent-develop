# Native-Terminal Abonelik-Transport Tasarımı — "Sarmalayıcıdan Çıkış"ın Mimari Kilidi

**ADR Reference:** taslak (bkz. §6 "Önerilen Karar" — henüz kabul edilmedi)
**Status:** Proposal (Alperen onayı bekliyor — bu doküman kod/ADR-DB değişikliği İÇERMEZ)
**Date:** 2026-07-02
**Author:** worker (sprint-358, task 358-016) — brainstorm kaynağı: DIRECTIVES.md Task 16
**İlişkili dokümanlar:** [[2026-06-13-sp1-native-terminal-agent-core-design]] (SP-1, kilitli-kararlar),
[[2026-06-12-deckent-native-agent-program-roadmap]] (program, İki-katman ilkesi), DIRECTIVES.md Task 15
(NATIVE-M5-GATE), MASTER-PLAN #63 (TERM-NAT)

---

## 1. Bağlam & kilitli-karar

`src/agent/` (native-terminal-agent core, SP-1) bugün **yalnız** üç transport tanır:
Anthropic API, herhangi bir OpenAI-uyumlu endpoint, ve yerel Ollama. Bu, SP-1'in kilitli bir
kararıdır — `src/agent/provider-detect.ts:1-6` başlık yorumunda açıkça yazılı:

> "The terminal works only with a real native-tool_use backend: Anthropic API, any
> OpenAI-compatible endpoint … or a local Ollama. **Subscription CLIs are NOT used here**
> (they stay in the orchestrator)."

Gerekçe SP-1 tasarımının §1 kök-sebep bölümünde: legacy REPL `claude` CLI'ını spawn edip onun
serbest-metin çıktısından `<deckent_tool>` regex'iyle tool-niyeti çıkarıyordu
(`src/cli/commands/chat-session.ts:92` `DECKENT_TOOL_TAG_RE`) — bu kırılgan zemin "14 günde 35
commit"lik fix→regresyon döngüsünün matematiksel köküydü. SP-1'in çözümü: deckent kendi
agent-loop'una (`src/agent/loop.ts`) sahip olsun, provider'lar yalnız gerçek native `tool_use`
backend'i olsun; CLI-agent-loop'ları (özellikle claude-CLI'ın kendi tool-döngüsü) **terminale
asla girmesin.**

Bu kararın maliyeti: **Anthropic aboneliği (Pro/Max) raw API'ye erişim vermiyor** — sadece
`claude` CLI, kendi OAuth/session mekanizmasıyla. Yani bugünkü native-transport zinciriyle
(`resolveNativeProvider`, `src/cli/repl/native-transport.ts:33-63`) terminalde abonelik-kotasıyla
Claude çalıştırmak **imkânsız**: `ANTHROPIC_API_KEY` yoksa `detectTransport` doğrudan
`{ kind: 'none' }` döner (`provider-detect.ts:33-36`) ve kullanıcı ya ayrı bir API-key parası
ödemek ya da Ollama'ya düşmek zorunda kalır — abonelik parası zaten ödenmişken.

Bu doküman, SP-1'in bu tek maddesini (transport kilidini) **değiştirmeden bırakmıyor,
gözden geçiriyor**: native-engine'in agent-loop'u tool-döngüsünü SAHİPLENMEYE devam ederken,
`claude` CLI'ı yalnızca bir "aptal-boru" (dumb-pipe) transport olarak kullanan üç seçeneği
karşılaştırır. Kapsam kesinlikle **doküman-seviyesinde kalır** — kod değişikliği yok, ADR-DB
kaydı yok (bkz. task nogo). Nihai ADR kararını Alperen verir (§6).

**Değişmeyen ilke (bu doküman ne önerirse önersin sabit):** İki-katman sınırı korunur —
ORKESTRATÖR (Brain + sprint-worker'lar, `src/providers/claude.ts`) bu tasarımdan **etkilenmez**;
kapsam yalnız `deckent` terminalinin (`src/agent/` + `src/cli/repl/`) transport katmanıdır.

---

## 2. Kod-referans envanteri (disk-verify)

Aşağıdaki dosya/satır referansları her seçeneğin altında tekrar kullanılır — burada tek yerde
toplanmış:

| Modül | Rol | Bu tasarımdaki önemi |
|---|---|---|
| `src/agent/provider-detect.ts:20-37` (`detectTransport`) | Transport-seçim önceliği: `anthropic-api > openai-compatible > ollama > none` | Yeni bir `kind` eklenecekse önce/sonra sırası burada değişir |
| `src/cli/repl/native-transport.ts:33-63` (`resolveNativeProvider`) | `detectTransport` sonucunu somut `ProviderAdapter` + model-id'ye çevirir | Yeni bir CLI-transport adapter'ı buraya bir `if` dalı olarak eklenir |
| `src/agent/provider-tooluse/types.ts:34-44` | `ProviderEvent` union (`text-delta` \| `tool-call` \| `usage` \| `done`) + `ProviderAdapter.send()` sözleşmesi | Her üç seçeneğin de nihayetinde üretmesi gereken ORTAK çıktı şekli — **thinking-delta yok**, bu union'da hiçbir adapter (bugün Anthropic/OpenAI/Ollama dahil) reasoning-block yaymıyor |
| `src/agent/provider-tooluse/anthropic.ts:32-111` | Doğrudan Anthropic SSE (`content_block_start` tool_use / `input_json_delta` / `content_block_stop` / `message_delta` usage) → `ProviderEvent` çevirisi | Seçenek B'nin CLI-stdout'a karşı **yeniden-üretmesi gereken** ayrıştırma mantığının referans-implementasyonu |
| `src/agent/loop.ts:60-157` (`runAgentTurn`) | `while(true)`: model-call → `tool-proposed` → izin (`decide`) → `tool-executing` → handler → `tool-result` → transcript'e geri-besle → devam | Tool-loop SAHİPLİĞİNİN somut kod-yeri — A/B/C bu döngünün NEREDE çalıştığına göre ayrışır |
| `src/agent/session.ts:39-110` (`createAgentSession`) | `runAgentTurn`'ü sarar; `respondPermission`/pre-answer eşleşmesi, transcript, cancel | Loop'un tek çağrısı — CLI-transport'un bu sözleşmeyi 1:1 mi yoksa farklı mı sağladığı burada görünür |
| `src/cli/repl/native-agent-bridge.ts:97-173` (`createNativeEngine`) | `AgentSession` → Ink `ReplEngine` köprüsü; confirm-queue↔izin eşlemesi (`toDecision`, satır 91-95); cost-ceiling (`resolveCostCeilingUsd`, satır 76-88) | Yeni adapter bu köprüye **dokunmadan** takılabilmeli (Faz-1 disiplini: greenfield, view korunur) |
| `src/cli/commands/chat-session.ts:179-185` (`DEFAULT_PERSISTENT_ARGS`) | **Kanıtlanmış** kalıp: `claude --print --input-format stream-json --output-format stream-json --include-partial-messages --verbose` ile kalıcı (persistent) alt-süreç | A/B'nin spawn/pipe altyapısı için yeniden-kullanılabilir referans — cold-start (~4.5s) bir kez ödenir |
| `src/cli/commands/chat-session.ts:332-403` (`parseStreamJsonLine`) | NDJSON satırlarını ayrıştırır; **`--include-partial-messages` sarmalı** (`stream_event` → `event`, satır 381-392) `anthropic.ts`'in doğrudan-SSE olarak beklediği `content_block_delta` şeklini AYNEN üretir | B'nin en güçlü kanıtı: CLI-stdout ve HTTP-SSE **aynı event-vocabulary'sini** taşıyor, adapter'ın çoğu Anthropic-parse mantığı **yeniden-kullanılabilir** |
| `src/cli/commands/chat-session.ts:92-155` (`DECKENT_TOOL_TAG_RE` / `parseDeckentToolCallsFull`) | Bugünkü legacy tool-niyeti: prompt'a gömülü `<deckent_tool>{json}</deckent_tool>` etiketi, regex+JSON.parse ile ayrıştırılır | SP-1'in "öldürmek istediği" kırılgan protokolün ta kendisi — A bunu (kapsamı daraltarak) yeniden kullanmayı önerir |
| `src/providers/claude.ts:604-658` (`CACHE_CONTROL_EPHEMERAL`, `parseCacheUsage`) | Explicit `cache_control` blokları — yorum (satır 682-683): "**Today the Claude CLI subscription path uses prompt-content hashing for cache hits**"; bu helper'lar "future API-mode adapters" için | CLI-transport'ta explicit cache-control LEVER'ı yok — kayıp-yetenek kanıtı |
| `src/providers/claude.ts:350-388` (`buildCommand`) | Orkestratör tarafının zaten kullandığı `--effort <low|medium|high|xhigh|max>` bayrağı (`resolveReasoningEffort`) | Native-engine'de (`native-transport.ts`/`native-agent-bridge.ts`) **hiçbir effort/thinking passthrough yok** — CLI-transport eklenirse bu bayrak yeni bir config-seam gerektirir |
| DIRECTIVES.md Task 15 (NATIVE-M5-GATE) | Legacy chat-loop ↔ native-engine davranış-parite matrisi (`KNOWN_DIVERGENCES`), M5 default-flip'in dayanağı | Her seçeneğin M5-etkisi bu gate'in kapsamını nasıl genişlettiği/daralttığıyla ölçülür |

---

## 3. Üç seçenek

### Seçenek A — CLI'yı tek-turn/çok-turn metin-üretici olarak sürmek (tool-loop bizde; CLI tool'ları KAPALI)

**Mekanizma.** `claude` CLI'ı `chat-session.ts:179-185`'teki KANITLANMIŞ
`DEFAULT_PERSISTENT_ARGS` kalıbıyla (`--print --input-format stream-json --output-format
stream-json --include-partial-messages --verbose`) kalıcı bir alt-süreç olarak sürülür — ama
CLI'a **hiçbir tool-şeması, `--allowedTools`, `--mcp-config` verilmez**. CLI'ın kendi built-in
tool-yetenekleri (Read/Write/Bash/Edit) hiç açılmaz; CLI, saf bir "sistem-promptu + konuşma
geçmişi → asistan metni" motoru olarak kalır. Yeni bir `src/agent/provider-tooluse/claude-cli.ts`
adapter'ı yazılır:

- `send(req: ProviderRequest)`, `req.messages`'ı CLI'ın stream-json giriş biçimine
  (`buildUserMessageLine`, `chat-session.ts:306-311` deseninin genellemesi) çevirip stdin'e yazar.
- stdout NDJSON'u `parseStreamJsonLine`'ın (satır 332-403) **aynen yeniden-kullanılan** unwrap
  mantığıyla okunur → `text-delta` + `usage` `ProviderEvent`'leri üretir.
  `req.tools` (registry şeması, `deps.registry.toNativeSchemas()`) CLI'a asla gönderilmez;
  bunun yerine `req.system`'e (composeSystemPrompt çıktısına) deckent'in KENDİ tool-şemasından
  türetilmiş bir talimat-bloğu eklenir (bugünkü `DECKENT_AGENTIC_SYSTEM_PROMPT`,
  `chat-session.ts:95-105`'in kapsam-daraltılmış hâli: yalnız `req.tools`'taki isim+parametre
  listesi, generic 4-tool listesi değil).
- Adapter, turn-sonunda toplanan metni yapılandırılmış bir sözdizimiyle (ör. tek bir
  ```` ```json {"tool_calls":[...]} ``` ```` fence — mevcut `<deckent_tool>` etiketinden DAHA
  sağlam, çünkü fence tek-seferlik ve tüm çağrıları tek blokta taşır) ayrıştırıp
  `ProviderToolCall` event'lerine çevirir.
- `src/agent/loop.ts` **HİÇ değişmez**: `runAgentTurn`'ün `while(true)` döngüsü, izin-kapısı
  (`decide`), guard'lar (self-modifying/cost/recursion), transcript-geri-besleme — hepsi
  aynen çalışır; adapter yalnızca `deps.adapter.send()` çağrısının İÇİNDE farklı bir transport
  kullanır.

**Neden işe yarar (kanıt):** `chat-session.ts:381-392`'deki yorum zaten kanıtlıyor ki
`--include-partial-messages` CLI'ın **gerçek** Anthropic SSE event'lerini (`stream_event` →
`content_block_delta`) NDJSON'a sardığını — yani metin-akışı ve usage-sayımı için CLI-transport,
doğrudan-API transport'uyla **bit-bit aynı event-vocabulary'sini** taşıyor. Kayıp olan tek şey
native `tool_use` content-block'ları (çünkü tool şeması hiç gönderilmiyor) — onun yerine
yapılandırılmış-metin protokolü devreye giriyor.

**Wiring şekli:** `detectTransport` (`provider-detect.ts:20-37`) yeni bir `kind:
'anthropic-subscription-cli'` alır, **en düşük öncelikte** (`anthropic-api > openai-compatible >
ollama > anthropic-subscription-cli > none`) — `claude --version` + oturum-var-mı probu
(`src/providers/claude.ts:262-277`'deki `spawnSync('claude', ['--version'])` deseninin
tekrar-kullanımı, orkestratör koduna DOKUNMADAN sadece desen kopyası) ile algılanır.
Flag-gated, default-OFF (`DECKENT_NATIVE_SUBSCRIPTION_CLI=1` veya
`native_subscription_cli: true` config), SP-1 §10 Faz-1 disipliniyle uyumlu.

### Seçenek B — CLI stream-json çıktısını adapter'da native `ProviderEvent`'e çevirmek (gerçek `tool_use`, MCP-köprülü)

**Mekanizma.** CLI'a bu kez GERÇEK tool-şeması verilir — ama Claude Code CLI'ın üçüncü-taraf
tool-genişletme yüzeyi **yalnız MCP** (`--mcp-config`). Deckent'in KENDİ `ToolRegistry`'si
(`src/agent/tools/registry.ts`) yerel bir stdio MCP sunucusu olarak expose edilir; CLI ona
`--mcp-config` ile bağlanır. İzin-kapısını CLI'ın kendi onay-akışına değil deckent'in
`permission.ts` motoruna bağlamak için CLI'ın `--permission-prompt-tool` kancası kullanılır —
bu kanca da deckent'in kendi MCP sunucusundaki bir "ask" tool'una yönlendirilir, ki içeride
`decide()` (mevcut `loop.ts:125`'teki AYNI karar-motoru) çağrılır.

Adapter (`send()`), `--include-partial-messages` NDJSON'unu `anthropic.ts:68-107`'deki
**AYNI** state-machine'i (per-index `toolAcc` Map, `content_block_start` type=tool_use →
`input_json_delta` birikimi → `content_block_stop` → `ProviderToolCall` yield) CLI-stdout
satırlarına karşı çalıştırarak `tool-call` event'leri üretir — transport HTTP-SSE'den
child-process-NDJSON'a değişir, ayrıştırma mantığı neredeyse satır-satır aynı kalır.

**Kritik mimari gerilim (bu seçeneğin gerçek maliyeti):** MCP protokolünde tool-çağırma
kararını ve zamanlamasını **CLI'ın kendi iç ajan-döngüsü** verir — deckent'in MCP sunucusu bir
`tools/call` isteği ALIR, cevap VERİR; "modeli önerdi, bekliyoruz, biz mi çalıştıracağız"
sırasını deckent DEĞİL CLI yönetir. Yani `src/agent/loop.ts:60-157`'deki `while(true)` döngüsü bu
transport için **fiilen devre dışı kalır**: tek bir `adapter.send()` çağrısı, CLI'ın içinde N adet
tool-round-trip'i barındırabilir (loop.ts bunu TEK bir iterasyon olarak görür). Bunun sonuçları:

- `recursionExceeded` (`guards/recursion.ts`, `maxIterations`) CLI'ın iç round-trip sayısını
  SAYAMAZ — CLI-içi rekürsiyon-limiti ayrı bir mekanizma (muhtemelen CLI'ın kendi
  `--max-turns`'ü, varsa) gerektirir; iki guard'ın senkron kalması ayrı bir mühendislik-yükü.
- `costGuard`/`accrue` (`loop.ts:82-91`) yalnız `usage` event'i CLI'ın TÜM iç-turlarının
  TOPLAMINI tek seferde bildirdiğinde doğru çalışır — ara-tur limitleri (hard-ceiling'in
  ORTA-turda kesmesi, bugünkü SP1-A1 davranışı) bu transport'ta **kaybolur veya CLI'ın
  kendi cost-guard'ına devredilmesi gerekir** (varsa).
- `permission-request` event'inin View'e (Ink onay-kartı) ZAMANINDA ulaşması, artık `loop.ts`'in
  senkron `yield`'ine değil, deckent'in KENDİ MCP-sunucu handler'ının (ayrı bir process/thread
  bağlamı) bir yayın-kanalına (event-emitter/queue) bağımlı hâle gelir — `session.ts:69-76`'daki
  `requestPermission`/pre-answer eşleşme deseni BU transport için yeniden-inşa edilmeli.

Yani B, tool-EXECUTION'ı deckent'in kendi registry+guard'larında tutar (MCP sunucusu deckent'in
kendi process'i olduğu için `ToolDefinition`/tool-kaynakları korunur) ama tool-İTERASYON'unu
CLI'ın içine taşır — SP-1'in §1 kök-sebebinin reddettiği TAM ORTAKLIK ("CLI kendi agent-loop'una
sahip") bu sefer yalnız claude-CLI-transport'u için, sınırlı biçimde geri döner.

**Doğrulanmamış risk:** Bu repoda `--mcp-config` + `--permission-prompt-tool`'un
`--print --input-format stream-json` KALICI-oturum modunda birlikte çalıştığına dair **hiçbir
kanıt yok** (chat-session.ts'nin kanıtladığı yalnızca düz metin-akışı + `--append-system-prompt`).
Bu kombinasyon doğrulanmadan B'ye commit etmek disk-verify ilkesini ihlal eder.

### Seçenek C — API-key fallback hibrit

**Mekanizma.** Native-engine'in transport-zinciri (`detectTransport`) DEĞİŞMEZ:
`anthropic-api > openai-compatible > ollama > none` aynen kalır. Yalnızca `none` durumunda,
`claude` CLI oturumu (`claude config get account` / `--version` ile) VARSA, kullanıcıya (config
veya interaktif prompt ile) **açık bir seçenek** sunulur: "API-key yok ama Claude aboneliğin
var — sınırlı-modda (Seçenek A'nın dumb-pipe adapter'ı) devam etmek ister misin?" Yani C, mimari
olarak **A'nın adapter'ını en-düşük-öncelikli bir fallback-dalı olarak** `detectTransport`
zincirine ekler — yeni bir "seçenek" değil, A'nın **nasıl devreye sokulacağının** bir
politikasıdır (opt-in disclosure + precedence, replace değil).

**Fark A'dan:** A "CLI-transport birinci-sınıf bir seçenektir, kullanıcı config'te açıkça
seçebilir" derken, C "CLI-transport yalnız hiçbir gerçek API/Ollama yokken, açık onayla devreye
giren bir son-çare'dir" der. Pratikte ikisi de AYNI adapter kodunu paylaşır; fark yalnız
`detectTransport` önceliği + kullanıcı-onay UX'i.

---

## 4. Karşılaştırma — 3 seçenek × 5 boyut

| Boyut | A — CLI dumb-pipe (tool-loop bizde) | B — CLI native tool_use (MCP-köprülü) | C — API-key fallback hibrit (=A, son-çare önceliğinde) |
|---|---|---|---|
| **Tool-use döngü sahipliği** | **Tamamen deckent** — `loop.ts` değişmez; CLI hiçbir tool görmez, yalnız metin üretir. Tool-niyeti yapılandırılmış-metin protokolüyle adapter'da ayrıştırılır. | **Bölünmüş** — tool-EXECUTION deckent'in registry+guard'larında (MCP sunucusu bizim process'imiz), ama tool-İTERASYON/zamanlama CLI'ın iç ajan-döngüsünde. `loop.ts`'in `while(true)`'u bu transport için fiilen bypass olur. | A ile aynı (fallback dalı A'nın kod-yolunu çalıştırır) — API dalı devredeyken tam deckent-sahipliği (mevcut `anthropic.ts` yolu). |
| **Maliyet/kota etkisi** | Abonelik-kotası tüketir, $0 metered API maliyeti. Orkestratörle AYNI hesap kullanılıyorsa eşzamanlı sprint+terminal kullanımı kota-çakışması riski taşır (cost-guard `usdPerMillionTokens` modeli buraya doğrudan uygulanamaz — advisory'e düşer, quota-ceiling ayrı bir metrik ister). | A ile aynı kota-profili + CLI'ın kendi iç-turlarının kota-tüketimi TEK `usage` event'inde toplu görünür (ara-tur kota-görünürlüğü kaybolur). | Devrede-olan-dala göre: API dalı → tam $-ceiling anlamlı (mevcut `costGuard`); CLI-fallback dalı → A'nın kota-caveat'i, ama yalnız kullanıcı AÇIKÇA onayladığında devrede — sürpriz-kota-tüketimi riski en düşük. |
| **Kayıp-yetenekler (cache, thinking)** | **Cache:** explicit `cache_control` lever'ı yok (CLI kendi prompt-hash heuristiğini kullanıyor, `claude.ts:682-683`) — `attachCacheControlToMessages` bu transport'a asla uygulanamaz. **Thinking:** `ProviderEvent` union'da zaten `thinking-delta` yok (bugün API-adapter'ında da yok) — CLI'ın `--effort` bayrağı forward edilebilir ama ham reasoning-içeriği hiçbir şekilde yüzeye çıkmaz. | Aynı cache-kaybı (CLI hâlâ kendi hash-heuristiğini kullanır — MCP tool-şeması vermek cache-control lever'ını GERİ getirmez). Thinking: aynı boşluk; ayrıca CLI'ın iç-turlarındaki ARA reasoning tamamen görünmez (tek `usage` özetine gömülü). | Devrede-olan-dala göre: API dalı → cache TAM kontrol edilebilir (gelecekteki `attachCacheControlToMessages` wiring'i buraya uygulanır); CLI-fallback dalı → A'nın kaybı, ama yalnız fallback anında — mimarinin GENELİNDE cache/thinking kaybı YOK. |
| **M5-cutover'a etkisi** | **En düşük risk.** `loop.ts`/`session.ts`/`permission.ts` sıfır değişir; yalnız bir adapter eklenir. NATIVE-M5-GATE (Task 15) parite-matrisine YALNIZ bir `KNOWN_DIVERGENCES` satırı eklenir (tool-çağrı-güvenilirliği: yapılandırılmış-metin vs native tool_use). M5 default-flip'in mevcut kapsamı (API/Ollama transport'ları) HİÇ etkilenmez. | **En yüksek risk.** NATIVE-M5-GATE'in kapsamı genişlemek ZORUNDA: "legacy chat-loop ↔ native-engine" ikilisine üçüncü bir eksen ("native-engine+API-adapter" ↔ "native-engine+CLI-MCP-adapter") eklenir, çünkü CLI-MCP yolunun iterasyon/izin-zamanlama davranışı GERÇEKTEN farklı. Task 15'in scope'u güncellenmeden B'yi M5'e sokmak dürüst-olmayan bir "parity" iddiası olur. | **Native-engine'in varsayılan-transport zincirine SIFIR etki** (API/Ollama önceliği aynen kalır) — M5 gate'i mevcut kapsamıyla ilerleyebilir. AMA: SP-1 §10 Faz-4'ün vaadini ("legacy silinir… tag-parse hack repodan çıkar", §11 başarı-kriteri) fiilen ERTELER/gölgeler — CLI-spawn+tag-parse-BENZERİ bir kod-yolu, küçültülmüş kapsamda, "son-çare" olarak YAŞAMAYA devam eder. |
| **Uygulama maliyeti + risk** | **Düşük.** Spawn/pipe/NDJSON-unwrap `chat-session.ts`'te ZATEN kanıtlı; yalnız yeni bir `provider-tooluse/claude-cli.ts` + `detectTransport` dalı + yapılandırılmış-metin protokolü. En büyük risk: prompt-tabanlı tool-çağrı-çıkarımının model-uyumu (deterministik değil, şema-zorlamalı değil) — SP-1'in TAM ÖLDÜRMEK istediği kırılganlık, kapsamı `claude-cli.ts` dosyasına daraltılmış hâliyle geri döner. | **Yüksek + doğrulanmamış.** `--mcp-config` + `--permission-prompt-tool`'un kalıcı `--input-format stream-json` modunda birlikte çalıştığına dair repoda kanıt YOK (bir doğrulama-spike'ı gerekir). Ayrıca `loop.ts`/`session.ts`'e CLI-owned-iteration için YENİ bir kontrol-akışı (guard'ların CLI-içi turlara nasıl uygulanacağı) eklenmesi gerekir — bu SP-1'in "greenfield + view korunur, engine bir kere daha kırılmasın" disiplinine ek mühendislik-yükü demektir. | A ile aynı temel maliyet + `detectTransport`'a bir düşük-öncelik dalı ve kullanıcıya açık-onay UX'i eklemek (küçük ek). |

---

## 5. Öneri

**Kısa-vade (M5 ufku için) önerilen: Seçenek A'nın transport-mekanizması, Seçenek C'nin
öncelik-deseniyle sarılmış.** Somut olarak:

1. `provider-tooluse/claude-cli.ts` — Seçenek A'daki dumb-pipe adapter'ı yaz: CLI'a hiç tool
   vermeden, `chat-session.ts`'in kanıtlı spawn/NDJSON-unwrap altyapısını (metin-akışı + usage
   kısmı) yeniden-kullan, tool-niyeti için `<deckent_tool>` yerine tek-fence yapılandırılmış-JSON
   protokolü kullan (daha az belirsiz, ama YİNE DE şema-zorlamalı değil — bu kısıt açıkça
   dokümante edilmeli, gizlenmemeli).
2. `detectTransport`'a bu adapter'ı **C'nin önceliğiyle** ekle: `anthropic-api >
   openai-compatible > ollama > anthropic-subscription-cli > none`. Yani mevcut üç transport'un
   ÖNÜNE geçmez — yalnız hiçbiri yokken (ve kullanıcı açıkça etkinleştirdiyse) devreye girer.
   Bu, SP-1'in kilitli önceliğini BOZMADAN abonelik-kotasını erişilebilir kılar.
3. Flag-gated, default-OFF (SP-1 §10 Faz-1 disiplini): `native_subscription_cli: true` config +
   `DECKENT_NATIVE_SUBSCRIPTION_CLI=1` env — herhangi bir "riskli/görsel kod kör-default-on
   edilmez" ilkesiyle uyumlu.
4. NATIVE-M5-GATE'e (Task 15) tek bir `KNOWN_DIVERGENCES` satırı ekle: "claude-cli transport,
   tool-çağrı-çıkarımı için native `tool_use` yerine yapılandırılmış-metin protokolü kullanır —
   model-uyum-oranı %100 garanti değildir; bu SAYISAL olarak (ör. N-turluk mock-suite'te başarı
   oranı) izlenmeli."

**Neden B değil (şimdilik):** B mimari olarak en "temiz" sonucu (gerçek native `tool_use`, CLI
üzerinden) vaat ediyor, ama (a) kritik CLI-bayrak-kombinasyonu bu repoda DOĞRULANMAMIŞ, (b)
`loop.ts`/`session.ts`'in tool-iterasyon sahipliğini CLI'a kısmen devretmesi SP-1'in kök-sebep
reddiyle doğrudan gerilim içinde, (c) NATIVE-M5-GATE'in kapsamını genişletmeden B'yi M5'e sokmak
dürüst-olmayan bir parite-iddiası olur. **B, ayrı bir doğrulama-spike'ı (CLI
`--mcp-config`+`--permission-prompt-tool` kombinasyonunun kalıcı stream-json modunda gerçekten
çalıştığını KANITLAYAN, kod-değişikliği içermeyen küçük bir PoC) SONRASI, SP-1.x'in bir sonraki
alt-spec'i olarak** yeniden değerlendirilmeli — Law #3 (never MVP) bunun "asla" değil "şimdi
değil, doğrulanmadan değil" anlamına geldiğini gerektirir.

**Neden C tek-başına değil:** C'nin öncelik-deseni DOĞRU ama C'nin kendisi bir mekanizma değil,
A'nın nasıl-devreye-gireceğine dair bir politika — bu yüzden §5'teki öneri A+C'nin birleşimidir,
C'yi ayrı bir "seçenek" olarak uygulamak A'yı zaten gerektirir.

**Açıkça isimlendirilmiş gerilim:** Bu öneri, SP-1 §10 Faz-4'ün "tag-parse hack repodan
tümden çıkar" vaadini TAM anlamıyla yerine getirmez — yapılandırılmış-metin protokolü, kapsamı
tek bir dosyaya (`claude-cli.ts`) daraltılmış olsa da, aynı KATEGORİDE bir mekanizmadır (şema-
zorlamasız, prompt-uyumuna bağlı metin-ayrıştırma). Bu, "sarmalayıcıdan tam çıkış" hedefiyle
"abonelik-kotasını terminalde kullanılabilir kılma" hedefi arasında GERÇEK bir ödünleşim olduğunun
dürüst kabulüdür — gizlenmemeli, §6'da açık madde olarak kayda geçirilmeli.

---

## 6. Önerilen Karar (ADR-taslak — status: PROPOSED, Alperen onayı bekliyor)

> Bu bölüm ADR formatındadır ama bir `docs/adr/*.md` dosyası DEĞİLDİR ve `.brain/memory.db`'ye
> `store.insert({type:'adr', ...})` ile KAYDEDİLMEMİŞTİR (task nogo: "ADR-DB'ye kayıt (yalnız
> taslak-doküman)"). Alperen onaylarsa, bu bölüm ayrı bir `docs/adr/adr-g-0XX-native-subscription-
> transport.md` dosyasına + ADR-DB kaydına dönüştürülür.

**Class:** ADR-D (proje-özel, terminal transport) · **Scope:** `src/agent/`, `src/cli/repl/` ·
**Status:** proposed (NOT accepted) · **Absorbs:** SP-1 §3 "Transport" maddesinin tek satırlık
istisnası (Anthropic API veya yerel; abonelik hariç)

### Context
SP-1, native-terminal-agent'ın transport'unu Anthropic API / OpenAI-uyumlu / Ollama ile
sınırladı; Anthropic aboneliği (Pro/Max) raw API vermediği için bu üç seçenek dışında kalıyor,
kullanıcı zaten ödediği abonelik-kotasını terminalde kullanamıyor. §1-§4 bu boşluğu üç seçenekle
(A/B/C) analiz etti.

### Decision (önerilen, henüz kabul değil)
1. `claude` CLI'ı **yalnız tek bir yeni, en-düşük-öncelikli transport** (`anthropic-subscription-
   cli`) olarak, native-engine'in tool-loop SAHİPLİĞİNİ (`src/agent/loop.ts`) DEĞİŞTİRMEDEN ekle
   (Seçenek A mekanizması, Seçenek C önceliğiyle).
2. CLI'a HİÇBİR native tool-şeması verilmez (`--allowedTools`/`--mcp-config` kullanılmaz); tool-
   niyeti yapılandırılmış-metin protokolüyle adapter-seviyesinde ayrıştırılır — bu protokolün
   şema-zorlamasız doğası KULLANICIYA ve NATIVE-M5-GATE'e açıkça bildirilir (KNOWN_DIVERGENCES).
3. Flag-gated, default-OFF; `detectTransport` önceliği `anthropic-api > openai-compatible >
   ollama > anthropic-subscription-cli > none` olarak sabitlenir — mevcut üç transport'un
   davranışı BYTE-AYNI korunur (regresyon-sıfır garantisi).
4. Seçenek B ("gerçek native `tool_use`, MCP-köprülü") **reddedilmiyor, ERTELENİYOR**: SP-1.x'in
   bir sonraki alt-spec'i olarak, önce bir kod-değişikliksiz doğrulama-spike'ı (CLI `--mcp-
   config`+`--permission-prompt-tool` kombinasyonunun kalıcı stream-json modunda çalıştığının
   kanıtlanması) şartıyla yeniden gündeme alınır.

### Consequences
**(+)** Abonelik-kotası terminalde erişilebilir olur, mevcut transport'lara sıfır regresyon,
`loop.ts`/`session.ts`/`permission.ts` değişmez (M5 gate riskini büyütmez), spawn/parse altyapısı
kanıtlı kod-tekrar-kullanımı (`chat-session.ts`).
**(−)** SP-1 §10 Faz-4'ün "tag-parse hack TÜMDEN çıkar" vaadi tam anlamıyla gerçekleşmez —
kapsamı-daraltılmış, tek-dosyalık bir yapılandırılmış-metin protokolü kalıcı olur. Cache-control
ve thinking/reasoning-block'lar bu transport'ta hiçbir zaman ilk-sınıf olmayacak (CLI'ın kendi
heuristiğine + `ProviderEvent` union'ının bugünkü kapsamına bağımlı). Abonelik-kotası ile
orkestratör-sprint'lerinin AYNI hesabı paylaşması durumunda kota-çakışması riski advisory-seviyede
kalır (hard-ceiling yok) — ayrı bir follow-up (§7) gerektirir.

---

## 7. Açık sorular / follow-up iş kalemleri (isimlendirilmiş, sessizce düşürülmemiş)

- **SPIKE-MCP-CLI:** Seçenek B'nin `--mcp-config` + `--permission-prompt-tool` kombinasyonunun
  `--print --input-format stream-json` kalıcı modunda çalışıp çalışmadığını doğrulayan,
  kod-değişikliksiz bir küçük PoC — B'nin yeniden-değerlendirilmesinin ÖN-KOŞULU.
  Bkz. `feedback_cross_check_anthropic_openai`, `project_deckent_native_terminal_agent` (memory).
- **QUOTA-GUARD:** Abonelik-kotası için `costGuard`'ın (`guards/cost.ts`) $-ceiling modelinden
  ayrı, token/tur-bazlı bir "quota-advisory" mekanizması — terminal + orkestratör sprint'lerinin
  AYNI abonelik-hesabını eşzamanlı tükettiği senaryoda kullanıcıya görünürlük sağlamak için.
- **EFFORT-PASSTHROUGH:** `native-transport.ts`/`native-agent-bridge.ts`'e `--effort` (CLI) /
  `thinking` (API, henüz `anthropic.ts`'de implement değil) parametresini taşıyan bir config-seam
  — bugün native-engine'de YOK, yalnız orkestratör tarafında (`resolveReasoningEffort`) var.
- **NATIVE-M5-GATE scope-update:** Task 15'in `KNOWN_DIVERGENCES` listesine bu doküman kabul
  edilirse eklenmesi gereken satır — bu doküman TEK BAŞINA Task 15'i değiştirmez (write-scope
  dışı), yalnız gerekliliği burada kayda geçiriyor.
