# Deckent — Rakip Güçlü Yanları & Kapanış Analizi (Kod-Doğrulamalı)

**Tarih:** 5 Haziran 2026 · **Belge Tipi:** Dahili Strateji + Mühendislik Yol Haritası
**Yöntem:** Her boşluk 6 paralel Explore agent'ı ile **kod tabanında dosya:satır kanıtıyla doğrulandı** — spekülasyon değil.
**İlgili:** [`competitive-analysis-2026-06.md`](competitive-analysis-2026-06.md)

> **Bu belgenin amacı:** Rakiplerde (Hermes-Agent, OpenHands, goose, LangGraph, Aider, Cursor/Cline) olup deckent'te
> **olmayan veya eksik** güçlü yanları çıkarmak, her birini kodda doğrulamak ve **somut kapatma planına** dönüştürmek.
>
> **Güven notu:** deckent tarafı bulguları **kod tabanında dosya:satır + koşu ile doğrulandı** (yüksek güven). Rakip
> sayıları (goose 70+ ext / 46.5k★, OpenHands %66.4 SWE-Bench, Hermes 200+ model) primary kaynaktan gelir ancak çekişmeli
> doğrulamadan geçmemiştir — bkz. `competitive-analysis-2026-06.md` metodoloji notu. **Boşlukların hiçbiri bu sayılara
> bağlı değildir** (örn. G2 "harici benchmark yok" kod-doğrulanmış; OpenHands %66.4 mü %60 mı önemsiz).

---

## 0. ÖNEMLİ: Kod doğrulaması competitive-analysis'i DÜZELTTİ

Kod tabanını gerçekten taradığımızda, hem eski (Mart) hem yeni (Haziran) rapordaki bazı iddialar yanlış çıktı:

| İddia (önceki rapor) | Kod-doğrulanmış GERÇEK | Sonuç |
|---|---|---|
| "Windows native yok, WSL2 zorunlu" | ✅ **Windows native ÇALIŞIYOR** — `subprocess.ts:178-180` `shell:true`, init platform-detect `win32→subprocess`; `docs/guide/installation.md:106` "Full support" | ❌ İddia YANLIŞ — gap değil |
| "Dokümantasyon kullanıcıya yönelik değil, hep dahili" | ⚠️ **Kullanıcı-yönelik docs VAR** — `docs/guide/` (quickstart, installation, first-sprint…) + `docs/reference/` ~50 doc | ⚠️ Kısmen yanlış — oran dahili-ağır ama temel var |
| "MCP server + client çift yönlü = güçlü yan" | 🔴 **Harici MCP-client REPL'e wire EDİLMEMİŞ** (koşu-doğrulanmış): `chat-mcp-bridge.ts` **0 importer**, `new McpClientBroker` sadece testte, `/mcp` slash **kayıtlı değil**. CLI (`deckent mcp …`) wire ama yalnızca `.mcp.json` config yönetir, server'a bağlanmaz. | 🔴 "Güçlü yan" sandığımız: server tarafı gerçek, **client tarafı testte kalmış** |
| "Provider: 3 (+lokal foundation)" | ✅ **7 provider** (claude/codex/gemini + deepseek/qwen/zhipu OpenAI-compat + Ollama local) | ✅ Kredilediğimizden fazla |
| "Onboarding 3/5" | ✅ **Olgun** — 15-adım init wizard, stack-detect (23+ dil), CLAUDE.md adapter, Cursor/VSCode MCP config | ✅ Aslında güçlü yan |

**Ders:** Wiring %'si ≠ user-working (memory: `feedback_wiring_pct_vs_user_working`). "Sprint DONE" ≠ "production'da çalışıyor". MCP-client bunun canlı örneği.

---

## 1. GAP HARİTASI — Öncelik Sıralı

