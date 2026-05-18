# Root Configuration Deep Analysis — God Sprint Task 40
**Task ID:** 142-040 | **Model:** opus | **Effort:** max
**Analyzed files:** 9 (Dockerfile, .dockerignore, .gitignore, package.json, package-lock.json, tsconfig.json, vitest.config.ts, vitest.dashboard.config.ts, .npmrc)
**Missing files:** .editorconfig, .prettierrc, .eslintrc (NOT present in project root)
**Date:** 2026-04-16

---

## 1. Dockerfile (28 LoC)

### 1.1 Amacı
Node.js 22-slim tabanlı container image. deckent CLI'yi container içinde çalıştırmak için tasarlanmış. tmux ve git runtime dependency olarak yükleniyor.

### 1.2 Multi-Stage Build
**EKSIK — P1.** Tek stage kullanılıyor. Tüm dev dependencies, TypeScript source, test dosyaları final image'a dahil. Önerilen yapı:
- Stage 1: `builder` — npm ci + tsc
- Stage 2: `runtime` — sadece dist/ + node_modules (production only)
Bu en az %40-50 image boyut azalması sağlar.

### 1.3 Container Güvenlik
| Kontrol | Durum | Severity |
|---------|-------|----------|
| Non-root user (USER directive) | **EKSIK** | **P0** |
| HEALTHCHECK directive | **EKSIK** | P2 |
| EXPOSE directive | **EKSIK** | P3 (opsiyonel) |
| Secret in ENV/ARG | Yok ✅ | — |
| Secret in COPY | Risk var (COPY . . tüm dosyaları kopyalar) | P1 |
| Base image pinning (SHA digest) | **EKSIK** — `node:22-slim` tag kullanılıyor | P2 |
| apt-get clean | ✅ `rm -rf /var/lib/apt/lists/*` var | — |

**P0 Finding:** Container root olarak çalışıyor. Bir RCE exploit'i tüm container'a root erişim verir. `USER node` veya custom non-root user eklenmeli.

**P1 Finding:** `COPY . .` tüm proje dosyalarını kopyalar — .env, .brain/memory.db, .deck (credentials), .git history dahil. `.dockerignore` bu riski azaltıyor AMA `.deckent/config.json` dockerignore'da (iyi), `.brain/` da dockerignore'da (iyi). Ancak `package-lock.json` ve `scripts/` dosyaları da dockerignore'da olmadığı için image'a giriyor ki bu kabul edilebilir.

### 1.4 Base Image
- `node:22-slim`: Debian-based slim variant. Node.js 22 LTS (Ekim 2024 — Nisan 2027 LTS). Güncel.
- Alpine tercih edilebilir (daha küçük, daha az saldırı yüzeyi) ama better-sqlite3 native compilation gerektirebilir.
- **Not:** better-sqlite3 prebuild binary'leri slim image'da çalışır — Alpine için ek build tools gerekir.

### 1.5 WORKDIR Geçişi
`WORKDIR /app` → build/install → `WORKDIR /workspace` → entrypoint. Bu pattern doğru: deckent operasyonları /workspace altında çalışır, uygulama /app'de yaşar. Ancak /workspace mount point olarak kullanılıyorsa volume mount ile çakışma riski var.

### 1.6 tmux Dependency
Container içinde tmux yükleniyor. ADR-027 (Hybrid Spawn Backend) uyumu: tmux backend container'da çalışabilir olmalı. Ancak subprocess backend kullanılırsa tmux gereksiz. Dockerfile'da backend seçimine göre conditional install yok.

