# .deckent/i18n/ Audit — 2026-05-22

**Scope:** `.deckent/i18n/tr.json`, `.deckent/i18n/en.json`  
**Method:** Systematic — write path trace, read path trace, key parity analysis, content audit  
**Tool:** `node` key extraction scripts, `grep -rn` across src/

---

## Architecture Understanding

```
deckent init
  ↓ writeI18nFiles() [init-steps.ts:548] / inline [mcp/tools/init.ts:216]
.deckent/i18n/
  en.json  (110 keys — written, NEVER READ)
  tr.json  (109 keys — written, NEVER READ)

Runtime i18n (ACTUAL SOURCE OF TRUTH):
src/cli/helpers/messages.ts     ← 68 keys, hardcoded { key: { en, tr } }
src/cli/helpers/i18n.ts         ← re-exports getMessage + detectLang()
src/orchestra/managed-docs/content-generators.ts  ← separate EN/TR objects for managed-doc headers
```

**Key finding:** The disk files `.deckent/i18n/*.json` are **write-only**. No code ever calls `readFileSync` on them. The CLI runtime i18n operates entirely from the hardcoded `MESSAGES` object in `src/cli/helpers/messages.ts`.

### Three Separate i18n Systems

| System | Location | Keys | Runtime? |
|--------|----------|------|----------|
| CLI messages | `src/cli/helpers/messages.ts` | 68 | ✅ Used by CLI commands |
| Managed-docs labels | `content-generators.ts:30-68` | ~20 | ✅ Used by managed-doc generators |
| Disk i18n files | `.deckent/i18n/*.json` | 110 | ❌ Written at init, never read |

---

## Issues Found

### 1. `.deckent/i18n/*.json` are Write-Only Dead Files (Architecture Gap)

**Root cause:** Design intent was runtime-customizable i18n (user edits disk JSON to customize messages, or adds `de.json` for German). The write path was implemented; the **read path was never built**.

**Evidence:**
```bash
grep -rn "readFileSync.*i18n\|I18N_DIR.*read" src/  # → 0 results
```

**Impact on OSS users:**
- User sees `.deckent/i18n/tr.json` and assumes they can customize messages → editing the file has zero effect
- User tries to add `de.json` for German → nothing reads it
- 59 keys exist only in disk files, not in `messages.ts` — they represent aspirational strings that were never wired into code

**Key divergence (disk vs. runtime):**
- Disk files: 110 keys (en.json), 109 keys (tr.json after dedup fix)
- `messages.ts`: 68 keys
- Keys only on disk (not runtime): 59 keys
- Keys only in runtime (not on disk): 18 keys
- The two systems have drifted far apart

**Status:** Design debt — documented. Post-GA decision: implement read path OR remove disk files + document as build-time i18n only.

---

### 2. `tr.json` — Duplicate Key `error.lock_conflict` (INVALID JSON semantics)

**Root cause:** Two separate entries for the same key at different points in the file. The second silently overwrites the first in most JSON parsers.

```json
// Line 95 (FIRST — would be lost)
"error.lock_conflict": "Kilit çakışması: {file} dosyası {worker} worker'ı tarafından kilitli.",

// Line 123 (SECOND — wins, but loses the variable context)
"error.lock_conflict": "Baska bir worker kilidi tutuyor. Bekleyin veya calistirin: deckent cleanup",
```

**Fix:** Removed the duplicate second entry (line 123). The first entry (with `{file}` and `{worker}` variables) is more complete. Note: `messages.ts` has its own `error.lock_conflict` entry which is the one actually used at runtime.

---

### 3. `messages.ts` — `error.build_failed` is TypeScript-Specific (CRITICAL)

**Root cause:** Error message hardcodes `tsc --noEmit` — only meaningful for TypeScript projects.

```typescript
// Before
en: 'Build failed. Run: tsc --noEmit to check for errors.'
tr: 'Derleme basarisiz. Hatalari kontrol icin calistirin: tsc --noEmit'

// After
en: 'Build failed. Run your project\'s type check / lint command to check for errors.'
tr: 'Derleme başarısız. Hataları kontrol için projenizin tip kontrolü / lint komutunu çalıştırın.'
```

Also fixed in both disk JSON files (even though disk files aren't read at runtime, they're seeded to users and serve as documentation).

---

