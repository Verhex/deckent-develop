# NERVOUS-APPROVAL FIX PLAN — B-COLLISION-HANG + cross-source approval overhaul

> **CC el-kodu, karpathy-discipline ile.** deckent-worker'a VERİLMEZ (deckent'in kendi
> nervous/sprint çekirdeği bozuk + scope-collision riski). Her task: D1 (read+plan) →
> D2 (mevcut-pattern, YAGNI) → D3 (surgical, minimum-diff) → D4 (faithful-test, dürüst-DoD).
> Kaynak: sprint-319 gece-loop'u hung-bug forensiği (`.deckent/OVERNIGHT-REPORT.md`).

---

## DİAGNOZ (kök-neden, file:line — D1 okuması)
**Mimari kopukluk:** sprint-collision-block ↔ nervous-approval-consumption AYRI subsystem.
1. **Sprint tarafı** (`sprint-spawner.ts:328-358`): wave-dispatch'te `detectScopeCollisions` → `handleScopeCollision(payload)` → `BRAIN→SPAWN:BLOCKED` + NERVOUS_NOTIFICATION emit; collision-task dispatch edilmez. Her result-collector poll-tick'inde RE-DETECT + RE-EMIT (319'da her 5dk).
2. **Approval tarafı** (`nervous/bootstrap.ts:221` `ipcQueue.startPolling`): executor IPC-poll'u NERVOUS-bootstrap'ta çalışır — `deckent start` sprint-process'inde nervous bootstrap edilmiyorsa poll YOK → accept'ler `.deckent/nervous-ipc/pending/`'de tüketilmeden birikir.
3. **shortCode↔id mismatch:** `executor.resolveApproval(notificationId)` map'i `notification.id` (full-UUID) ile key'liyor (`executor.ts:164,291`); `dispatcher.ts:340` `code = shortCode ?? id` (surface'e shortCode gönderiyor); CLI accept `notification.id` bekliyor → shortCode'la accept MISS olabilir. **Tutarsız + uzun.**
4. **Re-notify loop:** sprint her tick yeni notification-id üretip re-emit ediyor (debounce yok) → 319'da 6+ duplicate pending.
5. **Timeout-auto-resolve YOK:** onay gelmezse sonsuz bekler (4h sprint-timeout bile collision-gate'i kapsamıyor).
6. **Brain-ack YOK:** Brain accept'i tükettiğinde ne jsonl'a ne process-state'e "onayı aldım" yazmıyor → görünürlük yok.

**Asıl sonuç:** accept HERHANGİ kaynaktan (bot/CLI/MCP) gelse de sprint-block onu tüketmiyor → deadlock (sprint-319: 7h hung).

---

## DESIGN KARARLARI (Alperen yönü + mimari)
- **D-A (en güçlü, önleyici): plan-zamanı OTOMATİK serialize.** Scope-collision DETERMİNİSTİK çözülebilir (2 task aynı dosya → dependency-edge ekle, farklı wave). Onay-gate'e GEREK YOK — collision-detector plan-zamanı serialize etsin, runtime-block hiç oluşmasın. (319'da 008→007 dependency koydum ama 007 NO_GO olunca 008 wave-2'de collision-gate'e takıldı → serialize cascade-failure'da da honor edilmeli.)
- **D-B: cross-source accept consumption — TEK doğru yol.** bot/CLI/MCP → `NervousIpcQueue.writeApproval` (zaten tek-IPC) → **sprint-block'un kendi wait-loop'u IPC-pending'i drain etsin** (executor-bootstrap'a bağımlı olmadan). Accept geldiğinde collision-block çözülür.
- **D-C: shortCode = TEK kimlik, kısa+stabil+cross-surface-aynı.** Her surface (bot/CLI/MCP/jsonl) AYNI shortCode'u göstersin; accept shortCode↔id'yi resolver'da normalize etsin (her iki yönü kabul). Uzun-UUID kullanıcıya gösterilmez.
- **D-D: timeout auto-resolve (parametrik).** non-blocker proposal (örn. scope_collision) N-dk (default 5dk) onaylanmazsa **auto-accept** (Brain bekletmesin); kritik/blocker olanlar (SAFETY_FLOOR vb.) HARİÇ — onlar bekler/auto-reject. Ayar: `config.modes.<mode>.nervous` veya `nervous.auto_resolve` (mevcut nervous-enable schema'sına ekle); mode-preset'lerde `auto`.
- **D-E: Brain-ack çift-yazım.** Accept tüketilince Brain (1) jsonl'a `DECKENT→*:APPROVAL_CONSUMED` event yazsın (akış-görünürlüğü), (2) process-state'te resolved-set'e eklesin (re-emit'i durdur). Re-notify yalnız GERÇEKTEN-unresolved iken (5dk scope).

---

## CC-FIX TASK'LARI (sıra: 1→6, bağımlılıklı; her biri karpathy-disiplinli)

### FIX-1 [P0, ÇEKİRDEK] — sprint-collision-block IPC-accept consume + Brain-ack
**Dosya:** src/orchestra/sprint-spawner.ts (+ result-collector.ts wait-loop), src/nervous/ipc-queue.ts (readPending reuse), event-stream (APPROVAL_CONSUMED channel). **Test:** tests/orchestra/ (yeni faithful).
**D1:** sprint-spawner collision-block (328-358) + result-collector poll-loop'u oku; `NervousIpcQueue.readPending()` reuse.
**Fix:** collision-block'a girince, her poll-tick'te `NervousIpcQueue(root).readPending()`'i tara — bu collision'ın notification-id'sine (veya shortCode'una) eşleşen `accepted` varsa → collision'ı resolved-işaretle (serialize uygula / block kaldır), `markResolved` çağır, **`APPROVAL_CONSUMED` event jsonl'a yaz** + in-process resolved-set'e ekle → re-emit durur, dispatch devam eder. `rejected` → collision-task NO_GO.
**Faithful:** collision-block + IPC'ye `accepted` yaz → dispatch devam eder + APPROVAL_CONSUMED event'i yazılır (pre-fix: sonsuz block, RED).

### FIX-2 [P0] — shortCode normalize (cross-surface tek-kimlik)
**Dosya:** src/nervous/proposer.ts (shortApprovalCode), executor.ts (resolveApproval), cli/commands/nervous.ts, mcp/tools/nervous.ts, connectors/incoming-command-resolver.ts.
**D1:** `shortApprovalCode` üretimi + her surface'in accept-id-kaynağını oku.
**Fix:** accept-path'lerinde **shortCode↔full-id resolver** — pending'lerde hem id hem shortCode ile eşleştir (normalize). Tüm surface AYNI shortCode'u göstersin (dispatcher `shortCode ?? id` → her zaman shortCode garantile; id'siz proposal olmasın). shortCode kısa (örn. 5-char) + deterministik (id-hash).
**Faithful:** shortCode ile accept → resolveApproval doğru pending'i bulur (pre-fix: full-id-only → MISS, RED).

