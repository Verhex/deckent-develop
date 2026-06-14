# deckent — Son Sprint Kazanımları (Sprint 270–285)

> Platform sağlamlaştırma, gerçek zamanlı dashboard, native REPL evolution, enterprise auth, ve worker-comms: deckent'in "agentic run ecosystem" yolundaki en güncel adımları.

## Özet

| Sprint Grubu | Ana Tema | Öne Çıkan Kazanımlar |
|---|---|---|
| **270–271** | Yayın hazırlığı + kaynak izleme | validate-publish, npm pack smoke, doctor auth-probe, resource-monitor, deckent resources CLI |
| **272–274** | Sağlamlık + token ekonomisi | GHOST-FINALIZE fix, F1-LIM kind-based Docker limit, limit-ledger, cache-warm spawn |
| **275–276** | MCP parite + plan zekası | deckent_usage MCP tool (34. araç), /usage /resources REPL slash, directive-interrogator, cross-verify |
| **277–278** | Enterprise auth + worker comms | OIDC PKCE flow, /api/auth/me, SharedMemory bridge, handoff-notes, cross-verify dispatch |
| **279–280** | Nervous + REPL + observability | panic-gate wire, docker live-monitor, REPL /mcp broker wire, PROGRESS event channel |
| **281–283** | Mimari denetim + dashboard olgunlaştırma | adversarial red-team, POST /api/chat, nav tek-kaynak, alert-dedup, DebtPage, i18n |
| **284–285** | Gerçek zamanlı dashboard + REPL UX | canlı-olay köprüsü, worker-log SSE, tool kuyruğu + onay (Ink), stream sağlamlığı |

---

## 1. Yayın Hazırlığı + Kaynak İzleme (Sprint 270–271)

**Sprint 270 — npm publish gate + provider-auth probe**

- `validate-publish` güçlendirme: exec-bit + dashboard-bundle assertion'ları eklendi
- Hermetic npm pack smoke: paketten kurulan gerçek binary testi (4 test yeşil)
- `deckent doctor` auth-probe: "CLI var ama login DEĞİL" ayrımı (`probeProviderAuth`)
- F1-IMG: worker-image readiness denetim modülü + consent-based rebuild önerisi (ADR-063)

**Sprint 271 — Resource Monitor + `deckent resources` CLI**

- `createResourceMonitor`: docker stats örnekleyici → JSONL log
- `resource_monitor` config bloğu: `enabled/interval_ms` (config-types.ts)
- `deckent resources`: anlık snapshot + log özeti CLI komutu
- `docs/reference/resource-profile.md`: kod-türevli kaynak haritası oluşturuldu

**Kod:** `src/core/resource-monitor.ts` · `src/cli/commands/resources.ts` · `src/core/worker-image-check.ts`

---

## 2. Sağlamlık + Token Ekonomisi (Sprint 272–274)

**Sprint 272 — GHOST-FINALIZE fix + F1-LIM Docker limitleri**

- GHOST-FINALIZE root-fix: checkpoint artığı temizliği, `start`'ın dürüst davranışı
- dispatch-kuyruğu/EVALUATE yarışı: koşmamış task varken değerlendirme başlamaz (fix)
- F1-LIM faz-2a: task tipine göre Docker memory limiti (`kind=code → 1.5g`, `doc → 768m`)
- `provider-limit` tespit modülü + FIX ölü-limit guard'ı

**Sprint 273 — Limit Ledger + `deckent usage` CLI**

- `limit-ledger`: transcript parse + maliyet-eşdeğeri birim (`src/core/limit-ledger.ts`)
- `ledger session → task eşleme` + sprint agregasyonu (`limit-ledger-report.ts`)
- `deckent usage`: pencere + sprint görünümü CLI komutu
- sprint-reporter "limit-yakım" satırı: retro entegrasyonu
- `result-evaluator` tokenUsage hizalaması: beyan artık zorunlu değil

**Sprint 274 — Cache Warm Spawn (F1-TOK Faz 2)**

- `cache_warm` config bloğu: `CacheWarmConfig` (config-types.ts)
- Cache-warm spawn stratejisi: ilk worker yazar, fleet okur
- `ledger cache-gate`: sprint'in 2.+ worker'ları cache okuma doğrulaması

**Kod:** `src/core/limit-ledger.ts` · `src/core/limit-ledger-report.ts` · `src/cli/commands/usage.ts`

