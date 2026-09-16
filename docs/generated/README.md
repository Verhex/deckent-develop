# `docs/generated/` — makine tarafından yazılan ağaç · machine-written tree

> **Bu ağaçtaki hiçbir dosya elle düzenlenmez.** · **Never hand-edit anything in this tree.**

Bu dizin, elle yazılan dokümantasyondan (`docs/en/`, `docs/tr/`) **kasıtlı olarak ayrıdır**.
Amaç tek bir şeydir: üretilen içerikle insan yazımı içeriğin bir daha asla karışmaması
(Alperen kararı, 2026-08-02).

This directory is **deliberately separate** from the hand-written documentation
(`docs/en/`, `docs/tr/`) for exactly one reason: generated and human-authored content must
never be confused for one another again.

## İçerik · Contents

| Yol · Path | Üreten · Producer | Komut · Command |
|---|---|---|
| `master-plan-active.{md,json}` | `scripts/lint-master-plan.mjs` | `npm run docs:master-plan` |
| `en/reference/mcp-*.md`, `tr/reference/mcp-*.md`, `*/reference/agents.md` | `scripts/gen-reference-docs.mjs` | `npm run docs:ref` |
| `en/reference/cli.md`, `tr/reference/cli.md`, `cli-manifest.json` | `scripts/generate-cli-docs.ts` | `npm run docs:generate-cli` |

Sürüklenme kontrolü · drift gate: `npm run docs:ref:check` ve `npm run lint:master-plan`.

CLI reference’ın tek üreticisi `scripts/generate-cli-docs.ts` dosyasıdır. `npm run docs:ref`
bu üreticiyi ve diğer reference üreticisini sabit sırada çalıştırır; iki script artık aynı
hedefi yazmaz. The CLI reference has one producer; the pipelines never overwrite each other.

## Kurallar · Rules

1. **Elle düzenleme yok.** Bir içerik yanlışsa kaynağı düzeltilir (`src/mcp/tools/*.ts`,
   `src/core/cli-command-contract.ts`, i18n catalog, `.deckent/agents/*`,
   `docs/MASTER-PLAN.md`), sonra üretici koşulur.
   Fix the source, then regenerate — never the output.
2. **`docs/en/reference/` ve `docs/tr/reference/` insan yazımıdır** ve bu ağaçla aynı adı
   taşıyan dosyalar içerebilir; ikisi farklı şeydir ve birbirinin yerine geçmez.
3. **Yerelleştirme sınırı:** yalnız çerçeve metni (başlık, giriş, sütun adı) çevrilir.
   Tablo içeriği koddan gelen tanımlayıcıdır (tool adı, CLI bayrağı, agent id) — çevrilmez.
   Only the prose chrome is localized; identifier payloads are not translated.
4. Yeni bir üretilen doküman eklenirse hedefi bu ağaç olur, `docs/<lang>/` değil.
