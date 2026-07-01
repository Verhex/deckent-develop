---
name: project_sp2_training_data_pipeline
description: "🆕 SP-2 eğitim-verisi pipeline (deckent-core qwen fine-tune için): Phase 1 canlı trace-recorder ✅ merged (282498c6) — native REPL her turu OpenAI-messages JSONL'e .deckent/traces/'e yazar (local-only, DECKENT_TRACE=0 opt-out). Phase 2 extractor (mevcut .claude/projects+.tasks→JSONL) SIRADAKİ."
metadata: 
  node_type: memory
  type: project
  originSessionId: b06127f7-7928-4546-89e4-97f19c87f1ca
---

**SP-2 = deckent-core (qwen-tabanlı tool-using agent) fine-tune için JSONL eğitim-verisi hazırlama.** Kaynak: deckent'in KENDİ tool-use trace'leri. İki bileşen, recorder-first (Alperen onayı 2026-06-14). İlgili: [[project_deckent_core_model_and_provider]] (Core LLM + provider vizyonu), [[project_clean_repo_migration_and_training_data]] (SP-2 veri-kaynakları), [[project_deckent_native_terminal_agent]] (native-agent = veri-üreten yüzey).

**JSONL şema (her iki bileşenin ürettiği kontrat):** OpenAI-tool-calling SFT formatı (unsloth/LLaMA-Factory standardı) — `{messages:[{role:system},{role:user},{role:assistant,content,tool_calls:[{id,type:function,function:{name,arguments:JSON-STRING}}]},{role:tool,tool_call_id,content},...], meta:{source,model,ts}}`. ProviderMessage şekli (M2) ZATEN bu round-trip şekli → mapping ince.

**Phase 1 ✅ merged (`282498c6`, flag-gated native-path):** 
- `src/agent/trace-recorder.ts` — `toTrainingExample(system, ProviderMessage[], meta)` + `appendTrace(file, ex)` (saf mapping + JSONL append).
- `src/agent/session.ts` — `AgentSession.transcript(): ProviderMessage[]` (defensive copy).
- `src/cli/repl/native-agent-bridge.ts` — opsiyonel `recordTurn?` dep; her tur-sonu `recordTurn(session.transcript())`.
- `src/cli/repl/trace-wire.ts` — `buildTurnRecorder({enabled,dir,sessionId,system,model,now})`; run.tsx wire (`.deckent/traces/<session>.jsonl`, `DECKENT_TRACE=0` opt-out, gitignored).
- 107 agent + 19 native/trace cli yeşil. **Aktive için: `npm run build:all` (recorder run.tsx'te → dist gerekir) → `node dist/cli/entry.js --native` (config.native_model=qwen3.6:27b) → her tur JSONL örnek yazar.**

**Plan:** `docs/superpowers/plans/2026-06-14-sp2-training-data-pipeline.md`.

**Phase 2 ✅ merged (`c1fbb052`) — CC-trace extractor:**
- **Format-keşfi (2026-06-14):** tek viable kaynak = CC transcript'leri (`~/.claude/projects/-home-alperen-deckent-dev/*.jsonl`, **225 dosya** devasa); `.tasks`/`.deckent/archive` BOŞ, `.brain/archive` prose-md (trace değil). CC formatı: `{type:user|assistant, message:{role,content:[text|tool_use|tool_result|thinking]}}`; tool_use `{id,name,input}`, tool_result `role:user` içinde. Tool-adları CC-voküleri (Bash/Edit/Read/Write + Agent/TaskUpdate/mcp__*) — **deckent-native DEĞİL**.
- **Karar (Alperen): hibrit** → çekirdek-4 remap (Read/Write/Edit/Bash→deckent_read_file/write_file/edit_file/bash) + **iki korpus**: `extracted-aligned.jsonl` (yalnız core-only segment'ler, saf deckent-vokül) + `extracted-general.jsonl` (tümü, core-4 remap + non-mappable as-is, genel agentic distil — Opus→qwen).
- `src/training/cc-trace-extractor.ts` (saf parser: `mapToolName`, `extractFromSession`→{aligned,general}; segment=real-user-text-turn; thinking-drop; malformed/meta-skip) + `scripts/extract-traces.mjs` (build-gated I/O, skip-safe) + `npm run extract:traces`. 8 test yeşil.
- **Korpusu ÜRETMEK için (Alperen-build-gate):** `npm run build && npm run extract:traces` → `.deckent/traces/extracted-{aligned,general}.jsonl` (225 dosyadan). Plan: `docs/superpowers/plans/2026-06-14-sp2p2-cc-trace-extractor.md`.

**⬜ SIRADAKİ (downstream, SP-2 dışı): fine-tune recipe** — unsloth/LLaMA-Factory, train/val split, aligned:general mix-ratio, qwen3.6 QLoRA → GGUF+Ollama Modelfile → `deckent-qwen`. Korpus üretilince.

**Gizlilik (kritik):** trace'ler local + gitignored + opt-out; HİÇBİR ŞEY yüklenmez (Alperen'in kendi fine-tune'u için kendi verisi).
