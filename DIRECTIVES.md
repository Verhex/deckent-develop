# DIRECTIVES — Sprint 279: M-küme — Dashboard/Monitoring/Wire-Gaps

## Goal: M-küme (Alperen sırası: M ilk) — dashboard + monitoring + wire-gap kapanışı. Açık maddeler (kod-doğrulandı): WK-import (core→orchestra import-cycle, ADR-008 soft-ihlal), WK-nervous (panic-gate awaitPanicGateApproval 0-caller → spawn timeout), WK-cost (mid-sprint token-usage abort — billingMode zaten var F1-CB), WK-7 (auditor O(n) spawnSync → async-batch), DASH-001 (`/api/kill/all` + autonomous SSE watch), DASH-002 (sidebar bell pending-badge), WK-5-kalan (docker live-monitor PTY worker-attach + watch --follow), F7-004 (terminal hardening). Hepsi opt-in/additive/fail-safe; dashboard görsel = `docs/design/web-console` spec + lucide (EMOJI YASAK). MİKRO-TASK + DEPENDENCY + MODEL-KATMANLAMA (opus 2 · sonnet 7 · haiku 2).

## Ortak kurallar
- **TDD + hermetik:** önce RED; tmpdir + injectable fs/spawn; gerçek ağ/docker YASAK testlerde; spawnSync YASAK (kod-içinde de async spawn — WK-7 zaten bunu düzeltiyor).
- **Dashboard görsel:** `docs/design/web-console/README.md` spec'ine sadık; **lucide-react ikon, EMOJI YASAK** (no-emoji-guard testi var); status renk-semantiği korunur.
- **Davranış korunumu:** additive/opt-in; mevcut yeşil testler yeşil; default'lar değişmez.
- **i18n:** dashboard/CLI user-facing → getMessage (en+tr).
- **SSOT:** event-stream/audit/cost/nervous mevcut modüller — BAĞLA, yeniden yazma.
- **`.tasks/task-XXX.result` YAZ**; Kanıt komutlarını gerçekten koş.

---

## Task 1: WK-import — core→orchestra import-cycle çöz (ADR-008) (OPUS)
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: refactorer
- Skills: typescript-expert, testing-expert, system-architect
- Files: src/core/event-stream.ts, src/core/audit-writer.ts, src/core/audit-query.ts, src/orchestra/event-stream.ts, tests/core/event-stream-location.test.ts
- Scope: src/core/, src/orchestra/, tests/

### Description
ADR-008 soft-ihlal: `core/audit-writer.ts` + `core/audit-query.ts` `orchestra/event-stream.js`'ten import ediyor (core→orchestra ters bağımlılık). Kök çözüm: **event-stream'i `core/`'a taşı** (audit'in tükettiği `writeEvent`/`readEvents`/`DeckentEvent` core-seviye primitive — orchestra'ya ait değil). Adımlar: (1) `src/orchestra/event-stream.ts` içeriğini `src/core/event-stream.ts`'e taşı; (2) `orchestra/event-stream.ts`'i core'dan re-export shim yap (mevcut orchestra-tarafı importerları kırma — geri-uyum); (3) audit-writer/audit-query importlarını `../core/event-stream.js`'e çevir → cycle kalkar. ÖNCE event-stream'in başka core-importer'ı var mı + orchestra-importerları grep'le (hepsi shim'le çalışmalı). Davranış bayt-bayt aynı (saf taşıma). Testler: event-stream core'dan import edilebilir; audit core-only import; orchestra shim re-export çalışır; mevcut event-stream/audit testleri yeşil.

**Kanıt:** `npx vitest run tests/core/event-stream-location.test.ts` yeşil; `grep -c "orchestra/event-stream" src/core/audit-writer.ts src/core/audit-query.ts | awk -F: '{s+=$2} END{print s}'` = 0 (core artık orchestra'dan import etmiyor). **Test:** 6+.

---

## Task 2: WK-nervous — panic-gate timeout wire (0-caller → spawn yolu)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/nervous/executor.ts, tests/nervous/panic-gate-wire.test.ts
- Scope: src/nervous/, tests/nervous/

### Description
Kanıt: `src/nervous/panic-gate.ts` `awaitPanicGateApproval` (hard 10s timeout → auto-proceed, SAFETY_FLOOR excepted) MEVCUT ama 0-caller; `executor.ts handleApprove` timeout'suz Promise (sonsuza dek `deckent nervous accept` bekler → spawn'ı sonsuz blokeleyebilir). Fix: `executor.ts`'in approval-bekleme yolunu `awaitPanicGateApproval` ile sar — hard-timeout sonrası auto-proceed (SAFETY_FLOOR effect-class'ı muaf, o gerçekten bekler). ÖNCE executor'ın mevcut handleApprove/pendingApprovals yolunu izle (timeout'suz noktayı bul). Davranış: timeout'lu approval (bloke-sonsuz değil); SAFETY_FLOOR aksiyonları hâlâ insan-onayı bekler. Testler (fake timer): timeout→auto-proceed; SAFETY_FLOOR→bekler; erken-accept→hemen geçer.

