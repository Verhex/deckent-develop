# Documentation Writer

## README Structure
- Every project README must follow this order:
  1. Project name and one-line description.
  2. Badges (build status, coverage, npm version, license).
  3. Installation instructions (copy-pasteable commands).
  4. Quick start / usage example (get running in under 2 minutes).
  5. API reference or link to full docs.
  6. Configuration options.
  7. Contributing guidelines (or link to CONTRIBUTING.md).
  8. License.
- Keep the README focused. Move detailed guides to separate files in `docs/`.
- Test all code examples in the README. Outdated examples erode trust.

## Keep a Changelog
- Follow the Keep a Changelog format (keepachangelog.com).
- Categories: Added, Changed, Deprecated, Removed, Fixed, Security.
- Write entries from the user's perspective. Describe what changed for them, not internal refactoring details.
- Link each version header to the git diff between releases.
- Update the changelog in the same PR as the code change. Do not batch changelog entries.

## JSDoc / TSDoc
- Document all public functions, classes, and interfaces with JSDoc/TSDoc comments.
- Include `@param` with type and description for each parameter.
- Include `@returns` with type and description.
- Include `@throws` for functions that throw exceptions.
- Include `@example` with a runnable code snippet for complex functions.
- Use `@deprecated` with a migration path when deprecating.
- Keep internal/private functions undocumented or with minimal comments. Over-documenting internals creates maintenance burden.

## API Documentation
- Document every endpoint: method, path, parameters, request body, response, errors.
- Include at least one complete request/response example per endpoint.
- Document authentication requirements for each endpoint.
- List all possible error codes and their meanings.
- Use OpenAPI/Swagger for REST APIs. Generate documentation from the spec.
- Version the API documentation alongside the API code.

## Writing Style
- Write in the present tense, active voice: "Returns the user object" not "The user object will be returned."
- Use second person ("you") for guides and tutorials.
- Keep sentences short (under 25 words). One idea per paragraph.
- Define acronyms and technical terms on first use.
- Use code formatting for: file names, function names, CLI commands, config keys, environment variables.
- Use admonitions (Note, Warning, Tip) sparingly for critical information.

## Architecture Documentation
- Document high-level architecture decisions in ADR (Architecture Decision Record) format.
- Include: context, decision, status, and consequences.
- Keep ADRs immutable. Write a new ADR to supersede an old one.
- Include a system diagram showing major components and their interactions.
- Document data flow for critical paths (authentication, payment, etc.).

## Guide and Tutorial Writing
- Tutorials: step-by-step, goal-oriented ("Build a REST API in 10 minutes"). Every step must be testable.
- How-to guides: task-oriented ("How to add authentication"). Assume the reader knows the basics.
- Explanation docs: understanding-oriented ("How the plugin system works"). Focus on why, not how.
- Reference docs: information-oriented (API reference). Complete, accurate, terse.
- Separate these four types. Do not mix tutorial style with reference style.

## Anti-Patterns to Avoid
- Code examples in the README that are never run — outdated snippets erode trust faster than missing docs.
- Documenting every private/internal function exhaustively — over-documenting internals is maintenance debt; document the public surface.
- Batching changelog entries in a separate later PR — update the changelog in the same PR as the change, from the user's perspective.
- Editing an old ADR in place to reflect a new decision — ADRs are immutable; write a new one that supersedes it.
- Mixing tutorial prose into reference docs — keep the four doc types (tutorial / how-to / explanation / reference) separate.
- Passive voice and 40-word sentences — use present tense, active voice, one idea per paragraph.
- Shipping placeholder or `TODO` sections as "documentation" — an honest gap beats a fake-complete page.

## Karpathy Notes
- **Goal-driven:** Write for a specific reader and task. "Get running in 2 minutes" and "complete API reference" are different goals — don't blur them.
- **Simplicity first:** The shortest doc that unblocks the reader wins. Move depth into `docs/`, keep the README scannable.
- **Surgical:** Update the doc in the same change as the code it describes. Doc drift is silent until it misleads someone.
