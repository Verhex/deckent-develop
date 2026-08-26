# Deckent

**Goal'leri governed ve evidence-backed work'e dönüştüren provider-neutral, local-first Agent OS.**

Deckent; Assistant, parallel Worker'lar ve Platform control plane'i tek authority chain çevresinde birleştirir: `Goal → Mission → Flow → Run → WorkItem → Attempt → Operation`. Terminal ve Desktop primary operator surface'lerdir; CLI, MCP, API, process/autonomous girişleri ve connectors adapter'dır; Dashboard bir observability projection'dır. [Kanıt: `.deckent/workspace/IDENTITY.md:2-10,16-17`]

[English documentation](https://github.com/VerhexIO/deckent/blob/main/docs/en/overview.md) · [Türkçe dokümantasyon](https://github.com/VerhexIO/deckent/blob/main/docs/tr/overview.md) · [Güncel sürtünmeler](https://github.com/VerhexIO/deckent/blob/main/docs/tr/operations/current-frictions.md)

## Neden var

Faydalı bir agent runtime kod üretmekten fazlasını yapmalıdır. Deckent; provider ve model policy'sini çözer, dependency-aware iş ayrıştırır, write scope'unu sınırlar, attempt ve operation kaydeder, sonuçları değerlendirir, kanıtı settle eder, memory tutar ve recovery yolları sunar. Bu sorumluluklar güncel orchestration, configuration, memory, authority ve run-flow modüllerinde görünür durumdadır. [Kanıt: `src/orchestra/sprint-controller.ts`; `src/orchestra/dependency-scheduler.ts`; `src/core/config.ts`; `src/core/memory-store.ts`; `src/core/run-flow-store.ts`; `src/core/task-settlement-authority.ts`]

Ürün iki kitleye aynı anda tasarlanır: düşük sürtünmeli kontrol isteyen solo kullanıcı ve multi-project, multi-tenant, cross-platform policy + audit gerektiren kurumlar. macOS, Linux, Windows native ve WSL2 üzerinde çalışmalı; bir yetenek yoksa bunu açıkça söyleyerek durmalıdır. [Kanıt: `AGENTS.md:13-35`; `.deckent/workspace/IDENTITY.md:6,15`]

## Kurulum sözleşmesi

npm paketi `deckent` ve `deckent-mcp` binary'lerini sunar, Node.js `>=24.0.0` ister ve derlenmiş `dist` ağacını yayınlar. [Kanıt: `package.json`]

Yayınlanmış-paket kurulumu için beyan edilen komut `npm install -g deckent`'tir. `0.100.0` tag'siz bir version/changelog rebaseline'ıdır, yayınlanmış release değildir; registry'den kurulum owner-gated release kapanana kadar `HOLD`'dur. Repo build komutu `npm run build:all`'dur. [Kanıt: `package.json`; `docs/MASTER-PLAN.md` RELEASE-001]

Release'ler manuel değil governed'dır. `main` GitHub merge queue ile korunur; CI, required check'leri nihai merge sonucu üzerinde yeniden koşar (`merge_group` trigger'ı tam bu nedenle vardır). Publish **tasarım gereği owner-manual'dır**: release workflow'u yalnız build/validate/attestation üretir ve read-only izinlerle çalışır — otomatik npm-publish ve GitHub-Release adımları bilinçli olarak kaldırıldı (2026-08-14); `npm publish` daima owner tarafından elle koşulur. [Kanıt: `.github/workflows/ci.yml:3-11`; `.github/workflows/release.yml`; `tests/governance/release-workflow-unify.test.ts`]

## Doğrulanmış beş dakikalık yönelim

Aşağıdaki dört komut 2026-08-25'te güncel derlenmiş binary üzerinde koşuldu. Read-only'dirler; binary'yi kimliklendirir, hazırlığı inceler, onboarding'i önizler ve güncel run authority'sini okurlar.

```bash
node dist/cli/entry.js --version-json
node dist/cli/entry.js doctor --json
node dist/cli/entry.js onboard --plan-only --json
node dist/cli/entry.js status --json
```

Gözlenen kontrol noktaları:

- Version `0.100.0`, Node `v24.15.0`, Linux; exit 0.
- Doctor `ok: true` döndü — 18 kontrolün 14'ü hazır, 4'ü non-required dikkat; yeni routing-journal sağlık kontrolü daha İLK koşusunda gerçek bir tarihsel bozuk journal artığını yakaladı; exit 0.
- Onboarding `applied: false` ile project-scoped config planı döndü ve yazmadı; exit 0.
- Status `active: false` ve son run'ın dürüst terminal durumunu (`ABORTED` — force-finalize edilen dogfood run'ları neyse o olarak kaydedilir, asla yeniden-etiketlenmez) döndü; exit 0.

[Kanıt: dört komutun gerçek-binary çıktıları, 2026-08-25; read-only kontratlar `src/cli/commands/doctor-checks.ts`, `src/cli/commands/onboard.ts`, `src/cli/commands/status.ts`]

