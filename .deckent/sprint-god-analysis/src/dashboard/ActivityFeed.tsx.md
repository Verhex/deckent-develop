# Analysis: src/dashboard/src/components/ActivityFeed.tsx
**Task ID:** 142-028-fix | **Model:** opus | **LoC:** 199 | **Effort:** max

## 1. Amaç (detaylı, 3-5 cümle)
ActivityFeed, sprint sırasında canlı aktivite akışını gösteren React bileşenidir. SSE (Server-Sent Events) üzerinden gelen DashboardState güncellemelerini izleyerek faz değişiklikleri, agent spawn/done/error olayları, uyarılar ve ilerleme güncellemelerini kronolojik listede sunar. Ref-tabanlı durum karşılaştırması (prevAgentsRef, prevPhaseRef, prevDoneRef, prevAlertsRef) ile yalnızca değişen olayları tespit eder. Maksimum 50 giriş tutar (LRU benzeri kısıtlama). Auto-scroll ile son aktiviteye otomatik kayar.

## 2. Public API
- `export function ActivityFeed({ state, hasSprint }: ActivityFeedProps)` — Named export.
  - `state: DashboardState | null` — SSE'den gelen durum verisi
  - `hasSprint: boolean` — aktif sprint var mı
- JSDoc: **EKSIK** — export edilen fonksiyon dokümante edilmemiş.

Dahili fonksiyonlar (export edilmemiş):
- `formatTime(iso: string): string` — ISO timestamp → HH:MM:SS
- `makeId(): string` — Benzersiz ID üretir (Date.now + Math.random)

Dahili tipler:
- `ActivityEntry { id, timestamp, icon, message, detail? }`
- `ActivityFeedProps { state, hasSprint }`

## 3. İç Bağımlılıklar
- `react`: useEffect, useRef, useState
- `./ui/card`: Card, CardContent, CardHeader, CardTitle
- `../i18n/LanguageProvider`: useTranslation
- `../types`: DashboardState
- Döngüsel bağımlılık: YOK

## 4. Dış Bağımlılıklar
- React core — beklenen.

## 5. Complexity
- Fonksiyon sayısı: 3 (formatTime, makeId, ActivityFeed + inline useEffect callbacks)
- Max cyclomatic: **~8** (ana useEffect — satır 40-149)
  - Çoklu if/else/for iç içe: phase change (satır 47-59), agent status changes (satır 62-115), alert check (satır 117-136), progress (satır 138-142)
  - En karmaşık bölüm: agent status change detection — satır 62-115, 4 farklı durum dalı.
- **Refactoring adayı**: useEffect gövdesi bir `deriveEntries(state, prevRefs)` fonksiyonuna çıkarılabilir. P2.

## 6. Type Safety
- `any` sayısı: 0
- `@ts-ignore`: 0
- Non-null `!`: 0
- Unsafe cast: 0
- **SORUN**: `prevAgentsRef` Map<string, string> — agent ID + ":action" suffix'i aynı Map'te. Farklı semantik veriler (status vs action) tek Map'te karışıyor.
  - Satır 112: `prevAgentsRef.current.set(`${agent.id}:action`, agent.currentAction)`
  - Satır 103: `prevAgentsRef.current.get(`${agent.id}:action`)`
  - Tip güvenliği: string key kullanımı hata riski taşır. **P2** — ayrı Map kullanılmalı.

## 7. ADR Compliance
- ADR-033 (product vision): Uyumlu — kullanıcı deneyimi odaklı canlı izleme.
- Diğer ADR'ler: N/A — frontend bileşeni.

## 8. Test Coverage
- Doğrudan test: tests/dashboard/components.test.ts mevcut — ActivityFeed test edilmiş olabilir.
- Mock gereksinimi: DashboardState mock, i18n mock.
- Edge case: null state, boş agents, MAX_ENTRIES overflow, rapid updates.
- Memory V2 mock: N/A.

## 9. TODO/FIXME/HACK Inventory
- YOK — temiz.

## 10. Dead Code
- **`prevDoneRef`** (satır 37, 139-141): Değer güncellenir ama **hiçbir yerde okunmaz veya UI'da gösterilmez**.
  - Satır 139-141: `if (currentDone > prevDoneRef.current) { prevDoneRef.current = currentDone; }` — sadece güncelleme, hiçbir newEntry push edilmez.
  - **DEAD CODE** — **P1**. Bu ref ya progress entry eklemeli ya da kaldırılmalı.

## 11. Security
- XSS: `entry.message` ve `entry.detail` doğrudan JSX'te render. React otomatik escape yapar — düşük risk.
  - `alert.message` harici veri olabilir. P3.
- Input validation: state null kontrolü (satır 41) — var.

## 12. Memory V2 Uyumu
- N/A — DashboardState üzerinden çalışır, doğrudan Memory erişimi yok. Doğru.

## 13. i18n
- `useTranslation()` hook — tüm UI stringleri t() ile.
- **SORUN**: `formatTime()` satır 23: `toLocaleTimeString("en-GB", { hour12: false })` — **hardcoded "en-GB" locale**.
  - İ18n ihlali. Kullanıcı TR seçtiyse saat formatı yine "en-GB" — tutarsızlık. **P2**.
  - Görsel etki düşük (24h saat formatı TR/EN'de aynı) ama prensip ihlali.
- Emoji icon'lar hardcoded — evrensel, kabul edilebilir.

## 14. Dokümantasyon Tutarlılığı
- JSDoc: EKSIK — ActivityFeed, ActivityEntry, formatTime dokümante edilmemiş.
- `MAX_ENTRIES = 50` — neden 50? Gerekçe dokümante edilmemiş.

## 15. Performance
- Sync I/O: YOK.
- useEffect dependency: `[state, t]` — `t` dil değişikliğinde yenilenince tüm event detection yeniden çalışır. Fonksiyonel etki az (sadece yeni delta hesaplanır).
- `setEntries` functional update (satır 145) — doğru React pattern, stale closure önler.
- Auto-scroll: `scrollIntoView({ behavior: "smooth" })` — entries değişmezse tetiklenmez.

## 16. Öneriler
- **P1**: `prevDoneRef` dead code temizle veya progress entry push ekle (satır 37, 139-141).
- **P2**: `formatTime` locale'i i18n context'ten al — `lang === 'tr' ? 'tr-TR' : 'en-GB'`.
- **P2**: Agent status change logic'i test edilebilir ayrı fonksiyona çıkar.
- **P2**: `prevAgentsRef` Map — agent status ve action için ayrı ref'ler kullan.
- **P3**: `MAX_ENTRIES` değerini yorumla veya yapılandırılabilir yap.

## Verdict: ANALYZED
