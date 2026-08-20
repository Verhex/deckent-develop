# ÇALIŞMA MANTIĞI — 7094 WORKER-PROMPT-COST (owner-onaylı süreç hafızası)

> Amaç: Alperen unuttukça buradan hatırlatır; Fable her oturumda buna göre hizalanır.
> SSOT iş-takibi: `docs/MASTER-PLAN.md` 7094 satırı. Bu dosya SÜREÇ hafızasıdır, iş listesi değil.
> Silinme-tetiği: 7094 DONE olduğunda bu dosya MASTER satır-kanıtına gömülüp SİLİNİR.

## Yürütme modeli (owner emri 2026-08-19)
- Bu işin düzeltmeleri **deckent dogfood sprint'iyle DEĞİL, Fable subprocess ile** yürür
  (sebep: tokenizasyon/prompt/maliyet/kalite deneyi, dogfood worker'ları değişimin ta
  kendisini kullanırken doğru analiz edilemez — ölçüm aracı deneyden ayrılır).
- Her tamamlanan parça **codex xverify** (gpt-5.6-sol) ile mühürlenir; HOLD ≠ kapanış;
  nokta-iddia + `--files/--diff/--target` disiplini; evrensel kelime yasak (Ders-18).
- Ölçüm koşuları (A/B) deckent'in KENDİSİYLE yapılır (567-tarzı sabit görev-seti:
  1 kapsamlı + özdeş-basitler + 1 denetim; opus+sonnet): debt'ler koşu öncesi
  deprioritize edilir, `--force-replan --force-scope`, sonra geri alınır.
- Metrik seti: ilk-çağrı cacheCreation/cacheRead · toplam read/write · turn · süre ·
  USD (CLI-raporlu, biz hesaplamayız) · GO-oranı + çıktı-denetimi (kalite-guard).
- Tek değişken kuralı: her A/B'de YALNIZ bir varyant değişir; **`adr_min_relevance`'a
  ŞİMDİ DOKUNULMAZ** (kazancın koddan mı parametreden mi geldiği ayırt edilemez olur;
  testler sonrası gerekirse owner kararıyla).

## Ölçülmüş taban (2026-08-19; kanıt: 563 logları + 567 deneyi + Explore haritası)
- Maliyetin %91-95'i cache-read; turn 10-50; task $0.34-4.81 (CLI-raporlu USD).
- Katman A: CLI-önek 18.264 tok (32 tool-şeması+34 slash+19 skill+8 agent) — bu katman
  worker'lar-arası ZATEN paylaşımlı (`--exclude-dynamic...` default-açık sayesinde).