### 4. `messages.ts` + Disk Files — `error.node_version_low` Says `>=18` (STALE)

**Root cause:** Node.js minimum version in error message doesn't match `package.json` (`engines.node: ">=24.0.0"`).

```typescript
// Before
en: 'Node.js version too low. Upgrade to >=18.'
tr: 'Node.js surumu cok dusuk. >=18 surumune yukselin.'

// After
en: 'Node.js version too low. Upgrade to >=24.0.0.'
tr: 'Node.js sürümü çok düşük. >=24.0.0 sürümüne yükseltin.'
```

---

### 5. TR Strings — Diacritic Inconsistency Between Systems

**Root cause:** The 6-key stub written by `writeI18nFiles()` in both `init-steps.ts` and `mcp/tools/init.ts` uses ASCII fallback (no diacritics):

```typescript
// init-steps.ts (seeds disk files)
task_done: 'Gorev {id}: TAMAMLANDI',    // missing: Görev / Tamamlandı
task_nogo: 'Gorev {id}: BASARISIZ',     // missing: Görev / Başarısız

// messages.ts (actual runtime)
— these keys don't exist in messages.ts at all
```

This inconsistency affects users who try to reference the disk files as a customization guide.

**Status:** Low priority — disk files aren't read at runtime. Post-GA: if read path is implemented, fix diacritics in seed stubs.

---

### 6. Two Separate Init Code Paths Writing Identical Stubs

**Root cause:** Both `src/cli/commands/init-steps.ts:548-566` (`writeI18nFiles()`) and `src/mcp/tools/init.ts:216-233` contain the same 6-key inline objects. Classic MCP/CLI sync problem.

**Status:** Low priority — same content, same output. Post-GA: extract to shared function.

---

### 7. 59 Keys Only on Disk (Aspirational Strings Never Wired)

**Root cause:** The disk JSON files accumulated keys over time (they were manually expanded beyond what `writeI18nFiles` seeds), but the corresponding message keys were never added to `messages.ts`. These represent real UI strings that exist as documentation/aspiration:

Notable disk-only keys (not in runtime):
- `status.task_pending`, `status.task_executing`, `status.workers_active` — task status UI
- `doctor.check_ok`, `doctor.check_fail`, `doctor.check_warn` — doctor command output
- `dashboard.*` — dashboard UI strings (5 keys)
- `config.*` — config command output (4 keys)
- `error.file_not_found`, `error.timeout`, `error.boundary_violation` — error messages

These suggest the original design had more i18n coverage planned but the implementation was never completed.

---

## Fixes Applied

| # | Issue | Fix |
|---|-------|-----|
| 1 | `tr.json` duplicate `error.lock_conflict` | Removed second entry |
| 2 | `messages.ts` `error.build_failed` TS-specific | Language-agnostic + proper TR diacritics |
| 3 | `messages.ts` `error.node_version_low` = `>=18` | → `>=24.0.0` + proper TR diacritics |
| 4 | `en.json` `error.build_failed` TS-specific | Consistent with messages.ts |
| 5 | `en.json` `error.node_version_low` = `>=18` | → `>=24.0.0` |
| 6 | `tr.json` `error.build_failed` TS-specific | Language-agnostic |
| 7 | `tr.json` `error.node_version_low` = `>=18` | → `>=24.0.0` + proper TR diacritics |

---

## Design Debt (Post-GA)

| Item | Detail |
|------|--------|
| Disk files are write-only | Implement read path OR document as build-time only + add comment in init code |
| 59 aspirational-only keys | Wire them into `messages.ts` OR remove from disk files |
| Diacritic inconsistency in seed stubs | Fix `writeI18nFiles` stubs to use proper Turkish diacritics |
| Two init code paths for i18n | Extract `writeI18nFiles` to shared utility, used by both MCP and CLI |
| Three separate i18n systems | Consolidate `messages.ts` + `content-generators.ts` + disk files into unified architecture |

---

## OSS Readiness — .deckent/i18n/

| Check | Status |
|-------|--------|
| `tr.json` valid JSON (no duplicate keys) | ✅ Fixed |
| `error.build_failed` language-agnostic | ✅ Fixed |
| `error.node_version_low` correct version | ✅ Fixed |
| Dead write-only files documented | ✅ Documented |
| Architecture gap documented for post-GA | ✅ Documented |
