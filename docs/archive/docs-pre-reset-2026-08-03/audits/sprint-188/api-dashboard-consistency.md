# api/ + dashboard/ Tutarlılık Denetimi — Sprint 188 W1-T07

**Tarih:** 2026-05-22
**Worker:** W1-T07 (doc-writer, sonnet)
**Kapsam:** `src/api/` (HTTP sunucu katmanı) + `src/dashboard/` (React/Vite arayüzü)
**Sprint:** sprint-188 (analysis-only)

---

## Yönetici Özeti

`src/api/` ve `src/dashboard/` arasında temel işlevsel tutarlılık korunmaktadır — dashboard'un çağırdığı tüm endpointler sunucu tarafında gerçekten var ve çalışır. Ancak birkaç yapısal tutarsızlık tespit edilmiştir: DECKENT.md'nin `api/` için "4 modül" iddiası yanlıştır, `StatusPage` sayfası yönlendirilmemiş/ölü durumdadır, `routes.tsx` kullanılmamakta ve iki endpoint (`/api/sprint`, `/api/job/:jobId`) sunucuda var ama dashboard'da hiç tüketilmemektedir.

---

## api/ Modül Envanteri

DECKENT.md'de `src/api/` için **"4 modül"** iddia edilmektedir (`src/api/` — HTTP API server, SSE, rate limiting (4 modules)). Gerçek dosya sayısı:

**Doğrudan dosyalar (5 adet):**
| Dosya | Satır Aralığı | Rol |
|-------|--------------|-----|
| `src/api/server.ts` | ~1054 satır | Ana HTTP sunucu, tüm route'lar |
| `src/api/auth.ts` | — | Bearer token doğrulama + middleware |
| `src/api/rate-limiter.ts` | — | Token-bucket hız sınırlayıcı |
| `src/api/watcher.ts` | ~28 satır | Dashboard dosya izleyici (SSE için) |
| `src/api/chat-handler.ts` | — | `/api/chat` mesaj işleyici |

**`src/api/terminal/` alt dizini (10 adet):**
| Dosya | Rol |
|-------|-----|
| `terminal/session-manager.ts` | PTY oturum yaşam döngüsü |
| `terminal/ws-gateway.ts` | WebSocket geçidi |
| `terminal/auth-provider.ts` | Terminal token doğrulama |
| `terminal/prompt-guard.ts` | Girdi desen koru (base64, OSC, curl-pipe) |
| `terminal/command-guard.ts` | Tehlikeli komut engeli |
| `terminal/outbound-limiter.ts` | Tenant başına çıkış byte kotası |
| `terminal/audit.ts` | Oturum olay kaydı |
| `terminal/audit-integrity.ts` | HMAC-SHA256 zinciri |
| `terminal/session-backend.ts` | PTY backend arayüzü |
| `terminal/types.ts` | Terminal tip tanımları |

**Bulgu:** DECKENT.md satırı `src/api/` — HTTP API server, SSE, rate limiting **(4 modules)** yanlıştır. Gerçek rakam: **5 doğrudan modül + 10 terminal modülü = 15 modül** (`src/api/server.ts:47-48` default port 3100, host 127.0.0.1).

---

## HTTP Endpoint Envanteri

Aşağıdaki tüm endpoint'ler `src/api/server.ts` içinde tanımlıdır.

### GET Route'ları

| Endpoint | Satır Aralığı | Açıklama | Auth | Hız Sınırı |
|----------|--------------|----------|------|-----------|
| `/health` | ~328 | Sağlık kontrolü | Muaf | Hayır |
| `/api/health` | ~328 | `/health` takma adı | Muaf | Hayır |
| `/api/status` | ~335 | Sprint/görev durumu | Evet | Evet |
| `/api/sprint` | ~361 | Son sprint günlüğü | Evet | Evet |
| `/api/history` | ~368 | Sprint geçmişi | Evet | Evet |
| `/api/config` | ~373 | Proje yapılandırması | Evet | Evet |
| `/api/config/defaults` | ~381 | Varsayılan yapılandırma | Evet | Evet |
| `/api/doctor` | ~387 | Sistem tanı | Evet | Evet |
| `/api/memory` | ~393 | Bellek dışa aktarım | Evet | Evet |
| `/api/debt` | ~401 | Teknik borç dışa aktarım | Evet | Evet |
| `/api/tasks` | ~410 | Görev listesi | Evet | Evet |
| `/api/job/:jobId` | ~420 | İş durumu | Evet | Evet |
| `/api/worker/:taskId/log` | ~432 | Worker günlüğü | Evet | Evet |
| `/api/events` | ~449 | **SSE akışı** | Evet | Evet |

