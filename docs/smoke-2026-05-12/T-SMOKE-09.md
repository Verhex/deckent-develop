# ADR-008: Brain Merkezi Import — Tek Yönlü Bağımlılık

**ADR Durumu:** Kabul Edildi  
**Kapsam:** `src/orchestra/`, `src/core/`, `src/agents/`, `src/monitor/`

---

## Genel Bakış

ADR-008, Deckent'in modül katmanları arasındaki import bağımlılıklarını tek yönlü (unidirectional) olarak tanımlar. Kuralın özü şudur: **Brain (`src/orchestra/brain.ts`), tmux, auditor ve worker gibi diğer modülleri import eden TEK modüldür. Bu modüller brain'i import etmez.**

Bu kural, Node.js ESM ortamında tanımsız davranışlara yol açan döngüsel import'ların (circular imports) önlenmesi için tasarlanmıştır. Aynı zamanda Brain'in orkestratör rolünü mimaride net şekilde ifade eder: Brain koordine eder, diğerleri bağımsız çalışır.

---

## Katman Hiyerarşisi

Deckent'in modül katmanları aşağıdaki piramit yapısını izler:

```
┌─────────────────────────────┐
│         Brain               │  ← En üst katman: tek orkestratör
│   (orchestra/brain.ts)      │     diğer tüm katmanlara erişebilir
└────────────┬────────────────┘
             │ import eder ↓
┌─────────────────────────────┐
│         Orchestra           │  ← Sprint lifecycle, planner, router
│  (sprint-controller, tmux,  │     core'a erişebilir, brain'e erişemez
│   auditor, spawn-backend)   │
└────────────┬────────────────┘
             │ import eder ↓
┌─────────────────────────────┐
│           Core              │  ← Tipler, config, yardımcılar
│  (types, config, provider,  │     hiçbir üst katmanı import etmez
│   agent-pool, skill-pool)   │
└─────────────────────────────┘
```

**Katmanlar arası yasak akışlar:**
- `core/` → `orchestra/` içindeki herhangi bir modülü import edemez
- `orchestra/tmux.ts`, `orchestra/auditor.ts`, `agents/worker.ts` → `brain.ts`'i import edemez
- Yatay modüller (örn. `monitor/` ↔ `nervous/`) birbirini doğrudan import etmez; Brain üzerinden koordine olur

---

## Brain TEK İçe Aktarıcı Kuralı

`brain.ts` projenin Sprint 036'dan bu yana ince bir re-export katmanı (thin backward-compatibility layer) olarak tasarlanmıştır. Gerçek implementasyonlar ayrı alt modüllerde yaşar:

| Alt Modül | Sorumluluk |
|-----------|-----------|
| `sprint-controller.ts` | `runSprint`, pause/resume, cleanup, planning, spawning |
| `task-builder.ts` | Task oluşturma, scope çıkarma, directive parsing |
| `result-evaluator.ts` | `evaluateResult`, `isDocTask`, `waitForResults` |
| `debt-manager.ts` | Debt lifecycle, escalation, decay |
| `sprint-reporter.ts` | Retrospektif, sprint log, metrikler, doc güncellemeleri |
| `model-selector.ts` | Model çıkarımı ve seçimi |

`brain.ts` bu alt modülleri import ederek birleşik bir API yüzeyi sunar. CLI, MCP araçları ve API sunucusu yalnızca `brain.ts`'e bağımlıdır — alt modülleri doğrudan import etmez.

---

## Döngüsel Import Yasağı

Node.js ESM modül sisteminde döngüsel bağımlılıklar (A → B → A) nesne başlatma sırasında `undefined` referanslarına ve belirsiz davranışlara yol açar. ADR-008, bu tehlikeye karşı sıfır tolerans benimser.

**Yasaklanan örüntüler:**

