# W1-T06 — nervous/ + connectors/ + providers/ Sağlık Denetimi

**Sprint:** 188  
**Task:** 188-006 (W1-T06)  
**Tip:** Audit (ANALYSIS-ONLY) — ADR-053  
**Tarih:** 2026-05-22  
**Worker:** w-188-006

Bu rapor `src/nervous/` (ADR-040 meta-orchestrator), `src/connectors/` (mesajlaşma adaptörleri) ve `src/providers/` (AI provider adaptörleri) üç alt-sisteminin canlı/dormant/stub sınıflandırmasını yapar, DECKENT.md/IDENTITY.md/CLAUDE.md iddialarıyla kod gerçeğini çapraz denetler. Hiçbir kaynak kod, doküman veya konfigürasyon değiştirilmemiştir.

---

## 1. Kapsam ve Yöntem

**İncelenen modüller (toplam 37 dosya, 6757 LoC):**

- `src/nervous/` — 14 root modül + 12 detector (`src/nervous/detectors/`), toplam 26 dosya, ~3838 LoC
- `src/connectors/` — 7 modül + 1 README, toplam 8 dosya, ~716 LoC
- `src/providers/` — 5 modül (claude, codex, gemini, sandbox, subprocess), toplam 1711 LoC

**Yöntem:** Her modül için (a) export edilen sınıf/fonksiyon, (b) çağıran call-site (grep), (c) DECKENT.md/IDENTITY.md/CLAUDE.md iddialarıyla karşılaştırma, (d) test kapsamı. Sınıflandırma:

