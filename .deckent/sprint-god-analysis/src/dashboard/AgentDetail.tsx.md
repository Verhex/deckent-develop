# Analysis: src/dashboard/src/components/AgentDetail.tsx
**Task ID:** 142-028-fix | **Model:** opus | **LoC:** 234 | **Effort:** max

## 1. Amaç (detaylı, 3-5 cümle)
AgentDetail, belirli bir worker/task'ın detay panelini gösteren bileşendir. Task ID'ye göre HTTP API'den `/api/worker/:taskId/log` endpoint'inden worker log ve task bilgilerini çeker, 3 saniyede bir polling yapar. Task başlığı, status badge (renk kodlu), agent/skills bilgisi, geçen süre (canlı ticker), scope dizinleri, dosya listesi, açıklama (200 karakter truncation + show more/less) ve canlı log çıktısı gösterir. Log kopyalama (clipboard API) ve auto-scroll destekler.

## 2. Public API
- `export function AgentDetail({ taskId, onClose, apiBase }: AgentDetailProps)` — Named export.
  - `taskId: string` — Görüntülenecek task ID
  - `onClose: () => void` — Kapatma callback
  - `apiBase?: string` — API base URL (default: "")
- JSDoc: **EKSIK**

Dahili tipler:
- `WorkerLogData { taskId, log, task }` — API response shape
- `AgentDetailProps { taskId, onClose, apiBase? }`

Dahili fonksiyonlar:
- `formatElapsed(createdAt: string): string` — Geçen süre hesaplama (h/m/s)
- `getStatusColor(status: string): string` — Status → Tailwind CSS class

## 3. İç Bağımlılıklar
- `react`: useEffect, useRef, useState
- `./ui/badge`: Badge
- `./ui/card`: Card, CardContent, CardHeader, CardTitle
- `../i18n/LanguageProvider`: useTranslation
- Döngüsel bağımlılık: YOK

## 4. Dış Bağımlılıklar
- React core — beklenen.

## 5. Complexity
- Fonksiyon sayısı: 4 (formatElapsed, getStatusColor, AgentDetail, handleCopyLog)
- Max cyclomatic: ~5 (AgentDetail — çoklu useEffect + conditional rendering)
- En karmaşık fonksiyon: AgentDetail — satır 50-233

## 6. Type Safety
- `any` sayısı: 0
- `@ts-ignore`: 0
- Non-null `!`: **2** — satır 89: `data.task!.createdAt!` — çift non-null assertion.
  - Koşul (satır 88: `if (!data?.task?.createdAt) return`) korunuyor ancak `!` kullanımı gereksiz ve tehlikeli. **P2**.
- `as WorkerLogData`: Satır 64 — `await res.json() as WorkerLogData`. Runtime validation yok — API şeması değişirse sessiz bozulma. **P2**.
- Unsafe cast: 0

## 7. ADR Compliance
- ADR-033: Uyumlu — worker detay paneli ürün deneyimini zenginleştirir.
- ADR-022 (CLI/MCP parity): `/api/worker/:taskId/log` endpoint'i CLI/MCP'de karşılığı var mı? Dashboard-specific olabilir.
- Diğer ADR'ler: N/A.

## 8. Test Coverage
- **Doğrudan test**: `tests/dashboard/AgentDetail.test.tsx` — MEVCUT (dedicated test dosyası).
- Mock gereksinimi: global fetch mock, clipboard API mock.
- Edge case: null data, boş log, uzun açıklama truncation, API hata durumu.

## 9. TODO/FIXME/HACK Inventory
- Satır 68: `catch { /* ignore fetch errors */ }` — Sessiz hata yutma. Kullanıcı ağ hatası bilgilendirilmez. **P2**.
- Satır 100: `.catch(() => {/* ignore */})` — Clipboard API hatası yutma. Mobil'de clipboard erişimi kısıtlı. **P3**.

## 10. Dead Code
- YOK — tüm state ve fonksiyonlar aktif kullanımda.

## 11. Security
- URL injection: `${apiBase}/api/worker/${taskId}/log` — taskId URL'ye doğrudan ekleniyor. taskId SSE state'ten gelir (güvenilir kaynak) — düşük risk. **P3**.
- `navigator.clipboard.writeText()` — HTTPS gerektirir (güvenli).
- `as WorkerLogData` — API response runtime validation yok. Zod eklenebilir.

## 12. Memory V2 Uyumu
- N/A — API üzerinden çalışır, doğrudan DB erişimi yok (doğru mimari).

## 13. i18n
- `useTranslation()` — tüm UI stringleri t() ile lokalize.
- **SORUN**: `formatElapsed()` satır 34-36 — hardcoded "h", "m", "s" suffix.
  - Türkçe'de "sa", "dk", "sn" olmalı. **P2** — i18n ihlali.
- `getStatusColor()` — `.toUpperCase()` karşılaştırma — İngilizce status, locale-safe. OK.
- `&#x2715;` kapatma butonu — unicode. OK.

## 14. Dokümantasyon Tutarlılığı
- JSDoc: EKSIK — AgentDetail, WorkerLogData dokümante edilmemiş.
- API endpoint `/api/worker/:taskId/log` — api-surface.md'de dokümante edilmemiş olabilir. KONTROL GEREKLİ.

## 15. Performance
- 3sn polling (satır 72) — SSE yerine polling. Worker log SSE'ye dahil olmadığı için kabul edilebilir.
- 1sn elapsed timer (satır 91) — her saniye re-render. Overhead minimal.
- Log auto-scroll: `scrollTop = scrollHeight` — OK.
- Cleanup: active flag + clearInterval — proper lifecycle management. Doğru.

## 16. Öneriler
- **P2**: `data.task!.createdAt!` çift non-null assertion → koşullu erişim + type narrowing.
- **P2**: `formatElapsed()` i18n desteği — t() ile lokalize suffix.
- **P2**: API response runtime validation (Zod veya type guard).
- **P2**: Fetch hatasını kullanıcıya göster (bağlantı koptu banner).
- **P3**: `apiBase` default "" — proxy bağımlılığı belgelensin.

## Verdict: ANALYZED
