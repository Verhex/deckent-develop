# DIRECTIVES — Sprint 028 (npm Publish Hazirligi)

## Hedef: Deckent'i npm'de yayinlanabilir duruma getirmek. Interactive onboard wizard, Ingilizce dokumantasyon, error UX, upgrade/onboard/usage gercek implementasyonlar, publish pipeline, landing page icerigi. 30 gorev — tumu opus model, effort high/max.

---

## Gorev 1: package.json Publish Hazirligi
- Dosya: package.json, scripts/prepublish.ts (yeni)
- Kapsam: ./, scripts/

### Aciklama
package.json'i npm publish icin hazirla. files field: dist/, bin/, README.md, LICENSE. bin field: { "deckent": "./dist/cli/index.js", "deckent-mcp": "./dist/mcp/server.js" }. main/types field. engines: node >=18. prepublishOnly script: tsc && vitest run. scripts/prepublish.ts: build dogrulama, dist/ temizlik, dosya boyut kontrolu. 10+ test.

### Test
- package.json fields dogru
- prepublish script calisiyor
- dist/ icerigi beklenen dosyalari iceriyor
- 10+ test

---

## Gorev 2: Build Pipeline — tsc + Bundle Dogrulama
- Dosya: scripts/build-verify.ts (yeni), tests/scripts/build-verify.test.ts (yeni)
- Kapsam: scripts/, tests/scripts/

### Aciklama
npm publish oncesi build dogrulama. Adimlar: 1) tsc ile build, 2) dist/ icinde tum gerekli dosyalar var mi kontrol, 3) bin dosyalarinin calistirilabilir oldugunu dogrula (shebang kontrolu), 4) dist/ boyut raporu (>50MB uyari), 5) Circular dependency kontrolu. 10+ test.

### Test
- Build basarili tamamlaniyor
- Gerekli dosyalar dist/'te var
- Shebang dogru
- Boyut limiti kontrol ediliyor
- 10+ test

---

## Gorev 3: npm pack --dry-run Test
- Dosya: scripts/pack-test.ts (yeni), tests/scripts/pack-test.test.ts (yeni)
- Kapsam: scripts/, tests/scripts/

### Aciklama
npm pack --dry-run ile publish edilecek dosya listesini kontrol et. Kontrol: 1) .brain/, .tasks/, .locks/, .dashboard DAHIL DEGIL, 2) node_modules DAHIL DEGIL, 3) dist/ DAHIL, 4) README, LICENSE, package.json DAHIL, 5) Toplam paket boyutu <10MB. .npmignore dosyasi olustur. 10+ test.

### Test
- Hassas dosyalar pakete dahil degil
- Gerekli dosyalar dahil
- Paket boyutu limiti
- .npmignore dogru
- 10+ test

---

## Gorev 4: README.md Ingilizce Overhaul — Header & Quickstart
- Dosya: README.md
- Kapsam: ./

### Aciklama
README.md'yi global lansman icin Ingilizce yeniden yaz. Bolumler: 1) Hero section (logo alani, tagline, badges: npm version, tests, license), 2) One-liner aciklama, 3) 30 saniye quickstart (npm install -g deckent, deckent init, deckent start), 4) GIF demo placeholder, 5) Features listesi (6 madde). Turkce icerigi TAMAMEN kaldir, Ingilizce monolingual. 5+ test.

### Test
- README.md Ingilizce
- Quickstart adimlari dogru
- Badge placeholder'lari mevcut
- 5+ test

---

## Gorev 5: README.md — Features & Architecture Section
- Dosya: README.md
- Kapsam: ./

### Aciklama
README.md'ye detay bolumleri ekle: 1) How It Works (3 adimli aciklama: describe → plan → execute), 2) Architecture overview (basitlestirilmis diyagram), 3) Key Features (sprint lifecycle, multi-worker, memory, auditor, GO/NO-GO, provider agnostic), 4) Comparison table (vs Cursor, Devin, Aider — 5 satir), 5) Requirements section. 5+ test.

### Test
- Features bolumleri mevcut
- Architecture diyagrami mevcut
- Comparison table dogru
- 5+ test

---

## Gorev 6: README.md — Usage Examples & Contributing
- Dosya: README.md
- Kapsam: ./

