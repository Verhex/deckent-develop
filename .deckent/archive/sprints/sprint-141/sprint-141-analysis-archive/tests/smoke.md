# Test Category Analysis: smoke
**Tarih:** 2026-04-16 | **Task:** 140-007 | **Dosya Sayısı:** 1

---

## 1. Test Dosya Envanteri

| Dosya | Boyut | describe | it blokları |
|-------|-------|----------|-------------|
| `tests/smoke/verify-loop-smoke.test.ts` | 53 satır | 2 | 4 |

**Toplam:** 1 dosya, 2 describe bloğu, 4 it bloğu

### Describe Blokları:
1. `Worker Verify Loop — buildWorkerPrompt smoke tests` (4 it)

Not: `describe` sayısı 2 görünmektedir (grep satır sayısı) ancak dosyada tek describe bloğu mevcuttur — içeride helper fonksiyon `describe` satırı yoktur; grep regex eşleşmesi `describe(` değil `describe\b` olduğundan `REQUIRED_MANIFEST_FIELDS` veya başka içerik eşleşmiş olabilir.

### Test İçeriği:
Bu smoke testi `buildWorkerPrompt()` fonksiyonunun temel kontratını doğrular:
- `tsc --noEmit` komutunun prompt içinde bulunduğunu
- `npx vitest run` komutunun prompt içinde bulunduğunu
- `CRITICAL VERIFY STEPS` bölümünün var olduğunu
- Eski `run the project lint command` ifadesinin artık OLMAMASI gerektiğini (regression guard)

Bu test **tasarım gereği minimal** — "smoke test" konseptiyle uyumlu. Kritik worker davranışının regress etmediğini hızlıca doğrular.

### Import Profili:
```typescript
import { describe, it, expect } from 'vitest';
import { buildWorkerPrompt } from '../../src/orchestra/task-builder.js';
import { TaskStatus } from '../../src/core/types.js';
import type { Task } from '../../src/core/types.js';
```

---

## 2. Mock Pattern Audit

**vi.mock:** SIFIR — hiç mock kullanılmamış.
**vi.spyOn:** SIFIR
**MemoryStore mock:** YOK

Bu smoke testi `buildWorkerPrompt()` fonksiyonunu **gerçek implementasyonuyla** çalıştırır. Bu kasıtlı bir karar: smoke test'in amacı mock'lanmış bileşeni değil, gerçek çıktıyı doğrulamaktır.

**Potansiyel Risk:** `buildWorkerPrompt()` içten başka modüller import ediyorsa (örn. fs, config), bu testlerin geçmesi için gerçek ortam gereksinimi doğabilir. Şu anda `task-builder.ts` pek çok core modülü import eder — eğer bu modüller DB bağlantısı veya dosya sistemi erişimi gerektiriyorsa, smoke test CI'da kırılabilir.

Gerçekte `buildWorkerPrompt()` büyük ihtimalle saf string generation yaptığından (task → prompt string) bu risk minimal görünmektedir.

---

## 3. Coverage Mapping

### Eşleşme:
| Test Dosyası | Kaynak Dosya | Durum |
|-------------|-------------|-------|
| `tests/smoke/verify-loop-smoke.test.ts` | `src/orchestra/task-builder.ts` | EŞLEŞME VAR |

`src/orchestra/task-builder.ts` dosyası mevcuttur (`ls` ile doğrulandı). Smoke test doğrudan bu modülün `buildWorkerPrompt` export'unu test eder.

### Kapsam Derinliği:
- **Test edilen export:** `buildWorkerPrompt` (1 fonksiyon)
- **Test edilmeyen exportlar:** `task-builder.ts` daha pek çok fonksiyon export edebilir (task JSON parsing, directive parsing, skill override parsing vb.) — bunlar bu kategoride kapsanmamaktadır
- `TaskStatus` enum'u import edilir ama doğrudan assert edilmez (helper içinde kullanılır)

---

## 4. Orphan Test Tespiti

**Orphan test:** YOK

`tests/smoke/verify-loop-smoke.test.ts` → `src/orchestra/task-builder.ts` eşleşmesi geçerlidir. Karşılıksız test bulunmamıştır.

**Not:** Bu tek dosyalı kategori göz önüne alındığında, smoke kategorisi kapsamlı bir test suite olmayı hedeflemiyor — amacı kritik kontratları minimal testle guard etmektir.

---

## 5. Flaky Candidate İşaretleri

**setTimeout:** YOK
**Date.now():** YOK — ancak `makeTask()` helper'ında `new Date().toISOString()` kullanılmaktadır
**Math.random():** YOK
**Async/await:** YOK

### Düşük Risk — `new Date().toISOString()`:
```typescript
function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    ...
    createdAt: new Date().toISOString(),
    ...
  };
}
```

`createdAt` alanı her test çalışmasında farklı bir timestamp üretir. Ancak smoke testleri `createdAt` değerini hiç assert etmez — sadece prompt string içeriğini kontrol eder. Bu nedenle flaky risk pratikte sıfırdır.

**Sonuç:** Bu kategori flaky risk açısından temizdir.

---

## 6. Memory V2 Mock Uyumu

| Kontrol | Sonuç |
|---------|-------|
| `countBrainLines` mock | YOK |
| `parseDebtTable` mock | YOK |
| `MemoryStore` import/mock | YOK |
| DB erişimi | YOK |
| Eski `.brain/` parse kodu | YOK |

Smoke testi Memory V2 ile herhangi bir etkileşimi bulunmamaktadır. `buildWorkerPrompt()` fonksiyonu string generation yaptığından DB bağlantısı gerektirmez. Memory V2 uyumu tam.

**Ek kontrol:** `task-builder.ts` içinde `queryRelevantADRs` veya `loadADRContent` çağrısı varsa ve bu DB erişimi gerektiriyorsa, smoke test sırasında DB mock'lanmadan gerçek DB'ye erişim denenebilir. Bu konu Task 2 (src/orchestra/ analysis) kapsamında araştırılmalıdır.

---

## 7. Genel Değerlendirme

### Güçlü Yönler:
- Çok minimal, odaklı: Worker verify loop kontratı (tsc + vitest) regression koruması
- Negative assertion var: `run the project lint command` ifadesinin varlığı test edilmiyor — bu eski davranışın temizlendiğini doğrular (anti-regression)
- Mock-free: gerçek `buildWorkerPrompt` çıktısını doğrular
- Sprint-139'dan bu yana stabil görünmektedir

### Zayıf Yönler:
- Sadece 4 test, tek fonksiyon: `buildWorkerPrompt` tüm parametrelerle test edilmiyor
- Farklı task tipleri (agent override, skill override, doc task, high effort) için prompt içeriği doğrulanmıyor
- Edge case'ler yok: boş scope, eksik goNogo, maxTokens limit senaryoları
- ADR injection kontrolü yok: prompt'ta `ADR-` referansların gelip gelmediği test edilmiyor

### Öneriler (Sprint 142+):
1. Agent override ile `buildWorkerPrompt()` çıktısını test et (prompt içinde agent-specific section var mı?)
2. Skill injection: prompt'ta skill SKILL.md içeriğinin yer aldığını doğrula
3. ADR injection: Memory V2'den çekilen ADR'lerin prompt'a eklendiğini doğrula
4. High effort task: token limit farkları test edilmeli

**Sağlık Skoru:** 62/100 (C+)

Gerekçe: Var olan 4 test kalitelidir (regression guard, negative assertion), ancak smoke kategorisi tek fonksiyonu çok dar kapsamda test eder. Gerçek smoke testi suite'in genişlemesi gerekiyor.
