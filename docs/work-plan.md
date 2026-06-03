# İş Planı — deckent (kapsamlı analiz çıktısı)

> Bu belge, REPL/native-parity dışı kalan, kod-analizi ile doğrulanmış iş kalemlerini
> toplar. **Tasarım oluşturma hariç** (Decko mascot/logo Claude design ürününde üretiliyor);
> tasarımın **kod tarafı wire'ı** dahildir. Her kalem distinct `filesWrite` → paralel-güvenli.
> Format DIRECTIVES uyumlu (effort/skills/files/kanıt/smoke) — doğrudan sprint'e bölünebilir.
>
> Kaynak: Sprint 224 sonrası dogfood analizi (feature-manifest audit + models.dev wiring audit
> + backend/identity inceleme). Ölçüt: ADR-079 Proof-of-Function, ADR-037 RBAC, hermetik test.

---

## A) Brand / Identity — kod tarafı wire

### A1 — Brand foundation (tek kaynak palet + Decko ASCII)
- **Effort:** normal · **Skills:** typescript-expert, frontend-design
- **Files:** `src/core/brand.ts` (yeni), `src/cli/helpers/theme.ts`, `src/cli/commands/splash.ts`, `src/cli/commands/chat-banner.ts`, `src/dashboard/src/index.css`, `src/dashboard/src/lib/theme.ts`
- **Problem:** Brand rengi terminal'de 3 yerde dağınık tanımlı; web tamamen nötr-zinc, brand rengi hiç yok.
- **Çözüm:** Kanonik palet (`#4DB8A4` teal / `#C4A855` gold / `#1A1A1A` dark / `#F5F5F0` light) + Decko ASCII `brand.ts`'te tek kaynak. Terminal 3 tanımı + web `@theme`/`lib/theme.ts` bundan türesin.
- **Kanıt:** `grep -c "4DB8A4\|brand" src/core/brand.ts` → ≥2; tüketiciler import eder.
- **Not:** Tasarım çıktısı (PNG/SVG/ASCII) Claude design'dan gelince `src/dashboard/public/` + splash'a yerleşir. Bu iş kodu paletten önce başlayabilir (palet sabit).

---

## B) Backend & Platform

### B1 — Windows backend desteği
- **Effort:** normal · **Skills:** typescript-expert
- **Files:** `src/orchestra/spawn-backend.ts`, `src/orchestra/spawn-backend-docker.ts`, `tests/orchestra/windows-backend.test.ts`
- **Problem:** `resolveBackend` (`spawn-backend.ts:254`) Windows dalı yok; docker `sleep` (`spawn-backend-docker.ts:790`) POSIX'e bağlı.
- **Çözüm:** `win32 → subprocess` dalı; `sleep`→Node timer. Backend kontratı (4 metot) değişmez, yeni araç yok.
- **Kanıt:** `grep -c "win32\|platform" src/orchestra/spawn-backend.ts` → ≥1; hermetik test (platform mock).

### B2 — Docker live-monitor (uykudaki primitive wire)
- **Effort:** high · **Skills:** typescript-expert, devops-engineer
- **Files:** `src/orchestra/output-collector.ts`, `src/orchestra/output-stream.ts`, `src/api/server.ts`, `src/cli/commands/watch.ts`, `src/dashboard/src/components/WorkerCard.tsx`
- **Problem:** Docker çıktısı `logs --tail` (snapshot) — canlı akış yok; `output-stream` SSE `server.ts`'e mount edilmemiş.
- **Çözüm:** docker `logs -f` follow; SSE'yi `server.ts`'e mount; `watch --follow` docker dalı; web `WorkerCard` fan-out.
- **Kanıt (Tier-1 Smoke):** `node dist/cli/entry.js watch --follow` docker worker'da canlı satır akıtır.

---

## C) Model Sistemi — models.dev native wire

