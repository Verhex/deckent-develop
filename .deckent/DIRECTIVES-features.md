# DIRECTIVES — Sprint Features-Showcase: deckent Özellik Sunum Dokümanları (canlı sunum)

## Goal: **Canlı sunum için deckent'in özelliklerini anlatan 20 Türkçe slide-style markdown dosyası** `docs/features/` altına. Kaynak: `.deckent/features-manifest.json` (kürate edilerek sunum anlatısına dönüştürülür). **10 task × 2 doc = 20 dosya**, her task distinct filesWrite → **paralel-güvenli (tek wave; eşzamanlılık configured `max_workers` ile sınırlı)**. Hedef: ekrana yansıtılabilir, yoğun-olmayan, **DÜRÜST** (çalışmayan özellik "çalışıyor" gibi sunulmaz — dormant'lar `🔜 roadmap` etiketli). **god-level kalite, koddan-türetilmiş gerçek sayılar (hardcode YASAK), sunum-hazır.**

Bu ayrı directives dosyasıdır — `DIRECTIVES.md`'deki Sprint 224/225/226 backlog'una **karışmaz**. Çalıştırmak için aşağıdaki "Çalıştırma" bölümüne bak.

## Ortak kurallar (HER doc için bağlayıcı)

**🟢 SLIDE-STYLE ŞABLON (zorunlu — 20 doc da AYNI iskeleti izler):**
```markdown
# <Başlık> — <kısa alt-başlık>
> Tek cümlelik açılış (sunumda okunacak hook cümlesi).

## Ne işe yarar?
- 3–6 madde, kısa, sunum-bullet'ı (cümle değil ifade).

## Neden önemli?
- 2–3 madde — değer / farklılaştırıcı (rakipte yok / dürüst kazanç).

## Nasıl çalışır?
- 2–4 madde veya küçük akış (A → B → C). Aşırı teknik DEĞİL, sunum derinliği.

## Komut / Örnek
\`\`\`bash
# gerçek deckent komutu + beklenen çıktı (uydurma YOK)
\`\`\`

## Durum
- Olgunluk: ✅ canlı  |  🔜 roadmap (dürüst etiket)
- İlgili: ADR-xxx · modül yolu (örn. src/orchestra/...)
```

**🔴 DÜRÜSTLÜK ([[feedback_proof_of_function_dod]] · [[feedback_zero_hardcode_live_data]]):**
- **Sayılar koddan türetilir, ASLA hardcode/uydurma yok.** (agent/skill/MCP-tool/CLI-komut/model/dashboard-sayfa sayısı) → ilgili kaynaktan say (manifest, `src/core/agent-pool.ts`, `src/cli/commands/`, MCP server, `model-registry.ts`). **Docs içi çelişki varsa** (örn. DECKENT.md "31 tools" vs IDENTITY.md "32") → daha düşük/doğrulanmış olanı yaz + "kaynak: X" belirt. Emin değilsen yuvarlak ifade ("30+") kullan.
- **Çalışmayan özelliği canlı gibi sunma.** manifest `dormant`/`dead` olanlar → `🔜 roadmap` / `aktivasyon yolunda` etiketli, "şu an çalışıyor" DEME. `active`/`lightly_used` → ✅ canlı.
- **Komut örnekleri gerçek olmalı** — `deckent --help` / mevcut CLI komutlarından doğrula; uydurma flag YOK.

**🔵 KAYNAK OKU (her worker yazmadan önce):** `.deckent/features-manifest.json` (kendi özelliğinin entry'si), `DECKENT.md`, `docs/MASTER-PLAN.md` (vizyon/durum), ilgili `src/` modülü. **Sunum tonu:** net, özgüvenli, abartısız; Türkçe akıcı; emoji ölçülü (başlık/durum'da).

**Biçim:** her doc ≤ ~120 satır (sunum, exhaustive değil). ESM/test gerektirmez (saf doc). **Sadece kendi filesWrite'ına yaz.** Doc-write task (ADR-053) → agent `doc-writer`, skill `documentation-writer`.

**İndeks:** `00-genel-bakis.md` aynı zamanda **içindekiler** — diğer 19 dosyaya markdown link listesi içerir (sunum gezinme).

---

## Task 1: FX-01 — Genel Bakış + Mimari
- Model: claude-sonnet-5
- Effort: normal
- Skills: documentation-writer
- Files: docs/features/00-genel-bakis.md, docs/features/01-mimari.md
- Scope: docs/features/
### Description
**00-genel-bakis.md:** deckent nedir — AI agent orchestration CLI, north-star ("everyone everywhere"), Trinity 3-yüz (bireysel/takım/enterprise), tek-MIT-ürün. **+ İçindekiler:** 01–19 dosyalarına link listesi (sunum gezinme).
**01-mimari.md:** Brain (tek orkestratör) / Worker (scope-sınırlı) / Auditor (kod yazmaz, denetler) üçlüsü; ADR-008 tek-yönlü bağımlılık. Kaynak: DECKENT.md, MASTER-PLAN §1-2, manifest `sprint-controller`.
**Kanıt:** her iki dosya slide-şablonun 5 başlığını içerir; 00 → 19 link.

