# ADR-031: Content Hash Cache — Sprint Dokümanları Hash-Based Invalidation

**Status:** accepted

**Date:** 2026-04-16

**Accepted:** Sprint 131

---

**Context:**
`runManagedDocUpdates()` her sprint bitişinde tüm konfigüre edilmiş dokümanlar için içerik üretimi çalıştırır. Büyük projelerde:
- 10+ managed doküman, her biri için built-in generator chain çalışır
- `readdirSync`, `readFileSync`, `JSON.parse` → her doküman için disk I/O
- AgentPoolManager, SkillPoolManager, modelRegistry instantiation → her bölüm üretiminde

Eğer sprint aralarında doküman içeriği ve konfigürasyon değişmediyse (örn. hotfix sprint — yalnızca küçük bug düzeltmeleri), tüm bu işlem gereksizdir.

Sprint 132 audit'i sync I/O'yu 799 kaynak satırda tespit etti. Cache olmaksızın managed-docs bu sayıyı her sprint'te anlamlı ölçüde artırır.

**Decision:**
**Dual-key SHA-1 cache** tasarlandı (`doc-cache.ts`):

- **Cache dosyası:** `.deckent/cache/managed-docs-cache.json` — `Record<docId, { entryHash, fileHash, updatedAt }>`
- **`entryHash`:** `ManagedDocEntry`'nin `autoSections + templates + protectedSections + maxLines` alanlarının JSON serialization hash'i — konfigürasyon değişikliklerini tespit eder
- **`fileHash`:** Hedef dosyanın mevcut içeriğinin hash'i — dışarıdan yapılan değişiklikleri (manuel düzenleme, başka araç) tespit eder
- **`contentHash(input)`:** `node:crypto` SHA-1, 40 hex karakter — çarpışma-güvenli yerel cache invalidation için yeterli
- **Cache skip mantığı:** `cached.entryHash === entryHash && cached.fileHash === fileHash` → `reason: 'cached_no_change'`, generator çalışmaz
- **Cache yenileme:** Doküman güncellendikten sonra yeni `fileHash` yazılır; hiç değişmese bile `updatedAt` güncellenir
- **Cache temizleme:** `clearDocCache()` → CLI `docs run --no-cache` tarafından çağrılır

**Consequences (+):**
- Değişmeyen dokümanlar için sıfır I/O — repeated sprint'lerde anlamlı hız farkı
- Cache dosyası küçük (doküman başına ~100 byte JSON), `.gitignore`'a eklenebilir
- İki ayrı key sayesinde konfigürasyon değişikliği veya dosya değişikliği ikisi de ayrı ayrı invalidation tetikler
- `--no-cache` escape hatch ile kullanıcı her zaman tam yenileme yapabilir

**Consequences (-):**
- SHA-1 artık kriptografik güvenlik için önerilmez — ancak burada yalnızca cache invalidation için kullanılıyor, güvenlik riski yok
- Cache dosyası stale olabilir (örn. generator mantığı kaynak kodda değiştiğinde) — major version bump'ta `clearDocCache()` çağrılmalı
- `node:crypto` ek I/O — ancak tek `createHash` çağrısı generator chain I/O'sunu geçemez

**Alternatives Considered:**
- mtime-based invalidation — symlink ve cross-filesystem mount'larda güvenilmez; WSL2 üzerinde mtime'lar zaman zaman tutarsız davranır
- MD5 hash — SHA-1 kadar hızlı, ancak SHA-1 Node.js `crypto` built-in API'de standart ve daha yaygın kabul görür
- In-memory cache (process lifetime) — Sprint restart'larında ve yeni terminal session'larında korunmaz; uzun-süren sprint'lerde tutarlı ama genel çözüm değil
- No cache — her sprint'te gereksiz I/O (rejected, Sprint 132 audit bulgusu: 799 sync I/O hot path)
- File watcher (fs.watch) — event-driven invalidation gereksiz karmaşıklık, doküman sayısı az, polling yeterli

**Cache Key Design Rationale:**
Dual-key (entryHash + fileHash) tasarımı şu senaryoları bağımsız olarak ele alır:
- Sadece konfigürasyon değişti (yeni autoSection eklendi) → entryHash değişir, rebuild gerekir
- Sadece dosya değişti (kullanıcı manual düzenledi) → fileHash değişir, rebuild gerekir
- İkisi de değişmedi → cache hit, rebuild atlanır
Tek-key (yalnızca fileHash) konfigürasyon değişikliklerini gözden kaçırırdı.

**References:**
- Sprint 131 — Content Hash Cache (commit hash omitted: pre-migration private-repo SHA, not resolvable in the public repo history)
- Kaynak: `src/orchestra/managed-docs/doc-cache.ts`, `managed-doc-runner.ts`
- İlgili: Sprint 132 Task 4 (loadConfig module-level cache) — benzer dual-key pattern, aynı motivasyon

> **Note (verified / evolution):** Dual-key cache (`entryHash` + `fileHash`) confirmed in `src/orchestra/managed-docs/doc-cache.ts` (`contentHash()`). **Extended in Sprint 166 (Bug S fix):** sprint-aware invalidation was added — caches are now forced-invalidated across sprints and pre-Sprint-166 cache entries are intentionally invalidated, so the original two-key model now has a third (sprint) dimension. Behavior unchanged; documentation alignment + repo-migration cleanup only (dead old-repo commit SHA removed).

---