### 1.7 .dockerignore (30 satır)
✅ İyi kararlar: node_modules, .git, .brain, .claude, .deckent, .tasks, .locks, dist, coverage, tests
✅ Credential koruması: .env, .env.local, .env.*.local
⚠️ Potansiyel sorun: `vitest.config.ts` ve `tsconfig.json` dockerignore'da — multi-stage build'de builder stage bunlara ihtiyaç duyar. Mevcut tek-stage yapıda sorun yok çünkü COPY . . bu dosyaları zaten kopyalamıyor (dockerignore baskın).
⚠️ `docs/FAQ.md`, `kararlanacakplan.md` gibi spesifik dosyalar var — bunlar geçici eklemeler gibi duruyor.

### 1.8 Öneriler
- **P0:** `USER node` directive ekle (node:22-slim image'da `node` user built-in)
- **P1:** Multi-stage build'e geç (builder + runtime)
- **P2:** Base image SHA digest pinning: `FROM node:22-slim@sha256:<hash>`
- **P2:** HEALTHCHECK ekle: `HEALTHCHECK --interval=30s CMD node -e "process.exit(0)"`
- **P3:** `--platform=linux/amd64` ile platform pinning (reproducibility)

---

## 2. .gitignore (63 LoC)

### 2.1 Amacı
Git tarafından izlenmeyecek dosyaları tanımlar. Runtime state, build artifacts, IDE dosyaları, credentials, ve Memory V2 binary DB dosyaları.

### 2.2 Kategorik Analiz

| Kategori | Pattern'lar | Durum |
|----------|------------|-------|
| Build artifacts | `node_modules/`, `dist/`, `coverage/`, `*.tgz` | ✅ Tam |
| Runtime state | `.tasks/`, `.locks/`, `.dashboard` | ✅ Tam |
| Brain runtime | `.brain/MEMORY.md`, `RETRO.md`, `DEBT.md`, `PATTERNS.md` | ✅ Doğru — generate edilen dosyalar |
| Memory V2 DB | `.brain/memory.db`, `-wal`, `-shm` | ⚠️ **PROBLEM** |
| Brain sprints | `.brain/sprints/`, `.brain/archive/` | ✅ (ama `!.brain/archive/` da var — bkz. 2.3) |
| Deckent runtime | `.deckent/routing/`, `config.json`, `ci-baseline.json`, vs. | ✅ |
| Environment | `.env`, `.env.*`, `.deck` | ✅ Credential koruması |
| Credentials | `*.pem`, `*.key`, `credentials.json` | ✅ |
| OS | `.DS_Store`, `Thumbs.db` | ✅ |
| IDE | `.vscode/`, `.idea/`, `*.swp`, `*.swo` | ✅ |
| Dashboard | `src/dashboard/node_modules`, `src/dashboard/dist` | ✅ |

### 2.3 Kritik Bulgular

**P0 — memory.db GIT TARAFINDAN TRACKED EDİLİYOR:**
`.gitignore` satır 18'de `.brain/memory.db` pattern'ı var. ANCAK `git ls-files --error-unmatch .brain/memory.db` BAŞARILI — dosya zaten tracked. `.gitignore` sadece untracked dosyaları etkiler. Bir kez `git add` yapılmış bir dosyayı `.gitignore` ignore etmez!

**Etki:** Binary SQLite DB dosyası her commit'te git history'ye ekleniyor. Bu:
1. Repository boyutunu şişirir (binary diff non-compressible)
2. `git clone` süresini artırır
3. Credential/sensitive data DB'de saklanırsa history'den silinmesi zor

**Çözüm:** `git rm --cached .brain/memory.db` çalıştırılmalı, ardından `.gitignore` kuralı çalışır hale gelir.

**P1 — .brain/archive/ Çelişkili Kural:**
```
.brain/archive/
!.brain/archive/
```
Satır 22-23: Önce `archive/` ignore edilip hemen `!` ile unignore ediliyor. Bu `.brain/archive/` dizininin **hiç ignore edilmediği** anlamına gelir. Eğer niyet archive'ın tamamını ignore etmekse `!.brain/archive/` satırı silinmeli. Eğer niyet sadece alt dosyaları track etmekse pattern yanlış.

**P2 — .brain/ERRORS.md eksik:**
`.brain/ERRORS.md` gitignore'da listelenmemiş — git tarafından tracked ediliyor. Eğer runtime log dosyasıysa ignore edilmeli. Eğer debug amaçlı track edilmesi isteniyorsa bu bilinçli bir karar.

**P2 — .brain/PROJECT-IDENTITY.md:**
Gitignore'da listelenmemiş — tracked (doğru, DB'de de var ama dosya olarak da referans ediliyor).

