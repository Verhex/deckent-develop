# Cross-Platform Testing — Windows (native) + macOS

> **Yasa #2 dürüst-boşluk:** Bu proje "EVERY ENVIRONMENT" yasasına göre macOS · Linux ·
> Windows (native) · Windows (WSL) için tasarlanmış olmalı — ama bugüne kadar deckent'in
> **tüm** gerçek koşuları WSL2 (Linux) altında yapıldı. Bu doküman o boşluğu kapatıyor:
> Windows-native ve macOS'ta gerçekte NEYİN test edildiğini (CI'dan), NEYİN hiç
> çalıştırılmadığını ve bir insanın (Alperen) bu iki platformda deckent'i nasıl
> doğrulayacağını dürüstçe ortaya koyuyor. Aşağıdaki hiçbir madde "çalışıyor" iddiası
> DEĞİLDİR — açıkça **unverified** etiketlenmemiş tek bir satır bile "gerçek Windows/macOS
> makinede koşup PASS aldık" anlamına gelmez.

## 0. Önsöz — Bu Doküman Neyi Kapsamıyor

CI'da gerçekten ne çalışıyor (kod/workflow dosyalarından, varsayım değil):

- `.github/workflows/ci.yml` içindeki `test-windows` job'ı: `windows-latest` runner'da
  `npm ci` + `npm run ci:rebuild-native` + `npx vitest run tests/core/ tests/agents/`
  çalıştırıyor — ama `continue-on-error: true` ile **bilgilendirme amaçlı**, job'ın kendi
  yorumu: *"Windows is unsupported — this job is informational only"*. Yalnızca
  `tests/core/` ve `tests/agents/` altındaki **unit testler** koşuyor; CLI komut yüzeyi
  (init/doctor/plan/start/serve/cu-status/mcp/REPL) hiç dokunulmuyor.
- `.github/workflows/cross-platform-e2e.yml`: `macos-latest` + `ubuntu-latest` matrisinde
  `tests/e2e/cross-platform/` altındaki testleri (örn. `macos-tmux.test.ts`) çalıştırıyor —
  ama bunlar yalnızca düşük seviye heartbeat/result/tmux-session **mekaniğini** doğruluyor
  (3 sahte görevlik mini sprint, atomic write, oturum temizliği). Yine CLI komut yüzeyi
  test edilmiyor.
- Windows (native) için **hiçbir workflow'da** e2e/CLI-surface job'ı yok.

Sonuç: aşağıdaki §2 Doğrulama Matrisi'nde listelenen HER komut, Windows-native ve macOS
için şu ana kadar **hiç gerçek makinede çalıştırılmadı**. Bu doküman iki şey sağlıyor:
(a) o matrisi (kodun ürettiği gerçek flag/mesajlarla), (b) Alperen'in gerçek donanımda
koşup dolduracağı bir rapor şablonu (§5).

## 1. Kurulum

### 1.1 Windows (native, PowerShell)

1. **Node.js >= 24.0.0** (proje engine tabanı — `package.json` → `engines.node: ">=24.0.0"`,
   ADR-D-001). Kurulum:
   - Resmi yükleyici: https://nodejs.org (LTS kanalı 24'ü henüz taşımıyorsa Current/Nightly
     kanaldan indirin) **veya**
   - `winget install OpenJS.NodeJS` **veya**
   - `nvm-windows` ile: `nvm install 24.0.0` ardından `nvm use 24.0.0`
   - Doğrulama: `node --version` → `v24.x.x` ya da üstü beklenir.
2. **git**:
   - `winget install Git.Git` **veya** https://git-scm.com/download/win
   - Doğrulama: `git --version`
3. **deckent kurulumu** (paket henüz npm registry'de yayınlanmadıysa yerel `.tgz` ile —
   `deckent upgrade`'in yerel-tgz yolu ile aynı desen, bkz. `src/cli/commands/upgrade.ts`
   `upgradeFromLocal`):
   ```powershell
   npm install -g deckent
   # veya beta/yerel paket:
   npm install -g .\deckent-1.0.0-beta.1.tgz
   ```
   - Doğrulama: `deckent --version`
   - **⚠️ unverified gotcha:** `better-sqlite3` ve `@lydell/node-pty` native (derlenmiş)
     eklentilerdir. İkisi de yaygın Node ABI/mimari kombinasyonları için önceden-derlenmiş
     ikili (prebuilt binary) dağıtır; eşleşen bir prebuild yoksa npm kaynak-derlemeye
     düşer ve bu da Visual Studio Build Tools (C++ iş yükü) + Python gerektirir. Bu yol
     bu sprintte gerçek Windows donanımında hiç denenmedi — burada bir `node-gyp` hatası
     alınırsa bu bir kullanıcı hatası değil, dokümante edilmemiş bir kurulum adımıdır.
