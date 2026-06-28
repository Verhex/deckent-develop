# DIRECTIVES — LAST-STANDING CLOSEOUT (re-run): land the 3 merge-gapped tasks (002·008·009)

## Goal
Sprint-343 (LAST-STANDING CLOSEOUT) self-reported 11/11 DONE, but a code-level disk-verify proved a
**worktree merge-back gap**: 8/11 tasks landed in `main`, but THREE tasks' SOURCE edits never merged
(their NEW test files DID merge) → the tree is currently test-RED for them. This focused re-run lands
exactly those three. Each is small, well-specified, and its faithful test **already exists in the tree
from sprint-343** — so the re-run applies ONLY the source edit and makes the pre-existing test pass.

**Disk-verified gap (the work to land):**
- **002 — B1 RBAC:** `src/orchestra/sprint-runtime.ts:9` still carries the STALE comment "`enforce_rbac`
  is not yet declared on ResolvedConfig" (it IS declared at `config-types.ts:921`). Worker note (343)
  said the `worker.ts` `checkWorkerAuthority` enforceRbac hard-deny was ALREADY landed (sprint-325
  `476a77ac`) — VERIFY that on disk; only add it if genuinely absent. Landed test:
  `tests/agents/worker-authority-enforce.test.ts`.
- **008 — skill-sandbox honest-fail:** `src/core/marketplace/skill-sandbox.ts:78` still has the silent
  `return []` when `require('typescript')` fails (sentinel absent on disk). Landed test:
  `tests/core/skill-sandbox-honest-fail.test.ts`.
- **009 — getMessage dedup prod-warn:** `src/cli/helpers/messages.ts` missing-key branch still has NO
  deduplicated production warning (only the dev-warn). Landed test:
  `tests/cli/get-message-missing-key-warn.test.ts`.

