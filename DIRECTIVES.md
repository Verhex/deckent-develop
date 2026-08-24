# SPRINT-666 — SKILL PROMPT DEDUP (TEK-ENJEKSIYON KARPATHY) + PIPELINE CANARY

## Goal

Her worker-prompt'una skill başına bir kez daha basılan `## Karpathy Notes` bloklarını compose
anında tekilleştir: skill gövdeleri prompt'a girerken bu kuyruk-bölümü süzülür; disiplin
worker'a yalnız system-prompt kanalındaki tek `## Karpathy Discipline` çapasıyla bir kez gider
(owner 2026-08-25: ölçüldü — `.tasks/.prompt-664-*` her birinde 3 kopya, ~36KB prompt). Bu run
aynı zamanda onarılmış collect/evaluate boru-hattının uçtan-uca ilk tam-tur kanaryasıdır.

## Execution contract

- DOGFOOD_MODE=ON; tek active outcome bu paket. Yeni MASTER root/outcome açılmaz.
- Files listeleri exact path taşır; glob/directory-prefix write grant yoktur.
- Wave 1: Task 1 tek başına. Wave 2: read-only Task 2 fan-in Task 1'e bağlı.
- SKILL.md İÇERİKLERİ DEĞİŞTİRİLMEZ (veri değil yapı düzeltilir); süzme compose-katmanındadır
  ve `## Karpathy Notes` başlıklı bölümü bölüm-sonuna (bir sonraki `## ` ya da dosya-sonu)
  kadar keser. Başka hiçbir skill-bölümü etkilenmez.
- Direct manual source edit yoktur. `.deckent/runtime/*`, `follow-up-works/*`,
  `docs/MASTER-PLAN.md`, handoff receipt'leri kapsam dışıdır.
- Aktif run sırasında build, full suite, provider auth/config/bot mutation yoktur. Testler
  hermetik; local forks en çok 2; repo-global tsc dalga-sonu Brain'de.
- Yeni test-dosyası enflasyonu yok: pinler MEVCUT prompt-template suite'ine eklenir.
- i18n: user-facing string getMessage(en+tr); model/akış-değeri literal'i koda yazılmaz.

## Task 1: Compose-time skill Karpathy dedup
- Files: src/orchestra/prompt-god-template.ts, tests/orchestra/prompt-god-template.test.ts
- Reads: src/core/skill-pool.ts, src/core/builtins/skills/typescript-expert/SKILL.md, src/core/builtins/skills/testing-expert/SKILL.md
- Dependencies: none
- Priority: CRITICAL
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/prompt-god-template.test.ts
### Description
Skill gövdeleri worker-prompt'una render edilirken her gövdenin `## Karpathy Notes` bölümü
(başlıktan bir sonraki `## ` başlığına ya da gövde-sonuna kadar) süzülür. Composed prompt'ta
`## Karpathy Discipline` çapası TAM BİR kez bulunur ve `## Karpathy Notes` HİÇ bulunmaz —
bu iki değişmez, mevcut prompt-god-template suite'ine gerçek çok-skill fixture'ıyla pinlenir
(3 skill'li kompozisyonda önce 3 kopya vardı; süzme sonrası 0). Süzme yalnız tam-başlık
eşleşmesiyle yapılır; skill'in diğer bölümleri bayt-aynen korunur. Read-only persona yolunda
(READ_ONLY_DISCIPLINE_BLOCK) davranış değişmez.

## Task 2: Read-only dedup fan-in
- Reads: src/orchestra/prompt-god-template.ts, src/core/skill-pool.ts, tests/orchestra/prompt-god-template.test.ts
- Dependencies: Task 1
- Priority: HIGH
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/orchestra/prompt-god-template.test.ts tests/orchestra/worker-core-system-prompt.test.ts
### Description
Mutation yapmadan Task 1'in süzme-zincirini bağımsız türet: süzmenin compose-katmanında
olduğunu, SKILL.md dosyalarının değişmediğini, declared testlerin 0 fail olduğunu ve
`## Karpathy Notes` metninin composed-prompt üretim yolunda artık ulaşılamaz olduğunu
raporla. Project source/test/docs değişikliği NO-GO'dur; yalnız worker lifecycle
`.hb`/`.result` yazılır.