### POST Route'ları

| Endpoint | Satır Aralığı | Body Şeması | Auth |
|----------|--------------|-------------|------|
| `/api/start` | ~518 | `{autoApprove?: boolean}` | Evet |
| `/api/plan` | ~549 | `{directive?: string, mode?: enum}` | Evet |
| `/api/chat` | ~578 | `{message: string}` | Evet |
| `/api/kill/:workerId` | ~592 | (boş) | Evet |
| `/api/set-directives` | ~606 | `{content: string}` | Evet |
| `/api/cleanup` | ~625 | (boş) | Evet |
| `/api/config` | ~680 | `Record<string, unknown>` | Evet |
| `/api/webhooks/:connector/:key` | ~711 | (dinamik) | Özel |

### Terminal Route'ları

| Endpoint | Yöntem | Satır Aralığı | Açıklama |
|----------|--------|--------------|----------|
| `/api/terminal/sessions` | POST | ~934 | Yeni PTY oturumu oluştur |
| `/api/terminal/sessions` | GET | ~963 | Aktif oturumları listele |
| `/api/terminal/sessions/:id` | DELETE | ~970 | Oturumu kapat |
| `/api/terminal/ws` | WebSocket | `ws-gateway.ts:28` | PTY çıktı akışı |

---

## SSE ve Hız Sınırlama Detayı

