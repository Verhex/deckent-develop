# 🌅 SABAH RAPORU — Gece-koşusu 2026-07-01→02 (Fable otonom, 08:00 teslimi)

## Skor-özeti
- **9 sprint** (348→356), **~104 task işlendi**, **15+ commit origin/main'e push'lu**, her sprint-sonrası `build:all` yeşil.
- Son dört büyük sprint: 352=15/15 · 353=**16/16 kusursuz** · 354=15/15 · 355=**15/15 kusursuz** · 356=15/15.
- Sonnet 5 işçilik: bağımsız-agent değerlendirmeleri 4–4.5/5; dürüst self-assessment kültürü kanıtlı (spec-hatalarımı iki kez worker yakaladı).

## Push'lanmış commit'ler (origin/main, kronolojik)
85bff71d MOAT-2 orphan-start (child.unref+SIGKILL-escalation, e2e-proven) · da797b2a ADR-injection-taxonomy ×6 + busy_timeout · e9427160 sprint-348 W0 8-12 (**W0 12/12 KOMPLE**) · c53f399a PCOMP P0 (W1/W2/W3/W4/W6) · ec91a409 agent/skill Karpathy-hijyen + W5 role-signal + secure-coding skill · b357879d sprint-349 + G-006 granülarite-kök-fix · 21e6a9dd sprint-350 (TRN 3×0-caller + APR-CONTRACT + SIGTERM) · 06c9a6ac sprint-351 (12/18) + EVAL-DEBT-CEILING · (EXECUTE-ERROR-SURFACE fix) · sprint-352 wrap · sprint-353 wrap (**APR-ailesi saf-çekirdek KOMPLE**) · sprint-354 wrap (WIRING: REPL/worker/deck flag-gated) · sprint-355 wrap (live-trace + onay-kanalları + born-427/428) · sprint-356 wrap (dashboard-approvals + taxonomy-readpath + onboarding-P1) · 8b0cfc28 stabilizasyon-1 (katalog-drift: core+orchestra 13,305 yeşil) · da7c8717 stabilizasyon-2 (kadim-suite tasfiyesi + doc-parity + time-bomb-fixture + registry-sync → REPO TAM-YEŞİL: ~1,681 dosya / ~25,330 test).