**Kanıt:** `npx vitest run tests/nervous/panic-gate-wire.test.ts` yeşil; `grep -n "awaitPanicGateApproval" src/nervous/executor.ts` ≥ 1. **Test:** 6+.

---

## Task 3: WK-cost — mid-sprint token-usage abort (limit-ledger besleme)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/sprint-phases.ts, src/core/config-types.ts, src/core/config.ts, tests/orchestra/mid-sprint-cost-abort.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description
Bugün cost-gate yalnız pre-spawn (start.ts billingMode var, F1-CB); mid-sprint kontrol YOK (TokenSpikeDetector sadece RETRO'da post-hoc). Fix: config `cost_guard?: { enabled: boolean; max_limit_cost_usd?: number }` (default-off). EXECUTE fazında periyodik (mevcut izleme tick'ine bağla — resource-monitor/collector döngüsü) `limit-ledger` (F1-TOK SSOT, `limitCost`) ile sprint'in o ana dek yaktığı limit-maliyetini ölç; `max_limit_cost_usd` aşılırsa dürüst uyarı + yeni-task-dispatch'i DURDUR (mevcut worker'ları öldürme — graceful; sprint-kill YASAK kuralına uy) + audit/notlar. Best-effort (ledger hatası sprint'i düşürmez). Testler: eşik-aşımı→dispatch-stop sinyali (mock ledger); altında→normal; kapalı→hiç kontrol.

**Kanıt:** `npx vitest run tests/orchestra/mid-sprint-cost-abort.test.ts` yeşil; `grep -n "cost_guard\|max_limit_cost" src/orchestra/sprint-phases.ts src/core/config-types.ts | head -2` ≥ 1. **Test:** 6+.

---

## Task 4: WK-7 — auditor async-batch liveness (O(n) spawnSync → parallel)
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: performance-analyzer
- Skills: typescript-expert, testing-expert, performance-optimizer
- Files: src/monitor/auditor.ts, tests/monitor/auditor-async-liveness.test.ts
- Scope: src/monitor/, tests/monitor/

### Description
Kanıt: `auditor.ts` 30s scan'de worker-başına `spawnSync('docker', ...)` (O(n) blocking — ≥20 worker'da "resource contention"). Fix: liveness probe'larını **async + batch** yap — tüm worker'lar için `spawn` (async) promise'lerini paralel başlat, `Promise.allSettled` ile topla (event-loop bloke etmez); spawnSync'i KALDIR (CLAUDE.md hermeticity kuralı + ölçek). Mevcut scan-mantığı (stale tespit, heartbeat oku) aynen — yalnız docker-probe paralelleşir. Davranış korunumu: tespit sonuçları aynı, sadece non-blocking. Testler (mock spawn): N-worker paralel probe; bir-probe-hata diğerlerini etkilemez; stale tespiti doğru; spawnSync-yok (grep guard).

**Kanıt:** `npx vitest run tests/monitor/auditor-async-liveness.test.ts` yeşil; `grep -c "spawnSync" src/monitor/auditor.ts` = 0. **Test:** 7+.

---

## Task 5: DASH-001 — /api/kill/all + autonomous SSE watch
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/api/server.ts, src/orchestra/tmux.ts, tests/api/kill-all-endpoint.test.ts
- Scope: src/api/, src/orchestra/, tests/api/
- Dependencies: 279-001