**SSE Endpointi** (`src/api/server.ts:449-461`):
- `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- Retry ipucu: 3000ms
- Debounce: 500ms (`src/api/watcher.ts:12`)
- İstemci bağlantısı kesilince otomatik temizleme

**Hız Sınırlayıcı** (`src/api/rate-limiter.ts`):
- IP başına token-bucket algoritması
- Varsayılan: 60 istek/60 saniye (`server.ts:290-297`)
- `rateLimit: 0` ile devre dışı bırakılabilir
- 5 dakikada bir arka plan temizleme (satır ~69)
- Yanıt: 429 Too Many Requests
- `server.ts:53-83` — eski gömülü `RateLimiter` sınıfı hâlâ var (geriye dönük uyumluluk için)

**Auth Middleware** (`src/api/auth.ts`):
- `verifyBearerToken()`: SHA-256 hash + `timingSafeEqual()` (satır ~40-53)
- `DECKENT_API_AUTH_DISABLED=1` env ile devre dışı bırakılabilir (stderr uyarısıyla)
- Terminal auth bağımsız, asla devre dışı bırakılamaz (`auth-provider.ts:39-54`)

---

## Dashboard Sayfa Envanteri

IDENTITY.md'de **"7 sayfa"** iddia edilmektedir.

| Sayfa Bileşeni | Yol | App.tsx'te Kayıtlı | Durum |
|----------------|-----|---------------------|-------|
| `DashboardPage.tsx` | `/` | Evet | Canlı |
| `HistoryPage.tsx` | `/history` | Evet | Canlı |
| `MemoryPage.tsx` | `/memory` | Evet | Canlı |
| `ConfigPage.tsx` | `/config` | Evet | Canlı |
| `ChatPage.tsx` | `/chat` | Evet | Canlı |
| `SettingsPage.tsx` | `/settings` | Evet | Canlı (ConfigPage'e yönlendirir) |
| `StatusPage.tsx` | `/status` | **HAYIR** | **ÖLTI SAYFA** |

**Bulgu:** 7 dosya mevcuttur ve IDENTITY.md sayısı doğrudur. Ancak `StatusPage.tsx` `src/dashboard/src/App.tsx`'te hiç import edilmemiş veya route'a eklenmemiştir. Sayfa işlevsel API çağrıları içermesine rağmen hiçbir URL üzerinden erişilemez.

---

## API ↔ Dashboard Tüketim Eşleme Tablosu

| Endpoint | Dashboard Kullananı | Satır |
|----------|---------------------|-------|
| `/api/events` (SSE) | DashboardPage, StatusPage, ChatPage, Layout | `DashboardPage.tsx:100`, `Layout.tsx:125` |
| `/api/status` | DashboardPage, StatusPage | `DashboardPage.tsx:111`, `StatusPage.tsx:21` |
| `/api/tasks` | StatusPage | `StatusPage.tsx:36` |
| `/api/history` | HistoryPage | `HistoryPage.tsx:52` |
| `/api/memory` | MemoryPage | `MemoryPage.tsx:13` |
| `/api/debt` | MemoryPage | `MemoryPage.tsx:14` |
| `/api/config` (GET) | ConfigPage, LanguageProvider | `ConfigPage.tsx:228`, `LanguageProvider.tsx:27` |
| `/api/config/defaults` | ConfigPage | `ConfigPage.tsx:229` |
| `/api/config` (POST) | ConfigPage, LanguageProvider | `ConfigPage.tsx:275`, `LanguageProvider.tsx:38` |
| `/api/doctor` | ConfigPage | `ConfigPage.tsx:244` |
| `/api/worker/:taskId/log` | AgentDetail | `AgentDetail.tsx:62` |
| `/api/start` | NewSprintModal | `NewSprintModal.tsx:75` |
| `/api/plan` | NewSprintModal | `NewSprintModal.tsx:62` |
| `/api/set-directives` | NewSprintModal | `NewSprintModal.tsx:58` |
| `/api/cleanup` | DashboardPage | `DashboardPage.tsx:132` |
| `/api/kill/:workerId` | DashboardPage | `DashboardPage.tsx:149,165` |
| `/api/chat` | ChatPage | `ChatPage.tsx:273` |
| `/api/terminal/sessions` | terminal-api.ts | `terminal-api.ts:40,50` |
| `/api/terminal/sessions/:id` | terminal-api.ts | `terminal-api.ts:55` |
| `/api/terminal/ws` | useTerminalSocket | `useTerminalSocket.ts:27` |
| **`/api/sprint`** | **Hiçbiri** | **KULLANILMIYOR** |
| **`/api/job/:jobId`** | **Hiçbiri** | **KULLANILMIYOR** |

---

## Tüketilmeyen API Endpointleri

İki endpoint sunucuda mevcut ancak dashboard hiç çağırmıyor:

### `/api/sprint` (`src/api/server.ts:~361`)
- Son sprint günlüğünü döndürür
- Dashboard'da hiçbir bileşen bu endpoint'i kullanmıyor
- `HistoryPage.tsx` bunun yerine `/api/history` kullanıyor
- Sprint metrikleri `DashboardPage.tsx`'te `/api/status` yanıtından çıkarılıyor
- **Durum:** Ölü endpoint (dashboard perspektifinden) veya CLI/MCP için ayrılmış

### `/api/job/:jobId` (`src/api/server.ts:~420`)
- Arka plan iş durumunu döndürür (çalışıyor/tamamlandı/başarısız)
- Dashboard'da hiçbir bileşen bu endpoint'i kullanmıyor
- `/api/start` POST'u bir `jobId` döndürüyor olabilir ama takip edilmiyor
- **Durum:** Ölü endpoint (dashboard perspektifinden) veya CLI polling için ayrılmış

---

## Ölü ve Tutarsız Bileşenler

### StatusPage.tsx — Ölü Sayfa
- **Dosya:** `src/dashboard/src/pages/StatusPage.tsx`
- **Sorun:** Sayfa tamamen işlevsel (3 API çağrısı: `/api/events`, `/api/status`, `/api/tasks`) ancak `src/dashboard/src/App.tsx`'te ne import edilmiş ne de route olarak kayıtlı
- **App.tsx:** Son satır (satır ~26) `ChatPage` route'uyla bitiyor; StatusPage eklenmemiş
- `routes.tsx` dosyasında da yoktur (`routes.tsx:5-11`)

### routes.tsx — Kullanılmayan Dosya
- **Dosya:** `src/dashboard/src/routes.tsx`
- **Sorun:** Yoruma göre "Re-exported for reference — actual routing lives in App.tsx" deniyor ama `App.tsx` bunu import etmiyor
- 5 rota tanımlanmış (`/`, `/history`, `/memory`, `/config`, `/chat`); `/settings` ve `/chat` eksik; StatusPage yok
- **Durum:** Kaynak gerçeği değil, yalnızca referans belgesi — güncellenmemiş dokümantasyon

### AgentDetail.tsx — Ham `fetch()` Kullanımı
- **Dosya:** `src/dashboard/src/components/AgentDetail.tsx:62`
- **Sorun:** `fetchJson()` sarmalayıcısı yerine ham `fetch()` kullanıyor
- `const res = await fetch(\`${apiBase}/api/worker/${taskId}/log\`)`
- Merkezi hata işleme ve token ekleme sarmalayıcıyı atlıyor

### LanguageProvider.tsx — Ham `fetch()` Kullanımı
- **Dosya:** `src/dashboard/src/i18n/LanguageProvider.tsx:27,38`
- **Sorun:** Satır 27 ve 38'de `fetch('/api/config', ...)` doğrudan çağrılıyor
- Merkezi `fetchJson()`/`postJson()` sarmalayıcıları kullanılmıyor

### server.ts — Eski Gömülü RateLimiter
- **Dosya:** `src/api/server.ts:53-83`
- **Sorun:** `rate-limiter.ts` ayrılmış modülüne rağmen eski `RateLimiter` sınıfı server.ts içinde kalmaya devam ediyor
- Geri uyumluluk için tutuluyor ama iki paralel uygulama var

---

## DECKENT.md İddia Uyumu

| İddia | Dosya | Gerçek | Uyum |
|-------|-------|--------|------|
| `src/api/` — 4 modules | DECKENT.md | 5 doğrudan + 10 terminal = 15 dosya | **YANLIŞ** |
| 7 dashboard sayfası | IDENTITY.md | 7 dosya var, 1'i (StatusPage) yönlendirilmemiş | Kısmen doğru |
| SSE akışı | DECKENT.md | `server.ts:449` — ✓ mevcut | Doğru |
| Rate limiting | DECKENT.md | `rate-limiter.ts` token-bucket — ✓ mevcut | Doğru |
| React + Vite + Tailwind | CLAUDE.md | `vite.config.ts` + Tailwind + React — ✓ mevcut | Doğru |

---

## Özet

**İyi Haber:** Dashboard'un çağırdığı 19 farklı endpoint'in tamamı sunucu tarafında gerçekten var ve işlevsel. Endpoint API ↔ dashboard parity güçlü; kritik bir "çağrılan ama yok" durumu bulunmuyor.

**Tespit Edilen Sorunlar:**

| Önem | Bulgu | Dosya |
|------|-------|-------|
| Orta | DECKENT.md "4 modül" iddiası yanlış (15 modül) | `DECKENT.md` |
| Orta | `StatusPage.tsx` yönlendirilmemiş — 7. sayfa erişilemiyor | `App.tsx`, `StatusPage.tsx` |
| Düşük | `/api/sprint` ve `/api/job/:jobId` dashboard'da hiç kullanılmıyor | `server.ts:361,420` |
| Düşük | `routes.tsx` güncel değil ve App.tsx'ten kopuk | `routes.tsx` |
| Düşük | `AgentDetail.tsx` ve `LanguageProvider.tsx` ham `fetch()` kullanıyor | İlgili dosyalar |
| Bilgi | Eski `RateLimiter` sınıfı server.ts içinde yaşıyor | `server.ts:53-83` |

---

## Sprint 189 Follow-up

Aşağıdaki maddeler Sprint 189 için önerilen düzeltme ve iyileştirmelerdir:

1. **StatusPage Route Ekle** — `App.tsx`'e `<Route path="/status" element={<StatusPage />} />` ekle; navigasyon menüsüne `/status` bağlantısı ekle. Sayfa işlevsel, yalnızca route kayıt edilmeli.

2. **DECKENT.md "4 modules" Düzeltmesi** — `src/api/` açıklamasını gerçekle eşleştir: "5 doğrudan modül + terminal/ alt dizini (10 modül)" veya kısaca "15 modül".

3. **routes.tsx Senkronizasyonu veya Silinmesi** — Ya `App.tsx` gerçeğiyle senkronize et (tüm rotalar + StatusPage dahil) ya da "referans amaçlı" amacını yorumla netleştir. Karıştırıcı durum.

4. **`/api/sprint` Kullanım Kararı** — Endpoint CLI/MCP için mi? Dashboard için mi? Eğer yalnızca CLI/MCP içinse dokümanlara not düşülmeli. Eğer dashboard da kullanmalıysa `HistoryPage` veya `DashboardPage`'e entegre edilmeli.

5. **`/api/job/:jobId` Takip Mekanizması** — `/api/start` bir jobId döndürdüğünde dashboard bunu takip etmiyor. Uzun süren başlatma işlemleri için kullanıcı geri bildirimi iyileştirilebilir.

6. **fetchJson/postJson Standardizasyonu** — `AgentDetail.tsx:62` ve `LanguageProvider.tsx:27,38` ham `fetch()` çağrılarını merkezi sarmalayıcılara taşı.

7. **server.ts Legacy RateLimiter Temizliği** — `server.ts:53-83` içindeki eski `RateLimiter` sınıfını kaldır, sadece `rate-limiter.ts` modülünü kullan.
