# Gömülü Web Terminali

> deckent dashboard'una entegre edilmiş, VSCode benzeri yerleştirilebilir bir terminal. Tarayıcıyı terk etmeden `claude`, `gemini`, `codex`, `deckent` veya düz bir kabuk oturumu başlatın.

---

## Genel Bakış

Gömülü terminal, dashboard'un her sayfasının altına yeniden boyutlandırılabilir bir dock paneli ekler. Oturumlar PTY tabanlıdır (yalnızca komut konsolu değil, tam etkileşimli terminal), dolayısıyla etkileşimli AI CLI'ları yerel terminalinizde olduğu gibi çalışır.

Temel özellikler:

- **Çoklu sekme:** aynı anda birden fazla oturum açabilirsiniz (claude, deckent, shell vb.)
- **Yeniden bağlanma (reattach):** tarayıcı sekmesini kapatmak oturumu sonlandırmaz — yeniden bağlandığınızda kaydırma tamponu yeniden oynatılır ve canlı akım devam eder
- **Varsayılan olarak güvenli:** otomatik oluşturulan token ile yalnızca localhost bağlama; manuel kurulum gerekmez
- **Denetlendi:** her oturum yaşam döngüsü olayı (oluşturma, bağlanma, sonlandırma, kimlik doğrulama) `memory.db`'ye kaydedilir; ham PTY çıktısı **asla** disk üzerine yazılmaz

---

## Terminali Açmak

