# W3 — Reliability (Bugsuz) Audit (Sprint 132)

## Executive Summary

Deckent, 503 test dosyasında ~12,225+ test ve 89.33% coverage ile olgun bir test altyapısına sahip. Ancak enterprise "bugsuz" hedefine tam ulaşmak için birkaç kritik alan dikkate alınmalı: (1) 9 kaynak modülün doğrudan test dosyası yok (heartbeat-daemon, mid-sprint-adapter, promotion-pipeline, spawn-backend-docker, spawn-backend-mock, sprint-utils, mode-presets + managed-docs alt modülleri), (2) 344 untyped `catch {}` bloğu hata yutma riski taşıyor, (3) dosya tabanlı lock mekanizması TOCTOU yarış koşuluna maruz (O_EXCL ile kısmen korunmuş), (4) heartbeat yazımları non-atomic (`writeFileSync` — partial write riski), (5) handoff protokolünde concurrent erişim koruması yok. Toplam olarak 20 bulgu tespit edildi: 0 CRITICAL, 5 HIGH, 8 MEDIUM, 5 LOW, 2 INFO.

## Methodology

### Tarama Kapsamı
- **Kaynak dosyalar:** 840 TypeScript dosyası, ~59,375 LoC (`src/` altı)
- **Test dosyaları:** 503 test dosyası, ~158,530 LoC (`tests/` altı)
- **Odak modüller:** `src/orchestra/` (49 modül, 17,661 LoC), `src/core/` (50 modül, 14,639 LoC), `src/agents/` (16 modül, 3,817 LoC), `src/monitor/` (2 modül, 624 LoC)

### Tarama Yöntemleri
1. **Coverage haritası:** `src/` altındaki her modülün `tests/` altında karşılığı olup olmadığı dosya bazında karşılaştırma (ls + find)
2. **Error handling analizi:** `catch {}`, `catch (e)`, `console.error`, `process.exit`, boş catch blokları grep taraması
3. **Type safety taraması:** `as any`, `: any`, `@ts-ignore`, `@ts-expect-error` pattern taraması
4. **Sync I/O tespiti:** `readFileSync`/`writeFileSync` vs `fs.promises` kullanım oranı
5. **Flaky test göstergeleri:** `setTimeout`, `Date.now()`, `Math.random()`, `.skip`, `.only`, `.todo` taraması
6. **Retry/rollback/handoff mekanizmaları:** Statik kaynak kodu incelemesi
7. **Lock mekanizması:** TOCTOU analizi, `O_EXCL` flag kontrolü
8. **Referans standartlar:** Testing pyramid, Node.js async error handling, Vitest best practices

