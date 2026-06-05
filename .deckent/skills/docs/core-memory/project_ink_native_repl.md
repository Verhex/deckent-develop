---
name: project_ink_native_repl
description: deckent native REPL artık Ink (React-for-CLI) tabanlı + DEFAULT — claude-code/gemini-cli ile aynı temel; el-yapımı raw-ANSI TUI terk edildi
metadata: 
  node_type: memory
  type: project
  originSessionId: 46b11a62-fd54-4968-ac74-3c501a8080ce
---

deckent'in native terminal REPL'i **Ink (React-for-CLI, ink@7 + react@19)** üzerine taşındı ve artık `deckent` (TTY) için **VARSAYILAN**. 100 prompt'luk takılmanın kök nedeni el-yapımı raw-ANSI imleç-yönetimiydi (çok-satır overwrite, kuyruk, cursor-drift) — claude-code + gemini-cli'nin yaptığı gibi Ink'in tam-frame reconciler'ı çözdü.

**Mimari (engine=loop, view=Ink):** `runChatNativeLoop` motor olarak kalır (agentic/tool/slash); Ink App (`src/cli/repl/app.tsx`) onu input-iterator + output-callback ile sürer, state'i render eder. `<Static>` geçmiş (doğal scroll+scrollback), pinned framed input (`input-bar.tsx`, `editInput`/`InputHistory` reuse), switchable-provider proxy (`provider-switch.ts` — /model·/provider runtime switch).

**KRİTİK BREAKTHROUGH (WSL'de kusursuz akış):** uzun cevabı tek dynamic-block olarak re-render etmek → WSL'de drift/blank (tall-region cursor-up desync). ÇÖZÜM (`stream-segmenter.ts`): tamamlanan satır/blokları (prose anında, kod/tablo blok-bütün) `<Static>`'e AKITARAK yaz (native scrollback, gerçek-zamanlı okunur), dynamic-region sadece in-progress partial-satır → drift yok. **Claude Code'un tekniği birebir budur.** + WSL fix'leri: subprocess sonrası `setRawMode(true)` re-assert (raw-echo `^[[A`), alt-screen DEFAULT-OFF (scrollback korunur, opt-in DECKENT_ALTSCREEN=1). **deckent çalıştırma: kendi terminalinden, Claude Code `!`-modu DEĞİL (interaktif TTY ister).**

**Sprint 224 enterprise epic'leri (hepsi main'de, `docs/SPRINT-224-VERIFICATION.md`):** E1 markdown (tablo/kod-syntax via cli-highlight/admonition/kbd), E2 interaktif /menü + komut-wire, E3 model/provider switcher + status-bar, E4 token footer + session-Σ, E5 agentic diff + approval-modes, E6 paste-tek-mesaj + /cancel + Ctrl-L + error-boundary, E7 Ink-default (legacy `DECKENT_INK=0` opt-out).

**Test:** PTY-harness `scripts/ink-pty-test.mjs` (script+printf Ink'i süremiyor — gerçek pty + `<LEFT>/<CR>/<HOME>` token). `DECKENT_INK_DEBUG=1` → /tmp/ink-keys.log tuş-debug.

**Ertelenenler (faz-2):** cost-$ footer, /compact·/resume, Esc-interrupt, kuyruk-edit-in-place, eski-yol-tam-silme (E7b), niche (vim/image/temalar/custom-cmd/hooks). İlgili: [[feedback_god_level_i18n_quality_bar]] · [[project_dashboard_realrun_findings]]
