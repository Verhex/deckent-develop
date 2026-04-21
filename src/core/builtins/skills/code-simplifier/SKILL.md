# Code Simplifier

## Cyclomatic Complexity Reduction
- Target cyclomatic complexity <= 10 per function. Functions above 15 must be split.
- Replace nested `if/else` chains with early returns (guard clauses). Each guard handles one invalid case and exits.
- Replace `switch` statements with lookup objects or Maps when the cases are simple value mappings.
- Extract complex boolean conditions into named variables or predicate functions: `const isEligible = age >= 18 && hasConsent`.

## Extract Method / Extract Class
- Extract when a block of code has a clear single purpose and can be named meaningfully.
- The extracted function should have 0-3 parameters. If more are needed, group them into an options object.
- Extract a class when a group of functions all operate on the same data and share state.
- Name extracted units by what they do, not how: `calculateDiscount()` not `applyFormulaToPrice()`.

## Dead Code Detection
- Remove unused imports, variables, functions, and types. Use `tsc --noUnusedLocals --noUnusedParameters` to detect them.
- Remove commented-out code blocks. Version control preserves history -- comments are not a backup strategy.
- Remove feature flags and conditional code for features that shipped 2+ releases ago.
- Remove unused dependencies from `package.json`. Use `depcheck` or manual grep for import references.

## Premature Abstraction Avoidance
- Do not abstract until you have 3 concrete instances of duplication (Rule of Three).
- Prefer duplication over the wrong abstraction. Copy-paste is cheaper than untangling a bad abstraction.
- Abstractions should simplify the call site. If the abstraction requires more configuration than the original code, it failed.
- When in doubt, inline the abstraction back and re-evaluate with fresh eyes.

## Cognitive Complexity
- Cognitive complexity measures how hard code is to understand, not just how many paths exist.
- Each level of nesting adds to cognitive complexity. Flatten with early returns, extraction, or inversion.
- Breaks in linear flow (continue, break, goto, recursion) add cognitive load. Minimize them.
- A function should be readable top-to-bottom without mental stack frames for nested contexts.

## When to Inline vs Extract
- **Inline** when the function body is shorter than its name + call overhead, or when it is called exactly once and adds no clarity.
- **Inline** wrapper functions that add no logic, just forward parameters.
- **Extract** when the code block has a clear name that communicates intent better than the raw code.
- **Extract** when the same logic appears in 2+ places (DRY), but verify they truly share the same reason to change.

## Single Responsibility
- Each function should do one thing and do it well. If you use "and" to describe it, split it.
- Each module should have one reason to change. Group by business concern, not by technical layer.
- Avoid god functions (>50 lines) and god classes (>300 lines). Break them along responsibility boundaries.
- Side effects (I/O, mutation, logging) should be pushed to the edges. Keep core logic pure and testable.

## Simplification Checklist
- Can this `if/else` be replaced with a ternary or `??` / `||` operator?
- Can this loop be replaced with `map`, `filter`, `reduce`, or `find`?
- Can this try/catch be narrowed to only the throwing call?
- Can this parameter list be shortened by using defaults or an options object?
- Can this class be replaced with a plain function + closure?
- Is this abstraction layer adding value, or just indirection?
