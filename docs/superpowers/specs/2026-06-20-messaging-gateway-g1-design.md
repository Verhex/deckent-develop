---
title: Project-Scoped Messaging Gateway — G1 (Daemon + Session Model)
date: 2026-06-20
status: design-approved
program: Telegram/Messaging Experience Redesign
sub-project: G1 (of gateway re-arch G1→G2→G3)
related-adrs: [ADR-016, ADR-040, ADR-062, ADR-069, ADR-079, ADR-087]
proposes-adr: "Project-Scoped Messaging Gateway — Control-Plane Daemon + Spawned Per-Project Runtimes (amends ADR-016)"
---

# Project-Scoped Messaging Gateway — G1 Tasarımı

> Anlatım TR, teknik terim/kod/komut EN (CLAUDE.md kuralı).

## 0. Bağlam: bu spec nereye oturuyor

**Tetikleyen şikayet:** mevcut Telegram botu (`telegraf` + `bot-humanizer` katmanı) "ne işe yarıyor ne anlaşılır konuşuyor" — baştan sona yeniden tasarım isteniyor. Referanslar: NousResearch **hermes-agent** (Python, tek gateway process, Telegram=aiogram + local Bot API server) ve **openclaw** (Node/TS, local-first Gateway, per-agent workspace+session, DM pairing). İkisi de **gateway daemon + multi-channel + per-agent session routing** desenini paylaşıyor; deckent zaten bu iskelete %70 sahip (`connector-pool`, `bot-daemon`, `incoming-router`, gated dispatcher, pairing) — eksik olan deneyim + formalize gateway.

**Program decomposition (onaylı):**
- Telegram redesign 3 faza bölündü: **Faz 1** Ses & Streaming · **Faz 2** Yetenek & UX · **Faz 3** Transport & Gateway.
- Kullanıcı **Transport-önce** + **tam gateway re-arch** seçti.
- Gateway re-arch kendi içinde 3 alt-projeye bölündü:
  - **G1** — Gateway daemon + project-scoped session modeli *(bu spec)*
  - **G2** — Connector SPI + grammY Telegram reference + Discord parity
  - **G3** — Session-aware agent runtime routing (per-session context/memory/isolation)
- **Build sırası:** G1 (omurga) → G2 (grammY Telegram = ilk görünür kazanç) → G3.

**Onaylı kararlar:**
- Session modeli: **project-scoped** (chat → deckent project; `chat X→/foo, chat Y→/bar`).
- Process topolojisi: **A — control-plane daemon + per-project spawned runtime children**.
- Binding UX: **explicit `/use <project>`** (sessiz default YOK).
- Daemon home: **global `~/.deckent/gateway/`** (multi-project gereği).

## 1. Problem / motivasyon

1. **409 kısıtı:** tek bot token aynı anda yalnız tek process tarafından poll edilebilir (`getUpdates` çakışması). Multi-project'te her project kendi poller'ını koşamaz → tek global gateway tek connector'ı sahiplenip arkada route etmeli.
2. **Auth invariant:** bot/daemon kasıtlı `ANTHROPIC_API_KEY` strip eder (subscription-auth zorlaması, worker auth-loss tehlikesi). Çok-project runtime'da bu invariant child başına korunmalı.
3. **İzolasyon:** bir project'in agentic loop'u çökse/asılsa diğer project'leri ve gateway'i etkilememeli.
4. **Çok-project telefondan yönetim:** tek daemon birden çok deckent project'ini ayrı chat'lerden sürebilmeli.

## 2. Hedef / hedef-dışı

