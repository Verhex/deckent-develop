# Test Category Analysis: monitor
**Tarih:** 2026-04-16 | **Task:** 140-007 | **Dosya Sayısı:** 9

---

## 1. Test Dosya Envanteri

**Toplam:** 9 dosya | **describe blokları:** 66 | **it() blokları:** 274

| Dosya | Açıklama |
|-------|----------|
| `auditor.test.ts` | Ana auditor testi — en kapsamlı dosya (2863+ satır) |
| `auditor-agent.test.ts` | Auditor agent tracking ve stale agent algılama |
| `auditor-deadlock-e2e.test.ts` | Deadlock tespiti end-to-end |
| `auditor-edge.test.ts` | Edge case'ler (sınır durumlar) |
| `auditor-hb-reconciliation.test.ts` | Heartbeat reconciliation logic |
| `auditor-patterns.test.ts` | Pattern kaydetme ve PATTERNS.md yazma |
| `auditor-queue.test.ts` | Pattern kuyruk yönetimi (öncelik sıralama) |
| `dashboard-manager.test.ts` | `dashboard-manager.ts` kapsama |
| `sprint-state.test.ts` | `sprint-state.ts` kapsama |

---

## 2. Mock Pattern Audit

### vi.mock kullanımı

Toplam **6 dosyada** vi.mock kullanılmış (`dashboard-manager.test.ts` ve `sprint-state.test.ts` ve `auditor-deadlock-e2e.test.ts` daha saf):

| Mock Modülü | Kullanan Dosyalar |
|-------------|-------------------|
| `node:fs` | auditor.test.ts, auditor-agent.test.ts, auditor-edge.test.ts, auditor-hb-reconciliation.test.ts, auditor-patterns.test.ts, auditor-queue.test.ts |
| `node:child_process` | auditor.test.ts, auditor-agent.test.ts, auditor-patterns.test.ts, auditor-queue.test.ts |
| `../../src/core/memory-store.js` | auditor.test.ts |
| `../../src/orchestra/event-stream.js` | auditor.test.ts |

### vi.mocked (typed mock) kullanımı

- `auditor-agent.test.ts` — `mockedReadFileSync`, `mockedWriteFileSync`, `mockedExistsSync`, `mockedReaddirSync`, `mockedStatSync` (5 typed mock)
- `auditor.test.ts` — `mockedStatSync` pattern + MemoryStore typed mock

### vi.spyOn kullanımı

2 adet kullanım — kategori genelinde az.

---

## 3. Coverage Mapping

### src/monitor/ dosyaları vs testler

| Src Dosyası | Test Dosyası | Durum |
|-------------|-------------|-------|
| `auditor.ts` | `auditor.test.ts` (ana) + `auditor-agent.test.ts` + `auditor-deadlock-e2e.test.ts` + `auditor-edge.test.ts` + `auditor-hb-reconciliation.test.ts` + `auditor-patterns.test.ts` + `auditor-queue.test.ts` | **KUSURSUZ — 7 dosya** |
| `dashboard-manager.ts` | `dashboard-manager.test.ts` | OK |
| `sprint-state.ts` | `sprint-state.test.ts` | OK |
| `index.ts` | Dolaylı (re-export) | PARTIAL — beklenebilir |

**Tüm kritik src dosyaları kapsanmış.** `index.ts` re-export barrel'ı test edilmemesi kabul edilebilir.

---

## 4. Orphan Test Tespiti

| Test Dosyası | Durumu |
|-------------|--------|
| `auditor-deadlock-e2e.test.ts` | Src karşılığı yok ama `auditor.ts` genişletilmiş E2E'si — kabul edilebilir |
| `auditor-hb-reconciliation.test.ts` | `auditor.ts` heartbeat reconciliation özel kapsama — orphan değil |
| `auditor-edge.test.ts` | `auditor.ts` edge case ek testi — orphan değil |
| `auditor-queue.test.ts` | `auditor.ts` pattern queue özel testi — orphan değil |
| `auditor-patterns.test.ts` | `auditor.ts` pattern kayıt özel testi — orphan değil |
| `auditor-agent.test.ts` | `auditor.ts` agent tracking özel testi — orphan değil |

**Gerçek orphan yok.** `auditor.ts` 6 ayrı test dosyasıyla inceleniyor — bu sağlıklı bir test stratejisi (büyük modülü parçalara bölerek test etme).

---

## 5. Flaky Candidate İşaretleri

### Date.now() kullanan testler

