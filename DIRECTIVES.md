# DIRECTIVES — Sprint 283: ARC-C Mini-FIX — Sprint-282'nin Spawn-Edilmeyen 3 Task'ı

## Goal: Sprint-282'de dispatch-açlığıyla HİÇ spawn edilmeden sentetik-NO_GO damgalanan 3 dar-kapsamlı dashboard task'ı (DASH-UX-5, DASH-UX-7, DASH-UX-8 sayfa-parçası) tamamlansın. Kod-tabanı 282-fix'leriyle güncel: `nav-items.ts` tek-kaynak VAR (ona ekle), i18n katalogları genişledi, ChatPage/Layout değişti — ÖNCE güncel hallerini oku.

## Ortak kurallar
- **i18n-FIRST:** dashboard string'leri `src/dashboard/src/i18n/{en,tr}.ts` — yeni key'lerde en+tr eksiksiz. **EMOJI YASAK** — lucide-react ikon.
- **Tier-1 Proof-of-Function:** `Smoke:` zorunlu; mock-only = GO_WITH_TECH_DEBT (ADR-079).
- **Test hermetik** (ADR-087); dashboard testleri `npm run test:dashboard`.
- **Surgical:** Sprint-282'nin yeni dosyalarını (nav-items.ts, status-reconcile.ts) BOZMA — genişlet.

---

## Task 1: Terminal-bar overlap — z-index/layout fix (eski 282-007)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: low
- Agent: frontend-designer
- Skills: frontend-design, react-specialist
- Files: src/dashboard/src/components/TerminalPanel.tsx, src/dashboard/src/components/Layout.tsx, src/dashboard/src/__tests__/terminal-no-overlap.test.tsx
- Scope: src/dashboard/src/

### Description
Collapsed Terminal çubuğu sidebar'ın YÖNET bölümünü örtüyor (DASH-UX-5). FIX: layout-grid/z-index düzelt — collapsed-bar sidebar'la çakışmaz (sidebar üstte ya da bar sidebar-genişliğini sayar); responsive kırılımlarda doğru. DİKKAT: `Layout.tsx` Sprint-282'de değişti (nav-items.ts tüketiyor) — güncel halini oku, nav-yapısını bozma; yalnız layout/z-index katmanına dokun.

**Smoke:** `npm run build:all` → `node dist/cli/entry.js serve --port 3285 --no-terminal &` → `curl -s -o /dev/null -w '%{http_code}' localhost:3285/` = 200; `npm run test:dashboard` yeşil.
**Kanıt:** terminal-no-overlap render-testi geçer (collapsed-bar ↔ sidebar kesişmez — z-index/position sınıf-assert'leri). **Test:** 2+.

---

## Task 2: DebtPage route + /settings yüzeyi (eski 282-009)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: frontend-designer
- Skills: react-specialist, frontend-design
- Files: src/dashboard/src/App.tsx, src/dashboard/src/nav-items.ts, src/dashboard/src/pages/SettingsPage.tsx, src/dashboard/src/i18n/en.ts, src/dashboard/src/i18n/tr.ts, src/dashboard/src/__tests__/settings-debt-surface.test.tsx
- Scope: src/dashboard/src/

### Description
DASH-UX-7: (1) `DebtPage.tsx` (hazır, 226 LoC) route-suz orphan → `/debt` route'u + **mevcut `nav-items.ts` tek-kaynağına** ekle (İzle grubu — Sprint 282-006'nın dosyası, formatına uy). (2) `/settings` yüzeyi yok → `SettingsPage.tsx`: dil (en/tr), tema (dark/light — theme.ts token'ları), bildirim-tercihleri; mevcut `/api/config` GET/SET ile; **yalnız gerçek-etkili ayarlar** (no-op knob YASAK — `sprint_timeout_minutes`/`output_splash` gibi okunmayan key'leri LİSTELEME, CORE-W4). i18n eksiksiz en+tr; lucide ikon; nav-items'a Yönet grubuna ekle.

**Smoke:** `npm run build:all` → `node dist/cli/entry.js serve --port 3284 --no-terminal &` → `curl -s -o /dev/null -w '%{http_code}' localhost:3284/` = 200; `npm run test:dashboard` yeşil (settings+debt render).
**Kanıt:** `grep -nE "debt|settings" src/dashboard/src/App.tsx | wc -l` ≥2 + her ikisi nav-items.ts'te. **Test:** 3+ (route-render ×2, settings-set-roundtrip mock-api).

---

## Task 3: Dashboard sayfa-içi i18n-temizliği (eski 282-012)
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: frontend-designer
- Skills: react-specialist, documentation-writer
- Files: src/dashboard/src/pages/EvolutionPage.tsx, src/dashboard/src/pages/NervousPage.tsx, src/dashboard/src/pages/MemoryExplorerPage.tsx, src/dashboard/src/i18n/en.ts, src/dashboard/src/i18n/tr.ts, src/dashboard/src/__tests__/i18n-no-literal-labels.test.tsx
- Scope: src/dashboard/src/
- Dependencies: 283-002

### Description
DASH-UX-8 sayfa-parçası: Evolution/Nervous/Memory-Explorer sayfalarındaki literal label-override'lar (karışık TR/EN) i18n-key'lere (en+tr eksiksiz; sayfa-namespace'leri — Task-2'nin settings-key'leriyle çakışma, Dependencies sıralı). EnterprisePage'e DOKUNMA (282-010 halletti). Nav-label'lar 282-006'da kapandı — yalnız sayfa-içi başlık/buton/empty-state. "Kesin dil-ayrımı": tek sayfada karışık TR/EN ASLA.

**Smoke:** `npm run build:all` → `node dist/cli/entry.js serve --port 3283 --no-terminal &` → `curl -s -o /dev/null -w '%{http_code}' localhost:3283/` = 200; `npm run test:dashboard` yeşil.
**Kanıt:** i18n-no-literal-labels testi: 3 sayfada hardcoded-Türkçe-string = 0. **Test:** 1+ (literal-tarama).

---

**Beklenen:** 3 task; W1={1,2} → W2={3} (i18n-dosya çakışması dependency'yle sıralı; Task-1 i18n'e yazmıyor). Model: sonnet 2 · haiku 1; hepsi claude/docker. Sprint-sonu CC: Tier-1 smoke + MASTER-PLAN DASH-UX-5/7/8 işaretleme + playwright UX re-audit (ARC-C dilim-1 bütünü).
