# DIRECTIVES — 7088 CLI-SURFACE-CONSOLIDATION Faz-1: bayat-ADR temizliği + web kaldırımı + ratchet

## Goal

MASTER 7088 (owner admission+onay 2026-08-18). Canlı kanıt: deckent 78 top-level
komut (claude 14 / codex ~10); user-facing katalog metinlerinde YÜRÜRLÜKTE OLMAYAN
sayısal-ADR referansları var — AI araçlarını olmayan kaynağa yönlendirir, proje
ihlali doğurur: `cli.process.desc` "(ADR-022 CLI/MCP parity)" (messages.ts:6473-74
en+tr), `cli.nervous.recommendations.desc` "(ADR-037)" (:6405-06), doctor
`--fix-image` option'ı "ADR-063", agent `--no-audit` option'ı "ADR-046"; katalog
genelinde 9 ADR-0xx. `web` komutu kendi metniyle deprecated ("deprecated — use
`deckent serve`", :6624-27) ve 64 satırlık serve-sarmalayıcısıdır. Bu sprint
YALNIZ Faz-1'dir: bayat-referans temizliği + web kaldırımı + ratchet lint.
Faz-2 (gruplama/birleştirme) AYRI owner-disposition turudur — bu sprintte
HİÇBİR komut birleştirilmez/taşınmaz.

## Execution Contract

- No build and no repository-wide/full-suite test run during this sprint.
- Kaldırma kuralı (owner): YALNIZ `web` — kendi metniyle deprecated + salt
  sarmalayıcı kanıtlı. Başka hiçbir komut kaldırılmaz/birleştirilmez.
- Referans temizliği kuralı: geçerli ADR-G/D karşılığı KESİN biliniyorsa ona
  çevrilir; bilinmiyorsa referans SİLİNİR ve açıklama işlevsel cümle olarak
  kalır — UYDURMA EŞLEME YASAK. Kod-yorumlarındaki ADR-0xx'ler (models.ts:2-4,
  doctor.ts iç yorumları vb.) BU SPRINTİN KAPSAMI DIŞIDIR (yalnız user-facing:
  katalog metinleri + option/help açıklamaları); kalanlar sayımla raporlanır.
- 7085 tek-katalog düzeni korunur: MCP, CLI anahtarını paylaşıyorsa metin tek
  yerden değişir; mcp parity lint yeşil kalmalı.
- i18n: en+tr çiftleri birlikte güncellenir; TR ürün-sesi.
- Parallel execution ADMITTED; single-writer chokepoints: ONLY Task 1 writes
  src/cli/helpers/messages.ts; ONLY Task 2 writes src/cli/index.ts +
  src/cli/commands/web.ts (silme) + src/core/command-registry.ts; scripts/
  yazımı YALNIZ Task 3.
- Hermetic tmpdir tests; scoped verification only. Echo the policy digest in
  your .result as runPolicyEvidence exactly as the prompt's Result contract
  instructs.

## Task 1: User-facing bayat-ADR temizliği (katalog + option açıklamaları)
- Files: src/cli/helpers/messages.ts, src/cli/commands/doctor.ts, src/cli/commands/agent.ts, tests/cli/stale-adr-surface.test.ts
- Scope: src/cli/, tests/cli/
- Provider: claude
- Model: claude-opus-5

