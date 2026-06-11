# DIRECTIVES — Sprint 280: L-küme — Human-Interaction Wire (REPL /mcp + PLANOBS observability + nervous edit)

## Goal: L-küme (Alperen sırası: M sonrası L) — human-interaction-wire kalan maddeleri (MASTER-PLAN §4G). Kod-doğrulandı (Explore file:line, 2026-06-11): REPL `/mcp` **0-caller stub** (mcp-bridge.ts+broker.ts var ama chat-native'e wire YOK = G1/[[project_mcp_client_not_wired_s229]]), PLANOBS-001/002 (event-stream `PROGRESS` channel + notify `progress`/`phase-change` tipi YOK → plan/start sessiz-boşluk), PLANOBS-004 (planner-fail `console.error` notify değil + spinner yok), PLANOBS-005 (çift `planSprint` start.ts:308+368 + `.tasks` cache yok), APPROVE-007b (nervous `handleEdit` + modifiedPayload IPC transport YOK). Hepsi opt-in/additive/fail-safe; davranış-korunumlu. MİKRO-TASK + DEPENDENCY + MODEL-KATMANLAMA (opus 3 · sonnet 5 · haiku 2).

## Ortak kurallar
- **TDD + hermetik:** önce RED; tmpdir + injectable fs/spawn; testte gerçek ağ/MCP-subprocess YASAK (mock broker/spawn); spawnSync YASAK (async spawn).
- **Davranış korunumu:** additive/opt-in; mevcut yeşil testler yeşil; default çıktı/akış değişmez (örn. edit-yokken approval byte-bayt aynı; MCP-server yapılandırılmamışsa REPL aynı). Default çıktı bilinçli değişiyorsa (PLANOBS spinner/progress) snapshot bilinçli güncellenir + .result notes'a yazılır.
- **i18n-FIRST:** TÜM user-facing string `getMessage(key, lang)` (en+tr). Hardcode TR/EN YASAK. Mekanizma modülleri string-free.
- **Fail-safe:** yeni surface (broker, progress-emit, notify) hata verirse ana akışı (REPL / sprint / approval) ASLA düşürmez — log+skip.
- **SSOT:** event-stream (core/), notification-dispatcher, ipc-queue, mcp-bridge/broker MEVCUT modüller — BAĞLA, yeniden yazma. event-stream Sprint 279'da `src/orchestra/`→`src/core/event-stream.ts`'e taşındı (orchestra shim).
- **`.tasks/task-XXX.result` YAZ**; Kanıt komutlarını gerçekten koş. Tier-1 user-surface → gerçek-binary smoke CC sprint-sonu (ADR-079).

---

## Task 1: PLANOBS-001 — event-stream PROGRESS channel + emitProgress helper
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/core/event-stream.ts, tests/core/event-stream-progress.test.ts
- Scope: src/core/, tests/core/

### Description
Kanıt: `src/core/event-stream.ts` CHANNELS enum'unda (24 channel) `PROGRESS` YOK. Fix (Faz primitive — emit-site'ları Task 5 bağlar): (1) CHANNELS'e `PROGRESS: 'PROGRESS'` ekle (mevcut sabit-deseni izle); (2) `emitProgress(opts: { root?: string; phase: string; pct?: number; detail?: string; source?: string })` yardımcısı — mevcut `writeEvent` üzerine ince sarmalayıcı, `channel: CHANNELS.PROGRESS`, payload `{ phase, pct, detail }`. Hata-toleranslı (writeEvent hatası yutulur, asla throw). SAF additive: hiçbir mevcut channel/emit değişmez. ÖNCE writeEvent imzasını + bir mevcut emit-helper'ı (örn. DEPENDENCY_BLOCKED emit) oku, aynı deseni kullan.

**Kanıt:** `npx vitest run tests/core/event-stream-progress.test.ts` yeşil; `grep -n "PROGRESS" src/core/event-stream.ts | head -2` ≥ 1. **Test:** 5+ (channel mevcut, emitProgress yazıyor, pct opsiyonel, hata-toleransı, payload shape).

---

## Task 2: PLANOBS-002 — notify 'progress' + 'phase-change' event-tipleri (3 surface)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/core/notification-dispatcher.ts, src/core/notify.ts, tests/core/notify-progress-type.test.ts
- Scope: src/core/, tests/core/

### Description
Kanıt: `notification-dispatcher.ts` NotificationEventName enum'u yalnız 5 lifecycle-tipi içeriyor ('sprint-started','task-done','task-no-go','sprint-finalized','human-checkpoint-required') — `progress`/`phase-change` YOK. Fix: enum'a `'progress'` + `'phase-change'` ekle; dispatcher bu tipleri TÜM kayıtlı adapter'lara (tty + MCP + file) yönlendirir (mevcut routing yolunu kullan — özel-case değil, generic dispatch). `notify.ts` yardımcı varsa (örn. notifyProgress) ekle, yoksa generic notify ile çağrılabilir bırak. Additive: mevcut 5 tip + adapter davranışı aynen. ÖNCE dispatcher'ın mevcut bir tipi nasıl route ettiğini oku.