4. Kurulumdan hemen sonra `deckent doctor` çalıştırın (bkz. §2.2) — makinenin ilk dürüst
   okuması budur.

### 1.2 macOS

1. **Node.js >= 24.0.0**:
   - `brew install node@24` **veya** `nvm install 24 && nvm use 24`
   - Doğrulama: `node --version`
2. **git**: genelde Xcode Command Line Tools ile gelir (`xcode-select --install`); yoksa
   `brew install git`
   - Doğrulama: `git --version`
3. **deckent kurulumu**:
   ```bash
   npm install -g deckent
   # veya beta/yerel paket:
   npm install -g ./deckent-1.0.0-beta.1.tgz
   ```
   - Doğrulama: `deckent --version`
   - **⚠️ unverified gotcha:** aynı native-eklenti riski Windows ile aynı — Apple Silicon
     (arm64) ile Intel (x64) mimarisi için `better-sqlite3`/`@lydell/node-pty`
     prebuild'lerinin Node 24 ABI'siyle uyumluluğu bu sprintte doğrulanmadı.
4. `deckent doctor` çalıştırın (bkz. §2.2).

## 2. Doğrulama Matrisi

Her komut için: gerçek flag'ler (kaynak dosya + satır referansıyla), koşulacak komut, ve
kodun ürettiği **beklenen** çıktı (gerçek makinede henüz gözlemlenmedi — "beklenen"
"onaylandı" değildir).

### 2.1 `deckent init`

Gerçek flag'ler (`src/cli/commands/init.ts:309-323`): `--auto`, `--manual`, `--cursor`,
`--claude-code`, `--env <envs>`, `--all-envs`, `--upgrade`, `--force`, `--repair`,
`-y, --yes`, `--no-install`, `--no-image`.

```
deckent init --auto -y
```

Beklenen akış (`init.ts:342-568`): splash + welcome banner → `--auto` ile sistem/abonelik/
proje otomatik algılanır (`init.ts:344-361`) → `.deckent/`, `.brain/`, `.tasks/`, `.locks/`
dizinleri oluşturulur → `config.json` yazılır → `DIRECTIVES.md` üretilir → provider
algılama + rehberlik yazdırılır → IDE ortamı algılanır (`init.ts:517-533`, Windows/macOS'ta
`detectIDEEnvironment` ya da `--cursor`/`--claude-code` bayrağı) → kapanışta "Next steps"
bloğu (`formatNextSteps`).

**unverified:** gerçek Windows Terminal / macOS Terminal.app'te splash+renk render'ı;
`--claude-code` ile `.claude/` dizininin native dosya izinleriyle doğru yazıldığı.

### 2.2 `deckent doctor`

Gerçek flag'ler (`src/cli/commands/doctor.ts:2020-2033`): `--profile`, `--legacy`,
`--json`, `--pre-flight`, `--providers`, `--memory`, `--ram-experiment`, `--fix-image`,
`--fix`, `-y, --yes`, `--dry-run`.

```
deckent doctor
```

Beklenen ("Your System" bloğu, `formatHumanDoctor`, `doctor.ts:1162` vd.):
- **Platform satırı** — `checkPlatform` (`doctor.ts:74-127`):
  - Windows'ta `spawn_backend` yoksa/`tmux` ise: *"Windows UNSUPPORTED for tmux backend —
    use WSL2 for full features. Subprocess mode only."* (bu check `required:false`,
    dolayısıyla genel `NOT READY` sonucunu tek başına tetiklemez)
  - Windows'ta `spawn_backend=subprocess`: *"Windows (subprocess backend — fully
    supported; tmux not required)"*
  - Windows'ta `spawn_backend=docker`: *"Windows (docker backend — fully supported via
    Docker Desktop; tmux not required)"*
  - macOS'ta: *"macOS (fully supported)"*
