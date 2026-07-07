# Deckent — Objektif Dış-Göz Denetimi (Model Gözünden)

> Tarih: 2026-07-07 · Yöntem: 4 paralel keşif ajanı (ürün-yüzeyi · orkestrasyon-çekirdeği · öğrenme-döngüsü · ölçek/kalite) tüm iddiaları `file:line` kanıtıyla doğruladı; + `.analysis/hermes-vs-deckent-direction-decisions.md` ve `.analysis/paperclip-vs-deckent-comparison.md` okundu.
> Amaç: Deckent'i **bağımsız-objektif** tanımlamak ve kapsamlı bir deep-research'ün (dış pazar/rakip/benimseme araştırması) soru setini bulgularla temellendirmek.
> Bu dosya deep-research fazının **iç-kanıt zemini**dir — research ajanları buradan beslenmeli.

---

## 1. Objektif Kimlik (tek paragraf)

`deckent@1.0.0-beta.1` — gerçek, çalışan, alışılmadık derinlikte bir **multi-agent sprint orkestratörü + terminal-first agentic runtime**. ~233K satır TS (963 src dosyası), ~1.950 gerçek test dosyası, CI'da enforced coverage gate (lines 82 / functions 89). Akış: DIRECTIVES → plan (ai/structured/auto) → paralel CLI-worker spawn (claude/codex/gemini CLI'ları subprocess/docker'da) → **kural-tabanlı** değerlendirme (rubric + git disk-verify) → FIX → retro/memory (SQLite+FTS5). Yüzeyler: 101 CLI komut dosyası, 46 MCP tool (doğrulandı), 20 agent + 31 skill (doğrulandı), Ink REPL, 21-sayfalık izleme dashboard'u, 2072-satır el-yazımı HTTP API + ws-terminal alt-sistemi. Publishable: `validate:publish` 8 gerçek kapı.

**Spektrum hükmü (4. ajan):** "cilalı tek-kullanıcı dogfood aracı ↔ enterprise multi-tenant platform" ekseninde bugün **net olarak birinci uçta — ama o ucun alışılmadık sofistike bir örneği**. Enterprise yüzeyi iskele halinde var (RBAC/OIDC/tenant-context yazılmış, kısmen bağlanmış); default runtime tek-kimlik.

## 2. Kanıtlanmış Güçlü Yönler (moat adayları)

1. **Anti-yalan değerlendirme yığını** — en olgun alt-sistem. Rubric grader (`result-evaluator.ts:953`) + git disk-verify (`disk-verify.ts:121` — worker gerçekten kod üretti mi, fail-open) + debt-ceiling (self-assessment asla yukarı yuvarlanmaz, `:1060`) + honest-sentinel/stub-reclass. **LLM değil kural-tabanlı** → deterministik, ucuz, oynanması zor. Kategoride nadir.
2. **Kapalı öğrenme döngüsü (agent+skill)** — GERÇEK, aspirational değil. Her sprint: outcome-capture (`sprint-finalizer.ts:1222`, idempotent, agent+skill+synergy) → `learnings.json` → routing bonus (`routing-engine.ts:962`) → promotion/demotion (`promotion-pipeline.ts`; demote→`enabled=false`→`routing-engine.ts:887` gerçek trafik kesimi) → evolved-rule re-injection (`sprint-planner.ts:581`).
3. **Dürüst planner fallback** — Zod-validated parse, discriminated failure reasons, `ai` mod sessizce düşmez (throw), `auto` bildirir + structured'a düşer (`planner.ts:386-524`).
4. **Katmanlı liveness + sentetik-NO_GO kapılama** — 5-sinyal liveness, 5-dk grace, PanicGuard (kill default-BLOKE), her sentetik verdikt disk-verify'lı (`sprint-controller.ts:1350-1489`).
5. **Spawn-anında scope-collision engeli** — çakışan `filesWrite` PREVENTİF bloklanır (`scope-collision.ts:59`, `sprint-spawner.ts:430`) — tek gerçek hard-enforcement noktası.
6. **Dürüst docs kültürü** — `CROSS-PLATFORM-TESTING.md` Windows'u kendisi "unverified" işaretliyor; ground-truth-snapshot doc'u plan-vs-kod mutabakatı yapıyor.

