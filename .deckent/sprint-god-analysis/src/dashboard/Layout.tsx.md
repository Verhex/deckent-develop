# Analysis: src/dashboard/src/components/Layout.tsx
**Task ID:** 142-028-fix | **Model:** opus | **LoC:** 149 | **Effort:** max

## 1. Amaç (detaylı, 3-5 cümle)
Layout, dashboard'un ana iskelet bileşenidir. Desktop'ta 240px genişliğinde sabit sidebar, mobilde Sheet (slide-in drawer) ile responsive navigasyon sağlar. SSE bağlantısı (useSSEWithStatus) üzerinden DashboardState alır ve sidebar'da sprint durumu, auditor aktiflik badge'i ve SSE bağlantı durumu (connected/connecting/disconnected) gösterir. Dil değiştirme (TR↔EN) toggle'ı sidebar alt kısmında yer alır. React Router <Outlet /> ile sayfa içeriğini ScrollArea içinde render eder.

## 2. Public API
- `export function Layout()` — Named export, React Router layout bileşeni. JSDoc **EKSIK**.

Dahili bileşenler (export edilmemiş):
- `NavLinks({ onNavigate? })` — 4 navigasyon linki render eder
- `LanguageSwitcher()` — TR↔EN dil toggle butonu
- `SidebarContent({ onNavigate?, sseState, sseStatus })` — sidebar iç yapısı

Dahili veriler:
- `navItems: ReadonlyArray<{ to, labelKey, icon }>` — 4 route tanımı
- `SSE_COLORS: Record<SSEStatus, string>` — SSE durum renkleri
- `SSE_LABEL_KEYS: Record<SSEStatus, string>` — SSE durum etiket key'leri

## 3. İç Bağımlılıklar
- `react-router-dom`: NavLink, Outlet
- `react`: useState
- `lucide-react`: LayoutDashboard, History, Brain, Menu, SlidersHorizontal, Globe (6 ikon)
- `../lib/utils`: cn (className merge)
- `./ui/sheet`: Sheet, SheetTrigger, SheetContent
- `./ui/scroll-area`: ScrollArea
- `./ui/badge`: Badge
- `../hooks/useSSE`: useSSEWithStatus, SSEStatus type
- `../i18n/LanguageProvider`: useTranslation
- `../types`: DashboardState
- `../i18n/en`: TranslationKey type
- Döngüsel bağımlılık: YOK

## 4. Dış Bağımlılıklar
- `react-router-dom`, `lucide-react` — Dashboard scope'unda.

## 5. Complexity
- Fonksiyon sayısı: 4 (NavLinks, LanguageSwitcher, SidebarContent, Layout)
- Max cyclomatic: ~4 (SidebarContent — koşullu sprint/auditor render)
- En karmaşık fonksiyon: Layout — satır 112-148, responsive yapı + Sheet state

## 6. Type Safety
- `any` sayısı: 0
- `@ts-ignore`: 0
- Non-null `!`: 0
- `navItems` — `ReadonlyArray` ile immutable tipi. Doğru.
- `labelKey: TranslationKey` — type-safe i18n key referansı. Doğru pattern.
- `SSE_COLORS` ve `SSE_LABEL_KEYS` — `Record<SSEStatus, string>` ile tam kapsama. Doğru.
- **TEMİZ**.

## 7. ADR Compliance
- ADR-033 (product vision): Dashboard ana layout — ürünün temel UI yapısı.
- ADR-022 (CLI/MCP parity): Layout yalnızca dashboard UI. N/A.
- Diğer ADR'ler: N/A.

## 8. Test Coverage
- Doğrudan test: `tests/dashboard/layout.test.ts` — MEVCUT (dedicated test dosyası).
- Mock: useSSEWithStatus mock, react-router mock.
- Edge case: null SSE state, disconnected status, mobil/desktop responsive.

## 9. TODO/FIXME/HACK Inventory
- YOK — temiz.

## 10. Dead Code
- `navItems` 4 route tanımlı: `/`, `/history`, `/memory`, `/config`. App.tsx'te `/settings` route'u var ama navItems'ta yok. `/settings` sidebar'dan erişilemez — bu kasıtlı mı (redirect only)?
  - Kasıtlı ise: `/settings` gizli route — document edilmeli. **P3**.

## 11. Security
- SSE endpoint: `/api/events` — hardcoded relative URL. CORS/proxy bağımlı.
- XSS: Sidebar içeriği statik veya SSE state'ten. React escape — güvenli.
- LanguageSwitcher: `/api/config` POST ile dil değişikliği persist eder (satır LanguageProvider 37-42). CSRF token yok — eğer backend production'da açıksa risk. **P2** (Dashboard local kullanım, düşük risk ama prensip ihlali).

## 12. Memory V2 Uyumu
- N/A — Layout Memory'ye erişmez. SSE üzerinden dashboard state alır.

## 13. i18n
- `useTranslation()` — sidebar labels, auditor status, SSE labels tüm t() ile.
- `navItems.labelKey: TranslationKey` — type-safe key. Doğru.
- LanguageSwitcher: `lang === 'en' ? 'TR' : 'EN'` — hardcoded toggle text. Kabul edilebilir (kısa label).
- LanguageSwitcher title: `lang === 'en' ? 'Türkçeye geç' : 'Switch to English'` — hardcoded string, i18n dışı. **P3** — t() ile olmalı ama görsel etkisi düşük.
- "deckent" brand text hardcoded — lokalize edilmemesi doğru (marka adı).

## 14. Dokümantasyon Tutarlılığı
- JSDoc: EKSIK — Layout, NavLinks, SidebarContent dokümante edilmemiş.
- navItems 4 route = App.tsx'teki 5 route'un 4'ü. `/settings` eksik (kasıtlı redirect?).

## 15. Performance
- SSE hook: useSSEWithStatus — tek bağlantı, Layout'ta tutulur. Doğru (alt bileşenler prop drilling ile alır veya context kullanır). Layout remount olmazsa SSE bağlantısı stabil.
- ScrollArea: Content lazy değil ama sayfa bazında Outlet yeterli.
- Sheet: Mobil drawer — sadece açık olduğunda DOM'da. Radix primitives ile. OK.

## 16. Öneriler
- **P2**: CSRF koruması — `/api/config` POST endpoint'ine CSRF token ekle (veya SameSite cookie).
- **P3**: JSDoc ekle — Layout, NavLinks, SidebarContent.
- **P3**: `/settings` route'u navItems'tan erişilemez — kasıtlıysa belgele, değilse kaldır.
- **P3**: LanguageSwitcher title string'ini t() ile lokalize et.
- **P3**: SSE bağlantı koptuğunda kullanıcıya toast/banner göster (şu an sadece kırmızı dot).

## Verdict: ANALYZED