- Katman B: CLAUDE.md 17.719 B cwd-auto-load (kapatma anahtarı: `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`).
- Katman C: `.prompt` 9.5-16.8k tok — %36 TAM-ADR (operative-marker'lar ADR'lerde yok →
  kesim çalışmıyor) + %21 göreve-duyarsız alfabetik-ilk-3 skill + bayt-209'da attempt-nonce'lu
  landing-önsözü (arkasındaki 15.211 B bayt-aynı bloğun cache-hit'ini tek başına öldürüyor).
- Turn üreticileri: host'un gerçekten doğruladığı yalnız `.result` + landing-proposal;
  `.plan` sıfır-kontrol, `.hb` yalnız existsSync.

## Fazlar ve durum
- **F0 mühürler:** P1 CONFIRMED `…f4e859` (landing-önsöz + xverify-v2 istisnası);
  P2-P4 dürüst-HOLD → bölünmüş mühür F1 doğrulamasıyla birlikte.
- **F1 (Fable-subprocess, sırada):** (a) landing-önsözünü SONA taşı (coordinator
  template sırası) · (c) skill-seçimini göreve-duyarlı düzelt · (d) `.plan` kaldır +
  `.hb` tek-yazım. — F1b ADR-marker owner-karar bekliyor (KANUN 2: ADR gövdesine
  render-işareti ekleme onayı); `adr_min_rev` ERTELENDİ (yukarıdaki kural).
- **F2:** `--tools` daraltma + `--disable-slash-commands` + `.claude/{skills,agents}`
  mount-dışı + `reorderLeadingT0` ON.
- **F3:** `--bare -p --system-prompt-file <stabil-çekirdek>` + CLAUDE.md-worker-enjeksiyonu=0
  A/B'si; codex: `AGENTS.override.md`/`-c` project-doc + `--ephemeral`.
- **F4:** tier-routing (basit→haiku) + model-bazlı turn-disiplini.
- **F5:** görev-sınıfı prompt-profilleri — ürün özelliği, config-resolved
  (isInspectionOnly/isDocOnly deseni genelleştirme).
- **F6 (kapsam genişlemesi, owner 2026-08-19): dağıtım-matrisi çözümü** — aynı
  optimizasyonların HER ortamda doğru karşılığı: Anthropic API (cache_control
  breakpoint'leri — SDK/native adapter), **Bedrock / Vertex** (kendi prompt-cache
  semantikleri), **OpenRouter** (cache passthrough), Cursor/Claude/Codex CLI core'ları,
  **local-llm** (cache yok — prompt-yükü bağlamı ŞİŞİRİR; minimal-profil zorunlu).
  Herkese-özel çözüm: solo → team → enterprise (LAW 1-2); tek global ayar YASAK,
  provider/ortam-başına config-resolved profil.

## Ara-madde kuralı (owner 2026-08-19): wire/landing tüketici-taraması
- Her F-değişikliği landing'e girmeden önce deckent'in TÜM bağımlılıkları —
  listener / client / server pozisyonundaki özellikler — yeni yapıya uygunluk
  için taranır (örn. F1d: .plan/.hb tüketicileri — heartbeat-monitor, dashboard
  currentAction, nervous stale-worker, xverify .plan okumaları, api/SSE).
  KIRILIR-sınıfı bulgular aynı pakette düzeltilir; tarama raporu kanıta girer.

## Kanıt yerleri
- MASTER 7094 satırı (admission + F0 receipts) · sprint-567 receipt'leri
  (`~/.deckent/runtime/task-result-settlements/...`) · Explore haritası + doc-kanıtları
  bu oturumların MASTER bloklarında · resmi doc: code.claude.com (bare/system-prompt-file/
  exclude-dynamic/CLAUDE_CODE_DISABLE_CLAUDE_MDS) + openai/codex (ignore-user-config/
  ephemeral/AGENTS.override.md).

## F6 araştırma sonucu (2026-08-19 — dağıtım-matrisi; tam rapor MASTER 7094 oturum kaydında)
- **Kritik:** 5-arketip cache mimarisi (src/providers/cache-adapter.ts + cache-adapter-resource.ts
  + core/catalog/cache-archetype.ts) inşa edilmiş, test edilmiş, **production'a BAĞLANMAMIŞ**
  (tests/governance/orphan-deliverables.test.ts:545-546 açıkça orphan kaydetmiş). Native
  Anthropic transport (agent/provider-tooluse/anthropic.ts) cache_control EMİT ETMİYOR;
  claude.ts:863 attachCacheControlToMessages hazır-çağrısız.
- Ortam profilleri (özet): Anthropic-API → Arketip-B (T0+T1'e ≤2 breakpoint; min-token
  MODEL-BAZLI 512-4096 registry'den; 5m=1.25×/1h=2× write, ~0.1× read) · Bedrock → aynı
  cache_control InvokeModel'de çalışır (auto-cache YOK; model haritası bayat) · Vertex-Claude →
  adapter yok · Gemini → implicit default + yalnız büyük-korpusta explicit cachedContents
  (SAATLİK depolama ücreti — delete garantisi şart, C-adapter bunu yapısal veriyor) ·
  OpenRouter → cache_control passthrough DESTEKLİ ama bizim adapter content-blok iletmiyor;
  ölçüm cached_tokens + /generation.cache_discount · OpenAI/Codex → otomatik ≥1024;
  API-direkt'te tenant-scoped prompt_cache_key · local-llm → para-cache yok: MINIMAL-T0 +
  byte-exact prefix + cache_salt=tenant; ölçüm süreyle · Cursor → usage/cache alanları
  DOKÜMANTE DEĞİL; ölç-ve-öğren, çarpan varsayma.
- İlke: tek global ayar yok — provider×ortam profili config-resolved (F5 ürün özelliğiyle birleşir).

## 3-tur stabilite + 7094-R onarım paketi (2026-08-19)
- **Stabilite (571 ref vs R1/572·R2/573·R3/574):** mimarinin kontrol ettiği metrikler
  ±%4 stabil (taze-input 3.38-3.52k; basit-cW 11-13k); kapsamlı-görev $0.78-1.18
  salınımı davranışsal (tur-sayısı×cRead korele; F4-tier/turn işi). Kalite yapılı
  (rehber 283-603 satır / 34-86 H2). R2/R3 debt-istilasıyla yarıda durdu → temiz
  6/6 tur yalnız R1; owner kararı: F3 ürün-default'u 3 TAM temiz tur + kusursuz
  analiz olmadan AÇILMAZ.
- **NO_GO kök-neden (maliyet-değişikliği DEĞİL, kanıtlı):** DOC_WRITE correctness
  `testsPassed`e bağlıydı → dürüst `false` yazan doc-worker NO_GO, "tests passed"
  uyduran DONE (571/573 kanıtı; 573-006 attempt+3 fix aynı cezayla düştü ~$0.93).
- **Debt+dependency 5-halka zinciri (owner endişesi doğrulandı):** (1) başarı-raporu
  notlu debt doğumu → (2) escalateDebt her kapanışta critical'e geri yükseltir
  (deprioritize workaround tek-tur ömürlü) → (3) plana debt-prepend slot kaydırır →
  (4) "Task N"/integer ref debt-DAHİL listeye indexlenirdi → görevler debt'e bağlanır
  (573-004←573-001 disk-kanıt scheduler-shadow) → (5) debt-fix NO_GO → FIX-bütçe
  biter → breaker zinciri parked (4/8 görev hiç koşmadı, R2+R3 aynı).
- **7094-R düzeltmeleri (owner onayı; tek MASTER satırı):** D1 resolveDependencyRef
  index-formları directive-only alt-liste (task-builder) · D2-minimal doc/audit
  sınıfında testsPassed nötr + self-NO_GO tavanı + legacy doc fast-path öne
  (result-evaluator; kapsamlısı ayrı EVALUATOR-HONESTY maddesi) · D3 success-echo
  DebtClass (üretim stamp + injector skip + başlık-önek soyma + fix-description
  çerçevesi) · D4 = kod değişikliği GEREKMEDİ kanıtı (breaker/redispatch/unblock
  zinciri sağlam; blokaj D1-remap belirtisiydi) + blockedDependencyEdges teşhisi.
- **Ders:** ölçüm-sprintleri arasında finalize→escalateDebt yan-etkisi var; ardışık
  deney turlarında debt-yönetimi tur-BAŞINA yapılmalı (tek seferlik yetmez).

## F4a Turn-Economy v2 + F1b ADR-marker (2026-08-19 gece)
- **F4a (LANDED-aday):** TURN_ECONOMY_BLOCK'a madde 5-6 (tek-Write üretimi;
  yazılanı geri-okumama; basit görevde 2-tur ideali). 3-koşu kanıtı (575/576/577):
  kapsamlı cR 264-428k → 150-240k (bandın TÜMÜ aşağı; en kötü F4a-cR < en iyi
  F3-cR), out 18-25.6k → 13.7-17.4k, USD $0.72-0.97 (F3-ort ~$0.96'ya karşı
  ort $0.83, -%14; kümülatif 567→ -%57..-%68). Kalite 378-415 satır/44-87 H2
  bandında. cW artışı (tek-Write büyük blok) net-USD'yi bozmuyor. Kalan varyans
  ±%16 davranışsal. Kronikler F4a'dan bağımsız sürüyor: 004-soğuk-fix (S1,S2),
  005-denetim rubrik-DIŞI NO_GO (575 attempt-1 92.5/5-passed'a rağmen; 577'de
  fix-bütçe→006 bloke — pause mesajı D4 kenarıyla '577-006←577-005' İLK ÜRETİM
  görünümü). 005-sınıfı → 7097/7092 finding; audit-rationale gate-kaynağını
  taşımıyor (teşhis eksiği) → 7092 finding.
- **F1b (LANDED-aday):** governing-tier artık yazar-pinli worker-operative
  marker'a saygılı (marker-slice + amendment-history pointer'ı); markersız ADR
  tam-gövde (zero-loss varsayılan). 48/50 ADR'ye mekanik marker (## Decision
  bölgesi; adr-d-013 + adr-g-039 Decision'sız → tam-gövde; yedek:
  scratchpad/adr-backup-20260819). Uçtan-uca kanıt sprint-578 gerçek .prompt:
  iki governing-ADR slice+pointer ile girdi; ADR bölümü 37.9KB→17.3KB (-%54).
