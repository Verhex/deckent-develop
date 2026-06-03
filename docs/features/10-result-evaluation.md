# Sonuç Değerlendirme — GO / NO_GO / GO_WITH_TECH_DEBT

> Her worker'ın çıktısını 3 kademeli bir karar motoruyla ölçen akıllı değerlendirici: tamamlanan işi kabul et, borcu etiketle, başarısızı geri al.

## Ne işe yarar?

- Worker'ın `.result` dosyasını okur; **Brain nihai kararı** verir (worker öz-değerlendirmesi yalnızca ipucu).
- Üç karar üretir: **DONE** (tam başarı) · **GO_WITH_TECH_DEBT** (çalışıyor, eksik var) · **NO_GO** (kritik başarısızlık).
- **Rubric skoru** hesaplar: doğruluk %40 · test kapsamı %25 · kapsam uyumu %20 · dokümantasyon %15.
- **CODE_VERIFIED_DONE** disk doğrulaması: worker NO_GO yazsa bile dosyalar fiziksel olarak diskte varsa GWT'ye kurtarabilir.
- Doc task'larını otomatik algılar (kaynak dizini dışı) ve coverage kontrolünü atlar.
- FIX fazında başarısız task'lar için aggregate verdict hesaplar: orijinal + fix kayıtlarının en yüksek sonucunu alır.

## Neden önemli?

- Worker'ın kendi kendini "DONE" ilan etmesi yetmez; **bağımsız kriter motoru** kalite güvencesi sağlar.
- Kısmi iş de değerlendirmeye girer — kırık sprint yerine GO_WITH_TECH_DEBT ile ilerleme kaydedilir.
- Sahte NO_GO'ları (Bash ortam kısıtı, timeout) otomatik uzlaştırır → false alarm'ları bastırır.

## Nasıl çalışır?

```
Worker → .result dosyası → evaluateWithRubric()
         ↓
   1. selfAssessment NO_GO?  → reconcile (git diff kontrol) → NO_GO
   2. testsPassed false?      → NO_GO  (Bash yoksa → GO_WITH_TECH_DEBT)
   3. Doc task?               → DONE   (coverage atlanır)
   4. Rubric skorla:
        correctness ≥60  + test_coverage ≥50  + scope_compliance ≥80
   5. Tüm eşikler aşıldı?    → DONE
      Bir eşik kaçırıldı?     → GO_WITH_TECH_DEBT
   6. CODE_VERIFIED_DONE disk doğrulaması (NO_GO ise):
        dosyalar diskte var + kanıt uyuştu → GO_WITH_TECH_DEBT kurtarması
```

## Komut / Örnek

```bash
# Sprint sonrası sprint review ile değerlendirme sonuçlarına bak
deckent review

# Örnek çıktı
# Task 225-001  → DONE        (correctness:90 coverage:82 scope:100)
# Task 225-003  → GO_WITH_TECH_DEBT  (test_coverage:45 < threshold:50)
# Task 225-007  → NO_GO       (testsPassed: false; tsc errors)
#
# Verdict: GO_WITH_TECH_DEBT (1 task below threshold, 1 critical failure)
```

```bash
# Belirli task sonucunu ham JSON olarak oku
cat .tasks/task-225-001.result | jq '{selfAssessment, rubricScores, evaluationDecision}'
```

## Durum

- Olgunluk: ✅ canlı — `evaluateWithRubric()` tüm sprint fazlarında aktif (EVALUATE + FIX)
- Not: `evaluateResult()` eski API, `@deprecated` — yalnızca CLI `finalize` komutu kullanır
- İlgili: ADR-079 · ADR-070 · `src/orchestra/result-evaluator.ts`
