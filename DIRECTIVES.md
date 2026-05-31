# DIRECTIVES — Sprint 203: F1-P1 Docker Multi-Provider + F2 Native Chat İskelet (BOL KÜÇÜK TASK, 10 worker)

## Goal: F1 provider-free'yi tamamla (Docker backend de provider-aware olsun — şu an sadece subprocess/tmux'ta Ollama/codex/gemini çalışıyor, Docker Claude-only) + F2 native chat Path C'nin ilk iskeletini at (tool-use loop temeli). YÜRÜTME STRATEJİSİ: bol-küçük-task + 10 worker = yüksek paralellik + hız. Her task TEK dosya/TEK sorumluluk, ≤200 LoC, effort≤normal (high YOK — Sprint 202'de high-effort 004 timeout'a düştü, küçük task timeout önler).

Bağlam (ROADMAP-GOD-LEVEL §EXECUTION TRACKER):
- F1-P0 DONE (Sprint 202): Ollama bootstrap + model registry + hardcode 10→3 + token-quota.ts. Provider-free %80.
- Kalan F1-P1: Docker backend provider-aware (F1-004) + Dockerfile multi-CLI (F1-005).
- F2 native chat: chat.ts Path B (CLI spawn) var; Path C (native tool-use loop) yok — bu sprint iskelet.
- Baseline 12 fail (Sprint 202), artmasın. max_workers=10.

---

## Tüm task'lar için ortak kurallar

- **Subscription mode ZORUNLU** — sprint `env -u ANTHROPIC_API_KEY -u DECKENT_CLAUDE_API_KEY` ile başlatılır. API mode YASAK ([[project_api_mode_deferred_post_beta]]).
- Worker yalnızca scope.filesWrite içine yazar. Host-facing config'lere `/workspace` mutlak yolu YAZMA, `$CLAUDE_PROJECT_DIR` (Sprint 200 container-path gate aktif).
- **KÜÇÜK TASK DİSİPLİNİ:** her task tek-dosya/tek-sorumluluk, ≤200 LoC, effort≤normal. high effort YASAK.
- Her kod task'ı vitest min 4 test. `dosya:satır` kanıtı zorunlu.
- Sprint sonu `npx tsc --noEmit` temiz + regresyon yok (12 baseline).
- **Dishonest YASAK** — "zaten var +0/-0 DONE" tuzağına düşme, gerçekten ölç ([[feedback_trust_brain_eval_not_worker]]). Bir şey zaten yapılmışsa kanıt komutuyla "verified clean" de, uydurma.
- ESM `.js` import suffix zorunlu. ADR-010 sıfır yeni runtime dep.

---

## DALGA 0 — Docker Provider-Aware (4 küçük task, paralel)

## Task 1: 203-001 — Docker provider-binary seçimi (claude/codex/gemini)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, docker-expert
- Files: src/orchestra/spawn-backend-docker.ts, tests/orchestra/docker-provider-binary.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
**Problem:** spawn-backend-docker.ts:312-322 `claudeArgs` + `const claudeCmd = 'claude ...'` hardcoded. Model parametresi sadece `--model` flag'i set ediyor, CLI binary'sini değil.
**Çözüm:** `getProviderForModel(model)` ile provider belirle → `providerBinary` (claude/codex/gemini) seç → komut o binary ile kurulsun. Ollama HTTP (curl) — Docker'da özel-durum veya skip (subprocess'te zaten çalışıyor). SADECE binary seçim mantığı, auth mount değil (203-002).
**Kanıt:** `grep -c "getProviderForModel\|providerBinary" src/orchestra/spawn-backend-docker.ts` → ≥1; `npx vitest run tests/orchestra/docker-provider-binary.test.ts` → 4+ pass
**Test:** ≥4 (claude→claude, codex→codex, gemini→gemini, bilinmeyen→claude fallback)

## Task 2: 203-002 — Docker provider-aware auth mount
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, docker-expert
- Files: src/orchestra/spawn-backend-docker.ts, tests/orchestra/docker-provider-auth.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: 203-001

