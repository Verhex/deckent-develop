---
name: feedback-container-auth-precedence
description: "Per-task `- Auth: subscription|api` wire landed 2026-05-26: Task.authMode propagates DIRECTIVES → spawn-backend-docker conditional mount + API key require"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: ebe16d68-323f-4a1a-9051-7593dfaf79a4
---

**Status (2026-05-26):** Wire %100 landed. Sprint 193 sonrası, kalan %75 ~50 satır kodla tamamlandı.

**What landed:**
- `Task.authMode?: 'subscription' | 'api'` (task-types.ts:204-209) — optional per-task override
- `parseAuthModeDirective(line)` (task-builder.ts) — DIRECTIVES `- Auth: api|subscription` parser
- `parseStructuredDirectives` + `parseBulletOrNumberedTasks` — Auth line extraction
- `createTask` → propagates `authMode` from CreateTaskParams to Task
- `sprint-planner.ts` → directiveSources interface + createTask call wires `src.authMode`
- `DockerSpawnBackend.readTaskAuthMode(dir, taskId)` — reads `task-{id}.json.authMode`
- `runSpawn`: `task.authMode === 'api'` → SKIPs `~/.claude` + `~/.claude.json` mount, REQUIRES `ANTHROPIC_API_KEY` (throws SpawnBackendError if missing)
- `DECKENT_AUTH_MODE` env var passed to container (worker self-awareness)
- Tests: 9 new (3 spawn-backend, 4 parser, 2 structured parse) — all pass
- Docs: `docs/reference/api-surface.md` updated with `authMode` field

**Why:** Sprint 193 (2026-05-24) `auth_mode=api` config'i ile smoke test yapıldı. Brain'in process.env'inde API key vardı (cost $2.33 kanıt — Anthropic dashboard), worker container subscription davranıyordu. Bu wire artık per-task override sağlıyor: DIRECTIVES'te `- Auth: api` ekleyen task `~/.claude` mount'sız çalışır.

**Sprint 194 dogfood kanıt (2026-05-26):** Wire landed + subscription default ile 14-task çalıştırıldı. **12/14 timeout — Claude CLI subscription mount'a RAĞMEN ANTHROPIC_API_KEY env fallback'ine düştü ve bakiye drain oldu**. Log kanıt: `.tasks/task-194-004.log` → "Credit balance is too low". Hipotez: ~/.claude/.credentials.json token süresi geçmişti veya container içinde geçersizdi → CLI sessiz API key fallback. **Wire koşullu mount'u doğru yapıyor ama Claude CLI'nin "subscription invalid → API fallback" davranışını engellemiyor**.

**Çözüm (post-beta — 1 Haziran 2026 sonrası):**
- Container içinde `unset ANTHROPIC_API_KEY` (env passthrough auth_mode=subscription iken durdur)
- VEYA yeni mode: `Auth: subscription-strict` — API env hiç geçirme (Codex/Gemini için ayrı env keyleri)
- VEYA pre-spawn credential validation (194-001'in auth health check'i container DIŞINDA da çalıştır — token expiry tespit et)

**Rate limit context:** Tier 1 API = 30K input tok/min org-wide (org bazında, key bazında değil). 14-worker paralel sprint için subscription mode default şart; sadece dashboard cost izleme isteyen task'lar opt-in `Auth: api` kullanmalı.

**How to apply:**
- DIRECTIVES.md task block içinde: `- Auth: api` veya `- Auth: subscription` (default subscription)
- API mode'da `ANTHROPIC_API_KEY` env şart — yoksa spawn anında throw
- `auth_mode` global config eski yapısı korundu (`config.ts:1173-1195` `readAuthMode()`) — runtime'da artık spawn-backend per-task'a bakar, config-level default'u Brain PLAN'da propagate edebilir (future enhancement)
- Worker `.result` silent fail auth'tan bağımsız ikinci sorun: prompt template'de Write tool talimatı user-prompt'ta, Claude yazmazsa exit trap fallback NO_GO yazar — system-prompt seviyesine taşımak reliability artırır (henüz açık, separate)
- Ref: RESUME-MONDAY.md "2026-05-24 Cumartesi gece — API mode smoke audit"; ilgili [[feedback_no_auth_touch_during_sprint]]
