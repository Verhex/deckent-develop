# DIRECTIVES — Sprint 288: deckent'i Anlatan 20 Doküman (analiz/)

## Goal: deckent'i sıfırdan tanıyan biri için, projeyi katman katman anlatan **20 Türkçe doküman** üret; hepsini proje kökünde **`analiz/`** klasörüne yaz. Dokümanlar god-level, doğru ve güncel olmalı — uydurma sayı/özellik YOK. Her doküman kısa-öz girizgah + somut detay (mimari, akış, dosya/komut referansı) içerir. 5 tema × 4 doküman = 20; her tema bağımsız bir task (paralel).

## Ortak kurallar (BAĞLAYICI)
- **Dil: Türkçe.** Tüm dokümanlar TR. Kod/komut/dosya-yolu adları orijinal kalır.
- **Doğruluk koddan/`.brain/exports/summary.md`'ten doğrulanır.** Güncel gerçekler: sürüm `1.0.0-beta.1`, sprint 287+, ADR 89, MCP **34 tool / 8 resource**, **15 built-in agent**, **21 built-in skill**, **4 tier** (economy/standard/premium/premium_plus), **3 cloud provider (Claude/Codex/Gemini) + Ollama (yerel)**, CLI 55+ komut. Model sayısı için `src/core/model-registry.ts`'i oku — sayıyı oradan türet, ezberden yazma (doc/IDENTITY'de "13" geçebilir ama registry'de `fable` ile birlikte daha fazla; canlı kaynak registry).
- **Rakip-ismi YASAK.** deckent'i kendi değer-önermesiyle anlat (evrimsel mimari, dependency-pipeline waves, Memory V2 FTS5, multi-provider, Nervous System, autonomous engine, ADR-governance, MIT-açık). Başka ürünle "vs/kıyas" yok.
- **Kaynak-temelli yaz:** İddiayı koddaki modül/komut/ADR ile çapala (ör. "Brain = `src/orchestra/sprint-controller.ts`"). Spekülasyon değil, repo gerçeği.
- **Her doküman** `# Başlık` + 1 paragraf özet ile başlar, sonra alt-başlıklarla detay. ~80–200 satır hedef (god-level, dolu ama şişirme yok).
- **Cerrahi scope:** Yalnız `analiz/` altına YAZ. `src/`, `.brain/exports/`, `docs/`, `CLAUDE.md`, `DECKENT.md` salt-OKU (referans için).

---

## Task 1: Tema A — Genel Bakış & Vizyon
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer, system-architect
- Files: analiz/01-deckent-nedir.md, analiz/02-mimari-genel-bakis.md, analiz/03-vizyon-konumlandirma.md, analiz/04-sprint-yasam-dongusu.md
- Scope: analiz/, src/, .brain/exports/, docs/

### Description
4 doküman: **01-deckent-nedir** (deckent nedir, hangi problemi çözer, kim için; AI agent orchestration CLI; bir cümlelik konum + temel kavramlar Brain/Worker/Auditor/Sprint). **02-mimari-genel-bakis** (üst-düzey katmanlar: orchestra/ core/ agents/ nervous/ monitor/ connectors/ providers/ api/ mcp/ cli/ dashboard/ — her birinin tek-cümle sorumluluğu, `CLAUDE.md` Architecture bölümünden doğrula). **03-vizyon-konumlandirma** (god-level/enterprise-grade ürün vizyonu, product-not-service ADR-033, agentic-OS yönü, MIT açık-kaynak; pazarlama-taktiği değil ürün-yönü). **04-sprint-yasam-dongusu** (8 faz PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP, her fazın sorumlusu + ne yaptığı, DECKENT.md Sprint Lifecycle tablosundan).
**Kanıt:** `ls analiz/01-deckent-nedir.md analiz/02-mimari-genel-bakis.md analiz/03-vizyon-konumlandirma.md analiz/04-sprint-yasam-dongusu.md` → 4 dosya mevcut.
**Test:** İçerik-doğrulama: `grep -l "PLAN" analiz/04-*.md` ve her dosyada `#` başlık + özet paragrafı var; rakip-ismi=0.

---

## Task 2: Tema B — Orkestrasyon Çekirdeği
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer, system-architect
- Files: analiz/05-brain-orchestrator.md, analiz/06-worker-auditor.md, analiz/07-task-routing.md, analiz/08-dependency-pipeline-wave.md
- Scope: analiz/, src/, .brain/exports/, docs/

