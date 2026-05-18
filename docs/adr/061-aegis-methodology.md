# ADR-061: AEGIS — Agentic Effect-Governed Iterative Stewardship Methodology

**Status:** proposed

**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator)

**Date:** 2026-05-15

**Sprint:** Sprint 170 (planning phase, implementation Sprint 175-200)

---

## Status

proposed (Sprint 175 başlangıç, Sprint 200 god-level GA launch ile birlikte canonical)

---

## Context

Deckent Sprint 170 itibarıyla 14+ özgün mimari yapı içerir (Brain-Worker-Auditor 3-tier, Memory V2 SQLite FTS5, ADR Governance Integration ADR-036, RBAC Authority Matrix ADR-037, EffectClass taksonomisi, Self-Modifying Detection ADR-039, Nervous System ADR-040, TaskType Taxonomy ADR-053 proposed, Hybrid Scoring 5-Layer ADR-055 proposed, Wave-Based Execution ADR-045, Brain Self-Update Hook ADR-046, Manuel Subagent Dispatch ADR-047, Prompt Lifecycle ADR-048, Sprint Checkpoint+Resume ADR-043, Sprint State Observability ADR-044). Bu yapılar **kompozit bir disiplin** oluşturuyor; ancak **resmi bir adı ve yayınlanabilir spesifikasyonu yok**. Topluluk + akademik dünya + enterprise pazarda Deckent'i konumlandırmak için disiplinin **tek isim altında formel manifestosu** zorunlu.

Sprint 170 öncesi yapılan kapsamlı metodoloji araştırması (4 paralel research agent, ~95 metodoloji taraması) iki temel bulgu ortaya koydu:

**Birinci bulgu — Deckent zaten convergent endüstri patternlerinin %85'ini içerir:**
Klasik SE'den (DDD strategic + Hexagonal + Lean + CQRS/Event Sourcing + TDD + Trunk-Based Development + Crystal-family + Specification by Example), AI-era patternlerinden (Generator-Critic split, Reflection+Memory, Plan-Execute-Evaluate triad, Anthropic'in Orchestrator-Worker + Evaluator/Optimizer harness'i, MetaGPT'nin role-based SOP encoding'i, Voyager'ın lifelong-learning skill library'si, Constitutional AI'ın principle-based governance'ı), Process/DevOps'tan (SRE error budgets + blameless postmortems, Toyota Production System Jidoka/Andon, Shape Up appetite-driven cycles, CNCF tiered graduation, SOX segregation of duties, OpenSSF SLSA provenance) — Deckent her birinden bir parça benimsemiş ve birleştirmiş.

**İkinci bulgu — 7 boyutta hiçbir mevcut metodoloji Deckent'i tek başına kapsamıyor:**
1. Multi-mode lifecycle discipline (kod/task/process üçlemesi) for AI agents — yok
2. Cross-session/cross-sprint institutional memory with decay + governance + FTS retrieval — Reflexion per-task only, Generative Agents per-simulation only
3. Runtime ADR governance for AI-generated decisions (Constitutional AI training-time only, Deckent runtime-enforceable)
4. Self-Modifying Task Detection (dogfood vs user project discrimination) — hiçbir framework adresiyor
5. Multi-dimensional outcome scoring beyond math/code (PRM math-only, Deckent generic)
6. Provenance manifest for AI-generated artifacts (SLSA build-only, AI provenance gap)
7. Adversarial verification at lifecycle scale (VSDD single-developer scope, Deckent multi-mode multi-agent)

Sprint 170 itibarıyla Deckent OSS GA hazırlığında. **Resmi metodoloji adı + manifestosu olmadan dış dünya Deckent'i** Cursor (IDE-agent), Devin (autonomous SWE), Hermes (life assistant), MetaGPT (multi-agent framework), VSDD (solo-dev verification) gibi mevcut kategorilere yanlış konumlandırır. AEGIS bu boşluğu doldurur — Deckent'in mevcut disiplinine resmi kimlik verir, **kategori liderliği** iddiasını mümkün kılar.