---

## 3. MCP Parite + Plan Zekası (Sprint 275–276)

**Sprint 275 — 34. MCP Aracı + REPL Slash'leri**

- `deckent_usage` MCP tool eklendi → **toplam 34 araç** (ADR-022 CLI/MCP paritesi)
- `/usage` + `/resources` REPL slash komutları (3-katman kuralı: REPL + CLI + MCP)
- `mcp-tools.md` regen: 34 araç doğrulandı

**Sprint 276 — Directive Interrogator + Cross-Verify**

- **PLAN-INT-1 directive-interrogator**: zorlayıcı soru üretimi + taslak öneri
- `interrogation config` + i18n soru sözlüğü (`PlanConfig` interface)
- `deckent plan --interrogate` CLI wire
- **XVER-1 cross-verify çekirdeği**: high-stakes tespit + farklı-provider seçimi
- `adversarial-refute` prompt builder + dispatch + eval advisory-wire
- cross-verify `outcome-tracker` beslemesi

**Kod:** `src/core/directive-interrogator.ts` · `src/core/cross-verify.ts`

---

## 4. Enterprise Auth + Worker Comms (Sprint 277–278)

**Sprint 277 — OIDC + Dashboard Auth**

- **`GET /api/auth/me`** endpoint: bearer'dan kimlik + rol (JWT/static ayrımı)
- `audit-actor` JWT sub'dan dinamik türetme: hardcoded 'local' fix
- **OIDC Authorization-Code + PKCE** tam akışı: `src/dashboard/src/lib/oidc-flow.ts`
- OIDC token-exchange backend endpoint (`POST /api/auth/oidc/exchange`)
- Dashboard wire: `AuthProvider` + `AuthStatus` + `LoginPage` + `CallbackPage` rotaları
- `useAuth` hook/context: dashboard auth-state SSOT
- `ManualTokenInput`: `api_oidc` modunda JWT test girişi
- JWKS RS256 signature doğrulama, alg:none saldırı koruması

**Sprint 278 — Worker Comms (SharedMemory + Handoff)**

- **COMM-1 SharedMemory**: worker'lar arası `sharedNotes` → `.result` + `SharedMemory` bridge
- `handoff-notes`: upstream worker → downstream worker prompt enjeksiyonu
- **Structured handoff protocol**: `Handoff` interface + `notes?: string` alanı
- `worker_comms` config bloğu (default-off); `buildWorkerCommsInstructionBlock()` prompt builder
- `deckent status` komutuna worker-comms görünürlük bölümü
- e2e comms flow testi: iki-worker shared+handoff round-trip smoke

**Kod:** `src/api/` (auth endpoints) · `src/core/shared-memory.ts` · `src/core/handoff-protocol.ts`

---

## 5. Nervous + REPL + Observability (Sprint 279–280)

**Sprint 279 — Panic-Gate + Docker Live-Monitor + Lucide Dashboard**

- **WK-nervous panic-gate wire**: `executor.ts` → `awaitPanicGateApproval` + `isLockedPanicAction`
- **WK-cost mid-sprint abort**: token-usage limit-ledger besleme
- **WK-7 auditor async-batch**: O(n) spawnSync → parallel async (liveness fix)
- **docker live-monitor**: output-stream PTY worker-attach + `watch --follow` (WK-5)
- **DASH-001**: `/api/kill/all` + autonomous SSE watch dashboard entegrasyonu
- **DASH-002**: sidebar bell pending-count badge (lucide, **EMOJI-yasak** — bkz. [21-dashboard-retheme](21-dashboard-retheme.md))
- Enterprise dashboard backend doğrulama: 4 sekme gerçek-veri testi (10 test)

**Sprint 280 — REPL /mcp Broker Wire + PROGRESS Channel**

- **REPL /mcp broker wire** (G1): `buildMcpBridge + McpClientBroker` → chat-native LIVE wire
- **PLANOBS-001 PROGRESS event channel**: `CHANNELS.PROGRESS` + `emitProgress` helper (`event-stream.ts`)
- `notify 'progress' + 'phase-change'` event tipleri (NotificationEventName union)
- **APPROVE-007b modifiedPayload**: IPC transport + executor consume
- REPL `/nervous edit`: `chat-nervous-bridge handleEdit` wiring