### Description
1. messages.ts kataloğunda user-facing metin taşıyan TÜM ADR-0xx geçişleri
   temizlenir (tarama-tabanlı; bilinen 4 + kalan 5'in user-facing olanları):
   `cli.process.desc` → parity iddiası düz işlev cümlesine ("Process-mode
   execution surface — submit tasks/capabilities and poll their status" yeter;
   parity zaten lint'le makine-garantili); `cli.nervous.recommendations.desc`
   → "(ADR-037)" silinir; en+tr birlikte. Worker-contract gibi mekanizma-metni
   içindeki ADR-037/ADR-G referansları user-facing help DEĞİLDİR — dokunma,
   sayımla raporla.
2. doctor.ts `--fix-image` option açıklaması "ADR-063 consent" → "interactive
   confirmation" düz dili; agent.ts `--no-audit` "ADR-046 audit-trail" →
   "audit-trail" düz dili (option-açıklamaları 7085'te katalog-dışı kalmıştı —
   yerinde düzelt, katalogla çakışma yok).
3. Test (hermetik): MESSAGES kataloğunun tüm en+tr değerlerinde `ADR-0\d\d`
   deseninin 0 olduğu mekanik tarama (allowlist'siz); doctor/agent option
   metinlerinde de 0 (buildProgram üzerinden option-description taraması).

GO: tsc 0; scoped yeşil; tarama 0-hit. NO_GO: uydurma ADR eşlemesi yapılırsa
veya işlev cümlesi kaybolursa.

## Task 2: `web` komutunun kaldırılması (kanıtlı-deprecated)
- Files: src/cli/index.ts, src/cli/commands/web.ts, src/core/command-registry.ts, src/cli/helpers/messages.ts, tests/cli/web-removal.test.ts
- Scope: src/cli/, src/core/, tests/cli/
- Provider: claude
- Model: claude-opus-5
- Dependencies: Task 1

### Description
1. Kaldırma-öncesi wiring kanıtı .result'a: web.ts'in serve'i sarmalamaktan
   başka tükettiği/ürettiği yüzey olmadığı (import grafiği + grep) — varsa DUR
   ve NO_GO ile raporla (owner kuralı).
2. `registerWeb` çağrısı index.ts'ten, web.ts dosyası repodan, `web` girişi
   command-registry.ts'ten kalkar; `cli.web.desc` anahtarları katalogdan
   kalkar. `deckent web` artık Commander'ın bilinmeyen-komut önerisine düşer
   (showSuggestionAfterError açık — serve önerilir; test bunu pinler).
3. web'e referans veren testler/lint baseline'ları kendi scope'unda güncellenir;
   scope-dışı kalıntı sayımla raporlanır (sessiz borç yok). MCP tarafında web
   tool'u yoksa (kontrol et) parity etkilenmez — kanıtla.
4. Test: buildProgram'da `web` kayıtlı DEĞİL; `deckent web` çağrısı hata +
   serve önerisi; `serve` davranışı byte-regresyonsuz.

GO: tsc 0; scoped yeşil; wiring-kanıtı .result'ta. NO_GO: web'in serve-dışı
gerçek tüketicisi çıkarsa (kaldırma İPTAL, bulgu raporu).

## Task 3: Ratchet lint + yüzey battery (depends on Task 1, Task 2)
- Files: scripts/lint-i18n-hardcode.mjs, tests/cli/cli-surface-consolidation-battery.test.ts, tests/scripts/lint-stale-adr.test.ts
- Scope: scripts/, tests/cli/, tests/scripts/
- Provider: claude
- Model: claude-sonnet-5
- Dependencies: Task 1, Task 2

### Description
1. lint-i18n-hardcode.mjs'e dar ek: MESSAGES katalog değerlerinde `ADR-\d{2,3}\b`
   (ADR-G/ADR-D önekli OLMAYAN sayısal sınıf) → FAIL (ratchet; mevcut
   ALLOWLIST pattern'i — Faz-1 sonrası temiz taban, yeni giriş fail eder).
   Sentetik fixture testi: ihlalli FAIL + temiz PASS; gerçek repo exit 0.
2. Battery: (a) katalog en+tr değerlerinde sayısal-ADR 0 (Task 1 testinin
   tek-nokta üstü); (b) `web` kayıtsız + öneri davranışı; (c) top-level komut
   sayısı taramadan türetilip .result'a yazılır (78→77 beklenir — sayı koda
   hardcode edilmez); (d) mcp parity lint'inin yeşil kaldığı (script exit 0).

GO: her iki lint gerçek repo'da yeşil + battery yeşil; tsc 0.
NO_GO: ratchet yeni-ihlali yakalayamıyorsa.
