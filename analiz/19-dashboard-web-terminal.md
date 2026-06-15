# 19 — Dashboard ve Gömülü Web Terminali

deckent, sprint izleme, agent yönetimi ve interaktif kullanım için React + Vite + Tailwind CSS tabanlı bir web arayüzü sunar. `src/dashboard/` altında konuşlandırılmış bu arayüz, `deckent serve` komutuyla ayağa kaldırılır. Arayüze ek olarak, doğrudan tarayıcı üzerinden kabuk oturumu açmaya olanak tanıyan gömülü bir web terminali (ADR-062) entegre edilmiştir.

---

## Dashboard Mimarisi

### Teknoloji Yığını

| Katman | Teknoloji |
|--------|-----------|
| UI kütüphanesi | React (hooks, Router) |
| Build aracı | Vite |
| Stil | Tailwind CSS |
| Terminal | `@xterm/xterm` |
| Test | Vitest (`vitest.dashboard.config.ts`) |

Kaynak kodu `src/dashboard/src/` altındadır. Üretim derleme çıktısı `npm run build:all` ile üretilir (tsc + Vite).

### Sayfa Yapısı

Dashboard 12 sayfa içerir:

- **Ana sayfa (Sprint Monitor):** Aktif sprint durumu, wave ilerleme göstergesi, worker listesi
- **Task Detayı:** Bireysel task durumu, heartbeat geçmişi, result dosyası
- **Agent Yönetimi:** Built-in ve temp agent'lar, kullanım istatistikleri
- **Skill Yönetimi:** Skill listesi, AST sandbox durumu
- **Bellek (Memory):** ADR listesi, sprint öğrenimleri, pattern kayıtları
- **Teknik Borç:** Açık ve çözülmüş borç maddeleri
- **Sprint Geçmişi:** Tüm sprint'ler, GO/NO_GO dağılımı
- **Konfigürasyon:** Canlı config görüntüleme ve düzenleme
- **Sohbet (Chat):** Agentic chat arayüzü (Path A — native LLM wire)
- **Terminal:** Gömülü PTY terminal oturumları
- **Model Yönetimi:** Model registry, tier eşdeğerlikleri
- **Raporlar:** Sprint retrospektifleri ve retro zaman çizelgesi

---

## `deckent serve` Komutu

Dashboard'u ve HTTP API sunucusunu başlatır:

```bash
deckent serve                      # varsayılan 127.0.0.1:3000
deckent serve --port 8080          # özel port
deckent serve --host 0.0.0.0      # dış ağa aç (güvenlik uyarısı)
deckent serve --no-terminal        # web terminali devre dışı
```

Sunucu `src/api/server.ts` üzerinde konuşlandırılmıştır ve hem REST API hem de WebSocket terminal bağlantılarını aynı process içinde yönetir.

---

## Kimlik Doğrulama

### Statik API Token

```json
{
  "api_auth_token": "gizli-token"
}
```

ya da ortam değişkeniyle:

```bash
DECKENT_API_TOKEN=gizli-token deckent serve
```

Tüm `/api/*` endpoint'leri `Authorization: Bearer <token>` başlığı gerektirir.

### OIDC (OpenID Connect)

Kurumsal ortamlar için JWT tabanlı kimlik doğrulama desteklenir. `.deckent/config.json` üzerinden yapılandırılır:

```json
{
  "api_oidc": {
    "enabled": true,
    "issuer": "https://idp.example.com",
    "key": "public-key-or-secret",
    "algorithm": "RS256",
    "audience": "deckent"
  }
}
```

`POST /api/auth/oidc/exchange` endpoint'i PKCE akışıyla yetkilendirme kodu → id_token değişimini gerçekleştirir. Token doğrulandıktan sonra `GET /api/auth/me` ile kimlik bilgileri alınır.

### Geliştirme Modunda Auth Devre Dışı Bırakma

```bash
DECKENT_API_AUTH_DISABLED=true deckent serve
```

> **Önemli:** Bu bayrak yalnızca REST API korumayı kaldırır. Gömülü web terminali bunu görmezden gelir — terminal her zaman kendi ayrı token mekanizmasını kullanır.

---

## Gömülü Web Terminali (ADR-062)

### Genel Bakış

Dashboard içine entegre edilmiş docklanabilir terminal, doğrudan tarayıcıdan kabuk veya `deckent` REPL oturumu açmaya olanak tanır. `node-pty` (özel: `@lydell/node-pty`) ile gerçek bir PTY süreci başlatılır; tarayıcıya WebSocket üzerinden bağlanır.

