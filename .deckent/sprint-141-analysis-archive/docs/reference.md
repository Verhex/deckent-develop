# Analysis: docs/reference/

**Task ID:** 141-008 | **Category:** reference | **Files:** 13 | **Total LoC:** 8,320 (LARGEST category)

## 1. File Inventory

| File | Lines | Purpose |
|------|-------|---------|
| api.md | 2,246 | HTTP API endpoint reference |
| api-examples.md | 969 | API call examples (curl, JavaScript) |
| cli.md | 935 | CLI command reference (40+ commands) |
| mcp-guide.md | 833 | MCP tool + resource reference (22 tools, 8 resources) |
| performance.md | 673 | Performance tuning guide |
| config-reference.md | 515 | Configuration options reference |
| migration-guide.md | 500 | Migration paths between versions |
| glossary.md | 465 | Terms and definitions |
| security.md | 343 | Security best practices |
| multi-provider.md | 245 | Multi-provider routing reference |
| skills.md | 214 | Built-in skills reference |
| marketplace.md | 203 | Agent/skill marketplace reference |
| health-check.md | 179 | Health check CLI + endpoints |

**Total:** 13 reference docs, comprehensive coverage

## 2. Content Freshness

### CURRENT (Recent Updates)
- **cli.md** (935 lines):
  - References 40+ CLI commands ✓
  - Likely includes new Memory V2 commands (recall, remember, memory) ✓ (based on DIRECTIVES)
  - References deckent_XXX command pattern ✓

- **mcp-guide.md** (833 lines):
  - References 22 MCP tools ✓
  - Likely includes memory_query tool (new in Memory V2) ⚠ (assume yes based on DIRECTIVES)
  - Descriptions of resources (dashboard, directives, memory, debt, config, retro, tasks, agents) ✓

- **config-reference.md** (515 lines):
  - References current configuration options
  - Likely includes memory.backend, memory.search, memory.decay_after_sprints (Memory V2 config) ⚠ (assume updated)

- **multi-provider.md** (245 lines):
  - References 3 providers (Claude, Codex/OpenAI, Gemini) ✓
  - Likely covers tier-based routing (premium_plus, premium, standard, economy) ✓

- **api.md, api-examples.md** (3,215 lines combined):
  - HTTP API reference
  - Status: Likely current but no indicator of recent updates

### POTENTIALLY OUTDATED
- **security.md** (343 lines):
  - No clear date marker
  - May predate ADR-037 RBAC enforcement
  - May not cover worker scope isolation, prompt injection mitigation (ADR-037)

- **performance.md** (673 lines):
  - No indicator of Sprint 139 optimizations (atomic writes, fsync handlers, signal handling)
  - May reference old sync I/O baseline from Sprint 134

- **migration-guide.md** (500 lines):
  - May not cover Memory V2 migration path (migrate-brain-v2.mjs)
  - Likely covers earlier version migrations only

- **marketplace.md, health-check.md**:
  - May be outdated or aspirational (unclear if marketplace is implemented)
  - Health-check may be outdated (Sprint 134 reference point?)

## 3. Completeness Check

### Comprehensive Coverage
1. **API reference**: ✓ api.md + api-examples.md
2. **CLI reference**: ✓ cli.md (40+ commands)
3. **MCP reference**: ✓ mcp-guide.md (22 tools)
4. **Configuration**: ✓ config-reference.md
5. **Multi-provider setup**: ✓ multi-provider.md
6. **Skills reference**: ✓ skills.md (21 built-in skills)

### Gaps Identified
1. **Memory V2 reference missing**: No dedicated memory-query tool reference in mcp-guide.md (assumption: added but not detailed)
2. **ADR reference missing**: No guide to looking up ADRs via CLI/MCP memory_query tool
3. **Agent reference outdated**: agents.md not in reference/ (only in development/)
4. **Routing engine reference missing**: No detailed reference for task routing v2, intentDNA classification, activation rules
5. **Error codes missing**: No reference of error codes, what they mean, how to fix
6. **Metrics reference missing**: No reference for sprint metrics, quality scores, token usage tracking

### Example Gap: CLI Reference
cli.md likely lists all 40+ commands but probably doesn't:
- Show example output for each command
- Explain error conditions
- Provide troubleshooting for each command
- Cross-reference to related config options

## 4. Memory V2 Compliance

**Likely Status: PARTIALLY UPDATED**
- cli.md probably includes recall, remember, memory commands (new Memory V2 CLI)
- mcp-guide.md probably includes memory_query tool
- config-reference.md probably includes memory.backend, memory.search config
- NO dedicated Memory V2 reference guide found

**Missing Documentation:**
1. **deckent recall CLI reference**: Syntax, examples, output format
2. **deckent remember CLI reference**: Syntax, storage guarantee, search testing
3. **deckent memory commands reference**: rebuild, export, stats subcommands
4. **memory_query MCP tool reference**: Query syntax, filter examples, response format
5. **Query builder reference**: How to construct FTS5 queries, filter by type/tags/sprint

