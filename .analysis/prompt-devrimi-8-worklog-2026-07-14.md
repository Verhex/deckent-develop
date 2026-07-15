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

## U2 — TESLİM + A6-SINAV (Alperen-skoru bekleniyor)
Kod: 4a675b4b — planner-normalize (N1 mentioned→read · N2 import-scan→read · N3 mirror-test create-if-missing, plan-genel çakışma-istisnalı) + şema-retry + 3-5-hardcode ölümü (env-parametrik).
**Kanıtlar:** 442-gerçek-planı: filesRead 0→4 (dört task) · 113 test · **A6-canlı (taze-NL, tam-zincir): 4 task, read 6/29/3/6 (sıfır-boş), mirror-test 3/4'te filesWrite'ta** (`.analysis/a6-sinav-u1/sinav4-u2-canli.md`).
İlan: teslim-edildi, sınav-bekliyor. Kalan-U: U3 spec-şablonu · U4 focused-render · U5 kalan-🟡'lar.

## U3 — KABUL (Alperen 2026-07-14: "kabul edildi ama başlıklar ve içerik ingilizce olsun")
`docs/templates/spec-template.md` (EN-revizyon; TR-orijinal `spec-sablonu.md` silindi — "AI modelleri EN ile daha native"): 7 zorunlu-bölüm

### U3-eki — MODEL-YÜZEYİ DİL-BİRLEŞTİRME (Alperen-ilkesi: "prompt/şablon/akış içinde çelişki bırakma")
Çelişki-taraması iki CANLI çürüme yakaladı, ikisi de öldürüldü:
1. **TR/EN prompt-çatalı drift'lemişti**: `buildPlanPrompt` + `buildZeroConfigPlanPrompt` iki-dilli fork taşıyordu; **ADR-kısıt bloğu yalnız TR-dalındaydı** ve üretim `'tr'` literal-default'uyla çağırıyordu (EN-dalı hiç ADR-bloksuz — kanun-10 sınıfı hardcode + çelişki). Fix: fork ÖLDÜ — tek-EN-kaynak, ADR-bloğu her iki builder'da; `language` parametresi kaldırıldı; retry-prompt + `adr-constraints` blok/`plannerSummary` + `prompt-evolution` hint-blokları + `getWorstCombinations` PAST-RESULTS satırları EN. Ayrım-kuralı: **model-yüzeyi=EN; kullanıcı-yüzeyi (CLI-i18n/log/rapor) TR kalır; girdi-tarayan regex'ler (forbiddenPattern, lint) iki-dilli kalır** (Alperen task-metni TR yazabilir).
2. **U1-G2 bilgi-kaybı**: `toDirectiveTask.meta`'ya `project` alınmamıştı — eski traceability-cümlesi project taşıyordu, Meta-hattı taşımıyordu. Tam-dizin koşusu (`plan-preview-service`) yakaladı; `meta.project` eklendi, test yeni Meta-sözleşmesine güçlendirilerek güncellendi (markdown'da var + description'da yok + round-trip).
Negatif-pinler eklendi (TR-prompt-metni geri gelemez). Kanıt: tsc 0 · tests/orchestra+core **15711 pass / 0 fail**.

## U4 — BAŞLATILDI (dogfood sprint-443, 26 mikro-task; Alperen "onaylandı" 2026-07-14)
**Spec:** `.analysis/u4-focused-render-spec-2026-07-14.md` (U3-şablonuyla, EN). A5-sözünden bilinçli sapma: guidance-kesitleri manifest'e DEĞİL PROMPT.md-İÇİ işaretli-bölümlere (ADR-G-027 tek-kaynak + sanctioned condensed+pointer emsali). Flag: `prompt.persona_render` default 'full' — default-flip ölçüm-sonrası ayrı Alperen-kararı.
**Plan-kapısı 2 GERÇEK kusur yakaladı (kendi savunmamız işledi), CC-el fix (U1/U2 emsali — mekanizmanın kendisi):**
1. `task-builder.extractScopeFromDirective` docFileMatches: tam-yolun kuyruğundaki çıplak `.md` adı (PROMPT.md) filesWrite'a İKİNCİ kez giriyordu → sanitizer drop → gate shrink-BLOCK ×20. Fix: alreadyCovered-koruması (standaloneMatches paritesi) + pin-testler.
2. `scope-satisfiability.PRIMARY_PATH_RE`: nokta-başlı yol (.analysis/, .deckent/) noktasız tokenize → filesWrite ile asla eşleşmez → yanlış MENTIONED_NOT_WRITABLE ailesi. Fix: match-başı `\.?` + `(?<![\w.])` lookbehind. **Yan-kazanım: born-650 phantom-path sınıfı (Date.now/process.env, $2.23/4.25dk) kaynağında ÖLDÜ** — RED-pin "kusur-öldü" pinine çevrildi. born-650 KAPANDI.
Ayrıca: bare-integer dependency-ref'in 0-based çözüldüğü öğrenildi (self-dep döngüsü) → DIRECTIVES "Task N" formuna geçti.
Sprint-443: PID 462878, monitor kurulu. Kalan: sonuç-değerlendirme (review/retro) + ölçüm-raporu → Alperen A6-skoru → default-flip kararı.

