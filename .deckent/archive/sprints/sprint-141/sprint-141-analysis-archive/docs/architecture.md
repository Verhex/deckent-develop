# Analysis: docs/architecture/

**Task ID:** 141-008 | **Category:** architecture | **Files:** 6 | **Total LoC:** 3,662

## 1. File Inventory

| File | Lines | Status |
|------|-------|--------|
| architecture.md | 1,402 | Main architecture overview |
| agent-skill-architecture.md | 669 | Agent + skill routing + pooling |
| sprint-lifecycle.md | 590 | 8-phase sprint lifecycle |
| authority-matrix.md | 544 | ADR-037 Brain-Auditor-Worker RBAC |
| memory-system.md | 283 | 3-tier memory (FILE-BASED, OUTDATED) |
| agents.md | 174 | Agent list + specializations |

**Last Updated:** Dates not in filenames, but cross-references to recent ADRs (ADR-037, ADR-039) suggest updates within last 2-4 sprints.

## 2. Content Freshness

### CURRENT (References Recent Architecture)
- **architecture.md**: Comprehensive overview covering:
  - orchestra/ (Sprint controller, task router, etc.) ✓
  - core/ (Types, config, routing engine) ✓
  - agents/ + skills/ (Pool managers, registries) ✓
  - providers/ (Multi-provider routing) ✓
  - CLI/MCP/dashboard ✓
  - References ADR-028, ADR-037 ✓

- **agent-skill-architecture.md**: Covers:
  - Agent pooling (LRU, temp agents) ✓
  - Skill registry + AST sandbox validation ✓
  - Task routing (Layer 1-3: intent, activation, routing) ✓
  - References ADR-015, routing-engine.ts ✓

- **sprint-lifecycle.md**: Describes 8 phases:
  - PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP ✓
  - References task JSON format, heartbeat files ✓

- **authority-matrix.md**: ADR-037 RBAC documentation:
  - Brain authority scopes ✓
  - Auditor authority scopes ✓
  - Worker authority scopes ✓
  - Scope enforcement rules ✓

### OUTDATED (Pre-Memory V2)
- **memory-system.md**: 
  - Describes 3-tier file-based memory (MEMORY.md, PATTERNS.md, DECISIONS.md)
  - Line 8-23: ".brain/ directory" diagram showing old structure
  - Line 27-60: Tier 1 MEMORY.md (max 200 lines, decay after 5 sprints)
  - NO reference to `.brain/memory.db`
  - NO reference to SQLite, FTS5, turkishNormalize
  - NO reference to Memory V2 import/export pipeline
  - **Status: CRITICAL UPDATE NEEDED**

- **agents.md**: 
  - Simple list of 16 agents (security-auditor, test-writer, etc.)
  - No reference to agent LRU eviction, temp agent lifecycle (Sprint 138+)
  - No reference to agent evolution/promotion pipeline (Sprint 139)

## 3. Completeness Check

### Architecture Coverage
1. **Module-level architecture**: ✓ Well documented (orchestra/, core/, agents/, etc.)
2. **Data flow**: ✓ Described in sprint-lifecycle, task routing
3. **Authority & RBAC**: ✓ authority-matrix.md covers ADR-037
4. **Memory architecture**: ✗ OUTDATED — missing Memory V2 DB schema, FTS5, import/export
5. **Agent/skill lifecycle**: PARTIAL — pooling documented, but evolution/promotion pipeline (Sprint 139 ADR-038 related) not detailed
6. **Provider multi-tenancy**: MISSING — No dedicated doc for multi-provider routing, fallback chains, provider health

### Specific Gaps
- **No Container Architecture**: Docker backend (Sprint 135) referenced in code but no architecture doc explaining container lifecycle, heartbeat over shared volumes, graceful shutdown
- **No Memory V2 Architecture**: Despite Memory V2 being live, no dedicated architecture doc for MemoryStore, FTS5 indexing, decay mechanics
- **No Performance Architecture**: No doc explaining sync I/O strategy, token counter integration, usage thresholds
- **No Security Architecture**: No dedicated architecture covering prompt injection mitigation (ADR-037), worker scope enforcement, secret detection