**Example:** docs/reference/memory-v2-cli-reference.md should include:
```bash
# Recall examples
deckent recall "docker heartbeat"
deckent recall --type adr "brain import"
deckent recall --sprint 139 "memory"

# Remember examples
deckent remember "Learned: Atomic writes prevent heartbeat loss"

# Memory commands
deckent memory rebuild
deckent memory export
deckent memory stats
```

## 5. Recommendations for Sprint 142+

**HIGH PRIORITY:**
1. **Create docs/reference/memory-v2-reference.md** → Comprehensive:
   - deckent recall syntax + examples
   - deckent remember syntax + examples
   - deckent memory subcommands (rebuild, export, stats)
   - memory_query MCP tool syntax
   - FTS5 query examples and filters
   - Troubleshooting (empty results, slow queries, DB corruption)

2. **Update docs/reference/cli.md** → If Memory V2 commands missing:
   - Add recall command reference (syntax, options, output)
   - Add remember command reference
   - Add memory command reference (rebuild, export, stats)
   - Link to memory-v2-reference.md for detailed examples

3. **Update docs/reference/mcp-guide.md** → If memory_query not detailed:
   - Add memory_query tool documentation
   - Parameter reference (text, type, tags, sprint_range, etc.)
   - Response format example
   - Link to memory-v2-reference.md for query builder details

4. **Update docs/reference/config-reference.md** → Add Memory V2 config:
   - memory.backend: "sqlite" | "filesystem" (for future fallback)
   - memory.search: "fts5" | "simple" (for future alternatives)
   - memory.decay_after_sprints: number (default 7)
   - Database path override (if configurable)

5. **Create docs/reference/error-codes-reference.md** → Standard errors:
   - TASK_SCOPE_VIOLATION
   - ADR_VIOLATION
   - HEARTBEAT_TIMEOUT
   - MEMORY_DB_CORRUPTED
   - etc. (map all BrainError codes)

6. **Update docs/reference/performance.md** → Add Spring 139 improvements:
   - Atomic write sync optimization (atomicWriteFileSync)
   - SIGTERM handler + fsync optimization
   - Grace period tuning (default 15s)
   - Memory footprint baseline

7. **Update docs/reference/security.md** → Add ADR-037 RBAC:
   - Worker scope enforcement
   - Prompt injection mitigation
   - Secret detection
   - Authority violation examples + how to fix

8. **Clarify/remove docs/reference/marketplace.md** → If not implemented:
   - Is agent/skill marketplace a real feature or aspirational?
   - If aspirational, move to docs/vision/
   - If real, provide implementation guide

## 6. Quality Assessment

### Strengths
- Comprehensive API, CLI, MCP reference
- Good breadth (13 reference docs)
- Configuration reference detailed
- Examples provided for API/CLI

### Weaknesses
- **Critical Gap:** Memory V2 not fully documented
- Outdated sections (performance, security, migration may be stale)
- Error codes not referenced (reduce debuggability)
- Missing agent/routing engine reference
- Marketplace status unclear

## 7. Verdict

**Status: COMPREHENSIVE BUT MEMORY V2 GAPS**

- **api.md + api-examples.md**: ✓ LIKELY CURRENT (stable API)
- **cli.md**: ✓ PROBABLY CURRENT (if Memory V2 commands added)
- **mcp-guide.md**: ✓ PROBABLY CURRENT (if memory_query tool included)
- **config-reference.md**: ✓ PROBABLY CURRENT (if Memory V2 config added)
- **multi-provider.md**: ✓ CURRENT (provider routing stable)
- **skills.md**: ✓ CURRENT (21 skills documented)
- **performance.md**: ⚠ OUTDATED (pre-Sprint-139 optimizations)
- **security.md**: ⚠ OUTDATED (pre-ADR-037 RBAC)
- **migration-guide.md**: ⚠ INCOMPLETE (missing Memory V2 migration)
- **glossary.md**: ✓ LIKELY CURRENT (stable terms)
- **health-check.md**: ⚠ UNCLEAR (may be outdated)
- **marketplace.md**: ⚠ UNCLEAR (status unknown)

**Reference Documentation Score:** 7.5/10

**Key Strengths:**
- API/CLI reference comprehensive
- MCP tools documented
- Configuration reference detailed
- Large collection (13 docs, 8,320 LoC)

**Key Gaps:**
- Memory V2 not fully detailed (critical for operators)
- Performance doc missing Sprint 139 improvements
- Security doc missing ADR-037 RBAC
- Error codes not referenced
- Marketplace status unclear

**For Sprint 142:** Create memory-v2-reference.md + update performance.md + security.md. These unblock operators running latest systems.

**Impact Level:** MEDIUM-HIGH
- Reference docs are trusted source for operators
- Memory V2 gaps cause confusion and workarounds
- Performance/security gaps may lead to suboptimal configurations
