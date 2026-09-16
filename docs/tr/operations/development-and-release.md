# Development ve release operasyonları

## Product-user perspektifi

Deckent şu anda `0.100.0` olarak package edilir. npm package iki binary (`deckent`, `deckent-mcp`) ile package root ve `deckent/sdk` import path'lerini expose eder. Declared runtime floor Node.js 24'tür. [Kanıt: `package.json:2-20,115-123`]

### Install ve build surface'leri

| Amaç | Command | Repository'nin gerçekten çalıştırdığı şey |
|---|---|---|
| Tüm workspace'leri install | `npm run install:all` | Root, dashboard ve desktop için ayrı `npm ci`. [Kanıt: `package.json:41`] |
| Core build | `npm run build` | Clean, TypeScript compile, ardından asset copy. [Kanıt: `package.json:23`] |
| Full web build | `npm run build:all` | Clean, TypeScript compile, asset copy, dashboard build. [Kanıt: `package.json:37-38`] |
| Desktop build | `npm run build:desktop` | Desktop package build'ini ayrı çalıştırır; `build:all` parçası değildir. [Kanıt: `package.json:73-76`] |
| Development compiler | `npm run dev` | TypeScript watch mode. [Kanıt: `package.json:24`] |

Owner bu documentation devamından önce başarılı bir `npm run build:all` bildirdi. Audit bunu yeniden çalıştırmadı; build yeni tamamlanmıştı ve project policy active sprint sırasında rebuild'i yasaklar. [Kanıt: owner mesajı; `AGENTS.md:88-91`]

### Verification surface'leri

Repository core tests, watch, coverage, contained CI simulation, end-to-end surface, binary contract, dashboard test, desktop test, TypeScript linting ve focused policy linter'ları ayırır. [Kanıt: `package.json:25-60,73-77`]

Composite `lint`, core TypeScript, dashboard TypeScript ve `lint:gates` çalıştırır. `lint:gates`; CLI/MCP parity, model literal, i18n hardcode, layer shim, hermetic test, gitignore, routing distribution, desktop API sync, manifest, built-ins drift, master-plan ve design-token check'lerini zincirler. [Kanıt: `package.json:39,42-60`]

Tek test suite'i publish readiness ile eşitlemeyin. Repository production-wiring kuralı; changed surface için canonical producer→consumer→entrypoint→policy closure ve gerçek execution evidence ister. [Kanıt: `AGENTS.md:42-55`]

### Generated documentation ownership

Şu command'lar generated projection'ları sahiplenir:

```bash
npm run docs:ref
npm run docs:stats
npm run docs:master-plan
```

`:check` karşılıkları output'u bilerek rewrite etmeden drift detect eder. `scripts/gen-reference-docs.mjs`; MCP tool/resource, ADR input, CLI command source ve agent manifest parse eder, sonra deterministic AUTOGEN region/target yazar. [Kanıt: `package.json:66-71`; `scripts/gen-reference-docs.mjs:1-18,36-190,208-260`]

Manual ve generated doc'ların owner'ı farklıdır. `docs/generated/**` elle edit edilmez; owning pipeline uygun authority ile çalıştırılır. `docs/MASTER-PLAN.md` planning SSOT'tur ve casually rewrite edilecek generated target değildir. [Kanıt: owner Tur-2 boundary; `scripts/lint-master-plan.mjs:3-10,49-51`]

Doc tracking ayrı, canlı ve opt-in capability'dir: core scan/store module'leri document health persist eder; CLI ve MCP scan/status action sunar; API ile dashboard health projection sağlar; sprint finalization `doc_tracking.sync_on_finalize:true` olduğunda DB-only sync çalıştırabilir. Bu surface'i bütünüyle “pending” etiketleyen archived spec'ler bayattır; finalizer hook default-off olduğu için runtime adoption yine universal değildir. [Kanıt: `src/core/doc-tracking/scanner.ts:40`; `src/core/doc-tracking/store.ts`; `src/cli/commands/docs.ts:12-25`; `src/mcp/tools/docs.ts:18-41`; `src/api/docs-health-endpoint.ts:2-44`; `src/dashboard/src/nav-items.ts:69`; `src/orchestra/sprint-finalizer.ts:985-998,2564-2569`; `src/core/config-types.ts:1337`]