**Kod:** `src/nervous/executor.ts` · `src/core/event-stream.ts` · `src/mcp-client/broker.ts`

---

## 6. Mimari Denetim + Dashboard Olgunlaştırma (Sprint 281–283)

**Sprint 281 — Adversarial Mimari Denetim**

- **Mimari & eşzamanlılık doğruluğu denetimi** (281-001): tam orkestrasyon katmanı analizi
- **Adversarial kırmızı-takım** (281-002): "Tasarımı kır" denetimi
- **Ürün & User/Enterprise perspektifi** (281-003): kullanıcı-bakış açısı denetimi

**Sprint 282 — Dashboard Chat + Nav + Alert**

- **POST /api/chat adapter-backed** (DASH-UX-1): `resolveChatReply()` NL → adapter yönlendirme
- Stream-yolu kök-fix: auth-gate `queryTokenParam` (`src/api/server.ts:1179`)
- **Nav tek-kaynak**: `nav-items.ts` → 13 rota, 3 grup (Konuş/İzle/Yönet); `Layout.tsx` birleştirme
- **Alert-dedup** (DASH-UX-4): identity-based dedup + `×count` badge + cap-6 (stale-md spam bastırma)
- `chat-backend.ts` disposition: dormant modül + referanslar kaldırıldı (ADR-038)

**Sprint 283 — DebtPage + i18n + Layout Fix**

- **Terminal-bar overlap z-index fix**: `pb-10 relative z-50` → `Layout.tsx aside`
- **DebtPage route** + `/settings` yüzeyi: `App.tsx`'e `/debt` rotası eklendi
- **Dashboard i18n-temizliği**: `EvolutionPage`, `NervousPage`, `MemoryExplorerPage` literal → i18n-key

---

## 7. Gerçek Zamanlı Dashboard + REPL UX (Sprint 284–285)

**Sprint 284 — DASH-RT: Gerçek Zamanlı Köprü**

- **DASH-RT-1 canlı-olay köprüsü** (284-001): `hb + event-stream → /api/events` typed-push backend
- **Dashboard client anlık-merge** (284-002): snapshot üstüne SSE event-akışı (`useLiveData`)
- **Worker-log SSE endpoint** (284-003): backend-agnostik file-tail — run-proven
- **WorkersPage canlı log-paneli UI** (284-004): gerçek zamanlı log akışı
- **DASH-FIX-1** (284-005): terminal-sessions 401 + directives 404 — iki uç fix

**Sprint 285 — REPL Tool Kuyruğu + Onay**

- **Tur-içi tool-KUYRUĞU**: tek `confirmResolve` slot → FIFO confirm queue (Ink view layer)
- `chat-session.ts` `turnInput` fix: art arda gelen tüm tool mesajları toplanır (model HEPSİNİ görür)
- Stream-toplama sağlamlığı: prose-konum bağımsızlığı (H2 verdict)
- Enstrümante kök-teşhis: 3 hipotezi ayrıştır + 9 repro testi

**Kod:** `src/api/events.ts` · `src/dashboard/src/pages/WorkersPage.tsx` · `src/cli/chat-session.ts`

---

## Yol Haritası Bağlamı

Bu kazanımlar "tamamlanmış ürün = agentic run ecosystem" arkının parçası (MASTER-PLAN §4B Sub-System Map):

| Alt-Sistem | Durum |
|---|---|
| AS-6 Otonom | ✅ runtime + CLI canlı (Sprint 226-228) |
| AS-5 MCP-client | ✅ Faz 1 (Sprint 229) + REPL wire (Sprint 280) |
| Worker Comms (COMM-1) | ✅ SharedMemory + handoff + cross-verify (Sprint 278) |
| Enterprise Auth (F4) | ✅ OIDC + RBAC + /api/auth/me (Sprint 277) |
| Gerçek zamanlı dashboard (DASH-RT) | ✅ SSE köprüsü + worker-log (Sprint 284) |
| Native REPL agentic (ADR-081) | ✅ MCP wire + tool-kuyruk + approval (Sprint 280-285) |
| Resource isolation (F1-LIM) | ✅ kind-based Docker limit (Sprint 272) |
| Token economy (F1-TOK) | ✅ cache-warm + limit-ledger + usage (Sprint 273-275) |

İlgili: [[21-dashboard-retheme]] · MASTER-PLAN §4B/§4C/§4F · `docs/reference/api-surface.md`.
