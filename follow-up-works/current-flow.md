# GEÇİCİ AKIŞ — DOGFOOD CONTINUATION

> İş SSOT'u `docs/MASTER-PLAN.md`'dir. Bu dosya yalnız kısa vadeli yürütme sırasını taşır;
> closure authority veya yeni work identity üretmez. Tüketilen ayrıntı burada biriktirilmez —
> landed-kanıt MASTER satır-evidence'ına gider, bu dosya imleç + sıradaki-işi taşır.
> Yürütme yetkisi: **epoch 4, CLAUDE** — `ah-2026-08-25-zfv8yl` COMMITTED
> (`sha256:9cb638e4a58904a0514b341dac3509e6afa6bea763791602734d821012b4c5b7`).
> Owner-yetki çerçevesi sürüyor (2026-08-26/27): süreçleri takip et, doğrula, gerekirse elle
> çözümle, işleri tamamlayarak devam et; sınırlar aynen — destructive/publish/memory.db/
> onaysız kill-cleanup/admission'sız MASTER-satırı YOK.

## 📍 İMLEÇ — 2026-08-27 akşam durumu

**Günün landed zinciri (kronolojik, hepsi origin/main'de):**
`3219f3ae2` sabah paketi (codex-denetim el-fix ×3 + budget-otoritesi 600→5000 ×3 yüzey +
bozuk flow-envelope arşivi + preflight-pini + Ders 31/32) → `22f056974` CI kök-onarımı
(budget-fallback leaf-sabite + partial-mock spread'ler + PLATFORM.md fail-closed gate) →
`933b6492c` **sprint-698** (üç-yönlü skill-paket senkronu + izole e2e proof + clean-guard
typed orphan-disposal + RUN_FAILED truncation; test-guardian ilk görev %100) →
`f20e32e45` 698-landing CI-hizalama (3/3 workflow SUCCESS ile kanıtlı) → CLI-reform
karar-zinciri (aşağıda) → `0e55cb969` 3301 ikinci bounded-replay kanıtı.

**Owner karar-günü (hepsi mühürlü):**
- **Rename İPTAL:** ürün/komutlar `deckent` SABİT; npm yayını `@verhex/deckent` (bin değişmez).
  Memory + geçiş-planı revize. Kalan owner-kararları: history-politikası · version-hattı ·
  ledger-repo'su · `@verhex/deckent` stub-publish tetiği (bkz. verhex-transition-plan.md).
- **CLI-SURFACE-REFORM-001 (MASTER 545) v2.1 ONAYLI:** 80 düz komut → 4 grup+Advanced,
  ~32 görünür, 12 paralel-komut kaldırma-listesi; TEK onay-yüzeyi (federated `approvals` —
  backend federasyonu mevcut); `audit verify`/`autonomous mission`/`memory recall|remember`
  alt-komutlaşması; EN-default. Execution: ladder-sonrası dilim-1
  (bkz. cli-surface-reform-karar.md — onaylı-tasarım taşıyıcısı).
- **Failure-disposition mimarisi KABUL:** karar-tablosu çekirdekte (config-resolved),
  Nervous = iletişim+öneri katmanı (kapalıyken çekirdek tam çalışır); Nervous
  amendment-öneri döngüsü AYRI outcome olarak parkta (admission'lı).

**3301 replay-turu (kanıt MASTER'da):** üç dürüst tetik-sınıfı da bugünkü üründe
zero-work NOT_DISPATCHED+SKIPPED zincirine ulaşamıyor (subprocess run-düzeyi E078;
gemini-pin worker-doğurup NO_GO; forced-skill sentetik-NO_GO+FIX-yakımı) → kapanış-dilimi
**sprint-699** olarak owner-onayıyla koşuyor: T1 failure-disposition-policy (NOT_DISPATCHED
+ FIX/re-dispatch-muaf) · T2 cascade-skip rayına bağlama · T3 typed disposition-olayı
(owner-outbox + nervous-köprü) · T4 zincir-mühürü. **ŞU AN: 2/4 DONE, T3 yazımda.**

**Ladder durumu:** 3300/3303/3295 sertifikalı (GR-receipt); 3304 sertifika-koşusu kayıtlı
(flip merdiven-sıralı); 3301 = sprint-699 + landing-sonrası bounded-replay sertifikası;
**3302 → `3284 REPAIR-DISPATCH-001`'e (KERNEL, OPEN) bağlı** — ladder'ın tam kapanışı ve
publish-planning 3284'ü de ister (ayrı mühendislik işi, admission bekliyor).

## SIRADAKİ (bu sıra ile)

1. **Sprint-699 kapanışı** → doğrulama-pasosu → landing-ritüeli (scoped+katalog-pin +
   20-gate + build:all + bot-cycle) → fixture'da bounded-replay YENİDEN → 3301
   sertifika-kanıtı + MASTER evidence.
2. **Owner'ın ilan ettiği yeni kritik iş + doğrulama süreci** (içerik owner'dan gelecek —
   bu dosya güncellenerek imleç oraya döner).
3. Kuyrukta (owner-sıralamasıyla): 3284 admission/plan → 3302/3304/3299 flip-merdiveni →
   CLI-reform dilim-1 DIRECTIVES → yayın-zinciri (3299-sonrası).

## Açık küçük bulgular (admission'sız, kayıt)

- `memory_budget` config-types'ta V1-deprecated bölümünde; V2 `memory` bloğunda budget alanı
  yok (tip/doc temizliği adayı) · runDecay/cleanup son-çare `?? 900` literalleri
  getDefaultConfig'e bağlanabilir (davranış etkisi yok) · run-flow-coordinator truncation
  sınırı `1 << 12` ayna-literal (store sabiti export edilirse tek-kaynaklaşır) ·
  20 diverged skill-body dürüst keptLocal (7013 yakınsama-politikası kalan iş) ·
  doctor.test.ts IDE-düzeyi tip gevşekliği (kozmetik; tsc-gate tests'i dışlıyor).

## Canlı truth (kompakt)

- `DOGFOOD_MODE=ON` · origin/main `0e55cb969` · **sprint-699 CANLI** (build-yasağı aktif) ·
  bot canlı · MASTER 541 satır/210 receipt validator-yeşil · repo CI-yeşili `f20e32e45`'te
  3/3 kanıtlı (sonraki docs-only commit'ler advisory) · full-suite kadans-sayacı: dün 1 tam
  koşu (3304 sertifikası); katalog-dokunuşlu landing'lerde Ders-32 mini-batarya zorunlu.
- follow-up-works envanteri: bu dosya (imleç) · cli-surface-reform-karar.md (ONAYLI-tasarım,
  dilim-1'de DIRECTIVES'e dönüşüp silinir) · verhex-transition-plan.md (4 açık owner-kararı) ·
  competitive-intelligence-watch-draft.md (owner-karar: park önerildi, henüz hükümsüz).

## Sabit yürütme contractı

`inventory → measured DAG → multi-task dogfood run → canlı PID/log/heartbeat → scoped tests +
lint/typecheck → real-binary proof → MASTER projection → zamanı geldiyse different-provider
XVerify → landing`

- Finding başka outcome'a aitse otomatik implement edilmez; owner-admission MASTER-kapısıdır.
- `.brain/memory.db` silinmez; `.tasks` `rm` ile temizlenmez; sprint sırasında build/auth-mutation
  yapılmaz; canlı sprint owner onayı olmadan kill/cleanup edilmez; sprint-sonrası `.tasks`
  hijyen-süpürmesi ritüelin son adımıdır.
- Commit/push öncesi `git branch -vv`; publish daima owner-manual.