---

## Decision

**AEGIS — Agentic Effect-Governed Iterative Stewardship** Deckent'in resmi metodolojisi olarak benimsenir. AEGIS **mode-agnostic** bir disiplin: Sprint Mode (kod orkestrasyon), Task Mode (life assistant single-task), Process Mode (ERP/business süreç orkestrasyon) — üçünde de aynı çekirdek ile çalışır, mode-spesifik kalibrasyonu EffectClass dağılımı ve verification tier seçimi belirler.

### AEGIS Spesifikasyonu

#### A. 3 Mimari Katman

```
┌─────────────────────────────────────────┐
│ KATMAN 1: AWARENESS                     │
│ Nervous System (ADR-040) +              │
│ Self-Modifying Detection (ADR-039) +    │
│ Brain Self-Audit Gate +                 │
│ Sprint State Observability (ADR-044)    │
├─────────────────────────────────────────┤
│ KATMAN 2: IMPROVEMENT                   │
│ Outcome Tracker + Synergy Matrix +      │
│ Rule Evolver +                          │
│ Promotion Pipeline +                    │
│ Mid-Sprint Adapter (Fresh-Eyes) +       │
│ Quality Assessor                        │
├─────────────────────────────────────────┤
│ KATMAN 3: HEALING                       │
│ Sprint Checkpoint+Resume (ADR-043) +    │
│ Manuel Subagent Dispatch (ADR-047) +    │
│ Notification Dispatcher +               │
│ Spawn Safety + Crash Recovery           │
└─────────────────────────────────────────┘
```

Üç katman birbirine ortogonal ve her workflow'da paralel çalışır. AWARENESS kendini bilir, IMPROVEMENT kendini geliştirir, HEALING kendini onarır. Bu üçleme **AI orkestrasyon disiplininin foundational invariant'ıdır** — herhangi bir katman eksik kalırsa sistem regresyon riski taşır.

#### B. 5 Rol (Separation of Duties — SOX + Linux Foundation governance ilham)

| Rol | Sorumluluk | Yetki Sınırı |
|-----|-----------|--------------|
| **Architect** (insan) | Strategic vision, Charter (DIRECTIVES) yazımı, EffectClass critical-irreversible için onay | Stratejik karar, taktik müdahale yok |
| **Brain** (orchestrator, singleton) | Plan, route, evaluate, finalize | Asla kod yazmaz (ADR-008 single import direction) |
| **Workers** (generators, paralel N) | Code/action + property test + DbC contract üretir | scope.filesWrite STRICT (ADR-037 RBAC) |
| **Auditor** (adversary, separate process) | Adversarial verification, ADR compliance, RBAC enforcement, fresh-context critique | Asla kod yazmaz, sadece okur + skor verir |
| **Nervous** (meta-orchestrator) | Proaktif sağlık izleme, Brain'i izler, recovery proposer | Brain'i restart edebilir, kod değiştirmez |

#### C. 8 Artifact (Specification by Example + SLSA + Living Documentation birleşimi)

1. **Charter** — DIRECTIVES.md, Given/When/Then formalize edilmiş public spec
2. **Tasks** — `.tasks/*.json` + EffectClass + verification tier + mode annotation
3. **Properties** — `tests/properties/` PBT specs (fast-check or domain-specific)
4. **Contracts** — Zod schemas at module boundaries (Sprint 169 sonrası mevcut, formalize)
5. **Adversary Reports** — `.audit/<sprint>/<task>-adverse.md` (yeni)
6. **Provenance Manifest** — `.deckent/provenance/<sprint>.json` Ed25519 imzalı SLSA-style (yeni)
7. **Memory** — `.brain/memory.db` + exports (mevcut Memory V2)
8. **ADRs** — mandatory runtime constraints (mevcut ADR-036 governance)