- **CANLI** — production runtime path'inde aktif olarak çağrılır.
- **YARI-WIRE** — wire mevcut ama config-gated default-off; çağrı yolu instantiate edilebiliyor.
- **DORMANT** — sınıf/fonksiyon export ediliyor ama `src/` içinde hiçbir call-site yok (test'ler hariç).
- **STUB** — kasıtlı placeholder; gerçek implementasyon başka sprint'e ertelenmiş.

---

## 2. nervous/ — ADR-040 Meta-Orchestrator

### 2.1 Pipeline modülleri (14 root)

| Modül | LoC | Sınıflandırma | Kanıt |
|------|-----|---------------|-------|
| `observer.ts` | 426 | YARI-WIRE | `src/nervous/bootstrap.ts:72` — `new NervousObserver(...)`; bootstrap config-gated. |
| `detector-registry.ts` | 202 | YARI-WIRE | `src/nervous/observer.ts:22` import + `runAll` çağrısı. |
| `decision-engine.ts` | 116 | YARI-WIRE | `src/nervous/bootstrap.ts:78` — `new DecisionEngine(nervousConfig)`. |
| `proposer.ts` | 157 | YARI-WIRE | `src/nervous/bootstrap.ts:79`. |
| `dispatcher.ts` | 344 | YARI-WIRE | `src/nervous/bootstrap.ts:80` — `new NervousDispatcher`. |
| `executor.ts` | 299 | YARI-WIRE | `src/nervous/bootstrap.ts:82` — `new Executor(history, actionHandler)`. |
| `history.ts` | 142 | YARI-WIRE | `src/nervous/bootstrap.ts:81` — `new NervousHistory(projectRoot)`. |
| `authority-matrix.ts` | 184 | CANLI (lib) | `decision-engine.ts:14` + `mcp/tools/nervous.ts`. Pure data. |
| `action-registry.ts` | 328 | CANLI (lib) | 30 eylem; `decision-engine.ts:15`, `executor.ts:12`, `action-handlers.ts:14`, `mcp/tools/nervous.ts:8`. |
| `action-handlers.ts` | 196 | YARI-WIRE | 4 MVP handler + 26 stub (`outcome: 'unimplemented'`). `bootstrap.ts:37` default stubActionHandler. |
| `bootstrap.ts` | 142 | YARI-WIRE | `sprint-controller.ts:374` — runtime dynamic import. |
| `ipc-queue.ts` | 237 | YARI-WIRE | MCP `nervous_accept/reject` ↔ Executor köprüsü; default-off nervous'la aktive olur. |
| `runtime-scope-check.ts` | 55 | CANLI (guard) | `observer.ts:21`, `dispatcher.ts:16` `assertBrainScope()` çağrıları. |
| `detectors/` (12 adet) | ~1502 | YARI-WIRE | `detector-registry.ts:11-22` import + per-detector enabled flag. |

**Toplam pipeline:** ADR-040'taki şema (Observer → DetectorRegistry → DecisionEngine → Proposer → Dispatcher → Executor) **kod düzeyinde tamdır**. Wire de mevcut: `sprint-controller.ts:583` — `initNervousSystemForSprint(config, projectRoot)`; `sprint-controller.ts:982` — `disposeNervousSystem(nervous)` finally bloğunda.

### 2.2 Default-off ve dogfood durumu

`sprint-controller.ts:367` — `if (config.nervous_system?.enabled !== true) return null;` (default-off respect). `bootstrap.ts:67` aynı kontrolü `nervousConfig?.enabled` üzerinden tekrar yapar (defense-in-depth).

**Bu projede (deckent-dev):** `.deckent/config.json:111` — `"enabled": false`. Yani nervous pipeline'ı **dormant** durumdadır — dogfood etmek için Alperen henüz aktive etmedi. Bu durum ADR-040 "Negative Consequences" bölümündeki "enabled=false başlangıç; Sprint 148 aktifleştirme + Sprint 149 doc sprint zorunlu" notuyla uyumsuzdur (sprint 188 itibarıyla hâlâ false). ADR-047 (Manuel Subagent Dispatch) açıkça deckent-dev'in nervous yerine manuel subagent yoluyla çalıştığını belgeliyor.

### 2.3 Detector envanteri (12 detector)

`detector-registry.ts:11-22`'de import edilen detector listesi:

1. `stale-worker.ts` (61 LoC) — `detector-registry.ts:103`, `.deckent/config.json:143` enabled=true.
2. `scope-collision.ts` (196 LoC) — `.deckent/config.json:147` enabled=false.
3. `debt-trend.ts` (117 LoC) — enabled=false.
4. `agent-routing.ts` (138 LoC) — `string;` corruption detector; enabled=false.
5. `directives-protection.ts` (91 LoC) — enabled=true (sprint 145 08:14 TRT bug için kritik).
6. `task-mode-idle.ts` (72 LoC) — enabled flag config'de yok (varsayılan false).
7. `build-failure-recurrence.ts` (192 LoC) — enabled config'de yok.
8. `token-spike.ts` (139 LoC) — enabled config'de yok.
9. `agent-routing-anomaly.ts` (113 LoC) — enabled config'de yok.
10. `scope-collision-rate.ts` (100 LoC) — enabled config'de yok.
11. `notification-delivery-health.ts` (123 LoC) — enabled config'de yok.
12. `dead-event-stream.ts` (160 LoC) — `.deckent/config.json:162` enabled=true (Sprint 165 Bug W aktive).

**Tutarsızlık:** DECKENT.md/architecture'a göre nervous_system.enabled=false olduğu için nervous pipeline çalışmaz, ancak `.deckent/config.json` detector-level enabled=true alanları mevcut — bu satırlar zaten asla yürütülmez. Konfigürasyon kafa karıştırıcı (nervous_system.enabled root flag false iken alt-detector enabled=true ayarları çelişkili görünüyor).

### 2.4 Wire haritası — runtime'a girer mi?

`grep "initNervousSystemForSprint"` → tek call-site `sprint-controller.ts:583`. `grep "createNervousSystemIfEnabled"` → tek call-site `bootstrap.ts` ve `sprint-controller.ts:374` dynamic import. Yani wire **tek noktadan girer**, fail-safe try/catch (`sprint-controller.ts:375-378`) ile sarılı, dispose finally'de garanti edilmiş. Sprint başında nervous yoksa run devam eder — bu sağlıklı bir kontrat.

---

## 3. connectors/ — Mesajlaşma Adaptörleri

### 3.1 Modül envanteri (7 modül)

| Modül | LoC | Sınıflandırma | Kanıt |
|------|-----|---------------|-------|
| `types.ts` | 82 | CANLI (lib) | `IMessageConnector`, `ConnectorId`, `IncomingMessage`, `OutgoingMessage` tip tanımları. |
| `base-connector.ts` | 80 | CANLI (lib) | Soyut base sınıf; tüm connector'lar extend ediyor. |
| `connector-pool.ts` | 113 | DORMANT | `grep "new ConnectorPool"` → src/ içinde **0 call-site**. Sadece test'te. |
| `discord.ts` | 74 | DORMANT (lib) | `discord.js@^14.26.3` (package.json:89) installed. `grep "new DiscordConnector"` → src/ içinde **0 call-site**. |
| `telegram.ts` | 112 | DORMANT (lib) | `telegraf@^4.16.0` (package.json:72) installed; lazy import. `grep "new TelegramConnector"` → src/ içinde **0 call-site**. |
| `whatsapp.ts` | 68 | STUB | `whatsapp.ts:35-39` — `enabled: true` ise atılan hata: "scaffold only … Sprint 153+ activation". `isHealthy()` her zaman false. |
| `incoming-router.ts` | 187 | CANLI | `src/api/server.ts:31` import + `:742` — `const router = new IncomingMessageRouter(); router.route(...)` webhook handler'da. |

### 3.2 İncoming-router'ın canlılığı

`src/api/server.ts:741-751` — Webhook POST endpoint gelen Discord/Telegram payload'ını `parseWebhookPayload` ile normalize eder, ardından `IncomingMessageRouter.route()` çağırır. Bu, `eventBus.publish()` üzerinden `CHANNELS.NOTIFY` kanalına `INCOMING_MESSAGE` payload'ı bırakır. **Canlı bir köprü.**

Ancak: nervous_system.enabled=false olduğu için `eventBus`'a yayılan bu event'i dinleyen aktif bir detector/handler bu projede yok. Yani köprü kuruludur ama karşı uç **dormant**.

### 3.3 Connector class'larının instantiation eksikliği

Discord/Telegram/WhatsApp **sınıfları export edilir** (`base-connector.ts`'ten extend) ama `src/` ağacında **hiçbir yerde `new DiscordConnector()` / `new TelegramConnector()` / `new WhatsAppConnector()` çağrısı yoktur**. `ConnectorPool` da instantiate edilmez. Yani:

- Bot olarak çalıştırma yolu **yarı kurulu** — sınıf var, npm dep'i var, ama `pool.register(new DiscordConnector())` çağrısı runtime'da hiçbir yerden gelmiyor.
- Webhook yolu canlı — `api/server.ts` üzerinden Discord/Telegram webhook'larını alır ve eventBus'a basar.

**CLAUDE.md:55** iddiası — "External messaging adapters: Discord, Telegram, WhatsApp, incoming-router" — kısmen doğru: dosyalar mevcut, ancak Discord/Telegram **gerçek bot lifecycle'ında bir yerden kullanılmıyor**. WhatsApp tamamen stub.

### 3.4 Tutarsızlık özeti

- **WhatsApp `whatsapp-README.md`** scaffold'ı doğru belgeliyor (sınıfın amacı stub olarak resmidir, ADR yok).
- **Discord/Telegram** kodu fonksiyonel görünüyor (Gateway intents, Telegraf wrapper) ama wire eksik — DEAD CODE riski; ya Sprint X'te aktive edilmeli ya da `docs/audits/sprint-186/dead-code-report.md` benzeri kayda eklenmeli.

---

## 4. providers/ — AI Provider Adaptörleri

### 4.1 Modül envanteri (5 modül)

| Modül | LoC | Sınıflandırma | Kanıt |
|------|-----|---------------|-------|
| `claude.ts` | 275 | CANLI | `src/providers/claude.ts:58` `class ClaudeAdapter implements ProviderAdapter`; `core/provider.ts:528-531` `createClaudeAdapter` factory. |
| `codex.ts` | 371 | CANLI | `src/providers/codex.ts:65` `class CodexAdapter implements ProviderAdapter`; `core/provider.ts:532-535` factory. |
| `gemini.ts` | 577 | CANLI | `src/providers/gemini.ts:164` `class GeminiAdapter implements ProviderAdapter`; `core/provider.ts:536-539` factory. |
| `subprocess.ts` | 327 | CANLI | `src/providers/subprocess.ts:96` `class SubprocessSpawnBackend implements ProviderAdapter`; `claude.ts:71` Claude subprocess backend. |
| `sandbox.ts` | 161 | DORMANT | `src/providers/sandbox.ts:28` `class SandboxSpawnBackend extends SubprocessSpawnBackend`. **`grep "SandboxSpawnBackend"` src/ içinde sadece kendi dosyasında**; CLI `--sandbox-mode` `start.ts:212` `applySandbox(root)` (git stash) kullanır — sandbox provider değil. |

### 4.2 ProviderAdapter arayüz uyumu (ADR-017)

`src/core/provider.ts:32-90` `ProviderAdapter` interface'i tanımlıyor: `name`, `supportedModels`, `spawn`, `kill`, `listWorkers`, `isAvailable`, `buildCommand` (+ opsiyonel `buildPlannerCommand`). 

`grep "implements ProviderAdapter"` → 4 sınıf: `ClaudeAdapter` (claude.ts:58), `CodexAdapter` (codex.ts:65), `GeminiAdapter` (gemini.ts:164), `SubprocessSpawnBackend` (subprocess.ts:96). `SandboxSpawnBackend` (sandbox.ts:28) `extends SubprocessSpawnBackend` üzerinden dolaylı uyumlu.

**ADR-017 uyumu:** Codex `codex exec --full-auto … --model …` (codex.ts:80+), Gemini `gemini -p … --output-format json/stream-json` (gemini.ts:49) — ADR-017 "Note (current scope)" verified accurate kısmı doğru.

### 4.3 ADR-023 tier uyumu

`codex.ts:32-36` ve `gemini.ts:34-39` provider-agnostic tier isimlerini (`premium`, `standard`, `economy`, `premium_plus`) kullanıyor — ADR-023'le uyumlu. Eski isimler (`max_plan`, `max5x_plan`, `pro_plan`) provider kodunda yok, sadece config alias map'inde (`core/config.ts`).

### 4.4 DECKENT.md "5 modül" iddiası

`CLAUDE.md:56` — "Claude, Codex, Gemini adapters (5 modules)". `ls src/providers/` → 5 dosya ✓ (claude, codex, gemini, sandbox, subprocess). İddia **sayıca doğru** ama `sandbox.ts` dormant olduğundan üretim hattındaki adapter sayısı 4'tür. IDENTITY.md:21 "Providers: Claude, Codex, Gemini" — 3 sağlayıcı, 5 modül; uyumlu.

### 4.5 SandboxSpawnBackend dormant kanıtı

`grep -r "SandboxSpawnBackend" src/` → tek dosya: `src/providers/sandbox.ts` (kendi tanımı + line 159-160 factory). `src/cli/commands/start.ts:212` `opts.sandboxMode` `applySandbox(root)` (git-stash mekanizması, `core/sandbox-stash.ts` benzeri) kullanır — bu **farklı bir sandbox** kavramı. `sandbox.ts` provider sandbox'ı tamamen ayrı bir yoldan tasarlanmış ama wire'sı yok. Sprint 27 izleri (`docs/directives/sprint-027.md`) sandbox'ın orijinal sprint'i olduğunu gösteriyor.

---

## 5. DECKENT.md / IDENTITY.md / CLAUDE.md çapraz tutarlılığı

| İddia | Belge | Kod gerçeği | Durum |
|-------|-------|-------------|-------|
| "ADR-040 Nervous System Architecture — accepted" | summary.md:42 | bootstrap+wire mevcut, default-off | Tutarlı |
| "Nervous detectors 5 MVP" | ADR-040 metni | 12 detector kayıtlı (5 MVP + 7 sonra) | DOC DRIFT (ADR-040 metni güncel değil) |
| "30 eylem 4 kategori" | ADR-040 metni | `action-registry.ts:30` adet ✓ | Tutarlı |
| "Toplam 27 MCP tool" | ADR-040 metni | Şu an ~31 (DECKENT.md "31 tools") | DOC DRIFT (ADR-040 kendi notunda kabul ediyor) |
| "5 modül" providers | CLAUDE.md:56 | 5 dosya ✓ ama 1 dormant | Sayıca tutarlı, semantik kısmi |
| "Discord/Telegram/WhatsApp" connectors | CLAUDE.md:55 | Discord/Telegram dormant, WhatsApp stub | Kısmen yanıltıcı |
| "3 Provider (Claude, Codex, Gemini)" | IDENTITY.md:36 | 3 provider ✓ | Tutarlı |
| nervous_system.enabled=false default | ADR-040 metni | `.deckent/config.json:111` false ✓ | Tutarlı |
| "Sprint 148 nervous aktive" hedef | ADR-040 metni | Sprint 188 itibarıyla hâlâ false | YANIK HEDEF |

---

## 6. Test Kapsamı

- **tests/nervous/** — 18 test dosyası: action-registry, authority-matrix, decision-engine, dispatcher, executor, history, observer, observer-phase-guard, proposer, ipc-queue, dead-event-stream, directives-protection-auto-restore, directives-protection-baseline, runtime-scope, stale-md-detector, integration-runtime + `integration/` + `detectors/`. Birim kapsam **yüksek**, integration var.
- **tests/connectors/** — 6 test: base-connector, connector-pool, discord, telegram, whatsapp-scaffold, incoming-router. Kapsam **yüksek** ama integration call-site eksik.
- **tests/providers/** — 8 test: claude, claude-cleanup-active-protected, codex, codex-integration, gemini, gemini-integration, sandbox, subprocess. Kapsam **kapsamlı**; sandbox testleri unused class'ı doğrulayıp tutuyor.

---

## 7. Risk ve Bulgu Özeti

### 7.1 Kritik Bulgular

- **B1 (Doc drift, ADR-040):** Sprint 148 hedefi `nervous_system.enabled=true` 40 sprint sonra hâlâ false. ADR-040 metni güncellenmeli ya da nervous aktive edilmeli. ADR-047 (Manuel Subagent) bu durumu zımnen meşrulaştırıyor ama ADR-040 metnine atıf eksik.
- **B2 (Dead code riski, connectors/):** `DiscordConnector`, `TelegramConnector`, `ConnectorPool` `src/` içinde hiçbir yerden instantiate edilmiyor. `discord.js` + `telegraf` npm dep'leri (package.json:72, :89) install ediliyor ama runtime kullanım yok — bundle yükü.
- **B3 (Dormant code, providers/):** `SandboxSpawnBackend` (sandbox.ts:28) hiçbir wire içermez. CLI `--sandbox-mode` git-stash kullanır, provider sandbox'ı değil. Sprint 27 izine bakılıp resmen archive ya da aktive kararı gerekli.

### 7.2 Orta Bulgular

- **B4 (Config çelişkisi):** `.deckent/config.json:111` `nervous_system.enabled=false` ama alt-detector `enabled=true` ayarları var (örn. `stale_worker.enabled=true`, satır 144). Root false iken bunlar yürütülmez. Config dokümantasyonu netleştirilmeli ya da root false ise alt-flag'ler gri-out edilmeli.
- **B5 (Doc drift, detector sayısı):** ADR-040 metni "5 MVP detector" diyor; `detector-registry.ts` 12 detector kayıtlı. Sprint 151 Task 15 ile genişletilmiş ama ADR-040 metni hâlâ MVP listesini gösteriyor.

### 7.3 Düşük Bulgular

- **B6:** `nervous/bootstrap.ts:43` — stub action handler "W2-1" referansı; Sprint 180 W2-1 dile getiriliyor ama action-handlers.ts'te zaten 4 MVP handler var (bootstrap.ts:37 default'u hâlâ stub). Sprint 180 sonrası bağımlılık zinciri yorum güncellemesi gerekli.
- **B7:** `whatsapp.ts:37` — "Sprint 153+ activation" hedefi; sprint 188 itibarıyla ne aktive edildi ne archive — kararsız.

---

## 8. Özet

**Pipeline canlılığı:**
- **nervous/** — Kod ve wire **tam** (bootstrap → sprint-controller → observer → detector → decision → proposer → dispatcher → executor → history); ancak `nervous_system.enabled=false` default + deckent-dev kararıyla **yarı-wire dormant**. ADR-040 mimari olarak doğru kurulmuş, "live but inactive" durumunda.
- **connectors/** — Webhook yolu (`incoming-router` + `api/server.ts:741`) **canlı**; bot lifecycle (`DiscordConnector`/`TelegramConnector` instantiation) **wire'sız dormant**; WhatsApp **kasıtlı stub** (whatsapp-README.md ile belgelenmiş).
- **providers/** — Claude/Codex/Gemini/Subprocess **canlı** ve `ProviderAdapter` arayüzüne uyumlu (ADR-017, ADR-023 tier uyumu doğrulandı); SandboxSpawnBackend **dormant** (Sprint 27 kalıntısı).

**İddia ↔ Gerçek:** DECKENT.md/CLAUDE.md/IDENTITY.md modül sayıları (5 provider modülü, 3 provider, connector listesi, ADR-040 accepted) **sayıca doğru**, ancak (a) connectors'taki bot tarafı yanıltıcı şekilde "live" gibi sunulmuş, (b) ADR-040 metni 5 MVP detector + Sprint 148 aktivasyon hedefi gibi **bayat referanslar** içeriyor, (c) sandbox provider yanıltıcı şekilde aktif görünüyor.

**Kabul edilebilir teknik borç:** dormant code (SandboxSpawnBackend + Discord/Telegram connector instantiation) Sprint 189 dead-code raporu kapsamında archive/aktive kararı verilmeli.

---

## 9. Sprint 189 Follow-up

| ID | Eylem | Öncelik | Sahip | Notlar |
|----|-------|---------|-------|--------|
| F1 | ADR-040 metnini güncelle: 12 detector listesi, MCP tool sayısı (drift kabul edilmiş ama metin güncellenmeli), Sprint 148 hedefi yerine "ADR-047 manual dispatch ile birlikte yaşar" notu | YÜKSEK | doc-writer | ADR governance ihlali değil, drift |
| F2 | `src/connectors/` dead code kararı: ya `DiscordConnector`/`TelegramConnector`/`ConnectorPool` `api/server.ts` veya yeni `cli/commands/connector.ts` üzerinden wire edilsin, ya da `.deckent/archive/sprints/sprint-189/` altına taşı + `package.json` dep'lerini eslint-disable veya removed | YÜKSEK | architect | discord.js + telegraf büyük bundle yükü |
| F3 | `src/providers/sandbox.ts` `SandboxSpawnBackend` kararı: ya `start.ts:212` `opts.sandboxMode` SandboxSpawnBackend'i kullansın, ya da archive | ORTA | refactorer | Sprint 27 kalıntısı, tests/sandbox.test.ts korunuyor |
| F4 | `.deckent/config.json` nervous_system schema'sını netleştir: root `enabled=false` iken alt-detector `enabled=true` config'lerinin "no-op" olduğunu açıkla (yorum / şema doc) | DÜŞÜK | doc-writer | Tek satır config-types.ts yorumu yeterli |
| F5 | `whatsapp.ts` "Sprint 153+ activation" hedefinin gerçekçi olup olmadığına karar — ya activate ya da `archived` etiketi | DÜŞÜK | architect | Business API onayı gerekiyor (whatsapp-README) |
| F6 | `nervous/bootstrap.ts:43` stubActionHandler yorumu güncelle — "W2-1" referansı zaten karşılandı | DÜŞÜK | doc-writer | Sprint 180 sonrası kalıntı |
| F7 | `nervous_system.enabled` deckent-dev için aktive deneme sprint'i (canary) | DÜŞÜK | brain | ADR-047 ile karşılıklı uyum testi |

---

**Rapor sonu** — `docs/audits/sprint-188/nervous-connectors-providers-health.md` — Sprint 188 W1-T06 (188-006).
