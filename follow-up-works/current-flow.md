# GEÇİCİ AKIŞ — DOGFOOD CONTINUATION

> İş SSOT'u `docs/MASTER-PLAN.md`'dir. Bu dosya yalnız kısa vadeli yürütme sırasını taşır;
> closure authority veya yeni work identity üretmez. Tüketilen ayrıntı burada biriktirilmez —
> landed-kanıt MASTER satır-evidence'ına gider, bu dosya imleç + sıradaki-işi taşır.
> Son tamamlanmış devir authority'si: `ah-2026-08-24-codex-to-claude`, **epoch 3**,
> `RECOVERY_COMMITTED` (transferee Claude), receipt
> `sha256:09a1f774689ed4e785fa859dbd3f574406da02c87d2080c94d773c281a05117a`;
> authority-ref `owner-live-2026-08-24-go-full-authority-claude-8workers`.
> **Devir TAMAMLANDI (2026-08-25): `ah-2026-08-25-zfv8yl` `COMMITTED`** — zincir PREPARED
> `sha256:dd488f48…4673` → VERIFIED → COMMITTED
> `sha256:9cb638e4a58904a0514b341dac3509e6afa6bea763791602734d821012b4c5b7`
> (Claude→Claude, CONTEXT_EXHAUSTION, owner-directed). **Yürütme yetkisi artık YENİ Claude
> oturumundadır**; eski oturum aynı scope'ta mutation yapmaz, yalnız gözlem/handoff desteği verir.
> Yeni authority yalnız receipt'teki openActions + bu dosyanın SIRADAKİ sırası üzerinden yürür.**

## ŞU AN — çalışma-imleci (Claude epoch-3)

- ✅ 2026-08-24→25 maratonu ÖZETİ (tümü origin/main; ayrıntı = MASTER evidence + commit-mesajları):
  `e322a444a` 7094 token-authority + prompt-bayrakları default-ON · `34c50dba6` cache-waiver
  (7094 PROMOTE receipt `sha256:f1950d9ca…` — −41,2% ölçümü kapandı) · `dea4ec5b2` 670-hasadı ·
  `2b2895ba9` DIRECTIVES deterministik-hattı · `12c8f171b` 671 + **Nervous→Telegram durable-köprü
  CANLI** (owner teyit: bildirimler düştü) · `f67f18b70` B-süpürme + lint-directives --fix ·
  `3a1d74cdb` 7141 (131-throw typed dönüşümü, sprint-672) · `539368e15` suite-kuyruğu (full-suite
  eski-kırmızı 466→0) · `eb6f552a9` config-loss strike-4 (write-then-swap) · cli-surface-truth +
  design-lane worktree-merge zinciri (`df1d51a53`, `6935f255c`) · `b036866d8` bulgular-sınıflandırma ·
  `7b80acfc8` **A2 routing-adalet dalgası** (sprint-673 + elle-kapanış; MASTER 9072 DONE,
  receipt `GR-2026-08-25-ROUTING-FAIRNESS-A2-01`; canlı-kanıt: legacy-cells 0, 279-uses kurtarıldı,
  doctor ilk koşuda `sprint-sprint-404.jsonl` artığını yakaladı).
- Sprint durumu: 670 (9/13), 671 (6/9), 672 (8/9), 673 (3/7 + ADR-D-007 elle-tamamlama) — hepsi
  dürüst-ABORTED/finalize arşivde; kökler MASTER'a işlendi (3354 FIX-freshness, 3130 resume-eki).
- Owner 2026-08-25 öğle talimatı: MASTER-işleme ✅ (3354/9072/3130 + GR-receipt; lint OK 530 satır) ·
  docs/ konsolidasyonu + README/README.tr güncellemesi BU oturumda · closure-brief durum raporu BU
  oturumda · **devam-akışı yeni Claude oturumuna fallback-protokolüyle devredilecek**.

## SIRADAKİ yürütme sırası (yeni oturum buradan devam eder)

1. **A3 event-besleme dalgası (owner GO verdi):** UNWIRED-4a/4b — canonical host event SSOT →
   monotonic `.hb`/`.log` → Status/UI/Dashboard/Nervous tek read-model; MASTER 3210 kanıt-ekleri
   bağlamında. DIRECTIVES-hattıyla (plan-modu → deterministik-üretim → lint:directives →
   plan --dry-run → start); izleme sessiz nöbetçi-subagent'ta.
2. MASTER 3354 (FIX-spawn dependency-freshness) — küçük-kök, A3 ile aynı bölgede; dalgaya
   task olarak katılabilir.
3. Keşif-payı (explorationBonus) — A2-sonrası cells-ölçümüyle; ci-guardian artık ranked-listede,
   etki ölçülebilir.