**G1 hedefleri (in-scope):**
- Global `deckent gateway` daemon (start/stop/status), home `~/.deckent/gateway/`.
- Tek connector instance / token (tek poller, 409 yok).
- `SessionRegistry`: chat→project binding, persist.
- `RuntimeSupervisor`: per-project spawned runtime child, lifecycle + crash→restart + idle-evict.
- `gateway-router`: inbound → session çöz → route; `/use` `/projects` `/unbind` `/whoami` `/pending` + approval-callback.
- `gateway-ipc`: daemon↔child line protokolü (streaming-frame'e forward-compat).
- Auth-strip invariant child başına (kod + test assert).
- i18n (en/tr) tüm chat-facing string `getMessage` üstünden.

**G1 hedef-dışı (ertelenen):**
- Telegram **telegraf'ta kalır** (grammY = G2).
- `bot-humanizer` **aynen** (voice/streaming = Faz 1).
- **systemd/launchd** reboot-survive (= G4/G3-ops); G1 detached-daemon baseline + temiz-restart verir, reboot konusunda dürüst.
- Per-session memory/context isolation hardening (= G3); G1 runtime mevcut gated loop'u olduğu gibi kullanır.
- Streaming partial-frame gönderimi (designed-for ama G1 tek final-frame).

## 3. Mimari / process modeli

```
                       ~/.deckent/gateway/   (global home: gateway.pid, sessions.json, projects.json)
                       ┌───────────────────────────────────────────────┐
  Telegram ──poll──▶   │  deckent gateway  (control-plane daemon)        │
  (tek token,          │   ├─ ConnectorPool   (1 connector / token)      │
   tek poller)         │   ├─ SessionRegistry (chatKey → projectPath)    │
                       │   ├─ gateway-router  (resolve → route)          │
                       │   └─ RuntimeSupervisor                          │
                       └──────────┬───────────────┬────────────────────-┘
                          spawn   │ IPC           │ spawn  IPC
                       (env: -ANTHROPIC_API_KEY)  │
                            ┌─────▼─────┐   ┌──────▼──────┐
                            │ runtime   │   │ runtime     │   gateway-runtime --project <path>
                            │ /foo      │   │ /bar        │   (gated agentic loop, subscription-auth)
                            └───────────┘   └─────────────┘
```

- **Daemon** = uzun-ömürlü global process. Connector'ları (tek poller), session registry'yi, router'ı ve supervisor'ı wire eder. Pidfile `~/.deckent/gateway/gateway.pid`.
- **Runtime child** = `deckent gateway-runtime --project <path>`. O project'in config'ini yükler, gated dispatcher kurar (mevcut `bot-agentic` + `chat-native` yeniden kullanılır), IPC üzerinden istek alıp reply döner. **Env'inde `ANTHROPIC_API_KEY` yok** (subscription-auth).
- **IPC** = JSON-lines (mevcut worker-IPC deseni); stdin/stdout. Request `{id, chatKey, kind:'message'|'callback', text}` → Response `{id, parts:string[], buttons?}`. Protokol `kind:'partial'` frame'lerine baştan açık (Faz 1 streaming tek-satır ekler).

## 4. Bileşenler (tek-sorumluluk, bağımsız test edilebilir)

| Modül | Sorumluluk | Bağımlılık |
|---|---|---|
| `src/connectors/gateway/gateway-daemon.ts` | Process entry, pidfile, parçaları wire et, graceful shutdown (ADR-025) | supervisor, router, connector-pool |
| `src/connectors/gateway/session-registry.ts` | `bind/unbind/resolve(chatKey)`, `sessions.json` atomic persist, fail-safe load | node:fs (async, ADR-087) |
| `src/connectors/gateway/runtime-supervisor.ts` | `getOrSpawn(project)→RuntimeHandle`, health, crash→restart (backoff), idle-evict (TTL/LRU), dispose-all | gateway-ipc, node:child_process (async spawn) |
| `src/connectors/gateway/gateway-runtime.ts` | Child entry: project config, gated dispatcher, IPC req→reply, auth-strip env doğrula | bot-agentic, chat-native |
| `src/connectors/gateway/gateway-router.ts` | Inbound → resolve → route; slash + approval-callback gateway-level | session-registry, supervisor, bot-commands |
| `src/connectors/gateway/gateway-ipc.ts` | Line protokolü encode/decode; partial-frame'e forward-compat | — |
| `src/cli/commands/gateway.ts` | `deckent gateway start/stop/status`, `gateway pair approve …`, `gateway-runtime` (hidden) | gateway-daemon |

Connector katmanı (`ConnectorPool`, `IMessageConnector`, `telegram.ts`) **aynen yeniden kullanılır** — G1 `IMessageConnector` üstünde transport-agnostik. `connectors/gateway/` yeni alt-klasör; mevcut `bot-*` dosyaları G1'de değişmez (router onları çağırır).

## 5. Session modeli (project-scoped)

- `chatKey = ${connector}:${channelId}` (örn. `telegram:12345`).
- `SessionRegistry`: `chatKey → { projectPath, boundAt, boundBy }`, `~/.deckent/gateway/sessions.json` (atomic write, corruption→boş fail-safe).
- **Project kayıt listesi:** `~/.deckent/gateway/projects.json` — `{ name, path }[]`. `/use <name|path>` buna göre çözer.
- **Binding UX (onaylı, explicit):**
  - `/use <name|path>` — chat'i projeye bağla.
  - `/projects` — kayıtlı projeleri + hangisine bağlı olduğunu listele.
  - `/unbind` — binding'i temizle.
  - `/whoami` — mevcut binding'i göster.
- **Unbound chat → sessiz default YOK:** rehber mesaj ("şu projeler var, `/use X` ile bağla"). Yıkıcı op'ların yanlış projeye gitmemesi için açık binding zorunlu.
- **Yetki / pairing (openclaw-tarzı):** per-project chat-id allowlist (bugünkü tek `authorizedChatIds`'in genellemesi). Bilinmeyen chat → pairing code üret → `deckent gateway pair approve <code> <project>`; onaylanana dek mesaj işlenmez.

### 5.1 İki-seviyeli secret modeli (token nereden gelir)

Tek global poller = **tek bot, çok chat** (openclaw modeli). Dolayısıyla iki ayrı secret seviyesi var, karıştırılmamalı:

- **Bot token → gateway-level (global):** TEK bot token, gateway home'da çözülür (`~/.deckent/gateway/` config / gateway `.deck`). Token project'e ait DEĞİL — bir bot, chat→project binding ile route eder. (Bu, "tek connector / tek poller" topolojisinin doğal sonucu; per-project ayrı token ≈ ayrı bot ≈ ayrı poller = farklı tasarım, kapsam dışı.)
- **Project secret → runtime-level (per-project):** her runtime child KENDİ project root'undaki `.deck`'i okur (project'e özgü provider/config ihtiyaçları). Subscription-auth invariant'ı gereği `ANTHROPIC_API_KEY` zaten strip'li; child `.deck`'ten yalnız project-scoped secret çözer.

Özet: **chat→bot eşleşmesi global; project→secret eşleşmesi child-local.** İkisi farklı dosya/seviye.

## 6. Veri akışı (happy path)

1. Telegram mesajı → ConnectorPool (tek poller) → `gateway-router`.
2. Router `chatKey` çıkarır → `SessionRegistry.resolve`. Yetki guard (allowlist + acceptFrom cutoff).
3. **Slash** (`/use` `/projects` `/unbind` `/whoami` `/pending`) ve **approval-callback** (`approve:<id>` buton) gateway-level işlenir — runtime'a forward EDİLMEZ.
4. **NL mesaj** + bound → `supervisor.getOrSpawn(projectPath)` → IPC request → runtime gated agentic loop (read-only tool anında; risky tool → park, "approve <id>") → IPC response `{parts, buttons}`.
5. Router `parts`'ı connector'dan relay eder (`chunkMessage`, lossless). Buttons → inline keyboard.

## 7. Hata yönetimi / dayanıklılık

- **Runtime crash:** supervisor child exit'i yakalar → chat'e i18n "runtime yeniden başlatıldı" → backoff'la respawn. Uçuştaki IPC isteği timeout'la nazik düşer ("hâlâ çalışıyor / başarısız").
- **Daemon crash:** stale pidfile; `gateway start` `isPidAlive` ile temizleyip yeniden kalkar. (reboot-survive = G4; G1 dürüstçe "machine up iken always-on, reboot'ta değil" der.)
- **Connector/409 hatası:** connector-pool per-channel izole; log + degrade, host crash yok.
- **Auth invariant:** her child `delete env.ANTHROPIC_API_KEY` ile spawn — kodda + **testte assert** (spawn'lanan env'de key yok). Child asla stray key inherit etmez.
- **Session persist:** atomic write (partial önle); bozuk dosya → boş kabul, asla crash.
- **Backlog-replay guard:** `acceptFrom` cutoff korunur → daemon restart'ında stale "approve" replay edemez (mevcut davranış).
- **Idle-evict:** TTL/LRU ile boşta runtime child'lar kapatılır (kaynak); bir sonraki mesajda lazy respawn.

## 8. Migration / uyumluluk

- Mevcut `deckent bot start` (per-project) **çalışmaya devam** (deprecation yolu). `deckent gateway` çok-project süperset. Tek-project kullanıcı: tek-binding gateway ≈ bugünkü bot deneyimi.
- `connectors/types.ts` (`IMessageConnector`, `ConnectorId`, `OutgoingMessage`) **breaking change YOK** — G1 üstüne ekler.
- **Yeni ADR (proposed):** "Project-Scoped Messaging Gateway — Control-Plane Daemon + Spawned Per-Project Runtimes" → ADR-016 (External Messaging Connectors)'ı amend eder; ADR-040 (Nervous), ADR-062 (WS Gateway), ADR-069 (Webhook) ile hizalı; ADR-025 (graceful shutdown) + ADR-087 (async I/O) + ADR-089 (spawn backend) desenlerine uyar.

## 9. Test (hermetik — CLAUDE.md / ADR-087)

- **Unit:**
  - `session-registry`: bind/resolve/unbind + persist round-trip (tmpdir), corrupt-file→boş.
  - `gateway-router`: routing kararları (injected supervisor + connector mock); slash/callback intercept; unbound→guidance; yetkisiz chat→drop.
  - `runtime-supervisor`: injected `spawnFn`; crash→restart backoff; idle-evict; **auth-env assert (spawn env'de ANTHROPIC_API_KEY yok)**.
  - `gateway-ipc`: frame encode/decode; partial-frame forward-compat.
- **Integration:** fake connector → mesaj → fake runtime → reply yolu (uçtan uca). Hepsi tmpdir, **async spawn (no spawnSync)**, no network.
- **Proof-of-function (Tier-1, CLI user-surface — ADR-079):**
  `Smoke: node dist/cli/entry.js gateway start` (echo-connector + bound tmp-project) → mesaj enjekte → reply assert. Gerçek-binary koşu; mock-only = GO_WITH_TECH_DEBT.
- **i18n:** `/use`, pairing, unbound-guidance, restart-notice, kill/approve ack — hepsi `getMessage(key, lang)` (en/tr), hardcode YOK.

## 10. Definition of Done (G1)

- [ ] `deckent gateway start/stop/status` çalışır; global home `~/.deckent/gateway/`.
- [ ] Tek connector/poller; iki ayrı chat iki ayrı project'e bağlanıp doğru runtime'a route edilir.
- [ ] `/use` `/projects` `/unbind` `/whoami` `/pending` + approval-callback gateway-level çalışır; unbound→guidance.
- [ ] Runtime child auth-strip env ile spawn (test assert); crash→auto-restart.
- [ ] `tsc --noEmit` temiz + `vitest run tests/connectors tests/cli` yeşil + Smoke gerçek-binary geçer.
- [ ] Yeni ADR proposed + DECKENT.md/IDENTITY feature kaydı.
- [ ] i18n en/tr tam; hardcode string yok.

## 11. Açık sorular (G1 sonrası, bilinçli ertelenen)

- grammY swap detayı + webhook modu → **G2**.
- Per-session conversational memory + context isolation → **G3**.
- systemd/launchd reboot-survive + observability → G4 (G3-ops ile birleşebilir).
- Secret/token modeli §5.1'de çözüldü (bot=gateway-global, project-secret=child-local); impl-plan yalnız gateway `.deck`/config dosya formatını netleştirir.
