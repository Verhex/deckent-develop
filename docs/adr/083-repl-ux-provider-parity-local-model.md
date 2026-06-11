# ADR-083: REPL-UX-Evolution + Provider-Parity + Local-Model-Foundation

**Status:** accepted

**Date:** 2026-06-02

**Accepted:** Sprint 221

---

## Context

### REPL Slash-Komutlar Bağlı Değildi

Sprint 220 sonunda `deckent` argümansız REPL gerçekten konuşuyordu (ADR-082, 220-001 run-proven). Ancak `handleReplCommand` (chat-repl-ux.ts) mevcut olmasına rağmen `runChatNativeLoop` bunu çağırmıyordu. `/clear` yazınca provider'a gidiyordu (saçma cevap), `/help` yoktu. REPL loop yalnızca `/exit` ve `/quit` için ayrı hard-coded dal içeriyordu.

**Kök neden:** `runChatNativeLoop` (chat-native.ts:282 `for await`) her satırı doğrudan provider'a iletiyordu; slash-handler wire'ı eksikti.

### Agentic Dispatch Bağlı Değildi (220-004 Carry)

`classifyAgenticIntent`/`dispatchAgenticIntent` (chat-agentic-dispatch.ts) mevcut ancak `runChatNativeLoop`'a bağlı değildi. Kullanıcı "sprint durumu ne" yazdığında gerçek `deckent_status` çağrılmıyor, metin provider'a iletiliyordu.

### Provider-Resolve Eksikti: Ollama ve OpenAI-Compat

220-001 provider-resolve `claude/codex/gemini` için CLI spawn yapıyordu. `OllamaAdapter` (core/ollama-models.ts) + `providers/ollama.ts` (local, zero-API) REPL'e bağlı değildi. Alperen yönü: "her provider'de doğru çalışsın; yarın local-model'le deckent-AI". Ollama (localhost:11434, sıfır API-key) birinci-sınıf olmalıydı.

**OpenAI-compat eksikliği:** DeepSeek/Qwen/GLM gibi OpenAI-uyumlu yerel/uzak modeller REPL'den seçilemiyordu.

### Statik Slash-Registry

`handleReplCommand` yalnızca `/exit`/`/clear`/`/quit` — statik hard-code. Alperen: "/komutları CANLI olsun". Slash listesi dinamik, deckent yetenek kataloğundan türetilmeli; hard-code yasak (ADR-070 zero-hardcode).

### Status-Line Yoktu

REPL'de provider/sprint/dizin bilgisi yoktu. Kullanıcı hangi provider'da, hangi sprint'te olduğunu bilemiyordu. claude-code status-line gibi sade bilgi istendi; özelleştirilebilir.

### Enterprise Yetenekler REPL'den Erişilmiyordu

`audit`/`rbac`/`flow`/`cost` CLI komutları mevcut ancak REPL'den çağrılamıyordu. Alperen: "user VE enterprise tarafında tam-kapsamlı; kullanılmasa da kullanılabilir."

### Dashboard Chat Sade Kalıyordu

Dashboard ChatPage (220-007) gerçek round-trip destekledi ancak slash-komut (status/recall) arayüzü yoktu. Terminal REPL ile parity eksikti.

---

## Decision

Sprint 221 bu boşlukların tamamını kapattı — beş dalga halinde:

### DALGA A — REPL Canlı Çekirdek

**221-001 — handleReplCommand canlı slash-wire:**
`runChatNativeLoop` başında her satır önce `handleReplCommand(line)` (chat-repl-ux.ts:63) kontrolünden geçer: `action:'exit'`→break, `action:'clear'`→transcript temizle+devam, `action:'none'`→mevcut akış (agentic/provider). Caller: `chat-native.ts` (def `chat-repl-ux.ts` dışlanır). Additive — mevcut `/exit` legacy-compat korundu.

**221-002 — classifyAgenticIntent/dispatchAgenticIntent wire (220-004 carry):**
Slash-check'ten sonra: `classifyAgenticIntent(line)` → agentic intent (status/recall/history) ise riskli-onay sonrası `dispatchAgenticIntent` → sonucu output'a bas; değilse provider turn. Caller: `chat-native.ts`.

**221-003 — Canlı slash-registry (buildSlashRegistry):**
`chat-slash-registry.ts` — `buildSlashRegistry()`: canlı komut listesi döndürür (`{name, desc, agenticIntent?}`). `/help`(sade liste), `/status`/`/recall`/`/plan`/`/sprint` agentic-intent'e map, `/exit`/`/clear`. `resolveSlash(line, registry)` yardımcısı. Hard-code yok — deckent yetenek kataloğundan türetilir (ADR-070 zero-hardcode). `runChatNativeLoop` 221-001/002 bu registry'yi tüketir.