### Aciklama
README.md'ye kullanim ornekleri ve katki bolumleri: 1) CLI usage ornekleri (init, start, status, plan, doctor), 2) MCP usage ornekleri (Claude Code icinde dogal dil), 3) Configuration secenekleri tablosu, 4) Contributing kismi (link to CONTRIBUTING.md), 5) License, 6) Links (docs, discord, website). 5+ test.

### Test
- Usage ornekleri dogru
- MCP ornekleri mevcut
- Config tablosu dogru
- 5+ test

---

## Gorev 7: QUICKSTART.md Ingilizce Polish
- Dosya: docs/QUICKSTART.md
- Kapsam: docs/

### Aciklama
Mevcut QUICKSTART.md'yi Ingilizce olarak guncelle ve polish et. Adimlar: 1) Prerequisites (Node 18+, git, tmux, Claude CLI), 2) Installation (npm install -g deckent), 3) First Project Setup (deckent init), 4) Writing Your First Directive, 5) Running Your First Sprint, 6) Understanding Results, 7) Next Steps. Her adim copy-paste yapilabilir komutlar icermeli. 5+ test.

### Test
- Tum adimlar Ingilizce
- Komutlar copy-paste yapilabilir
- Prerequisites tam
- 5+ test

---

## Gorev 8: API Docs Ingilizce Guncelleme
- Dosya: docs/API.md
- Kapsam: docs/

### Aciklama
docs/API.md'yi Ingilizce olarak guncelle. Bolumler: 1) HTTP API (tum endpoint'ler), 2) MCP Tools (10 tool), 3) MCP Resources (5 resource), 4) Authentication, 5) Error codes, 6) SSE stream format. Her endpoint icin curl ornegi ekle. 5+ test.

### Test
- Tum endpoint'ler dokumante
- curl ornekleri mevcut
- MCP tool/resource listesi guncel
- 5+ test

---

## Gorev 9: Interactive Onboard Wizard — TUI Framework
- Dosya: src/cli/helpers/wizard.ts (yeni), tests/cli/wizard.test.ts (yeni)
- Kapsam: src/cli/, tests/cli/

### Aciklama
Interactive TUI wizard altyapisi. WizardStep interface: prompt, type (select/input/confirm), choices?, default?, validate?. runWizard(steps): adimlari sirayla calistir, sonuclari topla. Kutuphane: @inquirer/prompts veya mevcut readline. Renkli output: chalk veya mevcut terminal renkleri. 10+ test.

### Test
- WizardStep dogru calistirilyor
- Select/input/confirm tipleri
- Validation calisiyor
- Default degerler
- 10+ test

---

## Gorev 10: deckent onboard Gercek Implementasyon
- Dosya: src/cli/commands/onboard.ts, tests/cli/onboard.test.ts (yeni)
- Kapsam: src/cli/, tests/cli/

### Aciklama
Mevcut stub'i gercek wizard ile degistir. Adimlar: 1) Welcome mesaji, 2) Claude plan tespit (detectSubscription), 3) Sistem profil analizi (getSystemProfile), 4) Proje analiz (analyzeProject), 5) Config onerisi (generateSetupRecommendation), 6) Kullanici onay, 7) deckent init calistir, 8) Ilk DIRECTIVES.md sablonu olustur, 9) "Ready! Run deckent start" mesaji. 15+ test.

### Test
- Wizard adimlari sirayla calisiyor
- Subscription tespit ediliyor
- Sistem profili analiz ediliyor
- Config donerisi mantikli
- init basariyla calisiyor
- 15+ test

---

## Gorev 11: deckent upgrade Gercek Implementasyon
- Dosya: src/cli/commands/upgrade.ts, tests/cli/upgrade.test.ts (yeni)
- Kapsam: src/cli/, tests/cli/

### Aciklama
Mevcut stub'i gercek implementasyonla degistir. Adimlar: 1) npm view deckent version ile son surumu kontrol et, 2) Mevcut surumle karsilastir, 3) Guncelleme varsa: npm install -g deckent@latest calistir, 4) Basarili ise yeni surumu goster, 5) --check flag: sadece kontrol et, yuklememe. Semver karsilastirma. 10+ test.

### Test
- Surum kontrolu calisiyor
- Guncelleme komutu dogru
- --check sadece bilgi veriyor
- Ayni surumdeyse "up to date" mesaji
- 10+ test

---

## Gorev 12: Error Message UX — Error Registry
- Dosya: src/core/errors.ts (yeni), tests/core/errors.test.ts (yeni)
- Kapsam: src/core/, tests/core/