## Task 2: FX-02 — Sprint Yaşam Döngüsü + Task Routing
- Model: claude-sonnet-5
- Effort: normal
- Skills: documentation-writer
- Files: docs/features/02-sprint-yasam-dongusu.md, docs/features/03-task-routing.md
- Scope: docs/features/
### Description
**02:** 8 faz PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP (DECKENT.md lifecycle tablosu). **03:** Routing Engine V2 — intent-based `routeTaskV2`, confidence scoring, agent+skill+provider ataması (manifest `routing-engine-v2`). ✅ canlı.

## Task 3: FX-03 — Model Registry/Multi-Provider + Memory V2
- Model: claude-sonnet-5
- Effort: normal
- Skills: documentation-writer
- Files: docs/features/04-model-registry-multi-provider.md, docs/features/05-memory-v2.md
- Scope: docs/features/
### Description
**04:** ModelRegistry tek-kaynak, tier-eşdeğerlik (premium/standard/economy), 3 provider (Claude/Codex/Gemini) + 8-fleet hedefi; sayıyı `model-registry.ts`'ten türet (manifest `model-registry`). **05:** Memory V2 — SQLite FTS5, dual-layer Türkçe normalize (TR/EN/DE), DB-first, "%96 bağlam azalması" iddiası → benchmark dosyası yoksa "~%96 (iddia)" diye belirt (MASTER-PLAN §9). ✅ canlı.

## Task 4: FX-04 — Agents + Skills
- Model: claude-sonnet-5
- Effort: normal
- Skills: documentation-writer
- Files: docs/features/06-agents.md, docs/features/07-skills.md
- Scope: docs/features/
### Description
**06:** Built-in agent'lar (vertical) — sayıyı `src/core/agent-pool.ts` veya `.deckent/agents/`'tan say (DECKENT.md "15 built-in + 2 custom" diyor; KOD ile doğrula, çelişirse kod kazanır + not düş); aktivasyon-anahtarları örneği. **07:** Built-in skill'ler (horizontal) — `deckent skill list`; AST sandbox doğrulama. ADR-041 taxonomy. ✅ canlı. **`deckent agent_list` / `deckent skill_list` komutlarını örnek ver.**

## Task 5: FX-05 — Spawn Backend'ler + Dependency Waves
- Model: claude-sonnet-5
- Effort: normal
- Skills: documentation-writer
- Files: docs/features/08-spawn-backends.md, docs/features/09-dependency-waves.md
- Scope: docs/features/
### Description
**08:** Backend'ler — Docker (default config, izolasyon/graceful shutdown) / subprocess / deprecated explicit tmux; `auto` native Windows'ta subprocess, diğer platformlarda Docker çözer ve runtime'da sessiz fallback zinciri kurmaz (ADR-G-014). **09:** Dependency Scheduler — Kahn topological wave sıralama, paralel dalga semantiği, ADR-045 (manifest `dependency-scheduler`). ✅ canlı.

## Task 6: FX-06 — Result Evaluation + Auditor/RBAC
- Model: claude-sonnet-5
- Effort: normal
- Skills: documentation-writer
- Files: docs/features/10-result-evaluation.md, docs/features/11-auditor-rbac.md
- Scope: docs/features/
### Description
**10:** Result Evaluator — GO / NO_GO / GO_WITH_TECH_DEBT, rubric skorlama, CODE_VERIFIED_DONE, disk-verify ground-truth (manifest `result-evaluator`). **11:** Auditor 30s scan-loop (heartbeat, git-diff boundary, stale-lock) + ADR-037 Authority Matrix RBAC (V1.0 advisory, V2 hard-flip post-GA — bunu dürüst belirt). ✅ canlı.

## Task 7: FX-07 — Event-Stream/Observability + Native REPL
- Model: claude-sonnet-5
- Effort: normal
- Skills: documentation-writer
- Files: docs/features/12-event-stream-observability.md, docs/features/13-native-repl-agentic.md
- Scope: docs/features/
### Description
**12:** Event Stream — append-only `sprint-NNN-events.jsonl`, ADR-035 15-kanal protokol, gözlemlenebilirlik (manifest `event-stream`). **13:** Native agentic REPL — argümansız `deckent` → konuşan agentic REPL, tool-use (write/edit/read/bash), streaming, slash-menü, permission-memory; ADR-081/083/085/086. ✅ canlı (F11 parity dalgası — bazı cilalar 🔜 belirt: UTF-8 audit, multi-provider parity).

