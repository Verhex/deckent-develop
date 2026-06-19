# DIRECTIVES — Sprint: Fix sprint-301 CC-verify regressions (idle + RBAC + allowlist)

## Goal: sprint-301 (29-task comprehensive batch) CC-verify'da full-suite **5 fail / 3 dosya** verdi (worker'lar kendi testini geçti ama cross-module regresyon — Brain "30/30 DONE" dedi, disk farklı diyor). 3 regresyon: (1) **IDLE-SPIN** threshold-backoff mevcut+kendi runtime-loop testini çeliyor; (2) **ENT-1 RBAC** 'operator' rolü (execute-yetkili) yanlış deny ediliyor; (3) **autonomous-mission.ts** generic-throw allowlist'te değil. 2 task paralel (distinct files). Cerrahi, TDD.

## Ortak kurallar (BAĞLAYICI)
- **Cerrahi** — yalnız Files/Scope. **ESM** `.js`. **No haiku.** **Hermetik test.**
- **CC-verify gate (KRİTİK):** `tsc --noEmit` temiz + **`npx vitest run tests/orchestra tests/core` FULL YEŞİL** (yalnız yeni test değil — kırılan mevcut testleri de geçir). v1-default korunur.

---

## Task 1: IDLE-SPIN fix + error-handling allowlist
- Model: sonnet | Effort: normal | Agent: refactorer | Skills: typescript-expert
- Files: src/orchestra/autonomous/runtime-loop.ts, tests/core/error-handling-unification.test.ts
- Scope: src/orchestra/autonomous/, tests/core/
### Description
**(A) IDLE-SPIN logic fix:** `runtime-loop.ts` şu an `waitMs = consecutiveIdle >= IDLE_BACKOFF_THRESHOLD ? intervalMs : 0` (threshold-backoff) — bu, ilk N idle-tick'i 0-sleep yapıyor → mevcut `tests/orchestra/autonomous-runtime-loop.test.ts`'in **3 testini** çeliyor ("idle tick (no_trigger) → intervalMs HEMEN", "idle real wire → all sleeps intervalMs", "pending outcome sleeps intervalMs — busy-spin prevented"). Doğru-fix: **non-active outcome (no_trigger/pending/denied/rejected) → HEMEN `intervalMs` sleep; active/executed → 0**. `consecutiveIdle`/`IDLE_BACKOFF_THRESHOLD` threshold mantığını KALDIR — `const waitMs = isActiveOutcome(result.outcome) ? 0 : options.intervalMs;` (active = 'executed'/'dispatched'; geri kalan idle→intervalMs). Bu hem busy-spin'i önler (idle→intervalMs) hem 3 testi + kendi idle-spin testini geçirir.
**(B) allowlist:** `tests/core/error-handling-unification.test.ts:593` `ALLOWED_FILES` Set'ine `'autonomous-mission.ts'` ekle (CLI input-validation throw — `process.ts`/`mcp.ts` ile aynı operasyonel kategori).
**Kanıt:** `grep -n "IDLE_BACKOFF_THRESHOLD\|consecutiveIdle" src/orchestra/autonomous/runtime-loop.ts` → threshold gitti; `grep -n "autonomous-mission" tests/core/error-handling-unification.test.ts` → eklendi.
**Test:** `npx vitest run tests/orchestra/autonomous-runtime-loop.test.ts tests/orchestra/autonomous/idle-spin.test.ts tests/core/error-handling-unification.test.ts` → TAM yeşil (kırılan 3 idle + 1 allowlist testi geçer; mevcut idle-spin testi korunur).

---

## Task 2: ENT-1 RBAC — operator (execute role) permit fix
- Model: opus | Effort: high | Agent: architect | Skills: typescript-expert, security-specialist
- Files: src/nervous/authority-matrix.ts, tests/nervous/authority-matrix.test.ts
- Scope: src/nervous/, tests/nervous/
### Description
`tests/orchestra/autonomous/engine-wiring.test.ts` "permits machine-initiated dispatch when the enforced role has execute (operator)" FAIL — `rbac_policy.role:'operator'` + `capabilityTarget:{capability:'echo'}` dispatch'i 'executed' yerine 'failed' veriyor. **Kök-neden:** ENT-1'in role→capability allow-map'inde (`authority-matrix.ts:~202`, `normalizeWorkerRole:~262`) 'operator' rolü, capability-dispatch'in gerektirdiği yetkiye (execute/dispatch) sahip DEĞİL ya da 'operator' taxonomy'de yok → yanlış deny. **Önce OKU:** `checkWorkerAuthority` + ROLE→Capability map + `normalizeWorkerRole` + engine-wiring test'in operator'a verdiği capability-gereksinimi. **Fix:** 'operator' rolü execute/dispatch-class capability'lere İZİN versin (admin=all, engineer=dev, **operator=execute/dispatch + read**, viewer=read-only). "denies viewer (read-only, execute yok)" testi (engine-wiring:161) GEÇMEYE devam etmeli — yani viewer execute'tan men, operator'a izin. Map'i + (varsa) normalizeWorkerRole'u düzelt.
**Kanıt:** `grep -n "operator\|execute\|dispatch" src/nervous/authority-matrix.ts` → operator allow-map'i execute içerir; test yeşil.
**Test:** authority-matrix.test.ts'e operator-permit + viewer-deny unit-case ekle; `npx vitest run tests/orchestra/autonomous/engine-wiring.test.ts tests/nervous/authority-matrix.test.ts` → TAM yeşil (operator→executed, viewer→denied korunur).

---

**Beklenen:** 2 task paralel (runtime-loop+error-test · authority-matrix). Sprint-sonu: `tsc --noEmit` temiz + **FULL `npx vitest run tests/orchestra tests/core tests/nervous` YEŞİL** (5 regresyon giderilir, mevcut hepsi korunur). CC: sprint-301+302 birlikte build.
