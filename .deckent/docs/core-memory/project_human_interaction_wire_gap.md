---
name: project_human_interaction_wire_gap
description: "deckent \"safe-but-deaf\" — feedback/approval/control wire boşlukları analizi + 8-epic/19-task plan (MASTER-PLAN §4G / W-L)"
metadata: 
  node_type: memory
  type: project
  originSessionId: a868366e-0d80-454d-b26b-1408b1c394e1
---

Ultracode 10-yüzey audit (2026-06-05): deckent **SAFE-BUT-DEAF** — karar verir, diske persist eder, onayı doğru park eder (ADR-040 no-auto-approve + ADR-037 default-deny sağlam) ama pure-CLI/REPL koşumda kararları operatöre **surface etmez** ve accept/reject **solicit etmez**. 52 aday → 44 doğrulanmış gap → dedup ~18 distinct → **8 epic / 19 task** (DIRECTIVES-hazır, tek-wave parallel-safe).

**İki P0 kök-neden:**
1. `NotifyDispatcher` yalnız `mcp/server.ts:116,156`'te init → `deckent start` CLI sprint'inde `getGlobalNotifyDispatcher()` null → her `notify()` (task-done/finalized/**human-checkpoint-required**) sessiz no-op. Tek fix 5+ gap açar.
2. Autonomous+nervous park edilen onaylar CLI/REPL accept/reject yüzeysiz: `autonomous.ts:96` `approvalGate`'i ıskartaya atıyor. **Producer-first:** `approval-adapter.ts:119-133` accept/reject in-memory, persist YOK → ayrı process çalışan loop'a ulaşamaz → **APPROVE-001 (dosya-aracılı çözüm) CLI subcommand'den ÖNCE inmeli**. Nervous: `executor.ts` `nervous-pending.json` hiç yazmaz + `ipc-queue.startPolling` 0-prod-caller.

**Diğer:** `kill --all` onaysız cascade (P0, `--user-explicit` okunmuyor); dashboard Kill-All butonu kırık (var olmayan `worker-all` penceresi, 500 sessiz yutulur); `chat-mcp-bridge` (S229-005) REPL'e import edilmemiş (no `/mcp`); nervous/checkpoint/config-nervous/slash-registry i18n bypass; Discord/Telegram connector 0-instantiation + legacy notify_channel config ölü.

**Honest-deferral (defect DEĞİL):** autonomous MCP/API (S9 remote/OAuth, ADR-071 proposed), askBrain auto-continue (ipc-registry.ts:223 yorumlu), output-stream SSE (Sprint 140 hook), nervous MCP undo/edit (P2 fırsatçı).

Tam plan + file:line + task tablosu: **docs/MASTER-PLAN.md §4G** + §7 **W-L**. Sıra: WIRE→APPROVE→CONFIRM→MSG→REPL→DASH→BOT→DEFER. İlgili: [[project_native_repl_tool_parity_gap]], [[feedback_proof_of_function_dod]], [[feedback_god_level_i18n_quality_bar]].

**İlerleme (2026-06-05, hand-code TDD):**
- ✅ **WIRE-001/002** (commit b955da0d): `bootstrapNotifyDispatcher` (core/notify-bootstrap.ts) — CLI `start`+detached runner+MCP delege; pure-CLI notify() artık terminale+notify-log.jsonl. 5 hermetik test.
- ✅ **APPROVE-001/002/003** (commit 15320e2d): approval-adapter `decisions.json` cross-process çözüm (gate-seviyesi doğru+test'li, ADR-040 korundu) + `deckent autonomous approve/reject/pending` CLI + `makeTickReporter` feedback/park-notify. 12 test, TDD. 10 yeni autonomous.* i18n key.
- ✅ **APPROVE-006 ÇÖZÜLDÜ — run-on-approve (commit afb2caa2, Alperen seçimi B):** keşfedilen delik (`trigger-adapter.ts:93` id nextRun-gömülü → re-fire'da karar tüketilmiyordu) runtime re-drive ile kapatıldı: gate `takeResolved()` (disk decisions.json okur=cross-process, sadece-decided=busy-loop yok, tüketmez) + trigger-source `resolvedProvider` (disabled'dan/flow'dan önce) + `buildAutonomousRuntime` wire. Onay ~1 tick'te execute. Trigger identity değişmedi. TDD 7/7 (takeResolved + re-drive + **bundle-wiring** + **end-to-end** park→approve→re-drive→handler-fired). **Autonomous onay zinciri artık uçtan-uca CANLI.**
- ✅ **CONFIRM-001/002** (commit 3beb0ce1): `kill --all` + `agent delete` onay kapısı (inject-edilebilir gate, `--force`/`--user-explicit` bypass, non-TTY→flag-zorunlu). TDD 7 test + Tier-1 smoke. i18n. Mevcut cascade testleri flag opt-in ile güncellendi.
- ✅ **MSG epic** (002/003/004, commit'ler 59122738·1f90e8f5·e5e61b18·b24ed580·47bd26d2): nervous/checkpoint/config-nervous CLI+REPL i18n-FIRST retrofit (~75 yeni key, `--lang`, `langOf()` commander-fix, PRESET_DESCRIPTIONS→i18n, 'TRT'/TR-timeAgo temizlik). MSG-001: getMessage zaten string alıyor→i18n.ts dokunulmadı. ~17 test + Tier-1 smoke. **Ders:** MSG-002'yi subset-test'le commit'ledim→5 test regresyon (REPL session-lang wire + lang='tr' testlerle düzeltildi). **Kural:** messages.ts gibi paylaşılan-path değişiminde commit ÖNCESİ full `npx vitest run` ([[project_ci_green_root_causes]]).
- ✅ **APPROVE-004/005** (commit 220f607d, TDD, nervous opt-in): executor DI `PendingApprovalStore`→`nervous-pending.json` (CLI/REPL parked'ı görür) + bootstrap `startPolling(resolveApproval)` (MCP IPC onayları çözülür) + dispose. Cross-process doğru (file-IPC, poller executor-process'inde). 10 test. **Aktivasyon opt-in** (deckent-dev'de KAPALI).
- ✅ **APPROVE-007** (commit e00579ee, TDD; Alperen seçimi C-lite+tek-yazar): CLI accept/reject canlı executor'a `writeApproval`→poller→`resolveApproval`→**execute** route eder (executor pending+history tek-yazarı → race kalktı); executor-yok→accept dismiss+uyarı ('accepted' history YAZMAZ=audit-dürüst), reject 'rejected'. Liveness=heartbeat (raw-pid değil; bootstrap 2s unref+dispose temizler). Kanıt: nervous-ipc-route 3/3 (CLI-unit + **integration real-poller execution**). TOCTOU sınırı dürüst belirtildi. **Kalan APPROVE-007b:** REPL bridge + handleEdit (modified-payload IPC).
- ⬜ Kalan: REPL-001/002 (⚠ Ink çakışır) · DASH-001/002 (⚠ api/dashboard çakışır) · BOT-001/002 (çakışmaz) · APPROVE-007b.

**Yürütme modu (Alperen 2026-06-05):** ultracode DEĞİL — **inline TDD + advisor** (kalite-öncelik, epic-epic, ayrı commit). Çok-terminal: REPL(Ink)/DASH(api/dashboard) diğer terminalle çakışır; MSG/BOT/APPROVE-nervous çakışmaz.

**Önemli ders (advisor):** "hook tanımlı ama bağlanmamış" = bu epic'in tüm sebebi → her wire'ı **composition-root üzerinden** (buildAutonomousRuntime) test et, sadece injected-mock'la değil; yoksa yeşil suite ile aynı bug-class'ı shipler'sin.
