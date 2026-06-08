# Task 171-014 — `src/extensions/vscode/**` + `scripts/**` Audit Raporu (Sprint 171)

> **Audit kapsamı:** VS Code uzantı stub'ı (`src/extensions/vscode/`) + `scripts/` dizinindeki 45 betik (41 doğrudan + 3 `memory/` + 1 `security/`). Not: DIRECTIVES "44 betik" diyor; gerçek envanter 45 (`backfill-relations.mjs` fazladan mevcut — bkz. Bulgu 9).
> **Yöntem:** Char-level statik inceleme; `package.json`, CI workflow'ları ve `src/`/`tests/` içindeki çapraz referans aramasıyla ölü betik tespiti; `spawnSync`/`execSync`/`exec` pattern taraması; `scripts/memory/*` idempotency + `DROP/rm` ihlali kontrolü; `scripts/security/secret-baseline.mjs` regex koruma yüzeyinin doğrulaması.
> **Çıktı dili:** Türkçe (kullanıcı reinforced 2026-05-15).

---

## 1. Bulgular (Findings)

### A) `src/extensions/vscode/` (2 dosya)

1. **VS Code uzantısı bir `Sprint 049`'da bitirilecek stub'tır** ama yorum satırı dışında bu durumu açıkça işaretleyen bir runtime uyarısı veya `console.warn` bulunmuyor; üç komut da boş gövdeyle kayıtlı, kullanıcıya geri bildirim verilmiyor (`src/extensions/vscode/extension.ts:62-64`). **Risk:** Kullanıcı paleti açıp `Deckent: Start Sprint` çalıştırınca tıklamanın etkisiz olduğunu fark etmiyor → "kırık özellik" izlenimi.
2. **Workspace Trust bildirimi eksik.** `src/extensions/vscode/package.json:1-19` içinde `capabilities.untrustedWorkspaces` veya `capabilities.virtualWorkspaces` deklarasyonu yok. VS Code 1.57+ Workspace Trust API'sine göre bildirimsiz uzantılar untrusted workspaces'te otomatik devre dışı kalır; ileride komutlar gerçekten gövdelendiğinde Bunun gibi sessizce kısıtlanma kullanıcıyı şaşırtır. OSS yayın için gerekli policy.
3. **Aktivasyon olayı çok geniş.** `activationEvents: ["onStartupFinished"]` (`src/extensions/vscode/package.json:9`) — uzantı her VS Code açılışında yüklenir. Stub aşaması için bu kabul edilebilir; komutlar gerçeklendiğinde komut-bazlı veya `workspaceContains:.deckent` gibi koşullu aktivasyon tercih edilmelidir (zayıf başlatma maliyeti).
4. **`engines.vscode` aralığı sabit.** `^1.85.0` (`src/extensions/vscode/package.json:7`) — Aralık 2023 sürümü; aktif olarak VS Code Marketplace'e yayın yapılırken minimum sürüm hâlâ destekli; sorun değil ama IDENTITY/CHANGELOG ile birlikte güncellenmemiş.
5. **`extension.ts` dosyası `vscode` paketini doğrudan import etmiyor;** kendi minimal `VsCodeApi` interface'ini tanımlıyor (`src/extensions/vscode/extension.ts:23-31`). Bu yaklaşım deckent ana paketini `vscode` peer-dependency'sinden bağımsız tutuyor → mimari olarak iyi; ancak gerçek aktivasyon zamanında bu interface'in `vscode` API'sinin alt kümesi olduğu garanti edilmiyor (tip uyumu manuel sağlanmış). Lint hatası vermez ama runtime'da tip kayması riskidir.
6. **`getMcpConfig()` `deckent-mcp` binary'sini içe gömülü timeout (30000ms) ile döndürüyor;** ayrı bir konfigürasyon dosyasından okumuyor (`src/extensions/vscode/extension.ts:83-89`). VS Code kullanıcısı MCP server portunu değiştirmek isterse uzantıyı yeniden derlemek zorunda. Konfigürasyonu `workspace.getConfiguration('deckent')` ile yapması beklenir.
7. **`COMMAND_IDS` ve handler'lar bire bir eşlenmiş;** `package.json:contributes.commands` ile uzantı kodu arasında ID düzeyinde tek noktada (const dizi) tanımlanmış — drift riski düşük. **İyi nokta**, korunmalı.

### B) `scripts/` envanteri ve ölü betik tespiti

