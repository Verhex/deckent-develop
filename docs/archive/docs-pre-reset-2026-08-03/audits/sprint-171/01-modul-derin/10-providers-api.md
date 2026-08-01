# providers/ + api/ Audit — Sprint 171 (Task 171-010)

> **Kapsam:** `src/providers/**` (5 dosya, 1 675 LoC) + `src/api/**` (4 dosya, 1 083 LoC). Toplam 9 dosya, 2 758 LoC.
> **Yöntem:** Char-level okuma, çapraz referans `event-stream.ts` (Sprint 170 P0-6 doğrulaması), `connectors/incoming-router.ts` (webhook validation), ADR-006/-017/-035 enforcement noktaları.
> **Tür:** Audit-only — hiçbir kaynak/kod modifiye EDİLMEDİ. Sadece bu rapor yazıldı.

---

## 1. Bulgular (Findings)

### B1 — `PROMPT_WRITE` / `PROMPT_DELETE` kanalları event-stream'de **YOK**, claude.ts cleanup'ı emit etmiyor (Sprint 170 P0-6 doğrulandı)

ADR-035 Brain ↔ Worker ↔ Auditor Verification Protocol'una göre yan etki yapan adımların (prompt dosyası yazımı/silinmesi) event stream'e yazılması gerekir. `src/orchestra/event-stream.ts:51-93` içindeki `CHANNELS` sabiti 22 kanal listeler; ancak prompt yaşam döngüsü için tek bir kanal yok. `src/providers/claude.ts:147-164` (`_cleanupOrphanedPromptFiles`) ve `src/providers/claude.ts:122-124` (`kill()` sonrası cleanup) `cleanupPromptFile()` çağrısı yapar, fakat hiçbir `appendEvent` / event-stream entegrasyonu yoktur. Bunun anlamı: ADR-048 ("Prompt Lifecycle Contract") runtime'da audit-trail bırakmaz — gözlemcilik kopuk, Sprint 170'in P0-6 bulgusu hâlâ açık.

### B2 — `gemini.ts:309-311` API anahtarı **shell komutunu metin olarak gömüyor** → süreç listesi/log/shell history secret leak'i

`buildStreamCommand(model, promptPath)` döndürülen string'i metinsel olarak render eder ve `apiKey` değerini doğrudan `-H "x-goog-api-key: ${apiKey}"` içine basar. Eğer bu komut bir log dosyasına yazılır, dry-run amaçlı kullanıcı ekranına döner veya bir kabuk geçmişine düşerse gerçek `GOOGLE_API_KEY` plaintext sızar. `buildApiScript:385-410` ve `buildStreamingApiScript:417-460` aynı paterni tekrarlar (üstelik `@deprecated` etiketi olmasına rağmen public export olarak duruyor → hâlâ erişilebilir).

### B3 — `codex.ts:82-155` `spawn()` API anahtarı **kontrolsüz**, hata `.result` olarak yansımıyor (silent failure)