## U4 — SONUÇ (sprint-443 kapandı: 28/29 · %97 · 44dk · 1 NO_GO=026-entegrasyon · 6 dürüst-borç)
**Ölçüm (A6-artefaktı `.analysis/u4-olcum/report.md`, F1-sonrası dürüst-rakam):** 8 gerçek-arşiv-task × 2 mod, gerçek compose-yolu → **persona −%83.0 · toplam −%19.9** (guidance vs full). ADR-segmenti sabit 4.0KB — bilinen kalan-dilim (governing-ADR tam-gövde; A5 −%28-32'nin kalanı burada). goCriteria-dedup (443-004) iki modda da aynı → bu karşılaştırmada görünmez. Flag default 'full' — **flip = Alperen-kararı**.
**Alperen 66/100 eleştirisi → F-serisi (onaylı):**
- **F1 ✅** full-mode CORE-gövde render (`personaCoreBody`, marker-blokları+boş-heading söker; sökülünce pointer eklenir — G-027 erişim-kaybı sıfır). Kendi AGSK-6 amendment'ımın sakladığı +2-3.5KB/prompt full-mode regresyonu ÖLDÜ. Kardeş-cap AGSK-2'ye de aynı amendment (yutma-analizim ilk turda kardeş-dosyayı kaçırmıştı — F5'in gerekçe-kanıtı).
- **F2 ✅** classifier PROSE-only: `stripGoNogoSection` (443-replay: goNogo-bloklu gerçek metin documentation'a döndü; off-by-one debug-kanıtla yakalandı-düzeltildi). Transport değişmedi (extractGoNogo tüketicileri etkilenmez).
- **F3 → tasarım-notu:** refactorer `implementation:7` KASITLI (Sprint-205: impl→builtin garantisi, 3 test-dosyası pinli) — silmek yerine **nötr `implementer` builtin'i** skoru devralacak, refactorer refactor-only'ye inecek. Ayrı dilim.
- **F4 → paket (sırada):** shadow-sync gap CANLI-doğrulandı (.deckent kopyalarında 0 marker; `deckent sync` adapter-only + **EISDIR-çakılıyor** = yeni born). doctor-raporu · scaffold · onay-kapılı `agent optimize` · three-way sync · skill-ADR-amendment.
- **F5 ✅** spec-template §8 BLAST RADIUS zorunlu-bölüm.
**NERVOUS ONAY-DÖNGÜSÜ (Alperen: '25. kez') — KÖK-FIX İNDİ + CANLIDA** (`c26f4750`; bot pid 679433 yeni-dist'te): parmakizi-kimlik + kalıcı karar-defteri + pending-dedup + bağımlılık-farkındalı dedektör + executed-cooldown/eskalasyon; ölüm-paketi 60-dosya/517-test. Canlı-doğrulama protokolü: notify-log kopya-sayısı izlenecek.
**Yeni born-adayları:** sync-EISDIR · test-docker .tasks-sızıntısı (hermeticity, canlı yakalandı) · status "28/3 (900%)" display · 026-entegrasyon yeniden-koşusu · F3-implementer-dilimi · ADR-clause kalan-dilim. (amaç · dosya-kapsamı+ayrık-test-kararı · edge-politikaları · dönüş/mutasyon-semantiği · **kanıt=davranış-koşusu, yalnız-tsc YASAK** · sabit-yasaklar · büyüklük). Kaynak: 442-analizi §3.5-3.9 muğlaklık-sınıfları soru-formuna dönüştü. Kullanım-kuralı: CC hiçbir do-NL/spec'i boş-bölümle gönderemez. **Sınav:** aynı işin şablonsuz-NL'si (sinav-1) vs şablonlu-spec'i karşılaştırmalı — `sinav5-u3-sablonlu-spec.md` (sequence-edge'lerin TAMAMI artık spec'te cevaplı). İleride `do --spec` makine-okur (MASTER-PLAN-notu).

## SPRINT-444 — KAPANIŞ (mini: F3+026+F4-core · 7/7 %100 · 23dk · 0 NO_GO · 1 dürüst-borç)
**Spec:** `.analysis/f3-sync-mini-spec-2026-07-14.md` (§8 Blast-Radius'un ilk zorunlu kullanımı; Alperen "ONAYLANDI").
**Task-sonuçları:** 001 implementer builtin ✅ (validator exit-0, core 3017B, 3 slice, impl@7) · 002 refactorer refactor-only ✅ · 003 era-pinleri GO_WITH_TECH_DEBT (32/32 yeşil; borç=aşağıdaki enjeksiyon-notu) · 004 sync-EISDIR ✅ (dizin-vakası typed-warning, sweep abort etmez) · 005 `agent-prompt-sync.ts` three-way ✅ · 006 u4-integration-compose e2e ✅ · 007 era-smoke ✅.

**Host-side kapanış-zinciri (Brain, build-sonrası):**
1. **Gerçek `sync --adapters-only` koşusu ×2, exit 0** — EISDIR ÖLDÜ (canlı `.cursor/rules` dizin-vakası artık warning). İlk koşu: 4 created (implementer/api-designer/i18n-specialist/observability-engineer) + **17 kept-local** (baseline-yok fail-safe — silent-overwrite YOK).
2. **Provenance-kazısı (git-history):** 17 kept-local'ın 11'i strip-frontmatter(tarihsel-builtin) ile byte-eşit = BAKİR eski-kopya → baseline'ları kanıtla seed'lendi → ikinci koşuda mekanizmanın KENDİ (a)-dalından 11 update. **6'sı GERÇEK yerel-düzenlenmiş** (örn. devops-engineer'da Node-sürüm satırı elle güncellenmiş) → korundu. **Three-way tasarımı ilk canlı-koşusunda gerçek bir yerel-editi kör-overwrite'tan kurtardı — tasarım-doğrulaması.** Sonuç: 15 shadow guidance-marker'lı (öncesi: 0). 6 düzenlenmiş-shadow'un merge-kararı → Alperen.
3. **KRİTİK KEŞİF — F3 canlıda ölü-doğuyordu:** (i) shadow `refactorer/agent.json` pre-444 kuralı taşıyordu (shadow-öncelik → demote görünmez) → builtin'e eşitlendi (git-kanıtlı bakir-kopya); (ii) **Sprint-204 kalıntı load-time enjeksiyonu** `BUILTIN_IMPLEMENTATION_INTENT_RULES.refactorer@7` manifest'ten bağımsız kuralı GERİ-basıyordu (444-003 worker'ı dürüst not düşmüştü) → refactorer map'ten düşürüldü (architect@6 kaldı — F3-kapsamı dışı), yorum-bloğu era'ya yazıldı, 5 test-dosyası era'ya taşındı. **Ders: §8 Blast-Radius "Consumers" listesi shadow-manifest'leri ve load-time enjeksiyonları KAÇIRDI — iki tüketici-sınıfı şablon-aklına eklenmeli.**
4. **Canlı-kanıt (probe, gerçek pool):** nötr-impl→implementer@7 · refactor→refactorer@10 · devops→devops-engineer@13 (floor mıknatıs değil) · LIVE refactorer rules=[refactor@10] tek-kural.
5. drift-ratchet: 2 yeni-öğe çözüldü + 12 eski-öğe yakınsadı → baseline 40→28 (sıkılaştı). catalog-materialize hermetiklik-fix'i (suite artık probe-id'lerin shadow'unu fixture-içinde söker — gerçek-repo-durumuna bağımlılık öldü).
6. Kanıt: era-pinleri 41/41 · tests/core+sync+e2e **7994 pass / 0 fail** · tsc 0.

**ROUTING-V3 korpusuna canlı-kanıt:** "Refactor the config loader into smaller functions / Refactor config.ts internals…" → classifier `implementation` 0.56 ("refactor" kelimesi 2× geçmesine rağmen). Skorlama-aritmetiği değil sinyal-üretimi tavana dayanmış durumda — V3 system-debug raporunun ilk korpus-maddesi.
**F4-kuyruk (yeni):** agent.json manifest-sync mekanizması yok (prompt-sync yalnız PROMPT.md; bugün elle+git-kanıtla yapıldı) · 6 düzenlenmiş-shadow merge-kararı (Alperen) · `agent optimize` + doctor guidance-raporu.

## ROUTING-V3 — SYSTEM-DEBUG ✅ + BRAINSTORM-TURU-1 (2026-07-14)
**Rapor:** `routing-v3-system-debug-2026-07-14.md` + 3 appendix (signal-inventory · misroute-corpus · patch-history). Yöntem: 3 paralel kanıt-ajanı + Brain canlı-probe/sınır-deneyi (12-probe bataryası + 9-vaka sınır-deneyi); korpus spot-check'leri birinci-el doğrulandı.
**Manşetler:** ~22 yama/3,5 ay (7/8 sınıf nüks) · catch-all çağ-göçü (427 bug-fixer 24/24 → 438-441 refactorer 16/16 → 443 21/26) · 443-doğal-deneyi (20 özdeş görev, substring-şansıyla 4 rota) · non-monotoniklik ("Refactor" EKLEMEK refactor'dan uzaklaştırıyor) · testing üçlü-ölüm · güven yüksek-ama-yanlış (0.95-misroute), taban yok (0.36-rota) · öğrenme açık-devre (tasks[0]-DNA bug + sıfır-stats + hayalet-skill %100).
**Brainstorm-kararları (Alperen):** (1) LLM-atama + deterministik-doğrulayıcı **KABUL** · (2) capability-matrix = agent.json-v3 SSOT **KABUL** · (4) **DOĞRUDAN-KESİM** ("v2 başarılı değil") · (5) kararsızlık/eşitlikte **Brain-eskalasyonu** · (3) taksonomi → detaylı-inceleme istendi → `routing-v3-intent-taxonomy-inceleme-2026-07-14.md` sunuldu (öneri: **Seçenek-B work-type×domain** + sahiplik-değişmezi-lint'i + **test-engineer dirilişi** [F3-emsali]). Alperen soru-3 kararı bekleniyor → sonra V3-tasarım-spec'i (U3-şablonu + §8 blast-radius ile).

## ROUTING-V3 — BRAINSTORM-TURU-2 (2026-07-14)
**Test-sahipliği KARARI (Alperen):** test-engineer DİRİLMEZ; "test" kelimesinden çıkarım YOK; her agent işi gereği test yazar (450 sprintte saf-test-işi neredeyse hiç yok). → Model: test work-type DEĞİL; work-type listesi 8 (build·fix·refactor·document·review·configure·migrate·analyze); test-yazımı EVRENSEL-capability; test-ağırlıklı görev DOMAIN-sahibine; TEST_OWNERSHIP+8/ciGuardian+3/suppressRefactorerTestCatchAll yamaları V3'te iz bırakmadan ölür.
**🔒 VEKTÖREL-3D DİREKTİFİ (Alperen, bağlayıcı):** "agent seçiminde vektörel düşünmeliyiz — sayısal+konumsal+içerik 3 boyuttan agent-skill-persona uyumunu deterministik VE ai olarak yakalamalıyız; yapı kesinlikle böyle olmalı." → İnceleme-dokümanına §4b işlendi: requirement-vektörü↔capability-vektörü; eşleşme-hattı 5-adım (deterministik-eleme → AI-içerik-uyumu → deterministik-doğrulayıcı → sayısal-sıralama → Brain-eskalasyonu); skill+persona-slice seçimi AYNI eşleşmenin parçası. Taksonomiye izdüşüm: Seçenek-B eksen-sözlüğü olarak vektör-modelinin içine oturur (A çelişir, C konumsal-eksende içerildi). Sırada: B-onayı → V3-tasarım-spec'i.

## ROUTING-V3 — B-ONAYI + TASARIM-SPEC'İ (2026-07-14)
**Alperen:** B-detayı istendi → `routing-v3-secenek-b-detay-2026-07-14.md` sunuldu (kapalı-çekirdek work-type[8]+SUBTYPE · 3-katman domain-registry · vektör-şemaları · 5-aşama hat · policy-pack/governance/multi-tenant) → **"onaylıyorum"**. Bağlayıcı-ek: customize-edilebilirlik + milyon-kullanıcı/enterprise + no-MVP.
**ADR-recall (kanun-2):** ADR-G-006 (Immutable, Routing & Selection) tam-metni okundu — **"tomorrow"-bloğu V3'ü ZATEN taahhüt ediyor: "learned Routing V3 … vector-selection over task-kind×cost×latency×risk×provider-health×outcome"** → spec ADR'yi YÜRÜTÜYOR; today-bloğu amendment'ı Slice-0'da (öngörülmüş-evrim). Model/effort/provider-seçimi + cost/latency/risk eksenleri spec'e alındı. Korunan-guard'lar: diversity ≤%60/≥4-distinct · distribution-script · FIX fresh-eyes rotasyonu · force-* semantiği.
**Spec:** `routing-v3-design-spec-2026-07-14.md` (U3-şablonu 8-bölüm tam; §8 blast-radius: routeTaskV2 çağıranları+~30 test-dosyası+jurnal-tüketicileri; eski-davranışın sessiz-koruduğu 5-madde). **Dilim-planı: 4 slice × 1 sprint (445-448, kanun-8 20-40 mikro-task):** S0-FOUNDATION (registry+şemalar+migrator+21-manifest+ADR-amendment) · S1-DETERMINISTIC-ENGINE · S2-AI-STAGE+INTEGRATION · S3-CUT-OVER (ölüm-listesi+test-re-aim+kabul-korpusu). Her slice sonu Alperen-onayı (kanun-3). Sırada: spec-onayı → Slice-0 DIRECTIVES.

## ROUTING-V3 SLICE-0 — SPRINT-445 KAPANIŞ (2026-07-14, 89dk, 32/34 %94)
**Sonuç:** 22 DONE + 10 dürüst-borç + 2 NO_GO (445-019 + fix'i — obs-engineer manifest'i catalog-materialize fallback-pinini kırıyor; worker DOĞRU şekilde çapraz-görev-bloğu ilan etti → S1-maddesi: "son-3-manifest-less builtin'in materialize'ı + injectable-builtin-dir test-mimarisi"). FIX-kaskadı 013-018'i fix-task'larla, 007/011'i cross-fix'lerle kapattı.
**Teslimler:** `src/core/routing3/` doğdu (types · vocabulary-builtin[work-type-8+14-domain+deliverable-map] · 3-katman loader · requirement-vector[konumsal+sayısal+yapısal-içerik, çift-girdili kelime-yasağı-pinleri] · capability-vector+skill-profile[matchSpace tek-uzay] · migrator[provisional] · config[weights 0.5/0.3/0.2, enabled:false]) + sync-migrator-wire + agent-pool-additif-yükleme (V2-bit-identical pinli) + **18/18 manifest-taşıyan builtin'e EL-YAZIMI gerçek-capabilities** + skill-profilleri (hayalet-reddi) + vocabulary-doctor (TR-i18n) + bootstrap-üreticisi + ADR-amendment-taslağı + 3 entegrasyon-gate'i.
**Host-side zincir:** build ✅ · gerçek `sync --adapters-only` ✅ (shadow'lara provisional-v3 dual-carry) · doctor Vocabulary-bölümü CANLI (25 domain = 14 builtin + **11 proje-türevi bootstrap**: agent/agents/desktop/extensions/mcp/mcp-client/monitor/nervous/providers/sdk/training) · 6 kanıtlı-bakir shadow-manifest builtin'e eşitlendi (12'si S1-manifest-sync'e kaldı, drift-ratchet'e grandfathered 40-key) · **ADR-G-006 amendment-merge'i S3-KESIME ERTELENDİ (dürüstlük: "today=V3" cümlesi V2 canlıyken yanlış-beyan olur; taslak merge-hazır)**.
**Canlı-V2-kanıtları (V3-korpusuna):** 445 dağılımı implementer 19/26 %73 (lavabo refactorer→implementer göçtü, öngörülmüştü; persona-uyum bu kez POZİTİF) · 445-016 = 443-doğal-deneyinin canlı tekrarı (başlıktaki "security-auditor" adı security@0.95'e kaçırdı; 6 kardeş-task implementer'da) · 445-024 conf-0.48 rotası.
**Süite:** routing3 309-test yeşil; tam-sweep 23202-pass / 2-fail (adları tespit ediliyor — kapanış-öncesi çözülecek).
**Sweep-kırıkları (2) kapatıldı (CC-el, kapanış-zinciri):** (1) `config-flag-roundtrip` parite-guard'ı `routing_v3`'ü born-464 flag-drop deseninde yakaladı (ResolvedConfig'te tanımlı, loadConfig-literal'inde yok) → İKİ resolved-literal'e `resolveRoutingV3Config(null, config)` eklendi (defaults tek-yer routing3/config.ts'te kaldı; init-safe import-cycle notu düşüldü); (2) `sync-onboard-upgrade-overhaul` bayat tam-mock'u yeni `PROJECT_CONFIG_PATH` import'unu bilmiyordu → importOriginal'lı partial-mock'a çevrildi (sınıf öldü: gelecekteki export-eklemeleri bu suite'i bir daha kıramaz). Doğrulama: 80 test + tsc 0. TAM-SÜPÜRME SONUCU: 23202+ pass / 0 fail.

## ROUTING-V3 SLICE-1 — SPRINT-446 KASKAD-PATLAMASI + EL-KODLAMA (2026-07-14/15)
**Patlama-kökü (Alperen tespiti doğru):** otomatik-enjekte debt-task'ı plan-numaralarını kaydırdı → DIRECTIVES "Task 1" referansları debt-task'a (446-001) çözüldü → o NO_GO alınca **18 görev kaskadla öldü** (SCHED6 persist-before-commit: hiç dispatch edilmeden). CC-hatası: 444'ün numaralandırma-dersi enjeksiyon-vakasına uygulanmadı. **Alperen-kararı: sprint/prompt-mekanizması bu iş için BIRAKILDI — V3 Brain-eliyle kodlanacak.** Sprint kill edildi (Alperen-bildirimi üzerine; bot korundu).
**Enkazdan kurtulan:** learning-cells (26-test) · agent-manifest-sync modülü · 3 manifest-less builtin'in agent.json+capabilities'i.
**EL-KODLAMA TESLİMİ (Brain, tek oturum):**
- `decision-types` (karar/öykü/eskalasyon/jurnal şemaları, deep-freeze) · `stage-eliminate` (4-hard-filtre; V2 write-denied paritesi; evrensel-test-capability kuralı) · `axis-content` (tek-tablo proficiency; yapısal-modda düzyazı-kanalı İNERT) · `axis-positional` (**tasarım-hatası yakalandı-düzeltildi: bilgisiz-bileşen nötr-1-dolgusu domain-farkını eziyordu → yalnız-mevcut-bileşen ortalaması**) · `axis-numerical` (cold-start-nötr hücreler; cost-tier; opsiyonel canlı-sinyaller) · `stage-rank` (config-ağırlıklı; kalibre-güven çift-monoton; belgeli tie-break zinciri) · `verifier` (savunma-derinliği; content↔yapı çelişki-kapısı [LLM-geçemez]; policy-enforcement; CatalogGapError; anti-temp vektörel) · `policy-pack` (bildirimsel 3-katman) · `decision-story` (≤80-char kısa-form + messageKey — WORKER-LIVE-LOG-hazır) · `journal`+`replay` (LLM'siz yeniden-türetim; config-drift tespiti) · `route-task-v3` (5-aşama; contentFit-slotu S2'ye; skill+persona-slice AYNI koşuda; force-* verifier'ı asla atlamaz) · **ghost-rejection** (hayalet-varlık outcome'u sayaçlı-red) · `agent-lint` (gerçek-pipeline sweep; erişilebilirlik+boşluk+örtüşme) + **`deckent agent lint` CLI** (i18n en+tr; gap→exit-1 ratchet) · **manifest three-way sync `deckent sync`'e bağlandı** (sıra-sözleşmesi: three-way → migrator yalnız-eksik-doldurur).
**Canlı-operasyonlar:** builtin-fallback capabilities-çağına genişletildi (manifest'li builtin = D-004 default-katmanı; **taze-projede TÜM katalog görünür** — canlı-regresyon [3 yeni-manifest'li agent havuzdan kaybolmuştu] yakalandı-düzeltildi) · gerçek sync-koşusu: 3 shadow-manifest created + 12 kept-local (dürüst) → git-arkeolojisi: 12'si builtin-tarihçesiyle HİÇ eşleşmiyor = **shadow'lar evrilmiş-otoriter içerik** (geçmiş manifest-rewrite'lar shadow'a işlemiş) → prensipli-graft: V2-alanları shadow'un, capabilities builtin'in · **`agent lint` İLK koşusunda 5 erişilemez-agent + %100-ikiz (ci-guardian↔devops) teşhis etti** → capability-yazım-ayrıştırması (8 blok rafine) → **"Catalog clean: every agent reachable, no coverage gaps"** (kalan: 1 informational-örtüşme 81%).
**Kabul-korpusu:** corpus-harness yeşil — **443-doğal-deney sınıfı ÖLDÜ: 20 özdeş görev tek-rotaya** (V2: substring-şansıyla 4 rota); 4 vaka açık-pending('ai-stage', S2 bilinçli-yakacak).

## ROUTING-V3 S2+KESİM — COMMIT 9f4b9037 (2026-07-15)
S2 el-kodlandı: content-llm (batch, kelime-yasaklı prompt, per-task yapısal-fallback) + routing-plan-adapter (+routeSingleTaskV3) + planner/finalizer wire. KESİM: planner V3-koşulsuz (V2-döngüsü fiziksel silindi); cli/run+mcp/run+task-mode+mid-sprint-reroute (fresh-eyes excludeAgentIds) V3'e çevrildi. routing3→routing rename (Alperen-talimatı). Canlı-kanıt: gerçek plan 3-görevde domain-sahibi-kazandı + düşük-güven-eskalasyonu + jurnal. Deliverable-kapsamı soft'a alındı (sahte-gap sınıfı öldü).
**S3 KALAN-KAZI (sıralı checklist):**
1. **W2 gövde-silme:** routing-engine.ts'ten routeTaskV2+selectBestAgent+bonus-ormanı+AGENT_FALLBACK_CHAIN+suppress*+getDynamicExclusions kazı (KALANLAR: resolveEffortTier [planner], detectHeuristicLanguage [requirement-vector], skill-budget/contextFit tüketici-analizi); intent-classifier.ts tüketici-analizi→silme; activation-engine.ts silme; agent-pool BUILTIN_IMPLEMENTATION_INTENT_RULES+applyBuiltinImplementationRules silme; routing-openrouter V2-bağları.
2. **W3 test-triyajı (~30 dosya):** SİL (mekanizma-ölü): routing-impl-builtin, agent-impl-candidate, agent-impl-balance, routing-multisignal, word-match-intent-hygiene[classifier-bölümleri], intent-classifier testleri, activation-engine testleri, routing-implementer-era[V2-bölümü] · RE-AIM (değişmez-yaşar): routing-live-diversity+routing-diversity-guard→V3-gerçek-katalog sweep'i (lint zaten var), agent-routing-health→V3.
3. **W4 kapanış:** config-anahtarları — V2 `routing`/`routing_config`/`routing_engine`/`agent_min_score` ölür; `routing_v3`→`routing` rename+alias · manifest'lerden activation.rules dual-carry sökümü (builtin+shadow; custom-agent geriye-uyum: loader tolere+ignore+doctor-uyarısı) · `enabled` bayrağı ölür (V3 tek-yol) · ADR-G-006 amendment-MERGE (artık today=V3 DOĞRU) + decisions-export regen · decisions-v3→decisions dizin-rename · DECKENT.md/CLAUDE.md mimari-satırları · learnings.json/OutcomeTracker V2-öğrenme-yolu emekliliği (cells tek-kaynak) · task-mode/run catch'lerindeki "generic fallback" dürüstlüğü (CatalogGap rethrow).
4. Final: tam-süpürme + gerçek plan+lint+doctor smoke + drift-ratchet + MASTER-PLAN/worklog + commit.

## ROUTING-V3 S3 KESİM-TAMAMLAMA (2026-07-15, Brain-eliyle)
**W2 gövde-silme ✅:** routing-engine.ts · intent-classifier.ts · agent-cache · skill-selector · agent-selector · routing-openrouter · routing-affinity-observability · decision-logger **fiziksel silindi** (8 modül). Korunanlar taşındı: detectHeuristicLanguage→routing/language.ts · resolveEffortTier→WORK_TYPE_EFFORT/effortForWorkType (routing/config.ts, work-type-tabanlı) · spawner journal-path lokalize. activation-engine KALDI (routing-dışı tüketiciler: policy-engine/autonomous + prompt-token-optimizer + v1-migrasyonları).
**Tüketici-çevrimleri ✅:** planner V3-koşulsuz (V2-döngüsü + tasks[0]-DNA-learning-bloğu + affinity-sink silindi) · cli/run + mcp/run + task-mode-runner → routeSingleTaskV3 · mid-sprint-reroute → V3 fresh-eyes (excludeAgentIds; test bayat-probe bug'ını yakaladı-düzeltildi) · task-router'ın V2 spawn-anı surface-override şeridi emekli (çift-otorite sınıfı) · adapter'a pools-opsiyonu (bellek-içi temp-agent/skill'ler V3-görünür) · conventions-temp-skill'e V3-profili (sessiz-kaybolma regresyonu düzeltildi).
**W3 test-triyajı ✅:** 58+3 V2-mekanizma test-dosyası silindi · karma-dosyalar re-aim (mock-swap'lar, mid-sprint yeniden-yazım, effort-tiering→effortForWorkType, plan-surface/plan-improvements pin-güncellemeleri) · sayı-pinleri (agents 20→21, README/DECKENT) · baseline'lar (spawnsync −silinen-girdiler; features-manifest routing-engine-v3; orphan-listesi ±) · CHANGELOG bozuk-başlık fix.
**W4 ✅ (kritikler):** **ADR-G-006 amendment MERGE edildi** (today=RoutingEngineV3 artık DOĞRU; eski-V2 metni Ancestry-altında; doc+DB [store.update adr-g-006] + exports-regen + taslak docs/adr/archive'e) · sync-to-product core-memory yolu güncellendi.
**KALAN V3-KUYRUK (küçük, engelsiz):** routing_v3→routing config-anahtar rename+alias (V2 routing/routing_config/routing_engine anahtarlarının ölümüyle birlikte) · manifest'lerden activation.rules dual-carry sökümü (custom geriye-uyum: tolere+ignore+doctor) · decisions-v3→decisions dizin-rename · vocabulary-bootstrap CLI-wire (analyze/init) · run-yolu catch'lerinin CatalogGap-rethrow dürüstlüğü · OutcomeTracker/learnings.json V2-öğrenme emekliliği · DECKENT.md mimari-satırı.

## SURF-TRENİ DEVAM (2026-07-15, Brain-eliyle) — 1b ✅ DOĞRULANDI + 1c-ÇEKİRDEK ✅
**Plan çıkarıldı (Alperen "surf planını çıkar devam et"):** 1b-tamamlama → 1c-göç+LIVE-LOG-temeli → 2-API-parity/security → 3-Terminal (born-697+688+REPL-575) → 4/5-Desktop → 6-dogfood → 7-dashboard-cutover; sıra-değişmezleri korunur.
**1b:** dondurma-notu BAYATMIŞ — coordinator-çekirdeği zaten tam (7-komut + 3-katmanlı getFlow + listFlows; restart-rehydrate/legacy-dual-read/commandId-dedup/iki-flow-bağımsızlık aileleri 80/80 yeşil). 442-003'ün "refactorer'a-gitti ama teslim-etti" dilimi + salvage'ler kapatmış.
**1c-çekirdek (el-kodlandı):** `run-flow-routes.ts:111` module-Map **ÖLDÜ** → per-root coordinator-registry (`run-flow-coordinator-registry.ts`) tek-otorite · **plannedSprint kalıcılaştı** (`<flowId>.plan.jsonl` — restart-arası approve→snapshot boşluğu [mevcut-gap!] kapandı) · coordinator'a fail-soft `deps.onEvent` → **SSE artık HER durable-event'i canlı-yayınlıyor** (append-SONRASI; sequence-frame'li) · decision-handler grant/reject-komutlarına göçtü (commandId'li → HTTP-retry'ları idempotent). Pinler: `run-flow-durability-1c.test.ts` 4/4 (restart-fold · restart-sonrası-snapshot · SSE-yayın · çapraz-restart-idempotency). API-ailesi 100-dosya/981-test yeşil; mevcut routes-testleri DEĞİŞMEDEN geçti (davranış-paritesi).
**1c-KALAN:** born-698b/c (do sessiz-ölüm kalanı) + WORKER-LIVE-LOG kanalı (event-stream'e ACTIVITY; V3 decision-story sözleşmesiyle) → sonraki-dilim.

## WORKER-LIVE-LOG (#582) TEMELİ ✅ (2026-07-15, SURF-1c dilimi, el-kodlandı)
Alperen'in "işçi anlık napıyor görmezsem güzel arayüz veremem" talebi — temel canlı: **`WORKER→*:ACTIVITY` kanalı** mevcut event-stream'e eklendi (ikinci-mekanizma YOK); `worker-activity.ts` emitter (≤80-char clip + kind[status/file/step/test/result] + detay-payload — **V3 decision-story ile AYNI satır+detay sözleşmesi**, terminal/Desktop tek-bileşenle render eder); **heartbeat-yolu artık her kalp-atışında canlı-satır yayınlıyor** (status + currentAction + filesChanged — "şu an ne yapıyor" akışı); ollama-runner'ın progress-emitter'ı adım-başına çift-yazıyor. Flag: `live_trace.enabled` (mevcut tek-toggle; per-process cache + test-seam). Pinler: 5/5 (clip-sözleşmesi · kapalı-bayrak-sessizliği · kanal-payload · heartbeat-emisyonu · bayrak-kapalı-heartbeat-dokunulmazlığı); agents-ailesi 49-dosya/984-test yeşil. KALAN (SURF-3): Claude-CLI worker'ın tool-by-tool zengin-akışı (stream-json parse) + `status --follow`/terminal-feed/Desktop-console tüketicileri; born-698b/c hâlâ 1c-kuyruğunda.

## born-698b/c ✅ — SESSİZ-ÖLÜM SINIFI KAPANDI (2026-07-15, SURF-1c tamamlama, el)
**(b) child-tarafı:** `start --flow-id` çocuğu runSprint-çökmesinde KENDİ dürüst-kapanışını yazar (coordinator.recordRunFailure, best-effort; orijinal-hata korunur).
**(c) okuma-yolu süpürgesi:** `run-flow-death-sweep.ts` — STARTING/DETACHED_RUNNING iddiasındaki flow'un kayıtlı pid'i ölüyse durable RUN_FAILED + sistem-anlatısı ("pid N not alive — closed by death-sweep"); `deckent status` okuma-yoluna bağlı (APPROVAL-EXPIRY emsali, fire-and-forget fail-soft). Dürüstlük-kuralları: canlı-pid ASLA dokunulmaz (EPERM=canlı) · pid'siz eski-kayıt "unknown-liveness" raporlanır, öldürülmez · terminal-durumlar kapsam-dışı · idempotent.
**Altyapı:** StoredRunHandleRecord +pid (additive; child kendi pid'ini yazar — born-681 tek-yazar deseniyle uyumlu) · coordinator'a `recordRunFailure` komutu (RUN_FAILED; reducer zaten tanıyordu). Pinler 5/5 (ölü-pid→FAILED-fold-restart-kanıtlı · canlı-dokunulmaz · legacy-rapor · idempotent · terminal-kapsam-dışı); aile 177-dosya/2566-test yeşil.
**SURF-1c BÖYLECE TAM ✅** (çekirdek + LIVE-LOG-temeli + 698b/c). SIRADA: SURF-2 (API parity/security).

## SURF-2 BAŞLADI — SSE QUERY-TOKEN MAJOR-FIX ✅ (2026-07-15, el)
Teşhis: run-flow SSE (`/api/run-flow/:id/events`) auth-arkasında ama allowlist'te YOK → EventSource (header koyamaz) hiç bağlanamıyordu. Fix çift-katmanlı: (1) **query-token şeridi GET/HEAD-only'ye sertleştirildi** (auth.ts — URL'deki token log/referrer-sızıntı sınıfı; mutasyon ASLA query-token'la kimliklenemez) · (2) `/api/run-flow/` prefix-allowlist'e (GET-only kısıtla birlikte güvenli: yalnız read-only GET'ler + SSE kapsanır). Pinler 4 (doğru-token-GET ✓ · yanlış-token-403 · **POST-query-token-401** · allowlist-dışı-401); 4 eski-suite'in sahte-req'leri gerçeğe getirildi (method-alanı). API-ailesi 98-dosya/970-test yeşil. SURF-2 KALAN: start/cancel/resume/retry/list endpoint-paritesi + gateFindings-parity + tenant-negatifler.

## SURF-2 PARITE: list + start ENDPOINT'LERİ ✅ (2026-07-15, el)
`GET /api/run-flow/list` (durable-state'ten, tenant-guarded, restart-kanıtlı-pinli) + `POST /:id/start` (terminal-controller'ın startApproved-aynası: coordinator.requestStart → startApprovedRun[idempotent, born-681 child-tek-yazar] → recordRunStarted; APPROVED-değilse typed-409; duplicate-start no-op). RunJobError export'landı. Pinler 3 (list-durable · start-202+DETACHED_RUNNING+idempotent-retry · non-approved-409); API-ailesi yeşil. NOT: start-pini gerçek-detached-child spawn'lıyor (tmpdir'de hızlı-ölüyor; death-sweep-sınıfı) — spawn-seam'i (setRunFlowProposalPlanner-benzeri) SURF-2 kalanına eklendi. SURF-2 KALAN: cancel/resume/retry endpoint'leri · events-replay (afterSequence) REST-yüzeyi · gateFindings-parity · tenant-negatifler · spawn-test-seam.

## SURF-2 ANA-GÖVDE ✅ (2026-07-15, 2-saatlik otonom-blok, el)
**cancel:** coordinator'a `abortFlow` (FLOW_ABORTED; her non-terminal→CANCELLED) + `POST /:id/cancel` (koşan-flow'da dürüst-not: süreç sprint-lifecycle'ın [deckent kill] — endpoint süreç-öldürme YALANI söylemez) · **events-replay:** REST-kopyası yol-çakışması yüzünden İPTAL (SSE regex'i /events'i sahiplenmiş + önce-dispatch) → doğrusu yapıldı: **SSE'nin kendisine replay-cursor** — frame'lere `id: <sequence>`, `?after=N` VE EventSource-native `Last-Event-ID` ile durable-backfill; yarış-kapalı (abone-önce→buffer→backfill→tail-üstü-flush) · **tenant-negatifler:** yabancı-tenant GET/preview/decision/cancel/start=404 (unknown'dan ayırt-edilemez) + list'te yokluk + owner-kontrolü. Pinler: 17/17 (suite-toplamı); API-ailesi + coordinator yeşil. KALAN (SURF-2 kuyruk, küçük): resume/retry semantik-tasarımı (dürüst-not: parite-tanımı belirsiz — terminal'de de yok; SURF-3'le birlikte kararlaştırılacak) · start-pini spawn-seam'i · gateFindings-parity denetimi.

## SURF-3 İLK-PARÇA: status --follow ACTIVITY-TÜKETİCİSİ ✅ (2026-07-15, el)
StatusRenderer'a **⚡ Live activity** bölümü (Section 3.5): sprint-event-JSONL'inin son-64KB'lik kuyruk-taraması → task-başına EN-SON ACTIVITY-satırı (torn-line-toleranslı, maxTasks-kapaklı, fail-soft). `status --follow` zaten her event'te redraw ediyor → canlı-akış otomatik. Alperen'in #582 döngüsü UÇTAN-UCA kapandı: worker-heartbeat → ACTIVITY-kanalı → terminal-canlı-satırı. Pinler 3/3; cli-ailesi yeşil. KALAN (SURF-3): terminal multi-flow-inbox · born-697 approval kanal-wiring · result-evidence · REPL-575 bulgu-triyajı · Claude-CLI tool-by-tool zengin-akış.
