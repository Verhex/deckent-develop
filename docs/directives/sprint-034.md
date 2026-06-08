# DIRECTIVES — Sprint 029 (Gercek Dunya Testi + Beta Publish)

## Hedef: Deckent'i farkli proje tiplerinde test et, E2E smoke test suite olustur, npm beta yayinla, GitHub Release workflow tamamla, performance benchmark, lansman hazirligi. 30 gorev — tumu opus model, effort high/max.

---

## Gorev 1: Test Senaryosu — React/Next.js Projesi
- Dosya: tests/e2e/scenarios/react-nextjs.test.ts (yeni)
- Kapsam: tests/e2e/

### Aciklama
Deckent'i bir React/Next.js projesinde test et (mock ortam). Senaryo: 1) Bos Next.js proje yapisi olustur (package.json, tsconfig, pages/), 2) deckent init calistir, 3) DIRECTIVES yaz: "Add login page with form validation", 4) planSprint calistir, 5) Planner dogru scope ve model atamasi yapiyor mu kontrol, 6) analyzeProject dogru framework tespit ediyor mu kontrol. 15+ test.

### Test
- Next.js projesi tespit ediliyor (framework: next)
- Planner src/pages/ veya src/app/ scope atiyor
- Model atamasi mantikli (sonnet icin UI task)
- 15+ test

---

## Gorev 2: Test Senaryosu — Python/FastAPI Projesi
- Dosya: tests/e2e/scenarios/python-fastapi.test.ts (yeni)
- Kapsam: tests/e2e/

### Aciklama
Deckent'i bir Python/FastAPI projesinde test et (mock ortam). Senaryo: 1) Python proje yapisi olustur (requirements.txt, main.py, pyproject.toml), 2) deckent init calistir, 3) DIRECTIVES yaz: "Add user CRUD API endpoints", 4) planSprint calistir, 5) analyzeProject dogru language/framework tespit ediyor mu, 6) Worker prompt'unda Python-spesifik komutlar var mi (pytest, pip). 15+ test.

### Test
- Python projesi tespit ediliyor (language: python)
- FastAPI framework tespit ediliyor
- Build/test komutlari Python-uyumlu
- 15+ test

---

## Gorev 3: Test Senaryosu — Rust CLI Projesi
- Dosya: tests/e2e/scenarios/rust-cli.test.ts (yeni)
- Kapsam: tests/e2e/

### Aciklama
Deckent'i bir Rust CLI projesinde test et (mock ortam). Senaryo: 1) Rust proje yapisi olustur (Cargo.toml, src/main.rs), 2) deckent init calistir, 3) DIRECTIVES yaz: "Add argument parsing with clap", 4) planSprint calistir, 5) analyzeProject dogru language tespit ediyor mu, 6) Build komutlari Rust-uyumlu mu (cargo build, cargo test). 15+ test.

### Test
- Rust projesi tespit ediliyor (language: rust)
- Build tool: cargo tespit ediliyor
- Worker prompt'unda cargo komutlari var
- 15+ test

---

## Gorev 4: Test Senaryosu — Monorepo (Turborepo)
- Dosya: tests/e2e/scenarios/monorepo.test.ts (yeni)
- Kapsam: tests/e2e/

### Aciklama
Deckent'i bir Turborepo monorepo'da test et (mock ortam). Senaryo: 1) Monorepo yapisi olustur (turbo.json, packages/, apps/), 2) deckent init calistir, 3) DIRECTIVES yaz: "Add shared UI component library", 4) planSprint calistir, 5) Scope atamasi dogru mu (packages/ui/), 6) Worker izolasyonu monorepo'da calisiyor mu. 10+ test.

### Test
- Turborepo tespit ediliyor (build tool: turbo)
- Scope monorepo alt dizinine atanabiliyor
- Coklu paket yapisi destekleniyor
- 10+ test

---

