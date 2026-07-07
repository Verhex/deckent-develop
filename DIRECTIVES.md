# DIRECTIVES — PUBLISH-P4: DOCS-DOĞRULUK + PACK-SIZE + RESTORE-QUIRK (3 task)

## Goal
Publish-gate'in kalan iki kırmızısının (pack-size, docs-sayı-kaosu) kapanması + DIRECTIVES-restore
yan-etkisinin fix'i. HER task canlı-smoke kanıtlı. Yasa #1/#2/#3.

## 🔒 BAĞLAYICI
- DISTINCT-FILE: sprint-planner/result-evaluator/sprint-phases/result-collector/sprint-controller/
  server.ts/config.ts KAPALI.
- **git stash/checkout/reset YASAK** (born-499 — worker-default kuralı; karşılaştırma `git show HEAD:`).
- Hermetik test; i18n getMessage. Worker `notes` TEK STRING. Honest.

## Task 1: DOCS-NUM-TRUTH — README/DECKENT sayı-ve-dil doğruluğu
- Model: sonnet
- Effort: high
- Skills: doc-writing, typescript-expert
- Files: README.md, README-TR.md, DECKENT.md, tests/docs/readme-number-truth.test.ts
- Scope: ./, docs/, scripts/, src/
- Dependencies: none
- Smoke: node scripts/update-readme-stats.mjs --check → 0-drift && npm run lint:link → temiz
### Description
user-truth-audit §4 sayı-kaosu: README'de 35/37 tool + 15 agent + 21 skill + 16-vs-20 sayfa
çelişkisi; DECKENT.md'de 35/15/21/13. GERÇEK (koddan): 46 tool (TOOL_CATALOG) · 20 agent · 31 skill ·
14 model · 20 dashboard-sayfası · 79 registry-komutu. (1) Generator'ları koş (update-readme-stats +
gen-reference-docs, --write) ve AUTOGEN-blok-dışı ELLE-yazılmış her bayat-sayıyı üç dosyada düzelt;
(2) elle-satırları mümkünse AUTOGEN-bloklara bağla (drift bir daha olmasın); (3) başlık/özet
cümlelerine RUN-köprü-dili ("run (formerly sprint)"); (4) DECKENT.md'nin iç-pivot-notu bölümünü
(satır ~6-10) İÇ-doc'a taşı-notu ile kaldır (docs/analysis'e taşı). Test: üç dosyada bayat-sayı
kalmadığını pin'leyen sayı-tutarlılık testi (kaynak=TOOL_CATALOG/builtins-sayımı — canlı-türetilmiş,
hardcode-pin değil).
### goNogo
- goCriteria: --check 0-drift; sayı-tutarlılık testi yeşil; lint:link temiz; elle-bayat-sayı grep'i
  boş (46/20/31/14 dışı eski-değerler yok).
- nogo: docs/ gövde-yeniden-yazımı (yalnız sayı/dil-düzeltme + blok-bağlama).

## Task 2: PACK-SIZE — npm-paketi <5MB
- Model: sonnet
- Effort: high
- Skills: typescript-expert, devops
- Files: package.json, .npmignore, scripts/validate-publish.mjs, tests/cli/pack-size-budget.test.ts
- Scope: ./, scripts/, tests/, src/dashboard/
- Dependencies: none
- Smoke: npm run validate:publish → pack_size_and_count PASS
### Description
Gate: 6.0MB > 5MB. ÖNCE ölç: `npm pack --dry-run --json` içerik-dökümü — en büyük 20 dosyayı
notes'a yaz. Beklenen-şişkinler: dist/**/*.map (source-map'ler pakete girmemeli), dist/dashboard
(assets/'e zaten kopyalanıyorsa çift), .d.ts.map, test-artıkları. Budama: .npmignore/files-listesi
cerrahi-daraltma (dist çalışır-bütünlüğü BOZULMADAN — bin'ler + assets + d.ts'ler kalır). Sınır
yaklaşıksa tsconfig sourceMap-üretimini publish-build'de kapatma seçeneğini DEĞERLENDİR (notes'ta
gerekçele; build:all davranışı değişmeden). Test: pack-dry-run boyut-bütçesi (<5MB) + kritik-dosya
varlık-listesi (entry/bin/assets) — regresyon-bekçisi.
### goNogo
- goCriteria: validate:publish 8-gate İÇİNDE pack_size PASS; kritik-dosya testi yeşil; `deckent
  --help` + `deckent-mcp` smoke pack-sonrası çalışır (dist bozulmadı).
- nogo: dist içerik-silme (yalnız paket-dışlama); gate-limitini gevşetme.

## Task 3: DIRECTIVES-RESTORE-QUIRK — kapanışta eski-içeriğe dönme fix'i
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: tests/orchestra/directives-restore-quirk.test.ts
- Scope: src/orchestra/, src/cli/, tests/orchestra/, .brain/
- Dependencies: none
### Description
Canlı-gözlem (378-kapanışı): sprint bitince DIRECTIVES.md içeriği bir ÖNCEKİ sürüme döndü (mtime
kapanış-anı). ÖNCE kök-bul: DIRECTIVES'e kapanışta kim yazıyor (grep: DIRECTIVES yaz/restore/backup —
archive-directives akışı, .brain/directives-backup/, managed-docs?). Kökü kanıtla (repro-test:
tmpdir-projede sprint-kapanış-yolunu çağır → DIRECTIVES değişmemeli). FIX kökün olduğu modülde
(scope src/orchestra+src/cli içinde kalmalı; DISTINCT-kapalı dosyadaysa BLOCKED-raporla, fix'i
tarif et). born-499'un stash'i de şüpheli-listede — ayırt et (378'de İKİ mekanizma da oynadı mı).
### goNogo
- goCriteria: kök-neden kanıt-testli (önce-kırmızı); fix sonrası kapanış DIRECTIVES'i korur (test);
  mevcut archive-directives testleri yeşil.
- nogo: DISTINCT-kapalı dosyaya yazım (bulgu-raporla); arşivleme-davranışını silme.
