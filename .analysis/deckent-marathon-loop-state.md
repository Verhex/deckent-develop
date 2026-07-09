# Deckent Dogfood Maraton — Loop-State (SSOT, compaction-dayanıklı)

> **Amaç:** Bu doküman, çok-sprintli dogfood maratonunun canlı durumunu tutar. Context compact/clear olsa da buradan kayıpsız devam edilir. Her sprint sonrası güncellenir.
> **Rol:** Ben (Fable) = Süreç Yöneticisi / Brain (structured-plan + bağımsız verify). İşçiler = Sonnet (8 paralel, ~15-20 task / 3 wave). born-* devirli.
> **Başlangıç:** 2026-07-08 · Alperen onaylı.

## Kaynak dokümanlar (bitecek iş evreni)
1. `.analysis/deckent-repl-code-review-2026-07-08.md` — 118 REPL bulgu (1 P0 · 30 P1 · 53 P2 · 33 P3)
2. `.analysis/deckent-full-code-self-analysis-2026-07-07.md` — unwired/governance/cross-platform audit
3. `.analysis/deckent-repl-findings-board.html` · `.analysis/deckent-capability-map.html` — görsel türev (takip panosu)
4. `docs/MASTER-PLAN.md` — ~40 açık madde (born-434…507 aralığı + yeni)
- **Birleşik born-backlog SSOT:** `.../scratchpad/born-backlog.json` (reconciliation ajanı üretiyor; dedupe'li)

## Bağlayıcı disiplin (her sprint)
- **Model:** worker=sonnet (per-task `Model: sonnet`), plan=`--structured` (Brain-LLM yok). Verify=ben (Fable).
- **Doğrulama:** worker-DONE'a güvenme → yeni test + `tsc`(npm run lint) + gate + disk-verify (`git diff --stat`/`git ls-files`). User-truth: wire-on gerçekten AÇIK+kontrollü olmadan ✅ yok.
- **Kazanım-koruma:** her sprint sonrası **commit** (`git branch -vv` önce); worker git-revert edemesin.
- **Usage:** maraton-öncesi + her 2-3 sprint probe; Fable-hafta ≥%95 → DUR + Alperen'e haber.
- **Sınırlar:** sprint'te build/login YOK (build+`/mcp restart`=Alperen) · kill/cleanup=Alperen onayı · `.brain/memory.db` dokunulmaz · `.tasks/` rm yok (archive) · self-git-mutation koruması dist'te aktif.
- **DIRECTIVES header:** `🔒 BAĞLAYICI` = DISTINCT-FILE (paylaşılan hot-dosyalar kapalı: sprint-planner/result-evaluator/sprint-phases/result-collector/sprint-controller/server.ts/config.ts) + `git stash/reset YASAK (born-499)` + hermetik test + i18n getMessage + honest.
- **No-fix-only:** her sprint ≥1 wire/vizyon task.
- **🔴 BORN-DEDUP (2026-07-08, sprint-386 dersi — ZORUNLU):** DIRECTIVES yazmadan ÖNCE aday born-id'leri **tamamlanmışlara karşı dedup et.** born-backlog.json'da completion-status ALANI YOK → tamamlanmışlar sessizce yeniden dispatch olur. Sprint-386 tam bunu yaptı: SPRINT-3 = sprint-383'ün AYNI 8 item'ı (383'te fix'li), worker'lar "already done" deyip 0-değişim → 6 NO_GO + koca sprint israf. **Kural:** sprint-arşivlerini (`.brain/archive/sprints/*/task-*.{json,result}`) tara → **DONE + disk-evidence** (LP-10 sonrası `filesChanged` non-empty; salt worker-DONE YETMEZ, 386 false-DONE'ları gibi) taşıyan born-id'leri DÜŞ; yalnız **OPEN** item queue et. **Anlık durum (2026-07-08, sprint-388 sonrası):** 103 born → **66 zaten-DONE / 37 OPEN**. Sprint-387 (27) + Sprint-388 (13) kapadı. **388'in 13'ü (DONE-set'e ekle):** 533 528 527 521 536 540 547 556 557 578 531 504 506. Sıradaki sprint KALAN 37 OPEN'dan (örn. 494 dash-perf, 502 builtins-reconcile [karar-gerek], 517 i18n-sweep, 529 530 537 541 548 575 579 583 + greenfield 496/497 + Windows-cluster 580 [sub-slice] + closed-hot-file single-owner 560/562/565/572/582); **387/388-item'larını TEKRAR ETME.**

