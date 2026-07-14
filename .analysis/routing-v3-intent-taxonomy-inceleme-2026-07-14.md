# ROUTING-V3 — INTENT-TAKSONOMİSİ DETAYLI İNCELEME (soru-3, Alperen: "bilemiyorum detaylı inceleyelim")
> Bağlam: brainstorm-kararları 1/2/4/5 alındı (2026-07-14): LLM-atama+deterministik-doğrulayıcı KABUL ·
> capability-matrix=agent.json-v3 SSOT KABUL · doğrudan-kesim (shadow-mode yok) · kararsızlık/eşitlikte Brain-eskalasyonu.
> Bu doküman soru-3'ün karar-malzemesi. Ana-rapor: `routing-v3-system-debug-2026-07-14.md`.

## 1 · MEVCUT TAKSONOMİ — 12 kova + sahiplik-haritası (manifest-taraması 2026-07-14)

| Intent | kw | Sahip(ler) | Dışlayan | Durum |
|---|---|---|---|---|
| implementation | 16 | implementer@7 · architect@6(enjeksiyon) | ci-guardian · doc-writer | MEGA-KOVA: default + boost-hedefi + floor aynı anda |
| refactor | 11 | refactorer@10 · code-reviewer@8 · arch-planner@7 | — | sağlıklı-ama-ulaşılmaz (§2-manşet: kelimenin kendisi kaybettiriyor) |
| bugfix | 11 | bug-fixer@10 | — | sağlıklı (probe ✅) |
| documentation | 13 | doc-writer@10 | architect · devops-eng · security-auditor | sağlıklı AMA uzantı-sürüşü yanlış-pozitif üretiyor (.md yazan CI-görevi) |
| security | 14 | security-auditor@10 | — | kova var ama CILIZ: "harden/timing-safe/token" yakalamıyor (probe: impl@0.65→api-builder) |
| devops | 10 | ci-guardian@10 · devops-engineer@10 | — | **10↔10 beraberliği keyfî-kazanan** (437-001) |
| performance | 10 | performance-analyzer@10 | accessibility-auditor | sağlıklı (probe ✅) |
| design | 10 | frontend-designer@10 · arch-planner@10 · architect@8 | data-engineer | 'architecture' ile ÖRTÜŞÜK — iki kova tek anlam |
| architecture | 8 | architecture-planner@9 | — | ↑ design'la birleşmeli-aday |
| config | 8 | (sahipsiz-doğrudan; migration-spec/devops dolaylı) | — | zayıf-sahiplik; devops'la örtüşük |
| migration | 8 | migration-specialist@10 · data-engineer@6 | — | sağlıklı-az-hacimli |
| **testing** | **0 (KOVA YOK)** | **YOK** | arch-planner · frontend-designer · migration-spec | **ÜÇLÜ-ÖLÜM: tip-sisteminde var, classifier ÜRETEMEZ, 3 ölü-exclude; test-writer S-148'de arşivli** |
| unknown | — | — | — | fallback |

**Kovasız-kalan gerçek iş-sınıfları (korpus-kanıtlı):** testing (NO_GO-kümesi!) · i18n (probe: impl@0.85→terminal-ux, i18n-specialist dururken) · accessibility (agent var, 0 kullanım — erişilemez) · integration (442-şekli "wire X into Y") · review/audit (code-reviewer yalnız refactor@8'den besleniyor) · content/persona-yazımı (443 doğal-deneyinin 20 görevi!) · data-engineering · release/build.

**Yapısal kusurlar (taksonomi-bağımsız ama kararı etkiler):**
- GENERIC-demotion: uzman-kova güven<0.5 → implementation'a katliyor (uzmanı silme-makinesi).
- testWriteRatio≥0.5 → **implementation+2** (test-sinyali yanlış kovayı besliyor).
- Secondary-intent %50-krediyle floor(8×0.5)=4 < minScore-5 → tek-kural-8 agent'lar secondary'den ASLA ateşleyemez.
- Beraberlik = keyword-tablosu ekleme-sırası (tanımsız-davranış).

## 2 · V3'TE "INTENT"İN YENİ ROLÜ (karar-1/2 ışığında — çerçeve-değişimi)

Karar-1 (LLM-atama) + karar-2 (capability-matrix) intent'i ROUTER-SİNYALİ olmaktan çıkarır. V3'te taksonomi üç yerde yaşar:
1. **Requirement-vektörünün work-type ekseni** — LLM görevden üretir, doğrulayıcı agent'ın capability'siyle kesişim-testi yapar.
2. **Doğrulayıcının kontrol-sözlüğü** — "bu agent bu work-type'ı YAPABİLİR Mİ" sorusunun anahtarı (yazma-yetkisi/rol/yüzey ile birlikte).
3. **Öğrenme-döngüsünün agregasyon-anahtarı** — outcome'lar work-type×agent kırılımında birikir (K4-onarımı).

Bu yüzden V3-taksonomisinin 3 değişmezi olmalı:
- **SAHİPLİK-DEĞİŞMEZİ:** her work-type'ın ≥1 yetkin builtin sahibi VAR (testing-faciasının yapısal önleyicisi; doğrulayıcı lint'i: sahipsiz work-type = catalog-hatası).
- **MECE-yaklaşımı:** kovalar örtüşmez-toplamı-kapsar (design/architecture-birleşimi; config/devops-sınırı çizili).
- **Öğrenilebilirlik:** kova, outcome-agregasyonuna yetecek hacimde (aşırı-ince taksonomi = veri-açlığı).