## Gorev 5: E2E Smoke Test — Tam Akis
- Dosya: tests/e2e/smoke/full-flow.test.ts (yeni)
- Kapsam: tests/e2e/

### Aciklama
npm install -g → init → start → status → complete tam akis testi. Adimlar: 1) Gecici dizinde proje olustur, 2) deckent init --auto calistir, 3) DIRECTIVES.md yaz (basit 2 gorevli), 4) planSprint calistir (structured mode), 5) Mock worker result yaz, 6) evaluateResult calistir, 7) writeRetrospective calistir, 8) cleanup calistir, 9) Tum dosyalar dogru durumda mi kontrol. 20+ test.

### Test
- init → plan → evaluate → retro → cleanup akisi calisiyor
- Task dosyalari olusturuluyor ve temizleniyor
- RETRO.md yaziliyor
- Sprint log olusturuluyor
- Dashboard dogru guncelleniyor
- 20+ test

---

## Gorev 6: E2E Smoke Test — Zero-Config Akis
- Dosya: tests/e2e/smoke/zero-config.test.ts (yeni)
- Kapsam: tests/e2e/

### Aciklama
`deckent start "description"` zero-config akis testi. Adimlar: 1) Gecici proje, 2) deckent init, 3) `start "Add health check endpoint"` cagir, 4) Gecici DIRECTIVES olusturuldu mu, 5) Plan yapildi mi, 6) Sprint tamamlandi mi, 7) Gecici DIRECTIVES temizlendi mi. 10+ test.

### Test
- Tek satirlik girdi calisiyor
- DIRECTIVES otomatik olusturuluyor
- Sprint akisi tamamlaniyor
- Temizlik yapiliyor
- 10+ test

---

## Gorev 7: E2E Smoke Test — MCP Akis
- Dosya: tests/e2e/smoke/mcp-flow.test.ts (yeni)
- Kapsam: tests/e2e/

### Aciklama
MCP tool zinciri testi. Adimlar: 1) deckent_init cagir, 2) deckent_set_directives cagir, 3) deckent_plan cagir, 4) Plan sonucunu dogrula, 5) deckent_status cagir, 6) deckent_doctor cagir, 7) deckent_history cagir, 8) deckent_retro cagir. Tum tool'lar zincir halinde calisiyor mu? 15+ test.

### Test
- init → set_directives → plan zinciri calisiyor
- Her tool dogru response donduruyor
- Enrichment metadata mevcut
- 15+ test

---

## Gorev 8: E2E Smoke Test — Error Scenarios
- Dosya: tests/e2e/smoke/error-scenarios.test.ts (yeni)
- Kapsam: tests/e2e/

### Aciklama
Hata senaryolari testi. Senaryolar: 1) DIRECTIVES.md olmadan start → anlamli hata, 2) Gecersiz config ile init → validation hatasi, 3) Zaten aktif sprint varken start → conflict hatasi, 4) Olmayan task'a spawn → not found, 5) Scope disina yazma → violation, 6) tmux yokken start → subprocess fallback veya hata. 15+ test.

### Test
- Her hata senaryosu anlamli mesaj donduruyor
- Cozum onerisi mevcut
- Sistem crash etmiyor
- 15+ test

---

## Gorev 9: npm Publish Beta — 0.1.0-beta.1
- Dosya: scripts/publish-beta.ts (yeni), package.json
- Kapsam: scripts/

### Aciklama
npm'e beta surum yayinlama scripti. Adimlar: 1) Surum: 0.1.0-beta.1 ayarla, 2) tsc build, 3) vitest run, 4) npm pack kontrol, 5) npm publish --tag beta (--dry-run default), 6) Basarili ise git tag v0.1.0-beta.1, 7) npm info deckent ile dogrula. Script --for-real flag'i olmadan gercek publish yapmaz. 10+ test.

### Test
- Beta surum numarasi dogru
- Build basarili
- --dry-run default
- --for-real ile gercek publish tetikleniyor
- 10+ test

---