### Release gate

`npm run release`; master-plan lint, docs stats check, generated reference check, identity lint, full build ve publish validation çalıştırır. `prepublishOnly` aynı documentation/identity check'leri ile core build'i çalıştırır. [Kanıt: `package.json:64-72`]

`validate:publish`; pack-size/category, Node-engine, entry-point, internal-state-leak, ADR/link lint, executable-bit ve dashboard-bundle check'lerini yapar. `npm pack --dry-run --json --ignore-scripts` kullanır; malformed veya empty pack evidence dürüstçe fail eder. Script publish etmez—`npm publish`, approval sonrasında Alperen tarafından manual çalıştırılır. [Kanıt: `scripts/validate-publish.mjs:1-24,36-55,188-220`]

### Release operator checklist

1. Build öncesi active sprint olmadığını doğrulayın ve host-adapter restart'ını koordine edin. [Kanıt: `AGENTS.md:88-91,139-143`]
2. Changed surface'e uygun test ve focused validator'ları çalıştırın. [Kanıt: `package.json:25-60,73-77`]
3. Pipeline-owned documentation'ı regenerate edin, ardından check mode çalıştırın. [Kanıt: `package.json:66-71`; `scripts/gen-reference-docs.mjs:1-18`]
4. `npm run release` çalıştırın; gate failure'ını bypass etmek yerine araştırın. [Kanıt: `package.json:64-72`]
5. Owner-requested commit/push öncesi worktree shared olduğu için `git branch -vv` inceleyin. [Kanıt: `AGENTS.md:91-94`]
6. Publishing ayrı, explicit owner action olarak kalır. [Kanıt: `scripts/validate-publish.mjs:20-23`]

### Upgrade ve migration contract

