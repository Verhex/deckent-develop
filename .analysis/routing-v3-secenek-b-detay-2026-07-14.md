# ROUTING-ENGINE-V3 — SEÇENEK-B DETAYI: vektör-modeli + yapılandırılmış-sözlük + customization
> Alperen-talebi (2026-07-14): "B'yi onaylamak için detaylarını ver — içeriği ne, vektör-model,
> yapılandırılmış sözlük; customize edilebilir olmalı; milyonlarca kullanıcı + enterprise; MVP değil, always god-level."
> Bağlayıcı-çerçeve: 🔒 vektörel-3D direktifi (sayısal·konumsal·içerik; deterministik+AI hibrit) ·
> karar-1 (LLM-atama+doğrulayıcı) · karar-2 (capability-matrix=agent.json-v3 SSOT) · karar-4 (doğrudan-kesim) ·
> karar-5 (Brain-eskalasyonu) · test-kararı (work-type değil, evrensel-capability).

## §1 · YAPILANDIRILMIŞ SÖZLÜK (vocabulary) — kapalı-çekirdek + açık-uzantı

### 1a · WORK-TYPE çekirdeği — KAPALI-küme (8), kernel-semantiği
Kapalı olmasının nedeni: öğrenme-hücreleri ve doğrulayıcı-lint'leri stabil-anlam ister; açık work-type
= yeni catch-all tohumu. Customization SUBTYPE ile (aşağıda).

| work-type | Tanım (tek-cümle sözleşme) | DoD-imzası | Örnek |
|---|---|---|---|
| build | var-olmayan davranışı inşa eder | yeni-davranış + testleri | "retry mekanizması ekle" |
| fix | bozuk-davranışı tanıya-dayalı onarır | repro→fix→regression-pin | "EISDIR çökmesini düzelt" |
| refactor | davranışı DEĞİŞTİRMEDEN yapıyı iyileştirir | davranış-parite-kanıtı | "config.ts'i böl" |
| document | insan-okur bilgi üretir/günceller | doc-çıktısı + doğruluk | "sync flag'lerini belgele" |
| review | mevcut-işi inceler, hüküm üretir; KOD YAZMAZ | bulgu-raporu/verdict | "PR'ı güvenlik-merceğiyle incele" |
| configure | davranışı kod-yazmadan ayarla değiştirir | config-diff + etki-kanıtı | "CI cache stratejisini ayarla" |
| migrate | veri/şema/platform taşır | ileri+geri-yol + bütünlük-kanıtı | "SQLite şema-v2 göçü" |
| analyze | soruyu kanıtla cevaplar; teslimat=bilgi | kanıt-dosyası/rapor | "misroute-korpusunu çıkar" |

- **SUBTYPE-uzantısı (customization):** `review:compliance`, `configure:iac`, `analyze:cost` …
  Serbest-metin subtype; öğrenme ve lint PARENT'ta toplanır (rollup) → enterprise özelleştirir,
  çekirdek-semantik bozulmaz.
- **test work-type DEĞİL** (Alperen-kararı): test-yazımı build/fix/refactor DoD'sinin parçası;
  test-dominance yalnız doğrulayıcı-attribute'u.

### 1b · DOMAIN kaydı — AÇIK-küme, 3-katman registry (0-hardcode)
Domain tanımı (şema):
```jsonc
{
  "id": "i18n",
  "aliases": ["l10n", "localization", "yerelleştirme"],
  "pathPatterns": ["src/cli/helpers/messages*", "**/locales/**"],
  "stackMarkers": ["i18next", "formatjs"],            // package/stack kanıtı
  "description": "User-facing message catalogs and translation flows", // LLM-içerik-ekseni için
  "surfaces": ["cli"],                                  // opsiyonel yüzey-bağı
  "exclusiveRoles": []                                  // opsiyonel policy-kancası
}
```
Üç katman (mevcut 3-layer config-merge deseniyle birebir):
1. **builtin-base** (üründen gelir): api · frontend · cli/terminal · core/runtime · orchestration ·
   data · security · i18n · a11y · devops/ci · docs · build/release · agents-catalog · connectors/messaging …
2. **project-derived (otomatik):** `deckent analyze` stack-tespiti + scope-haritasından türetilir
   (monorepo-paketleri, dizin-kökleri) — sıfır-konfigürasyonla her projede anlamlı-domain'ler.