**Kanıt:** `npx vitest run tests/core/notify-progress-type.test.ts` yeşil; `grep -niE "progress|phase-change" src/core/notification-dispatcher.ts | head -2` ≥ 1. **Test:** 5+ (progress tip route, phase-change route, 3-adapter fan-out, mevcut tip regresyonsuz).

---

## Task 3: APPROVE-007b — modifiedPayload IPC transport + executor consume (OPUS)
- Provider: claude
- Model: opus
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/nervous/ipc-queue.ts, src/nervous/executor.ts, tests/nervous/approval-edit-transport.test.ts
- Scope: src/nervous/, tests/nervous/

### Description
Kanıt: `ipc-queue.ts` ApprovalRequest shape `{ notificationId, decision, reason, requestedAt }` — modifiedPayload YOK; executor `resolveApproval` orijinal payload'la çalışıyor → "edit" (onayı değiştirilmiş payload'la geçirme) imkansız. Fix: (1) ApprovalRequest'e **opsiyonel** `modifiedPayload?: Record<string, unknown>` ekle; writeApproval/readApproval taşır (geri-uyum: alan yoksa undefined). (2) poller→`executor.resolveApproval(notifId, decision, opts?)` opsiyonel `{ modifiedPayload }` geçirir. (3) Executor 'accepted' + modifiedPayload varsa handler'ı **birleştirilmiş** payload'la (`{ ...orijinal, ...modifiedPayload }`) çalıştırır; YOKSA byte-bayt mevcut davranış. SAFETY_FLOOR semantiği korunur (Sprint 279). ÖNCE resolveApproval + handler-invoke yolunu izle. Bu Task 8'in (REPL /nervous edit) transport-temeli.

**Kanıt:** `npx vitest run tests/nervous/approval-edit-transport.test.ts` yeşil; `grep -n "modifiedPayload" src/nervous/ipc-queue.ts src/nervous/executor.ts | head -2` ≥ 2. **Test:** 7+ (transport round-trip, executor merge, edit-yok byte-aynı, reject+edit yok-sayılır, SAFETY_FLOOR korunur).

---

## Task 4: REPL /mcp broker wire — G1 (mcp-bridge → chat-native) (OPUS, Tier-1)
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: api-builder
- Skills: typescript-expert, anthropic-sdk, testing-expert
- Files: src/cli/commands/chat-native.ts, src/cli/commands/chat-slash-registry.ts, src/cli/repl/mcp-bridge.ts, tests/cli/repl-mcp-wire.test.ts
- Scope: src/cli/, tests/cli/

### Description
Kanıt ([[project_mcp_client_not_wired_s229]]): `/mcp` REPL'de `resolveSlash` (chat-slash-registry.ts:489) → `{ action:'message', messageKey:'chat.mcp_not_wired' }` döndürüyor (honest stub); `src/cli/repl/mcp-bridge.ts` (`buildMcpBridge`/McpClientBroker) + `src/mcp-client/broker.ts` MEVCUT ama chat-native'de **0-caller**. Fix: (1) chat-native başlangıcında `buildMcpBridge` wire et — **config-gated**: yalnız MCP-server yapılandırılmışsa (broker'ın mevcut server-discovery'sini OKU: `.mcp.json` / `config.mcp_servers` — neyse onu kullan, yeniden icat etme) bridge kurulur; (2) `/mcp` dispatch'i broker'a yönlendir: `list` (server+tool kataloğu), `call <tool> [args]` (tool çağrısı); (3) **server yapılandırılmamışsa** → honest i18n mesaj "MCP sunucusu yapılandırılmadı" (eski "not wired" DEĞİL — artık wire'lı, sadece yapılandırma yok); (4) broker hata/timeout → log+skip, **REPL ASLA çökmez** (fail-safe). i18n en+tr (yeni key'ler chat-slash-registry/chat-native içindeki getMessage çağrılarıyla; mevcut MessageKey union string kabul ediyor). ÖNCE buildMcpBridge imzası + broker.list/call API'sini oku.

**Kanıt:** `npx vitest run tests/cli/repl-mcp-wire.test.ts` yeşil; `grep -n "buildMcpBridge" src/cli/commands/chat-native.ts | head -1` ≥ 1. **Smoke (Tier-1, CC sprint-sonu):** `echo "/mcp" | node dist/cli/entry.js` REPL → "yapılandırılmadı" honest mesajı (çökme yok), EXIT temiz. **Test:** 7+ (server-var→list, server-yok→honest mesaj, call→broker, broker-hata→REPL ayakta, i18n tr/en).

