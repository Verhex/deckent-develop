# Analysis: src/core/skill-pool.ts
**Task ID:** 142-003 | **Model:** opus | **LoC:** 307 | **Effort:** max

## 1. Amaci
SkillPoolManager, Deckent'in skill havuzunu yoneten merkezi moduludur. `.deckent/skills/` dizininden skill tanimlari yukler, dogrular, kaydeder, siler ve istatistiklerini gunceller. AgentPoolManager'in skill karsiligi. Skill'ler worker prompt'larina enjekte edilen domain-specific bilgi parcalaridir (ornegin typescript-expert, react-specialist).

## 2. Public API
| Export | Signature | JSDoc |
|--------|-----------|-------|
| `SkillPoolManager` | `class` | JSDoc per-method VAR |
| `.loadSkills()` | `() => Map<string, SkillDefinition>` | VAR |
| `.getSkill()` | `(id: string) => SkillDefinition \| undefined` | VAR |
| `.listSkills()` | `() => SkillDefinition[]` | VAR |
| `.listByCategory()` | `(category: SkillCategory) => SkillDefinition[]` | VAR |
| `.listEnabled()` | `() => SkillDefinition[]` | VAR |
| `.enableSkill()` | `(id: string) => boolean` | VAR |
| `.disableSkill()` | `(id: string) => boolean` | VAR |
| `.saveSkill()` | `(skill: SkillDefinition) => void` | VAR |
| `.removeSkill()` | `(id: string) => boolean` | VAR |
| `.updateSkillStats()` | `(id, evaluation, coverage, sprintId) => void` | VAR |
| `SkillPoolManager.validateSkillDefinition()` | `static (skill: unknown) => { valid, errors }` | VAR |

## 3. Ic Bagimliliklar
- `./skill-types.js` — SkillDefinition, SkillCategory, createDefaultSkillStats
- `./utils.js` — readJsonSafe
- `./types.js` — ALL_MODELS (validation icin)
- Dongusel bagimllik riski: YOK

## 4. Dis Bagimliliklar
- `node:fs` — sync I/O
- `node:path`
- ADR-010 uyumu: UYUMLU

## 5. Complexity
- Fonksiyon sayisi: 13 (constructor + 11 public + 1 static)
- En karmasik fonksiyon: `validateSkillDefinition()` (satir 187-305, ~118 satir) — nested validation logic
- Max cyclomatic rough: ~15 (cok sayida if/for validation)

## 6. Type Safety
- `as unknown as SkillDefinition` — satir 53: validated-then-cast. AgentPoolManager ile ayni pattern.
- `as Record<string, unknown>` — satir 194, 257, 271, 288: validation icinde.
- `as readonly string[]` — satir 212, 219, 273: includes() tipi zorlama.
- `as unknown[]` — satir 242: array iteration.
- `as string` — satir 198, 212, 273: string narrowing.
- `as typeof VALID_MODELS[number]` — satir 219.
- **any kullanimi: 0**
- **@ts-ignore: 0**
- **@ts-expect-error: 0**
- **non-null !: 0**
- Toplam unsafe cast: ~8 (hepsi validation context'inde)

## 7. ADR Compliance
| ADR | Uyum | Not |
|-----|------|-----|
| ADR-006 | N/A | spawn kullanmiyor |
| ADR-008 | UYUMLU | core/ icinde |
| ADR-010 | UYUMLU | Sadece node: built-in |
| ADR-033 | UYUMLU | |
| Memory V2 | UYUMLU | Memory scope disinda |

## 8. Test Coverage
- `tests/core/skill-pool.test.ts` — MEVCUT
- `tests/core/skill-pool-stats.test.ts` — MEVCUT (stats update icin dedicated test)
- Mock kalitesi: fs ve readJsonSafe mock'laniyor
- Edge case: bos dizin, gecersiz manifest, enable/disable toggle

## 9. TODO/FIXME/HACK Inventory
**HIC YOK**

## 10. Dead Code
- Tum public method'lar aktif kullaniliyor (skill-selector, task-router, promotion-pipeline tarafindan).
- `listByCategory()`: Daha az kullanilan bir method — CLI `skill list --category` icin olusturulmus olabilir.

## 11. Security
- **Path traversal riski**: `saveSkill()` ve `removeSkill()` skill.id'yi dogrudan path'e koyuyor. `validateSkillDefinition()` id icin sadece "non-empty string" kontrolu yapiyor, **path-safe regex yok**.
  - **Severity: P1** — agent-pool.ts ile ayni sorun. Path traversal mumkun.
- **rmSync force:true**: `removeSkill()` — ayni risk.

## 12. Memory V2 Uyumu
- Memory V2 ile **dogrudan ilgisiz**. Skill metadata `.deckent/skills/` dizininde.
- Eski .md parse: YOK
- readFileSync: Yalnizca manifest.json icin (readJsonSafe uzerinden)
- **UYUMLU**

## 13. i18n
- Validation hata mesajlari ingilizce hardcoded.
- Skill trigger'lari ve name'leri genelde ingilizce — i18n gerekliligi dusuk.
- **UYUMLU** (ihtiyac yok)

## 14. Dokumantasyon Tutarliligi
- JSDoc: Her method icin mevcut. **IYI.**
- DECKENT.md "21 built-in skills" — Bu modul sayi kontrolu yapmiyor, `.deckent/skills/` dizin icerigine bagli.
- `loadSkills()` icinde **extra existsSync** kontrolu var (satir 48): `_loadFromDir` pattern'i agent-pool'dan farkli — agent-pool existsSync yapmadan readJsonSafe kullaniyor ama skill-pool hem existsSync hem readJsonSafe kullaniyor. **TUTARSIZ PATTERN.**
  - **Severity: P3** — readJsonSafe zaten missing file handle ediyor, extra existsSync gereksiz.

## 15. Performance
- **Sync I/O sayisi: 7 pattern** (existsSync x2, readdirSync, writeFileSync, mkdirSync, rmSync, readJsonSafe)
- `getSkill()` her cagrildiginda `loadSkills()` → tum pool'u diskten yukler. agent-pool ile ayni sorun.
  - **Severity: P2**
- `updateSkillStats()` da getSkill() → loadSkills() → full reload → update → save.
  - **Severity: P2**

## 16. Oneriler
| Severity | Oneri |
|----------|-------|
| **P1** | Skill id icin path-safe validation ekle (agent-pool ile ayni sorun). |
| **P2** | `loadSkills()` icindeki extra `existsSync(manifestPath)` kontrolunu kaldir — `readJsonSafe` zaten null dondurur. agent-pool pattern'iyla tutarli olsun. |
| **P2** | getSkill() / updateSkillStats() full reload pattern'i — cache katmani dusunulebilir. |
| **P3** | Validation hata mesajlari i18n. |

## Verdict: ANALYZED