| Dosya | Satır | Kullanım | Risk |
|-------|-------|----------|------|
| `auditor-agent.test.ts:35` | `mockedStatSync.mockReturnValue({ mtimeMs: Date.now() })` | Güncel zaman damgası | Düşük |
| `auditor.test.ts:108` | `mockedStatSync.mockReturnValue({ mtimeMs: Date.now() })` | Güncel zaman damgası | Düşük |
| `auditor.test.ts:171` | `new Date(Date.now() - 200_000)` | Stale timestamp simülasyonu | Düşük |
| `auditor.test.ts:261` | `new Date(Date.now() - 121_000)` | >2min stale agent | Düşük |
| `auditor.test.ts:303` | `new Date(Date.now() - 600_000)` | 10dk stale lock | Düşük |
| `auditor.test.ts:329` | `new Date(Date.now() - 300_000)` | 5dk stale lock | Düşük |
| `auditor.test.ts:360` | `new Date(Date.now() - 300_000)` | Stale lock | Düşük |
| `auditor.test.ts:448` | `new Date(Date.now() - 400_000)` | Stale lock | Düşük |
| `auditor.test.ts:487` | `new Date(Date.now() - 400_000)` | Stale lock | Düşük |
| `auditor.test.ts:505` | `new Date(Date.now() - 400_000)` | Stale lock | Düşük |

**Fake timer kullanımı:** 9 adet `useFakeTimers` — monitor kategorisi bu konuda aktif kullanıcı.

**Değerlendirme:** Date.now() kullanımları offset-tabanlı (sabit gecikme ekleniyor), bu doğrudan flaky riski taşımıyor. Ancak `auditor.test.ts` içindeki 10 adet Date.now() testi teorik olarak milisaniyelik yarış koşulu riski taşır. Fake timer kullanımı `useFakeTimers` ile kapsamlı, bu iyi bir işaret.

### setTimeout kullanımı

Doğrudan `setTimeout` kullanımı yok (`Date.now()` kullanımı dolaylı).

---

## 6. Memory V2 Mock Uyumu

### MemoryStore mock kullanımı

Yalnızca `auditor.test.ts` MemoryStore mock içeriyor:

```
Line 84: vi.mock('../../src/core/memory-store.js', () => ({
Line 85:   MemoryStore: vi.fn().mockImplementation(() => mockAuditorMemStore)
```

- Satır 1707: `// Seed MemoryStore with ADR-006 entry` — ADR-006 spawnSync güvenlik kuralı doğrulama testi
- Satır 2863: `// Arrange: MemoryStore with ADR-006, file with violation` — İhlal tespiti testi

Bu, auditor'ın ADR compliance kontrolünde DB-first MemoryStore kullandığını ve test'in buna uyum sağladığını gösteriyor. **Doğru pattern.**

### countBrainLines / parseDebtTable

Monitor kategorisinde **hiç `countBrainLines` veya `parseDebtTable` mock'u yok.** Bu, monitor/auditor modülünün V1 legacy fonksiyon bağımlılığından arındırıldığını gösteriyor. **İyi durum.**

### Genel Memory V2 Uyumu

Monitor testleri Memory V2 geçişiyle iyi uyumlu:
- `auditor.ts` MemoryStore mock'u var ve ADR-006 DB-first enforcement testleniyor
- Eski `.md` parse fonksiyonları mock'lanmıyor (V1 kodu yok demek)
- `event-stream.js` mock'u da mevcut (ADR-035 compliance için)

---

## 7. Genel Değerlendirme

**Sağlık Skoru:** 87/100 (A-)

### Güçlü Yönler

1. **auditor.ts için 7 ayrı test dosyası** — büyük ve karmaşık bir modülü mantıklı parçalara bölerek test ediliyor
2. **MemoryStore mock DB-first pattern'e uygun** — ADR-006 enforcement testleri mevcut
3. **Memory V2 uyumu tam** — countBrainLines/parseDebtTable legacy mock yok
4. **Fake timer kullanımı aktif** (9 kullanım) — zamanlama bağımlı testlerde güvenilir
5. **4 src dosyasının tümü kapsanmış** — `index.ts` hariç %100 kapsama
6. **E2E deadlock testi** — gerçek entegrasyon senaryosu (`auditor-deadlock-e2e.test.ts`)

### Zayıf Yönler

1. **monitor/index.ts barrel testi yok** — küçük ama resmi kapsama boşluğu
2. **Date.now() offset'leri fake timer yerine direkt** — teorik yarış durumu riski (düşük öncelik)
3. **auditor.test.ts 2863+ satır** — monolitik, parçalanmaya devam edebilir (agent, queue, patterns, hb-reconciliation ayrıldı ama ana dosya hâlâ büyük)

### Sprint 142+ Öneriler

- `monitor/index.ts` için basit smoke test ekle
- `auditor.test.ts` içindeki Date.now() kullanımlarını `vi.useFakeTimers()` ile replace et
- `checkADRCompliance` DB-first pathway için daha fazla integration senaryosu ekle