---

## Task 5: PLANOBS-001 emit-site'ları — EXECUTE-% + spawn + pre-vitest
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/result-collector.ts, src/orchestra/plugin-hooks.ts, tests/orchestra/progress-emit.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: 280-001

### Description
Task 1'in `emitProgress`'ini gerçek noktalara bağla (dormant değil canlı): (1) `result-collector.ts waitForResults` periyodik tick'inde (mevcut `debugLog('waitForResults:progress', …)` noktası, ~line 1016) → `emitProgress({ phase:'EXECUTE', pct: done/total, detail })`; (2) worker-spawn noktasında (spawn loop) → `emitProgress({ phase:'SPAWN', … })`; (3) `plugin-hooks.ts` pre-sprint vitest (track_test_count, ~line 577) öncesi/sonrası → `emitProgress({ phase:'PRE_VITEST', … })`. Mevcut log'ları KORU (emit ek). Fail-safe (emit hatası sprint'i düşürmez). `deckent_watch` artık PROGRESS event'lerini backfill+push eder (PLANOBS-003 zaten payload dönüyor). ÖNCE Task 1'in emitProgress imzasını + waitForResults döngüsünü oku.

**Kanıt:** `npx vitest run tests/orchestra/progress-emit.test.ts` yeşil; `grep -n "emitProgress" src/orchestra/result-collector.ts | head -1` ≥ 1. **Test:** 6+ (EXECUTE-% emit, spawn emit, pre-vitest emit, emit-hata sprint-düşürmez, pct hesabı).

---

## Task 6: PLANOBS-004 — planner-fail notify + plan spinner
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/sprint-planner.ts, src/cli/commands/plan.ts, tests/orchestra/planner-notify.test.ts
- Scope: src/orchestra/, src/cli/, tests/orchestra/
- Dependencies: 280-001, 280-002

### Description
Kanıt: `sprint-planner.ts` AI-fail'leri (parse_failed/timeout, line 250/329/336/363/452) `console.error` ile (notify'a GİTMEZ → operatör/MCP/AI görmez). Fix: (1) bu noktaları `notify({ type:'phase-change' veya 'progress', severity, message })` ile **insan-dönük** yüzeyle (3-surface: tty+MCP+file — Task 2 tipleri); planner-start'ta `emitProgress({ phase:'PLAN' })` (Task 1). `console.error` planner-fail noktalarında kaldır (notify SSOT). (2) `plan.ts` komutuna mevcut `chat-spinner.ts` ile sessiz-boşluk spinner'ı (uzun planlama sırasında); plan biter/hata → spinner durur + sonuç/hata mesajı. i18n en+tr. ÖNCE chat-spinner API'si + notify imzasını oku. Davranış: hata artık sessiz değil, ama exit-code/akış aynı.

**Kanıt:** `npx vitest run tests/orchestra/planner-notify.test.ts` yeşil; `grep -n "notify" src/orchestra/sprint-planner.ts | head -1` ≥ 1. **Test:** 6+ (parse_failed→notify, timeout→notify, planner-start→emitProgress, spinner start/stop, i18n).

---

## Task 7: PLANOBS-005 — start çift-planSprint kaldır + .tasks cache + start-fail notify (OPUS)
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: performance-analyzer
- Skills: typescript-expert, performance-optimizer, testing-expert
- Files: src/cli/commands/start.ts, src/orchestra/sprint-controller.ts, tests/cli/start-plan-cache.test.ts
- Scope: src/cli/, src/orchestra/, tests/cli/
- Dependencies: 280-002

### Description
Kanıt: `start.ts` `planSprint`'i İKİ kez çağırıyor (line 308 display + line 368 cost-gate) — gereksiz çift-plan; ayrıca `start` HER ZAMAN re-plan (`.tasks` cache yok). Fix: (1) **tek planSprint**: bir kez planla, sonucu cost-gate + display + spawn'a yeniden-kullandır (davranış aynı, yalnız tek-hesap). (2) **`.tasks` cache**: DIRECTIVES içerik-hash'i değişmemişse + taze task-*.json varsa re-plan ATLA (mevcut task dosyalarını kullan); hash değişmiş/dosya yok → normal plan. Güvenli default (stale-task riski hash-guard'la kapalı). (3) start-fail (`console.error` yerine) **insan-dönük notify** (Task 2 'phase-change'). Pre-sprint vitest: bloke-eden çağrıyı async'e çevirme riski varsa DOKUNMA (KARPATHY: surgical), yalnız notify+emit ekle. ÖNCE start.ts plan-akışını + planSprint imzasını + sprint-controller plan-giriş noktasını oku.