Codex provider `spawn()` içinde model + worker duplicate kontrolü dışında auth kontrolü yapmaz. `detectAuthMode()` yalnızca `isAvailable()` çağrısında devreye girer. API anahtarı set değilse codex CLI hata ile çıkar, fakat `codex.ts:150-154` `child.once('exit', ...)` kapanış handler'ı sadece `workers` Map'inden silme yapar — `subprocess.ts:196-211` benzeri **fallback `.result` yazımı YOK**. Sonuç: Brain `.result` bekler, worker exit eder, sprint askıda kalır (spurious NO_GO / stale-heartbeat). Aynı sorun `gemini.ts:250-254` için de geçerlidir (orada en azından `spawn` öncesinde `getApiKey()` `ProviderError` fırlatır — graceful; Codex'te bu yok).

### B4 — Codex/Gemini ↔ Subprocess fallback asimetrisi (eksik prosedür)

`subprocess.ts:196-211` çocuk süreç sonlandığında `existsSync(resultPath)` false ise zorlayıcı bir fallback `.result` (exit code → `GO_WITH_TECH_DEBT`/`NO_GO`) yazar. Codex (`codex.ts:150-154`) ve Gemini (`gemini.ts:250-254`) eşdeğer korumayı uygulamaz; ADR-035 Layer 4 fail-safe sözleşmesi mimari olarak ihlal edilir. ADR-017 MCP-Native Provider Adapter beklentisinin gerçeklemesi tek tip değil.

### B5 — `api/server.ts:406-421` `/api/worker/:taskId/log` **path traversal** açık

`url.slice('/api/worker/'.length, -'/log'.length)` ile alınan `taskId` üzerinde regex doğrulaması yapılmaz (oysa `WORKER_ID_RE = /^[a-zA-Z0-9-]+$/` aynı dosyada `:551-556` `/api/kill/` için tanımlıdır). `join(projectRoot, TASKS_DIR, "task-${taskId}.json")` çağrısı `taskId="../../etc/passwd"` gibi bir girişle proje kökü dışı bir yola çözümlenebilir. Auth zorunlu olduğu için kötü niyetli erişim yetkilendirilmiş kullanıcıya kısıtlanır; yine de **kötü niyetli bir API token sahibi** path-escape ile keyfi `.json` dosyalarını sızdırabilir → **HIGH güvenlik bulgusu**.

### B6 — `api/server.ts:51-76` ile `api/rate-limiter.ts` **iki ayrı RateLimiter** — dead/duplicate kod

`server.ts:51-76` içinde basit bir `RateLimiter` sınıfı tanımlanmış ve `:798` üzerinden kullanılıyor. Aynı zamanda `src/api/rate-limiter.ts` (95 LoC, daha gelişmiş `Bucket`+cleanup) dosyası mevcut. `Grep "rate-limiter"` ile yapılan tarama bu dosyanın yalnızca `tests/api/rate-limiter.test.ts` tarafından import edildiğini, üretim kodunda hiç çağrılmadığını gösteriyor. **Sonuç:** `src/api/rate-limiter.ts` tamamen ölü kod; aynı zamanda mantıksal olarak server.ts'deki gömülü sınıftan **üstün** olduğu için yanlış (eski) implementasyon kullanılıyor.

### B7 — `api/server.ts:54` `RateLimiter.store` haritası **temizlenmiyor** → bellek sızıntısı (DoS amplifikasyonu)

Yerleşik `RateLimiter` `Map<string, RateLimitEntry>` üzerinde sadece pencere geçmiş entry'leri **üzerine yazar** (`:64-66`); eski IP'ler hiç silinmez. Uzun ömürlü süreçte (saatler/günler) `store` her benzersiz IP için bir kayıt biriktirir. Mitigasyon `reset()` yalnızca testten çağrılır. `rate-limiter.ts:69-75`'teki gerçek `cleanup()` ölü kod nedeniyle yararsız. DoS yüzeyini büyütür.

### B8 — `api/server.ts:113` `activeJobs` Map'i **temizlenmiyor** (sınırsız büyüme)

Tamamlanan veya başarısız iş kayıtları `activeJobs` Map'inde sonsuza dek kalır. `_resetActiveJob()` `:116-118` yalnızca test bağlamından çağrılır. Uzun ömürlü deckent servisinin tek-sınırlama hattı yeniden başlatma. Memory leak.

### B9 — `claude.ts:204-227` `buildCommand` shell-string formatı **çağrı bağlamında güvensiz yapı** üretebilir

`buildCommand`'in döndürdüğü dize doğrudan shell tarafından parse edilir formattadır (`claude -p - --model ${model} < ${promptPath}`). Üretim spawn yolu `spawnWorker` array-arg kullanırken (ADR-006 uyumlu, güvenli), `buildCommand` çıktısı bilgi/dry-run amacıyla kullanıcı arayüzlerine bastırılırsa **yapıştır-çalıştır** istismarı doğar (`promptPath` veya `allowedTools` shell metakarakteri içerirse). Aynı patern `codex.ts:260` ve `gemini.ts:294-299` için de geçerlidir. Doğrudan exploit gerektirmez, ancak bilgilendirici çıktının da güvenli olması beklenir (savunma katmanı).

### B10 — `gemini.ts:385-410` ve `:417-460` `buildApiScript`/`buildStreamingApiScript` `@deprecated` ama **public export** — dead-ish, ayrıca string concat injection

İki fonksiyon JSDoc içinde `@deprecated` olarak işaretlenmiş, kullanılmıyor (proje içinde grep sonucu sıfır). Ancak `public` (`buildApiScript`, `buildStreamingApiScript`) olarak kalmış. Üstelik prompt escape mantığı sadece backslash/quote/newline'a bakar (`:387-391`); JS string literal'da unicode line terminator (U+2028/U+2029) veya `</script>` tarzı dış kaçışları kapsamaz. **Öneri:** Sil (ADR-038 disposition: SİL — kullanıcı yok, yüzeyi sızdırıyor).

### B11 — `claude.ts:25` `ClaudeBackend = 'tmux' | 'subprocess' | 'mcp'` — `mcp` **eksik yetenek** ve hata yolu tek satır

`spawn()` `:94-96` MCP backend seçilirse `ProviderError` fırlatır. ADR-017 "MCP-Native Provider Adapters" iddiası ile çelişir: kodda MCP yolu **boş kabuk** olarak duruyor. `MCP_NOT_IMPLEMENTED_MESSAGE` mesajı "deferred past Sprint 048" diyor — yani 120+ sprint boyunca yer tutucu. Bu, tip seviyesinde geçerli ama runtime'da daima exception üreten bir yola işaret eder (type-safety drift); kullanıcı `claude_backend: 'mcp'` ayarlarsa anlamsız hata alır.

### B12 — `subprocess.ts:160-163` heartbeat **15 saniyelik setInterval** çocuk exit'i sonrası clearInterval'a güvenir → race window

`exit` event handler'da `clearInterval(hbInterval)` çağrılır. Eğer exit handler bir nedenle gecikirse veya event sırası karışırsa (Node'un event loop yoğunken) interval kısa süreyle exit sonrası tekrar HB yazabilir → stale `.hb` file. Düşük olasılık, ancak Sprint 170 stale_heartbeat patternine (`monitor-connectors` raporuna eşlik) küçük bir katkı.

