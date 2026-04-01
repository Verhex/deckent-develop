# DIRECTIVES — Sprint 083: Dashboard UX Overhaul Faz A — Worker Kartları + Sprint Timeline + Activity Feed

## Goal: Dashboard'u son kullanıcı dostu, görsel, canlı izlenebilir hale getir. Worker kart grid, sprint faz timeline, canlı aktivite feed. Profesyonel UX.

---

## Task 1: WorkerCard Bileşeni — Canlı Agent Kart Grid
- Model: opus
- Effort: high
- Agent: refactorer
- Skills: frontend-expert, typescript-expert
- Files: src/dashboard/src/components/WorkerCard.tsx, src/dashboard/src/pages/DashboardPage.tsx
- Scope: src/dashboard/

### Description
Mevcut worker tablosunu **kart grid** ile değiştir. Her worker bir kart:

A) `WorkerCard.tsx` bileşeni oluştur:
```
┌─────────────────────────────┐
│  🤖 w-076-001        sonnet │  ← Model badge sağ üst
│  ─────────────────────────  │
│  📝 CHANGELOG entry         │  ← Task başlığı
│  Agent: doc-writer          │  ← Atanan agent
│  Skill: documentation       │  ← Atanan skill
│  ─────────────────────────  │
│  ⏱ 3m 42s    ❤️ 5s ago     │  ← Elapsed + son heartbeat
│  📁 3 files changed         │  ← Dosya değişiklik sayısı
│  ─────────────────────────  │
│  ▌▌▌▌▌▌▌░░░ EXECUTING      │  ← Durum çubuğu + badge
│                    [Detail] │  ← Detay butonu
└─────────────────────────────┘
```

B) Durum renkleri:
- EXECUTING: mavi pulse animasyon (border-blue-500 + animate-pulse)
- DONE: yeşil border + ✓ ikonu
- NO_GO: kırmızı border + ✗ ikonu  
- PAUSED: sarı border + ⏸ ikonu
- IDLE: gri border

C) Model ikonları:
- opus: 💎 (premium)
- sonnet: ⚡ (standard)
- haiku: 🍃 (lightweight)

D) Kart grid: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`

E) Tıklanınca mevcut AgentDetail sheet açılsın (onClick → setSelectedAgent)

F) Kart üzerinde canlı `currentAction` gösterimi (SSE'den gelen veri)

G) Boş durum: sprint yokken veya worker yokken "Henüz worker yok — sprint başlatın" mesajı

H) DashboardPage.tsx'teki mevcut worker Table'ı kaldır, yerine WorkerCard grid koy.

I) i18n: useTranslation ile tüm etiketler çift dilli

**Kanıt:** `grep "WorkerCard\|grid-cols" src/dashboard/src/pages/DashboardPage.tsx` → kart grid kullanılıyor

**Test:** `tsc --noEmit` temiz geçmeli.

---

## Task 2: SprintPhaseTimeline Bileşeni — Faz Görsel Akışı
- Model: sonnet
- Effort: normal
- Agent: refactorer
- Skills: frontend-expert, typescript-expert
- Files: src/dashboard/src/components/SprintPhaseTimeline.tsx, src/dashboard/src/pages/DashboardPage.tsx
- Scope: src/dashboard/

### Description
Sprint'in hangi fazda olduğunu görsel timeline olarak göster:

A) `SprintPhaseTimeline.tsx` bileşeni:
```
PLAN ──● SPAWN ──● EXECUTE ──◉ EVALUATE ──○ RETRO ──○ CLEANUP
 ✓        ✓         ●                                         
