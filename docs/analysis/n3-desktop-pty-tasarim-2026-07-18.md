# N3 Desktop-PTY — «Makine Dairesi» Tasarım-Turu (583, design-then-approve)

**Tarih:** 2026-07-18 · **Durum:** ✅ ONAYLANDI + UYGULANDI (Alperen 2026-07-18: üç açık-karar da
önerilen yönde — 5.-nav-tam-boy · loopback+Bearer-endpoint+ADR-amendment · üç-tür-birden; ADR-G-029
inv#2b amendment'ı DB+md'ye işlendi; kanıt: gerçek-binary smoke `scripts/n3-desktop-pty-smoke.mjs`
9/9) · **Bağlam:** 583/N3 —
gap-analizi satır-4: "Daemon-PTY VAR (ADR-G-029) … Desktop-panelde YOK". Amaç: paketli Desktop-binary'de
gerçek shell/AI-tool oturumu — VS Code'un entegre terminalinin deckent-native karşılığı.

> **İş-özeti (tek cümle):** Desktop'a beşinci görünüm olarak «Makine Dairesi» — kaptan köşkünden makine
> dairesine inip makineyle DOĞRUDAN temas: gerçek shell, gerçek `deckent` CLI'ı, gerçek `claude/gemini/codex`
> oturumu; hepsi mevcut daemon-PTY güvenlik-modelinin (ADR-G-029) üstünde, sıfır yeni yetki-yüzeyiyle.

---

## 1 · Envanter — ne VAR, ne YOK (Explore-doğrulamalı)

