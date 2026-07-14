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
