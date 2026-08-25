# GEÇİCİ AKIŞ — DOGFOOD CONTINUATION

> İş SSOT'u `docs/MASTER-PLAN.md`'dir. Bu dosya yalnız kısa vadeli yürütme sırasını taşır;
> closure authority veya yeni work identity üretmez. Tüketilen ayrıntı burada biriktirilmez —
> landed-kanıt MASTER satır-evidence'ına gider, bu dosya imleç + sıradaki-işi taşır.
> Yürütme yetkisi: **epoch 4, CLAUDE** — `ah-2026-08-25-zfv8yl` COMMITTED
> (`sha256:9cb638e4a58904a0514b341dac3509e6afa6bea763791602734d821012b4c5b7`, origin/main `dda40ec0d`).

## ŞU AN — çalışma-imleci (Claude epoch-4)

- ✅ **MİKRO-DALGA + PROB KAPANDI (2026-08-26 ~02:10; sprint-679 COMPLETE 2/2):** dockerignore
  hermetik-pini + öksüz i18n temizliği (679-002 honest-gate yanlış-pozitifinden fix'le geçti).
  **KABUL-PROBU GEÇTİ:** koşu boyunca `xverify_producer_result_mismatch` SIFIR (679-001 tek
  örneği alakasız eligibility-kapısı). MASTER 100 → VERIFY
  (`GR-2026-08-26-DECK-LAYER-PROOF-01`): CANLI image-layer probu — gerçek full-context build,
  runtime'da .deck/.env YOK, layer-tar'da sıfır .deck.
- ✅ **XVERIFY-ONARIM DALGASI KAPANDI (2026-08-26 ~01:00; sprint-678 2/2 ilk-denemede, gate PASS + tsc TEMIZ):**
  üç kök kapandı (CLI evidence-scope · producer-fence tabanı [sol] · hold-detail) + landing
  el-fix'i (oversize-filtre: dirty runtime-db broker'ı kilitliyordu). CANLI kanıt-zinciri:
  hold'lar ilk kez NEDENLİ konuştu (unsafe-.db → 19495/16000 tavan → verdict) ve formal boru
  İLK gerçek hakem-çıktısını verdi (sol UNCLEAR, dürüst diff-karar-verilemez gerekçesi).
  MASTER 350 kanıt-eki + 60 VERIFY (`GR-2026-08-26-TEST676-EVIDENCE-01`) bu commit'te.
  **KABUL-PROBU:** sıradaki sprintin otomatik cross-verify'ında kronik
  `xverify_producer_result_mismatch` SIFIR olmalı — ilk koşuda kontrol et.
- ✅ **C-DALGASI KAPANDI (2026-08-25 gece; sprint-677 8/8 İLK-DENEMEDE, ~8dk):** 3350/3351/541/3352/3353/540 altı satır receipt'li VERIFY (`GR-2026-08-25-CWAVE-*-01` ×6). Landing el-paketi: 5 tsc daraltması (mcp/plan readiness-union + init-steps dil) + 39-dosya mock-drift onarımı (3 paralel ajan; 4 sözleşme yeniden-ifadesi: doctor mixed/17-check, ghost-rejection kanonik-domain, e2e canonical-producer) + closure-projection regen + baseline'lar. 3350 canlı-prob: dry-run temp-agent YAZMIYOR (2→2). ÖLÇÜM (bonus 0.05 ilk gerçek koşu): 38 karar / 35 izli / bonusDecisive 0 / tie 0 — güvenli ama bu görev-karışımında etkisiz (fark ~0.08; tasarım gereği yalnız kıl-payı çevirir). LANDING-KUYRUĞU: suite-4'ün 206 kırmızısı (mid-run mutasyon + mock-drift) 3-paralel-ajan onarımı + 6 el-fix'le sıfırlandı; 677-002'nin CLI yüzey-eki (--write-allowlist) iki contract-SSOT'a + EXECUTE_OPT_IN_RE bileşik-bayrak fix'ine + mcp approve-override'ına bağlandı; error-ratchet sıkılaştı. **FİNAL MÜNHASIR FULL-SUITE: 38743/0 TAM YEŞİL (exit-0)** — kadans-verdict'i temiz.
- ✅ **EXPLORATION-BONUS DALGASI KAPANDI (2026-08-25 gece; MASTER 9073 DONE,
  `receipt=GR-2026-08-25-EXPLORATION-BONUS-01`):** sprint-676 3/3 ilk-denemede DONE (676-002
  sol-tier blend-mekaniği), gate PASS (tsc 0 + 84/84 vitest + 0 honesty), hiç fix-retry yok.
  Mekanizma flag-gated `routing_v3.explorationBonus` DEFAULT 0 = OFF; blend `s+b*(1-s)`;
  soğuk-eşik CELL_MIN_USES tek-kaynak; story-detail bonus+bonusDecisive. Gerçek-binary
  nötrlük: bonus-kodlu dist'te plan-digest bonus-öncesiyle birebir (`ca8837d8…`), canlı
  karar-kaydında sıfır exploration-izi. **ENABLEMENT CANLI (owner talimatı, ayni gece):** `routing_v3.explorationBonus: 0.05` set edildi; ölçüm sıradaki gerçek sprintte. Yeni gözlemler (bulgu-listesine): sprint-state
  "FIXING'de donuk" projection-gecikmesi 675+676'da tekrarladı · koordinatör post-COMPLETE
  ~13dk geç çıktı (sızıntı değil, yavaş kapanış) · xverify yeni reason
  `xverify_producer_result_mismatch` (676-001).

