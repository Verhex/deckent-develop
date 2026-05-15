# Sprint 171 — Task 20: Hata Yönetimi (Error Handling) Denetimi

**Görev:** Cross-cutting hata yönetimi denetimi (audit-only, kaynak kod değişikliği yok).
**Kapsam:** Tüm `src/` ağacı (`src/orchestra`, `src/agents`, `src/core`, `src/monitor`, `src/nervous`, `src/providers`, `src/api`, `src/mcp`, `src/cli`, `src/dashboard`).
**Audit tarihi:** 2026-05-15.
**Çıktı dili:** Türkçe (ZORUNLU).
**Plan referansı:** `docs/superpowers/plans/2026-05-15-sprint-171-self-audit-plan.md` — Task 171-020.

> **Cross-cutting görev — Kapsam Haritası bölümü YOK.** Denetim modül-derin değil, pattern-derin: tüm kaynak tabanında "hata yönetimi" boyutunda örnekleme yapılmış, kritik bulgular kanıtlanmıştır.

---

## 1. Bulgular

Üç ana başlık altında 14 bulgu tespit edilmiştir.

### A. Yutulan Hatalar (Swallowed Errors) — 6 bulgu

deckent kod tabanı `// ignore`, `// swallow`, `// best-effort`, `// fail-safe` yorumlarıyla işaretlenmiş ~200+ catch bloğuna sahiptir. Çoğunluk bilinçli ve doğrulanmış olsa da bir kısmı **bağlam fakiri** veya **kategorik aşırı geniş** kapsama sahiptir. Tespit edilen problemli yutmalar:

1. **A1 [HIGH] — `src/orchestra/event-bus.ts:102-104`**: `EventEmitter.emit('event', event)` etrafındaki try/catch yalnızca `// swallow` yorumlu, hiçbir log/breadcrumb yok. Sprint 169 spurious NO_GO RC'sinde event stream akışı kritik gözlem yüzeyiydi; burada sessiz yutma observability boşluğu yaratır. Sub bağ: aynı dosya `:189` (`// ignore`) ve `:236` (`// ignore cleanup errors`) ek olarak `debugLog` çağırmadan yutar.

2. **A2 [HIGH] — `src/agents/worker-ipc.ts:193-195` ve `:239-241`**: Brain↔Worker IPC kanalında handler hatalarını "Swallow handler errors to keep channel stable" gerekçesiyle yutar. Niyet doğru (kanal stabilitesi) ancak hata gözlem yüzeyi sıfır — `debugLog`/event stream emit yok. Bir IPC mesaj parsing hatası tüm sprint boyunca kayıt bırakmadan geçebilir.

3. **A3 [NORMAL] — `src/cli/commands/status.ts:89-91` ve `:102-104`**: CLI status komutunda iki kez koşulsuz `// ignore`. CLI seviyesinde okuma hatası kullanıcıya görünmediğinde "neden boş status?" sorusu kalır. Kullanıcı-facing CLI yüzeyinde sessiz yutma kötü UX.

4. **A4 [NORMAL] — `src/cli/commands/upgrade.ts:115-117`, `:135-137`, `:170-172`**: Upgrade akışında üç farklı yerde `// ignore` (npm registry sorgusu, version detection, package install kontrolü). Kullanıcı `deckent upgrade` çalıştırıyor — sessiz başarısızlık "neden bir şey olmadı?" şikayetine açık kapı.

5. **A5 [LOW] — `src/cli/commands/onboard.ts:21-23`, `:75-77`, `:94-96`**: Onboarding wizard'da üç yerde `// ignore` / `// fall through with basic detection`. Onboarding ilk-temas yüzeyi, sessiz failure UX'i bozar.

6. **A6 [LOW] — `src/core/notification-providers/webhook.ts:86-88`**: Webhook log yazımında "Silently ignore log errors" — webhook delivery audit trail beklentisi ile çelişiyor; log yazımı başarısız olursa hangi webhook'un kaybolduğu izlenemez.

### B. Boundary try/catch Eksikleri — 5 bulgu

JSON.parse, subprocess çağrısı, DB I/O, dosya I/O ve network çağrılarının kritik yollarda try/catch koruması olup olmadığı denetlenmiştir.