4. Ed25519 Work-480 töreni (OWNER-KATILIMLI; key repo-DIŞI, dokunulmaz):
   bundle `.deckent/runtime/closure-staging/work-480/bundle`, request
   `aprcdb-cb3eb74b4598bacc49b9ea6204208cca`, decision=allow verilmiş. Tek oturumda (10-dk
   penceresi): `phase5-sign.mjs --bundle … --request … --decision allow --key <MUTLAK-REPO-DIŞI>
   --out …/sign-receipt.json` → `phase5-writer.mjs --append …` → `lint-closure-dispositions.mjs`
   yeşil → Work-480 MASTER OPEN→DONE + regen.
5. C-satır dalgaları: 3350-3353 (plan-purity/spawn-retry/resume-lock/finite-budget) + 540-541.
6. Bekleyen küçükler: orphan `cli.provider-observations.*` i18n-anahtar temizliği · eski MCP-artık
   süreç temizliği · XVerify adjudicator-arızası (formal mühürler typed-HOLD'da bekliyor; kör-retry
   yasak) · Slack/Teams secrets (owner-işi) · `.deckent/routing/decisions-v3/` ölü-dizin silme
   (doctor artık uyarıyor; runtime-artığı, owner-onayıyla tek `rm -r`).
7. **Config self-heal strike-5 gözlemi (2026-08-25, RCA yeni-oturuma):** strike-4 landing'inden
   SONRA bugün 3 yeni `.deckent/config.json.corrupted.*.bak` doğdu (04:59/06:32/09:33) — üçü de
   VALID JSON ve en-yenisi canlıyla eş-boyut; yani self-heal sağlam dosyayı hâlâ "corrupted"
   sayabiliyor (150ms re-read-once penceresi yetersiz veya updateConfig yazı-yarışı). Canlı config
   SAĞLAM kaldı (92 anahtar; reserve_ratio 0.35 + worker_memory_limit 6g yerinde). Kök-neden +
   heal-tetiğinin kim olduğu (bot-daemon restart pencereleri şüpheli) ölçülerek kapatılmalı;
   bak-dosyaları RCA bitmeden silinmez.

## Canlı truth (kompakt)

- `DOGFOOD_MODE=ON`, `WORKSPACE_MODE=MAIN`, `DELIVERY_MODE=DIRECT_MAIN`, `DOGFOOD_HEALTH=RECOVERED`.
- Aktif sprint/worker YOK; bot daemon fresh-dist'te canlı; full lint 20-gate + build:all yeşil;
  full-suite eski-kırmızı 0 (yeni-dalga hasatları hariç %100 yeşil taban).
- Nöbetçi-deseni: sprint-izleme ana-oturumda değil Sonnet-subagent'ta (A–F tetiklerinde bildirir).
- Done-ready sayacı: **10/20** — önceki 9 + A2 routing-adalet (9072).
- 7094 kapanışı: token-bazlı kernel + koşullu cache-waiver ile PROMOTE; bayraklar ürün-default ON.
- Closure OS: Phase-4 foundation + Phase-5 signer CANLI; ilk authenticated batch `dba89c03…`
  append'li; Work-480 yalnız owner-imza-törenini bekliyor. Ayrıntı: `docs/archive/governance-2026-08/closure-os-sidecar-ledger.md`.
- XVerify: adjudicator missing-evidence arızası owner-admitted ayrı-iş; o kapanana dek formal
  mühürler dürüst typed-HOLD; same-provider yasak, elle mühür yasak.

## Sabit yürütme contractı

`inventory → measured DAG → multi-task dogfood run → canlı PID/log/heartbeat → scoped tests +
lint/typecheck → real-binary proof → MASTER projection → zamanı geldiyse different-provider
XVerify → landing`

**DIRECTIVES-hattı (owner 2026-08-25, İSTİSNASIZ):** ① plan-modu onayı → ② deterministik üretim
(`gen-repair-directives.mjs` veya çalışan-örnek+lint; LLM-tahmini yasak) → ③ `npm run
lint:directives` yeşil (gerekirse `--fix` system-assignment) → ④ `deckent plan --dry-run` temiz
(dry-run debt-preflight yazımı KN4 owner-tasarımıdır, bug değil) → ⑤ start; izleme nöbetçide.

- Finding başka outcome'a aitse otomatik implement edilmez; owner-admission MASTER-kapısıdır.
- `.brain/memory.db` silinmez; `.tasks` `rm` ile temizlenmez; sprint sırasında build/auth-mutation
  yapılmaz; canlı sprint owner onayı olmadan kill/cleanup edilmez.
- Commit/push öncesi `git branch -vv`; push seyrek; publish daima owner-manual.
