# prompt-contract-397 fixtures

Sprint-397'nin üç gerçek task-tanımından (007-ELOOP · 011-DOCS-SAYILAR · 012-BASELINES) türetilen
statik SatisfiabilityInput fixture'ları. Kaynak: `git show 2afa0ba0:DIRECTIVES.md` Task 7/11/12 +
`.analysis/prompt-contract-verification-2026-07-10.md` §1 ground-truth tablosu.

`src/orchestra/scope-satisfiability.ts` (G1b) lint kurallarının regresyon-tabanı: bu üç vaka
sprint-397'de gerçek hasar üretti (sessiz kök-dosya drop · typo-path · unchanged∩WRITE).
Testler bu dosyaları statik yükler — runtime'da git çağrısı YOK (hermetiklik).