#### D. 9 Phase Lifecycle

Mevcut Deckent 8-phase (PLAN/SPAWN/EXECUTE/EVALUATE/FIX/RETRO/DECAY/CLEANUP) **5 yenilikle** AEGIS canonical lifecycle'a evrim:

```
Phase 1: SHAPE
  - Spec by Example formalization (Given/When/Then in Charter)
  - Optional: N-planner debate (multi-agent debate at planning, Du et al 2023)
  - Error-budget gate (SRE — önceki sprint NO_GO oranı eşik aşıyorsa freeze)
  - Provenance seed

Phase 2: GOVERN  [YENİ EXPLICIT PHASE]
  - ADR compliance check (ADR-036)
  - EffectClass classification per task
  - RBAC matrix activation (ADR-037)
  - Verification tier per EffectClass

Phase 3: SPAWN
  - Worker dispatch (tmux/subprocess/Docker per ADR-027)
  - Provenance manifest update

Phase 4: EXECUTE
  - Worker writes property + impl + DbC contract
  - [YENİ] Andon authority — worker proactively raises halt (Toyota Jidoka)
  - Heartbeat scan (Auditor)

Phase 5: ADVERSE  [YENİ EXPLICIT PHASE]
  - Fresh-context Auditor critique (VSDD Sarcasmotron pattern adopted)
  - Property + mutation + contract checks
  - Differential testing (cross-provider for compensable+ EffectClass)
  - "Zero-slop" exit criterion (VSDD inheritance)

Phase 6: EVALUATE
  - Hybrid Scoring 5-Layer (ADR-055)
  - Schema → Gates → Quality → Outcome → Auditor signal
  - Decision: DONE / GO_WITH_TECH_DEBT / NO_GO

Phase 7: REVIEW  [YENİ — Scrum Sprint Review eşdeğeri]
  - User-facing demonstration
  - Architect sees diff, decides FIX priorities
  - Distinct from internal RETRO

Phase 8: FIX
  - [YENİ alt-step] Explicit ROOT-CAUSE + 5-Whys discipline
  - Incident vs Problem distinction (ITIL inheritance)
  - ADR amendment if Problem (architectural fix)
  - Mid-Sprint Adapter rerouting (Fresh-Eyes Rotation)

Phase 9: COOL-DOWN  [YENİ — DECAY+CLEANUP+RETRO merged, Shape Up cool-down framing]
  - Sprint learnings → memory.db (Reflexion verbal RL)
  - SLSA-style provenance export (signed manifest)
  - Memory decay (existing)
  - Agent/skill promotion-pipeline (existing)
  - Lock release + archive
```

#### E. Verification Stack — EffectClass-Aware (3-Tier)

| EffectClass | Tier 1 (always) | Tier 2 (recommended) | Tier 3 (mandatory) |
|-------------|----------------|---------------------|---------------------|
| **pure** | Branded types + PBT + Zod + Stryker diff + DbC | — | — |
| **reversible** | All Tier 1 | Mutation 75+, Model-Based Testing | — |
| **idempotent** | All Tier 1 + idempotency property | Differential cross-provider | — |
| **compensable** | All Tier 1 + compensation contract DbC | Stateful PBT (do/undo invariant), canary | TLA+ if multi-component |
| **critical-irreversible** | All Tier 1, contracts non-removable | Mutation 90+, MBT, fuzz | **TLA+ specification mandatory** |

Tier 1 (~10% test runtime overhead) her sprint default. Tier 2 (~3-5 sprint deployment) yüksek risk task'larında. Tier 3 (~weeks-months investment) sadece critical-irreversible için.

#### F. Mode Applicability — Sprint / Task / Process

AEGIS üç modda da aynı çekirdek ile çalışır, mode-spesifik kalibrasyon:

