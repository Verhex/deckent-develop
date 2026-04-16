# API Module — Cross-Cutting Summary
**Task ID:** 142-027-fix | **Model:** opus | **Sprint:** God Analysis

## Modul Genel Bakisi

| Dosya | LoC | Tests (satir) | any | P0 | P1 | P2 |
|-------|-----|---------------|-----|----|----|-----|
| auth.ts | 97 | ~15 test | 0 | 0 | 0 | 0 |
| rate-limiter.ts | 95 | ~12 test | 0 | 0 | 1 | 2 |
| server.ts | 805 | ~4301 satir | 5 | 2 | 3 | 5 |
| watcher.ts | 29 | ~10 test | 0 | 0 | 0 | 0 |
| **TOPLAM** | **1,026** | **~4338** | **5** | **2** | **4** | **7** |

---

## P0: Memory V2 Violation — KRITIK

**server.ts `/api/memory` endpoint**, `readFileSync('.brain/MEMORY.md')` ile V1 formatindaki dosyayi okumaktadir. Bu:
1. MemoryStore (SQLite DB) bypass — data tutarsizligi
2. FTS5 aramasi devre disi
3. Eskimis veri dondurebilir (DB'de guncel, dosyada eski)
4. Memory V2 DB-first mimarisini (ADR-038 kapsaminda) ihlal ediyor

**Duzeltme:** `/api/memory` handler'ini `MemoryStore.getByType('memory')` kullanacak sekilde guncelle.

---

## P1: Duplicate Code Trifecta — server.ts

server.ts uc ayri kod tekrari barindiriyor:

1. **Inline RateLimiter** (satir ~85-135): rate-limiter.ts ile DUPLICATE
   - rate-limiter.ts sadece testlerde kullaniliyor
   - server.ts gercekte inline implementasyonu kullaniyor
   - **Sonuc:** rate-limiter.ts testleri gercek rate limiting'i test ETMiYOR

2. **Inline hashToken** (satir ~140-152): auth.ts'teki `verifyBearerToken` ile DUPLICATE
   - auth.ts timing-safe `crypto.timingSafeEqual` kullaniyor
   - server.ts inline hash karsilastirmasi timing-safe OLMAYABILIR
   - **P1 Security regression riski**

3. **Inline checkAuth** (satir ~155-165): auth.ts'teki `bearerAuthMiddleware` ile DUPLICATE

---

## P1: CORS Inconsistency

Bazi endpoint'lerde CORS header'lari eksik. Tarayici tabanlı web dashboard bagli endpoint'lerde CORS hatalarina yol acabilir. Middleware yerine manuel header ekleme patterninin tutarsiz uygulamasindan kaynaklanmaktadir.

---

## P1: ADR-008 Violation

server.ts dogrudan import ediyor:
- `../orchestra/tmux.js` — TmuxManager
- `../agents/worker.js` — worker utilities

API katmani orchestra/agent katmanini dogrudan kullanmamali. IPC Registry veya Brain araciligiyla erisim olmali (ADR-008: Brain Merkezi Import — Tek Yonlu Bagimlilk).

---

## Guclu Noktalar

1. **auth.ts ornek kalite:** timing-safe karsilastirma, %100 test coverage, 0 any
2. **Test coverage mukemmel:** 4301 satir test — ozellikle server.ts icin kapsamli
3. **watcher.ts minimal ve dogru:** 29 satirlik, sifir bagimlilk, temiz

---

## Zayif Noktalar Ozeti

1. **P0:** server.ts Memory V2 bypass (2 endpoint)
2. **P1:** rate-limiter.ts etkin olarak dead code
3. **P1:** server.ts uc katmanlı duplicate (RateLimiter + hashToken + checkAuth)
4. **P1:** CORS inconsistency
5. **P1:** ADR-008 ihlali (tmux + worker import)
6. **P2:** handleRequest() god function (427 satir, cyclomatic ~35)
7. **P2:** Security headers eksik (91 sprint stale backlog)

---

## Sprint 142 Oncelikleri

| Priority | Task |
|----------|------|
| P0 | /api/memory endpoint — MemoryStore kullan |
| P1 | server.ts inline duplicate kaldir — auth.ts + rate-limiter.ts kullan |
| P1 | ADR-008: tmux/worker import'u kaldir |
| P1 | CORS middleware tutarliligi |
| P2 | handleRequest() refactor — route-specific handler'lara bol |
| P2 | Security headers ekle |

**Modul genel sagligi: 6/10** (P0 Memory V2 violation ve P1 duplicate triad nedeniyle)
