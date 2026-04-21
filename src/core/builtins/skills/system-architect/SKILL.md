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
