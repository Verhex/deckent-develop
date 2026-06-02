# ADR-081: Native Agentic Deckent — `deckent` argümansız REPL + Agentic Tool-Use + F2 Streaming + Agentic-OS Direction

**Status:** accepted

**Date:** 2026-06-02

**Accepted:** Sprint 219

---

## Context

### `deckent` Argümansız Sadece Help Gösteriyordu

Sprint 219 öncesinde `deckent` komutu argümansız çalıştırıldığında Commander.js'in default davranışı devreye giriyor ve help metni yazdırılıyordu. `deckent chat --native` komutu (`runChatNativeLoop`) mevcut olmasına rağmen kullanıcı doğrudan `deckent` yazarak agentic REPL başlatamıyordu.

Hedef: `claude` komutunun davranışını model almak — argümansız `deckent` → native conversational agentic REPL açılır.

### F2 Streaming "Post-Beta" Olarak Ertelenmiş Durumda

MASTER-PLAN §4 F2-007 (`Streaming live`) durumu `⚠️ in-progress` idi. Path A embedded chat backend (`chat-backend.ts`) mevcut olmasına rağmen gerçek token-streaming (SSE/chunk-by-chunk) yoktu — cevap tek parça geliyordu. Kullanıcı deneyimi `claude` kalitesinin altındaydı.

### Agentic Tool-Use Eksikliği

REPL doğal dil → deckent aksiyonu (status/history/recall) dönüştürme mekanizması yoktu. Kullanıcı "sprint durumu ne?" diyemiyordu — komut satırı subcommand'larını bilmek zorunluydu.

### Onay Kapısı Yoktu

Riskli aksiyonlar (sprint start/kill, dosya yazma) için REPL'de kullanıcı onayı istenmiyor; doğrudan çalıştırılıyordu. Bu, `feedback_deckent_kill_approval_required` ruhuna aykırı.

### Agentic-OS Vizyonu Temel Altyapıdan Yoksundu

ADR-042 (Hybrid Mode), ADR-040 (Nervous System) ve F3 Process Mode parçalar halinde mevcuttu; ancak yetki-sınırlı sürekli otonom mod iskelet bile yoktu.

---

## Decision

Sprint 219 yedi dalgada bu boşlukları kapattı:

### DALGA A — Native REPL (219-001, 219-002, 219-003)

**219-001:** `src/cli/entry.ts` güncellendi. `shouldLaunchDefaultRepl(argv)` ve `buildEntryArgv(argv)` yardımcıları eklendi. Bare `deckent` → `deckent chat --native` yönlendirmesi. `--help`/`--version`/subcommand token'ları korunur. TTY değilse graceful.

**219-002:** `runChatNativeLoop` gerçek ProviderAdapter ile mesaj→cevap round-trip'i run-proven olarak doğrulandı. Mock adapter test, prod gerçek. `--once` flag eklendi.

**219-003:** `chat-repl-ux.ts` — readline tabanlı REPL yardımcıları: prompt göstergesi, up/down geçmiş (ring buffer), çok-satır giriş, `/exit` `/clear`, Ctrl-C graceful.

### DALGA B — Agentic Tool-Use (219-004, 219-005, 219-006)

**219-004:** `chat-agentic-dispatch.ts` — doğal dil → deckent MCP aksiyonu eşleme (status/history/recall/plan intent). `McpToolDispatcher` ile çalıştırma. Sonuç REPL'e dön.

**219-005:** `agentic-confirm.ts` — riskli aksiyon sınıflandırma (start/kill/cleanup/write → confirm; status/recall/history → otomatik). y/N prompt. REPL dispatch entegrasyonu.

**219-006:** `agentic-session.ts` — REPL oturumu `memory.db`'ye persist (`ChatTurn`, sessionId). `deckent` tekrar açılınca son oturum resume.

### DALGA C — F2 Streaming (219-007, 219-008)

**219-007:** `src/api/chat-stream.ts` — `streamChatMessage(message, adapter, opts?)`: provider stream chunk'larını `AsyncGenerator<ChatStreamEvent>` olarak yayar. `chunk` event'leri token-by-token, `done` event ile tamamlanır. `adapter.stream` yoksa `adapter.send` fallback. `src/api/server.ts` `/api/chat/stream` SSE endpoint'e wired.

**219-008:** `src/dashboard/src/lib/chat-stream-client.ts` — `/api/chat/stream` SSE tüketir, token'ları akarak ChatPage'de render eder. EventSource + Bearer token auth.

### DALGA D — Dashboard Kalıcı-Fix (219-009, 219-010)

