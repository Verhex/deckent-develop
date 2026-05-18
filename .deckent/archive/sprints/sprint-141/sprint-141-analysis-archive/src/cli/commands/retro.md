# Analysis: src/cli/commands/retro.ts
**Task ID:** 141-003 | **LoC:** 454

## 1. Amacı
Sprint retrospektifini gösterir. --raw, --compare, --json, --perf, --trend seçenekleri. Agent/Skill performance parsing, trend analizi.

## 2. Public API (export listesi)
- `registerRetro(program: Command): void`
- `parseRetroToRichSummary(content): RichSprintSummary`
- `formatRichSummary(summary, lang?): string`
- `computeRetroDelta(current, previous, lang?): string`
- `parseAgentPerformanceFromRetro(content): AgentPerfRow[]`
- `parseSkillPerformanceFromRetro(content): SkillPerfRow[]`
- `formatAgentPerfTable(rows, lang?): string`
- `formatSkillPerfTable(rows, lang?): string`
- `loadSprintTrend(root, n?): SprintTrendEntry[]`
- `formatTrend(entries, lang?): string`
- `archiveCurrentRetro(root, sprintId): string | null`
- `RichSprintSummary`, `AgentPerfRow`, `SkillPerfRow`, `SprintTrendEntry` interfaces

## 3. İç + Dış Bağımlılıklar
- `../../core/constants.js` (BRAIN_DIR, RETRO_FILE, SPRINTS_DIR)
- `../helpers/config-reader.js` (getLangFromConfig)

## 4. Complexity
Cyclomatic: ~8 (trend, raw, json, compare, perf branches)
Regex-based parsing — kırılgan ama gerekli (file-based RETRO.md)

## 5. Type Safety
`RichSprintSummary` interface ✅
Regex match groups: `match?.[1] ?? '0'` — null safe ✅

## 6. ADR Compliance
✅ ADR-001, ADR-010
Sprint log file format: `sprint-{id}.md` kullanılıyor

## 7. Test Coverage
Test: `tests/cli/retro.test.ts`

## 8. TODO/FIXME/HACK inventory
Yok.

## 9. Dead Code Candidates
`archiveCurrentRetro` — retro komutundan çağrılmıyor, sprint-controller'dan çağrılıyor mu?

## 10. Security Findings
Düşük — read-only RETRO.md parse.

## 11. Memory V2 Uyumu
⚠️ retro.ts hâlâ file-based RETRO.md parse ediyor. Memory V2'de sprint/retro entry'leri DB'de saklanıyor — ancak retro display için dosya-based kalması `git diff` için pratik.
Sprint trend: `loadSprintTrend` → .brain/sprints/*.md dosyalarını okuyor — DB'den de alınabilir.

## 12. Öneriler
RETRO_LABELS: hardcoded i18n dict — gelecekte i18n dosyalarına taşınabilir (ama sprint için yeterli)

## 13. Verdict: ANALYZED
