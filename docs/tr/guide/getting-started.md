# Başlangıç

## Status anahtarı

Bu guide intended product workflow ile current repository state'i ayırır. `✅ canlı`, current wiring ve evidence davranışı destekliyor demektir; `⚠️ kısmi` exact kısıtı adlandırır; `🔜 roadmap` current production closure iddia edilmediğini söyler. [Kanıt: `docs/analysis/COVERAGE-MATRIX-2026-08.md`; feature truth contract `src/cli/commands/truth.ts:264-405`]

## Product-user perspektifi

### 1. Runtime gereksinimlerini karşılayın

Deckent package contract Node.js 24 veya üstünü ister ve iki executable sunar: `deckent` ile `deckent-mcp`. Git required doctor check'tir; Docker ve provider CLI'ları seçilen backend ve provider policy'ye göre çözülür. [Kanıt: `package.json:6-20,100-131`; `src/cli/commands/doctor.ts:2190-2245`]

Published-package installation syntax'i `npm install -g deckent`'tir. Bu audit global/network installation çalıştırmadığı için registry installation `HOLD`'dur; current source build owner tarafından `npm run build:all` ile önceden üretildi. [Kanıt: `package.json:22-38,115-126`; owner run bildirimi, 2026-08-01; OQ-20]

### 2. Projeyi değiştirmeden önce binary'yi doğrulayın

Bu komutlar `dist/cli/entry.js` üzerinde çalıştırıldı:

```bash
node dist/cli/entry.js --version-json
node dist/cli/entry.js doctor --json
node dist/cli/entry.js connect --json
```

Version ve doctor komutları exit 0 verdi. `connect --json` geçerli diagnostic payload üretti fakat tüm provider/MCP host'ları ready olmadığı için exit 1 verdi; nonzero diagnostic exit total product failure diye yeniden yazılmamalıdır. Local snapshot Claude ve Codex'i logged in, Gemini'ı unavailable/logged out, Codex MCP'yi attached; diğer advertised attachment adımlarını pending buldu. [Kanıt: real-binary output'lar, 2026-08-01; `src/cli/commands/connect.ts:40-215`]

### 3. Bilinçli initialize edin

`deckent init --help` başarıyla çalıştırıldı. Canlı komut auto/manual detection, environment adapter seçimi, upgrade/force/repair behavior, explicit prerequisite installation consent ve Docker image offer opt-out destekler. [Kanıt: real binary help, exit 0, 2026-08-01; `src/cli/commands/init.ts:343-361`]

Initialization; Deckent dizinlerini oluşturur, config ve stack metadata yazar, host adapter/rule dosyalarını üretir, `DIRECTIVES.md` ve Brain dosyalarını yazar, `.gitignore` günceller, provider'ları tespit eder, doctor check'leri koşar ve sonucu `READY`, `SETUP_INCOMPLETE` veya `FAILED` olarak sınıflandırır. Blocker varken ready iddiası basmamalıdır. [Kanıt: `src/cli/commands/init.ts:443-571,573-660`]

`--yes` yalnız documented non-interactive default'lar uygunsa kullanılmalıdır: English, balanced mode ve project name olarak current directory adı. Eksik prerequisites explicit installation authority olmadan kurulmaz. [Kanıt: `src/cli/commands/init.ts:409-425,573-600`]

### 4. Onboarding'i yazmadan preview edin

Bu komut çalıştırıldı ve exit 0 verdi:

```bash
node dist/cli/entry.js onboard --plan-only --json
```

Dönen plan project-scoped, balanced ve `applied: false` idi. Plan-only path gerçek read-only provider/auth/MCP probe'ları koşar; prompt açmaz, config yazmaz ve `init` spawn etmez. [Kanıt: real output, 2026-08-01; `src/cli/commands/onboard.ts:301-316,502-546`]

Ayrı `onboard --apply` path planı basar, `--yes` yoksa confirmation ister, project-scoped değişiklikleri uygular ve before/after verification basar. `--dry-run`, aynı planı yazmadan işletir. [Kanıt: `src/cli/commands/onboard.ts:364-500,502-536`]

### 5. Execution öncesi current authority'yi okuyun

Bu komut çalıştırıldı ve exit 0 verdi:

```bash
node dist/cli/entry.js status --json
```

Gözlenen repository state idle idi ve active run yoktu. Ayrıca unresolved provider-observation interval'ları için typed `HOLD` taşıyordu; bu, sağlıklı command exit'in bile operatörün okuması gereken admission constraint içerebildiğini kanıtlar. [Kanıt: real output, 2026-08-01; `src/cli/commands/status.ts:725-781`]

### 6. İlk work ingress'i seçin

- Goal-first: `deckent do <goal>` default olarak preview eder; RunFlow-v2 path'te `--run --yes` explicit execution'dır. [Kanıt: `src/cli/commands/do.ts:219-357,440-517`]
- Structured: `DIRECTIVES.md` yazın, `deckent plan --dry-run` inceleyin; provider, scope, budget ve approval evidence uygun olduğunda `deckent start` kullanın. [Kanıt: `src/cli/commands/plan.ts:121-205,367-461`; `src/cli/commands/start.ts:246-345`]
- One-shot: `deckent run <description>`, full sprint cycle olmadan execution yapar. [Kanıt: `src/cli/commands/run.ts:451-476`]
- Process: `deckent process submit <description>` bir `ExecutionRequest` üretir; read-only request çalışabilir, side-effecting request approval için park edebilir. [Kanıt: `src/cli/commands/process.ts:142-190`]

Yukarıdaki command registration'ların tümü real-binary help ile doğrulandı. State-changing action'lar owner sprint/run/autonomous execution'ı yasakladığı için bu audit'te çalıştırılmadı. Exact first-execution proof simulated success yerine `HOLD` kaldı. [Kanıt: recursive 212-call help audit, 2026-08-01; OQ-20]

## Dogfood / repository gerçeği

| Alan | State | Güncel evidence |
|---|---|---|
| Built CLI | ✅ canlı | Version `0.100.0`; 211 visible path; her visible help path exit 0. |
| Readiness diagnosis | ✅ canlı | `doctor --json`, `connect --json`, onboarding plan ve status binary'de çalıştırıldı. |
| npm installation | ⚠️ kısmi | Package contract var; network/global installation bu audit'in write authority'si dışındaydı. |
| Onboarding | ✅ canlı | Read-only planner ve explicit apply/dry-run path'leri wired. |
| İlk governed execution | ⚠️ kısmi | Command wiring var, fakat audit action'ı çalıştırma yetkisine sahip değildi. |
| Unattended reliability | ⚠️ kısmi | Son dogfood audit 0/31 intervention-free run kaydeder ve ordered certification ladder ister. [Kanıt: `PAZARTESI.md`] |

## Sonraki adım

[Run lifecycle](run-lifecycle.md), [Execution modes](execution-modes.md), [Workers and providers](workers-and-providers.md) ve [Recovery/troubleshooting](recovery-troubleshooting.md) ile devam edin.
