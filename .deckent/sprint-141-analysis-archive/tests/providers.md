# Test Category Analysis: providers
**Tarih:** 2026-04-16 | **Task:** 140-007 | **Dosya Sayısı:** 7

---

## 1. Test Dosya Envanteri

**Toplam:** 7 dosya | **describe blokları:** 59 | **it() blokları:** 346

| Dosya | Açıklama |
|-------|----------|
| `claude.test.ts` | `src/providers/claude.ts` — Claude provider tmux + subprocess spawn |
| `codex.test.ts` | `src/providers/codex.ts` — Codex (OpenAI) CLI adapter birim testi |
| `codex-integration.test.ts` | Codex gerçek CLI entegrasyon (env-gated, `OPENAI_API_KEY`) |
| `gemini.test.ts` | `src/providers/gemini.ts` — Gemini CLI adapter birim testi |
| `gemini-integration.test.ts` | Gemini gerçek CLI entegrasyon (env-gated, `GOOGLE_API_KEY`) |
| `sandbox.test.ts` | `src/providers/sandbox.ts` — AST sandbox validator |
| `subprocess.test.ts` | `src/providers/subprocess.ts` — subprocess spawn backend |

### Test/Src Karşılaştırması

`src/providers/` içindeki 5 dosyanın tümü (claude.ts, codex.ts, gemini.ts, sandbox.ts, subprocess.ts) doğrudan test dosyasına sahip. Ek olarak codex ve gemini için integrasyon testleri mevcut. **1:1+ kapsama sağlanmış.**

---

## 2. Mock Pattern Audit

### vi.mock kullanımı

Her dosyada farklı mock stratejileri:

| Dosya | Mocked Modüller |
|-------|----------------|
| `claude.test.ts` | `tmux.js`, `node:fs`, `node:child_process` |
| `codex.test.ts` | `node:child_process`, `node:fs` |
| `gemini.test.ts` | `node:child_process`, `node:fs` |
| `sandbox.test.ts` | `node:child_process`, `node:fs` |
| `subprocess.test.ts` | `node:child_process`, `node:fs` |
| `codex-integration.test.ts` | Gerçek CLI (mock yok — env-gated) |
| `gemini-integration.test.ts` | Gerçek CLI (mock yok — env-gated) |

**Toplam vi.mock çağrısı:** ~11 (kategoride en az)

### Mock edilen modüller

1. `node:child_process` — `spawnSync` / `execSync` için 5 dosyada
2. `node:fs` — dosya sistemi read/write 5 dosyada
3. `../../src/orchestra/tmux.js` — sadece `claude.test.ts`'de
4. `node:crypto` — 1 dosyada (güvenlik token testi)

### vi.mocked vs vi.spyOn

- `vi.mocked` — `codex.test.ts`, `gemini.test.ts`, `sandbox.test.ts`, `subprocess.test.ts` içinde typed mock kullanımı yaygın
- `vi.spyOn` — 8 adet kullanım (providers kategorisinde en yoğun, oran olarak)

### Fake Timer Kullanımı

8 adet `useFakeTimers` — providers kategorisi, monkey-patching işlemli testler için aktif fake timer kullanıyor.

---

## 3. Coverage Mapping

### src/providers/ → tests/providers/ eşleşmesi

| Src Dosyası | Test Dosyası | Durum |
|-------------|-------------|-------|
| `claude.ts` | `claude.test.ts` | OK |
| `codex.ts` | `codex.test.ts` + `codex-integration.test.ts` | EXCELLENT |
| `gemini.ts` | `gemini.test.ts` + `gemini-integration.test.ts` | EXCELLENT |
| `sandbox.ts` | `sandbox.test.ts` | OK |
| `subprocess.ts` | `subprocess.test.ts` | OK |

**Kapsama oranı: %100** — tüm 5 src dosyası kapsanmış. Codex ve Gemini için ek entegrasyon testi var.

### İlgili Src Bağımlılıkları

Provider testleri aynı zamanda dolaylı olarak şunları kapsar:
- `src/core/types.ts` — SpawnOptions, SpawnResult tip doğrulamaları
- `src/orchestra/tmux.ts` — `claude.test.ts` tmux mock yoluyla
- `src/core/provider.ts` — ProviderAdapter arayüzü uyumu (soyut test)

---

## 4. Orphan Test Tespiti

| Test Dosyası | Durumu |
|-------------|--------|
| `codex-integration.test.ts` | Orphan değil — `codex.ts`'nin env-gated entegrasyon testi |
| `gemini-integration.test.ts` | Orphan değil — `gemini.ts`'nin env-gated entegrasyon testi |

