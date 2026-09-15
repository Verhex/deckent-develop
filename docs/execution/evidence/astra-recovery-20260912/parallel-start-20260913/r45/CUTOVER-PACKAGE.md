# R45 — Kapanış ve cut-öncesi paket (Astra yürütür, Fable analizde kalır)

Owner kararları (Alperen, 2026-09-15, canlı talimat):
- Repo kapsamlı refaktöre girecek; recovery paketi burada dondurulur ve landing edilir.
- **DOGFOOD_MODE=OFF.** Refaktör dogfood üzerinden yürümez; sprint/run/task/settlement state
  OLUŞTURULMAZ ve mutate edilmez. Kalite barı (i18n, every-environment, wiring closure, dürüst
  kanıt) aynen geçerli.
- Astra Codex CLI'dan çalışır; **MCP reconnect kalemi yoktur** (Codex için geçerli değil).
- Refaktör öncesi: build + commit + push (DELIVERY_MODE=DIRECT_MAIN, PR_REQUIRED=false).

Bu doküman owner-directed handoff'tur. **Silinme tetiği:** K0–K9 kanıtları r45/RESULT.md'de
toplanıp landing commit'leri push edildiğinde bu dosya SİLİNİR; kalıcı kayıt MASTER 3178 satırı
+ r45/RESULT.md'dir.

Sabit sınırlar: yeni sprint YOK · SIGKILL/timeout/config değişikliği YOK · DONE/XVerify iddiası
YOK · `rm .tasks/*` YOK · `.brain/memory.db` dokunulmaz · `git add -A` YOK (her dosya sınıfıyla
eklenir) · commit ve push yalnız bu paketteki sırayla ve `git branch -vv` sonrası · worktree
silme/branch silme YOK (K9 yalnız envanter).

## K0 — Mode projeksiyonu (tek edit, gate ile)
`CLAUDE.md` ve `AGENTS.md` DECKENT-DEV-CONTROL bloğunda `DOGFOOD_MODE=OFF`,
`DECISION_REF=owner-live-2026-09-15-refactor-cutover-dogfood-off`. Başka satır değişmez.
`node scripts/lint-operating-policy.mjs` yeşil. Bu edit K7'de ilk commit olur (tek başına).

## K1 — Konsolide doğrulama (tek koşum, tek log)
R31–R44'te dokunulan test dosyalarının TÜMÜ tek vitest koşumunda (VITEST_MAX_FORKS=2, ≤16 GB):
`tests/orchestra/{exact-docker-release-recovery,exact-held-containment-barrier,
exact-controller-terminal-fanin,production-wiring-outer-barrier,result-collector,
result-collector-settlement-authority,scheduler-spawn-executor,spawn-backend-docker-ipc-authority,
spawn-backend-docker-mounts,sprint-recovery-operation,exact-docker-observation,
execution-effect-landing-coordinator,execution-effect-native-adapter,
terminal-authority-snapshot-boundary,result-evaluator-derived-directory}.test.ts`,
`tests/core/{task-attempt-custody-store,execution-effect-persistence-contract,task-execution-fence}.test.ts`.
Ardından `npm run lint` (tsc + dashboard tsc + lint:gates), `npm run build:all`, resmi binary
kimlik kararı, `scripts/lint-closure-dispositions.mjs`. Native değişiklik
(`native/exec-authority/src/custody_posix.c`) için native build çıktısı ve ilgili
`tests/core/task-attempt-custody-store.test.ts` yeşili ayrıca gösterilir.
Kanıt: r45/{consolidated-tests.log, lint.log, build.log, build.exit, binary.json, native-build.log}.
Örtüşen alt-küme sayıları toplanmaz; tek toplam yazılır. Kırmızı varsa düzeltme değil, RESULT.md'de
kırmızı kalır ve o dosya sınıfı commit'e girmez.

## K2 — Dirt disposition envanteri
`git status --porcelain` şu an 146 yol: 64 M, 11 D, 71 untracked (66 evidence, 4 test, 2 src;
şüpheli/secret/runtime dosya YOK, doğrulandı). Her yol tek satır: `yol | sınıf | gerekçe | commit#`.
Sınıflar ve commit eşlemesi (K7):
- POLICY-MODE: `CLAUDE.md`, `AGENTS.md` (K0) → commit 1.
- RECOVERY-SRC: `src/orchestra/*`, `src/core/*`, `src/cli/commands/recover.ts`,
  `src/cli/helpers/messages.ts` (yalnız recovery mesajları), yeni `exact-docker-execution-worker.ts`,
  `exact-docker-release-outcome.ts` → commit 2.
