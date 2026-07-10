# DIRECTIVES — SPRINT-399: FAZ-0.9 KONTRAT-BÜTÜNLÜĞÜ ÇEKİRDEKLERİ (4 task, DISTINCT-FILE)

## Goal
Sprint-397'de kanıtlanan prompt-kontrat açıklarının (spec: `.analysis/prompt-contract-verification-2026-07-10.md`)
AYRIŞTIRILABİLİR çekirdeklerini inşa et: SAN-1 sanitizer kök-dosya-drop fix'i · G6a stack-typecheck zinciri ·
SAN-2 scope-gate suggestion-adoption · G1b satisfiability-lint YENİ modülü. Wiring bu sprint'in KAPSAMI DIŞINDA —
Brain sprint-sonrası el-kodla yapar (Brain wiring-listesi: prompt-god-template.ts:664 trackedRootFiles ·
prompt-gate.ts satisfiability+sanitizer-BLOCK entegrasyonu · pre-spawn resolution-adoption [task filesWrite
mutasyonu + advisory yüzeyi] + resolveSuggestions flag-açma · fix-cascade re-gate · sprint-planner.ts:431 +
sprint-utils.ts:454 typecheck-zinciri · planner.ts:973 ölü-kod disposition). Sen çekirdeği PURE + test-kanıtlı
teslim et. Her task REPRODUCE-first: 397-vakası fixture'ı önce RED, sonra fix. Yasa #1/#2/#3.

