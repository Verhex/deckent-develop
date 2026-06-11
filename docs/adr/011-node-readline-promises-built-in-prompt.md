# ADR-011: node:readline/promises — Built-in Prompt

**Status:** accepted

**Date:** 2026-04-16

---

**Decision:** **Basit, non-interaktif CLI prompt'ları** (text, select, confirm) için `node:readline/promises` modülü kullanılır. Rich/interaktif kullanıcı yüzeyi bu ADR'nin kapsamı DEĞİL (aşağıya bakın).
**Context:** `inquirer` (1.2MB) veya `prompts` (200KB) eklemek yerine Node 24+ built-in API basit prompt'lar için yeterli. Basit wrapper'lar (`promptText`, `promptSelect`, `promptConfirm`, `src/cli/helpers/prompt.ts`) init wizard + confirm ihtiyacını karşılar.
**Consequence:** `readline/promises` **basit-prompt** için minimal built-in olarak kalır (init wizard, confirm, headless/script bağlamı). **Rich UI artık deckent'in TEMEL-CORE özelliğidir** (Alperen 2026-06-11): `ink` (Native REPL/TUI — ADR-081/083) + React web dashboard (ADR-080) birinci-sınıf kullanıcı/enterprise yüzeyleri. Bu ADR'nin orijinal "Phase 3'te ink eklenebilir" tahmini gerçekleşti ve core'a yükseldi. İki katman **çelişmez** — iş-bölümü: `readline`=basit prompt, `ink`/`react`=rich UI.

---

**Amendment log:** 2026-06-11 — Node 18→24; kapsam "basit prompt" olarak netleştirildi; **rich UI (ink/react) temel-core özellik** olarak kaydedildi (önceki "Phase 3 maybe" → realized + elevated). Çelişki yok, iş-bölümü açıklandı. Line-11 typo ("adrGerekirse") temizlendi (Alperen ADR-review). md+db senkron.
