# DIRECTIVES — Sprint 051: npm Publish + README Overhaul

## Goal: Deckent'i npm'de yayınla, README'yi global ölçekte rekabet edebilir hale getir. `npx deckent` çalışır duruma gelsin. Visibility P0.

---

## Task 1: npm Publish Dry Run & Fix
- Model: sonnet
- Effort: normal
- Files: package.json, .npmignore (new), scripts/validate-publish.ts
- Scope: ./

### Description
`npm pack --dry-run` çalıştır, çıktıyı analiz et. Package size < 5MB olmalı. `.npmignore` oluştur: tests/, docs/, .deckent/, .brain/, .tasks/, .locks/, .github/, .claude/, examples/ hariç tut. `files` field'ı package.json'da doğrula (dist/, bin/, README.md, LICENSE). `npx deckent --version` çalıştığını doğrula.
5+ test.

---

## Task 2: README.md Overhaul
- Model: opus
- Effort: high
- Files: README.md
- Scope: ./

### Description
README'yi tamamen yeniden yaz. Hedef: OpenHands/OpenClaw README kalitesinde.
- Hero section: "Otonom AI Orkestrasyon — Projenizi alıp götüren yaşayan organizma"
- 30-second quickstart: `npx deckent init && deckent start "Add login page"`
- Feature matrix: Deckent vs OpenHands vs Devin vs SWE-agent (self-learning, sprint lifecycle, quality gates)
- Architecture diagram (ASCII art)
- Multi-provider badge'ler (Claude + Codex + Gemini)
- Demo GIF placeholder (asciinema)
- "Why Deckent?" section: Sprint lifecycle, self-learning, quality gates benzersizliği
- Community links: Discord, GitHub Discussions, Contributing
15+ section, shields.io badge'ler.

---

## Task 3: bin Entry Validation
- Model: sonnet
- Effort: normal
- Files: src/cli/entry.ts, bin/deckent
- Scope: src/cli/, bin/

### Description
`npx deckent` ve `npm install -g deckent` senaryolarını doğrula. `bin/deckent` shebang doğru mu? `dist/cli/entry.js` erişilebilir mi? Postinstall hook gerekiyor mu? Permission bits (chmod +x) doğru mu? Global install → `deckent --version`, `deckent --help`, `deckent doctor` çalıştığını doğrula.
5+ test.

---

## Task 4: CHANGELOG.md Update
- Model: sonnet
- Effort: low
- Files: docs/CHANGELOG.md
- Scope: docs/

### Description
Sprint 043-050 değişikliklerini CHANGELOG.md'ye ekle. Keep a Changelog formatında. Özellikle: multi-provider (038), beta cleanup (035-037), container readiness (050), health/ready endpoints, exit handler, rate limiting, security headers.
3+ test.

---

## Task 5: npm Publish Pipeline Validation
- Model: sonnet
- Effort: normal
- Files: .github/workflows/publish.yml
- Scope: .github/

### Description
publish.yml workflow'unu doğrula: npm publish --provenance çalışıyor mu? OIDC token setup doğru mu? Registry URL doğru mu? Dry-run test ekle. Tag-based trigger (v*) doğru mu?
5+ test.

---

## Quality Rules
- tsc --noEmit MUST pass
- All new tests MUST pass
- Existing tests: 0 regression
- npm pack --dry-run < 5MB
- `npx deckent --version` works