**221-004 — REPL status-line (config-driven):**
`chat-status-line.ts` — `renderStatusLine(ctx, config)`: provider + aktif-sprint + dizin (opsiyonel maliyet). `config.chat.status_line` (bool/alanlar) — kapatılabilir, özelleştirilebilir. Hard-code yok. `entry.ts` REPL başında basılır.

### DALGA B — Provider-Parity (5-fleet)

**221-005 — Ollama-local + openai-compat REPL round-trip (zero-API):**
`entry.ts` REPL provider-resolve'a `ollama` dalı eklendi: `chat_provider==='ollama'` → `buildOllamaReplAdapter` (OllamaAdapter, localhost:11434, API-key YOK). `openai-compat` dalı: `OPENAI_COMPAT_PRESETS` + `OpenAICompatPresetName` (DeepSeek/Qwen/GLM). NET-error wrapping: ECONNREFUSED → açık hata "Ollama (http://localhost:11434) erişilemedi: <reason>". Mevcut `createSubscriptionChatAdapter` pattern genişletildi — yeniden yazma değil.

**221-006 — Provider-parity test matrisi (resolveChatAdapter):**
`chat-provider-parity.ts` — `resolveChatAdapter(provider, config)`: tek giriş noktası tüm provider'ları (claude/codex/gemini/ollama/openai-compat) eşit yolla adapter'a map eder. 5 provider için aynı sözleşme (sendMessage→response) test edildi. Parity garantisi.

**221-007 — Provider fallback chain (resolveChatProvider):**
`src/core/config.ts` — `resolveChatProvider(config)`: `chat_provider ?? brain_provider ?? 'claude'` + opsiyonel `chat.local_fallback:'ollama'`. Net-hata sözleşmesi: provider erişilemez → açık mesaj (skeleton değil). ADR-070 zero-hardcode: fallback chain config-driven.

### DALGA C — Enterprise-Terminal + User/Enterprise Mod

**221-008 — Enterprise komut köprüsü (dispatchEnterpriseSlash):**
`chat-enterprise-bridge.ts` — `dispatchEnterpriseSlash(cmd, args)`: `/audit`/`/rbac`/`/flow`/`/cost` slash'larını mevcut CLI komut handler'larına köprüler (yeni iş yapmaz, çağırır). Slash-registry'ye enterprise grubu eklendi — user-mode'da gizli ama erişilebilir ("kullanılmasa da kullanılabilir"). Caller: köprü modülü (def CLI komutları dışlanır).

**221-009 — User/enterprise mod (resolveChatMode):**
`chat-mode.ts` — `resolveChatMode(config)`: `user` (default, sade — sohbet+temel slash) | `enterprise` (audit/rbac/flow/cost slash görünür). `config.chat.mode`. Mod, slash-registry görünürlüğünü filtreler — yetenek hep VAR, sadece `/help` listesi sadeleşir. Hard-code yok.

**221-010 — Chat config schema (CHAT_CONFIG_SCHEMA):**
`src/core/config.ts` — `CHAT_CONFIG_SCHEMA` (Zod): `chat: { provider?, mode?: 'user'|'enterprise', status_line?: bool|fields, local_fallback?, slash_extra? }`. 3-katman merge + sade default. 221-004/007/009 bu şemayı tüketir. ADR-004 (3-Layer Config Merge) uyumlu.

### DALGA D — Dashboard claude-code-UX

**221-011 — Dashboard ChatPage streaming + slash:**
`src/dashboard/src/pages/ChatPage.tsx` — `/api/chat` (220-007 backend) gerçek round-trip + akan cevap + slash-komut girişi (/status /recall → backend agentic). Bearer token. Terminal REPL ile parity.

**221-012 — Dashboard konuşma-merkezli layout:**
`src/dashboard/src/components/Layout.tsx` — chat öne-çıkar (varsayılan/üst nav), sade bilgi mimarisi (gruplu nav: Konuş / İzle / Yönet). 10-sayfa korunur, sadeleştirilir.

### DALGA E — Hijyen + ADR + Docs

