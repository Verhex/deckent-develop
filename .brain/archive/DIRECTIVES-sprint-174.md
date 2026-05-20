# DIRECTIVES — Sprint 174: Pazarlama AI Karar Motoru — Patron Pitch'i + Canva Kiti

## Spec Referansı (bağlayıcı kontrat)

`docs/superpowers/specs/2026-05-18-marketing-ai-pitch-design.md` — her worker kendi task bölümünü + bu spec'in §1 Dürüstlük Çerçevesi, §2 Kararlar, §3 Teslimatlar, §5 GO kriterlerini MUTLAKA okur.

## Goal

Proje köküne firma patronuna sunulacak tek `marketing-ai-pitch.md` (15 slide, Türkçe, satış/vizyon pitch'i) + `canva-kit/` (markalara aylık rapor için Canva Bulk-Create kiti) üret. Tek deckent sprint'i, DAG bağımlı (pitch → canva-kit). **Bu sprint kod YAZMAZ** — sadece yeni `.md`/`.csv` doküman dosyaları. Throwaway demo: sunum sonrası dosyalar silinecek, commit yok.

## Brain Planning Instructions

Mode: structured. `dependency_pipeline_enabled: true` (bu sprint geçici) → Kahn topolojik wave OTOMATİK. Max workers: 6. Provider: claude. Model: sonnet (dokümantasyon — memory kuralı). Agent: doc-writer. Skill: documentation-writer. Beklenen wave: W0={pitch} → W1={template-map} → W2={csv, howto} → W3={kit-README}. (174-001 = otomatik enjekte debt task, boş scope, sunumla alakasız — beklenen NO_GO/no-op, zararsız.)

## Worker Contract — DÜRÜSTLÜK BAĞLAYICI

- Her worker SADECE kendi `Files` dosyalarını yazar. Scope dışına yazma YASAK (ADR-037, auditor `git diff --stat` izler). **Kaynak kod/test DEĞİŞMEZ** (`git diff --stat src/ tests/` boş olmalı).
- **Dürüstlük kuralı (spec §1):** deckent bugün marketing yapmıyor; bu sistem deckent'in *inşa edip işletebileceği* yeni üründür. Her slide'da "Bugün gerçek olan" vs "İnşa edilecek (faz)" ayrımı net. Abartı / yanlış vaat / "deckent zaten yapıyor" ifadesi = NO_GO.
- **Otonomi tutarlılığı:** Sistem reklam hesabında SADECE "öner + tek-tık insan onayı" yapar. Hiçbir slide "tam otonom kampanya yönetimi" vaat etmez. Onay her zaman insanda.
- **Canva gerçeği:** Native `.canva` üretilemez. Çözüm = Canva Bulk Create (placeholder şablon + CSV + manuel tetik). Bu sınır dürüstçe yazılır, otomasyon "gelecek faz" olarak.
- Slide formatı: tek `# ` H1 + 6-14 satır presenter-ready içerik (dolu, placeholder DEĞİL), gerekirse tablo/diagram (ASCII/markdown). Türkçe. Fiyat/SLA rakamı UYDURULMAZ (slide 15 pilot çerçeve; net rakamı Alperen sonra girer → `{{...}}` placeholder bırak).
- Kod/test yok → `.result`: `coverage: null`, `selfAssessment`, `filesChanged`.

## GO/NO_GO Criteria

- **GO:** `marketing-ai-pitch.md` (15 slide, her biri tek H1, B-kapalı-döngü akışı) + `canva-kit/` 3 dosya mevcut; CSV başlıkları template-map ile birebir; otonomi her slide "öner+onay" tutarlı; "bugün vs inşa" ayrımı slide 5/8/9/11/14'te açık; `git diff --stat src/ tests/` boş.
- **GO_WITH_TECH_DEBT:** ≤2 slide dürüstlük-etiketi zayıf ama dosyalar tam + içerik dolu + abartı yok.
- **NO_GO:** Eksik dosya, placeholder içerik, abartı/yanlış vaat, tam-otonom vaadi, CSV↔map uyumsuz, veya kod/test değişti.

---

## Task 1: Pitch deck — marketing-ai-pitch.md (15 slide)

- Model: sonnet
- Effort: high
- Skills: documentation-writer
- Agent: doc-writer
- Files: marketing-ai-pitch.md
- Scope: ./

### Description

Spec §3.1'deki 15 slide outline'ını birebir üret (Kapak → Problem → Çözüm → Kapalı-döngü diagram → Veri kaynakları → 22 metrik tablo → Desen tespiti → Önerilen aksiyon → Tek-tık onay → WhatsApp trigger → Aylık Canva rapor → Ajans kaldıraç → Güven/guardrail → Yol haritası → Kapanış/CTA). B-omurga (Veri→İçgörü→Öneri→**Onay**→Uygula→Ölç). Slide 6: spec §3.2'deki 22 metrik tablo halinde. Dürüstlük kuralı bağlayıcı: slide 5/8/9/11/14'te "Bugün gerçek" vs "İnşa edilecek" etiketi; otonomi her yerde "öner+onay"; Canva sınırı slide 11'de dürüst. Fiyat/SLA = `{{pilot_fiyat}}` placeholder.

**Kanıt:** `grep -c '^# ' marketing-ai-pitch.md` → 15; `grep -ci "tam otonom\|fully autonomous" marketing-ai-pitch.md` → 0 (yasaklı vaat yok); slide 11'de "Bulk Create" + sınır ifadesi.

**Test:** Doc-only — slide sayısı + yasaklı-vaat-yok + dürüstlük-etiket grep kanıtı.

---

## Task 2: Canva template map — canva-kit/canva-bulk-template-map.md

- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Agent: doc-writer
- Files: canva-kit/canva-bulk-template-map.md
- Scope: canva-kit/
- Dependencies: ["174-002"]

### Description

Spec §3.3. `marketing-ai-pitch.md`'yi OKU (slide 6 metrik listesi + slide 11 aylık rapor formatı). Canva şablonu placeholder'larını metrik alanlarına eşle: `{{marka}}`, `{{donem}}`, `{{roas}}`, `{{cpc}}`, `{{cac}}`, `{{trafik_trend}}`, `{{aksiyon_onerileri}}` vb. — her placeholder ↔ hangi metrik/kaynak. Tablo formatı. CSV (Task 3) bu map'in başlık satırını birebir izleyecek, o yüzden placeholder isimleri kesin/tutarlı.

**Kanıt:** `test -f canva-kit/canva-bulk-template-map.md`; pitch slide 6 metrikleriyle placeholder seti tutarlı (atıf var).

**Test:** Doc-only — dosya mevcut + pitch metrik atfı.

---

## Task 3: Canva bulk CSV — canva-kit/canva-bulk-sample.csv

- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Agent: doc-writer
- Files: canva-kit/canva-bulk-sample.csv
- Scope: canva-kit/
- Dependencies: ["174-003"]

### Description

Spec §3.3. `canva-bulk-template-map.md`'yi OKU. Canva Bulk Create'in beklediği CSV: başlık satırı = template-map'teki placeholder isimleri **birebir** (örn. `marka,donem,roas,cpc,cac,trafik_trend,aksiyon_onerileri,...`). 2 örnek marka satırı (gerçekçi ama kurgu veri). Marka başı 1 satır → Canva 1 deck basar.

**Kanıt:** `head -1 canva-kit/canva-bulk-sample.csv` başlıkları template-map placeholder'larıyla eşleşir; ≥3 satır (başlık + 2 örnek).

**Test:** Doc-only — başlık↔map eşleşme + satır sayısı.

---

## Task 4: Aylık üretim rehberi — canva-kit/monthly-brand-report-howto.md

- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Agent: doc-writer
- Files: canva-kit/monthly-brand-report-howto.md
- Scope: canva-kit/
- Dependencies: ["174-002", "174-003"]

### Description

Spec §3.3. `marketing-ai-pitch.md` + `canva-bulk-template-map.md`'yi OKU. Aylık üretim akışı adım adım: (1) deckent çalıştır → marka verisi topla, (2) CSV üret (map şemasına göre), (3) Canva'da şablona Bulk Create ile CSV yükle, (4) marka-renkli deck → markaya teslim. Manuel adımları + sınırları (Canva API otomasyonu gelecek faz; bugün manuel tetik) DÜRÜSTÇE yaz. Abartı yok.

**Kanıt:** `test -f canva-kit/monthly-brand-report-howto.md`; 4 adım + "manuel/gelecek faz" dürüstlük ifadesi mevcut.

**Test:** Doc-only — dosya + adım + dürüstlük-sınır grep.

---

## Task 5: Kit index + tutarlılık — canva-kit/README.md

- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Agent: doc-writer
- Files: canva-kit/README.md
- Scope: canva-kit/
- Dependencies: ["174-002", "174-003", "174-004", "174-005"]

### Description

Spec §4 W3. `marketing-ai-pitch.md` + canva-kit/ 3 dosyayı OKU. Kit index'i yaz: 3 dosya ne işe yarar, kullanım sırası, pitch ile ilişki. **Tutarlılık denetimi (yaz):** CSV başlıkları ↔ template-map placeholder'ları birebir mi, pitch slide 6 metrikleri ↔ map alanları örtüşüyor mu, otonomi tutarlı mı — uyumsuzluk varsa README "Bilinen sapma" bölümünde dürüstçe listele (kod düzeltme YOK, sadece rapor).

**Kanıt:** `test -f canva-kit/README.md`; CSV↔map tutarlılık ifadesi + 4 dosyaya atıf.

**Test:** Doc-only — README mevcut + tutarlılık-denetim bölümü.