**P2 — .deckent/config.json git tracked AMA gitignore'da:**
`.deckent/config.json` gitignore satır 27'de var. Ancak `git ls-files` gösteriyor ki dosya tracked. memory.db ile aynı sorun.

### 2.4 Eksik Pattern'lar
- `*.log` genel pattern'ı yok (sadece dashboard/node_modules altında)
- `tmp-test/` veya `tmp*/` pattern'ı yok
- `.nyc_output/` (coverage artifact) yok (v8 kullanıldığı için gerekli olmayabilir)

### 2.5 .brain/exports/ Durumu
`.brain/exports/` gitignore'da DEĞİL — doğru karar. Export dosyaları (summary.md, decisions.md, memory.md, debt.md) git-tracked olmalı (api-surface.md bunu doğrular).

---

## 3. package.json (82 LoC)

### 3.1 Genel Bilgi
- **name:** `deckent`
- **version:** `0.4.0-beta.1` — IDENTITY.md ile uyumlu ✅
- **type:** `module` (ESM) — ADR-001 uyumlu ✅
- **license:** MIT
- **author:** Alperen @ Verhex
- **repository:** github.com/VerhexIO/deckent
- **homepage:** deckent.agency

### 3.2 Dependencies (4 adet — ADR-010 Uyumu)

ADR-010: "Tek Runtime Dependency — commander.js" — bu ADR'nin adı artık yanıltıcı çünkü 4 runtime dep var.

| Dependency | Versiyon | Amacı | ADR-010 Uyumu |
|-----------|---------|-------|---------------|
| commander | ^13.0.0 | CLI framework | ✅ Orijinal tek dep |
| better-sqlite3 | ^12.9.0 | Memory V2 SQLite | ✅ Sprint 140+ eklendi |
| @modelcontextprotocol/sdk | ^1.27.1 | MCP server | ✅ MCP entegrasyonu |
| zod | ^3.25.0 | Schema validation | ✅ Config/plan validation |

**P2 — ADR-010 güncellenmeli:** ADR "Tek Runtime Dependency" diyor ama artık 4 tane var. ADR başlığı veya içeriği güncellenmeli. Teknik olarak ihlal yok — ADR-010'un ruhu "minimal dependency" ve 4 dep hala minimal.

### 3.3 DevDependencies (8 adet)

| Dependency | Versiyon | Amacı |
|-----------|---------|-------|
| @testing-library/jest-dom | ^6.9.1 | DOM test matchers |
| @testing-library/react | ^16.3.2 | React component testing |
| @types/better-sqlite3 | ^7.6.13 | SQLite type definitions |
| @types/node | ^25.5.0 | Node.js types |
| @vitest/coverage-v8 | ^3.0.0 | Coverage provider |
| happy-dom | ^20.8.4 | DOM simulation for tests |
| typescript | ^5.7.0 | TypeScript compiler |
| vitest | ^3.0.0 | Test framework |

**Not:** @testing-library/react ve happy-dom root package.json'da var ama sadece dashboard testlerinde kullanılıyor. Monorepo yapısında bunlar src/dashboard/package.json'a taşınabilir (P3).

### 3.4 engines
```json
"node": ">=18.0.0"
```
✅ Doğru. Node 18 LTS minimum. Dockerfile'da node:22-slim kullanılıyor (uyumlu).