- **tmux satırı** — `checkTmux` (`doctor.ts:255-287`): Windows'ta HER ZAMAN
  "not required" (gerçek `tmux -V` hiç çağrılmaz); macOS'ta gerçek `tmux -V` çağrılır —
  `brew install tmux` yoksa ve `claude` provider aktifse `required:true` olur ve check
  FAIL döner.

```
deckent doctor --json
```

Beklenen: `DoctorResult` şeklinde JSON (`checks[]` dizisi) — otomasyon/CI tüketimi için.

### 2.3 `deckent plan`

Gerçek flag'ler (`src/cli/commands/plan.ts:83-90`): `--no-confirm`, `-y, --yes`,
`--structured`, `--dry-run`, `--interrogate`.

```
deckent plan --dry-run
```

Beklenen (`plan.ts:209-212`): stdout'ta tam olarak `"[dry-run] No task files written to
disk."` satırı + plan tablosu (`ID | Title | Model | Priority` sütunları); `.tasks/`
altına hiçbir dosya yazılmaz.

### 2.4 `deckent start` (subprocess backend)

Gerçek flag'ler (`src/cli/commands/start.ts:159-169`): `[description]` (pozisyonel),
`--auto-approve`, `--sandbox-mode`, `--sandbox`, `--dry-run`, `--force`, `--watch`,
`--timeout <ms>`, `--force-directives`.

