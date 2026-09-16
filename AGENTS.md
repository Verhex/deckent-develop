# deckent-dev — legacy kaynak (salt-okunur taş ocağı)

DOGFOOD_MODE=OFF
EXECUTION_AUTHORITY=ASTRA
ANALYSIS_AUTHORITY=FABLE
OWNER_AUTHORITY=ALPEREN
DECISION_REF=owner-live-2026-09-16-clean-repo-port

Bu repo yalnız (a) port için okunacak kaynak ve (b) parite oracle'ı olarak derlenebilir eski binary'dir.
Yeni iş burada yapılmaz; ürün kodu `/home/alperen/deckent-next`. Onaylı plan:
`/home/alperen/deckent-refactor-work/PLAN-APPROVED-2026-09-16.md`.

Kurallar: burada yeni doküman/test/script açılmaz; `src` değişikliği yalnız parite oracle'ını çalıştırmak
için zorunlu düzeltmedir; commit yalnız owner isteğiyle; `.brain/memory.db`, `.deckent/.keyring`,
`.deckent/audit-key` silinmez. 3 değişmez yasa (dual-lens+scale · every-environment · never-MVP) aynen geçerlidir.

Build: `npm run build` · Binary: `node dist/cli/entry.js` · MCP: `node dist/mcp/server.js`