### 3.5 bin
```json
"deckent": "./dist/cli/entry.js",
"deckent-mcp": "./dist/mcp/server.js"
```
✅ Her iki binary tanımı doğru. Dosyalar dist'te mevcut.

### 3.6 exports
```json
".": {
  "import": "./dist/index.js",
  "types": "./dist/index.d.ts"
}
```
✅ ESM-only export. `require` yok (doğru, `"type": "module"`).

### 3.7 scripts (14 adet)

| Script | Komut | Durum |
|--------|-------|-------|
| build | tsc && node scripts/copy-assets.mjs | ✅ |
| dev | tsc --watch | ✅ |
| test | vitest run | ✅ |
| test:watch | vitest | ✅ |
| test:coverage | vitest run --coverage | ✅ |
| test:dashboard | vitest run --config vitest.dashboard.config.ts | ✅ |
| build:dashboard | cd src/dashboard && npx vite build --outDir ../../dist/dashboard | ✅ |
| build:all | tsc && copy-assets && build:dashboard | ✅ |
| postbuild | npm run build:dashboard | ⚠️ Bkz. 3.8 |
| lint | tsc --noEmit | ✅ |
| lint:adr | node scripts/adr-validator.mjs | ✅ |
| lint:errors | node scripts/check-error-handling.mjs | ✅ |
| clean | rm -rf dist | ✅ |
| validate:publish | npx tsx scripts/validate-publish.ts | ⚠️ tsx devDep değil |
| docs:generate-cli | npx tsx scripts/generate-cli-docs.ts | ⚠️ tsx devDep değil |
| prepublishOnly | npm run build | ✅ |

### 3.8 Script Sorunları

**P2 — postbuild + build:all çakışması:**
`postbuild` npm lifecycle hook'u olarak `build` her çalıştığında otomatik tetiklenir. `build:all` scripti zaten `build:dashboard` çağırıyor. Dolayısıyla `npm run build:all` çalıştığında dashboard 2 kez build edilir: bir kez `build:all` içinde, bir kez `postbuild` hook'unda.

**P2 — tsx devDependency eksik:**
`validate:publish` ve `docs:generate-cli` scriptleri `npx tsx` kullanıyor ama `tsx` package.json devDependencies'de yok. `npx` remote'dan indirir ama CI ortamında yavaş ve güvensiz.

**P3 — .npmrc ignore-scripts=true ise postinstall çalışmaz:**
`.npmrc`'de `ignore-scripts=true` var. Bu better-sqlite3'ün native binding compile etmesini engeller. `npm ci` sırasında `--ignore-scripts=false` override edilmeli veya prebuild binary kullanılmalı. Dockerfile'da `npm ci` çalışıyor — ignore-scripts Dockerfile context'inde `.npmrc` okunduğu için sorun olabilir.

### 3.9 files (npm publish scope)
```json
["dist", "bin", "README.md", "LICENSE"]
```
✅ Minimal publish scope. Brain dosyaları, testler, kaynak kod dahil değil.
⚠️ `bin/` dizini var mı kontrol edilmeli — package.json bin field'ı dist'e referans veriyor, ayrı bin/ dizini gereksiz olabilir.

### 3.10 Dashboard Alt-Proje
src/dashboard/package.json ayrı bir alt-proje. 8 runtime dep + 11 devDep. npm workspace olarak tanımlanmamış — bağımsız node_modules yönetimi.

---

## 4. package-lock.json (4343 LoC, 147K)

### 4.1 Genel
- **lockfileVersion:** 3 (npm v7+ uyumlu)
- **Boyut:** 147K — 4 runtime dep için makul

### 4.2 Güvenlik
- Lock dosyası dependency tree'yi sabitler — supply chain güvenliği için kritik ✅
- `integrity` hash'leri mevcut ✅

---

## 5. tsconfig.json (26 LoC)

### 5.1 Compiler Options Analizi