## 🔒 BAĞLAYICI
- DISTINCT-FILE: yalnız kendi `Files:` listendekilere yaz; başka task'ın dosyasına DOKUNMA.
- git stash/reset/checkout/clean YASAK · `npm run build` YASAK (sprint-içi) · hermetik test (tmpdir, gitignored-state okumadan) · `notes` TEK STRING · Self-assessment DÜRÜST.
- Kanıt her task'ta TAM dosya-koşusu (`npx vitest run <kendi test dosyaların>`) + `npx tsc --noEmit` temiz.
- Public-API kırma YASAK: yeni parametreler OPSİYONEL, mevcut çağıranlar davranış-değişmeden derlenmeli (wiring Brain'de).
- Mekanizma-modülü = string-free/EN operator-metni (mevcut desen); user-facing i18n YOK bu katmanda.
- PARALEL-TSC GÜRÜLTÜSÜ: `npx tsc --noEmit` hatası kendi Files-listende OLMAYAN dosyadan geliyorsa = paralel-task
  gürültüsü — 60sn bekle + tekrar dene; ısrar ederse kendi dosyalarının temizliğini hata-listesinden filtreleyerek
  raporla ve bunu NO_GO sebebi SAYMA (scope-dışı dosyayı "düzeltmeye" ASLA kalkma).

## Task 1: SAN-1-CORE — sanitizeScope Rule-5 trackedRootFiles-aware (sessiz kök-dosya drop biter)
- Model: sonnet | Agent: bug-fixer | Skills: typescript-expert, testing-expert
- Files: src/orchestra/scope-sanitizer.ts, tests/orchestra/scope-sanitizer.test.ts, tests/orchestra/scope-sanitizer-v2.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
KANIT (sprint-397 gerçek hasarı): `sanitizeScope` Rule 5 (`scope-sanitizer.ts:114-124`) `/` içermeyen HER yolu
"unqualified filename" sayıp sessizce düşürüyor — 397-011'de `README.md`+`README-TR.md`, 397-012'de `.secrets-baseline`
task JSON'unda VARDI, render edilen WRITE-authority'den bu kuralla silindi (worker'lar işi yapamadı/yarım yaptı).
FIX: imzayı `sanitizeScope(filesWrite: string[], trackedRootFiles?: ReadonlySet<string>)` yap (opsiyonel — çağıran
güncellemesi Brain'de). Rule 5 yeni davranış: yol `/`'sız VE `trackedRootFiles` verilmiş VE set yolu içeriyorsa
(exact-match, git-tracked kök-dosya) → KORU (cleaned'e geçir); set verilmemişse veya yol sette yoksa → mevcut
warn+drop aynen. Rule 6 GLOBAL_PROTECTED davranışı AYNEN kalır (package.json vb. korumalı-drop; trackedRootFiles
onu override ETMEZ). Rule 1-4/7-10 dokunma. REPRODUCE-first: önce `README.md`/`README-TR.md`/`.secrets-baseline`
fixture'larıyla (trackedRootFiles={'README.md','README-TR.md','.secrets-baseline','DIRECTIVES.md'}) RED test yaz
(bugün drop ediliyor → testin yeni-davranış bekleyip kırmızı kalması), sonra fix'le yeşile çevir. Ek testler:
set-verilmemiş geri-uyumluluk (mevcut tüm testler değişmeden geçmeli) · sette-olmayan unqualified hâlâ drop ·
GLOBAL_PROTECTED ∩ trackedRootFiles yine drop · Windows `\\` yolu davranışı değişmedi.
### goNogo
- goCriteria: Rule-5 trackedRootFiles-aware; 397-011/012 fixture'ları yeşil; geri-uyumluluk tam (param'sız çağrı davranış-identik); iki test dosyası TAM yeşil.
- Kanıt: `npx vitest run tests/orchestra/scope-sanitizer.test.ts tests/orchestra/scope-sanitizer-v2.test.ts` → 0 fail; `npx tsc --noEmit` temiz.

## Task 2: G6a-CORE — STACK_COMMANDS typecheck alanı + criteria-deriver tercih zinciri (DoD'daki çıplak-tsc dist-emit talimatı biter)
- Model: sonnet | Agent: refactorer | Skills: typescript-expert, testing-expert
- Files: src/core/stack-detector.ts, src/core/criteria-deriver.ts, tests/core/stack-detector.test.ts, tests/core/criteria-deriver.test.ts
- Scope: src/core/, tests/core/
- Dependencies: none
### Description
KANIT (N5): `STACK_COMMANDS.typescript.build = 'npx tsc'` (`stack-detector.ts:30`) → `criteria-deriver.ts:78-82`
bunu goCriteria'ya "`npx tsc` succeeds" olarak basıyor; tsconfig'de noEmit YOK + outDir=./dist → worker'a sprint
ORTASINDA dist-emit talimatı (ESM-cache tehlikesi, yasak-op). FIX (iki dosya, tek zincir): (a) `STACK_COMMANDS`
tipine `typecheck: string` alanı ekle (required — TÜM literal'ler aynı dosyada: satır 30-47 tablosu + satır ~157
`?? { build:'', test:'', lint:'' }` fallback'i + `FullStackResult.commands` tipi, üçü de senin Files'ında) ve HER dile
dürüst değer ver — typescript:'npx tsc --noEmit' · go:'go vet ./...' · rust:'cargo check' — bilmediğine uydurma değer
YAZMA: tip-checkli dillerde gerçek hafif-doğrulama komutu biliniyorsa yaz, bilinmiyorsa/ayrımı yoksa `''` (dürüst-boş;
Yasa#2 "unsupported honest-fail"). Python:'' (mypy proje-bağımlı, varsayma) · javascript:'' vb. (b) `criteria-deriver`
proof-satırı tercihi: `typecheck` doluysa build YERİNE typecheck bas ("`npx tsc --noEmit` passes"); typecheck boş +
build doluysa mevcut davranış; ikisi de boşsa mevcut neutral-phrasing. ⚠ deriver-INPUT tarafında (`criteria-deriver.ts:20`
`StackCommands`/opts tipi) `typecheck?: string` OPSİYONEL olmalı — required yaparsan T2-dışı `sprint-utils.ts:489`
tsc-kırılır. REPRODUCE-first: önce "typescript kind=code + typecheck'li commands → goCriteria 'npx tsc --noEmit' içerir
ve 'npx tsc succeeds' İÇERMEZ" testi RED, sonra fix. Mevcut consumer'lar (`temp-skill-generator.ts:38-44`,
`worker-verify.ts:39`) yalnız-okur, alan-eklemeyle kırılmaz — onlara DOKUNMA, derlendiklerini tsc ile doğrula.
NOT: uçtan-uca zincir (sprint-planner.ts:431 + sprint-utils.ts:454 fresh-literal'leri typecheck'i düşürür) SENİN
kapsamın DIŞINDA — Brain wiring'i; kanıtın YALNIZ deriver-unit düzeyinde (deriveBaseCriteria'ya typecheck'li commands
geçirerek), "DoD'da çıplak-tsc sıfır" iddiasını uçtan-uca DOĞRULAMAYA çalışma.
### goNogo
- goCriteria: typecheck alanı tüm girdilerde (dürüst-boş dahil); criteria-deriver UNIT-düzeyde TS'de --noEmit basar, çıplak-tsc üretmez; iki test dosyası TAM yeşil; consumer'lar derleniyor.
- Kanıt: `npx vitest run tests/core/stack-detector.test.ts tests/core/criteria-deriver.test.ts` → 0 fail; `npx tsc --noEmit` temiz.

## Task 3: SAN-2-CORE — scope-gate suggestion-adoption çözümleyici (typo-suspect'ler otomatik çözülür, force-scope daralır)
- Model: sonnet | Agent: bug-fixer | Skills: typescript-expert, testing-expert
- Files: src/core/scope-gate.ts, tests/core/scope-gate.test.ts
- Scope: src/core/, tests/core/
- Dependencies: none
### Description
KANIT (N6 + 397-007/011): gate typo-suspect'e DOĞRU did-you-mean üretti ama çözüm mekanizması yok → sprint
`--force-scope` ile TÜM suspect'leri dalgalandırarak başlatıldı; 011'de typo-dupe (`docs/refdocs-adr-regen.test.ts`)
doğru yolun (`tests/docs/...`) YANINDA emit edildi. FIX (evaluateScopeGate PURE kalır, uygulama çağıranda):
input'a `resolveSuggestions?: boolean` (default **false**) + sonuç tipine `resolutions: ScopeResolution[]` ekle —
`{ path, action: 'drop-duplicate' | 'auto-replace', replacement?: string, reason: string }` (union'ın iki sonuç-
varyantına da OPSİYONEL alan). Kural: (a) write-suspect'in `suggestion`'ı ZATEN aynı task'ın filesWrite'ında
(case-fold + `./`-strip eşleşme — sanitizer Rule-8 tutarlılığı) → `drop-duplicate` (011-dupe sınıfı); (b) suggestion
var VE unambiguous (repo'da o basename'le TEK aday — classify'daki mevcut `byBasename`/`siblings.length===1`
bilgisinden türet, yeni index KURMA) → `auto-replace` (007 sınıfı); (c) suggestion'sız veya çok-adaylı → resolution
YOK. ⚠ BLOKLAMA-SEMANTİĞİ İKİ-MODLU (wiring-öncesi gate-zayıflaması YASAK): `resolveSuggestions:false` (default) →
`blocked`/`suspects` hesabı BUGÜNKÜYLE BİT-İDENTİK (çözümlü suspect de bloklar), `resolutions` yalnız advisory-veri
olarak döner; `resolveSuggestions:true` → çözümlü suspect'ler blok-dışı (advisory'ye düşer, reason'lı), yalnız
çözümsüzler bloklar. İKİ MOD DA testli. Flag'i production'da açmak Brain wiring-işi — sen açık BIRAKMA.
REPRODUCE-first: 397-007 (tests/cli→tests/core auto-replace) + 397-011 (dupe-drop) fixture'ları önce RED (true-modda).
Ek: aynı basename 2+ dizinde → çözümsüz-kaldı · read-suspect'e resolution üretilmez · false-modda bit-identiklik testi.
### goNogo
- goCriteria: resolveSuggestions iki-mod + resolutions alanı + 3 kural test-kanıtlı; default-modda davranış bit-identik, true-modda çözümlü-suspect bloklamaz; dosya TAM yeşil.
- Kanıt: `npx vitest run tests/core/scope-gate.test.ts` → 0 fail; `npx tsc --noEmit` temiz.

## Task 4: G1b-CORE — YENİ scope-satisfiability lint modülü (görev-metni ↔ yazma-yetkisi tutarlılık kontratı)
- Model: opus | Agent: refactorer | Skills: typescript-expert, testing-expert
- Files: src/orchestra/scope-satisfiability.ts, tests/orchestra/scope-satisfiability.test.ts, tests/fixtures/prompt-contract-397/task-007.json, tests/fixtures/prompt-contract-397/task-011.json, tests/fixtures/prompt-contract-397/task-012.json
- Scope: src/orchestra/, tests/
- Dependencies: none
### Description
KANIT (N3 + spec §4-P0-2): satisfiability boyutu gate'te yok; ölü `validateGoCriteriaScope` (planner.ts:973 — ona
DOKUNMA, hot-file; disposition Brain'de) yalnız test-path kontrolü yapıyor ve hiç wire edilmedi. YENİ PURE modül yaz:
`src/orchestra/scope-satisfiability.ts` — `lintScopeSatisfiability(input: SatisfiabilityInput): SatisfiabilityFinding[]`.
`SatisfiabilityInput = { description: string; goCriteria: string; proofCommands?: string[]; filesWrite: string[];
directories: string[]; trackedFiles: readonly string[] }` (task-tipine bağımlılık YOK, orchestra-tiplerini import
etmeden bağımsız derlensin — wiring Brain'de). `SatisfiabilityFinding = { severity: 'BLOCK' | 'WARN'; code:
'MENTIONED_NOT_WRITABLE' | 'PROOF_PATH_MISSING' | 'UNCHANGED_IN_WRITE'; path: string; message: string }`. Üç kural:
(1) `MENTIONED_NOT_WRITABLE` — KATMANLI severity (precision kaynağa bağlı): **(1a)** goCriteria içinde geçen dosya-yolu
(regex: uzantılı ve `/`'li, veya trackedFiles'ta birebir-var olan kök-dosya adı) filesWrite∪directories kapsamında
değil → **BLOCK** (397-007'nin gerçek-dosyası yakalanır; goCriteria = kontrat, yüksek-precision). **(1b)** description
içinde fiil-komşuluğu: yalnız İKİ sinyal BİRLİKTE — path-regex eşleşmesi + pozitif fiil-lemma listesi
("pinle/güncelle/yaz/oluştur/ekle/taşı/düzelt/fix/update/write/create/add") — VE **negasyon-guard** (aynı cümlede
"DOKUNMA/değiştirme/dokunulmaz/do not touch/don't modify" varsa eşleşme İPTAL) → **WARN** (description = anlatı,
düşük-precision; Brain wiring'de kanıt-toplayıp BLOCK'a terfi ettirebilir). Emin değilsen finding ÜRETME (gate'i
gürültüye boğmak güveni öldürür). ZORUNLU negatif-fixture: "planner.ts:973 — ona DOKUNMA" tarzı cümle finding
üretmemeli (bu sprint'in kendi task-metni bile guard'sız heuristikte false-positive olurdu — test et).
(2) `PROOF_PATH_MISSING` — proofCommands (Kanıt-satırları) içindeki dosya-yolu argümanı trackedFiles'ta YOK VE
filesWrite'ta YOK VE `directories` kapsamında da DEĞİL (yeni-dosya-üretimi ve dizin-yetkisi meşru) → **BLOCK**
(007'nin `npx vitest run tests/cli/error-handling-unification.test.ts` Kanıt'ı yakalanır).
(3) `UNCHANGED_IN_WRITE` — "değişmeyecek/unchanged/AYNEN kalır/must remain" beyanlı dosya filesWrite'ta → **WARN**
(397-012 `ci-baseline-detect.test` vakası). Fixture'lar: task-JSON'lar cleanup'ta silindi — kaynak GİT'te:
`git show 2afa0ba0:DIRECTIVES.md` (read-only, izinli) Task 7/11/12 bloklarından description+goCriteria+Kanıt+Files
alanlarını AYNEN çıkarıp üç statik fixture-JSON'u olarak `tests/fixtures/prompt-contract-397/`'e YAZ (SatisfiabilityInput
şekline; 007'nin typo'lu `tests/cli/error-handling-unification.test.ts` Files-girdisi ve Kanıt-satırı, 011'in
README+typo-dupe'ları, 012'nin `.secrets-baseline`+"AYNEN kalır" beyanı korunur — çapraz-kaynak: `.analysis/
prompt-contract-verification-2026-07-10.md` §1 tablosu). Testler fixture'ları yükleyip beklenen finding'leri assert
eder (007→kural-1+2 · 011→kural-1'in README vakası trackedFiles'la · 012→kural-3) + temiz-task fixture'ı sıfır-finding;
testler runtime'da git ÇAĞIRMAZ (hermetik — fixture'lar statik dosya).
### goNogo
- goCriteria: modül PURE+bağımsız derlenir; 3 kural (1a-BLOCK/1b-WARN katmanlı) + 3 gerçek-397-fixture'ı + temiz-task kontrolü + ZORUNLU negasyon-guard negatif-fixture'ı ("DOKUNMA" cümlesi finding üretmez) test-kanıtlı; dosya TAM yeşil.
- Kanıt: `npx vitest run tests/orchestra/scope-satisfiability.test.ts` → 0 fail; `npx tsc --noEmit` temiz.
