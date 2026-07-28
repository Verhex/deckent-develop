# MCPV2 — MCP 2026-07-28 (stateless) Geçiş İş Planı

> **Durum:** PLAN (owner-onaylı analiz, 2026-07-28) · **Sahip:** Alperen · **Analiz:** Claude Fable 5
> **Kaynak analiz oturumu:** 2026-07-28 — protokol araştırması (Context7 + birincil kaynaklar) + tam repo taraması.
> **Ledger notu:** Bu doküman iş-planı taslağıdır; canonical iş-takibi için `docs/MASTER-PLAN.md`
> ledger'ına Work ID'ler gate-receipt akışıyla eklenmelidir (P02/P03 programlarına aday).

---

## 1. Ne değişiyor — protokol özeti

`MCP 2026-07-28`, protokolün kuruluşundan bu yana en büyük mimari revizyonu: **oturum-temelli
(session-based) protokolden stateless protokole geçiş.** Doğrulanmış değişiklik listesi:

| Değişiklik | Detay | SEP |
|---|---|---|
| Handshake kalktı | `initialize`/`notifications/initialized` yok; protokol sürümü + client capability'leri her istekte `_meta` içinde (`io.modelcontextprotocol/protocolVersion`, `.../clientCapabilities`, `.../clientInfo`) | SEP-2575 |
| Session kalktı | `Mcp-Session-Id` header'ı ve protokol-seviyesi session yok; her istek self-contained, herhangi bir server instance'ına yönlendirilebilir | SEP-2567 |
| `server/discover` | Sunucu; desteklenen sürümleri, capability'leri ve kimliğini bu RPC ile beyan eder (MUST). stdio'da geriye-uyumluluk probu olarak da kullanılır | SEP-2575 |
| `subscriptions/listen` | HTTP GET endpoint + `resources/subscribe` yerine tek uzun-ömürlü POST-response stream; yalnız `toolsListChanged` / `promptsListChanged` / `resourcesListChanged` / `resourceSubscriptions` tipleri. Serbest push kanalı DEĞİL | SEP-2575 |
| MRTR | Server-initiated istekler (`elicitation/create`, `sampling/createMessage`, `roots/list`) kalktı → `resultType: "input_required"` + `inputRequests` + `requestState`; client aynı isteği `inputResponses` ile retry eder. Tüm sonuçlarda zorunlu `resultType` alanı | SEP-2322 |
| Caching | `tools/list`, `prompts/list`, `resources/list`, `resources/read`, `resources/templates/list` sonuçlarında zorunlu `ttlMs` + `cacheScope` (`public`/`private`); deterministic tool sırası önerisi | SEP-2549 |
| HTTP header routing | `Mcp-Method` + `Mcp-Name` header'ları zorunlu; tool parametresinden `x-mcp-header` custom header'ları; mismatch → 400 + `-32020 HeaderMismatch` | SEP-2243 |
| **Kaldırılan** | `ping`, `logging/setLevel`, `notifications/roots/list_changed`, SSE resumability (`Last-Event-ID`) — kopan stream'de istek yeni request ID ile yeniden gönderilir | SEP-2575 |
| **Deprecate** | Logging, Sampling, Roots feature'ları (min. 12 ay pencere). Log seviyesi per-request `_meta.logLevel`; bu alanı göndermeyen isteğe `notifications/message` gönderilemez (MUST NOT). Migration önerisi: stderr / OpenTelemetry | SEP-2577 |
| Extensions | Reverse-DNS kimlikli extension modeli; Tasks core'dan extension'a taşındı (`io.modelcontextprotocol/tasks`, polling-temelli); MCP Apps resmi extension | SEP-2663 |
| Auth | `iss` doğrulaması (RFC 9207) zorunlu; Dynamic Client Registration deprecate → Client ID Metadata Documents | SEP-2468 |
| Hata kodları | `-32020`…`-32099` spec'e rezerve; resource-not-found `-32002` → `-32602` | — |
| Stateful sunucular | Cross-call state için server-minted **explicit handle**'lar normal tool argümanı olarak taşınır | SEP-2567 |

