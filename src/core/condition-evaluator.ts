// ─── Condition Evaluator ─────────────────────────────────────────────────────
// Path-based condition engine for activation rules.
// Evaluates structured conditions against arbitrary nested objects (TaskDNA).

// ─── Path Resolution ────────────────────────────────────────────────────────

/**
 * Resolve a dot-separated path on an object.
 * "intent.primary" on { intent: { primary: "security" } } → "security"
 */
export function resolvePath(obj: unknown, path: string): unknown {
  if (obj == null || path === '') return undefined;
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ─── Condition Evaluation ───────────────────────────────────────────────────

/**
 * Evaluate a set of conditions against a data object.
 * All conditions must match (implicit AND at top level).
 *
 * Condition formats:
 *   { "path": "value" }              — exact match
 *   { "path": { "$gt": 5 } }        — greater than
 *   { "path": { "$gte": 5 } }       — greater than or equal
 *   { "path": { "$lt": 5 } }        — less than
 *   { "path": { "$lte": 5 } }       — less than or equal
 *   { "path": { "$contains": "x" } } — array/string contains
 *   { "path": { "$in": ["a","b"] } } — value is in array
 *   { "path": { "$not": "x" } }      — not equal
 *   { "$and": [cond1, cond2] }       — explicit AND
 *   { "$or": [cond1, cond2] }        — explicit OR
 */
export function evaluateCondition(
  data: Record<string, unknown>,
  condition: Record<string, unknown>,
): boolean {
  for (const [key, expected] of Object.entries(condition)) {
    // Logical operators
    if (key === '$and') {
      if (!Array.isArray(expected)) return false;
      for (const sub of expected) {
        if (!evaluateCondition(data, sub as Record<string, unknown>)) return false;
      }
      continue;
    }
    if (key === '$or') {
      if (!Array.isArray(expected)) return false;
      let anyMatch = false;
      for (const sub of expected) {
        if (evaluateCondition(data, sub as Record<string, unknown>)) {
          anyMatch = true;
          break;
        }
      }
      if (!anyMatch) return false;
      continue;
    }

    // Path-based condition
    const actual = resolvePath(data, key);

    if (!matchValue(actual, expected)) return false;
  }
  return true;
}

// ─── Value Matching ─────────────────────────────────────────────────────────

function matchValue(actual: unknown, expected: unknown): boolean {
  // Operator object
  if (expected != null && typeof expected === 'object' && !Array.isArray(expected)) {
    const ops = expected as Record<string, unknown>;
    // Check if it has operator keys
    const keys = Object.keys(ops);
    if (keys.length > 0 && keys.every(k => k.startsWith('$'))) {
      return evaluateOperators(actual, ops);
    }
    // Not an operator object — exact deep match (for nested objects)
    return JSON.stringify(actual) === JSON.stringify(expected);
  }

  // Array — exact match
  if (Array.isArray(expected)) {
    return JSON.stringify(actual) === JSON.stringify(expected);
  }

  // Primitive — exact match
  return actual === expected;
}

function evaluateOperators(actual: unknown, ops: Record<string, unknown>): boolean {
  for (const [op, operand] of Object.entries(ops)) {
    switch (op) {
      case '$gt':
        if (typeof actual !== 'number' || typeof operand !== 'number') return false;
        if (!(actual > operand)) return false;
        break;

      case '$gte':
        if (typeof actual !== 'number' || typeof operand !== 'number') return false;
        if (!(actual >= operand)) return false;
        break;

      case '$lt':
        if (typeof actual !== 'number' || typeof operand !== 'number') return false;
        if (!(actual < operand)) return false;
        break;

      case '$lte':
        if (typeof actual !== 'number' || typeof operand !== 'number') return false;
        if (!(actual <= operand)) return false;
        break;

      case '$contains': {
        if (Array.isArray(actual)) {
          // Check array: direct includes OR object-with-name-field match
          const found = actual.some(item => {
            if (item === operand) return true;
            if (typeof item === 'object' && item != null && 'name' in item) {
              return (item as { name: string }).name === operand;
            }
            return false;
          });
          if (!found) return false;
        } else if (typeof actual === 'string' && typeof operand === 'string') {
          if (!actual.includes(operand)) return false;
        } else {
          return false;
        }
        break;
      }

      case '$in':
        if (!Array.isArray(operand)) return false;
        if (!operand.includes(actual)) return false;
        break;

      case '$not':
        if (actual === operand) return false;
        break;

      case '$exists':
        if (operand === true && actual === undefined) return false;
        if (operand === false && actual !== undefined) return false;
        break;

      default:
        // Unknown operator — treat as non-match
        return false;
    }
  }
  return true;
}
