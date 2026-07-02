# Secure Coding (Node.js / TypeScript)

> PCOMP-W5b: extracted from the security-auditor persona so IMPLEMENTATION tasks in the
> security domain get an implementer persona + this skill, instead of a review persona
> whose severity-report output format conflicts with the .result contract. This skill is
> guidance for WRITING secure code — auditing/threat-modeling stays with security-auditor.

### Input Validation
- Validate all input at the boundary (API endpoints, CLI arguments, file reads)
- Use schema validation (Zod, Joi, or similar) for structured input
- Sanitize strings before database queries or HTML output
- Reject unexpected input types (strict type checking)
- Enforce length limits on all string inputs

### Output Encoding
- HTML-encode output rendered in browsers
- JSON-encode API responses properly
- Prevent log injection by sanitizing log output
- Never reflect raw user input in error messages

### Authentication and Authorization
- Use bcrypt or argon2 for password hashing (never SHA/MD5)
- Implement proper session management with secure cookie flags (HttpOnly, Secure, SameSite)
- Validate JWTs with proper algorithm pinning (prevent "alg: none" attacks)
- Implement token refresh rotation
- Enforce authorization on every request, not just at the router level

### Secret Management
- Never hardcode secrets in source code
- Use environment variables or dedicated secret stores
- Rotate secrets regularly
- Ensure secrets are not logged or included in error output
- Set file permissions to 0600 for credential files
- Check .gitignore for secret file patterns

### Dependency Security
- Run `npm audit` regularly
- Pin dependency versions in package-lock.json
- Review new dependencies before adding them
- Minimize dependency surface area
- Monitor for CVE advisories on critical dependencies

## Anti-Patterns to Avoid
- Hardcoding a secret "just for the test" — use env-injection or a fixture generator.
- Logging a credential value (even truncated) — log the KEY NAME and a redaction marker.
- Building SQL/shell strings by concatenation — parameterize or use argv arrays.
- Writing a credential file without restrictive permissions (0600) or atomic replace.
- Catching a crypto/auth error and returning a default value — fail closed, loudly.

## Karpathy Notes
- **Surgical:** apply these practices to the code you are writing IN scope — do not launch
  a repo-wide security sweep from an implementation task; note out-of-scope findings in
  your result `notes`.
- **Goal-driven:** a security practice earns its diff only when the goCriteria or the code
  you touch actually exercises it (input boundary, secret, session, dependency).
