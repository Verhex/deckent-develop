# Analysis: src/api/server.ts
**Task ID:** 142-027-fix | **Model:** opus | **LoC:** 805 | **Effort:** max

## 1. Amaci
HTTP API sunucusunu implement eder: 16+ REST endpoint, SSE (Server-Sent Events) stream, Bearer auth middleware, inline rate limiting ve CORS yonetimi. Deckent'in web dashboard ve dis entegrasyonlarina programatik erisim noktas. Sprint 133'te eklenmis; o tarihten bu yana buyumeye devam etmektedir.

## 2. Public API
- `createApiServer(config: DeckentConfig): http.Server` — export edilmis, JSDoc mevcut
- `ApiServerConfig` (interface, export edilmis) — port, corsOrigins, auth, rateLimit alanlari
- `ApiRoute` (interface, export edilmis) — method, path, handler signature
- Tum route handler'lar private (internal only)

## 3. Ic Bagimliliklar
- `../core/config.js` — DeckentConfig
- `../core/types.js` — Task, WorkerStatus
- `../orchestra/tmux.js` — TmuxManager — **ADR-008 IHLALI** (P1): provider/api katmani orchestra import ediyor
- `../agents/worker.js` — **ADR-008 IHLALI** (P1): api katmani agent import ediyor
- `./auth.js` — bearerAuthMiddleware
- `../core/utils.js` — logger, readJsonFile
- `../core/memory-store.js` — **KULLANILMIYOR** (P0 bug: MEMORY.md dosyasini okuyor)

## 4. Dis Bagimliliklar
- `node:http` — createServer — built-in, ADR-010 compliant
- `node:fs` — **readFileSync** (P0: .brain/MEMORY.md okumak icin) — built-in ama yanlis kullanim
- `node:path` — built-in
- `node:url` — built-in
- `node:crypto` — createHash (inline auth icin duplicate) — built-in
Hicbir npm dependency. ADR-010 compliant.

## 5. Complexity
- Toplam fonksiyon sayisi: ~28 (route handler'lar dahil)
- **En karmasik fonksiyon: `handleRequest()` (satir ~180-607, ~427 satir, cyclomatic ~35+) — P2 GOD FUNCTION**
- `setupRoutes()`: cyclomatic ~12
- `createApiServer()`: cyclomatic ~6
- Max cyclomatic rough: 35+

## 6. Type Safety
- `any` kullanimi: 5 (satir ~195, ~267, ~388, ~445, ~512 — route body parse, response typing)
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 2 (satir ~290, ~401)
- Non-null `!`: 8 (daginik)
- Unsafe cast: 3 (JSON.parse sonuclari)
Orta duzey type safety. `any` kullanimi P2.

## 7. ADR Compliance
- **ADR-006 (spawnSync Security):** UYUMLU
- **ADR-008 (Brain Merkezi Import):** **IHLAL (P1)** — `../orchestra/tmux.js` ve `../agents/worker.js` api katmaninda import ediliyor. API sunucusu tmux/worker'i dogrudan kullanmamali; brain/IPC araciligiyla olmali
- **ADR-010 (Tek Runtime Dependency):** UYUMLU
- **Memory V2 (DB-First):** **P0 IHLAL** — `/api/memory` endpoint `readFileSync('.brain/MEMORY.md')` ile eski dosyayi okuyor, MemoryStore kullanmiyor

## 8. Test Coverage
- Test dosyalari: 11 adet (`tests/api/server.*.test.ts`)
- Test satir sayisi: ~4301 satir — KAPSAMLI
- Mock kalitesi: YUKSEK — http request mock'lar, auth bypass, SSE stream
- handleRequest god function tam test edilemez (P2)
- Memory V2 endpoint bug test edilmemis (P0)

## 9. TODO/FIXME/HACK inventory
- `// FIXME: use MemoryStore instead of reading MEMORY.md` (satir ~380) — **P0 aktif bug**
- `// TODO: add security headers (Sprint 050 backlog)` (satir ~65) — **P2, 91 sprint stale**
- `// HACK: inline RateLimiter because rate-limiter.ts not imported` (satir ~88) — **P1 duplicate**
- `// TODO: split handleRequest into route-specific handlers` (satir ~182) — P2

## 10. Dead Code
- Inline `RateLimiter` class (satir ~85-135): rate-limiter.ts ile DUPLICATE — P1
- Inline `hashToken` ve `checkAuth` fonksiyonlari (satir ~140-165): auth.ts ile DUPLICATE — P1
- `/api/status/deprecated` endpoint: hicbir client kullanmiyor (P3)

## 11. Security
- **P0:** `/api/memory` endpoint eski .brain/MEMORY.md okuyor — Memory V2 bypass, stale/incorrect data
- **P1:** Duplicate inline auth (hashToken/checkAuth) — auth.ts'teki timing-safe karsilastirma KULLANILMIYOR olabilir; P1 security regression riski
- **P2:** Security headers eksik (`X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`) — Sprint 050'den beri 91 sprint stale backlog
- **P1:** CORS inconsistency — bazi endpoint'ler CORS header eklemiyor, bazi GET handler'larda unutulmus
- ADR-008 violation: tmux/worker direkt import — privilege escalation pattern (P1)

## 12. Memory V2 Uyumu
**P0 KRITIK IHLAL:**
- `/api/memory` endpoint: `readFileSync('.brain/MEMORY.md')` ile V1 formatini okuyor
- MemoryStore.getByType('memory') kullanilmali
- Diger memory-related endpoint'ler (/api/decisions, /api/retro) benzer risk tasiyabilir — incelenmeli

## 13. i18n
- API error mesajlari Ingilizce: "Not Found", "Internal Server Error" — HTTP standard, kabul edilebilir
- Bazi business logic error mesajlari Turkce/Ingilizce karisik — P3

## 14. Dokumantasyon Tutarliligi
- JSDoc coverage: %25 — sadece createApiServer ve ApiServerConfig dokumante edilmis
- 16+ route hicbiri JSDoc yok (P2)
- DECKENT.md'de HTTP API belgelenmis — endpoint listesi yok (P2 dokumantasyon eksikligi)

## 15. Performance
- `readFileSync('.brain/MEMORY.md')` her `/api/memory` request'te — **sync I/O hot path** (P0 performance + correctness)
- `handleRequest()` 427 satir: her request bu devasa switch/if zincirinden geciyor (P2)
- SSE stream: event emitter pattern, non-blocking (OK)
- Inline rate limiter: Map lookup O(1), OK

## 16. Oneriler
- **P0:** `/api/memory` endpoint'i MemoryStore.getByType('memory') ile guncelle — V1 readFileSync kaldir
- **P1:** Inline RateLimiter, hashToken, checkAuth kaldir; rate-limiter.ts ve auth.ts kullan
- **P1:** ADR-008: tmux.js ve worker.js import'larini kaldir; IPC/event pattern kullan
- **P1:** CORS inconsistency duzelt — tum endpoint'lerde tutarli middleware
- **P2:** `handleRequest()` god function'i route-handler'lara bol (Sprint 142 refactor task)
- **P2:** Security headers ekle (X-Content-Type-Options, X-Frame-Options, CSP)
- **P2:** JSDoc — 16+ endpoint dokumante et

## Verdict: ANALYZED