### Description
**Problem:** spawn-backend-docker.ts:476-528 auth sadece Claude (`~/.claude` mount) + API key env passthrough var ama CLI yok. Codex/Gemini için provider-spesifik auth gerekli.
**Çözüm:** provider'a göre auth: claude→`~/.claude` mount, codex→`OPENAI_API_KEY` env (zaten passthrough:524), gemini→`GOOGLE_API_KEY` env. Provider-binary'ye uygun mount/env seç.
**Kanıt:** `grep -c "OPENAI_API_KEY\|GOOGLE_API_KEY\|provider.*auth" src/orchestra/spawn-backend-docker.ts` → ≥2; `npx vitest run tests/orchestra/docker-provider-auth.test.ts` → 4+ pass
**Test:** ≥4 (claude mount, codex env, gemini env, subscription default)

## Task 3: 203-003 — Dockerfile.worker multi-CLI (build-arg opt-in)
- Model: sonnet
- Effort: low
- Skills: docker-expert
- Files: Dockerfile.worker, tests/docker/worker-image-multicli.test.ts
- Scope: ., tests/docker/

### Description
**Problem:** Dockerfile.worker:18 sadece `@anthropic-ai/claude-code`; :21-22 codex/gemini yorum. Docker image Claude-only.
**Çözüm:** `ARG INSTALL_CODEX=false` + `ARG INSTALL_GEMINI=false` koşullu install ekle (default lean = sadece Claude, opt-in genişler). Header yorumu güncelle (default Claude-only). Paket adlarını doğrula (`@openai/codex`, `@google/gemini-cli` gerçekten publish mi — değilse yorum + not).
**Kanıt:** `grep -c "ARG INSTALL_CODEX\|ARG INSTALL_GEMINI" Dockerfile.worker` → 2; `npx vitest run tests/docker/worker-image-multicli.test.ts` → 3+ pass
**Test:** ≥3 (build-arg var, default Claude-only, opt-in conditional)

## Task 4: 203-004 — Provider-free smoke genişlet (Docker yolu dahil)
- Model: sonnet
- Effort: normal
- Skills: ci-testing, devops-engineer
- Files: scripts/provider-free-smoke.mjs, tests/scripts/provider-free-smoke-docker.test.ts
- Scope: scripts/, tests/scripts/
- Dependencies: 203-001

