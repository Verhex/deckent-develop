# Commit dışında kalan yerel işler

Snapshot UTC: 2026-09-10T08:27:21+00:00. Owner mevcut commit'leri push etmeyi ve kalan dosyaları belirlemeyi istedi; yeni implementation veya geniş inceleme açılmadı. `origin/main...main` fetch sonrası0behind/1ahead idi: yalnız e84ca824d terminal commit'i. Bu envanter ve durum-raporu.md ayrı docs commit'ine alınır.

| Grup | Dosyalar / örnekler | Karar |
|---|---|---|
| Devam raporu | durum-raporu.md, bu envanter | Şimdi commit/push kapsamı. |
| Önceki build/clean ve test değişiklikleri | scripts/build.mjs, scripts/clean.mjs, scripts/lint-test-hermeticity.mjs, script-registry.json; agents/core/providers/scripts testleri; yeni recover ve Docker contract testleri | Ayrı eski çalışma; provenance, ilgili teslim ve bağımsız test sonucu doğrulanmadan ekleme. Terminal324 testi bu bütün paketi onaylamaz. |
| Model kataloğu | src/core/model-registry.ts kalan Astra hunk'ı, pricing-data-baseline.json, gpt6-astra-catalog.test.ts ve komşu test değişiklikleri | Terminal commit'inden ayrı korunuyor; kaynak/güncellik ve paket testi incelemesi gerekli. |
| Authority / takip | MASTER-PLAN.md, docs/generated/master-plan-active.*, DIRECTIVES.md, features-manifest.json | MASTER'daki7109/7111/7114 açıklama farkları owner-admitted alt işlere ilişkin; statüler OPEN kaldı. Kullanıcı kabulü ayrıca committed TERMINAL-OWNER-ADMISSION-2026-09-10.md içinde mevcut. Bu dosyaları körlemesine stage etme; canonical writer/projection ve önceki custody ile reconcile et. |
| Tarihçe / önceki kanıt | CHANGELOG, SPRINT-LOG, TERMINAL-OPERATOR-SURFACE-CLOSURE-001, canary notu, RECOVERY-BORN-714, evidence/3357, follow-up-works, proof/cursor-cli-help-matrix-v4 | Önceki işlerin korunmuş kayıtları; doğru kod/receipt/commit bağı kontrol edilerek ayrı dokümantasyon paketi olabilir. |
| Host kurulumu | .codex/coordinator, .codex/hooks*, .cursor/coordinator, .cursor/hooks*, .cursor/rules, .cursor/skills | Kod/doküman kısmı ileride paketlenebilir; canlı binding/config/queue/evidence ve makineye özgü yollar ayrı tutulmalı. Cursor Stop-hook testleri exit1; yeni fix açılmadı. İki dispatcher durmuş durumda. |
| Generated / runtime | .brain export/error dosyaları, .deckent/build, runtime log/PID/recovery JSON'ları | Otomatik olarak commit etme. Bunlar ürün kaynak paketi değildir; runtime/custody değişikliği veya cleanup yapılmadı. |
| Silme | .github/pull_request_template.md | Önceden var olan deletion; bu oturumda onaylanmış temizlik sayılmadı, korunuyor. |

## Ham dosya envanteri

Bu liste yalnız yolları ve Git durumunu içerir; dosya içerikleri/credential dump değildir. Snapshot anında33 tracked değişiklik vardı. `??` dizinler alt dosyalarını toplu gösterir; toplam dosya sayısı değildir. Rapora alınan dosyalar dokümantasyon commit'inden sonra bu listeden doğal olarak düşer.

```text
 M .brain/ERRORS-critical.md
 M .brain/exports/debt.md
 M .brain/exports/decisions.md
 M .brain/exports/memory.md
 M .brain/exports/summary.md
 M .deckent/runtime/bot-listen.log
 M .deckent/settings/features-manifest.json
 D .github/pull_request_template.md
 M DIRECTIVES.md
 M docs/CHANGELOG.md
 M docs/MASTER-PLAN.md
 M docs/SPRINT-LOG.md
 M docs/execution/active/TERMINAL-OPERATOR-SURFACE-CLOSURE-001.md
 M docs/execution/canary/CANARY-NOTE.md
 M docs/generated/master-plan-active.json
 M docs/generated/master-plan-active.md
 M scripts/build.mjs
 M scripts/clean.mjs
 M scripts/lint-test-hermeticity.mjs
 M scripts/script-registry.json
 M src/core/model-registry.ts
 M src/core/pricing-data-baseline.json
 M tests/agents/agentic-worker-entry.test.ts
 M tests/agents/http-agentic-worker.test.ts
 M tests/cli/archive-terminal-seal.test.ts
 M tests/connectors/bot-agentic.test.ts
 M tests/core/constants.test.ts
 M tests/core/execution-effect-containment.test.ts
 M tests/core/identity-generator.test.ts
 M tests/core/model-registry.test.ts
 M tests/providers/codex.test.ts
 M tests/scripts/build-lifecycle.test.ts
 M tests/scripts/clean-active-execution-guard.test.ts
?? .brain/exports/memory-details.md
?? .codex/coordinator/
?? .codex/hooks.json
?? .codex/hooks/channel-read.test.mjs
?? .codex/hooks/communication-read.mjs
?? .codex/hooks/coordinator-policy.json
?? .codex/hooks/coordinator-stop.mjs
?? .codex/hooks/coordinator-stop.test.mjs
?? .codex/hooks/evidence/
?? .cursor/coordinator/
?? .cursor/hooks.json
?? .cursor/hooks/
?? .cursor/rules/production-channel.mdc
?? .cursor/skills/
?? .deckent/build/
?? .deckent/runtime/local-llm.pid
?? .deckent/runtime/recover-resume-outcome-sprint724-20260905T1718Z.json
?? .deckent/runtime/recover-resume-outcome-sprint724-20260905T1751Z.json
?? .deckent/runtime/recover-resume-outcome-sprint724-20260905T1825Z.json
?? .deckent/runtime/recover-resume-outcome-sprint724-20260905T1930Z.json
?? .deckent/runtime/recover-resume-outcome-sprint724-20260905T2041Z.json
?? docs/execution/active/RECOVERY-BORN-714-EXACT-DISPATCH-AND-TERMINAL-TRUTH-001.md
?? docs/execution/evidence/3357/
?? durum-raporu.md
?? follow-up-works/cursor-7099-cli-help-matrix.md
?? follow-up-works/fable-7104-sync-async.md
?? proof/cursor-cli-help-matrix-v4/
?? tests/cli/recover.test.ts
?? tests/core/gpt6-astra-catalog.test.ts
?? tests/orchestra/exact-docker-private-output-contract.test.ts
?? tests/orchestra/spawn-backend-docker-dependency-inspection.test.ts
?? tests/orchestra/spawn-backend-docker-ipc-authority.test.ts
```

Güvenli devam: mevcut işlerin teslim/kanıtlarını bul → exact scope ve diff eşleştir → gerekli yerel kontroller → ayrı commit. `git add -A`, runtime temizliği veya otomatik MASTER disposition değişikliği yok. Bu liste yeni işe başlama talimatı değildir.