```typescript
// ❌ YASAK: core/ modülü orchestra/'yı import edemiyor
// src/core/config.ts içinde:
import { runSprint } from '../orchestra/brain.js'; // ADR-008 ihlali

// ❌ YASAK: Worker brain'i import edemiyor
// src/agents/worker.ts içinde:
import { evaluateResult } from '../orchestra/brain.js'; // ADR-008 ihlali

// ✅ DOĞRU: Worker sadece core/ tiplerine erişir
// src/agents/worker.ts içinde:
import type { TaskFile } from '../core/types.js'; // core'dan tip almak serbesttir
```

**Pratik kontrol:**

```bash
grep -r "from.*brain" src/orchestra/tmux.ts src/monitor/auditor.ts src/agents/worker.ts
# Bu komut daima boş sonuç vermeli
```

---

## Layer 4 Runtime Enforcement

ADR-008 kuralı yalnızca kod incelemesine bırakılmamış; **`src/orchestra/authority-enforcer.ts`** modülü üzerinden çalışma zamanında (runtime) otomatik olarak denetlenir.

`checkAdr008()` fonksiyonu:
1. Değiştirilmiş dosyaların yolunu kontrol eder — yalnızca `src/core/` altındaki dosyaları tarar
2. Her satırda `import`/`require` + `orchestra/` kombinasyonu arar
3. İhlal bulunursa `AdrViolation` nesnesi üretir: dosya, satır, ADR kimliği ve düzeltme önerisi
4. Auditor bu ihlalleri sprint değerlendirmesine taşır: ihlal eden task `NO_GO` alır

**Amendment yolu:** İhlal tespit edildiğinde sistem şu öneriyi üretir:
> "Paylaşılan mantığı `core/`'a taşı veya bağımlılık tersine çevirme (dependency inversion) uygula: interface'i `core/`'da, implementasyonu `orchestra/`'da tut."

---

## ADR-008 Cycle 2 — Connector Ayrıştırması

Sprint tarihi boyunca bir kez ADR-008 döngüsel bağımlılık tuzağına düşüldü: `Connector` sınıfı `orchestra/connector.ts` içindeydi ve `core/` modülleri ona ihtiyaç duyuyordu. Bu durum `core → orchestra → core` döngüsü oluşturuyordu.

**Çözüm (ADR-008 Cycle 2):** `Connector` sınıfı ve `HealthCheckResult` arayüzü `core/session-interface.ts`'e taşındı. `orchestra/connector.ts` geriye dönük uyumluluk için sadece bir re-export shim olarak kaldı:

```typescript
// orchestra/connector.ts — artık yalnızca re-export
export { Connector, type HealthCheckResult } from '../core/session-interface.js';
```

---

## Wave 3 brain.ts Bağlamı

Sprint 036 God Object Split sürecinde `brain.ts` ~1.669 satırlık monolitik bir dosyadan **Wave 3** ile 53 satırlık ince bir re-export katmanına indirgendi. Bu dosya şu anda:

- **18 export ifadesi** içerir (sprint-controller, task-builder, debt-manager, sprint-reporter, coverage-validator ve diğer alt modüllerden)
- **Sıfır implementasyon mantığı** taşır — tüm iş alt modüllerdedir
- **Backward compatibility** sağlar: CLI/MCP/API katmanları `import { runSprint } from './orchestra/brain.js'` yazmaya devam edebilir

Bu tasarım ADR-008'in ruhunu tam karşılar: Brain'in import sınırı aynı zamanda otorite sınırıdır. Orchestrasyon yetkisi sadece Brain'de toplanır ve alt sistemler Brain'i tanımadan bağımsız olarak çalışır.

---

## Özet

| Kural | Açıklama |
|-------|----------|
| Tek yönlü akış | `core` ← `orchestra` ← `Brain` — ters yön yasak |
| Brain TEK orkestratör | Sadece `brain.ts` tmux/auditor/worker'ı çağırır |
| Döngü yasağı | `core → orchestra`, `worker → brain` gibi geri döngüler forbidden |
| Runtime denetim | `authority-enforcer.ts` `checkAdr008()` ile otomatik tarar |
| Bağımlılık çözümü | Interface'i `core/`'a taşı, implementasyonu `orchestra/`'da tut |