1. **B1 [HIGH] — `src/orchestra/sprint-controller.ts:219-225` `readTaskJsonFresh`**: Sprint 168 C0c RC3'te eklenen "always-fresh disk read" yardımcısı. `existsSync` kontrolü dosya yokluğunu yakalar, ancak `JSON.parse(readFileSync(path, 'utf-8'))` çağrısı `SyntaxError` veya `EACCES`/`EISDIR` gibi okuma hatalarına karşı korumasız. JSDoc'taki "@throws Error when task.json file not found at expected path" iddiası eksik — bozuk JSON da fırlatır ama belgelenmemiş. Spawn pipeline (`sprint-spawner`) ve recovery yollarından çağrıldığı için, manuel patch'lenmiş kötü JSON tüm sprint başlatmayı uçurabilir. Karşılaştırma: `src/agents/worker.ts:202-213` `readTask` fonksiyonu aynı işlem için `SyntaxError` ↔ `DECKENT_E060`, generic ↔ `DECKENT_E061` ayrımlı tipli hata üretir — bu kanonik desendir.

2. **B2 [HIGH] — `src/core/memory-store.ts` (tüm dosya)**: `MemoryStore` sınıfının hiçbir public/private metodu try/catch bloğu içermiyor (grep `try {` = 0 eşleşme, dosya boyu ~700+ satır). better-sqlite3 `prepare`/`run`/`get`/`all` hataları (`SQLITE_BUSY`, `SQLITE_CORRUPT`, `SQLITE_FULL`, FK constraint ihlali) doğrudan çağırana sızar. Sprint 169 H1/C1/C2 RC'lerinde DB yazımı kritik yoldu — burada DB error handling stratejisi tasarım gereği "fail-fast bubble-up" olabilir, ancak bu **belgelenmemiş** ve `notify-adapters`, `sprint-finalizer`, `task-builder` gibi çağıranların hepsi try/catch ile sarmıyor. Sonuç: tek bir DB hatası tüm sprint'i çökertebilir. (Yalnızca 2 satırda `throw new DeckentError` — orphan FK doğrulaması; bu, B2'nin alt-kümesi olan **manuel** doğrulama yutmasıdır.)

3. **B3 [NORMAL] — `src/core/pricing-updater.ts:82-89` ve `:115-122`**: `fetchLiteLLMPricing` ve `fetchOpenRouterPricing` — `fetch(LITELLM_URL)` çağrısı `await fetch` üzerinde **try/catch yok**. `response.ok` kontrolü HTTP-level hatalar için var, ancak ağ kopması (DNS hatası, TLS reset, AbortError) `TypeError: fetch failed` fırlatır ve çağırana sızar. Network kullanan tek nokta olduğu için "sprint başlatma zamanı network yok → bütün CLI çıkar" senaryosu mümkün. **Timeout yok** ek olarak — fetch sonsuz beklemeye düşebilir.

4. **B4 [NORMAL] — `src/core/anthropic-http-client.ts:185`**: "Ignore parse errors for error bodies" — Anthropic API hata gövdesi JSON.parse hatası yutuluyor; ancak primary akış (success body parse) `JSON.parse` üzerinde try/catch denetimi yok (sadece error path için var). Sprint 165 GA prep beta için kritik: bozuk yanıt → unhandled exception → claude provider çökmesi.

5. **B5 [LOW] — `src/orchestra/sprint-controller.ts:174-182` `emitSprintEvent`**: try/catch var ancak `// Never let event emission break sprint flow` yorumu hata türüne bakmıyor — synchronous `eventBus.emit` hatası yutulurken aynı zamanda asenkron subscriber error path'i (event-bus.ts:88-92) ayrı bir akışta yutuluyor. Çift katman yutma sağlam ama observability açısından `debugLog` çağırmıyor — Sprint 138 Task 6 Layer 4 fail-safe pattern'i ile birebir uyumsuz (oradaki örnekte breadcrumb logging var).

### C. Fail-safe/Fallback Pattern Doğrulama — 3 bulgu

ADR-035 Layer 4 fail-safe enforcement gerçekten kod yolunda görünür durumda mı kontrol edildi.

1. **C1 [GO — POZİTİF DOĞRULAMA] — `src/orchestra/authority-enforcer.ts:427-429`, `:619-621`, `:644-646`**: ADR-037 RBAC runtime enforcement'ta üç yerde **doğru** fail-safe pattern var: `// Fail-safe: event stream write failure must not crash the sprint`, `// Fail-safe: event write failure must not block enforcement`, `// Double fail-safe`. Pattern Sprint 138 Task 6 ile uyumlu. **Bulgu:** Aynı pattern'e (`event-bus.ts` ve `worker-ipc.ts` gibi) `debugLog` breadcrumb eklenmemiş — fail-safe yutma uniform değil.

2. **C2 [HIGH] — `src/orchestra/spawn-backend-docker.ts:827-829`**: Docker exitCode>0 + `.result` parse path'inde "JSON parse fail or fs error → keep honest FAILED status" — niyet doğru ama **partial-result promotion akışı** ile etkileşimi mantık hatasına gebe. Aynı dosya `:857-861` `try { unlinkSync(resultPath); } catch { /* ok */ }` ile bozuk .result'ı silip, `:868-879` `.partial-result`'tan üretiyor. Kanonik partial-write recovery zinciri sağlam, ancak **bozuk .result silindikten sonra partial yoksa** taskId sonsuza dek "FAILED no-result" durumunda kalır — fail-safe boundary'leri kademesi belirsiz.

3. **C3 [NORMAL] — `src/orchestra/mid-sprint-adapter.ts:338-435` `reconcileSpuriousNoGo`**: Sprint 169 RC'sinin tam çıktığı yer. Heuristik üç check (git diff + tsc + vitest pass ratio) — her birinin **kendi içinde try/catch'ı yok**. `runGitDiff`, `runTsc`, `runVitest` çağrılarından biri throw ederse reconcile fonksiyonu unhandled exception ile sonlanır → Brain çökerse spurious NO_GO **olduğu gibi kalır** (reconcile yapılamamış olur). Sprint 138 honest assessment calibration v2 burada Layer 4 fail-safe bekliyor ama yok.

---

## 2. Severity Özeti

| Severity | Adet | Bulgu ID'leri |
|---|---|---|
| **CRITICAL** | 0 | — |
| **HIGH** | 5 | A1 (event-bus swallow), A2 (worker-ipc swallow), B1 (readTaskJsonFresh JSON.parse), B2 (memory-store DB error sızıntısı), C2 (docker .result silme sonrası boşluk) |
| **NORMAL** | 5 | A3 (status.ts), A4 (upgrade.ts), B3 (pricing fetch timeout), B4 (anthropic-http parse), C3 (reconcileSpuriousNoGo unwrapped subprocess) |
| **LOW** | 3 | A5 (onboard.ts), A6 (webhook log), B5 (emitSprintEvent breadcrumb yok) |
| **POZİTİF** | 1 | C1 (authority-enforcer fail-safe pattern uygulanmış) |

**Toplam:** 14 bulgu.

**Sprint 169 Spurious NO_GO ile İlişki:** Sprint 169 RC analizi (memory.db `Bug Z3`, `H1`, `Sprint 169 Learnings`) `reconcileSpuriousNoGo` heuristic ve event stream gözlem yüzeyinin yetersiz olduğunu işaret etmiş. Bu denetimde C3 + A1 + A2 üçü birden o RC'nin **alt-derinlik tekrarı**: hata yutmanın sessizliği, spurious NO_GO'nun Brain tarafından "neden olduğu" bilinmeden gelmesinin ana yapısal kanalıdır. C2 (docker .result silme) ayrı bir başlık ama yine spurious-NO_GO yüzeyi (worker biterken yarım .result yutulup boş bırakılırsa Brain'in NO_GO görme olasılığı).

---

## 3. Kanıt

Tüm bulgular **file:line** kanıtlı. Aşağıda kritik HIGH/NORMAL kalemler için doğrudan alıntılarla doğrulama:

### A1 — event-bus.ts swallow yorum bağlam fakiri
```text
src/orchestra/event-bus.ts:100-104
    try {
      this.emit('event', event);
    } catch {
      // swallow
    }
```
`debugLog` çağrısı yok, hata bağlamı kayboluyor.

### A2 — worker-ipc.ts handler errors
```text
src/agents/worker-ipc.ts:193-195
      } catch {
        // Swallow handler errors to keep channel stable
      }

src/agents/worker-ipc.ts:239-241
            } catch {
              // swallow
            }
```
Brain↔Worker bandwidth boyunca observability sıfır.

### B1 — readTaskJsonFresh korunmasız JSON.parse
```text
src/orchestra/sprint-controller.ts:217-225
 * @throws Error when task.json file not found at expected path.
 */
export function readTaskJsonFresh(projectRoot: string, taskId: string): Task {
  const path = join(projectRoot, TASKS_DIR, `task-${taskId}.json`);
  if (!existsSync(path)) {
    throw new Error(`task.json not found: ${path}`);
  }
  return JSON.parse(readFileSync(path, 'utf-8')) as Task;
}
```
SyntaxError yutulmuyor, doc string eksik. Karşılaştırma:
```text
src/agents/worker.ts:202-213
export function readTask(projectRoot: string, taskId: string): Task {
  const path = taskFilePath(projectRoot, taskId);
  try {
    const content = readFileSync(path, 'utf-8');
    return JSON.parse(content) as Task;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw ErrorRegistry.createError('DECKENT_E060', { message: `Invalid JSON in task file: ${path}` });
    }
    throw ErrorRegistry.createError('DECKENT_E061', { message: `Task file not found: ${path}` });
  }
}
```

### B2 — memory-store.ts try/catch sayısı = 0
```text
$ grep -c "try {" src/core/memory-store.ts
0
```
~700+ satır, 6 MADR tip + FTS5 + relations + history + decay tüm fonksiyonların **hiçbiri** try/catch sarmıyor.

### B3 — pricing-updater fetch wrapper yok
```text
src/core/pricing-updater.ts:82-89
export async function fetchLiteLLMPricing(): Promise<Record<string, LiteLLMModelEntry>> {
  const response = await fetch(LITELLM_URL);
  if (!response.ok) {
    throw new CostConfigError(`LiteLLM fetch failed: ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as Record<string, LiteLLMModelEntry>;
  return data;
}
```
`fetch` network failure throw'ı + `response.json()` parse hatası — ikisi de yakalanmıyor. Timeout yok.

### B4 — anthropic-http-client error body asymetri
```text
src/core/anthropic-http-client.ts:185
      // Ignore parse errors for error bodies
```
Hata gövdesi JSON.parse yutulurken success body için aynı koruma seviyesi belgelenmemiş.

### C2 — Docker partial-result silme zinciri
```text
src/orchestra/spawn-backend-docker.ts:850-862
      const timeoutPath = join(tasksDir, `task-${taskId}.timeout`);
      // Sprint 149: Partial write detection — .result exists but corrupt JSON
      if (existsSync(resultPath) && exitCode !== 0) {
        try {
          const raw = readFileSync(resultPath, 'utf-8');
          JSON.parse(raw); // Just validate — if corrupt, overwrite below
        } catch {
          debugLog('docker-backend:partial-write', ...);
          try { unlinkSync(resultPath); } catch { /* ok */ }
          // Fall through to the fallback writer below
        }
      }
```
Bozuk `.result` silindikten sonra `.partial-result` yoksa (Sprint 151 fix farklı kod blok) son yutma boş bırakır.

### C3 — reconcileSpuriousNoGo subprocess unwrap
```text
src/orchestra/mid-sprint-adapter.ts:338-435 — runGitDiff/runTsc/runVitest çağrıları
fonksiyon bodysinde try/catch görünmüyor; alt çağrıların throw etmesi durumunda
reconcileSpuriousNoGo'nun kendisi unhandled exception fırlatır.
```

### A3 — status.ts iki kez koşulsuz ignore
```text
src/cli/commands/status.ts:89-91
  } catch {
    // ignore
  }

