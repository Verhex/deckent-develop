# Desktop-Shell Araştırması — Electron Kararının Doğrulanması (DESK-1 / ADR-G-033)

**Tarih:** 2026-07-08 · **Yöntem:** 3 paralel araştırma ajanı (Context7 resmi-doc + web, ~130 kaynak-URL) + repo-yerinde kanıt taraması
**Bağlam:** Alperen kararı — deckent developer-katmanı üründen **uygulamaya** dönüşecek (CLI + MCP kalır). Soru: Electron mu, en uyumlu yol ne?
**Ön-durum:** ADR-G-033 (accepted, immutable-class) desktop'ı zaten **Electron / DESK-1** olarak seçmiş; MASTER-PLAN #496 plan-satırı açık. Bu doküman kararı yeniden-açmaz — 2026 kanıtıyla **doğrular ve mimariyi somutlaştırır** (feedback_dont_relitigate_decided_architecture uyumlu).

---

## 1. SONUÇ (TL;DR)

**Electron — doğrulandı.** Ama asıl kazanım kabuk seçimi değil, **mimari**: Electron kabuğu *ince istemci* olmalı; deckent çekirdeği **system-Node üzerinde `deckent serve` daemon'ı** olarak yaşamalı, kabuk onu spawn/adopt edip mevcut HTTP+SSE+WS API üzerinden konuşmalı. Bu tek kararla:

- better-sqlite3 + node-pty **Electron-ABI rebuild problemi tamamen ortadan kalkar** (bkz. §5 — better-sqlite3 v12'nin Electron prebuild gecikmeleri belgeli ve kronik),
- CLI + MCP + desktop **aynı çekirdek process'i** paylaşır (tek runtime, tek test matrisi),
- **WSL senaryosu özel-durum değil connection-profile olur** (Windows kabuğu → WSL'deki daemon'a localhost; VS Code Remote-WSL deseni),
- Terminal paneli **bedavaya gelir** — PTY zaten daemon'da (`src/api/server.ts` PtySessionManager + LocalToken/Jwks auth, ADR-G-029 teslimi).

Tauri **bu ürün için** yanlış: Node çekirdeği yeniden yazılamayacağına göre tüm ürün, gerek olmayan bir Rust process'in yönettiği "sidecar"a dönüşür; 2026'daki tek kanıtlanmış Tauri+Node deseni (Yaak) platform başına tam Node 24 binary'si gömerek Tauri'nin boyut avantajını zaten geri veriyor. Linux WebKitGTK, tam da deckent'in yükü olan xterm.js + canlı-stream'de resmi olarak sorunlu → 🔒 Yasa #2 (her ortamda dürüst çalışma) ihlal riski.

---

## 2. Kanıt Matrisi — kategori ne seçti? (Temmuz 2026)

Deckent'in birebir kategorisi (AI coding-agent, Node/TS çekirdek, web-dashboard + terminal):

| Ürün | Kabuk | Not |
|---|---|---|
| Claude Desktop / Claude Code Desktop / Cowork (Anthropic) | **Electron** | Tek app, Chat/Cowork/Code sekmeleri; lider Felix Rieseberg (Electron kurucu-kadrosu). Linux beta (apt/.deb) dahil |
| Codex Desktop (OpenAI) | **Electron** | Açık gerekçe: "VS Code extension ile kod paylaşımı + Windows'a hızlı çıkış" — deckent'in durumu birebir |
| ChatGPT desktop | macOS **native Swift** / Windows **Electron** | Tek büyük native istisna macOS tarafı |
| Cursor · Windsurf · Google Antigravity | **Electron** (VS Code fork) | Cursor: 1M+ DAU, $2B ARR — tarihin en hızlı büyüyen dev-ürünü Electron'da |
| Wave Terminal | **Electron** + xterm.js + Go backend | Deckent'e en yakın mimari kuzen: compiled-backend + tek RPC (local/WSL/SSH) |
| Warp · Zed | Rust + GPU (native) | Web-dashboard yatırımını çöpe atmayı gerektirir; Node-çekirdekli hiçbir ürün bu yolu seçmedi |
| Jan · Hoppscotch | Tauri | Küçük local-AI oyuncuları; Rust-backend'li ya da backend'siz |
| **AFFiNE · opencode** | **Tauri → Electron GERİ DÖNÜŞ** | Gerekçeler: webview tutarsızlığı, plugin olgunluğu, debug ergonomisi |

**"Electron ölüyor" anlatısı veriyle desteklenmiyor:** OpenJS governance, 8-haftalık Chromium-kilitli cadence, VS Code (%75.9 developer), Slack, Discord (~200M MAU), Notion (100M+ MAU), Figma, 1Password 8. Karşı-sinyal dar: yeni küçük projelerde Tauri repo-büyümesi (+%55 YoY) — ama *sevkiyat yapan devler* Electron'da. Teams/WhatsApp'ın ayrılışı WebView2'ye (yine web-UI, Microsoft-only) — native'e değil.

Kaynak-yoğun döküm: ajan-2 raporu (ekosistem), bu dokümanın kaynağı olan üç ajan raporu oturum transkriptinde; kritik URL'ler ilgili bölümlerde inline.

---

## 3. Tauri neden bu ürün için elenmiş (2026 gerçekleri)

Tauri 2.11.5 (Tem 2026) *Rust-app kabuğu olarak* olgun: audited güvenlik modeli, imzalı updater, 30+ resmi plugin. Elenme nedenleri deckent'e özgü:

1. **Node sidecar cehennemi:** Node SEA, Node 24'te **CJS-bundle zorunlu** (ESM entry ancak v25.7+), native addon'lar (`.node`) blob'a gömülemez → loose dosya; `pkg` Vercel'de arşivlenmiş (fork: @yao-pkg). Tek kanıtlanmış desen = **Yaak**: platform-triple başına tam Node 24 binary'si vendorla + WebSocket ile konuş (~50MB/platform geri verilir). Resmi Tauri Node-sidecar rehberi hâlâ ölü `pkg`'yi öneriyor — yolun ne kadar az işlek olduğunun kanıtı.
2. **WebKitGTK (Linux) resmi zayıf halka:** Tauri'nin kendi doc'u itiraf ediyor — "WebGL-ağır view'lar (**terminal emülatörleri**, editörler, chart'lar) yüksek input-latency / düşük FPS gösterir" (https://v2.tauri.app/develop/debug/linux-graphics/). Maintainer'lar "iyi Linux desteği gerekenler için %100 önerilemez" diyor (tauri discussion #8524). Bu, deckent'in xterm.js + SSE-stream yükünün tam üstü.
3. **3-motor QA vergisi kalıcı:** WKWebView/WebView2/WebKitGTK — Tailwind 4 modern-CSS'i WebKitGTK'da geride; "macOS'ta geliştirdim Windows'ta jank" (HN Tauri→Electron başlığı, id=44118251). Tauri→Electron dönen ekiplerin ortak gerekçesi.
4. **Enterprise boşlukları:** MSIX yok (Store + modern-Intune bloklu), macOS universal-binary sürtünmesi (DoltHub değerlendirmesi: https://www.dolthub.com/blog/2025-11-13-electron-vs-tauri/ — Node-backend'le Tauri'yi deneyip Electron'da kaldılar).
5. Kazanımı (küçük installer/RAM) deckent'te nötralize: baskın RAM tüketicisi Node çekirdeği + worker'lar — hiçbir kabuk bunu kaldırmıyor.

**Diğer alternatifler tek-satır:** Wails v3 = hâlâ **alpha** + aynı webview üçlüsü + Go toolchain → hayır. Neutralino = mimari olarak en yakın (Node-extension + WS token-handshake) ama imzalama/updater/MSI şasisi yok → enterprise-diskalifiye. Electrobun = heyecanlı ama Bun-bağımlı, 2.0'da runtime değiştiriyor → izleme listesi. Socket Runtime + Gluon = **ölü** (arşivlenmiş). Flutter/Capacitor = yanlış stack. **PWA/no-shell** = geçiş dönemi için güçlü köprü (aşağıda §7).

---

## 4. Seçilen Mimari — İnce Kabuk + Daemon-Client

Üç seçenek değerlendirildi (ajan-1 raporu §2):

| Kriter | (a) core main-process'te | (b) utilityProcess | **(c) system-Node daemon** |
|---|---|---|---|
| Native-modül Electron-ABI rebuild | gerekli | gerekli (ELECTRON_RUN_AS_NODE bile kaçırmaz) | **GEREKSİZ** |
| CLI/MCP ile tek çekirdek | hayır (2. runtime) | hayır (2. runtime) | **evet — aynı process** |
| Crash izolasyonu | yok | iyi | **en iyi** (daemon kabuktan uzun yaşar → sprint'ler pencere kapansa da sürer) |
| WSL (Win kabuk → WSL core) | imkânsız | imkânsız | **doğal** (localhost HTTP/WS) |
| MCP stdio server barındırma | — | **olmaz** (stdin=ignore) | olur |
| Streaming | ipcMain relay | MessagePort (en hızlı) | WS/SSE (**zaten yazılı**) |

**Karar önerisi: (c).** Electron kabuğu = pencere + tray + preload-IPC (yalnız UI-grade yetenekler) + `deckent serve`'in spawn/adopt yaşam-döngüsü. Renderer = mevcut dashboard-Vite build'i + chat yüzeyi; veri düzlemi = token'lı localhost API. `utilityProcess` yalnız ileride "embedded/zero-config mod" (makinede Node yok senaryosu) gerekirse — o gün §5 ABI konusu yeniden açılır.

DESK-1 satırındaki taslakla ("dashboard-Vite + mevcut /api serve + preload-IPC") birebir uyumlu; ADR-G-033'ün "chat Desktop'a taşınır" hükmünü ve ADR-G-034'ün "terminal birincil yüzey" hiyerarşisini bozmaz.

**Daemon sertleştirme listesi (multi-tenant güvenlik, Yasa #1-#2):**
- yalnız `127.0.0.1` bind + kabuk-üretimi per-session bearer token (aynı makinedeki başka OS-user daemon'ı süremez),
- PID-file + health endpoint → adopt-vs-spawn kararı; orphan-shutdown politikası **kullanıcı ayarı** (sprint pencereden uzun yaşayabilmeli),
- endpoint (`host:port` + token) first-class **connection-profile** → WSL, SSH-tünel ve container aynı istemci kod-yoluna genelleşir (VS Code Remote deseninin generalizasyonu; Wave Terminal "WSH RPC" bunun kanıtı).

---

## 5. Native Modül Gerçeği (daemon mimarisinin en güçlü gerekçesi)

- **better-sqlite3 v12 + Electron = belgeli kronik acı:** kasıtlı raw-V8 (N-API değil) → Electron-major başına ayrı binary. 2026 zaman çizelgesi: v12.9.1 "Electron 39+ prebuild'ler kırık", v12.10.0 Electron-42 desteği **geri alındı**, v12.11.0 "viable değil", Electron 43 prebuild'i ancak 43.0.0'dan 3 gün sonra (v12.11.2, 3 Tem 2026). Gömülü modda kural: Electron major'ı prebuild'i yayınlanana kadar upgrade bloklu.
- **@lydell/node-pty**: N-API tabanlı (muhtemelen Electron'da yüklenir) ama **hiç rebuild edilemez** — prebuilt-only, C++ kaynakları yok. Uyumsuzlukta tek çare fork değiştirmek.
- **Daemon modunda ikisi de bugünkü npm Node-ABI prebuild'leriyle aynen çalışır — problem sınıfı yok olur.**
- Ek: Electron 43 Node 24.18 gömer; kullanıcının system-Node'u (≥24, ileride 26) daha yeni olabilir — gömülü modda Electron'un Node minor'ına pinlenirsin, daemon modunda kendi floor'unu korursun.

## 6. Tooling / Dağıtım / Güvenlik Kararları

- **Build:** electron-vite (yalnız main+preload; renderer=mevcut dashboard build'i) + **electron-builder**. Forge'un Vite plugin'i 2026'da hâlâ resmi-experimental. electron-vite ESM-main + `.mjs` preload üretir (sandboxed preload = CJS-bundle, bilinen kural).
- **Sürüm:** Electron ≥ 41 (desteklenen tüm major'lar Node 24); hedef **43** (Chromium 150). 8-haftalık cadence upgrade-loop'u planla (desteklenen son 3 major).
- **Auto-update:** electron-updater + generic-HTTPS/S3/Keygen **private provider** + `stagingPercentage` staged-rollout + kanal (latest/beta/alpha). update.electronjs.org yalnız public-OSS repo'ya çalışır.
- **Enterprise dual-channel (kritik):** self-serve = NSIS + electron-updater; managed fleet = **MSI (upgradeCode sonsuza dek sabit!) + in-app updater TESPİT-EDİLİP-KAPALI** (Intune/SCCM SYSTEM-context; electron-updater MSI'ı güncelleyemez — birlikte-açık olması bilinen failure-mode). `DISABLE_AUTO_UPDATE` registry/GPO policy'si sun.
- **İmzalama:** macOS = Developer ID + notarytool (imzasız app fiilen çalışmaz). Windows = **Azure Trusted Signing Türkiye'ye kapalı** (US/CA-gate) → OV/EV + cloud-HSM (DigiCert KeyLocker / SSL.com eSigner / Azure Key Vault); EV artık SmartScreen'i anında geçmiyor (2024'te kaldırıldı) — itibar zamanla. Publisher-identity değişimi update-trust zincirini sıfırlar: baştan doğru seç. Linux = AppImage (electron-updater'ın tek Linux formatı) + deb/rpm kendi repo'muzdan.
- **Güvenlik taban çizgisi:** contextIsolation+sandbox default'ları AÇIK kalır; `contextBridge` ile dar, **typed** UI-only yüzey (paylaşılan d.ts kontrat); her `ipcMain.handle`'da sender-frame doğrulama; navigation lockdown; **fuses** (`runAsNode`/`nodeOptions` kapalı + ASAR-integrity) → imzalı binary'miz genel-Node-interpreter olarak kötüye kullanılamaz. Substantive her şey token'lı daemon API'den → renderer blast-radius'u web-dashboard'la özdeş kalır.
- **Terminal paneli:** xterm.js (WebGL addon) renderer'da; PTY **daemon'da** (mevcut PtySessionManager). Flow-control şart: xterm ~50MB input-cap → node-pty `pause()/resume()` backpressure. ConPTY = Win10 1809+; winpty node-pty 1.x'te kaldırıldı. WSL terminali daemon-side PTY sayesinde bedava.
- **Kaynak maliyeti gerçeği:** tipik installer 80–200MB, idle RAM ~120–180MB, cold-start 1.5–3.2s (disiplinli app <500ms, Electron 34+). Mitigasyon sırası: lazy-import (1 numaralı kaldıraç) → `show:false`+ready-to-show → V8 snapshot (Inkdrop -1000ms; yüksek-bakım, day-one değil).

## 7. Aşamalandırma (No-MVP ile çelişmez — hepsi tam-kapsam, sıra meselesi)

1. **Köprü (bugün zaten var):** `deckent serve` + tarayıcı/PWA — WSL-doğru, sıfır paketleme. Desktop kabuğu gelene dek resmi yol olarak belgelenir.
2. **DESK-1 iskeleti:** electron-vite main+preload + daemon spawn/adopt + connection-profile + token-handshake + dashboard-renderer + chat yüzeyi (ADR-G-033 gereği chat buraya taşınır) + tray/notification.
3. **Terminal paneli:** xterm.js ↔ daemon-PTY (ADR-G-029 yüzeyinin desktop istemcisi) + flow-control.
4. **Dağıtım şasisi:** imzalama zinciri (TR-uyumlu CA) + electron-updater private-server + MSI kanal + winget/Homebrew/apt.
5. **İleri:** embedded-mode (utilityProcess) yalnız gerçek talep doğarsa; V8-snapshot optimizasyonu; MSIX/Store.

## 8. Riskler ve Karşılıklar

| Risk | Karşılık |
|---|---|
| 8-haftalık Electron cadence (yalnız son 3 major destekli) | Upgrade-loop'u CI'ya bağla; daemon mimarisi sayesinde upgrade = yalnız kabuk, çekirdek etkilenmez |
| Chromium monokültürü (ör. macOS Tahoe GPU bug'ı Slack/Discord/VS Code'u aynı anda vurdu, Eki 2025'te fixli) | Kabuk ince → etki yüzeyi UI ile sınırlı; hızlı patch-cadence zaten Electron'un güçlü yanı |
| "Electron premium değil" eleştirisi (Daring Fireball, Tem 2026 — Claude mac-app eleştirisi) | UI-craft yatırımı (frontend-design çıtası); native-menü/kısayol/dock entegrasyonuna özel emek; ChatGPT-macOS'un native olduğu pazarda fark yaratma alanı |
| Daemon port'una yerel saldırgan | 127.0.0.1 + per-session token + fuses; mevcut Jwks/LocalToken auth katmanı |
| better-sqlite3 gelecekte embedded-mode isterse | O gün Electron-major/prebuild kilit-adımı kuralı devreye girer (§5) |

## 9. Kaynak Notu

Üç ajan raporu ~130 URL taşıyor; en yük-taşıyanlar: releases.electronjs.org · endoflife.date/electron · electron docs (esm/utility-process/security/fuses) · WiseLibs/better-sqlite3 releases · v2.tauri.app (sidecar/linux-graphics/updater) · Yaak DeepWiki (Node-vendoring kanıtı) · DoltHub Electron-vs-Tauri (Kas 2025) · HN 44118251 (Tauri→Electron) · code.visualstudio.com/docs/remote/wsl · learn.microsoft.com/windows/wsl/networking · electron.build (msi/auto-update) · dbreunig.com "Why is Claude an Electron app" (Şub 2026) · openai.com/index/introducing-the-codex-app.
