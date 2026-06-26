# DIRECTIVES — Sprint: PROVIDER-AGNOSTIC USAGE & COST CAPTURE (full matrix)

## Goal
Implement the **entire** provider-agnostic per-task usage+cost capture design — the actual root-cause
fix for "the token counter never works". **Spec of record (READ IT FIRST):**
`docs/superpowers/specs/2026-06-26-provider-agnostic-usage-cost-design.md`. The orchestrator-side
read+compute (`enrichResultTokenUsage`/`enrichResultCost`, Steps 1-2) is already wired; the missing
prerequisite is that **each provider's REAL usage must reach `.result.tokenUsage` from its NATIVE
source** (usage is NOT in stdout — it's in the provider's session-store / HTTP-response / structured
envelope). Reference patterns in the spec: tokscale (per-provider native-source extraction → one
schema), LiteLLM/AI-SDK (normalized usage+cost), Hermes→OpenRouter (gateway for the API side).

## 🔒 BAĞLAYICI — her task (Law #2 anchor)
- **PROVIDER-MATRIX-CHECK = her task'ın .plan'ının İLK satırı:** `claude·codex·gemini·ollama·vLLM·
  openai-compatible·bedrock·OpenRouter·Vertex·Azure — bu değişiklik tek-provider'a mı bağlı?` Tek-provider'a
  bağlıysa YANLIŞ. **Claude-special-case YASAK.** Çözüm sınıf-genelinde (A/B/C) tutarlı olmalı.
- **Spec-driven:** design-doc §"Usage-Source Contract" + §"matris" + §"implementation plan"a uy.
- **Cerrahi + distinct-file** (iki task aynı dosyaya yazmaz). ESM `.js`. `process.cwd()` YASAK → `join(root,…)`.
- **Faithful-regression** (pre-fix RED/post-fix GREEN) + **contract-test** (native-source-sample → normalize)
  + `tsc --noEmit` temiz + affected-suite yeşil per task. Hermetik (tmpdir, async spawn, no spawnSync, no HOME-leak).
- **Riskli CLI-invocation değişikliği (T2/T3) PROOF-OF-FUNCTION zorunlu:** gerçek-binary run — agent HÂLÂ
  `.result` yazıyor mu + log/envelope'da usage var mı. Agent kırılırsa → design-doc'taki **session-store-reader**
  fallback'ine geç (stdout-format değiştirme). No haiku. Additive + graceful-fallback (envelope yoksa extractUsage null → mevcut davranış).

---

## Task 1: rich normalized usage schema (foundation)
- Model: sonnet
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert
- Files: src/core/token-usage.ts, tests/core/token-usage-rich.test.ts
- Scope: src/core/token-usage.ts, tests/core/
### Description
Spec §"normalized schema" (AI-SDK pariteyi). `TokenUsage` + `RawTokenUsage` + `normalizeUsage`'a **`cacheWriteTokens` + `reasoningTokens`** ekle (şu an yok). `totalTokens` reasoning'i de içerebilir (provider-reported öncelik). Additive — mevcut consumer kırılmaz, eksik-alan→0. **Provider-matrix-check:** şema TÜM provider'ların alanlarını taşımalı (anthropic cache_creation/read, ollama eval, openai reasoning, gemini thoughts). **goNogo:** yeni-alanlar default-0 + provider-reported honor; faithful (eski-fixture hâlâ geçer, yeni-alan-fixture set); tsc=0.

## Task 2: Class-A claude usage-emit (CLI-agent, native source)
- Model: opus
- Effort: high
- Agent: api-builder
- Skills: typescript-expert
- Files: src/providers/subprocess.ts, src/providers/claude.ts, tests/providers/claude-usage.test.ts
- Scope: src/providers/subprocess.ts, src/providers/claude.ts, tests/providers/
- Dependencies: 0
### Description
Spec §Class-A. claude'un per-run usage'ı stdout'ta YOK (`CLAUDE_SUBPROCESS_CONFIG.buildArgs` subprocess.ts:58 `-p -` usage-emit-siz). **İki yol — design-doc'a göre seç + proof-of-function'la doğrula:** (1) buildArgs'a `--output-format json`/`stream-json` ekle → CLI usage-envelope emit eder → `claude.ts extractUsage` envelope'dan `usage:{input_tokens,output_tokens,cache_read_input_tokens,cache_creation_input_tokens}` çıkarır. **PROOF-OF-FUNCTION ZORUNLU:** gerçek `claude -p --output-format json --allowedTools … --dangerously-skip-permissions` run-et — agent tool-loop'u koşup `.result` yazıyor mu + envelope'da usage var mı? **Eğer json-format agent'ı bozuyorsa** (tool-use disable / .result yazılmıyor) → (2) **session-store-reader** (tokscale deseni): `~/.claude/projects/{path}/*.jsonl` transcript'inden bu-run'ın usage'ını oku (session-id korelasyonu). **gemini.ts:458 `--output-format json` referans.** **Provider-matrix-check zorunlu.** **goNogo:** claude per-run usage `.result.tokenUsage`'a gerçek-değer (proof-of-function: gerçek-run); extractUsage envelope-OR-session-store'dan çıkarır; agent .result-yazımı BOZULMAZ; faithful+contract-test; tsc=0.