## 3 · SEÇENEKLER

### Seçenek-A — EVRİM: 12-kovayı onar (+testing/i18n/integration/review, design+architecture birleşir, implementation=yalnız-açık-floor)
~14 kova, tek-eksen. Artı: en az göç-maliyeti; mevcut manifest/test-pinleri büyük ölçüde yaşar.
Eksi: tek-eksen kalır — "api-görevinin refactor'u" gibi bileşik işler yine tek-kovaya sıkışır; kova-sayısı
büyüdükçe LLM-tutarlılığı ve öğrenme-hacmi seyrelir; 443-doğal-deney-sınıfı (content-işi) hâlâ eğreti.

### Seçenek-B — İKİ-EKSEN: work-type × domain (ÖNERİLEN)
- **work-type (9):** build · fix · refactor · test · document · review · configure · migrate · analyze
- **domain (scope'tan türetilir, prose'dan DEĞİL):** api · frontend · cli/terminal · core · data · security · i18n · a11y · devops/ci · docs · agents-catalog …
Capability-matrix doğal-2D olur: agent = {work-type'lar × domain'ler} yetkinlik-hücreleri.
Artı: 443-doğal-deney-sınıfı ÖLÜR (domain scope'tan gelir, başlıktaki agent-adı prose'da kalır);
"api-refactor'u" = (refactor × api) net-adreslenir; security/i18n domain-olarak her work-type'la birleşir
(bugünkü "security intent'i mi domain'i mi" ikilemi biter); öğrenme 2D-kırılımda biriktirir.
Eksi: göç-maliyeti en yüksek — manifest-şeması + doğrulayıcı + öğrenme-anahtarı birlikte değişir
(karar-4 doğrudan-kesim bunu zaten göze aldı).