**Kanıt:** `npx vitest run tests/cli/start-plan-cache.test.ts` yeşil; cache-hit yolunda planSprint 0-çağrı (test mock-sayar kanıtlar). **Smoke (Tier-1, CC sprint-sonu):** `node dist/cli/entry.js start --dry-run` EXIT temiz (çift-plan yok). **Test:** 7+ (tek-plan reuse, cache-hit→re-plan-yok, hash-değişti→re-plan, start-fail→notify, dry-run regresyonsuz).

---

## Task 8: APPROVE-007b — REPL /nervous edit (chat-nervous-bridge handleEdit)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/chat-nervous-bridge.ts, tests/cli/nervous-edit-bridge.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: 280-003

### Description
Kanıt: `chat-nervous-bridge.ts handleNervousSlash` yalnız accept/reject (handleEdit YOK). Fix: `/nervous edit <id> <key=val ...>` (veya json) parse → Task 3'ün transport'uyla `writeApproval({ notificationId, decision:'accepted', modifiedPayload })` (IPC → poller → executor merge-payload). REPL'de görünür onay listesinden id seç + payload düzelt + onayla. i18n en+tr (parse-hata mesajı dahil). Fail-safe (geçersiz id/payload → honest mesaj, REPL ayakta). ÖNCE handleNervousSlash accept/reject deseni + Task 3 writeApproval imzasını oku. Bu APPROVE-007b'yi kapatır (transport=Task3, surface=bu).

**Kanıt:** `npx vitest run tests/cli/nervous-edit-bridge.test.ts` yeşil; `grep -niE "handleEdit|edit" src/cli/commands/chat-nervous-bridge.ts | head -2` ≥ 1. **Test:** 5+ (edit→writeApproval+modifiedPayload, kv-parse, json-parse, geçersiz-id→honest, i18n).

---

## Task 9: features + cli-commands — L-küme satırları
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/features.md, docs/reference/cli-commands.md
- Scope: docs/reference/
- Dependencies: 280-004, 280-005, 280-006, 280-007, 280-008
- ModelEffort: low

### Description
DİSKTEKİ koddan (inmemişleri yazma): features.md'ye L-küme satırları (REPL `/mcp` broker wire, plan/start PROGRESS observability + planner-fail notify, `/nervous edit` modifiedPayload, start çift-plan kaldırma + .tasks cache); cli-commands'a `/mcp list|call` + `/nervous edit` + plan/start spinner notu. Mevcut format.

**Kanıt:** `grep -ciE "/mcp|nervous edit|PROGRESS|plan.*cache|planner.*notify" docs/reference/features.md docs/reference/cli-commands.md | awk -F: '{s+=$1} END{print s}'` ≥ 2 (toplam — per-file say). **Test:** yok — .result YAZ.

---

## Task 10: MASTER-PLAN — §4G L-küme işaretleri
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/MASTER-PLAN.md
- Scope: docs/
- Dependencies: 280-001, 280-002, 280-003, 280-004, 280-007
- ModelEffort: low

### Description
Diskte doğruladığın L-küme maddelerini §4G'de işaretle (inmemişleri İŞARETLEME): REPL `/mcp` wire ✅ (G1 kapandı), PLANOBS-001 ✅ (PROGRESS channel+emit), PLANOBS-002 ✅ (notify progress/phase-change), PLANOBS-004 ✅ (planner notify+spinner), PLANOBS-005 ✅ (tek-plan+cache), APPROVE-007b ✅ (edit transport+REPL). §4G "Kalan: REPL·DASH·PLANOBS·DEFER" satırını güncelle (REPL+PLANOBS düştü → kalan DASH·DEFER). Tek-satır "✅ Sprint 280: ..." ekler, mevcut metni SİLME.

**Kanıt:** `grep -c "Sprint 280" docs/MASTER-PLAN.md` ≥ 3. **Test:** yok — .result YAZ.

---

**Beklenen:** 10 mikro task (opus 3 — APPROVE-007b transport + /mcp broker wire + start-perf · sonnet 5 · haiku 2). Zincirler/wave: **Wave-1** 001·002·003·004 (deps-yok); **Wave-2** 005←001 · 006←001,002 · 007←002 · 008←003; **Wave-3** 009←004,005,006,007,008 · 010←001,002,003,004,007. Dosya çakışması YOK (her task ayrı filesWrite). Hepsi opt-in/additive/fail-safe + i18n (en+tr) + davranış-korunumlu. CC sprint sonu: tsc + testler + dashboard-tsc + Tier-1 smoke (/mcp, start --dry-run) + commit/push + build:all (CC) + notlar. Sonraki: K-küme.
