# ADR-095 (TASLAK / PROPOSED) — Terminal-First Ürün Mimarisi & Hermes-Bilgili Yön Pivotu

> **Status:** PROPOSED — Alperen onayı bekliyor. ADR-yazımı yalnız-Alperen-onayıyla `.brain/memory.db`'ye girer
> (build + `/mcp restart` gated). Bu dosya **taslak**tır; kabul edilince MADR v3 hibrit formatında memory.db'ye
> insert + `docs/adr/095-*.md` export edilir. ADR no **095** geçici (mevcut son: adr-094).
> **Tarih:** 2026-06-29 · **Kaynak:** `.analysis/hermes-vs-deckent-{claude-analysis,analysis,direction-decisions}.md`

## Context
Hermes (Nous Research, Python self-improving agent) ile Deckent **kod-tabanlı** karşılaştırıldı (7 paralel ajan, file:line-grounded).
Bulgular: Deckent **çekirdeği derin** (deterministik 8-faz eval-backed orchestration, kapalı outcome→routing→promotion öğrenme
döngüsü, governance-by-construction read-only capability/ERP, 2x test disiplini) — ama **ürün-yüzeyi dağınık**: terminal henüz
bir ürün-kabuğu değil; worker→ana-terminal **canlı approval yok**; **training-trace yazılı ama 0-caller (UNWIRED)**;
**progressive tool disclosure yok**; onboarding/Windows Hermes'ten geride. 340+ sprint dogfood "ürün-şekli" yerine
"sistem-genişliği" üretmiş.

## Decision — Yön Pivotu (bağlayıcı yön)
1. **Terminal = ana ürün yüzeyi** (yönetim+kullanım; tool-driven; **full-control + yormayan**; tam-işlevsellik şart,
   esneklik kabul-edilmez). İş CLI-komutuyla değil terminalden — ama zorlamadan (CLI/MCP opsiyonel). CC/Hermes/Codex/OpenClaw seviyesi.
2. **Dashboard = yalnız observability** (izleme/görsel-anlama); chat → Desktop-app; ileride Electron CC-Desktop ürünü.
3. **Runtime-wide ApprovalBroker = control-plane**: worker/tool emit → ana-terminale canlı → suspend/resume; çok-kanallı
   relay (terminal/telegram/whatsapp/dashboard) + "xx'de onaylandı" cross-broadcast.
4. **Training-trace WIRE** (sprint-worker turn'leri redacted+labeled) — deckent-LLM/fine-tune yakıtı.
5. **Tool sistemi Hermes-rol-model + progressive disclosure**; Deckent fonksiyonları tool-yüzeyine; scope-enforcement prompt
   yerine tool ile. Çekirdek daha derin → terminal+tool'da **daha iyi** olmak zorunda.
6. **Global install + proje-scope katman**: Deckent sistem-seviye global kurulur; öğrenimler proje-scope; her yeni süreçte tutarlı.
7. **DIRECTIVES 0-kırılganlık**: terminalde NL "planla" → DIRECTIVES üret; task/process/autonomous/flow/mission/sprint hepsi +
   ilk-kurulan-proje güvenliği.
8. **Provider first-class**: cost+limit+bildirim + fallback-yakalama + hız+kalite+güvenlik hepsinde first-class; subs-paket desteği.

## Preserved — Moat (YENİDEN-YAZILMAZ)
Deterministik 8-faz eval-backed orchestration · Kahn dependency-wave + atomic file-lock · 9-adım deterministik eval +
disk-vs-claim dürüstlüğü · kapalı outcome→routing→promotion öğrenme döngüsü (en güçlü subsystem) · governance-by-construction
(yapısal read-only capability/ERP) · 2x test disiplini · HMAC tamper-evident memory.

## Consequences
- **Governance katmanları (workspace/worker/brain/auditor) bu yöne göre işler** — ADR kabul edilince her agent prompt'una
  mandatory-constraint olarak auto-inject olur.
- Dashboard scope-freeze (yeni feature değil, mevcut event/run/trace/approval'ı görselleştir).
- **Modülerleşme** (deckent-solo / deckent-enterprise, iki lisans) → **ADR-revizyonundan SONRA**.
- **AEGIS** ADR'si Deckent-özel global-uygulanabilir agentic metoda yeniden tasarlanır (AEGIS-RD).
- **ADR-katmanlama** (deckent / proje / global) ayrı ADR/iş-maddesi (GOV pillar).
- İş-planı SSOT: `docs/MASTER-PLAN.md` (tek pillar-tablo, 209 madde).

## Relates / Supersedes
- Tamamlar: ADR-081 (Native Agentic Deckent), ADR-065 (Develop/Product Two-Repo Split), ADR-033 (Product-Not-Service),
  ADR-062 (Embedded Web Terminal), ADR-091 (Project-Scoped Messaging Gateway).
- Yön-düzeyinde günceller: dashboard'un "ana ürün" konumu → observability'e indirildi.

---
*Onaylarsan: (a) ADR no kesinleştir, (b) memory.db insert + docs/adr export (build/restart gated), (c) `.claude/rules` ADR-id-list'leri regenere. İstersen rule dosyalarına (brain/worker/auditor) doğrudan "Aktif Yön" anchor'ı da eklerim (belt-and-suspenders).*
