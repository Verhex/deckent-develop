# deckent — Web Dashboard Decko Re-Theme (FAZ 1-5)

> Shipped dark-zinc+blue dashboard'ın **Decko marka "logbook" tasarımına** (dark teal/gold, terminal-native) mockup-fidelity dönüşümü. Tasarım kaynağı: `docs/design/web-console/` (Claude-design handoff v2).

## Özet

| FAZ | Kazanım | Durum |
|-----|---------|-------|
| **1** | Tema tabanı — v4 `@theme` teal/gold tokenlar + Hanken Grotesk / IBM Plex Mono fontlar | ✅ |
| **2** | `blue→brand` sweep (26 dosya, 55 occurrence) + gold signature (aktif-nav border, PhaseTimeline glow) | ✅ |
| **3a** | WorkerCard restructure — 2px üst status-bar + gold tier label + provider renk-bar'ı | ✅ |
| **3b** | Terminal dock — gold-hairline + lucide ikonlar + maximize (gerçek xterm PTY korundu) | ✅ |
| **5** | Sidebar Decko mascot(40px) + page-head + 4-kart stat-row + sprint-card konsolidasyon + section-label'lar + alert-dedupe + mascot favicon | ✅ |

> tsc temiz · 796 dashboard test yeşil · kullanıcı görsel-onaylı ("başarılı"). Kaynak: `docs/design/web-console/` (README spec + screens/*.png + reference/*.jsx prototip + colors_and_type.css + assets/).

---

## 1. Marka kimliği — teal/gold + fontlar (FAZ 1)

**Ne?** İşlevsel accent **blue → teal `#54A89C`** (Decko kraken gövdesi), ikincil **gold `#C0B46C`** (devre izleri). UI fontu **Hanken Grotesk**, mono/terminal **IBM Plex Mono**. Status renkleri (DONE yeşil / NO_GO kırmızı / PAUSED amber) **korundu**.

**Teknik nüans:** Dashboard **Tailwind v4 `@theme`** kullanıyor (`--color-*: #hex`), handoff ise shadcn-HSL (`--primary: H S% L%`). Verbatim paste DEĞİL — handoff hex'leri v4 `@theme`'e çevrildi → `bg-brand-600`/`text-gold`/`font-mono` util'leri üretildi. `accent` zinc bırakıldı (v4 `bg-accent` hover'ı bozulmasın). **Kod:** `src/dashboard/src/index.css` (`@theme`), `index.html` (Google Fonts).

## 2. blue→brand sweep + gold signature (FAZ 2)

26 dosya / 55 blue-occurrence → teal `brand-*` (handoff find/replace). **3 gold signature-spot:** aktif nav left-border (`border-gold`), PhaseTimeline aktif-node glow (`shadow-[0_0_0_3px_rgba(84,168,156,.35)]`), worker tier label. Surgical (sadece blue-token).

## 3. WorkerCard + Terminal (FAZ 3)

- **WorkerCard:** sol-4px border → **2px üst status-bar** (EXECUTING teal-gradient, DONE green…); **gold tier label** (premium/standard/economy — model'den client-derive) + **provider renk-bar'ı** (Claude clay / Codex green / Gemini blue). Canlı docker log-tail (SSE) korundu. **Kod:** `components/WorkerCard.tsx`.
- **Terminal dock:** gold-hairline + lucide session-ikonları + **maximize/restore** (70vh overlay) + xterm teal/gold tema. **Gerçek PTY (xterm+WebSocket) DEĞİŞMEDİ** — canned-demo'ya düşürülmedi. **Kod:** `components/DockPanel.tsx`, `components/terminal/*`.

## 4. Layout & polish — mockup-fidelity (FAZ 5)

- **Sidebar:** `/logo.png`(7px pixelated) → **Decko mascot** (`decko-conductor-glow`, 40px smooth) + wordmark extrabold/-0.03em.
- **Page-head:** gradient "Sprint Dashboard" → **"Dashboard"** + "Live sprint orchestration · N workers" alt-başlık.
- **Stat-row:** 4 prominent kart — Active sprint(#id mono) · Tasks complete(done/total +yeşil-dot) · Executing now(+amber-dot) · Current phase(mono); `.num` text-3xl/700/-.02em.
- **Sprint-card konsolidasyon:** segmented-progress + "Sprint lifecycle" section-label tek kartta (standalone progress-card kaldırıldı).
- **section-label'lar** ("Sprint lifecycle", "Workers") + **alert-dedupe** (identical level+message collapse + ×count + cap-6 → stale-md spam bastırıldı).
- **Favicon:** eski 64² → Decko mascot.
- **i18n:** `dashboard.subtitle/stat_*/lifecycle/workers_label` (en+tr). **Kod:** `components/Layout.tsx`, `pages/DashboardPage.tsx`, `i18n/{en,tr}.ts`.

---

## Kaynak & doğrulama

- **Tasarım kaynağı:** `docs/design/web-console/` — README (266-satır spec, token hex+HSL, ekran-ekran, kabul listesi) + `screens/01-04.png` (hi-fi mockup) + `reference/*.jsx` (standalone çalışan prototip = en kesin layout direktifi) + `colors_and_type.css` (temel token) + `assets/` (Decko mascot PNG'leri).
- **Doğrulama:** her FAZ → `build:dashboard` + `tsc --noEmit` + `test:dashboard` (796 yeşil). Görsel: kullanıcı `:3100`'de eyeball-onayladı. *(Playwright headless-screenshot bu oturumda MCP-session wedged — plugin reset sonrası pixel-match mühürlenir.)*
- **Kalan (görsel-iterasyon):** WorkerCard grid density birebir, Chat sayfası + diğer view'ların tasarım-sistem tutarlılığı — canlı görsel üzerinden ince-ayar.

İlgili: [[20-son-sprint-kazanimlari]] · MASTER-PLAN §3 (Sprint 226-232) + F7-003 · `docs/design/web-console/README.md`.