### Mimari Bileşenler

`src/api/terminal/` altındaki 6 + 4 modül:

| Modül | Sorumlu |
|-------|---------|
| `types.ts` | Ortak tipler: `TenantId`, `SessionKind`, `AuditAction` |
| `auth-provider.ts` | `AuthProvider` arayüzü + `LocalTokenAuthProvider` |
| `session-backend.ts` | `SessionBackend` arayüzü + `LocalPtyBackend` (`@lydell/node-pty`) |
| `session-manager.ts` | `PtySessionManager` — oturum haritası, geri kaydırma tamponu, boşta kalan reaper |
| `audit.ts` | `TerminalAudit` — yapılandırılmış olaylar → `memory.db` |
| `ws-gateway.ts` | `attachTerminalGateway` — HTTP upgrade → kimlik doğrulama → PTY köprüsü |
| `command-guard.ts` | Tehlikeli komut deseni engelleme |
| `prompt-guard.ts` | Prompt güvenlik katmanı |
| `outbound-limiter.ts` | Çıkış hız sınırlama |
| `audit-integrity.ts` | Denetim kaydı bütünlük doğrulama |

### Güvenlik Tasarımı

1. **Token üretimi:** Sunucu başlatılırken `crypto.randomUUID()` ile üretilen tek kullanımlık token, yalnızca `127.0.0.1`/`::1` bağlantılarından gelen HTML yanıtlarına `window.__DECKENT_TERMINAL_TOKEN__` olarak enjekte edilir.

2. **Token iletimi:** Token yalnızca `Sec-WebSocket-Protocol: deckent.<token>` başlığıyla iletilir. Query string veya cookie kullanılmaz.

3. **Kimlik doğrulama:** `LocalTokenAuthProvider` SHA-256 + `crypto.timingSafeEqual` kullanır. `DECKENT_API_AUTH_DISABLED` bayrağını görmezden gelir — REST API auth bypass'ı terminal'e uygulanmaz (RCE önlemi).

4. **Ham PTY çıktısı:** Asla kalıcı depoya yazılmaz. Yalnızca yapılandırılmış oturum olayları (oluşturuldu/bağlandı/bağlantı kesildi/sonlandırıldı) `memory.db`'ye kaydedilir.

### Oturum Yönetimi

- Her oturum bir UUID ile tanımlanır ve `Map<string, PtySessionEntry>`'de tutulur.
- 256 KiB'lik halka tamponu yeniden bağlanma sırasında kaydırma geçmişini saklar.
- İstemci bağlantısı kesilirse (`detach`) PTY süreci canlı kalır; yeniden bağlanılabilir.
- Boşta kalan oturumlar yapılandırılabilir zaman aşımından (varsayılan 30 dakika) sonra sonlandırılır.
- `deckent` türündeki oturumlar (aktif sprint worker'ları) boşta kalma süresinden muaftır.
- Varsayılan oturum sınırı: `maxSessions: 10`.

### Frontend Bileşeni

`DockPanel`, `Layout.tsx`'e React Router `<Outlet>` dışında monte edilir; rota değişimlerinde panel canlı kalır. `TerminalTabs` + `TerminalView` ile çok sekmeli terminal desteği sunar.

### Terminal Yapılandırması

`.deckent/config.json` üzerinden:

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

---

## Dashboard Testleri

Dashboard bağımsız bir Vitest yapılandırmasıyla test edilir:

```bash
npm run test:dashboard    # vitest.dashboard.config.ts
```

413 test tanımlayıcısı içerir (IDENTITY.md referansı).

---

## Sub-Proje Yol Haritası

ADR-062, terminal alt sistemini 4 aşamalı bir yol haritasıyla planlamıştır:

| Alt Proje | Durum |
|-----------|-------|
| #1 PTY oturumları, WS ağ geçidi, auth, audit, frontend dock | **Teslim edildi** |
| #2 Güvenlik: komut/prompt guard (`command-guard.ts`, `prompt-guard.ts`) | **Teslim edildi** |
| #3 Çok kiracılı yalıtım: k8s/SSO `AuthProvider`/`SessionBackend` uygulamaları | Ertelenmiş |
| #4 Kurumsal dış entegrasyon: uzak PTY backend'leri, SIEM kancaları | Ertelenmiş |
