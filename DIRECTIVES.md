# DIRECTIVES — Sprint 084: Dashboard Faz B — Skeleton Loading + Task Detay + Empty States

## Goal: Dashboard'u profesyonel seviyeye çıkar: skeleton loading, zengin task detay, anlamlı boş durumlar, genel polish.

---

## Task 1: Skeleton Loading Bileşenleri
- Model: sonnet
- Effort: normal
- Agent: refactorer
- Skills: frontend-expert, typescript-expert
- Files: src/dashboard/src/components/Skeleton.tsx, src/dashboard/src/pages/DashboardPage.tsx, src/dashboard/src/pages/HistoryPage.tsx, src/dashboard/src/pages/MemoryPage.tsx, src/dashboard/src/pages/ConfigPage.tsx
- Scope: src/dashboard/

### Description
Veri yüklenirken skeleton placeholder göster — "Loading..." text yerine:

A) `Skeleton.tsx` bileşeni oluştur:
- `SkeletonCard`: Kart şeklinde animasyonlu placeholder (animate-pulse)
- `SkeletonTable`: Tablo satırları placeholder
- `SkeletonText`: Metin satırı placeholder (farklı genişliklerde)
- Tailwind: `animate-pulse bg-zinc-800 rounded`

B) Her sayfada `loading` state'i true iken skeleton göster, false olunca gerçek içerik.

**Kanıt:** `grep "Skeleton\|skeleton" src/dashboard/src/pages/DashboardPage.tsx` → kullanılıyor

**Test:** `tsc --noEmit` temiz.

---

## Task 2: AgentDetail Zenginleştirme
- Model: sonnet
- Effort: normal
- Agent: refactorer
- Skills: frontend-expert, typescript-expert
- Files: src/dashboard/src/components/AgentDetail.tsx, src/dashboard/src/i18n/en.ts, src/dashboard/src/i18n/tr.ts
- Scope: src/dashboard/

### Description
AgentDetail sheet'ini zenginleştir:

A) Task başlığı büyük font, description collapsible, model/status badge, agent+skill bilgisi, scope, dosya değişiklikleri, elapsed time

B) Log bölümü: mono font, auto-scroll, copy butonu

C) i18n key'leri: agent.description, agent.scope, agent.files_changed, agent.elapsed, agent.copy_log

**Kanıt:** `grep "agent\.scope\|agent\.files_changed" src/dashboard/src/components/AgentDetail.tsx` → var

**Test:** `tsc --noEmit` temiz.

---

## Task 3: Empty State Bileşenleri
- Model: sonnet
- Effort: normal
- Agent: refactorer
- Skills: frontend-expert, typescript-expert
- Files: src/dashboard/src/components/EmptyState.tsx, src/dashboard/src/pages/HistoryPage.tsx, src/dashboard/src/pages/MemoryPage.tsx
- Scope: src/dashboard/

### Description
Veri olmadığında anlamlı, görsel empty state göster. `EmptyState.tsx` bileşeni: ikon + başlık + açıklama + opsiyonel aksiyon butonu. Her sayfada kullan. İkonlar lucide-react. i18n çift dilli.

**Kanıt:** `grep "EmptyState" src/dashboard/src/pages/HistoryPage.tsx` → kullanılıyor

**Test:** `tsc --noEmit` temiz.

---

## Task 4: Dashboard Genel Polish
- Model: sonnet
- Effort: normal
- Agent: refactorer
- Skills: frontend-expert, typescript-expert
- Files: src/dashboard/src/pages/DashboardPage.tsx, src/dashboard/src/components/WorkerCard.tsx, src/dashboard/src/components/Layout.tsx
- Scope: src/dashboard/

### Description
A) Card'lara tutarlı shadow
B) WorkerCard: hover scale animasyonu, EXECUTING sol mavi kenar
C) SprintPhaseTimeline: aktif faz bold
D) transition-all duration-200 tüm interaktif elemanlarda
E) Responsive doğrulama

**Kanıt:** `grep "hover:scale\|transition-transform" src/dashboard/src/components/WorkerCard.tsx` → var

**Test:** `tsc --noEmit` temiz.

---

## Quality Rules
- tsc --noEmit MUST pass
- npm run test:dashboard → 372+ passed
- npx vitest run → 0 fail
- %100 GO hedefli
