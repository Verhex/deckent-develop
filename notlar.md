# 🌙 Otonom Loop Notları — Alperen için sabah okuması

> Bu dosya CC'nin otonom sprint-döngüsünün analiz/başarısızlık günlüğü. Alperen 2026-06-11 gece:
> "madde sırası M-L-K-D-C-B/F-B/MF-diğer; build:all'ı kendin koş; sprint kill yok bekle;
> başarısızlıkta analiz notu buraya; onay alma, auto-mode devam."

## Operating model (bu döngü)
- Döngü: DIRECTIVES yaz → commit → `deckent plan --no-confirm` → `deckent start` → monitor → her result disk-verify → sprint sonu: lint + kayıt-düzelt + commit/push + `npm run build:all` (CC koşar) → sonraki sprint.
- Madde sırası: **M → L → K → D → C → B/F → B/MF → (gerisi CC seçimi: G/H/I/J/N/O/E/P)**.
- Model-katmanlama: fable=planlama, opus=zor-çekirdek, sonnet=normal, haiku=doc.
- Mikro-task + dependency grafiği; opt-in/default-off + fail-safe + cache-prefix korunumu (F1-TOK).
- Sprint kill YASAK — bekle, sonuç döner; exit-without-result → FIX ya da CC manuel respawn.
- /mcp restart GEREKMEZ bu döngüde (dogfood CLI dist'ten koşar; build:all yeni dist'i yazar).

## Sprint günlüğü (kronolojik — başarı kısa, başarısızlık detaylı)