`deckent upgrade`; `latest`, `beta` ve `canary` channel'larını ayırır; global, local, npx veya unknown installation tespit eder; registry state check, registry changelog metadata gösterme, local package'tan install, previous version kaydetme ve rollback isteme yolları sunar. Install ve rollback branch'leri npm mutation yürüttüğü için bu audit'te yalnız help/source ile doğrulandı. [Kanıt: `src/cli/commands/upgrade.ts:17-20,64-94,97-149,151-240,429-456`; 211-path audit'teki gerçek `upgrade --help`]

Package upgrade ile project-data migration ayrı operation'lardır:

| Data family | Güncel migration behavior | Operasyon kuralı |
|---|---|---|
| Config | Eksik field'lar doldurulur, legacy mode/provider/model alias'ları canonicalize edilir ve v1 model strategy tier/provider field'larına migrate olabilir. Alias validation, parsed object'i migration mutate etmeden önce çalışır. | Exact config'i preview/backup edin, owning migrator'ı çalıştırın, sonra effective config ve provenance'ı karşılaştırın. [Kanıt: `src/core/config-migration.ts:104-165,227-233,440-607`] |
| Memory DB | Additive, column-existence-guarded migration mevcut entry'leri korur; destructive DROP/rebuild explicit olarak dışlanır. | Open sonrası schema version, row count ve recall/export doğrulayın. [Kanıt: `src/core/memory-store.ts:183-255`] |
| Mission DB | Dedicated mission migration ile SQLite store mission/work-item schema evolution sahibidir. | Lease, claim-fence, dependency ve approval identity'lerini koruyun; row'ları elle edit etmeyin. [Kanıt: `src/orchestra/autonomous/mission-store/mission-migrate.ts`; `src/orchestra/autonomous/mission-store/sqlite-mission-store.ts`] |
| Provider observation DB | Source schema v2 beklerken bu workspace v1'de kalır. | Owner-controlled backup/migration/smoke hâlâ `HOLD`'dur; documentation bunu yapamaz. [Kanıt: gerçek PRAGMA; `src/core/provider-execution-observation-store.ts:114-169`; OQ-07] |

Package upgrade sonrası CLI, configured worker image'ın package ile eşleşmesini kontrol eder ve rebuild önerebilir/yapabilir. Image change runtime mutation'dır; sprint-silent, owner-coordinated window ister. [Kanıt: `src/cli/commands/upgrade.ts:377-425`; `src/core/worker-image-check.ts`; `AGENTS.md:88-91`]

### Built-in'ler ve generated projection'lar

Bundled agent/skill asset'lerinin generated/runtime copy ve project projection'ı vardır. `lint:builtins-drift` bundle contract'ı karşılaştırır; manifest, identity, CLI/MCP, docs-reference ve stats check'lerinin her biri ayrı owner'a sahiptir. Green TypeScript build bu projection'ların current olduğunu göstermez. [Kanıt: `scripts/builtins-drift-check.mjs`; `scripts/bundle-builtins.mjs`; `package.json:45-71`]

Owner reset sonrasında pipeline-owned ADR/reference input'larını restore edip owning generator'ı çalıştırdı; `docs:ref:check` artık 5/5 in-sync'tir. Çözülmemiş konu daha dardır: accepted authority DB-first olmasına rağmen ADR generator 51 `docs/adr/*.md` projection okumayı sürdürür. OQ-26 bu input-authority kararını izler; current output drift gibi sunulmaz. [Kanıt: owner-verified `docs:ref` run, 2026-08-02; `scripts/gen-reference-docs.mjs:88-133,234-249`; OQ-26]

### Develop-to-product publication sınırı

Repository sync script'i continuous two-repository model'in retired olduğunu explicit söyler. Yalnız one-time public-migration staging building block'u olarak tutulur: dry-run tracked file'ları partition eder ve bounded key-shape scanning yapar; `--apply` HEAD'i temporary/declared staging directory'ye çıkarıp exclusion list'i prune eder. Commit veya push yapmaz. [Kanıt: `scripts/sync-to-product.mjs:1-16,22-60,92-183`]

Historical launch post, release note, public-flip handoff ve changelog immutable pre-reset archive'da korunmuştur. Her biri dated event record olduğu, provenance için erişilebilir kaldığı ve current release/install claim olarak yeniden yayımlanmadığı için `TARİHSEL` sınıfındadır. Bu sınıflandırma fresh registry, clean-install veya cross-platform evidence iddia etmez. [Kanıt: coverage matrix; archived source metadata; owner archive boundary]

## Dogfood / repository gerçeği

| Gate veya surface | Durum | Current repository finding |
|---|---|---|
| Full build | ✅ owner-verified | Owner bu pass öncesi `npm run build:all` tamamlandığını bildirdi. |
| Generated reference check | ✅ owner-verified | Owner pipeline-owned input/output'ları restore etti; `docs:ref:check` 5/5 in-sync raporlar. [Kanıt: owner-verified pipeline run, 2026-08-02] |
| Master-plan lint | ✅ owner-verified | Restored identity projection `IDENTITY_REGISTRY_MISSING` hatasını kapattı; lint 322 row, 318 active item ve 22 receipt raporlar. [Kanıt: owner-verified gate run, 2026-08-02] |
| Provider observation schema | ⚠️ migration HOLD | Live DB v1, source v2 bekler; release documentation runtime migration kapatamaz. [Kanıt: gerçek PRAGMA; OQ-07] |
| Dashboard build cleanliness | ⚠️ friction | Clean/build output-policy conflict gözlendi ve kaydedildi. [Kanıt: `PAZARTESI.md:47-52`] |
| Publish-grade autonomous certificate | 🔜 roadmap | Kabul edilmiş audit, bu claim öncesi stabilization ve certification ladder ister. [Kanıt: `PAZARTESI.md:36-60`] |

Bu documentation audit'inde current publish-readiness status yine **HOLD**'dur: build ve generated-doc gate'leri owner-verified green'dir; provider-observation migration ile publish-grade autonomous certificate açıktır. Commit, push, release veya publish yapılmadı. [Kanıt: owner boundary; OQ-07; `PAZARTESI.md:36-60`]
