# DIRECTIVES — SPRINT-407: PUBLISH-GATE + MALİYET (608 release-unify · 636-K1 tur-azaltma · 636-K2 effort-tiering · 629-kalan plan-yüzeyi)

## Goal
Faz-4'ün kapı-taşı: release-akışı tekleşsin (608 — 5-aylık yayınlamama hedefinin doğrudan ön-şartı) +
COST-10X'in onaysız-başlanabilir iki kolu (K1/K2) + plan-yüzeyi gerçeğinin kalanı.

## 🔒 BAĞLAYICI (her task)
- Yalnız kendi Files/Scope'una yaz · git stash/reset YASAK · **build YASAK (npm run build dahil)** · notes TEK STRING · Self DÜRÜST.
- REPRODUCE-first: önce mevcut davranışı kanıtlayan RED/ölçüm, sonra fix; kanıtı notes'a yaz.
- Değişen modülü import eden TÜM testleri koş (`VITEST_MAX_FORKS=2 npx vitest run <ilgili dizinler>`).

## Task 1: RELEASE-UNIFY — born-608 (P0 PUBLISH-BLOCKER): tek release-workflow + tek npm-publish otoritesi
- Model: sonnet | Agent: ci-guardian | Skills: ci-testing
- Files: .github/workflows/publish.yml, .github/workflows/release.yml, .github/workflows/docs.yml, tests/governance/release-workflow-unify.test.ts
- Scope: .github/, tests/governance/
- Dependencies: none
### Description
SORUN: `publish.yml` ve `release.yml` AYNI `v*`-tag'inde İKİSİ de npm-publish koşuyor (çift-yayın
yarışı — beta'da felaket-sınıfı); build vs build:all tutarsız (dashboard-asset'siz paket riski);
docs.yml deploy-koşulu master'a bakıyor (repo main). FIX: (1) TEK release-otoritesi:
`release.yml` kanonik olsun — `v*`-tag tetikli, zincir: install → `npm run build:all` →
`npm run validate:publish` → test-gate (mevcut CI-job'larını duplicate etme; needs/reusable-workflow
ile ya da minimal smoke) → npm publish (mevcut secret/provenance ayarları korunur) → GitHub-release
notu. (2) `publish.yml`: npm-publish adımı KALDIRILIR — ya dosya tamamen emekli edilir (tercih;
içinde başka canlı iş yoksa) ya da yalnız-dry-run/verify işine daraltılır; karar-gerekçesi dosya-başı
yoruma. (3) docs.yml deploy-koşulu `main`'e düzeltilir (master-referansı ölü). (4) YENİ
governance-testi `tests/governance/release-workflow-unify.test.ts`: workflow-YAML'larını parse edip
pinler — repo-genelinde `npm publish` adımı TAM 1 workflow'da; release.yml zincirinde build:all VE
validate:publish var; docs.yml koşulunda master yok (drift-regresyon kapanı). ⚠️ SINIR: tag/publish
TETİKLEME yok — yalnız workflow-tanımı; canlı-yayın Alperen'in elle `npm publish`/tag adımı.
RED-önce: bugünkü çift-publish gerçeğini YAML-parse'la kanıtlayan test (eski-halde 2 bulur).
### goNogo
- goCriteria: RED-kanıt (çift-publish pin'i eski-halde kırmızı); tek-publish-otoritesi + build:all+validate:publish zinciri + docs main-koşulu governance-testli; YAML'lar actionlint-varsa temiz (yoksa yamllint/parse-testi); workflow dosyaları anlamlı-yorumlu.
- nogo: publish adımı 0 workflow'da kalırsa (yayın-yolu kopar) NO_GO; test YAML'ı gerçek-parse etmeyip string-grep'e dayanırsa DEBT olarak işaretle.

## Task 2: COST-K1 — born-636-K1: worker tur-azaltma (paralel tool-çağrısı + verify-döngüsü disiplini)
- Model: sonnet
- Files: src/orchestra/prompt-god-template.ts, tests/orchestra/prompt-turn-economy.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
VERİ (born-636): 400-001 kod-task $2.38'in $1.05'i cacheRead = 25-30 tur × ~135k context — TUR SAYISI
ana maliyet-çarpanı. FIX (prompt-katmanı, davranış-yönergesi): god-prompt'a kompakt "turn-economy"
bölümü: (1) bağımsız okuma/arama tool-çağrılarını AYNI turda paralel yap (Read+Grep+Glob batch);
(2) aynı dosyayı state-değişimi olmadan yeniden OKUMA; (3) verify-döngüsü: lint+test'i her
mikro-editte değil mantıksal-blok sonunda koş (max 3-deneme kuralı zaten var — erken-koşu israfını
ekle); (4) plan-dosyasını yazarken hedef-dosyaları TEK turda topla. Bölüm STATİK (her prompt'ta,
NPM_ADVISORY gibi T0) ve KISA (≤15 satır — prompt-ekonomisi; feedback_prompt_completeness: kesme
değil, ekleme zaten). Test: bölümün varlık+içerik-pin'i (composition) + prompt-boyut artışı ≤ 1200
karakter pin'i (şişme-kapanı). ÖLÇÜM-NOTU: etki-ölçümü sonraki sprint'lerin num_turns ortalamasıyla
(Brain izler) — task'ın kanıtı prompt-katmanıdır, davranış-iddiası DEĞİL (dürüstlük).
### goNogo
- goCriteria: bölüm god-prompt'ta (composition-pin + i18n-gerekmez [worker-prompt EN]); boyut-artış pin'i; mevcut prompt-composition testleri (pcomp ailesi) yeşil.
- nogo: mevcut prompt bölümleri kısaltılır/kesilirse (completeness-kuralı) NO_GO.

## Task 3: COST-K2 — born-636-K2: task-tipi→effort tiering (flag'li, default-off)
- Model: sonnet
- Files: src/core/routing-engine.ts, src/orchestra/sprint-planner.ts, tests/core/effort-tiering.test.ts
- Scope: src/core/, src/orchestra/, tests/core/
- Dependencies: none
### Description
Routing'de `effort: 'low'|'normal'|'high'` alanı VAR (routing-engine.ts:556) ama task-tipine göre
otomatik atanmıyor — her task normal-effort koşuyor. FIX (flag'li, default-off — dormant/additive
kuralı): `routing.effort_tiering: boolean` config-flag'i (üçlü: tip + iki-resolver + roundtrip;
born-464); AÇIKKEN planner task-effort'unu tipten türetir: documentation/config → 'low' ·
code-development/test/refactor → 'normal' · security/migration/audit → 'high'; DIRECTIVES'te açık
`Effort:` hint'i HER ZAMAN kazanır (404-003 hint-zinciri effort'u zaten taşıyor — doğrula, kopuksa
bağla). Effort'un worker-spawn'a GERÇEKTEN nasıl aktığını İZLE ve notes'a yaz (task-JSON effort alanı
→ spawn-arg/CLI-flag var mı? YOKSA dürüstçe "effort şu an yalnız skill-token-bütçesini etkiliyor" de
ve tiering'i o gerçek-etkiyle sınırlı belgelendir — İDDİA ETME). RED-önce: bugün tüm task'ların
effort=normal çıktığının plan-fixture kanıtı. Flag-off byte-identical pin.
### goNogo
- goCriteria: RED-kanıt; flag-off byte-aynı (pin); flag-on tip→effort tablosu testli + hint-precedence; effort'un gerçek-tüketim yolu notes'ta DÜRÜST belgelenmiş; routing/planner importer testleri yeşil.
- nogo: default-on gönderilirse NO_GO; effort-etkisi belgelenmeden "maliyet düşer" iddiası yazılırsa NO_GO.

