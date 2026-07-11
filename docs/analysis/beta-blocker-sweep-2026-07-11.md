# BETA-BLOCKER-SWEEP — v1.0.0-beta öncesi bütünsel risk-taraması (çapraz-göz)

> **Provenans:** gpt-5.6-sol × ultra-effort, manuel koşum (Alperen, 2026-07-11).
> Prompt = DIRECTIVES-411 Task 3 (BETA-BLOCKER-SWEEP). Rapor verbatim korunmuştur.
> **Karar-statüsü:** Bu rapor karar-mekanizması girdisidir (Alperen, 2026-07-11) — bulgular
> Alperen karar-turu sonrası plana alınır; doğrudan iş-maddesi DEĞİLDİR.

## Özet

Karar: mevcut checkout için publish NO_GO.

MASTER-PLAN 530–542 ID aralığı filtrelendi: release.yml'in tek publish otoritesi ve Desktop Alperen onayı yeni bulgu olarak sayılmadı; TERM-DEV-LOOP'un bilinen golden/B ayrışması da Bölüm 2'nin başlangıç girdisi kabul edildi. (docs/MASTER-PLAN.md:64, docs/MASTER-PLAN.md:69, docs/MASTER-PLAN.md:70, docs/MASTER-PLAN.md:75)

### BLOCKER özeti

| ID | BLOCKER | Kanıt özeti |
|---|---|---|
| PUB-01 | validate:publish npm 11/non-TTY pack çıktısını parse edemiyor. | Gate text npm notice beklerken command npm pack --dry-run stdout'unu okur; mevcut ortamda gate exit 1 verdi. (scripts/validate-publish.mjs:96, scripts/validate-publish.mjs:611) |
| PUB-02 | Mevcut artifact file-count bütçesini aşıyor. | Salt-okunur JSON pack gözlemi 1.849 file verdi; gate üst sınırı 1.720 ve warning'i bile readiness failure sayıyor. Fresh build:all sonucu sprint-içi build yasağı nedeniyle doğrulanamadı. (scripts/validate-publish.mjs:71, :224, :567, AGENTS.md:64) |
| REL-01 | Tag/package/lock/changelog equality gate'i yok. | Workflow her v* tagını alıp package version kontrolü yapmadan publish eder. (.github/workflows/release.yml:47, :100, :115) |
| REL-02 | Tag commit'in full required CI'dan geçtiği publish öncesi kanıtlanmıyor. | Release yalnız governance+core smoke koşar; full suite ayrı dry-run workflow'unda publish ile paralel çalışabilir. (.github/workflows/release.yml:91, .github/workflows/publish.yml:67) |
| INIT-01 | Provider/auth yokken init exit 0 ve "You're ready" basıyor. | No-provider wizard Claude fallback seçer; final doctor sorun bildirse de next-steps koşulsuz basılır. (src/cli/helpers/wizard.ts:236, src/cli/commands/init.ts:537, src/cli/commands/init-wizard.ts:91) |
| INIT-02 | Docker CLI var fakat daemon yoksa config spawn_backend:docker kalabiliyor. | İlk seçim yalnız docker --version kullanır; sonraki daemon probe yalnız image-offer'ı skip eder ve config'i subprocess'e geri çevirmez. (src/core/system-capacity.ts:38, src/cli/commands/init-steps.ts:215, src/cli/commands/init.ts:206, :269) |
| SEC-01 | Re-init .deck secrets'i ezer ve dosya 0600 değildir. | writeDeckSecurityFiles unconditional template write çağırır; template plain writeFileSync kullanır. Bu açık ADR'de zaten kayıtlıdır, yeni keşif olarak sayılmamıştır. (src/cli/commands/init-steps.ts:380, src/core/deck-file.ts:128, :155, docs/adr/adr-g-005-secret-file-system.md:45) |
| SEC-02 | Subprocess worker proje kökündeki .deck dosyasını okuyabilir. | ADR ve backend source bu açığı açıkça kabul eder; Docker shadow yalnız container yolunu kapatır. (src/orchestra/spawn-backend-docker.ts:729, :752, docs/adr/adr-g-005-secret-file-system.md:25) |
| XPLAT-01 | Native Windows "fully supported" denirken release-proof required değildir. | Doctor subprocess'i fully supported gösterir; Windows CI allow-failure ve yalnız core/agents kapsamındadır. Bu, Every Environment yasasının native Windows şartını karşılamaz. (src/cli/commands/doctor.ts:95, .github/workflows/ci.yml:196, AGENTS.md:23) |

