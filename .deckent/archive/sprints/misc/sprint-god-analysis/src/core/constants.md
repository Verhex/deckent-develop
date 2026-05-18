# Analysis: src/core/constants.ts
**Task ID:** 142-001 | **Model:** opus | **LoC:** 112 | **Effort:** max

## 1. Amaci (detayli, 3-5 cumle — ne yapar, neden var, kim kullanir)
constants.ts, projenin tum sabit degerlerini icerir: dosya yollari (.deckent/, .brain/, .tasks/, .locks/, .contracts/), Memory V2 sabitleri (MEMORY_DB_FILE, MEMORY_EXPORTS_DIR), bellek limitleri (MEMORY_MAX_LINES, PATTERNS_MAX_LINES, vb.), tmux session isimleri, teknik borc eskalasyon esikleri, varsayilan degerler (DEFAULT_LANGUAGE, DEFAULT_MODE, DECKENT_VERSION), ve zamanlama sabitleri. DECKENT_VERSION runtime'da package.json'dan okunur. Sprint 140 pre-flight ile bellek limitleri 3-5x arttirilmis (900→5000 toplam budget).

## 2. Public API (her export'un tam signature + JSDoc var mi? yoksa EKSIK olarak isaretle)
| Export | Tur | JSDoc |
|--------|-----|-------|
| Path constants (16 adet) | `const string` | Section comment VAR, per-const EKSIK |
| MEMORY_DB_FILE | `'memory.db'` | EKSIK |
| MEMORY_EXPORTS_DIR | `'exports'` | EKSIK |
| Memory file constants (8 adet) | `const string` | EKSIK |
| Memory limit constants (5 adet) | `const number` | Inline comment VAR (Sprint 140 notlari) |
| TASK_FILE_EXTENSIONS | `readonly string[]` | EKSIK |
| tmux constants (5 adet) | `const string` | EKSIK |
| Debt escalation (3 adet) | `const number/string` | EKSIK |
| Defaults (5 adet) | `const string/number` | EKSIK |
| Timing constants (5 adet, 3 deprecated) | `const number` | @deprecated JSDoc **VAR** |
| Memory budget constants (3 adet, 2 deprecated) | `const number` | @deprecated JSDoc **VAR** + Sprint 140 notlari |

**Toplam: ~56 export. ~8 JSDoc VAR, ~48 EKSIK.** Constants icin JSDoc gerekliligi tartisabilir — isimleri self-documenting. Ancak Sprint 140 notlari degerli context sagliyor.

## 3. Ic Bagimliliklar
**SIFIR.** Node built-in imports only.

## 4. Dis Bagimliliklar
- `node:fs` → readFileSync (DECKENT_VERSION icin package.json okuma)
- `node:os` → homedir
- `node:path` → dirname, join
- `node:url` → fileURLToPath

**ADR-010:** Node built-in only. Uyumlu.

## 5. Complexity
| Metrik | Deger |
|--------|-------|
| Toplam fonksiyon | 0 (IIFE dahil 1) |
| IIFE | DECKENT_VERSION (satir 76-86) — try/catch ile package.json okuma |

Neredeyse tamamen deklaratif.

## 6. Type Safety
- `as const` assertions turetilen literallere sagliyor. **Dogru kullanim.**
- DECKENT_VERSION IIFE: `JSON.parse(readFileSync(...)) as { version?: string }` — guvenli cast.
- **Tum constant'lar readonly** (`as const` ile). Mutation riski YOK.

**Toplam: 0 any, 0 @ts-ignore, 1 `as` cast (guvenli).** Type safety ISKI.

## 7. ADR Compliance
| ADR | Uyum | Aciklama |
|-----|------|----------|
| ADR-008 | **UYUMLU** | Sadece Node built-in import |
| ADR-010 | **UYUMLU** | Dis dep yok |
| Memory V2 | **UYUMLU** | MEMORY_DB_FILE = 'memory.db', MEMORY_EXPORTS_DIR = 'exports' tanimli |
| ADR-009 | **UYUMLU** | DEBT_TABLE_HEADER tanimli |

## 8. Test Coverage
- **Test dosyasi:** `tests/core/constants.test.ts` — MEVCUT
- Beklenen testler: path constant dogrulugu, DECKENT_VERSION format, deprecated constant varlik kontrolu, memory limit degerleri

## 9. TODO/FIXME/HACK inventory
**SIFIR.**

## 10. Dead Code
- **@deprecated constants (5 adet):**
  - AUDITOR_SCAN_INTERVAL_MS (satir 95)
  - HEARTBEAT_STALE_THRESHOLD_MS (satir 97)
  - LOCK_STALE_THRESHOLD_MS (satir 99)
  - BRAIN_TOTAL_LINE_BUDGET (satir 107)
  - MEMORY_DECAY_SPRINTS (satir 111)
