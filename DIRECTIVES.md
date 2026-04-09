# DIRECTIVES — Sprint 123: Hybrid Backend ADR + Dashboard Docker Status

## Goal: Docker backend için hybrid mod ADR belgesi yaz ve Dashboard'da worker backend bilgisini göster. Heartbeat tipine backend alanı ekle, WorkerCard'da backend badge'i göster.

---

## Task 1: Hybrid Backend ADR Yazımı
- Model: sonnet
- Effort: low
- Skills: documentation-writer, system-architect
- Files: .brain/DECISIONS.md
- Scope: .brain/

### Description
`.brain/DECISIONS.md` dosyasına ADR-027 ekle. Format mevcut ADR'lerle aynı olmalı:

```
## ADR-027: Hybrid Spawn Backend (Sprint 123)

**Decision:** ...
**Context:** ...
**Consequence(s):** ...
```

Konu: Docker worker + subprocess/tmux auditor hibrit modu. Şu anda SpawnBackendFactory TEK bir backend seçiyor (docker → tmux → subprocess fallback). Hibrit modda worker'lar Docker container'da çalışırken auditor subprocess olarak kalabilir. Bu ADR karar belgesidir — implementasyon değil.

İçerik:
- Decision: Hibrit backend desteği DEFERRED. Mevcut tek-backend modeli yeterli. Worker isolation Docker ile sağlanıyor, auditor zaten in-process (sprint-controller içinde) — ayrı backend gerektirmiyor.
- Context: Auditor scan loop sprint-controller.ts içinde çalışıyor (in-process), tmux/subprocess/docker backend'lerinden bağımsız. Worker'lar backend üzerinden spawn ediliyor, auditor ise dosya sistemi üzerinden .hb dosyalarını okuyor.
- Consequence: Hibrit backend implementasyonu yapılmayacak. Auditor zaten backend-agnostic. Eğer gelecekte auditor ayrı bir process olarak çalıştırılacaksa, o zaman revisit edilecek.

**Kanıt:** `grep "ADR-027" .brain/DECISIONS.md` → bulunmalı

---

## Task 2: Heartbeat Tipine Backend Alanı Ekle
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/monitoring-types.ts, src/agents/worker.ts, src/orchestra/spawn-backend-docker.ts
- Scope: src/core/, src/agents/, src/orchestra/

### Description
1. `src/core/monitoring-types.ts` → `Heartbeat` interface'ine `backend?: 'docker' | 'tmux' | 'subprocess'` alanı ekle.

2. `src/agents/worker.ts` → `createHeartbeat()` fonksiyonunda backend alanını set et. Worker kendi backend'ini bilmiyor, bu yüzden default olarak undefined bırak (spawn eden taraf yazar).

3. `src/orchestra/spawn-backend-docker.ts` → `monitorContainer()` callback'inde heartbeat yazarken `backend: 'docker'` alanını ekle. Mevcut kodda monitorContainer zaten heartbeat yazıyor — o noktaya backend alanı ekle.

4. Mevcut testler kırılmamalı. `npx tsc --noEmit` ve `npx vitest run tests/core/ tests/agents/` geçmeli.

**Kanıt:** `grep "backend" src/core/monitoring-types.ts` → 'docker' | 'tmux' | 'subprocess' bulunmalı

**Test:** Mevcut testler geçmeli (yeni alan optional olduğu için breaking change yok)

---

## Task 3: Dashboard WorkerCard Backend Badge
- Model: sonnet
- Effort: normal
- Skills: react-specialist, typescript-expert
- Files: src/dashboard/src/components/WorkerCard.tsx, src/dashboard/src/types.ts
- Scope: src/dashboard/

### Description
1. `src/dashboard/src/types.ts` (veya dashboard'un kendi tip dosyası) → AgentInfo tipine `backend?: string` alanı ekle.

2. `src/dashboard/src/components/WorkerCard.tsx` → Worker kartında backend bilgisini göster. Küçük bir badge/chip olarak:
   - Docker → mavi "Docker" badge
   - tmux → yeşil "tmux" badge  
   - subprocess → turuncu "subprocess" badge
   - undefined → badge gösterme

Badge'i model bilgisinin yanına veya status'un altına koy. Tailwind CSS kullan (proje zaten Tailwind kullanıyor).

3. Dashboard testleri geçmeli: `npx vitest run --config src/dashboard/vitest.config.ts`

**Kanıt:** `grep "backend" src/dashboard/src/components/WorkerCard.tsx` → badge render kodu bulunmalı

**Test:** Dashboard testleri geçmeli

---

## Quality Rules
- `npx tsc --noEmit` temiz olmalı
- `npx vitest run tests/core/ tests/agents/` geçmeli
- `npx vitest run --config src/dashboard/vitest.config.ts` geçmeli
- ADR-027 .brain/DECISIONS.md'de olmalı
