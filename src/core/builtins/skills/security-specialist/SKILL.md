# Security Specialist

## OWASP Top 10 Awareness
- A01 Broken Access Control: enforce authorization on every endpoint. Default deny. Check ownership, not just authentication.
- A02 Cryptographic Failures: use strong algorithms (AES-256, bcrypt/argon2 for passwords). Never roll your own crypto.
- A03 Injection: parameterize all queries. Use ORM/query builders. Validate and sanitize all inputs.
- A04 Insecure Design: threat model during design. Identify trust boundaries. Apply defense in depth.
- A05 Security Misconfiguration: disable debug modes in production. Remove default credentials. Harden server configs.
- A06 Vulnerable Components: audit dependencies regularly (npm audit, pip-audit). Pin versions. Update promptly.
- A07 Authentication Failures: enforce strong passwords. Implement account lockout. Use MFA where possible.
- A08 Data Integrity Failures: verify software updates and CI/CD pipelines. Use signed artifacts.
- A09 Logging Failures: log security events (auth, access control, input validation). Never log secrets or PII.
- A10 SSRF: validate and allowlist outbound URLs. Block internal network access from user-controlled URLs.

## Input Validation
- Validate all input on the server side. Client-side validation is for UX, not security.
- Use allowlists over denylists. Define what is valid, not what is invalid.
- Validate type, length, range, and format for every field.
- Reject unexpected fields. Use strict schema validation (Zod strict mode, JSON Schema additionalProperties: false).
- Encode output based on context: HTML encoding for HTML, URL encoding for URLs, JSON encoding for JSON.

## Authentication Patterns
- JWT: use short expiry (15 min access, 7 day refresh). Store refresh tokens securely (httpOnly cookie). Validate issuer, audience, and expiry.
- Session: use secure, httpOnly, sameSite cookies. Regenerate session ID after login. Set appropriate expiry.
- OAuth 2.0: use Authorization Code flow with PKCE for SPAs. Never use Implicit flow.
- Passwords: hash with bcrypt (cost 12+) or argon2id. Never store plaintext or MD5/SHA hashes.
- API keys: treat as secrets. Transmit in headers (not query params). Support rotation without downtime.

## Secret Management
- Never commit secrets to source control. Use `.env` files for local development (gitignored).
- Use environment variables or a secrets manager (Vault, AWS Secrets Manager, GCP Secret Manager) in production.
- Rotate secrets periodically. Design systems to support rotation without downtime.
- Use different secrets for each environment (dev, staging, production).
- Audit secret access. Alert on unusual patterns.

## CSRF Prevention
- Use anti-CSRF tokens (synchronizer token pattern) for state-changing requests.
- Set `SameSite=Lax` or `SameSite=Strict` on session cookies.
- Verify the `Origin` or `Referer` header for cross-origin requests.
- For APIs, require a custom header (e.g., `X-Requested-With`) that cannot be set by cross-origin forms.

## XSS Prevention
- Encode all dynamic content in HTML output. Use framework auto-escaping (React JSX, template engines).
- Use Content Security Policy (CSP) headers to restrict inline scripts and external resources.
- Sanitize user-generated HTML with a proven library (DOMPurify). Never use regex for HTML sanitization.
- Set `httpOnly` on cookies to prevent JavaScript access.

## Dependency Security
- Run `npm audit` / `pip-audit` / `cargo audit` in CI. Fail the build on high/critical vulnerabilities.
- Use Dependabot, Renovate, or Socket for automated dependency update PRs.
- Review dependency changelogs before upgrading. Watch for supply chain attacks.
- Minimize dependencies. Each dependency is an attack surface.
- Use lockfiles and verify integrity hashes.

## Anti-Patterns to Avoid
- Client-side-only validation — server must re-validate every input independently.
- Storing secrets in source code, even in test files — they end up in git history.
- `algorithm: 'none'` in JWT — always verify algorithm explicitly against an allowlist.
- Broad CORS (`*`) with credentials — combine only with explicit origins.
- Logging request bodies wholesale — they contain passwords, tokens, PII.
- MD5 or SHA-1 for password hashing — use bcrypt (cost ≥12) or argon2id.
- Security by obscurity (hiding endpoints, mangling IDs) as the primary control — use real authorization.
- Catching and swallowing authentication exceptions — fail securely (deny, log, alert).

## Karpathy Notes
- **Think before coding:** Identify trust boundaries before writing any security-relevant code. Draw them explicitly: what data comes from users? From third parties? From internal services?
- **Simplicity first:** Defense in depth does not mean complex code. Simple, layered controls (validate input, check permission, log action) beat clever single-layer solutions.
- **Goal-driven:** Every security control must map to a specific threat. If you cannot name the attack it prevents, question whether it belongs.
