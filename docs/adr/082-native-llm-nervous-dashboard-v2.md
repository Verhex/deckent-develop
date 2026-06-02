# ADR-082: Native-LLM-Wire + Nervous-Activation + Dashboard-v2 Canlı

**Status:** accepted

**Date:** 2026-06-02

**Accepted:** Sprint 220

---

## Context

### Native REPL Gerçek LLM'e Bağlı Değildi

Sprint 219 sonunda `deckent` argümansız çalıştırıldığında REPL açılıyordu (ADR-081, 219-001) ama gerçek bir LLM cevabı dönmüyordu. `createSubscriptionChatAdapter` (chat-native.ts) mevcut olmasına rağmen REPL başlatılırken bu adapter kullanılmıyordu — "provider not yet wired" uyarısı dönüyordu. Kullanıcı deneyimi: REPL açılır, mesaj yazılır, cevap gelmez.

**Kök neden:** `entry.ts` native REPL launch kodu provider resolve etmeden başlatıyordu; adapter sadece chat subcommand'ında aktifti.

### Chat Provider Config-Driven Değildi

Kullanıcı `deckent` REPL için farklı bir provider seçmek istediğinde (örn. Brain=opus ama REPL=ollama-local) bunu konfigürasyon üzerinden yapamıyordu. Provider seçimi hard-coded veya Brain provider'ına bağlıydı. `chat_provider` config key yoktu.

### Nervous System Dormant Kalıyordu

ADR-040 Nervous System mimarisi mevcut; observer, decision-engine, proposer, dispatcher zinciri kodda var. Ancak `.deckent/config.json`'da `nervous_system.enabled: false` olduğundan sistem hiç başlatılmıyordu. `createNervousSystemIfEnabled` bootstrap fonksiyonu da mevcut değildi — sprint-controller nervous'u kendi başlatamıyordu.

**Etki:** ORPHAN_TASK_ARCHIVE, STALE_LOCK_RELEASE gibi proaktif düzeltici aksiyonlar hiç çalışmıyordu.

### Dashboard Worker Grid Statik ve Status Stale

Sprint 219 sonrası dashboard eksiklikleri (run-verify bulguları):
1. **Worker grid sabit-6:** İlk 6 worker yüklenir, sonraki spawn/done değişimleri yansımaz
2. **Status sayfası stale:** Done olan işler hâlâ "working" gösterilir; faz göstergesi gerçek zamanlı değil
3. **Chat hollow:** ChatPage sadece status cevabı verir, gerçek round-trip yok
4. **Tech-debt filtre yok:** Debt sayfası çok uzun, sprint/severity/status filtresi yok
5. **Coverage takibi yok:** History sayfasında coverage her zaman 0%
6. **Enterprise auth-wire eksik:** EnterprisePage API-token olmadan boş veri gösterir
7. **Alert SPAM:** "CLAUDE.md güncellenmedi" uyarısı sürekli tekrarlanır ve claude-only

---

## Decision

Sprint 220 bu boşlukların tamamını kapattı:

### DALGA A — Native REPL Gerçekten Konuşsun

**220-001:** `src/core/config.ts` → yeni opsiyonel `chat_provider` config key eklendi (schema + default undefined). `src/cli/entry.ts` → native REPL başlatılırken `config.chat_provider ?? config.brain_provider ?? 'claude'` fallback zinciri ile provider resolve edilir; `createSubscriptionChatAdapter` doğru provider ile çağrılır. "provider not yet wired" kaldırıldı. Provider yoksa net hata döner.

**220-002:** `src/cli/commands/chat.ts` → `--native` + `--once` / `--message <text>` flag eklendi. Headless/script kullanım desteği.

**220-003:** `src/cli/commands/chat-native.ts` → `classifyAgenticIntent` + `dispatchAgenticIntent` REPL loop'una bağlandı. Kullanıcı mesajı agentic intent ise dispatch + onay; değilse provider'a yönlendirilir.

### DALGA B — Dashboard Tam-Canlı

**220-004:** `WorkerGrid.tsx` → SSE/`useLiveData` hook ile worker listesi real-time; sabit-limit kaldırıldı.

**220-005:** `StatusPage.tsx` → task durumu (done/working/no_go) gerçek zamanlı; faz göstergesi doğru.

**220-006:** `RefreshButton.tsx` → manuel refetch + 10s cooldown (disabled+geri-sayım). Sürekli poll yerine user-tetikli.

**220-007:** `ChatPage.tsx` → `/api/chat` gerçek round-trip + akan cevap (SSE stream-client). Bearer token ile auth.

### DALGA C — Dashboard Polish

**220-008:** `src/api/coverage-endpoint.ts` → sprint coverage memory.db/result'lardan okunur, `/api/coverage` endpoint; server.ts wire.

