---
name: project_tsconfig_dashboard_exclude_runtime_crash
description: "src/dashboard tsconfig-exclude (Vite-only) → derlenen src/'den oraya import = tsc-geçer ama dist-eksik → serve/watch runtime ERR_MODULE_NOT_FOUND"
metadata: 
  node_type: memory
  type: project
  originSessionId: 46b11a62-fd54-4968-ac74-3c501a8080ce
---

`tsconfig.json` (`:26`) `exclude: [..., "src/dashboard"]` — `src/dashboard/` **tsc-build'e dahil değil** (React/Vite ayrı bundle'lıyor). Tuzak: derlenen ağaçtan (`src/api/`, `src/core/`, `src/cli/`) `src/dashboard/...` modülüne **static import** eklenirse → `tsc --noEmit` GEÇER (tip-resolve eder, .ts kaynağını görür) ama `tsc` EMIT etmez → `dist/dashboard/...` üretilmez → **gerçek-binary runtime'da `ERR_MODULE_NOT_FOUND`**. Mock test + tsc yeşil olur, `node dist/cli/entry.js serve|watch` çöker.

**Canlı kanıt (Sprint 230-008, 2026-06-05):** docker-monitor worker'ı `server.ts`'e `../dashboard/api/output-stream.js` import'u ekledi → `serve` + `watch --follow` ERR_MODULE_NOT_FOUND ile açılmıyordu. tsc temiz + 44 unit yeşildi; sadece **proof-of-function smoke** (`watch --follow` gerçek-binary) yakaladı ([[feedback_proof_of_function_dod]] tam da bunun için). Fix `c4495d44`: SSE handler aslında server-side (yalnız `core/output-collector`'a bağlı, dashboard-bağı yok), yanlış yere konmuş → `git mv src/dashboard/api/output-stream.ts → src/api/output-stream.ts` (+ test taşı + import path). WorkerCard sadece URL string kullanıyor, import değil → dokunulmadı.

**Why:** Worker "DONE" sanıp false-DONE üretebilir; Brain de exit-0-no-result yüzünden başta NO_GO/false-NO_GO karıştırdı. Gerçek doğrulama disk + **derlenmiş binary çalıştırma**, mock/tsc değil ([[feedback_trust_brain_eval_not_worker]] · [[feedback_wiring_pct_vs_user_working]]).

**How to apply:**
- `src/dashboard/` altındaki bir modülü derlenen ağaca (`src/api`, `src/core`, `src/cli`, `src/orchestra`) import etme. Server-side gereken kod `src/api/` (veya uygun derlenen yer) altında olmalı; sadece frontend kullanıyorsa endpoint'e URL ile bağlan.
- Dashboard'a dokunan user-surface task'larda **build sonrası gerçek-binary smoke** ZORUNLU (`serve`/`watch` açılıyor mu) — tsc+mock yetersiz.
- Yeni cross-tree import şüphesinde: `grep exclude tsconfig.json` + `ls dist/<hedef>` ile emit teyidi.

İlgili: [[feedback_proof_of_function_dod]] · [[feedback_wiring_pct_vs_user_working]] · [[feedback_trust_brain_eval_not_worker]] · ADR-079