| Boyut | Sprint Mode (kod) | Task Mode (life assistant) | Process Mode (ERP/business) |
|-------|-------------------|---------------------------|---------------------------|
| **EffectClass dağılımı** | %70 reversible, %25 idempotent, %5 critical-irreversible | %50 idempotent, %30 reversible, %20 compensable | %40 compensable, %30 critical-irreversible, %20 idempotent, %10 pure |
| **Verification tier modal** | Tier 1 default, Tier 2 selective | Tier 1 sufficient | **Tier 2 default, Tier 3 mandatory for critical-irreversible** |
| **Phase emphasis** | Tüm 9 faz dengeli | Phase 1-4 + Phase 9 (REVIEW/FIX skip optional) | **Phase 2 GOVERN + Phase 5 ADVERSE çift kalın** (compliance + audit trail) |
| **Charter format** | DIRECTIVES.md + Given/When/Then per task | Single-task prompt + outcome | BPMN-like business process spec + compliance metadata |
| **Provenance ağırlık** | Recommended | Optional | **Mandatory** (regulatory audit) |
| **N-planner debate** | Optional (high-effort sprint için) | Skip | **Mandatory** (financial transactions) |
| **Architect onayı** | Sadece critical-irreversible | Sadece critical-irreversible | **Her compensable+ workflow** |

Mode toggle Deckent config'de `deckent_style: sprint | task | process` (ADR-042 Hybrid Mode Architecture proposed temeli).

### AEGIS Çekirdek 8 Prensip

Manifesto-style canonical principles:

1. **Multi-Agent Separation of Duties** — Tek agent hem yazıp hem doğrulamaz. Brain plans, Worker executes, Auditor adversarially verifies. Concentration of power = anti-pattern.

2. **Effect-Aware Verification Rigor** — Bir task'ın blast radius'una orantılı doğrulama uygulanır. `pure` PBT yeterli, `critical-irreversible` TLA+ + Architect approval zorunlu.

3. **Adversarial Verification by Default** — Verification kendini doğrulayan jenerator değil, ayrı süreçteki Auditor'dur. Generator-critic separation gaming-proof discipline'ın foundation'ıdır.

4. **Runtime Governance Enforcement** — Architectural decisions (ADRs / corporate policy / regulations) plan-time'da düşünülmez, runtime'da Brain prompt enrichment + Auditor compliance check ile uygulanır.

5. **Cross-Workflow Institutional Memory** — Her workflow'un öğrenmesi memory.db'ye düşer, decay ile yaşar, FTS5 ile retrieve edilir, ADR'ye yükselir. Single-session amnezi anti-pattern.

6. **Self-* Triad Discipline** — Awareness (kendini bilme), Improvement (kendini geliştirme), Healing (kendini onarma) ortogonal katmanlardır. Üçü olmadan AI orkestrasyon production-grade olamaz.

7. **Provenance as First-Class Artifact** — Her AI-generated output `(workflow, agent, model, prompt-hash, EffectClass, timestamp)` provenance manifest'ine düşer. Ed25519 imzalı, audit-ready.

8. **Mode-Agnostic Discipline, Mode-Specific Calibration** — AEGIS Sprint/Task/Process üç modda aynı çekirdek ile çalışır. Mode-spesifik fark yalnızca EffectClass dağılımı + verification tier seçimi + phase emphasis.

---

## Consequences

### Olumlu

- **Kategori liderliği iddiası mümkün olur.** Deckent "yet another orchestrator" değil, **AEGIS-compliant ilk açık kaynak AI orkestratörü** olarak konumlanır. TDD/BDD/DDD/SDD/VDD/VSDD ailesinin doğal yeni üyesi, **mode-agnostic** olduğu için akademik + enterprise + open-source community'de **eşi olmayan konum**.

- **Multi-mode vizyonu (Sprint+Task+Process) tek metodoloji altında birleşir.** Process Mode ERP/business pivot'u (Sprint 200 god-level hedef) için **mevcut mimariye doğal eşleme**. Pazarlama tek mesaj: "AEGIS — discipline that works across code, life, and business."