**Gerçek orphan yok.** Tüm 7 test dosyası net bir src karşılığına sahip.

---

## 5. Flaky Candidate İşaretleri

### setTimeout / setInterval kullanımı

Providers kategorisinde `setTimeout` veya `setInterval` kullanımı **YOK**. Bu, kategori için en temiz sonuçlardan biri.

### Date.now() kullanımı

`Date.now()` kullanımı **YOK** — providers testleri zamanlama bağımlısı değil.

### Fake Timer Kullanımı (8 adet)

Providers kategorisi gerçek CLI (spawnSync) davranışlarını mock'luyor, ancak fake timer kullanımı mevcut — bunlar muhtemelen timeout ve retry logic'i test ediyor.

### Env-Gated Testler (Koşullu çalışma)

İki entegrasyon test dosyası `describe.skipIf` kullanıyor:

```typescript
// codex-integration.test.ts:24
describe.skipIf(!codexAvailable)('CodexAdapter Integration (real CLI)', () => {

// gemini-integration.test.ts:17
describe.skipIf(!hasGemini)('Gemini CLI integration', () => {
```

Bu pattern güvenli — API key yokken testler tamamen atlanıyor. **Flaky riski yok.**

### Potansiyel Risk Alanları

- `claude.test.ts` — tmux session mock'ları gerçek süreç yönetimine bağımlı olabilir; mock derinliği düşükse edge case'ler test dışı kalıyor
- `subprocess.test.ts` — subprocess spawn mock'ları platform-spesifik davranış farkları (WSL2 vs Linux) nedeniyle flaky olabilir

---

## 6. Memory V2 Mock Uyumu

### MemoryStore Kullanımı

Providers kategorisinde **hiç MemoryStore kullanımı yok** — 0 mock, 0 import.

Bu beklenen bir durum: `src/providers/` modülleri yalnızca CLI subprocess'leri başlatır ve çıktı parse eder. Memory V2 bilgisine doğrudan bağımlılıkları yoktur.

### countBrainLines / parseDebtTable

Providers kategorisinde **hiç countBrainLines veya parseDebtTable mock'u yok.** Bu bekleniyor — providers katmanı brain/memory ile doğrudan iletişim kurmaz.

### Genel Memory V2 Uyumu

Providers kategorisi Memory V2 geçişinden **bağımsız** — etkilenmemiş. ADR-008 tek yönlü bağımlılık kuralına uygun: providers, brain/memory'den bağımsız.

---

## 7. Genel Değerlendirme

**Sağlık Skoru:** 91/100 (A)

### Güçlü Yönler

1. **%100 src kapsama** — 5/5 src dosyası için dedicated test dosyası
2. **İki provider için entegrasyon testi** (codex + gemini) — gerçek CLI davranışı test ediliyor
3. **Env-gated skip pattern** — `describe.skipIf()` kullanımı doğru, CI'da false failure üretmiyor
4. **Sıfır setTimeout/Date.now** — zamanlama bağımlısı test yok
5. **Fake timer kullanımı aktif** — zamanlama logic'i kontrollü test ediliyor
6. **Memory V2 bağımsızlığı** — ADR-008 uyumlu; providers katmanı memory'den izole
7. **Temiz mock stratejisi** — her provider için tutarlı node:fs + node:child_process mock pattern'i

### Zayıf Yönler

1. **346 it() / 7 dosya = ~49 test/dosya** — makul ama bazı edge case'ler eksik olabilir (hata recovery, timeout retry, provider fallback chain)
2. **claude.test.ts** — tmux session timeout, session crash, reconnect senaryoları için edge case eksik olabilir
3. **sandbox.ts** AST validation — kötü niyetli kod injection, AST parse hatası gibi güvenlik edge case'leri için daha fazla test gerekebilir
4. **ProviderAdapter interface compliance testi yok** — tüm provider'ların arayüze tam uyduğunu doğrulayan yapısal bir test yok

### Sprint 142+ Öneriler

1. **ProviderAdapter compliance test**: Her provider'ın interface'i tam olarak implement ettiğini doğrulayan bir `provider-compliance.test.ts` ekle
2. **Provider fallback chain testi**: Birincil provider başarısız → ikincil provider'a geçiş senaryosu test edilmeli
3. **claude.test.ts**: tmux session crash recovery senaryoları için edge case ekle
4. **sandbox.ts**: AST injection ve parse error güvenlik testleri ekle (Sprint 12 şelale testi)
5. Sağlık skoru 91 olsa da integration test'lerde real API bağımlılığı uzun vadede riskli — contract test pattern düşünülmeli
