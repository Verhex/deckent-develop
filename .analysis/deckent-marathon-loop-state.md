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
- **🔴 BORN-DEDUP (2026-07-08, sprint-386 dersi — ZORUNLU):** DIRECTIVES yazmadan ÖNCE aday born-id'leri **tamamlanmışlara karşı dedup et.** born-backlog.json'da completion-status ALANI YOK → tamamlanmışlar sessizce yeniden dispatch olur. Sprint-386 tam bunu yaptı: SPRINT-3 = sprint-383'ün AYNI 8 item'ı (383'te fix'li), worker'lar "already done" deyip 0-değişim → 6 NO_GO + koca sprint israf. **Kural:** sprint-arşivlerini (`.brain/archive/sprints/*/task-*.{json,result}`) tara → **DONE + disk-evidence** (LP-10 sonrası `filesChanged` non-empty; salt worker-DONE YETMEZ, 386 false-DONE'ları gibi) taşıyan born-id'leri DÜŞ; yalnız **OPEN** item queue et. **Anlık durum (2026-07-08):** 103 born → **26 zaten-DONE / 77 OPEN**; sıradaki sprint OPEN'lardan (born-63/64/82/83/85/202/203/477…), 383/386-item'larını TEKRAR ETME.

## Ortam durumu (2026-07-08 kurulum)
- Repo `/home/alperen/deckent-dev`, `main` @ (WIP-commit sonrası) origin ile hizalı.
- WIP commit'lendi: `101da0d9` (REPL native-agent feature 32 dosya) + `ef8d4acd` (analiz 8 dosya).
- Sprint-380 iptal (3 DRAFT → `.tasks/archive/sprint-380-cancelled/`); `.tasks/` boş; "Aktif sprint yok".
- `.deckent/config.json` = `{}` → model per-task DIRECTIVES'ten.
- tsc/lint yeşil (i18n·layer-shims·hermetic·routing).
- **Usage baseline (07-08):** session %38 (reset bu gece 02:20) · hafta-tümü %59 · **hafta-Fable %75** (reset 13 Tem 20:00). Headroom ~%20 Fable.

## born-backlog SSOT
`.../scratchpad/born-backlog.json` — **103 madde** (14 P0 · 40 P1 · 37 P2 · 12 P3); 76 yeni born-508…583 + 27 mevcut MASTER-PLAN'a katlı. Tüm 118 REPL bulgusu hesapta (2 refute-drop, 1 downgrade). Disk-verify-çelişkili "DONE" satırlar ayrı-born (WorkerApprovalGate 34/70, TERM-RPC 54, F2-008 60, DEFER-002 75).

## Sprint günlüğü (canlı — her sprint sonrası satır ekle)
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