| Katman | Durum | Kanıt |
|---|---|---|
| Daemon PTY backend | ✅ VAR — `@lydell/node-pty` (Win-conpty dahil, Yasa-2 hazır; native-addon, desteksiz platformda `npm install` GÜRÜLTÜLÜ düşer = dürüst) | `session-backend.ts` |
| Oturum yönetimi | ✅ VAR — `PtySessionManager`: maxSessions-10, idle-reaper-30dk (deckent-kind muaf), 256KiB ring-buffer + reattach-replay (inv#4) | `session-manager.ts` |
| Oturum türleri | ✅ VAR — `shell` \| `deckent` \| `ai(claude/gemini/codex)`; ai-tool allowlist (born-565), `allowShellKind` config-gate (357-009) | `types.ts`, server.ts POST-handler |
| HTTP kontrol | ✅ VAR — `GET/POST/DELETE /api/terminal/sessions`, Bearer=**terminal-token** ile gate'li | server.ts:2285+ |
| WS köprüsü | ✅ VAR — `/api/terminal/ws`, token `Sec-WebSocket-Protocol: deckent.<token>`, fail-CLOSED bypass-bağımsız auth (inv#1), JSON-frame kontratı `{t:attach/input/resize/output}` | `ws-gateway.ts`, dashboard `useTerminalSocket.ts` |
| Guard'lar | ✅ VAR — command-guard · prompt-guard · outbound-limiter (I5) · audit (yapısal; sink no-op = bilinen born AUDIT-WIRE, N3-kapsamı DIŞI) | `terminal/` alt-modülü |
| Serve-entegrasyonu | ✅ VAR — localhost'ta default-AÇIK (`serve.ts:84`); desktop `deckent serve --port N` spawn'lıyor → **desktop-daemon'da PTY zaten canlı**; `/api/status` loopback'e `terminalEnabled` capability bildiriyor | serve.ts, daemon-lifecycle.ts:137, server.ts:759 |
| Vetted client | ✅ VAR — dashboard `TerminalView.tsx` + `useTerminalSocket.ts` (`@xterm/xterm ^5.5.0` + `addon-fit ^0.10.0`) | dashboard/package.json |
| **Desktop-renderer'da panel** | ❌ YOK | gap-4 |
| **Renderer'a token-teslimi** | ❌ YOK — inv#2 tek kanal tanır: localhost index.html enjeksiyonu (`window.__DECKENT_TERMINAL_TOKEN__`); Desktop-renderer daemon'ın index.html'ini yüklemez | ADR-G-029 inv#2 |
| **CSP'de `ws:` şeması** | ❌ YOK — `connect-src 'self' http://127.0.0.1:* http://localhost:*` (+dinamik); WS için `ws://…` kaynakları eklenmeli | `security.ts:148-156` |

---

## 2 · Tasarım

### A — Yerleşim: beşinci görünüm «Makine Dairesi» (Engine Room)

- Nav'a 5. madde: `console · chat · approval · history · **terminal**` (route `#/terminal`).
  Köprüüstü-dili: Rota/Emir/Telgraf/seyir-defterinin yanına **Makine Dairesi** — uzmanın güverte-altına
  inip makineye elini sürdüğü yer. EN `Engine Room` · TR `Makine Dairesi`.
- **Tam-boy görünüm, alt-dock DEĞİL** — dashboard'un dock'u bilinen z-index bug'ı taşıyor (DOCK-UI-FIX,
  ADR-G-029 (−)); Desktop tek-kapsamlı üründe terminal birinci-sınıf yüzeydir, iliştirilmiş çekmece değil.
- Görünüm iç-yapısı: üstte **oturum-sekmeleri** (çoklu-oturum) + «yeni oturum» başlatıcı
  (tür-seçici: shell / deckent / claude / gemini / codex) + oturum-kapat; altta xterm-pane.
- `GET /api/terminal/sessions` ile mevcut oturumlar listelenir → renderer-reload/yeniden-bağlanmada
  **reattach** (inv#4 ring-buffer replay'i bedava sağlıyor — dashboard'la aynı davranış).
- Daemon `terminalEnabled:false` bildirirse (uzak/non-loopback ya da `--no-terminal`): dürüst ön-koşul
  bandı (mevcut `flagRunFlowOff` deseninin aynısı) — sessiz boş-ekran YASAK. `allowShellKind=false`
  403'ü de aynı dürüstlükle yüzeye çıkar (shell-türü kapalı; deckent/ai açık kalır).

### B — Token-akışı: `GET /api/terminal/token` + ADR-G-029 inv#2 GENİŞLETME (amendment)

**Sorun:** Terminal-token ≠ API-token. Renderer API-token'ı biliyor (`DaemonSession.apiToken`), terminal-token'ı
bilmiyor; inv#2'nin tek teslim-kanalı (index.html enjeksiyonu) Desktop'ta çalışmaz.

**Öneri:** Daemon'a tek yeni endpoint — `GET /api/terminal/token`:
1. **Yalnız loopback** remote-addr (inv#2'nin "localhost-only bootstrap" ruhunun birebir taşınması);
2. **Geçerli API-Bearer zorunlu ve `DECKENT_API_AUTH_DISABLED`'dan BAĞIMSIZ** (fail-CLOSED) — inv#1'in
   RCE-mantığı: global REST-bypass hiçbir yoldan shell'i açamaz; bypass açıkken bile bu endpoint
   Bearer'sız 401 döner;
3. Cevap `{ token }`; WS'e yine YALNIZ `Sec-WebSocket-Protocol: deckent.<token>` ile sunulur
   (query-string/cookie/Authorization-on-upgrade yasakları aynen korunur).

**ADR-dokunuşu (kanun-2):** inv#2'ye ikinci teslim-kanalı eklemek ADR-G-029 **amendment'ı gerektirir**.
Öneri-metin: *"inv#2 token delivery: … OR a loopback-only `GET /api/terminal/token` response gated by a
VALID API bearer verified independently of `DECKENT_API_AUTH_DISABLED` (fail-CLOSED). Non-loopback
callers are always refused; remote/enterprise clients use the OIDC/JWKS path (inv#5), never this
endpoint."* Onayınla `store.insert` amendment + ADR-md güncellenir.

**Reddedilen alternatif:** main-process'in `.deckent/runtime/terminal-token` dosyasını okuyup IPC'yle
vermesi — (a) D4-3'ün onaylı "renderer-owned transport" kararını deler (main'e transport-sırrı sızar),
(b) adopt-edilen daemon'da projectRoot bilgisine kırılgan bağımlılık, (c) gelecekteki uzak-daemon'da
(dosya yok) sessizce kırılır; yeni IPC-kanalı = yeni yetki-yüzeyi. Endpoint-yolu tek-katman, her
bağlanma-biçiminde aynı.

### C — Transport: renderer-owned WS (D4-3 paritesi) + CSP `ws:` ekleri

- Renderer doğrudan `ws://<daemon-host>/api/terminal/ws` açar (fetch/SSE ile aynı sahiplik-katmanı).
- `buildLocalRendererCsp`: loopback-listesine `ws://127.0.0.1:* ws://localhost:*` eklenir; dinamik
  origin'lere ws-ikizi türetilir (http→ws, https→wss). CSP3'ün http→ws şema-eşleşmesine
  GÜVENİLMEZ — açık kaynak-listesi hem garantili hem kendini-belgeleyen (unit-pin + canlı-kanıt).
- Frame-kodek (`{t:attach/input/resize/output}`) **saf modül** olarak yazılır (`terminal-frames.ts`),
  dashboard'daki gömülü-JSON'un tekrarı değil — hermetik pinlenir. Reconnect: dashboard'un artan-geri-
  çekilme deseni (1s·deneme, 5s tavan) + reattach-replay.

### D — Tema: token-türetimli xterm-teması (hardcode-palet YASAK)

Dashboard'ın inline teal/gold paleti dashboard'a özgü kalır. Desktop **themeable** (D4-1 CSS-var
token'ları): mount'ta + tema-değişiminde `getComputedStyle` ile token'lar okunur → xterm `theme`
nesnesine saf-fonksiyonla eşlenir (`deriveXtermTheme(cssVars)` — hermetik-pinli). Kanun-10 ruhu:
renk-değerleri TEK kaynaktan (theme-tokens), kod-yolunda literal yok.

### E — i18n & bağımlılık & güvenlik-duruşu

- **i18n:** `desktop.shell.nav.terminal` + `desktop.shell.term.*` (yeni-oturum/tür-adları/kapat/
  bağlanıyor/kopuk/ön-koşul/shell-kapalı…) — messages.ts en/tr + desktop-messages köprü-listesi.
- **Bağımlılık:** `src/desktop/package.json` += `@xterm/xterm ^5.5.0`, `@xterm/addon-fit ^0.10.0`
  (dashboard'la AYNI vetted sürümler; ADR-D-005 gerekçe-satırı dependencies-ledger'a).
- **Güvenlik-duruşu — neyi DEĞİŞTİRMİYORUZ:** guard'lar/audit/idle-reaper/maxSessions tamamı
  server-side kalır; renderer'a Node-yetkisi yok, yeni IPC-kanalı yok, `nodeIntegration` kapalı;
  Desktop yalnız görüntü+girdi. inv#1/3/4/5 dokunulmaz; inv#2 yukarıdaki amendment'la genişler.

### F — Kanıt-planı (kanun-3 + Tier-1)

1. **Hermetik pinler:** frame-kodek · `deriveXtermTheme` · CSP-ws-pinleri (`shell-transport.test.ts`
   genişler) · api-client `getTerminalToken` · endpoint-gate'leri (loopback-suz 403, Bearer-siz 401,
   bypass-env-açıkken de 401 — SURF-7 ratchet-spec deseni) · i18n en/tr parite.
2. **Gerçek-binary smoke (Tier-1):** `deckent serve` gerçek-daemon + Node-tarafı WS-client script:
   token'ı endpoint'ten al → session yarat (`shell`) → `attach` → `echo makine-dairesi` yaz →
   `output`-frame'de yankıyı doğrula → DELETE. (PTY-yolunun uçtan-uca kanıtı, Electron'suz.)
3. **Görsel canlı-kanıt:** `npm run dev:desktop` + paketli-koşu — 5-gün-dogfood ilk gününde
   (DiffPanel/N5 ile aynı dürüst-erteleme).

### G — Dilimleme

| Dilim | İçerik |
|---|---|
| **T1** | ADR-G-029 amendment (onay-sonrası insert) + `GET /api/terminal/token` + gate-pinleri |
| **T2** | CSP-ws + frame-kodek + api-client + «Makine Dairesi» view (sekmeler/türler/reattach/tema/i18n) |
| **T3** | Gerçek-binary smoke + MASTER-PLAN + (varsa) born'lar (AUDIT-WIRE değişmeden kalır, kayıt düşülür) |

---

## 3 · Açık kararlar (Alperen)

1. **Yerleşim:** 5. nav «Makine Dairesi» tam-boy görünüm (öneri) — mi, Console-içi sekme mi?
2. **Token-teslimi:** loopback+Bearer endpoint + ADR-amendment (öneri) — mi, main-fs-IPC köprüsü mü?
3. **v1 tür-kapsamı:** shell+deckent+ai üçü birden (öneri; API zaten destekliyor, UI parametrik) — mi,
   önce yalnız shell mi?