### C1 — models.dev → routing/provider gerçek wire ⭐
- **Effort:** high · **Skills:** typescript-expert
- **Files:** `src/core/task-types.ts`, `src/providers/claude.ts`, `src/providers/codex.ts`, `src/providers/gemini.ts`, `tests/core/models-dev-wire.test.ts`
- **Problem:** models.dev çekiliyor + registry Map güncelleniyor **ama** `PROVIDER_MODEL_MAP` (`task-types.ts:39`) modül-yükleme anında **statik** hesaplanıyor; `bootstrapFromCatalog()` (`entry.ts:845`) sonradan çalıştığı için harita tazelenmez. Adapter'lar (`codex.ts:89` `isOpenAIModel`) statik snapshot'a bakıp yeni modeli **reddeder**. → Builtin-13 dışı her model provider-selection yolunda ölü kod.
- **Çözüm (Opsiyon A — önerilen):** `PROVIDER_MODEL_MAP` statik→**dinamik** (fonksiyon/getter, her okumada `modelRegistry.getByProvider()` canlı sorgu). Adapter'lar `spawn()` anında registry'den okusun (modül-yükleme snapshot'ı değil). Type-guard'ları (`OpenAIModel`/`ClaudeModel`/`GeminiModel`) registry-lookup'a gevşet.
- **Kanıt (Smoke):** models.dev'de var olan **builtin-dışı** bir model id ile task spawn → **reddedilmez**, doğru provider'a router'lanır.

---

## D) Dormant Feature Aktivasyonu

> feature-manifest audit: 30 özellik (16 aktif, 4 az-kullanılan, 8 dormant, 2 ölü).
> Manifest: `.deckent/features-manifest.json` (gen: `scripts/sync-manifest.mjs`).

### D1 — handoff-protocol wire (0-caller → bağımlılık-zinciri)
- **Effort:** normal · **Skills:** typescript-expert
- **Files:** `src/orchestra/handoff-protocol.ts`, `src/orchestra/sprint-controller.ts` (veya sprint-phases wire), `tests/orchestra/handoff-wire.test.ts`
- **Problem:** `HandoffProtocol` (`handoff-protocol.ts:18`) export var, **0-caller**. Task→task artifact aktarımı için tasarlanmış, hiç wire değil.
- **Çözüm:** Bağımlılık-zincirli wave geçişinde (A→B) A'nın çıktı artifact'ini B'ye handoff. EXECUTE/WAVE_BUILD'e wire.
- **Kanıt:** `grep -c "HandoffProtocol\|handoff" src/orchestra/sprint-controller.ts` → ≥1 (çağrı).

### D2 — shared-memory wire (worker↔worker)
- **Effort:** normal · **Skills:** typescript-expert
- **Files:** `src/orchestra/shared-memory.ts`, wire noktası (spawn/worker context), `tests/orchestra/shared-memory-wire.test.ts`
- **Problem:** `SharedMemory` (`shared-memory.ts:16`) 0-caller; `errors.ts` referans verir ama hiç construct edilmez.
- **Çözüm:** Aynı sprint worker'ları için paylaşımlı veri alanı (read-mostly) wire. D1 ile birlikte değerlendirilebilir (ortak tema: worker-arası veri).

### D3 — heartbeat-daemon → sprint-controller wire
- **Effort:** normal · **Skills:** typescript-expert
- **Files:** `src/orchestra/heartbeat-daemon.ts`, `src/orchestra/sprint-controller.ts`, `tests/orchestra/heartbeat-daemon-wire.test.ts`
- **Problem:** CLI (`deckent heartbeat`) var ama sprint-controller'a wire değil — manuel invocation.
- **Çözüm:** SPAWN'da daemon otomatik başlat, CLEANUP'ta durdur (opt-out config'li).
- **Kanıt:** `grep -c "heartbeatDaemon\|HeartbeatDaemon" src/orchestra/sprint-controller.ts` → ≥1.

### D4 — ecosystem-intelligence → routing tüketimi
- **Effort:** normal · **Skills:** typescript-expert
- **Files:** `src/orchestra/ecosystem-intelligence.ts`, `src/core/routing-engine.ts`, `tests/core/ecosystem-routing.test.ts`
- **Problem:** Analiz üretiliyor (`deckent skill add`) ama **routing-engine tüketmiyor** — çıktı dead-end.
- **Çözüm:** Ecosystem analiz çıktısını routing skill→agent affinity sinyaline besle.

### D5 — multi-agent pipeline export tekilleştir
- **Effort:** low · **Skills:** typescript-expert, refactorer
- **Files:** `src/orchestra/multi-agent.ts`, `src/nervous/bootstrap.ts`, `tests/orchestra/multi-agent-pipeline.test.ts`
- **Problem:** `multi-agent.ts:75` `runPipeline()` export 0-caller; `nervous/bootstrap.ts`'te **ayrı kopya** kullanılıyor (duplikasyon).
- **Çözüm:** Tek kanonik `runPipeline` — bootstrap onu import etsin; kullanılacaksa wire et, yoksa ölü export'u kaldır.

### D6 — self-modifying-detector enforcement (opt-in → default değerlendirmesi)
- **Effort:** low · **Skills:** typescript-expert, security-specialist
- **Files:** `src/orchestra/self-modifying-detector.ts`, config wire, `tests/orchestra/self-mod-enforce.test.ts`
- **Problem:** Tespit aktif, enforcement opt-in (ADR-039 dogfood-vs-user ayrımı korunmalı).
- **Çözüm:** User-project'lerde **flag-gated** enforcement; deckent-dev'de bilinçli advisory. **Riskli — flag-gated, doğrula-sonra-default.**

> **Bilinçli opt-in kalan dormant'lar (zorunlu iş değil, farkındalık kaydı):**
> - **managed-docs** — opt-in `.deckent/docs.json` ister; tasarım gereği.
> - **nervous-system** — Sprint 224'te `/nervous` wire + güvenli re-enable ile ele alınıyor.

---

## E) Dead Code Disposition (ADR-038 tarzı)

### E1 — Ölü modül temizliği / arşiv
- **Effort:** low · **Skills:** refactorer
- **Files:** `src/orchestra/` (decision-orchestrator-v1, parallel-pipeline-manager-standalone), ilgili testler
- **Problem:** `decision-orchestrator-v1` (@deprecated Sprint 066 → routing-engine-v2) ve `parallel-pipeline-manager-standalone` (→ dependency-scheduler) ölü.
- **Çözüm:** 0-caller doğrula → kaldır veya `archive/`'e taşı + ADR-038'e disposition kaydı. **Karar gerektirir** (sil vs arşivle).

---

## Özet tablo

| # | İş | Tema | Effort | Risk |
|---|---|---|--------|------|
| A1 | Brand foundation (palet tek-kaynak) | Identity | normal | düşük |
| B1 | Windows backend | Platform | normal | düşük |
| B2 | Docker live-monitor | Platform | high | orta |
| C1 | models.dev native wire ⭐ | Model | high | orta |
| D1 | handoff-protocol wire | Dormant | normal | orta |
| D2 | shared-memory wire | Dormant | normal | orta |
| D3 | heartbeat-daemon wire | Dormant | normal | düşük |
| D4 | ecosystem→routing | Dormant | normal | düşük |
| D5 | multi-agent pipeline tekilleştir | Dormant | low | düşük |
| D6 | self-mod enforcement | Dormant | low | flag-gated |
| E1 | ölü kod disposition | Cleanup | low | karar |

**Sıra önerisi:** A1 + B1 (izole, hızlı kazanç) → C1 (model, yüksek değer) → D1+D2 (worker-arası veri, birlikte) → D3/D4/D5 → B2 → D6/E1 (karar/flag gerektiren). Hepsi distinct dosya → paralel verilebilir; tek çakışma **B2↔A1** (`WorkerCard`/dashboard) — sıralı tut.

## Ortak kurallar (her kalem için)
- **RUN-VERIFY (ADR-079):** kanıt çağıran-dosyada (def dışla); user-surface task → `Smoke:` run-proven. Mock-only = GO_WITH_TECH_DEBT.
- **HERMETIK:** tmpdir + sandbox HOME, async spawn (spawnSync YASAK), `npm run test:ci-sim`. CI yeşil korunur.
- **ESM `.js`** uzantısı zorunlu. ≤200 LoC/task tercih, YENİ test dosyası, sadece kendi `filesWrite`'ına yaz (paralel-güvenlik).