### Aciklama
Merkezi hata kayit sistemi. DeckentError class: code, message, suggestion, docLink. ErrorRegistry: tum hata kodlarini ve cozum onerilerini barindiran map. Hata kodlari: DECKENT_E001 (tmux not found → "Install: brew install tmux"), DECKENT_E002 (claude not found), DECKENT_E003 (no DIRECTIVES), DECKENT_E004 (config invalid), vb. i18n entegre (tr/en hata mesajlari). 15+ test.

### Test
- DeckentError dogru format
- ErrorRegistry tum hatalari iceriyor
- Cozum onerileri mevcut
- i18n calisiyor
- 15+ test

---

## Gorev 13: Error Message UX — CLI Entegrasyonu
- Dosya: src/cli/helpers/error-handler.ts (yeni), tests/cli/error-handler.test.ts (yeni)
- Kapsam: src/cli/, tests/cli/

### Aciklama
CLI komutlarina merkezi hata yakalama. handleError(error): DeckentError ise renkli format + cozum onerisi goster, bilinmeyen hata ise genel mesaj + "Report: github.com/verhex/deckent/issues". Tum CLI komutlarinin catch bloklarinda handleError kullan. Stack trace sadece --verbose ile goster. 10+ test.

### Test
- DeckentError renkli formatlanmis
- Cozum onerisi gosteriliyor
- Bilinmeyen hata genel mesaj
- --verbose stack trace
- 10+ test

---

## Gorev 14: Error Message UX — Doctor Iyilestirme
- Dosya: src/cli/commands/doctor.ts, tests/cli/doctor-ux.test.ts (yeni)
- Kapsam: src/cli/, tests/cli/

### Aciklama
Doctor komutunun hata mesajlarini iyilestir. Her basarisiz check icin: 1) Ne eksik (ornek: "tmux not found"), 2) Nasil kurulur (ornek: "brew install tmux / sudo apt install tmux"), 3) Neden gerekli (ornek: "Required for parallel worker management"), 4) Alternatif (ornek: "Or use --subprocess flag for tmux-free mode"). Trafik isigi renkleri: yesil/sari/kirmizi. 10+ test.

### Test
- Her check cozum onerisi iceriyor
- Platform bazli kurulum komutlari (macOS/Linux)
- Renkli output dogru
- 10+ test

---

## Gorev 15: i18n Hata Mesajlari Entegrasyonu
- Dosya: .deckent/i18n/en.json, .deckent/i18n/tr.json, src/core/i18n.ts
- Kapsam: .deckent/i18n/, src/core/

### Aciklama
Tum hata mesajlarini i18n sistemine entegre et. Yeni anahtarlar: error.tmux_not_found, error.claude_not_found, error.no_directives, error.config_invalid, error.scope_violation, error.lock_conflict, error.usage_exceeded. Her anahtar en ve tr ceviri. getMessage fonksiyonu error code ile mesaj dondurebilmeli. 10+ test.

### Test
- en.json tum hata anahtarlarini iceriyor
- tr.json tum hata anahtarlarini iceriyor
- getMessage error code ile calisiyor
- Eksik anahtar icin fallback
- 10+ test

---

## Gorev 16: Landing Page Icerigi — Markdown Taslaği
- Dosya: docs/landing-page-content.md (yeni)
- Kapsam: docs/

### Aciklama
deckent.agency landing page icerigi (Ingilizce). Bolumler: 1) Hero: tagline + CTA, 2) Problem statement (3 madde), 3) Solution (Deckent nasil cozer), 4) How it works (3 adim gorsel aciklama), 5) Features (6 kart), 6) Comparison (vs alternatives), 7) Pricing (free, open source), 8) Getting started (3 adim), 9) Testimonials (placeholder), 10) Footer (GitHub, Discord, docs). Icerik doküman olarak, HTML/CSS degil. 5+ test.

### Test
- Tum bolumler mevcut
- Ingilizce
- CTA mevcut
- 5+ test

---

## Gorev 17: CONTRIBUTING.md Ingilizce Guncelleme
- Dosya: CONTRIBUTING.md
- Kapsam: ./

### Aciklama
CONTRIBUTING.md'yi global katilimcilar icin Ingilizce olarak guncelle. Bolumler: 1) Getting started, 2) Development setup, 3) Running tests, 4) Architecture overview (kisa), 5) How to add a CLI command, 6) How to add an MCP tool, 7) How to create a plugin, 8) PR guidelines, 9) Code style, 10) Issue templates aciklama. 5+ test.