### Seçenek-C — DELIVERABLE-FIRST: filesWrite-tipinden sınıflandır (code-src/code-test/doc/config/workflow/manifest…)
Artı: en güçlü yapısal-sinyal (probe'lar kanıtladı — davranışsal veri yalan söylemez).
Eksi: "neden"i kaybeder (aynı dosyaya fix ve feature ve refactor aynı görünür) — TEK BAŞINA yetmez.
**Öneri: C'yi B'nin domain/deliverable KANIT-KAYNAĞI yapmak** (eksen değil, sinyal).

## 4 · TEST-SAHİPLİĞİ — **ALPEREN-KARARI (2026-07-14): test-engineer DİRİLMEYECEK**

Gerekçe (Alperen): "test çok kapsayıcı olur ve yine tüm işlere atanırsa tadımız kaçar; her agent
zaten işi gereği test yazabilmeli; sadece-test-yazma işi çalıştırma olasılığı çok düşük — 450 sprintte
neredeyse hiç yapmadık. Test kelimesinden çıkarım NO."

**V3-tasarım-sonuçları (karar-uyumlu model):**
1. **`test` work-type DEĞİLDİR** — work-type listesi 8'e iner: build · fix · refactor · document ·
   review · configure · migrate · analyze. Test-yazımı her build/fix/refactor'un DoD-parçasıdır
   (quality-bar "tests ship with code" zaten böyle).
2. **Test-yazımı = EVRENSEL-capability:** capability-matrix'te her Write-yetkili agent, KENDİ
   domain'lerinde test-authoring yetkinliği taşır. Sahiplik-değişmezi böylece ihlalsiz sağlanır —
   tek-sahip yerine domain-sahibi-sahipliği.
3. **Test-ağırlıklı görev DOMAIN'iyle yönlenir:** "coordinator için hermetik testler" → domain=core/
   orchestra'nın sahibine (work-type=build). test-mıknatısı YAPISAL olarak doğamaz — 'test' kelimesi
   hiçbir sınıflandırma-çıkarımına girmez (kelime-çıkarım yasağı); test-dominance (testWriteRatio)
   yalnız doğrulayıcı-ATTRİBÜTÜ olarak kalır (Write-yetki + DoD-kontrolü), rota-sinyali değil.
4. Eski TEST_OWNERSHIP+8 / ciGuardian-test-domain+3 / suppressRefactorerTestCatchAll yamaları V3'te
   İZ BIRAKMADAN ölür — yamaların kapattığı delik (sahipsiz-testing) modelden kalkıyor.

## 4b · 🔒 VEKTÖREL-3D EŞLEŞME — ALPEREN-DİREKTİFİ (2026-07-14, bağlayıcı yapı-kararı)

> "Agent seçiminde aslında vektörel düşünmeliyiz. Hem sayısal hem konumsal hem içerik — 3 boyuttan
> agent-skill-persona uyumunu deterministik VE ai olarak yakalamalıyız. Buradaki yapı kesinlikle böyle olmalı."

**Model: görev = requirement-VEKTÖRÜ, agent+skill+persona = capability-VEKTÖRÜ; eşleşme = 3-eksenli
vektör-uyumu, hibrit (deterministik + AI) hesaplanır.**

| Eksen | Görev-tarafı (requirement) | Agent/skill/persona-tarafı (capability) | Hesap-tarzı |
|---|---|---|---|
| **SAYISAL** | complexity/size · dosya/modül-sayısı · maliyet/effort-sınıfı | outcome-stats (work-type×domain-hücresinde başarı) · kapasite · model-tier-uyumu | deterministik (öğrenme-döngüsü K4-onarımıyla beslenir) |
| **KONUMSAL** | scope/filesWrite → domain · yüzey · deliverable-tipi (eski Seçenek-C burada yaşar) | sahip-olunan domain'ler/yüzeyler · Write-yetkisi/rol · dosya-tipi-yetkinliği | deterministik (yapısal veri — yalan söylemez; 443-doğal-deney-sınıfını öldüren eksen) |
| **İÇERİK** | work-type[8] + görevin anlamsal-özü (LLM üretir) | persona-uzmanlığı (PROMPT.md core) · guidance-slice'lar · skill-içeriği | **AI** (LLM-atama karar-1; anlamsal-uyum) |

**Eşleşme-hattı (taslak — spec'te detaylanacak):**
1. Deterministik ELEME: konumsal-kesişim (yetki yoksa aday değil — bugünkü write-denied HARD-exclude'un genellemesi).
2. AI İÇERİK-UYUMU: LLM, requirement-vektörünü üretir ve elenmemiş-adaylar içinden içerik-uyumunu skorlar (agent+skill+persona-slice BİRLİKTE — bugünkü "skill'ler agent'tan önce ayrı-seçim" tuhaflığı ölür).
3. Deterministik DOĞRULAYICI: capability∩requirement + anti-temp + sahiplik-değişmezi + yetki (LLM-çıktısı kanıtsız geçemez).
4. SAYISAL sıralama: outcome-öğrenme hücre-bazında (work-type×domain×agent) — kalibre, hayaletsiz.
5. Eşitlik/kararsızlık → **Brain-eskalasyonu** (karar-5).

**Taksonomiye izdüşümü:** vektör-modeli yapılandırılmış-eksen-sözlüğü GEREKTİRİR → Seçenek-B
(work-type[8] × domain) içerik+konumsal eksenlerin sözlüğü olarak vektör-modelinin İÇİNE oturur;
A (tek-eksen onarım) vektör-direktifiyle çelişir, C zaten konumsal-eksende içerildi.

## 5 · ÖNERİ-ÖZETİ (güncel karar-durumu)
1. **Taksonomi = Seçenek-B** (work-type[8]×domain; C yapısal-kanıt-kaynağı olarak içinde) — **Alperen-kararı BEKLİYOR (A/B/C)**.
2. **Sahiplik-değişmezi doğrulayıcı-lint'i** (sahipsiz work-type = catalog-hatası, CI'da yakalanır).
3. ~~test-engineer~~ **RED (Alperen)** → test = evrensel-capability + domain-yönlendirmesi (§4-modeli).
4. work-type'ı LLM üretir + yapısal-kanıt (scope/deliverable) doğrulayıcıda çapraz-kontrol;
   çelişkide karar-5: Brain-eskalasyonu.