## Task 4: PLAN-SURFACE-KALAN — born-629(b,c): post-adoption gösterim + scope-gate yeni-dizin sınıfı
- Model: sonnet | Agent: bug-fixer
- Files: src/cli/commands/start.ts, src/core/scope-gate.ts, tests/cli/plan-surface-postadoption.test.ts
- Scope: src/cli/, src/core/, tests/cli/
- Dependencies: none
### Description
629'un kalan iki kalemi: (b) `deckent start` plan-tablosu (start.ts:~329 civarı tablo-render)
PRE-adoption scope basıyor — SAN-2 adoption'ı runSprint pre-spawn'da scope'u değiştirirse operatörün
gördüğü ile worker'ın aldığı farklı (güven-yüzeyi). FIX: tablo adoption-SONRASI scope'tan bassın
(adoption-bilgisi runSprint'ten yüzeye akmıyorsa: tabloya "scope adoption uygulanabilir — nihai scope
task-JSON'da" dürüst-notu + adopted-alan varsa onu bas; mimariyi bozmadan en-doğru nokta). (c)
scope-gate kasıtlı-yeni-dizin false-positive'i (canlı: docs/guides/ vakası, --force-scope tam-döngü
maliyeti): `evaluateScopeGate`'e yeni-dizin SINIFI ayrımı — yazma-yolu mevcut-olmayan dizindeyse ama
(i) yol repo-kök-altında normal-derinlikte ve (ii) üst-dizini VAR ya da yol `docs/`,`tests/`,`src/`
gibi tracked-kök altında → BLOCK yerine WARN + "yeni-dizin kasıtlı olabilir" mesajı (typo-sınıfı
[kök-dışı/şüpheli-karakter/çok-derin] BLOCK kalır — güvenlik gevşemez, sınıf ayrışır). RED-önce:
(c) için bugünkü davranış: docs/guides-benzeri yol BLOCK üretiyor (fixture).
### goNogo
- goCriteria: RED-kanıt; (b) tablo post-adoption ya da dürüst-not (testli); (c) kasıtlı-yeni-dizin WARN'a iner, typo-sınıfı BLOCK kalır (iki-yönlü testler); scope-gate + start importer testleri yeşil.
- nogo: (c)'de tüm yeni-dizinler serbest bırakılırsa (typo-koruması ölürse) NO_GO.
