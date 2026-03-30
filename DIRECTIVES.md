# DIRECTIVES — Sprint 076: Stabilite + Dashboard + Refactor

## Goal: Stale heartbeat root cause fix, dashboard entegrasyon testi, graceful shutdown, god object split faz 3, roadmap güncelleme. Deckent stabilitesini artır ve dashboard'u doğrula.

---

## Task 1: Stale Heartbeat Root Cause Fix (410x pattern)
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/sprint-controller.ts, src/orchestra/spawn-backend.ts, src/agents/worker.ts
- Scope: src/orchestra/, src/agents/

### Description
Auditor her sprint'te yüzlerce kez `stale_heartbeat` alert üretiyor (sprint-069'dan beri, 410x). Kök neden: tmux worker heartbeat dosyasını güncelliyor ama worker bittiğinde heartbeat "DONE" olarak güncellenmediği için auditor hâlâ "stale" diyor.

Yapılacaklar:
A) Worker task tamamlandığında heartbeat'i `status: "DONE"` olarak güncellesin — sadece çalışırken değil, bitince de. `src/agents/worker.ts` ve `src/orchestra/spawn-backend.ts`'deki child exit handler'ları kontrol et.
B) Auditor scan logic'inde `status: "DONE"` olan heartbeat'leri stale olarak işaretlemesin. `src/orchestra/sprint-controller.ts`'deki auditor scan fonksiyonunu bul ve guard ekle.
C) spawn-backend.ts: Child process exit handler'da heartbeat'i "DONE" yap — hem normal exit hem error exit.
D) sprint-controller.ts: waitForResults'ta heartbeat DONE olanları skip et.

DİKKAT: Heartbeat formatını bozmadan sadece status field'ını güncelle. Mevcut heartbeat okuma logic'ini kırma.

**Kanıt:** `npx vitest run tests/orchestra/ tests/agents/` → 0 fail + yeni testler geçiyor

**Test:** 2+ yeni test (heartbeat DONE güncelleme, auditor DONE skip)

---

## Task 2: Dashboard API Entegrasyon Testi (P3-20,22)
- Model: sonnet
- Effort: normal
- Skills: testing-expert
- Files: tests/api/server.test.ts, src/api/server.ts
- Scope: tests/api/, src/api/

### Description
Dashboard kodu var, SSE endpoint çalışıyor, ama API endpoint'lerin doğru format dönüp dönmediği doğrulanmamış. Mevcut test dosyasını oku ve eksik endpoint testlerini ekle.

Yapılacaklar:
A) `GET /api/status` — dönen JSON'da sprint, agents, progress, alerts field'ları var mı?
B) `GET /api/config` — read döngüsü, config.json formatıyla uyumlu mu?
C) `GET /api/history` — sprint log listesi döndürüyor mu?
D) `GET /api/memory` — MEMORY.md content string dönüyor mu?
E) `GET /api/doctor` — health check result formatı doğru mu?

Mevcut tests/api/server.test.ts dosyasını oku, pattern'ı takip et, eksik endpoint testlerini ekle.

**Kanıt:** `npx vitest run tests/api/server.test.ts` → yeni testler geçiyor

**Test:** 5+ yeni integration test

---

## Task 3: Worker Graceful Shutdown — Sprint State Tutarlılığı (P6-40)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/entry.ts, src/orchestra/sprint-controller.ts, src/orchestra/tmux.ts
- Scope: src/cli/, src/orchestra/

### Description
HTTP server graceful shutdown var ama sprint çalışırken Ctrl+C basılınca worker state tutarsız kalabiliyor.

Yapılacaklar:
A) entry.ts SIGINT handler'ına sprint cleanup logic ekle: aktif sprint varsa → worker'ları kill et → lock'ları temizle → heartbeat'leri "ABORTED" yap
B) tmux.ts'de `killAllSessions()` fonksiyonunun SIGINT'te çağrılmasını sağla
C) sprint-controller.ts'de "interrupted" state tracking ekle
D) `.tasks/` dosyalarına `status: "INTERRUPTED"` yazma desteği ekle

DİKKAT: Mevcut cleanup() ve kill() logic'ini kırma. Sadece SIGINT path'i ekle. process.on('SIGINT') zaten varsa extend et, üzerine yazma.

**Kanıt:** `grep "SIGINT\|INTERRUPTED\|ABORTED" src/cli/entry.ts src/orchestra/sprint-controller.ts` → yeni logic var

**Test:** 2+ test (SIGINT handler tetikleme, cleanup on interrupt)

---

## Task 4: God Object Split Faz 3 — Result Collector Extract
- Model: opus
- Effort: high
- Skills: typescript-expert, refactoring-expert
- Files: src/orchestra/sprint-controller.ts, src/orchestra/result-collector.ts
- Scope: src/orchestra/

### Description
sprint-controller.ts hâlâ 1823 satır. Faz 1'de phase'ler, faz 2'de utility'ler çıkarıldı. Sırada: result collection ve queue management.

Yeni dosya: `src/orchestra/result-collector.ts`

Taşınacak fonksiyonlar (sprint-controller.ts'yi oku ve tespit et):
- `waitForResults()` — result bekleme loop'u (IPC + fs.watch)
- `processQueue()` — task queue yönetimi
- IPC heartbeat listener logic
- fs.watch result file detection
- Result timeout/retry mantığı

sprint-controller.ts'de import edip çağır. Public API DEĞİŞMEZ — backward compat.

Re-export pattern: sprint-controller.ts'den result-collector fonksiyonlarını re-export et.

DİKKAT: Büyük refactoring — fonksiyonları extract et, iç mantığı DEĞİŞTİRME. State bağımlılıklarını (config, sprintId vb.) parametre olarak geçir.

**Kanıt:** `wc -l src/orchestra/sprint-controller.ts` → <1500 satır + `test -f src/orchestra/result-collector.ts`

**Test:** Mevcut testler regression-free. Yeni test gerekmez (extract only).

---

## Task 5: BETA-ROADMAP Güncelleme + Sprint Tablosu
- Model: haiku
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: BETA-ROADMAP.md
- Scope: BETA-ROADMAP.md

### Description
BETA-ROADMAP'ı Sprint 073-076 sonuçlarıyla güncelle:

A) Durum güncellemeleri:
- P2-14: DONE (docs/CHANGELOG.md Türkçeleştirildi, Sprint 075)
- P2-18: DONE (VISION.md oluşturuldu, Sprint 075)
- P2-19: DONE (link audit + 4 fix, Sprint 075)
- P4-29: DONE (.detect-secrets, Sprint 075)
- P5-31: KISMEN → güncel (faz 1+2+3 done, hedef <1500 satır)
- P6-33: DONE (DeckentError 53 kod)
- P6-40: DONE veya KISMEN (Sprint 076 sonucuna göre)

B) Tamamlanan Sprintler tablosuna 073, 074, 075 ekle

C) Sprint 076 sonuçlarını faz planına ekle

D) Toplam sayıları güncelle

**Kanıt:** `grep "DONE" BETA-ROADMAP.md | wc -l` → artmış olmalı

**Test:** Bu task test gerektirmez — dokümantasyon.

---

## Quality Rules
- tsc --noEmit MUST pass
- npx vitest run → 0 fail, 0 regresyon
- Stale heartbeat pattern azalmalı
- sprint-controller.ts <1500 satır hedef
- Dashboard API testleri geçmeli
- %100 GO hedefli