## Gorev 10: GitHub Actions — Release Workflow
- Dosya: .github/workflows/release.yml (yeni veya guncelle)
- Kapsam: .github/workflows/

### Aciklama
GitHub Actions release workflow. Tetikleyici: git tag v* push. Adimlar: 1) Checkout, 2) Node.js 22 setup, 3) npm ci, 4) tsc build, 5) vitest run, 6) npm pack, 7) npm publish (NPM_TOKEN secret), 8) GitHub Release olustur (changelog'dan notes). Beta tag'leri (v*-beta*) --tag beta ile publish. 10+ test.

### Test
- Workflow YAML gecerli
- Tag tetikleyici dogru
- Beta tag ayri isleniyor
- 10+ test

---

## Gorev 11: GitHub Actions — CI Workflow Iyilestirme
- Dosya: .github/workflows/ci.yml (yeni veya guncelle)
- Kapsam: .github/workflows/

### Aciklama
Her PR ve push icin CI workflow. Adimlar: 1) Matrix: Node 18, 20, 22, 2) npm ci, 3) tsc --noEmit, 4) vitest run --reporter=json, 5) Coverage raporu (opsiyonel), 6) npm pack --dry-run kontrol. Basarisiz olursa PR'a yorum. 10+ test.

### Test
- Matrix dogru Node surumlerini kapsıyor
- Tum adimlar sirayla calisiyor
- Basarisizlik durumu dogru raporlaniyor
- 10+ test

---

## Gorev 12: Performance Benchmark — 10 Gorev
- Dosya: tests/benchmark/sprint-10-tasks.bench.ts (yeni)
- Kapsam: tests/benchmark/

### Aciklama
10 gorevli sprint icin performance benchmark. Olcumler: 1) planSprint suresi (ms), 2) Task JSON yazma suresi, 3) evaluateResult suresi (per task), 4) writeRetrospective suresi, 5) cleanup suresi, 6) Toplam bellek kullanimi (peak RSS). Mock worker result'lar ile. Baseline olarak kaydet. 5+ test.

### Test
- planSprint <2s
- evaluateResult <100ms per task
- Toplam akis <5s
- Bellek <200MB
- 5+ test

---

## Gorev 13: Performance Benchmark — 50 Gorev
- Dosya: tests/benchmark/sprint-50-tasks.bench.ts (yeni)
- Kapsam: tests/benchmark/

### Aciklama
50 gorevli sprint icin performance benchmark. Ayni olcumler + ek: 1) Task queue wave performansi (8 worker ile 50 task), 2) Auditor scan suresi (50 heartbeat dosyasi), 3) Dashboard guncelleme suresi. Olcekleme sorunlari tespit et. 5+ test.

### Test
- planSprint <5s (50 task)
- Auditor scan <500ms
- Dashboard guncelleme <100ms
- 5+ test

---

## Gorev 14: Performance Benchmark — 100 Gorev Stres Testi
- Dosya: tests/benchmark/sprint-100-tasks.bench.ts (yeni)
- Kapsam: tests/benchmark/

### Aciklama
100 gorevli sprint stres testi. Ek kontroller: 1) Dosya sistemi limitleri (100 task + 100 hb + 100 result = 300 dosya), 2) Lock contention (10+ worker ayni anda), 3) Dashboard boyutu (100 agent entry), 4) Memory decay 100 sprint sonrasi. Darbogazlari tespit et ve raporla. 5+ test.

### Test
- 100 task dosyasi olusturuluyor ve temizleniyor
- Lock contention yonetilebiliyor
- Dashboard boyutu makul (<100KB)
- 5+ test

---

## Gorev 15: README GIF Demo Script
- Dosya: scripts/record-demo.sh (yeni), docs/demo-script.md (yeni)
- Kapsam: scripts/, docs/

