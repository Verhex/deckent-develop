# P0 readonly audit — native terminal handler inventory

**Skills:** `deckent-authority-bootstrap`, `deckent-readonly-audit`.  
**UTC:** 2026-09-10 (anchor fix after Astra ENTRY 155) · **Operator:** cursor-composer.

## Conclusion

**P0 registry inventory — evidence anchors revise.** Tek üretici: `p0-generate-handler-inventory.mjs` → `p0-handler-inventory.json` (**schema v3**, sha256 `352b8a35f258…`). **Sayılar yalnız JSON `counts` alanından** (Markdown bu dosyada generator çıktısıyla hizalanır). **Tam P0 baseline / outer product DONE değil.** **Ürün kodu değişmedi.**

**Doğrulama:** `node docs/execution/evidence/terminal-winddown-20260910/p0-generate-handler-inventory.mjs | sha256sum` (UTC hariç JSON sabit).

## Coverage

| Domain | Count | Method |
|--------|-------|--------|
| REPL slash (`SLASH_CATALOG`) | 48 | `p0-generate-handler-inventory.mjs` block parse |
| Agentic slash rows / unique tools | 26 / 24 | alias `/agent`, `/skill` documented |
| Meta slash rows | 22 | no `agenticTool` |
| MCP `TOOL_CATALOG` | 51 | same producer |
| CLI bridge literal specs | 29 | `CLI_BRIDGE_TOOLS` lines 37–184 |
| MCP without slash alias | 28 | 51 − 23 slash tools present in MCP catalog |
| Native exec dispatcher tools | 12 | parsed from register loop `native-tool-registry.ts:887–892` |
| Handler source digests | 10 | slash, bridge, mcp, native, tool-bridge, app, run, busy-controls, chat-native, tool-exec |

Skipped: `.brain/memory.db` içeriği, credential, live provider call, `npm run build`, test execution (readonly-audit method).

## Parity (two-way)

- **Unique slash agentic → CLI bridge:** 24/24 (`parity.slashUniqueToolsAllInCliBridge`).
- **Unique slash agentic → MCP catalog:** 23/24; **CLI-only:** `deckent_resources` (`chat-tool-bridge.ts:359`, `chat-slash-resources.test.ts:87`).
- **MCP catalog → slash:** 28 tools without any slash `agenticTool` alias.

## Truth labels (selected)

| Capability | Label | Finding class |
|------------|-------|----------------|
| Slash catalog completeness | çalışıyor | — |
| `/resources` MCP catalog entry | CLI-native-only (wired) | RELATED_BUT_NONBLOCKING |
| Meta slash full P4 contract tests | kanıtlanamadı | RELATED_BUT_NONBLOCKING (partial: `context-slashes.test.tsx`) |
| Owner continuity (renew/10s) | çalışmıyor | BLOCKS_CURRENT_DONE → P1–P4 |
| 324 unit tests green | çalışıyor | RELATED_BUT_NONBLOCKING (≠ owner acceptance) |

## HOLDs

1. **Build provenance** — bot HOLD; `dist/` not tied to HEAD.
2. **Formal review** — Composer self-audit; Astra-6 advisor review requested via `iletisim.md`.
3. **Dirty tree** — 64 porcelain lines; no bulk reconcile.

## Artifacts

- [p0-handler-inventory.json](./p0-handler-inventory.json)
- [p0-authority-bootstrap-20260910-composer.json](./p0-authority-bootstrap-20260910-composer.json)
- [g1-working-tree-snapshot-20260910-composer.md](./g1-working-tree-snapshot-20260910-composer.md)

## Next authorized step (owner / Astra ASSIGN)

1. Astra: inventory digest review + gap triage (`P0-PARITY-001`, meta contract backlog).
2. Owner gate: push 2 docs commits? bot/build policy?
3. Composer **P1 narrow slice** only after explicit ASSIGN (runtime snapshot / `/context` truth) — not started here.
