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

**GÜNCELLEME (akşam, sprint-699 kapanışı):** Sprint-699 3/4 DONE + 004 dürüst-NO_GO'su
gerçek boşluk buldu (test-guardian: classifyFixPhaseTasks fixEligible-yönlendirmesi yok) —
el-seam ×2 ile kapandı (classify-yönlendirme + canlı-sınır prepareResultEvaluationAttempt
kablosu; T1 deprecated evaluateResult'a bağlamıştı). Bounded-replay r5 KISMİ-YEŞİL:
preDispatchSettlement typed ✓ + bağımlı cascadeSkipped ✓ (önceden blocked-pause!), ama
repair-machinery (3284 alanı) FIX doğurmayı sürdürüyor + doğan repair forceSkills kısıtını
düşürüyor (yetki-notu MASTER 3284'te) → **3301 tam-sertifikası 3284-consumer kablosuna bağlı**.
Owner Q&A-3 kararları mühürlendi: 3284 ADMIT (keşif+sprint) · CLI dilim-1 = sertifika-adımı
sonrası hemen · CI-watch ADMIT (MASTER 6181, kuyruk-sonu). `post-product.md` owner-kararıyla
repo'ya girdi (VISION_ONLY; MASTER-mutasyonu yasak kendi bloğunda). Ayrıca canlı routing-bulgusu:
"aynı-üçlü" skill-seçim patolojisi yaşıyor (MASTER 9034 evidence).

**OTONOM-KOŞU GÜNCELLEMESİ (akşam-2):** Owner "hepsini planla-tamamla + do/mission-v2 yüzeyini dene" emri yürürlükte.
(1) **Yüzey-kararları:** mission-v2 bugün yalnız `task`-kind kabul ediyor (fence dürüst; sprint-sınıfına uygun değil) · **`do` = kazanan** — tek NL-hedeften kriterli 4-task plan üretti, sprint-700 bu yoldan 4/4 DONE koştu; 16-task fan-out talimatını 5 tutarlı task'a SIKIŞTIRDI (bulgu: max-üst-sınırı sayı-hedefi olarak kullanmıyor; kalite-öncelikli) · do dry-run scope-gate'i yeni-dosya ağaçlarını typo sanıyor (--force-scope gerekir; bulgu).
(2) **3301 son-metre zinciri (r6→r11):** FIX-mint bastırma canlı-kanıtlı · cascadeSkipped ✓ · unresolved-pause'lar geçildi (truth-normalizasyonu: policy-terminal NO_GO→NOT_DISPATCHED) · INVALID_IDENTITY kapandı (host:cascade-skip kimliği) · honesty-boundary muafiyeti · lineage POLICY_FIX_EXEMPT. **Kalan tek engel:** karışık-sonuç COMPLETE-yayını (cleanup-eligibility BLOCKED reasons-envanteri) — 3284 terminal-kontrat alanına bağlandı; sertifika oradan.
(3) Bekleyen büyük-do önerisi: sprint-701 adayı `d3127454` (CLI dilim-1a, 5-task/3-dalga) — onay+start sırada. Eski bayat öneri `c52100fe` retire-edilecek.

**OWNER-YÖNERGELERİ (akşam-3):** (1) **CI-askısı:** Actions aylık-limiti doldu → Eylül'e
kadar remote-CI takibi YOK; kırmızı/iptal beklenen, fix-chasing yapılmaz (advisory zaten,
şimdi askıda). (2) **docs/post-product/ portföyü owner-malı ve local-only** (6 program +
README, 91 VISION_ONLY outcome; gitignore/npmignore owner-elinde, commit owner'ın) — benim
stage-listelerim `docs/post-product*`'ı açıkça DIŞLAR. Şeffaflık-kaydı: eski
docs/POST-PRODUCT.md silinmesi docs/-süpürmesiyle 5b88f4539'a istemeden girdi (tip temiz);
içerik c204e09fe'de public-history'de duruyor — tam-gizlilik istenirse history-rewrite ayrı
owner-kararı (Eylül adayı).

**KAPANIŞ (akşam-4):** **CLI dilim-1a LANDED** — sprint-701 (2/4 worker; 003 FIX-sarmalı =
Ders-31 çapraz-kirlilik, direktif-hatam) + el-kapanış: 31/31 yeşil, tsc-0, 20-gate yeşil,
GERÇEK-BINARY yeni `-h` (164→24 satır, 4 grup + Advanced + deprecated-bloğu). Registry
canlı-evren gerçeğini de kanıtladı (eski tarayıcı local-llm'i görmüyordu). CI Eylül-askısında
— doğrulama tamamen lokal-ritüel. **DURUM: kısa-vade kapanış tamam; owner'ın ara-işi bekleniyor.**
Kuyruk-artığı (owner dönünce): dilim-1b (kaldırmalar+onay-federasyonu) · 3284/publication-
contract · CI-watch 6181 · flip-merdiveni.

**21:00 PENCERE-KAPANIŞI:** Plan 3/3-esaslı tamamlandı. (1) **Dilim-1b LANDED** (sprint-702:
12 alias + fold'lar + federated approvals --class + provider-genel limits + truth-fix;
el-kapanış: parity-anahtarları, status --debt gerçek-implementasyonu, layer-atom takası) +
kök-help owner-revizyonu (dikey+açıklamalı, deprecated-blok kalktı). (2) **3301 SERTİFİKA 🏁**
(sprint-703 publication-contract + r13: bounded-replay KENDİ KENDİNE COMPLETE — receipt
terminalTruth {1/1/1}, FIX-mint 0; kök-gizem stale-dist çıktı → build-ritüel dersi).
(3) CI-watch 6181 pencereye sığmadı — kuyruğun başında. Ladder-durumu: 3301 kapanmaya hazır
(DONE-flip owner-mühürüyle); 3302→3284-kalanı; 3304/3299 merdiven-sıralı.

**2026-08-28 GECE — ARA-İŞ: TMP-DOGFOOD DEVİR-PAKETİ + 3 OWNER-KARARI.** Owner'ın beklettiği
ara-iş geldi: tmp-dogfood session'ın kontrollü main-eşitleme devir-paketi. Ana-şerit 3 bütünlük
kontrolüyle doğruladı (receipt DIGEST-MATCH `7bfc410f…`, base→main tam 23 commit, Work-480-gate
diskte gerçek). Owner Q&A kararları: (1) **480 XVerify şimdi** → 3. denemede **CONFIRMED/ALLOW
mühür** (codex→claude-opus-5, 297.970 token gerçek-çağrı, receipt `c7d508bd…`; deneme-1 canlı-DB
conjunct'ı, deneme-2 evidence-mount ~2KB render-kırpılması — altyapı bulgusu); kalan TEK gate =
owner Closure disposition. (2) **Sync-paketi ADMIT kuyruk-sonuna** → MASTER 3356
TMP-DOGFOOD-MAIN-CONTROLLED-SYNC-001 (P03, dep: PROVIDER-OBS-MIGRATION-001); kanıt-korpusu
kalıcı: docs/audits/tmp-dogfood-main-sync-2026-08-27/. (3) **3301 mühür onayı verildi ANCAK
validator formal DONE'u 3-typed-sebeple blokladı** (3300 VERIFY-dependency + evidence-dil +
GR-receipt yok) — sessiz bypass yok, OPEN'da mühür-onayı kayıtlı; formal yükseliş owner-katılımlı
receipt-töreni ister (3300+3301 birlikte). Ayrıca 6181 taslağı silinme-tetiğiyle lane-brief'e taşındı.

**2026-08-28 SABAH — FAZ-0 + FAZ-1 LANDED, FAZ-2 HARİTASI OWNER'DA.** Owner "kuyruğu planla
ve yürüt" emriyle plan-modu turu koşuldu (4 owner-kararı: kernel-ağacını-kapat-sonra-yayın ·
VERIFY toplu-yükseliş · 480 Closure ver · CLI dilim-2 sıraya). **Faz-0** (`92a5c154a`):
Work 480 `DONE` + kapsül arşive, 3301/3296 `OPEN→VERIFY`, `GR-2026-08-28-LADDER-01`.
**Faz-1** (bu commit): MASTER 3284 çekirdek dilimi — sprint-704 (do-kaynaklı 4 task, 4/4 DONE,
biri dürüst NO_GO→FIX) + ana-şerit el-kapanışı (sprintId kapsamı · try/finally settle ·
DRAIN_REQUIRED daraltması). 16 yeni test + komşu 60 test yeşil, tsc-0, 20-gate yeşil, taze
build. **Canlı kanıt (L=1):** izole fixture'da overflow onarımı GERÇEKTEN dispatch edildi ve
run ancak kuyruk boşalınca dürüst resumable PAUSE'a gitti (`.analysis/replay-3284-20260828/`).
**Faz-2:** yayın kapısının gerçek boyutu ölçüldü — 10 satır / 4 katman gerçek `DependsOn`
ağacı (dipte KERNEL-STATE · AUTHORITY · RECEIPT · REACHABILITY). Harita + 3 seçenek:
`follow-up-works/kernel-tree-closure-map.md` (owner-kararı bekliyor). Ucuz kazanç bulundu:
X hücresi için 7 satırlık emsal var → CI olmadan `-` çevrimi mümkün; 3275'in MASTER metni
17 gündür landed işi anmıyor.

## 📌 KERNEL-TREE DEVRİ — yeni session buradan başlasın

> Owner kararı: kernel-tree işine **yeni bir session'da temiz ve detaylı** başlanacak.
> Bu blok o session'ın ilk dakikada tam resmi görmesi için yazıldı; başka yere bakmadan
> aşağıdaki üç dosya yeter.

**Oku (sırayla):** `follow-up-works/kernel-tree-closure-map.md` (ölçülmüş ağaç + 3 seçenek) →
`docs/governance/deckent-dev-operating-policy.md` (mod/yetki) → `docs/MASTER-PLAN.md` ilgili satırlar.

**Karar noktası (owner'a ait, henüz verilmedi):** haritanın §6'sındaki üç seçenek. Ana-şerit
önerisi 2 numaraydı: önce ucuz formal kazançlar (X hücresi `-` çevrimi — repoda 7 satırlık emsal
var, CI'sız yapılabilir; 3275 metninin gerçeğe hizalanması ✅ yapıldı; 3274'e taze receipt),
sonra kalan gerçek işi yeniden ölç.

**Ölçülmüş ağaç (her kenar `DependsOn` hücresinden okundu):** yayın kapısı 3299 →
{3295 → SCHEDULER-001(3140) → KERNEL-ATTEMPT-001(3030) → KERNEL-STATE-001(3020)+AUTHORITY-001(4000)} ·
{3296 → PROVIDER-HOLD-001(4101) → LIMIT-001(4090) → RECEIPT-001(4070)+REACHABILITY-001(4080)} ·
{3298 → 3290 → PAUSED-FINALIZE-001 + LINEAGE-SETTLEMENT(3282)}. Yani "yayından önce ürün
çekirdeğini bitir" demek — 10 satır, 4 katman.

**Dürüst sınır:** CI Eylül'e askıda; X=0 taşıyan satırların formal DONE'u cross-platform kanıt
ister. Emsal-gerekçeli `-` çevrimi bu kilidin bir kısmını CI'sız açar, hepsini değil.

## SIRADAKİ (bu sıra ile)

1. **Kernel-tree** — yeni session, yukarıdaki devir bloğuyla başlar (owner kararı bekliyor).
2. **6181 dilim-3** — capability kaydı + Goal-v2 günlük 09:00 Europe/Istanbul zamanlama +
   `deckent intelligence` CLI + EN/TR docs + gerçek-binary kapanış. (Dilim-1 ve dilim-2 landed.)
3. 3302/3304/3299 flip-merdiveni + owner receipt-töreni (3300+3301) → yayın-zinciri →
   kuyruk-sonu: 3356'nın HOLD'daki P6/P7 paketleri (ayrı owner-outcome ister).

## Açık küçük bulgular (admission'sız, kayıt)

- `memory_budget` config-types'ta V1-deprecated bölümünde; V2 `memory` bloğunda budget alanı
  yok (tip/doc temizliği adayı) · runDecay/cleanup son-çare `?? 900` literalleri
  getDefaultConfig'e bağlanabilir (davranış etkisi yok) · run-flow-coordinator truncation
  sınırı `1 << 12` ayna-literal (store sabiti export edilirse tek-kaynaklaşır) ·
  20 diverged skill-body dürüst keptLocal (7013 yakınsama-politikası kalan iş) ·
  doctor.test.ts IDE-düzeyi tip gevşekliği (kozmetik; tsc-gate tests'i dışlıyor).

## Canlı truth (kompakt)

- `DOGFOOD_MODE=ON` · aktif sprint YOK · bot canlı (taze-dist) · MASTER 543 satır validator-yeşil ·
  **CI Eylül'e kadar ASKIDA** (Actions aylık limit — owner direktifi; doğrulama local-only ritüel) ·
  gate zinciri artık **21** (yeni: `lint-doc-command-truth.mjs`).
- 2026-08-28 landed zinciri: `92a5c154a` Faz-0 töreni → `0507eba8b` 3284 çekirdek (L=1 canlı kanıt)
  → `c57370501` 3275 ölçüm düzeltmesi → `73dacaaeb` 6181 dilim-1 → `f38595061` 3356 P0
  (worker-core kapısı + MCP karar-disposition) → `2f65bf1c6` P1 doc-truth gate → `862335638` P2
  hermetiklik muhafızı → `8aaa44287` planner-failure gizlilik onarımı → `f25ee3799` P3 scope-hold →
  `eda5da8a2` P3 attribution pini → `fad788f06` hücre sıkıştırma → `0e9c889b4` P5 çerçeveli digest
  → `f6e71c8c6` 6181 dilim-2.
- XVerify mühürleri (hepsi CONFIRMED/ALLOW): Work 480 `c7d508bd…` · 3356 worker-core `301feacc…` ·
  6181 dilim-2 `2a07b7d9…`.
- follow-up-works envanteri: bu dosya (imleç) · **kernel-tree-closure-map.md (owner-kararı bekliyor)** ·
  cli-surface-reform-karar.md (dilim-1a+1b landed; dilim-2/3 ve 5 tasarım-sorusu açık) ·
  verhex-transition-plan.md (4 açık owner-kararı).

## Sabit yürütme contractı

`inventory → measured DAG → multi-task dogfood run → canlı PID/log/heartbeat → scoped tests +
lint/typecheck → real-binary proof → MASTER projection → zamanı geldiyse different-provider
XVerify → landing`

- Finding başka outcome'a aitse otomatik implement edilmez; owner-admission MASTER-kapısıdır.
- `.brain/memory.db` silinmez; `.tasks` `rm` ile temizlenmez; sprint sırasında build/auth-mutation
  yapılmaz; canlı sprint owner onayı olmadan kill/cleanup edilmez; sprint-sonrası `.tasks`
  hijyen-süpürmesi ritüelin son adımıdır.
- Commit/push öncesi `git branch -vv`; publish daima owner-manual.
