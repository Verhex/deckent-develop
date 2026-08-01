# USER-TRUTH DENETİMİ — 2026-07-06 (Alperen reddi üzerine 4-koldan koddan-doğrulamalı analiz)

> Tetik: Alperen loop-çıktısını ve göç-v1'i REDDETTİ ("user tarafı çöp, terminal işlevsiz,
> sprint yokken sprint var, DECKENT.md iğrenç, solo-enterprise yok, desktop yok").
> Yöntem: 4 paralel derin-denetim, HER iddia file:line kanıtlı. Karpathy-disiplin bağlayıcı.
> Kalıcı-ders: memory `feedback_user_truth_gate_2026_07_06` — **task-DONE ≠ kullanıcı-yaşıyor.**

## 0. HÜKÜM
Loop aylarca **gerçek** kod üretti (test-kapsamlı, mimari-derin) ama üç yapısal hata kullanıcı-değerini sıfıra yaklaştırdı:
1. **Deneyim-katmanı default-KAPALI** bırakıldı (flip hiç planlanmadı) → bare `deckent` = düz-chat.
2. **Durum-yüzeyi bayat-state okuyor** → ürün kendi hakkında yalan söylüyor (hayalet-sprint).
3. **ADR-kararları plan-satırına inmedi** (DESK-1, MODULARIZE) + docs bakımsız → iddialar kaosta.

## 1. CANLI-REPRO (2026-07-06, sprint kapalıyken `deckent status`)
"Sprint 375 · **Active: 2 workers** · 0/8" + "Baseline **0 tests**" + **4 bayat nervous-onayı** + budget-gürültüsü — tek ekranda 5 yalan.

## 2. KÖK-NEDENLER (file:line)
| Belirti | Kök-neden | Kanıt |
|---|---|---|
| Hayalet-sprint | cleanup `.deckent/sprint-state.json` + `sprint-active.json`'ı HİÇ silmiyor | `cleanup.ts:81-106` (hedef-listesinde yok) · okuma: `event-stream.ts:270-298` |
| "Active: 2 workers" | bayat `.hb` dosyaları sayılıyor | `auditor.ts:2154-2160` |
| "Baseline 0 tests" | kapanmış sprintin bayat `ci-baseline.json`'u aynen basılıyor | `output.ts:256-269` |
| Bayat-onaylar | `nervous accept` MCP-yolu pending-store'dan silmiyor (bridge-cleanup opsiyonel-bağımlılık) | `mcp/tools/nervous.ts:106-150` · `approval-bridge.ts:113-133` |
| "Etkileşimsiz yüz" | **10 default-OFF flag**: repl_surface.enabled/.approvals, tool_surface, approval.gate/api_decide, question_bridge, training_trace, live_trace, computer_use, autonomous, terminal.simple_mode/rpc_debug → footer/mode-indicator/onay-kartı/tool-yüzeyi hiç render olmuyor | `run.tsx:94-156` · `config-types.ts:182-225` |

## 3. YAPILAN — koddan-doğrulanmış gerçek (44 temsili ✅ örnekleminde)
- **%66 GERÇEK+ULAŞILABİLİR** (ör: ApprovalBroker-zinciri, init-wizard, health-snapshot, memory-V2, 46 MCP-tool, dashboard 17-rota/6-yazma-eylemli, orchestration-çekirdeği).
- Enterprise-katman GERÇEK: ~4.270 LoC (tenant/rbac/audit×5/gateway×7/identity/endpoint-871LoC).
- **%25 GERÇEK-ama-GATED/ORPHAN** — kod+test var, kullanıcı göremiyor (69 orphan-modül listesiyle örtüşük).
- %9 ŞÜPHELİ (APR-HISTORY-konum, REPL-DETACHED-START vb. netleştirme).

## 4. KALAN/KIRIK — kanıtlı boşluk-haritası
- **Dashboard-hız:** lazy-loading YOK (17 sayfa+Recharts+xterm tek-bundle, `App.tsx:6-26`), polling-dedup yok (2-5sn sayfa-başı fırtına).
- **Desktop:** ADR-G-033 **Electron'u seçmiş** ("DESK-1") ama MASTER-PLAN'da SIFIR satır — ADR→plan kopukluğu.
- **MOD-SPLIT:** enterprise kapalı-altsistem (orchestra/CLI'dan 0 import) → temiz-ayrılabilir; `enterprise/` taşıma+shim tablosu hazır; ADR-G-031 born-item'ları (MODULARIZE, ENT-CONFIG-SSOT, RATE-ENFORCE-WIRE, AUDIT-SECRET-WIRE, CAP-PERM-TAG) plana hiç inmemiş.
- **Docs-kaosu (gerçek-sayılar: 46 tool · 20 agent · 31 skill · 14 model · 20 dashboard-sayfa · 79 komut):** DECKENT.md "35 tool/15 agent/21 skill/13 model"; README aynı-dosyada 16-vs-20 sayfa çelişkisi; `docs/reference/mcp-tools.md` 42 (4 tool eksik); `gen-reference-docs.mjs`+`update-readme-stats.mjs` 4 gündür koşmamış; DECKENT.md'de iç-pivot-notları+sprint-numaraları; TR/EN karışık; terminal/approval/quick-start bölümleri yok. Hakiki-DECKENT.md iskeleti + tek-kaynak-eşlemesi raporda.

## 5. REMEDİASYON-DALGALARI (backlog-tohumu — MASTER-PLAN #491-498)
- **W0 TRUTH (P0):** sprint-state/active+ci-baseline cleanup-silme · nervous-pending gerçek-temizlik + bayat-süpürme komutu · status "sprint yok" dürüst-hali · hb-bazlı worker-sayımı düzeltme.
- **W1 EXPERIENCE-ON (P0):** default-flip paketi (repl_surface+approvals, tool_surface, simple_mode, question_bridge) — HER flip canlı-smoke kanıtlı · M5 native-flip (12/12 kanıt hazır).
- **W2 WIRE (P0/P1):** /help→catalog-render · APR-ALLOWSCOPE→ApprovalPolicy.decide · TOOL-REG shadow-seeding · orphan-69 dalgaları · TOOL-CALL exec-seam (karar verili).
- **W3 DASH-PERF (P1):** React.lazy route-splitting (~%30-40 bundle-düşüşü) · istek-dedup · Recharts-optimizasyonu.
- **W4 DOCS-TRUTH (P0):** generator'ları koş + `docs:ref:check`'i CI-zorunlu yap · README/DECKENT sayı-tekleştirme · DECKENT.md SIFIRDAN (iskelet + tek-kaynak: registry/TOOL_CATALOG/builtins/model-registry'den generate).
- **W5 DESK-1 (P1):** Electron mimari-doc + iskelet (dashboard-Vite + mevcut /api serve; ADR-G-033 kararı).
- **W6 MODULARIZE (P1):** `enterprise/` sınır-taşıma + shim'ler + ENT-born-item'ları satırlaştır.
- **W7 REPO-CLEANUP (göç-v2 ön-şartı):** 7 gerçek-ölü cerrahisi · 69-orphan karar-turu · kök-karalama+`.deckent`-moloz temizliği · tracked-set sadeleştirme. **Göç-v2 ancak W0+W4+W7 sonrası.**

## 6. SÜREÇ-DEĞİŞİKLİĞİ (loop'a bağlayıcı)
Her sprint-kapanış verify'ına **user-truth smoke** eklenir: bare `deckent status` (sprint-yokken temiz mi) + değişen-yüzeyin CANLI koşusu; ✅ yalnız bununla verilir. Yeni-özellik "default-off + flip-planı-yok" = teslim SAYILMAZ.
