---
name: project_nervous_observer_feedback_loop_rootcause
description: "~200-sprintlik \"nervous açıkken sprint başlamıyor\" bug'ının KÖK NEDENİ bulundu+fix+canlı-doğrulandı (observer self-feedback loop via .brain/ERRORS.md)"
metadata: 
  node_type: memory
  type: project
  originSessionId: e2a45ffb-654f-4e9a-be6b-066477354ee9
---

**2026-06-15 ÇÖZÜLDÜ (commit f326a68f):** ~200 sprinttir "nervous_system.enabled=true iken
sprint asla başlamıyor / 84% CPU'da takılıyor" bug'ının kök nedeni canlı **Node-inspector
JS-stack dump** ile bulundu (kill -SIGUSR1 <pid> → port 9229 → global WebSocket Node24 →
Debugger.pause → callFrames).

**Kök neden (self-feedback loop):** Nervous observer `.brain/`'i recursive `fs.watch`'lıyor
(`src/nervous/observer.ts` FS_WATCH_TARGETS). Sprint sırasında dispatch phase-guard
`getSprintStateSnapshot → readSprintState → readJsonSafe` absent/mid-write `sprint-state.json`'da
fail → `debugLog → appendToErrorsFile` `.brain/ERRORS.md` yazıyor → ERRORS.md de izlenen path →
watcher yeniden tetikleniyor → **sonsuz döngü**. Sprint SPAWN'a hiç ulaşmıyor → nervous sıfır
detection üretiyor → "nervous-on hiç başlamıyor" 200 sprint çözülemedi.

**Fix:** `isObserverNoiseFile(filename)` — fs.watch callback'inde `emitObserve`'dan ÖNCE Brain/nervous
bookkeeping churn'ünü düşürür: ERRORS.md, nervous-*/nervous-ipc/panic-ipc, .dashboard,
sprint-state.json, metrics.jsonl, *-events.jsonl, *.hb. Bunlar ya nervous'un KENDİ telemetrisi ya da
hiçbir detector'ın fs-event'le tüketmediği yüksek-frekanslı state yazımları (staleness cron-tick'te
kontrol ediliyor) → filtrelemek doğru + döngüyü kırar.

**Canlı kanıt:** nervous-ON sprint-289 → PID %2.7 CPU (önce %84), SPAWN'a ulaştı (5 docker worker Up),
EXECUTE'a geçti (5 task EXECUTING), ERRORS.md düz. İlk kez nervous-açık sprint stabil koştu.

**Önceki yanlış-teşhisler (neden 200 sprint sürdü):** "panic-gate timeout", "balanced mode sorunu",
"brain↔nervous IPC bekletme" hep semptomdu — gerçek kök fs.watch besleme döngüsüydü, sadece canlı
stack-dump gösterdi. Ders: spin/hang bug'ında tahmin etme → süreç stack'ini canlı al (inspector).
Bkz [[project_repl_architectural_root_cause.md]] (benzer: semptom-fix döngüsü yanlış-katman).
