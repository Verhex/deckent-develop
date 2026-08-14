# Contributing to Deckent Hub

Thank you for contributing to the Deckent Skill Registry! This guide explains the full process for submitting a new skill or updating an existing one.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Skill Submission Pipeline](#skill-submission-pipeline)
3. [Step-by-Step Guide](#step-by-step-guide)
4. [AST Sandbox Rules](#ast-sandbox-rules)
5. [Ed25519 Signature Verification](#ed25519-signature-verification)
6. [PR Review Criteria](#pr-review-criteria)
7. [Updating an Existing Skill](#updating-an-existing-skill)
8. [Maintainer Guide](#maintainer-guide)

---

## Prerequisites

- Deckent v0.100.0 or later. Until the first npm release ships, install from
  source: clone `VerhexIO/deckent`, `npm ci && npm run build`, then `npm link`
  (post-release: `npm install -g deckent`)
- A GitHub account
- Basic knowledge of TypeScript (for skill implementation examples)

---

## Skill Submission Pipeline

Every skill goes through this automated pipeline before human review:

```
┌──────────────────────────────────────────────────────────┐
│                  PR Submission                           │
└───────────────────────┬──────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│  Step 1: AST Sandbox Scan                                │
│  • Checks for eval, Function, dynamic imports            │
│  • Validates network domain declarations                 │
│  • Verifies file system scope declarations               │
│  • Blocks shell commands unless explicitly declared      │
└───────────────────────┬──────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│  Step 2: Ed25519 Signature Verification                  │
│  • Reads author.publicKey from manifest.json             │
│  • Verifies signature.ed25519 against SKILL.md +         │
│    manifest.json content                                 │
│  • Rejects tampered skills                               │
└───────────────────────┬──────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│  Step 3: Manifest Schema Validation                      │
│  • manifestVersion === 2                                 │
│  • All required fields present                           │
│  • Category is a known value                             │
│  • Semver version format                                 │
└───────────────────────┬──────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│  Step 4: Human Review (maintainer)                       │
│  • Quality check on SKILL.md                             │
│  • Accuracy of trigger patterns                          │
│  • Completeness of secret documentation                  │
│  • Example validity                                      │
└───────────────────────┬──────────────────────────────────┘
                        │
                        ▼
                     MERGED ✓
```

---

## Step-by-Step Guide

### 1. Fork & Clone

```bash
# Fork VerhexIO/deckent-hub on GitHub, then:
git clone https://github.com/<your-username>/deckent-hub.git
cd deckent-hub
```

### 2. Create Your Skill Directory

`SKILL_TEMPLATE.md` is a single reference document (not a directory) — scaffold by hand:

```bash
mkdir -p skills/my-skill-name
cd skills/my-skill-name
# author SKILL.md + manifest.json following the structure in ../../SKILL_TEMPLATE.md
```

### 3. Fill in SKILL.md

Follow the template in `SKILL_TEMPLATE.md`. The minimum required sections are:
- Trigger Patterns (min 2)
- Capabilities
- Required Secrets (if any)
- At least 1 Example Prompt

### 4. Fill in manifest.json

Replace all `<placeholder>` values. Note: `entrypoint` (string) is a **required** field —
the validator rejects manifests without it. Run the hub validator (schema + sandbox +
signature stages in one pass — there is no separate `deckent skill validate` subcommand):

```bash
node scripts/hub-validate.mjs ./skills/my-skill-name
```

Fix any reported issues before proceeding.

### 5. Sandbox, Sign and Stage — one command

Sandbox scanning and signing are **not** separate subcommands; `deckent skill publish`
bundles them:

```bash
deckent skill publish ./skills/my-skill-name
```

This command:
1. Runs the AST sandbox scan as a gate — on violation it lists the file, line,
   violated rule, and how to fix it
2. Loads (or generates) your Ed25519 keypair at `~/.deckent/keys/`
3. Signs the skill (SKILL.md + manifest.json)
4. Writes `signature.ed25519` to your skill directory

**Important:** Copy your public key hex from the output and add it to `manifest.json` under `author.publicKey`.

### 6. Commit and Open PR

```bash
git add skills/my-skill-name/
git commit -m "feat: add my-skill-name skill"
git push origin main
# Open PR on GitHub: https://github.com/VerhexIO/deckent-hub/compare
```

PR title format: `feat: add <skill-name>` or `fix: update <skill-name> to v1.0.1`

### 7. CI Will Run Automatically

The `validate-skill.yml` CI workflow runs on every PR targeting files in `skills/`. It runs the same 3-stage pipeline (sandbox + signature + manifest). All 3 checks must pass before a maintainer can merge.

---

## AST Sandbox Rules

The sandbox is enforced at publish time and in CI. Here are the rules:

### Automatically Rejected Patterns

| Pattern | Reason | Alternative |
|---------|--------|-------------|
| `eval(...)` | Arbitrary code execution | Use explicit logic |
| `new Function(...)` | Same as eval | Use explicit logic |
| `` import(`${variable}`) `` | Dynamic import path | Declare static imports |
| `require(variable)` | Dynamic require | Use static requires |
| `process.env.UNLISTED_VAR` | Undeclared env access | List in `secrets` manifest field |
| `fetch('undeclared.domain.com')` | Undeclared network | Add to `scope.networkDomains` |
| `execSync(...)` | Shell execution | Set `scope.shellCommands: true` |
| `writeFileSync('/outside/scope')` | Out-of-scope write | Declare in `scope.fileWrite` |

### Allowed with Declaration

| Pattern | Required Declaration |
|---------|---------------------|
| Shell commands (`exec`, `spawn`, `execSync`) | `scope.shellCommands: true` in manifest |
| Network requests | Domain in `scope.networkDomains` array |
| Env variable access | Key in `secrets` array |
| File writes | Path pattern in `scope.fileWrite` array |

### Requesting a Sandbox Exception

If your skill legitimately needs a pattern that the sandbox rejects, open an issue first with:
- The specific pattern needed
- Why no alternative exists
- How it is safe in your use case

Maintainers will evaluate on a case-by-case basis.

---

## Ed25519 Signature Verification

### Why Ed25519?

Ed25519 provides:
- **Non-repudiation**: Each skill is verifiably signed by its author
- **Tamper detection**: Any modification after signing breaks the signature
- **Lightweight**: Fast verification, small signatures (64 bytes)
- **No PKI dependency**: No certificate authorities required

### How Verification Works

```
signature = Ed25519Sign(privateKey, SHA-512(SKILL.md + manifest.json))
```

Consumers (and CI) verify:
```
Ed25519Verify(publicKey, SHA-512(SKILL.md + manifest.json), signature)
```

If `SKILL.md` or `manifest.json` is modified after signing, verification fails and the skill is rejected.

### Key Management

- Your private key: `~/.deckent/keys/private.hex` (permissions: `0600`)
- Your public key: `~/.deckent/keys/public.hex` (permissions: `0644`)
- The key directory: `~/.deckent/keys/` (permissions: `0700`)

**Never share your private key.** If you believe it was compromised, generate a new keypair and re-sign all your skills.

---

## PR Review Criteria

Maintainers check these things during human review:

### Must-Pass

- [ ] Skill does what it says in the description
- [ ] Trigger patterns are accurate and not too broad
- [ ] All required secrets are documented clearly
- [ ] At least 1 realistic example prompt
- [ ] No duplicate skill (check existing `skills/` before submitting)
- [ ] License is MIT or compatible open source license
- [ ] CI passes (sandbox + signature + manifest)

### Nice-to-Have

- [ ] `README.md` with user-facing setup instructions
- [ ] Multiple examples covering different use cases
- [ ] Error handling documented
- [ ] `examples/` directory with realistic prompts

### Automatic Rejection

- Skill that exfiltrates user data to external servers
- Skill that modifies Deckent's own configuration without user consent
- Skill with undeclared network access or shell commands
- Skill that requires root/admin privileges
- Copyrighted content without proper license

---

## Updating an Existing Skill

### Patch Version (bug fix, no behavior change)

```bash
# Update manifest.json version field: 1.0.0 → 1.0.1
# Fix the bug in SKILL.md or examples
deckent skill publish ./skills/my-skill-name  # re-signs automatically
git add skills/my-skill-name/
git commit -m "fix: my-skill-name — <describe fix>"
```

### Minor Version (new capability, backward compatible)

```bash
# Update manifest.json version: 1.0.0 → 1.1.0
# Add new trigger patterns / capabilities
deckent skill publish ./skills/my-skill-name
git commit -m "feat: my-skill-name — add <new capability>"
```

### Major Version (breaking change)

Open an issue first to discuss. Major version skills may need separate directory (`my-skill-v2/`).

---

## Maintainer Guide

### Reviewing a PR

1. Check CI passes (all 3 stages green)
2. Read `SKILL.md` — does it accurately describe the skill?
3. Check `manifest.json` — correct category, version, author info?
4. Spot-check the trigger patterns — are they sensible?
5. Verify no duplicate skill exists in `skills/`
6. Merge with squash

### Adding a Maintainer

Create a PR adding the new maintainer's GitHub username to `MAINTAINERS.md` (to be created). Requires approval from 2 existing maintainers.

### Deprecating a Skill

1. Add `"deprecated": true` to `manifest.json`
2. Add `"deprecationMessage"` explaining why and what to use instead
3. Keep the skill in the registry — do not delete (consumers may depend on it)
4. Update CI to warn (not fail) on deprecated skills

---

## Code of Conduct

Be kind. Be honest. Build skills that genuinely help people. Skills that harm users, exfiltrate data, or abuse access will be permanently removed and the author banned.

Questions? Open an issue or reach out on Discord: [deckent.io/discord](https://deckent.io/discord)