- Onay-devri notu: owner 'onay yetkisi devredildi' (2026-08-19 gece);
  approvals decide pseudo-TTY (script -qec) + --reason owner-delegated iziyle
  veriliyor; bir istekte 'canlı yeniden-doğrulama yok' fail-closed'u görüldü
  (tutarsız) → xverify-ux finding.

## F2b --disable-slash-commands (2026-08-19 gece, sprint-579)
- F3-core moduna bağlı tek bayrak (deckent-owned composition bileşiği): CLI
  slash+skill kataloğu prefix'ten düştü. TEK-KOŞU ölçüm (taban F4a-bandı):
  **taze-input 3.38k → 1.23k (-%64)**; basit-görev cW 11.1-11.4k → 9.1k (-%20),
  cR 71.7-72k → 67.9k; basit USD $0.177-0.191 → **$0.153-0.155**; kapsamlı
  $0.734 (band-altı), cR 138.6k (band-altı). F2a'daki cW-patlaması YOK (farklı
  katman). 6/6 DONE (2. kez); kalite 386 satır/46 H2 band-içi. 005-kronik yine
  fix yedi ($0.76) — F2b-bağımsız. KÜMÜLATİF (567→): basit -%60, kapsamlı -%67.
- Not: workspace-mount repo `.claude/skills+agents`'ını (ilgisiz tasarım
  katalogları) her worker'a taşıyordu — bayrak bunu da kesiyor. F2c (agent
  kataloğu ayrı maskeleme / --safe-mode) beklenen marjı küçük → sonraki dalga.
- Bot restart yapıldı (pid 1439833, taze dist).

