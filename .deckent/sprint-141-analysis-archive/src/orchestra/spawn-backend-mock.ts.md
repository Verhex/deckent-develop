# Analysis: src/orchestra/spawn-backend-mock.ts
**Task ID:** 141-002 | **LoC:** 107

## 1. Amaci (1-2 cumle)
E2E testler için worker yürütmesini simüle eden mock SpawnBackend implementasyonu. Worker'lar gerçek Claude CLI çalıştırmadan anında .result dosyası yazar; DONE, GO_WITH_TECH_DEBT, NO_GO ve TIMEOUT senaryolarını destekler.

## 2. Public API (export listesi)
- `MockScenario` (type)
- `MockWorkerConfig` (interface)
- `MockSpawnBackend` (class, SpawnBackend implementasyonu)
  - `spawn(taskId, model, prompt, opts?)` → void
  - `kill(taskId)` → void
  - `list()` → string[]
  - `isAvailable()` → Promise<boolean>

## 3. Ic + Dis Bagimliliklar
**Node.js:**
- `node:fs` — writeFileSync, mkdirSync, existsSync
- `node:path` — join

**Core:**
- `../core/types.js` — ModelType
- `../core/constants.js` — TASKS_DIR
- `./spawn-backend.js` — SpawnBackend, SpawnBackendOptions

## 4. Complexity (fonksiyon sayisi, cyclomatic rough)
- Metotlar: 4
- Cyclomatic: düşük (~6) — senaryo seçimi ve delay ile basit spawn simülasyonu

## 5. Type Safety (any, @ts-ignore, non-null assertion)
- `any`: yok
- `@ts-ignore`: yok
- Non-null assertion: yok
- `_prompt` — kullanılmayan parametre, alt çizgi prefix ile işaretlenmiş

## 6. ADR Compliance (ADR-006/008/010/037/039/040)
- **Tüm ADR'ler:** Uyumlu — test yardımcısı, üretim kodu değil
- **ADR-006:** Uyumlu — spawnSync yok

## 7. Test Coverage (src/X → tests/X.test.ts eslesmesi)
- Bu dosya test altyapısıdır; test dosyasının kendisi test edilmez
- Dolaylı olarak tüm backend parity testlerinde kullanılır

## 8. TODO/FIXME/HACK inventory
- Satır 62: `// Guard: test cleanup may have removed the directory before this fires` — açık neden notu, iyi

## 9. Dead Code Candidates
- Tüm senaryo yolları aktif (DONE, GO_WITH_TECH_DEBT, NO_GO, TIMEOUT)

## 10. Security Findings
- Sadece test ortamında kullanılmalı; üretimde kullanılması durumunda hiçbir gerçek işlem yapılmaz
- `isAvailable()` her zaman true döndürür — üretimde yanlışlıkla kullanılırsa risk

## 11. Memory V2 Uyumu (DB-first mi, eski .md parse var mi?)
- İlgisiz — test yardımcısı

## 12. Oneriler (Sprint 142+ input)
1. **Guard (P2):** Test dışında kullanımı engelleyen bir assertion ekle (`if (process.env.NODE_ENV !== 'test') throw Error`)
2. Küçük, iyi tasarlanmış modül — büyük değişiklik gerekmez

## 13. Verdict: ANALYZED