## Kanıt-tabanlı analiz

### Paket yüzeyi: files/bin/exports/engines/dist/builtins/assets

Paket root ve SDK export'larını, iki executable bin'i, Node 24 floor'unu ve dist/bin/assets/README/LICENSE inclusion policy'sini ilan eder. (package.json:6, :10, :12, :108, :111)

copy-assets.mjs source altındaki JSON/MD/template dosyalarını dist altına aynı relative path ile kopyalar ve bin mode'larını 0755 yapar. Builtin agent/skill resolvers module-relative dist/core/builtins yolunu kullanır. (scripts/copy-assets.mjs:20, :75, :93, src/core/agent-pool.ts:20, src/core/skill-pool.ts:34)

Dockerfile resolver package-root-relative assets/Dockerfile.worker kullanır; dashboard resolver da module-relative dist/dashboard döndürür. (src/cli/commands/image.ts:64, src/cli/helpers/dashboard-dir.ts:12)

Mevcut dist üzerinde salt-okunur pack/import smoke; root ve SDK importlarının, iki bin'in, Dockerfile, dashboard ve builtins'in varlığını doğruladı. Clean build:all artifact'i sprint içinde üretilemediği için release artifact'inin byte/file-count sonucu doğrulanamadı. (package.json:36, AGENTS.md:64)

### Tüm package bulguları

**PUB-01 — BLOCKER**
- Kanıt: Text parser npm notice satırlarını bekliyor; non-TTY npm 11 çağrısı safeExec altında boş output üretti ve size/critical-files gate'leri kırıldı. (scripts/validate-publish.mjs:83, :199, :581)
- Fix: npm pack --dry-run --json --ignore-scripts async spawn edilip JSON şeması parse edilmeli ve text parser kaldırılmalıdır; repo testinde çalışan JSON deseni zaten vardır. (tests/cli/f1df-pack.test.ts:37)

**PUB-02 — BLOCKER, mevcut artifact**
- Kanıt: Runtime pack gözlemi 1.849 file/5.100.978 byte; file-count tolerance 1.720'de biter ve warning readiness'i false yapar. (scripts/validate-publish.mjs:70, :224, :567)
- Fix: Fresh clean artifact üzerinde kategorili size/file budget üretilmeli, gerçek regressions baseline-delta ile bloklanmalı ve kullanılmayan asset/orphan output source kanıtıyla budanmalıdır.

**PKG-01 — MAJOR**
- Kanıt: Tarball critical check yalnız root main/types, iki bin ve dashboard'u kontrol eder; exports["./sdk"], builtins ve Dockerfile contract'ı kapsam dışıdır. (package.json:17, scripts/validate-publish.mjs:501, :507)
- Fix: Packed tarball tmpdir'e extract edilip root/SDK imports, bin invocation, assets, dashboard ve builtin resolver smoke'ları tek install-contract gate'inde çalıştırılmalıdır.

**PKG-02 — MAJOR**
- Kanıt: npm-installed doctor --pre-flight, publish edilmeyen scripts/pre-flight-health-check.mjs arar ve eksik capability için top-level passed:true/abortSprint:false döndürür. (src/cli/commands/doctor.ts:1729, :1737)
- Fix: Pre-flight mantığı compiled application module'a taşınmalı ve npm-installed package'ın kendi module-relative implementation'ı kullanılmalıdır.