- **Akademik citation kapısı açılır.** AEGIS makalesi (target venues: ICSE/FSE software engineering, NeurIPS multi-agent track) dollspace-gay/VSDD prior art credit + Anthropic agent harness + Constitutional AI runtime adaptation üzerine **yapısal katkı** olarak yayınlanabilir. Sprint 200 god-level GA için academic prestige multiplier.

- **Enterprise sales narrative netleşir.** "We use AEGIS methodology" enterprise CISO/CTO için tanıdık-ama-ileri sound. SOC 2 + ISO 27001 audit'larında verification tier mapping + provenance manifest **compliance evidence** olarak doğrudan kullanılabilir.

- **Community standard yaratma fırsatı.** agentskills.io tarzı agentaegis.io standard repo'su, AEGIS-compliant AI orchestrator certification, Deckent **standart belirleyici** rolü alır. Apache way "lazy consensus" + CNCF tiered graduation patterns AEGIS ekosistem governance'ına uyar.

- **Existing Deckent disiplini retroaktif olarak isimlenir.** Worker contract, ADR-036 governance, Auditor RBAC, EffectClass, Hybrid Scoring — hepsi AEGIS phase/role/artifact'larıyla **net eşleme**. Yeniden çalışma yok, sadece adlandırma + 5 yeni faz/gate (REVIEW + andon + 5-Whys + provenance + cool-down).

- **Hermes/Cursor/Devin/OpenClaw rakiplerinden mimari farklılaşma** AEGIS bayrağı altında somut tek mesaj: "Mode-agnostic, governance-enforced, adversarial-verified, multi-agent orchestration discipline." Hiçbir rakip bu kombinasyonu sunmuyor.

### Olumsuz

- **5 yeni faz/gate implementation maliyeti.** REVIEW phase MCP tool, Andon authority worker contract extension, 5-Whys ROOT-CAUSE alt-step, Provenance manifest schema + Ed25519 signing infrastructure, COOL-DOWN consolidation — Sprint 175-185 arası ~5 sprint implementation work, ~3000-5000 LoC.

- **Mode-spesifik kalibrasyon spec maliyeti.** Process Mode için BPMN-like Charter format + compliance metadata schema + Architect approval workflow yeni tasarım gerektirir. Sprint Mode'dan Process Mode'a port etmek mimari refactor (~Sprint 195+ vertical pilot).

- **TLA+ entegrasyonu TypeScript dünyasında zayıf.** `respawnEligibleTasks` + `detectScopeCollisions` için TLA+ spec yazımı + maintenance senior expertise + ekosistem dışı tooling. Tier 3 mandatory uygulaması gerçekten critical-irreversible task'lar için makul, ama TS-native alternative (Z3 binding + branded types) Sprint 195+ exploration gerektirir.

- **AEGIS adı brand çakışma riski.** "Aegis" yazılım ekosisteminde başka projelerde kullanılıyor (örn. AEGIS authenticator, çeşitli security ürünleri). Trademark araştırması Sprint 172 OSS GA öncesi şart. Alternatif aday isimler: MAVEN (Multi-Agent Verified Effect-aware orchestratioN), PRISM (Plan-Run-Inspect-Score-Memorize), OAGD (Orchestrated Adversarial Governance Discipline).

- **Methodology learning curve.** Deckent yeni kullanıcılar için mevcut 8-phase lifecycle bile dik öğrenme; AEGIS 9-phase + 3-layer + 5-role + 8-artifact + 8-principle daha da dik. Documentation site + tutorial + video walkthrough Sprint 172-175 paralel deliverable.

- **Multi-mode unified discipline iddiası provable mı?** Sprint Mode dogfood'u 170 sprint kanıt verdi; Task Mode + Process Mode için canlı kanıt **yok**. AEGIS spec teorik olarak mode-agnostic olsa da empirical validation Sprint 195+ ERP procurement vertical pilot ile gelecek. Önce Sprint Mode'da AEGIS-compliant pilot, sonra Task Mode (Sprint 185-190), sonra Process Mode (Sprint 195-200).