### Aciklama
README icin GIF demo kayit scripti. Arac: asciinema + agg (veya vhs). Senaryo: 1) deckent init (1s), 2) DIRECTIVES goster (1s), 3) deckent start --dry-run (2s), 4) deckent status --watch (3s), 5) Sprint tamamlandi mesaji (1s). Toplam ~10s. docs/demo-script.md'de kayit adimlari dokumante. 3+ test.

### Test
- Script dosyasi calistirilabilir
- Senaryo adimlari dokumante
- 3+ test

---

## Gorev 16: Product Hunt Hazirlık Dokumani
- Dosya: docs/launch/product-hunt.md (yeni)
- Kapsam: docs/launch/

### Aciklama
Product Hunt lansman hazirlik dokumani. Icerik: 1) Tagline (60 karakter), 2) Description (260 karakter), 3) Detayli aciklama (5 paragraf), 4) 5 adet key feature, 5) Maker comment taslagi, 6) FAQ (5 soru), 7) Screenshot/GIF listesi, 8) Lansman gunu checklist. 3+ test.

### Test
- Tum bolumler mevcut
- Karakter limitleri uygun
- Ingilizce
- 3+ test

---

## Gorev 17: Hacker News Post Taslagi
- Dosya: docs/launch/hackernews-post.md (yeni)
- Kapsam: docs/launch/

### Aciklama
Hacker News "Show HN" post taslagi. Format: 1) Baslik: "Show HN: Deckent — Open-source AI agent orchestrator with sprint lifecycle", 2) Post body: problem, solution, how it works, key differentiators, links, 3) Beklenen sorular ve cevaplar (10 soru), 4) Timing onerileri (gun/saat). 3+ test.

### Test
- Post taslagi mevcut
- Q&A bolumleri hazir
- Ingilizce
- 3+ test

---

## Gorev 18: Discord Community Setup Dokumani
- Dosya: docs/launch/discord-setup.md (yeni)
- Kapsam: docs/launch/

### Aciklama
Discord topluluk yapilandirma dokumani. Kanallar: #general, #getting-started, #bug-reports, #feature-requests, #showcase, #plugins, #dev-chat. Roller: maintainer, contributor, user. Bot entegrasyonu: GitHub webhook (yeni release bildirimi). Hosgeldin mesaji taslagi. Community guidelines. 3+ test.

### Test
- Kanal listesi mevcut
- Roller tanimli
- Guidelines mevcut
- 3+ test

---

## Gorev 19: Sprint Bildirimi — Webhook Altyapisi
- Dosya: src/core/notifications.ts (yeni), tests/core/notifications.test.ts (yeni)
- Kapsam: src/core/, tests/core/

### Aciklama
Sprint olaylari icin bildirim altyapisi. NotificationProvider interface: send(event, payload). WebhookProvider: HTTP POST ile webhook URL'ye gonder. Event tipleri: SPRINT_STARTED, SPRINT_COMPLETED, TASK_NO_GO, USAGE_WARNING. Config: notifications.webhook_url. Opsiyonel, config'de yoksa devre disi. 10+ test.

### Test
- WebhookProvider HTTP POST gonderiyor
- Event tipleri dogru
- Config yoksa sessizce geciyor
- Hata durumunda non-fatal
- 10+ test

---

## Gorev 20: Sprint Bildirimi — Brain Entegrasyonu
- Dosya: src/orchestra/brain.ts, tests/orchestra/brain-notifications.test.ts (yeni)
- Kapsam: src/orchestra/, tests/orchestra/

### Aciklama
Brain sprint lifecycle'ina bildirim entegrasyonu. PLAN fazinda SPRINT_STARTED, COMPLETE'de SPRINT_COMPLETED, NO_GO'da TASK_NO_GO, auto-pause'da USAGE_WARNING. Bildirim gondermezse sprint devam eder (non-blocking, non-fatal). 10+ test.

### Test
- SPRINT_STARTED bildirimi gonderiliyor
- SPRINT_COMPLETED bildirimi gonderiliyor
- Bildirim hatasi sprint'i durdurmaz
- 10+ test

---

