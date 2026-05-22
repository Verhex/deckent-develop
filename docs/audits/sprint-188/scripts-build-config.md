# W1-T08 — scripts/ + Build/Test Config Envanteri

**Sprint:** 188 | **Task:** W1-T08 | **Tarih:** 2026-05-22  
**Tip:** Audit (ADR-053) | **Kapsam:** SALT-OKUNUR — hiçbir kaynak dosya değiştirilmedi

---

## 1. scripts/ Dizin Envanteri

`scripts/` altında toplam **53 dosya** bulunuyor: 49 root + 3 `memory/` + 1 `security/`.

### 1a. Root-level Scripts (49)

| Dosya | Boyut | Amaç | Durum |
|-------|-------|------|-------|
| `adr-validator.mjs` | 6.1 KB | `.brain/DECISIONS.md` MADR v3 format + yinelenen ID doğrulama | Aktif (package.json: lint:adr) |
| `agent-prompt-validator.mjs` | 1.4 KB | Agent PROMPT.md dosyalarında rubricScores self-report varlığı | Referanssız |
| `archive-decisions-md.mjs` | 2.1 KB | `.brain/DECISIONS.md` → archive taşıma (tek seferlik) | Tamamlandı (tek seferlik) |
| `backfill-relations.mjs` | 3.9 KB | memory.db'de ADR relation kayıtlarını retroaktif ekler | Referanssız |
| `build-dashboard.mjs` | 1.9 KB | `src/dashboard` Vite build orchestration | Aktif (package.json: build:dashboard) |
| `build-verify.ts` | 6.4 KB | Derleme sonrası doğrulama (dist dosyaları, shebang, circular dep.) | Testlerde (build-verify.test.ts) |
| `bump-version.sh` | 3.1 KB | package.json semver versiyonlama + git tag oluşturma | Referanssız (manuel çalıştırma) |
| `bundle-builtins.mjs` | 3.5 KB | `.deckent/` built-in agent/skill → `src/core/builtins/` senkronizasyonu | Referanssız |
| `chain-gate-check.mjs` | 16.5 KB | Sprint sonrası kalite kapısı: tsc, vitest, doctor, maliyet | Testlerde (chain-gate.test.ts) |
| `changelog.sh` | 4.2 KB | Conventional commit'lerden CHANGELOG.md üretimi | Referanssız (manuel çalıştırma) |
| `check-error-handling.mjs` | 5.3 KB | `src/orchestra/` içinde ham `throw new Error` kullanım taraması | Aktif (package.json: lint:errors) |
| `cli-smoke-test.sh` | 1.8 KB | Her CLI komutu `--help` çıkışının 0 döndürdüğünü doğrular | Referanssız (manuel çalıştırma) |
| `close-debt-170-001-fix.ts` | 3.6 KB | Tek seferlik: memory.db'de debt-170-001-fix kaydını çözdü işaretle | Tek seferlik (tamamlandı) |
| `copy-assets.mjs` | 2.3 KB | `src/` → `dist/` JSON/MD asset kopyalama + bin chmod | Aktif (package.json: build) |
| `dead-code-audit.mjs` | 17.6 KB | Kaynak kodda kullanım sayısına göre active/dormant/dead sınıflandırma | Testlerde (dead-code-audit.test.ts) |
| `deploy-discord.sh` | 13.7 KB | Discord bot deployment + smoke test | Referanssız (manuel çalıştırma) |
| `deploy-telegram.sh` | 13.6 KB | Telegram bot deployment + token doğrulama | Referanssız (manuel çalıştırma) |
| `directives-stress-simulator.mjs` | 1.9 KB | DIRECTIVES.md üzerine yazar (stres testi) | Tehlikeli / Referanssız |
| `doc-consistency-check.mjs` | 5.9 KB | 7 governance dokümanında numerik tutarlılık çapraz denetimi | Referanssız (manuel çalıştırma) |
| `doc-review.mjs` | 16.6 KB | Tüm .md dosyalarını KEEP/REVISE/DELETE/MOVE kategorize eder | Referanssız |
| `fresh-env-test.sh` | 1.8 KB | Node 18/20/22 Docker izole ortamda kurulum testleri | Referanssız (artık geçersiz) |
| `gen-reference-docs.mjs` | 20.0 KB | MCP tools/resources, ADR index, CLI, agent referans dokümanları üretimi | Aktif (package.json: docs:ref) |
| `generate-cli-docs.ts` | 24.6 KB | CLI komut referans dokümanı otomatik üretimi | Aktif (package.json: docs:generate-cli) |
| `hub-validate.mjs` | 10.3 KB | DeckentHub skill doğrulama: AST sandbox + manifest + Ed25519 imza | Referanssız |
| `i18n-parity.mjs` | 10.3 KB | TR ↔ EN doküman bölüm simetri denetimi | Referanssız |
| `link-checker.mjs` | 8.7 KB | Markdown iç link doğrulama (relative/anchor/external) | Referanssız |
| `lint-links.mjs` | 16.6 KB | Markdown dosya linkleri ve fragment doğrulama (lint:link) | Aktif (package.json: lint:link) |
| `mcp-nervous-e2e.mjs` | 7.3 KB | 5 nervous MCP tool'un doğrudan handler çağrısıyla E2E testi | Referanssız |
| `migrate-brain-v2.mjs` | 9.9 KB | `.brain/*.md` → `memory.db` tek seferlik migrasyon (Sprint 166) | Tek seferlik (tamamlandı) |
| `nervous-tui-smoke.sh` | 2.4 KB | `deckent nervous` TUI çıktısının beklenen bölümleri içermesi | Referanssız (manuel çalıştırma) |
| `npm-publish-dry-final.sh` | 9.9 KB | Sprint 150 Beta GA nihai yayın provası (9 kontrol) | Arşiv (tek seferlik) |
| `npm-publish-dry.sh` | 4.6 KB | Sprint 149 yayın dry-run (8 kontrol) | Arşiv (tek seferlik) |
| `pack-test.ts` | 7.3 KB | npm pack çıktısı doğrulama (gizli dosya, boyut, gerekli dosyalar) | Testlerde (pack-test.test.ts) |
| `pre-flight-health-check.mjs` | 12.3 KB | 7 sprint öncesi sağlık kontrolü (tsc, vitest, brain, lock, docker, MCP) | Testlerde (pre-flight.test.ts) |
| `prepublish.ts` | 5.5 KB | Yayın öncesi doğrulama: dist/ boyut, tsc başarı | Testlerde (prepublish.test.ts) |
| `prompt-linter.mjs` | 12.9 KB | Worker prompt dosyası kalite skorlama (ADR oranı, boş başlık, vb.) | Referanssız |
| `public-repo-sync.sh` | 8.0 KB | `deckent-dev` → `VerhexIO/deckent` public repo senkronizasyonu | Referanssız (manuel çalıştırma) |
| `publish.ts` | 7.5 KB | Tam yayın pipeline: git clean → tsc → vitest → pack → bump → tag → publish | Testlerde (publish.test.ts) |
| `run-e2e-harness.mjs` | 1.5 KB | Zincir güvenliği E2E testlerini çalıştırır | Referanssız |
| `run-self-audit.ts` | 5.7 KB | Brain self-audit koşturması: vitest baseline karşılaştırma | Referanssız |
| `sprint-166-memory-backfill.mjs` | 15.5 KB | Sprint 166 için 9 eksik memory.db girdisinin retroaktif eklemesi | Tek seferlik (tamamlandı) |
| `sprint-167-memory-backfill.mjs` | 10.9 KB | Sprint 167 için 3 eksik memory.db girdisinin retroaktif eklemesi | Tek seferlik (tamamlandı) |
| `sync-manifest.mjs` | 19.0 KB | Feature kullanım manifestini kategorize eder ve günceller | Referanssız (sprint-finalizer hook'tan çağrılıyor) |
| `update-readme-stats.mjs` | 17.2 KB | README/IDENTITY.md stat sayaçlarını gerçek kaynaklarla senkronize eder | Aktif (package.json: docs:stats) |
| `validate-publish.mjs` | 14.1 KB | npm publish v1.0.0-beta.1 hazırlık kapısı (Sprint 180, 6 kontrol) | Aktif (package.json: validate:publish) |
| `validate-publish.ts` | 15.6 KB | Eski yayın doğrulama pipeline (7 adım) — `.mjs` ile **DUPLİKE** | Eski (testlerde kullanılıyor) |
| `verify-archive-db-parity.mjs` | 15.7 KB | `.brain/archive/sprint-*.md` ↔ `memory.db` eşleşme kontrolü | Referanssız |
| `verify-gitignore.mjs` | 1.9 KB | `.brain/memory.db` + WAL dosyalarının `.gitignore`'da olup olmadığını doğrular | Testlerde |
| `verify-publish.sh` | 2.7 KB | npm paketi yayın öncesi bash doğrulama (dist içeriği, bin chmod) | Referanssız |

### 1b. Alt Dizin Scripts

| Dosya | Amaç | Durum |
|-------|------|-------|
| `memory/backfill-stub-entries.mjs` | Stub bellek girdilerini `.brain/sprints/` arşivinden gerçek içerikle doldurur | Referanssız (manuel) |
| `memory/export-adr-fs.mjs` | `memory.db` ADR girdilerini `docs/adr/*.md` dosyalarına tersine aktarır | Referanssız (manuel) |
| `memory/migrate-relations.mjs` | DECISIONS.md arşivinden 6 tür ADR ilişkisini memory.db'ye göçeder | Referanssız (manuel) |
| `security/secret-baseline.mjs` | 10 regex ile izlenen dosyalarda sır taraması; allowlist desteği | CI (secret-scan.yml) |

---

## 2. package.json Script Envanteri ve Eşleme

`package.json` "scripts" bölümünde **20 entry** tanımlı.

### 2a. Tam Eşleme Tablosu

| npm Script | Komut | scripts/ Referansı | Çalışır mı? |
|------------|-------|--------------------|------------|
| `build` | `tsc && node scripts/copy-assets.mjs` | copy-assets.mjs | ✅ |
| `dev` | `tsc --watch` | — | ✅ |
| `test` | `vitest run` | — | ✅ |
| `test:watch` | `vitest` | — | ✅ |
| `test:coverage` | `vitest run --coverage` | — | ✅ |
| `test:dashboard` | `vitest run --config vitest.dashboard.config.ts` | — | ✅ |
| `build:dashboard` | `node scripts/build-dashboard.mjs` | build-dashboard.mjs | ✅ |
| `build:all` | `tsc && node scripts/copy-assets.mjs && npm run build:dashboard` | copy-assets.mjs + build-dashboard.mjs | ✅ |
| `postbuild` | `npm run build:dashboard` | build-dashboard.mjs | ✅ (otomatik) |
| `lint` | `tsc --noEmit && tsc --noEmit -p src/dashboard` | — | ✅ |
| `tsc:dashboard` | `tsc --noEmit -p src/dashboard` | — | ✅ |
| `install:all` | `npm ci && npm ci --prefix src/dashboard` | — | ✅ |
| `lint:adr` | `node scripts/adr-validator.mjs` | adr-validator.mjs | ✅ |
| `lint:errors` | `node scripts/check-error-handling.mjs` | check-error-handling.mjs | ✅ |
| `lint:link` | `node scripts/lint-links.mjs` | lint-links.mjs | ✅ |
| `clean` | `rm -rf dist` | — | ✅ |
| `ci:rebuild-native` | `npm rebuild better-sqlite3 --ignore-scripts=false` | — | ✅ |
| `validate:publish` | `node scripts/validate-publish.mjs` | validate-publish.mjs | ✅ |
| `docs:generate-cli` | `npx tsx scripts/generate-cli-docs.ts` | generate-cli-docs.ts | ✅ |
| `docs:ref` | `node scripts/gen-reference-docs.mjs --write` | gen-reference-docs.mjs | ✅ |
| `docs:ref:check` | `node scripts/gen-reference-docs.mjs --check` | gen-reference-docs.mjs | ✅ |
| `docs:stats` | `node scripts/update-readme-stats.mjs --write` | update-readme-stats.mjs | ✅ |
| `docs:stats:check` | `node scripts/update-readme-stats.mjs --check` | update-readme-stats.mjs | ✅ |
| `prepublishOnly` | `npm run docs:stats:check && npm run docs:ref:check && npm run build` | (zincirleme) | ✅ |

**Ölü script entry yok** — tüm package.json script'leri geçerli komutlara veya mevcutçalıştırılabilir dosyalara işaret ediyor.

### 2b. CI Workflow Referansları

`.github/workflows/` içinde scripts/ dosyalarına doğrudan referans:

| Workflow | Referans |
|----------|---------|
| `secret-scan.yml:21` | `node scripts/security/secret-baseline.mjs` |
| `ci.yml` (test-docs-scripts) | `npx vitest run tests/scripts/` — scripts'leri dolaylı test eder |

---

## 3. Referansız (Potansiyel Ölü) Script Dosyaları

Package.json scripts bölümünden **VE** CI workflow'larından referans edilmeyen scriptler:

### 3a. Tek Seferlik (Tamamlandı — Silinebilir)

| Dosya | Kanıt |
|-------|-------|
| `archive-decisions-md.mjs` | Sprint 143 tek seferlik arşivleme, migration tamamlandı |
| `migrate-brain-v2.mjs` | Sprint 166 tek seferlik Memory V2 migrasyonu |
| `sprint-166-memory-backfill.mjs` | Sprint 166 backfill, idempotent ama amaca ulaştı |
| `sprint-167-memory-backfill.mjs` | Sprint 167 backfill, aynı durum |
| `close-debt-170-001-fix.ts` | Sprint 170 tek seferlik debt kapatma |
| `npm-publish-dry-final.sh` | Sprint 150 tek seferlik GA provası |
| `npm-publish-dry.sh` | Sprint 149 tek seferlik dry-run |

### 3b. Manuel Araçlar (Referanssız ama Kullanışlı)

| Dosya | Kullanım Bağlamı |
|-------|-----------------|
| `bump-version.sh` | Manuel versiyon yükseltme |
| `changelog.sh` | Manuel CHANGELOG üretimi |
| `deploy-discord.sh` | Manuel Discord bot deployment |
| `deploy-telegram.sh` | Manuel Telegram bot deployment |
| `cli-smoke-test.sh` | Manuel CLI smoke testi |
| `nervous-tui-smoke.sh` | Manuel nervous TUI testi |
| `public-repo-sync.sh` | Manuel public repo senkronizasyonu |
| `verify-publish.sh` | Manuel yayın doğrulama |
| `doc-consistency-check.mjs` | Manuel numerik tutarlılık denetimi |
| `i18n-parity.mjs` | Manuel TR/EN doku simetri kontrolü |
| `link-checker.mjs` | `lint-links.mjs` ile örtüşüyor (bakınız Bölüm 5) |
| `mcp-nervous-e2e.mjs` | Manuel nervous E2E testi |
| `hub-validate.mjs` | DeckentHub skill doğrulama |
| `doc-review.mjs` | Manuel doküman kategorileme |
| `backfill-relations.mjs` | Manuel memory relations güncelleme |
| `bundle-builtins.mjs` | Sprint sonrası manuel senkronizasyon |
| `directives-stress-simulator.mjs` | **Tehlikeli** — DIRECTIVES.md üzerine yazar |
| `fresh-env-test.sh` | Node 18/20/22 — artık EOL, geçersiz |
| `memory/backfill-stub-entries.mjs` | Manuel bellek güncelleme |
| `memory/export-adr-fs.mjs` | Manuel DB→FS ADR aktarımı |
| `memory/migrate-relations.mjs` | Manuel ilişki migrasyonu |
| `run-e2e-harness.mjs` | Manuel E2E çalıştırıcı |
| `prompt-linter.mjs` | Manuel worker prompt linting |
| `verify-archive-db-parity.mjs` | Manuel arşiv-DB parity kontrolü |
| `agent-prompt-validator.mjs` | Manuel agent prompt doğrulama |

### 3c. `sync-manifest.mjs` — Özel Durum

`sync-manifest.mjs` (`scripts/sync-manifest.mjs:1`) package.json'da referanssız görünse de `src/orchestra/sprint-finalizer.ts`'de `spawnSync` ile sprint RETRO fazında otomatik çalıştırılıyor. Fiilen aktif bir script.

```
.deckent/features-manifest.json:5  "generatedBy": "scripts/sync-manifest.mjs"
```

---

## 4. tsconfig Tutarlılık Denetimi

### 4a. Kök tsconfig.json

**`tsconfig.json:1-26`** — Ana TypeScript konfigürasyonu:

| Ayar | Değer | Değerlendirme |
|------|-------|---------------|
| `target` | ES2022 | Uygun (Node.js >= 24 ile uyumlu) |
| `module` | Node16 | ADR-002 uyumu: ✅ |
| `moduleResolution` | Node16 | ADR-002 uyumu: ✅ |
| `strict` | true | ✅ |
| `noUnusedLocals` | true | Sıkı, derleme zamanı uyarı üretir |
| `noUnusedParameters` | true | Sıkı |
| `noFallthroughCasesInSwitch` | true | ✅ |
| `noUncheckedIndexedAccess` | true | ✅ |
| `include` | `src/**/*.ts` | `tests/` ve `src/dashboard` HARIÇ |
| `exclude` | `node_modules, dist, tests, src/dashboard` | ✅ — dashboard ayrı tsconfig |

**Önemli:** `tests/` tsconfig'den dışlanmış; test dosyaları tsc kontrol dışında. Vitest bu dosyaları kendi esbuild pipeline'ıyla işliyor.

### 4b. Dashboard tsconfig'leri

`src/dashboard/tsconfig.json:1-24` — Dashboard React konfigürasyonu:

| Ayar | Değer | Değerlendirme |
|------|-------|---------------|
| `module` | ESNext | Vite bundler için doğru |
| `moduleResolution` | bundler | Vite için doğru (Node16 değil) |
| `jsx` | react-jsx | ✅ |
| `noEmit` | true | Sadece tip denetimi |
| `paths/@/*` | `./src/*` | `@` alias tanımı |

`src/dashboard/tsconfig.node.json:1-9` — Vite config için:
- `module: NodeNext`, `composite: true` — Vite araç zinciri için ayrı config
- Yalnızca `vite.config.ts`'yi kapsar

**`lint` script (`package.json:28`)** hem kök hem dashboard'u kontrol ediyor:  
`tsc --noEmit && tsc --noEmit -p src/dashboard` ✅

---

## 5. vitest Konfigürasyon Denetimi

### 5a. Ana vitest.config.ts

**`vitest.config.ts:1-24`:**
- `include: ['tests/**/*.test.ts']` — tüm TS test dosyaları
- `exclude: ['tests/dashboard/**', 'node_modules']` — dashboard ayrı
- `coverage.include: ['src/**/*.ts']` — dashboard hariç
- `testTimeout: 10000` — 10 sn

### 5b. vitest.dashboard.config.ts

**`vitest.dashboard.config.ts:1-21`:**
- `environment: 'happy-dom'` — DOM simülasyonu
- `include: ['tests/dashboard/**/*.test.tsx', 'tests/dashboard/**/*.test.ts']`
- `esbuild.jsx: 'automatic'` — JSX transform
- React alias'lar: `node_modules/react` ve `node_modules/react-dom`

### 5c. src/dashboard/vitest.config.ts — DUPLİKE BULGUSU

**`src/dashboard/vitest.config.ts:1-16`** kök-level `vitest.dashboard.config.ts` ile örtüşüyor:

```
# vitest.dashboard.config.ts (aktif, package.json'da referanslı)
include: ['tests/dashboard/**/*.test.tsx', 'tests/dashboard/**/*.test.ts']

# src/dashboard/vitest.config.ts (referanssız)
include: ['tests/dashboard/**/*.test.{ts,tsx}']
root: '../..'  ← projenin kök dizini
```

`src/dashboard/vitest.config.ts` ne `npm run test:dashboard`'dan ne de CI'dan referans ediliyor. `vitest.dashboard.config.ts` kök-level aktif versiyon. **`src/dashboard/vitest.config.ts` ölü config.**

**Kanıt:** `package.json:24` → `vitest run --config vitest.dashboard.config.ts` (kök seviye)

---

## 6. Kritik Bulgular

### Bulgu 1 — `postbuild` hook: `npm run build` dashboard'u da build ediyor

**`package.json:27`:** `"postbuild": "npm run build:dashboard"`

npm lifecycle semantiğine göre `postbuild` yalnızca `build` script'i sonrası otomatik tetiklenir, `build:all` veya `build:dashboard` sonrası tetiklenmez.

**Sonuç:**
- `npm run build` → tsc + copy-assets + **postbuild → build:dashboard** (dashboard build dahil)
- `npm run build:all` → tsc + copy-assets + build:dashboard (postbuild tetiklenmez)

**Dökümanlardaki hata (`CLAUDE.md:~Build satırı`):** `"Build: npm run build (tsc + copy-assets)"` eksik. Gerçek davranış: `(tsc + copy-assets + dashboard build)`.

### Bulgu 2 — `validate-publish.ts` vs `validate-publish.mjs`: Duplike

**`scripts/validate-publish.ts:1`** — Sprint 149 öncesi eski versiyon (7 adım pipeline)  
**`scripts/validate-publish.mjs:1`** — Sprint 180 yeni versiyon (6 hazırlık kapısı), package.json'da aktif

İki dosya bağımsız olarak evrilmiş. `.ts` versiyonu `scripts/pack-test.ts`'yi import ediyor (`validate-publish.ts:26`). `.mjs` versiyonu bağımsız. Her ikisi de testlerde kullanılıyor:
- `tests/scripts/validate-publish.test.ts` — eski `.ts` versiyonunu test ediyor
- `tests/scripts/validate-publish-readiness.test.ts` — yeni `.mjs` sürümünü test ediyor

**Risk:** `validate-publish.test.ts` artık aktif olmayan scripti test ediyor. Test coverage yanıltıcı.

### Bulgu 3 — `directives-stress-simulator.mjs`: Tehlikeli Referanssız Script

**`scripts/directives-stress-simulator.mjs:1`** açıkça `DIRECTIVES.md`'yi silip üzerine yazar. Sprint-stres testi için tasarlanmış. Herhangi bir koruma yokken canlı sprint sırasında yanlışlıkla çalıştırılırsa veri kaybına yol açar.

### Bulgu 4 — `fresh-env-test.sh`: Artık Geçersiz Node Versiyonları

**`scripts/fresh-env-test.sh:1`** Node 18/20/22'yi test ediyor. `ci.yml:47-52` yorumuna göre bu versiyonların tümü EOL (18: Nis 2025, 20: Mar 2026, 22: May 2026). Betik güncelliğini yitirmiş.

### Bulgu 5 — `link-checker.mjs` vs `lint-links.mjs`: Fonksiyon Örtüşmesi

- **`scripts/link-checker.mjs`** (8.7 KB): Markdown iç link doğrulama
- **`scripts/lint-links.mjs`** (16.6 KB): Markdown dead-link gate, `package.json:lint:link`'te aktif

Her ikisi de Markdown link doğruluğunu kontrol ediyor. `link-checker.mjs` package.json'da referanssız ve `lint-links.mjs`'nin daha kapsamlı sürümüyle işlev örtüşüyor.

---

## 7. tsconfig.json `tests/` Dışlama Notu

**`tsconfig.json:25`:** `"exclude": ["node_modules", "dist", "tests", "src/dashboard"]`

`tests/` derleme kapsamı dışında. Bu tasarım gereği: vitest test dosyalarını kendi esbuild pipeline'ıyla çalıştırıyor. Ancak test dosyalarındaki TypeScript hataları `npm run lint` (tsc --noEmit) ile **yakalanmıyor** — yalnızca vitest çalışma zamanında veya IDE'de görünüyor.

`ci.yml` `lint` adımında dashboard deps kuruluyor (`npm ci --prefix src/dashboard --ignore-scripts`) ama test-spesifik TypeScript tip kontrolü için ayrı bir adım yok.

---

## Özet

| Alan | Bulgu Sayısı | Kritik | Orta | Düşük |
|------|-------------|--------|------|-------|
| scripts/ envanteri | 53 script | — | — | — |
| package.json eşleme | 20 npm script | 0 ölü | — | — |
| CI referansları | 2 doğrudan | — | — | — |
| Duplike script | 1 (validate-publish) | — | 1 | — |
| Tehlikeli script | 1 (directives-stress-simulator) | 1 | — | — |
| Ölü/geçersiz script | 7 tek seferlik | — | — | 7 |
| Fonksiyon örtüşmesi | link-checker + lint-links | — | — | 1 |
| postbuild dokümantasyon hatası | 1 | — | 1 | — |
| Ölü vitest config | 1 (src/dashboard/vitest.config.ts) | — | — | 1 |

**Toplu:** 53 scripts dosyasının 9'u package.json'da aktif, 1'i CI'da (secret-baseline.mjs), 1'i sprint-finalizer'da (sync-manifest.mjs) kullanılıyor. 42 dosya ya manuel araç ya tamamlanmış tek seferlik görev ya da referanssız eski sürüm.

---

## Sprint 189 Follow-up

| Öncelik | Eylem | Hedef Dosya |
|---------|-------|-------------|
| Yüksek | `directives-stress-simulator.mjs`'e koruma/uyarı ekle veya stres test dizinine taşı | `scripts/directives-stress-simulator.mjs` |
| Orta | `CLAUDE.md` / `DECKENT.md` build açıklamasını `postbuild` içerecek şekilde güncelle | `CLAUDE.md`, `DECKENT.md` |
| Orta | `validate-publish.ts` + `pack-test.ts`'i arşivle veya kaldır; testleri `.mjs` versiyonuna yönlendir | `scripts/validate-publish.ts`, `scripts/pack-test.ts`, `tests/scripts/validate-publish.test.ts` |
| Orta | `fresh-env-test.sh`'i Node 24/26 için güncelle veya kaldır | `scripts/fresh-env-test.sh` |
| Düşük | `src/dashboard/vitest.config.ts` ölü config dosyasını kaldır | `src/dashboard/vitest.config.ts` |
| Düşük | `link-checker.mjs`'i kaldır veya `lint-links.mjs` ile birleştir | `scripts/link-checker.mjs` |
| Düşük | 7 tamamlanmış tek seferlik scripti `scripts/archive/` altına taşı | Listelenen 7 dosya |
| Düşük | `tests/` dizinini `tsconfig.json`'a `checkJs` ya da ayrı tsconfig ile dahil et | `tsconfig.json` |