1. Dashboard'u başlatın: `deckent serve`
2. Tarayıcıda `http://localhost:3000` adresini açın
3. Dock panelini genişletmek için terminal simgesine tıklayın (alt çubuk veya `Ctrl+`` kısayolu)
4. Oturum başlatmak için hızlı başlatma düğmelerinden birine tıklayın:
   - **claude** — etkileşimli Claude Code oturumu açar
   - **gemini** — Gemini CLI oturumu açar
   - **codex** — OpenAI Codex CLI oturumu açar
   - **deckent** — deckent CLI oturumu açar
   - **shell** — düz `$SHELL` oturumu açar

---

## Oturum Türleri

| Tür | Komut | Notlar |
|-----|-------|--------|
| `claude` | `claude` | Etkileşimli Claude Code CLI |
| `gemini` | `gemini` | Gemini CLI (`GOOGLE_API_KEY` gerektirir) |
| `codex` | `codex` | OpenAI Codex CLI (`OPENAI_API_KEY` gerektirir) |
| `deckent` | `deckent <args>` | deckent CLI |
| `shell` | `$SHELL` | Düz kabuk; `allowShellKind` ile etkinleştirme/devre dışı bırakma |

---

## Yeniden Bağlanma Davranışı

Oturumlar istemci bağlantısı koptuğunda yaşamaya devam eder. Yalnızca açık sonlandırma veya boşta bekleyen reaper oturumları kapatır.

```
Tarayıcı sekmesi kapanır ──► WS kapanır ──► PTY yaşamaya devam eder
                                            ring-buffer dolmaya devam eder (sınırlı)

Tarayıcı yeniden bağlanır ──► WS açılır ──► tampon yeniden oynatılır ──► canlı akım devam eder
```

**Önemli sınır:** Yeniden bağlanma yalnızca **istemci** bağlantısı kopmaları için geçerlidir. **Sunucu yeniden başlatılırsa** tüm oturumlar kaybolur — bellekte yaşarlar, disk üzerinde değil. Bu, alt proje #1 için kasıtlı bir tasarım kararıdır; disk üzerinde kalıcı oturumlar #1 sonrası kapsama alınacaktır.

`deckent` türündeki oturumlar **boşta kalma reaperından muaftır** — uzun süren bir sprint, etkinlik olmadığı gerekçesiyle sonlandırılmaz. Diğer türler (`claude`, `shell` vb.) `idleTimeoutMs` süresince etkin olmazsa reaper tarafından kapatılır.

---

## Güvenlik Modeli

### Varsayılan olarak localhost

Terminal WebSocket, varsayılan olarak `127.0.0.1`'e bağlanır. Uzaktan erişim için açık bir kabul gereklidir (bkz. [Uzaktan Erişim](#uzaktan-erişim)).

### Token otomatik enjeksiyonu

Başlatma sırasında sunucu rastgele bir oturum token'ı oluşturur. Dashboard sayfası `localhost`'tan yüklendiğinde, sunucu bu token'ı doğrudan HTML'ye yerleştirir:

```html
<script>window.__DECKENT_TERMINAL_TOKEN__ = "...";</script>
```

Tarayıcı SPA token'ı okur ve WebSocket subprotocol başlığı olarak iletir:

```
Sec-WebSocket-Protocol: deckent.<token>
```

Sunucu, herhangi bir PTY oturumu başlatılmadan **önce** SHA-256 + `timingSafeEqual` kullanarak token'ı doğrular. Reddedilen bir token bağlantıyı hemen kapatır — hiçbir oturum oluşturulmaz.

### Bypass'tan bağımsız kimlik doğrulama

Global API kimlik doğrulama bypass'ı (`DECKENT_API_AUTH_DISABLED=1`), yalnızca okuma amaçlı dashboard geliştirme kolaylığıdır. Terminal kimlik doğrulaması üzerinde **hiçbir etkisi yoktur**. Terminal, bypass etkin olsa bile kendi token'ını zorunlu kılar — sprint durumunu okumak için kullanılan bir kolaylık bayrağı, sessizce uzak bir kabuk açmamalıdır.

Bu, Sprint 171 denetimiyle belirlenen B-022 güvenlik bulgusuna uyumludur.

### Uzaktan Erişim

Uzaktan erişim varsayılan olarak devre dışıdır. Etkinleştirmek için:

1. `.deckent/config.json`'da `terminal.bind`'ı localhost dışı bir adrese ayarlayın veya `deckent serve`'e `--host <addr>` geçin
2. Güçlü bir token yapılandırıldığından emin olun
3. **TLS sizin sorumluluğunuzdadır.** deckent'i ağ üzerinden açtığınızda önüne bir ters proxy (nginx, Caddy vb.) koyun. Şifrelenmemiş uzaktan erişim, terminal oturumlarınızı dinlemeye açık bırakır

```bash
# Örnek: tüm arayüzlere bağlama (her zaman ters proxy ile TLS ekleyin)
deckent serve --host 0.0.0.0
```

`--host` localhost dışı bir adrese ayarlanmışsa ve token yapılandırılmamışsa, deckent bir uyarı kaydeder ve **terminali başlatmaz**.

---

## Denetim Zaman Çizelgesi

Her oturum yaşam döngüsü olayı, `memory.db`'de `audit` türü altında yapılandırılmış bir giriş olarak kaydedilir. Denetim günlüğünü şu komutla sorgulayabilirsiniz:

```bash
deckent recall "terminal audit"
```

Kaydedilen olaylar:

| Olay | Ne Zaman |
|------|----------|
| `auth.ok` | WS el sıkışması başarılı |
| `auth.deny` | WS el sıkışması reddedildi (hatalı token) |
| `session.create` | Oturum PTY'si başlatıldı |
| `session.attach` | İstemci mevcut bir oturuma bağlandı |
| `session.detach` | İstemci bağlantısı kesildi (oturum yaşamaya devam eder) |
| `session.kill` | Oturum açıkça sonlandırıldı |
| `session.exit` | PTY işlemi çıkış yaptı |

**Ham PTY çıktısı asla disk üzerine yazılmaz.** Kaydırma tamponu yalnızca bellektedir (`scrollbackBytes` ile sınırlı). Denetim girdileri yalnızca yapılandırılmış meta veri içerir — terminal içeriği yoktur.

---

## Yapılandırma

`.deckent/config.json`'a varsayılanları geçersiz kılmak için bir `terminal` bölümü ekleyin:

```json
{
  "terminal": {
    "enabled": true,
    "bind": "127.0.0.1",
    "maxSessions": 10,
    "idleTimeoutMs": 1800000,
    "scrollbackBytes": 262144,
    "allowShellKind": true
  }
}
```

| Anahtar | Tür | Varsayılan | Açıklama |
|---------|-----|------------|----------|
| `enabled` | `boolean` | `true` | Terminal özelliğini tamamen etkinleştirin veya devre dışı bırakın |
| `bind` | `string` | `"127.0.0.1"` | Terminal WebSocket bağlama adresi. Uzaktan erişim için `"0.0.0.0"` olarak değiştirin (TLS ters proxy gerektirir) |
| `maxSessions` | `number` | `10` | Maksimum eşzamanlı PTY oturumu sayısı |
| `idleTimeoutMs` | `number` | `1800000` | Boşta kalma reaper zaman aşımı (ms). Bu süre boyunca etkin olmayan oturumlar kapatılır. `deckent` türü oturumlar muaftır. Varsayılan: 30 dakika |
| `scrollbackBytes` | `number` | `262144` | Oturum başına bellek içi halka tampon boyutu (bayt). Varsayılan: 256 KB |
| `allowShellKind` | `boolean` | `true` | Düz `$SHELL` oturumlarına izin verin. Kullanıcıları yalnızca AI CLI oturumlarıyla sınırlamak için `false` olarak ayarlayın |

`deckent serve`'e `--host <addr>` ve `--no-terminal` da geçebilirsiniz:

```bash
# Terminali tamamen devre dışı bırakın
deckent serve --no-terminal

# Belirli bir adrese bağlayın
deckent serve --host 192.168.1.100
```

---

## Mimari Genel Bakış

```
Tarayıcı (xterm.js, çoklu sekme)
   │  WS  /api/terminal/ws       ← el sıkışmada kimlik doğrulama, herhangi bir PTY başlatılmadan ÖNCE
   │  HTTP /api/terminal/sessions ← mevcut Bearer kimlik doğrulaması
   ▼
ws-gateway.ts ──► PtySessionManager ──► node-pty
                       │
                       ├── Map<sessionId, { pty, ringBuffer, kind, status }>
                       ├── attach/detach ≠ kill
                       ├── sınırlı kaydırma tamponu (yalnızca bellekte)
                       └── TerminalAudit → memory.db
```

`AuthProvider` ve `SessionBackend`, başlangıçtan itibaren arayüzlerdir:

- **`AuthProvider`** — bugün: yerel enjekte token; gelecekte: OIDC/SSO/mTLS (alt proje #3)
- **`SessionBackend`** — bugün: süreç içi `node-pty`; gelecekte: uzak pod-exec (alt proje #3)

---

## Alt Proje Yol Haritası

| # | Kapsam |
|---|--------|
| **#1** | Gömülü terminal (bu özellik) — PTY + ws + xterm.js; localhost-varsayılan + token |
| #2 | Öz-güvenlik — komut/istem koruması; planlayıcı durum hijyeni |
| #3 | Milyonluk ölçek güvenliği — çok kiracılı izolasyon, sandbox, kaynak limitleri, k8s |
| #4 | Kurumsal entegrasyonlar — OIDC/SSO, güvenli veri alışverişi |

---

## İlgili

- [Yapılandırma Referansı](/reference/config) — tam yapılandırma belgeleri
- [Güvenlik Modeli](/reference/security) — deckent genel güvenlik mimarisi
- [ADR-062](/adr/062-embedded-web-terminal) — gömülü terminal mimari kararları