### Description
4 doküman: **05-brain-orchestrator** (Brain tek orkestratör; `sprint-controller.ts` tam sprint döngüsü; planner→task-builder→evaluator akışı; ADR-008 tek-yönlü import kuralı). **06-worker-auditor** (Worker task claim/heartbeat/result yazımı `agents/worker.ts`; Auditor scan loop 30sn, git-diff scope ihlali, asla kod yazmaz; rollerin ayrımı). **07-task-routing** (`task-router.ts` per-task agent+skill+provider seçimi; routing-engine v2 3-layer intent→activation→routing; TaskDNA + confidence). **08-dependency-pipeline-wave** (Kahn topolojik wave'ler, `dependency_pipeline_enabled`, ADR-045 wave-based execution, ADR-064 continuous dispatch). Modül isimlerini `src/orchestra/` ve `src/core/`'dan doğrula.
**Kanıt:** `ls analiz/05-brain-orchestrator.md analiz/06-worker-auditor.md analiz/07-task-routing.md analiz/08-dependency-pipeline-wave.md` → 4 dosya.
**Test:** `grep -li "sprint-controller" analiz/05-*.md` + `grep -li "Auditor" analiz/06-*.md`; rakip-ismi=0.

---

## Task 3: Tema C — Agent / Skill / Provider Sistemi
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: analiz/09-built-in-agentlar.md, analiz/10-built-in-skiller.md, analiz/11-model-registry-tier.md, analiz/12-multi-provider.md
- Scope: analiz/, src/, .brain/exports/, docs/

### Description
4 doküman: **09-built-in-agentlar** (15 built-in agent — isim + uzmanlık + aktivasyon anahtar kelimeleri, DECKENT.md Built-in Agents tablosundan; ADR-041 horizontal-skill vs vertical-agent). **10-built-in-skiller** (21 built-in skill — isim + açıklama; AST sandbox doğrulama; agent↔skill farkı). **11-model-registry-tier** (`src/core/model-registry.ts` tek doğruluk kaynağı; 4 tier economy/standard/premium/premium_plus + tier-denklik; bundled model listesini KODDAN say, ezberden değil; `models.dev` canlı katalog + 24s cache + bundled fallback). **12-multi-provider** (Claude/Codex/Gemini + Ollama yerel; provider-agnostic tier routing; per-task `- Provider:` override; subscription vs api auth).
**Kanıt:** `ls analiz/09-built-in-agentlar.md analiz/10-built-in-skiller.md analiz/11-model-registry-tier.md analiz/12-multi-provider.md` → 4 dosya.
**Test:** `grep -ci "premium_plus" analiz/11-*.md` ≥ 1 + 09'da 15 agent listelenir; rakip-ismi=0 (provider-adı meşru, "vs/kıyas" yok).

---

## Task 4: Tema D — Hafıza, Yönetişim, Gözlem
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer, security-specialist
- Files: analiz/13-memory-v2.md, analiz/14-adr-governance.md, analiz/15-nervous-system.md, analiz/16-autonomous-engine.md
- Scope: analiz/, src/, .brain/exports/, docs/

### Description
4 doküman: **13-memory-v2** (DB-first SQLite `better-sqlite3`, FTS5 dual-layer Türkçe normalize, `.brain/memory.db` tek kaynak + .md export'lar; `deckent recall/remember`; ADR-088). **14-adr-governance** (ADR = mimari karar kaydı, `.brain/exports/decisions.md` MADR v3; 89 ADR; worker prompt'a zorunlu enjeksiyon; ADR-036 governance integration; ihlal→NO_GO + amendment). **15-nervous-system** (proaktif meta-orchestrator ADR-040: observer→detector-registry→decision-engine→proposer→dispatcher→executor→authority-matrix; subscribe/accept/reject akışı). **16-autonomous-engine** (durable backlog `.deckent/autonomous/backlog.json`, recurring/one-off/reactive trigger, 3-gate governance RBAC→policy→risk, `deckent autonomous` komutu).
**Kanıt:** `ls analiz/13-memory-v2.md analiz/14-adr-governance.md analiz/15-nervous-system.md analiz/16-autonomous-engine.md` → 4 dosya.
**Test:** `grep -li "FTS5" analiz/13-*.md` + `grep -li "ADR-040" analiz/15-*.md`; rakip-ismi=0.

---

## Task 5: Tema E — Arayüzler & Operasyon
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: analiz/17-cli-komutlari.md, analiz/18-mcp-entegrasyonu.md, analiz/19-dashboard-web-terminal.md, analiz/20-config-kurulum.md
- Scope: analiz/, src/, .brain/exports/, docs/

### Description
4 doküman: **17-cli-komutlari** (55+ CLI komutu; ana akış init→set-directives→plan→start→status→review→retro→cleanup; recall/remember/memory; register\<Name\>(program) pattern ADR-012). **18-mcp-entegrasyonu** (34 MCP tool + 8 resource; `claude mcp add deckent -- npx deckent-mcp`; tool/resource tablosu DECKENT.md'den; readonly/destructive ayrımı). **19-dashboard-web-terminal** (React+Vite+Tailwind dashboard `src/dashboard/`; embedded web terminal PTY+WS ADR-062; serve komutu + auth/OIDC). **20-config-kurulum** (3-katman config merge defaults→global→project→env ADR-004; `deckent init` dizin oluşturma + CLAUDE.md adapter; mode preset'leri performance/balanced/economic/api; kurulum adımları). DECKENT.md MCP Tool/Resource tablolarından ve `src/cli/`'dan doğrula.
**Kanıt:** `ls analiz/17-cli-komutlari.md analiz/18-mcp-entegrasyonu.md analiz/19-dashboard-web-terminal.md analiz/20-config-kurulum.md` → 4 dosya.
**Test:** `grep -ci "34" analiz/18-*.md` ≥ 1 (34 tool) + 17'de init/plan/start akışı geçer; rakip-ismi=0.

---

**Beklenen:** 5 task, hepsi DONE → `analiz/` altında 01–20 numaralı 20 Türkçe doküman. doc-writer ağırlık, sonnet (doğruluk + god-level). Bağımsız → paralel (5 wave-tek). Sprint-sonu CC: `ls analiz/ | wc -l` = 20 + rakip-ismi=0 + her doküman `#` başlık+özet taşıyor doğrula, sonra commit.