## Task 8: FX-08 — Dashboard + MCP Entegrasyonu
- Model: claude-sonnet-5
- Effort: normal
- Skills: documentation-writer
- Files: docs/features/14-dashboard-control-plane.md, docs/features/15-mcp-integration.md
- Scope: docs/features/
### Description
**14:** Web Dashboard — React+Vite+Tailwind, sayfa sayısını `src/dashboard/src/pages/`'ten say (canlı veri SSE, sprint kontrol, terminal, evolution/nervous/enterprise sayfaları); ADR-080. **15:** MCP — tool sayısını MCP server kaynağından say (DECKENT.md "31" vs IDENTITY.md "32" çelişkisini çöz + not), 8 resource, stdio transport; `claude mcp add deckent`. ✅ canlı.

## Task 9: FX-09 — CLI Komutları + Evolution Pipeline
- Model: claude-sonnet-5
- Effort: normal
- Skills: documentation-writer
- Files: docs/features/16-cli-commands.md, docs/features/17-evolution-pipeline.md
- Scope: docs/features/
### Description
**16:** CLI — komut sayısını `src/cli/commands/`'tan türet (init/plan/start/status/review/retro/recall/remember/...); `deckent --help` örneği; CLI/MCP parity. **17:** Agent/Skill Evolution — promotion/demotion pipeline, adaptive-agent, identity-mutation closed-loop (manifest `promotion-pipeline`); F5 ✅ canlı, scale/A-B 🔜 roadmap (dürüst).

## Task 10: FX-10 — Nervous System (roadmap) + Vizyon/Yol Haritası
- Model: claude-sonnet-5
- Effort: normal
- Skills: documentation-writer
- Files: docs/features/18-nervous-system.md, docs/features/19-vizyon-yol-haritasi.md
- Scope: docs/features/
### Description
**18:** Nervous System — ADR-040 proaktif meta-orkestratör (observer/detector/executor, suggest/act); manifest `dormant` (sprint-controller'a wire değil, CLI-driven) → **🔜 "aktivasyon yolunda" dürüst etiket**, "şu an otomatik çalışıyor" DEME; panic-gate non-blocking + re-enable çalışması belirt. **19:** Vizyon — Trinity, otonom sürekli runtime (F3-009, ~%40→hedef), ERP runtime, multi-provider 8-fleet, local-LLM (Ollama/CUDA), million-user; MIT "open source for open world"; MASTER-PLAN §1/§5/§10'dan. Net "bugün ✅ / yarın 🔜" ayrımı.

---

**Beklenen:** 20/20 doc DONE, 0 scope-collision (her task 2 distinct dosya, 10 task = tek wave; eşzamanlı çalışan sayısı configured `max_workers`'ı aşmaz). **Dürüst:** dormant'lar `🔜 roadmap`, sayılar koddan-türetilmiş, komutlar gerçek. **Sunum-hazır:** slide-style, Türkçe, ≤120 satır/doc, 00 = içindekiler. `docs/features/` 20 dosya ile dolu.

**Pre-flight:** main temiz+commit'li (reset-bug güvenli — [[project_deckent_self_git_mutation_bug]]). **CLI'dan `env -u ANTHROPIC_API_KEY`** (subscription, API yasak). dependency_pipeline_enabled=false → tek wave zaten (bağımlılık yok). Her wave sonrası `git log -1` + `git stash list`.

## Çalıştırma (bu ayrı directives'i aktive et)
Bu dosya `DIRECTIVES.md`'ye dokunmaz. Çalıştırmak için (Alperen):
```bash
# 1) Bu sprint'i aktif directives yap (mevcut DIRECTIVES.md'yi yedekle):
cp DIRECTIVES.md DIRECTIVES.backlog.md            # 224/225/226 backlog yedeği
cp .deckent/DIRECTIVES-features.md DIRECTIVES.md  # features sprint'i aktive et
# 2) Planla + koş (subscription):
env -u ANTHROPIC_API_KEY deckent plan --mode structured   # 10 task
env -u ANTHROPIC_API_KEY deckent start
# 3) Bitince backlog'u geri al:
cp DIRECTIVES.backlog.md DIRECTIVES.md
```
> Not: `--mode structured` (deterministik, deckent-dev'de mükemmel — [[feedback_ai_planner_silent_fallback]]). 10 task bağımsız → tek wave; performance preset bugün en fazla 8 worker'ı eşzamanlı çalıştırır, kalan task'lar slot açıldıkça ilerler.

İlgili memory: [[feedback_proof_of_function_dod]] · [[feedback_zero_hardcode_live_data]] · [[feedback_god_level_i18n_quality_bar]] · [[project_deckent_everyone_everywhere]] · [[feedback_ai_planner_silent_fallback]] · [[project_deckent_self_git_mutation_bug]]
İlgili kaynak: `.deckent/features-manifest.json` · `DECKENT.md` · `docs/MASTER-PLAN.md`