- **Self-Awareness Propagation (ADR-060 proposed) AEGIS'in 5-channel context enrichment adımıyla uyumlu mu test edilmeli.** ADR-060 + ADR-061 entegrasyonu proposed→accepted sürecinde paralel review.

---

## Implementation Roadmap

### Phase 0: Pre-Implementation (Sprint 170-174)
- ADR-061 review + accept (Architect onayı)
- Brand/trademark araştırması (AEGIS vs alternatif isimler)
- Manifesto draft + landing page mockup
- Documentation site structure planning

### Phase 1: Foundation (Sprint 175-180)
- Phase 5 ADVERSE explicit phase wire (mevcut Auditor → fresh-context mode + Sarcasmotron-style prompt template)
- Phase 7 REVIEW MCP tool (`deckent_review` user-facing demonstration)
- Phase 9 COOL-DOWN consolidation (DECAY + CLEANUP + RETRO merge + provenance export)
- AEGIS principle enforcement in Brain prompt enrichment

### Phase 2: Verification Stack (Sprint 181-188)
- fast-check entegrasyonu (Tier 1 PBT)
- Branded types core/types.ts'te (TaskId, SprintId, WorkerId)
- Stryker mutation testing diff-mode CI gate
- Zod schema migration `.contracts/api-surface.md` prose → schemas
- DbC assertion library + boundary insertion

### Phase 3: Provenance + Governance (Sprint 189-194)
- Provenance manifest schema v1
- Ed25519 signing infrastructure (mevcut hub Ed25519 reuse)
- Worker andon authority (proactive halt) implementation
- 5-Whys ROOT-CAUSE structured FIX phase

### Phase 4: Mode Expansion (Sprint 195-200)
- Task Mode AEGIS adaptation (Sprint 185-190 paralel)
- Process Mode ERP procurement vertical pilot (Sprint 195-200)
- TLA+ pilot: `respawnEligibleTasks` + `detectScopeCollisions` (critical-irreversible coverage)
- AEGIS-compliant skill certification spec (agentaegis.io standard draft)
- Sprint 200 god-level GA launch — AEGIS canonical methodology

### Phase 5: Ecosystem (Sprint 200+)
- Academic paper submission (ICSE 2027 / FSE 2027 / NeurIPS 2026 multi-agent track)
- agentaegis.io spec repo public
- AEGIS-compliant orchestrator certification program
- Hub plugin: AEGIS-mandatory verification tier metadata

---

## Related ADRs

- **ADR-036** — ADR Governance Integration: AEGIS Phase 2 GOVERN'in foundation, runtime ADR injection.
- **ADR-037** — RBAC Authority Matrix: AEGIS 5-rol separation of duties'in foundation.
- **ADR-038** — Dead Code Disposition + Spawn Safety: AEGIS Layer 3 HEALING içinde.
- **ADR-039** — Self-Modifying Task Detection: AEGIS Layer 1 AWARENESS içinde, dogfood discrimination.
- **ADR-040** — Nervous System: AEGIS Layer 1 AWARENESS'in çekirdeği.
- **ADR-041** — Agent Taxonomy: AEGIS 5-rol + Workers içinde 15 vertical agent + 21 horizontal skill.
- **ADR-042** — Hybrid Mode Architecture (proposed): AEGIS mode applicability'nin foundation, Sprint+Task+Process toggle.
- **ADR-043** — Brain Crash Recovery: AEGIS Layer 3 HEALING içinde.
- **ADR-044** — Sprint State Observability Contract: AEGIS Layer 1 AWARENESS içinde.
- **ADR-045** — Wave-Based Execution: AEGIS Phase 3 SPAWN içinde Kahn topological.
- **ADR-046** — Brain Self-Update Hook: AEGIS Phase 9 COOL-DOWN içinde provenance + memory update.
- **ADR-047** — Manuel Subagent Dispatch: AEGIS Layer 3 HEALING içinde, kritik kırık recovery.
- **ADR-048** — Prompt Lifecycle Contract: AEGIS Phase 3 SPAWN + Phase 9 COOL-DOWN cleanup contract.
- **ADR-053** — TaskType Taxonomy (proposed): AEGIS Phase 2 GOVERN içinde EffectClass classification dependency.
- **ADR-055** — Hybrid Scoring 5-Layer (proposed): AEGIS Phase 6 EVALUATE'in canonical implementation.
- **ADR-060** — Self-Awareness Propagation (proposed): AEGIS Layer 1 AWARENESS 5-channel context enrichment specification.