### B13 — `api/server.ts:46-69` Custom `RateLimiter` `windowMs` reset entry'yi günceller, **eski entry exhausted ise IP sıfırlanır** — bypass

`check(ip)` `:62` "now >= entry.resetAt" durumunda **yeni pencere yazar** (sayaç 1). Bu kuralın kendisi standart. Ancak `entry.count <= this.maxRequests` zorlaması basit eşitlik. **Asıl sorun**: hız limiti yalnızca `req.socket.remoteAddress` ile çalışır (`:268`); X-Forwarded-For veya benzeri reverse proxy başlıkları okunmaz → reverse proxy arkasında tüm trafik tek IP olarak limitlenir (false-positive); doğrudan internet'e bağlıysa attacker farklı kaynak IP'lerle eşit kolaylıkla bypass eder. OSS GA için belge gerekli.

### B14 — `api/server.ts:439-470` Static dosya servisi: `urlPath = url.split('?')[0]` query strip iyi, ancak `decodeURIComponent` YOK

URL encoded path traversal denemeleri (`%2e%2e%2f`) için Node `resolve()` Unicode escape'i normalize edebilir; yine de `urlPath.slice(1)` argümanı `resolve` tarafından `..` segmentlerinde normalize edildiği ve `startsWith(resolve(staticDir))` kontrolü yapıldığı için **çıkış engelli**. Bu kontrol görünür biçimde sağlam; ancak savunma derinliği için açık `decodeURIComponent` + bir kez daha `startsWith` doğrulaması önerilir. **Düşük seviye not** (bulgu değil — savunma derinliği önerisi).

### B15 — `gemini.ts:60-93` JSON parse fallback'i **plain stdout'u sessizce response olarak döndürür** (tip güvenliği zayıf)

`parseGeminiOutput` `JSON.parse` başarısızsa `return { response: stdout.trim() }` döner. Bu, Gemini CLI'nin beklenmedik HTTP/HTML hata sayfası, "API key invalid" düz metni vb. çıktıları **sahte başarılı yanıt** olarak ileri sürebilir. Brain üst katmanda doğrulama yapmazsa, bozuk içerikle planlama yapılır. ADR-035 Layer 4 fail-safe için yetersiz.

### B16 — `gemini.ts:34-39` `GEMINI_TIER_MODELS` `@deprecated` — eski tier alanı `premium_plus` modeli için `getByProviderAndTier` çağırırken **null fallback'i sertleştirilmemiş**

`get premium_plus()` zincirinde sırasıyla 3 fallback (`getByProviderAndTier` → `getModelForProviderTier('premium')` → string literal `'gemini-2.5-pro'`) ile güvenli; ancak `as GeminiModel` tip-assertion'ı runtime'da kontrol etmez. ModelRegistry değiştirilirse runtime'da literal değer geçerli model değilse sessizce sıkıntı çıkar. Düşük öncelikli tip-güvenliği bulgusu.

### B17 — `api/server.ts:103` `WORKER_ID_RE = /^[a-zA-Z0-9-]+$/` — `kill/` ile `worker/log` arası **tutarsız** kullanım

`/api/kill/:workerId` `:556` regex'i uygular; `/api/worker/:taskId/log` `:406-421` taskId üzerinde **hiç doğrulama yapmaz**. Aynı kimlik düzeni için ikili standart — B5'in mimari kökü.

### B18 — `sandbox.ts:115-123` Network block **best-effort proxy env vars** — DNS lookup ve `0.0.0.0` `unix socket` blokajlanmıyor

`http_proxy=http://127.0.0.1:0` ayarı yalnızca proxy farkındalığı olan kütüphaneleri etkiler; düşük seviye `net.connect()`, DNS, IPC, raw socket kullanan kod proxy'i atlar. Doküman/JSDoc "best-effort" diyor (`:115`), ancak bu güvenlik garantisi olmadığı OSS GA için net belirtilmeli. Mevcut JSDoc yeterli; ek satır gereksiz.

### B19 — Provider'larda `tokenUsage` izleme **eksik**: Codex/Gemini `.result`'a token bilgisi yazmaz

Sprint 140'tan beri sözleşme `tokenUsage` ZORUNLU. Subprocess fallback (`subprocess.ts:200-208`) ve Codex/Gemini exit handler'ları `tokenUsage` alanı koymaz. Worker düzeyinde Brain prompt'una talimat veriliyor, ama provider düzeyinde fallback yazımı kopuk. Geminin `parseGeminiOutput` `:81-87` `usageMetadata` çıkarıyor; bu değer kullanılmıyor (provider istemcisinde) → gerçek token sayımı kaybediliyor. Maliyet doğruluğu için orta öncelik.

