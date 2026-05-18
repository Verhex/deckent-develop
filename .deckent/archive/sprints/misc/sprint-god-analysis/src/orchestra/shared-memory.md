# Analysis: src/orchestra/shared-memory.ts
**Task ID:** 142-016 | **Model:** opus | **LoC:** 142 | **Effort:** max

## 1. Amaci (detayli)
Worker'lar arasi veri paylasimi icin TTL destekli key-value store saglar. Her key bir JSON dosyasi olarak .tasks/shared/ altinda saklanir. Bir worker bir deger yazar, baska bir worker okuyabilir. TTL suresi dolmus entry'ler otomatik olarak temizlenebilir. Sprint icinde worker'lar arasi iletisim ve paylasilmis state icin kullanilir (ornegin SharedContext wrapper uzerinden).

## 2. Public API
- `SharedMemory` class — constructor(projectRoot, ttlMs?). JSDoc YOK (class-level).
- `write(key, value, writerId): void` — deger yaz. JSDoc VAR.
- `read(key): { value, writerId, writtenAt } | null` — deger oku (expired ise null). JSDoc VAR.
- `listKeys(): string[]` — expired olmayanlar. JSDoc VAR.
- `isExpired(key): boolean` — TTL kontrolu. JSDoc VAR.
- `cleanup(): number` — expired entry sil, silinen sayisi don. JSDoc VAR.
- `SharedMemoryEntry` interface — EXPORTED

## 3. Ic Bagimliliklar
- `../core/errors.js` — ErrorRegistry
- `../core/utils.js` — debugLog
- `node:fs` — readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync
- `node:path` — join
- Dongusel bagimllik: YOK

## 4. Dis Bagimliliklar
- Node built-in: fs, path
- ADR-010: UYUMLU

## 5. Complexity
- Fonksiyon sayisi: 8 (5 public + 3 private)
- En karmasik: `cleanup()` (sat 90-111, ~21 satir)
- Max cyclomatic: ~3 — basit modul

## 6. Type Safety
- `any` sayisi: 0
- value tipi: `unknown` — DOGRU (any yerine unknown)
- `as SharedMemoryEntry` cast: sat 127 — JSON.parse sonrasi, null/object check ile korunuyor
- Non-null `!`: 0
- Genel: IYI type safety.

## 7. ADR Compliance
- ADR-006 spawnSync: UYUMLU (spawnSync yok)
- ADR-008 brain import: UYUMLU
- ADR-010 deps: UYUMLU

## 8. Test Coverage
- tests/orchestra/shared-memory.test.ts — MEVCUT
- Mock kalitesi: Dosya sistemi mock/temp dir
- Edge case: TTL expiry, cleanup, empty dir, invalid key

## 9. TODO/FIXME/HACK inventory
- YOK

## 10. Dead Code
- orchestra/index.ts'de SharedMemory export YOK — POTANSIYEL DEAD CODE
- Ama agents/shared-context.ts veya sprint-controller.ts icinden import ediliyor olabilir

## 11. Security
- **KEY SANITIZATION:** _keyPath() key'i `[^a-zA-Z0-9_-]` ile `_` ye replace eder (sat 117) — DOGRU
  - Ama bu farklı key'lerin ayni dosyaya eslenmesine neden olabilir: "a/b" ve "a_b" ayni dosya
  - Collision riski DUSUK ama belgelenmeli
- value tipi `unknown` — serializasyon JSON.stringify ile guvenli
- writerId dogrulama: non-empty string kontrolu VAR
- Path traversal: safeKey ile korunuyor

## 12. Memory V2 Uyumu
- N/A — SharedMemory sprint-scoped ephemeral data, Memory V2 kalici bilgi. Ayri domain, dogru.

## 13. i18n
- Hata mesajlari Ingilizce, ErrorRegistry uzerinden — tutarli
- Hardcoded TR string: YOK

## 14. Dokumantasyon Tutarliligi
- JSDoc ↔ gercek davranis: TUTARLI
- TTL semantigi dokumante: "null/undefined/0 = never expire" — DOGRU (sat 137)

## 15. Performance
- Sync I/O: readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync
- write() her cagirisinda mkdirSync — gereksiz eger dizin zaten var (recursive:true safe ama I/O overhead)
- listKeys() her key icin dosya okur (expired kontrolu icin) — O(n) disk I/O
- Hot path: Sprint execution sirasinda worker'lar tarafindan kullanilir — ORTA oncelik

## 16. Oneriler
- **P2:** write() icindeki mkdirSync'i constructor'a tasima (bir kez olustur)
- **P2:** Key collision dokumantasyonu (sanitization sonucu cakisma ihtimali)
- **P3:** listKeys() icin in-memory cache (TTL ile)
- **P3:** orchestra/index.ts export kontrolu

## Verdict: ANALYZED