### Test
- Tum bolumler Ingilizce
- Gelistirme komutlari dogru
- PR guidelines mevcut
- 5+ test

---

## Gorev 18: LICENSE Dosyasi
- Dosya: LICENSE (yeni veya guncelle)
- Kapsam: ./

### Aciklama
MIT License dosyasi. Telif: "Copyright (c) 2026 Alperen @ Verhex". Tam MIT metni. package.json license field kontrol (MIT olmali). 3+ test.

### Test
- LICENSE dosyasi mevcut
- MIT metni dogru
- package.json license: "MIT"
- 3+ test

---

## Gorev 19: GitHub Issue Templates
- Dosya: .github/ISSUE_TEMPLATE/bug_report.md (yeni), .github/ISSUE_TEMPLATE/feature_request.md (yeni)
- Kapsam: .github/

### Aciklama
GitHub issue sablonlari olustur. Bug report: steps to reproduce, expected behavior, actual behavior, system info (OS, Node, deckent version). Feature request: problem description, proposed solution, alternatives considered. Ingilizce. 5+ test.

### Test
- Bug report sablonu mevcut
- Feature request sablonu mevcut
- Ingilizce
- 5+ test

---

## Gorev 20: GitHub PR Template
- Dosya: .github/PULL_REQUEST_TEMPLATE.md (yeni)
- Kapsam: .github/

### Aciklama
Pull request sablonu: Summary, Changes, Test plan, Checklist (tests pass, docs updated, no regressions). Ingilizce. 3+ test.

### Test
- PR template mevcut
- Checklist items dogru
- 3+ test

---

## Gorev 21: npx deckent Desteği
- Dosya: src/cli/index.ts, package.json
- Kapsam: src/cli/

### Aciklama
`npx deckent init` ve `npx deckent start` calismali. package.json bin field dogru ayarlanmis olmali. dist/cli/index.js shebang (#!/usr/bin/env node) icermeli. npx ile calistirildiginda PATH ve cwd dogru set edilmeli. 5+ test.

### Test
- Shebang mevcut
- bin field dogru
- npx ile calistirilabilir
- 5+ test

---

## Gorev 22: Publish Script
- Dosya: scripts/publish.ts (yeni), tests/scripts/publish.test.ts (yeni)
- Kapsam: scripts/, tests/scripts/

### Aciklama
npm publish otomasyon scripti. Adimlar: 1) git status temiz mi kontrol, 2) tsc build, 3) vitest run, 4) npm pack --dry-run ile icerik kontrol, 5) Surum artir (patch/minor/major arguman), 6) git tag olustur, 7) npm publish (--dry-run default, --for-real ile gercek publish). 10+ test.

### Test
- Dirty git status'ta durduruyor
- Build basarisiz olursa durduruyor
- --dry-run default davranis
- Surum artirma dogru
- 10+ test

---

## Gorev 23: CHANGELOG.md Otomatik Guncelleme
- Dosya: src/orchestra/doc-updaters/changelog-updater.ts, tests/orchestra/doc-updaters/changelog-updater.test.ts
- Kapsam: src/orchestra/doc-updaters/, tests/orchestra/doc-updaters/

### Aciklama
Mevcut changelog updater'i npm publish formatina uyumlu hale getir. Keep a Changelog formati (https://keepachangelog.com). Bolumler: Added, Changed, Fixed, Removed. Sprint sonuclarina gore otomatik kategorizasyon: DONE → Added, GO_WITH_TECH_DEBT → Changed (with note), NO_GO → not included. Surum numarasi package.json'dan. 10+ test.

### Test
- Keep a Changelog formati dogru
- Kategorizasyon dogru
- Surum numarasi package.json'dan
- 10+ test

---

## Gorev 24: Telemetry Opt-in Altyapisi
- Dosya: src/core/telemetry.ts (yeni), tests/core/telemetry.test.ts (yeni)
- Kapsam: src/core/, tests/core/

### Aciklama
Opsiyonel, opt-in telemetry altyapisi (gonderme yok, sadece altyapi). TelemetryEvent interface: event, properties, timestamp. TelemetryCollector: record(event), flush(), isEnabled(). Config: telemetry: true/false (default false). GDPR uyumlu: sadece opt-in, PII yok, istediginde kapat. Gercek gonderim Sprint 029+'da. 10+ test.