## Gorev 21: Multi-Platform Test Matrix
- Dosya: tests/e2e/platform/cross-platform.test.ts (yeni)
- Kapsam: tests/e2e/

### Aciklama
Cross-platform uyumluluk testleri. Kontroller: 1) Path separator (/ vs \) dogru isleniyor mu, 2) Home dizin tespiti (macOS/Linux/Windows), 3) tmux availability check platform bazli, 4) Subprocess spawn platform farkliliklari, 5) Dosya izinleri (chmod 0600 Windows'da calismaz). 10+ test.

### Test
- Path separator dogru isleniyor
- Home dizin her platformda tespit ediliyor
- Platform-spesifik kodlar korunakli
- 10+ test

---

## Gorev 22: deckent doctor — Publish Sonrasi Kontroller
- Dosya: src/cli/commands/doctor.ts, tests/cli/doctor-publish.test.ts (yeni)
- Kapsam: src/cli/, tests/cli/

### Aciklama
npm install sonrasi doctor check'leri genislet. Yeni kontroller: 1) deckent surum kontrolu (guncel mi?), 2) Global config dizini var mi, 3) MCP kaydi dogru mu, 4) Permission kontrolleri (.deckent/ yazilabilir mi). Her kontrol cozum onerisi icermeli. 10+ test.

### Test
- Surum kontrolu calisiyor
- MCP kaydi dogrulaniyor
- Permission kontrolu dogru
- 10+ test

---

## Gorev 23: Provider Registry — Otomatik Tespit
- Dosya: src/core/provider.ts, tests/core/provider-detect.test.ts (yeni)
- Kapsam: src/core/, tests/core/

### Aciklama
ProviderRegistry'ye otomatik tespit ekle. detectAvailableProviders(): PATH'te claude, codex, gemini CLI'larini ara, bulunanlardan adapter olustur. resolveProvider(config): config'deki provider veya en iyi mevcut provider'i sec. init sirasinda tespit et ve config'e yaz. 10+ test.

### Test
- Claude CLI bulununca ClaudeAdapter seciliyor
- Hicbir CLI bulunamazsa hata
- Config'deki tercih oncelikli
- 10+ test

---

## Gorev 24: Codex CLI Adapter (Temel)
- Dosya: src/providers/codex.ts (yeni), tests/providers/codex.test.ts (yeni)
- Kapsam: src/providers/, tests/providers/

### Aciklama
OpenAI Codex CLI icin temel adapter. CodexAdapter implements ProviderAdapter. spawn: `codex -p {prompt}` komutu. checkUsage: API rate limit kontrolu. isAvailable: codex --version. supportedModels: ['gpt-4.1', 'o3', 'o4-mini']. Bu adapter tam fonksiyonel degil, temel yapi + TODO'lar. 10+ test.

### Test
- CodexAdapter dogru komut olusturuyor
- isAvailable kontrol calisiyor
- supportedModels dogru
- 10+ test

---

## Gorev 25: Template Gallery — Temel Yapi
- Dosya: src/cli/helpers/templates.ts (yeni), tests/cli/templates.test.ts (yeni)
- Kapsam: src/cli/, tests/cli/

### Aciklama
`deckent init --template <name>` icin sablon sistemi. Template interface: name, description, directives (ornek DIRECTIVES.md), config (onerilen config). Built-in sablonlar: typescript-api, react-app, python-api. listTemplates(), getTemplate(name), applyTemplate(projectRoot, template). 10+ test.

### Test
- 3 built-in sablon mevcut
- listTemplates dogru listeliyor
- applyTemplate dosyalari olusturuyor
- Olmayan sablon hata veriyor
- 10+ test

---

## Gorev 26: deckent init --template Entegrasyonu
- Dosya: src/cli/commands/init.ts, tests/cli/init-template.test.ts (yeni)
- Kapsam: src/cli/, tests/cli/

### Aciklama
init komutuna --template flag ekle. `deckent init --template react-app` calisti^gildiginda: 1) Normal init adimlari, 2) Template'in onerilen config'ini uygula, 3) Ornek DIRECTIVES.md'yi yaz, 4) Template-spesifik .claude/rules/ olustur. --list-templates ile mevcut sablonlari listele. 10+ test.