**PKG-03 — MINOR**
- Kanıt: files içinde bin vardır fakat checkout'ta gerçek bin dizini yoktur; executable entry'ler doğrudan dist altındadır. (package.json:6, :111)
- Fix: Hayalet bin inclusion kaldırılmalı veya gerçek wrapper contract'ı eklenip install smoke ile doğrulanmalıdır.

**PKG-04 — MAJOR**
- Kanıt: prepublishOnly yalnız plain build çalıştırır; dist git-tracked değildir ve plain clean mevcut dashboard'u yalnız varsa korur, üretmez. (package.json:65, scripts/clean.mjs:18)
- Fix: Defense-in-depth hook canonical release gate'ini çağırmalı veya sole-authority dışındaki publish'i açıkça fail etmeli; hiçbir yol stale/missing dashboard yayınlayamamalıdır.

**PKG-05 — MAJOR**
- Kanıt: lint:builtins-drift script'i vardır fakat lint:gates, validate:publish ve release workflow tarafından çağrılmaz. (package.json:53, :54, scripts/validate-publish.mjs:549)
- Fix: Builtins drift check publish readiness aggregator'ına ve release composition testine eklenmelidir.

### Taze deckent init: ilk on dakika

Gerçek-binary /tmp smoke; provider CLI'ları PATH'ten çıkarılmış, catalog offline, install/image opt-out durumunda exit 0, .deck mode 0644, config spawn_backend:docker ve provider claude gözlemledi; çıktı health issue bildirdikten sonra "You're ready" bastı. Source zinciri bu sonucu doğrular: no-provider fallback Claude seçer, doctor failure yalnız print edilir ve next-steps koşulsuz basılır. (src/cli/helpers/wizard.ts:236, src/cli/commands/init.ts:537, :579, src/cli/commands/init-wizard.ts:91)

Aynı tmp projede sentinel API key yazıldıktan sonra init --upgrade yeniden çalıştırıldığında key boş template ile silindi; source unconditional create zinciriyle uyumludur. (src/cli/commands/init.ts:441, src/cli/commands/init-steps.ts:380, src/core/deck-file.ts:155)

| ID | Seviye | Kanıt | Fix |
|---|---|---|---|
| INIT-01 | BLOCKER | Auth/provider yokken fallback Claude config yazılır, remaining health issue exit code'a dönüşmez ve "ready" basılır. (wizard.ts:236, init.ts:508, :537) | Init READY/SETUP_INCOMPLETE/FAILED outcome üretmeli; usable auth kanıtı yoksa nonzero/special exit, dürüst status ve exact remediation vermelidir. |
| INIT-02 | BLOCKER | Backend seçimi Docker CLI version'ına, image-offer daemon check'ine dayanır; daemon/image yokluğunda config geri alınmaz. (system-capacity.ts:38, init-steps.ts:215, init.ts:269) | Backend transaction'ı CLI+daemon+image readiness'i birlikte değerlendirmeli ve build reddi/başarısızlığında explicit subprocess fallback veya blocked setup üretmelidir. |
| INIT-03 | MAJOR, önceden kayıtlı | Package Node >=24 isterken iki doctor implementation'ı >=18'i geçirir ve provisioner 18/22 önerir; açık ADR-D-001'de kayıtlıdır. (package.json:108, doctor.ts:221, doctor-checks.ts:98, provisioner.ts:90, docs/adr/adr-d-001-build-baseline.md:22) | Runtime check, doctor, provisioner, messages ve docs aynı Node 24 SSOT'tan türetilmelidir. |
| INIT-04 | MAJOR | Init mode/provider/provision/ready metinlerinin önemli bölümü getMessage dışında hardcoded'dur; proje quality bar tüm user-facing metni i18n zorunlu kılar. (init.ts:372, :489, init-wizard.ts:74, AGENTS.md:45) | Bütün onboarding strings messages.ts key'lerine taşınmalı, mechanism katmanına localized labels enjekte edilmelidir. |
| XPLAT-01 | BLOCKER | Native Windows init subprocess seçer ve doctor bunu fully supported gösterir, fakat Windows CI informational/allow-failure ve yalnız core testidir; WSL de gerçek release install matrix'inde yoktur. (init-steps.ts:215, doctor.ts:95, ci.yml:196) | Windows-native, WSL, macOS ve Linux için packed-install→init→plan→detached backend→completion required matrix'i release commit'ine bağlanmalıdır. |