**221-013 — CLI kurulum/komut-çıktı fix (P0):**
`src/cli/entry.ts` — argüman-routing doğrulandı: argümansız→REPL, argümanlı (serve/help/status...)→commander.parse. `deckent help`/`deckent serve` terminal'de SESSİZ KALMAZ. Async exit, process hang yok. Sprint 536886c4 commit: `isEntryMain` symlink-aware.

**221-014 — Smoke-219-016 hotfix (smoke field gate):**
`src/orchestra/task-builder.ts` — parse edilen `smoke` alanı task JSON'a (`task.smoke`) yazılır ve gate (post-sprint-smoke) okur. Uçtan-uca doğrulama.

**221-015 — Bu ADR + MASTER-PLAN güncel** (bu görev).

### Local-Model Foundation (ADR-083 Core Value)

Ollama-local (zero-API, localhost:11434) REPL'de birinci-sınıf — "yarın deckent-AI" altyapısı bu sprintte atıldı:
- `buildOllamaReplAdapter`: HTTP probe + ECONNREFUSED wrapping
- `resolveChatAdapter('ollama', config)`: parity test matrisi
- `resolveChatProvider`: `chat.local_fallback:'ollama'` config
- `OLLAMA_BUILTIN_MODELS`: qwen2.5-coder:32b/7b, llama3:8b, llama3.2:3b

ADR-010 ve ADR-066 korundu — sıfır yeni runtime dependency, provider-independence sağlandı.

---

## Consequences

### Olumlu

- **`deckent` REPL tam-kapsamlı:** canlı slash (handleReplCommand wire) + doğal dil→aksiyon (classifyAgenticIntent/dispatchAgenticIntent wire) + status-line + özelleştirilebilir config.
- **Provider-parity 5-fleet:** claude/codex/gemini/ollama/openai-compat eşit yoldan adapter'a map; claude bias yok. `resolveChatAdapter` tek giriş noktası.
- **Ollama-local birinci-sınıf:** zero-API-key, localhost:11434, NET-error açık mesaj. "Yarın deckent-AI" (local-model ile deckent geliştirme) altyapısı.
- **Enterprise tam-kapsamlı:** `/audit`/`/rbac`/`/flow`/`/cost` slash REPL'den erişilebilir; user-mode'da gizli ama var ("kullanılmasa da kullanılabilir", ADR-033).
- **User/enterprise mod:** sade default (`user`), opt-in enterprise (`config.chat.mode='enterprise'`). Arayüz karmaşık değil, yetenek eksik değil.
- **Dashboard parity:** ChatPage slash+stream; Layout chat-first. Terminal ve web aynı UX.
- **`deckent help`/`deckent serve` terminalde çalışır:** argüman-routing fix (221-013).

### Olumsuz / Sınırlamalar

- **Ollama hermetic test sınırı:** Ollama çalışmayan CI ortamında `buildOllamaReplAdapter` mock adapter ile test edilir; gerçek Ollama round-trip Smoke gate.
- **openai-compat presets sabit liste:** DeepSeek/Qwen/GLM — yeni OpenAI-compat model eklemek `OPENAI_COMPAT_PRESETS` güncelleme gerektirir (post-beta live-catalog ile çözülür, F6-005).
- **Enterprise slash güvenlik derinliği:** `dispatchEnterpriseSlash` mevcut CLI handler'ları çağırır; izin kontrolü CLI auth'a devredilir (ADR-037 RBAC V1 advisory — runtime soft, hard-flip post-GA V2).
- **Status-line dashboard parity:** `renderStatusLine` CLI-only (Sprint 221); dashboard status-bar gelecek sprint.

---

## Alternatives Considered

### REPL Hard-Code Slash Listesi

`/exit`/`/clear` yanına `/status` vb. hard-code eklemek kolaydı. Reddedildi: ADR-070 zero-hardcode; sabit liste deckent yeteneği büyüdükçe stale olurdu. `buildSlashRegistry()` dinamik katalog yaklaşımı seçildi.

### Claude Bias — Provider Default Hard-Code

`entry.ts`'de provider'ı `claude` olarak hard-code etmek kolaydı. Reddedildi: ADR-066 (Provider Independence) + "yarın local-model'le deckent-AI" hedefi; `resolveChatAdapter` ile 5-fleet eşit parity.

### Ollama Ayrı Alt-Komut

`deckent chat --provider ollama` ayrı CLI path'i. Reddedildi: mevcut `createSubscriptionChatAdapter` pattern'i genişletmek YAGNI ve surgical — yeni soyutlama gereksiz.

### Enterprise Slash Ayrı Terminal (enterprise-mode zorunlu)