**219-009:** `Sidebar.tsx` `navItems` tek-kaynak export; `Layout.tsx` import eder. Dashboard nav duplikasyonu kaldırıldı. RENDER-based test (gerçek React render → 10 link DOM'da assert).

**219-010:** `dashboard-e2e-smoke.mjs` — cache-bust header doğrulama + bundle hash güncellik + nav link sayısı.

### DALGA E — Dokümanlar (219-011, 219-012)

**219-011:** `docs/MASTER-PLAN-TR.md` — Türkçe vizyon/durum dokümanı.

**219-012:** Bu ADR + MASTER-PLAN status güncellemesi.

### DALGA F — Kimlik + Otonom (219-013, 219-014)

**219-013:** `docs/vision/blueprint.md` baştan-aşağı güncellendi (Sprint 219+ güncel mimari, open source for open world, otonom vizyon).

**219-014:** `src/orchestra/autonomous-runtime.ts` — `runAutonomousCycle(config)` iskeleti: trigger (F3 scheduled + nervous) → RBAC (ADR-037) + onay-kapısı → audit. Gerçek ERP write değil, read-first + öneri + onaylı çalıştırma.

### DALGA G — Plan-Akış Wire-Gap (219-015, 219-016)

**219-015:** `task-router.ts` agent ataması `routeTaskV2`'ye güncellendi (getUserSurfaceBonus + domain-bonus). Surface task'lar artık doğru agent'a (api-builder/frontend-designer) gidiyor.

**219-016:** `task-builder.ts` `plannerTaskToParams` — `smoke` alanını ParsedDirectiveTask'tan task JSON'a propagate. Proof-of-Function gate artık Smoke input'a sahip.

---

## Consequences

**Positive:**

- `deckent` argümansız çalıştırıldığında native conversational agentic REPL açılır — `claude` deneyimine eşdeğer.
- Doğal dil → deckent aksiyonu: "sprint durumu ne?" → `deckent_status` dispatch.
- Token-streaming ile cevap akan biçimde gelir; kullanıcı bitmesini beklemez.
- Riskli aksiyonlar onay kapısından geçer; güvenli aksiyonlar anında çalışır.
- REPL oturumları persist — kapayıp açınca bağlam korunur.
- Dashboard nav tek-kaynak: duplikasyon giderildi, 8 sayfa daima senkron.
- F2-007 `⚠️ in-progress` → `✅ DONE`.
- Routing surface-bonus: cli/commands/→api-builder, dashboard/→frontend-designer.
- Smoke alanı plan JSON'da dolu → Proof-of-Function gate gerçek input alıyor.

**Negative / Tradeoffs:**

- `/api/chat/stream` SSE endpoint gerektirir; eski `EventSource` desteklemeyen ortamlarda fallback yok (post-beta).
- Streaming REPL render, non-streaming UI'a göre daha karmaşık state yönetimi gerektirir.
- Agentic dispatch intent eşleme kural tabanlı (Sprint 219); ML-tabanlı sınıflandırma post-beta.
- `autonomous-runtime.ts` iskelet; gerçek runtime wire Sprint 220.

---

## Alternatives Considered

- **`deckent` argümansız → help yerine interactive mode** — yalnızca bir interaktif menü. Reddedildi: `claude` modeli tercih edildi; REPL hem conversational hem agentic.

- **WebSocket streaming yerine SSE** — çift-yönlü bağlantı, daha düşük overhead. Reddedildi: ADR-062 embedded terminal zaten WS kullanıyor; chat stream unidirectional (server→client); SSE daha basit, no-upgrade required, EventSource nativeDir.

- **REPL'de tam MCP client** (F9-001 extern MCP tüketim) — daha güçlü. Reddedildi: F9 scope ötesi, post-beta. Mevcut `deckent_*` tool'ları McpToolDispatcher aracılığıyla yeterli.

- **Onay kapısı olmaksızın agentic dispatch** — kullanıcı deneyimi daha akıcı. Reddedildi: `feedback_deckent_kill_approval_required` — riskli aksiyonlar için onay zorunlu.

---

## References

- Sprint 219 — Native Agentic Deckent implementation
- `src/cli/entry.ts` — `shouldLaunchDefaultRepl`, `buildEntryArgv` (219-001)
- `src/cli/commands/chat-native.ts` — `runChatNativeLoop` round-trip (219-002)
- `src/cli/commands/chat-repl-ux.ts` — REPL UX god-level (219-003)
- `src/cli/commands/chat-agentic-dispatch.ts` — doğal dil → MCP aksiyon (219-004)
- `src/cli/commands/agentic-confirm.ts` — riskli aksiyon onay kapısı (219-005)
- `src/cli/commands/agentic-session.ts` — REPL oturum persist (219-006)
- `src/api/chat-stream.ts` — `streamChatMessage` + `/api/chat/stream` SSE (219-007)
- `src/dashboard/src/lib/chat-stream-client.ts` — SSE tüketim + akan render (219-008)
- `src/orchestra/autonomous-runtime.ts` — `runAutonomousCycle` iskelet (219-014)
- `src/orchestra/task-router.ts` — routeTaskV2 wire (219-015)
- `src/orchestra/task-builder.ts` — Smoke field propagation (219-016)
- ADR-040 — Nervous System Architecture (onay kapısı entegrasyonu)
- ADR-042 — Hybrid Mode Architecture (Sprint + Task Dual Modes)
- ADR-074 — Native Chat Real Round-Trip (antecedent)
- ADR-079 — Proof-of-Function DoD (Smoke gate)
- ADR-080 — Dashboard God-Level (antecedent — 8-page + Sprint-Start Detach)
- `feedback_wiring_pct_vs_user_working` — wired ≠ çalışıyor
- `feedback_proof_of_function_dod` — Smoke gate (gerçek-koşu)
- `project_deckent_runtime_ecosystem` — agentic os + native