### B20 — `claude.ts:181-196` `isAvailable()` `claude --version` zaman aşımı **5 sn**, retry yok; tek-noktalı arıza

Tek-shot probing yeterli olmayabilir (Docker pull, slow shell init). Bu doğrudan sprint başlangıcında provider seçim mantığını etkiler — ilk probing yanlış çıkarsa Codex/Gemini'ye fallback yapılabilir. Tek-noktalı arıza, OSS kullanıcı yarış koşullarına açık. Düşük öncelik.

### B21 — `api/server.ts:46-50` ile `api/rate-limiter.ts:13-19` `RateLimitResult` tipleri **uyumsuz**

Server gömülü `check(ip): boolean` döndürürken, gerçek modül `{ allowed, remaining, retryAfter? }` döndürür. HTTP yanıtında `Retry-After` başlığı eksik (rate-limit aşıldığında `:269-272` sadece 429 + "Too Many Requests"). RFC 6585 § 4 'e göre `Retry-After` zorunlu olmamakla birlikte beklenir. OSS GA için profesyonellik kaybı.

### B22 — `subprocess.ts:142-146` `LANG=en_US.UTF-8` env hardcoded — çok dilli ortam için **kıyıda risk**

Sistem locale Türkçe/Rusça olan kullanıcılarda Worker child süreci her zaman İngilizce locale ile çalışır. Çoğu durumda doğru karar (deterministik), ancak Türkçe regex/ı-i collation kullanan downstream araçlar bunun farkında olmayabilir. Doküman not ekleyin.

### B23 — `api/server.ts:174-175` `readDashboardJson` JSON cevabı tip olarak `unknown` döndürür → tip güvenliği

Dashboard'a anonim `unknown` paylaşılıyor — istemci tarafı tipi tahmin etmek zorunda. Sözleşmenin (`.contracts/api-surface.md`) HTTP yanıt şemasını formalize ettiği görülmüyor. OSS GA için OpenAPI/Zod tip ihracatı önerilir.

### B24 — `server.ts:262-263` URL normalize regex `'/api/v1/'` → `'/api/'`: **çift versiyon trafiği** unify; ancak gelecek `v2` patternine genişlemiyor

İleride v2 eklenmek istenirse normalize kuralı genişletmeli. ADR-022-v2 CLI/MCP feature parity için API versiyonlama stratejisi belirsiz.

### B25 — `api/server.ts:798` `RateLimiter` ctor sayısal default'u **dispatch site** override eder

`createHttpServer` `rateLimitMax = portOrOpts.rateLimit ?? 100` (`:768`) ile yerleşik defaultu (100) tekrarlıyor; rate-limiter modülünün default'u 60 — **tutarsız** beklenti. Düşük öncelik.

---

## 2. Severity