## Task 3: Class-A codex usage-emit (CLI-agent, native source)
- Model: opus
- Effort: high
- Agent: api-builder
- Skills: typescript-expert
- Files: src/providers/codex.ts, tests/providers/codex-usage.test.ts
- Scope: src/providers/codex.ts, tests/providers/
- Dependencies: 0
### Description
Spec §Class-A. codex `buildArgs` (`exec --full-auto`) usage-emit-siz. codex'in **structured/usage modunu** ekle (codex'in kendi flag'i / session-store `~/.codex/sessions/*.jsonl` `type:"token_count"`→`last_token_usage` — tokscale deseni) → `extractUsage` çıkarır. **Provider-matrix-check.** Proof-of-function codex-binary mevcutsa; yoksa contract-test (real session-sample → normalize) + açık-not. **goNogo:** codex per-run usage çıkarılır (envelope-or-session-store); faithful+contract-test; tsc=0.

## Task 4: Class-A gemini verify + extractUsage→result (CLI-agent)
- Model: opus
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/providers/gemini.ts, tests/providers/gemini-usage.test.ts
- Scope: src/providers/gemini.ts, tests/providers/
- Dependencies: 0
### Description
Spec §Class-A. gemini buildArgs (gemini.ts:458) **zaten `--output-format json`** → usageMetadata emit ediyor. Doğrula: `extractUsage` `usageMetadata:{promptTokenCount,candidatesTokenCount,cachedContentTokenCount,thoughtsTokenCount}`'u normalize-şemaya (reasoning=thoughts) **tam** çıkarıyor mu + result-path'e ulaşıyor mu. Eksikse tamamla. **Provider-matrix-check.** **goNogo:** gemini usageMetadata→normalize (reasoning dahil); contract-test (real gemini-json-sample); faithful; tsc=0.

## Task 5: Class-B API usage-accumulate → result (HTTP-response providers)
- Model: opus
- Effort: high
- Agent: bug-fixer
- Skills: typescript-expert
- Files: src/agents/agentic-worker-entry.ts, tests/agents/api-usage-accumulate.test.ts
- Scope: src/agents/agentic-worker-entry.ts, tests/agents/
- Dependencies: 0
### Description
Spec §Class-B. API-provider'lar (ollama/openai-compatible/bedrock) usage'ı **HTTP-response'ta zaten alıyor** (ollama eval_count, openai usage) ama agentic-worker `zeroTokenUsage` (0/0) default'luyor (agentic-worker-entry.ts:157/179). **runAgenticWorker'ın loop'undaki her response'tan usage'ı BİRİKTİR** (input/output/cache/reasoning topla) → `.result.tokenUsage`'a normalize-yaz (zeroTokenUsage yerine). _(runAgenticWorker runner-dosyasını grep'le bul — adaptive-agent.ts/agentic-worker.ts; bu task agentic-worker-entry.ts'i sahiplenir, runner'ı SALT-OKUR ve gerekiyorsa import-eder; runner-edit gerekiyorsa NO_GO+not.)_ **Provider-matrix-check:** ollama+openai-compatible+bedrock üçü de. **goNogo:** multi-turn API-loop usage'ı accumulate→result non-zero; faithful (pre-fix 0/0→RED); contract-test (fake multi-response→accumulated); tsc=0.

## Task 6: Class-C OpenRouter first-class (unified gateway, API side)
- Model: opus
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert
- Files: src/providers/openai-compatible.ts, tests/providers/openrouter-usage.test.ts
- Scope: src/providers/openai-compatible.ts, tests/providers/
- Dependencies: 0
### Description
Spec §Class-C + §"gateway-first". Hermes/OpenClaw API-tarafını **OpenRouter (200+ model)** ile çözüyor — OpenRouter OpenAI-uyumlu → openai-compatible adapter zaten kapsar. Doğrula+sağlamlaştır: `extractUsage` OpenRouter response'unun `usage:{prompt_tokens,completion_tokens,prompt_tokens_details:{cached_tokens},completion_tokens_details:{reasoning_tokens}}`'unu normalize-şemaya (cacheRead+reasoning dahil) çıkarıyor mu. **Provider-matrix-check:** openai-compatible-class TÜM gateway'leri (OpenRouter/LiteLLM/vLLM/DeepSeek/Qwen) kapsar. **goNogo:** OpenRouter normalized-usage (cache+reasoning) çıkarılır; contract-test (real OpenRouter-response-sample); faithful; tsc=0.

---
**Beklenen:** 6 distinct-file task (T2/T3/T5 dep-yok bağımsız, T1 foundation). T1 sonnet, T2-T6 opus (core/risky). Her task **provider-matrix-check .plan-ilk-satırı** + faithful+contract-test + (T2/T3 CLI) proof-of-function. **Çözüm sınıf-genelinde provider-agnostik** — claude-special-case YOK. Full lifecycle dogfood. DEFER: Class-D (Cursor web-API, v1.1) · strict-TaskResultV1 (ayrı).