- ✅ **A3 EVENT-TRUTH DALGASI KAPANDI + LANDLENDİ (`1616d5ac5` origin/main):**
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
5. "vitest-yeşil ama tsc-kirli" örüntüsü 675/676/677'de üst-üste + dalga-sonrası geniş mock-drift: adaylar — Auditor tsc-FAIL'inin otomatik FIX-task doğurması; tam-factory `vi.mock`'lar için importOriginal-spread ratchet'i.
6. Honest-gate silme-only yanlış-pozitifi (679-002): `STUB_WRITE_DETECTED /
   SCOPE_VIOLATION_OR_EMPTY_WRITE` yalnız `linesAdded=0`'a bakıyor; 24-silme/0-ekleme +
   goCriteria-MET meşru temizlik DONE→NO_GO override yedi — gate `linesRemoved`'ı da
   hesaba katmalı.
7. Worker'ların `HEARTBEAT_IDENTITY_HOLD` (attemptId/backend host-bound değil) gerekçesiyle hb
   yazmayı reddetmesi — 674'te gözlendi; prompt/host-bound kimlik akışı incelenmeli.

## SIRADAKİ yürütme sırası

1. **explorationBonus 0.05 ÖLÇÜMÜ:** landing `a49a85bbb` + enablement CANLI (owner 2026-08-25
   gece talimatı; disk-config `routing_v3.explorationBonus: 0.05`, canlı dry-run kararlarında
   exploration-izi doğrulandı, bonusDecisive=0 — nazik mod). Sonraki gerçek sprintin
   decisions-jsonl'inden bonusDecisive + tie-oranı okunur; değer ölçümle kalıcılaşır/ayarlanır.
3. Ed25519 Work-480 töreni (OWNER-KATILIMLI; key repo-DIŞI): bundle
   `.deckent/runtime/closure-staging/work-480/bundle`, request
   `aprcdb-cb3eb74b4598bacc49b9ea6204208cca`, decision=allow verilmiş; tek oturumda
   sign → append → lint yeşil → Work-480 OPEN→DONE.
5. Bekleyen küçükler: eski MCP-artık
   süreçler (MCP server'lar hâlâ eski dist'te — restart owner-koordinasyonlu) · Slack/Teams secrets (owner) ·
   `.deckent/routing/decisions-v3/` ölü-dizin (owner-onaylı tek `rm -r`).

## Canlı truth (kompakt)

- `DOGFOOD_MODE=ON`, `WORKSPACE_MODE=MAIN`, `DELIVERY_MODE=DIRECT_MAIN`.
- Aktif sprint/worker YOK (674 ABORTED, 675/676 COMPLETE — hepsi arşivli); bot daemon fresh-dist'te
  canlı; 20-gate + build:all + tsc --noEmit yeşil; dist=src eşit.
- Nöbetçi-deseni: sprint-izleme ana-oturumda değil Sonnet-subagent'ta (A–F tetikleri) — A3'te
  iki koşuda da başarıyla çalıştı.
- Done-ready sayacı: **12/20** (+8 satır VERIFY'da owner-DONE bekliyor: 6 C-satırı + 60 + 100) — önceki 10 + A3 event-truth (3354 VERIFY) + exploration-bonus (9073 DONE).
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
