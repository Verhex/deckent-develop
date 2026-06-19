---
doc_rank: 50
status: active
last_updated: 2026-06-04
content_hash: sha256:c7dea2b48fc27c15569c62d43e525edad14a4a3bb1bf4b2f2d9851857d0c6f55
---

# System Architect Skill

## Registry Pattern
When designing a centralized data store (models, agents, skills, providers):

```typescript
// Single source of truth
interface RegistryEntry {
  id: string;
  // ... all metadata in one place
}

class Registry<T extends RegistryEntry> {
  private entries = new Map<string, T>();
  
  register(entry: T): void;          // Add at runtime
  get(id: string): T | undefined;    // Lookup
  getAll(): T[];                     // List all
  filter(predicate: (e: T) => boolean): T[]; // Query
}

// Singleton export
export const registry = new Registry<ModelDefinition>();
```

**Rules:**
- All metadata lives in the registry entry, not scattered across files
- Consumers query the registry, never hard-code values
- New entries = 1 object added, 0 other files changed
- Runtime-extensible via register()

## Config Schema Evolution
When evolving config schemas:

1. **Add new fields alongside old** (never rename in-place)
2. **Migration function** reads old → writes new
3. **loadConfig()** transparently handles both versions
4. **Deprecation timeline:** warn → ignore → remove (3 major versions)

```typescript
// Good: additive migration
if (config.haiku_allowed !== undefined && config.min_tier === undefined) {
  config.min_tier = config.haiku_allowed ? 'economy' : 'standard';
}
```

## Tier-Based Abstraction
When abstracting across providers:

- Never hard-code provider-specific model names in business logic
- Use tier (premium/standard/economy) as the abstraction layer
- Registry resolves tier → concrete model per provider
- User config specifies tiers, not model names (unless overriding)

## Backward Compatibility Checklist
Before any breaking change:

- [ ] Old config fields still parsed (migration handles them)
- [ ] Old function signatures still exported (delegate to new implementation)
- [ ] Old type aliases still available (marked @deprecated)
- [ ] Tests cover both old and new paths
- [ ] Migration creates backup before writing

## Anti-Patterns to Avoid
- Scattering metadata across files instead of one registry entry — a new model/agent/skill should be one object added, zero other files touched.
- Hardcoding provider-specific model names in business logic — abstract through tiers; let the registry resolve tier → concrete model.
- Renaming config fields in place — add the new field, migrate old→new, keep parsing both across a deprecation window.
- Breaking an exported signature with no delegating shim — keep the old signature, forward to the new implementation, mark `@deprecated`.
- Designing for hypothetical future scale — solve today's requirement; extensibility you don't need is complexity you pay for now.
- One module owning many reasons to change — split by business concern so each module has a single axis of change.
- A breaking change with no migration or backup step — write the migration and snapshot before mutating persisted state.

## Karpathy Notes
- **Think before coding:** Identify the single source of truth and the dependency direction before writing modules. Architecture is mostly deciding what depends on what.
- **Simplicity first:** Prefer a registry plus tier abstraction over bespoke per-provider branches. The simplest design that preserves backward compatibility wins.
- **Goal-driven:** Every abstraction layer must make the call-site simpler. If it only adds indirection, collapse it.