## 3. İddia–Gerçek Açıkları (bağımsız yargı)

| İddia | Kod gerçeği | Kanıt |
|---|---|---|
| 8-faz deterministik lifecycle | **7 gerçek faz + 1 etiket** — DECAY controller'da yalnız `emitPhaseChange` çifti; asıl decay RETRO içindeki `finalizeSprint`'te | `sprint-controller.ts:1647,1664` · `sprint-finalizer.ts:584` |
| Cross-platform baştan (Yasa #2) | Windows-native CI'da bilinçli **informational-only** (`continue-on-error:true`, "Windows is unsupported"); cross-platform e2e matrix'te windows yok | `ci.yml:196-214` · `cross-platform-e2e.yml` |
| Multi-tenant | RBAC/OIDC motoru gerçek ama **default runtime tek-kimlik** (`tenantId='local'`, static-token'da rol yok); connector/bot inbound yolu `can()` çağırmıyor; JWT claim decode imza-doğrulamasız seam | `auth-me-endpoint.ts:114-130` · `incoming-command-router.ts` |
| "6-dil i18n" (MASTER-PLAN:31) | **2 dil** (en/tr, 639/639 mükemmel parite); dashboard 90 `.tsx`'in **0'ı** getMessage kullanıyor; CLI'da TR-hardcode kaçakları var | `messages.ts` · `chat-slash-registry.ts:311` |
| Milyon-ölçek | Dosya-tabanlı `.tasks` kuyruğu + senkron better-sqlite3 (busy_timeout 5s event-loop bloke) + O(n) dizin taraması; merkezi registry/sharding yok. Tek makinede az worker için doğru tasarım | `active-workers.ts:75-79` · `memory-store.ts:102-113` |
| Eval-backed + training hattı | Sprint-içi EVALUATE gerçek; ama **trace-export OPEN teyit**: `recordSprintWorkerTrace` 0-caller, ShareGPT `runPipeline` driver'sız, golden-task eval harness yok, CI'da eval adımı yok | `output-collector.ts:44` · `training/pipeline.ts:305` |
| Kalite kapıları | `lint:adr`/`lint:errors`/`lint:link`/`validate:publish` **hiçbir workflow'da yok** — yalnız release script'i/lokal | `.github/workflows/*` |
| Öğrenme döngüsü tam-kapalı | Kapalı ama **kaba çözünürlük**: bonuslar `tasks[0]` intent'inden hesaplanıp tüm task'lara uygulanıyor; tek-task yollarında `learningData: []` hardcoded; **model-seviyesi feedback hiç yok** | `sprint-planner.ts:548` · `run.ts:319` |

**Güvenlik yumuşak noktaları:** `.deck` secrets **plaintext** (yalnız .gitignore koruması, `deck-file.ts:90`); docker worker'lar `--dangerously-skip-permissions` + proje kökü RW bind-mount + **tek paylaşımlı çalışma ağacı** (worktree izolasyonu yok, `spawn-backend-docker.ts:568`); CLI worker TS file-lock'ları hiç çağırmıyor. Genel duruş yine de solo-araç ortalamasının belirgin üstünde (default-deny auth, keyring-şifreli credentials, detect-secrets, sandbox banned-pattern tarayıcı).

**Diğer kırılganlıklar:** worker prompt SINIRSIZ (ADR/skill cap kaldırılmış, `prompt-god-template.ts:442`); AI-planlama `spawnSync` ile Brain'i 900s'e kadar bloke edebiliyor (`planner.ts:467`); `claimTask` atomik değil (TOCTOU, `worker.ts:253`); provider rate-limit rebalancing TODO-stub (`sprint-spawner.ts:608`).

## 4. Model Gözünden (sistemin gerçek "kullanıcısı" bir LLM olarak)

- **Dürüstlük teşviki doğru kurulmuş:** NO_GO yazmak cezalandırılmıyor, yalan DONE disk-verify'a yakalanıyor, self-assessment tavan (yukarı çevrilmez). Bir model için nadir-sağlıklı ortam; "başarılı görün" baskısı yerine "dürüst raporla" dengesi.
- **Task kontratı iyi:** task JSON (scope, goCriteria, dependencies) + dosya-tabanlı hb/result kontratı model için basit ve yazması kolay.
- **Dikkat bütçesi israfı:** 68KB şablon + tam SKILL.md'ler + ADR'ler sınırsız enjeksiyon → uzun-prompt ortası talimat kaybı ("lost in the middle") riski. Progressive disclosure eksikliği yalnız tool'da değil, worker-prompt'ta da.
- **Kör uçuş:** worker tek-atışlık `claude -p` — görev sırasında soru soramaz, onay isteyemez. Belirsizlikte iki seçenek: tahmin (riskli) ya da NO_GO (pahalı). ApprovalBroker P0'ı model-verimliliği açısından da kritik.
- **Model-boyutu izlenmiyor:** öğrenme döngüsü agent+skill; oysa routing'in en pahalı kararı model seçimi. Model-level outcome-capture eksikliği döngünün en değerli eksik halkası.

## 5. Deep-Research Soru Seti (bulgu → dış soru)

Önerilen ana soru: **"2025-26 multi-agent orchestration pazarında Deckent'in kanıtlanmış farklılaştırıcıları (kural-tabanlı dürüstlük-eval + kapalı öğrenme döngüsü + terminal-first) ne kadar benzersiz; hangi rakip hangi katmanı çözüyor; solo→enterprise benimsemede hangi eksikler (approval, secrets, tenancy, Windows) gerçekten kapı-bekçisi?"**

6 açı (2026-07-07 Alperen onayı + ek: veri-ürünleştirme):
1. **Rakip haritası:** Claude Code (subagents/teams/workflows), OpenAI Codex, Devin, OpenHands, CrewAI/LangGraph/AutoGen, Hermes/OpenClaw-sınıfı terminal ajanları, Paperclip-sınıfı kontrol düzlemleri — kim hangi katmanda, kim öğreniyor, kim eval yapıyor.
2. **Self-improving routing SOTA:** outcome-based agent/model routing kim yapıyor (ürün+literatür); Deckent'in default-on kapalı döngüsü gerçekten nadir mi?
3. **Eval/dürüstlük pratikleri:** LLM-as-judge vs kural-tabanlı verification; disk-verify benzeri "claim-vs-artifact" yaklaşımları; agent-honesty araştırması.
4. **Benimseme kapıları:** solo-dev ve enterprise-procurement kriterleri (secrets-vault, SSO/SCIM, approval-workflow, audit, Windows); terminal-first dev-araçlarının pazar kabulü ve fiyatlama modelleri.
5. **VERİ-ÜRÜNLEŞTİRME (Alperen ek-önceliği):** Deckent'in biriktirdiği operasyonel veri (task-outcome, agent/skill istatistikleri, memory/ADR bilgi tabanı, KPI, audit-trail, cost/usage ledger, training-trace) nasıl ürün değerine çevrilir: (a) doğal-dil yönetim yüzeyleri (conversational control-plane, NL-config), (b) observability UX desenleri (terminal TUI + web arayüz hibrit; Datadog/Grafana/Honeycomb'un LLM'leşmesi), (c) agent-telemetri ürünleştirme örnekleri (LangSmith, Langfuse, Braintrust, W&B Weave, AgentOps, OpenTelemetry GenAI semantics) — hedef: "terminal + arayüzle doğal dille yönetilebilir + izlenebilir, herkes için kapsamlı ve kolay".
6. **Kendi-trace'inden fine-tune:** agentic-trajectory fine-tuning viability (deckent-core vizyonu) — örnekler, veri gereksinimleri, riskler.