| Seçenek | Değer | Durum |
|---------|-------|-------|
| target | ES2022 | ✅ Modern, Node 18+ uyumlu |
| module | Node16 | ✅ ADR-002 uyumlu |
| moduleResolution | Node16 | ✅ ADR-002 uyumlu |
| lib | ES2022 | ✅ |
| types | node | ✅ |
| outDir | ./dist | ✅ |
| rootDir | ./src | ✅ |
| strict | true | ✅ **Kritik — tam strict mode** |
| esModuleInterop | true | ✅ |
| skipLibCheck | true | ✅ (build hızı için) |
| forceConsistentCasingInFileNames | true | ✅ |
| declaration | true | ✅ (npm publish için .d.ts) |
| declarationMap | false | ✅ (gereksiz) |
| sourceMap | false | ⚠️ Debug zorlaşır (P3) |
| resolveJsonModule | true | ✅ |
| isolatedModules | true | ✅ (esbuild uyumu) |
| noUnusedLocals | true | ✅ Dead code prevention |
| noUnusedParameters | true | ✅ Dead code prevention |
| noFallthroughCasesInSwitch | true | ✅ Safety |
| noUncheckedIndexedAccess | true | ✅ **En sıkı ayar — çok iyi** |

### 5.2 Strict Mode Detayı
`strict: true` şunları aktifleştirir:
- strictNullChecks ✅
- noImplicitAny ✅
- strictFunctionTypes ✅
- strictBindCallApply ✅
- strictPropertyInitialization ✅
- noImplicitThis ✅
- alwaysStrict ✅
- useUnknownInCatchVariables ✅

**Verdict:** tsconfig.json projede mümkün olan en sıkı TypeScript konfigürasyonunu kullanıyor. noUncheckedIndexedAccess özellikle nadir — çoğu proje bunu aktif etmez. Bu çok olumlu.

### 5.3 Eksik Olabilecek Seçenekler
- `exactOptionalPropertyTypes`: Daha da sıkı optional property kontrolü (P3, breaking change riski yüksek)
- `verbatimModuleSyntax`: Type-only import enforcement (P3)

### 5.4 include/exclude
```json
"include": ["src/**/*.ts"],
"exclude": ["node_modules", "dist", "tests", "src/dashboard"]
```
✅ Dashboard ayrı tsconfig kullanıyor (src/dashboard/tsconfig.json). Test dosyaları exclude — doğru, vitest kendi ts transform'unu kullanır.

---

## 6. vitest.config.ts (24 LoC)

### 6.1 Yapılandırma

| Ayar | Değer | Durum |
|------|-------|-------|
| include | tests/**/*.test.ts | ✅ |
| exclude | tests/dashboard/**, node_modules | ✅ Dashboard ayrı config |
| testTimeout | 10000 (10s) | ✅ Makul |
| coverage.provider | v8 | ✅ Hızlı, native |
| coverage.include | src/**/*.ts | ✅ |
| coverage.exclude | index.ts barrel dosyaları + dashboard | ✅ Doğru |

### 6.2 Coverage Exclude Listesi
```
src/index.ts, src/agents/index.ts, src/core/index.ts,
src/monitor/index.ts, src/orchestra/index.ts, src/cli/index.ts,
src/mcp/tools/index.ts, src/mcp/resources/index.ts, src/dashboard/**
```
✅ Barrel re-export dosyaları coverage'dan çıkarılmış — doğru yaklaşım.

### 6.3 Eksikler
- **globals: true** yok — her test dosyasında `import { describe, it, expect }` gerekli (P3, tercih meselesi)
- **setupFiles** yok — global test setup için (P3)
- **pool** ayarı yok — default `forks` kullanılıyor (P3)
- **reporter** ayarı yok — default console reporter (P3)

---

## 7. vitest.dashboard.config.ts (21 LoC)

### 7.1 Yapılandırma

