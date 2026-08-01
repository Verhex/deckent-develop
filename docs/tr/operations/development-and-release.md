# Development ve release operasyonları

## Product-user perspektifi

Deckent şu anda `1.0.0-beta.1` olarak package edilir. npm package iki binary (`deckent`, `deckent-mcp`) ile package root ve `deckent/sdk` import path'lerini expose eder. Declared runtime floor Node.js 24'tür. [Kanıt: `package.json:2-20,115-123`]

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

Güncel generated-reference failure elle repair edilmez: beş output eksiktir ve accepted ADR authority DB-first olmasına rağmen ADR generator hâlâ `docs/adr/*.md` okur. Pipeline/input ownership DOC-01..03 ve DOC-07 olarak izlenir. [Kanıt: gerçek `docs:ref:check`; `scripts/gen-reference-docs.mjs:88-133,234-249`; `docs/analysis/CODE-DOC-DIFF-2026-08.md`]

### Develop-to-product publication sınırı

Repository sync script'i continuous two-repository model'in retired olduğunu explicit söyler. Yalnız one-time public-migration staging building block'u olarak tutulur: dry-run tracked file'ları partition eder ve bounded key-shape scanning yapar; `--apply` HEAD'i temporary/declared staging directory'ye çıkarıp exclusion list'i prune eder. Commit veya push yapmaz. [Kanıt: `scripts/sync-to-product.mjs:1-16,22-60,92-183`]

Historical launch post, release note, public-flip handoff ve changelog immutable pre-reset archive'da korunmuştur. Bu audit fresh public-release, registry, clean-install veya cross-platform evidence taşımadığı için current claim olarak yeniden yayımlanmazlar. Coverage row'ları beta-era copy'yi current truth gibi göstermek yerine `EKSİK` kalır. [Kanıt: coverage matrix satırları 123-132,172-179; owner archive boundary]

## Dogfood / repository gerçeği

| Gate veya surface | Durum | Current repository finding |
|---|---|---|
| Full build | ✅ owner-verified | Owner bu pass öncesi `npm run build:all` tamamlandığını bildirdi. |
| Generated reference check | ⚠️ stale | Docs reset sonrasında beş expected target eksik; pipeline regeneration Claude + Alperen'e defer edildi. [Kanıt: Tur 1 gerçek `npm run docs:ref:check` sonucu; owner Tur-2 kararı] |
| Master-plan lint | ⚠️ stale input | `IDENTITY_REGISTRY_MISSING` check'i fail eder; bu task generated source/target değiştiremez. [Kanıt: Tur-1 real command output; owner Tur-2 kararı] |
| Provider observation schema | ⚠️ migration HOLD | Live DB v1, source v2 bekler; release documentation runtime migration kapatamaz. [Kanıt: gerçek PRAGMA; OQ-07] |
| Dashboard build cleanliness | ⚠️ friction | Clean/build output-policy conflict gözlendi ve kaydedildi. [Kanıt: `PAZARTESI.md:47-52`] |
| Publish-grade autonomous certificate | 🔜 roadmap | Kabul edilmiş audit, bu claim öncesi stabilization ve certification ladder ister. [Kanıt: `PAZARTESI.md:36-60`] |

Bu documentation audit'inde current release status bu nedenle **HOLD**'dur: build healthy bildirilmiştir fakat generated-doc gate'leri ve autonomous certification green değildir. Commit, push, release veya publish yapılmadı. [Kanıt: owner boundary; real gate output'ları]