### Güvenlik yüzeyi

Olumlu taraf: telemetry default kapalıdır ve local observability network çağrısı yapmadığını açıkça sözleşmeler. (src/core/config.ts:1251, src/core/telemetry.ts:1, src/core/observability.ts:1)

| ID | Seviye | Kanıt | Fix |
|---|---|---|---|
| SEC-01 | BLOCKER, önceden kayıtlı | .deck unconditional overwrite edilir ve owner-only mode uygulanmaz; aynı ADR DECK-OVERWRITE-GUARD ve DECK-HARDEN olarak bunu kaydeder. (deck-file.ts:128, :155, adr-g-005:45) | Create no-op-if-exists/CAS olmalı, ilk write atomic 0600+chmod kullanmalı ve Windows user-ACL adapter'ı doğrulanmalıdır. |
| SEC-02 | BLOCKER, önceden kayıtlı | Docker .deck shadow yaparken subprocess worker host project root'unda dosyayı okuyabilir. (spawn-backend-docker.ts:729, :752, adr-g-005:25) | Host credential broker secrets'i worker filesystem'inden tamamen ayırmalı ve her backend yalnız task/provider-scoped ephemeral credential handle görmelidir. |
| SEC-03 | MAJOR | API ve terminal bearer token'ları stderr'e raw yazılır; loopback dashboard token'ı ayrıca HTML'e enjekte eder. (api/server.ts:1648, :1676, :1960, :2000) | Raw token loglanmamalı; 0600 handshake store kullanılmalı, output yalnız fingerprint vermeli ve explicit TTY-only reveal ayrı approval istemelidir. |
| SEC-04 | MAJOR | Argümanlı her CLI command preAction'da catalog bootstrap eder; warm cache/offline yoksa models.dev'e 5s timeout'lu GET gönderir. (cli/entry.ts:1056, model-catalog.ts:26, :270, :333) | Catalog fetch model-dependent commands/first-use'e lazy edilmeli, network policy açıkça gösterilmeli ve offline enterprise policy merkezi olarak uygulanmalıdır. |
| SEC-05 | MAJOR | High-severity npm audit CI'da continue-on-error:true; release workflow güvenlik gate'i çalıştırmaz. Güncel vulnerability seti network olmadan doğrulanamadı. (ci.yml:56, :67, release.yml:73) | Runtime dependency audit/SBOM fail-closed olmalı ve yalnız expiry/owner/reason içeren signed exception allowlist'i bypass edebilmelidir. |
| SEC-06 | MAJOR | Publish workflow floating action tags kullanır ve OIDC izni yanında uzun ömürlü NPM_TOKEN taşır. (release.yml:52, :61, :115, :121) | Actions immutable SHA'ya pinlenmeli ve npm trusted publishing/OIDC ile long-lived registry token kaldırılmalıdır. |

### Version/changelog/release tutarlılığı

Package ve lock 1.0.0-beta.1 taşır; root changelog aynı versiyonu 2026-04-22 "current" ilan eder, docs/CHANGELOG.md ise kendisini root'a yönlendirdiği halde en güncel sprint entries'i kendi içinde tutar. (package.json:3, package-lock.json:3, CHANGELOG.md:3, :5, docs/CHANGELOG.md:3, :5)