## 4. Memory V2 Compliance

**Current State: FAILED**
- memory-system.md is outdated and misleading
- No architecture doc for Memory V2
- No schema documentation
- No description of MemoryStore class, FTS5 dual-layer search, turkishNormalize

**What's Missing:**
1. Database schema diagram (5 tables + FTS5)
2. Query path documentation (DB read flow vs .md export generation)
3. Decay mechanics (soft delete, timeline management)
4. Import/export roundtrip guarantee
5. Backup/recovery strategy

## 5. Recommendations for Sprint 142+

**HIGH PRIORITY:**
1. **Rewrite docs/architecture/memory-system.md** → Replace with Memory V2 DB-first architecture. Include:
   - SQLite schema (5 tables + FTS5)
   - Query patterns (searchMemory(), getByType(), decay())
   - Export generation (summary.md, decisions.md, memory.md, debt.md)
   - Migration strategy (one-time migrate-brain-v2.mjs)
   - Backup/recovery

2. **Create docs/architecture/memory-v2-design.md** → Detailed design covering:
   - MemoryStore class API
   - FTS5 dual-layer search (original + turkishNormalize)
   - Entry types (adr, memory, sprint, debt, pattern, retro, identity)
   - Relations (references, supersedes, caused_by, etc.)
   - Decay algorithm

3. **Create docs/architecture/provider-routing.md** → Multi-provider architecture:
   - Provider adapter interface
   - Tier-based routing (premium_plus, premium, standard, economy)
   - Fallback chains
   - Provider health monitoring

4. **Create docs/architecture/container-architecture.md** → Docker backend:
   - Worker spawn → task claim → execution → result write
   - Heartbeat mechanism (shared volume .hb files)
   - Signal handling (SIGTERM graceful shutdown)
   - Resource limits

5. **Update docs/architecture/agent-skill-architecture.md** → Add:
   - Agent evolution/promotion pipeline (temp → permanent)
   - Skill sandbox AST validation
   - Agent performance tracking (successRate, totalUses)

## 6. Quality Assessment

### Strengths
- Clear organization (separate docs for lifecycle, authority, agents)
- References to ADRs provide traceability
- Diagrams help visualize module structure
- Sprint lifecycle well-explained (8 phases)

### Weaknesses
- **Critical:** memory-system.md is dangerously outdated
- Assumes reader knowledge of TypeScript/ESM
- No visual architecture diagrams (flow charts, entity relationships)
- Missing operational architecture (deployment, monitoring, recovery)

## 7. Verdict

**Status: PARTIALLY CURRENT WITH CRITICAL GAPS**

- **architecture.md**: ✓ CURRENT (module overview good, but no Memory V2)
- **agent-skill-architecture.md**: ✓ CURRENT (routing well-explained)
- **sprint-lifecycle.md**: ✓ CURRENT (8-phase model accurate)
- **authority-matrix.md**: ✓ CURRENT (ADR-037 well-documented)
- **memory-system.md**: ❌ OUTDATED (3-tier file model, no Memory V2)
- **agents.md**: ⚠ PARTIAL (list outdated, missing agent lifecycle)

**Architecture Documentation Score:** 6/10 (good coverage of core modules, CRITICAL memory-system.md outdated, missing provider/container/performance architecture)

**Risk Level:** MEDIUM-HIGH
- New contributors will read memory-system.md and be confused by outdated 3-tier model
- No documentation of Memory V2 query patterns could lead to misuse (direct .md parsing instead of MemoryStore)
- Missing container architecture limits Docker deployment understanding

**Action Required:** Rewrite memory-system.md + create Memory V2 design doc before next sprint of heavy memory operations.
