# Runtime-visible credential exposure taxonomy — evidence hold

**Date:** 2026-08-11  
**MASTER row:** 2030  
**Status:** `HOLD` — the bounded evidence available to task 519-001 is insufficient to produce the required exhaustive, file-evidenced taxonomy.

## Required verdict

The current Docker Codex authentication handling **must not be described as zero-exposure**. Row 2030 states that it performs a runtime-visible auth copy. A copy is exposure by definition. However, the authorized evidence set does not show its source path, destination path, storage medium, permissions, creation and deletion call sites, cleanup behavior, or token revocation mechanism. Assigning `tmpfs-copy` or `persistent-copy` without those facts would be an unsupported security claim.

## Evidence boundary

This task authorized source discovery only under `follow-up-works/`. That directory contains no spawn backend, credential store, or provider adapter implementation. A bounded search of its seven pre-existing Markdown files found general references to environment credentials and worker/provider execution, but no complete credential-path inventory and no file-level implementation evidence for the Docker Codex auth copy.

The closest relevant scoped evidence is:

- `follow-up-works/dep-supply-defense-2026-08-11.md:36` — worker-container code can consume environment credentials; it does not identify credential names, producers, consumers, or lifetime.
- `follow-up-works/dep-supply-defense-2026-08-11.md:44-53` — provider CLIs execute in the worker trust domain; it does not identify their credential stores.
- `follow-up-works/OWASP-ASI-REVERIFY-2026-08-11.md:396` — cites `spawn-backend-docker.ts` for worker mount and write-target behavior, not authentication copying.

These references do not support classification of every credential path into `host-only`, `env`, `tmpfs-copy`, `persistent-copy`, or `enterprise custody`. They also do not establish exposure windows or revocation behavior. The required source files are outside this task's read authority, so they were not opened or inferred from filenames.

## Classification status

| Credential path | Required class | Exposure window | Revocation story | File-level evidence | Status |
|---|---|---|---|---|---|
| Docker Codex auth copy | Cannot distinguish `tmpfs-copy` from `persistent-copy` in authorized evidence; **not zero-exposure** | Unknown: creation, process/container lifetime, cleanup, and crash residue are not evidenced | Unknown: token revocation and copied-file removal are not evidenced | No implementation call site is present in the authorized read scope | `HOLD` |
| Other provider credential paths actually used by production code | Inventory unavailable; no honest class can be assigned | Unknown | Unknown | Spawn backends, credential stores, and provider adapters are absent from the authorized read scope | `HOLD` |

This table is an evidence-gap register, not the requested completed taxonomy. It intentionally does not invent provider paths or treat absence from the bounded documents as absence from production.

## Evidence required to close the hold

A successor task needs explicit read authority for the production spawn backends, credential stores, provider adapters, and their configuration/type declarations and focused tests. For each credential ingress and runtime consumer, it must capture:

- the exact source file and line range that resolves the credential;
- the exact environment variable or filesystem source and runtime destination;
- whether bytes remain host-only, enter the process environment, land on tmpfs, land on persistent storage, or remain under an enterprise custody boundary;
- creation, permission-setting, mount, handoff, cleanup, crash-recovery, and retention call sites;
- the maximum exposure window, including abnormal termination;
- provider-side revocation/rotation and local invalidation behavior;
- every backend and platform adapter, with unsupported platforms reported as typed `HOLD` rather than silently omitted.

Only after that inventory is complete can every path receive one of the five requested classes.

## Owner decision points

1. Authorize a bounded successor read scope containing the actual spawn backends, credential stores, provider adapters, relevant config/type declarations, and focused tests.
2. Decide whether any runtime copy is permitted. If yes, approve its storage class, permission model, maximum lifetime, crash cleanup, and evidence retention.
3. Decide whether Docker Codex auth must move from its current copy behavior to environment injection, tmpfs materialization, a host-side broker, or enterprise custody. No option is selected here.
4. Approve provider-specific revocation and rotation requirements, including behavior for already-running workers.
5. Define which enterprise secret managers, workload-identity systems, OS keychains, and air-gapped equivalents qualify as `enterprise custody` across macOS, Linux, native Windows, WSL, and containers.
6. Require negative verification that copied credentials do not remain after normal exit, cancellation, crash, host restart, or retry before accepting any tightened design.

## Non-actions

This document proposes no production or configuration change. It does not claim zero-exposure, complete coverage, or successful classification. Its only conclusion is that row 2030 remains open until implementation evidence is made readable and reviewed.
