# 2026-07-22 — TEMİZLİK-GÜNÜ UYGULAMA PLANI (onaylı kararların tamamından derlendi)

> **Statü: PLAN — uygulama Alperen "başla"-emriyle.** Kaynak: karar-tablosu #1-30 tüm ✅ kararları
> (2026-07-21/22 karar-turları). **Zamanlama-önerisi: göçten (Pazar 2026-07-26) ÖNCE** — en geç Cumartesi;
> göç-araçları (sync-to-product) korunmuş, repo temiz devredilir.
> Sıralama-mantığı: önce git-tracked işlemler (geri-alınabilir) → arşiv-taşımaları (lint-DoD'lu) →
> untracked silmeler → `.deckent` (geri-dönüşsüz kısım) → dallar → HOME → **gc en sonda** (silme-kazancını toplar).

## 🚫 DOKUNULMAZLAR (her fazda geçerli)
`.tasks/` TÜMÜ (#25 kararı — canary dahil) · `.brain/memory.db` (yalnız F11 kayıt-bakımı) · `.deck` ·
`goal/release-gate-truth` + `main` dalları · `.analysis/xverify/` + `ozet-notu*` + `u4-olcum/` + `a6-sinav-u1/` +
`born-backlog.json` · `deckent-hub/` · `alp-discipline/` (iç-`.deckent` ⬜ ayrı-karar) · `examples/voice-wrapper/voice-ref/` ·
`.deckent` canlı-state: `skills/ agents/ stats/ workspace/ docs/ nervous-kök-logları routing-kök-JSON'ları
runtime-son-sprintler recently-works/sprint-45x recovery-son-snapshot` · dependabot-dalları · `docs/audits/`
(runtime-yazma-hedefi) · tüm auth/credential (`~/.deckent/keys`, `~/.claude/.credentials.json`, codex/gemini auth).

## F0 — Ön-koşullar
1. Canlı sprint/canary YOK teyidi: `deckent status` + `.tasks/task-canary-budget-001.hb` son-mtime kontrolü
   (canlıysa F5-F6 canary'ye dokunmadan koşulur — zaten dokunulmaz-listede).
2. `git branch -vv` (kural) + kirli working-tree envanteri: analiz-defterleri dahil mevcut değişiklikler
   ÖNCE Alperen-onaylı defter-commit'iyle güvenceye alınır (temizlik-commit'leri karışmasın).
3. Sprint yokken çalışılır (build-yasağı kuralı F5'teki rebuild için).

## F1 — Güvenlik-fix (commit C1: `security: .deck dockerignore`)
`.dockerignore`a `.deck` satırı (#21a). Kanıt: `grep deck .dockerignore`.

## F2 — Git-hijyen (commit C2: `chore(git): ignore-inert temizliği`)  [T9 + #9b]
1. `git rm --cached -r .deckent/runtime/evaluations .deckent/runtime/scheduler-shadow` (113 dosya untrack).
2. `.gitignore`: `+ .deckent/runtime/scheduler-shadow/` kuralı · `− satır-94 settings/docs.json` (tracked kalması
   niyet — managed-docs git-TRACKED kayıt; ignore-satırı yanlıştı) · `+ .git-guard-bin/` (#20 yan-not).
3. `git rm .deckent/run-gate.json .deckent/DIRECTIVES-features.md .deckent/capability-audit.jsonl` (orphan'lar, T8/T9).
4. `git rm -r .test/` (#9b) + MIGRATION-PLAN F1 ".test manifest'e" notunu düşür.
Kanıt: `git ls-files -ci --exclude-standard | wc -l` → 0.

## F3 — Tracked ölü-dosya silmeleri (commit C3: `chore: ölü kök-dosyalar`)
`git rm PROMPT-MECHANICS-ANALYSIS.md` (#1) · `.pre-commit-config.yaml` (#21b) ·
`.github/pull_request_template.md` + `ISSUE_TEMPLATE/bug_report.md` + `ISSUE_TEMPLATE/feature_request.md` (#24).

## F4 — Arşiv-taşımaları (3 ayrı commit; her birinden sonra `npm run lint:link` YEŞİL şartı)
- **C4** `.analysis` → `.analysis/archive/`: onaylı A1-A5 planı AYNEN (`2026-07-21-analysis-arsiv-is-plani.md`) —
  kapsam-dışı 4 istisna + adr-g-006 15-link tek-desen düzeltmesi + `.lintlinkignore` satırı.
- **C5** `docs/analysis` ayrıştırılmış-arşiv (#12): ~15 canlı-refli çekirdek YERİNDE (göç-defteri
  `ground-truth-snapshot-2026-07-06*`, scheduler/term-flow tasarım-SSOT'ları, kod-yorumu hedefleri) →
  kalan ~72 tarihî `git mv docs/analysis/<f> docs/analysis/archive/` (refleks gerekmez — kanıt #12).
- **C6** `docs/architecture/adr/` 2 kaçak-ADR → `docs/adr/archive/` (#13).

## F5 — Untracked repo-içi silmeler (commit yok; İZ: silme-listesi deftere işlenir)
`.agents/` (#4) · `.brain/analysis/` (#6) · `.superpowers/` (#8) · `.test-e2e-chain-79040/` + `.test-e2e-sprint-1087287/`
(#9a) · `.tmp-test/` (#19 — not: TS1-born yapılana dek `npm test` yeniden üretir, normaldir) · `.playwright-mcp/` (#20) ·
`coverage/` (#20) · `dist/` (#20 → ardından `npm run build`; sonrası `/mcp restart` Alperen) ·
`examples/voice-wrapper/.audio-tmp/` + `__pycache__/` (~70MB, #10b) · `.claude/worktrees/` + `.codex/tmp/` (#17-leftover) ·
`sudo rm -r .git-guard-bin/` (#20, root-owned).

## F6 — `.deckent` temizliği (#15) — ⚠️ BU FAZ GERİ-DÖNÜŞSÜZ (untracked loglar)
| Adım | İşlem | Kazanç |
|---|---|---|
| T1 | `traces/extracted-general.jsonl` + `extracted-aligned.jsonl` SİL | 53.8M |
| T4 | `recently-works/autonomous-events.jsonl` SİL | 19.3M |
| T2-manuel | `archive/sprints/sprint-134..399` SİL (eşik <400 — T5/T6 ile tutarlı; kalıcı-policy T10-born'da) | ~45-50M |
| T5 | `runtime/evaluations/sprint-<400` (111 dizin) + `runtime/jobs/` sprint-<400 descriptor'ları SİL | ~5-10M |
| T6 | `routing/outcomes/sprint-<400` (298 dosya) SİL | ~3M |
| T7 | `nervous/nervous-ipc/resolved/` 178 SİL; `panic-ipc/pending/` 69 → önce 2-3 örnek hızlı-inceleme (stuck-nedeni nota), sonra SİL | hijyen |
| T8 | 3× `config.json.bak.*` · `sprint-428/429-tool-inventory.txt` · `sprint-436/446-checkpoint-seq` · `pause-state.json` · `crashes/` 4 log SİL | hijyen |
| T3/T11 | `settings/resource-log.jsonl` + `prompts/injection-audit.jsonl` + `notify-log.jsonl`: **arşivle-ve-kırp** — `.deckent/archive/logs/`e taşı + resource-log'un **son ~2000 satırı yerinde tutulur** (`cost-config-loader.ts:414` spend-okuyucusu boş dosyayla şaşmasın); diğer ikisi boş-dosyayla yeniden başlar. `traces/sprint-worker.jsonl` (89.5M) → arşiv-dizinine taşı (rotasyon-policy T10-born'a kadar manuel) | ~55M yerinde |

## F7 — Scripts SEÇMELİ canlı-turu (karar: toptan yok)
14 aday tek-tek Alperen'e sunulur (liste: `2026-07-21-scripts-analiz.md` §4-5); seçilenler `git rm` + eşleşen
test-blokları birlikte (eşleme: tests-analiz §7 — backfill-sprint-log · memory-stub-backfill; **bump-version
testi RETIREMENT-GUARD, script silinmedikçe kalır**; verify-publish script+describe-bloğu birlikte). Commit C7.
+ TS3-parçası: 4 boş-gövde skip-placeholder sil · TS4: `tests/governance/latent-set-closure.note.md` sil ·
TS2: `tests/load/hot-paths.bench.ts` SİL (05-12'den beri hiçbir runner'a bağlı değil). Commit C8.

## F8 — Dal-temizliği (#30a/b)
1. Lokal: `git branch -d master origin-archive feat/docs-json-ai-author checkpoint/d16-approval-20260720` +
   `sp1-native-agent-finish` (önce `git branch --no-merged main` kontrolü; merge-edilmemişse Alperen'e sor → `-D`).
2. Remote: origin'de 5 bayat konu-dalını sil (`git push origin --delete chore/ci-node-modernization
   docs/embedded-web-terminal-spec recover-sprint223-nervous-finalizer repl-layout-spinner-slash-wire` + checkpoint-eşi).
3. `git remote remove origin-archive` (GitHub-arşiv durur; lokal referans-kirliliği gider).

## F9 — HOME temizliği (#29c; repo-dışı)
`~/.claude/projects/`: 7 worktree-transcript dizini + ~11 `-tmp-*` dizini SİL (aktif `-workspace` +
`-home-alperen-deckent-dev` DOKUNULMAZ) · `~/.claude/security/security_warnings_state_*.json` (1008 dosya) SİL ·
`session-env/` + `file-history/` + `shell-snapshots/` + `paste-cache/` Haziran-kuyrukları SİL ·
`~/.gemini/tmp/` boşalt (47M) · `~/.deckent/cache/model-auto-detect-claude-api.json` (0B) SİL.

## F10 — `git gc` + pack-raporu (#30c; EN SONDA)
`git count-objects -vH` (önce) → `git gc` → rapor; agresif-repack/büyük-blob analizi yalnız rapor sonrası ayrı-onayla.
Baz: `.git` 485MB.

## F11 — memory.db kayıt-bakımı (#30d; ayrı dikkat-dilimi)
1. Yedek: `cp .brain/memory.db <scratchpad>/memory.db.pre-bakim` (geçici; gün-sonu silinir).
2. better-sqlite3 (yazma-modu, tek oturum): 4 boş kayıt DELETE (`mem-sprint-258/259/339/366`) +
   `sprint-448` kaydında `sprint_num=448` UPDATE. Kanıt-sorgusu öncesi/sonrası sayım.

## F12 — Kapanış-DoD
1. `npm run lint` (gates) · `npm run lint:link` · `npm run test:ci-sim` (tam-suite gerekirse VITEST_MAX_FORKS=2 — ≤16GB kanunu) · `npm run build` yeşil.
2. `git status` → yalnız beklenen değişiklikler; commit'ler C1-C8 atıldı; **push Alperen-onayıyla**.
3. Defter güncellenir (uygulandı-işaretleri + F6/F9 silme-kayıtları) + **MASTER-PLAN'a uygulama-satırı** açılır
   (Kanun-4 — analiz defterde kaldı [Alperen-kararı], uygulama iştir) + `/mcp restart` (build sonrası, Alperen).

## 📦 AYRI-İŞ LİSTESİ (temizlik-günü DEĞİL — MASTER-PLAN adayları)
1. **#26 release-blocker paketi:** `npm run docs:stats` regen + CONTRIBUTING ADR-010→D-005 + DECKENT 20/21 + stats-gate CI'ya.
2. **#17 senkron-dalgası (seçmeli):** gemini-karpathy regen · AGENTS/GEMINI gövde-resync · codex ui-ux-pro-max mirror ·
   cursor-söküm (rule-generator:204 üretim-durdurma + `.cursor/` kaldırma + init-steps:159).
3. **TS1-born (büyük):** 25 testin tmpdir-göçü + hermeticity-lint'e yazma-taraması.
4. **T10-born:** rotasyon-mekanizması (resource-log · injection-audit · notify-log · sprint-worker) + arşiv-budama-policy (T2-kalıcı).
5. TS5 (audit/audits birleştir) · TS6 (PLATFORM.md+UNIX_ONLY senkron) · TS7 (spawnSync-ratchet tests-kapsamı).
6. Gitignore-konsolidasyon (TS1-SONRASI tek-geçiş) · decay-gözden-geçirme (93 kayıt) · src truth-hijyeni (routeTaskV2-yorumları).
7. **docs1 rename-dilimi** (K1=c·K2=a·K3=a onaylı; sözleşme + §6-istisnalarıyla) · **29b branch-protection** (ürün-repo `deckent`te, göç-sonrası) · #23 alt-soruları.

**Tahmini kazanç:** repo-içi ~200-230MB (`.deckent`) + 70MB (voice-cache) + 19MB (dist/coverage) + gc-kazancı (rapora bağlı);
HOME ~70-120MB. Tahmini süre: 2-3 saat (F7 canlı-tur + F11 dikkat-dilimi dahil).