Gerçek işi başlatmak burada bilinçli olarak "doğrulanmış" sunulmaz: sprint/run/autonomous execution iddiaları `docs/MASTER-PLAN.md`'deki dogfood kanıt zincirine aittir; orada her iddia ekran görüntüsüne değil receipt'lere bağlıdır.

## İş akışı seç

| İhtiyaç | Yüzey | Güncel kullanıcı sözleşmesi | Repo gerçeği |
|---|---|---|---|
| Konuşmalı kontrol | Çıplak `deckent` veya `deckent chat --native` | Etkileşimli agentic REPL | Çıplak çağrı native chat'e yönlenir; etkileşimli TTY Ink REPL kullanır. [Kanıt: `src/cli/entry.ts`] |
| Goal önizleme / governed başlatma | `deckent do <goal>` | Varsayılan önizleme; RunFlow v2 açıkken `--run --yes` açık non-interactive başlatma yoludur | Proposal derlemesi gerçek provider çağrısıdır; RunFlow yolu başlatmadan da proposal kalıcılaştırabilir. [Kanıt: `src/cli/commands/do.ts`] |
| Yapılandırılmış yaşam döngüsü | `plan`, `start`, `status`, `review`, `retro` | Planla, yürüt, gözle, karara bağla, öğren | Tüm komut/yardım kontratları canlı ve CLI surface-truth bataryasıyla (504 gerçek `--help` koşusu) sınanıyor. [Kanıt: `tests/cli/cli-surface-truth-battery.test.ts`] |
| Tek atımlık iş | `run <açıklama>` | Sprint döngüsü olmadan tek task çalıştır | Aynı `run` ebeveyni lifecycle alias'larını da taşır; belgelenmiş bir CLI belirsizliğidir. [Kanıt: `src/cli/commands/run.ts`] |
| Run gelen kutusu ve kararlar | `deckent runs [n]` | Run-flow'ları listele; tek run'ı `--approve`, `--reject`, `--start`, `--retire`, `--diff` veya `--commit` ile karara bağla | Tüm flag'ler tek `runs` komutunda kayıtlı; flow-id prefix'i `--limit`'ten bağımsız tüm flow'lara çözülür. [Kanıt: `src/cli/commands/runs.ts`] |
| Owner-yönetimli model aktivasyonu | `deckent models list/activate/deactivate/activation` | Detection provider'ın sunduğunu raporlar; activation owner'ın routing havuzuna neye izin verdiğini kaydeder | Tek authority `ModelActivationStore`'dur; explicit-active modda hiçbir tespit edilen model havuza sessizce giremez. [Kanıt: `src/cli/commands/models.ts`; `src/core/model-activation-store.ts`] |
| Kalıcı process işi | `process submit/status/result` | `ExecutionRequest` gönder; yan etkiler approval için park edilebilir | CLI yüzeyi kayıtlı ve process service'lerine bağlı. [Kanıt: `src/cli/commands/process.ts`] |
| Sürekli iş | `autonomous …` | Kalıcı backlog, approvals, status ve döngü kontrolleri | Runtime aktif ama default-off; reactive bridge attach-only'dir. [Kanıt: `.deckent/settings/features-manifest.json`; `src/cli/commands/autonomous.ts`] |
| Uzak/programatik kontrol | HTTP/SSE ve MCP | API server ve MCP tool/resource'ları (sayılar aşağıda) | Approvals MCP üzerinde tasarım gereği read-only'dir — allow/deny kararları yalnız etkileşimli CLI yüzeyinde vardır. [Kanıt: `src/mcp/tools/index.ts`; `src/mcp/server.ts`] |

## Ürün yetenekleri

- Deterministik, evaluation-backed lifecycle orchestration; dependency scheduling, FIX retry'ları, checkpoint'ler, retrospektifler ve rollback policy'si. [Kanıt: `src/orchestra/sprint-phases.ts`; `src/orchestra/dependency-scheduler.ts`; `src/orchestra/sprint-checkpoint.ts`; `src/orchestra/rollback.ts`]
- Hard-coded ürün provider'ı yerine effective config, model registry, canlı authority, reachability, limit ve bütçeden çözülen provider-neutral routing — anahtarları vocabulary'ye bağlı bir learning-cells outcome ledger'ı ile; altyapı kaynaklı ölümler (OOM, usage limit, auth kaybı) bir ajanın yetenek skorunu asla cezalandırmaz. [Kanıt: `src/core/routing/route-task-v3.ts`; `src/core/routing/learning-cells.ts`]
- SQLite/FTS5 ile DB-first memory; relation/history, doküman tazeliği, KPI store'ları, recall ve export/backup operasyonları. [Kanıt: `src/core/memory-store.ts`; `src/core/memory-query.ts`; `src/cli/commands/memory.ts`]
- Runtime genelinde approval, authority, audit, scope ve immutable settlement kontratları — private key'i repo dışında owner custody'sinde duran Ed25519 trust-anchor'lı append-only closure ledger dahil. [Kanıt: `src/core/approval-broker.ts`; `src/orchestra/authority-enforcer.ts`; `scripts/lint-closure-dispositions.mjs`; `docs/governance/`]
- Native REPL, terminal dashboard, web/API server, Desktop, VS Code extension, connectors (Telegram teslimi canlı-kanıtlı), CLI ve MCP yüzeyleri. [Kanıt: `src/cli/entry.ts`; `src/cli/commands/dashboard.ts`; `src/cli/commands/serve.ts`; `src/desktop`; `src/extensions/vscode`; `src/connectors`; `src/mcp`]
- Gerçek Commander ağacının yürünmesi ve 504 gerçek `--help` koşusuyla ölçülmüş 253 görünür CLI komut yolu, 548 option ve 103 positional argüman (2026-08-25). MCP tool/resource, agent ve skill sayıları aşağıda generator-sahiplidir. [Kanıt: `tests/cli/cli-surface-truth-battery.test.ts`; `docs/generated/cli-manifest.json`]