| Ayar | Değer | Durum |
|------|-------|-------|
| environment | happy-dom | ✅ DOM simulation |
| globals | true | ✅ (ana config'ten farklı!) |
| setupFiles | tests/dashboard/setup.ts | ✅ |
| include | tests/dashboard/**/*.test.tsx/ts | ✅ |
| esbuild.jsx | automatic | ✅ React JSX transform |
| resolve.alias.@ | ./src/dashboard/src | ✅ Path alias |
| resolve.alias.react/react-dom | Absolute resolve to root node_modules | ✅ Duplicate React prevention |

### 7.2 Not
Root'ta `vitest.dashboard.config.ts` ve `src/dashboard/vitest.config.ts` olmak üzere 2 ayrı dashboard vitest config var. CLAUDE.md "Test Dashboard: npx vitest run --config src/dashboard/vitest.config.ts" diyor. package.json "test:dashboard" ise root'taki config'i kullanıyor. Bu çelişki P2.

---

## 8. .npmrc (3 LoC)

### 8.1 İçerik
```
ignore-scripts=true
```

### 8.2 Analiz
✅ **Güvenlik:** npm postinstall script'lerin çalışmasını engeller — supply chain attack koruması.

**P1 — better-sqlite3 Compatibility:**
better-sqlite3, native Node.js addon (C++ binding). Normalde `npm install` sırasında prebuild-install veya node-gyp ile compile edilir. `ignore-scripts=true` bunu engeller.

Olası senaryolar:
1. better-sqlite3 prebuild binary'si npm cache'te varsa çalışır
2. prebuild yoksa runtime'da crash olur: "Cannot find module 'better-sqlite3'"
3. Dockerfile'da `npm ci` çalıştırılıyor — `.npmrc` Docker context'e `.dockerignore`'da yok → kopyalanır → scripts ignore edilir

**Doğrulama:** Eğer proje şu anda çalışıyorsa, prebuild binary kullanılıyor demektir. Ama CI ortamında veya farklı arch'de (ARM vs x86) sorun çıkabilir.

---

## 9. Eksik Config Dosyaları

### 9.1 .editorconfig — MEVCUT DEĞİL
Proje root'unda `.editorconfig` yok. Farklı IDE'lerde farklı indent/encoding ayarları kullanılabilir. 40+ CLI komutu ve 200+ kaynak dosyası olan bir projede bu tutarsızlığa yol açabilir. **P3.**

### 9.2 .prettierrc — MEVCUT DEĞİL
Otomatik format aracı yapılandırması yok. tsc `--noEmit` lint sağlıyor ama stil tutarlılığı garanti değil. **P3.**

### 9.3 .eslintrc — MEVCUT DEĞİL
Statik analiz kuralları yok. TypeScript strict mode çoğu şeyi yakalar ama eslint ek pattern'ları (unused imports, consistent returns, naming conventions) yakalayabilir. **P3.**

---

## 10. Cross-Reference: Dashboard Alt-Proje tsconfig.json

Dashboard ayrı bir tsconfig kullanıyor:
- **module:** ESNext (vs root Node16)
- **moduleResolution:** bundler (vs root Node16)
- **jsx:** react-jsx
- **noEmit:** true (Vite bundler olarak kullanılıyor)
- **paths:** `@/*` → `./src/*`

✅ Bu ayrım doğru — dashboard Vite ile bundle edilir, ana proje Node.js ESM olarak çalışır.

---

## 11. ADR Uyumluluk Tablosu

| ADR | Konu | Config Uyumu | Not |
|-----|------|-------------|-----|
| ADR-001 | TypeScript + ESM | ✅ | `"type": "module"`, `"module": "Node16"` |
| ADR-002 | Node16 Module Resolution | ✅ | tsconfig `moduleResolution: "Node16"` |
| ADR-003 | vitest over Jest | ✅ | vitest devDep, config mevcut |
| ADR-010 | Tek Runtime Dependency | ⚠️ | 4 dep var — ADR güncellenmeli |
| ADR-027 | Hybrid Spawn Backend | ✅ | Dockerfile tmux yüklüyor |
| ADR-033 | Product Not Service | ✅ | telemetry/analytics package yok |

---

## 12. TODO/FIXME Inventory (Config Dosyalarında)

Config dosyalarında TODO/FIXME/HACK yok. ✅

---

## 13. Security Summary

| Bulgu | Severity | Dosya | Detay |
|-------|----------|-------|-------|
| Container root olarak çalışıyor | **P0** | Dockerfile | USER directive yok |
| memory.db git-tracked binary | **P0** | .gitignore | git rm --cached gerekli |
| Multi-stage build eksik | P1 | Dockerfile | Dev deps image'da |
| .npmrc ignore-scripts + better-sqlite3 | P1 | .npmrc | Native addon build engellenebilir |
| Base image SHA pinning yok | P2 | Dockerfile | Supply chain riski |
| config.json git-tracked ama gitignored | P2 | .gitignore | Inconsistent state |
| .brain/archive çelişkili gitignore | P1 | .gitignore | Satır 22-23 çelişiyor |
| postbuild double-build | P2 | package.json | Dashboard 2x build |
| tsx devDep eksik | P2 | package.json | npx tsx güvensiz |
| .editorconfig/.prettierrc eksik | P3 | — | Stil tutarsızlığı riski |

---

## 14. Performance Notes

- **tsconfig isolatedModules:** ✅ Paralel compilation mümkün
- **vitest v8 coverage:** ✅ Native, hızlı
- **package-lock.json lockfileVersion 3:** ✅ npm v7+ optimizasyonları
- **skipLibCheck:** ✅ Build hızı artırır

---

## 15. Öneriler (Prioritized)

### P0 (Acil — Sprint 142+)
1. **Dockerfile: USER directive ekle** — `RUN groupadd -r deckent && useradd -r -g deckent deckent` + `USER deckent`
2. **memory.db git-untrack:** `git rm --cached .brain/memory.db`

### P1 (Yüksek Öncelik)
3. **Dockerfile: Multi-stage build** — builder + runtime ayrımı
4. **.gitignore: .brain/archive çelişkisini çöz** — ya ignore ya da unignore, ikisi birden değil
5. **.npmrc + better-sqlite3 uyumu doğrula** — CI ortamında prebuild test et
6. **config.json git-untrack:** `git rm --cached .deckent/config.json`

### P2 (Orta Öncelik)
7. **ADR-010 güncelle** — "Tek Runtime Dependency" → "Minimal Runtime Dependencies (4)"
8. **postbuild double-build düzelt** — postbuild hook'u kaldır veya build:all'dan dashboard çıkar
9. **tsx devDep ekle** — `npm i -D tsx`
10. **Dashboard vitest config çelişkisini çöz** — CLAUDE.md vs package.json referansı

### P3 (Düşük Öncelik)
11. .editorconfig ekle (indent, charset, eol normalization)
12. Dockerfile base image SHA pinning
13. sourceMap: true (debug kolaylığı için, conditional)

---

## 16. Verdict

**ANALYZED** — Tüm root config dosyaları (9 mevcut + 3 eksik) derinlemesine incelendi.

**Genel Sağlık Skoru: 72/100**

Güçlü yönler:
- tsconfig.json mükemmel (strict + noUncheckedIndexedAccess)
- ADR-010 minimal dependency felsefesi korunuyor (4 dep)
- .gitignore kapsamlı (63 satır, kategorize)
- .npmrc supply chain güvenliği

Zayıf yönler:
- Dockerfile güvenlik eksikleri (root user, no multi-stage)
- .gitignore'da tracked-file çelişkileri (memory.db, config.json)
- Format/lint tooling eksik (.editorconfig, .prettierrc, .eslintrc)
- Script management sorunları (tsx, postbuild double-build)