- RECOVERY-TEST: `tests/orchestra/*`, `tests/core/*` (R31–R44 listesi + 4 yeni test) → commit 2.
- NATIVE: `native/exec-authority/src/custody_posix.c` → commit 2 (K1 native kanıtı şart).
- UNRELATED-MODIFIED: `src/cli/repl/run.tsx`, `tests/cli/**` (REPL/CLI işi) → commit 3, mesajda
  hangi MASTER satırına ait olduğu yazılır; sahiplenilemiyorsa commit'e GİRMEZ, envanterde kalır.
- UNRELATED-DELETE: `.deckent/run-gate.json`, `.deckent/runtime/sprint-525-bootstrap-seam.json`,
  `.test/*`, `deckent-test-12092026.md`, `follow-up-works/*` (delete-on-consume kuralı),
  `proof/cursor-cli-help-matrix-v4/*` → commit 4 "chore: retire consumed runtime/doc artifacts";
  `run-gate.json` silinmesinin runtime'a etkisi (grep + doctor) K6'da gösterilir, gösterilemezse
  commit'e girmez.
- POLICY-DOC: `DIRECTIVES.md`, `.codex/skills/*`, `.deckent/settings/features-manifest.json`,
  `.deckent/workspace/TOOLS.md` → commit 5.
- DOCS/GENERATED: `docs/MASTER-PLAN.md`, `docs/CHANGELOG.md`, `docs/SPRINT-LOG.md`,
  `docs/generated/*`, `durum-raporu.md`, `follow-up-works/current-flow.md` → commit 6 (K4 sonrası).
- EVIDENCE: `docs/execution/evidence/**` (66 untracked + M) → commit 7.
Kanıt: r45/DIRT-DISPOSITION.md.

## K3 — Açık kalemler defteri (tek dosya, kod referanslı)
Her kalem: `id | BLOCKS_CURRENT_DONE veya RELATED_BUT_NONBLOCKING | dosya:satır | tek cümle | tur`.
- Drain/disposition/resume-execute yok; canlı attempt deadline'da EVALUATE→E077
  (`sprint-controller.ts` ~3930, `sprint-phases.ts` consumeExactTerminalAuthorities) — BLOCKS.