## Güncel repo gerçeği

Ayrıntılı dokümanlardaki durum etiketleri:

- `✅ live`: source wiring mevcut ve güncel runtime kanıtı iddiayı destekliyor.
- `⚠️ partial`: kod mevcut; ama bir flag, eksik kanıt, parity açığı veya production closure iddiayı sınırlıyor.
- `🔜 roadmap`: tasarım/tarihçe mevcut, güncel production closure yok.

Feature manifest'i şu anda 35 girdi listeler. Canlı `truth --json` kontrolü 2026-08-25'te beş truth kontratı raporladı: training trace code/wired/enabled/proven; tool surface ve worker approval gate wired+enabled ama runtime kanıtı eksik; routing decision journal wired (journal dosyaları canlı yazılıyor) fakat enabling flag tespit edilmedi; prompt-gate-block'un tespit edilen callsite'ı yok ve tek half-wire adayı olmayı sürdürüyor. [Kanıt: gerçek `node dist/cli/entry.js features --json` ve `truth --json` çıktıları, 2026-08-25]

Dogfood dürüstlüğü ürünün parçasıdır: Deckent kendini kendi run'larıyla geliştirir ve o run'ların başarısızlıkları yeniden-etiketlenmek yerine `docs/MASTER-PLAN.md`'de kök-neden satırlarıyla `ABORTED` olarak kaydedilir. Gözetimsiz production güvenilirliği sertifikalı değildir; bkz. [Güncel sürtünmeler](https://github.com/VerhexIO/deckent/blob/main/docs/tr/operations/current-frictions.md).

## Dokümantasyon haritası

- [Başlarken](https://github.com/VerhexIO/deckent/blob/main/docs/tr/guide/getting-started.md)
- [Run yaşam döngüsü](https://github.com/VerhexIO/deckent/blob/main/docs/tr/guide/run-lifecycle.md)
- [Yürütme modları](https://github.com/VerhexIO/deckent/blob/main/docs/tr/guide/execution-modes.md)
- [Etkileşimli yüzeyler](https://github.com/VerhexIO/deckent/blob/main/docs/tr/guide/interactive-surfaces.md)
- [Özellik kataloğu](https://github.com/VerhexIO/deckent/blob/main/docs/tr/features/catalog.md)
- [CLI referansı](https://github.com/VerhexIO/deckent/blob/main/docs/tr/cli.md)
- [MCP referansı](https://github.com/VerhexIO/deckent/blob/main/docs/tr/mcp.md)
- [Veritabanı referansı](https://github.com/VerhexIO/deckent/blob/main/docs/tr/db.md)
- [Yapılandırma](https://github.com/VerhexIO/deckent/blob/main/docs/tr/configuration.md)
- [Bağımlılık gerekçe defteri](https://github.com/VerhexIO/deckent/blob/main/docs/tr/reference/dependencies.md)
- [Tam iki dilli dokümantasyon dizini](https://github.com/VerhexIO/deckent/blob/main/docs/index.md)

## Anayasal kısıtlar

Deckent'in üç değişmez yasası: Dual Lens + Scale, Every Environment ve Never MVP. Tam governance yorumu [Immutable Laws](https://github.com/VerhexIO/deckent/blob/main/docs/tr/governance/immutable-laws.md) belgesindedir. [Kanıt: `AGENTS.md:9-35`]

License: MIT. [Kanıt: `package.json`; `LICENSE`]

<!-- AUTOGEN:START id="badges" -->
[![npm version](https://img.shields.io/npm/v/deckent.svg)](https://www.npmjs.com/package/deckent) [![tests](https://img.shields.io/badge/tests-37298%2B-brightgreen)](https://github.com/VerhexIO/deckent) [![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![sprints](https://img.shields.io/badge/sprints-492%2B-teal)](https://github.com/VerhexIO/deckent) [![version](https://img.shields.io/badge/version-v0.100.0-orange)](https://github.com/VerhexIO/deckent) [![CI](https://img.shields.io/github/actions/workflow/status/VerhexIO/deckent/ci.yml?label=ci)](https://github.com/VerhexIO/deckent/actions)
<!-- AUTOGEN:END id="badges" -->

<!-- AUTOGEN:START id="stat-counts" -->
- **51 MCP tools** + **8 MCP resources**
- **21 built-in agents**
- **30 built-in skills**
- **20 dashboard pages**
<!-- AUTOGEN:END id="stat-counts" -->
