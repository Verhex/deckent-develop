# Analysis: docs/development/

**Task ID:** 141-008 | **Category:** development | **Files:** 6 | **Total LoC:** 2,737

## 1. File Inventory

| File | Lines | Purpose |
|------|-------|---------|
| plugin-guide.md | 731 | Plugin architecture guide |
| worker-guide.md | 707 | Worker execution, heartbeat, result format |
| troubleshooting.md | 664 | Common issues + resolution paths |
| dashboard-guide.md | 258 | React dashboard development |
| brain-guide.md | 218 | Brain orchestrator internal workings |
| agent-guide.md | 159 | Agent specialization + prompt engineering |

**Last Updated:** Inferred from content references:
- References ADR-037 (authority matrix) → recent
- References Memory V2 (db-first) in context → some files recently touched
- Some sections may predate latest changes

## 2. Content Freshness

### CURRENT (Recent References)
- **worker-guide.md**:
  - References `.tasks/task-XXX.json` format ✓
  - Describes heartbeat format (status, sequence, timestamp) ✓
  - References ADR-035 verification protocol ✓
  - References ADRs as mandatory constraints injected into prompt ✓
  - **BUT:** No mention of Memory V2 MemoryStore in prompt context

- **troubleshooting.md**:
  - References .brain/ structure
  - "Sprint Takildi (Stuck)" section with kill/cleanup steps ✓
  - References Docker backend issues (Spring 135 related) ✓
  - References MCP tool usage examples ✓

- **brain-guide.md**:
  - References MemoryStore queries ✓
  - References ADRs via DB: `store.getByType('adr')` ✓
  - Shows Memory V2 patterns ✓

- **dashboard-guide.md**:
  - React + Vite + Tailwind
  - References WebSocket for real-time updates
  - i18n support mentioned

### OUTDATED / INCOMPLETE
- **plugin-guide.md**: 
  - References plugin system but unclear if this is implemented or aspirational
  - No clear example of actual plugin (custom agent, custom skill)
  - No reference to .deckent/agents/ or .deckent/skills/ manifest format

- **agent-guide.md**: 
  - Very short (159 lines) — covers agent selection but not full lifecycle
  - No mention of agent evolution/promotion pipeline (Sprint 139)
  - No mention of LRU eviction (max 50 temp agents, max 5 sprint age)
  - Missing: agent performance tracking (successRate, totalUses)

## 3. Completeness Check

### Developer Experience Gaps
1. **Memory V2 integration guide missing**: No doc showing workers how to query MemoryStore, use recall/remember CLI, access MCP memory_query tool
2. **Agent evolution not documented**: How do temp agents become permanent? What criteria? No guide.
3. **Plugin system unclear**: Plugin-guide.md exists but doesn't clearly define what a plugin is or how to create one
4. **Skill creation guide missing**: Skillpool exists but no step-by-step guide for custom skills
5. **MCP tool development missing**: No guide for creating custom MCP tools

### Example Gap: Worker Guide
Worker-guide.md says:
```
"ADRs are injected into your prompt automatically from `.brain/memory.db` — they are mandatory constraints"
```
But does NOT explain:
- HOW are ADRs injected? (Brain reads from DB, includes in prompt)
- Which ADRs are selected? (Relevant ones via taskDNA)
- How to reference them in worker response? (Copy-paste from prompt)
- What happens if worker violates ADR? (NO_GO + require amendment)

### Test Coverage Gap
- No guide for workers on test-writing strategy
- No guide on coverage expectations (when to write unit vs integration tests)
- No guide on mocking MemoryStore in tests

## 4. Memory V2 Compliance

**Current State: PARTIAL**
- brain-guide.md mentions MemoryStore and store.getByType()
- No Memory V2 tutorial or getting-started guide
- No example queries
- No troubleshooting for Memory V2 (how to check .brain/memory.db integrity, what to do if corrupted)

**Missing:**
1. Quick start: "First time using Memory V2? Here's how to query..."
2. Migration guide: "Upgrading from V1 memory? Here's what changed..."
3. Troubleshooting: "Memory queries returning empty results? Check these things..."
4. Performance: "FTS5 is slow for certain queries? Try this..."

## 5. Recommendations for Sprint 142+

**HIGH PRIORITY:**
1. **Create docs/development/memory-v2-developer-guide.md** → Step-by-step:
   - How workers get MemoryStore context (Brain injected via prompt)
   - How to query using recall CLI: `deckent recall "docker heartbeat"`
   - How to remember: `deckent remember "learned: docker SIGTERM needs grace period"`
   - Example FTS5 queries (searching by type, sprint range, tags)
   - Troubleshooting (DB corruption, rebuild, export verification)

2. **Create docs/development/agent-evolution-guide.md** → How agents grow:
   - Temp agents (created during sprint, single-use)
   - Permanent agents (promoted after repeated success)
   - LRU eviction (50 temp limit, 5 sprint age limit)
   - Performance tracking (successRate, totalUses)
   - Promotion criteria and process

3. **Create docs/development/skill-creation-guide.md** → Custom skills:
   - Skill manifest format (skill.json structure)
   - Sandbox AST validation (what's allowed, what's blocked)
   - Step-by-step example (create security-checklist skill)
   - Testing skills
   - Publishing/promotion process

4. **Expand plugin-guide.md** → Clarify what plugins are:
   - Current: plugin system may be aspirational
   - Clarify: are plugins = custom agents + custom skills?
   - If plugin system exists: step-by-step example
   - If not: remove or mark as "Future work"

5. **Add Memory V2 troubleshooting section to troubleshooting.md**:
   - "Memory queries returning empty results" → check FTS5 index
   - "Memory DB corrupted" → rebuild from exports
   - "Can't find ADR XXX" → check .brain/exports/decisions.md was imported

## 6. Quality Assessment

### Strengths
- worker-guide.md is clear and actionable
- troubleshooting.md covers common issues
- brain-guide.md shows Memory V2 patterns
- Task JSON format well-documented

### Weaknesses
- **Incomplete:** agent-guide.md is too brief
- **Unclear:** plugin-guide.md system not fully explained
- **Outdated:** No Memory V2 developer guide
- **Missing:** Skill creation guide
- **Gaps:** Agent evolution, LRU eviction, performance tracking

## 7. Verdict

**Status: PARTIALLY CURRENT WITH GAPS**

- **worker-guide.md**: ✓ CURRENT (task format, heartbeat, ADR constraints clear)
- **troubleshooting.md**: ✓ CURRENT (good coverage of common issues)
- **brain-guide.md**: ✓ CURRENT (Memory V2 patterns shown)
- **dashboard-guide.md**: ✓ CURRENT (React dev explained)
- **plugin-guide.md**: ⚠ UNCLEAR (system definition missing)
- **agent-guide.md**: ⚠ PARTIAL (too brief, agent evolution missing)

**Development Documentation Score:** 6.5/10

**Key Gaps:**
1. No Memory V2 developer guide (workers don't understand how to query memory)
2. Agent evolution not documented (confuses pool management)
3. Plugin system unclear (developers don't know if/how to create plugins)
4. Skill creation guide missing (blocks custom skill development)

**Actionability:** Medium
- Existing guides (worker, troubleshooting) are actionable
- Missing guides (memory, agent evolution, skills) block advanced use cases
- New developers will struggle with Memory V2 integration

**For Sprint 142:** Prioritize Memory V2 developer guide + agent evolution guide. These unblock worker capability expansion.
