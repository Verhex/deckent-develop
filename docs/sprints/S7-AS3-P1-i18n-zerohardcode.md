# DIRECTIVES — Sprint S7 / AS-3·P1: Zero-Hardcode + i18n Catalog Infra (every-nation foundation)

## Goal: AS-3 Track A'nın temeli (MASTER-PLAN §4E Faz 1). Tek `messages.ts` (478 satır, sabit `SUPPORTED_LANGS=['en','tr']`) → **per-locale `locales/<xx>.json` katalog + dynamic loader**; `SUPPORTED_LANGS` **diskteki kataloglardan türer** (sabit union kalkar) → herhangi dil eklenebilir ("every-nation"). `lint-i18n-hardcode` guard yeni hardcoded user-facing literal'i CI'da yakalar. Yüksek-trafik CLI/REPL string'leri kataloğa taşınır. **Tam yüzey sweep (dashboard/MCP-desc) Faz 2; add-a-language + Track B live-data Faz 3 (kapsam DIŞI).** **god-level i18n-FIRST, RUN-VERIFY, CI yeşil KORUNUR.**

## Ortak kurallar
- **🟢 RUN-VERIFY:** kanıt çağıran-dosyada; locale-değişimi user-surface → `Smoke:` gerçek-binary. Mock-only = GO_WITH_TECH_DEBT.
- **🔴 HERMETİK:** tmpdir + sandbox HOME, async spawn, `test:ci-sim` yeşil. CI yeşil KORUNUR.
- ESM `.js`. ≤200 LoC/task, YENİ test dosyası, sadece kendi filesWrite'ına yaz.
- **🔴 Davranış-eşdeğer:** mevcut `getMessage(key,lang)` API'si + `{placeholder}` interpolation + en/tr çıktısı **DEĞİŞMEZ** (sadece kaynak messages.ts→catalog); mevcut 31 caller bozulmaz.

---

## Task 1: S7-001 — Per-locale catalog infra + dynamic SUPPORTED_LANGS
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/cli/helpers/messages.ts, src/cli/locales/en.json, src/cli/locales/tr.json, tests/cli/i18n-catalog.test.ts
- Scope: src/cli/helpers/, src/cli/locales/, tests/cli/
### Description
`messages.ts` içindeki ~303 key → `locales/en.json` (canonical) + `locales/tr.json` çıkar; `messages.ts` **dynamic loader**'a dönüşür (catalog'ları okur, lazy + cold-start guard). `SUPPORTED_LANGS` **diskteki `locales/*.json`'dan türetilir** (sabit array YOK). `getMessage(key, lang)` API + `{placeholder}` interpolation + en-fallback **AYNEN korunur** (mevcut 31 caller imzasız geçer). copy-assets build'e `locales/` eklenir (dist'e kopyalansın).
**Kanıt:** `grep -c "locales\|readdir\|JSON.parse\|SUPPORTED_LANGS" src/cli/helpers/messages.ts` → ≥3; `grep -c "'en'\|'tr'\].*as const" src/cli/helpers/messages.ts` → 0 (sabit union kalktı); `npx vitest run tests/cli/i18n-catalog.test.ts` → 4+ pass
**Test:** ≥4 (en/tr katalogdan yüklenir, getMessage API eşdeğer, SUPPORTED_LANGS diskten türer, eksik-key→en fallback, placeholder interp korunur) — hermetik (tmpdir locale fixture)
**Smoke (Tier-1):** `LANG=tr env -u ANTHROPIC_API_KEY node dist/cli/entry.js --help 2>&1 | head` → TR string'ler (catalog'tan yüklenmiş) — kırılma yok.