### Description
Kanıt: `/api/kill/:id` killWorker(workerId) var ama `kill/all` özel-durumu eksik/kırık (DASH-001). Fix: (1) `tmux.ts`'e `killAllWorkers()` (mevcut session/worker listesini topla → her birini killWorker; subprocess/docker backend'leri de kapsa — mevcut kill mantığını SSOT al); (2) server.ts `/api/kill/all` → killAllWorkers + sayı dön (kill = destructive ama API zaten auth-gate'li; sprint-state'i COMPLETED yapma — yalnız worker'lar). Dependencies 279-001 (server.ts dokunan import-cycle fix'inin üstüne). i18n. Testler (mock killWorker): kill/all → tüm worker'lar; boş→0; tekil kill/:id regresyonsuz.

**Kanıt:** `npx vitest run tests/api/kill-all-endpoint.test.ts` yeşil; `grep -n "kill/all\|killAllWorkers" src/api/server.ts src/orchestra/tmux.ts | head -2` ≥ 1. **Test:** 5+.

---

## Task 6: DASH-002 — sidebar bell pending-count badge (lucide, emoji-yasak)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: frontend-designer
- Skills: react-specialist, frontend-design, testing-expert
- Files: src/dashboard/src/components/Sidebar.tsx, src/dashboard/src/hooks/useNervousStatus.ts, tests/dashboard/sidebar-bell-badge.test.tsx
- Scope: src/dashboard/, tests/dashboard/

### Description
Sidebar'daki Nervous/Bell ikonuna pending-onay sayısı rozeti (`/api/nervous/status` pending count). YENİ `useNervousStatus` hook (use-live-data/SSE deseni — periyodik ya da SSE). Sidebar.tsx mevcut `Bell` lucide ikonuna (zaten import) sayı-badge ekle (count>0 ise; renk tema-token'larıyla, EMOJI YASAK — docs/design/web-console spec). 0→badge gizli. i18n (LanguageProvider). no-emoji-guard yeşil kalır. Testler (jsdom, mock fetch): pending>0→badge sayı; 0→gizli; hook fetch.

**Kanıt:** `npx vitest run --config vitest.dashboard.config.ts tests/dashboard/sidebar-bell-badge.test.tsx` yeşil + `npx tsc --noEmit -p src/dashboard` temiz; `grep -n "useNervousStatus\|badge" src/dashboard/src/components/Sidebar.tsx | head -2` ≥ 1. **Test:** 5+.

---

## Task 7: WK-5-kalan — docker live-monitor: output-stream PTY worker-attach + watch --follow
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: high
- Agent: devops-engineer
- Skills: docker-expert, typescript-expert, testing-expert
- Files: src/cli/commands/watch.ts, src/core/output-collector.ts, tests/cli/watch-follow.test.ts
- Scope: src/cli/, src/core/, tests/cli/