**Prior art credit:**
- **dollspace-gay/VSDD** — Adversarial verification via fresh-context critique pattern (AEGIS Phase 5 ADVERSE inheritance).
- **dollspace-gay/VDD** — Builder-Adversary separation foundation.
- **Anthropic** — Building Effective Agents + Effective Harnesses for Long-Running Agents (AEGIS lifecycle pattern source).
- **Madaan et al** — Self-Refine (AEGIS Mid-Sprint Adapter pattern source).
- **Bai et al / Anthropic** — Constitutional AI (AEGIS runtime ADR governance source).
- **Lightman et al / OpenAI** — PRM "Let's Verify Step by Step" (AEGIS Phase 6 EVALUATE Hybrid Scoring source).
- **Hong et al** — MetaGPT role-based SOP encoding (AEGIS 5-role separation parallel).
- **Wang et al** — Voyager skill library (AEGIS skill registry promotion-pipeline parallel).
- **Du et al** — Multi-Agent Debate (AEGIS Phase 1 SHAPE optional N-planner debate source).
- **OpenSSF** — SLSA build provenance (AEGIS provenance manifest source).
- **Toyota Production System** — Jidoka/Andon (AEGIS Phase 4 EXECUTE worker andon authority source).
- **Google SRE** — Error budgets + blameless postmortems (AEGIS Phase 1 SHAPE error-budget gate source).
- **Shape Up (Basecamp)** — Cool-down framing (AEGIS Phase 9 COOL-DOWN naming source).
- **Adzic** — Specification by Example (AEGIS Charter Given/When/Then formalization source).

---

## Notes

### Naming Rationale

**AEGIS** seçimi şu kriterlere dayanır:

1. **Mode-agnostic** — "Sprint" / "Code" / "Test" gibi mode-specific terim içermez. Sprint Mode + Task Mode + Process Mode üçü için aynı geçerli.
2. **Acronym açılımı disipline foundational** — Agentic (AI agent-native) + Effect-Governed (EffectClass + ADR governance) + Iterative (lifecycle loops) + Stewardship (multi-role responsibility, Brain orchestrates, Auditor watches, Nervous heals).
3. **Yunan mitoloji çağrışımı** — Athena'nın kalkanı (shield) — Reversibility Layer + Self-Healing + RBAC discipline'ın doğal sembolü. Marka için güçlü hikaye.
4. **5 harf, kolay söylenir, akılda kalır** — Marketing/launch için kritik.
5. **TDD/BDD/DDD/SDD/VDD/VSDD ailesinden çıkar ama doğal evrim** — Acronym pattern bozulur (XDD değil), bu da "yeni kategori" mesajı verir.

**Trademark riski:** "Aegis" yazılım dünyasında çeşitli security/auth ürünlerinde kullanılıyor (AEGIS authenticator, AEGIS encryption library, vb). Sprint 172 OSS GA öncesi:
- USPTO/EUIPO trademark araştırması
- "Agentic Effect-Governed Iterative Stewardship" full-name explicit claim ile çakışma azaltılır
- Domain araştırması: aegis.dev / agentaegis.io / aegis-method.org