## Pillar-ilerlemesi (pivot-P0'lar)
- **APR: kontrattan yüzeye TAM ZİNCİR** — contract→broker→policy→store→relay→eventstream→workergate→fallback→masking→expiry + kanallar (telegram/terminal/nervous) + Ink approval-card + dual-stream + /api/approvals + dashboard-paneli (izleme). decide-API flag'li.
- **TOOL:** registry (MCP-seed) → search/describe/planCall → core-7 eager + defer-indeks → dispatch-köprüsü → REPL tool-yüzeyi (flag'li).
- **TERM:** health-snapshot · command-registry (kategori/risk) · live-footer+state-feed(+progress) · Ask/Run/Control · ChatTurnQueue (+bg-turns wire) · connect-wizard(+komut) · directives-builder (round-trip format-SSOT = DIRECTIVES 0-kırılganlık temeli) · golden-flow (+`deckent do` dry-run) · `plan-nl`.
- **TRN:** 3×0-caller wire (sprint/REPL/extractor-CLI) + ShareGPT-pipeline + corpus-lint. (Hepsi flag'li, default-off.)
- **MOAT/GOV:** MOAT-2 ✅ (e2e) · MOAT-3 ✅ (NOT_DISPATCHED + FIX-re-dispatch) · SIGTERM-CLEANUP ✅ · PGID-teardown ✅ · SPAWNLOCK-TOCTOU ✅ · rollback wire-or-kill ✅ · DeckBroker çekirdeği+wire (flag) ✅ · taxonomy-readpath (160) ✅ · SPAWN-throw-lifecycle (435) ✅.

## Kritik keşifler + fix'ler (hepsi kanıt-zincirli, hepsi commit'li)
1. **ADR-injection yeni-taksonomide kırıktı** → 6-fix; canlı-prompt'ta governing-pin doğrulandı.
2. **finalize "database is locked" sessiz-kaybı** → busy_timeout; 349'dan beri arşivler istikrarlı.
3. **G-006 FP-fabrikası** (scope-match dizin-granülaritesi) → file-level kesişim; canlı: artık seçilmiyor.
4. **W4 tiered-injection canlı:** prompt 45-56KB → 20-26KB (%55), governing tam-gövde korunur.
5. **EVAL-DEBT-CEILING** (350-003 vakası): dürüst-DEBT artık TAVAN; debt-ledger kayıt üretiyor (352'de canlı-doğrulandı) — politika sabah-onayında.
6. **EVAL-AUDIT-DEAD-CALL**: 60-sprint'lik ölü audit-trail canlandırıldı (352-003).
7. **EXECUTE-ERROR-SURFACE** (351 canlı-vakası): EXECUTE-throw yutması + dashboard-kanıt-ezmesi görünür kılındı; 350-002 finalize-fix'i canlıda İŞE YARADI (351'in finalize-TypeError'u görünür → filesChanged-shape fix).
8. **SCHED:** tick-zırhı + planContinuous dep-drop fix (352-002) — 351'in 6-task dispatch-kaybı 352+'da tekrarlamadı.
9. 🔴 **NPM-GUARD olayı (356):** worker mount'lu workspace'te npm-install koştu → ignore-scripts + ABI ile better-sqlite3 binding'i SİLİNDİ (tüm DB çöktü). CC onardı (`npm rebuild --ignore-scripts=false`), fail-neden worker-log'da yakalandı, born-454 (fiziksel npm-engeli) açıldı.
10. Stabilizasyon-taraması: gece-inişlerinin katalog-drift'leri (TaskEvaluation=5, v3→v2 etiketi, purged-manifest, secure-coding Anti-Patterns, token-counter 1M-parite) güncellendi; directives-builder generic-throw'ları DECKENT_E074 typed-error'a çevrildi.

## Sabah onay/karar listesi
1. **Flag-açma kararları** (hepsi kod-inmiş, default-off): repl_surface(+approvals/bg_turns) · tool_surface · approval_gate · deck_broker · training_trace/live_trace · routing.kindAffinity (W5C) · routing.languagePenalty (WM-7) · approval.api_decide · nervous.approval_bridge. Önerim: önce repl_surface+tool_surface'ı dogfood'da aç, approval_gate'i policy-kurallarıyla birlikte aç.
2. **EVAL-DEBT-CEILING politikası** onayı (dürüst-DEBT=tavan; 3 eski test yeni-politikaya çevrildi).
3. Tier-1 Smoke'lar: 4/4'ünü ben koştum ✓ (trace extract / plan-nl / connect --json / do — gerçek dist). KALAN sende: serve+GET /api/approvals (port bağlar) · doctor --fix --yes (mutasyonlu) · deckent do --run ilk-canlı-akış.
4. **NPM-GUARD (born-454) 🔴** tasarım-onayı: worker-container'da npm-install fiziksel-engeli (PATH-shim vs RO-mount).
5. AFFINITY-DEFAULT-DECISION (ADR-G-006).
6. `deckent do --run` gerçek-akış ilk canlı-denemesi (dry-run testli; --run'ı birlikte deneyelim).

## Bilinen-açık kalanlar (takipte)
- born-452 kök-istisna metni hâlâ meçhul (enstrüman canlı; tekrarında stack düşecek).
- 203/207 🟡 dilim-devamları (doctor--fix genişletme, PKG-SSOT kalan çağrı-noktaları) + 356-001/008 debt-notları.
- DEBT-LEDGER self-DEBT kapsaması 354-011'de fix'lendi — 356'nın 3 debt'inin kayıtlarını sabah birlikte doğrulayalım.
