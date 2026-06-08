# Audit — `src/core/agent-cache.ts`

> **Sprint:** sprint-186 (per-file pilot, 50-task batch)
> **Task:** 186-026
> **Auditor:** doc-writer (worker w-186-026, claude/opus)
> **Date:** 2026-05-21

---

## 1. Inventory

| Field | Value |
|---|---|
| Path | `src/core/agent-cache.ts` |
| LoC (incl. blanks/comments) | 171 (file ends with newline; DIRECTIVES'te 172 olarak deklare edilmiş — `wc -l` farkı) |
| Module type | ESM (TypeScript), pure logic — **no I/O, no fs** |
| Exports (3) | `interface TaskSignatureInput`, `interface CachedResult`, `class AgentSelectionCache` |
| Internal interface (private) | `CacheEntry { result, expiresAt, accessedAt }` |
| Public methods (7) | `taskSignature`, `cache`, `get`, `invalidate`, `clear`, `has`, `keys` |
| Public getter (1) | `size` |
| Private helpers (3) | `_simpleHash`, `_evictLru`, `_purgeExpired` |
| Constants | `MAX_ENTRIES = 100`, `DEFAULT_TTL_MS = 5 * 60 * 1000` (5 min) |
| Imports (runtime) | — none — (no `import` statements; `Map` + `Date.now()` only) |
| Imports (internal) | — none — |
| Reverse deps (`src/`) | **0 files** — `grep -r "AgentSelectionCache\|from .*agent-cache" src/` → yalnızca dosyanın kendisi |
| Reverse deps (`tests/`) | 1 file — `tests/core/agent-cache.test.ts` (172 LoC, 18 `it()` blocks) |
| Constructor | `new AgentSelectionCache(maxEntries=100, defaultTtl=300000)` — DI yok, kapasite/TTL parametrelerle override edilebilir |

**Data shape:**

```ts
TaskSignatureInput { title, description, scope:{directories[], filesWrite[]}, taskType? }
CachedResult       { agentId, score, reason }
CacheEntry         { result: CachedResult, expiresAt: number, accessedAt: number } // private
```

**API yüzeyi:** LRU + TTL hibrit cache. Eviction triggers: (a) capacity-full + new key (`cache()` → `_evictLru()`), (b) TTL expiry (`get()` lazy purge, `keys()` proactive `_purgeExpired()`).

---

## 2. Bağlam (Architectural Context)

`AgentSelectionCache`, agent seçim algoritmasının ürettiği `(agentId, score, reason)` üçlüsünü task imzasına göre önbelleğe almak için tasarlanmış **dependency-free, pure-in-memory LRU cache** prototipidir. Üst yorum satırları intent'i net ifade ediyor: _"LRU cache for agent selection results. Pure logic, no fs."_

**Beklenen tüketici hattı (kod gerçekliği vs. niyet):**

| Beklenen consumer | Gerçek durum |
|---|---|
| `src/core/agent-selector.ts` → `selectAgent()` | **Import etmiyor** — `selectAgent` her çağrıda yeniden hesaplar, cache bypass |
| `src/orchestra/decision-engine.ts` / `decision-steps/agent-step.ts` | **Import etmiyor** |
| `src/orchestra/sprint-planner.ts` (planner → task-bazlı agent kararı) | **Import etmiyor** |
| `src/core/routing-engine.ts` (v2 routing) | **Import etmiyor** — kendi `TaskDNA` + `activation-engine` pipeline'ı ile karar veriyor |
| MCP / CLI / dashboard | **Import etmiyor** |

| Mimari katman | Bağlantı durumu |
|---|---|
| Agent selection (`agent-selector.ts:79 selectAgent`) | **Hayır** — cache wire edilmemiş |
| Routing v2 (`routing-engine.ts`) | **Hayır** |
| Decision pipeline (`decision-engine.ts`) | **Hayır** |
| Prompt god-template (`prompt-god-template.ts`) | **Hayır** — sadece `selectAgent` referansı (cache aracı yok) |
| Brain template (`rule-templates/brain.template.md`) | **Hayır** — dokümantasyon referansı |
| Test surface | **Evet** — `agent-cache.test.ts` izole unit-test (kontratlar doğrulanıyor ama runtime'da çağrılan yok) |

**ADR ilişkisi:**

- **ADR-008 (Brain Merkezi Import — Tek Yönlü Bağımlılık):** Modül kimseyi import etmiyor ve kimse de etmiyor → tek-yön bağımlılık ihlali yok; ancak bu "yalnız modül" durumu ADR-038 kapsamına girer.
- **ADR-038 (Dead Code Disposition — Sprint 139 Audit Results):** Bu dosya tam olarak ADR-038'in hedeflediği "kod yazılmış ama runtime'da çağrılmıyor" kategorisinde — Sprint 188 zorunlu karar maddesi.
- **ADR-028 (Decision-Engine V1 → V2 Routing Migration):** v2 routing kendi cache'ini (eğer varsa) yönetir; bu modül v1-era artifact'ı olabilir.
- **ADR-005 (Synchronous I/O — deprecated):** İlgisiz — modül zaten I/O yapmıyor.

---

## 3. Debt Risk

| Risk | Severity | Açıklama | Kanıt |
|---|---|---|---|
| **Dead module (no runtime consumer)** | **HIGH** | `src/` içinde hiçbir dosya `AgentSelectionCache`'i import veya instantiate etmiyor — wire edilmemiş cache | `grep -r "AgentSelectionCache" src/` → yalnızca `agent-cache.ts` |
| **Weak hash collision risk** | MEDIUM | `_simpleHash` djb2-türevi 32-bit hash (`(hash << 5) - hash + char`); 36-base 7-9 karakterlik string üretiyor. Düşük entropy + büyük key uzayında çakışma olası — özellikle benzer description'lara sahip task'lar için **farklı agent'lar aynı signature'a düşebilir** | `agent-cache.ts:138-145` — sadece 32-bit space, base36 stringification |
| **Map iteration order assumption (LRU correctness)** | MEDIUM | `_evictLru` O(n) full scan (Map'i baştan sona iter eder, `accessedAt` min'i bulur). 100 entry için OK ama `maxEntries` parametre edilebilir → büyük cache'te O(n) eviction her insert'te çağrılır | `agent-cache.ts:147-161` |
| **`keys()` mutates state** | LOW–MEDIUM | `keys()` çağrısı `_purgeExpired()` çağırıyor → "okuma" gibi görünen API mutation yapıyor. Yan etki documented değil | `agent-cache.ts:130-134` |
| **No `TaskSignatureInput.taskType` test coverage** | LOW | `taskType ?? ''` empty-default ile imzaya katılıyor ama test dosyasında explicit `taskType` farkı testi yok (sadece varsayılan üzerinden) | test grep — `taskType` 0 match in `agent-cache.test.ts` |
| **TTL = 5 min hard-coded constant** | LOW | Constructor parametresi var ama default 300000ms — sprint sürelerinden çok daha kısa; sprint içinde bile aynı task tekrar değerlendirilirse cache miss | `agent-cache.ts:28` |
| **`invalidate(agentId)` linear scan** | LOW | Tüm cache'i tarıyor, agent'a göre index yok | `agent-cache.ts:95-104` |
| **`get` mutates `accessedAt` — concurrent read race** | LOW | Tek thread Node'da problem yok; ancak `has()` → `get()` → "okuma" akışı `accessedAt`'i güncelliyor → "LRU pure read" değil | `agent-cache.ts:78-90, 123-125` |
| **Signature input lowercasing collisions** | LOW | `title.toLowerCase()` ve `description.toLowerCase()` Unicode-naive — Türkçe `İ/i` çift haritalama riski (`toLocaleLowerCase('tr-TR')` değil) | `agent-cache.ts:47-48` |
| **`_simpleHash` deterministik ama crypto-grade değil** | LOW | Cache key amacı için OK; ancak side-channel olarak external'e expose edilirse adversarial collision üretilebilir | `agent-cache.ts:138-145` |
| **`size` getter expired entries'i sayar** | LOW | `_purgeExpired` çağırmadığı için süresi dolmuş ama silinmemiş entry'leri de döndürür → kullanıcı için yanıltıcı | `agent-cache.ts:116-118` |

---

## 4. Dead Code Candidates

| Bulgu | Kanıt | Karar |
|---|---|---|
| **Tüm `AgentSelectionCache` sınıfı `src/` içinde tüketilmiyor** | `grep -r "AgentSelectionCache\|from .*agent-cache" src/` → 0 (sadece dosyanın kendisi) | **DEAD-OR-DORMANT** — Sprint 188 wire-or-delete karar maddesi |
| **`invalidate(agentId)` metodu** | Test dışında çağıran yok | Dormant — yalnızca cache wire edilirse anlamlı (örn. agent demote/retire akışı tetiklediğinde invalidate çağrılır) |
| **`keys()` metodu** | Test dışında çağıran yok; debug/inspection için tutulabilir | Dormant — observability için faydalı, silmemek tercih edilir |
| **`has()` metodu** | Test dışında çağıran yok; `get()` üzerinden `!== undefined` kontrolü ile fonksiyonel olarak fazlalık | Dormant — API hijyen, ancak gereksiz değil |
| **`size` getter** | Test dışında çağıran yok | Dormant |
| **`TaskSignatureInput` / `CachedResult` interface'leri** | `grep -r "TaskSignatureInput\|CachedResult" src/` → yalnızca kendi dosyası | Re-export yok; harici tüketim yok |

> **Sınıflandırma:** Dosya pure-logic, dış bağımlılık yok, test kapsamı var ama **sıfır runtime entegrasyonu**. ADR-038 (Dead Code Disposition) açısından **`WIRE` veya `DELETE`** zorunlu karar gerektirir. Test maintenance maliyeti tek başına 172 satır + 18 `it()` bloğu.

---

## 5. Documentation Gaps

| Gap | Konum | Önerilen |
|---|---|---|
| Class-level JSDoc / `@remarks` yok | `agent-cache.ts:32` | Sınıfın amacını (LRU + TTL hibrit), concurrency varsayımını (single-threaded Node), eviction sırasını ve `keys()` side-effect'ini anlatan blok ekle |
| Public metotların çoğunda `@example` yok | `taskSignature`, `cache`, `get`, `invalidate` | Best-effort kullanım örnekleri (caller hattı dahil) |
| `_simpleHash` algoritma referansı yok | `agent-cache.ts:138-145` | "djb2-variant, 32-bit, non-cryptographic" yorumu — collision-risk-aware caller'lar için |
| TTL default ve eviction etkileşimi açıklanmamış | `agent-cache.ts:27-28` | "If TTL expired entry not yet purged, it still counts toward `size` and may be selected as LRU candidate" notu |
| `keys()` `_purgeExpired()` çağırdığı için pure-read değil — documented değil | `agent-cache.ts:130-134` | `@remarks Mutates internal state by purging expired entries before returning` |
| `TaskSignatureInput.scope` neden sadece `directories` + `filesWrite` (filesRead yok) — rationale belirsiz | `agent-cache.ts:6-11` | Yorum: "filesRead is excluded because read scope rarely changes agent selection" |
| `taskType` opsiyonel string — beklenen enum/union belirtilmemiş | `agent-cache.ts:10` | `taskType?: 'code-development' \| 'audit' \| 'document-write' \| string` (ADR-053 taxonomy ile hizala) |
| Reason field rationale | `CachedResult.reason` | "Human-readable explanation cached alongside agentId, primarily for debug/logging" |

---

## 6. ADR Compliance Check

| ADR | Beklenti | Durum | Not |
|---|---|---|---|
| ADR-001 (TypeScript + ESM) | TS, ESM | ✓ | `export interface` + `export class`, ESM-uyumlu |
| ADR-002 (Node16 Module Resolution) | `.js` uzantısı internal import'larda zorunlu | ✓ N/A | İç import yok |
| ADR-005 (Synchronous I/O — deprecated) | Yeni kodda async tercih | N/A | Modül hiç I/O yapmıyor (pure logic) |
| ADR-006 (spawnSync Security Pattern) | shell injection koruması | N/A | spawn yok |
| ADR-008 (Brain Merkezi Import — Tek Yönlü Bağımlılık) | Brain ↔ alt-modüller tek yön | ✓ | Kimseyi import etmiyor; kimse de etmiyor — bağımlılık grafiği temiz |
| ADR-010 (Tek Runtime Dependency — commander.js) | Minimal dep | ✓ | Sıfır external dep — built-in `Map` + `Date.now()` |
| ADR-028 (Decision-Engine V1 → V2 Routing Migration) | v2 routing kendi pipeline'ı | ⚠ | Bu cache v1-era artifact olabilir; v2 routing-engine.ts kullanmıyor |
| ADR-034 (Multi-Project Isolation) | Per-project sınır | ✓ | In-memory cache, instance başına; project boundary aşmaz |
| ADR-037 (Brain-Auditor-Worker Authority Matrix) | RBAC compile-time | N/A | Authority-sensitive değil |
| ADR-038 (Dead Code Disposition) | Dead → delete or wire | **❗ATTENTION** | Modül tam olarak ADR-038 hedefinde — Sprint 188 karar maddesi |
| ADR-041 (Agent Taxonomy — Horizontal Skills vs Vertical Agents) | Agent seçim mantığı vertical/horizontal ayrımına uyumlu | ✓ (yapısal) | `agentId` opaque string; taxonomy-agnostic — sorun yok |
| ADR-043 (Brain Crash Recovery Protocol) | Atomik durum yazımı | N/A | In-memory only; persistence yok |
| ADR-053 (TaskType Taxonomy — Audit/Document-Write/Code-Development) | `taskType` enum kullanımı | ⚠ | `TaskSignatureInput.taskType?: string` — taxonomy enum'a constrain edilmemiş (string-untyped) |

---

## 7. Refactor Recommendations

**A. Karar (öncelik 1) — integrate vs. delete:**

İki seçenek:

1. **WIRE:** `agent-selector.ts:selectAgent()` içinde cache wire et — entry path:
   ```ts
   const cache = getOrCreateSelectionCache();
   const sig = cache.taskSignature({ title, description, scope, taskType });
   const cached = cache.get(sig);
   if (cached) return cached;
   const result = computeSelection(...);
   cache.cache(sig, result);
   return result;
   ```
   Beklenen kazanım: tekrarlanan task evaluation (FIX phase, retry) hızlanır; çağrı sayısı ölçüm gerekli (telemetry).
2. **DELETE:** Modül + test dosyası kaldırılsın; ADR-038'e `agent-cache.ts removed (never wired since creation; pre-routing-v2 artifact)` notu eklensin. v2 routing-engine kendi caching katmanını yönetiyorsa duplicate avoid edilir.

Sprint 188 directives'ine **A.1 veya A.2 zorunlu karar maddesi** olarak girmeli.

**B. Wire kararı verilirse — küçük yapısal iyileştirmeler:**

1. **`_` prefix yerine TS `private` keyword** — `_simpleHash`, `_evictLru`, `_purgeExpired`, `_cache`, `_maxEntries`, `_defaultTtl` → encapsulation güçlü olsun (erişim TS compile-time'da kapatılır).
2. **`size` getter expired-purge** — `size` getter `_purgeExpired()` çağırsın veya en azından opt-in `size({ purge: true })` overload eklensin.
3. **Hash quality upgrade** — `_simpleHash` yerine xxHash veya `crypto.createHash('sha1').update(...).digest('hex').slice(0, 16)` — collision riski azalır (cache hit/miss correctness için kritik).
4. **Unicode-aware lowercasing** — `toLocaleLowerCase('en-US')` veya signature path'inde lowercasing'i kaldır (case-sensitivity policy explicit yap).
5. **`invalidate(agentId)` indexed lookup** — secondary `Map<agentId, Set<signature>>` index ekle → O(1) invalidation; küçük overhead.
6. **`taskType` typed union** — ADR-053 TaskType taxonomy'ye constrain et: `taskType?: TaskType` (audit/document-write/code-development/...).
7. **Telemetry hook** — `onHit`, `onMiss`, `onEvict` opsiyonel callback'leri ekle → event-stream pattern (Sprint 138 Task 4) ile cache hit rate ölçülür.
8. **TTL configurable per-entry** — `cache(sig, result, ttl?)` zaten var; default'u config'den okuyacak factory ekle: `createSelectionCache(config)`.
9. **`get` `accessedAt` mutation isteğe bağlı** — `get(sig, { touchLru: false })` overload ile pure-read sağlanabilir (debug/inspection için).
10. **JSDoc + `@example`** — bkz. §5; class-level remarks + en az `cache`/`get`/`invalidate` için runnable örnek.

**C. Test surface:**

- 172 satırlık dedicated test mevcut (18 `it()` bloğu) — wire kararı verilirse koruyalım.
- Eksik test alanları (mevcut suite'e eklenebilir):
  - `taskType` farkıyla signature ayrımı (currently 0 test).
  - `keys()` `_purgeExpired` side-effect davranışı (expired entry'ler `keys()` sonrasında `size`'a yansıyor mu?).
  - LRU eviction'da TTL-expired entry öncelik politikası (öncelikle expired purge, sonra LRU eviction mı?).
  - Concurrent `get` + `cache` ardışıklığı (single-thread Node garantili ama explicit dokümante test).
  - Hash collision senaryosu (synthetic — iki farklı task aynı `_simpleHash` üretirse cache davranışı).

---

## 8. Sprint 188 Follow-up Items

| # | Madde | Etki | Effort |
|---|---|---|---|
| 1 | **Karar:** `agent-cache` WIRE mı DELETE mi? (ADR-038 amendment) | mimari netlik | low (1 ADR amendment + 1 RFC) |
| 2 | (Wire kararı verilirse) `agent-selector.ts:selectAgent()` → `AgentSelectionCache` entegrasyonu (singleton veya per-sprint instance) | tekrar eden seçim hızlanır | normal |
| 3 | (Wire) Cache hit/miss telemetry hook → event-stream `agent_cache.hit` / `.miss` / `.evict` | observability + ölçüm verisi | low |
| 4 | (Wire) `routing-engine.ts` v2 pipeline cache strategy review — duplicate caching olup olmadığını doğrula (ADR-028 ile uyum) | duplicate caching önleme | normal |
| 5 | `_simpleHash` → cryptographic-grade hash (xxHash veya SHA1 truncated) | collision risk azalır | low |
| 6 | `_`-prefix metot/property'ler → TS `private` keyword | encapsulation | low |
| 7 | `TaskSignatureInput.taskType` → ADR-053 TaskType union'a constrain | type safety | low |
| 8 | `size` getter + `keys()` side-effect tutarlılık karar (her ikisi de purge etsin VEYA ikisi de etmesin) | API consistency | low |
| 9 | Unicode-aware lowercasing veya case-sensitive signature politikası | TR/multilingual doğruluk | low |
| 10 | Class-level JSDoc + `@example` blokları (en az 4 public metot) | DX / onboarding | low |
| 11 | (Delete kararı verilirse) dosya + test + interface re-export referansları kaldır + ADR-038 listesine ekle | dead-code temizliği | low |

---

## 9. Summary

`src/core/agent-cache.ts` **171 satırlık, kendi başına çalışan, hiçbir `src/` modülü tarafından tüketilmeyen bir LRU + TTL agent-selection cache prototipidir.** Sınıf API tasarımı temiz (7 public metot + 1 getter, 2 interface), test kapsamı yeterli (172 LoC spec, 18 `it()` bloğu, tüm public yüzeyi kapsıyor), implementasyon pure-logic (sıfır I/O, sıfır external dependency). Ancak runtime entegrasyonu **yok**: ne `agent-selector.ts`, ne `routing-engine.ts`, ne `decision-engine.ts`, ne `sprint-planner.ts` bu cache'i çağırıyor — `selectAgent()` her invocation'da yeniden hesaplama yapıyor.

**ADR ihlali yok**, fakat **ADR-038 (Dead Code Disposition) kapsamında "wire-or-delete" kararı zorunlu**. Ayrıca **ADR-028 (Decision-Engine V1 → V2 Routing Migration)** açısından bu cache'in v1-era artifact olup olmadığı netleştirilmeli — v2 routing-engine kendi caching katmanını yönetiyorsa duplicate caching riski; yönetmiyorsa wire fırsatı.

Küçük teknik borç noktaları: (1) `_simpleHash` 32-bit djb2-variant — büyük key uzayında collision riski, (2) `keys()` ve `size` arasında purge tutarsızlığı (biri pure-read değil, diğeri expired'i sayıyor), (3) `_`-prefix metotlar gerçek `private` değil, (4) `TaskSignatureInput.taskType` ADR-053 taxonomy'ye constrain edilmemiş string, (5) class-level JSDoc + `@example` eksik, (6) Unicode-naive lowercasing (TR `İ/i` riski).

**Sprint 188 zorunlu karar maddesi:** wire (önerilen — `selectAgent` hot-path'te tekrar hesaplama maliyetli olabilir, telemetry ile ölçüm önce) veya delete (kısa vade dead-code temizliği). Wire kararında §7.B'deki 10 maddelik küçük refactor seti + §7.C'deki ek test alanları uygulanabilir.

---

*Audit version: 1.0 — generated by w-186-026 / claude-opus / Sprint 186 per-file-pilot-50.*