## Task 2: S7-002 — lint-i18n-hardcode guard (CI enforcement)
- Model: sonnet
- Effort: normal
- Skills: ci-testing, typescript-expert
- Files: scripts/lint-i18n-hardcode.mjs, package.json, tests/scripts/lint-i18n-hardcode.test.ts
- Scope: scripts/, tests/scripts/
### Description
`lint-test-hermeticity.mjs` pattern'inde guard: user-surface dosyalarda (`src/cli/commands/`, `src/cli/repl/`) **hardcoded user-facing string literal** (console.log/error/process.stdout.write içinde düz string, getMessage dışı) tespit → exit 1 + dosya:satır raporu. Allow-list (debug/log-internal). `package.json`'a `lint:i18n` script + `lint` zincirine ekle. i18n-FIRST quality bar'ın **executable** hâli.
**Kanıt:** `grep -c "console\|getMessage\|user-facing\|exit" scripts/lint-i18n-hardcode.mjs` → ≥3; `grep -c "lint:i18n" package.json` → ≥1; `npx vitest run tests/scripts/lint-i18n-hardcode.test.ts` → 4+ pass
**Test:** ≥4 (hardcoded literal→fail+rapor, getMessage→pass, allow-list→pass, temiz dosya→exit 0) — hermetik (tmpdir fixture dosyaları)
**Smoke:** `node scripts/lint-i18n-hardcode.mjs src/cli/commands/ 2>&1 | head` → mevcut ihlalleri raporlar (baseline).

## Task 3: S7-003 — [Tier-1] Yüksek-trafik CLI/REPL string extraction
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/locales/en.json, src/cli/locales/tr.json, src/cli/commands/status.ts, src/cli/commands/doctor.ts, tests/cli/i18n-extraction.test.ts
- Scope: src/cli/locales/, src/cli/commands/, tests/cli/
- Dependencies: S7-001
### Description
En yüksek-trafik 2 komutun (`status`, `doctor`) kullanıcıya görünen hardcoded string'lerini → catalog key + `getMessage` çağrısı (mekanik extraction). en.json/tr.json'a key ekle. Lint guard (S7-002) bu dosyaları temiz bırakır. **Yalnız status.ts + doctor.ts** (paralel-güvenlik; diğer komutlar Faz 2). Caller komut dosyaları.
**Kanıt:** `grep -c "getMessage" src/cli/commands/status.ts src/cli/commands/doctor.ts` → ≥4 (artış); `npx vitest run tests/cli/i18n-extraction.test.ts` → 3+ pass
**Test:** ≥3 (status TR string, doctor TR string, key catalog'ta var, en/tr paralel) — hermetik
**Smoke (Tier-1):** `LANG=tr env -u ANTHROPIC_API_KEY node dist/cli/entry.js doctor 2>&1 | head` → doctor çıktısı TR (catalog'tan) — hardcoded EN değil.

## Task 4: S7-004 — add-a-language scaffold + contribution doc
- Model: sonnet
- Effort: low
- Skills: documentation-writer, typescript-expert
- Files: src/cli/locales/README.md, docs/guide/i18n-contribution.md, tests/docs/i18n-contribution.test.ts
- Scope: src/cli/locales/, docs/, tests/docs/
- Dependencies: S7-001
### Description
"every-nation" contribution path: `locales/README.md` (yeni dil = `<xx>.json` düşür, kod değişmez, en'i kopyala+çevir) + `docs/guide/i18n-contribution.md` (adım-adım + opsiyonel local-Ollama makine-çeviri seed notu, never-calls-home). Test doc-accuracy doğrular (locales/ mekanizması anlatımı koda uyar).
**Kanıt:** `grep -c "locales\|<xx>.json\|SUPPORTED_LANGS\|ollama" src/cli/locales/README.md docs/guide/i18n-contribution.md` → ≥3; `npx vitest run tests/docs/i18n-contribution.test.ts` → 2+ pass
**Test:** ≥2 (README mekanizma koda uyar, contribution guide adımları geçerli) — kod-referanslı
**Smoke:** (Tier-0 docs) unit yeterli.

---

**Beklenen:** 4/4 DONE. Wave-1 (S7-001, S7-002 paralel) → Wave-2 (S7-003, S7-004 → S7-001'e bağlı). i18n altyapısı catalog-tabanlı + dil-agnostik (yeni dil = JSON düşür) + hardcode-guard CI'da. status/doctor TR'ye taşındı (örnek). **Faz 2 (tam yüzey: dashboard/MCP-desc/error/wizard + .codex/.gemini rules sync) + Faz 3 (Track B zero-hardcode live-data) ayrı.** CI yeşil KORUNUR.

İlgili: MASTER-PLAN §4E (AS-3) · W-A · ADR-032 (i18n pattern) · ADR-013/018. Memory: `feedback_god_level_i18n_quality_bar` · `feedback_zero_hardcode_live_data` · `project_deckent_everyone_everywhere` · `project_ci_green_root_causes`.