### Sprint 278 — COMM-1 worker-to-worker iletişim ✅ (B-küme, 11/11)
- Başarı. SharedMemory+HandoffProtocol worker prompt/result'a bağlandı (dormant→canlı), WK-6 de kapandı.
- 11/11 disk-verified, tsc temiz, ghost-finalize 6. temiz koşu. build:all CC-otonom koştu (`0c27371b`).
- Not: sprint-reporter 3 task'a GO_WITH_TECH_DEBT etiketledi ama CC disk-verify hepsini DONE doğruladı (testler yeşil) — eval-rubric muhafazakarlığı, gerçek borç değil.
- Kalan (COMM-1 follow-up): flow/autonomous/Brain comms genişlemesi + dashboard görünürlük (M-küme'de WK-5 ile birleşebilir).

### Sprint 279 — M-küme: Dashboard/Monitoring/Wire ✅ (11/11, commit `36292002`)
- Başarı. 11/11 disk-verified DONE; tsc temiz; build:all CC-otonom koştu (dashboard vite 2282 modül). ghost-finalize yine temiz koşu.
- İşler: WK-import (core→orchestra import-cycle çözüldü, ADR-008 — event-stream core/'a taşındı + shim), WK-nervous (panic-gate 10s timeout→auto-proceed, SAFETY_FLOOR muaf), WK-cost (cost_guard mid-sprint dispatch-stop, default-off), WK-7 (auditor O(n) spawnSync→async-batch cache pre-warm), DASH-001 (/api/kill/all), DASH-002 (sidebar bell-badge, lucide/emoji-yasak), WK-5 (docker logs -f follow), F7-ENT-verify (4 enterprise endpoint regresyon-kilit), COMM-1 dashboard panel, +2 doc.

**⚠️ Sabah için 2 bulgu (Alperen oku):**
1. **Gerçek regresyon yakalandı+düzeltildi (executor Test 6).** WK-nervous timeout'u eski "approve sonsuz bekler" testini kırdı (COMMIT_PUSH artık 10s sonra auto-proceed). Worker eski testi güncellememişti (scope'undaydı — gerçek miss). CC düzeltti: test SAFETY_FLOOR action'a (KILL_LIVE_SPRINT) çevrildi → "muaf-sınıf sonsuz bekler" semantiği korundu. **Baseline-stash kanıtı**: diğer 23 test-dosya düşüşü 279-ÖNCESİ pre-existing (flaky/stale-count: mcp-help 32→34 tool, serve "Deckent is ready" mesaj-değişimi, doctor ollama-provider, sprint-controller STACK_COMMANDS mock, nervous-faz1-smoke detector-severity). 279 yalnız bu 1 regresyonu getirdi, o da kapandı.
2. **managed-docs RETRO render i18n locale-leak** (ayrı bug, K/O-küme follow-up). RETRO her sprint VISION.md/beta-tracker.md/blueprint.md (EN doc'lar) içine TR başlık yazıyor (`Metric|Value`→`Metrik|Değer`, `Total Tasks`→`Toplam Task`). Render tüm doc'lara proje-default locale (TR) uyguluyor, per-doc hedef-dili yok sayıyor. Bu sprintte revert ettim (commit'lenmedi); kalıcı fix managed-docs render'a per-doc locale parametresi gerektirir.

- **DURDU — Alperen "bu sprintten sonra dur, yarın sabah devam" dedi (2026-06-11).** Otonom loop duraklatıldı. Sıradaki: **L-küme** (human-interaction kalan: REPL-001/002 slash parity, APPROVE-007b, PLANOBS, BOT-2d, DEFER, CKPT).

### Sprint 280 — L-küme: Human-Interaction Wire + KÖK-SEBEP timeout fix ⚠️ (7/10 + 2 kök-fix, supervised)
- **Bağlam:** Sabah Alperen aktifken koştu (supervised). 10-task L-küme planlandı (REPL /mcp · PLANOBS-001/002/004/005 · APPROVE-007b · 2 doc), 3-wave dependency. Wave makinesi + dependency-parse + TOPP continuous-dispatch **doğru çalıştı** (001-004 paralel, 005-008 deps-clear-oldukça, kademeli spawn).
- **🔴 007 (PLANOBS-005, opus high) ~20dk'da TIMEOUT-öldü** → Alperen "neden?" sordu → **KÖK-SEBEP avı:**
  - `emitTimeoutEvents` (brainEstimateTimeout'u çağıran TEK fonksiyon) **0-caller DORMANT** idi → adaptive per-task timeout hiç hesaplanmıyordu → her worker `spawn-backend-docker.ts: effectiveTimeout = taskTimeoutSeconds ?? this.timeoutSeconds` ile statik **docker_timeout (default 1200s=20dk)**'a düşüyordu. docker_timeout adaptive'i "eziyordu" çünkü **adaptive hiç wire değildi** (Alperen'in sezgisi birebir doğru).
- **🔧 Kök-sebep fix (a) — adaptive timeout wire (`9f966eeb`):** emitTimeoutEvents artık `timeoutSeconds` döndürür; `spawnWorkers`+`respawnEligibleTasks` her task için hesaplayıp `taskTimeoutSeconds`'ı spawn opts'a geçirir (ProviderSpawnOptions + SpawnBackendOptions); docker_timeout artık FALLBACK. **fail-safe** (`bd29abd4`): partial-config mock'lu testler newly-live path'e girip patladı (cascade 33→25 file) → try/catch ile estimate best-effort yapıldı. 4 test (spawn-timeout-wiring).
- **🔧 Kök-sebep fix (b) — MRR FIX-deadlock (`9f966eeb`):** `respawnEligibleTasks` `doneTasks = status===DONE` only → MANUAL_REVIEW_REQUIRED (timeout-disk-kanıtlı) upstream dependent'ı sonsuz blokeliyordu → 009/010 dispatch olmadı, EXECUTE wave sprint-timeout'a kadar idle, FIX hiç başlamadı (Alperen'in gördüğü "düğüm"). Fix: MRR'yi dependency-satisfying say. 4 test (respawn-mrr-unblock).
- **⚙️ Timeout no-limit config (Alperen "timeout 0"):** `.deckent/config.json` → `sprint_timeout_minutes:0` (unlimited) + `docker_timeout:86400` + `timeout.docker_min/max 86100/86400` (24h tavan = fiilen sınırsız; gerçek-hang yine 24h backstop). Backup: `config.json.bak-pre-timeout0`.
- **Teslimat (disk-verified, tsc temiz, build:all ✅ 2282 modül):** 001 PLANOBS-001 PROGRESS channel (9t), 002 PLANOBS-002 notify progress/phase-change (10t), 003 APPROVE-007b transport (10t), **004 REPL /mcp broker wire — G1 KAPANDI** (13t, GO_WITH_TECH_DEBT-ama-güçlü), 005 PROGRESS emit 2/3-site (14t, PRE_VITEST plugin-hooks core/'da scope-dışı), 006 PLANOBS-004 planner notify+spinner (9t), 008 nervous /edit (11t). **007 (PLANOBS-005) REVERT** — timeout+test-collection-hang, doğrulanamaz, kritik start-path → `.deckent/planobs-005-wip.patch` saklandı, carry-forward.
- **Sprint deadlock manuel finalize:** 007-MRR deadlock'ta (Alperen onayıyla) TaskStop + sprint-state→COMPLETED + stale heartbeat.pid/sprint.lock temizlendi (orphan-state gotcha'sına karşı).
- **Regresyon: NET-ZERO yeni.** Full-suite 33→25 file (fail-safe sonrası); kalan 25 **pre-280 src'de (3e5b7618) BİREBİR fail** = pre-existing baseline (zero-hardcode limit-ledger.ts yorumu/S273, error-handling capability-broker.ts throw, builtin-skills .deckent-mirror drift, + bilinen mcp-help/serve/doctor/sprint-controller/nervous-faz1/tmux-cli-bin flaky). Kendi 8 testim + dokunduğum modüllerin mevcut testleri yeşil.

**⚠️ Sabah için bulgular (Alperen oku):**
1. **DORMANT-CODE ZİNCİRİ tehlikeli:** emitTimeoutEvents Sprint 145'ten beri 0-caller'dı → adaptive timeout sistemi (timeout-estimator + clamp + effort_base) hep ölü, herkes 20dk docker_timeout'la koşuyordu. "Kanıt-letter vs goal" + 0-caller dormant deseninin canlı bedeli. **Genel risk:** kaç sistem daha "var ama 0-caller"? (event-stream PROGRESS de bu sprintte wire edildi.)
2. **PLANOBS-005 carry-forward:** start dual-plan kaldırma + .tasks cache değerli ama opus-high + kritik-path; sonraki sprint'te tek-başına + bol-timeout (artık no-limit) ile yeniden. Patch hazır.
3. **DEFER kümesi (L kalan):** DEFER-001 (autonomous API endpoint), DEFER-002 (nervous MCP undo/edit) + DASH (§4G) hâlâ açık.

- **`deckent finalize --force` çalıştırıldı (Alperen isteği).** Sonraki: K-küme.

---
_(Yeni girişler en alta eklenir. Başarısızlıkta: ne oldu, kök-neden, alınan aksiyon, kalan risk.)_
