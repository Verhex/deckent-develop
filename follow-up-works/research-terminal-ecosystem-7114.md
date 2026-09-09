# Agentic terminal ekosistem araştırması — deckent native terminal (MASTER 7107 / 7114)

> **Silinme tetiği:** MASTER 7114 DONE + "terminal-bağlam-hatırla" owner kararı MASTER satırına işlendiğinde bu doküman SİLİNİR (kalıcı kayıt = MASTER satır-kanıtı). Üretici: Opus araştırma ajanı, 2026-09-09; toplayıcı: Fable 5.1.

**Kapsam:** Claude Code · OpenAI Codex CLI · Cursor CLI (`cursor-agent`) · Gemini CLI · Aider · OpenCode · Goose. Tarih: 2026-09-09. Salt-okunur araştırma; hiçbir repo dosyası değiştirilmedi.
**Kanıt kuralı:** her iddia URL'li; doğrulanamayan her şey `[doğrulanamadı]` etiketli. Sürüm numarası ve özellik adı uydurulmadı — kaynak söylemiyorsa yazılmadı.

## 1. Yönetici özeti

1. **Sorun yetenek değil, sözleşme.** Model 665 s boyunca sustu ama "Ne durumdasın?" sorusuna 24 s'de tam rapor yazdı. Görünür metin üretebiliyor; **hiçbir yerde istenmiyor.**
2. deckent'in `composeSystemPrompt()`'unda (`src/agent/identity.ts`) tool-use veya anlatım hakkında **tek satır yok** — yalnız güvenlik çekirdeği, scratchpad, soul ve proje dokümanı.
3. Ekosistemin tamamı bunu **prompt'ta** çözüyor. Gemini: *"Never call tools in silence. You MUST provide a concise, one-sentence explanation… immediately before executing tool calls."* Codex: ayrı `### Preamble messages` + `## Sharing progress updates` bölümleri, kelime sayısına kadar reçeteli. İkisi de kaynak kodda, birebir kopyalanabilir.
4. **Hiçbir araçta host-zorunlu ara teslim yok.** 7 aracın hepsi prompt'a güveniyor; zaman/tur eşikleri (Goose `--max-turns`, Claude Code stall timeout) yalnız **durdurucu**. deckent'in 7114'teki `interimAnswerAfterMs` fikri yakalama işi değil, **farklılaştırıcı** — ama anlatım sözleşmesi olmadan boş metin üretir.
5. **Araç satırı düzeltmesi ~20 satırlık iş.** `native-agent-bridge.ts:1102` `target: ''` gönderiyor; `primaryResource(args)` `loop.ts:207`'de zaten export edilmiş, `ToolInfo`'ya `durationMs?` eklemek kalıyor.
6. **`/v1/tokenize` 404 yanlış rota kullanımıdır.** llama.cpp'de doğrusu `POST /tokenize` (native, `/v1` yok) ve doğrudan istek sayımı için `POST /v1/chat/completions/input_tokens`; efektif pencere `GET /props`'tan. Bu tek düzeltme 7109-b'nin "exact" koşulunu kapatır.
7. **Bayt/token birim karışımı (RC2) ekosistemde hiçbir araçta yok** — çünkü hiçbiri tavanı pencereden türetip başka birimde ölçmüyor (Claude Code 30k karakter + 25k token ayrı; OpenCode 2000 satır + 50 KB sabit; Codex 1 MiB sabit).
8. **Boş `findings` checkpoint'i (RC4) ekosistemde imkânsız**: Gemini katı XML `<state_snapshot>` şeması + *"NEVER exit the format"*, Codex "handoff summary" şablonu dayatıyor.
9. **Codex'in `codex-execpolicy` crate'i 7111'in hazır mimarisidir**: bildirimsel `prefix_rule(decision=allow|prompt|forbidden)` + `match`/`not_match` örnekleri **yükleme anında** doğrulanır. deckent'in "≥40 adversarial matris" kriteri böylece testten *kuralın parçasına* dönüşür.
10. **Kesme anında kısmi metnin korunacağını açıkça garanti eden tek araç Aider** — deckent'in 7114 kriteriyle birebir aynı, ve Gemini'de bu gerçekten kusurlu (#7934).
11. **Bağlam boyutu: BÜYÜTME.** Ölçülen istekler 13–17k token / 131k pencere = %13 doluluk; pencere hiç bağlayıcı kısıt değildi. Qwen3-32B'nin **native bağlamı 32.768**; 131k statik YaRN ile geliyor ve Qwen'in kendi dokümanı kısa metinlerde kalite kaybı uyarısı yapıyor. Öneri: **65536 + `--rope-scale 2.0`**, ölçümü kesinleştir. Ollama ajanik iş için ≥64k, Goose 32k, OpenCode 16–32k öneriyor; **hiçbiri 200k+ önermiyor.**
12. **≤1 günlük paket = KV-1 (anlatım sözleşmesi) + KV-2 (hedef+süre) + KV-4 (gerçek tokenize), ≈6 saat.** Kalan KV-5…KV-10 aynı disiplinde ~2 gün daha; OV maddeleri ayrı.

---

## 2. Soru-soru ekosistem karşılaştırması

### 2.1 Soru 1 — Araçlar arası anlatım / çalışırken akan ara metin

| Araç | Anlatım nasıl sağlanıyor | Zorunlu mu | Kanıt tipi |
|---|---|---|---|
| **Codex CLI** | Sistem prompt'unda **ayrı `### Preamble messages` bölümü** + `## Sharing progress updates` bölümü; kelime sayısına kadar reçete | prompt-zorunlu (host değil) | birincil kaynak dosyası |
| Claude Code | Sistem prompt'u "brief, user-facing updates at key moments during tool use"; `Concise` output style bunu **kapatıyor** ("skips preamble and narration") | prompt-zorunlu | resmî doküman + sızıntı |
| OpenCode | Prompt tersine: "No Chitchat: Avoid conversational filler, preambles…, or postambles"; yalnız riskli bash öncesi açıklama zorunlu | prompt-zorunlu (negatif) | sızıntı deposu |
| Goose | Belgelenmiş anlatım talimatı bulunamadı | — | *[doğrulanamadı]* |
| **Gemini CLI** | Prompt fonksiyonu `mandateExplainBeforeActing()`: **"Never call tools in silence. You MUST…"** | prompt-zorunlu (en sert ifade) | birincil kaynak dosyası |
| Aider | Anlatım sözleşmesi yok; `--stream` (varsayılan True) ve architect/editor iki-model akışı ilerlemeyi görünür kılar | — | resmî doküman |
| Cursor CLI | Belgelenmiş anlatım sözleşmesi bulunamadı | — | *[doğrulanamadı]* |

- **Codex CLI'nin sözleşmesi ekosistemin en açık örneğidir ve doğrudan kopyalanabilir.** Verbatim: *"Before making tool calls, send a brief preamble to the user explaining what you're about to do."* Kuralları: **Logically group related actions** (birden çok ilgili komut tek preamble'da), **Keep it concise** ("no more than 1-2 sentences… 8–12 words for quick updates"), **Build on prior context** ("if this is not your first tool call, use the preamble message to connect the dots with what's been done so far"), **Keep your tone light, friendly and curious**, ve bir **Exception**: *"Avoid adding a preamble for every trivial read (e.g., `cat` a single file) unless it's part of a larger grouped action."* Ardından 8 örnek cümle veriliyor. https://github.com/openai/codex/blob/main/codex-rs/protocol/src/prompts/base_instructions/default.md
- Codex'te **ikinci, ayrı bir bölüm** uzun işleri hedefliyor — `## Sharing progress updates`: *"For especially longer tasks that you work on (i.e. requiring many tool calls, or a plan with multiple steps), you should provide progress updates back to the user at reasonable intervals. These updates should be structured as a concise sentence or two (no more than 8-10 words long) recapping progress so far…"* ve *"Before doing large chunks of work that may incur latency as experienced by the user … you should send a concise message to the user with an update indicating what you're about to do."* (aynı dosya)
- **Ama hiçbiri host-zorunlu değil.** Codex'te de Claude Code'da da anlatım *prompt* seviyesinde kalıyor; model susarsa host araya girip metin talep etmiyor. Bu araştırmada hiçbir araçta "N araç çağrısından / N saniyeden sonra kullanıcıya metin üret" şeklinde **host tarafından dayatılan** bir mekanizma bulunamadı. Claude Code'da bulunan tek zaman-eşiği `CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS` (varsayılan 600.000 ms) ve o da *takılmış arka-plan subagent'ını iptal ediyor*, anlatım zorlamıyor. https://code.claude.com/docs/en/env-vars
- Claude Code'un resmî `Concise` output style tanımı, **varsayılan stilin anlatım içerdiğini dolaylı ama kesin biçimde kanıtlıyor**: *"Concise: Claude leads with the result, **skips preamble and narration**, and keeps responses short by default."* Yani anlatım Claude Code'da varsayılandır ve kullanıcı isterse kapatır. https://code.claude.com/docs/en/output-styles
- Claude Code sistem prompt'unun "Communication Style" bölümü ise "give brief, user-facing updates at key moments during tool use, write concise end-of-turn summaries" diyor — kaynak resmî değil, topluluk derlemesi *[doğrulanamadı: Anthropic yayınlamıyor]*. https://github.com/Piebald-AI/claude-code-system-prompts
- **Mekanik taraf:** metin ve `tool_use` blokları aynı akışta ayrı content-block'lar olarak gelir; bir TUI'nin `in_tool` durumunu izleyip metni araya karıştırmaması gerekir. Yani "araçlar arası metin" protokol düzeyinde zaten mümkün — eksik olan talep. https://code.claude.com/docs/en/agent-sdk/streaming-output
- **Karşı örnek olarak OpenCode**, anlatımı bilinçli olarak kısıyor: sistem prompt'u *"Minimal Output: Aim for fewer than 3 lines of text output… per response"* ve *"No Chitchat: Avoid conversational filler, preambles…"* derken yalnız durum-değiştiren komutlar için *"I must provide a brief explanation of the command's purpose and potential impact"* şartı koyuyor. (kaynak: sızıntı deposu, resmî değil *[doğrulanamadı]*) https://github.com/asgeirtj/system_prompts_leaks/blob/main/Misc/opencode.md
- Codex ayrıca anlatımı bir **araç** olarak da yüzeye çıkarıyor: `update_plan` tool'u adımları ve ilerlemeyi host'a render ettiriyor ve prompt *"Do not repeat the full contents of the plan after an `update_plan` call — the harness already displays it"* diyerek anlatımın nereye ait olduğunu ayırıyor. (aynı prompt dosyası, `## Planning`)
- **Gemini CLI ekosistemin en sert anlatım maddesine sahip** ve bu madde kaynak kodunda ayrı bir fonksiyon: `mandateExplainBeforeActing()` verbatim — *"**Explain Before Acting:** Never call tools in silence. You MUST provide a concise, one-sentence explanation of your intent or strategy immediately before executing tool calls. This is essential for transparency, especially when confirming a request or answering a question. **Silence is only acceptable for repetitive, low-level discovery operations (e.g., sequential file reads) where narration would be noisy.**"* Hemen ardından ters yönde bir kural: *"**Explaining Changes:** After completing a code modification or file operation *do not* provide summaries unless asked."* https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/prompts/snippets.ts (`snippets.ts:687-691`; `prompts.ts` artık yalnız `PromptProvider`'a delege eden ince bir kabuk)
- Gemini'nin ayrıca shell'e özel maddesi var: *"**Explain Critical Commands:** Before executing commands with `run_shell_command` that modify the file system, codebase, or system state, you *must* provide a brief explanation… You should not ask permission to use the tool; the user will be presented with a confirmation dialogue upon use."* (aynı dosya) — **anlatım ile onay ayrıştırılmış**: model açıklar, host onay sorar. deckent için doğrudan alınabilir bir ayrım.
- Aider'da anlatım sözleşmesi yerine **akış** var: `--stream` varsayılan `True` (https://aider.chat/docs/config/options.html), ve architect/editor modunda "ana model mimar olarak çözümü önerir, sonra ikinci bir 'editor model' bunu dosya-düzenleme talimatına çevirir" — yani mimarın düzyazı önerisi kullanıcıya görünür bir ara-teslim işlevi görüyor. https://aider.chat/docs/usage/modes.html
- **Ortak desen (deckent'in kopyalaması gereken):** üç ciddi araç da (Codex, Gemini, Claude Code) anlatımı **istisnalı** tanımlıyor — "her önemsiz okuma için değil, gruplanmış eylem için". Yani kural "her tool öncesi konuş" değil, **"sessiz kalma; ilgili çağrıları grupla ve grubu anlat"**. Bu, deckent'in preamble bütçesine de uygun: sabit maliyet ~10-15 satır.

### 2.2 Soru 2 — Uzun sessiz aralıklarda ilerleme UX'i

| Araç | Durum satırı | Süre | Token/bağlam | Kesme ipucu | Zorunlu ara teslim |
|---|---|---|---|---|---|
| Claude Code | `✳ <fiil>… (esc to interrupt · 5s · ↓ 217 tokens · thinking)` | VAR (saniye) | VAR (token deltası + statusline `context_window.used_percentage`) | VAR | **YOK** |
| Codex CLI | `StatusIndicatorWidget` spinner + hint | VAR (elapsed timer) | footer'a eklenmesi hâlâ **açık istek** (#21324) | VAR (Esc) | **YOK** (yalnız prompt) |
| Cursor CLI | *[doğrulanamadı]* | *[doğrulanamadı]* | *[doğrulanamadı]* | y/n onay istemi belgeli | **YOK** |
| OpenCode | oturum satırında spinner/retry/idle glyph; `/details` ile araç detayı | *[doğrulanamadı]* | context "1.2K (12%)" + maliyet | *[doğrulanamadı]* | **YOK** |
| **Gemini CLI** | espri havuzundan dönen ifade (5 s'de bir) | VAR — `(esc to cancel, {n}s)` | `/stats`; `Thought` olayı akıyor | VAR (metnin içinde) | **YOK** |
| Aider | `--stream` varsayılan açık | *[doğrulanamadı]* | `/tokens` | Ctrl-C | **YOK** |
| Goose | `ThinkingIndicator` spinner; `/r` ile araç-çıktısı ayrıntı seviyesi | *[doğrulanamadı]* | `GOOSE_CONTEXT_LIMIT` bazlı | Ctrl+C | **YOK** (`--max-turns` yalnız durdurur) |

- **Claude Code'un durum satırı formatı ekosistemin referansı:** spinner fiili + geçen saniye + token deltası + "esc to interrupt", hepsi tek satırda ve **sürekli güncellenir**. https://github.com/anthropics/claude-code/issues/16578
- Claude Code araç-içi ilerlemeyi ayrı bir olay tipiyle de yayınlıyor: `SDKToolProgressMessage` (`tool_progress`) alanları `elapsed_time_seconds`, `tool_use_id`, `tool_name`, opsiyonel `heartbeat` — yani **çalışan bir araç çağrısı boyunca periyodik nabız** var. https://code.claude.com/docs/en/agent-sdk/typescript
- Özel statusline stdin'den JSON alıp maliyet, duvar-saati/API süresi ve bağlam-penceresi yüzdesini sürekli render edebiliyor; yüzde yalnız input+cache token'larından hesaplanıyor (output hariç). https://code.claude.com/docs/en/statusline
- **Codex'te ilerleme büyük ölçüde prompt'a bırakılmış**; TUI tarafında token/bağlam göstergesi hâlâ açık bir özellik isteği. https://github.com/openai/codex/issues/21324 — `update_plan` tool'u ise host tarafından render edilen gerçek bir ilerleme yüzeyi (`codex exec`'te varsayılan kapalı, `--include-plan-tool` ile açılır). https://github.com/openai/codex/issues/5359
- Codex'in `model_reasoning_summary` (`auto|concise|detailed|none`) ayarı düşünme özetini TUI'ye akıtıyor; **bilinen kusur**: özet ancak düşünme adımı bittikten sonra flush oluyor, bu yüzden arayüz donmuş hissettiriyor. https://github.com/openai/codex/issues/8204 · https://github.com/openai/codex/issues/16801
- **En önemli negatif bulgu:** incelenen yedi aracın hiçbirinde "N araç çağrısı veya N saniye sonra kullanıcıya görünür metin üret" şeklinde **host tarafından dayatılan** bir ara-teslim mekanizması yok. Goose'un `--max-turns` (varsayılan 1000, `GOOSE_MAX_TURNS`) ve Claude Code'un `CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS` (600.000 ms) eşikleri **durdurucu**, üretici değil. https://goose-docs.ai/docs/tutorials/headless-goose · https://code.claude.com/docs/en/env-vars
- Yani deckent'in 7114'te tasarladığı `interimAnswerAfterToolCalls` / `interimAnswerAfterMs` **yakalama işi değil, ekosistemde karşılığı olmayan bir farklılaştırıcıdır** — ama ancak anlatım sözleşmesiyle (2.1) birlikte anlamlıdır: zorunlu teslim, söyleyecek sözü olmayan bir modelden boş metin çıkarır.
- **Gemini CLI'nin yükleme göstergesi tam olarak deckent'in ihtiyaç duyduğu biçimde:** `LoadingIndicator.tsx` `` `(esc to cancel, ${elapsedTime}s)` `` render ediyor ve yanında dönen bir ifade var; ifade `WITTY_PHRASE_CHANGE_INTERVAL_MS = 5000` ms'de, genel ifade `PHRASE_CHANGE_INTERVAL_MS = 10000` ms'de değişiyor — yani **ekran asla 5 saniyeden uzun hareketsiz kalmıyor**, model sussa bile. https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/ui/components/LoadingIndicator.tsx · https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/ui/hooks/usePhraseCycler.ts
- Gemini'de düşünme **birinci sınıf bir akış olayı**: `GeminiEventType.Thought` ve `ThoughtSummary` (`parseThought`) turn akışında taşınıyor — deckent'in `reasoning-activity` olayının muadili, ama içerik taşıyor (yalnız aktivite sayacı değil). https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/core/turn.ts
- Aider'ın ilerleme yüzeyi minimal: `--stream` (varsayılan True) + düzenleme sonrası `--auto-lint` (varsayılan True) çıktısı. Repo-map inşası sırasında ilerleme göstergesi *[doğrulanamadı]*. https://aider.chat/docs/config/options.html · https://aider.chat/docs/usage/lint-test.html

### 2.3 Soru 3 — Bağlam yönetimi: compaction, kesme tavanları, büyük dosya

| Araç | Tetik eşiği | Ne korunur | Araç-çıktısı tavanı | Dosya okuma tavanı |
|---|---|---|---|---|
| Claude Code | `autoCompactWindow` (100k–1M, modele göre); `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` yalnız **erkene alabilir** | yapılandırılmış özet + yeniden okunan son değişen dosyalar + skill gövdeleri (5k/skill, 25k toplam) | bash 30.000 karakter (`BASH_MAX_OUTPUT_LENGTH`, tavan 150.000); MCP 25.000 token (`MAX_MCP_OUTPUT_TOKENS`) | ~2000 satır / 25.000 token *(topluluk kaynaklı)* |
| Codex CLI | `model_auto_compact_token_limit`; ~%90 üstüne çıkarılamaz *(ikincil kaynak)* | LLM'e yazdırılan "handoff summary" + son ~20k token kullanıcı mesajı | exec çıktısı **1 MiB** (`DEFAULT_OUTPUT_BYTES_CAP`), canlı delta 10.000 olay | — |
| **Gemini CLI** | `DEFAULT_COMPRESSION_TOKEN_THRESHOLD = 0.5` (token limitinin yarısı) | son **%30** geçmiş (`COMPRESSION_PRESERVE_THRESHOLD = 0.3`) + XML `<state_snapshot>` | — | 2000 satır / 2000 karakter-satır / 20 MB |
| Aider | `--max-chat-history-tokens` yumuşak sınır → özetleme | `/add`'lenmiş dosyalar + repo-map (`--map-tokens`, ~1k) | — | — |
| OpenCode | `compaction: {auto, prune, reserved: 10000}` | gizli "compaction" sistem-ajanı özeti; plugin `session.compacting` hook'uyla ek bağlam enjekte edilebilir | `MAX_LINES = 2000`, `MAX_BYTES = 50*1024` | `DEFAULT_READ_LIMIT = 2000` satır, `MAX_LINE_LENGTH = 2000`, `MAX_BYTES = 50 KB` |
| Goose | token limitinin **%80**'i | `GOOSE_CONTEXT_STRATEGY`: `summarize` \| `truncate` \| `clear` \| `prompt` | `/r` ile görünürlük | — |

- **Gemini CLI'nin compaction prompt'u en iyi şablon.** `getCompressionPrompt()` katı bir XML `<state_snapshot>` üretiyor; bölümleri: `<overall_goal>`, `<key_knowledge>`, `<artifact_trail>`, `<file_system_state>`, `<recent_actions>`, `<task_state>` + özetleyiciye geçmişteki gömülü komutları yok sayma talimatı (prompt-injection savunması). Talimat: *"**NEVER** exit the `<state_snapshot>` format"*, *"Be incredibly dense with information."* https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/prompts/snippets.ts (`snippets.ts:885-963`) — **deckent'in boş `findings`/`nextActions` alanlı deterministik checkpoint'inin (RC4/7112) tam karşıtı**: burada şema zorunlu ve doldurulması dayatılıyor.
- **Codex'in compaction şablonu da açık kaynak:** *"You are performing a CONTEXT CHECKPOINT COMPACTION. Create a handoff summary… Include: Current progress and key decisions made; Important context, constraints, or user preferences; What remains to be done; Any critical data, examples, or references."* https://github.com/openai/codex/blob/main/codex-rs/prompts/templates/compact/prompt.md
- **Claude Code compaction sonrası neyi geri yüklediğini açıkça sayıyor:** "startup content reloaded outside message history, a structured summary of the prior conversation, **recently modified files re-read with their matching rules**, and the body of invoked skills"; skill yeniden-enjeksiyonu 5.000 token/skill ve 25.000 token toplamla sınırlı, sondan kesiliyor. Ayrıca `CLAUDE.md`'ye "Compact instructions" bölümü koyarak neyin korunacağı yönlendirilebiliyor. https://code.claude.com/docs/en/context-window · https://code.claude.com/docs/en/costs
- **Kesme tavanları evrensel olarak açık ve iki-birimli değil.** Claude Code bash için 30.000 *karakter*, MCP için 25.000 *token* — ikisi ayrı ayrı ve doğru birimde (https://code.claude.com/docs/en/tools-reference · https://code.claude.com/docs/en/agent-sdk/mcp). OpenCode `truncate.ts`'de `MAX_LINES = 2000` ve `MAX_BYTES = 50 * 1024`, yani **satır VE bayt** — token değil, ama tavan da token bütçesinden türetilmiyor; karışım yok (https://github.com/sst/opencode/blob/dev/packages/opencode/src/tool/truncate.ts). Codex exec çıktısı 1 MiB (`DEFAULT_OUTPUT_BYTES_CAP`) (https://github.com/openai/codex/blob/main/codex-rs/utils/pty/src/lib.rs). **deckent'in RC2 hatası (token pencereden türetilip bayt sayısıyla karşılaştırma) ekosistemde hiçbir araçta yok** — çünkü hiçbiri tavanı pencereden türetip başka birimde ölçmüyor.
- **Büyük dosya stratejisi: tam okuma yerine aralık + arama.** Gemini `read_file` parametreleri artık `file_path` + `start_line?` + `end_line?` (1-tabanlı, dahil) ve ayrıca `read_many_files` (`include`/`exclude` glob'ları ile toplu okuma) var (https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/tools/read-file.ts · .../read-many-files.ts). Claude Code dokümanı tam okuma yerine Grep/Glob'u, sığmıyorsa Read'de `offset`/`limit` sayfalamasını öneriyor (https://code.claude.com/docs/en/tools-reference).
- **Aider'ın yaklaşımı yapısal olarak farklı ve deckent'in 7113'ü için ilham:** dosyalar bağlama girmez; yalnız `/add`'lenenler düzenlenebilir, geri kalan repo **repo-map** ile temsil edilir — graf-sıralı sınıf/fonksiyon imzaları, `--map-tokens` varsayılan ~1k. Doküman gerekçeyi açıkça yazıyor: *"Adding a bunch of files that are mostly irrelevant to the task at hand will often distract or confuse the LLM."* https://aider.chat/docs/repomap.html · https://aider.chat/docs/faq.html
- Token sayımı: Gemini `countTokens` API + `DEFAULT_TOKEN_LIMIT = 1_048_576` (https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/core/tokenLimits.ts); Claude Code provider'ın `usage` alanlarından hesaplıyor; Codex `model_context_window`'u config'ten alıyor ve yerel modellerde **elle set edilmesi gerekiyor** (https://github.com/openai/codex/issues/19185). OpenCode'un sayım yöntemi *[doğrulanamadı]*.

### 2.4 Soru 4 — Onay akışı: salt-okunur otomatiği, sınıflandırma, onay yorgunluğu

| Araç | Modlar | Salt-okunur otomatiği | Sınıflandırma mekanizması | Gruplama |
|---|---|---|---|---|
| Claude Code | `default` · `acceptEdits` · `plan` · `auto` · `dontAsk` · `bypassPermissions` | okumalar varsayılan olarak onaysız; `auto` modda sınıflandırıcı | `permissions.allow/ask/deny` + `Tool(specifier)` önek eşleme (`Bash(npm run *)`); `deny` her şeyi yener | Shift+Tab ile mod döngüsü |
| **Codex CLI** | `on-request` (varsayılan) · `never` · `granular{…}`; `untrusted` **emekli** *(ikincil)* | **`codex-execpolicy` DSL'i** — `decision` varsayılanı `allow` | `prefix_rule(pattern, decision=allow\|prompt\|forbidden, justification, match, not_match)` + `host_executable(name, paths)` | prompt seviyesinde ("logically group related actions") |
| Cursor CLI | varsayılan y/n; `--force`/`--yolo`; `--trust` | — | `permissions.allow/deny`: `Shell(base)`, `Read(glob)`, `Write(glob)`, `WebFetch(pattern)`, `Mcp(server:tool)`; deny > allow | — |
| Gemini CLI | `DEFAULT` · `AUTO_EDIT` · `YOLO` · `PLAN` | `coreTools` allowlist (`ShellTool(ls)` gibi) | `coreTools`/`excludeTools` + folder-trust | `ProceedAlwaysServer` / `ProceedAlwaysTool` |
| Aider | `--yes-always` | — | — | — |
| OpenCode | `permission: {bash:{…}, edit:{…}, webfetch:{…}}` | `"grep *": "allow"` gibi kalıplar | glob kalıp; **son eşleşen kural kazanır** | ajan-bazlı override |
| Goose | `GOOSE_MODE`: `auto` · `approve` · `smart_approve` · `chat` | `smart_approve` düşük-riskli işlemleri geçer | araç-bazlı `Always Allow`/`Ask Before`/`Never Allow` | — |

- **Codex'in `codex-execpolicy` crate'i deckent 7111 için doğrudan referans mimaridir.** Starlark sözdizimli bildirimsel kural dili: `prefix_rule(pattern=[...], decision="allow"|"prompt"| "forbidden", justification=..., match=[...], not_match=[...])`. Kritik iki özellik: (a) **`match`/`not_match` örnekleri yükleme anında doğrulanır** — README: *"examples that are validated at load time (think of them as unit tests)"*; (b) `host_executable(name, paths)` mutlak-yol/basename çözümlemesini kısıtlar (cross-platform güvenlik). Örnek politikada `ls`, `cat`, `head` varsayılan `allow`; `cp` `prompt`; `git reset --hard` `forbidden` + gerekçe. CLI ile denenebilir: `codex execpolicy check --rules … git status`. https://github.com/openai/codex/blob/main/codex-rs/execpolicy/README.md · https://github.com/openai/codex/blob/main/codex-rs/execpolicy/examples/example.codexpolicy
- **deckent'in "≥40 satırlık adversarial sınıflandırma matrisi fail-closed" kabul kriteri execpolicy'nin `match`/`not_match`'iyle birebir aynı fikirdir** — orada matris testin kendisi değil, *kuralın parçası*; yükleme anında doğrulanmayan kural kabul edilmiyor.
- Codex'te tehlikeli-komut mantığı ayrı bir yerde: `codex-rs/shell-command/src/command_safety/` (`is_dangerous_command.rs`, `windows_dangerous_commands.rs`, PowerShell için `powershell_tree_sitter.rs`) — **Windows ayrı bir ağaç-ayrıştırıcıyla ele alınıyor**, bu deckent'in "her ortam" yasası için önemli bir emsal. https://github.com/openai/codex/tree/main/codex-rs/shell-command/src/command_safety
- **Onay yorgunluğuna karşı iki ayrı strateji var ve ikisi de deckent'te eksik:** (1) *Kalıcılaştırma*: Gemini'nin `ToolConfirmationOutcome` enum'u `ProceedOnce`, `ProceedAlways`, `ProceedAlwaysAndSave`, `ProceedAlwaysServer` (MCP sunucusu bazında), `ProceedAlwaysTool` (araç bazında), `ModifyWithEditor`, `Cancel` — yani "hep izin ver" tek bir şey değil, **kapsamı seçilebilir** bir karar. https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/tools/tools.ts (2) *Kural önerisi*: Codex'in "smart approvals" özelliği escalation sırasında **otomatik bir `prefix_rule` değişikliği önerebiliyor** — kullanıcı onaylarsa kural kalıcılaşıyor *(ikincil kaynak)*. https://learn.chatgpt.com/docs/agent-configuration/rules
- Claude Code'un `auto` modunda sınıflandırıcı bir **geri düşme eşiğine** sahip: 3 ardışık blok veya oturum başına 20 blok sonrası auto mod duraklıyor ve elle onaya dönüyor (sabit, ayarlanamaz) — güvenlik ile yorgunluk arasında ölçülü bir denge. https://code.claude.com/docs/en/permission-modes
- Gemini'nin **folder trust** mekanizması (`security.folderTrust.enabled`, varsayılan `true`) güvenilmeyen klasörde "safe mode" uyguluyor: workspace ayarları/`.env` yok sayılıyor, extension'lar bloklanıyor, MCP kapalı ve *"you will always be prompted before any tool is run, even if you have auto-acceptance enabled globally"*. https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/trusted-folders.md
- OpenCode'un kural değerlendirmesi **son eşleşen kural kazanır** — doküman bu yüzden catch-all'ı başa, özel kuralları sona koymayı öneriyor; `{"*": "ask", "git *": "allow", "grep *": "allow", "rm *": "deny"}` şeklinde. https://opencode.ai/docs/permissions
- **Hiçbir araçta "çok-çağrılı turda tek gruplu onay kartı" yok.** Gruplama ya prompt seviyesinde (Codex: "logically group related actions") ya da kalıcı kuralla (allowlist) çözülüyor. deckent'in 7111'deki gruplu kart hedefi ekosistemde emsalsiz — **ama gerçek çözüm sıralaması ekosistemde nettir: önce salt-okunur allowlist, sonra gruplama.** Allowlist doğru kurulduğunda gruplanacak kart sayısı zaten çöker.

### 2.5 Soru 5 — Kesme (Esc / Ctrl-C) ve yönlendirme

| Araç | Tuş | Kısmi çıktı korunur mu | Yönlendirme yolu |
|---|---|---|---|
| Claude Code | Esc (kes) · Esc-Esc (rewind menüsü) | konuşma korunur; her prompt bir checkpoint | `/rewind`, "Undo that", `/clear` |
| **Codex CLI** | Esc (`chat.interrupt_turn`) | **steer mode**: tur ortasında yazılan mesaj sıraya alınır, sonraki düşünme adımında enjekte edilir; Enter=hemen gönder, Tab=turdan sonra | steer mesajı |
| Cursor CLI | *[doğrulanamadı]* | *[doğrulanamadı]* | y/n onay istemi |
| Gemini CLI | Esc (`AbortController` / `cancelAllToolCalls`) | belgelenmemiş *[doğrulanamadı]*; uzun düzenlemede iptal çalışmıyor (#7934) | yeni prompt |
| **Aider** | Ctrl-C | **evet, açıkça belgeli**: "The partial response remains in the conversation" | yanıtta ona atıf yaparak yönlendirme |
| OpenCode | *[doğrulanamadı]* | `/undo` → değişikliği geri alır **ve orijinal kullanıcı mesajını düzenlenebilir hâlde geri getirir**; `/redo` | `/undo` + mesajı düzenle |
| Goose | Ctrl+C | yeni prompt yazıp Enter ile devam | doğrudan yeni prompt |

- **Aider'ın kuralı deckent'in 7114 kabul kriteri ("kullanıcı kesince kısmi çıktı ekranda ve transcript'te") ile birebir aynı ve resmî dokümanda yazılı:** *"It's always safe to use Control-C to interrupt aider if it isn't providing a useful response. **The partial response remains in the conversation**, so you can refer to it when you reply to the LLM with more information or direction."* https://aider.chat/docs/usage/tips.html
- **Codex'in "steer mode"u en gelişmiş yönlendirme modeli:** kullanıcı tur ortasında yazabiliyor; mesaj sıraya alınıp bir sonraki model "thinking step"inde enjekte ediliyor. Enter hemen gönderir (turu keser), Tab turdan sonrasına kuyruklar — yani **kesmek ile yönlendirmek ayrı iki eylem**. *(ikincil kaynak; TUI keymap `codex-rs/tui/src/keymap.rs` `chat.interrupt_turn`)* https://deepwiki.com/openai/codex/4.1.4-status-line-and-footer-rendering · https://github.com/openai/codex/issues/17095 (kuyruklu mesajda "hemen gönder" ipucunun çalışmadığı bilinen kusur)
- Claude Code'da kesme + geri alma birleşik: her prompt bir dosya-checkpoint'i oluşturuyor, `Esc+Esc` veya `/rewind` "conversation history, code, or both" geri yüklüyor; checkpoint'ler oturum boyunca kalıcı **ama yalnız Claude'un kendi dosya-düzenleme araçlarını izliyor** (Bash/dış süreç değişiklikleri değil). https://code.claude.com/docs/en/best-practices · https://code.claude.com/docs/en/interactive-mode
- Agent SDK'da `interrupt()` çağrısı `SDKControlInterruptResponse` döndürüyor — **kesmeden sağ çıkan kuyruklu mesajları** taşıyor (CLI `interrupt_receipt_v1` ilan ettiğinde). https://code.claude.com/docs/en/agent-sdk/typescript
- **OpenCode'un `/undo`'su tek başına farklı bir fikir:** yalnız değişikliği geri almıyor, *orijinal kullanıcı mesajını düzenlenebilir olarak geri getiriyor* — yani "yanlış gitti" durumunda kullanıcı prompt'u düzeltip yeniden çalıştırıyor. SDK karşılığı `session.revert({path, body})` / `session.unrevert({path})`. https://opencode.ai/docs · https://opencode.ai/docs/sdk
- **Ortak bulgu:** kesme her yerde var, ama **kesme anında kısmi metnin transcript'te kalacağını açıkça garanti eden tek araç Aider.** Gemini'de bu belgelenmemiş ve gerçekten kusurlu (#7934 "Long edits cannot be cancelled", #26402 "`/clear` does not abort in-flight stream"). https://github.com/google-gemini/gemini-cli/issues/7934 · https://github.com/google-gemini/gemini-cli/issues/26402

---

### 2.6 Soru 6 — Yerel model desteği (llama.cpp / Ollama / LM Studio)

| Araç | Yerel destek | Bağlam ayarı | Token sayımı |
|---|---|---|---|
| Claude Code | **Resmî DEĞİL**; yalnız Anthropic-uyumlu gateway (`ANTHROPIC_BASE_URL`, Bedrock, Vertex, Foundry) | gateway'e bağlı | provider'ın bildirdiği `usage` alanları |
| Codex CLI | **VAR** — `--oss` + `[model_providers.*]`, Ollama/LM Studio/MLX | `model_context_window` **elle** girilmeli | provider |
| Cursor CLI | **YOK** *(doğrulanamadı; `cursor-agent` için base-url bayrağı belgelenmemiş)* | — | — |
| Gemini CLI | **YOK** (yalnız yerel Gemma **router**'ı) | — | `countTokens` API |
| Aider | LiteLLM üzerinden Ollama/LM Studio/llama.cpp | `OLLAMA_CONTEXT_LENGTH` | LiteLLM/tiktoken tahmini |
| OpenCode | `@ai-sdk/openai-compatible` ile llama-server/Ollama/LM Studio | provider `limit.context` | *[doğrulanamadı]* |
| Goose | Ollama + tool-shim | `GOOSE_CONTEXT_LIMIT`, `OLLAMA_CONTEXT_LENGTH` | provider |

- **llama.cpp `llama-server` gerçek rota listesi (deckent için en kritik bulgu):** native `POST /tokenize`, `POST /detokenize`, `POST /apply-template`, `GET /props` (`default_generation_settings.n_ctx` verir), `GET /slots` (`--no-slots` ile kapatılır) — **`/v1/tokenize` diye bir rota YOK**. OpenAI-uyumlu tarafta ise doğrudan token sayımı için `POST /v1/chat/completions/input_tokens` ve `POST /v1/responses/input_tokens`, Anthropic-uyumlu tarafta `POST /v1/messages/count_tokens` bulunuyor. https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md
- **Ollama varsayılan bağlamı VRAM'e göre ölçekleniyor:** "<24 GiB VRAM: 4k context, 24-48 GiB: 32k, ≥48 GiB: 256k" ve doküman açıkça "web search, agents, and coding tools should be set to at least 64000 tokens" diyor. https://docs.ollama.com/context-length — Modelfile referansı hâlâ `num_ctx` varsayılanını 2048 gösteriyor; Ollama dokümanı kendi içinde tutarsız *[hangi sayfanın güncel doğru olduğu doğrulanamadı]*. https://github.com/ollama/ollama/blob/main/docs/context-length.mdx
- **Aider** kendi dokümanında Ollama'nın küçük varsayılanını açık bir tuzak olarak belgeliyor: "Ollama uses a 2k context window by default, which is very small for working with aider. It also **silently discards context that exceeds the window**"; önerisi `OLLAMA_CONTEXT_LENGTH=8192 ollama serve` + yanıt için ~8k tampon. https://aider.chat/docs/llms/ollama.html
- **OpenCode** llama-server'ı `baseURL: http://127.0.0.1:8080/v1` ile bağlıyor ve model kaydında `"limit": {"context": 128000, "output": 65536}` gibi açık sınır tanımlatıyor; Ollama için de "If tool calling fails or behaves unexpectedly with Ollama, consider increasing `num_ctx` to around 16k–32k" uyarısı var. https://opencode.ai/docs/providers
- **Goose** yerel modellerde 4096 varsayılanını extension/tool talimatlarının kaybolma nedeni olarak belgeliyor, `OLLAMA_CONTEXT_LENGTH=32768 ollama serve` öneriyor; native tool-calling olmayan modeller için `GOOSE_TOOLSHIM=1` ile bir yorumlayıcı-model üzerinden sahte tool-call köprüsü kuruyor. https://goose-docs.ai/docs/experimental/ollama · https://goose-docs.ai/docs/guides/environment-variables
- **LM Studio** bağlam uzunluğunu yükleme anında (`lms load --context-length <N>`) alıyor; token sayımı REST değil SDK yüzeyinde (`model.tokenize()`, `model.get_context_length()`). https://lmstudio.ai/docs/cli/local-models/load · https://lmstudio.ai/docs/python/tokenization
- **Claude Code'un yerel model desteği resmî değil.** Anthropic dokümanı yalnız gateway/Bedrock/ Vertex/Foundry yollarını belgeliyor; llama.cpp/Ollama/LM Studio'ya `ANTHROPIC_BASE_URL` çevirmek topluluk pratiği. https://code.claude.com/docs/en/llm-gateway-connect
- **Thinking ↔ `max_tokens` çatışması ekosistemde de bilinen bir tuzak:** llama.cpp `--reasoning-format {none,deepseek,deepseek-legacy}`, `-rea/--reasoning [on|off|auto]`, `--reasoning-effort`, `--reasoning-budget N` (`-1` sınırsız, `0` anında bitir), `--reasoning-preserve` bayraklarını sunuyor ve `<think>` bloklarını `reasoning_content` olarak ayırıyor; `--jinja` (varsayılan açık) GGUF gömülü chat-template'ini kullanır — kapatılırsa Qwen3'ün `<think>` sınırlayıcıları düz metne düşer. https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md
- Qwen tarafında `enable_thinking` chat-template parametresi + tur-içi `/think` `/no_think` yumuşak anahtarı var ("The model always follows the most recent /think or /no_think instruction"). https://github.com/QwenLM/Qwen3/discussions/1300
- llama.cpp PR #11607 ("server: fix tool-call of DeepSeek R1 Qwen, return reasoning_content … unless --reasoning-format none") reasoning-modeli tool-call kırılmasının gerçek bir tarihsel hata olduğunu gösteriyor. https://app.semanticdiff.com/gh/ggml-org/llama.cpp/pull/11607/overview
- **Codex'in `--oss` yolu tek belgeli birinci-parti yerel entegrasyon:** `[model_providers.<ad>]` bloğunda `base_url = "http://localhost:11434/v1"` **ve kritik olarak `wire_api = "responses"`** gerekiyor (Codex Responses API konuşuyor, çoğu yerel sunucu yalnız Chat Completions sunuyor — belgelenmiş tuzak). Kullanım: `codex --oss -m <model> -c model_provider=<ad>`. https://docs.ollama.com/integrations/codex *(ikincil: https://learn.chatgpt.com/docs/config-file/config-advanced)*
- **Gemini CLI'nin genel yerel-model desteği YOK ve bu açık bir eksik** — Discussion #24166 ("Universal Local Model Support via Ollama/OpenAI-Compatible Providers"), Issue #23385 ("Support OpenAI-compatible API endpoints"), Issue #5938 hepsi **açık istek**, birleşmiş değil. https://github.com/google-gemini/gemini-cli/discussions/24166 · https://github.com/google-gemini/gemini-cli/issues/23385 Var olan tek yerel bileşen `LocalLiteRtLmClient` — yerel bir **LiteRT-LM/Gemma** sunucusunu yalnız *hangi hosted Gemini modeline yönlendireceğini* seçen sınıflandırıcı olarak kullanıyor; sohbet backend'i değil, deneysel. https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/model-routing.md
- **Cursor CLI'de yerel model desteği bulunamadı:** `cursor-agent` parametre referansında `--base-url` benzeri bir bayrak belgelenmemiş; özel endpoint override'ı Cursor **IDE**'sinin Models ayarı, CLI'nin değil. https://cursor.com/docs/cli/reference/parameters *[doğrulanamadı: yokluk kanıtı]*
- Aider'ın Ollama için ek inceliği: bağlamı **istek + 8k token** olacak şekilde otomatik boyutluyor; kalıcı çözüm `.aider.model.settings.yml` içinde `extra_params: num_ctx: 65536`. https://aider.chat/docs/llms/ollama.html

---

## 3. deckent'e eşleme — lane 7107–7114

Bu bölümdeki deckent tarafı iddiaları **kaynak kodundan** doğrulandı (dosya:satır verildi, 2026-09-09 tarihli `main` çalışma kopyası). Ekosistem tarafı §2'deki atıflara dayanır.

### 3.0 Ölçülen taban — deckent'te bugün ne VAR, ne YOK

| Yetenek | deckent'te durum | Kanıt |
|---|---|---|
| Streaming metin olayı | VAR (`text-delta`) | `src/agent/events.ts:10`, bridge `native-agent-bridge.ts:1059` |
| Araçlar arası anlatım sözleşmesi (prompt) | **YOK** | `composeSystemPrompt` = immutable-core + scratchpad + soul + proje-dokümanı; tool-use/iş-akışı/anlatım talimatı hiç yok — `src/agent/identity.ts:76-110`, `src/agent/assets/soul.default.md` |
| Host-zorunlu ara teslim | **YOK** | `NativeAgentBudgetConfig` alanları arasında interim yok — `src/core/config-types.ts:950-971`, `src/core/execution-budget-policy.ts:93-122` |
| Araç satırında hedef | **YOK — `target: ''` sabit** | `src/cli/repl/native-agent-bridge.ts:1102-1108` (`verb: \`${ev.tool} — …\`, target: ''`) oysa `primaryResource(args)` hazır: `src/agent/loop.ts:207` |
| Araç satırında süre | **YOK — `ToolInfo`'da alan yok** | `src/cli/repl/app.tsx:1007-1014` |
| "Düşünüyor… N token" göstergesi | VAR | `reasoning-activity` → `approximateReasoningTokens` (`src/agent/reasoning-control.ts:121`), bridge `native-agent-bridge.ts:1063-1075` |
| Tur-sonu süre göstergesi | VAR (yalnız tur sonunda) | `src/cli/repl/native-elapsed.ts:11` |
| Thinking bütçe aritmetiği | VAR (7108 indi) | `execution_budget.native_agent.reasoning` {mode, budgetTokens 8192, exhaustedRetryBudgetTokens 16384} — `src/core/execution-budget-policy.ts:114` |
| Transport retry | VAR (7108) | `transportRetry: 1`, `transportRetryBackoffMs: 250` — aynı dosya :115-116 |
| Checkpoint kadansı | VAR ama yalnız **bağlam-baskısı** eksenli | `checkpointEveryRounds: 20`, `checkpointEveryToolCalls: 60`, `contextHighWaterRatio: 0.75` — aynı dosya :97,105-106 |
| Checkpoint trail | VAR (7110/7112) | `src/agent/checkpoint-trail.ts`, `checkpointTrailShareOfContext: 0.03`, `checkpointReplayCacheEntries: 64` |
| Referans outline/digest | KISMİ | `src/agent/reference-outline.ts`, `reference-digest.ts` yalnız `validateReferenceCoverage`/`validateReferenceOutline` — üretim hattı değil (7113 OPEN) |
| Kesme (Ctrl-C/Esc) | VAR | `src/cli/repl/interrupt-policy.ts` (`CTRL_C_EXIT_WINDOW_MS = 2000`), `busy-controls.ts` (`/queue` `/interrupt` `/steer`) |
| Salt-okunur onay sınıflandırıcı | **YOK** | `approval-command-classification.ts:64` varsayılan `shell-exec/medium` (7111 uygulamada) |

**Kritik gözlem (özetin omurgası):** ölçülen vakada model 24 saniyede tam bir durum raporu yazabildi. Yani görünür metin üretme *yeteneği* eksik değil; **hiçbir yerde istenmiyor.** Sistem prompt'unda anlatım sözleşmesi yok (`identity.ts`), host'ta zorunlu ara teslim yok (`execution-budget-policy.ts`), ekranda araç satırı hedefsiz-süresiz (`native-agent-bridge.ts:1102`). Üç boşluk da mekanizma değil, **sözleşme** boşluğu — bu yüzden kısa vadede kapanabilir.

### 3.1 Lane-lane öneriler

Kısaltmalar: **KV** = kısa vade · **OV** = orta vade. Saat tahminleri tek tek verildi;
**≤1 günlük gerçek paket = KV-1 + KV-2 + KV-4 (≈6 saat)** — ölçülen vakanın kök nedenlerinin çoğunu bu üçü kapatır. KV-5…KV-10 aynı disiplinde ama toplamda ~2 gün daha ister.

---

#### 7114 — TERMINAL-INTERACTION-FLOW-001 (etkileşim sözleşmesi) — *en yüksek getiri*

**Ekosistemde var, deckent'te yok:** anlatım sözleşmesinin **sistem prompt'unda yazılı olması**. Codex `### Preamble messages` + `## Sharing progress updates`, Gemini `mandateExplainBeforeActing()` ("Never call tools in silence. You MUST…"), Claude Code varsayılan stili. deckent'in `composeSystemPrompt()`'unda tool-use/anlatım hakkında **tek satır yok**.

- **KV-1 (≈1 saat) — Anlatım sözleşmesi bölümü.** `src/agent/identity.ts`: `scratchpadSection()` ile **birebir aynı desende** bir `toolUseNarrationSection()` ekle ve `composeSystemPrompt()` parça listesine koy. **i18n notu:** `identity.ts`'in STRING POLICY notu (model-facing protokol metni her `lang`'de İngilizce kalır) `scratchpadSection` ve tool-result-broker işaretleri için yazılmış; anlatım sözleşmesi modelin *çıktı dilini* etkilediği için bu emsalin uzatılması **owner onayı ister** — aksi hâlde i18n-first ihlali olarak okunabilir. İçerik Codex+Gemini sentezi: (a) "Never call tools in silence"; (b) ilgili çağrıları **grupla**, grup başına 1-2 cümle / 8–12 kelime; (c) önceki işe bağlan ("what's been done so far"); (d) **istisna**: tek dosyalık önemsiz okuma için preamble yok; (e) uzun işte düzenli aralıklarla ilerleme cümlesi. Maliyet ~12-15 satır ve `preamble-budget.ts` bunu zaten ölçüyor (7106).
- **KV-2 (≈2 saat) — Araç satırında hedef + süre.** `src/cli/repl/native-agent-bridge.ts:1102` bugün `target: ''` gönderiyor; `primaryResource(args)` **zaten** `src/agent/loop.ts:207`'de export edilmiş durumda. `tool-executing` anında `Date.now()` sakla, `tool-result`'ta farkı `ToolInfo`'ya yeni `durationMs?` alanı olarak geçir (`src/cli/repl/app.tsx:1007-1014`). Sonuç: `deckent_bash — çalıştı  sed -n '1,200p' docs/MASTER-PLAN.md  1.4s`. Ekosistem emsali: Claude Code'un `tool_progress` olayı `elapsed_time_seconds` taşıyor.
- **KV-3 (≈2 saat) — Sürekli hareketli durum satırı.** Gemini `LoadingIndicator` her 5 saniyede ifadeyi değiştirip `(esc to cancel, {n}s)` gösteriyor; Claude Code `✳ … (esc to interrupt · 5s · ↓ 217 tokens · thinking)`. deckent'te `native-elapsed.ts` süreyi **yalnız tur sonunda** veriyor — aynı sayacı tur boyunca 1 sn periyotla `status-row.tsx`'e bağla (i18n label'ları caller'dan enjekte, mevcut `ReplLabels` deseni).
- **OV-1 — Host-zorunlu ara teslim.** `src/core/execution-budget-policy.ts:93` `DEFAULT_NATIVE_AGENT_BUDGET`'a `interimAnswerAfterToolCalls: 12` ve `interimAnswerAfterMs: 90_000` ekle; `NATIVE_AGENT_BUDGET_FIELDS` zaten `Object.keys(defaults)` üzerinden türediği için doğrulama bedava gelir. Enjeksiyon noktası: `loop.ts`'in checkpoint isteğini ürettiği yerin **aynısı**, ama farklı bir talep tipiyle (şema: "şu ana kadar ne bulundu / şimdi ne yapılıyor / kalan"). **Bu ekosistemde emsali olmayan bir farklılaştırıcıdır** — incelenen 7 aracın hiçbirinde host-zorunlu ara teslim yok; hepsi prompt'a güveniyor. Ancak KV-1 olmadan tek başına yapılırsa boş metin üretir: **KV-1 önce, OV-1 sonra.**
- **OV-2 — Codex "steer mode".** Tur ortasında yazılan mesajın sıraya alınıp bir sonraki düşünme adımında enjekte edilmesi; Enter = hemen kes-ve-gönder, Tab = tur sonrasına kuyrukla. deckent'te `busy-controls.ts` (`/queue` `/interrupt` `/steer`) altyapısı **zaten var** — eksik olan tuş ergonomisi ve enjeksiyon noktası.

---

#### 7109 — TERMINAL-TOOL-BUDGET-UNITS-001 (bayt/token birim karışımı)

**Ekosistemde var, deckent'te yok:** hiçbir araç tavanı pencereden türetip **başka birimde** ölçmüyor. Claude Code bash için 30.000 *karakter*, MCP için 25.000 *token* (ayrı ayrı, doğru birimde); OpenCode `MAX_LINES = 2000` + `MAX_BYTES = 50 KB` (sabit, pencereden türemiyor); Codex 1 MiB sabit. deckent RC2 = 131072 *token* × 0.20 × 0.75 → 19.660 **"bayt"**.

- **KV-4 (≈3 saat, en yüksek kanıt/çaba oranı) — Gerçek token ölçümü.** 7114 satırındaki "`/v1/tokenize` 404" **yanlış rota kullanımıdır.** llama.cpp `llama-server`'da: `POST /tokenize` (native, `/v1` öneki YOK), `POST /apply-template`, ve doğrudan istek-token sayımı için **`POST /v1/chat/completions/input_tokens`**; efektif pencere `GET /props` → `default_generation_settings.n_ctx`. https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md **Bağımlılık — önce doğrula:** bu README `master` dalıdır; owner'ın llama.cpp container'ı sabit bir build. `…/input_tokens` rotası o imajdan yeniyse KV-4 aynı sessiz 404'e düşer. Bu yüzden sırayla: (1) çalışan sunucuda rotayı `curl` ile yokla; (2) yoksa **fallback = `POST /apply-template` → `POST /tokenize`** (chat mesajlarını şablondan geçir, dönen token dizisinin uzunluğunu al) — bu ikisi çok daha eski ve her build'de var; (3) efektif pencereyi her hâlde `GET /props` (`default_generation_settings.n_ctx`) versin. Capability probe sonucu typed olarak saklanmalı, yokluğunda conservative moda **açıkça etiketli** düşülmeli. Bu düzeltme 7109-b'nin "exact measurement" koşulunu kapatır. *(Not: `GET /slots` `--no-slots` ile kapatılabilir; `/tokenize` için böyle bir bayrak bulunamadı — yokluk kanıtı, `[doğrulanamadı]`.)*
- **KV-5 (≈2 saat) — Sabit tavan, türetilmiş tavan değil.** Ekosistem tabanı: tool-sonucu tavanını pencere oranından türetmeyi bırak; OpenCode gibi **sabit satır+bayt** (örn. 2000 satır / 50 KB) koy, ayrıca ölçülmüş token tavanını KV-4'ün gerçek sayacına bağla. Böylece birim karışımı yapısal olarak imkânsızlaşır.

---

#### 7111 — TERMINAL-READONLY-APPROVAL-001 (salt-okunur onay)

**Ekosistemde var, deckent'te yok:** bildirimsel, kendi kendini test eden komut politikası.

- **KV-6 (≈4 saat) — execpolicy deseni.** `approval-command-classification.ts` içindeki sınıflandırmayı **veriye** çevir: her kural `{pattern, decision: allow|prompt|forbidden, justification, match[], notMatch[]}` ve **`match`/`notMatch` örnekleri modül yükleme anında doğrulansın** (uymayan kural = yükleme hatası, fail-closed). Bu, 7111'in "≥40 satırlık adversarial matris" kabul kriterini testten *kuralın parçasına* dönüştürür — Codex'in `codex-execpolicy` README'sinde birebir bu var ("validated at load time… think of them as unit tests"). Başlangıç allowlist'i: `ls`, `cat`, `head`, `tail`, `grep`, `rg`, `find`, `wc`, `sed -n` (yalnız yazdırma), `git log/diff/show/status` → `allow`; `cp`, `mv` → `prompt`; redirection/`exec`/in-place (`sed -i`) → `forbidden`.
- **OV-3 — Kapsamlı "hep izin ver".** Gemini'nin `ToolConfirmationOutcome` enum'u (`ProceedOnce` / `ProceedAlways` / `ProceedAlwaysAndSave` / `ProceedAlwaysServer` / `ProceedAlwaysTool`) deckent'in `permittedNativePermissionLifetimes` yüzeyine eşlenmeli: "hep izin" tek şey değil, **kapsamı seçilen** bir karar olmalı.
- **OV-4 — Windows paritesi.** Codex tehlikeli-komut ağacını Windows için ayrı tutuyor (`windows_dangerous_commands.rs`, `powershell_tree_sitter.rs`). "Her ortam" yasası gereği deckent'in sınıflandırıcısı da PowerShell/cmd için ayrı ayrıştırıcı istemeli — POSIX kuralını Windows'a uygulamak sessiz güvenlik açığıdır.
- **OV-5 — Kural önerisi.** Codex'in "smart approvals"ı escalation sırasında otomatik `prefix_rule` değişikliği öneriyor; deckent'in onay kartına "bu kalıbı kalıcı kural yap" seçeneği eklemek onay yorgunluğunu kökten keser. *(ikincil kaynak)*

---

#### 7112 — TERMINAL-CHECKPOINT-CONTINUITY-001 (checkpoint sonrası iş kaybı)

**Ekosistemde var, deckent'te yok:** compaction özetinin **zorunlu şeması**. deckent'in deterministik checkpoint'i `findings`/`decisions`/`nextActions` alanlarını BOŞ bırakıyor (RC4); ekosistemde bu alanlar şemayla dayatılıyor.

- **KV-7 (≈3 saat) — Şemayı zorunlu kıl.** Gemini'nin `getCompressionPrompt()` XML `<state_snapshot>` şablonunu deckent'in checkpoint istemine uyarla: `<overall_goal>`, `<key_knowledge>`, `<artifact_trail>`, `<file_system_state>`, `<recent_actions>`, `<task_state>` + *"**NEVER** exit the format"* + *"Be incredibly dense with information"* + özetleyiciye geçmişteki gömülü komutları yok sayma talimatı (prompt-injection savunması, deckent'in `PROJECT_IDENTITY_CONTEXT` deseniyle uyumlu). Codex'in muadili daha kısa ve o da alınabilir: "Current progress and key decisions made / Important context, constraints, or user preferences / What remains to be done / Any critical data, examples, or references."
- **KV-8 (≈1 saat) — Deterministik fallback boş kalmasın.** Model yanıtı gelmediğinde (`CHECKPOINT_RESPONSE_MISSING`) `session.ts` bugün boş alanlarla ilerliyor. `checkpoint-trail.ts` zaten tool-trail tutuyor — fallback'i **trail'den türet** (son N araç, hedef, sonuç digest'i, son görünür metin). Boş checkpoint, checkpoint olmamasından daha zararlı: yeni epoch'u sıfırdan başlatıyor.
- **OV-6 — Ne geri yüklendiğini beyan et.** Claude Code compaction sonrası "son değişen dosyaları yeniden okur" ve skill gövdelerini 5k/25k token tavanıyla yeniden enjekte eder. deckent'in epoch açılışı da hangi dosyaların hâlâ bilindiğini **açıkça listelemeli** — model aynı aralıkları yeniden okumasın (RC4 döngüsü).

---

#### 7113 — TERMINAL-LARGE-REFERENCE-DIGEST-001 (büyük @referans)

**Ekosistemde var, deckent'te yok:** dosyayı bağlama sokmadan temsil etme.

- **KV-9 (≈4 saat) — Aralıklı okuma + arama, tam okuma yerine.** `deckent_read_file`'a Gemini deseniyle `start_line`/`end_line` (1-tabanlı, dahil) ve bir `outline` modu ekle; tavanlar ekosistem tabanı: 2000 satır / 2000 karakter-satır / 20 MB (Gemini `constants.ts`), OpenCode `DEFAULT_READ_LIMIT = 2000` + `MAX_BYTES = 50 KB`. **Kesme sessiz olmamalı** — Claude Code'un Read'inin sessiz kesme davranışı bilinen bir şikâyet konusu (#6910). Bu tek başına RC5'i de hafifletir: model 10 KB satırlı dosya için bash'e düşmez.
- **OV-7 — Aider repo-map deseni.** deckent'in `reference-outline.ts`/`reference-digest.ts`'i bugün yalnız *doğrulama* fonksiyonları (`validateReferenceCoverage`, `validateReferenceOutline`) — üretim hattı yok. Aider'ın modeli: **büyük referans bağlama girmez**, graf-sıralı bir harita ile temsil edilir (`--map-tokens` ~1k) ve yalnız açıkça eklenen dosyalar tam metin olur. 1.25 MB MASTER-PLAN için doğru cevap "parçalı oku" değil, "tablo başlıklarını + satır indeksini çıkar, cevabı indeks üzerinden ver".
- **OV-8 — `read_many_files` muadili.** Gemini glob'la toplu okuma sunuyor; deckent'in map-reduce digest hattı bunun üstüne kurulabilir.

---

#### 7108 — TERMINAL-REASONING-CONTROL-001 (thinking + transport)

**Durum: büyük ölçüde inmiş** (`reasoning: {mode, budgetTokens: 8192, exhaustedRetryBudgetTokens: 16384}`, `transportRetry: 1`). Ekosistem doğrulaması:

- llama.cpp bayrakları deckent'in descriptor'ıyla eşleşmeli: `-rea/--reasoning [on|off|auto]`, `--reasoning-effort`, **`--reasoning-budget N`** (`-1` sınırsız, `0` anında bitir), `--reasoning-format {none,deepseek,deepseek-legacy}`, `--reasoning-preserve`. Qwen tarafında `enable_thinking` + tur-içi `/think` `/no_think` yumuşak anahtarı ("The model always follows the most recent /think or /no_think instruction"). **KV-10 (≈1 saat):** yapılandırılmış istekte (checkpoint/ara teslim) prompt'a `/no_think` iliştir — descriptor'a bağlı olmayan, her Qwen3'te çalışan ikinci bir emniyet.
- `--jinja` (varsayılan açık) GGUF chat-template'ini kullanır; kapatılırsa Qwen3'ün `<think>` sınırlayıcıları düz metne düşer. PR #11607 reasoning-modeli tool-call kırılmasının gerçek olduğunu gösteriyor — deckent'in adapter'ı `reasoning_content` alanını hem ayrık hem gömülü biçimde tanımalı.
- Codex'in bilinen kusuru deckent için uyarı: düşünme özeti **ancak adım bitince flush oluyor**, bu yüzden arayüz donmuş hissettiriyor (#8204). deckent'in "düşünüyor… N token" göstergesi (`REASONING_ACTIVITY_RENDER_INTERVAL_MS`) bu tuzağı zaten aşıyor — **koru**.

---

#### 7107 — şemsiye

Kabul bataryasının 7 maddesinden **1, 3, 5 doğrudan yukarıdaki KV-1…KV-10 ile kapanıyor.** Ekosistemden çıkan tek stratejik uyarı: madde 7 ("Claude/Codex provider ile akış-farksız"), anlatım sözleşmesi **prompt'ta** olduğu için otomatik sağlanır — sözleşme provider'a değil sisteme aittir. Buna karşılık host-zorunlu ara teslim (OV-1) provider-bağımsız çalışır ama
**model-bağımlıdır**: küçük yerel modeller şema zorlamasına daha kötü uyar, bu yüzden KV-7'deki katı XML şeması ara teslim için de kullanılmalı.

---

## 4. Yerel model bağlam boyutu önerisi — 200k+ mı, kararlı 128k mı?

**Öneri: pencereyi BÜYÜTME. `131072`'de kal (hatta varsayılanı 65536'ya çekmeyi değerlendir) ve bütçeyi ölçümle düzelt.** Gerekçe üç ayaklı:

**(a) Ölçülen vakada pencere hiç bağlayıcı kısıt değildi.** Trace'teki gerçek istekler 13–17k token; yapılandırılmış pencere 131072. Yani doluluk ≈ %13. Checkpoint'leri tetikleyen şey bağlam dolması değil, `loop.ts:505-514`/`:765-770`'deki **bayt/token birim karışımıydı** (131072 × 0.20 × 0.75 = 19.660 "bayt" tavanı) — RC2, MASTER 7109. Pencereyi 262144'e çıkarmak bu tavanı 39.320 "bayt"a taşır; hatayı iki katına çıkarır, çözmez.

**(b) İlan edilen pencere ile kullanılabilir pencere aynı şey değil — birincil kanıt var.**
- NoLiMa (ICML 2025): ≥128K bağlam iddia eden 13 modelden 11'i **32K'da kısa-bağlam taban puanının ≤%50'sine** düşüyor; GPT-4o 99.3 → 69.7 (32K) → 56 (128K). https://arxiv.org/html/2502.05167v3 · https://github.com/adobe-research/NoLiMa
- Qwen3-32B'nin **native bağlamı 32.768**; 131.072 ancak YaRN ile (`"rope_scaling": {"rope_type": "yarn", "factor": 4.0, "original_max_position_embeddings": 32768}`) elde ediliyor. https://huggingface.co/Qwen/Qwen3-32B
- Qwen'in **kendi dokümanı** bunun bedelini yazıyor: "vLLM implements static YaRN, which means the scaling factor remains constant regardless of input length, **potentially impacting performance on shorter texts**" ve "We advise adding the `rope_scaling` configuration **only when processing long contexts is required**"; 65.536'lık iş yükü için `factor: 4.0` yerine `2.0` öneriyor. llama.cpp aynı knob'ları `--rope-scaling yarn --rope-scale N --yarn-orig-ctx 32768` olarak sunuyor. https://qwen.readthedocs.io/en/latest/deployment/vllm.html · https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md
- **deckent'in tipik istekleri 13–17k token, yani YaRN factor 4.0'ın ceza bölgesinde çalışıyor.** Statik YaRN her kısa prompt'u da vergilendirdiği için 131072'yi açık tutmak, asla kullanılmayan bir pencere için sürekli kalite ödemek demek.

**(c) 262.144 iddiası model-kartı iddiasıdır, bağımsız ölçüm değil.** Qwen3-30B-A3B-Instruct-2507 kartı "262,144 natively" diyor ve ~1M için ayrı `config_1m.json` + ~240GB GPU belleği şart koşuyor. https://huggingface.co/Qwen/Qwen3-30B-A3B-Instruct-2507 — Qwen3 için 131K+ noktasında bağımsız RULER/NoLiMa sayısı bu araştırmada bulunamadı *[doğrulanamadı]*. llama.cpp tarafında issue #18722 uzun-bağlam/KV-cache tartışmalarının "non-actionable" olduğunu, kanonik bir benchmark komutu/metriği bulunmadığını söylüyor — yani **>128k için resmî bir kararlılık garantisi yok**. https://github.com/ggml-org/llama.cpp/issues/18722

**KV-cache maliyeti:** FP16 K+V ≈ 64 KB/token (27B sınıfı); KV kuantizasyonuyla ~14 KB/token'a kadar iniyor (~4.6x). Yani 131k → 262k geçişi VRAM'de doğrusal ikiye katlanma demek; sorun "kararsızlık"tan çok bellek. https://github.com/ggml-org/llama.cpp/discussions/20969

**Somut yapılandırma önerisi (deckent):**
1. Varsayılan yerel pencere **65536**, `--rope-scaling yarn --rope-scale 2.0 --yarn-orig-ctx 32768` (Qwen'in kendi 64k önerisi). 131072 opsiyonel profil olarak kalsın, varsayılan olmasın.
2. Pencereyi büyütmek yerine **ölçümü kesinleştir**: `POST /v1/chat/completions/input_tokens` (llama.cpp) → gerçek prompt token sayısı; `GET /props` → `default_generation_settings.n_ctx` ile *effective* pencere. Bu ikisi 7109-b'nin "exact measurement" koşulunu kapatır ve sahte checkpoint'i kökünden keser.
3. Ekosistem tabanı da bunu doğruluyor: Ollama ajanik iş için **en az 64000** token öneriyor (https://docs.ollama.com/context-length), Goose 32768 (https://goose-docs.ai/docs/experimental/ollama), OpenCode Ollama tool-calling için 16k–32k (https://opencode.ai/docs/providers). **Hiçbiri 200k+ önermiyor.**

---

## 5. Kaynak listesi

Her iddia §1–§4 içinde kullanıldığı yerde URL'li; burada yalnız gruplanmış kök kaynaklar.

**Birincil — bu araştırmada verbatim doğrulanan kaynak/prompt dosyaları:** Codex sistem prompt'u `codex-rs/protocol/src/prompts/base_instructions/default.md`; Codex compaction şablonu `codex-rs/prompts/templates/compact/prompt.md`; Codex `codex-rs/execpolicy/{README.md, examples/example.codexpolicy}`; Codex `codex-rs/shell-command/src/command_safety/`; Codex `codex-rs/utils/pty/src/lib.rs` — hepsi https://github.com/openai/codex · Gemini `packages/core/src/prompts/snippets.ts` (`mandateExplainBeforeActing`, `getCompressionPrompt`), `context/chatCompressionService.ts`, `utils/constants.ts`, `core/tokenLimits.ts`, `core/turn.ts`, `tools/{read-file,read-many-files,tools}.ts`, `policy/types.ts`, `cli/src/ui/components/LoadingIndicator.tsx`, `ui/hooks/usePhraseCycler.ts`, `core/localLiteRtLmClient.ts` — hepsi https://github.com/google-gemini/gemini-cli · OpenCode `packages/opencode/src/tool/truncate.ts` https://github.com/sst/opencode · llama.cpp `tools/server/README.md` https://github.com/ggml-org/llama.cpp

**Birincil — resmî dokümantasyon:** Claude Code https://code.claude.com/docs/en/ (output-styles, permission-modes, context-window, tools-reference, settings-reference, model-config, env-vars, statusline, interactive-mode, best-practices, costs, hooks-guide, errors, llm-gateway-connect, agent-sdk/*) · Gemini CLI docs/cli/{settings,enterprise,trusted-folders}.md · Aider https://aider.chat/docs/ (config/options, usage/{modes,commands,tips,lint-test}, repomap, faq, llms/ollama) · OpenCode https://opencode.ai/docs/ (permissions, config, agents, providers, tui, tools, sdk, plugins) · Goose https://goose-docs.ai/docs/ (sessions/smart-context-management, environment-variables, managing-tools/tool-permissions, sessions/in-session-actions, experimental/ollama, getting-started/providers, tutorials/headless-goose) · Cursor CLI https://cursor.com/docs/cli/ (overview, using, reference/{parameters,permissions}) · Ollama https://docs.ollama.com/{context-length,integrations/codex} · LM Studio https://lmstudio.ai/docs/{cli/local-models/load,python/tokenization} · Qwen https://huggingface.co/Qwen/{Qwen3-32B,Qwen3-30B-A3B-Instruct-2507}, https://qwen.readthedocs.io/en/latest/deployment/vllm.html, https://github.com/QwenLM/Qwen3/discussions/1300

**Akademik:** NoLiMa https://arxiv.org/html/2502.05167v3 · https://github.com/adobe-research/NoLiMa

**Issue/PR (davranış + bilinen kusur):** anthropics/claude-code #16578, #16905, #6910 · openai/codex #21324, #8204, #16801, #5359, #19185, #17095, #7900 · google-gemini/gemini-cli #7934, #26402, #24166, #23385, #5938 · ggml-org/llama.cpp #18722, discussions/20969, PR #11607 · sst/opencode #22565, #27864 · Aider-AI/aider #1784

**İkincil / doğrulanamayan (raporda `[doğrulanamadı]` veya *(ikincil kaynak)* olarak işaretli):** Claude Code prompt derlemesi https://github.com/Piebald-AI/claude-code-system-prompts · OpenCode prompt sızıntısı https://github.com/asgeirtj/system_prompts_leaks · Codex `untrusted` emekliliği / `--full-auto` deprecation / %90 auto-compact tavanı (codex.danielvaughan.com, blakecrosley.com — birincil doğrulama YAPILMADI) · Codex steer mode https://deepwiki.com/openai/codex · Codex config referansı https://learn.chatgpt.com/docs/config-file/config-reference · YaRN "static tax" analizi https://zolotukhin.ai/blog/2026-05-24-static-yarn-buys-qwen3-128k-by-taxing-every-short-prompt/ · RULER Qwen3 sayıları https://github.com/NVIDIA/RULER (ikincil derleme)