- Exact V2 runner provider timeout yalnız SIGTERM, SIGKILL eskalasyonu yok
  (`spawn-backend-docker.ts` ~5264) — BLOCKS (owner R43'te kapsam dışı bıraktı; defterde kalır).
- IPC envanter `DISPATCH_DISCOVERY_MUTATED` transient sayılmıyor, capture cache'ini zehirler
  (14594-14602; store 10770-10790) — RELATED.
- Acceptance/landing için wall clock yok — RELATED.
- EVALUATE E077 sonrası sprint lock/leadership bırakılıyor mu, doğrulanmadı — RELATED.
- Coordinator ölünce canlı container'ın provider exit gözlemi cold path'te yakalanıyor mu
  (~23998 guard) — RELATED.
- Query'siz HOLD için operatör onarım yolu (`recover`) — RELATED.
- Exact Docker heartbeat authority yalnız start/exit'te yazılıyor; tazelik container-state'ten — RELATED.
- `runExactDockerWorkspaceCommand` timer-önce-close yarışı düzeltilmedi, izolasyonla maskelendi
  (`exact-docker-workspace-command.ts` 55-140) — RELATED.
- Senkron native custody I/O ana thread'de (R4/R31 yalnız iki transportu taşıdı) — RELATED
  (refaktör girdisi).
- `heartbeat-daemon.ts` execSync 5 s/task — RELATED.
- E1–E3 cache/current-progress, missing-outcome, replay-race gerçek kanıtı alınmadı — BLOCKS.
- Gerçek Docker A→C/B, restart, operatör onarımı kanıtı yok — BLOCKS.
Kanıt: r45/OPEN-ITEMS.md. Refaktör planlamasının girdisidir; hiçbir kalem MASTER'a otomatik girmez.

## K4 — MASTER 3178 satırı
Durum PARTIAL/HOLD kalır, DONE yazılmaz. Satır metni r45/OPEN-ITEMS.md ve r45/RESULT.md'ye işaret
eder; `docs/generated/master-plan-active.*` mevcut üretici script ile yeniden üretilir (elle
düzenleme yok). Closure OS sidecar-ledger'a dokunulmaz.

## K5 — Evidence indeksi ve son kaynak kimliği
r0–r45 için tek tablo: `tur | UTC | sonuç (tek cümle) | anahtar dosya`. R31–R44'te dokunulan TÜM
kaynak/test dosyalarının son SHA256'sı `r45/FINAL-SOURCE-DIGESTS.json`; commit 2'nin hash'i
RESULT.md'ye yazılır. Refaktör oturumu bisect/regresyonu buna karşı kurar.

## K6 — Runtime hijyen raporu (salt-okunur)
Canlı sprint yok / docker ps yalnız local-llm / `.tasks` içeriği / execution lock (build.log'da 1
adet) / STALE_DEAD run-flow ve STALE run-job projeksiyonları (build.log admission çıktısındaki 19
kayıt) listelenir; `run-gate.json` silinmesinin etkisi gösterilir. **Dispose edilmez**; owner
`deckent recover`/cleanup kararı verir. Not: DOGFOOD_MODE=OFF'ta bu state'e dokunulmaz.

## K7 — Landing: build + commit + push (sırayla)
1. `git branch -vv` ve `git worktree list` çıktısı r45'e; `main...origin/main` senkron olmalı
   (şu an senkron, HEAD c02b71819). `/home/alperen/deckent-dev-terminal-231` aynı HEAD'de ayrı
   worktree: oraya dokunulmaz.
2. K1 yeşil değilse commit yok.
3. Commit'ler K2 sınıf sırasıyla, her biri yalnız kendi dosyalarıyla (`git add <yol>` tek tek):
   1 `chore(policy): DOGFOOD_MODE=OFF for refactor cutover (owner 2026-09-15)`
   2 `fix(dogfood): freeze exact custody recovery baseline R31–R44 (PARTIAL/HOLD)` — gövdede K3
     BLOCKS özeti ve r45/FINAL-SOURCE-DIGESTS.json referansı
   3 `<REPL/CLI işinin kendi mesajı>` — yalnız sahiplenilebilirse
   4 `chore: retire consumed runtime/doc artifacts`
   5 `docs(policy): directives/skills/tooling sync`
   6 `docs(master): 3178 PARTIAL/HOLD freeze + generated projection`
   7 `docs(evidence): astra-recovery r0–r45`
   Her commit `Co-Authored-By` satırlarını mevcut repo geleneğine göre taşır.
4. `git push origin main`. REMOTE_CI_MODE=ADVISORY: CI beklenmez; sonuç sınıfıyla (MAIN_POSTMERGE_*)
   RESULT.md'ye sonradan not düşülür.
5. Push sonrası `git status --porcelain` boş olmalı; boş değilse kalan yollar K2'de "commit'e
   girmedi" olarak listelenir.

## K8 — Handoff receipt
Policy'deki versioned handoff receipt şemasıyla r45/HANDOFF.json: kaynak kimlik (K5 + commit
hash'leri), açık kalemler (K3), owner-only gate'ler (dirt sınıfı 3 ve 4 kararları, K9
branch kararları), sonraki authority = refaktör planlama oturumu. Transcript aktarımı yok.

## K9 — Branch/worktree envanteri (refaktör girdisi, mutasyon YOK)
`git worktree list` 40+ giriş: 17 `/tmp/*` prunable, `.deckent/recovery-snapshots/*` detached,
`implementation/7099–7114`, `lane/*`, `release/0.100.0-rebaseline` gibi main'e girmemiş
branch'ler. Her branch için: `branch | HEAD | main'e göre ahead/behind | son commit tarihi |
worktree yolu | öneri (merge-önce / terk / refaktör-sonrası)`. Refaktör main'i yeniden
şekillendireceği için bu envanter olmadan bu dallar sessizce ölür. Silme/prune YOK; karar Alperen'in.

## Fable tarafı (paralel, bu pakete dahil değil)
Refaktör planlaması için "engine hotspot ve kontrat envanteri" (transport/thread sınırları,
otorite okuma kontratı tüketicileri, deadline/bütçe kaynakları, dosya boyutları, K9 dal
etkileşimi) — owner istediğinde ayrı analiz çıktısı.