src/cli/commands/status.ts:102-104
  } catch {
    // ignore
  }
```

### A4 — upgrade.ts üç kez ignore
```text
src/cli/commands/upgrade.ts:115-117, :135-137, :170-172
  } catch {
    // ignore
  }
```

### C1 — POZİTİF: authority-enforcer doğru pattern
```text
src/orchestra/authority-enforcer.ts:427-429
} catch {
  // Fail-safe: event stream write failure must not crash the sprint
}

src/orchestra/authority-enforcer.ts:619-621
} catch {
  // Fail-safe: event write failure must not block enforcement
}

src/orchestra/authority-enforcer.ts:644-646
} catch {
  // Double fail-safe
}
```

---

## 4. Öneriler

Önerileri **uygulama eforu** ve **Sprint 172 OSS GA blocker** karakteri ile sıralıyorum.

### Sprint 172 öncesi MUTLAKA (HIGH):

1. **B1 — `readTaskJsonFresh` defansif sarmalama** (~10 dakika)
   Aynı `worker.ts:readTask` pattern'ini sprint-controller.ts:219'a uygula. SyntaxError → DECKENT_E060, fs read error → spesifik tipli hata. JSDoc'u güncelle.

2. **B2 — `MemoryStore` boundary kontratı** (~2 saat — tasarım kararı ile)
   İki yol: ya (a) tüm public method'ları try/catch ile saran wrapper sınıf + `DeckentError` map'lemesi, ya da (b) "DB hatası fail-fast" stratejisini ADR olarak yaz ve TÜM çağıran yerlerde try/catch zorunlu hale getir. (b) daha az LoC, daha net kontrat. **Öneri: (b) + memory-store doc başlığına "error contract: throws on DB failure; caller MUST wrap" ekle.**

3. **A1 + A2 — Event/IPC swallow'larına `debugLog` zorunlu** (~30 dakika)
   `event-bus.ts:103, 189, 236` ve `worker-ipc.ts:194, 240` toplam 5 noktaya `debugLog('event-bus:swallow', err)` benzeri breadcrumb ekle. Yutma kararı doğru ama observability sıfır → kademeli düzeltme.

4. **C2 — Docker partial-result fallback chain idempotency testi** (~1 saat)
   `spawn-backend-docker.ts:850-880` zincirinde "bozuk .result + .partial-result yok" senaryosu için unit test ekle. Mevcut Sprint 149 + 151 fix'leri korunsun, ama "son ihtimal" path'i (her ikisi de yok) **deterministik NO_GO** ile sonlansın.

### Sprint 172 sonrası iyileştirme (NORMAL):

5. **B3 — `pricing-updater.ts` AbortSignal + try/catch** (~20 dakika)
   `fetch(URL, { signal: AbortSignal.timeout(10_000) })` + try/catch wrapper. Network kopması artık CLI'yi uçurmasın.

6. **B4 — `anthropic-http-client.ts` parse error symmetry** (~15 dakika)
   Success body parse'ı için de `try { parsed = JSON.parse(text) } catch (e) { throw new AnthropicHttpError(...) }` ekle.

7. **C3 — `reconcileSpuriousNoGo` fail-safe wrapper** (~30 dakika)
   `runGitDiff`/`runTsc`/`runVitest` çağrılarını try/catch ile sar; reconcile başarısız olduğunda log + `reconciled: false, notes: 'reconciler crashed'` döndürsün. Sprint 169 RC ile DİREKT bağlı.

8. **A3 + A4 — CLI seviye ignore'lara debug log + non-zero exit eklemesi** (~1 saat)
   Kullanıcı-facing CLI'da sessiz fail UX'i bozar. En azından `debugLog` ekle, `DECKENT_DEBUG=1` ile görünür olsun.

### Sprint 172 sonrası polish (LOW):

9. **A5 — onboard.ts**: en azından "(fall through)" mesajı stderr'e yaz.
10. **A6 — webhook log**: log yutma yerine in-memory buffer; webhook delivery log audit gerekirse sonradan dump edilebilir.
11. **B5 — emitSprintEvent breadcrumb**: `debugLog('sprint-controller:emit', err)` eklemesi.

### Mimari Öneri (ADR adayı):

Sprint 138 Task 6 Layer 4 fail-safe pattern'i **kodlanmamış bir konvansiyon**. Bunu **ADR-061** veya proposed bir ADR olarak resmileştir: **"Tüm fail-safe try/catch blokları (yorum içinde 'fail-safe', 'best-effort', 'never throw' geçen) zorunlu olarak `debugLog(context, err)` çağırmalı."** Sprint 171 audit'inde 5 HIGH bulgunun 3'ü bu kuralın sistematik eksikliğinden geliyor.

---

## 5. Sonuç Beyanı

Bu rapor **audit-only**: hiçbir kaynak/test/config/db dosyası değiştirilmedi. Sadece `docs/audits/sprint-171/error-handling.md` yazıldı (scope ihlali yok). memory.db **sadece okuma** amaçlı bilgi olarak referans verildi, hiçbir SQL çalıştırılmadı.

**14 bulgu** — 5 HIGH (Sprint 172 OSS GA öncesi ele alınmalı), 5 NORMAL (post-GA iyileştirme), 3 LOW (polish), 1 POZİTİF doğrulama (authority-enforcer). Hata yutmanın sistemik karakteri Sprint 169 spurious NO_GO RC'siyle örtüşüyor — özellikle C3 ve A1+A2 üçlüsü o RC'nin **alt-derinlik tekrarıdır**. memory-store.ts'in baştan sona try/catch'siz oluşu (B2) tasarım kararı olabilir ama kontrat olarak belgelenmemiş; OSS GA öncesi netleştirme gerekiyor.

**Sentez girdisi:** Task 29 SYNTHESIS bu raporu (a) "swallow yutması" sistematik patterni, (b) Sprint 169 RC alt-derinlik tekrarı, (c) memory-store boundary contract eksiği üç manşeti altında konsolide etmelidir.
