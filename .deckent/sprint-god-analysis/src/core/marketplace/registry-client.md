# Analysis: src/core/marketplace/registry-client.ts
**Task ID:** 142-007 | **Model:** opus | **LoC:** 196 | **Effort:** max

## 1. Amacı
Uzak marketplace registry'ye HTTP istemci. Skill arama, detay çekme ve yayınlama işlemlerini yapan asenkron API sunar. `https://registry.deckent.dev` varsayılan URL. Rate limiting (429) ve timeout yönetimi var. `node:https`/`node:http` modülü doğrudan kullanılıyor (fetch API kullanılmıyor).

## 2. Public API
- `interface RegistrySkillEntry` — JSDoc YOK ✗
- `interface SearchResult` — JSDoc YOK ✗
- `interface SearchOptions` — JSDoc YOK ✗
- `interface SkillDetail extends RegistrySkillEntry` — JSDoc YOK ✗
- `class RegistryNetworkError extends Error` — statusCode ile zenginleştirilmiş
- `class RegistryRateLimitError extends Error` — retryAfter ile zenginleştirilmiş
- `class RegistryClient` — JSDoc YOK ✗
  - `constructor(options?)` — registryUrl, timeoutMs, httpModule injection
  - `async searchSkills(query, options?): Promise<SearchResult>` — JSDoc VAR ✓
  - `async getSkillDetail(name): Promise<SkillDetail>` — JSDoc VAR ✓
  - `async publishSkill(payload, authToken): Promise<...>` — JSDoc VAR ✓

## 3. İç Bağımlılıklar
- `import { ErrorRegistry } from '../errors.js'` — Hata kodu sistemi.
- Döngüsel bağımlılık riski: YOK ✓

## 4. Dış Bağımlılıklar
- `node:https` — Built-in ✓
- `node:http` — Built-in ✓
- `node:url` (URL) — Built-in ✓
- ADR-010 uyumlu ✓

## 5. Complexity
- 1 sınıf, 3 public + 1 private method.
- Max cyclomatic complexity: `_request` (satır 132-194) — Promise wrapper, statusCode branching (429, <200/>=300), JSON parse try/catch. ~7.
- En karmaşık: `_request` — Low-level HTTP request handling.

## 6. Type Safety
- `any` kullanımı: 0 ✓
- `@ts-ignore`: 0 ✓
- `@ts-expect-error`: 0 ✓
- `as unknown`: 0 ✓
- Non-null `!`: 0 ✓
- `as SearchResult` (satır 98), `as SkillDetail` (satır 111), `as { success; message }` (satır 128) — _request'ten dönen unknown'u cast ediyor. Zod validation olsa daha güvenli.
- `as string` (satır 160) — `res.headers['retry-after']`. Header string zaten. Güvenli.
- `Record<string, unknown>` payload tipi (satır 117) — İyi: unknown kullanımı, any değil.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** N/A — Async.
- **ADR-008 (brain import):** ✓ — Sadece core/errors.
- **ADR-010 (tek dependency):** ✓ — Sadece built-in.
- **ADR-033 (product vision):** ⚠️ DİKKAT — Bu modül dış sunucuya (registry.deckent.dev) HTTP istekleri gönderiyor. ADR-033 "product not service" vizyonunu ihlal etmeyebilir (marketplace opt-in bir özellik) ama veri gönderim noktası olarak dikkat edilmeli.
- **ADR-037 (RBAC):** N/A.
- **Memory V2:** N/A.

## 8. Test Coverage
- Test dosyası: `tests/core/marketplace/registry-client.test.ts` ✓ MEVCUT
- Beklenen: searchSkills (query params), getSkillDetail (valid/invalid name), publishSkill (auth header), rate limiting (429), timeout, network error, invalid JSON.

## 9. TODO/FIXME/HACK Inventory
- NONE ✓

## 10. Dead Code
- Aktif: `cli/commands/skill-marketplace.ts` tarafından import ediliyor ✓
- Tüm public methodlar CLI'da kullanılıyor olması beklenir.

## 11. Security
- **URL construction:** `encodeURIComponent(name)` (satır 109) ✓ — Path injection koruması.
- **Auth token:** `Authorization: Bearer ${authToken}` (satır 125) — Token doğrudan header'a enjekte ediliyor. Token sanitization yok ama header injection riski düşük (Node.js http modülü header değerlerini validate eder).
- **Rate limiting:** 429 status code yakalanıyor ✓
- **Timeout:** 5s varsayılan, configurable ✓
- **publishSkill payload:** `Record<string, unknown>` — İçerik kontrolü yok. Server-side validation'a güveniliyor.
- **HTTP desteği:** Hem http hem https destekleniyor. HTTP üzerinden token gönderimi güvenlik riski! **P1.**
- **User-Agent:** 'deckent-cli' — fingerprinting amaçlı, güvenli.

## 12. Memory V2 Uyumu
- N/A.

## 13. i18n
- Error mesajları İngilizce: "Registry responded with status...", "Network error:", "Request timed out" — Teknik, çeviri düşük öncelik.
- `RegistryRateLimitError` mesajı: "Rate limited. Retry after Xs." — Teknik.

## 14. Dokümantasyon Tutarlılığı
- Header comment: ✓ "Remote marketplace registry client."
- `DEFAULT_REGISTRY_URL = 'https://registry.deckent.dev'` — Gerçek bir URL. Bu registry'nin mevcut olup olmadığı doğrulanmalı (muhtemelen henüz deploy edilmemiş).
- JSDoc: Method-level ✓, class/interface-level ✗ EKSIK.

## 15. Performance
- Async HTTP istekleri — Sync I/O yok ✓
- Timeout: 5s — Makul.
- Buffer concat: chunks → Buffer.concat → string (satır 155-156). Standart pattern.

## 16. Öneriler
- **P1 (High):** HTTP üzerinden auth token gönderimi mümkün — HTTPS zorunlu kılınmalı. `if (parsedUrl.protocol === 'http:') throw` kontrolü eklenebilir, en azından authToken varken.
- **P2 (Medium):** Response tiplerini Zod ile validate etmek yerine `as SearchResult` cast yapılıyor — Runtime type safety eksik.
- **P2 (Medium):** `DEFAULT_REGISTRY_URL` — Bu URL gerçekten erişilebilir mi? Marketplace henüz deploy edilmemişse dokümantasyonda belirtilmeli.
- **P3 (Low):** Retry mekanizması yok (429 hariç diğer geçici hatalar için).
- **P3 (Low):** Class ve interface JSDoc eksik.

## Verdict: ANALYZED
