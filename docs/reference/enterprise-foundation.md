# Enterprise Foundation: The ExecutionRequest Contract

This document outlines how Deckent's universal `ExecutionRequest` contract serves as the backbone for its enterprise-grade features. By embedding critical metadata into every request, Deckent enables advanced governance, security, and operational controls.

Most of these features are opt-in and can be enabled via flags in `.deckent/config.json`.

---

## Table of Contents

1.  [Actor & RBAC (`actor`)](#1-actor--rbac-role-based-access-control)
2.  [Multi-Tenancy (`tenantId`)](#2-multi-tenancy-tenantid)
3.  [Audit Lineage (`correlationId`, `causationId`)](#3-audit-lineage-correlationid-causationid)
4.  [Governance Gating (`riskClass`)](#4-governance-gating-riskclass)
5.  [Capability Brokering (`capabilityTarget`)](#5-capability-brokering-capabilitytarget)
6.  [Cost Control (`budget`)](#6-cost-control-budget)

---

## 1. Actor & RBAC (Role-Based Access Control)

-   **Contract Field:** `actor: { id: string, role: string }`
-   **Enables:** `ENT-1` - Role-Based Access Control (RBAC)

The `actor` object identifies who initiated a request. The `actor.role` field is consumed by the **Authority Matrix** (`src/nervous/authority-matrix.ts`) to determine a worker's permissions.

This allows for granular control, where roles like `admin`, `engineer`, or `viewer` can be assigned different capabilities. For example, a `viewer` role might be prohibited from executing shell commands or writing to the filesystem.

This system is a step towards full ADR-037 V2 implementation.

**Configuration:**
RBAC enforcement is disabled by default. To enable it, set the following in your `.deckent/config.json`:

```json
{
  "enforce_rbac": true
}
```

When `false`, Deckent operates in a permissive mode where all actors have full capabilities. When `true`, the `authority-matrix` will enforce the defined role-to-capability mappings, emitting warnings or blocking actions based on the configuration.

---

## 2. Multi-Tenancy (`tenantId`)

-   **Contract Field:** `tenantId: string`
-   **Enables:** `ENT-2` - Data Isolation for Multi-Tenancy

The `tenantId` field allows Deckent to partition data on a per-tenant basis. The primary consumer is the **Memory Store** (`src/core/memory-store.ts`), which uses the `tenantId` to isolate database rows.

This ensures that one tenant's memory, decisions, and history are not visible to another. For backward compatibility, if `tenantId` is not provided, it defaults to `'local'`.

This feature is foundational for using a single Deckent instance to serve multiple distinct projects or clients securely.

---

## 3. Audit Lineage (`correlationId`, `causationId`)

-   **Contract Fields:** `correlationId: string`, `causationId: string`
-   **Enables:** `ENT-3` - SOC2/ISO-Grade Audit Trails

For enterprise-grade traceability, the `ExecutionRequest` carries two lineage identifiers:

-   `correlationId`: Groups a sequence of related events together into a single logical "session" or "transaction."
-   `causationId`: Links an event directly to its parent event, forming a causal chain (`event A` caused `event B`).

These IDs are propagated through the **Structured Event Stream** (`src/orchestra/event-stream.ts`). Every event emitted during a task's lifecycle is stamped with these IDs, creating an unbroken audit trail that is essential for security analysis, debugging, and compliance.

---

## 4. Governance Gating (`riskClass`)

-   **Contract Field:** `riskClass: 'low' | 'medium' | 'high'`
-   **Enables:** `WM-6 / F10-002` - Risk-Based Approval Workflows

The `riskClass` of a request is resolved by `resolveRiskClass()` based on the capabilities it requires (e.g., `shell`, `filesystem.delete`). This risk assessment is consumed by the **Nervous System's Decision Engine** (`src/nervous/decision-engine.ts`).

When a request is classified as `high` risk, the decision engine can be configured to park the task for mandatory manual approval instead of executing it automatically.

**Configuration:**
This feature is opt-in. To enable it, set the following in `.deckent/config.json`:

```json
{
  "risk_gate_enabled": true
}
```

---

## 5. Capability Brokering (`capabilityTarget`)

-   **Contract Field:** `capabilityTarget: { capability: string, args: any, connector?: string }`
-   **Enables:** `F8-001` - Extensible, Non-Code Actions

The `capabilityTarget` field is the entry point for executing structured, non-code-generation tasks, such as sending an email, writing to a database, or interacting with an external ERP system.

This field is consumed by the **Capability Broker** (`src/core/capability-broker.ts`), which maintains a registry of available capabilities and their handlers. The `invokeCapability()` function resolves a `CapabilityTarget` to its corresponding backend handler, ensuring that such actions are executed in a controlled and auditable manner.

This provides a secure and extensible alternative to using the `shell` capability for all integrations.

---

## 6. Cost Control (`budget`)

-   **Contract Field:** `budget: { maxUsd?: number, maxTokens?: number }`
-   **Enables:** Per-Request Cost-Gating

The `budget` object on an `ExecutionRequest` allows for fine-grained cost control on a per-request basis. This is consumed by the **Cost Gate** (`src/core/cost-gate.ts`) before a task is spawned.

When a request includes a `budget.maxUsd` or `budget.maxTokens`, the cost gate will evaluate the estimated cost of the task against both the per-request budget and the global sprint budget. If the estimate exceeds the request's specific budget, the task can be blocked or flagged, even if it is within the overall sprint limits.

If no `budget` is provided on the request, the cost gate falls back to its default behavior of checking only against the global configuration.