### Description
WK-5 SSE-mount zaten yapıldı (server.ts:608 isOutputStreamRequest); kalan: (1) `output-collector.ts` `docker logs --tail` (snapshot) → opsiyonel `docker logs -f` (follow) modu (injectable spawn, async stream); (2) `deckent watch` komutuna `--follow` docker branch — aktif docker worker'ların canlı log'unu akıt (mevcut watch tmux-split mantığını koru, docker-backend'de `logs -f` kullan). Gerçek docker YOK testlerde (mock spawn stream). Davranış: --follow'suz mevcut watch aynen. Testler: follow-mode log-stream (mock); tail-mode snapshot; docker-yok dürüst mesaj.

**Kanıt:** `npx vitest run tests/cli/watch-follow.test.ts` yeşil; `grep -n "follow\|logs -f\|logs.*-f" src/cli/commands/watch.ts src/core/output-collector.ts | head -2` ≥ 1. **Test:** 6+.

---

## Task 8: F7-ENT-verify — enterprise dashboard backend doğrula + 4 tab gerçek-veri
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: ci-guardian
- Skills: ci-testing, typescript-expert
- Files: tests/api/enterprise-routes-complete.test.ts
- Scope: tests/api/
- Dependencies: 279-001

### Description
F7-ENT-verify: 277'de `registerEnterpriseRoutes` (tenants/rbac/audit/rate) mount edildi; bu task DOĞRULAR + regresyon-kilitler. YENİ test: 4 enterprise endpoint'in hepsi (auth'lu) 200 + beklenen shape döner (boş-veri 200, 404 değil); EnterprisePage'in çağırdığı tüm path'ler kapsanır. Eksik/yanlış-shape bulursan NO_GO + notes (server.ts ya da enterprise-endpoint düzeltmesi gerekiyorsa scope'a ekle — ama önce doğrula). Dependencies 279-001 (server.ts dokunuldu). Testler: 4 endpoint shape + auth-gate + boş-veri-200.

**Kanıt:** `npx vitest run tests/api/enterprise-routes-complete.test.ts` yeşil (4 endpoint kanıtlı). **Test:** 6+.

---

## Task 9: WK-5/COMM-1 dashboard görünürlük — Worker Comms + Resources panel
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: frontend-designer
- Skills: react-specialist, frontend-design, testing-expert
- Files: src/dashboard/src/pages/WorkersPage.tsx, src/dashboard/src/lib/api.ts, tests/dashboard/workers-comms-panel.test.tsx
- Scope: src/dashboard/, tests/dashboard/
- Dependencies: 279-006

### Description
COMM-1 (278) + resource-monitor (271) dashboard görünürlüğü: WorkersPage'e (a) "Worker Comms" paneli — shared-context key sayısı + son handoff'lar (mevcut `/api/status` ya da yeni hafif endpoint — server'a dokunmadan status verisinden türetilebiliyorsa onu kullan; gerekirse salt-okunur); (b) resource özeti satırı (worker RAM, varsa). lucide ikon, EMOJI YASAK, tema-token. Veri yoksa EmptyState. Dependencies 279-006 (Sidebar/dashboard-hook deseni). Testler (jsdom): comms-panel render (mock data), boş-state, no-emoji.

**Kanıt:** `npx vitest run --config vitest.dashboard.config.ts tests/dashboard/workers-comms-panel.test.tsx` yeşil; `grep -niE "comms|shared|handoff" src/dashboard/src/pages/WorkersPage.tsx | head -2` ≥ 1. **Test:** 5+.

---

## Task 10: features + cli-commands — M-küme satırları
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/features.md, docs/reference/cli-commands.md
- Dependencies: 279-005, 279-007
- Scope: docs/reference/
- ModelEffort: low

### Description
DİSKTEKİ koddan (inmemişleri yazma): features.md'ye M-küme satırları (`/api/kill/all`, watch --follow docker, sidebar bell-badge, cost_guard mid-sprint abort, panic-gate timeout); cli-commands'a `watch --follow` notu + kill/all. Mevcut format.

**Kanıt:** `grep -ciE "kill/all|--follow|cost_guard|bell" docs/reference/features.md docs/reference/cli-commands.md | awk -F: '{s+=$1} END{print s}'` ≥ 2 (toplam — per-file say). **Test:** yok — .result YAZ.

---

## Task 11: MASTER-PLAN — M-küme işaretleri
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/MASTER-PLAN.md
- Dependencies: 279-001, 279-002, 279-004, 279-005
- Scope: docs/
- ModelEffort: low

### Description
Diskte doğruladığın M-küme maddelerini işaretle (inmemişleri İŞARETLEME): WK-import ✅, WK-nervous ✅, WK-cost ✅ (mid-sprint abort), WK-7 ✅ (async-batch auditor), DASH-001 ✅, DASH-002 ✅, WK-5 ✅ (follow), F7-ENT-verify ✅. Tek-satır "✅ Sprint 279: ..." ekler, mevcut metni SİLME.

**Kanıt:** `grep -c "Sprint 279" docs/MASTER-PLAN.md` ≥ 3. **Test:** yok — .result YAZ.

---

**Beklenen:** 11 mikro task (opus 2 — WK-import refactor + WK-7 scale · sonnet 7 · haiku 2), zincirler: 005→001 · 008→001 · 009→006 · 010→005,007 · 011→001,002,004,005. Dosya çakışması: server.ts (001 import-fix + 005 kill/all — 005 Dependencies ile 001 sonrası); config-types.ts (003 cost_guard tek). Dashboard görsel (006/009) EMOJI YASAK + lucide + no-emoji-guard. CC sprint sonu: tsc + testler + dashboard-tsc + commit/push + build:all (CC) + notlar. Sonraki: L-küme (human-interaction kalan: REPL slash parity, PLANOBS, DEFER, CKPT).
