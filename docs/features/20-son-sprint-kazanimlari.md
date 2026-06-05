# deckent — Son Sprint Kazanımları (Sprint 226–229)

> Otonom runtime, MCP-client ve Brain değerlendirme-bütünlüğü: deckent'in "agentic run ecosystem" yolundaki son adımları.

## Özet

| Sprint | Kazanım | Alt-sistem | Durum |
|--------|---------|------------|-------|
| **226** | Otonom Runtime Wire (5 adapter + sürekli loop + `deckent autonomous` CLI) | AS-6 / F3-009 | ✅ 7/7 DONE |
| **227** | Brain Integrity Fix (diagnostic rubric + export-wipe guard + decay-safety) | S-INT / ADR-070 | ✅ 4/4 DONE |
| **228** | Otonom finalize (i18n + features-manifest + usage doc + e2e smoke) | AS-6 | ✅ 5/5 DONE |
| **229** | MCP-Client (broker + 3-scope config + registry + `deckent mcp` CLI + REPL `/mcp`) | AS-5·P1 | ✅ 5/5 DONE |

> Tüm sprintler disk-verify edildi, CI yeşil, commit'li+push'lu. Yeni CLI'lar (`deckent autonomous`, `deckent mcp`) **build sonrası** (`build:all + /mcp restart`) aktiftir.

---

## 1. Otonom Runtime — `deckent autonomous` (AS-6 / F3-009)

**Ne işe yarar?** Uzun-yaşayan, event-driven, **yetki-sınırlı** sürekli mod — 20dk'lık sprint'in ötesi. Kurulu olduğu ortamı izler, RBAC + insan-onay sınırları içinde aksiyon alır. "AI System Worker" yüzünün ilk gerçek adımı.

**Nasıl kullanılır?**
```bash
deckent autonomous start [--interval-ms 1000] [--max-iterations N]
deckent autonomous status     # bekleyen onaylar + son audit olayları
deckent autonomous stop       # temiz dur
```

**Döngü (her tick):** TriggerSource (scheduled-flow + self-dispatch) → **AuthorityChecker** (ADR-037 RBAC, **default-deny**) → **ApprovalGate** (nervous; `needs_approval` → **pending kalır, OTO-APPROVE YOK**) → ActionExecutor → **AuditSink** (her cycle event-stream'e iz).

**Güvenlik invariant'ı:** default-deny + insan-onay-gate + her cycle audit + **kendi başına sprint/aksiyon başlatmaz**. Bir ürün-hedefi; Brain'in/insanın sprint-başlatma iznini değiştirmez.

**Kod:** `src/orchestra/autonomous/` (authority/audit/approval/action/trigger-adapter + runtime-loop) · `src/cli/commands/autonomous.ts`.

---

## 2. MCP-Client — `deckent mcp` + REPL `/mcp` (AS-5·P1)

**Ne işe yarar?** deckent'i MCP **server-only**'den **MCP TÜKETİCİSİne** evriltir — harici MCP server'larına (yerel subprocess veya uzak/HTTP) bağlanır, tool'larını keşfeder, agentic loop'ta kullanır. Claude Code'un MCP'yi her ortamda kurup kullandığı **mimari parity**. SDK zaten dependency (`@modelcontextprotocol/sdk`) → yeni dep yok.

**Nasıl kullanılır?**
```bash
deckent mcp add <name> <cmd|url> [--scope project|user|local] [--transport stdio|http]
deckent mcp list
deckent mcp remove <name>
# REPL içinde:
/mcp                          # kayıtlı server'ların tool'larını listele + agentic çağır (confirm-gate)
```

**3-scope config:** `.mcp.json` → **project** (git'te paylaşılır) + **user** (global) + **local** (kişisel). **Güvenlik:** her harici çağrı merkezi broker'dan geçer → confirm-gate (tool-permissions) + audit (event-stream). İz bırakmadan harici aksiyon yok.

**Kod:** `src/mcp-client/` (broker/config/registry/types) · `src/cli/commands/mcp.ts` · `src/cli/commands/chat-mcp-bridge.ts`. Tamamlayıcı: MCP-**server** tarafı (32 tool) için bkz. [15-mcp-integration.md](15-mcp-integration.md).

**Kalan (Faz 2-3):** worker'lara MCP surface + RBAC scope; otonom/enterprise (remote OAuth + per-tenant) + dashboard MCP sayfası.

---

## 3. Brain Evaluation Integrity (Sprint 227 / ADR-070)

**Sorun:** Brain'in `rubric total` skoru her iyi task için **sabit 78.75** basıyordu (kalite ayrımı yok); sprint-içi export `.brain/exports/*.md`'yi boşaltıyor; decay memory learnings'i DB'den siliyordu.

**Çözüm (3 fix):**
- **Diagnostic rubric** — coverage yapısal-null'da ağırlıklar renormalize edilir → coverage'sız mükemmel task ~100, başarısız task düşük skor alır (sabit 78.75 yerine **gerçek varyans**, örn. Sprint 229: 100/100/100/100/89.33).
- **Export-wipe guard** — `writeGuardedExports`: DB'de entry varken render boş çıkarsa dolu `.md` **EZİLMEZ** (ADR'ler korunur).
- **Decay-safety** — `sprint_num > 0` skipDelete (undated satır default-silinmez) + >%50/≥10-batch catastrophic-abort.

**Etki:** Brain değerlendirmesi artık gerçekten ayırt edici (zayıf işi yakalar → FIX); hafıza/ADR sprint-içi kaybı durdu. Detay + RCA: MASTER-PLAN §4F.

**Kod:** `src/orchestra/result-evaluator.ts` · `src/core/memory-export.ts` · `src/core/memory-store.ts` (`decay`).

---

## Yol Haritası Bağlamı

Bu kazanımlar "tamamlanmış ürün = agentic run ecosystem" arkının parçası (MASTER-PLAN §4B Sub-System Map, §10A Completion Roadmap):

- **AS-6** Otonom + process/batch — ✅ runtime + CLI canlı (226/228)
- **AS-5** MCP-client — ✅ Faz 1 (229); Faz 2-3 kalan
- **AS-1** Platform + dormant-wake — 🔜 Sprint 230 (Windows backend, models.dev dinamik, docker live-monitor, dormant primitive wire)
- **AS-2** Gerçek multi-provider / any-key · **AS-3** zero-hardcode/i18n · **AS-4** provider-native — tasarımlı (§4A/§4E/§4D), sırada.

Derin tasarımlar: MASTER-PLAN §4A (AS-2) · §4C (AS-5) · §4D (AS-4) · §4E (AS-3) · §4F (Brain integrity).