8. **Ölü betikler — `npm scripts`, `src/`, `tests/`, `.github/workflows/` çapraz referansından hiçbirinde çağrılmıyor (toplam 19/44 = %43):**

   | Dosya | LoC | Durum | Öneri |
   |---|---|---|---|
   | `scripts/archive-decisions-md.mjs` | 68 | Sprint 143 öncesi `DECISIONS.md` arşivlemesi için tek-kullanımlık | **SİL** — V2 migration sonrası işlevsiz. |
   | `scripts/migrate-brain-v2.mjs` | 233 | `.brain/*.md` → `memory.db` tek-kullanımlık | **ARŞİVLE** (`scripts/archive/`) — tarihi referans. |
   | `scripts/sprint-166-memory-backfill.mjs` | 345 | Sprint 166 spesifik backfill | **ARŞİVLE** — Sprint 166 closed. |
   | `scripts/bundle-builtins.mjs` | 116 | Built-in agent/skill paketleme | **KONTROL ET** — build/copy-assets ile çakışıyor olabilir; çağrılmıyor. |
   | `scripts/build-verify.ts` | 235 | tsc + shebang + dist kontrolü | **TAMAMLA** — CI'a bağlanmalı veya silinmeli. |
   | `scripts/pack-test.ts` | 226 | `npm pack --dry-run` doğrulaması | **TAMAMLA** — `validate-publish` bu işi tekrarlıyor, birleştir veya sil. |
   | `scripts/prepublish.ts` | 173 | Pre-publish doğrulama | **BİRLEŞTİR** — `validate-publish.ts` ile birleşmesi planlanmış görünüyor; `npm scripts`'te `prepublishOnly` ise sadece `npm run build` çağırıyor → bu dosya kullanılmıyor. |
   | `scripts/publish.ts` | 247 | Tam publish pipeline | **TAMAMLA veya SİL** — `package.json`'da çağrılmıyor; Alperen `npm publish` manuel yapıyor (memory notu). |
   | `scripts/doc-review.mjs` | 457 | Markdown doküman incelemesi | **TAMAMLA** — Sprint 171 doc-tier task'lar bunu kullanabilirdi; CI'a bağlanmamış. |
   | `scripts/doc-consistency-check.mjs` | 146 | Doc tutarlılık | **TAMAMLA** veya SİL — çağrılmıyor. |
   | `scripts/link-checker.mjs` | 295 | Markdown link doğrulama | **TAMAMLA** — CI'a bağlanmalı (OSS public öncesi ölü-link sıfır olmalı). |
   | `scripts/i18n-parity.mjs` | 329 | TR/EN dosya eşitliği | **TAMAMLA** — ADR-032 enforcement bunu çağırmalı. |
   | `scripts/hub-validate.mjs` | 462 | `deckent-hub/` deposu doğrulama | **KONTROL** — hub repo aktif mi? Pasifse SİL. |
   | `scripts/run-e2e-harness.mjs` | 47 | E2E gate runner | **TAMAMLA** — `npm test:e2e` script'i eksik. |
   | `scripts/verify-gitignore.mjs` | 69 | git ls-files kritik desen kontrolü | **TAMAMLA** — CI'a bağlanmalı (OSS public öncesi). |
   | `scripts/npm-publish-dry-final.sh` | 177 | Tek-kullanımlık final dry-run | **SİL** — `npm-publish-dry.sh` zaten var, ikilik. |
   | `scripts/deploy-discord.sh` | 373 | Discord bot deploy | **KONTROL** — connector ana paket içinde, bu shell wrapper kullanılmıyor olabilir. |
   | `scripts/deploy-telegram.sh` | 341 | Telegram bot deploy | **KONTROL** — yukarıdakinin aynısı. |
   | `scripts/public-repo-sync.sh` | 221 | `VerhexIO/deckent` public flip | **AKTİF TUT** — Sprint 172 OSS GA için kullanılacak; ama `package.json` çağrı yok, doküman gerekli. |
   | `scripts/changelog.sh` | 164 | Changelog üretici | **KONTROL** — `keep a changelog` formatı; `npm run` ile bağlanmamış. |
   | `scripts/bump-version.sh` | 119 | Sürüm artırma | **KONTROL** — `npm version` bunu zaten yapıyor; ikilik olabilir. |
   | `scripts/verify-publish.sh` | 95 | Post-publish doğrulama | **TAMAMLA veya SİL**. |
   | `scripts/cli-smoke-test.sh` | 58 | CLI smoke test | **TAMAMLA** — `cross-platform-e2e.yml` workflow'una eklenebilir. |
   | `scripts/memory/export-adr-fs.mjs` | 99 | ADR DB→FS senkron | **AKTİF TUT, BAĞLA** — ADR-046 bi-directional sync sözleşmesi gereği CI gate olmalı (Sprint 169 H1). |
   | `scripts/memory/migrate-relations.mjs` | 188 | Sprint 169 C1 relations migration | **TUT, MANUEL ARAÇ** — tek-kullanımlık ama idempotent, gelecekteki rebuild'lerde tekrar gerekebilir. |

9. **DIRECTIVES "44 betik (40 doğrudan + 3 `memory/` + 1 `security/`)" diyor ama gerçek envanter 45** (41 `scripts/` direkt + 3 `memory/` + 1 `security/`). Plan/spec 1 eksik saymış — `scripts/backfill-relations.mjs` DIRECTIVES sayımından düşmüş. Düşük etki, plan güncellemeli.

### C) Shell injection ve `spawnSync`/`execSync` güvenliği (ADR-006 ihlali aranıyor)

10. **`execSync` ile string + template literal — ADR-006 (spawnSync Security Pattern) açık ihlali (HIGH):**

    | Dosya:Satır | Kalıp | Risk |
    |---|---|---|
    | `scripts/validate-publish.ts:340` | `execSync(`npm install -g "${tgzPath}" --prefix "${installPrefix}"`)` | tgzPath kendi içinde yerelden gelse de template literal + çift tırnak; karakter escape garanti edilmiyor. |
    | `scripts/validate-publish.ts:358` | `execSync(`"${deckentBin}" --version 2>&1`)` | `deckentBin` yol; ADR-006 array-arg + shell:false zorunlu kılar. |
    | `scripts/validate-publish.ts:371,386,410` | `execSync(`"${deckentBin}" --help 2>&1`)` / `init` / `doctor` | aynı pattern üç kez tekrarlanmış. |
    | `scripts/validate-publish.ts:298,321` | `execSync('npm pack --dry-run 2>&1', ...)` | Statik string ama `2>&1` shell pipe; ADR-006 array+`stdio: ['pipe','pipe','pipe']` ister. |
    | `scripts/publish.ts:150-152` | `execSync(`git commit -m "chore: release ${tag}"`)` ve diğerleri | `tag` user-controlled değil (`package.json:version` türevi) ama çift tırnaklı template literal, `;` enjeksiyonu teorik. |
    | `scripts/publish.ts:166` | `execSync(cmd, ...)` (cmd = `npm publish` veya `npm publish --dry-run`) | Statik string, düşük risk. |
    | `scripts/publish.ts:30,47,60,73` | `execSync('git status --porcelain', ...)`, `'npx tsc'`, `'npx vitest run'`, `'npm pack --dry-run 2>&1'` | Statik ama shell pipe; ADR-006'ya tam uyum için `spawnSync('git', ['status', '--porcelain'])` formatı tercih edilmeli. |
    | `scripts/pack-test.ts:207` | `execSync('npm pack --dry-run 2>&1', ...)` | Aynı pattern. |
    | `scripts/doc-review.mjs:65` | `execSync(`ls -1a "${dir}"`)` | `dir` rekursif yürüyüş içinden geliyor; symbolic link veya özel karakter içeren dizin adlarında escape kırılabilir. |
    | `scripts/doc-review.mjs:393` | `execSync(`find "${rootDir}" -name "*.md" -not -path ...`)` | `rootDir` parametrik; CLI argümanından gelirse path traversal + shell escape riski. |
    | `scripts/run-e2e-harness.mjs:33` | `execSync(cmd, ...)` (cmd = `npx vitest run ${testFiles.join(' ')}` ) | testFiles hardcoded array; risk düşük ama yine de shell-string. |
    | `scripts/prepublish.ts:153` | `execSync('npx tsc --noEmit', ...)` | Statik, düşük risk. |
    | `scripts/build-verify.ts:28` | `execSync('npx tsc --noEmit', ...)` | Statik, düşük risk. |
    | `scripts/verify-gitignore.mjs:48` | `execSync('git ls-files ' + CRITICAL_PATTERNS.join(' '))` | `CRITICAL_PATTERNS` hardcoded array; ancak string concat → spawnSync('git', ['ls-files', ...]) tercih edilmeli. |

    **Karşı örnek (doğru pattern):** `scripts/dead-code-audit.mjs:103,170,199`, `scripts/pre-flight-health-check.mjs:52,91,202,223,262`, `scripts/sync-manifest.mjs:85`, `scripts/chain-gate-check.mjs:67,98,135,371`, `scripts/security/secret-baseline.mjs:59` — hepsi `spawnSync(BIN, [ARG, ARG, ...], OPTS)` formatında, ADR-006 uyumlu.

