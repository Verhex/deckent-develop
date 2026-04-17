# Analysis: src/cli/commands/status.ts
**Task ID:** 141-003 | **LoC:** 402

## 1. Amacı
Sprint durum dashboard'unu gösterir. --watch, --json, --raw, --verbose, --mode, --graph seçenekleri destekler. fs.watch ile verimli live-update.

## 2. Public API (export listesi)
- `registerStatus(program: Command): void`
- `loadDepGraphForSprint(root, sprintId): string | null`
- `loadTaskFiles(root): Task[]`
- `formatAgentAssignments(tasks, verbose): string`
- `formatSkillAssignments(tasks, verbose): string`
- `getLangFromRoot(root): string`

## 3. İç + Dış Bağımlılıklar
- `../../core/constants.js`, `../../core/types.js`
- `../../core/output-formatter.js` (formatStatus, resolveOutputMode)
- `../../monitor/sprint-state.js` (getCurrentSprintId)

## 4. Complexity
Cyclomatic: ~10 (watch mode, json/raw/mode branches, agent/skill format, depGraph)

## 5. Type Safety
✅ `StatusOpts` interface — explicit
`readFileSync(dashPath, 'utf-8')` → `JSON.parse` → `as DashboardState` — casting

## 6. ADR Compliance
✅ ADR-008: status.ts orchestra/ importlamıyor (fs-based, comment satır 26 bunu açıklıyor) ✅

## 7. Test Coverage
Test: `tests/cli/status.test.ts`

## 8. TODO/FIXME/HACK inventory
Yok.

## 9. Dead Code Candidates
Yok.

## 10. Security Findings
Düşük — read-only dashboard görüntüleme.

## 11. Memory V2 Uyumu
N/A — status.ts Memory V2 direkt kullanmıyor.

## 12. Öneriler
fs.watch + setInterval dual-track yaklaşımı resilient ✅

## 13. Verdict: ANALYZED