- Bunlar "Kept for backward compat & tests" notu ile isaretli. Testlerde referans ediliyor olabilir. Dead code degil ama migration path'i planlanmali.
- **PATTERN_DECAY_SPRINTS** (satir 112): @deprecated degil ama config.decay_after_sprints ile cakisiyor olabilir.

## 11. Security
- **DECKENT_VERSION IIFE:** readFileSync ile package.json okunuyor. Path: `join(__dirname, '..', '..', 'package.json')` — relative path traversal riski YOK (sabit dosya yolu).
- **GLOBAL_DECKENT_DIR:** `homedir()` ile olusturuluyor. Home directory guvenli.
- **GLOBAL_CREDENTIALS_DIR:** `~/.deckent/credentials` — dosya izinleri bu dosyada kontrol edilmiyor. Credential dosyalari burada saklaniyorsa, file permission kontrolu credential-encryption.ts'de olmali.

## 12. Memory V2 Uyumu
- **MEMORY_DB_FILE = 'memory.db'** — MemoryStore constructor'inda `.brain/${MEMORY_DB_FILE}` olarak kullanilir. **DOGRU.**
- **MEMORY_EXPORTS_DIR = 'exports'** — Export fonksiyonlari `.brain/${MEMORY_EXPORTS_DIR}/` altina yazar. **DOGRU.**
- **Sprint 140 pre-flight degisiklikleri:**
  - MEMORY_MAX_LINES: 300→1500 (5x) — yorum var (satir 53)
  - PATTERNS_MAX_LINES: 150→800 (5.3x) — yorum var (satir 54)
  - RETRO_MAX_LINES: 120→400 (3.3x) — yorum var (satir 55)
  - SPRINT_LOG_MAX_LINES: 100→500 (5x) — yorum var (satir 56)
  - ERRORS_MAX_LINES: 200→600 (3x) — yorum var (satir 30)
  - DECISIONS_MAX_LINES: 1200 (yeni, satir 33) — yorum var
  - BRAIN_TOTAL_LINE_BUDGET: 900→5000 (5.5x) — yorum var (satir 107)
  - MEMORY_DECAY_SPRINTS: 8→20 (2.5x) — yorum var (satir 111)
- **Toplam:** 1500+800+400+500+600+1200 = 5000. BRAIN_TOTAL_LINE_BUDGET = 5000. **TUTARLI.**

## 13. i18n
- **SUPPORTED_LANGUAGES = ['en', 'tr']** — iki dil destegi.
- **DEFAULT_LANGUAGE = 'en'** — Ingilizce default.
- Sabit isimler Ingilizce (BRAIN_DIR, TASKS_DIR, vb.) — bunlar dosya yollari, i18n gerekliligi yok.

## 14. Dokumantasyon Tutarliligi
- **api-surface.md:** ".brain/ File Formats" section'da MEMORY_DB_FILE, MEMORY_EXPORTS_DIR belirtilmis. **UYUMLU.**
- **DECKENT.md:** ".brain/memory.db (gitignored, rebuilt from exports)" — MEMORY_DB_FILE = 'memory.db'. **UYUMLU.**
- **Sprint 140 pre-flight yorumlari:** Tum limit degisiklikleri motivasyon ile yorumlanmis. **Iyi dokumantasyon pratigi.**
- **IDENTITY.md:** Sprint 140 limit degisikliklerini yansitmiyor — IDENTITY.md'de "900 lines max in .brain/" hala yazili. **TUTARSIZ — DECKENT.md hala "Memory budget: 900 lines max" diyor!** P1.

## 15. Performance
- **readFileSync** (satir 81): DECKENT_VERSION IIFE — module load'da 1x. Cok hizli.
- Tum diger constant'lar compile-time literal. Runtime etkisi SIFIR.

## 16. Oneriler
| Severity | Oneri | Aksiyon |
|----------|-------|---------|
| **P1** | DECKENT.md memory budget tutarsizligi | "Memory budget: 900 lines max" → "Memory budget: 5000 lines max" guncelle |
| P2 | Deprecated constant'larin kullanim audit'i | Hangi test/kod bunlara hala bagimlı? Kaldirma plani yap. |
| P3 | PATTERN_DECAY_SPRINTS deprecated isaretle | config.decay_after_sprints ile cakisiyor |
| P3 | Per-constant JSDoc | Kritik sabitler (MEMORY_DB_FILE, MEMORY_EXPORTS_DIR, memory limits) icin JSDoc ekle |

## Verdict: ANALYZED