3. **user/org-defined:** `.deckent/routing/vocabulary.json` (proje) + org-overlay (enterprise paylaşımlı).
Zod-şema + `deckent doctor` doğrulaması; çakışan-pattern/ölü-domain uyarısı. Kod-içi domain-tablosu KALMAZ
(bugünkü ~25 hardcoded tablonun domain-yarısı registry'ye göçer — kanun-10).

### 1c · DELIVERABLE-tipleri (konumsal-kanıt sözlüğü, kapalı)
code-src · code-test · doc · config · workflow(ci) · manifest · script · migration · asset.
filesWrite'tan deterministik türetilir; eski Seçenek-C burada yaşar.

## §2 · VEKTÖR-MODELİ (şemalar)

### 2a · RequirementVector (görev-tarafı; plan-anında üretilir)
```jsonc
{
  "content":    { "workType": "build", "subtype": null,
                  "summary": "LLM tek-cümle iş-özü",
                  "semanticTags": ["retry", "backoff", "connector"] },     // LLM üretir
  "positional": { "domains": [{ "id": "connectors/messaging", "weight": 0.8, "evidence": "scope" }],
                  "deliverables": [{ "type": "code-src", "ratio": 0.6 }, { "type": "code-test", "ratio": 0.4 }],
                  "surfaces": [], "needsWrite": true, "language": "tr|en|auto" },
  "numerical":  { "estimatedSize": "small", "fileCount": 2, "moduleCount": 1,
                  "effortClass": "normal", "riskClass": "low" }
}
```
Üretim-hibrit: positional+numerical DETERMİNİSTİK (scope/dosya-analizi — yalan söylemez);
content LLM (karar-1) + yapısal-çapraz-kontrol (LLM "document" derse ama deliverable %100 code-src →
çelişki → Brain'e, karar-5).

### 2b · CapabilityVector (agent.json-v3 `capabilities` — SSOT, karar-2)
```jsonc
{
  "capabilitiesVersion": 3,
  "content":    { "workTypes": [{ "type": "build", "proficiency": "primary" },      // primary|secondary|able|never
                                { "type": "refactor", "proficiency": "able" },
                                { "type": "review", "proficiency": "never" }],
                  "expertise": ["feature construction", "pattern-following"],        // LLM-eşleşme metni
                  "personaSlices": ["implementation", "bugfix", "default"] },        // guidance-slice envanteri
  "positional": { "domains": [{ "id": "*", "proficiency": "able" }],                 // uzman-agent'ta açık-liste
                  "surfaces": [], "writeAuthority": true, "role": "implementer",
                  "deliverables": ["code-src", "code-test"] },
  "numerical":  { "preferredModel": "sonnet", "costTier": "standard", "maxParallel": null }
  // outcome-stats MANİFESTE YAZILMAZ — sidecar'da hücre-bazlı yaşar (aşağıda §4-öğrenme)
}
```
- **Skill'ler aynı şemanın skill-profilini taşır** (workTypes+domains+expertise) → agent+skill+persona-slice
  TEK eşleşme-uzayında (vektörel-direktif: "agent-skill-persona uyumu birlikte").
- Test-yazımı: `writeAuthority=true` olan her agent'ta örtük code-test yetkinliği (Alperen-kararı) —
  manifest'e ayrıca yazılmaz, doğrulayıcı bilir.
- V2-`activation.rules` ölür; geriye-uyum: `deckent sync` v2-manifest'i v3-capabilities'e migrate eder
  (üç-yönlü prompt-sync emsali).

### 2c · Öğrenme-hücresi (sayısal-eksenin hafızası)
`cell = (workType × domain × agentId)` → { uses, successRate, qualityAvg, lastSprint }.
Sidecar: `.deckent/stats/routing-cells.json` (tenant-scoped). K4-onarımı: görev-BAŞINA DNA
(tasks[0]-bug'ı ölür), hayalet-girdiler kaynağında reddedilir (içeriksiz-skill hücre-yazamaz).

## §3 · EŞLEŞME-HATTI (5-aşama; vektörel-direktifin işletimi)

1. **ELEME (deterministik, O(katalog)):** needsWrite∧¬writeAuthority → elenir · role-çelişkisi
   (review-işi↔implementer-only) → elenir · domain-exclusive-policy → elenir · workType=never → elenir.
   (Bugünkü write-denied HARD-exclude'un genellemesi; bonus-delme mekaniği tamamen ölür.)
2. **AI İÇERİK-UYUMU:** LLM plan-anında BATCH (sprint-başına 1 çağrı-amortisman): her görev için
   requirement.content'i üretir + kalan-adayların content-vektörleriyle uyum-skoru (0-1) ve tek-cümle
   gerekçe döner. Büyük-katalog (enterprise, yüzlerce custom-agent) için opsiyonel embedding-önfiltre
   (top-K aday LLM'e gider) — flag'li, default kapasiteye-göre.
3. **DOĞRULAYICI (deterministik; LLM kanıtsız geçemez):** kesişim-testleri (content-uyumu ↔ positional-kanıt
   çelişkisi) · anti-temp değişmezi · sahiplik-değişmezi (eşleşen-aday-yoksa = catalog-hatası, sessiz-fallback YOK)
   · policy-pack kuralları · deliverable⊆agent.deliverables.
4. **SAYISAL SIRALAMA:** doğrulanan-adaylar cell-stats + numerical-uyum (cost-tier, model-tercihi,
   size↔kapasite) ile sıralanır. Skor-formülü AĞIRLIK-KONFİGÜRLÜ (default: content 0.5 · positional 0.3 ·
   numerical 0.2; org/proje override).
5. **KARAR + ÖYKÜ:** tepe-aday açık-farkla önde → atama. Eşitlik VEYA kalibre-güven tabanın altında →
   **Brain-eskalasyonu** (karar-5: "kararsızlıkta atama Brain'den"). Her karar insan-okur "neden"-öyküsü +
   jurnal-kaydı üretir (born-622 jurnalinin V3-hali; WORKER-LIVE-LOG/terminal-UI tüketicisine hazır).

## §4 · CUSTOMIZATION-YÜZEYİ (milyon-kullanıcı + enterprise; kanun-1/2)

| Yüzey | Mekanizma |
|---|---|
| Sözlük | domain-registry 3-katman (builtin < org < proje); work-type SUBTYPE'ları serbest |
| Ağırlıklar/eşikler | routing-config: eksen-ağırlıkları, güven-tabanı, top-K, stage-flag'leri — 3-katman merge |
| Custom-agent sözleşmesi | agent.json-v3 capabilities şeması + `deckent agent lint`: şema-doğrulama · erişilemez-agent uyarısı ("hiçbir requirement-şekli sana ulaşamaz") · çakışma-haritası ("X ile %90 örtüşüyorsun") — 66/100-eleştirisinin custom-agent-dayanıklılık cevabı |
| Policy-pack (enterprise) | org-seviye kural-paketi: "security-domain → yalnız role=reviewer+security" · "prod-config → çift-onay" · "PII-domain → yalnız onaylı-agent-listesi"; doğrulayıcı-aşamasında zorunlu |
| Governance-modu | AI-aşaması KAPATILABİLİR (uyum/maliyet): sistem dürüst-deterministik çalışır (eleme+positional+sayısal), güven "AI-siz" işaretlenir, eskalasyon-eşiği düşer — sessiz-degradasyon YOK (kanun-2 dürüst-hata ilkesi) |
| Çok-dillilik | içerik-ekseni LLM'de dil-bağımsız (TR-körlük sınıfı kökten ölür); registry alias'ları çok-dilli |
| Multi-tenant | vocabulary org-paylaşımlı · öğrenme-hücreleri tenant-scoped · policy-pack org-SSOT |

## §5 · ÖLÇEK & PERFORMANS
- Aşama-1/3/4 saf-deterministik, katalog-boyutunda lineer; milyon-proje = proje-başına yerel-hesap.
- LLM-maliyeti sprint-başına amortize (plan-çağrısının içinde/yanında tek batch) — görev-başına değil.
- Embedding-önfiltre yalnız büyük-katalogda devreye girer (flag); index artımlı.
- Karar-öyküsü + jurnal append-only; dashboard/terminal SSE-tüketimine hazır.

## §6 · DOĞRUDAN-KESİM PLANI (karar-4) + korunanlar
- Ölenler: intent-classifier keyword-yarışı · 12-kova · GENERIC-demotion · bonus-ormanı (10+ bonus) ·
  4-ölü-flag · BUILTIN_IMPLEMENTATION_INTENT_RULES · TEST_OWNERSHIP/ciGuardian/suppress-yamaları ·
  skills-önce-agent-sonra sırası · AGENT_FALLBACK_CHAIN (yerine sahiplik-değişmezi + Brain-eskalasyonu).
- Korunan-değişmezler (V3'e taşınır, testle pinlenir): anti-temp · honest-empty · floor-mıknatıs-değil
  (artık doğal: content-uyumu düşük genel-agent uzmanı ezemez) · karar-jurnali · deterministik-orchestration çekirdeği.
- Kabul-seti: 25-vaka misroute-korpusu + a6-sinav-korpusu + 443-doğal-deneyi + bugünkü 12-probe →
  V3-kabul-regresyonu (kesim-kanıtı: eski-yanlışlar yeni-doğru, eski-doğrular bozulmadı).
- Göç-araçları: v2→v3 manifest-migrator (`deckent sync` içinde) · vocabulary-bootstrap (`deckent analyze`).