Enterprise komutları yalnızca `DECKENT_CHAT_MODE=enterprise` ile erişilebilir kılmak. Reddedildi: "kullanılmasa da kullanılabilir" prensibi — yetenek hep var, görünürlük modla kontrol edilir.

### Dashboard Tam Yeniden Tasarım

Layout'u sprint içinde sıfırdan yazmak. Reddedildi: Karpathy Discipline 3 (Surgical) — mevcut Layout.tsx genişletildi, chat nav gruplaması eklendi, 10-sayfa korundu.

---

## References

- Sprint 221 — feat: REPL tam-kapsam + provider-parity + local-model-foundation (ADR-083)
- ADR-082 — Native-LLM-Wire (Sprint 220 predecessor: REPL gerçek cevap, config-driven provider)
- ADR-081 — Native Agentic Deckent (REPL kabuk, Sprint 219)
- ADR-066 — Provider Independence (multi-provider backend parity)
- ADR-070 — Brain Evaluation Integrity (zero-hardcode principle)
- ADR-010 — Tek Runtime Dependency (no new runtime deps)
- ADR-004 — 3-Layer Config Merge (CHAT_CONFIG_SCHEMA uyumlu)
- `src/cli/commands/chat-native.ts` — `runChatNativeLoop` + slash-wire + agentic-wire
- `src/cli/commands/chat-slash-registry.ts` — `buildSlashRegistry`, `resolveSlash`
- `src/cli/commands/chat-status-line.ts` — `renderStatusLine`
- `src/cli/commands/chat-enterprise-bridge.ts` — `dispatchEnterpriseSlash`
- `src/cli/commands/chat-mode.ts` — `resolveChatMode`
- `src/cli/commands/chat-provider-parity.ts` — `resolveChatAdapter`
- `src/cli/entry.ts` — `buildOllamaReplAdapter`, `DECKENT_CHAT_PROVIDER` env override, openai-compat branch
- `src/core/config.ts` — `resolveChatProvider`, `CHAT_CONFIG_SCHEMA`
- Memory: `project_terminal_dashboard_ux_evolution` — Sprint 221 yönü (claude-code-UX evrim)
- Memory: `feedback_directive_kanit_letter_vs_goal` — wire-gap (def-dosya dışla, çağıran-modül ölç)

---

## Amendment — Sprint 281 (2026-06-11, ADR-review, full code-verification)

**Classification: BOTH** (REPL ürün-yüzü; ollama-local = air-gapped/maliyet user-değeri; enterprise-slash köprüsü "kullanılmasa da kullanılabilir" ilkesinin taşıyıcısı).

**Re-verified (çağıran-taraf wire'lar gerçek):** Dalga-A `handleReplCommand` + `classifyAgenticIntent/dispatchAgenticIntent` + `buildSlashRegistry/resolveSlash` — `chat-native.ts:10/:13/:15` import + loop-tüketimi ✓ · 5 modül diskte (slash-registry / status-line / mode / enterprise-bridge / provider-parity) ✓ · `resolveChatProvider` (`config.ts:87`) + `resolveChatProviderWithFallback` (:124) + `CHAT_CONFIG_SCHEMA` (:318) ✓ · `buildOllamaReplAdapter` (`entry.ts:205`) + `DECKENT_CHAT_PROVIDER` env-override ✓.

**Evrim:**
- **Ink-default'a sorunsuz taşındı (ADR-086):** `src/cli/repl/run.tsx` slash-registry'yi tüketiyor — Dalga-A çekirdeği view-değişiminde korundu.
- **`resolveChatAdapter` SSOT'u serve'e uzadı:** Sprint 269 B-ChatStream `server.ts:1206`'da bu ADR'nin parity-modülünü dashboard chat-stream adapter'ı olarak bağladı (`:643` endpoint-tüketimi) — "tek giriş noktası" hedefi terminal-ötesine geçti.

**Hafif drift:** `entry.ts` REPL-tarafı kendi inline provider-dallarını koruyor (ollama/openai-compat) — `resolveChatAdapter` SSOT'una indirgenmedi; iki resolve-yolu yaşıyor (konsolidasyon adayı, Chat/Dashboard product-sprint'i). Canlı dashboard-chat'in "Anlamadım" davranışının kökü bu ADR'nin parity-modülü DEĞİL — `POST /api/chat` classifier-only + ChatPage stream-hata-yutması (ayrıntı ADR-080 amendment düzeltmesi + UX-denetim #1 v3). md+db senkron (Alperen ADR-review).