### FIX-3 [P1] — plan-zamanı otomatik serialize (önleyici, collision'ı hiç oluşturma)
**Dosya:** src/orchestra/dependency-scheduler.ts (buildDependencyGraph + detectScopeCollisions), planner/sprint-spawner wave-build.
**D1:** detectScopeCollisions + buildWaveDependency oku; 319'da neden 008→007 serialize cascade-failure'da bozuldu.
**Fix:** scope-collision tespit edilince **otomatik synthetic-dependency-edge** ekle (deterministik serialize) → aynı-dosya-task'lar farklı-wave; runtime collision-block HİÇ oluşmaz. Cascade-failure'da (007 NO_GO) 008'in serialize'ı korunmalı (collision-gate'e düşmesin — ya skip ya sonraki-wave).
**Faithful:** 2 same-file task → otomatik farklı-wave (collision-event YOK, pre-fix: collision-block, RED).

### FIX-4 [P1] — timeout auto-resolve (parametrik, non-blocker)
**Dosya:** src/orchestra/sprint-spawner.ts (collision-wait), src/core/config-types.ts + config.ts (nervous.auto_resolve schema), mode-presets.ts.
**D1:** nervous-enable schema + mode-preset oku; blocker vs non-blocker proposal sınıflandırması (SAFETY_FLOOR locked-list).
**Fix:** collision-block (+genel non-blocker proposal) N-dk (config `nervous.auto_resolve_ms`, default 5dk) onaylanmazsa **auto-accept** (Brain devam); blocker/critical (SAFETY_FLOOR) HARİÇ → auto-reject veya bekle. Parametrik: mode-preset'te `auto`.
**Faithful:** non-blocker collision + 0 onay + timeout-aş → auto-accept + dispatch devam (pre-fix: sonsuz block, RED); blocker → auto-accept ETMEZ.

### FIX-5 [P2] — re-notify debounce
**Dosya:** src/orchestra/sprint-spawner.ts (collision re-emit) — B-STALEMD pattern'i.
**D1:** re-emit noktasını oku (319'da her tick yeni-id).
**Fix:** aynı collision (aynı dosya-seti) için notification'ı YALNIZ state-change'de emit (re-emit'te aynı stable-id, duplicate-pending üretme). Resolved sonrası emit yok.
**Faithful:** 3 poll-tick aynı collision → 1 notification (pre-fix: 3, RED).

### FIX-6 [P2] — bot cross-source ack round-trip (Telegram)
**Dosya:** src/connectors/incoming-command-resolver.ts, bot reply.
**D1:** bot accept→writeApproval→Brain-consume→bot-reply zincirini oku.
**Fix:** Telegram accept → IPC → Brain-consume → **bot'a "onay alındı + uygulandı" reply** (FIX-1'in APPROVAL_CONSUMED event'ini dinle); duplicate-notification'ı bot'ta da bastır (resolved sonrası re-notify yok).
**Faithful:** bot-accept → APPROVAL_CONSUMED → tek-reply (pre-fix: re-notify spam, RED).

---

## SIRALAMA & VERIFY
- **FIX-1 + FIX-2 ÖNCE** (P0 — Alperen'in "kritik": cross-source accept + Brain-read + Brain-ack). Bunlar bittiğinde mevcut hung-senaryo çözülür.
- FIX-3 (önleyici serialize) collision'ı kökten azaltır; FIX-4 (timeout) emniyet-supabı; FIX-5/6 hijyen.
- Her FIX: `npx tsc --noEmit` EXIT=0 + faithful-test (git-stash pre-fix RED) + full-affected-suite-vs-baseline (sıfır-yeni-regresyon) + `npm run build` + commit+push.
- **Test-only doğrulama yetmez** (Tier-1-vari): mümkünse küçük gerçek-sprint ile cross-source-accept'i canlı-doğrula (2-task-same-file → accept → unblock).

---
_Kaynak: B-COLLISION-HANG forensiği (sprint-319). nervous/ipc-queue.ts + executor.ts + bootstrap.ts + sprint-spawner.ts + dispatcher.ts D1-okundu. CC-hand-coded, karpathy-disciplined._
