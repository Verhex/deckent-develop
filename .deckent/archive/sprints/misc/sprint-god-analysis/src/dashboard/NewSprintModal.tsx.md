# Analysis: src/dashboard/src/components/NewSprintModal.tsx
**Task ID:** 142-028-fix | **Model:** opus | **LoC:** 171 | **Effort:** max

## 1. Amaç (detaylı, 3-5 cümle)
NewSprintModal, yeni bir sprint başlatmak için 5 adımlı (directives → planning → review → starting → done/error) bir dialog wizard'ı sunar. Kullanıcı sprint direktiflerini textarea'ya yazar, "Plan Sprint" ile backend'e gönderir, planlanan görevleri review eder ve "Confirm & Start" ile sprint'i başlatır. Backend API'leri: `/api/set-directives` ve `/api/plan` ile `/api/start`. Error handling ile hata durumunda tekrar deneme imkanı verir. Dialog bileşeni shadcn/ui üzerinden Radix primitives kullanır.

## 2. Public API
- `export function NewSprintModal({ open, onOpenChange }: NewSprintModalProps)` — Named export.
  - `open: boolean` — Dialog açık/kapalı
  - `onOpenChange: (open: boolean) => void` — Dialog durumu callback
- JSDoc: **EKSIK**

Dahili tipler:
- `ModalStep` — "directives" | "planning" | "review" | "starting" | "done" | "error"
- `PlanTask { id, title }` — Planlanan görev özeti
- `PlanResult { id, tasks }` — Plan API response
- `NewSprintModalProps { open, onOpenChange }`

Dahili fonksiyonlar:
- `reset()` — State sıfırlama
- `handleClose()` — Kapat + reset
- `handleSetDirectives()` — Directives gönder + plan al
- `handleStart()` — Sprint başlat

## 3. İç Bağımlılıklar
- `react`: useState
- `./ui/dialog`: Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
- `./ui/button`: Button
- `./ui/textarea`: Textarea
- `../lib/api`: postJson
- `../i18n/LanguageProvider`: useTranslation
- Döngüsel bağımlılık: YOK

## 4. Dış Bağımlılıklar
- React core, Radix UI primitives (shadcn/ui aracılığıyla).

## 5. Complexity
- Fonksiyon sayısı: 5 (reset, handleClose, handleSetDirectives, handleStart, NewSprintModal)
- Max cyclomatic: ~6 (NewSprintModal — 6 step koşullu render)
- En karmaşık fonksiyon: NewSprintModal — satır 31-170, switch-case benzeri step rendering.

## 6. Type Safety
- `any` sayısı: 0
- `@ts-ignore`: 0
- Non-null `!`: 0
- `ModalStep` — string literal union, discriminated union benzeri. Doğru.
- `postJson<{ success: boolean; taskCount: number }>` — generic tip ile response shape. Runtime validation yok ama tip seviyesinde güvenli. **P3**.
- `err instanceof Error ? err.message : String(err)` — catch block'ta doğru error narrowing. ✓

## 7. ADR Compliance
- ADR-033 (product vision): Sprint başlatma UX — ürünün temel kullanım akışı.
- ADR-022 (CLI/MCP parity): Dashboard'dan sprint başlatma = MCP'deki `deckent_set_directives` + `deckent_plan` + `deckent_start` zinciri. Uyumlu.
- Diğer ADR'ler: N/A.

## 8. Test Coverage
- Doğrudan test: tests/dashboard/components.test.ts veya ayrı dosya — kontrol gerekli.
- Mock: postJson mock, Dialog render.
- Edge case: boş directives (disabled button — satır 106), API hata, ağ hatası, planning timeout.
- **KRİTİK**: Bu bileşen sprint lifecycle başlatır — test coverage kritik.

## 9. TODO/FIXME/HACK Inventory
- YOK — temiz.

## 10. Dead Code
- YOK — tüm step render blokları aktif.

## 11. Security
- **CSRF**: `/api/set-directives`, `/api/plan`, `/api/start` — 3 POST endpoint'e CSRF token'siz istek. Eğer API bearer auth gerektiriyorsa OK, değilse CSRF riski. **P2**.
- **Input validation**: `directives.trim()` boş kontrolü (satır 106). Backend'de de validation olmalı.
- XSS: Directives textarea → backend → plan response → render. Backend'in sanitize ettiği varsayılır. `plan.tasks[].title` doğrudan render — React escape güvenli.

## 12. Memory V2 Uyumu
- N/A — Sprint başlatma UI'ı. Directives API üzerinden backend'e gider, backend Memory V2'ye yazar.

## 13. i18n
- `useTranslation()` — tüm UI stringleri t() ile: modal.directives_hint, modal.plan_sprint, modal.planning, vb.
- Textarea placeholder: `t("modal.directives_placeholder")` — lokalize. ✓
- **SORUN**: Satır 122: `{taskCount} {t("modal.review_tasks_parsed")} <strong>{plan.id}</strong> {t("modal.review_planned_with")} {plan.tasks.length} {t("modal.review_tasks_suffix")}` — kırık i18n pattern.
  - Sayılar string interpolasyona gömülü. Türkçe/İngilizce cümle yapısı farklı olabilir.
  - Doğru yaklaşım: `t("modal.review_summary", { taskCount, sprintId: plan.id, planTasks: plan.tasks.length })` — tek key, parametreli. **P2**.

## 14. Dokümantasyon Tutarlılığı
- JSDoc: EKSIK.
- 3 API endpoint kullanılıyor — api-surface.md'de belgelenmiş mi? `/api/set-directives`, `/api/plan`, `/api/start`.
- 5 step workflow belgelenmemiş.

## 15. Performance
- Async operations: `handleSetDirectives` iki ardışık API çağrısı yapar (set-directives → plan). İlk hata ikincisini önler — doğru.
- State: 5 useState — minimal.
- Dialog: Open/close ile mount/unmount — Radix primitive. OK.

## 16. Öneriler
- **P2**: Review message'ı (satır 122) — tek i18n key + parametreli template kullan.
- **P2**: CSRF koruması — API çağrılarına token ekle.
- **P2**: Planning step'te loading spinner ekle (şu an sadece text).
- **P3**: JSDoc ekle — 5 step workflow'u belgele.
- **P3**: Plan API timeout handling — kullanıcı uzun süre "Planning..." görürse bilgilendir.

## Verdict: ANALYZED
