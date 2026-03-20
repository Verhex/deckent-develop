---
name: Security Vulnerability Report
about: Report a security vulnerability in Deckent
title: '[SECURITY] '
labels: security
assignees: ''
---

<!--
IMPORTANT: Please do NOT include any sensitive details (credentials, tokens, etc.) in this public issue.
For critical vulnerabilities, consider responsible disclosure via email first (see note below).
-->

## Vulnerability Type

<!-- Select all that apply -->
- [ ] Injection (SQL, command, LDAP, etc.)
- [ ] Authentication bypass
- [ ] Authorization / privilege escalation
- [ ] Path traversal / directory traversal
- [ ] Insecure deserialization
- [ ] Sensitive data exposure
- [ ] Cross-site scripting (XSS)
- [ ] Dependency vulnerability (supply chain)
- [ ] Other: <!-- describe -->

## Severity Assessment

**CVSS Score (if known):** <!-- e.g. 7.5 -->

**Severity Level:**
- [ ] Critical
- [ ] High
- [ ] Medium
- [ ] Low

**Justification:**
<!-- Explain your severity rating briefly -->

## Steps to Reproduce

1.
2.
3.

**Environment:**
- Deckent version: <!-- e.g. 1.0.0 -->
- Node.js version: <!-- e.g. 22.x -->
- OS: <!-- e.g. Ubuntu 22.04, macOS 14, WSL2 -->

## Impact Assessment

<!-- Describe what an attacker could achieve by exploiting this vulnerability -->

**Affected component(s):**
<!-- e.g. src/api/server.ts, MCP server, CLI -->

**Attack vector:** <!-- Local / Network / Adjacent -->
**Authentication required:** <!-- Yes / No -->
**User interaction required:** <!-- Yes / No -->

## Proposed Fix (Optional)

<!-- If you have a suggested fix or mitigation, describe it here -->

## Responsible Disclosure Note

We appreciate responsible disclosure. If this vulnerability is critical (CVSS >= 7.0 or severity High/Critical), please consider:

1. **Email first** — contact the maintainer directly before publishing details publicly, allowing time to patch before disclosure.
2. **Allow reasonable time** — we aim to respond within 72 hours and release a patch within 30 days.
3. **Coordinated disclosure** — we'll credit you in the security advisory and CHANGELOG when the fix is released.

Thank you for helping keep Deckent secure.