### Description
**Problem:** provider-free-smoke.mjs (Sprint 202'de oluştu) subprocess/tmux resolution'ı doğruluyor ama Docker provider-binary seçimini test etmiyor.
**Çözüm:** smoke'a Docker-path adımı ekle: `getProviderForModel` + Docker binary seçim simülasyonu (gerçek container spawn DEĞİL, routing doğrulaması). claude/codex/gemini/ollama her biri doğru binary'ye gidiyor mu.
**Kanıt:** `node scripts/provider-free-smoke.mjs` → Docker-path adımı PASS; `npx vitest run tests/scripts/provider-free-smoke-docker.test.ts` → 4+ pass
**Test:** ≥4 (4 provider binary resolution)

---

## DALGA 1 — F2 Native Chat İskelet (3 küçük task)

## Task 5: 203-005 — Native chat tool-use loop iskelet (Path C foundation)
- Model: opus
- Effort: normal
- Skills: typescript-expert, anthropic-sdk
- Files: src/cli/commands/chat-native.ts, tests/cli/chat-native.test.ts
- Scope: src/cli/, tests/cli/

### Description
**Problem:** chat.ts Path B (CLI spawn) var; Path C (deckent kendi tool-use loop'u — LLM → MCP tool → cevap REPL) yok.
**Çözüm:** İSKELET — `chat-native.ts` yeni dosya: tool-use loop iskeleti (while-loop: user input → provider adapter → tool-call parse → MCP tool dispatch → response). Gerçek SDK çağrısı DEĞİL (provider adapter interface kullan), sadece loop yapısı + MCP tool registry bağlantısı. ≤200 LoC, çalışır iskelet (en az 1 tool round-trip mock'la).
**Kanıt:** `ls src/cli/commands/chat-native.ts`; `grep -c "tool.use\|toolCall\|mcp.*dispatch\|while" src/cli/commands/chat-native.ts` → ≥2; `npx vitest run tests/cli/chat-native.test.ts` → 4+ pass
**Test:** ≥4 (loop yapısı, tool-call parse, mock round-trip, exit)

## Task 6: 203-006 — Chat history memory entegrasyonu (appendChatTurn wire)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/chat-native.ts, tests/cli/chat-native-memory.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: 203-005

### Description
**Problem:** MemoryStore.appendChatTurn() var ama chat path'e bağlı değil (Sprint 200 analizi).
**Çözüm:** chat-native.ts loop'una her turn sonrası `appendChatTurn` çağrısı ekle (chat entry type). Resume için son N turn okuma.
**Kanıt:** `grep -c "appendChatTurn" src/cli/commands/chat-native.ts` → ≥1; `npx vitest run tests/cli/chat-native-memory.test.ts` → 4+ pass
**Test:** ≥4 (turn kaydet, resume oku, boş history, idempotent)

## Task 7: 203-007 — chat-native CLI komut kaydı (deckent chat --native)
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: src/cli/commands/chat.ts, tests/cli/chat-native-flag.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: 203-005

### Description
**Problem:** chat-native.ts'i CLI'a bağlamak gerek.
**Çözüm:** `deckent chat --native` flag'i ekle → chat-native loop'u tetikle. Default hâlâ Path B (geriye uyumlu). `--native` opt-in.
**Kanıt:** `grep -c "native" src/cli/commands/chat.ts` → ≥2; `npx vitest run tests/cli/chat-native-flag.test.ts` → 3+ pass
**Test:** ≥3 (flag parse, default-B korunur, native-route)

---

## DALGA 2 — Temizlik + Doğrulama (2 küçük task)

## Task 8: 203-008 — Kalan hardcode-3 değerlendirme + temizlik
- Model: sonnet
- Effort: low
- Skills: typescript-expert, code-simplifier
- Files: src/orchestra/, src/core/ (gerekirse), tests/orchestra/provider-default-resolution.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description
**Problem:** Sprint 202'de `?? 'claude'` 10→3 düştü. Kalan 3'ü değerlendir — meşru son-çare mi temizlenebilir mi.
**Çözüm:** 3 kalanı `grep -rn "?? 'claude'" src/` ile bul, her birini değerlendir: meşru (config default, son-çare) → yorum ekle; temizlenebilir → getDefaultProvider. Honest: hepsi meşruysa "verified: 3 meşru son-çare" de, uydurma değişiklik yapma.
**Kanıt:** `grep -rn "?? 'claude'" src/orchestra/ src/core/ | grep -v test | wc -l` → ≤3 (her biri yorumlu/meşru); `npx vitest run tests/orchestra/provider-default-resolution.test.ts` → 4+ pass
**Test:** ≥4 (default-resolution senaryoları)

## Task 9: 203-009 — ADR-066 provider-independence finalize + doc
- Model: sonnet
- Effort: low
- Skills: documentation-writer, system-architect
- Files: docs/adr/066-provider-independence.md, docs/reference/provider-free.md, tests/docs/adr-066.test.ts
- Scope: docs/, tests/docs/

### Description
**Problem:** Sprint 202'de adr-066 + provider-free.md oluştu (worker yazdı) ama Docker-path (203-001/002/003) eklenince güncellenmeli.
**Çözüm:** ADR-066'ya Docker provider-aware kararını ekle (binary seçim + auth + build-arg). provider-free.md'ye Docker kullanım notu. MADR formatı koru.
**Kanıt:** `grep -c "Docker.*provider\|build-arg\|provider-binary" docs/adr/066-provider-independence.md` → ≥1; `npx vitest run tests/docs/adr-066.test.ts` → 3+ pass
**Test:** ≥3 (ADR-066 Docker bölümü, MADR yapı, provider-free.md Docker notu)

---

## Sprint Sonu Notu

**Beklenen:** 8-9/9 DONE. Sprint 203 = F1 TAM provider-free (Docker dahil her backend provider-aware) + F2 native chat iskelet (Path C foundation). Kuzey-yıldızı "provider-free" %100, "konuşulabilir" %40.

**Sprint sonrası:** F2 native chat tamamla (streaming + multi-turn) → F3 process mode. ROADMAP-GOD-LEVEL §EXECUTION TRACKER.

**Pre-flight:** subscription env temiz (`env -u ANTHROPIC_API_KEY`), creds canlı, **build güncel (Alperen npm run build:all + /mcp restart yaptı)**, config max_workers=10.

İlgili memory:
- [[project_api_mode_deferred_post_beta]] — API mode yasak
- [[feedback_no_auth_touch_during_sprint]] — sprint çalışırken auth touch yasak
- [[feedback_trust_brain_eval_not_worker]] — disk-verify, zaten-temiz tuzağı yok
- [[feedback_build_mcp_restart_coordination]] — build+restart Alperen yapar
- [[project_4cli_subscription_vision]] — multi-provider subscription vizyon