## Ortam durumu (2026-07-08 kurulum)
- Repo `/home/alperen/deckent-dev`, `main` @ (WIP-commit sonrası) origin ile hizalı.
- WIP commit'lendi: `101da0d9` (REPL native-agent feature 32 dosya) + `ef8d4acd` (analiz 8 dosya).
- Sprint-380 iptal (3 DRAFT → `.tasks/archive/sprint-380-cancelled/`); `.tasks/` boş; "Aktif sprint yok".
- `.deckent/config.json` = `{}` → model per-task DIRECTIVES'ten.
- tsc/lint yeşil (i18n·layer-shims·hermetic·routing).
- **Usage baseline (07-08):** session %38 (reset bu gece 02:20) · hafta-tümü %59 · **hafta-Fable %75** (reset 13 Tem 20:00). Headroom ~%20 Fable.

## born-backlog SSOT
`.../scratchpad/born-backlog.json` — **103 madde** (14 P0 · 40 P1 · 37 P2 · 12 P3); 76 yeni born-508…583 + 27 mevcut MASTER-PLAN'a katlı. Tüm 118 REPL bulgusu hesapta (2 refute-drop, 1 downgrade). Disk-verify-çelişkili "DONE" satırlar ayrı-born (WorkerApprovalGate 34/70, TERM-RPC 54, F2-008 60, DEFER-002 75).

