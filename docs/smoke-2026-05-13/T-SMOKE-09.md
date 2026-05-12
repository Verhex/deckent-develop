# deckent_audit — MCP Tool Referansı

## Özet

`deckent_audit`, Deckent'in **Brain Self-Audit Gate** mekanizmasını tetikleyen MCP aracıdır. Bir sprint sonunda kod kalitesini ve dürüstlük koşullarını dört bağımsız boyut üzerinden kontrol eder; sonucu `.deckent/{sprintId}-gate.json` dosyasına yazar ve MCP response olarak döndürür. Salt okunur bir araçtır — kaynak kodu ya da sprint durumunu değiştirmez.

---

## Parametreler

| Parametre | Tip    | Zorunlu | Açıklama                                    |
|-----------|--------|---------|---------------------------------------------|
| `sprintId`| string | Evet    | Denetlenecek sprint kimliği (ör. `sprint-150`) |

---

## Brain Self-Audit Gate Nedir?

Brain Self-Audit Gate, Deckent'in sprint sonu kalite güvencesi sürecidir. Amaç; çalışanların (worker'ların) bıraktığı sonuçların gerçekten çalışır durumda olduğunu ve sprint öncesi taban çizgisine göre regresyon içermediğini doğrulamaktır. Gate mekanizması dört boyutu sırayla çalıştırır ve **herhangi birinde başarısızlık olursa** genel karar `GATE_FAILURE` olur.

---

## Dört Denetim Boyutu

### 1. TypeScript Derleme — `tsc`

`npx tsc --noEmit` komutunu 30 saniyelik zaman aşımıyla çalıştırır. Sıfır çıkış kodu `PASS`, sıfır dışı herhangi bir kod `FAIL` anlamına gelir. Hata durumunda `error TS` deseniyle eşleşen satırlar (en fazla 20 adet) toplanarak `gate.json` içindeki `tsc.errors` dizisine eklenir. Derleme hataları sprint çıktısındaki type güvenlik ihlallerini ortaya koyar.

### 2. Test Paketi — `vitest`

`npx vitest run --reporter=basic` komutunu 120 saniyelik zaman aşımıyla çalıştırır. Başarısız test sayısı sıfırsa `PASS`, değilse `FAIL`. En önemli özelliği **delta hesaplamadır**: sprint öncesinde `.deckent/{sprintId}-baseline.json` dosyasına kaydedilen taban çizgisiyle karşılaştırma yapar; böylece yalnızca yeni eklenen başarısızlıklar raporlanır. `vitest.delta` alanı dosya sayısı, geçen/başarısız/atlanan test sayısı farkını gösterir.

### 3. Dürüstlük Denetimi — `honesty`

Worker'ların `.tasks/*.result` dosyalarını tarar ve notları dürüstlük tetikleyicisi kalıplarıyla karşılaştırır. Test başarısızlık oranını taban çizgisiyle kıyaslar; oranın aşılması halinde ilgili görev kimliğini `flaggedTasks` listesine ekler. `violations > 0` ise gate başarısız olur. Bu boyut; worker'ların gerçekleştirmedikleri işi `DONE` olarak bildirmesini ya da test sonuçlarını asılsız biçimde raporlamasını önler.

### 4. Gözlemlenebilirlik — `observability`

`.deckent/metrics.jsonl` dosyasının varlığını ve boş olmayan satır sayısını kontrol eder. Bu boyut yalnızca `WARNING` üretir; eksik metrics dosyası `GATE_FAILURE`'a yol açmaz. Amaç, token kullanım verileri ve performans metriklerinin toplanıp toplanmadığını izlemektir.

---

## Genel Karar Mantığı

```
GATE_FAILURE  ←  tsc FAIL  OR  vitest FAIL  OR  honesty violations > 0
PASS          ←  tüm üç boyut başarılı  (observability WARNING tolere edilir)
```

---

## gate.json Çıktı Formatı

Araç sonucu `.deckent/{sprintId}-gate.json` dosyasına yazar. Örnek yapı:

```json
{
  "tsc": {
    "status": "PASS",
    "errors": []
  },
  "vitest": {
    "status": "PASS",
    "delta": {
      "files": 0,
      "pass": 0,
      "fail": 0,
      "skipped": 0
    }
  },
  "honesty": {
    "violations": 0,
    "flaggedTasks": []
  },
  "observability": {
    "metricsJsonlExists": true,
    "lineCount": 1824
  },
  "overallGate": "PASS"
}
```

**GATE_FAILURE örneği** (vitest regresyonu):

```json
{
  "tsc": { "status": "PASS", "errors": [] },
  "vitest": {
    "status": "FAIL",
    "delta": { "files": 2, "pass": 0, "fail": 5, "skipped": 0 }
  },
  "honesty": { "violations": 0, "flaggedTasks": [] },
  "observability": { "metricsJsonlExists": true, "lineCount": 432 },
  "overallGate": "GATE_FAILURE"
}
```

---

## Ne Zaman Kullanılır?

- Sprint tamamlandıktan sonra, `deckent_review` öncesinde kalite doğrulaması gerektiğinde.
- CI/CD pipeline'ında otomatik kalite kapısı olarak.
- Şüpheli bir `DONE` değerlendirmesinin arkasında gerçek test başarısı olup olmadığını kontrol ederken.
- Derleme hatası olmaksızın `GO_WITH_TECH_DEBT` ile biten sprintlerde son onay adımı olarak.

---

## MCP Kullanım Örneği

```json
{
  "tool": "deckent_audit",
  "arguments": {
    "sprintId": "sprint-155"
  }
}
```

Araç idempotent'tir — aynı `sprintId` ile defalarca çağrılabilir, gate.json üzerine yazılır ancak kaynak kodu etkilenmez.

---

## İlgili Araçlar

| Araç | İlişki |
|------|--------|
| `deckent_review` | GO/NO-GO kararı — audit gate'i dolaylı olarak çalıştırabilir |
| `deckent_status` | Aktif sprint durumu; audit tamamlandıktan sonra güncel kalır |
| `deckent_retro` | Audit gate sonuçları retro raporuna işlenir |
