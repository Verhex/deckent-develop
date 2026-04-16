# Analysis: src/orchestra/connector.ts
**Task ID:** 142-011 | **Model:** opus | **LoC:** 173 | **Effort:** max

## 1. Amacı
MCP Connection Manager. Provider lifecycle management: lazy initialization, health check, auth status doğrulama. Claude, Codex, Gemini provider adapter'larının kaydını, sağlık kontrolünü ve erişilebilirlik durumunu yönetir. Thread-safe olarak tanımlanmış ama JavaScript tek thread'li olduğu için bu ifade concurrent access (async) güvenliği anlamında kullanılıyor.

## 2. Public API
| Export | Signature | JSDoc |
|--------|-----------|-------|
| `HealthCheckResult` | interface | Yok |
| `Connector` | class | ✅ Class-level ve method-level JSDoc |
| `.registerProvider()` | `(name, adapter) => void` | ✅ |
| `.getProvider()` | `(name) => ProviderAdapter \| null` | ✅ |
| `.healthCheck()` | `(name?) => Promise<HealthCheckResult[]>` | ✅ Detaylı |
| `.getAvailableProviders()` | `() => ProviderName[]` | ✅ |
| `.isProviderReady()` | `(name) => boolean` | ✅ |
| `.unregisterProvider()` | `(name) => boolean` | ✅ |
| `.clear()` | `() => void` | ✅ |
| `.size` | getter: number | ✅ |

JSDoc coverage: **~90%** — HealthCheckResult interface eksik.

## 3. İç Bağımlılıklar
- `../core/provider.js` → `ProviderAdapter` (type import)
- `../core/task-types.js` → `ProviderName` (type import)

### 🔴 ADR-008 İHLALİ: Ters Bağımlılık Yönü
`src/core/provider.ts` (satır 6) → `import { Connector } from '../orchestra/connector.js'`

Bu, core/ → orchestra/ yönünde bir import. ADR-008 diyor ki:
> "Brain (sprint-controller) is the ONLY module that imports from orchestra/"
> "Circular dependencies are FORBIDDEN"

core/provider.ts bir core/ modülü — orchestra/'dan import etmemeli. Bu bir **mimari ihlal**.

**Döngüsel bağımlılık:** connector.ts → core/provider.ts (type import) ve core/provider.ts → orchestra/connector.ts (value import). Fiili döngü TypeScript'te type import'lar nedeniyle patlamıyor ama mimari olarak yasak.

## 4. Dış Bağımlılıklar
- **Yok.** Node.js built-in bile yok.
- **ADR-010 uyumu:** ✅ Mükemmel.

## 5. Complexity
- **Fonksiyon sayısı:** 8 method + 1 private (checkAuthStatus)
- **En karmaşık:** `healthCheck()` (satır 61-107) — async loop, try/catch per provider
- **Max cyclomatic complexity:** ~5
- **Genel karmaşıklık:** DÜŞÜK. Basit registry pattern.

## 6. Type Safety
- **any sayısı:** 0
- **@ts-ignore / @ts-expect-error:** 0
- **as unknown:** 0
- **Non-null `!`:** 0
- **Unsafe cast:** 0
- **Değerlendirme:** Mükemmel tip güvenliği.

## 7. ADR Compliance
| ADR | Uyum | Not |
|-----|------|-----|
| ADR-008 (brain import) | ❌ **İHLAL** | core/provider.ts bu modülü import ediyor — ters yön |
| ADR-010 (tek dep) | ✅ | Sıfır dış bağımlılık |
| ADR-016 (Connector module) | ✅ | **Bu dosya ADR-016'nın implementasyonu** |

## 8. Test Coverage
- **Test dosyası:** `tests/orchestra/connector.test.ts` (215 satır)
- **Eşleşme:** ✅ Var
- **Test konuları:** registerProvider, getProvider, healthCheck (success + failure), getAvailableProviders, isProviderReady, unregisterProvider, clear, checkAuthStatus (env var check)
- **Mock kalitesi:** ProviderAdapter mock — isAvailable() mock
- **Edge case coverage:** Missing env var, provider not registered, health check error

## 9. TODO/FIXME/HACK Inventory
**Yok.** 0 adet.

## 10. Dead Code
- **Unused exports:** Yok — Connector sınıfı sprint-controller ve core/provider'dan import ediliyor
- **`healthCache`:** getAvailableProviders() cache kullanmıyor — sadece healthCheck'te set ediliyor. Cache hiçbir getter tarafından okunmuyor → potansiyel dead state
- **`authStatus: 'expired'`:** HealthCheckResult'ta tanımlı ama checkAuthStatus hiçbir zaman `'expired'` döndürmüyor (sadece `'ok'` veya `'missing'`) → dead type variant (P3)

## 11. Security
- **Auth check:** `process.env[envVar]` — environment variable existence check. Length > 0 kontrolü var → boş string handle ediliyor ✅
- **Secret exposure:** Env var değerleri loglanmıyor ✅
- **Injection riski:** Yok — pure registry
- **Değerlendirme:** Güvenli

## 12. Memory V2 Uyumu
- N/A — Provider yönetimi, Memory V2 ile ilişkisiz

## 13. i18n
- Error mesajları İngilizce: `Provider "${name}" is not registered` — internal
- **Değerlendirme:** Temiz

## 14. Dokümantasyon Tutarlılığı
- "Thread-safe: no race conditions on concurrent access" — yanıltıcı. JavaScript single-threaded. Daha doğru ifade: "Async-safe" veya "Concurrent access patterns do not exist in Node.js single-thread model" (P3)
- JSDoc ↔ davranış: Tutarlı

## 15. Performance
- **Sync I/O:** 0 — async healthCheck, in-memory registry
- **Hot path:** registerProvider/getProvider O(1) Map operations
- **healthCheck:** Sequential provider loop — parallel olabilirdi ama genellikle 1-3 provider, etkisi yok
- **Değerlendirme:** İyi

## 16. Öneriler
| Severity | Öneri |
|----------|-------|
| **P1** | **ADR-008 ihlali: core/provider.ts → orchestra/connector.ts import'unu çöz. Connector'ı core/'a taşı veya interface'i core/'da tanımla** |
| P2 | `healthCache` hiç okunmuyor — ya cache'i kullanan bir getter ekle ya da kaldır |
| P3 | `authStatus: 'expired'` dead variant — checkAuthStatus'a expiration logic ekle veya type'dan kaldır |
| P3 | "Thread-safe" ifadesini düzelt — "async-safe" veya kaldır |
| P3 | HealthCheckResult interface'ine JSDoc ekle |

## Verdict: ANALYZED