### Test
- Default olarak kapali
- Opt-in ile aktif
- Event kaydediliyor
- PII icermiyor
- 10+ test

---

## Gorev 25: deckent --version Gelistirme
- Dosya: src/cli/index.ts
- Kapsam: src/cli/

### Aciklama
`deckent --version` komutunu zenginlestir. Mevcut: sadece surum numarasi. Yeni: surum + Node.js surumu + OS + tmux durumu + Claude CLI durumu. Ornek: "deckent v0.1.0 | Node 22.1.0 | Linux | tmux OK | claude OK". --version-json ile JSON format. 5+ test.

### Test
- --version zengin bilgi gosteriyor
- --version-json JSON donduruyor
- Eksik bagimliliklari gosteriyor
- 5+ test

---

## Gorev 26: deckent init — npm Publish Sonrasi Uyumluluk
- Dosya: src/cli/commands/init.ts, tests/cli/init-published.test.ts (yeni)
- Kapsam: src/cli/, tests/cli/

### Aciklama
npm install -g deckent sonrasi `deckent init` calistirildiginda dogru dizin yapisi olusturuldugunu dogrula. Kontrol: 1) dist/ icinden calistirma (package path resolution), 2) Template dosyalari dist/ icinde mi?, 3) .claude/settings.json MCP kaydi dogru mu?, 4) Farkli OS'lerde path resolution. 10+ test.

### Test
- dist/ icinden template resolution
- MCP kaydi dogru path
- Cross-platform path dogru
- 10+ test

---

## Gorev 27: Security Policy
- Dosya: SECURITY.md (yeni veya guncelle)
- Kapsam: ./

### Aciklama
Guvenlik politikasi dokumani (Ingilizce). Bolumler: 1) Supported versions, 2) Reporting vulnerabilities (security@verhex.com), 3) Security model overview, 4) Known limitations, 5) Best practices. GitHub security advisories linki. 3+ test.

### Test
- SECURITY.md mevcut
- Raporlama yontemi acik
- Ingilizce
- 3+ test

---

## Gorev 28: docs/CONFIG-REFERENCE.md Ingilizce Guncelleme
- Dosya: docs/CONFIG-REFERENCE.md
- Kapsam: docs/

### Aciklama
Config referans dokumani Ingilizce guncellemesi. Tum config alanlari, tipleri, varsayilan degerleri, aciklamalari. Plan modlari tablosu. Ornek config dosyalari. Global vs project config farki. 5+ test.

### Test
- Tum config alanlari dokumante
- Ornekler mevcut
- Ingilizce
- 5+ test

---

## Gorev 29: Integration Test — npm Install Simulasyonu
- Dosya: tests/integration/npm-install-sim.test.ts (yeni)
- Kapsam: tests/integration/

### Aciklama
npm install sonrasi kullanici deneyimi simulasyonu. Senaryo: 1) dist/ dizininden CLI calistir, 2) deckent init calistir (mock), 3) Dosya yapisi kontrol, 4) deckent doctor calistir, 5) deckent plan calistir (mock). "Ilk 5 dakika deneyimi" testi. 10+ test.

### Test
- dist/ CLI calistirilabilir
- init dogru dosya yapisi olusturuyor
- doctor tum kontrolleri calistiriyor
- 10+ test

---

## Gorev 30: Release Checklist Dokumani
- Dosya: docs/RELEASE-CHECKLIST.md (yeni)
- Kapsam: docs/

### Aciklama
Her release oncesi kontrol listesi. Adimlar: 1) tsc --noEmit pass, 2) vitest run pass, 3) npm pack --dry-run kontrol, 4) CHANGELOG guncel, 5) README guncel, 6) Surum numarasi dogru, 7) git tag, 8) npm publish --dry-run, 9) npm publish, 10) GitHub release olustur, 11) Discord duyuru. 3+ test.

### Test
- Checklist dosyasi mevcut
- Tum adimlar listelenmis
- Ingilizce
- 3+ test

---

## Kalite Kurallari
- tsc --noEmit MUST pass
- npx vitest run MUST pass — mevcut testler + Sprint 027 testleri 0 regresyon
- Tum gorevler opus model, effort high
- Her gorev bagimsiz, paralel calisabilir (max 8 worker)
- Tum dokumantasyon INGILIZCE (global lansman)
- npm pack --dry-run sonrasinda hassas dosya pakete dahil olmamali