11. **Shell betiklerinde `set -euo pipefail` disiplini:** `scripts/bump-version.sh:6` ve `scripts/changelog.sh:6` sadece `set -e` kullanıyor (eksik `-u` ve `-o pipefail`); `scripts/fresh-env-test.sh` ve `scripts/verify-publish.sh:5` aynı şekilde. Diğer 7 shell betiği `set -euo pipefail` ile sıkıştırılmış (`deploy-discord.sh:26`, `deploy-telegram.sh:20`, `nervous-tui-smoke.sh:10`, vb.). **Tutarsızlık**, bash hatalarının silentley geçmesine yol açabilir.

12. **`scripts/deploy-discord.sh:116` ve `scripts/deploy-telegram.sh:83-91`** `.deck` dosyasından `DISCORD_TOKEN` / `TELEGRAM_TOKEN` okuyup `export` ediyor (`scripts/deploy-discord.sh:239`). Token sızıntı yüzeyleri:
    - `log_error "DISCORD_TOKEN boş veya placeholder değer içeriyor: $DISCORD_TOKEN_RAW"` (`scripts/deploy-discord.sh:121`) — placeholder olmadığında `DISCORD_TOKEN_RAW` (gerçek token!) log'a basılır → **HIGH güvenlik bulgusu**. Token'ı log'a yazmak ADR-014 `.deck` koruma sözleşmesini sızdırır.
    - `log_success "TELEGRAM_TOKEN .deck dosyasından okundu (${TELEGRAM_TOKEN:0:10}...)"` (`scripts/deploy-telegram.sh:111`) — sadece prefix gösteriyor → güvenli, iyi pattern.

### D) `scripts/memory/*` (Sprint 169 — idempotent + DB-silmek-yasak kontrolü)

13. **`scripts/memory/migrate-relations.mjs:135` — `INSERT OR IGNORE` kullanıyor → idempotent ✓.** Re-run güvenli, mevcut satırları çoğaltmaz. FK-safe orphan skip mevcut (`scripts/memory/migrate-relations.mjs:152-159`). `feedback_db_silmek_yasak` ihlali yok — yalnızca `INSERT` yapıyor. **İYİ**.

14. **`scripts/memory/backfill-stub-entries.mjs:56,62` — `meta.stub_flag === false` ise skip → idempotent ✓.** `archive_missing`, `not_found`, `not_stub`, `archive_too_short` reason ile granüler skip yapısı doğru. `store.update()` çağrıları sadece `content` + `metadata` alanını günceller, başka veriyi kaybetmez. **İYİ**.