## 🎯 MARATHON GOAL — otonom loop (kalan iş; 2026-07-08 gece, Alperen "goal'e ekle" + "goal'a başla dediğimde koş")
> **Tetik:** Alperen "goal'a başla" DEYİNCE otonom loop koşar (yatıyor; build gerektikçe BEN yaparım, /mcp restart gereksiz — CLI'dan güncel-dist okur). Başlamadan bu goal + teyit hazır. Sıra: **(a) prompt-gate G-serisi el-kod → (c) governance-wire el-kod → (b) born-sprint döngüsü** (dogfood-gate ile).
>
> **(a) Prompt-gate G-serisi (BEN el-kod):**
> - ~~**G1c** premise-groundtruth~~ ✅ TESLİM (commit `d5f8fb33`) — gate→repo-aware (`probeRepo` bounded git-grep); "X eksik/yok/missing" code-symbol iddiası repo'da varsa WARN. Konservatif (camelCase-hump ŞART, /i yok), WARN-only. Smoke: 'resolveTokenUsage is missing'→"occurs 8×". 22 test.
> - **G3** operation→persona routing: **MEVCUT** (`getKindAffinityBonus` routing-engine.ts:846, refactorer +3-refactor/-2-code-dev, **config-gated default-off**). = "observe-then-flip" (R-1 disiplini — blind autonomous flip YAPMA). Gate G1a plan-time symptom'u zaten yakalıyor + G2b prompt'u mitige ediyor. **Alperen: shadow-observe→flip kararı.**
> - **R-5/R-5a** ⏸️ ERTELENDİ (F1.3 IDF + G5 tier-split ADR-over-injection'ı zaten çözdü → marjinal). d-004-narrow + ADR prompt_summary düşük-öncelik.
>
> **(c) Governance-wire (BEN el-kod — subagent-haritası: NOT sprint-phases edit):**
> - ~~**born-562 #5** restoreFromSnapshot~~ ✅ TESLİM (commit `ae469d6c`) — `deckent recover --restore-tasks` rollback (i18n, gerçek-binary smoke).
> - **born-560** RBAC→SPAWN: `authorizeExecution`→`sprint-spawner.ts` (~:557, blockedTaskIds-deseni), `config.enforce_rbac` default-off. ⏸️ **Alperen-denetim:** "rbac persist"=AuthorityAuditContext açık-tasarım-sorusu (blind yapılmadı). Enforcement-gate güvenli (dormant), persist ertelendi.
> - **born-562 kalanı** ⏸️ **Alperen-denetim** (hot-file / involved): (1) cost_guard→sprint-controller HOT + shouldStopDispatch-consume · (2) resumeSprint→resume.ts Sprint-reconstruction gerek · (3) ApprovalExpiryDriver **BLOKELİ** (persistent broker yok) · (4) resolveTokenUsage→result-collector HOT (token-accuracy). **Otonom-blind hot-file surgery YAPILMADI** (advisor+kullanıcı disiplini).
>
> **(b) Born-sprint döngüsü (worker=sonnet, 37 OPEN, dedup ∅):** 494 502 517 529 530 537 541 548 575 579 583 + greenfield 496/497 + Windows-cluster 580 (sub-slice) + closed-hot single-owner 565/572/582. Her sprint: DIRECTIVES→dogfood-gate (plan --dry-run WARN/BLOCK gör→persona düzelt)→start→disk-verify→commit→build (sprint-arası, BEN).
>
> **🆕 İŞ-PLANI EKLENDİ (Alperen, 2026-07-09):** **DB enterprise/team-seviye yükseltme + DB-içi kapsamlı analiz.** Kapsam: multi-tenant izolasyon · concurrency/WAL · per-tenant/team RBAC-scoped sorgu · backup/restore · retention/decay · şema-audit. **KISIT:** karar-verilmiş `better-sqlite evrim + sqlite-vec opt-in` yönünde (ADR-G-035 — Postgres/vector-DB REDDEDİLDİ, [[project_persistence_direction_sqlite_evolution]]). Governance-hot (RBAC/tenant, born-563) ile bağlı. Önce 3-step governance-hot, sonra bu DB-analiz turu (MASTER-PLAN'a formalize edilecek).
>
> ### 🏛️ GOVERNANCE-HOT (2026-07-09, Alperen "tamamı onaylandı" — adım-adım el-kod)
> - **Step-1 born-560 RBAC-gate ✅ SHIP (`18908fae`):** ADR-037 authority-matrix SPAWN-mainline'a wire (spawnWorkers). Dormant default-off (enforce_rbac=false → soft-warn+audit, blok yok; actor.role'süz permit). Mevcut altyapı reuse (checkSprintSpawnRbac+inferRequirements). 8 test + 108 regresyon yeşil.
> - **Step-3 born-562 cost_guard→dispatch-loop ✅ SHIP (`03827c2f`):** `checkMidSprintCostGuard`+`createCostGuardMonitor` (sprint-phases) tam-implement+testli ama 0-caller (unwired) → `waitForResults` dispatch-loop'una wire (`loadCostGuardMonitor` lazy dynamic-import = loadRespawn deseni, cycle-safe). Dormant default-off (cost_guard.enabled=false → undefined → import/interval YOK, gate hep-açık = SIFIR-regresyon). Enabled+limit-aşımı → yeni-dispatch durur, in-flight biter, kalan NOT_DISPATCHED. Landmine-YOK (dormant + limit-ledger doğru-scope). 4 gate-test + 72+50 no-regression yeşil. **+ HANG-FIX (`a7ebfadb`, advisor-catch):** cost-stop'ta un-dispatched hiç report etmez → tek-break (collected===total) `sprint_timeout_minutes:0`(unlimited)'da SONSUZ-HANG'di → 2. break eklendi (in-flight drain olunca complete; `costGuardShouldComplete` pure+9-test; un-dispatched→NOT_DISPATCHED doğrulandı). **BİLİNEN BOŞLUK (enable-öncesi):** (a) enabled-trip live-waitForResults integration-test YOK (disabled-path inert-kanıtlı, active-path reasoned-only) · (b) `drainNervousRespawns` gate-öncesi (nervous-respawn cost-stop'lanmıyor — partial).
> - **Step-2 born-562 resolveTokenUsage→result-collector 🔴 SHIP EDİLMEDİ (defer, regresyon-riski):** Naif-wire ZARARLI. `resolveTokenUsage`'ın değeri = `readNativeUsage` (session-store) ama (a) per-task **sessionId capture YOK** (claude-spawn `--session-id` geçmiyor) → `resolveSessionFile` newest-by-mtime seçer → paralel-sprint'te **yanlış-task session'ı** eşler (mevcut tier'lar `task-{id}.log`-keyed = per-task-DOĞRU; onları demote etmek regresyon). (b) session-store'un "tek benzersiz" `cacheCreationTokens`'ı ZATEN `extractTokenUsageFromClaudeCli` (token-counter:93) task-envelope'ta var → result-collector için resolveTokenUsage **gereksiz+zararlı**. Doğru-kullanımı: sessionId'yi zaten tutan caller. **Prerequisite (Alperen-greenlight'sız yapılmadı):** spawn'da per-task claude-session-id capture (ayrı born, hot spawn-path). Detay: [[project_gitguard_vs_authtest_path_reds]]-komşusu yeni memory.
>
> **Bağlayıcı (değişmez):** worker=sonnet · dedup-∅ (66/103 DONE'a karşı) · disk-verify ground-truth (Brain sentetik-NO_GO'ya güvenme, race-artifaktı disk-DONE override) · git-guard CANLI · her sprint commit (`git branch -vv` önce) · sprint'te build/login YOK · build BEN (sprint-arası) · usage: Fable-hafta ≥%95→DUR+haber (şu an headroom-iyi, Sonnet-ağırlıklı) · i18n-first · hermetik-test.

## Sprint günlüğü (canlı — her sprint sonrası satır ekle)
> **Devir güncel:** 103 born → **73 DONE / 30 OPEN** (387:27 + 388:13 + 389:7 = 47 born kapandı). Sprint-389 (S6): 529 530 537 541 548 575 583 — disk-verify 7/7 (56 yeni+25 regresyon test yeşil, tsc temiz; Brain 6 DONE/1 DEBT/0 NO_GO); dogfood-gate 575/583 security-auditor→api-builder düzeltti. Commit: `6c204ae9`.
>
> ### 🌙 OTONOM-LOOP WIND-DOWN (2026-07-09 gece, güvenli-zarf-sınırı) — Alperen sabah-oversight bekliyor
> **Ne yapıldı (goal-başla→wind-down):** (a) G1c ✅ `d5f8fb33` + G3-observe-flip-note + R-5-defer · (c) 562#5 restoreFromSnapshot ✅ `ae469d6c` · (b) 3 born-sprint (387/388/389 = **47 born, 73/103**). Toplam session: G1a/G1d/G2/G5/G1c prompt-gate + LP-9 + 5 sprint + born-dedup. Hepsi test+smoke+commit+build.
> **NEDEN durdu:** temiz worker-appropriate backlog incelmiş; **kalan iş güvenli-otonom-zarfı DIŞINDA** → Alperen-oversight-ister:
> - **Hot-file governance (BEN el-kod, oversight):** 560 RBAC (rbac-persist açık-tasarım-Q) · 562-kalanı (cost_guard→sprint-controller HOT · resolveTokenUsage→result-collector HOT · resumeSprint→Sprint-reconstruction · ApprovalExpiryDriver BLOKELİ). Reçeteler goal-doc'ta. **Blind-autonomous YAPILMADI.**
> - **Routing-flip (Alperen-karar):** G3 = `getKindAffinityBonus` shadow-observe→flip (R-1 disiplini).
> - **Greenfield (mimari-karar):** 496 Electron · 497 enterprise-extraction.
> - **Belirsiz/büyük:** 517 i18n-sweep (i18n-lint ZATEN temiz → değer-belirsiz, önce doğrula) · 494 dash-perf (vite-fiddly) · 502 builtins-reconcile (canonical-karar).
> **Devam için:** born-worker-sprint yeni-clean-item kalmadı; sıradaki ilerleme ya hot-file-governance (BEN, oversight'la) ya greenfield (mimari) ya routing-flip (karar). Alperen yön versin.
>
> ### 🔄 LOOP-RESUME (2026-07-09, Alperen "işleri loop goal olarak devam et") — result-file dedup ground-truth
> **Düzeltilmiş dedup (result-file bazlı, grep DEĞİL — advisor blocking-emphasis):** tüm `.brain/archive/sprints/*/task-*.{json,result}` tarandı → title→primary-born + `selfAssessment==DONE && filesChanged-nonempty`. Sonuç: **79 TRUE-DONE · 15 debt-landed (GO_WITH_TECH_DEBT+tests-pass+disk = dedup'ta DONE-say, 386-israfı riski) · 39 OPEN.** Wind-down'ın "temiz-item kalmadı"ı ~doğru: 387 gerçekten 510/511/519/520/532/542/550/552/564/567/568/571/577/581'i KAPATMIŞ (önceki overcount-liste yanlıştı).
> **39 OPEN sınıflaması:** temiz-worker(~6: 501·565·576·579·580·500) · governance-HOT-park(560·562·582·565-partial) · greenfield-park(496·497·502) · Alperen-gated(63·202·488·498·477·64·82·490) · big-partial(83·493·503·563 debt-landed-kısmi) · doc(489·495·507·500) · defer(572 server.ts-çift-owner · 570 no-file/karar · 494 vite · 517 lint-clean-belirsiz).
> **Sprint-390 (S7) ✅ TESLİM (`03adf3e4`):** 501·565·576·579·580·500 — disk-verify **6/6 GERÇEK** (63 dosya/1412+ [6346-satır telemetri hariç], 5 yeni test + audit). Brain 6 DONE/2 DEBT/0 NO_GO/10m41s. tsc+i18n+layer+hermetic+routing yeşil · 33 yeni test · api/providers/cli-doctor+entry regresyon temiz · Tier-1 real-binary smoke (501 pipe→exit0/crash-log 3→3 · 576 dist/sdk built+resolve · 579 pre-flight exit0). prompt-gate plan-time TEMİZ. 0 boundary-violation (scope-dışı "63 dosya" = deckent-managed: managed-docs/memory-export/agent-skill-stats). **Devir: 47→53 born.**
>
> ### 🔴 KEŞİF (sprint-390 regresyon-sweep): 3 PRE-EXISTING provider-PATH-red
> Full tests/providers/ sweep açığa çıkardı: **auth-noleak · cred-scrub-all-adapters · cross-provider-keys-scrub** — 3'ü de `env.PATH === process.env.PATH` byte-for-byte assert ediyor (F1-014, Sprint-333) ama **born-499 git-guard** (`68072ad2`/`e41b56af`) shim-dir'i (`/tmp/deckent-git-guard/t-base-<hash>`) child-PATH'e prepend ediyor. **Pre-existing kanıtlı:** subprocess.ts + 3-test sprint-390 diff-DIŞI, HEAD'de zaten kırık; önceki sprint'ler subset-regresyon koştuğu için kaçmış. cred-scrub'ın TÜM secret-scrub assert'leri GEÇİYOR (yalnız byte-for-byte-PATH fail → 580 side-effect DEĞİL, doğrulandı). **Karar (Alperen):** (A) test'leri guard-prefix-bekleyecek şekilde güncelle [guard tüm worker'lara uygulanmalı] · (B) provider-CLI-worker'ları guard'dan MUAF tut [born-499 yalnız deckent'in kendi git-mutating-worker'larını hedefliyordu] — **kod-fix vs test-fix tasarım-kararı; otonom dokunulmadı** (advisor). Yeni-born adayı.
>
> ### 🌙 WIND-DOWN #2 (2026-07-09, sprint-390 sonrası — dürüst dur-koşulu, advisor)
> **Saf-worker-backlog TÜKENDİ.** 39 OPEN → 6 kapandı → ~33 kalan, HEPSİ güvenli-otonom-zarf-DIŞI: governance-hot (560 RBAC·562-cost_guard/resolveTokenUsage/resumeSprint·582·565-partial) · greenfield-mimari (496 Electron·497 enterprise·502 canonical) · Alperen-gated (63·202·488·498·477·64·82·490) · karar (G3 routing-flip·570 enable-or-fail·572 API-RPC-auth) · big-partial (83·493·503·563 debt-landed-kısmi) · doc (489·495·507) · belirsiz (494 vite·517 lint-clean). **Busywork-padding YAPILMADI.** Sıradaki ilerleme = Alperen yön: hot-file-governance (BEN+oversight) / greenfield (mimari) / routing-flip (observe→karar) / 3-red-fix (A-vs-B).
| Sprint | Tema | Task/Wave | Sonuç (DONE/DEBT/NO_GO) | Commit | born-devir | Usage-sonrası |
|---|---|---|---|---|---|---|
| — | (kurulum) | born-backlog inşası | — | 101da0d9·ef8d4acd | — | Fable %75 |
| **380 (S1)** | REPL/GOV crash-kill + wire-on | 14 task / 26dk | **12 DONE + 2 PARTIAL-REDO** (tsc temiz, 14 test/142 yeşil — Fable-verify) | **947473e2** | 573-REDO·518-REDO·born-499-fix | probe-bekliyor |

### 🔴 SPRINT-1 İNCİDENT — born-499 self-mutation NÜKSETTİ (Sprint-2 öncesi mitigasyon ŞART)
- **Ne oldu:** worker'lar paylaşılan-ağaçta `git stash` koştu (DIRECTIVES advisory-yasağa rağmen; runtime-enforce yok) → işin ~yarısı 2 stash'e dağıldı; deckent "15/15 DONE" dedi ama worktree yarımdı. `reset --hard` YOK → sert-kayıp yok.
- **Kurtarma:** stash'ten cerrahi `git checkout stash@{N} -- <yol>` (non-destructive; stash@{0}/{1} KORUNDU); tsc+142-test doğruladı; commit 947473e2.
- **Wrong-path spec-hatam:** born-573 `src/orchestra/worker.ts` (gerçek: `src/agents/worker.ts`) · born-518 `src/providers/provider.ts` (gerçek: `src/core/provider.ts`) — worker'lar o yollarda orphan-helper yarattı; logic+test var ama asıl-site wire yok.
- **🔑 SPRINT-2 KARARI (Alperen):** git-stash-scatter HER sprint tekrarlar. Mitigasyon şart: (a) `deckent start --sandbox` (path-jail, no shared-tree git) · (b) per-worker git-worktree izolasyonu (born-490/MOAT, inşa gerektirir) · (c) wave-sonu ara-commit + worker-prompt sertleştirme. Mitigasyon seçilmeden Sprint-2 BAŞLATMA.
- **Stash durumu:** stash@{0}/{1} hâlâ duruyor (güvenlik-ağı; commit sonrası redundant ama korundu — güven gelince drop).

| **381 (S2a)** | born-499-HARD worker-git-guard (bootstrap) | 1 task / 20dk | **DONE** (exec-smoke proven: stash/reset/checkout/clean→exit97 BLOK, status/diff/show→GEÇER; 3 backend wire'lı; 32 test+tsc yeşil; deckent TECH_DEBT fazla-temkinli) · **scatter YOK** (tek-task) | **68072ad2** | — | probe-bekliyor |

### 🔴 ŞU AN: BUILD-GATE AKTİF (Alperen eylemi bekliyor)
- born-499 guard `68072ad2`'de src'de + doğrulanmış AMA **worker'lar dist'ten koşar → guard CANLI DEĞİL**.
- **Alperen: `npm run build:all` + `/mcp restart`** → guard dist'e iner → çok-task sprint güvenli.
- Build sonrası: usage re-probe → Sprint-2 (born-573-REDO + 518-REDO doğru-yolla + 508 ApprovalCard + 560/562 gov-wire + REPL-P2).
- Not: build ÖNCESİ çok-task sprint = yine scatter riski → BAŞLATMA.

### ✅ BUILD-GATE ÇÖZÜLDÜ — build ARTIK BENDE (otonom loop kuralı, Alperen 2026-07-08)
- **Manuel-build = loop değil.** `npm run build`/`build:all` yetkisi BENDE, sprint'ler ARASINDA (`feedback_autonomous_loop_build_self`). Sprint ÇALIŞIRKEN build hâlâ yasak (ESM-cache). **/mcp restart GEREKSİZ:** CLI'dan sürüyorum → her yeni `deckent start` güncel dist okur.
- **YAPILDI:** `npm run build` EXIT 0 → guard CANLI (dist/orchestra/git-worker-guard.js; docker 5-ref/subprocess 3-ref). GERÇEK exec-smoke: stash/reset/checkout/clean→exit97, status/diff/show→geçer.

| **382 (S2)** | GOV-WIRE REDO + REPL/nervous P1 | 8 task | **8/8 DONE** (guard tuttu, scatter YOK; 56 test yeşil) | 99a8d3f7 | shim-cleanup→490 | — |
| **383 (S3)** | REPL/agent/security P1 | 8 task | **8/8 DONE** (guard tuttu; 44 test yeşil) | 8bcb0e32 | — | Fable ~%75 |
| **386 (dup)** | 383-item TEKRARI (dedup-öncesi) | 12 task / 13dk | **6 DONE / 6 NO_GO** — 6 NO_GO'nun HEPSİ "DUPLICATE of already-completed 383" (worker dürüstçe zaten-yapılmış buldu) → born-dedup kuralının canlı kanıtı | — | — | — |
| **387 (S4) ✅** | BÜYÜK-KESİT REPL/agent/security/core | **27 task** dep-graph'lı (zincir 001→002→003, 001→004; 23 singleton paralel) / 47dk | **disk-verify 27/27 GERÇEK** (89 dosya +7963/-550, 26 yeni test; **623 test yeşil** [325 yeni + 298 regresyon, VITEST_MAX_FORKS=2]; src-tsc+i18n+hermetic+routing temiz; 0 boundary). Brain-eval 18 DONE/6 DEBT/**3 NO_GO=container-restart RACE artifaktı** (016/021/022 disk-DONE+testleri geçiyor, sentetik-NO_GO override) | **e41b56af** (+ LP-9 bd993e34) | 27 born DONE → devir 53/103 | Sonnet-worker (Fable-cap yemedi) |
| **388 (S5) ✅** | REPL/CLI polish (13 distinct-file, dogfood-gate) | 13 task (tümü Dependencies:none, tam-paralel) | **disk-verify 13/13 GERÇEK** (62 dosya +6488/-587, 13 yeni test; **113 yeni + 25 regresyon test yeşil**; tsc temiz). Brain-eval 12 DONE/1 DEBT/**1 NO_GO=race** (388-002 run.tsx fix disk'te+testi geçti). **🆕 prompt-gate DOGFOOD:** plan-time gate 504/506'yı refactorer→WARN yakaladı → bug-fixer'a düzelttim → gate temiz→başladı (author→gate→fix→clean döngüsü çalıştı) | (pending) | 13 born DONE → devir 66/103 | — |
| **389 (S6) ✅** | REPL/CLI/api-gov tail (7 distinct+zincir) | 7 task | **disk-verify 7/7 GERÇEK** (56 yeni+25 regresyon test; tsc temiz; Brain 6 DONE/1 DEBT/0 NO_GO); dogfood-gate 575/583 security-auditor→api-builder düzeltti | **6c204ae9** | 7 born → devir 73/103 | — |
| **390 (S7) ✅** | GOV/API-güvenlik + cross-platform + npm-consumer (6, zincir 004←003) | 6 task | **disk-verify 6/6 GERÇEK** (33 yeni test + audit; api/providers/cli regresyon temiz; Tier-1 real-binary smoke 3/3; Brain 6 DONE/2 DEBT/0 NO_GO/10m41s); prompt-gate TEMİZ; **keşif: 3 pre-existing provider-PATH-red (guard-vs-F1-014, Alperen A/B-karar)** | **03adf3e4** | 6 born → devir ~79/103 | Sonnet-worker |

### Sprint-387 (S4) — ÖLÇEK-TURU dispatch notu (2026-07-08, Alperen "20-40 ölçek + born∥followup" direktifi)
- **Ölçek:** 8-task limiti kaldırıldı; 27 worker-task tek sprint (dependency-graph'lı) + follow-up'lar aynı cycle'da (post-sprint el-kod).
- **Seçim:** born-backlog 103 → subagent-reconcile: **27 DONE / 64 worker-ready / 12 excluded**; picked-27 = OPEN'lardan P0(2)+P1(9)+P2/P3(16), file-overlap-disjoint (yalnız app.tsx/run.tsx zinciri serialize). **picked ∩ DONE = ∅ (python-kanıtlı → 386-israfı riski YOK).**
- **Path-verify:** 39/39 yol `test -f` ✅; subagent 8 yanlış-yol düzeltti (564→src/nervous/, 571→src/core/flow-runtime, 503→src/core/marketplace, 494→lib/, 495→src/cli/helpers/mcp-attach, 560→src/orchestra/, 580→src/api/).
- **Routing (R-1b canlı):** REPL→terminal-ux(11), SEC→security-auditor(7, explicit `- Agent:` hint zira R-1 build'siz), agent-runtime→refactorer(7), api→api-builder(2). Eski %100-skew (refactorer24+api15) DÜZELDİ.
- **goNogo:** F0.2 parser task-specific `- goCriteria:`/`- nogo:` merge etti (generic-floor + task-özel).
- **DIŞLANAN (dedike-pas):** 490 (dev meta-sweep→decompose), 496/497 (greenfield electron/enterprise), 580 (Windows-cluster LARGE→sub-slice), closed-hot-file (560/562/582 sprint-phases · 565/572 server.ts → single-owner/el-kod), Alperen-gated (63/488/202), doc-heavy (495/507/489), live-key (477).
- **Follow-up (post-sprint el-kod, aynı build):** R-1 (routing-engine src/agent→security), R-3 (adr-selector enforcement-tier render), R-5a (adr-selector prompt_summary), LP-9 (refactorer PROMPT.md yarım-yama), R-4 (authoring-lint kuralı). Sprint-sırası el-kod YAPILMADI (persona/routing tutarsızlık + worker-vitest import riski).

**S2 eşleme:** 001=573-REDO(agents/worker.ts) · 002=518-REDO(core/provider.ts) · 003=508 ApprovalCard-mutex · 004=574 nervous-undo · 005=569 detector-reach · 006=566 writer-lease-failclosed · 007=561 auto-approve-consistency · 008=555 permission-merge. Tüm `Files:` yolları `test -f` ön-doğrulandı (573/518 dersi).

### Wrong-path spec-dersi (kalıcı)
Task DIRECTIVES'te `Files:` yolunu **grep'le doğrula** (var mı) — 573/518'de olmayan yol verdim, worker orphan yarattı. Sonraki DIRECTIVES'lerde her `Files:` yolu `git ls-files`/`test -f` ile ön-doğrula.

**Sprint-1 (380) task→born eşlemesi:** 001=558 skill-crash · 002=559 lifecycle-critical · 003=573 worker-approval-wire · 004=518 cred-scrub · 005=509 spawn-error · 006=512 provider-switch · 007=514 agentic-overmatch · 008=515 nervous-slash · 009=516 tool-timeout · 010=526 provider-parity · 011=535 bash-harden · 012=62 cursor-model-wire · 013=505 doctor-dup · 014=513 clear-context. Verify sonrası her DONE→backlog'ta ✅, DEBT/NO_GO→carryover.

## Sprint-2 adayları (backlog'dan, henüz planlanmadı)
- **508** InputBar↔ApprovalCard mutex (app.tsx — WIP-adjacent, dedicated REPL-TUI sprint)
- **560** RBAC spawn-phase (sprint-phases KİLİTLİ → tek-yazar sprint)
- **562** unwired safety-net cluster (cost_guard/resumeSprint/prune — sprint-phases/lifecycle, dedicated)
- **492/493** W1-EXPERIENCE-ON + W2-WIRE (app.tsx/native-agent — WIP-adjacent, dedicated)
- **490** ORPHAN-WIRE 69-modül dalgaları · **495** W4-DOCS-TRUTH · **501** CLI-EPIPE · P2/P3 kümeleri

## Carryover / açık born-* (sonraki sprint'e taşınacak)
- (Sprint-1 verify sonrası dolacak)
