---
name: feedback-build-requires-user-approval
description: "npm run build sonrası MCP server stale cache içerir — kullanıcı onayı ile `/mcp restart` şart. Sprint çalışırken build YASAK. Build/restart sırası Alperen tarafından koordine edilir."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 831d4c9f-6acf-418d-aeab-2f47a8741e57
---

**Kural:** `npm run build` sonrası MCP server'ı (ve uzun-yaşam Brain process'leri) **stale cache'leyebilir** — kullanıcı `/mcp restart` yapana kadar eski kod çalışır. **Sprint çalışırken build YASAK** çünkü dist/ partial update + Brain runtime'da inconsistent state.

**Why:** ESM loader module cache + singleton state (config, model registry, memory store) MCP process boyunca tutar. Build sonu disk'te yeni `.js` ama process'te eski. Sprint mid-execution build → worker spawn yeni kod, Brain hâlâ eski kod = chaos.

**How to apply:**
- **Build sırası:** (1) sprint kill veya bitiş bekle, (2) `npm run build`, (3) `/mcp restart` (Claude Code'da), (4) yeni sprint başlat
- **Asla:** Sprint koşarken `npm run build`, sprint koşarken `/mcp restart`
- **Worker container build YOK:** Worker'lar kendi build yapmaz, host'taki dist/ kullanırlar (Docker mount)
- **Build sonrası test verify:** `npx tsc --noEmit` + `npx vitest run` clean
- **MCP restart Alperen MANUEL** — otomatik trigger YOK (security + dogfood discipline)

**Anti-pattern:**
- "Build edip otomatik restart" → ✗ kullanıcı kontrol elinde
- "Background `npm run build` watch" → ✗ ESM cache inconsistency
- "Sprint mid-execution rebuild" → ✗ Brain crashes

**Sprint workflow:**
```
1. Sprint bitince → npm run build
2. → /mcp restart
3. → Bir sonraki sprint plan + start
```

İlgili: [[feedback_no_auth_touch_during_sprint]], [[project_system_risk_inventory]]