**GA/rollout durumu (2026-07-28 itibarıyla):** Spec deposunda son stable `2025-11-25`;
`2026-07-28-RC` pre-release. GA bugün hedefli, ancak resmi blog: *"bu tarih normatif metnin yayın
tarihidir, hiçbir implementer için switch-off değildir."* TS SDK v2 stable-line (yeni paketler:
`@modelcontextprotocol/server` + `client`; eski `@modelcontextprotocol/sdk` = v1 hattı), Python
`2.0.0rc1`, Go `v1.7.0-pre.1`, C# `v2.0.0-preview.1`. TS client default'u `legacy`; v2 server iki
era'yı birden servis eder. **Acil kırılma yok — planlı geçiş.**

## 2. Deckent maruziyet özeti

Tam envanter: 2026-07-28 analiz oturumu. Kilit sonuçlar:

| Alan | Durum | Risk |
|---|---|---|
| `Mcp-Session-Id` / handshake | Deckent kodunda hiç yok; server stdio-only, handshake SDK'ya devredilmiş (`src/mcp/server.ts:238`, `src/mcp-client/broker.ts:67`) | 🟢 |
| Execution state | Tamamen disk-first (`.deckent/jobs/`, backlog, `.brain/memory.db`); `deckent_start` zaten fire-and-forget detached fork | 🟢 |
| Tool listesi | Tamamen statik `TOOL_CATALOG` (`src/mcp/tools/index.ts`) — yeni caching modeli için avantaj | 🟢 |
| `server/discover` | Capability beyanı hiç yok (`server.ts:171-174`); `listChanged` yanlış-reklamı (ilan ediliyor, hiç gönderilmiyor) | 🟡 |
| SDK | `^1.27.1` (v1 hattı, `2025-11-25` konuşuyor); v2 = tam paket değişimi; `writer-lease-gate.ts` SDK monkey-patch'i kırılgan | 🟡 |
| Writer-lease | PID-tabanlı, "1 process = 1 client" varsayımı (`writer-lease.ts:18-45`) — HTTP/multi-instance gündeme gelirse geçersiz | 🟡 |
| `deckent_watch` / notify | **🔴 MEVCUT BUG (spec'ten bağımsız):** `logging` capability beyan edilmediği için SDK 1.27.1'de `sendLoggingMessage` sessiz no-op → watch + MCP notify adapter muhtemelen prod'da ölü. Testler mock'lu, yakalayamıyor | 🔴 |
| `deckent_watch` mimarisi | Yeni spec'te iki koldan geçersiz: Logging deprecate + istek-bağlamsız `notifications/message` yasak. Hedef: resource-subscription (`subscriptions/listen`) veya cursor-poll | 🔴 |
| `deckent_nervous_subscribe` | Gerçek push aboneliği yok (Set'e ekleyip okumuyor, `nervous.ts:65,399-425`) — kırılma yok, semantik borç | 🟡 |

**Stratejik sonuç:** "MCP connects capabilities, Deckent owns execution" pozisyonu doğrulandı.
Protokolün session + SSE-resumability'yi atması, retry/checkpoint/evidence sorumluluğunu açıkça
Deckent gibi control plane'lere itiyor — değer önerimizi güçlendiriyor.

## 3. İş paketleri

### P0 — watch/notify canlandırma (spec'ten bağımsız mevcut bug) — S
- [ ] `createServer()`'a `capabilities: { logging: {} }` beyanı (`src/mcp/server.ts`)
- [ ] Gerçek `StdioServerTransport` üzerinden E2E smoke: `deckent_watch` → gerçek notification akışı kanıtı (mock DEĞİL — Proof-of-Function, Tier-1)
- [ ] `listChanged` yanlış-reklam kararı: ya beyanı kaldır ya gerçek emit ekle
- [ ] `tests/mcp/tools/watch.test.ts`'e capability-gate regression testi
- **DoD:** Gerçek-binary koşuda watch event'i client'a ulaşıyor; mevcut testler yeşil.

### P1 — Dual-era hazırlık — M
- [ ] SDK v2 geçişi için ADR amendment (SDK, `src/core/adr-seed.ts:130` ile ADR'ye çivili; metin bayat: "22 tool" → 48)
- [ ] `versionNegotiation` politikasının config/Brain policy'ye bağlanması: `auto` / `pin-modern` / `pin-legacy` / `reject-unsupported`
- [ ] Conformance test matrisi (bugün gerçek-transport E2E testi YOK): legacy↔legacy, modern↔modern, modern→legacy fallback, legacy→modern-only açık hata, stateless retry idempotency, instance-değişimi state-korunumu, cache-scope invalidation, subscription reconnect+reconciliation
- [ ] `writer-lease-gate.ts` monkey-patch'inin SDK-resmi API'ye taşınması
- **DoD:** Matris CI'da; SDK v2'ye geçiş kararı ADR'de; policy config'te.

### P2 — Yeni primitive adaptasyonu — L
- [ ] `server/discover` beslemesi: `TOOL_CATALOG` + `DECKENT_MCP_INSTRUCTIONS` → tek SSOT'tan capability/identity beyanı
- [ ] `deckent_watch` yeniden mimarisi: sprint event'leri MCP resource olarak (`deckent://sprint/{id}/events` + cursor) + `subscriptions/listen`/`resourceSubscriptions`; alternatif cursor-poll
- [ ] MCP Event Adapter katmanı: MCP bildirimi → Deckent normalized event → policy/projector (Brain event modeliyle karışmaz)
- [ ] Client tarafı: `McpToolRegistry`'ye `ttlMs`/`cacheScope` desteği + Brain cache-override policy (server `public` dese bile policy `private`/`no-cache`'e indirger; tenant/authority/secret-dependency değerlendirmesi)
- [ ] `deckent_nervous_subscribe` semantiğinin gerçek subscription'a bağlanması veya dürüst yeniden adlandırma
- **DoD:** Yeni primitive'ler gerçek-binary kanıtla; execution identity MCP'den tamamen bağımsız kalır (zaten öyle — regression koru).

### P3 — Sınır kararları (tetikleyici: HTTP transport gündemi) — M
- [ ] Writer-lease'in multi-session/multi-instance modeli (PID → authority-scope'lu lease)
- [ ] Explicit state-handle governance: handle → execution checkpoint bağlama, secret-gibi koruma, tenant/authority scope sınırı, retry-yeniden-kullanılabilirlik bilgisi, evidence ledger'a hash/referans
- [ ] HTTP transport kararı (bugün stdio-only; stdio yeni spec'te korunuyor)
- **DoD:** Karar ADR'de; HTTP açılırsa conformance matrisi HTTP kolonlarıyla genişler.

## 4. Zamanlama ve ilkeler

- **Panik yok:** 12-ay deprecation penceresi + SDK geriye-uyumluluk taahhütleri. v2 SDK geçişi 2026 Q4 – 2027 Q1 ufku.
- **P0 hemen yapılabilir** — spec'ten bağımsız, bugünkü üründe canlı-izleme kanalını onarır.
- **Değişmez ilke:** *MCP adapter is disposable; Deckent execution state is durable.* Execution ID'leri (`sprint_id`, `task_id`, `execution_id`, `attempt_id`) hiçbir zaman MCP session/handle'ından türetilmez.
- 3 Yasa uyumu: dual-lens (dogfood + end-user MCP tüketicileri), every-environment (stdio + gelecek HTTP, tüm platform adapter'ları), no-MVP (conformance matrisi tam, kısmi geçiş yok).

## 5. Kaynaklar

- [MCP 2026-07-28 RC duyurusu](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/)
- [Spec draft changelog](https://modelcontextprotocol.io/specification/draft/changelog)
- [TS SDK v2 migration: support-2026-07-28](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/support-2026-07-28.md)
- [TS SDK v2 docs](https://ts.sdk.modelcontextprotocol.io/v2/) · [SDK Betas duyurusu](https://blog.modelcontextprotocol.io/posts/sdk-betas-2026-07-28/)
- [GitHub MCP Server changelog](https://github.blog/changelog/2026-07-23-github-mcp-server-supports-the-next-mcp-specification/)
- [Spec releases](https://github.com/modelcontextprotocol/modelcontextprotocol/releases) · [Python SDK releases](https://github.com/modelcontextprotocol/python-sdk/releases)