### Test
- --template flag calisiyor
- Template config uygulandigi
- DIRECTIVES.md sablondan olusturuluyor
- --list-templates listeliyor
- 10+ test

---

## Gorev 27: README Badges — Dinamik
- Dosya: scripts/update-badges.ts (yeni)
- Kapsam: scripts/

### Aciklama
README.md icin dinamik badge'ler olusturan script. Badge'ler: npm version, tests passing, license (MIT), Node >=18, PRs welcome. shields.io formati. Script her release'de calistirilir ve README'deki badge bolumunu gunceller. 5+ test.

### Test
- Badge URL'leri gecerli shields.io formati
- README'deki badge bolumleri guncelleniyor
- 5+ test

---

## Gorev 28: docs/TROUBLESHOOTING.md Ingilizce Guncelleme
- Dosya: docs/TROUBLESHOOTING.md
- Kapsam: docs/

### Aciklama
Troubleshooting dokumani Ingilizce guncellemesi. Senaryolar: 1) tmux not found, 2) Claude CLI not found, 3) Sprint hangs, 4) Worker scope violation, 5) High usage warning, 6) Dashboard not updating, 7) MCP connection failed, 8) Config validation error. Her senaryo: problem, cause, solution, prevention. 5+ test.

### Test
- Tum senaryolar Ingilizce
- Her senaryo cozum iceriyor
- 5+ test

---

## Gorev 29: Regression Test Suite — Sprint 027-028 Ozellikleri
- Dosya: tests/regression/sprint-027-028.test.ts (yeni)
- Kapsam: tests/regression/

### Aciklama
Sprint 027 ve 028'de eklenen tum ozelliklerin regresyon testi. Kontroller: 1) Provider abstraction calisiyor, 2) Subprocess backend calisiyor, 3) Usage tracking kayit yapiyor, 4) Zero-config mode calisiyor, 5) Rollback mekanizmasi calisiyor, 6) npm publish pipeline calisiyor, 7) Error registry dogru mesajlar donduruyor. 20+ test.

### Test
- Tum Sprint 027 ozellikleri calisiyor
- Tum Sprint 028 ozellikleri calisiyor
- Mevcut 3442+ test gecmeye devam ediyor
- 20+ test

---

## Gorev 30: Beta Launch Checklist Dogrulama
- Dosya: docs/launch/beta-launch-checklist.md (yeni)
- Kapsam: docs/launch/

### Aciklama
Beta lansman oncesi son kontrol listesi ve dogrulama. Adimlar: 1) npm install -g deckent@beta calisiyor, 2) deckent init yeni projede calisiyor, 3) deckent doctor tum kontroller geciyor, 4) deckent start basit gorev tamamliyor, 5) deckent web dashboard calisiyor, 6) MCP entegrasyonu calisiyor, 7) README anlasilir, 8) QUICKSTART izlenebilir, 9) Error mesajlari yardimci, 10) Rollback calisiyor. Her adim icin PASS/FAIL durumu. 3+ test.

### Test
- Checklist tum adimlari kapsıyor
- Ingilizce
- Her adim dogrulanabilir
- 3+ test

---

## Kalite Kurallari
- tsc --noEmit MUST pass
- npx vitest run MUST pass — mevcut testler + Sprint 027-028 testleri 0 regresyon
- Tum gorevler opus model, effort high
- Her gorev bagimsiz, paralel calisabilir (max 8 worker)
- Beta publish sadece --for-real flag'i ile gerceklesir
- Tum lansman dokumanlari INGILIZCE
- Performance benchmark baseline kaydi zorunlu
- E2E testler en az 3 farkli proje tipini kapsamali