### Vitest Konfigürasyonu
- `testTimeout: 10000` (10 saniye per test)
- Coverage provider: `@vitest/coverage-v8`
- Dashboard testleri ayrı config ile çalışıyor (`src/dashboard/vitest.config.ts`)
- `coverage/coverage-summary.json` dosyası mevcut değil (coverage sadece CI'da üretiliyor olabilir)

## Findings

| # | Severity | Category | Location | Description | Impact | Recommendation |
|---|----------|----------|----------|-------------|--------|----------------|
| 1 | HIGH | MissingTests | src/orchestra/heartbeat-daemon.ts (247 LoC) | Test dosyası yok. Heartbeat daemon sprint lifecycle'ının kritik bir parçası — stale worker tespiti bu modüle bağlı. | Heartbeat daemon regresyonları sessizce oluşabilir; stale worker tespiti bozulursa sprint takılabilir. | Unit test dosyası oluşturulmalı: daemon başlatma/durdurma, timeout tespiti, concurrent heartbeat güncellemesi. |
| 2 | HIGH | MissingTests | src/orchestra/mid-sprint-adapter.ts (182 LoC) | Test dosyası yok. Mid-sprint adapter FIX fazında gerçek zamanlı yeniden yönlendirme yapar. | FIX fazında hatalı rerouting kararları sessizce alınabilir. | Rerouting karar mantığı, edge case'ler (tüm worker'lar başarısız) test edilmeli. |
| 3 | HIGH | MissingTests | src/orchestra/promotion-pipeline.ts (286 LoC) | Test dosyası yok (yalnızca promotion-guard.test.ts var — guard fonksiyonu test ediyor, pipeline lifecycle değil). | Agent/skill promosyon/demotion kararları doğrulanamaz. | Pipeline lifecycle: promote, demote, threshold hesaplama test edilmeli. |
| 4 | HIGH | MissingTests | src/orchestra/spawn-backend-docker.ts (332 LoC) | Test dosyası yok (e2e/docker-backend.test.ts mevcut ama unit test eksik). Docker backend üretim ortamında kritik. | Docker container spawn/kill/cleanup hataları unit test'le yakalanabilecekken yakalanmıyor. | DockerSpawnBackend sınıfının mock'lanmış Docker API ile unit test'i yazılmalı. |
| 5 | HIGH | ErrorSwallow | src/ genelinde (344 lokasyon) | 344 adet untyped `catch {}` bloğu (hata parametresi olmayan). Bunların çoğu sessizce hata yutarak devam ediyor. Örnekler: `src/mcp/resources/agents.ts:30`, `src/mcp/tools/cleanup.ts:25`, `src/providers/codex.ts:188`. | Hata yutma, debugging'i zorlaştırır. Beklenmeyen hatalar (disk dolu, permission denied) sessizce geçilir. | En azından `debugLog()` ile loglanmalı. Kritik path'lerdeki catch blokları hata türünü kontrol etmeli. |
| 6 | MEDIUM | RaceCondition | src/agents/worker.ts:301-304 | `writeHeartbeat()` `writeFileSync` kullanıyor — bu atomic değil. Partial write sonrası crash olursa bozuk heartbeat dosyası kalır. Auditor bozuk JSON'u parse edemez. | Stale agent false-positive uyarıları, auditor JSON parse hatası. | `writeFileSync` yerine write-to-temp + rename pattern'i kullanılmalı (rename POSIX'te atomic). |
| 7 | MEDIUM | RaceCondition | src/orchestra/handoff-protocol.ts:48-53 | `createHandoff()` ve `executeHandoff()` arasında locking mekanizması yok. İki worker aynı anda aynı handoff ID'ye erişirse veri yarışı oluşur. `_writeHandoff()` sadece `writeFileSync` kullanıyor. | Concurrent handoff durumunda veri bozulması, lost update. | Handoff dosyalarına lock mekanizması eklenmeli veya write-to-temp + rename kullanılmalı. |
| 8 | MEDIUM | CoverageGap | src/orchestra/sprint-utils.ts (361 LoC) | Test dosyası yok. Sprint fazları arasında paylaşılan utility fonksiyonları içeriyor. | Utility fonksiyonlarında regresyon riski. | Temel utility fonksiyonları için unit test yazılmalı. |
| 9 | MEDIUM | CoverageGap | src/core/mode-presets.ts | Test dosyası yok. Model strategy preset tanımları — yanlış preset yanlış model routing'e yol açar. | Preset değişikliklerinde regresyon yakalanmaz. | Preset doğrulama test'leri yazılmalı. |
| 10 | MEDIUM | CoverageGap | src/orchestra/managed-docs/ (3 modül) | `doc-cache.ts`, `plugin-loader.ts`, `template-renderer.ts` için test dosyası yok. Sprint 131'de eklenen yeni modüller. | Yeni managed-docs altyapısının doğruluğu unit test ile kanıtlanmamış. | Her modül için basic unit test yazılmalı. |
| 11 | MEDIUM | TypeSafety | src/ genelinde (17 lokasyon) | 17 adet `as any` kullanımı tespit edildi. `src/cli/commands/spawn.ts:1` ve `src/core/utils.ts:1` dahil. | Type safety bypass'ı runtime hata riskini artırır. | `as unknown as T` veya proper type guard'lar ile değiştirilmeli. |
| 12 | MEDIUM | RetryLogic | src/orchestra/task-retry.ts:16-19 | Backoff stratejisi yalnızca 2 seviye: ilk retry 0ms (anında), ikinci retry 30s. Exponential backoff değil, sabit tablo. Max 2 retry. | Transient hatalar (network timeout, rate limit) için yetersiz olabilir. Anında retry, aynı geçici hatayı tekrar tetikleyebilir. | En azından 1. retry için kısa bir bekleme (5s) ve exponential artış düşünülmeli. |
| 13 | MEDIUM | Idempotency | src/orchestra/rollback.ts:104-147 | `createSafetyPoint()` dirty working tree'de `git stash push` + `git stash pop` kullanıyor. Pop başarısız olursa (merge conflict) working tree bozuk kalır ve sadece `console.warn` loglanır (satır 136). | Stash pop hatası sonrası kullanıcı working tree'sinde kayıp veri riski. | Pop hatası durumunda result'ta uyarı döndürülmeli, `console.warn` yerine structured error. |
| 14 | MEDIUM | FlakyTest | tests/ genelinde (188 lokasyon) | 188 adet `setTimeout`/`Date.now()`/`Math.random()` kullanımı tespit edildi. Çoğu temp dizin ismi üretiminde (düşük risk) ama `tests/api/server*.test.ts` dosyalarında 50ms sleep'ler var — CI ortamında timing-sensitive. | CI ortamında intermittent test failure riski. | Sleep'ler yerine event-based bekleme veya fake timer kullanılmalı. 38 test dosyası zaten `vi.useFakeTimers` kullanıyor — bu pattern yaygınlaştırılmalı. |
| 15 | LOW | MissingTests | src/orchestra/spawn-backend-mock.ts (107 LoC) | Test dosyası yok. Mock backend — test altyapısının kendisi. | Mock backend'deki bug, tüm test suite'ini yanıltabilir. | Mock backend'in kendi davranış test'leri yazılmalı. |
| 16 | LOW | FlakyTest | tests/cli/commands.test.ts:1190 | 1 adet `it.skip()` test: "creates config with selected mode — TODO: update mock for language-first init flow". | Skipped test, coverage gap'i gizler. | TODO kapatılmalı veya test güncellenmeli. |
| 17 | LOW | TypeSafety | src/ genelinde | `catch {}` bloklarında 344'ü untyped (hata parametresi yok). TypeScript strict mode'da catch parametreleri `unknown` olmalı. | Hata türü bilinmeden işlem yapılıyor; beklenmeyen hata türleri sessizce geçiyor. | Kritik path'lerde `catch (err: unknown)` kullanılmalı ve hata türü daraltılmalı. |
| 18 | LOW | CoverageGap | src/providers/ (5 modül) | Provider'lar (`claude.ts`, `codex.ts`, `gemini.ts`) için unit test mevcut ama integration test sınırlı. External API çağrıları mock'lanıyor — gerçek API davranışı doğrulanmıyor. | Provider API değişikliklerinde regresyon riski. Mock-gerçek divergence. | Contract test veya snapshot test'ler eklenebilir. |
| 19 | LOW | ErrorSwallow | src/orchestra/sprint-controller.ts (3 lokasyon) | `console.error` kullanımı: hata loglanıp akış devam ediyor. Sprint controller'daki hata yutma sprint sonuçlarını etkileyebilir. | Sprint sonuçları hatalı değerlendirilebilir. | Kritik fazlarda (EVALUATE, FIX) hata yutma yerine structured error handling. |
| 20 | INFO | CoverageGap | Sync I/O oranı | 389 `readFileSync` + 283 `writeFileSync` = 672 sync I/O çağrısı vs. sadece 4 `fs.promises` kullanımı. Sync I/O oranı: %99.4. | Test edilebilirliği düşürür (mock'lama zorlaşır), concurrent işlemlerde event loop blocking. | Yeni kod'da `fs.promises` tercih edilmeli. Mevcut sync çağrılar kademeli olarak migrate edilebilir. |
| 21 | INFO | CoverageGap | Test-to-source oranı | 158,530 test LoC / 59,375 src LoC = 2.67:1 oran. Bu oran enterprise standartlarının (1.5:1 — 3:1) üst bandında. | Pozitif gösterge. Test altyapısı kapsamlı. | Mevcut oranı korumaya devam. |

## Metrics

- **Dosya tarandı:** 840 kaynak + 503 test = 1,343 dosya
- **Toplam bulgu:** 21
- **CRITICAL:** 0
- **HIGH:** 5
- **MEDIUM:** 8
- **LOW:** 5
- **INFO:** 2
- **Test dosyası olmayan kritik modüller:** 9 (heartbeat-daemon, mid-sprint-adapter, promotion-pipeline, spawn-backend-docker, spawn-backend-mock, sprint-utils, mode-presets, doc-cache, plugin-loader, template-renderer — bazıları managed-docs alt modülleri)
- **Test-to-source LoC oranı:** 2.67:1
- **Toplam sync I/O çağrısı:** 672 (readFileSync: 389 + writeFileSync: 283)
- **Async I/O çağrısı:** 4 (fs.promises)
- **`as any` kullanımı:** 17
- **`: any` kullanımı:** ~2 (core/utils.ts, task-builder.ts)
- **`@ts-ignore`/`@ts-expect-error`:** 0
- **Untyped `catch {}` blokları:** 344
- **Typed `catch (e)` blokları:** 324
- **`process.exit` kullanımı:** ~48 (çoğu CLI — uygun)
- **Skipped test (`.skip`):** 1
- **`.todo` test:** 0
- **`setTimeout`/`Date.now`/`Math.random` in tests:** 188 lokasyon
- **`vi.useFakeTimers` kullanan test dosyası:** 38
- **Reported coverage (Sprint 130):** 89.33%
- **`coverage/coverage-summary.json`:** Mevcut değil (CI-only üretiliyor)

## Evidence

### E1 — Heartbeat-daemon test eksikliği (Finding #1)
```
$ find tests/ -name "heartbeat-daemon*"
(sonuç yok)

$ wc -l src/orchestra/heartbeat-daemon.ts
247 src/orchestra/heartbeat-daemon.ts
```

### E2 — Mid-sprint-adapter test eksikliği (Finding #2)
```
$ find tests/ -name "mid-sprint-adapter*"
(sonuç yok)

$ wc -l src/orchestra/mid-sprint-adapter.ts
182 src/orchestra/mid-sprint-adapter.ts
```

### E3 — Promotion-pipeline test eksikliği (Finding #3)
```
$ find tests/ -name "promotion-pipeline*"
(sonuç yok — sadece promotion-guard.test.ts mevcut)

$ wc -l src/orchestra/promotion-pipeline.ts
286 src/orchestra/promotion-pipeline.ts
```

### E4 — Spawn-backend-docker test eksikliği (Finding #4)
```
$ find tests/ -name "spawn-backend-docker*"
(sonuç yok — sadece tests/e2e/docker-backend.test.ts mevcut)

$ wc -l src/orchestra/spawn-backend-docker.ts
332 src/orchestra/spawn-backend-docker.ts
```

### E5 — Untyped catch blokları (Finding #5)
```
$ grep -rn "catch {" src/ --include="*.ts" | wc -l
344

# Örnekler:
src/mcp/resources/agents.ts:30:      } catch { /* empty on read error */ }
src/mcp/tools/cleanup.ts:25:    try { unlinkSync(join(locksDir, f)); } catch { /* ignore */ }
src/providers/codex.ts:188:    } catch {
```

### E6 — Non-atomic heartbeat yazımı (Finding #6)
```typescript
// src/agents/worker.ts:301-304
export function writeHeartbeat(projectRoot: string, heartbeat: Heartbeat): void {
  ensureDir(join(projectRoot, TASKS_DIR));
  const path = heartbeatFilePath(projectRoot, heartbeat.taskId);
  writeFileSync(path, JSON.stringify(heartbeat, null, 2), 'utf-8');
  // ^^^ writeFileSync doğrudan dosyaya yazar — crash durumunda partial write riski
}
```

### E7 — Handoff protocol concurrent erişim (Finding #7)
```typescript
// src/orchestra/handoff-protocol.ts:48-53
writeFileSync(
  join(this.handoffDir, `${id}.json`),
  JSON.stringify(handoff, null, 2),
  'utf-8',
);
// Lock mekanizması yok — iki worker aynı handoff'a aynı anda yazabilir
```

### E8 — Lock mekanizması TOCTOU koruması (pozitif bulgu)
```typescript
// src/agents/worker.ts:210 — O_EXCL flag ile atomic lock oluşturma
const fd = openSync(lockPath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL);
// ^^^ O_EXCL TOCTOU'yu kernel seviyesinde önler — iyi implementasyon
```

### E9 — Retry backoff stratejisi (Finding #12)
```typescript
// src/orchestra/task-retry.ts:16-19
export const RETRY_BACKOFF_MS: Record<number, number> = {
  0: 0,      // 1st retry: anında (0ms)
  1: 30_000, // 2nd retry: 30 saniye
};
// Exponential backoff değil, sabit tablo. 1. retry anında — transient hata tekrar oluşabilir.
```

### E10 — Rollback stash pop riski (Finding #13)
```typescript
// src/orchestra/rollback.ts:132-137
if (!wasClean) {
  const popResult = git(['stash', 'pop'], projectRoot);
  if (popResult.status !== 0) {
    // Non-fatal: sadece console.warn — kullanıcıya geri bildirim zayıf
    console.warn(`[rollback] Warning: could not pop stash...`);
  }
}
```

### E11 — Flaky test göstergeleri (Finding #14)
```typescript
// tests/api/server.test.ts:916
await new Promise((r) => setTimeout(r, 50));
// ^^^ 50ms sleep — CI ortamında unreliable

// tests/analytics/analytics-data.test.ts:17
`analytics-data-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
// ^^^ Temp dizin ismi — düşük risk ama deterministic değil
```

## Recommendations (Sprint 133+)

### HIGH Öncelik (Sprint 133 adayı)

1. **Heartbeat-daemon unit test'leri yazılmalı** — 247 satırlık kritik modül test'siz. Daemon lifecycle (start/stop), timeout tespiti, concurrent güncelleme senaryoları kapsamalı.

2. **Spawn-backend-docker unit test'leri yazılmalı** — 332 satırlık Docker backend. Mock'lanmış Docker API ile container spawn/kill/cleanup test edilmeli. Mevcut e2e testler Docker runtime gerektiriyor — unit test'ler CI'da her zaman çalışabilir.

3. **Mid-sprint-adapter ve promotion-pipeline test'leri** — FIX fazı yeniden yönlendirme ve agent/skill promosyon lifecycle kararları test edilmeli.

4. **Untyped catch blokları kademeli refactor** — En azından `src/orchestra/` ve `src/agents/` altındaki kritik path'lerdeki 344 untyped catch'ten 50+ tanesi `debugLog()` ile loglanmalı.

5. **Non-atomic file yazımları için write-to-temp + rename pattern'i** — `writeHeartbeat()`, `_writeHandoff()` ve diğer kritik dosya yazımları atomic hale getirilmeli.

### MEDIUM Öncelik (Sprint 134+)

6. **Managed-docs alt modülleri test coverage** — `doc-cache.ts`, `plugin-loader.ts`, `template-renderer.ts` için unit test'ler.

7. **Retry backoff iyileştirmesi** — İlk retry'ı 0ms yerine en az 2-5 saniye yaparak transient hataların tekrar oluşma olasılığını azalt.

8. **Flaky test temizliği** — `tests/api/server*.test.ts` dosyalarındaki 50ms sleep'ler event-based bekleme veya fake timer ile değiştirilmeli.

9. **Rollback stash pop hatası handling** — `console.warn` yerine structured error döndürülmeli, SafetyPoint result'ına uyarı eklenmeli.

10. **mode-presets test'leri** — Preset doğrulama ve edge case test'leri.

### LOW Öncelik (Backlog)

11. **Sync I/O kademeli migrasyon** — Yeni kod'da `fs.promises` zorunlu kılınmalı. Mevcut 672 sync çağrı kademeli olarak migrate edilebilir.

12. **Skip'lenmiş test kapatılmalı** — `tests/cli/commands.test.ts:1190` TODO güncellenip test aktif edilmeli.

13. **Provider contract test'leri** — Mock-gerçek API divergence'ını önlemek için contract/snapshot test'ler.

## Context7 References

### Testing Pyramid (Martin Fowler)
- **Unit testler** test tabanını oluşturmalı (~70%). Deckent'te test-to-source oranı 2.67:1 — piramit tabanı güçlü.
- **Integration test'ler** modül sınırlarını test etmeli (~20%). 25 integration test dosyası mevcut — yeterli.
- **E2E test'ler** minimum tutulmalı (~10%). 6 e2e + 3 smoke test — uygun oran.

### Node.js Async Error Handling Best Practices
- Untyped catch blokları (`catch {}`) Node.js topluluğunda en yaygın antipattern olarak kabul edilir.
- Önerilen pattern: `catch (err: unknown) { if (err instanceof SpecificError) ... }`
- Deckent'te 344 untyped vs 324 typed catch — oran yaklaşık 1:1. Enterprise hedef: typed oranı %80+ olmalı.

### Vitest Best Practices
- `vi.useFakeTimers()` kullanımı 38 test dosyasında mevcut — iyi başlangıç. Tüm timing-sensitive testlere yaygınlaştırılmalı.
- `testTimeout: 10000` (10s) makul ancak CI ortamında flaky test'ler için monitoring gerekli.
- Coverage exclude listesi barrel export'ları ve dashboard'u hariç tutuyor — doğru yaklaşım.

### Chaos Engineering Primer
- Deckent'in lock mekanizması (O_EXCL flag) kernel seviyesinde TOCTOU koruması sağlıyor — bu güçlü bir başlangıç.
- Heartbeat ve handoff dosya yazımlarında partial write senaryosu bir chaos engineering testi konusu olabilir (Sprint 133 yük testi kapsamında).
- Retry mekanizması basit ama fonksiyonel. Jitter (rastgele gecikme) eklenmesi thundering herd problemini önleyebilir.
