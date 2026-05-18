# Analysis: src/core/marketplace/marketplace-auth.ts
**Task ID:** 141-001 | **LoC:** 151

## 1. Amaci (1-2 cumle)
Deckent marketplace/registry için token tabanlı kimlik doğrulama yönetimi sağlar. Tokeni `~/.deckent/credentials/marketplace.json` dosyasında güvenli şekilde saklar (0o600 izni).

## 2. Public API (export listesi)
- `interface MarketplaceTokenEntry` — token + storedAt alanları
- `class MarketplaceAuthError extends Error` — auth hatası
- `interface MarketplaceAuthFS` — FS abstraction (test için)
- `class MarketplaceAuth` — ana auth yöneticisi

### MarketplaceAuth Methods
- `login(token: string): void` — token kaydet (0o600 chmod)
- `logout(): boolean` — kayıtlı tokeni sil
- `getToken(): string | null` — kayıtlı tokeni getir
- `isAuthenticated(): boolean` — token var mı kontrolü
- `validateToken(token: string): boolean` — token format doğrulama (min 8 karakter, no whitespace)

## 3. Ic + Dis Bagimliliklar
### İç Bağımlılıklar
- node:fs (chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync)
- node:path (join)
- node:os (homedir)

### Dış Bağımlılıklar
- Sıfır dış npm bağımlılığı

## 4. Complexity (fonksiyon sayisi, cyclomatic rough)
- Public metotlar: 5
- Private metotlar: 2 (`_tokenFilePath`, `_ensureDir`)
- Cyclomatic complexity (rough): ~6-8 (basit if/try-catch zincirleri)
- `login`: token validation → dir oluştur → yaz → chmod (iyi ayrıştırılmış)
- `validateToken`: trim, length check, whitespace regex

## 5. Type Safety (any, @ts-ignore, non-null assertion)
- `any` kullanımı: 0
- `@ts-ignore`: 0
- Non-null assertions: 0
- `JSON.parse(raw) as MarketplaceTokenEntry` — hafif runtime riski, schema validation yok
- `entry.token ?? null` — güvenli ✓
- Genel tip güvenliği: YÜKSEk

## 6. ADR Compliance (ADR-006/008/010/037/039/040)
- **ADR-001 (ESM):** import kullanımı ✓
- **ADR-006 (spawnSync Security):** spawnSync yok ✓
- **ADR-008 (Brain Import):** Brain import yok ✓
- **ADR-010 (Tek Runtime Dep):** Sadece node: built-ins ✓

## 7. Test Coverage (src/X → tests/X.test.ts eslesmesi)
- Beklenen: `tests/core/marketplace/marketplace-auth.test.ts`
- FS abstraction injectable → yüksek test edilebilirlik
- Test senaryoları: login/logout cycle, chmod fail graceful, validateToken edge cases

## 8. TODO/FIXME/HACK inventory
- "Best-effort: some file systems may not support chmod" — yorum amaçlı, TODO değil ✓

## 9. Dead Code Candidates
- Tüm metotlar kullanılabilir görünüyor — CLI marketplace login/logout komutlarına bağlıdır

## 10. Security Findings
- **GOOD:** 0o600 chmod token dosyası için ✓
- **GOOD:** 0o700 credentials dizini için ✓
- **GOOD:** token.trim() whitespace kırpma ✓
- **CONCERN:** `validateToken` minimum uzunluk sadece 8 karakter — çok kısa olabilir, token entropy kontrolü yok
- **CONCERN:** Token dosyası `~/.deckent/credentials/` — sistem genelinde paylaşımlı ortamda risk
- `JSON.parse` token parse — malformed JSON durumunda null dönüyor ✓ (graceful)

## 11. Memory V2 Uyumu (DB-first mi, eski .md parse var mi?)
- Memory V2 ile ilgisi yok — marketplace auth alt modülü
- Credential yönetimi ayrı dosya sistemine yazıyor, MemoryStore kullanımı beklenmez

## 12. Oneriler (Sprint 142+ input)
1. Token entropy/format doğrulaması genişletilmeli (Bearer token pattern kontrolü)
2. `JSON.parse as MarketplaceTokenEntry` → Zod şema doğrulaması ekle
3. Token dosyasının integrity'sini doğrulamak için HMAC/checksum düşünülebilir
4. logout() → return false fail durumlarını logla (silent fail şu an)

## 13. Verdict: ANALYZED | PARTIAL | UNREADABLE
ANALYZED