**Alternatif isim adayları (Architect final kararı için):**

| Aday | Açılım | Avantaj | Dezavantaj |
|------|--------|---------|------------|
| **AEGIS** (önerilen) | Agentic Effect-Governed Iterative Stewardship | Mode-agnostic, mitolojik metafor, 5 harf | Trademark çakışma riski |
| **MAVEN** | Multi-Agent Verified Effect-aware orchestratioN | "Expert" connotation, friendly | Apache Maven brand confusion |
| **PRISM** | Plan-Run-Inspect-Score-Memorize | Phase-as-acronym, mode-agnostic | Generic, çok proje var |
| **OAGD** | Orchestrated Adversarial Governance Discipline | TDD/BDD ailesinden, akademik | Söylenmesi zor (oh-ay-jee-dee) |
| **HELIX** | Hybrid Effect-aware Lifecycle with Iterative eXamination | Spiral metafor, görsel | "X" zorlama, kelime uzun |

### Geç-ADR Pattern Devam Ediyor

ADR-053 ve ADR-055 gibi, ADR-061 de **mevcut Deckent disiplinin retroaktif belgelenmesi + ileriye dönük formal extension'ı**. Implementasyon önce yazıldı (Brain-Worker-Auditor + 50+ ADR + 14+ self-* layer), AEGIS bunlara isim verir + 5 yeni faz/gate ekler. Sprint 156 dogfood pratiğine göre bu geç-ADR pattern'i kabul edilebilir.

İleride tercih edilen sıra: ADR proposed → Architect review → ADR accepted → Implementation Sprint task'ları. AEGIS için bu sıra Sprint 175 itibarıyla uygulanır.

### Open Source Standard İddiası

Sprint 200 god-level GA sonrası AEGIS'in **agentskills.io tarzı açık standart** repo'sunu açmak (agentaegis.io draft) Deckent'i ekosistem-shaping rolüne taşır. CNCF Sandbox başvurusu, OpenSSF Best Practices Badge, MIT/Apache 2.0 license üçlüsü ile **vendor-neutral standart** iddiası mümkün. Bu Sprint 200+ Phase 5 Ecosystem roadmap'inde detaylanır.

### AEGIS vs VSDD Karşılaştırma Özeti

| Boyut | dollspace-gay/VSDD | AEGIS |
|-------|-------------------|-------|
| Scope | Solo developer workflow | Multi-mode (Sprint/Task/Process) AI orchestration |
| Phases | 6 (Spec/TDD/Adverse/Feedback/Formal/Convergence) | 9 (Shape/Govern/Spawn/Execute/Adverse/Evaluate/Review/Fix/Cool-down) |
| Roles | 4 (Architect/Builder/Tracker/Adversary) | 5 (Architect/Brain/Workers/Auditor/Nervous) |
| Memory | Ephemeral (per session) | Persistent (memory.db + decay + FTS) |
| Governance | Spec supremacy | ADR runtime enforcement (ADR-036) |
| Multi-agent | Builder vs Adversary 1:1 | Brain-Workers-Auditor-Nervous N:N |
| Mode | Single (developer) | Three (code/task/process) |
| Provenance | Implicit (git) | Explicit (signed manifest) |
| Self-* layers | Yok | 3 katman (Awareness/Improvement/Healing) |
| Process scale | Single dev | Sprint + organization |

AEGIS VSDD'nin **superset'idir** — VSDD prensiplerinin çoğunu (adversarial verification, fresh-context critique, spec supremacy, anti-slop bias, formal hardening) içerir + multi-agent orchestration + multi-mode + persistent memory + governance layer + self-* triad ekler.

---

**İmza (proposed):** Brain (orchestrator)
**Diriliş:** Sprint 175 implementation Phase 1 başlangıç ile birlikte canonical
**Sonraki revize:** Sprint 200 god-level GA sonrası empirical validation feedback ile v2.0