| # | Boşluk | Rakip | Bizdeki durum (kod) | Şiddet | Effort |
|---|---|---|---|---|---|
| **G1** | Harici MCP-client REPL wiring | goose (70+ ext) | 🔴 Broker/registry/config + CLI-config wire; **harici tool çağrısı REPL'e bağlı değil, `/mcp` kayıtsız** | P0 | **Düşük** (kod hazır) |
| **G2** | Benchmark görünürlüğü (SWE-Bench) | OpenHands %66.4 | 🔴 Harness **yok** (Sprint 053 planlandı, yazılmadı) | P0 | Orta (~3-4 hafta) |
| **G3** | Docker sandbox hardening | OpenHands/Devin | ⚠️ Real container ama net/seccomp/cap **yok** | P1 | Düşük-orta |
| **G4** | Provider aggregator (200+ model) | Hermes 200+, goose 15+ | ⚠️ 7 provider, **OpenRouter/aggregator yok** | P1 | Orta |
| **G5** | HITL checkpoint wiring | LangGraph | ⚠️ Type+CLI var, **orchestrator durmuyor** | P2 | Orta |
| **G6** | Git-native commit | Aider | 🔴 Worker **commit yapmıyor**, rollback `reset --hard` | P2 | Orta |
| **G7** | Local model genişliği | goose (Ollama+) | ⚠️ Ollama var, llama.cpp/generic **yok** | P2 | Düşük |
| **G8** | IDE native entegrasyon | Cursor/Cline | 🔴 VS Code ext **hollow MVP** (v0.0.1, 2 komut) | P3 | Yüksek |
| **G9** | Time-travel / replay | LangGraph | 🔴 **Yok** (sadece git pre/post rollback) | P3 | Yüksek |

---

## 2. HER BOŞLUK — Detaylı Kapatma Planı

### 🔴 G1 — Harici MCP-Client REPL Wiring (P0, en düşük effort/en yüksek getiri)

**Rakip güçlü yanı:** goose 70+ pre-configured MCP extension, agent-surface canlı, OAuth dinamik.