## 7097 çekirdek paketi (2026-08-20 gece) — kroniğin ölümü
- KÖK: hasConcreteEvaluationFailure sınıf-körüydü (testsPassed===false → sarmalayıcı-NO_GO,
  doc'ta bile) — '5/5-passed NO_GO' göçmen-kroniğinin gerçek adresi; D2'nin kriter-içi
  düzeltmesinin sarmalayıcı-ikizi. FIX: sınıf-bilinçli veto + typed concrete_failure_veto izi.
- B1: 11 override-noktası typed cause; ana/extension/grace/fix audit'leri post-rubric zinciri.
- B3: kanıtsız-test-iddiası tavanı (CODE; DONE→DEBT; kanıt=test-dosyası|coverage|koşu-izi).
- B4: residualDebt alanı (tip+sözleşme+ledger-tercihi+echo-muafiyeti).
- KANIT: sprint-582 = 6/6 DONE, 0 fix, 0 NO_GO — İLK tamamen temiz tur (F3 '3 temiz tur'
  hedefinin 1.si). 580/581 blokajları D4-kenarlarıyla temiz-kayıtlıydı (580-005←580-004...).

## TEMİZ-TUR SAYACI: 3/3 (2026-08-20 sabah)
- 582 (7097 kanıt-koşusu) + 583 + 584 teyit turları: üçü de 6/6 attempt-1 DONE,
  0 fix, 0 NO_GO — veto-fix sonrası kronik tamamen öldü. Kanıt-manifesti
  .analysis/clean-rounds-582-584.md (18 kayıt). 584 çekirdek-6 = $1.806
  (567 $4.674 → -%61; kapsamlı $0.663 → -%70). Kalite band-içi.
- F3 ürün-default kararı owner önünde (şart yerine geldi: 3 tam temiz tur).

## F3 ÜRÜN-DEFAULT = TRUE (owner 2026-08-20)
- 3/3 temiz-tur şartı yerine geldi → `worker_core_system_prompt` default true
  (config.ts; F2b bayrağı da core'la birlikte). false = stok-CLI bayt-parite.
- .tasks tamamen temizlendi (246 xv-stub arşivde: .tasks/archive/xverify-2026-08-20).

## F3 iki-yol wiring denetimi (owner sorusu, 2026-08-20)
- Unit: loadConfig 3 merge-yolu (bölümsüz/kısmi/explicit-false) doğru değer ✓.
- Canary kaldırıldı (.deckent/config.json'dan explicit-true silindi) — default-yol CANLI.
- Gerçek-koşu kanıtı: sprint-585 (DEFAULT) worker argv = --system-prompt-file
  .worker-core-641605c0e840.md + --disable-slash-commands, 1/1 DONE;
  sprint-586 (EXPLICIT-FALSE) worker argv = core-args YOK (stok-CLI), 1/1 DONE.
- xverify kararı: GEREKSİZ — kanıt sınıfı mekanik/grep-doğrulanabilir (argv+pin+unit);
  mühür nokta-iddia gerektiren yorum-katmanı taşımıyor.

## Doğruluk & Mühür Altyapısı dalgası (2026-08-20 sabah) — 7093 + ranged-verifier + karusel
- **7093 UYGULANDI:** usageCounts artık ŞEMA-bazlı fresh-input (inclusive-cache
  anahtarı varsa input−cached; sprint-497 kuralının sayaç-katmanına inişi;
  codex 12×-şişkinlik canlı-şekli pinli, anthropic disjoint korunur, gemini
  cachedContentTokenCount alt-küme düzeltildi — eski pin YANLIŞ semantiği
  kodluyordu). host-runtime-budget + cli-log yollarında totalTokens dolu.
  Kabul-3 notu: normalize sonrası sütunlar provider-bağımsız aynı anlamda —
  'etiket' ihtiyacının kökü kalktı.
- **Ranged-read-verifier UYGULANDI (17-HOLD sınıfının kökü):** --target artık
  prompt-prozu değil BİRİNCİ-SINIF kanıt: broker'da writeCrossVerifyDecodedSlice
  (pinli decoded-blob'dan CAS-slice), bootstrap ranged-requirement (`path:S-E`
  grameri) → slice-entry (locator+slice-sha), CLI requirement-yükünü slice'a
  bağlar, prompt tek-kaynak mount'a işaret eder. CANLI KANIT: 2×-UNCLEAR D1
  iddiası slice'la İLK denemede CONFIRMED `…4d7d4ecadac9`; toplam 4 ardışık
  slice-mühür CONFIRMED. Ek ders: kod değişince mühür-iddiası YENİDEN ölçülür
  — bayat-satır iddiasını Sol doğru REFUTED etti (verifier ayırt-gücü kanıtı).
- **Onay-karuseli — katman-1 ÇÖZÜLDÜ:** kök zinciri: reachability-expiry =
  min(ttl, approval-expiry, LIMIT-expiry) → 60sn limit-snapshot'ı kaydı
  öldürüyordu; ara-adımda approval-penceresi (~5dk) kaldı; FINAL sözleşme:
  kayıt-ömrü = ttl (onay penceresi probe'un YAPILMA sınırı — freshness-assert
  + one-shot claim korunur; clamp'ler kalktı). Disk-kanıt: TTL 53s→291s→1800s.
  Producer default 60s→30dk + config `cross_verify.reachability_ttl_ms` +
  composition passthrough.
- **Katman-2 AÇIK (7081-kalan):** onay-İSTEĞİ reuse-kontrolünden ÖNCE
  üretiliyor (evidence-preparation approval'ı koşulsuz topluyor) — taze kayıt
  varken bile istek doğuyor; düzeltme: preparation'a approval-öncesi
  taze-kayıt ön-kontrolü. Ayrıca pseudo-TTY 'untrusted' tutarsızlığı finding.

## Karusel katman-2 KAPANDI (2026-08-20)
- Üç kilit: (1) preparation ön-kontrolü account-agnostik (null-hash sorgusu
  satırı hiç bulamıyordu), (2) producer'da onay yalnız gerçek-probe anında
  (probe_approval_required typed-hold; reuse onaysız ready), (3) erken-dönüş
  yerine onay-atlama + kanonik refresh (taze limit-yazımı — candidate-projection
  min-freshness şartı; erken-dönüş authority_failure üretiyordu).
- KESİN KANIT: mühür-çifti onay=1/CONFIRMED → **onay=0/CONFIRMED** (…944858500a06).
- Ders: 'reuse' yolu hiç canlı koşmamış yol sınıfıydı — üç ayrı katman kilidi
  ancak canlı-çift-koşu döngüsüyle söküldü; her ara-adım typed-hold verdiği
  için teşhis hep diskten okundu.

## Evaluation-Surface dalgası (2026-08-20, owner-yön mesajı)
- OWNER KONUMLANDIRMASI 9040/EVALUATION-001 satırına işlendi: universal
  deterministik çekirdek + task-kind girişli + custom-confirmation adapterları
  (kod/LLM/insan; desteklenmeyen mod typed-HOLD) + TÜM ingress'lerde
  (start/run/runs/do/autonomous) TEK evaluation-authority; ERP↔solo aynı kalite.
  Yeni root YOK (brief-§3.5 kararı): dilimler 9040+GOAL-ACCEPTANCE+KERNEL-
  SETTLEMENT+SPRINT-HONESTY altında.
- İLK TUĞLA (7097-madde-3) KODLANDI: src/orchestra/criterion-evaluation.ts —
  typed goNogo.items deterministik çekirdeği (dosya-yolu/ranged-gramer kanıtı;
  prose=dürüst-undecidable, ASLA ceza; any-of semantiği adjudication'la aynı) +
  rubrik-köprüsü (goNogo:<id> audit-satırları + decisive typed-contract failure
  → NO_GO tavanı; projectRoot'suz çağıran etkilenmez). 9+198 test yeşil.
  Güvenli-devreye-alma: mevcut tüm items prose'lu → etkisiz; dosya-yollu
  sözleşme yazıldıkça etkinleşir.
- 7098 DOGFOOD-CANARY (587→…): İLK koşu PLAN prompt-gate'inde dürüst BLOCK ile
  değerli defekt yakaladı: phantom-tail suppressor ÇAPRAZ-SATIR kör — prose'daki
  bare dosya-adı (brain-skill.test.ts), Files'taki tam-yola rağmen kök-seviye
  hayalet sayılıp test-discoverability BLOCK üretti (task-builder
  isPhantomTailToken satır-lokal). Finding: suppressor'a görev-bütünü extracted
  seti. Workaround: direktif-prose'unda hep tam-yol.
- CANARY-2 (sprint-587) TAMAMLANDI: direktif-prose tam-yolla duzeltilince ayni
  gate temiz gecti; 2/2 DONE, 0 fix, 0 NO_GO; CHANGELOG sprint587 bolumunu
  finalizer kendisi yazdi (dogfood zinciri ucta uca calisti).
- SALVAGE-GECIRMEZLIK (madde-3'un 2. yarisi, muhur-oncesi oz-denetimde
  yakalandi): decisive typed-contract NO_GO'su iki salvage kapisinda
  yumusatilabiliyordu — (1) reconcileRubricNoGo heuristik-salvage'i yuksek
  worker-raporlu coverage'da GO_WITH_TECH_DEBT'e cekebiliyordu (testim
  coverage:0 ile esige takilip boslugu gizlemisti); (2)
  reconcileEvaluationSpuriousNoGo gercek tsc/vitest probe'lariyla DONE'a bile
  cevirebiliyordu. Ders: yesil test-kosusu 'dosya provably yok' iddiasina
  karsi ILGISIZ kanittir. Fix: hasUnsalvageableContractFailure (kernel'de,
  yapisal-tipli) + reconcileRubricNoGo 'concrete_contract_failure' terminal-
  dali + spurious-core probe-oncesi kacis; pin: yuksek-coverage DONE +
  contract-failure -> iki kapida da NO_GO korunur.
- MUHUR: codex CONFIRMED `cross-verify-verdict:sha256:e8b96e9d…852f1972` —
  onay-sonrasi ILK denemede (probe-approval katman-2 akisi uretimde dogrulandi:
  TTL dolmus kayit -> probe_approval_required -> delegated decide -> CONFIRMED).
- Hermetic baseline'lar ilerletildi (unresolved digest-only 14471; production
  inventory 1256->1257 yeni kernel modulu); MASTER 7097 madde-3 blogu +
  7098 canary blogu (OPEN+UYGULANDI pattern'i — DONE statusu closure-OS
  settlement-receipt zinciri istiyor, dogru boyle); projeksiyon senkron.
- KADANS FULL-SUITE MUTABAKATI (3-landing kurali, bugun 3.): ilk kosu 38
  kirmizi / 36963 yesil cikti. Teshis-fani (2 paralel agent + el): kirmizilarin
  SIFIRI bugunku evaluation-dalgasindan; 4 sinif birikmis borc: (A) dunku
  7097-B1 post-rubric zinciri + 7093 totalTokens + karusel katman-2 mock'u +
  B3-tavaninin fixture-etkisi — 6 dosya pin/mock/fixture hizalandi (fixture'lara
  gercek kosu-izi eklendi; testlerin amaci korunarak); (B) cursor-landing'inin
  (ddc523bf0, sprint-565) test borcu — 7 dosya: spawnSync mock'lari + 4->5
  provider pinleri (agent-hizalamasi, 127 yesil); (C) baseline/ratchet
  projeksiyon borcu — error-ratchet (yeni fingerprint + 2 stale dusum),
  operation-ingress --write, docs:platform, census satir-pini, closure-ledger
  projeksiyon regen (append-only gate OK — ledger event'lerine dokunulmadi),
  hermetic digest'ler final-agacta; (D) ADR-G-039 kaydinda Context alani hic
  yazilmamis — memory.db'ye tek-UPDATE onarim script'iyle (idempotent,
  scratchpad'de) Context eklendi + memory export regen, decisions 12/12.
- DERS (playbook adayi): her landing'de scoped-yesil yetiyor ama cursor gibi
  genis-yuzeyli landing'lerde full-suite kadansi beklemek borcu katliyor;
  genis-yuzey landing'i kadans-sayacini SIFIRLAMALI (kendi full-suite'ini
  kosmali).
- Finding (RELATED_BUT_NONBLOCKING): NO_PROVIDER_MESSAGE (chat.ts:68) cursor'i
  aramasina ragmen listede gostermiyor (ddc523bf0 eksigi; i18n-FIRST'e de
  aykiri hardcode) — owner-admission bekler.

## Owner karar-turu 2026-08-20 (ikinci dalga): DOGFOOD ON + 4 karar + statu-normatiflestirme sorusu
- DOGFOOD_MODE=ON teyidi islendi: DECISION_REF=owner-live-2026-08-20-dogfood-on-canary-587
  (CLAUDE.md + AGENTS.md + .cursor parity + canonical policy anchor; lint-operating-policy OK).
  Evaluator-TASARIM dilimi owner-talimatiyla EL-KODLAMA + xverify-muhurlu istisna.
- KARAR-1 'fixlensin' (canary-bulgusu) — GERCEK KOK DUZELTMESI: dunku teshisim
  (isPhantomTailToken satir-lokal) YANLISTI; scope zaten yalniz Files-satirlarindan
  cikiyor. Gercek kok: core/test-discovery-contract.ts extractPlannedTestPaths
  description/goCriteria'daki BARE test-dosya-adini ayri planli-yol saniyordu
  (anafor-korlugu). Fix: ayni gorevde tam-yollu karsiligi olan bare ad suzulur;
  karsiliksiz bare ad durust BLOCK kalir. Pin 6/6. DERS: ilk-teshis dogrulanmadan
  MASTER'a kok-neden yazma — bulgu-metni 'fix adayi' asamasindayken bile mekanizma
  iddiasi disk-kanitla dogrulanmali (kanun 15'in teshis-metnine genislemesi).
- KARAR-2 'cozulsun' (NO_PROVIDER_MESSAGE): i18n katalogina tasindi (3 yeni anahtar
  en+tr), cursor + gercek install-hint eklendi; unknown-tool metni PROVIDER_PRIORITY'den
  turetiliyor (hardcode listesi kalkti). MASTER 7091'e ek-dilim blogu.
- KARAR-3 'ok': Playbook Ders-21 (genis-yuzeyli landing kadans-sayacini sifirlar)
  tr+en senkron + changelog.
- KARAR-4: artifacts-gitignore + flake yonetimi onaylandi, ek is yok.
Muhur-2: codex CONFIRMED cross-verify-verdict:sha256:84e88e13...e6f7945e (karar-1 anafor-fix + karar-2 i18n/cursor)

## ADR-G-040 Normatif Verdict Sozlugu — ilk dilim (2026-08-20)
- Owner: statuler normatif + HER STATU TEK KELIME; CONFIRMED_WITH_DEBT
  reddedildi, secim: QUALIFIED (denetim-dili 'qualified opinion'; cekince
  typed residualDebt'te tasinir). Sozluk: CONFIRMED · QUALIFIED · UNDECIDABLE
  · FAILED · HOLD.
- SSOT: src/core/verdict-types.ts — frozen liste; TAM legacy->normatif
  donusumler (TaskEvaluation: DEFERRED/NOT_DISPATCHED->HOLD; criterion-status;
  xverify: REFUTED->FAILED, UNCLEAR->UNDECIDABLE, unavailable->HOLD;
  selfAssessment bilinmeyen->null). Kayipli yon toTaskEvaluation KASITLI
  PARTIAL: UNDECIDABLE/HOLD -> null — sessiz ikame=uydurma-verdict yasak.
- GERCEK WIRING (davranis-notr): EvaluationAuditRecord.normativeVerdict
  (required) + writeEvaluationAudit tek-noktada damgalar -> tum EVALUATE
  dallari otomatik; legacy decision okuyuculari icin authority kalir,
  goc dilim-dilim (big-bang rename YOK — 64 DONE-satirli MASTER lint +
  ledger + docs koruma nedeni).
- ADR-G-040 memory.db'ye eklendi (039-satiri sablonu; Context/Decision
  formatli; export 12/12 yesil). Rule-dosyasi ADR-index'leri bir sonraki
  finalize/regenerate'te kendiliginden guncellenir.
- Pinler: 5 esleme-tablosu + gercek-yazim (tmpdir persisted JSON'da
  normativeVerdict=QUALIFIED) + komsu audit-trail 13/13; hermetic -3
  (chat-mock rework'u uc unresolved site emekliye ayirdi) + prod-inventory
  +1 (yeni modul) belgeli ratchet.
- SONRAKI DILIMLER (tasarim-sirasi): (1) kabul-matrisi semasi
  (task-kind × verdict routing policy — config alani + typed default'lar);
  (2) criterion-kernel/xverify yuzeylerinin normatif okuyuculari;
  (3) rapor/CLI yuzeyinde normatif goruntuleme; (4) legacy enum'larin
  projeksiyona indirilmesi.
Muhur-3: codex CONFIRMED cross-verify-verdict:sha256:dc4f3d5b...646e2efd (ADR-G-040 verdict-vocabulary dilimi)

## Kabul-Matrisi dilimi (ADR-G-040 tamamlayici; 2026-08-20)
- SSOT src/core/acceptance-matrix.ts: task-kind × decidable-verdict →
  ACCEPT · ROUTE(adapter) · REJECT. HOLD tip-disi (DecidableVerdict) —
  prosedurel non-verdict asla policy-kabul degil. ConfirmationAdapter
  sozlugu kanonik evine indi (criterion-kernel re-export, KANUN 10).
- Default enterprise-safe: her kind CONFIRMED/QUALIFIED→ACCEPT,
  UNDECIDABLE→ROUTE(llm), FAILED→REJECT; SECURITY sert (QUALIFIED ve
  UNDECIDABLE→ROUTE(human)).
- normalizeAcceptanceOverride: gecersiz kural typed-sebeple DUSER (ROUTE
  adaptersiz, adapter ROUTE'suz, bilinmeyen kind/verdict/action) — bozuk
  policy-satiri kabulu sessizce genisletemez/daraltamaz.
- OBSERVE wiring: writeTaskEvaluationAudit rubrik-authority'siyle siniflar
  (resolveCanonicalTaskKind: task.type ?? detect-lift; drift'siz tek kaynak)
  ve karar-kaydina acceptance-damgasi basar; HOLD-projeksiyonu damgasiz;
  karar akisi degismez. Enforcement + config-yuzeyi + adapter-runtime
  SONRAKI dilim (kodsuz enforce-anahtari = sahte-enablement, koymadik).
- Tutarlilik-notu (bilincli): DEFERRED/NOT_DISPATCHED audit-decision'i
  legacy olarak NO_GO'ya iner → kayitta normativeVerdict=FAILED ama
  acceptance-damgasi YOK; damga-yoklugu HOLD'lugun izi. AuditDecision'a
  DEFERRED eklemek legacy-migration dilimine.
- MASTER-lint dersi (tekrar): hucre-icinde literal '|' satiri tablodan
  dusurur (DEPENDENCY_MISSING olarak gorunur) — '·' kullan.
- Pin: 5 policy + 2 audit-wiring + 206 komsu; tsc 0; hermetic +2 unresolved
  (2 tmpdir pin) +1 prod-modul belgeli.
Muhur-4: codex CONFIRMED cross-verify-verdict:sha256:d108ab2e...040aab82 (kabul-matrisi dilimi; onay=0 taze-reachability)

## Adapter-Runtime + Enforcement dilimi (ADR-G-040; 2026-08-20)
- acceptance-enforcement.ts (SAF post-rubrik katman): observe=dokunmaz;
  enforce REJECT -> NO_GO tavani + 'acceptance:reject:<kind>' satiri
  (salvage-gecirmez: guard oneki 'acceptance:' ile genisledi) + B1 typed
  cause; enforce ROUTE -> DONE'u GWTD'ye indirir ('temiz DONE, onay borcu
  varken erken-kapanis olurdu') + 'acceptance:route:<adapter>' bilgi-satiri
  + ConfirmationRequest NIYETI (kernel undecidable-statement'lari; yoksa
  goCriteria) + authorProvider result.tokenUsage'dan (yoksa YOK — uydurma
  default yasak); ROUTE NO_GO'da asla atesslenmez.
- confirmation-store.ts: .deckent/runtime/confirmations/{pending,settled};
  deterministik cnf-id (sprint+task+item-set+adapter); idempotent create
  (settled da kazanir — EVALUATE re-run karari diriltmez); tek-atis atomic
  settle (rename).
- Wiring: YALNIZ ana EVALUATE dali (runtime-budget authority atlar;
  extension/grace/ingest bu dilimde observe-damgali — SINIR, sonraki
  mikro-dilim). Audit-damgasi enforcement-sonucunu enforced-bayragiyla
  verbatim tasir.
- CLI `deckent confirmations`: list · decide (YALNIZ human; interaktif-TTY
  'yes' dogrulamasi, TTY yoksa fail-closed — approvals sozlesmesi) · run
  (YALNIZ llm; runXverifyForResult koprusuyle capraz-saglayici hakemlik;
  CONFIRMED/REFUTED settle, UNCLEAR durustce pending kalir). code-adapter
  ilan edildi, kosulamaz — pending kalir, verdict uydurulmaz. i18n en+tr.
- Config: acceptance_matrix + acceptance_enforcement ('observe' default) —
  iki interface + merge; enforce-anahtari artik GERCEK kodla geldi.
- Kanit: 5 enforcement + 229 dilim+komsu + 234 config pinleri yesil; tsc 0;
  hermetic +2/+3 belgeli; Tier-1 gercek-binary smoke: `deckent
  confirmations list` -> 'No pending confirmations.' + help (yeni dist).
- MUHUR-5a REFUTED (degerli): ilk muhur-denemesi codex tarafindan HAKLI
  curutuldu — confirmations CLI'da option-aciklamalari ('record a CONFIRMED
  verdict' vb.) hardcoded kalmisti; '--help' user-facing'dir, i18n-FIRST
  ihlali + iddia-metni ('all user-facing text via catalog') yanlisti.
  REFUTED-receipt `…5fe1644d` kayitta. Fix: 6 option-aciklamasi
  confirmations.opt_* anahtarlarina (en+tr) tasindi; yeniden-olcum kosuldu.
  DERS: yeni-CLI iddiasinda 'tum user-facing metin' cumlesi option/summary
  metinlerini de kapsar — hakem tam bunu okudu.
- MUHUR-5 ZINCIRI TAMAMLANDI: REFUTED(option-desc) → fix → UNCLEAR(truncation;
  dar-slice dersi: dev-dosyayi ASLA tam-dosya evidence yapma, ranged ver) →
  REFUTED(llm settle-reason literal — 'kayda yazilan ama ekrana render edilen
  metin de user-facing'dir') → fix → UNCLEAR(iddia-parcasinin kanit-dilimi
  yoksa hakem durustce undecidable der — iddiadaki HER cumleye dilim esle) →
  CONFIRMED `…567070eaf7`. Dort receipt de kayitta; hakem iki gercek i18n
  ihlali yakaladi. XVerify-claim disiplinine iki yeni kural: (1) 'tum
  user-facing metin' iddiasi option-help + kayit-render metinlerini kapsar;
  (2) iddia-cumle ↔ evidence-dilim birebir eslesmeli.
- DERS (commit-hijyeni): commit -m çift-tırnaklı mesajda backtick shell-substitution çalıştırır (89e66dcba'da 'NEW `deckent confirmations` CLI' boş kaldı — kozmetik, kod sağlam). Mesajları tek-tırnak/heredoc'la yaz.

## Tek-Onay-Yuzeyi + Sonsuz-Loop programi — TASARIM dalgasi (owner-komisyonu 2026-08-20)
- Envanter: 2 paralel agent — (A) 11 dagitik onay-yuzeyi + guclu ApprovalBroker
  cekirdegi (MAC+TTL+tombstone) + yazilmis-ama-bagsiz kanallar (telegram/slack/
  teams relay, vscode decide handler) + auth/TTL-asimetrisi + i18n ihlalleri;
  (B) gercek for(;;) autonomous loop + el-yazimi cron + webhook/repo/nervous
  tetikleyiciler + run-on-approve replay MEVCUT; bosluklar: supervisor,
  occurrence-ledger, loop-heartbeat, kumulatif tavan, approval-SLA.
- Tasarim: docs/governance/unified-approval-surface.md — ilke ABSORBE ET
  (ikinci broker asla); typed origin/riskTier/blocking zarfi; karar-kanal
  matrisi (MCP yalniz read-only+routine-ack, §12.2 korunur — genisletme
  owner-amendment); federated-read-once (D1) sonra origin-bazli karar-gocu
  (D2a/b) sonra kanal-tamamlama (D3) TTL/SLA (D4) emeklilik (D5); loop-govenansi
  L1-L7. MASTER: 4056 (APPROVAL-001 alti) + 3112 (AUTONOMOUS-CONTROL-PLANE alti).
- TASARIM-MUHRU: 3 hakem-yolu typed-HOLD (codex limit-doygun candidate_not_
  eligible — GUNUN FRENI DOGRU CALISTI; gemini scope yok; cursor docker-CLI
  unwired). HOLD=kapanis-degil; ACIK kalem MASTER 4056'da. DERS: yogun muhur
  gunlerinde verifier-butcesi de planlanmali; cursor-docker dilimi (7091)
  hakem-cesitliligi icin oncelik kazandi.

## Owner-duzeltme turu: muhursuz-landing reddi + DOGRULANACAK-statusu (2026-08-20)
- IHLAL KABUL: 58da7d603 muhursuz pushlanmisti; owner reddetti, revert edildi
  (65e382a57). Ders feedback_xverify_claim_discipline'a iki amendment olarak
  islendi: (1) muhur HOLD ise adim KAPANMAZ — dur + bildir; (2) ASAMA-BAZLI
  muhur: tasarim/uygulama/sonuc AYRI surecler, sonuc-muhru ikame edemez.
- KOK-DUZELTMESI: codex 'limit-doygun' teshisim YANLISTI — provider-limits
  ledger'i source_unavailable gosteriyor (usage-penceresi hic okunamiyor,
  windows bos). 5 deneme typed-HOLD; retry (secenek-1) de basarisiz.
- OWNER KARARLARI: gemini verifier IPTAL (yalniz API hizmeti); cursor-docker
  hakem-dilimi zaten planli (7091); bulgular MASTER'a DOGRULANACAK-statusuyle
  yazildi (owner manuel dogrulayacak) — 49600c70f reapply + isaretler.
- ACIK KALEM: codex usage-source arizasi (11:26'dan beri) — ayri teshis
  gerektirir (docker-ici codex CLI usage okumasi mi, servis mi).

## Kanal-onarimi + muhur-zinciri kapanisi (2026-08-20, owner '1 oneri kabul')
- CODEX KOKU KESIN: newestSessionLog greatest-name secimi, hakem-denemelerinin
  KENDI saniyelik snapshot'siz rollout'lariyla golgelendi (leksikografik;
  mtime degil — ls -t yaniltir) -> limit source_unavailable -> TUM codex
  adayligi kilit. Kota %1'deydi. FIX: bounded newest-named aday-listesi (5) +
  her dizin TAM BIR kez okunur (hakem cift-readdir'i REFUTED'ladi — hakli;
  tek-okuma tasima duzeltmesi). Pin 42/42.
- MUHUR-ZINCIRI: fix REFUTED `…855ebd49` -> duzeltme -> CONFIRMED `…655e8022b`
  (kanalin canli-kaniti; kisir-dongu kirildi). TASARIM: UNCLEAR (iddia-3
  dilim-eksigi) -> REFUTED (stop-marker atfi YANLISTI — hakem duzeltti:
  marker CLI-sleep'inde autonomous.ts:1370, runtime-loop'ta degil; dokuman
  duzeltildi) -> CONFIRMED `…691c21a3`. DOGRULANACAK-isaretleri receipt'lerle
  degistirildi; 4090'a fix-blogu.
- DERSLER: (1) hakem 4 turda 4 gercek hata yakaladi (2 i18n + readdir-siniri
  + stop-marker atfi) — asama-bazli muhur degerini kanitladi; (2) ls -t ile
  isim-sirali secim farkli — canlilik/teshis iddialarinda secim-kuralini oku;
  (3) xv-artigi build-clean'i HOLD'lar — muhur-sonrasi arsivleme ritueli.

## D1 Federated-Inbox dilimi LANDED (2026-08-20, owner 'OKEYDIR')
- approval-inbox-federation.ts: 7 fail-soft read-only okuyucu -> origin-etiketli
  satirlar + i18n karar-ipucu; bozuk depo typed-unreadable (crash/gizleme yok);
  karar-yollari dokunulmadi. CLI list broker-bolumu aynen + federe bolum; MCP
  inbox ayni satirlari tasir (decide yine yok).
- ASAMA-BAZLI UC MUHUR (owner-sozlesmesi ilk tam uygulama): tasarim `…691c21a3`
  / uygulama `…cf4930c5` (ilk denemede) / sonuc `…60fce97a` (gercek-binary
  bos/dolu/geri-bos kanit-dosyasiyla; gecici checkpoint-fixture yazilip
  silindi). Pin 3+48; hermetic +1 modul.

## Karar-Ergonomisi tasarim-eki + solution-architect skill (owner 2026-08-20)
- YENI SKILL .claude/skills/solution-architect/SKILL.md: dunyanin-en-zeki-cozum-
  mimari kimligi kalici checklist olarak (olc-sonra-ciz · absorbe-et ·
  ergonomi=guvenlik · kolaylik!=yetki · sokulebilir-otomasyon · negative-space ·
  asama-muhur · 3-Yasa). Tasarim islerinde varsayilan.
- Tasarim-eki doc §3.5 (muhur CONFIRMED `…23868d35`): 5-char Crockford kisa-kod
  (her yuzeyde AYNI; bayat-kod fail-closed; nervous-uretici D2b'de absorbe);
  kaynak·neden·kod karti; sohbette buton + y/n (critical view-only+deep-link);
  approval-rules.json (git-izlenir, typed sema, critical TIP-DISI, decidedBy:
  rule:<id> auditli, autonomous-baglari SOKULEBILIR kural; sistem kendine kural
  yazamaz; --always yalniz routine). Dilimler DE1→DE2→DE3, 3-asama muhurlu.
