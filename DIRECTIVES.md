# DIRECTIVES — SPRINT-401: MINI DOC-TASK (614 canlı-yeniden-kanıt + haiku-pilot)

## Goal
Tek küçük doc-task: born-606 gate-script'lerinin kullanım-rehberi. İkincil-amaç (Brain-tarafı):
training_trace canlı-kanıtı (614 config-threading fix'i sonrası ilk sprint) + haiku doc-sınıfı maliyet-ölçümü.

## 🔒 BAĞLAYICI
- Yalnız kendi Files'ına yaz · git stash/reset YASAK · build YASAK · notes TEK STRING · Self DÜRÜST.

## Task 1: DOC-AFFECTED-GATE — affected-tests kullanım rehberi
- Model: haiku | Agent: doc-writer | Skills: documentation-writer
- Files: docs/guides/affected-tests-gate.md
- Scope: docs/guides/
- Dependencies: none
### Description
YENİ dosya `docs/guides/affected-tests-gate.md`: born-606 gate'inin kullanım-rehberi. İçerik: (1) Ne işe yarar
(değişen-dosya→etkilenen-test import-graph'ı; blast-radius-ıskalama sınıfının kök-kesimi); (2) Komutlar —
`npm run verify:affected` (origin/main-base default) · `-- --changed <dosyalar>` · `-- --list` · `-- --dry-run` ·
`-- --base <ref>` · `--max-files` davranışı (aşımda tam-suite yönlendirmesi, exit 2); (3) scripts/affected-tests.mjs
--json çıktı-alanları (changed/affected/graphStats.unresolvedImports); (4) Bilinen-eksikler (readFileSync-src
composition-pin testleri, fixture-JSON yol-okuyanlar — kaynak: script doc-comment'i; AYNEN aktar, uydurma);
(5) Ne-zaman-tam-suite (core-hub dosyaları örn. scheduler-truth→674-affected gerçeği). Kaynak-doğruluk: script
doc-comment'lerinden ve --help/--json gerçek-çıktısından yaz — komutları çalıştırıp çıktıyı doğrulayabilirsin
(read-only). TR-yazma; kod/flag adları EN.
### goNogo
- goCriteria: dosya var; 5 bölüm eksiksiz; komut/flag adları script-gerçeğiyle birebir (uydurma flag yok); bilinen-eksikler dürüst-aktarılmış.
- Kanıt: `test -f docs/guides/affected-tests-gate.md` + `grep -c "verify:affected" docs/guides/affected-tests-gate.md` ≥ 1.
