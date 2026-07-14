# PROMPT DEVRİMİ — 8. TUR · Çalışma Defteri

> Amaç (Alperen): TAM-KAPSAMLI analiz — mevcut durum nedir · nasıl işler · 100/100 kalite için ne gerekli · maliyet-kurtarıcı adımlar. MVP YASAK; enterprise-grade titizlik. Adım-adım brainstorming/system-debug; her adım Alperen-onayıyla ilerler (kanun-3).
> Ölçüm-kanunu: kanıt = CANLI-ÜRETİM davranışı (test-yeşili/golden-set yalnız yardımcı).

## Adım-planı (onaya tabi; adım bitince rapor→onay→sonraki)
- **A1 — System-debug: canlı-üretim kanıt-toplama** *(başladı)* — 442'nin gerçek prompt/plan/route zincirini uçtan-uca izle; her kusurun İLK doğduğu satırı yakala (varsayım değil, iz).
- **A2 — Mevcut-durum haritası**: 7 katman (NL-spec → planner → task-şema → routing → compose → render → spawn/verify) × her katmanın kalite-sorumluluğu + bugünkü gerçek davranışı; PCOMP-6'da düzelen/düzelmeyen ayrımı dürüst tabloda.
- **A3 — 100/100 gap-matrisi**: Alperen'in 3 analizi + tur-1..7 tarihçesi + A1-kanıtları → tek kusur-envanteri; her kusur: kök-katman, neden-önceki-turlarda-ölmedi, kalıcı-ölüm-koşulu.
- **A4 — "Neden 8 tur?" meta-analizi**: sürecin kendisinin kök-nedeni (kısmi-ölçüm, warn-mode-yanılgısı, katman-atlama, benim akış-hatalarım) — döngü-kırma tasarımı.
- **A5 — Hedef-mimari (enterprise-grade)**: derlenen-prompt tam-tasarımı + maliyet-modeli (token/cache-tier/koşu-başı-maliyet; kurtarıcı-adımlar ayrı bölüm).
- **A6 — Doğrulama-protokolü**: canlı-üretim rubrik-sınavı (Alperen-skorlu), kabul=Alperen-onayı.

## A1 — Toplanan CANLI kanıtlar (2026-07-14)

**K1 · Sprint-442 (yeni-mekanizma tam-donanımlı ilk üretim):** iş 4/4 indi AMA:
- **Persona+skill = devops-engineer** (coordinator/event-sourcing işine) — Alperen-analizinin persona-bulgusu AYNEN yeniden-üretildi.
- **Skill-gate DELİK-KANITI:** 442-001 metin+filesWrite'ında dar-domain sinyali YOK (regex-doğrulandı: eşleşme yok) ama devops-skill gövdesi geçti. Şüpheli-kökler (A1'de izlenecek): (a) agent-adlı-skill'in `dedupeAgentNamedSkills`/otomatik-eşlik özel-yolu filtreyi baypas ediyor; (b) `isV2 && rawDNA` guard'ı bu task'larda filtreye hiç girmiyor; (c) routing agent-seçimi zaten yanlış → skill onu izliyor (kök=AGENT-katmanı, D4 yalnız skill-katmanıydı).
- **Verify-placeholder bu sınıfta canlı** (yeni-test-dosyası başka-task'ta → exact-set boş → fallback) — D1a'nın bilinen-deliği, Alperen-analizi doğruladı.
- Read-scope'a core-dosyaları girmedi; test-zorunluluğu/test-write ayrışması sürdü (planner-decomposition katmanı hiç düzeltilmedi — PCOMP-6'nın ana-eksiği).

**K2 · Temiz lint-defteri (ilk sağlıklı ölçüm; 193 bulgu / 14 spawn):**
- `unverified-write-path` **186/193 (%96)** — W6 gürültü-topu: ya trackedFiles-anlık-görüntüsü yanlış besleniyor ya fix-task/yeni-dosya sınıfları yanlış-pozitif; SİNYALİ BOĞUYOR. (Kendi denetim-aracımın kalitesi de 8.tur kapsamında.)
- Gerçek-sinyal kalanlar: skill-suspect 4 · adr-constraint 1 · W1 1 · persona 1.

**K3 · Süreç-kanıtı:** born-698a ön-kapı-gate'i işledi (BLOCK'lu plan başlatılmadı → NL-düzeltme → temiz koşu) — do-akışının ilk dürüst-reddi.

