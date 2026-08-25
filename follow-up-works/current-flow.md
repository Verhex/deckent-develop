# GEÇİCİ AKIŞ — DOGFOOD CONTINUATION

> İş SSOT'u `docs/MASTER-PLAN.md`'dir. Bu dosya yalnız kısa vadeli yürütme sırasını taşır;
> closure authority veya yeni work identity üretmez. Tüketilen ayrıntı burada biriktirilmez —
> landed-kanıt MASTER satır-evidence'ına gider, bu dosya imleç + sıradaki-işi taşır.
> Yürütme yetkisi: **epoch 4, CLAUDE** — `ah-2026-08-25-zfv8yl` COMMITTED
> (`sha256:9cb638e4a58904a0514b341dac3509e6afa6bea763791602734d821012b4c5b7`, origin/main `dda40ec0d`).

## ŞU AN — çalışma-imleci (Claude epoch-4)

- ✅ **A3 EVENT-TRUTH DALGASI KAPANDI (2026-08-25 akşam; landing bekliyor — commit owner-isteğiyle):**
  9/9 logical task DONE. sprint-674 (5/9; kendisinin düzelttiği dependency-attribution bug'ına
  eski-dist'te yakalandı → dürüst typed-PAUSE → owner-onaylı force-finalize ABORTED) +
  sprint-675 (4/4, 002/003 birer fix-retry). Landing el-paketi (ADR-D-007, owner-directed):
  4 tsc union-daraltma/ölü-import onarımı + `.result` canonical alan-sırası
  (`serializeTaskResultForDisk`, 9 yazım-noktası tek choke-point) + hermetic/prod-inventory
  baseline tazeleme + docs:stats regen. Kanıt: MASTER 3354 VERIFY
  (`receipt=GR-2026-08-25-EVENT-TRUTH-A3-01`) + 3210 kanıt-eki; gerçek-binary `status --json`
  lifecycle=COMPLETE readiness=READY 0-UNAVAILABLE + deathSweep senkron; arşiv-log seq
  strict-artan; read-model rev 2564; 20-gate yeşil; build:all + bot-ritüel (bot fresh-dist'te).
  XVerify: adjudicator-arızası açık → formal mühür dürüst typed-HOLD (kör-retry yasak).
- ✅ **Config self-heal strike-5 RCA kapandı (rapor owner'a verildi):** üç `.bak` da strike-4
  fix'inden ÖNCE doğdu (07:59/09:32/12:33 local; #3 = strike-4 incident'ının kendisi); fix'ten
  beri sıfır tekrar. Gerçek kök yazım-yarışı DEĞİL: bak-mtime'ları dosyanın heal anında 6-41
  dakikadır tam/geçerli olduğunu kanıtlıyor; `readJsonSafeAsync` okuma-hatasını parse-hatasından
  ayırmıyor + `existsSync`(stat)/`readFile`(fd) asimetrisi → transient okuma hatası (fd-baskısı
  sınıfı, en güçlü hipotez; ERRORS.md 600-satır kırpması doğrudan hata metnini yuttu) sağlam
  dosyayı "corrupted" damgalıyor. Kalıcı fix önerisi owner-admission bekliyor (aşağıda).
  Bak-dosyaları RCA-kanıtı olarak DURUYOR — silme owner kararı.

## OWNER-ADMISSION bekleyen bulgular (finding ≠ iş; MASTER'a giriş owner kararı)

1. Config self-heal kalıcı-fix: heal yalnız gerçek JSON.parse hatasında; io-hatası typed
   WARN+bounded-retry, dosya kenara alınmaz. (+ ERRORS.md kırpma-penceresi forensic'e dar.)
2. deathSweep çıktı-hijyeni: `status --json` 100 ölü/legacy flow-handle artığını tek tek
   "no flow found" hatasıyla döküyor — hem runtime-artığı temizliği (owner-onaylı) hem
   skipped-özeti (sınıf-bazlı sayım) gerekiyor.
3. Engine-self-change heuristiği: lint-directives'e "Files ∩ motor-sıcak-yolu VE aynı-DAG
   etki-bağımlısı var" typed WARN'ı (674 dersinin mekanikleşmesi).
4. A4 ertelenenler (A3 negative-space): legacy `.hb` şema emekliliği · `.log` format-birleşimi ·
   inspect↔read-model parity · ölü `run-state-feed.ts` silimi · event-stream kayıpsız rotasyon ·
   Nervous observer filtre genişletmesi.
5. Worker'ların `HEARTBEAT_IDENTITY_HOLD` (attemptId/backend host-bound değil) gerekçesiyle hb
   yazmayı reddetmesi — 674'te gözlendi; prompt/host-bound kimlik akışı incelenmeli.

## SIRADAKİ yürütme sırası

1. **A3 landing-commit** — owner "commit et" deyince: `git branch -vv` → tek commit + push.
2. Keşif-payı (explorationBonus) — A2-sonrası cells-ölçümüyle; ci-guardian ranked-listede.
3. Ed25519 Work-480 töreni (OWNER-KATILIMLI; key repo-DIŞI): bundle
   `.deckent/runtime/closure-staging/work-480/bundle`, request
   `aprcdb-cb3eb74b4598bacc49b9ea6204208cca`, decision=allow verilmiş; tek oturumda
   sign → append → lint yeşil → Work-480 OPEN→DONE.
4. C-satır dalgaları: 3350-3353 (plan-purity/spawn-retry/resume-lock/finite-budget) + 540-541.
5. Bekleyen küçükler: orphan `cli.provider-observations.*` i18n-anahtarları · eski MCP-artık
   süreçler (MCP server'lar hâlâ eski dist'te — restart owner-koordinasyonlu) · XVerify
   adjudicator-arızası (typed-HOLD'da; kör-retry yasak) · Slack/Teams secrets (owner) ·
   `.deckent/routing/decisions-v3/` ölü-dizin (owner-onaylı tek `rm -r`).

## Canlı truth (kompakt)

- `DOGFOOD_MODE=ON`, `WORKSPACE_MODE=MAIN`, `DELIVERY_MODE=DIRECT_MAIN`.
- Aktif sprint/worker YOK (674 ABORTED-arşivli, 675 COMPLETE-arşivli); bot daemon fresh-dist'te
  canlı; 20-gate + build:all + tsc --noEmit yeşil; dist=src eşit.
- Nöbetçi-deseni: sprint-izleme ana-oturumda değil Sonnet-subagent'ta (A–F tetikleri) — A3'te
  iki koşuda da başarıyla çalıştı.
- Done-ready sayacı: **11/20** — önceki 10 + A3 event-truth (3354 VERIFY; 3210 kanıt-eki).
- Dogfood dist-gecikmesi kuralı (owner-anlatımı verildi): run başladığı dist'le biter;
  motor-fix'i aynı run'a etki edemez — sıcak-yol fix'i önce mini-run'la landılır.

## Sabit yürütme contractı

`inventory → measured DAG → multi-task dogfood run → canlı PID/log/heartbeat → scoped tests +
lint/typecheck → real-binary proof → MASTER projection → zamanı geldiyse different-provider
XVerify → landing`

**DIRECTIVES-hattı (owner, İSTİSNASIZ):** ① plan-modu onayı → ② deterministik üretim → ③
`npm run lint:directives` yeşil (gerekirse `--fix`) → ④ `deckent plan --dry-run` temiz → ⑤
start; izleme nöbetçide. Scoped vitest yetmez: değişen dosyalar için `tsc --noEmit` sıfır-hata.

- Finding başka outcome'a aitse otomatik implement edilmez; owner-admission MASTER-kapısıdır.
- `.brain/memory.db` silinmez; `.tasks` `rm` ile temizlenmez; sprint sırasında build/auth-mutation
  yapılmaz; canlı sprint owner onayı olmadan kill/cleanup edilmez.
- Commit/push öncesi `git branch -vv`; push seyrek; publish daima owner-manual.
