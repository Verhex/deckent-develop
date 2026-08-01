# SURF-4 — Desktop Tasarım Temeli Planı (ONAYLANDI)

> **Durum:** Plan + teknoloji-yığını Alperen tarafından onaylandı (2026-07-16). Kod **D4-0'dan** başlar (gelecek oturum).
> **Görsel plan (artifact):** https://claude.ai/code/artifact/429412f4-5064-4219-b760-32a484e5c2ba
> **Yöntem:** 3 paralel Explore-ajanı (desktop-kabuk · shared-contract · design/theming/i18n/router) + Context7 versiyon-doğrulaması.

---

## 0 · Kurucu karar (Alperen, 2026-07-16)

> "Tasarım dashboard'dan BESLENMEYECEK, tamamen sıfırdan. Daha **agentic · etkileşimli · görsel+etkileşimsel kusursuz** bir ürün. Dashboard tasarımını kopyalamak **YASAK**. Her detay adım adım; gerekirse Claude-design + başka araçlar. App **customize-edilebilir + tema-değiştirilebilir** olsun. **Güncel + stabil** kritik; bir kez seç, sonra altyapı/sistem değişimine maruz kalma."

---

## 1 · Mimari gerçek (harita bulgusu)

- **İki ayrı yüzey:** (a) Desktop **renderer** = düz TS+DOM, framework-siz, el-yazımı 3-ekran state-machine (`src/desktop/src/renderer/app.ts`). (b) **Dashboard** = ayrı React-app, daemon HTTP'den sunar; `connectWindow` → `loadURL(daemonUrl)` pencereyi devreder (`window-manager.ts:218-231`). Spec dashboard'ı SURF-7'de salt-okunura emekli eder — "ürün değil".
- **Spec + karar örtüşüyor:** SURF-4 = Console/Chat/Approval/History kabukları **desktop-app'te sıfırdan**, daemon'ın **shared RunFlow contract**'ını tüketir. Karar-D4/536: "dashboard-reuse ÜRÜN DEĞİL → first-class Desktop-UX; IPC=UI-grade-only". **Console net-yeni** (hiçbir yerde ConsolePage yok).
- **🔴 Yük-taşıyan kısıt (transport-duvarı):** renderer CSP `'self'`-only + IPC UI-grade-only (`desktop-api.ts:62-67`) → renderer daemon'a ULAŞAMIYOR. Canlı-veri view'ları için transport-hattı açılmalı (D4-3'ün temeli).

---

## 2 · Teknoloji yığını (ONAYLANDI · Context7-doğrulandı)

| Katman | Teknoloji | Versiyon | Rol | Durum |
|---|---|---|---|---|
| Kabuk | Electron | 43.x | pencere · daemon-lifecycle · güvenlik | kurulu |
| Build | electron-vite + Vite | 4.x | HMR + bundle (main/preload/renderer) | kurulu |
| Framework | **React** | 19.2.7 | bileşen-modeli · `createRoot` client-render | ✅ onaylı |
| Router | **react-router** | 7.9.4 | `createHashRouter` (Electron `file://`) · kütüphane-modu | ✅ onaylı |
| Server-state | **TanStack Query** | 5.90.3 | RunFlow REST cache + SSE canlı-besleme · invalidate/subscribe | ✅ onaylı |
| Tema/stil | CSS custom properties (lib-siz) | — | 3-katman token · runtime tema-switch · CSP-güvenli | ✅ onaylı |
| UI-state | Zustand | güncel | hafif client-state (tema/nav/tercih) | D4-0'da kilitle |
| A11y | Radix / React-Aria | güncel | erişilebilir etkileşim (menü/dialog/odak) | D4-0'da kilitle |

**Context7-doğrulama (2026-07-16):** React 19.2.7 · react-router 7.9.4 · TanStack Query 5.90.3 — üçü de mevcut stabil major.

**5-kriter gerekçesi:**
- **Hız** — React-Compiler (oto-memoization) + concurrent-render; Vite HMR; Query-cache gereksiz refetch'i keser.
- **Ölçek** — SSE→cache→reaktif abone; çok-flow = query-key scoping + pagination; yeni endpoint = yeni query.
- **Güncellik** — üçü bugünün stabil-major'ı; aktif bakım.
- **Modülerlik** — router/server-state/UI-state/tema ayrık; kabuklar cache'in ince tüketicileri; tema tek-dosyada eklenir (semantic-override).
- **Stabilite** — geriye-uyum + kanıtlı ekosistem; tema lib-siz = sıfır-dep-riski.

**🔒 Re-platform riski yok:** üçü mevcut stabil-major → yakın-vade zorunlu geçiş yok; React 19 kırıcı-değişiklikleri sıfırdan-kurulumda ARKADA; TanStack Query veri-katmanını bileşenlerden ayırdığı için gelecekteki transport/yüzey değişimi = adaptör-değişikliği, tüm-app yeniden-yazımı DEĞİL.

---

## 3 · Kilitlenen kararlar

1. **Framework = React 19 + HashRouter** (§2 gerekçe; yeni-dep → ADR-D-005 gerekçe-kaydı gerekir). Taze Desktop-bileşenleri yazılır; dashboard'dan HİÇBİR ŞEY import edilmez.
2. **Transport = renderer CSP `connect-src`'i aktif daemon-origin'ine genişlet.** Renderer kendi `fetch`/`EventSource`'uyla RunFlow+Approval API'sini tüketir; IPC UI-grade kalır. Auth: mutasyon Bearer-header, SSE `?token=` (zaten allowlist'te — SURF-2).
3. **İki-kontrat (kısıt):** Console/Chat/History → **RunFlow** API (`propose/list/:id/preview/decision/start/cancel` + SSE `:id/events`, `Last-Event-ID` replay). Approval → **ayrı ApprovalBroker** (`/api/approvals*`, bugün **poll-based**, SSE-endpoint YOK), kararlar `approval.api_decide` flag'li.
   - **Flag-önkoşulları:** Desktop daemon `terminal.run_flow_v2: true`; canlı-approval için `approval.api_decide: true`.

---

## 4 · Design-first dilim planı (D4-0 → D4-4)

| Dilim | İş | Bitti-kriteri |
|---|---|---|
| **D4-0** | **Art-direction & etkileşim-dili** (net-yeni) — sıfırdan görsel-dünya: mood, tipografi, agentic-hareket/etkileşim ilkeleri. Design-araçlarıyla (`design-system` skill · `ui-ux-pro-max` · `frontend-design`), kod değil YÖN olarak. | Seçilmiş yön (palet+tipografi+hareket+imza-etkileşim) + Zustand/a11y-lib kilitli, onaylı |
| **D4-1** | **Tema-token mimarisi & customization** — 3-katman CSS-vars; runtime tema-switch (`data-theme`); kullanıcı-özelleştirme (`style.setProperty`); yeni `preferences-store` (`connection-profile-store` deseni: atomik/0600/zod/versiyonlu) + IPC-kanalı (mirror-lint'li) | light/dark/custom runtime-switch + restart-persist; token-validator yeşil |
| **D4-2** | **Renderer i18n** — tek `messages.ts` SSOT'u `app.getStrings()` IPC-köprüsüyle; yeni view-anahtarları `desktop.*` altına; renderer-yerel fallback'ler kaynağa geri-katlanır | her view-string en+tr çözülür; renderer-yerel literal sıfır |
| **D4-3** | **App-shell + router + transport-client** — kalıcı shell (4-view nav), `HashRouter`, tipli API-client (RunFlow REST+SSE + ApprovalBroker poll), TanStack Query cache; flag-önkoşulları yüzeye | shell boot + 4-view route + tek gerçek RunFlow-olayı HTTP'den akar |
| **D4-4** | **4 kabuk tasarımı** — Console(net-yeni)/Chat/Approval/History yapı+görsel; derin gerçek-workflow = SURF-5. Terminal state-etiketi + inbox-nav mantığı uyduğu yerde reuse | 4 tasarlanmış kabuk canlı-kontrat render eder; her biri D4-0'a göre gözden geçirilmiş |

---

## 5 · Elde hazır (kopyalanmadan reuse)

- Terminal state-badge etiketleri + `flowId`-yapışkan seçim-mantığı — `src/cli/repl/run-flow-inbox.ts` (`InboxLabels`, `mapInboxKey`/`reduceInboxNav`/`realignInboxSelection`).
- Kalıcılık deseni — `src/desktop/src/main/connection-profile-store.ts` → tercih/tema-store için klonla.
- i18n-köprüsü (`main/i18n.ts` → `app.getStrings()` IPC) + `design-system` skill'i genişletmeye hazır.
- IPC-SSOT: `src/desktop/src/shared/desktop-api.ts` (mirror-lint'li — `scripts/lint-desktop-api-sync.mjs`; yeni kanal eklerken güncelle).

## 6 · Guardrail'ler (boyunca)

İkinci-implementation YOK · IPC UI-grade kalır · i18n tek-katalog (`messages.ts`) · hermetik tmpdir-testleri (`vitest.desktop.config.ts`) · sıfırdan-tasarım, dashboard ASLA kopyalanmaz · Tier-1 user-surface → proof-of-function.