## A1 — Sıradaki iz-sürme listesi (bir sonraki çalışma-bloğu)
1. 442-001 prompt'unu yeniden-üret + `filterSkillPromptsByDNA`'ya gerçek-girdilerle adım-adım gir (hangi dal geçirdi?).
2. `routeTaskV2`'nun 442-planı için agent-karar-izi: devops-engineer'ı hangi aktivasyon/bonus seçti? (planner mı `-Agent:` yazdı, routing mi seçti — DIRECTIVES'e bak.)
3. W6'nın 186 yanlış-pozitifinin ilk-10 örneğini sınıflandır (trackedFiles-kaynağı? path-normalizasyonu? yeni-dosya-adı metinde-var-ama-regex-kaçırıyor?).
4. Planner-decomposition katmanının (read-scope/test-write/persona-önerisi) bugün NEYİ ürettiğinin şema-dökümü — 442 DIRECTIVES'i satır-satır.

## A1 — KAPANIŞ (4 iz, 3 kök-kanıt + 1 devir; 2026-07-14)

**İz#1 · Skill-gate:** ÇALIŞIYOR — güncel-zincirle 442-001 regen'inde Skills-bloğu YOK (sinyalli-filtre devops'u düşürüyor). Dünkü "skill geçti" iddiam **rapor-etiketi okuma hatamdı** (assignedSkills = plan-time etiketi; prompt-gövdesi değil). Ders: kanıt = ancak prompt-gövdesi.

**İz#2 · ANA-KÖK (agent-katmanı):** 442 task'ları `intent=devops (0.67)` sınıflanmış → devops-persona seçilmiş. Tetik — türünün en temiz kanıtı:
- `'ci'` keyword'ü Türkçe **"i·çi·ndeki"** kelimesinin İÇİNDEN eşleşti (kelime-sınırsız substring);
- `'cd'` keyword'ü **flowId-hex'inden** (`1cd42609…`) eşleşti — çünkü `toDirectiveTask` traceability-satırını (RunProposal metadata) description'a GÖMÜYOR → her do-task'ının metni hex taşıyor.
İki bileşik kök: **(a)** intent-classifier eşleşmesi substring (D4 yalnız optimizer'a containsWord koydu; classifier'a dokunulmadı); **(b)** metadata description-kirliliği (sınıflandırıcı+planner metadata'yı içerik sanıyor). → Fix-adayları A5'e: classifier'a kelime-sınırı + traceability'nin description-DIŞI ayrı-alana taşınması.

**İz#3 · W6 %96-gürültü:** canlı değil — **vitest fixture-çağrıları** deftere yazıyordu (taskId=025-*, `src/core/foo.ts`). İkinci ölçüm-hatam: "temiz defter" test-kirliliğiydi. Fix uygulandı: hook `VITEST` ortamında ledger-off; kirli-defter arşivlendi. **Gerçek-442 sinyali: 7 bulgu** (skill-suspect 4 · adr-constraint 1 · W1 1 · persona 1) — linter canlıda isabetli.

**İz#4 · Planner-decomposition şeması:** A2'nin giriş-maddesine devredildi (snapshot-plan eldeki veri).

**A1-meta:** iki kanıt-hatamı (rapor-etiketi + fixture-defter) bu turda kendim yakaladım — "kanıt=canlı-gövde" kanunu çalışıyor.

## A2 — MEVCUT-DURUM: 7-Katman Haritası (kanıt-referanslı; 2026-07-14)

> Her katman: SORUMLULUĞU → BUGÜNKÜ GERÇEK DAVRANIŞ → PCOMP-6'da ne oldu → KALAN KUSUR.
> Kanıt-kaynakları: 442-snapshot şema-dökümü · A1-izleri · 31-korpus ölçümleri · Explore pipeline-haritası.

### L1 · NL-SPEC (Brain/CC'nin do-girdisi)
- **Sorumluluk:** hedef+sınırlar+kabul-ölçütleri; ADR-uyumlu talep.
- **Gerçek:** serbest-metin; kalite yazana bağlı. Format-kuralları (virgülsüz-başlık, filesWrite≥1, rapor-dosyası-yasağı) her NL'ye ELLE tekrar yazılıyor — kural-tekrarı insan-hafızasına emanet.
- **PCOMP-6:** ADR-recall kanunu (davranış) geldi; ŞABLON gelmedi.
- **Kusur:** zorunlu-bölümlü spec-şablonu yok (edge-case-politikası, dönüş-semantiği, test-eşlemesi boş bırakılabiliyor — Alperen-analizi 3.5-3.9 sınıfı).

### L2 · ZERO-CONFIG PLANNER (NL→task'lar)
- **Sorumluluk:** doğru-bölümleme + TAM alan-üretimi.
- **Gerçek (442-şema-dökümü):** ürettiği: title/description/model/effort/priority/reason/scope/deps/goNogo. **filesRead=[] (HİÇ doldurmuyor)** → "core-dosyaları read-scope'ta yok" sınıfının doğum-yeri. Test-write'ı ayrı-task'a koyuyor (442-003) → kod-task'ı testsiz + verify-placeholder sınıfı. Task-aralığı KODDA 3-5 (ZERO_CONFIG_MIN/MAX) → 20-40-mikro kanunuyla yapısal çelişki. Smoke/authMode üretmiyor. ADR-kısıt-bloğu artık prompt'unda (D4.5 ✓) ama şema-kuralları (yol-tam-yazımı vs) NL'den geliyor.
- **PCOMP-6:** yalnız ADR-bloğu eklendi; decomposition-kuralları (read-scope tamamlama, test-write eşleme, aralık) HİÇ ele alınmadı — **6-7. turların ana kör-noktası.**
- **Kusur:** planner çıktı-sözleşmesi eksik-alanlı; hiçbir katman tamamlamıyor (task-compiler reddedilen öneriydi — A5'te yeniden, kanıtlarla).

### L3 · DIRECTIVES yazım/okuma (round-trip)
- **Gerçek:** yazıcı escape'li (born-677 ✓); RunFlow-okuyucu unescape'li ✓; **legacy-okuyucu (extractGoNogoCriteria) D5'e kadar unescape'siz** (\;-sızıntısı — fix'lendi ✓). `toDirectiveTask` **traceability-metadata'sını description'a GÖMÜYOR** → L4'ü zehirliyor (A1-İz#2-b: 'cd'⊂flowId-hex). deps title-eşlemeli (692'de sanitize ✓).
- **Kusur (AÇIK):** metadata-gömme — flowId/revision/actor ayrı-alan olmalı, içerik değil.

### L4 · ROUTING (intent→persona/skill)
- **Gerçek:** `classifyIntent` eşleşmesi **kelime-sınırsız substring** → 'ci'⊂'içindeki', 'cd'⊂hex (A1-İz#2-a); intent tek-değere çökünce persona/skill zinciri yanlış (442: devops×4-task). D3-fix'leri (çifte-sayım, refactorer-guard, ci-guardian-bonusu) İNDİ ama motor-substring kaldı — **kısmi-fix deseni**. Skill-floor/filtre D4'te düzeldi (İz#1: gate ÇALIŞIYOR ✓).
- **Kusur (AÇIK):** classifier'a containsWord + Türkçe-morfoloji farkındalığı; intent-confidence düşükken persona-fallback politikası.

### L5 · COMPOSE (buildWorkerPrompt bağlam-toplama)
- **Gerçek:** trackedFiles/verify/ADR/env-probe toplanıyor; skill-filtre sinyalli ✓; **lint-hook warn-only** + defter artık VITEST-korumalı (İz#3 ✓). ADR'ler tam-gövde (focused-clause yok).
- **Kusur:** lint bulguları hâlâ yalnız kayıt — düzeltme/derleme yok (Alperen task-compiler'ı reddetti; A5'te kanıt-temelli yeniden-öneri).

### L6 · RENDER (prompt-god-template)
- **Gerçek:** exact-verify D1a ✓ (ama "test-başka-task'ta" sınıfında placeholder'a düşer — 442'de canlı); DONE=checklist-bağlı ✓; behavior-bloğu all-test-suppress ✓; persona/skill/ADR gövde-maliyeti: görev-çekirdeği ortalamanın ~%11'i.
- **Kusur:** persona tam-gövde (devops'un Dockerfile-rehberi coordinator-işinde — L4 düzelse bile İLGİSİZ-BÖLÜM sorunu genel); ADR focused-clause yok; tekrar ~4.5 goCriteria-teması.

### L7 · SPAWN/VERIFY/EVAL
- **Gerçek:** çocuk-gate fail-closed ✓ + do-ön-kapı eşitliği (born-698a ✓); post-sprint smoke CC-adımı (ders ✓); Brain-eval+disk-verify canlı; FIX-fazı çalışıyor (442'de 0 fix gerek kalmadı).
- **Kusur:** PLAN-ölümü result-turn'e düşmüyor (698 b/c); worker'ın verify'ı hâlâ kendi beyanı (rubric evaluation-side).

### A2-SENTEZ — tek cümle
**Boru hattının ARKA yarısı (L5-L7) 6-7. turlarda gerçekten sertleşti; ÖN yarısı (L1-L4: spec-şablonu, planner-decomposition, metadata-hijyeni, intent-motoru) neredeyse hiç dokunulmadı — 8 turun "düzelmiyor" hissinin yapısal nedeni bu asimetri.** 100/100, ön-yarı sözleşmeleri kurulmadan imkânsız (A3-gap-matrisi bunun envanterini çıkaracak).

## A3 — 100/100 GAP-MATRİSİ (kusur-envanteri; 2026-07-14)

> Kaynak: Alperen'in 3 analizi (438×2 + 442) + tur-1..7 tarihçesi + A1/A2-kanıtları.
> Durum: 🔴 AÇIK · 🟡 KISMİ (kanıtlı-kalan var) · ✅ KAPALI (canlı-doğrulanmış).
> "Ölüm-koşulu" = kusurun bir daha DOĞAMAYACAĞI yapısal değişiklik (tespit değil, imkânsızlaştırma).

| # | Kusur | Kök | Durum | Neden 7 turda ölmedi | Kalıcı ölüm-koşulu |
|---|---|---|---|---|---|
| G1 | Persona-görev uyumsuzluğu (devops→event-sourcing; refactorer→test-yazarlığı) | L4 | 🔴 | Fix'ler hep ÇEVREYE (kelime-listesi, guard, bonus); MOTOR (substring-eşleşme) hiç değişmedi | classifier'da kelime-sınırlı+dil-farkındalı eşleşme + düşük-confidence'ta persona-fallback politikası + operation-class routing (G3-vizyonu) |
| G2 | Metadata description-kirliliği ('cd'⊂flowId-hex → yanlış-intent) | L3 | 🔴 | Kimse description'ın İÇİNİ veri-kaynağı olarak denetlemedi; traceability "zararsız ek" sanıldı | flowId/revision/actor task-şemasında AYRI alan; description'a asla gömülmez; classifier yalnız içerik-alanlarını okur |
| G3 | filesRead HİÇ üretilmiyor → gerekli-import'lar read-scope dışı | L2 | 🔴 | Planner çıktı-SÖZLEŞMESİ hiç tanımlanmadı; her tur render/routing'e odaklandı | planner-şemasında filesRead zorunlu + compose-katmanında import-türevli otomatik-tamamlama (deterministik) |
| G4 | Test-zorunluluğu var / test-write-yetkisi yok (decomposition ayrıştırıyor) | L2 | 🔴 | Aynı: decomposition-kuralı yok; NL'ye elle yazılan kurallar planner'da sözleşme değil | davranış-değiştiren her src-task'ının filesWrite'ına mirror-test OTOMATİK eklenir (şema-kuralı); test-only ayrık-task istisnası açıkça işaretli |
| G5 | Verify exact-set "test-başka-task'ta" sınıfında placeholder'a düşüyor | L6 | 🟡 (26/31 exact ✓; bu sınıf açık) | D1a "yol uydurma" korkusuyla yoksa-yarat'ı dışladı — en riskli sınıf tam oydu | G4-şeması + mirror-yolu tracked-olmasa-da "yoksa-yarat" semantiğiyle basılır |
| G6 | Task-aralığı kodda 3-5 ↔ 20-40-mikro kanunu | L2 | 🔴 | Kural insan-hafızasına emanet; mekanizma hiç hizalanmadı (İHLAL-İTİRAFI kayıtlı) | ZERO_CONFIG aralığı config'ten + iş-büyüklüğüne göre bölme-politikası; kanun mekanizmada |
| G7 | Spec-şablonu yok (sequence-policy, dönüş-semantiği, mutation/clone, dikiş-tanımı muğlak) | L1 | 🔴 | Spec-kalitesi "yazarın dikkatine" bırakıldı; şablon hiç kurulmadı | zorunlu-bölümlü NL/spec şablonu (boş-bölüm=gönderilemez) + format-kuralları şablonda (elle-tekrar ölür) |
| G8 | ADR tam-gövde enjeksiyonu (C4/C5 alakasız clause'lar; 2KB/ADR) | L6 | 🔴 | Focused-clause hep "roadmap"ta kaldı | adr-selector clause-level render (task-relevant 4-5 satır) — G-019 enforcement-yapısıyla birleşik |
| G9 | Persona tam-gövde (150-satır Dockerfile-rehberi işle alakasız) | L6 | 🔴 | Persona=dosya-kopyala varsayımı hiç sorgulanmadı | görev-tipine göre focused-guidance render (5-15 satır) + persona-gövdesi referans-olarak |
| G10 | Lint warn-only → tespit var, düzeltme yok | L5 | 🟡 (bilinçli-rollout kararı) | Task-compiler önerisi reddedildi; ölçüm-defterleri iki kez kirlendi (regen/vitest — ikisi de fix'li) | temiz-defter N-sprint ölçümü → Alperen-onaylı fail-closed + deterministik-düzeltme kalemleri (A5'te kanıt-temelli yeniden-öneri) |
| G11 | P1 write-çelişkisi (metin dosya-ister, yetki yok) | L2+L5 | 🟡 (W1 tespit ✓; koşullu-izin cümlesi false-negative) | Tespit kondu, üretim (planner) düzeltilmedi | G3/G4-şema-kuralları + W1'in koşullu-yazma dili (v2) |
| G12 | DONE-gevşekliği ("both pass" ≠ checklist) | L6 | ✅ D1b (canlı-442'de checklist-bağlı) | — | korunuyor; rubric-eval tarafıyla çift-taraflı pin |
| G13 | Skill relevance-inversion (sh-portability 10/31) | L4+L5 | ✅ D4+CC (442'de canlı: sinyalsiz-devops-skill gövdesi DÜŞTÜ) | — | dar-domain tablosu manifest'e taşınınca (v2) tamamen şema-tabanlı |
| G14 | \;-sızıntısı | L3 | ✅ D5 (yazım-anı unescape; birim-testli) | — | round-trip testi pinli |
| G15 | Behavior-bloğu test-yazarlığında | L4+L6 | ✅ D3 (all-test-suppress; 19→14) | — | G1-motor-fix'i kalıcılaştırır |
| G16 | 'test/spec/coverage' çifte-sayımı | L4 | ✅ D3 (440-001 Part-1) | — | — |
| G17 | ADR-körlüğü (planner+gate) | L2+L5 | 🟡 (D4.5: planner-bloğu+W7 ✓; kısıt-tablosu 3-kayıt, DB'ye taşınmadı) | ADR'ler makine-okur değildi | kısıtlar DB-şemasında + kapsam genişler; W7 fail-closed'a katılır |
| G18 | Ölçüm-yanılgıları (golden-set≠canlı; defter-kirliliği ×2; rapor-etiketi≠gövde) | süreç | 🟡 (kanun-3 + VITEST-guard + itiraflar) | Ölçüm-protokolü tanımsızdı; "yeşil"e inanma eğilimim | A6-protokolü: tek-kanıt=canlı-üretim rubrik-sınavı, Alperen-skorlu |
| G19 | do-sessiz-ölüm (PLAN-ölümü result-turn'e düşmüyor) | L7 | 🟡 (698a ön-kapı ✓; b/c açık) | — | coordinator-göçünde (SURF-1c) FAILED-kaydı+notify |
| G20 | Verify-kanıtı=tsc'ye indirgeme riski (davranış-kusurlarını tsc yakalamaz) | L1+L6 | 🔴 | NL'lerimde "kanıt: tsc" yazma alışkanlığım | spec-şablonunda kanıt-bölümü davranış-testi/canlı-koşu ZORUNLU alanı |

**A3-SENTEZ:** 20 kusurun dağılımı: **🔴 9 AÇIK — 8'i L1-L4 ön-yarıda** · 🟡 6 KISMİ · ✅ 5 KAPALI (hepsi L3-L6 arka-yarı). A2-asimetrisi sayısal doğrulandı. En yüksek-kaldıraç sıralaması (A5-girdisi): **G2+G1** (metadata-hijyeni+motor — bir fix-çifti, dört kusuru söndürür: G1/G2/G15-kalıcılık/G13-v2) → **G3+G4+G6** (planner çıktı-sözleşmesi — tek şema-işi, beş kusuru söndürür: G3/G4/G5/G6/G11) → **G7+G20** (spec-şablonu) → **G8+G9** (gövde→focused-render; en büyük maliyet-kazancı ~%25-30).

## A4 — "NEDEN 8 TUR?" META-ANALİZİ (acımasız; 2026-07-14)

> Konu mekanizma değil, SÜREÇ ve BEN. Her kök kanıt-referanslı.

**M1 · Kısmi-fix deseni (baş-suçlu):** her tur belirtinin GÖRÜLDÜĞÜ katmanı onardı, ÜRETEN motoru değil. Kanıt: D3 'implementation' kelime-listesini düzeltti, eşleşme-motorunu (substring) bırakcı → 'ci'⊂'içindeki' hayatta kaldı; D4 kelime-sınırını optimizer'a koydu, classifier'a koymadı. Kökün-kökü: "dar-diff/cerrahi" disiplinini "yüzeysel-diff" olarak yanlış işlettim — cerrahi, kökü kesmek demek; ben semptom-dokusunu aldım.

**M2 · Yanlış-ölçüm alışkanlığı:** üç ayrı kirli-ölçüm (golden-set'i canlı sanmak · regen-defter kirliliği · vitest-defter kirliliği) + bir kanıt-hatası (rapor-etiketi≠prompt-gövdesi) + erken-🏁 iştahı. Kök: "yeşil=doğru" önyargısı ve ölçüm-protokolünün hiç tanımlanmamışlığı. (Kanun-3 bunu kırdı: A1'de iki hatamı kendim yakaladım.)

**M3 · Görünürlük-önyargısı → katman-sahipsizliği:** turlar hep prompt'ta GÖRÜNENDEN başladı (render görünür); L1-L2 (spec-şablonu, planner-sözleşmesi) hiçbir turun scope'una girmedi çünkü çıktıları doğrudan görünmüyor. 9 açık-kusurun 8'inin orada birikmesi tesadüf değil.

**M4 · Tespit≠çözüm yanılgısı:** linter/gate koymak "düzeltme" sayıldı; warn-modda bulgular kimseyi durdurmadı (442: 7 isabetli bulgu deftere yazıldı, prompt aynen uçtu). Tespit-katmanı ancak düzeltme/imkânsızlaştırma katmanıyla birlikte değer üretir.

**M5 · Kural-mekanizma ayrılığı (500-ihlalin kökü):** kanunlar benim dikkatime emanet edildi; dikkat görevde eriyor (memory-reform gerekçesi). Kanıt: scale_up-ihlali — kural ile kod-sabiti (3-5) aylarca çelişti, ben kuralı çiğnedim, mekanizmayı düzeltmedim.

**M6 · Tur-hafızasızlığı:** 397-doğrulaması, catalog-audit ve PCOMP-6 kısmen AYNI kökleri yeniden keşfetti — konsolide kusur-envanteri (A3 gibi) hiç tutulmadı; her tur sıfırdan teşhis maliyeti ödedi.

**M7 · Onay-akışı gevşekliğim:** kapsam-kararlarını (born-699-erteleme, "meşru-fallback" sınıflaması, 🏁-ilanları) kendim verdim; Alperen her turu kendi kontrolüyle kapatmak zorunda kaldı. Kanunlaştı (kanun-3) — bu belge onun ilk tam-uygulaması.

### DÖNGÜ-KIRMA TASARIMI (5 kilit)
- **DK1 · Motor-sorusu zorunlu:** her fix "motoru mu çevreyi mi kesiyor?" cevabıyla açılır; A3-matrisi YAŞAYAN-belge olur — yeni kusur=satır, fix=ölüm-koşulu-kapatma; "tur" kavramı ölür, tek hedef=matris-sıfır.
- **DK2 · Ölçüm-protokolü (A6):** tek-kanıt = canlı-üretim rubrik-sınavı (Alperen-skorlu); ölçüm-aracının kendi kalibrasyonu ayrı-adım; golden-set yalnız regresyon-yardımcısı.
- **DK3 · Kural→mekanizma bütçesi:** her çalışma-bloğunda ≥1 kanun mekanizmaya gömülür (ilk sıra: G6 aralık-config — scale_up kanunu koddan zorlanır).
- **DK4 · İlan-dili:** "TAMAM/✅/🏁" yalnız Alperen-rubrik-onayı sonrası; öncesinde tek meşru ifade "teslim-edildi, sınav-bekliyor".
- **DK5 · Ön-yarı-önceliği:** A5-sıralaması kaldıraç-listesine kilitli (G2+G1 → G3+G4+G6 → G7+G20 → G8+G9); arka-yarıya yeni cila, ön-yarı sözleşmeleri kurulmadan YASAK.

## A5 — HEDEF-MİMARİ + MALİYET (kaldıraç-kilitli; 2026-07-14)

> İlke: "derlenen-prompt" = her katmanın ÇIKTI-SÖZLEŞMESİ vardır; sözleşmeyi bozan çıktı ilerleyemez (fail-closed) ya da deterministik tamamlanır. Tespit-katmanları (lint) yalnız sözleşme-ihlalinin son-şahididir. MVP yok — her kalem tam-tasarım.

### KALDIRAÇ-1 · Metadata-hijyeni + intent-motoru (G2+G1 → G15-kalıcılık, G13-v2 dahil 4 kusur)
**G2:** `DirectiveBuildTask`/Task-şemasına ayrı `meta:{flowId,revision,tenant,actor,origin}`; `toDirectiveTask` description'a ASLA gömmez; DIRECTIVES'te ayrı `### meta`-satırı (yazıcı+iki-okuyucu); classifier/planner YALNIZ title+description okur. Geriye-uyum: okuyucular eski gömülü-satırı tanıyıp strip eder (dual-read).
**G1:** classifier eşleşmesi `containsWord` (D4-helper'ı core-paylaşımlı yapılır — 'içindeki' artık 'ci' üretemez: sınır-karakteri 'i' alnum) + dosya-deseni ağırlıkları kalır + **confidence<0.5 → intent='unknown'** (jenerik-persona; behavior-bloğu zaten unknown'da basılmıyor). Ölüm-kanıtı: 442-metinleri yeniden-sınıflanır → devops ÇIKMAMALI (regresyon-fixture).

### KALDIRAÇ-2 · Planner çıktı-sözleşmesi (G3+G4+G6 → G5, G11 dahil 5 kusur)
Zod-şema sertleşir + deterministik-tamamlayıcı çifti:
- **filesRead ZORUNLU:** planner boş bırakırsa compose-katmanı import-scan'le doldurur (mevcut `sourceImportNeedles` altyapısı) — eksik-scope sınıfı DOĞAMAZ.
- **mirror-test ZORUNLU:** davranış-değiştiren her src-task'ının filesWrite'ına mirror-test dosyası şemada eklenir (planner koymadıysa tamamlayıcı ekler; "yoksa-yarat" semantiğiyle exact-verify'a girer → G5 placeholder-sınıfı ölür). Ayrık test-task istisnası açık-işaretli (`testOwnership: separate-task`).
- **aralık CONFIG:** `ZERO_CONFIG_MIN/MAX` → `planner.task_range` config'i (dogfood default hedef ≥8; NL'de açık küçük-iş beyanı istisna) — scale_up KANUNU mekanizmada (DK3'ün ilk gömüsü).
- Şema-ihlalinde: typed-hata + tek-retry (ihlal-geri-bildirimli) — sessiz-kabul yok.

### KALDIRAÇ-3 · Spec-şablonu (G7+G20)
Zorunlu-bölümlü NL/spec şablonu (CC-tarafı süreç + ileride `do --spec`): **Amaç · Dosya-kapsamı · Edge-politikaları (sıralama/çakışma/legacy) · Dönüş/mutasyon-semantiği · Kanıt (davranış-koşusu ZORUNLU; yalnız-tsc YASAK) · Yasaklar**. Boş-bölüm = gönderilemez. Format-kuralları (virgül/tam-yol/rapor-yasağı) şablonda sabit — elle-tekrar ölür.

### KALDIRAÇ-4 · Focused-render (G8+G9) — EN BÜYÜK MALİYET-KAZANCI
- **Persona:** manifest'e görev-tipi→`guidance` kesitleri (5-15 satır); tam-gövde yalnız referans-link. (442-örneği: coordinator-işine devops-personası düşse bile Dockerfile-rehberi artık inmezdi.)
- **ADR:** clause-level render — adr-constraints yapısı genişler (DB'ye taşınır, G-019 roadmap); task-relevant 4-5 satır.

### MALİYET-MODELİ + KURTARICI ADIMLAR (soru-4)
Bugün: ort **21.6KB ≈ 5.5K token/prompt** (görev-çekirdeği %11). 8-worker sprint ≈ 8-14 spawn (+fix'ler).
| Adım | Kazanç | Not |
|---|---|---|
| K4-persona-focused | −%15-18/prompt | 4.6KB→~0.8KB |
| K4-ADR-clause | −%8-10/prompt | 3.1KB→~0.6KB |
| Tekrar-birleştirme (goCriteria 4.5-tema→2) | −%3-4 | render-tekilleştirme |
| **Toplam prompt-kısalması** | **≈ −%28-32** | görev-çekirdeği payı %11→~%16 |
| Leading-T0 reorder FLIP (bugün default-off) | cache-hit ↑ | worker'lar cache PAYLAŞMIYOR (ampirik) → prefix-stabilite kazancı per-worker; flip ölçümle |
| Exact-verify yan-kazancı (D1a ✓) | tam-suite kaçak-koşuları ↓ | zaten canlı |
| Planner-prompt ADR-özet (zaten kısıt-satırı) | planner-çağrı maliyeti sabit-küçük | büyümesin diye kısıt-tablosu ≤10 kayıt kuralı |

### UYGULAMA-DİLİMLERİ (sıra KİLİTLİ; her dilim A6-sınavından geçmeden sonraki başlamaz)
U1: Kaldıraç-1 (G2 metadata + G1 motor) → U2: Kaldıraç-2 (planner-sözleşmesi+tamamlayıcı) → U3: Kaldıraç-3 (şablon) → U4: Kaldıraç-4 (focused-render+maliyet-ölçümü) → U5: kalan-🟡'lar (W7-genişleme, warn→fail-closed Alperen-kararı, 698-b/c).
Yürütme-biçimi (Alperen-kararına sunulur): U1-U2 prompt-mekanizmasının kendisi olduğundan CC-el + her adım canlı-442-fixture-sınavlı; U3 süreç; U4-U5 dogfood.

## A6 — DOĞRULAMA-PROTOKOLÜ (onaylı; 2026-07-14)
Her U-dilimi sonunda: (1) ölüm-kanıtı regresyon-fixture'ları (442-gerçek-metinleri dahil) yeşil; (2) **canlı-üretim sınavı: 3 farklı gerçek-NL → planner → prompt**; çıkan prompt'lar ALPEREN'e sunulur, rubrikle O skorlar; hedef-skoru o koyar. "Teslim-edildi, sınav-bekliyor" tek meşru ilan; ✅ yalnız Alperen-skoru sonrası. Yürütme: U1-U2 CC-el · U3 süreç · U4-U5 dogfood (onaylı).

## U1 — UYGULAMA GÜNLÜĞÜ (başladı)

## U1 — TESLİM + A6-SINAV ÇIKTILARI (Alperen-skoru bekleniyor)
Kod: e0cef74c (G1 motor · G1b güven-demotion · G1c doc-yapısal · G2 meta-round-trip). Ölüm-fixture'ları 442-gerçek-metinli; 7917 test; korpus-kaymaları 4/31 hepsi-meşru.
**A6-canlı-sınav (gerçek planner, 3 NL — dosyalar `.analysis/a6-sinav-u1/`):**
- sinav1 event-sourcing: 4/4 **implementation** (eski-dünyada devops'a giderdi — hedef-düzelme)
- sinav2 gerçek-devops: ilk-task **devops** (korunum ✓) + impl + 2 doc
- sinav3 test-yazarlığı: 4 impl + 1 doc (ADR-G-023 dünyasında doğru-sınıf; behavior-bloğu all-test'te zaten susuyor)
İlan: **teslim-edildi, sınav-bekliyor.**