**220-009:** `DebtPage.tsx` → sprint/severity/status filtre dropdown + arama.

**220-010:** `EnterprisePage.tsx` → Bearer token ile F4 endpoint auth-wire; alerts dedup (sürekli değil, sonda tek uyarı) + provider-neutral (CLAUDE/GEMINI/AGENTS hepsi).

### DALGA D — Nervous Activation (Faz-1)

**220-011:** `src/nervous/bootstrap.ts` → `createNervousSystemIfEnabled(config, root, stateProvider)`: config enabled ise observer+decision+proposer+dispatcher+executor+history zincirini kurar + pipeline wire; değilse null. Sprint-controller config-gated bootstrap'ı çağırır.

**220-012:** `src/nervous/action-handlers.ts` → 8 low-risk handler: `ORPHAN_TASK_ARCHIVE`, `STALE_LOCK_RELEASE`, `DEAD_EVENT_STREAM_CLEANUP`, `DEBT_TRENDING_REPORT` ve diğerleri. Executor'a bağlı; gerçek operasyon.

**220-013:** `.deckent/config.json` → `nervous_system.enabled: true`, `mode: balanced`.

### Provider-Free Mimarisi Korundu

Config-driven provider resolve `claude` default tutar; kullanıcı `chat_provider: ollama-local` ile yerel modele geçebilir. ADR-010 ve ADR-066 provider-independence korundu.

---

## Consequences

### Olumlu

- **`deckent` gerçekten konuşur:** REPL → gerçek LLM cevabı. "provider not wired" artık yok.
- **Config-driven esneklik:** Brain=opus, REPL=ollama-local senaryosu tek config key ile.
- **Nervous Faz-1 aktif:** ORPHAN_TASK_ARCHIVE, STALE_LOCK_RELEASE aksiyonları çalışır; proaktif sistem bakımı başladı.
- **Dashboard tam-canlı:** Worker grid real-time, status doğru, chat wired, coverage takip, debt filtreli, enterprise auth'lu, alert deduplu.
- **ADR-040 gerçeğe taşındı:** Nervous mimarisi kağıt üzerinden aktif sisteme geçti.

### Olumsuz / Sınırlamalar

- **`chat --native --once` hermetic test sınırı:** Gerçek LLM cevabı CI'da test edilemez (API key). Mock adapter ile test yapılır; Tier-1 Smoke gerçek binary ile.
- **Nervous Faz-1 = low-risk only:** Yüksek-riskli aksiyonlar (sprint kill, dosya yazma) onay kapısı arkasında; Faz-2'ye ertelendi.
- **OllamaAdapter entegrasyonu:** `chat_provider: ollama-local` config desteği var ancak yerel model yüklü olmayan ortamlarda fallback gerekir.
- **dashboard canlı-test sınırı:** SSE-based real-time testler mock SSE ile doğrulandı; gerçek sunucu e2e Smoke gate.

---

## Alternatives Considered

### Claude Hard-Code (Native REPL)

`entry.ts`'de provider'ı claude olarak hard-code etmek kolaydı. Reddedildi: ADR-066 (Provider Independence) + ADR-010 ihlali; kullanıcı yerel model kullanamaz.

### Nervous Tam Otonom (Faz-1 yerine)

Tüm aksiyonları onaysız çalıştırmak. Reddedildi: ADR-040 opt-in prensibi + yüksek-risk aksiyonlarda `feedback_deckent_kill_approval_required` — insan onayı zorunlu.

### Dashboard Polling (SSE yerine)

30s interval polling ile dashboard güncellemesi. Reddedildi: ADR-080 god-level dashboard = native hız, sıfır freeze; SSE `use-live-data.ts` Sprint 218'de landed.

### Dashboard Alert Tüm-Provider Uyarısı Kaldır

Alerts tamamen kaldırmak yerine dedup seçildi: provider-neutral tek uyarı daha az SPAM, daha fazla bilgi.

---

## References

- Sprint 220 — feat: Native-LLM-Wire + Nervous-Activation + Dashboard-v2
- ADR-081 — Native Agentic Deckent (REPL kabuk — Sprint 219)
- ADR-040 — Nervous System Architecture (opt-in, proactive meta-orchestrator)
- ADR-066 — Provider Independence (multi-provider backend parity)
- ADR-080 — Dashboard God-Level (SSE, live data, chat round-trip)
- `src/cli/entry.ts` — `chat_provider ?? brain_provider ?? 'claude'` fallback chain
- `src/nervous/bootstrap.ts` — `createNervousSystemIfEnabled`
- `src/dashboard/src/components/WorkerGrid.tsx` — SSE real-time worker list
- Memory: `project_dashboard_realrun_findings` — 11-madde dashboard run-verify bulguları