15. **`scripts/memory/export-adr-fs.mjs:79` — `exportAdrsToFs(store, adrDir, { dryRun })`** — `loadModules()` (`scripts/memory/export-adr-fs.mjs:48-59`) sadece `dist/` build'i destekliyor, `src/` (tsx) fallback'i yok. `npm run build` koşulmamışsa **çalışmaz** (ADR-046 bi-directional sync gate'inin koşulu). Karşılaştırma: `scripts/memory/backfill-stub-entries.mjs:102-104` her iki yolu destekliyor (`dist/` + `src/` fallback). **MEDIUM tutarsızlık.**

16. **DB'yi silen, `DROP TABLE` çağıran veya `unlink('memory.db')` yapan komut YOK** — `grep -nE "DROP|rm -rf|unlink|rmSync" scripts/memory/` boş döndü. `feedback_db_silmek_yasak` ihlali yok ✓.

17. **`scripts/memory/migrate-relations.mjs:131` — `pragma('foreign_keys = ON')`** — FK enforcement aktif, orphan relations önlenir. **İYİ**.

18. **`scripts/memory/backfill-stub-entries.mjs:69` `MIN_CONTENT_LEN = 100`** — Sihirli sayı, doküman yok; "neden 100" açıklaması eksik. Düşük etki ama yorum eklenmesi tavsiye edilir.

### E) `scripts/security/secret-baseline.mjs` (Sprint 169 H3 — 10 regex pattern)

19. **10 regex pattern doğru tanımlanmış** (`scripts/security/secret-baseline.mjs:12-23`):
    - AWS_ACCESS_KEY: `AKIA[0-9A-Z]{16}` — AWS resmi formatla uyumlu ✓
    - AWS_SECRET: `aws_secret|secret_access_key` + 40 char base64 ✓
    - GITHUB_PAT: `gh[pousr]_[A-Za-z0-9]{36,255}` — `ghp_`, `ghs_`, `gho_`, `ghu_`, `ghr_` desteği ✓
    - OPENAI_KEY: `sk-(?:proj-)?[A-Za-z0-9_-]{40,}` — yeni `sk-proj-` formatı dahil ✓
    - ANTHROPIC_KEY: `sk-ant-[A-Za-z0-9_-]{40,}` ✓
    - GOOGLE_API_KEY: `AIza[0-9A-Za-z_-]{35}` ✓
    - DISCORD_TOKEN: `[MN][A-Za-z0-9]{23}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,38}` ✓
    - TELEGRAM_TOKEN: `\d{8,10}:[A-Za-z0-9_-]{35}` ✓
    - PRIVATE_KEY: `BEGIN ... PRIVATE KEY` ✓
    - ENV_VALUE: jenerik `XX_TOKEN=` / `XX_KEY=` / `XX_SECRET=` / `XX_PASSWORD=` ✓

20. **Eksik pattern adayları (Sprint 172 OSS GA için tavsiye):**
    - **Slack tokenlar**: `xoxb-`, `xoxa-`, `xoxp-` — Slack connector ileride olabilir, ortam genişlerse risk artar.
    - **NPM token**: `npm_[A-Za-z0-9]{36}` — `prepublishOnly` betiği npm token'ı yanlışlıkla log'a bastırırsa yakalanmaz; OSS GA için kritik.
    - **JWT genel pattern**: `ey[A-Za-z0-9_-]{15,}\.ey[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}` — uzantı/dashboard cookie/session token'larında bulunabilir.
    - **GCP service account key fragmanı**: `"private_key": "-----BEGIN PRIVATE KEY-----` — PRIVATE_KEY pattern yakalar ama service-account JSON formatına özel zenginlik faydalı.

21. **Skip-suffix listesi `.lock` içeriyor** (`scripts/security/secret-baseline.mjs:26`) → `package-lock.json` ve `.lock` uzantısı atlanır. Buna ek olarak `SKIP_EXACT` setinde `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml` listelenmiş (`scripts/security/secret-baseline.mjs:27`). Çift koruma — iyi. Ancak `.lock` suffix'i tüm `.lock` uzantısını atlar (örn. `.task-lock`), istenmeyen genişlik. **Düşük etki**, ama daraltılabilir.

22. **`MAX_FILE_BYTES = 2 MB`** (`scripts/security/secret-baseline.mjs:28`) — 2 MB altı dosyalar taranır; üstü atlanır. `BETA-TRACKER.md` (101 KB), `DECKENT-MASTER-BLUEPRINT.md` (164 KB) güvenli sınır içinde. Riskler için yeterli. **İYİ**.

23. **`shouldSkip(file)` `dist/` ile başlayan dosyaları atlıyor** (`scripts/security/secret-baseline.mjs:25,52`) → build artifaktları taranmaz; ancak `dist/` git-tracked değilse (gerçek durum: gitignore'da), `git ls-files` zaten döndürmez. Çifte koruma — düşük etki, iyi pattern.

24. **`simpleHash` collision riski**: 32-bit basit hash (`scripts/security/secret-baseline.mjs:40-44`); allowlist'te (file, hash) tuple kullanılıyor. Aynı dosyada iki farklı secret aynı 32-bit hash'e düşerse, biri allowlist'lendiğinde diğeri de "allowed" sayılır. Pratikte collision olasılığı düşük (token uzunlukları farklı) ama OSS GA öncesi **SHA-256 prefix'i** (örn. `crypto.createHash('sha1').update(match).digest('hex').slice(0,16)`) tercih edilir. **MEDIUM**.

25. **`PATTERNS` regex flag `gi` kullanımı**: `AWS_SECRET`, `DISCORD_TOKEN` regex'leri `gi` flag — case-insensitive. AWS resmi formatı büyük harf zorunlu ama Discord token alfabetik olarak case-sensitive değil; `gi` doğru. Diğer regex'lerde `g` tek başına yeterli. **Düşük etki**, ama AWS_SECRET regex'inde `i` flag bilinçli mi, kontrol edilmeli.

### F) Diğer cross-cutting bulgular

26. **`scripts/run-self-audit.ts:1` `node ./scripts/run-self-audit.ts` ile çağrılıyor mu?** `package.json:scripts` içinde yok, `src/cli/commands/` içinde `audit-runner` benzeri komuttan çağrılıyor olabilir. Sprint 170 audit'lerinde test edilmemiş — **AKTİF/DEAD belirsiz**.

27. **`scripts/run-e2e-harness.mjs:37` `timeout: 120_000`** — 2 dakikalık hard cap; sprint-lifecycle.test.ts gerçek e2e'de aşan bir test olabilir, sessiz timeout kaybı. Geçmiş Sprint 138 T9 long-running sprint mvp ile çelişebilir.

28. **`scripts/migrate-brain-v2.mjs:17-23` `dist/core/memory-store.js` import etmiyor;** raw `import` yok, kendi parsing yapıyor (245 satır). V2 migration sonrası bu betik **tek-kullanımlık** ve kalıcı tutmaya gerek yok — arşivlenmeli.

29. **`scripts/sprint-166-memory-backfill.mjs:21-27` `--dry-run` veya `--apply` zorunlu kılıyor** → güvenli. Ancak betik dosyası **sprint-spesifik** (Sprint 166), tek-kullanımlık, `scripts/archive/sprint-166/` altına taşınmalı.

30. **`scripts/prompt-linter.mjs` ve `scripts/chain-gate-check.mjs` aktif kullanım var ama npm script kısayolu yok.** `npm run lint:prompts` ve `npm run gate:chain` eksik → kullanıcı raw `node scripts/...` ile çalıştırmak zorunda. UX zayıflığı.

31. **`scripts/sync-manifest.mjs:85` `spawnSync('grep', [...])`** — `grep` cross-platform değil (Windows'ta yok). Sprint 169 cross-platform e2e workflow ile çelişiyor olabilir. Node-native `readdirSync` + regex tercih edilmeli.

32. **`scripts/dead-code-audit.mjs:103` `spawnSync('find', [...])`** — yine cross-platform değil (Windows'ta `find` farklı). `glob` veya `node:fs/promises.readdir` recursive tercih edilmeli.

### G) Boyut metrikleri

- **Toplam betik:** 45 dosya — `scripts/*.{mjs,ts,sh}` = 41 + `scripts/memory/*.mjs` = 3 + `scripts/security/*.mjs` = 1. DIRECTIVES "44" diyor, +1 drift (`backfill-relations.mjs` eksik sayılmış).
- **Toplam LoC:** ~8,900 satır (`mjs` + `ts` + `sh` tahmini).
- **Aktif (USED):** 26/45 (%58).
- **Ölü/şüpheli (UNREFD):** 19/45 (%42) — yüksek dead-code yüzdesi.
- **`spawnSync` ile array-arg pattern (ADR-006 uyumlu):** ~9 dosya.
- **`execSync` string/template (ADR-006 ihlal):** ~10 dosya, ~25 çağrı noktası.

---

## 2. Severity

| # | Bulgu | Severity | Gerekçe |
|---|---|---|---|
| 10 | `execSync` string/template literal ihlali (10 dosya, 25+ nokta) | **HIGH** | ADR-006 explicit ihlali; sürdürdükçe yeni shell injection vektörü yaratma riski; karakter escape garanti edilemez. |
| 12a | `scripts/deploy-discord.sh:121` token'ı log'a basıyor (placeholder kontrol fail dalında) | **HIGH** | Gerçek Discord bot token'ı log'a sızdırılır → `.deck` ADR-014 koruma sözleşmesi ihlali. |
| 8 | 19/44 ölü/şüpheli betik (%43) | **MEDIUM** | OSS GA öncesi repo kalitesi; kullanıcı kafa karışıklığı; supply-chain saldırı yüzeyi (ölü betik içeren PR cool-down'da fark edilmeyebilir). |
| 2 | Workspace Trust bildirimi eksik | **MEDIUM** | OSS Marketplace yayın hazırlığında zorunlu policy; şu an stub etkisiz değil. |
| 24 | `simpleHash` 32-bit collision riski | **MEDIUM** | Allowlist by-pass teorik mümkün; OSS GA öncesi hash-strength artırılmalı. |
| 11 | `set -euo pipefail` tutarsızlığı (4 betik eksik) | **MEDIUM** | Bash hata bastırma; CI'da silentley geçen başarısızlık riski. |
| 15 | `export-adr-fs.mjs` `dist/` fallback'i eksik | **MEDIUM** | ADR-046 bi-directional sync gate'inin build koşulu var; CI yeşil ise gizli, dev iş akışında patlar. |
| 20 | Secret-baseline NPM token, JWT, Slack token pattern eksik | **MEDIUM** | OSS public flip + npm publish öncesi koruma yüzeyi dar; tek-kez sızıntı kalıcı kayıt. |
| 31 | `sync-manifest.mjs` ve `dead-code-audit.mjs` cross-platform değil (`grep`/`find` Unix) | **MEDIUM** | Sprint 169 cross-platform e2e workflow'u ile çelişiyor; Windows kullanıcısı betikleri çalıştıramaz. |
| 30 | `prompt-linter` ve `chain-gate-check` için npm script kısayolu yok | **MEDIUM** | UX zayıflığı; CI'da otomasyon zorlaşır. |
| 1 | VS Code uzantı komutları boş gövdeli, kullanıcı geri bildirimi yok | **LOW** | Stub niteliğinde belgeli; kullanıcı VS Code Marketplace'te keşfedip yüklerse şaşırır. |
| 3 | `activationEvents: onStartupFinished` çok geniş | **LOW** | Stub aşamasında etki düşük; komut-bazlı aktivasyona geçilmeli. |
| 4 | `engines.vscode: ^1.85.0` güncelleme bekliyor | **LOW** | Aralık 2023; sorun değil ama versiyon bilinçli tut. |
| 5 | `VsCodeApi` interface vscode API alt kümesi garantili değil | **LOW** | Runtime tip kayma riski; uzantı gerçeklendiğinde fark edilir. |
| 6 | `getMcpConfig()` workspace konfigürasyonu okumuyor | **LOW** | Stub aşaması için yeterli; gerçeklendiğinde gerekli. |
| 9 | DIRECTIVES "44 betik" sayım drift — gerçek 45 | **LOW** | Doküman tutarlılığı; `backfill-relations.mjs` eksik sayılmış. |
| 13–17 | `scripts/memory/*` idempotent + DROP-yasağı uyumu | **PASS (İYİ)** | Bulgu değil; pozitif kanıt. |
| 19 | secret-baseline 10 pattern tanım doğru | **PASS (İYİ)** | Bulgu değil; pozitif kanıt. |
| 21–23 | secret-baseline skip-suffix + MAX_FILE_BYTES + dist skip | **PASS (İYİ)** | Pozitif kanıt. |
| 18 | `MIN_CONTENT_LEN = 100` sihirli sayı | **LOW** | Yorum eksikliği. |
| 25 | AWS_SECRET regex `i` flag bilinçli mi belirsiz | **LOW** | Doğruluk var, niyet belirsiz. |
| 27 | `run-e2e-harness.mjs` 2dk timeout dar | **LOW** | Sessiz fail riski. |
| 32 | `dead-code-audit.mjs` `find` cross-platform değil | **LOW** | Sürdürme sorunu. |

CRITICAL bulgu yok — yani **OSS GA tam-blocker** seviyesinde tek bir ihlal yok; ama bulgu 10 + 12a + 8 kümülatif olarak HIGH'tır ve Sprint 172 OSS GA için **conditional-block** sayılır.

---

## 3. Kanıt (Evidence)

### A) Extension stub komut boş gövde

```typescript
// src/extensions/vscode/extension.ts:60-66
for (const commandId of COMMAND_IDS) {
  const disposable = vscode.commands.registerCommand(commandId, () => {
    // Stub — full implementation in Sprint 049
  });
  context.subscriptions.push(disposable);
}
```

### B) Workspace Trust eksik

```json
// src/extensions/vscode/package.json — tüm dosya, 19 satır
{
  "name": "deckent-vscode",
  "displayName": "Deckent — AI Agent Orchestrator",
  ...
  "activationEvents": ["onStartupFinished"],
  ...
  // capabilities.untrustedWorkspaces YOK
}
```

### C) ADR-006 ihlali — `execSync` template literal

```typescript
// scripts/validate-publish.ts:340
execSync(`npm install -g "${tgzPath}" --prefix "${installPrefix}"`, {
  encoding: 'utf-8',
  stdio: 'pipe',
});

// scripts/validate-publish.ts:358
const versionOutput = execSync(`"${deckentBin}" --version 2>&1`, { encoding: 'utf-8' });
```

```typescript
// scripts/publish.ts:150-152
execSync(`git add package.json`, { cwd: projectRoot, stdio: 'pipe' });
execSync(`git commit -m "chore: release ${tag}"`, { cwd: projectRoot, stdio: 'pipe' });
execSync(`git tag -a ${tag} -m "Release ${version}"`, { cwd: projectRoot, stdio: 'pipe' });
```

```javascript
// scripts/doc-review.mjs:65
entries = execSync(`ls -1a "${dir}"`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
```

```javascript
// scripts/verify-gitignore.mjs:48
const tracked = execSync('git ls-files ' + CRITICAL_PATTERNS.join(' '), {
```

### D) Doğru pattern (karşı örnek)

```javascript
// scripts/security/secret-baseline.mjs:59
return execFileSync('git', ['ls-files'], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })

// scripts/pre-flight-health-check.mjs:202
const result = spawnSync('docker', ['info'], { ... });

// scripts/chain-gate-check.mjs:67
const result = spawnSync('npx', ['tsc', '--noEmit'], { ... });
```

### E) Discord token log sızıntısı

```bash
# scripts/deploy-discord.sh:117-122
if [[ -n "$DISCORD_TOKEN_RAW" && "$DISCORD_TOKEN_RAW" != "your_token_here" && "$DISCORD_TOKEN_RAW" != "xxx" ]]; then
  log_ok "DISCORD_TOKEN .deck dosyasında mevcut"
  DISCORD_TOKEN="$DISCORD_TOKEN_RAW"
else
  log_error "DISCORD_TOKEN boş veya placeholder değer içeriyor: $DISCORD_TOKEN_RAW"
                                                                  ^^^^^^^^^^^^^^^^^^^^
                                                                  Gerçek token log'a sızar
fi
```

### F) Memory script idempotency

```javascript
// scripts/memory/migrate-relations.mjs:134-135
const insertStmt = db.prepare(
  `INSERT OR IGNORE INTO relations (from_id, to_id, rel_type) VALUES (?, ?, ?)`,
);

// scripts/memory/backfill-stub-entries.mjs:56
if (meta.stub_flag === false) return { skipped: true, reason: 'not_stub' };
```

### G) Secret-baseline 10 pattern

```javascript
// scripts/security/secret-baseline.mjs:12-23
const PATTERNS = [
  { name: 'AWS_ACCESS_KEY', regex: /AKIA[0-9A-Z]{16}/g },
  { name: 'AWS_SECRET', regex: /(?:aws_secret|secret_access_key)[\s'"=:]+[A-Za-z0-9/+=]{40}/gi },
  { name: 'GITHUB_PAT', regex: /gh[pousr]_[A-Za-z0-9]{36,255}/g },
  { name: 'OPENAI_KEY', regex: /sk-(?:proj-)?[A-Za-z0-9_-]{40,}/g },
  { name: 'ANTHROPIC_KEY', regex: /sk-ant-[A-Za-z0-9_-]{40,}/g },
  { name: 'GOOGLE_API_KEY', regex: /AIza[0-9A-Za-z_-]{35}/g },
  { name: 'DISCORD_TOKEN', regex: /(?:bot\s+)?[MN][A-Za-z0-9]{23}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,38}/gi },
  { name: 'TELEGRAM_TOKEN', regex: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/g },
  { name: 'PRIVATE_KEY', regex: /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/g },
  { name: 'ENV_VALUE', regex: /^\s*[A-Z_]+_(?:TOKEN|KEY|SECRET|PASSWORD)\s*=\s*[A-Za-z0-9_-]{16,}/gm },
];
```

### H) Cross-platform sorunu

```javascript
// scripts/sync-manifest.mjs:85
const result = spawnSync('grep', [
  ...

// scripts/dead-code-audit.mjs:103
const result = spawnSync('find', [dir, '-name', '*.ts', '-not', '-name', '*.d.ts', ...
```

### I) Memory script dist-only fallback

```javascript
// scripts/memory/export-adr-fs.mjs:48-59
async function loadModules() {
  const cwd = process.cwd();
  const distStore = join(cwd, 'dist', 'core', 'memory-store.js');
  const distExport = join(cwd, 'dist', 'core', 'memory-export.js');
  if (existsSync(distStore) && existsSync(distExport)) {
    ...
  }
  throw new Error('dist/core/memory-store.js or memory-export.js missing — run `npm run build` first.');
}
// Karşılaştırma: scripts/memory/backfill-stub-entries.mjs:102-104 dist + src/tsx fallback yapıyor
```

### J) Ölü betik kanıtı

```bash
# package.json'da çağrılanlar (tek doğruluk kaynağı):
$ grep -oE 'scripts/[a-zA-Z0-9_-]+\.(mjs|ts|sh)' package.json | sort -u
scripts/adr-validator.mjs
scripts/check-error-handling.mjs
scripts/copy-assets.mjs
scripts/generate-cli-docs.ts
scripts/validate-publish.ts

# .github/workflows'da çağrılanlar:
$ grep -hoE "scripts/[a-zA-Z0-9_/.-]+\.(mjs|ts|sh)" .github/workflows/*.yml | sort -u
scripts/security/secret-baseline.mjs
```

---

## 4. Öneriler (Recommendations)

### Sprint 172 OSS GA Blocker'ları (öncelikli)

1. **ADR-006 ihlallerini düzelt** (bulgu 10): `scripts/validate-publish.ts`, `scripts/publish.ts`, `scripts/pack-test.ts`, `scripts/doc-review.mjs`, `scripts/verify-gitignore.mjs` içindeki `execSync(string|template)` çağrılarını `spawnSync(BIN, [ARG, ARG, ...], { stdio: ... })` formatına çevir. **Düzelt** — 1 sprint tek-task.

2. **Discord token log sızıntısı** (bulgu 12a): `scripts/deploy-discord.sh:121`'i `log_error "DISCORD_TOKEN boş veya placeholder değer içeriyor: ${DISCORD_TOKEN_RAW:0:5}..."` veya tam redaction ile düzelt. **Düzelt** — 5 dakikalık fix.

3. **Workspace Trust manifestini ekle** (bulgu 2): `src/extensions/vscode/package.json`'a:
   ```json
   "capabilities": {
     "untrustedWorkspaces": { "supported": "limited", "description": "Deckent connects to local MCP server only" },
     "virtualWorkspaces": { "supported": false }
   }
   ```
   **Tamamla** — Marketplace yayınından önce zorunlu.

4. **Ölü/şüpheli betiklerin dispose disposition'ı** (bulgu 8): 19 betiği üç gruba ayır — SİL (`archive-decisions-md.mjs`, `npm-publish-dry-final.sh`), ARŞİVLE (`migrate-brain-v2.mjs`, `sprint-166-memory-backfill.mjs`, `archive-decisions-md.mjs`'in 1-kullanımlık versiyonu), TAMAMLA (`build-verify.ts`, `pack-test.ts`, `verify-gitignore.mjs`, `link-checker.mjs`, `i18n-parity.mjs`, `run-e2e-harness.mjs`, `doc-review.mjs`, `doc-consistency-check.mjs` — CI'a bağla veya sil). **Sprint 172'de ayrı task**.

5. **secret-baseline'ı NPM/Slack/JWT pattern ile genişlet** (bulgu 20): `npm publish` öncesi npm token sızıntısı yakalamak için kritik. Pattern eklemesi 30 satır, idempotent. **Tamamla**.

### Mimari Düzeltmeler (Sprint 172+)

6. **`scripts/memory/export-adr-fs.mjs` `src/` fallback** (bulgu 15): `backfill-stub-entries.mjs`'in pattern'i tekrarla (line 102-104). 5 satır.

7. **`scripts/sync-manifest.mjs` ve `scripts/dead-code-audit.mjs`'i cross-platform yap** (bulgu 31): `spawnSync('grep'/'find')` yerine `node:fs/promises.readdir` recursive + regex. Sprint 169 cross-platform e2e workflow'un kapsamı genişler.

8. **Shell betiklerinde `set -euo pipefail` zorunlu kıl** (bulgu 11): `scripts/bump-version.sh:6`, `scripts/changelog.sh:6`, `scripts/verify-publish.sh:5`'i güncelle. **Düzelt** — 3 dakika.

9. **`simpleHash` → SHA-1/256 truncate** (bulgu 24): `scripts/security/secret-baseline.mjs:40-44`'ü `createHash('sha1').update(s).digest('hex').slice(0,12)` ile değiştir. 5 satır, geriye dönük uyumlu (allowlist tekrar build edilir). **Düzelt**.

### UX/Kalite (Sprint 172+)

10. **`npm scripts` kısayolu ekle** (bulgu 30): `package.json:scripts`'e `lint:prompts`, `gate:chain`, `lint:docs` (i18n-parity, link-checker, doc-consistency, doc-review birleşik bir command'in altında).

11. **Plan/spec drift düzelt** (bulgu 9): DIRECTIVES ve plan dosyalarında "44 betik (40 doğrudan)" → "45 betik (41 doğrudan)" güncelle — `backfill-relations.mjs` eksik sayılmıştı.

12. **VS Code extension komutlarını gerçekle** (Sprint 049 borç): `getMcpConfig()`'ten gelen ayarla MCP server'ı çağır, komut paletinden gerçek aksiyon başlat. Stub aşaması artık 100+ sprint sürdürüldü, OSS GA için minimum olarak `Deckent: Show Status` komutu çalışmalı.

13. **`scripts/memory/migrate-brain-v2.mjs` ve `sprint-166-memory-backfill.mjs`'i `scripts/archive/` altına taşı**: Tek-kullanımlık migration betikleri tarihi referans olarak korunur ama aktif `scripts/` envanterini kirletmez. **Birleştir**.

### Genel İyileştirmeler

14. **`scripts/run-e2e-harness.mjs` timeout'u** (bulgu 27): 120s → 300s veya konfigürasyondan oku (`process.env.E2E_TIMEOUT_MS`). Sprint 138 T9 long-running ile uyumlu.

15. **`scripts/security/secret-baseline.mjs:69` `'allowlist'` boş array fallback'i sağlam,** ama allowlist entry'leri pattern bilgisi içeriyor — `pattern` alanı şu an karşılaştırmada kullanılmıyor (`scripts/security/secret-baseline.mjs:73`'de sadece `file:hash` kullanılıyor). Pattern alanı silinebilir veya gelecekte cross-check için kullanılır. **Düşük etki**.

---

## 5. Kapsam Haritası (Files Covered)

> Modül-derin task — `src/extensions/vscode/**` + `scripts/**` tümü tek-tek incelenir. Aşağıdaki tabloda HER dosya listelenmiştir (44 betik + 2 uzantı dosyası = 46 toplam).

| Dosya | LoC | Okundu | Not |
|---|---|---|---|
| `src/extensions/vscode/extension.ts` | 89 | ✓ | Stub uzantı, 3 boş komut, `VsCodeApi` minimal interface. ADR-008 import disiplini iyi (vscode peer-dep yok). |
| `src/extensions/vscode/package.json` | 18 | ✓ | `activationEvents: onStartupFinished`, Workspace Trust manifesti eksik, `engines.vscode: ^1.85.0`. |
| `scripts/adr-validator.mjs` | 181 | ✓ | USED (`npm run lint:adr`). ADR format + status enum + duplicate ID. Sağlıklı. |
| `scripts/agent-prompt-validator.mjs` | 47 | ✓ | USED (`src/` referans). Agent PROMPT.md doğrulama. Kısa, sağlıklı. |
| `scripts/archive-decisions-md.mjs` | 68 | ✓ | UNREFD. Sprint 143 öncesi tek-kullanımlık arşivleme. `unlinkSync` ile orijinal silinir → SHA-256 verify sonrası. SİL/ARŞİVLE. |
| `scripts/backfill-relations.mjs` | 136 | ✓ | USED (Sprint 169 H1 wire). FK-safe, idempotent. |
| `scripts/build-verify.ts` | 235 | ✓ | UNREFD. `execSync('npx tsc')` ADR-006 ihlali. tsc + shebang + dist + circular dep kontrol. TAMAMLA. |
| `scripts/bump-version.sh` | 119 | ✓ | UNREFD. `set -e` (eksik `-u -o pipefail`). `npm version` ile çakışıyor olabilir. |
| `scripts/bundle-builtins.mjs` | 116 | ✓ | UNREFD. `rmSync(force:true)` agresif. Built-in agent/skill paketleme — copy-assets ile çakışma şüphesi. |
| `scripts/chain-gate-check.mjs` | 507 | ✓ | USED (`src/`). `spawnSync` doğru pattern. Sprint 169 H5 chain dependency gate. |
| `scripts/changelog.sh` | 164 | ✓ | UNREFD. `set -e` eksik flag. Keep a Changelog üretici. |
| `scripts/check-error-handling.mjs` | 175 | ✓ | USED (`npm run lint:errors`). Error swallow pattern tarama. Sağlıklı. |
| `scripts/cli-smoke-test.sh` | 58 | ✓ | UNREFD. `set -euo pipefail` doğru. CLI smoke test — `cross-platform-e2e.yml`'a eklenebilir. |
| `scripts/copy-assets.mjs` | 75 | ✓ | USED (`npm run build`). Assets kopyalama. Sağlıklı. |
| `scripts/dead-code-audit.mjs` | 496 | ✓ | USED (`src/`). `spawnSync('find', ...)` cross-platform değil. |
| `scripts/deploy-discord.sh` | 373 | ✓ | UNREFD. **HIGH:** Line 121'de token log'a sızar. Connector ana paketinde — bu shell wrapper kullanılıyor mu belirsiz. |
| `scripts/deploy-telegram.sh` | 341 | ✓ | UNREFD. Token redaction iyi (`${TOKEN:0:10}...`). |
| `scripts/directives-stress-simulator.mjs` | 49 | ✓ | USED (`src/`). DIRECTIVES.md stress test. |
| `scripts/doc-consistency-check.mjs` | 146 | ✓ | UNREFD. Doc tutarlılık. TAMAMLA veya SİL. |
| `scripts/doc-review.mjs` | 457 | ✓ | UNREFD. **HIGH:** `execSync(ls/find ...)` ADR-006 ihlali. CI'a bağlanabilir. |
| `scripts/fresh-env-test.sh` | 53 | ✓ | USED (`src/`). `set -euo pipefail` doğru. |
| `scripts/generate-cli-docs.ts` | 704 | ✓ | USED (`npm run docs:generate-cli`). En büyük betik. |
| `scripts/hub-validate.mjs` | 462 | ✓ | UNREFD. `deckent-hub/` doğrulama. Hub aktif mi belirsiz. |
| `scripts/i18n-parity.mjs` | 329 | ✓ | UNREFD. ADR-032 enforcement — CI'a bağlanmalı. |
| `scripts/link-checker.mjs` | 295 | ✓ | UNREFD. OSS public öncesi CI'a bağlanmalı. |
| `scripts/mcp-nervous-e2e.mjs` | 187 | ✓ | USED (`src/`). MCP + Nervous E2E. |
| `scripts/migrate-brain-v2.mjs` | 233 | ✓ | UNREFD. Tek-kullanımlık V1→V2. ARŞİVLE. |
| `scripts/nervous-tui-smoke.sh` | 80 | ✓ | USED (`src/`). `set -euo pipefail` doğru. |
| `scripts/npm-publish-dry-final.sh` | 177 | ✓ | UNREFD. `npm-publish-dry.sh` ile ikilik. SİL. |
| `scripts/npm-publish-dry.sh` | 107 | ✓ | USED (`src/`). `set -euo pipefail`. |
| `scripts/pack-test.ts` | 226 | ✓ | UNREFD. `execSync('npm pack ...')` ADR-006 ihlali. validate-publish ile birleştir. |
| `scripts/pre-flight-health-check.mjs` | 370 | ✓ | USED (`src/`). `spawnSync` doğru pattern. |
| `scripts/prepublish.ts` | 173 | ✓ | UNREFD. `execSync('npx tsc')` ADR-006 ihlali. `package.json`'da `prepublishOnly: npm run build` zaten var → bu dosya hayalet. |
| `scripts/prompt-linter.mjs` | 341 | ✓ | USED (`src/`). `npm script` kısayolu yok. |
| `scripts/public-repo-sync.sh` | 221 | ✓ | UNREFD. Sprint 172 OSS GA için kritik. `set -euo pipefail` doğru. |
| `scripts/publish.ts` | 247 | ✓ | UNREFD. **HIGH:** 5+ `execSync(template)` ADR-006 ihlali. Alperen manuel publish yapıyor → bu dosya hayalet. |
| `scripts/run-e2e-harness.mjs` | 47 | ✓ | UNREFD. `execSync(cmd)` ADR-006 ihlali, 2dk timeout dar. |
| `scripts/run-self-audit.ts` | 157 | ✓ | USED (`src/`). |
| `scripts/sprint-166-memory-backfill.mjs` | 345 | ✓ | UNREFD. Sprint 166 spesifik. ARŞİVLE. |
| `scripts/sync-manifest.mjs` | 305 | ✓ | USED (`src/`). `spawnSync('grep')` cross-platform değil. |
| `scripts/validate-publish.ts` | 484 | ✓ | USED (`npm run validate:publish`). **HIGH:** 6+ `execSync(template)` ADR-006 ihlali. |
| `scripts/verify-gitignore.mjs` | 69 | ✓ | UNREFD. `execSync('git ls-files ' + ...)` ADR-006 ihlali (string concat). OSS public öncesi CI'a bağlanmalı. |
| `scripts/verify-publish.sh` | 95 | ✓ | UNREFD. `set -e` eksik flag. TAMAMLA veya SİL. |
| `scripts/memory/backfill-stub-entries.mjs` | 115 | ✓ | USED (`src/`). Idempotent ✓, dist+src fallback ✓. Sihirli sayı `100`. |
| `scripts/memory/export-adr-fs.mjs` | 99 | ✓ | UNREFD (doküman'da zikredilmiş). dist-only fallback eksik. ADR-046 sync gate'i. |
| `scripts/memory/migrate-relations.mjs` | 188 | ✓ | UNREFD (Sprint 169 C1 manuel). `INSERT OR IGNORE` idempotent ✓, FK enforcement ✓. |
| `scripts/security/secret-baseline.mjs` | 126 | ✓ | USED (`.github/workflows/secret-scan.yml`). 10 regex pattern doğru ✓. NPM/Slack/JWT eklenmesi tavsiye edilir. `simpleHash` 32-bit collision riski. |

**Toplam:** 47 dosya — 2 uzantı dosyası + 45 betik (41 direkt + 3 memory/ + 1 security/). Hiçbir dosya boş bırakılmadı. Coverage-gap = 0.

---

**Audit özeti:** VS Code uzantısı stub aşamasında, kritik OSS GA blocker değil. Asıl risk `scripts/` dizininde toplanmış: %42 ölü betik (19/45), ADR-006 ihlali (10 dosya, 25+ çağrı), 1 HIGH log sızıntısı (`deploy-discord.sh:121`), Workspace Trust manifesti eksikliği. Memory script'leri (Sprint 169) ve `secret-baseline.mjs` (Sprint 169 H3) idempotency + `feedback_db_silmek_yasak` kuralına %100 uyumlu. Sprint 172 OSS GA conditional-blocker: Discord log sızıntısı + 19 ölü betik dispose + ADR-006 ihlali sweep + Workspace Trust manifest. Kapsam: 47/47 dosya (2 uzantı + 45 betik) — coverage-gap = 0.
