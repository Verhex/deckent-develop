# Dashboard Kontrol Paneli — React + SSE Canlı Arayüz

> Sprint durumunu ve agent aktivitesini tarayıcıdan gerçek zamanlı izleyen, tam ekran sunuma hazır web kontrol paneli.

## Ne işe yarar?

- **Canlı sprint izleme** — `/api/events` SSE akışı üzerinden worker durumunu, faz geçişlerini ve uyarıları anlık yansıtır.
- **Sprint kontrolü** — start / kill / cleanup komutlarını arayüzden gönderir; terminal embed ile ham çıktıyı gösterir.
- **Çok sayfalı navigasyon** — 16 sayfa / 16 rota: Dashboard, Status, History, Memory, MemoryExplorer, Chat, Config, Debt, Evolution, Nervous, Enterprise, Workers, Directives, Settings, Login, Callback.
- **Agentic Chat** — `/chat` sayfası; yerleşik konuşma arayüzüyle doğal dil üzerinden deckent komutları çalıştırır.
- **Evolution & Nervous sayfaları** — agent promosyon/demosyon görselleştirme ve nervous-system bildirim yönetimi.
- **Enterprise sayfası** — multi-tenant, audit ve RBAC konfigürasyonu için ayrılmış sayfa.

## Neden önemli?

- **Sıfır terminal gereksinimi** — ekip üyeleri sprint akışını ve geçmişi CLI bilgisi olmadan takip edebilir.
- **SSE push modeli** — dashboard polling yapmaz; sunucu her sprint event'ini anlık iter (gecikme < 1s).
- **Sunum ve izleme iki rolde** — aynı arayüz hem canlı demo hem de üretim monitoring için kullanılır.

## Nasıl çalışır?

1. **Başlatma** — `deckent serve` komutu `src/api/server.ts`'teki HTTP sunucusunu ayağa kaldırır; statik Vite bundle servis edilir.
2. **SSE bağlantısı** — `Layout.tsx` içindeki `useSSEWithStatus("/api/events")` hook'u kalıcı EventSource bağlantısı kurar; durum `connected / connecting / offline` olarak sidebar'da gösterilir.
3. **Sprint verisi** — `.dashboard` dosyası her Auditor scan döngüsünde (30 sn) güncellenir; SSE bu dosyanın değişimini izleyerek tüm istemcilere push eder.
4. **Sayfa yönlendirmesi** — `react-router-dom` SPA; `BrowserRouter > Routes` yapısı `src/dashboard/src/App.tsx`'te tanımlıdır.

> **Not:** `DebtPage.tsx` `/debt` rotasına bağlıdır (`App.tsx` L33) ve aktif olarak yönlendirilmektedir. Tüm 16 sayfa dosyası (`src/dashboard/src/pages/`) App.tsx'te kayıtlıdır.

## Komut / Örnek

```bash
# Dashboard'u başlat (varsayılan port 3100)
deckent serve

# Özel port ile başlat
deckent serve --port 8080

# Tarayıcı otomatik açılır; ya da manuel: http://localhost:3100
# Beklenen çıktı:
# deckent dashboard  →  http://localhost:3100
# SSE stream: /api/events (text/event-stream)
```

```bash
# Sunuyu deckent web komutuyla da başlatabilirsin
deckent web --port 3100
```

## Durum

- Olgunluk: ✅ canlı — React + Vite + Tailwind SPA, SSE canlı veri, 16 aktif rota
- İlgili: ADR-080 (Dashboard God-Level), ADR-062 (Embedded Web Terminal), ADR-074 (Chat Round-Trip)
- Modül: `src/dashboard/src/` · `src/api/server.ts` · `src/dashboard/src/pages/` (16 dosya, 16 rota)
- Kaynak: `src/dashboard/src/App.tsx` (rota tanımları), `src/dashboard/src/components/Layout.tsx` (SSE hook)
