# Analysis: src/core/skill-cache.ts
**Task ID:** 142-003 | **Model:** opus | **LoC:** 197 | **Effort:** max

## 1. Amaci
SkillLoadingCache, skill SKILL.md iceriklerini bellekte onbellekleyen byte-budget tabanli cache moduludur. Her skill'in SKILL.md dosyasini diskten okur, mtime ile staleness kontrol eder, toplam byte butcesini (500KB) asmasin diye en eski entry'yi cikarir. Worker prompt'larina skill icerigi enjekte edilirken tekrarlanan disk I/O'yu onler.

## 2. Public API
| Export | Signature | JSDoc |
|--------|-----------|-------|
| `CachedSkill` | `interface { skillId, content, loadedAt, sizeBytes, mtime }` | YOK (self-documenting) |
| `SkillLoadingCache` | `class` | JSDoc per-method VAR |
| `.loadAndCache()` | `(skillId: string) => CachedSkill \| null` | VAR |
| `.getCached()` | `(skillId: string) => CachedSkill \| null` | VAR |
| `.preloadAll()` | `() => number` | VAR |
| `.isStale()` | `(skillId: string) => boolean` | VAR |
| `.clearCache()` | `() => void` | VAR |
| `.evict()` | `(skillId: string) => boolean` | VAR |
| `.totalBytes` | `get: number` | VAR |
| `.size` | `get: number` | VAR |

## 3. Ic Bagimliliklar
- **HIC YOK** — Sifir core/ import. Self-contained.
- Dongusel bagimllik riski: IMKANSIZ.

## 4. Dis Bagimliliklar
- `node:fs` — statSync, readFileSync, existsSync, readdirSync
- `node:path` — path.join
- ADR-010 uyumu: UYUMLU

## 5. Complexity
- Fonksiyon sayisi: 9 (7 public + 1 private + 1 getter)
- En karmasik fonksiyon: `loadAndCache()` (satir 39-92, ~53 satir) — stat → read → evict loop → cache
- Max cyclomatic rough: ~6 (while loop + if + try/catch)

## 6. Type Safety
- **any kullanimi: 0**
- **@ts-ignore: 0**
- **@ts-expect-error: 0**
- **as unknown: 0**
- **non-null !: 0**
- **MUKEMMEL** type safety. Basit tipler, generic yok.

## 7. ADR Compliance
| ADR | Uyum | Not |
|-----|------|-----|
| ADR-006 | N/A | spawn kullanmiyor |
| ADR-008 | UYUMLU | core/ icinde, brain import yok |
| ADR-010 | UYUMLU | Sadece node: built-in |
| ADR-033 | UYUMLU | |
| Memory V2 | N/A | Skill icerigi cache'i — memory ile ilgisiz |

## 8. Test Coverage
- `tests/core/skill-cache.test.ts` — MEVCUT
- Beklenen testler: load, cache hit, stale detection, eviction, byte budget, oversize skill, preloadAll
- Memory V2 mock: N/A

## 9. TODO/FIXME/HACK Inventory
**HIC YOK**

## 10. Dead Code
- Tum public method'lar aktif kullaniliyor (task-builder.ts skill content injection icin).
- `preloadAll()`: Sprint baslangicinda cagirilip cagirilmadigi kontrol edilmeli.

## 11. Security
- `loadAndCache()` skill icerigini raw string olarak okuyor. Eger SKILL.md icinde prompt injection varsa, worker prompt'una enjekte edilir.
  - **Severity: P2** — Bu risk skill-pool validation (AST sandbox) katmaninda handle ediliyor olmali. skill-cache sadece icerik tasiyicisi.
- Path construction: `skillId` dogrudan path'e ekleniyor — path traversal riski (agent-pool/skill-pool ile ayni sorun).
  - **Severity: P1** — `loadAndCache('../../etc/passwd')` gibi bir cagri /etc/passwd icerigini dondurebilir.

## 12. Memory V2 Uyumu
- Memory V2 ile **tamamen ilgisiz**. SKILL.md dosyalari okuyor, .brain/ dosyalarina dokunmuyor.
- readFileSync kullanimi: satir 51 — **SKILL.md icin**, .brain/ degil. **UYUMLU.**

## 13. i18n
- N/A — Raw icerik cache'i. i18n gerekliligi yok.

## 14. Dokumantasyon Tutarliligi
- JSDoc: Her method icin mevcut. **IYI.**
- `MAX_TOTAL_BYTES = 500 * 1024` (500KB): Hicbir yerde dokumante edilmemis ama makul default.
- `SKILL_ENTRYPOINT = 'SKILL.md'`: skill-types.ts'deki `entrypoint` default ile **TUTARLI** (default: 'SKILL.md').

## 15. Performance
- **Sync I/O**: statSync (staleness check), readFileSync (content load), existsSync (preloadAll), readdirSync (preloadAll)
- `loadAndCache()` her cagrildiginda stat + read: 2 syscall. Eger cache hit varsa sadece get → **0 syscall**. Dogru pattern.
- `_evictOldest()`: O(N) linear scan — N = max ~21 skill icin sorun yok.
- `preloadAll()`: Tek batch — tum skill'leri bir defada yukler. Sprint basinda optimal.
- Byte budget eviction while loop: En kotu durumda tum cache bosaltilir — ama bos cache'e buyuk skill ekleme denemesi durumunda (sizeBytes > maxBytes) early return var (satir 63-71). **DOGRU.**

## 16. Oneriler
| Severity | Oneri |
|----------|-------|
| **P1** | `skillId` path-safe validation ekle — path traversal riski. `loadAndCache()` giriste `skillId` kontrolu (`/^[a-zA-Z0-9_-]+$/`). |
| **P2** | SKILL.md icerigi prompt injection icin sanitize edilmeli mi? Bu katman mi yoksa skill-pool/skill-sandbox katmani mi sorumlu? Sorumluluk sinirini netlestir. |
| **P3** | preloadAll() sprint basinda cagirilip cagirilmadigi dogrulanmali. |

## Verdict: ANALYZED