Windows-native ve (Docker kurulu değilse) macOS'ta sprint **subprocess backend** ile
koşar: `resolveBackend('auto')` POSIX'te `'docker'`e çözülür (`orchestra/spawn-backend.ts
:450-452`), ama Windows'ta `deckent init` sırasında `spawn_backend` zaten `'subprocess'`
olarak otomatik ayarlanır (`cli/commands/init-steps.ts:214-217`).

```
deckent start "smoke test task" --dry-run
```

Beklenen (`start.ts:307-361`): sprint planlanır, worker/model tablosu + maliyet tahmini
(`formatEstimate`) yazdırılır, kapanışta i18n mesajı `start.dry_run_complete` →
*"Dry-run complete. No workers spawned."* — hiçbir worker spawn edilmez.

**unverified:** `--dry-run` OLMADAN gerçek spawn (subprocess worker'ların gerçekten
başlayıp `.tasks/*.hb` / `.tasks/*.result` üretmesi) bu sprintte Windows/macOS'ta hiç
denenmedi.

### 2.5 `deckent serve`

Gerçek flag'ler (`src/cli/commands/serve.ts:59-66`): `--port <number>` (varsayılan
`3100`), `--dev`, `--dev-port <number>` (varsayılan `5173`), `--host <addr>` (varsayılan
`127.0.0.1`), `--no-terminal`.

```
deckent serve --port 3211
```

Beklenen (`serve.ts:116-133`, i18n mesajları `messages.ts:1531-1554`):
```
Deckent is ready — http://127.0.0.1:3211

  Token     API token auto-injected into dashboard HTML (localhost: no extra step)
  Terminal  embedded PTY enabled (token auto-injected for localhost callers)
  Stop      Ctrl+C
  Tips      deckent serve --port <n>  --host <addr>
```
(`--no-terminal` verilirse veya host localhost değilse "Terminal disabled — pass
--terminal on localhost to enable" satırı gelir.)

Smoke doğrulama (host tarafında, ayrı terminalde): `curl http://127.0.0.1:3211/` → HTTP
200 beklenir (API server route'larının tamamı bu dokümanın kapsamı dışında; burada
yalnızca `serve` komutunun kendisi + beklenen stdout doğrulanıyor).

**unverified:** Windows-native'de gömülü terminal (`LocalPtyBackend`,
`@lydell/node-pty` tabanlı) gerçekten bir PTY açabiliyor mu — hiç denenmedi.

### 2.6 `deckent cu-status`

Gerçek flag'ler (`src/cli/commands/cu-status.ts:207-210`): `--json`.

```
deckent cu-status
```

Beklenen — `computer_use` bayrağı varsayılan **kapalı**ysa (`cu-status.ts:128-132`,
`messages.ts:2823-2829`):
```
Computer-Use Status (TOOL-CU)

Flag: disabled — <config'den gelen sebep>

To enable: set "computer_use": { "enabled": true, "allowed_capabilities": [...] } in
.deckent/config.json (project or global), then rerun `deckent cu-status`.
```
Bayrak açıksa (`cu-status.ts:135-157`): `Flag: enabled` + `Platform: <platform> (known)`
+ izinli yetenek listesi + her `ComputerUseActionKind` için `available`/`unavailable —
<sebep>` satırı. Platform algılama (`detectCuPlatform`, `cu-status.ts:54-59`):
Windows→`win32`, macOS→`darwin`, Linux(WSL değil)→`linux`, Linux+WSL→`wsl`. Yetenek
kontrolü altta Windows/WSL'de `powershell.exe`, macOS'ta `osascript`, Linux'ta
`xdotool`/`grim`/`scrot`/`gnome-screenshot` arar (`core/computer-use-exec.ts`).

### 2.7 MCP Kayıt

- Binary: `deckent-mcp` (`package.json` `bin` → `dist/mcp/server.js`) — stdio transport,
  argümansız çalışır.
- **Claude Code:** `getMCPGuidance('claude-code')` (`cli/helpers/wizard.ts:198-202`) →
  *"Claude Code detected — MCP is auto-configured via .claude/ settings. No additional
  setup needed for deckent MCP tools."*
- **Cursor:** `getMCPGuidance('cursor')` (`wizard.ts:203-208`) → `~/.cursor/mcp.json`
  içine elle:
  ```json
  { "mcpServers": { "deckent": { "command": "deckent-mcp", "args": [] } } }
  ```
  veya `deckent init --cursor` ile otomatik.
- **Genel CLI** (proje/user/local scope, `cli/commands/mcp.ts:320-377`):
  ```
  deckent mcp add deckent deckent-mcp --scope user
  deckent mcp list
  deckent mcp get deckent
  ```
  Beklenen: `mcp.added` mesajı (`"MCP server \"deckent\" added to user scope
  (stdio)."`), ardından `deckent mcp list` çıktısında `Name | Transport | Target`
  tablosunda `deckent | stdio | deckent-mcp` satırı.

**unverified:** Windows'ta npm global bin dizininin (dolayısıyla `deckent-mcp`'nin) PATH'e
otomatik eklenip eklenmediği — bazı kurulum senaryolarında elle eklenmesi gerekebilir,
bu sprintte doğrulanmadı.

### 2.8 REPL-smoke

Kaynak: `scripts/repl-smoke-verify.mjs` — gerçek `spawn()` tabanlı, build sonrası
`dist/cli/entry.js`'e karşı çalışan smoke harness (bu WSL2 ortamında zaten PASS alıyor,
ama Windows/macOS'ta hiç koşmadı). Manuel insan-eşdeğeri:

```
deckent
```
(argümansız — `entry.ts`'teki `shouldLaunchDefaultRepl` mantığı devreye girer, Commander
dispatch'ine hiç gitmez.)

Adımlar (harness'in `evaluate*` fonksiyonlarının insan karşılığı):
1. REPL açılır açılmaz status-line görünmeli: `deckent  <provider>  <dir>`
   (`evaluateStatusLine`).
2. `/help` yazın → 1 saniyeden hızlı komut listesi dönmeli (yerel işlem, LLM çağrısı
   yok) (`evaluateHelpQuick`).
3. Düz bir mesaj yazın (örn. `hello`) → LLM'e gitmeden ÖNCE `› hello` satırı hemen
   görünmeli (`evaluateLayoutSeparation`).
4. `/exit` → temiz çıkış (hang yok).

Otomatik eşdeğeri (build sonrası çalıştırılabilir): `node scripts/repl-smoke-verify.mjs`

**unverified:** gerçek Windows Terminal / macOS Terminal.app veya iTerm2 üzerinde ANSI
render'ı ve klavye girişi davranışı (readline vs. native raw-mode) hiç gözlemlenmedi.

## 3. Platform Gotcha'ları (koddan, satır-referanslı)

- **tmux Windows'ta native yok** — `doctor.ts:76-103` (`checkPlatform`), `doctor.ts:255-
  287` (`checkTmux`): backend `docker`/`subprocess` değilse "UNSUPPORTED for tmux
  backend" uyarısı. İzahat metni `messages.ts:393-396`
  (`doctor.platform_adapt_tmux`).
- **Windows'ta tmux backend hiçbir zaman seçilmez** — `orchestra/spawn-backend.ts:451-
  452` (`resolveBackend('auto')` POSIX'te `'docker'`e çözülür), ama
  `cli/commands/init-steps.ts:214-217` init sırasında Windows'ta `spawn_backend`'i
  doğrudan `'subprocess'`e sabitliyor.
- **ACL/izin farkı** — Windows NTFS ACL kullanır, POSIX chmod bitleri yok.
  `doctor.ts:1517-1533` (`checkWritePermissions`, `accessSync(W_OK)`) çalışır ama
  eşdeğer koruma garantisi vermez; `messages.ts:397-400`
  (`doctor.platform_adapt_permissions`) bunu açıkça söylüyor. `.deck-shadow` üzerindeki
  `chmodSync` çağrısı (`doctor.ts:1920`, `DECK_SHADOW_SAFE_MODE`) Windows'ta aynı
  koruma etkisine sahip DEĞİL.
- **Path ayracı** — Windows ters-eğik-çizgi kullanır. `core/global-scope-resolver.ts`
  (satır ~199-243) ve `core/config.ts:1406`, `core/global-store.ts:87` platforma göre
  `win32`/`posix` path API'si seçiyor; ama literal path-string karşılaştırmaları (örn.
  `.gitignore` girdi kontrolü, `doctor.ts` `checkGitignore`) farklı davranabilir —
  `messages.ts:401-404` (`doctor.platform_adapt_paths`).
- **Global config dizini platforma göre değişir** — `core/state-paths.ts` +
  `core/global-scope-resolver.ts`: Windows → `%APPDATA%\deckent` (Roaming, config/data)
  + `%LOCALAPPDATA%\deckent` (Local, cache/state); macOS →
  `~/Library/Application Support/deckent`; Linux → `~/.deckent` (posix join).
  `DECKENT_HOME` env override her platformda tüm rolleri tek dizine indirger
  (`global-scope-resolver.ts:108-121`).
- **Docker-backend durumu** — `doctor.ts:1550-1605` (`checkDocker`): `spawn_backend`
  açıkça `'docker'` seçilmedikçe zorunlu değil. Windows'ta Docker Desktop (WSL2 backend
  üzerinden) gerekir; `checkPlatform` bu kombinasyonu "fully supported via Docker
  Desktop" olarak işaretliyor (`doctor.ts:81-88`) — ama gerçek Docker
  Desktop-on-native-Windows bu sprintte hiç denenmedi.
- **spawn farkları (`shell:true` zorunluluğu)** — Windows'ta npm global kurulumların
  ürettiği `.cmd`/`.bat` shim'leri doğrudan spawn edilemediği için birçok çağrı
  `shell: process.platform === 'win32'` ile yapılıyor: `providers/claude.ts:231,269`,
  `cli/commands/chat.ts:390`, `cli/commands/onboard.ts:45`, `agents/worker.ts:644`,
  `orchestra/baseline-tracker.ts:102`, `core/plugin-hooks.ts:399,581`,
  `core/subscription.ts:48`, `core/provider.ts:373`. Bütün bu çağrılar sabit/literal
  argümanlarla yapılıyor (kullanıcı girdisi doğrudan shell'e enjekte edilmiyor), ama
  gerçek Windows'ta hiç çalıştırılmadı.
- **Worker process-group sinyali Windows'ta yok** — `providers/subprocess.ts:481-497`
  (`signalWorkerGroup`): POSIX'te negatif-pid ile tüm process group'a sinyal
  gönderilir; Windows'ta bu semantik yok, yalnızca doğrudan worker pid'i sinyallenir —
  worker'ın spawn ettiği torun process'ler hayatta kalabilir. Kod bunu bilinçli-eksik
  olarak işaretliyor (yorum: *"roadmap item... taskkill /T follow-up"*).
- **computer-use (TOOL-CU) araç farkları** — `core/computer-use-exec.ts`:
  screenshot/click/type için Linux'ta `xdotool`/`grim`/`scrot`/`gnome-screenshot`,
  macOS'ta `osascript`, Windows/WSL'de `powershell.exe`
  (`System.Windows.Forms`/`SendKeys`) aranıyor — hiçbiri bu sprintte gerçek
  Windows/macOS'ta denenmedi (yalnızca sahte-prober ile unit test edildi).
- **WSL2 Docker bellek uyarısı** — `orchestra/spawn-backend-docker.ts:869-882`:
  `/proc/version`'da `"microsoft"`/`"WSL"` tespit edilir ve toplam RAM <6GB ise uyarı
  basılır (Docker container'ları WSL2'nin bellek havuzunu paylaşır). Bu kontrol
  yalnızca linux+WSL2 dalında var; native Windows/macOS'ta Docker bellek uyarısı farklı
  yoldan geliyor (`checkDocker`, `doctor.ts:1583-1596`,
  `docker info --format {{.MemTotal}}`).
- **Yerel `.tgz` yükseltme yolu** — `cli/commands/upgrade.ts:349-363`
  (`upgradeFromLocal`): Windows'ta `shell: true` ile `npm install` çağrılıyor; native
  Windows'ta `deckent upgrade`/yerel-tgz kurulumu hiç denenmedi.

## 4. Bilinen Eksikler — Dürüst Tablo

| Platform | Gerçekte test edilen (kod/CI kanıtı) | Hiç test edilmeyen (bu sprint itibarıyla) | Etiket |
|---|---|---|---|
| **Windows (native)** | `.github/workflows/ci.yml` `test-windows` job'ı: `windows-latest` runner, `npm ci` + `npm run ci:rebuild-native` + `npx vitest run tests/core/ tests/agents/` (yalnız unit test). Job `continue-on-error: true`; kendi yorumu: *"Windows is unsupported — this job is informational only."* | §2'deki HER komut (init/doctor/plan/start/serve/cu-status/mcp/REPL); gerçek Docker Desktop; native terminal render'ı; PowerShell `shell:true` spawn yolları; native-eklenti (better-sqlite3/node-pty) kurulumu | **unverified** |
| **macOS** | `.github/workflows/cross-platform-e2e.yml`: `macos-latest` + `tmux` backend, `tests/e2e/cross-platform/macos-tmux.test.ts` — düşük seviye HB/result/tmux-session mekaniği (3 görevlik mini sprint, atomic write, oturum temizliği) | §2'deki HER komut (init/doctor/plan/start/serve/cu-status/mcp/REPL); Homebrew/Xcode CLT onboarding; `osascript` tabanlı computer-use yetenekleri; native-eklenti kurulumu | **unverified** |
| **Linux (WSL2)** | Bu sprintin fiilen çalıştığı ortam — tüm CLI komutları burada gerçekten koşuyor | — (referans/geliştirme ortamı; bu dokümanın hedefi zaten bunun DIŞI) | doğrulanmış (yalnızca bu ortam için) |

Not: Bu tablo workflow ve test dosyalarından çıkarıldı — varsayım değil. **"unverified"**
= kod incelemesi ve unit-test seviyesinde mantık tutarlı görünüyor, ama gerçek makinede
hiç çalıştırılmadı. Bu asla "çalışıyor" anlamına gelmez; yalnızca §5'teki rapor
doldurulduktan sonra bir satır "PASS"/"FAIL" olabilir.

## 5. Sonuç-Raporlama Şablonu

Alperen'in gerçek Windows-native veya macOS makinede §2'yi koşup doldurması için —
her platform koşusu için bu bloğu kopyalayın:

```markdown
### Koşu — <Windows native | macOS> — <YYYY-MM-DD>

**Ortam**
- İşletim sistemi + sürüm:
- Node.js sürümü (`node --version`):
- npm sürümü (`npm --version`):
- Terminal (Windows Terminal / PowerShell / Terminal.app / iTerm2 / ...):
- deckent sürümü (`deckent --version`):

**Sonuçlar** (PASS / FAIL / UNVERIFIED-SKIPPED + kısa not)

| # | Adım | Sonuç | Not |
|---|------|-------|-----|
| 1.x | Kurulum (Node/git/npm install -g) | | |
| 2.1 | `deckent init --auto -y` | | |
| 2.2 | `deckent doctor` | | |
| 2.2 | `deckent doctor --json` | | |
| 2.3 | `deckent plan --dry-run` | | |
| 2.4 | `deckent start "<desc>" --dry-run` | | |
| 2.5 | `deckent serve --port 3211` (+ curl smoke) | | |
| 2.6 | `deckent cu-status` | | |
| 2.7 | `deckent mcp add/list/get` | | |
| 2.8 | REPL-smoke (`deckent` + /help + /exit) | | |

**Genel sonuç:** GO / GO_WITH_ISSUES / NO_GO
**Koşan:** <isim>
**Tarih:** <YYYY-MM-DD>
```

Bu şablon her satır için gerçek bir gözlem talep eder — boş bırakılan veya
"muhtemelen çalışır" gibi yorumlanan satırlar rapor tamamlanmış SAYILMAZ.