Release notes parser exact heading eşleştirmez; 1.0.0-beta.1 regex'i 1.0.0-beta.1-sprint410, -sprint409 vb. başlıkları da tekrar "version match" sayarak ilk 100 satırı birleştirir. (.github/workflows/release.yml:100, docs/CHANGELOG.md:5, :16)

Root changelog ayrıca MRR'yi dependency-satisfying diye anlatırken current source truth tersidir. (CHANGELOG.md:20, src/orchestra/scheduler-truth.ts:10)

| ID | Seviye | Kanıt | Fix |
|---|---|---|---|
| REL-01 | BLOCKER | Workflow v* tagını package/lock exact equality kontrolü olmadan publish eder. (release.yml:47, :103, :115) | Publish öncesi tag == package.version == lock root version == exact changelog section gate'i zorunlu olmalıdır. |
| REL-02 | BLOCKER | Release yalnız core/governance smoke koşar; full tests başka workflow'da mutating publish'i gate etmez. (release.yml:91, publish.yml:67) | Tag commit'in reusable required CI workflow'unu başarıyla tamamladığı doğrulanmadan publish job'ı başlayamamalıdır. |
| REL-03 | MAJOR | Changelog canonical yönleri çelişir ve regex prefix-matching nedeniyle birden çok sprint entry'sini tek release'e toplar. (CHANGELOG.md:3, docs/CHANGELOG.md:3, release.yml:105) | Tek canonical changelog seçilmeli ve parser escaped/exact anchored heading üzerinden boş veya duplicate section'da fail etmelidir. |
| REL-04 | MAJOR | bump-version.sh prerelease metadata'yı atar, yalnız package.json'u değiştirir, master push ve manual npm publish önerir; sole-authority release modeline aykırıdır. (bump-version.sh:45, :88, :115) | Script retire edilmeli veya package+lock+changelog atomic release-prepare üretip tag/publish mutasyonunu workflow authority'sine bırakmalıdır. |

Npm registry'de 1.0.0-beta.1 versiyonunun daha önce yayınlanıp yayınlanmadığı doğrulanamadı; root changelog bunu "current release" diye adlandırdığı için aynı version'ın immutable registry'de tekrar publish edilme riski release rehearsal'da ayrıca kontrol edilmelidir. (CHANGELOG.md:5)

## Seçenekler (+ trade-off)

### 1. Mevcut tag ile yayın

- Artı: zaman maliyeti yok.
- Eksi: validate:publish zaten kırmızı; tag/version ve CI attestation yok; init/auth/secret blocker'ları kullanıcıya gider.
- Karar: NO_GO.

### 2. Yalnız pack parser ve file-count düzeltip yayın

- Artı: release workflow teknik olarak ilerleyebilir.
- Eksi: artifact gate düzelir fakat first-ten-minute ve secret boundary blocker'ları kalır.
- Karar: NO_GO.

### 3. Blocker-focused release candidate train

Önce secrets/init transaction, ardından deterministic pack/install contract, sonra release provenance/version/CI ve cross-platform gerçek-binary matrix kapanır.

- Artı: publish kararını tek komutun yeşil çıkmasına değil, gerçek end-user ve cross-platform kanıtına bağlar.
- Eksi: birkaç bağımsız sprint ve clean release rehearsal gerekir.
- Karar: önerilen seçenek.

## Net Öneri

v1.0.0-beta için publish yalnız şu koşullar birlikte sağlandığında açılmalıdır:

1. .deck overwrite/mode ve subprocess visibility blocker'ları kapanmış olmalı.
2. Auth'sız veya unusable backend'li init READY diyememeli.
3. npm pack --json üzerinden packed-install contract tüm exports/assets/builtins/dashboard/bin yüzeyini kanıtlamalı.
4. Tag/package/lock/changelog exact equality ve tag-commit required CI attestation geçmeli.
5. Windows-native, WSL, macOS ve Linux fresh global-install/init/run smoke'ları required olmalı.
6. Current dependency security gate'i fail-closed olmalı.
7. Bilinen Desktop Alperen onayı ayrıca verilmiş olmalı; bu teknik denetimde yeni bulgu olarak sayılmamıştır. (docs/MASTER-PLAN.md:69)

## Uygulama-planı (6 sprint — RC-train)

| Sprint | Dosyalar ve teslim | Publish gate |
|---|---|---|
| 1 — Secret lifecycle | core/deck-file.ts, cli/commands/init-steps.ts, providers/subprocess.ts, yeni secret-permission/overwrite/subprocess-isolation tests. | Existing secret korunur; POSIX 0600/Windows ACL; worker .deck okuyamaz. |
| 2 — Transactional init readiness | system-capacity.ts, init.ts, init-steps.ts, provider.ts, wizard.ts, init-wizard.ts, messages; tmpdir real-binary fixtures. | No-auth, logged-out CLI, Docker CLI/no-daemon, image-decline, Windows paths explicit READY/INCOMPLETE/FAILED verir. |
| 3 — Deterministic package contract | validate-publish.mjs, package.json, yeni tests/release/packed-install-contract.test.ts; JSON pack parser ve extracted tarball smoke. | Size/count, root+SDK import, two bins, dashboard, Dockerfile, builtins ve no-internal-leak tek gate. |
| 4 — Release integrity/provenance | release.yml, publish.yml, reusable CI workflow, release governance tests, release-prepare script. | Tag/package/lock/changelog equality, exact notes, required CI, SHA-pinned actions, trusted publishing. |
| 5 — Every-environment install matrix | ci.yml, cross-platform-e2e.yml, yeni Windows/WSL/macOS/Linux pack-install-init-run fixtures. | Her platform required; unsupported durum typed fail-honest; allow-failure yok. |
| 6 — Security/release rehearsal | server.ts, model-catalog.ts, dependency audit/SBOM config, release docs/changelog. | Token redaction, explicit network policy, fail-closed audit, clean build:all→pack→install→binary smoke; ardından Desktop approval. |

Her sprint kendi rollback noktasını taşımalıdır; fakat security ve version-integrity blocker'larında eski unsafe davranış kalıcı rollback seçeneği olmamalıdır.

## Riskler

- Fresh build:all çalıştırılmadığı için release artifact'inin kesin file count/size sonucu doğrulanamadı; mevcut dist gözlemi release kararı yerine yalnız blocker sinyalidir. (AGENTS.md:64)
- Registry'de mevcut version occupancy doğrulanamadı; exact version preflight olmadan tag atılmamalıdır. (package.json:3)
- Native Windows, macOS ve WSL fresh packed-install akışları bu ortamda canlı çalıştırılamadı; mevcut CI kapsamı bunu telafi etmiyor. (ci.yml:196, cross-platform-e2e.yml:18)
- .deck fix'i migration sırasında mevcut secret dosyasına dokunursa veri kaybı tekrarlanabilir; no-op-if-exists, atomic backup ve permission verification aynı transaction'da olmalıdır. (deck-file.ts:128)
- Auth probe'ları subscription CLI'ları interactive login'e zorlamamalı; timeout'lu non-mutating probe ve UNKNOWN state gerekir. Bugünkü Codex detection login state'i bilinçli olarak doğrulamaz. (provider.ts:484)
- Pack count'i yalnız tolerance yükselterek geçirmek gerçek bloat'ı saklar; per-category manifest ve baseline delta gerekir. (validate-publish.mjs:70)
- Release workflow full CI attestation yerine yorumdaki "main zaten gated" varsayımına dayanır; tag arbitrary commit'e taşınabildiği için bu varsayım yürütülebilir contract değildir. (release.yml:31, :47)