**Records of truth (READ FIRST, do not edit):**
- The original full specs are in `DECKENT-TRIAGE-PLAN.md` (READ-ONLY) + the sprint-343 results
  (`.tasks/task-343-{002,008,009}.result` — the worker's own files_changed + notes).
- The three faithful tests already in-tree ARE the contract — read each test, implement the source so it
  passes (do NOT rewrite a passing test; only adjust a test if its original contract is provably wrong,
  and say why in the result).

## 🔒 BAĞLAYICI — her task
- **DISTINCT-FILE (KRİTİK):** 3 task, **sıfır-dosya-kesişimi** (002→sprint-runtime.ts[+worker.ts only if
  needed], 008→skill-sandbox.ts, 009→messages.ts). Hiçbir iki task aynı dosyaya yazmaz. Test dosyaları
  **zaten main'de** — worker onları YENİDEN OLUŞTURMAZ (yalnız okur + geçirir); bir testi yalnızca
  orijinal kontratı kanıtlanır biçimde yanlışsa düzeltir (gerekçeyle).
- **3 YASA:** dual-lens (dogfood+ürün) · cross-platform/provider-agnostic honest-fail · NO-MVP/god-level.
- **Cerrahi + additive:** mevcut davranış byte-for-byte korunur; minimum-diff; ESM `.js` import zorunlu;
  `process.cwd()` YASAK → `join(root, …)`; mevcut export-imzaları kırılmaz.
- **i18n-first:** kullanıcı-görünür string `getMessage` (en/tr). Task 009 = getMessage'ın KENDİSİNİ
  sertleştirir; yeni mesaj-anahtarı EKLEMEZ.
- **Hermetik test (zorunlu):** tmpdir, async (no `spawnSync`), no HOME/`.deckent`-leak, network mock'lı.
  `tsc --noEmit` 0-yeni-hata; değişen modülü import eden affected-suite yeşil. **No haiku** (kod).
- **Tier:** 009 (`src/cli/helpers/`) + 002/008 (orchestra/core internal) = **Tier-0** (unit-test
  sufficient — bunlar surface-command DEĞİL; mevcut landed-test geçince DONE).
- **Dependencies:** 3 task bağımsız → hiçbirinde `- Dependencies:` satırı YOKTUR.
- **Self-verify-on-disk (merge-back-gap'e karşı):** her task `.result`'ında, yaptığı kaynak-değişikliğin
  GERÇEKTEN dosyada olduğunu kanıtlayan bir grep-çıktısı raporlar (örn. `grep -n __SANDBOX_UNAVAILABLE__
  src/core/marketplace/skill-sandbox.ts`). DONE = kaynak-edit dosyada + landed-test yeşil.

---

## Task 1: 002-redo — B1 RBAC: fix the stale `enforce_rbac` comment in sprint-runtime.ts (+ verify worker honor)
- Model: sonnet
- Effort: normal
- Agent: security-auditor
- Skills: typescript-expert, security-specialist, testing-expert
- Files: src/orchestra/sprint-runtime.ts, src/agents/worker.ts
- Scope: src/orchestra/, src/agents/, tests/agents/
### Description
The sprint-343 002 worker's source edit did not merge. Disk-verify NOW: `src/orchestra/sprint-runtime.ts:9`
still says "`enforce_rbac` is not yet declared on ResolvedConfig (MASTER-PLAN backlog)" — that comment is
STALE (the flag IS declared at `config-types.ts:921`). **Fix:** correct/remove that stale comment so it
states `enforce_rbac` IS declared on ResolvedConfig (no logic change; the `:30` cast read stays
byte-for-byte). Then VERIFY on disk that `src/agents/worker.ts` `checkWorkerAuthority` honors
`opts.enforceRbac` (deny on real scope-violation when the flag is on, soft-allow default-off) — the
sprint-343 note claimed this already landed (sprint-325 `476a77ac`); if `grep -n enforceRbac
src/agents/worker.ts` confirms the honor-branch is present, leave worker.ts UNCHANGED (report the grep
proof); only if it is genuinely absent, add the minimal flag-on deny branch (default-off byte-for-byte).
The faithful test `tests/agents/worker-authority-enforce.test.ts` ALREADY exists in-tree (landed
sprint-343) — read it, make it pass, do NOT rewrite it. Tier-0.
### goNogo
- goCriteria: `src/orchestra/sprint-runtime.ts` no longer claims `enforce_rbac` is undeclared (grep proof
  in result: `grep -c 'not yet declared' src/orchestra/sprint-runtime.ts` → 0); worker.ts enforceRbac
  honor verified present (grep proof) OR added minimally if absent; the existing
  `tests/agents/worker-authority-enforce.test.ts` is GREEN; `tsc --noEmit` 0-new; affected agents/orchestra
  tests GREEN.
- nogo: changing the `enforce_rbac` cast-read logic; flipping the product soft default; rewriting a
  passing test; touching config-types.ts / authority-matrix.ts / sprint-spawner.ts; `process.cwd()`.

## Task 2: 008-redo — skill-sandbox AST-scan honest-fail when TypeScript is unavailable
- Model: sonnet
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/core/marketplace/skill-sandbox.ts
- Scope: src/core/, tests/core/
### Description
The sprint-343 008 worker's source edit did not merge. Disk-verify NOW: `src/core/marketplace/
skill-sandbox.ts:78` still does a silent `return []` when `require('typescript')` fails (the
`__SANDBOX_UNAVAILABLE__` sentinel is absent on disk), so a sandbox scan on a host without the TS
compiler reports ZERO violations — indistinguishable from a clean scan (the dangerous silent-pass for a
security gate). **Fix (matching the already-landed test):** replace the silent empty return with the
explicit unavailable sentinel the test expects — read `tests/core/skill-sandbox-honest-fail.test.ts`
(already in-tree) for the exact expected contract (the sprint-343 worker used
`['__SANDBOX_UNAVAILABLE__:typescript-not-installed']` returned through the existing
`validateSkillSafety` loop so it surfaces in `SafetyReport.issues` → `safe:false`); implement exactly
what the landed test asserts. The happy path (TS present → real AST scan) stays byte-for-byte. Do NOT
rewrite the test. Tier-0. `skill-sandbox.ts` is this task's SOLE write.
### goNogo
- goCriteria: `grep -n __SANDBOX_UNAVAILABLE__ src/core/marketplace/skill-sandbox.ts` shows the sentinel
  on disk (grep proof in result); the already-landed `tests/core/skill-sandbox-honest-fail.test.ts` is
  GREEN; TS-present happy path unchanged; `tsc --noEmit` 0-new; affected core tests GREEN.
- nogo: keeping the silent empty-array no-op; a new runtime dependency; redesigning the scanner API;
  changing the happy-path output; rewriting the landed test.

## Task 3: 009-redo — getMessage deduplicated prod-warn on missing i18n key
- Model: sonnet
- Effort: low
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/cli/helpers/messages.ts
- Scope: src/cli/helpers/, tests/cli/
### Description
The sprint-343 009 worker's source edit did not merge. Disk-verify NOW: `src/cli/helpers/messages.ts`
`getMessage` missing-key branch still has NO deduplicated production warning (only the existing
non-production dev-warn at `:2037`). **Fix (matching the already-landed test):** add a module-level
`Set<string>` (the sprint-343 worker named it `_missingKeyWarnedInProd`) before `getMessage`; in the
missing-key branch, emit ONE stderr warning per UNIQUE key even in production (dedup via the Set), while
the non-production dev-warn stays unchanged; the fallback return value (`key`) is unchanged. Read
`tests/cli/get-message-missing-key-warn.test.ts` (already in-tree) for the exact contract and implement
to pass it. No new i18n key, no message-catalog edit, no signature change. `messages.ts` is clean (not
dirty) and is this task's SOLE write. Tier-0.
### goNogo
- goCriteria: `grep -n 'missingKeyWarned\|_missingKeyWarnedInProd' src/cli/helpers/messages.ts` shows the
  dedup set on disk (grep proof in result); the already-landed `tests/cli/get-message-missing-key-warn.test.ts`
  is GREEN (prod warns once per key, second call no warn, present key never warns, return value still the
  raw key); `tsc --noEmit` 0-new; affected messages tests GREEN.
- nogo: warning on every call (must dedup); changing the fallback return value or `getMessage` signature;
  throwing on a missing key; editing the message catalog; rewriting the landed test.