| # | Bulgu | Severity | Gerekçe |
|---|---|---|---|
| B1 | event-stream PROMPT_WRITE/DELETE kanalları yok | **CRITICAL** | ADR-035 + ADR-048 enforcement boşluğu, Sprint 170 P0-6 hâlâ açık, audit-trail kayıp |
| B2 | gemini.ts buildStreamCommand API key gömme | **CRITICAL** | Secret leak — OSS GA blocker, log/process listesinden GOOGLE_API_KEY sızar |
| B3 | codex.ts spawn API key kontrolsüz + .result fallback yok | **HIGH** | Sessiz arıza, sprint askıda kalır, false NO_GO |
| B4 | Codex/Gemini exit fallback eksik (subprocess'le asimetri) | **HIGH** | ADR-035 Layer 4 fail-safe ihlali |
| B5 | /api/worker/:taskId/log path traversal | **HIGH** | Auth'lu attacker keyfi .json sızdırabilir, OSS GA öncesi kritik |
| B6 | api/rate-limiter.ts dead code + yanlış implementasyon kullanımda | **MEDIUM** | Bakım borcu, daha iyi olan ölü |
| B7 | RateLimiter.store sınırsız büyür | **MEDIUM** | DoS amplifikasyonu, uzun ömürlü süreç |
| B8 | activeJobs Map sınırsız büyür | **MEDIUM** | Memory leak |
| B9 | buildCommand shell-string güvenliği | **MEDIUM** | Bilgilendirici çıktı yapıştır-çalıştır riski |
| B10 | gemini buildApiScript/Streaming @deprecated public | **MEDIUM** | Yüzey gereksiz, escape eksik |
| B11 | ClaudeBackend.mcp tip-runtime drift | **MEDIUM** | ADR-017 iddiası vs kod gerçeği |
| B12 | subprocess heartbeat interval race | **LOW** | Düşük olasılık, stale_heartbeat patternine küçük katkı |
| B13 | RateLimiter X-Forwarded-For yok | **LOW** | Reverse proxy desteği eksik, doküman gerekli |
| B14 | Static decodeURIComponent eksik (savunma derinliği) | **LOW** | Mevcut kontrol sağlam, ekstra katman |
| B15 | parseGeminiOutput sessiz plain-text fallback | **LOW** | Sahte başarılı yanıt riski |
| B16 | GEMINI_TIER_MODELS tip-assertion | **LOW** | Runtime kontrol yok |
| B17 | WORKER_ID_RE tutarsız kullanım | **LOW** | B5'in mimari kökü |
| B18 | sandbox network block best-effort | **LOW** | Doküman zaten not düşüyor |
| B19 | tokenUsage izleme provider katmanında eksik | **MEDIUM** | Sprint 140 sözleşmesi, maliyet doğruluğu |
| B20 | claude.ts isAvailable tek-shot 5sn probe | **LOW** | Yarış koşulu, OSS UX |
| B21 | RateLimitResult tip uyumsuzluğu + Retry-After yok | **LOW** | RFC profesyonelliği |
| B22 | LANG=en_US.UTF-8 hardcoded | **LOW** | Doküman önerisi |
| B23 | API yanıtları unknown — şema ihracatı yok | **LOW** | OpenAPI/Zod eksiği |
| B24 | URL v1→v normalize tek versiyonluk | **LOW** | İleriye dönük borç |
| B25 | rate-limit default sayı tutarsız | **LOW** | Kosmetik |

**OSS GA blocker:** B1, B2, B3, B5 (4 bulgu).

---

## 3. Kanıt (Evidence)

### B1 — Event-stream PROMPT kanalı yok

```bash
$ grep -n "PROMPT_WRITE\|PROMPT_DELETE" src/orchestra/event-stream.ts
(no matches)
```

`src/orchestra/event-stream.ts:51-93` CHANNELS sabitinde kayıtlı 22 kanal: `TASK_ASSIGN`, `HEARTBEAT`, `RESULT`, `QUESTION`, `ANSWER`, `CODE_VERIFY_REQUEST`, `VERIFICATION_RESULT`, `SCOPE_COLLISION_DETECTED`, `ADR_VIOLATION`, `GATE_COMPUTED`, `LOAD_REPORT_WRITTEN`, `METRIC_EMITTED`, `FIX_REQUEST`, `SPRINT_PHASE_CHANGE`, `NOTIFY`, `ORPHAN_HB_DETECTED`, `AUTHORITY_VIOLATION`, `TIMEOUT_ASSIGN`, `TIMEOUT_WARNING`, `TIMEOUT_CAP_EXCEEDED`, `TIMEOUT_EXTEND`, `SPAWN_BLOCKED`. Prompt yaşam döngüsü yok.

`src/providers/claude.ts:147-164` `_cleanupOrphanedPromptFiles()` event-stream import etmez; sadece `cleanupPromptFile()` çağırır. ADR-048 audit-trail boş.

### B2 — gemini.ts API key shell string'e gömülüyor

`src/providers/gemini.ts:308-311`:
```ts
const apiKey = this.getApiKey() ?? '<GOOGLE_API_KEY>';
const url = `${GEMINI_API_BASE}/${model}:streamGenerateContent?alt=sse`;
return `curl -s --no-buffer -X POST "${url}" -H "Content-Type: application/json" -H "${GEMINI_AUTH_HEADER}: ${apiKey}" -d @${promptPath}`;
```

`apiKey` gerçek değeri ile döner — bu string log'a, dashboard'a veya stderr'e basılırsa secret leak olur. `ps aux` çıktısında veya komut yapıştırıldığında shell history'de görünür.

### B3 — codex.ts spawn API key kontrolsüz

`src/providers/codex.ts:82-100` model + worker duplicate kontrolü dışında bir kontrol yok. `:111-116`:
```ts
const spawnEnv = { ...process.env };
const deckentKey = process.env['DECKENT_OPENAI_API_KEY'];
if (deckentKey && !spawnEnv['OPENAI_API_KEY']) {
  spawnEnv['OPENAI_API_KEY'] = deckentKey;
}
```

`spawnEnv.OPENAI_API_KEY` `undefined` kalsa bile spawn devam eder. `:150-154`:
```ts
child.once('exit', () => {
  const w = this.workers.get(taskId);
  if (w?.timeoutHandle) clearTimeout(w.timeoutHandle);
  this.workers.delete(taskId);
});
```

`subprocess.ts:196-211` benzeri `.result` fallback yazımı **yok**.

### B4 — Subprocess fallback var, Codex/Gemini'de yok

`src/providers/subprocess.ts:196-211`:
```ts
const resultPath = join(dir, TASKS_DIR, `task-${taskId}.result`);
if (!existsSync(resultPath)) {
  try {
    const fallback = {
      taskId, filesChanged: [], linesAdded: 0, linesRemoved: 0,
      testsPassed: code === 0,
      selfAssessment: code === 0 ? 'GO_WITH_TECH_DEBT' : 'NO_GO',
      notes: `Subprocess worker exited with code ${code ?? 'unknown'}. ...`,
    };
    writeFileSync(resultPath, JSON.stringify(fallback, null, 2), 'utf-8');
  } catch { /* non-fatal */ }
}
```

Gemini `:250-254` ve Codex `:150-154` exit handler'ları yalnızca `workers.delete(taskId)` çağırır.

### B5 — /api/worker/:taskId/log path traversal

`src/api/server.ts:406-421`:
```ts
if (url.startsWith('/api/worker/') && url.endsWith('/log')) {
  const taskId = url.slice('/api/worker/'.length, -'/log'.length);
  if (!taskId) { sendError(res, 400, 'Missing taskId'); return; }
  const taskPath = join(projectRoot, TASKS_DIR, `task-${taskId}.json`);
  ...
}
```

`WORKER_ID_RE.test(taskId)` doğrulaması yok. `taskId = "../../etc/passwd-foo"` → `taskPath = ".../task-../../etc/passwd-foo.json"` → `readJsonFile` boş döner ama path-escape gerçekleşir. `readWorkerLog` çağrısı da aynı taskId'i kullanır.

`src/api/server.ts:551-556` `/api/kill/`'de doğru doğrulama var:
```ts
if (!WORKER_ID_RE.test(workerId)) { sendError(res, 400, 'Invalid workerId'); return; }
```

Bu kontrol `:103`'te tanımlı ama `/api/worker/.../log` rotasında kullanılmıyor.

### B6 — api/rate-limiter.ts ölü

```bash
$ grep -rn "src/api/rate-limiter\|api/rate-limiter\|'./rate-limiter\|\"./rate-limiter" --include="*.ts" src/ tests/
tests/api/rate-limiter.test.ts:2:import { RateLimiter } from '../../src/api/rate-limiter.js';
```

Üretim kodu hiç import etmiyor. `src/api/server.ts:51-76` kendi `RateLimiter` sınıfını tanımlıyor ve `:798`'de kullanıyor.

### B7 — RateLimiter.store temizlenmiyor

`src/api/server.ts:51-76` `RateLimiter` sınıfı. `cleanup()`/zamanlanmış silme yok. `:62-66`:
```ts
if (!entry || now >= entry.resetAt) {
  this.store.set(ip, { count: 1, resetAt: now + this.windowMs });
  return true;
}
```

Pencere geçtikten sonra entry üzerine yazılır, IP kaydı silinmez. `:73-75` `reset()` yalnızca testte çağrılır.

### B8 — activeJobs sınırsız büyür

`src/api/server.ts:113`: `const activeJobs = new Map<string, ActiveJob>();`
`:116-118` `_resetActiveJob` yalnızca testte. Sprint sayısı arttıkça job kayıtları biriker.

### B9 — buildCommand shell-string

`src/providers/claude.ts:204-227`, `src/providers/codex.ts:255-261`, `src/providers/gemini.ts:294-300`. Üretim spawn yolu güvenli (array-arg), display çıktısı kullanıcı arayüzlerine basılırsa risk.

### B10 — gemini buildApiScript @deprecated public

`src/providers/gemini.ts:383-410` ve `:415-460` `@deprecated` JSDoc'lu, public method olarak kalmış. `Grep` projedeki tüketici sıfır:
```bash
$ grep -rn "buildApiScript\|buildStreamingApiScript" src/ tests/
src/providers/gemini.ts: (sadece tanımlandığı yer)
```

### B11 — claude.ts mcp backend boş

`src/providers/claude.ts:25` `export type ClaudeBackend = 'tmux' | 'subprocess' | 'mcp';`
`:94-96` `if (this.backend === 'mcp') { throw new ProviderError(MCP_NOT_IMPLEMENTED_MESSAGE, 'claude'); }`
`:181-183` `if (this.backend === 'mcp') return false;`

ADR-017 "MCP-Native Provider Adapters (Sprint 045)" accepted, kod yer tutucu.

### B12 — subprocess heartbeat race

`src/providers/subprocess.ts:158-163`:
```ts
let hbSequence = 0;
const hbInterval = setInterval(() => {
  hbSequence++;
  this.writeHeartbeat(taskId, dir, 'EXECUTING', hbSequence);
}, 15_000);
```

`:189-192`:
```ts
child.once('exit', (code) => {
  clearInterval(hbInterval);
  try { closeSync(logFd); } catch { /* already closed */ }
```

Async exit handler içinde clearInterval; setInterval async olarak çağrılmış olabilir → kısa pencere.

### B13 — X-Forwarded-For kullanılmıyor

`src/api/server.ts:267-272`:
```ts
if (rateLimiter && url.startsWith('/api/')) {
  const ip = req.socket.remoteAddress ?? '127.0.0.1';
  if (!rateLimiter.check(ip)) {
    sendError(res, 429, 'Too Many Requests');
    return;
  }
}
```

`req.headers['x-forwarded-for']` parse edilmez.

### B14 — Static decode yok

`src/api/server.ts:439-444`:
```ts
const urlPath = url.split('?')[0] ?? '/';
const resolved = resolve(staticDir, urlPath === '/' ? 'index.html' : urlPath.slice(1));
if (!resolved.startsWith(resolve(staticDir))) {
  sendError(res, 403, 'Forbidden');
  return;
}
```

`decodeURIComponent` yok; ancak `resolve()` `%2e%2e` normalize etmez; `startsWith` kontrolü çıkışı yakalar. **Mevcut kontrol fonksiyonel olarak yeterli.**

### B15 — Plain text fallback

`src/providers/gemini.ts:90-93`:
```ts
} catch {
  // If not valid JSON, treat the entire stdout as plain text response
  return { response: stdout.trim() };
}
```

### B16 — Tier model tip-assertion

`src/providers/gemini.ts:34-39`:
```ts
get premium_plus() { return (modelRegistry.getByProviderAndTier('gemini', 'premium_plus')?.id ?? getModelForProviderTier('gemini', 'premium') ?? 'gemini-2.5-pro') as GeminiModel; },
```

`as GeminiModel` runtime kontrolü değil.

### B17 — Tutarsız regex kullanımı

`src/api/server.ts:103`: `const WORKER_ID_RE = /^[a-zA-Z0-9-]+$/;`
`:556` `kill/` rotası kullanır; `:407-421` `worker/.../log` kullanmaz. Bkz. B5.

### B18 — Sandbox network best-effort

`src/providers/sandbox.ts:115-123`:
```ts
// Network block via proxy env vars (best-effort)
if (this.blockNetwork) {
  env['http_proxy'] = 'http://127.0.0.1:0';
  ...
}
```

Yorum açıkça "best-effort" diyor.

### B19 — Provider .result tokenUsage eksik

`src/providers/subprocess.ts:200-208` fallback `tokenUsage` alanı yok.
`src/providers/gemini.ts:81-87` `usageMetadata` parse ediliyor ama döndürülen `stats` çağrı tarafında kullanılmıyor (`spawn` sadece child'a stdin yazıyor; `parseGeminiOutput` çıktıyı sonradan okuyup yazan kod yolu yok).

### B20 — claude isAvailable tek-shot

`src/providers/claude.ts:187-194`:
```ts
const result = spawnSync('claude', ['--version'], {
  encoding: 'utf-8',
  timeout: 5_000,
  shell: process.platform === 'win32',
});
return result.status === 0;
```

Retry yok.

### B21 — RateLimit Retry-After yok

`src/api/server.ts:269-272`:
```ts
if (!rateLimiter.check(ip)) {
  sendError(res, 429, 'Too Many Requests');
  return;
}
```

Yanıt header'larında `Retry-After` yok. `src/api/rate-limiter.ts:18` `retryAfter` field'i kullanılmıyor.

### B22 — LANG hardcoded

`src/providers/subprocess.ts:142-146`:
```ts
env: {
  ...process.env,
  LANG: process.env['LANG'] ?? 'en_US.UTF-8',
  PYTHONIOENCODING: 'utf-8',
},
```

### B23 — `unknown` API yanıtları

`src/api/server.ts:173-175`:
```ts
function readDashboardJson(dashPath: string): unknown | null {
  return readJsonSafe<unknown>(dashPath);
}
```

`sendJson(res, data: unknown, status = 200)` `:129` — tip kontrolsüz publish.

### B24 — v1 normalize

`src/api/server.ts:262-263`:
```ts
const url = rawUrl.startsWith('/api/v1/') ? '/api/' + rawUrl.slice('/api/v1/'.length) : rawUrl;
```

`v2`/`v3` için kapı yok.

### B25 — Default ayarlar tutarsız

`src/api/server.ts:56` `constructor(maxRequests = 100, windowMs = 60_000)`
`:768` `rateLimitMax = portOrOpts.rateLimit ?? 100`
`src/api/rate-limiter.ts:35` `this.maxRequests = opts.maxRequests ?? 60;`

---

## 4. Öneriler (Recommendations)

### Sprint 172 OSS GA Blocker'ları (CRITICAL/HIGH — önce kapatılır)

1. **B1 Düzelt** — `src/orchestra/event-stream.ts:51-93` CHANNELS sabitine `PROMPT_WRITE: 'CLAUDE→DECKENT:PROMPT_WRITE'` ve `PROMPT_DELETE: 'CLAUDE→DECKENT:PROMPT_DELETE'` ekle. `src/providers/claude.ts:147-164` cleanup içine `appendEvent(projectRoot, sprintId, { channel: CHANNELS.PROMPT_DELETE, payload: { file, taskId } })` çağrısı koy. Sprint 170 P0-6 borcunu kapatır, ADR-035 + ADR-048 audit-trail tamamlanır.
2. **B2 Düzelt** — `src/providers/gemini.ts:308-311` `buildStreamCommand` çıktısından `apiKey` değerini çıkar; `<GOOGLE_API_KEY>` placeholder kullan, gerçek değeri stdin/environment'a ver veya çağrı tarafının kendi header'ını oluşturmasını iste. Aynı paterni `buildApiScript` ve `buildStreamingApiScript` için uygula veya direkt sil (bkz. B10).
3. **B3 + B4 Düzelt (birleşik)** — `src/providers/codex.ts` ve `src/providers/gemini.ts` exit handler'larına subprocess'teki `.result` fallback yazımını kopyala; **codex spawn başlangıcına** Gemini'deki gibi API anahtarı yokluğunda `ProviderError` fırlat. ADR-035 Layer 4 fail-safe tüm provider'larda eşit.
4. **B5 + B17 Düzelt** — `src/api/server.ts:406-421` `/api/worker/:taskId/log` rotasında `WORKER_ID_RE.test(taskId)` kontrolü ekle. Aynı doğrulamayı `/api/job/:jobId` için de uygula (savunma derinliği).

### Sprint 172+ Backlog (MEDIUM)

5. **B6 SİL** — `src/api/rate-limiter.ts` dosyasını üretime entegre et **veya** sil. Tercih: entegre et (cleanup + Retry-After + remaining yetenekleri var) ve `server.ts:51-76` gömülü sınıfı kaldır. ADR-038 disposition: BİRLEŞTİR + SİL.
6. **B7 + B8 Düzelt** — Üretimde yaşayan tüm Map state için TTL/cleanup zamanlayıcısı ekle (`activeJobs` 1 saat sonra completed/failed entry'leri tasfiye). `rate-limiter.ts:69-75` `cleanup()` zaten örnek.
7. **B9 Düzelt** — `buildCommand` döndürdüğü display string'i shell-escape uygula (örn. shell-quote kütüphanesi) veya doğrudan **yapıştır-çalıştır** uyarı yorumu döndür. Sadece dry-run dokümantasyon amaçlı kullan.
8. **B10 SİL** — `src/providers/gemini.ts:383-410` ve `:415-460` deprecated metodları kaldır. ADR-038 disposition: SİL.
9. **B11 Karara bağla** — ADR-017'yi `proposed`'a düşür veya MCP backend'i gerçekle (Sprint 048'den beri 120+ sprint gecikme). Yer tutucu kod yanıltıcı.
10. **B19 Düzelt** — `gemini.ts` `parseGeminiOutput` `stats` çıktısını çağrı yolundan geçir; subprocess fallback `.result` yazımına `tokenUsage` alanı ekle.

### Sprint 172+ Backlog (LOW — gerekli ama acil değil)

11. **B12, B13, B14, B15, B16, B18, B20, B21, B22, B23, B24, B25** — Doküman ekle, tip ihracatı (OpenAPI/Zod), `X-Forwarded-For` desteği, `Retry-After` header, `decodeURIComponent` savunma derinliği, OSS UX iyileştirmeleri.

### KORU listesi (değiştirme önerisi YOK — sağlam tasarım)

- `src/api/auth.ts:32-53` Bearer token doğrulaması SHA-256 hash + `timingSafeEqual` — sağlam.
- `src/connectors/incoming-router.ts:32-46` `validateWebhookKey` timing-safe — sağlam (api/server.ts:687-693 doğru çağırır).
- `src/api/server.ts:276-296` Strict CORS regex'i — sağlam.
- `src/api/server.ts:87-93` Security headers (CSP, X-Frame-Options) — sağlam.
- `src/api/server.ts:143-171` `parseBody` 1MB cap + drain — DoS koruması iyi.
- `src/providers/sandbox.ts:87-98` `enforceScope` `realpathSync` ile symlink traversal koruması — sağlam.

---

## 5. Kapsam Haritası (Files Covered)

| Dosya | LoC | Okundu | Not |
|---|---|---|---|
| `src/providers/claude.ts` | 251 | Tam | mcp yer tutucu + cleanup event-stream wire eksik (B1, B11, B20) |
| `src/providers/codex.ts` | 371 | Tam | spawn API key kontrolsüz + .result fallback yok (B3, B4) |
| `src/providers/gemini.ts` | 565 | Tam | buildStreamCommand secret leak + @deprecated public (B2, B4, B10, B15, B16, B19) |
| `src/providers/sandbox.ts` | 161 | Tam | enforceScope realpath sağlam, network block best-effort (B18) |
| `src/providers/subprocess.ts` | 327 | Tam | fallback referans alınacak iyi pattern, HB interval race (B12, B22) |
| `src/api/server.ts` | 848 | Tam | 2 RateLimiter, path traversal, memory leaks, X-Forwarded-For (B5..B9, B13, B14, B17, B21, B23..B25) |
| `src/api/auth.ts` | 112 | Tam | SHA-256 + timingSafeEqual — KORU |
| `src/api/rate-limiter.ts` | 95 | Tam | Tamamen ölü kod (B6) — production'da hiç kullanılmıyor |
| `src/api/watcher.ts` | 28 | Tam | 500ms debounce, sade ve doğru — KORU |

**Toplam:** 9 dosya, 2 758 LoC, **kapsanan**: 9 (%100). **Boşta dosya:** 0.

---

**Audit Raporu Sonu — Task 171-010 (providers + api).**
**Bulgu sayısı:** 25 (CRITICAL: 2, HIGH: 3, MEDIUM: 7, LOW: 13).
**OSS GA blocker:** B1, B2, B3, B5 — Sprint 172 öncesi kapatılmalı.
