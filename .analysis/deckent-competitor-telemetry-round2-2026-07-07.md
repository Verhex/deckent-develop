# Deckent — 2. Tur: Rakip Negatif-Alan Taraması + Telemetri Fiyat Haritası

> Tarih: 2026-07-07 · Yöntem: 2-aşamalı workflow — (1) KEŞİF: 4 modalite (OSS repolar · ticari ürünler · terminal-runtimes · self-improving iddialılar) → 40 ham aday → konsolidasyon → 16 rakip; (2) rakip başına derin tarama + iki-yönlü adversarial doğrulama ("VAR" iddiası = 3-oylu çürütme turu; "YOK" sonucu = negatif-alan re-scan). Paralel iz: 7 telemetri ürünü, fiyatlar canlı pricing-sayfasından ikinci ajanla teyitli. Toplam 64 ajan (limit-kesintisi sonrası cache'li resume ile tamamlandı).
> Sonuç istatistiği: **5 THREAT_CONFIRMED · 1 THREAT_REFUTED (Ruflo, 3/3) · 12 LACKS_CONFIRMED · 0 LACKS_OVERTURNED**.
> Önceki turlar: `.analysis/deckent-objective-audit-2026-07-07.md` (iç kod-denetimi) · `.analysis/deckent-deep-research-2026-07-07.md` (dış kanıt turu-1).

---

# Deckent — İki-Kanallı Araştırma Turu Final Sentezi (2026-07-07)

## 1. TLDR

Taranan 17 rakipten **5'i THREAT_CONFIRMED** çıktı — ancak beşi de yalnız verification-gate ekseninde; "verification + outcome-learning **kombinasyonunu** default-on gemide taşıyan" tek ciddi aday **Bernstein** ve onun da öğrenme katmanı agent-promotion değil Claude model-tier seçimi (agent_trust modülü fiilen unwired, amiral-gemisi LinUCB bandit opt-in). En yüksek profilli anlatı-rakibi **Claude Flow/Ruflo'nun outcome-learning iddiası 3/3 adversarial oyla REFUTED** — loop kod olarak var ama write-junction kırık (`hooks post-task` CLI'ı `task` parametresini hiç iletmiyor), label'lar unverified self-report ve etki advisory ([oylar: tarball-inceleme](https://gist.github.com/roman-rr/ed603b676af019b8740423d2bb8e4bf6)). Kritik güncelleme: **Hermes Agent artık deterministik verify-on-stop gate gemide taşıyor** (v2026.7.1, default-on coding yüzeylerinde) — iç analizimizdeki "Hermes'te gate yok" tespiti bayatladı. Sonuç hüküm: Deckent **"deterministik doğrulama gemiye koyan tek ürün" diyemez**, ama "**default-on rubric+disk-verify gate'i, doğrulanmış outcome sinyalini agent-promotion'a bağlayan kapalı döngüyle birleştiren tek sprint-orchestrator**" iddiası taranan 17 ürün içinde savunulabilir. Telemetri fiyat haritasında net pattern: per-seat model her yerde şikayet mıknatısı, kazanan formül = **flat taban + usage-metered birim + unlimited seats + OSS self-host**, retention ise ana fiyat-ayrıştırıcı. Deckent telemetri yüzeyi için önerilen birim: **verified-task/sprint-outcome** (trace/GB değil) — hiçbir rakip doğrulanmış-outcome'u fiyat birimi yapmıyor, bu paketleme düzeyinde bile diferansiyasyon.

---

## 2. Rakip Matrisi

| Ürün | Kategori | Yüzey | Verif. gate? | Outcome learning? | Verdict | Fiyat/Lisans |
|---|---|---|---|---|---|---|
| [Paperclip](https://github.com/paperclipai/paperclip) | Org-chart agent orkestratörü | Web UI ana, CLI+BYO-agent | ✗ (LLM watchdog, opt-in) | ✗ (roadmap ⚪) | **LACKS_CONFIRMED** | MIT, ücretsiz, ~70k★ |
| [Claude Flow / Ruflo](https://github.com/ruvnet/ruflo) | Swarm/MCP orkestratörü | Terminal-first (Claude Code üstü) | ✗ (verify=supply-chain witness) | ✗ (**iddia 3/3 REFUTED** — write-junction kırık, self-report label) | **THREAT_REFUTED** | MIT, ücretsiz, ~63k★ |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | Coding-agent platformu | Web ana + CLI/TUI/SDK | ✗ (Critic=LLM model, deneysel) | ✗ (vendor-side offline training) | **LACKS_CONFIRMED** | MIT open-core, Cloud free/Enterprise |
| [Devin](https://docs.devin.ai/) | Otonom SWE | Web ana + Slack/IDE/CLI | ✗ (LLM self-test + insan review) | ✗ (Knowledge=insan-onaylı prompt-memory) | **LACKS_CONFIRMED** | Kapalı; $20/$200/mo, Teams $80+/mo |
| [CrewAI](https://github.com/crewAIInc/crewAI) | Rol-bazlı MA framework | Python/CLI + AMP web | ✗ (guardrail=user-yazımı/LLM) | ✗ ([#3015 "not planned"](https://github.com/crewAIInc/crewAI/issues/3015)) | **LACKS_CONFIRMED** | MIT + AMP free/Enterprise, ~55k★ |
| [LangGraph](https://github.com/langchain-ai/langgraph) | Orkestrasyon substrate | SDK-first + LangSmith web | ✗ (evaluator=LLM-judge/user-code) | ✗ (Insights=rapor, optimizasyon=roadmap) | **LACKS_CONFIRMED** | MIT; LangSmith $0/$39/seat |
| [Claude Code (teams/workflows)](https://code.claude.com/docs/en/agent-teams) | Terminal MA | Terminal ana + IDE/web | ✗ (hook'lar boş gemi, user-yazımı) | ✗ (statik description-matching) | **LACKS_CONFIRMED** | Kapalı; $20–$200/mo |
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Tek-agent kişisel asistan | Terminal-first + desktop/messaging | ✓ **weak-form** (verify-on-stop, deterministik, default-auto) | ✗ (LLM self-review→skill/memory=prompt-memory) | **THREAT_CONFIRMED** | MIT, ~210k★, Portal $0–$200/mo |
| [Cursor](https://cursor.com/docs/bugbot) | IDE + agent fleet | IDE ana + web/CLI | ✗ (Bugbot=LLM-voting; deterministik=roadmap) | ✗ (learned rules=human-feedback→prompt) | **LACKS_CONFIRMED** | Kapalı; $20–$200/mo, Teams $40/seat |
| [Factory.ai](https://factory.ai/news/missions-architecture) | Droid orkestratörü (Missions) | Terminal+web+IDE | ✗ (validator=LLM agent; hook=user-yazımı) | ✗ (Router=rule-based preview; "self-improving"=vizyon) | **LACKS_CONFIRMED** | Kapalı; $20/$100/$200/mo |
| [Google Antigravity + Jules](https://antigravity.google/docs/artifacts) | Big-Tech agent platformu | IDE/desktop ana | ✗ (Artifacts=insan-review kanıtı; Critic=LLM-judge) | ✗ (knowledge base=prompt-memory) | **LACKS_CONFIRMED** | Kapalı; free/$20/$100/$200/mo |
| [Augment Intent](https://www.augmentcode.com/blog/intent-a-workspace-for-agent-orchestration) | Coordinator/Implementor/Verifier | Desktop app + BYOA | ✗ (Verifier=LLM, kredi-metreli) | ✗ (routing statik; Memories=prompt-memory) | **LACKS_CONFIRMED** | Kapalı; Business $100/mo flat |
| [Gas Town](https://github.com/steveyegge/gastown) | Terminal MA workforce | `gt` CLI + tmux + TUI | ✓ (git-state done-guard + Bors Refinery; **existence-level**) | ✗ (escalation=statik config; trust=enforce edilmiyor) | **THREAT_CONFIRMED** | MIT, ücretsiz |
| [Bernstein](https://github.com/sipyourdrink-ltd/bernstein) | MA sprint-benzeri orkestratör | CLI+TUI+MCP+web | ✓ **güçlü** (janitor signals + empty-diff REJECT + gate pipeline, default-on) | ◑ **tartışmalı** (2/3 oy default-path effectiveness→bandit buldu; LinUCB opt-in; agent_trust unwired) | **THREAT_CONFIRMED** | Apache-2.0, solo-maintainer, ~641★ |
| [Loki Mode](https://github.com/asklokesh/loki-mode) | Otonom SDLC orkestratörü | CLI + dashboard + MCP | ✓ (evidence gate: empty-diff/red-test block, default-on; inconclusive=pass-through) | ✗ (compound-learning=prompt-memory) | **THREAT_CONFIRMED** | BUSL-1.1 (2030'da Apache) |
| [Swarm Orchestrator](https://github.com/moonrunnerkc/swarm-orchestrator) | PR-audit + falsification gate | CLI + GitHub Action | ✓ (claim-falsified/restoration proofs; gate-mode **opt-in**) | ✗ (v9'da knowledge-base silindi) | **THREAT_CONFIRMED** | ISC, ~100★, mikro-ölçek |
| Helicone/LangSmith vb. (Track B) | Telemetri | — | — | — | (rakip değil, benchmark) | aşağıda |

---

## 3. "The Only?" Hükmü

**Kısa cevap: HAYIR — çıplak haliyle "tek" iddiası artık savunulamaz. Daraltılmış haliyle EVET.**

### THREAT_CONFIRMED listesi (5 adet) ve kanıtları

1. **Hermes Agent (Nous Research)** — verification gate ✓ weak-form. v2026.7.1 "The Judgment Release" (2026-07-01) ile deterministik verify-on-stop: kod düzenlenip fresh "passed" exit-code kanıtı yoksa `finish_reason='verification_required'` set edilip erken "done" cevabı kullanıcıdan saklanıyor; SQLite evidence ledger + regex komut-sınıflandırma, LLM yok ([verification_evidence.py](https://github.com/NousResearch/hermes-agent/blob/main/agent/verification_evidence.py), [conversation_loop.py:5134](https://github.com/NousResearch/hermes-agent/blob/main/agent/conversation_loop.py)). 3/3 oy doğruladı. **Ama:** soft (max 2 nudge sonra agent yine bitirebilir), claim-içeriği-vs-git-diff yok, GO/NO_GO verdict yok, downstream sonuç (demotion/re-route) yok; upgrade eden eski kurulumlarda migration OFF yazıyor.
2. **Gas Town (Steve Yegge)** — verification gate ✓ existence-level. `gt done` sıfır-commit/uncommitted-changes/push-verify guard'ları deterministik Go kodu, agent (polecat) oturumlarında default-on; kod yorumu bizzat "LLM agents read error messages and self-bypass" diyor ([done.go](https://github.com/steveyegge/gastown/blob/main/internal/cmd/done.go), [CHANGELOG v1.1.0](https://github.com/steveyegge/gastown/blob/main/CHANGELOG.md)). 3/3 oy doğruladı. **Ama:** rubric-vs-task-goal yok; Refinery gate içeriği user-supplied, gate yoksa "pass by default"; outcome-learning sıfır.
3. **Bernstein** — **iki kutuyu da işaretleyen tek rakip.** Gate: janitor completion-signals (path_exists/test_passes/file_contains) + git-commit attribution ile "empty attributed diff → REJECT" + diff üstünde lint-required gate pipeline, orchestrator ana döngüsünde koşulsuz ([janitor.py](https://github.com/sipyourdrink-ltd/bernstein/blob/main/src/bernstein/core/quality/janitor.py), [quality-pipeline.md](https://github.com/sipyourdrink-ltd/bernstein/blob/main/docs/architecture/quality-pipeline.md)). Learning: 3 oydan 2'si default-path'te canlı bir kapalı döngü buldu (her tamamlanmada effectiveness.jsonl'a janitor-pass/fail yazımı → spawn'da EpsilonGreedyBandit warm-start, success_rate<0.80 arm'lar atlanıyor); 1 oy bunu "opt-in dışında default-path öğrenme yok" diye reddetti. **Ama:** öğrenme Claude model-tier/effort seçimi — cross-provider **agent** promotion değil; agent_trust.py unwired; LinUCB router `BERNSTEIN_ROUTING=bandit` opt-in; solo-maintainer, ~641★, sprint/retro/enterprise-governance ürün hareketi yok.
4. **Loki Mode** — verification gate ✓. `council_evidence_gate()` empty-diff-vs-run-start-SHA ve red-test'te completion'ı bloke ediyor, `LOKI_EVIDENCE_GATE:-1` default-on, npm'de yayınlı (v7.121.5); "rc==0 alone is not a pass" sertleştirmesi kodda ([completion-council.sh](https://github.com/asklokesh/loki-mode), CHANGELOG v7.121.1). 3/3 oy doğruladı. **Ama:** inconclusive durumlar pass-through (git-repo yoksa, test-runner yoksa bloke etmez); outcome-learning yok (compound-learning=prompt-injection).
5. **Swarm Orchestrator (moonrunnerkc)** — verification gate ✓. Typed deterministik check'ler (build/test/file/coverage/property) + claim-falsified/restoration-proof block-trigger'ları, kanıt+reproduce-command'lı ([block-triggers.ts](https://github.com/moonrunnerkc/swarm-orchestrator/blob/main/src/audit/gate/block-triggers.ts)). 3/3 oy doğruladı. **Ama:** gate-mode iki kez opt-in (--mode gate + executionGrounded.enabled), Node-only sandbox, mikro-ölçek (~100★, ilk gerçek gate-proof Haziran 2026); multi-agent orkestrasyon v9'da terk edildi, learning sıfır.

**LACKS_OVERTURNED: yok.** 12 LACKS_CONFIRMED'in tamamı negative-space re-scan'den sağ çıktı. Ayrıca **Ruflo'nun THREAT iddiası REFUTED** — Deckent lehine kritik bulgu: 63k★'lık ana anlatı-rakibinin "outcome→routing loop" pazarlaması, kod düzeyinde default-dormant scaffolding (tek yazıcı MCP tool'un `task`+`agent` parametrelerini hiçbir shipped hook/CLI/talimat sağlamıyor; [bağımsız audit](https://gist.github.com/roman-rr/ed603b676af019b8740423d2bb8e4bf6) de aynı yönde).

### Savunulabilir iddia (kesin ifade)

- ❌ **Savunulamaz:** "Deterministik claim-vs-artifact verification gemide taşıyan tek ürün" — 5 karşı-örnek var.
- ❌ **Savunulamaz:** "Outcome-learning gemide taşıyan tek ürün" — Bernstein en azından opt-in (muhtemelen default-path model-tier) düzeyinde taşıyor.
- ✅ **Savunulabilir:** "**2026-07 itibarıyla taranan 17 orkestratör/agent ürünü içinde, (a) default-on, verdict-üreten (GO/NO_GO), claim-içeriğini git-artifact'lara karşı diff'leyen rubric+disk-verify gate'i ile (b) bu doğrulanmış outcome'ları cross-provider agent-promotion/demotion'a ve routing'e besleyen default-on kapalı döngüyü AYNI üründe birleştiren tek sprint-orchestrator Deckent'tir.**" Kombinasyondaki her sıfat yük taşıyor: Hermes/Loki/Gas Town'da verdict+consequence yok; Bernstein'da agent-promotion yok ve doğrulama-sinyali→öğrenme bağı model-tier ile sınırlı; Ruflo'da label'lar doğrulanmamış self-report.
- ⚠️ **Zaman baskısı:** Moat temporal — Paperclip roadmap'te "Automatic Organizational Learning" ([ROADMAP.md](https://github.com/paperclipai/paperclip/blob/master/ROADMAP.md)), Cursor "Bugbot'a kod koşturma" niyetini yazdı ([blog](https://cursor.com/blog/building-bugbot)), OpenHands patch-level Layer 2'yi duyurdu ([verification stack](https://openhands.dev/blog/20260305-learning-to-verify-ai-generated-code)), Hermes gate'i sertleşecek.

---

## 4. Hermes Kimliği

Kamusal "Hermes" = **Hermes Agent, Nous Research** ([github.com/NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)) — MIT, ~210k★, terminal-first (CLI+TUI ana yüzey, Electron desktop, 6+ messaging gateway), opsiyonel Nous Portal aboneliği ($0–$200/mo). Yapısal olarak Deckent'in rakibi **değil**: tek-agent kişisel asistan; planning/decomposition yok, worker fleet yok, GO/NO_GO eval pipeline'ı yok. Ünlü "closed learning loop"u LLM self-review'un skill/memory markdown yazması — routing'e/promotion'a sıfır etki, tam olarak excluded prompt-memory kategorisi ([background_review.py](https://github.com/NousResearch/hermes-agent/blob/main/agent/background_review.py)). **Ancak** iç analizimizdeki "Hermes'te claim-vs-artifact gate yok" sonucu **bayatladı**: 2026-06-25'te kod landed, v2026.7.1'de (2026-07-01, "The Judgment Release" — "'done' means proven, not claimed") deterministik verify-on-stop gate release edildi, coding yüzeylerinde default-auto. Deckent'in terminal-pivotunda rol-model aldığı proje artık doğrulama anlatısının da içinde — mesajlaşma "biz doğruluyoruz, onlar doğrulamıyor" değil, "**verdict-grade, orchestration-level enforcement + consequence**" olmalı.

---

## 5. Telemetri Fiyat Haritası (Track B)

| Ürün | Model | Free tier | Paralı tier'lar | Öne çıkan view'lar | Başlıca şikayet |
|---|---|---|---|---|---|
| [LangSmith](https://www.langchain.com/pricing) | Per-seat + per-trace (retention ayrıştırıcı) | $0, 1 seat, 5k trace/mo | Plus $39/seat/mo + $2.50/1k trace (14d) / $5/1k (400d); Ent. custom | Trace tree, dashboards+alerts, datasets→evals flywheel, Insights Agent, Deployment | 5x zam ($0.50→$2.50/1k); 1M trace ≈ $2,514/mo; closed-source, self-host Enterprise-only |
| [Langfuse](https://langfuse.com/pricing) | Usage-based (unit=trace/observation/score), **seat yok** | $0, 50k unit/mo, 2 user, 30d | Core $29 (100k dahil, $8/100k aşım), Pro $199, Ent. $2,499/mo | Nested trace, sessions, prompt mgmt, LLM-judge evals, per-user cost | v3 self-host 6 servis (ClickHouse+Redis+S3); uzun agent-trace'te UI zorlanıyor; alerting yok |
| [Braintrust](https://www.braintrust.dev/pricing) | Flat + per-GB + per-score, **unlimited seats** | $0, 1GB/mo, 10k score, 14d | Pro $249/mo (5GB+50k score; $3/GB, $1.50/1k aşım); Ent. custom | Trace→dataset tek-tık, eval-gated CI/CD, online scoring, Loop agent, MCP server | $0→$249 uçurumu; spend cap yok; closed-source + BTQL lock-in |
| [W&B Weave](https://wandb.ai/site/pricing/) | Per-seat plan + **per-MB** ingest ($0.10/MB≈$100/GB) | $0, 5 seat, 1GB Weave/mo (~4,500 trace) | Pro ~$60/mo (<50 çalışan şartı!), 1.5GB dahil; Ent. custom | Agent-native trace (sessions→turns→tools), guardrail scorers, monitors, MCP | Bill shock ($100/GB); 4 eşzamanlı metre; SSO/audit Enterprise-only |
| [AgentOps](https://www.agentops.ai/) | Per-event (seat yok) | $0, 5k event/mo (~birkaç yüz run) | Pro $40/mo+ PAYG (unlimited retention/export/RBAC); Ent. custom | **Session replay/time-travel**, waterfall, per-tool-call cost, MCP | Free tier günlerde bitiyor; eval workflow hiç yok; topluluk zayıf (G2: 0 review) |
| [Helicone](https://www.helicone.ai/pricing) | Flat + per-log (decay $0.0007→$0.00002) + per-GB, **unlimited seats** | $0, 10k req/mo, 1 seat, 7d | Pro $79/mo (HQL, alerts, 1mo ret.), Team $799 (SOC-2, 3mo), Ent. custom | Proxy 1-satır kurulum, sessions, HQL, caching-ROI, cost dashboard | Proxy=SPOF +50-80ms; **maintenance mode** (Mintlify satın aldı, 2026-03); eval sığ |
| [Arize Phoenix / AX](https://arize.com/pricing) | Çift-eksen: per-span + per-GB | OSS self-host sınırsız $0; AX Free 25k span+1GB, 15d | AX Pro $50/mo (50k span, 10GB, 30d); Ent. custom (~$60k/yr, 3.-taraf tahmin, doğrulanmamış) | OTel/OpenInference trace, evals, tek-container self-host, prompt playground ücretsiz | "RAG tax" (GB ekseni); $50→$60k tier boşluğu; ELv2 OSI-onaylı değil |

**Pattern'ler:** (1) **Per-seat kaybediyor** — LangSmith ve W&B'nin en çok saldırılan yanı; Langfuse/Braintrust/Helicone/AgentOps açıkça "unlimited seats"i pazarlama silahı yaptı; Helicone $20/seat'ten flat $79'a bilinçli kaçtı. (2) Kazanan formül: **düşük flat taban ($29–$79) + usage-metered tek anlaşılır birim + volumetrik indirim**; çok-eksenli metre (W&B'nin 4'lüsü, Arize'ın span+GB'si) forecast-edilemezlik şikayeti üretiyor. (3) **Retention asıl fiyat-ayrıştırıcı** (7d/14d/30d free → 3yr/forever paralı), feature'lar tier'lar arası çoğunlukla aynı. (4) **OSS self-host table stakes**: LangSmith'in closed-source+Enterprise-gated self-host'u kategorinin en büyük negatif-sentiment ve "alternative" launch üreticisi; Langfuse (MIT) ve AgentOps (MIT, app dahil) bunu doğrudan wedge yapıyor. (5) Monetizasyon asla core view'lardan değil: hosted convenience + retention + governance (SSO/SCIM/audit/SOC-2) + destek. (6) Free tier normu: değerlendirmeye yetecek, operasyona yetmeyecek hacim (5k trace / 50k unit / 1GB / 5k event) + kısa retention.

---

## 6. Deckent İçin Öneriler

### (a) Final positioning cümlesi

- **Temkinli (dış iletişim, hukuken sağlam):** "Deckent, agent'ların 'bitti' iddiasını git-gerçekliğine karşı rubric'le doğrulayıp GO/NO_GO verdict'e bağlayan **ve** bu doğrulanmış sonuçları agent seçimine ve promotion'a otomatik geri besleyen, default-on kapalı döngülü bir sprint-orchestrator'dır — 2026-07 itibarıyla taradığımız 17 orkestratörün hiçbiri bu kombinasyonun tamamını gemide taşımıyor."
- **İddialı (kanıt-linkli launch varyantı):** "Rakipler ya doğruluyor ya öğreniyor — ikisini birden yapan yok. Hermes 2 uyarıdan sonra pes eder, Gas Town commit'in *var olduğunu* kontrol eder, Ruflo'nun öğrenme döngüsü agent'ın kendi karnesine güvenir. Deckent tek başına: iddia-vs-disk deterministik verdict → doğrulanmış outcome → agent promotion. Kanıtsız 'done' Deckent'ten geçmez."
- Kaçınılacak ifade: "the only one with verification" / "agents that don't lie — only us" (Hermes/Loki/Gas Town/Bernstein/Swarm karşı-örnek).

### (b) Telemetri yüzeyi paketleme/fiyat önerisi

1. **Birim: trace/GB değil, "verified task-outcome" (veya sprint).** Hiçbir Track-B oyuncusu doğrulanmış-sonucu metre yapmıyor; Deckent'in gate'i zaten her task'a verdict damgası basıyor — birim doğal, forecast-edilebilir ve değer-hizalı ("byte için değil, kanıtlanmış iş için ödersin"). Braintrust'ın "score" metresi en yakın emsal ($1.50–2.50/1k).
2. **Seat'siz model:** unlimited seats her tier'da (Langfuse/Braintrust/Helicone konsensüsü); tek metre + retention ekseni. Örnek iskelet: Free $0 (≈500 verified-task/mo, 14–30d retention) · Pro $29–49/mo flat (10k task dahil, volumetrik aşım, 1yr retention) · Enterprise custom (SSO/SCIM/audit/SOC-2, forever retention, supported self-host). W&B tarzı çok-metre ve Braintrust tarzı $0→$249 uçurumundan kaçın.
3. **Self-host: OSS ve ücretsiz, tek-container.** Phoenix'in "single Docker container" kolaylığı + Langfuse'un MIT lisansı kategorinin sevilen ucu; LangSmith'in Enterprise-gated self-host'u nefret edilen ucu. Deckent zaten better-sqlite üzerinde (ADR-G-035) — "docker'sız bile çalışır, `deckent serve`" hikayesi Langfuse'un 6-servis yüküne karşı doğrudan koz. Para: hosted convenience + retention + governance'tan; core view'lar asla gate'lenmez.
4. **Sold view'lar:** sprint replay (session-replay muadili — AgentOps'un en sevilen özelliği), verification-verdict timeline (GO/NO_GO + kanıt diff'i — kategoride benzersiz view), agent leaderboard (promotion geçmişi), cost-per-verified-task (Helicone'un cost-ROI framing'i). MCP server üzerinden sorgulanabilirlik (Braintrust/W&B/AgentOps hepsi ekledi) terminal-first pivotla birebir örtüşüyor.

### (c) İzlenecek rakipler (öncelik sırasıyla)

1. **Bernstein** — iki kutuyu da işaretleyen tek rakip; haftada birkaç release, v3.0.0 bu araştırmadan bir gün önce çıktı. agent_trust'ın wire edilmesi ve LinUCB'nin default'a alınması an meselesi olabilir. ([releases](https://github.com/sipyourdrink-ltd/bernstein))
2. **Paperclip** — ~70k★ + MIT + aynı alıcı; "Automatic Organizational Learning" roadmap-item'ının shipped'e geçişini `releases/` üzerinden izle. ([ROADMAP](https://github.com/paperclipai/paperclip/blob/master/ROADMAP.md))
3. **Hermes Agent** — 210k★ gravity; verify-on-stop'un verdict/consequence yönünde sertleşmesi ve `/goal` completion-contracts'ın deterministikleşmesi izlenmeli. ([releases](https://github.com/NousResearch/hermes-agent/releases))
4. **OpenHands** — açık "Verification Stack" stratejisi + fleet-scale outcome sinyali topluyor; patch-level Layer 2 deterministikleşirse anlatı çarpışması büyür. ([blog](https://www.openhands.dev/blog/the-verification-stack))
5. **Cursor + Claude Code (release-velocity riski)** — Cursor "Bugbot'a kod koşturma"yı roadmap'e yazdı; Anthropic dynamic-workflows/grader tarafında en hızlı kapatma kapasitesine sahip oyuncu. ([Cursor](https://cursor.com/blog/building-bugbot) · [changelog](https://code.claude.com/docs/en/changelog))

---

*Not — güven düzeyi işaretleri: Bernstein'ın outcome-learning'inin "default-on" olup olmadığı 2'ye-1 oy ile tartışmalı (kod düzeyinde iki bağımsız doğrulama default-path effectiveness→bandit döngüsü buldu, bir doğrulama reddetti); Arize Enterprise ~$60k/yr rakamı üçüncü-taraf tahmini (resmi sayfada yok); Arize aşım fiyatları ($10/M span, $3/GB) resmi sayfada yayınlanmıyor; W&B Pro fiyat okuması kaynaklar arasında $50/user vs $60/mo-minimum diye çelişik. Tüm Track-A verdict'leri adversarial re-scan/oylamadan geçmiş primary-source (kod/tarball/changelog) kanıtlıdır.*