```

B) Fazlar dizisi: PLAN, SPAWN, EXECUTE, EVALUATE, FIX, RETRO, DECAY, CLEANUP

C) Her faz bir daire + etiket:
- Tamamlanan fazlar: yeşil dolu daire (●) + yeşil çizgi
- Aktif faz: mavi büyük daire (◉) + pulse animasyon
- Gelecek fazlar: gri boş daire (○) + gri çizgi

D) Responsive: mobilde yatay scroll veya dikey sıralama

E) DashboardPage'de Sprint Status Card'ın içine ekle — mevcut phase badge'in altına

F) Sprint yokken timeline gizle

G) i18n: faz isimleri çift dilli (opsiyonel — teknik terimler EN kalabilir)

**Kanıt:** `grep "SprintPhaseTimeline\|phase-timeline" src/dashboard/src/pages/DashboardPage.tsx` → bileşen kullanılıyor

**Test:** `tsc --noEmit` temiz geçmeli.

---

## Task 3: ActivityFeed Bileşeni — Canlı Aktivite Akışı
- Model: sonnet
- Effort: normal
- Agent: refactorer
- Skills: frontend-expert, typescript-expert
- Files: src/dashboard/src/components/ActivityFeed.tsx, src/dashboard/src/pages/DashboardPage.tsx
- Scope: src/dashboard/

### Description
Sprint sırasında ne olduğunu canlı gösteren aktivite akışı:

A) `ActivityFeed.tsx` bileşeni:
```
┌─ Live Activity ──────────────────┐
│  12:15:42  🟢 w-001 spawned      │
│  12:15:43  🟢 w-002 spawned      │
│  12:16:10  📝 w-001 writing      │
│            src/core/config.ts     │
│  12:17:05  ✅ w-002 DONE         │
│  12:18:30  ⚠️ Stale heartbeat    │
│            w-003 (2m ago)         │
│  12:19:00  ❌ w-003 NO_GO        │
└──────────────────────────────────┘
```

B) Feed'i SSE verisinden oluştur:
- Agent spawn/done olayları (agents dizisindeki durum değişiklikleri)
- Alert'ler (alerts dizisi)
- Faz değişiklikleri (sprint.phase)
- Progress değişiklikleri (done sayısı artınca)

C) Her entry: zaman damgası + ikon + mesaj + opsiyonel detay

D) Maksimum 50 entry tut (eski olanları at)

E) Auto-scroll: yeni entry gelince en alta kaydır

F) DashboardPage'e sağ taraf veya alt bölüm olarak ekle

G) Sprint yokken "Sprint başlatın, aktivite burada görünecek" mesajı

H) i18n: tüm mesajlar çift dilli

**Kanıt:** `grep "ActivityFeed\|activity-feed" src/dashboard/src/pages/DashboardPage.tsx` → bileşen kullanılıyor

**Test:** `tsc --noEmit` temiz geçmeli.

---

## Task 4: DashboardPage Layout Yeniden Düzenleme
- Model: sonnet
- Effort: normal
- Agent: refactorer
- Skills: frontend-expert, typescript-expert
- Files: src/dashboard/src/pages/DashboardPage.tsx, src/dashboard/src/i18n/en.ts, src/dashboard/src/i18n/tr.ts
- Scope: src/dashboard/

### Description
DashboardPage'in genel layout'unu profesyonel hale getir:

A) Yeni layout yapısı (yukarıdan aşağıya):
```
┌─ Header: Sprint Dashboard ── [Cleanup] [Kill All] [New Sprint] ─┐
│                                                                    │
│  ┌─ Sprint Status Card ─────────────────────────────────────────┐ │
│  │  sprint-076  │  EXECUTE  │  4m 32s  │  Usage: 34%           │ │
│  │  ═══●═══●═══◉═══○═══○═══○  (Phase Timeline)                │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌─ Progress ────────────────────────────────────────────────────┐ │
│  │  ████████░░ 3/4 done, 1 running                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌─ Workers (2/3 layout) ────┐  ┌─ Activity Feed (1/3) ────────┐ │
│  │  [Card] [Card] [Card]     │  │  12:15 🟢 w-001 spawned     │ │
│  │  [Card] [Card]            │  │  12:16 📝 writing config.ts  │ │
│  │                           │  │  12:17 ✅ w-002 DONE         │ │
│  └───────────────────────────┘  └──────────────────────────────┘ │
│                                                                    │
│  ┌─ Alerts ──────────────────────────────────────────────────────┐ │
│  │  (mevcut alert section — aynı kalabilir)                      │ │
│  └──────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

B) Workers + Activity Feed yan yana: `grid grid-cols-1 lg:grid-cols-3` — workers 2/3, feed 1/3

C) Sprint yokken karşılama mesajı:
```
┌───────────────────────────────────┐
│        🐙 deckent                 │
│                                   │
│   Henüz aktif sprint yok.         │
│                                   │
│   Sprint başlatmak için:          │
│   [Yeni Sprint] butonu            │
│                                   │
│   Son sprint: sprint-076 (4/4 ✓)  │
└───────────────────────────────────┘
```

D) Tüm yeni i18n key'lerini en.ts ve tr.ts'e ekle:
- worker.* (model, agent, skill, elapsed, heartbeat, files_changed, detail, no_workers)
- activity.* (spawned, writing, done, nogo, stale, phase_changed, no_activity)
- welcome.* (no_sprint, start_hint, last_sprint)

E) Genel stil iyileştirmeleri:
- Card'lara subtle shadow (shadow-lg/shadow-zinc-900)
- Başlıklarda gradient text veya accent renk
- Geçişlerde transition-all duration-300

**Kanıt:** `grep "grid-cols-3\|WorkerCard\|ActivityFeed\|SprintPhaseTimeline" src/dashboard/src/pages/DashboardPage.tsx` → hepsi entegre

**Test:** `tsc --noEmit` temiz geçmeli.

---

## Quality Rules
- tsc --noEmit MUST pass
- Mevcut testlerde 0 regresyon
- Tüm yeni bileşenler i18n uyumlu (useTranslation)
- Responsive: mobilde tek sütun, desktop'ta grid
- Dark theme tutarlılığı korunmalı (zinc-950/900/800)
- Animasyonlar subtle olmalı — abartısız
- %100 GO hedefli