**Kod-doğrulanmış durum (5 Haziran, koşu + kaynak-trace ile DOĞRULANDI — symbol-grep'in ötesinde):**
- ✅ `src/mcp-client/broker.ts` — SDK Client + stdio + StreamableHTTP transport, **kod tamam**
- ✅ `src/mcp-client/registry.ts:37-96` — namespaced `<server>__<tool>` registry, **test geçiyor**
- ✅ `src/mcp-client/config.ts:37-45` — 3-scope merge, **canlı**
- ✅ `src/cli/commands/mcp.ts:320` `registerMcp` → `index.ts:139` **wire** — ama `deckent mcp add/list/remove/get` **yalnızca `.mcp.json` config yönetir** (server'a bağlanmaz, tool çağırmaz).
- 🔴 **Harici broker REPL'e bağlı DEĞİL** (kesin):
  - `chat-mcp-bridge.ts` (Task 229-005 composition) → **0 importer** (`grep -rn chat-mcp-bridge src/` sadece dosyanın kendisi).
  - `new McpClientBroker` → yalnızca `tests/mcp-client/broker.test.ts` + `chat-mcp-bridge.ts` (importer yok) → **production'da broker hiç inşa edilmiyor.**
  - `/mcp` slash → `chat-slash-registry.ts`'de **kayıtlı değil**, `chat-native.ts`'de inline handler **yok**.
  - `renderMcpSlashLines` (harici tool listesi) → yalnızca `chat-mcp-bridge.ts:189` içinde, ulaşılamaz.
- 🔴 **0 built-in server** — `.mcp.json` template yok, kullanıcı manuel `deckent mcp add` yapmalı.
- ⚠️ **Süreç bulgusu:** Sprint 229 commit'i `… + REPL /mcp` diyor ve Task 229-005 **zorunlu Tier-1 smoke** (`printf '/mcp\n/exit\n' | … → "Unknown command" DEĞİL`) ile DONE işaretlenmiş — ama `/mcp` kayıtlı değil. Yani smoke ya geçmemiş (DONE şişirilmiş) ya da gate kaçırmış. (memory: `feedback_proof_of_function_dod`, `feedback_wiring_pct_vs_user_working`, `project_brain_integrity_sprint226_cluster`.)

**Kesin (savunulabilir) ifade:** Server tarafı + CLI config yönetimi + broker/registry/config kodu **tamam ve unit-test'li**; ama **canlı uçtan-uca harici MCP tool çağrısı testlerin dışında hiçbir yerde çalışmıyor** ve REPL `/mcp` erişilemez durumda.

**Kapatma adımları:**
1. `chat-mcp-bridge.ts:buildMcpBridge`'i **production REPL'e import et + wire et**; `/mcp` slash'ı `chat-slash-registry`/`chat-native`'e gerçekten kaydet — `Smoke:` ile gerçek-binary doğrula (dist rebuild sonrası; şu an dist bayat: `CLAUDE_MODELS is not defined`).
2. Agentic loop bir `<server>__<tool>` çağırınca → confirm-gate + `callTool` + audit sink **gerçekten** çalışsın (şu an testte mock).
3. 3-5 **built-in server preset** ekle (filesystem, git, web-search, fetch — `@modelcontextprotocol/server-*`).
4. (Faz 2) Worker surface — worker'lar MCP tool'larını kullanabilsin (DIRECTIVES'te "Faz 2 kapsam dışı").

**Neden P0:** Kod neredeyse hazır, sadece import+wire eksik. En ucuz "gerçek farklılaştırıcı" kazanımı. **Anlatımızı bu wire olmadan savunamayız** — ve ek olarak şişirilmiş bir DONE'u kapatır.

---

### 🔴 G2 — Benchmark Görünürlüğü / SWE-Bench (P0)

**Rakip güçlü yanı:** OpenHands **%66.4 SWE-Bench Verified** (multi-trajectory + neural critic), yayınlanmış skor = satış kanıtı.

**Kod-doğrulanmış durum:**
- 🔴 Harici benchmark harness **YOK.** `benchmarks/` dizini boş. `docs/directives/sprint-053.md` SWE-Bench Lite için 4 task planlamış ama **asla başlanmamış.** `docs/vision/roadmap.md:166` "SWE-bench run + publish" — backlog.
- ✅ **İç değerlendirme güçlü ve reuse edilebilir:** `result-evaluator.ts` (86KB), `rubric-registry.ts` (CODE/AUDIT/DOC rubrics, threshold 70), `quality-assessor.ts` (5-boyut), `proof-of-function.ts`, `honest-gate.ts`, `disk-verify.ts`.

**Kapatma adımları (mevcut parçaları reuse ederek):**
1. **Yeni:** `issue-adapter.ts` — GitHub issue → DIRECTIVES.md format.
2. **Yeni:** `benchmarks/swe-bench/runner.ts` — repo clone, deckent spawn, timeout, gold-patch fetch.
3. **Reuse:** `result-evaluator.scoreCorrectness/scoreTestCoverage` → SWE-Bench Pass@1.
4. **Reuse:** `proof-of-function` (çalışan kod ≈ Pass@1) + `outcome-tracker` (sonuç trace).
5. **Yeni:** analyzer/reporter (Django/Flask/sympy breakdown + rakip kıyas tablosu).

**Effort:** ~3-4 hafta (evaluator reuse ile; sıfırdan 6-8 hafta). **Çıktı:** "deckent SWE-Bench Lite üzerinde %X" — orkestrasyon avantajının ölçülebilir kanıtı.

---

### ⚠️ G3 — Docker Sandbox Hardening (P1)

**Rakip güçlü yanı:** OpenHands/Devin tam sandbox — network izolasyonu, seccomp, cap-drop, read-only root.

**Kod-doğrulanmış durum (`spawn-backend-docker.ts:206-542`, `Dockerfile.worker`):**
- ✅ VAR: container namespace, project read-only mount, non-root `--user uid:gid`, memory cgroup `--memory 4g`, PID/IPC namespace, graceful SIGTERM+15s.
- ❌ YOK: `--net` network izolasyonu (worker → host network erişebilir!), `--security-opt seccomp`, `--cap-drop`, `--pids-limit` (fork-bomb riski), `--read-only` root fs.

**Kapatma adımları:**
1. `--network none` veya custom bridge (yan-container/host erişimi kes) — opt-in flag (kullanıcı projesi internet isteyebilir).
2. `--cap-drop=ALL --cap-add=` minimal set.
3. `--pids-limit=512`, `--security-opt seccomp=<profile>`, `--read-only` + tmpfs `/tmp`.
4. Flag-gated default-on (CLAUDE.md: riskli kod kör-default-on edilmez → önce doğrula).

**Effort:** Düşük-orta (sadece docker args + test). **Getiri:** OpenHands sandbox paritesi, enterprise güven.

---

### ⚠️ G4 — Provider Aggregator (P1)

**Rakip güçlü yanı:** Hermes 200+ model (OpenRouter/NIM/NovitaAI, `hermes model` ile kod değişmeden switch), goose 15+ provider.

**Kod-doğrulanmış durum:**
- ✅ 7 provider: claude/codex/gemini (CLI) + deepseek/qwen/zhipu (OpenAI-compat HTTP, `provider.ts:823-826` hardcoded preset) + Ollama (local).
- ✅ `openai-compatible.ts` — generic adapter var.
- ❌ OpenRouter/NIM/NovitaAI **aggregator yok.** Yeni provider = `OPENAI_COMPAT_PRESETS` + `bootstrapProviders` **manuel kod değişikliği.** Live catalog (runtime model çek+register) yok. Azure/Bedrock yok.

**Kapatma adımları:**
1. Mevcut `OpenAICompatibleAdapter`'ı **OpenRouter preset'i** ile genişlet (tek adapter → 200+ model; baseURL `openrouter.ai/api/v1`).
2. **Live catalog:** `/models` endpoint'ten runtime model listesi çek → `ModelRegistry`'ye dinamik register (HTTP-compat modelleri şu an unregistered).
3. Config'ten arbitrary OpenAI-compat endpoint tanımlama (kod değişikliği gerektirmeden).

**Effort:** Orta. **Getiri:** "8-fleet" iddiasını gerçeğe çevirir (şu an 7), Hermes/goose paritesi.

---

### ⚠️ G5 — HITL Checkpoint Wiring (P2)

**Rakip güçlü yanı:** LangGraph graph içinde HITL breakpoints — belirli node'larda durup insan onayı bekler.

**Kod-doğrulanmış durum:**
- ✅ `src/mcp/tools/checkpoint.ts`, `src/cli/commands/checkpoint.ts` — list/approve/reject, dosya `.deckent/checkpoints/`.
- ✅ `sprint-lifecycle.ts:87` `CheckpointPhase = 'plan'|'evaluate'|'fix'` type tanımlı.
- 🔴 **KIRIK:** `handleCheckpoint()` çağrısı **hiçbir yerde yok.** Sprint-controller PLAN/EVALUATE/FIX'te **durmuyor.** `deckent checkpoint approve` file-state değiştirir ama Brain beklemez.

**Kapatma adımları:**
1. Sprint-controller PLAN/EVALUATE/FIX fazlarına **gerçek pause/poll** ekle (checkpoint pending ise approve gelene kadar bekle).
2. Config flag: `human_checkpoints: ['plan','evaluate']` — hangi fazlar onay bekleyecek.
3. Timeout + auto-approve fallback (sonsuz bekleme yok).

**Effort:** Orta. **Getiri:** Enterprise "insan onayı" gereksinimi + LangGraph paritesi.

---

### 🔴 G6 — Git-Native Commit (P2)

**Rakip güçlü yanı:** Aider git-native — her değişikliği otomatik commit, descriptive mesaj, kolay geri-al.

**Kod-doğrulanmış durum:**
- 🔴 Worker `git commit` **yapmıyor** (`worker.ts`'de `git add/commit` yok) — değişiklik working tree'de kalır.
- ✅ Git **okuma** var: `honest-gate.ts` (`git diff --numstat` yalan-tespit), `disk-verify.ts` (`git ls-files --others`).
- ⚠️ `rollback.ts:176` `git reset --hard` — **tehlikeli**, uncommitted iş siler; sadece deckent-dev için ADR-039 guard (`detectDeckentRepo`). Kullanıcı projesinde uncommitted iş **uyarısız silinebilir.**

**Kapatma adımları:**
1. Worker/Brain task-başına **otomatik commit** (task-id + özet mesaj) — opt-in flag.
2. Rollback'i `reset --hard` yerine **revert-commit** veya checkpoint-branch'e güvenli geçişle değiştir (veri kaybı riski yok).
3. Kullanıcı projesinde rollback öncesi **uncommitted-iş guard** (deckent-dev'deki ADR-039 korumasını genelleştir — memory: `project_deckent_self_git_mutation_bug`).

**Effort:** Orta. **Getiri:** Aider-style güven + veri-kaybı riskini kapatır (bilinen P0 bug).

---

### ⚠️ G7 — Local Model Genişliği (P2)

**Durum:** Ollama birinci-sınıf (`providers/ollama.ts`, 4 model, ADR-083). llama.cpp / generic local endpoint yok.
**Kapatma:** Generic OpenAI-compat local endpoint config (llama.cpp server, LM Studio, vLLM `localhost:*/v1`). **Effort:** Düşük (G4 adapter genişletmesiyle birlikte).

---

### 🔴 G8 — IDE Native Entegrasyon (P3, yüksek effort)

**Durum:** VS Code ext **hollow MVP** (`extensions/vscode/package.json:5` v0.0.1, 2 komut: startSprint=terminal-wrapper, showDashboard=localhost). Native edit/codelens/diagnostics yok. JetBrains yok.
**Kapatma:** Ya derin VS Code plugin (yüksek effort) **ya da** "MCP-üzerinden herhangi IDE" anlatısına net konumlan (Cursor/Cline/Claude Code zaten MCP ile çalışıyor) — IDE UX'te rekabet etme, orkestrasyon motoru ol. **Öneri:** Stratejik olarak G8'i düşür, MCP-IDE anlatısını güçlendir.

---

### 🔴 G9 — Time-Travel / Replay (P3, yüksek effort)

**Durum:** Yok. Sadece git pre/post-sprint rollback (`rollback.ts`). Event stream (`event-stream.ts` JSONL) write-only, rewind logic yok. Sprint checkpoint/resume ise **SOLID** (her 5 task, heartbeat+`.result` recovery — `sprint-checkpoint.ts`).
**Kapatma:** Event stream zaten offset'li → "event N'den replay" logic eklenebilir. **Effort:** Yüksek, **öncelik düşük** (resume zaten kayıp-önleme ihtiyacını karşılıyor).

---

## 3. ÖNERİLEN KAPATMA SIRASI (ROI'ye göre)

**Hızlı kazanımlar (düşük effort, yüksek getiri) — önce bunlar:**
1. **G1 MCP-client wiring** — kod hazır, sadece production'a bağla + built-in preset'ler. (Anlatı-kritik)
2. **G3 Docker hardening** — birkaç docker arg + test. (Güvenlik paritesi)
3. **G7 Local endpoint** — G4 ile birlikte adapter genişletmesi.

**Orta vadeli (stratejik kanıt):**
4. **G2 SWE-Bench harness** — evaluator reuse, ~3-4 hafta. (Satış kanıtı — "ölçemediğini satamazsın")
5. **G4 Provider aggregator** — OpenRouter adapter + live catalog. (200+ model paritesi)
6. **G6 Git-native commit + güvenli rollback** — veri-kaybı bug'ını da kapatır.

**Sonra / opsiyonel:**
7. **G5 HITL wiring** — enterprise onay akışı.
8. **G8/G9** — IDE derinliği & time-travel: stratejik olarak ertelenebilir; G8'de "MCP-IDE" anlatısı tercih edilebilir.

---

## 4. STRATEJİK SONUÇ

Kod doğrulaması iki şeyi netleştirdi:

1. **Bazı "zayıf" sandıklarımız aslında güçlü** (Windows native, onboarding, user docs, 7-provider). Bunları competitive-analysis'te ve pazarlamada **hak ettiğimiz kadar öne çıkarmıyoruz.**

2. **Bir "güçlü" sandığımız aslında eksik** (MCP-client production wire yok). Sprint DONE ≠ production-working. Bu, en ucuz ve en kritik kapatma (G1).

**En büyük tek getiri:** G1 (MCP-client wire) + G2 (SWE-Bench skoru). İlki anlatımızı gerçek kılar, ikincisi ölçülebilir kanıt verir. İkisi de mevcut kodun çoğunu reuse eder — sıfırdan inşa değil, **bağlama ve kanıtlama** işi.

---

## Ek: Kanıt Dosya Haritası (kod-doğrulama)

| Boşluk | Ana kanıt dosyaları |
|---|---|
| G1 | `src/mcp-client/{broker,registry,config}.ts`, `src/cli/commands/chat-mcp-bridge.ts:162` (0 caller), `src/cli/index.ts:139` |
| G2 | `docs/directives/sprint-053.md` (yazılmadı), `src/orchestra/{result-evaluator,rubric-registry,quality-assessor,proof-of-function}.ts` (reuse) |
| G3 | `src/orchestra/spawn-backend-docker.ts:461-542`, `Dockerfile.worker` (no seccomp/cap) |
| G4 | `src/core/provider.ts:823-826`, `src/providers/openai-compatible.ts`, `src/core/model-registry.ts:60` |
| G5 | `src/mcp/tools/checkpoint.ts`, `src/cli/commands/checkpoint.ts`, `src/orchestra/sprint-lifecycle.ts:87` (handleCheckpoint 0-caller) |
| G6 | `src/agents/worker.ts` (no git commit), `src/orchestra/rollback.ts:176` (reset --hard), `src/orchestra/self-modifying-detector.ts` (ADR-039 guard) |
| G7 | `src/providers/ollama.ts`, `src/core/ollama-models.ts:25-66` |
| G8 | `extensions/vscode/package.json:5,14-23`, `extensions/vscode/src/commands.ts:39-44` |
| G9 | `src/orchestra/rollback.ts`, `src/orchestra/event-stream.ts` (write-only), `src/orchestra/sprint-checkpoint.ts` (resume SOLID) |

> Tüm bulgular 5 Haziran 2026'da çalışan kod tabanı (`main`, Sprint 229 sonrası) üzerinde dosya:satır kanıtıyla doğrulandı.
