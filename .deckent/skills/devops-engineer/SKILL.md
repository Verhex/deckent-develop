# DevOps Engineer

## Dockerfile Best Practices
- Use multi-stage builds to keep production images small. Build stage installs dev dependencies, production stage copies only artifacts.
- Start from specific, versioned base images: `node:20-alpine` not `node:latest`. Pin the digest for reproducibility.
- Order instructions from least to most frequently changing to maximize layer caching.
- Use `.dockerignore` to exclude node_modules, .git, test files, and documentation from the build context.
- Run as non-root user in production: `USER node` or create a dedicated user.
- Use COPY over ADD unless you need tar extraction or URL fetching.
- Combine RUN commands to reduce layers: `RUN apt-get update && apt-get install -y package && rm -rf /var/lib/apt/lists/*`.
- Set `HEALTHCHECK` instruction to enable container health monitoring.
- Keep production images under 200MB. Use Alpine or distroless base images.

## CI/CD with GitHub Actions
- Use reusable workflows for common patterns (build, test, deploy).
- Cache dependencies (actions/cache) and Docker layers to reduce build time.
- Run tests in parallel using matrix strategies for multiple Node/Python versions.
- Use environment-specific secrets. Never hardcode credentials in workflow files.
- Pin action versions to full SHA, not tags: `uses: actions/checkout@a1b2c3` not `@v4`.
- Use concurrency groups to cancel redundant runs on the same branch.
- Separate CI (build/test on every PR) from CD (deploy on merge to main).
- Use status checks to block merging until CI passes.

## Environment Variables and Configuration
- Use environment variables for all environment-specific configuration (database URLs, API keys, feature flags).
- Define all required variables in a `.env.example` file (with placeholder values, never real secrets).
- Validate environment variables at application startup. Fail fast with clear error messages for missing required vars.
- Use different variable sets per environment: development, staging, production.
- Never log environment variable values. Log only their names for debugging.

## Secrets Management
- Store secrets in GitHub Secrets, Vault, AWS Secrets Manager, or similar.
- Rotate secrets periodically. Design the system to handle rotation without downtime.
- Use OIDC for cloud provider authentication from CI instead of long-lived credentials.
- Audit secret access. Alert on unauthorized access attempts.
- Never pass secrets as command-line arguments (visible in process listings). Use files or environment variables.

## Health Checks and Monitoring
- Implement a `/health` endpoint that checks database connectivity, external service availability, and disk space.
- Return structured health responses: `{ "status": "healthy", "checks": { "database": "ok", "redis": "ok" } }`.
- Use liveness probes (is the process running?) and readiness probes (can it serve traffic?) in Kubernetes.
- Monitor key metrics: request rate, error rate, latency (p50, p95, p99), CPU, memory.
- Set up alerting for anomalies. Alert on symptoms (high error rate), not causes (high CPU).

## Kubernetes Basics
- Use Deployments for stateless applications. Use StatefulSets for databases and stateful workloads.
- Define resource requests and limits for every container. Prevent noisy neighbor problems.
- Use ConfigMaps for configuration, Secrets for sensitive data.
- Use namespaces to isolate environments or teams.
- Use Horizontal Pod Autoscaler (HPA) for automatic scaling based on CPU or custom metrics.
- Use PodDisruptionBudgets to ensure availability during node maintenance.

## Infrastructure as Code
- Use Terraform, Pulumi, or CloudFormation to manage infrastructure. Never create resources manually.
- Store state files remotely (S3 + DynamoDB lock, Terraform Cloud).
- Use modules for reusable infrastructure components.
- Review infrastructure changes with `terraform plan` before applying.
- Tag all resources with environment, team, and project for cost allocation.

## Logging and Observability
- Use structured logging (JSON format) with consistent fields: timestamp, level, message, requestId, userId.
- Implement distributed tracing (OpenTelemetry) for microservice architectures.
- Centralize logs with ELK stack, Datadog, or CloudWatch.
- Use log levels appropriately: ERROR (action needed), WARN (unusual but handled), INFO (state changes), DEBUG (development only).
- Include correlation IDs in all logs to trace requests across services.

## Anti-Patterns to Avoid
- `FROM node:latest` (or any unpinned tag) — pin a versioned or digest-pinned base for reproducible builds.
- Running the container as root — add a non-root `USER` before `CMD`.
- Baking secrets into image layers or passing them as build args — use runtime env or secret mounts; layers are permanent.
- Pinning GitHub Actions to a mutable tag (`@v4`) for security-sensitive steps — pin to a full commit SHA.
- Logging environment-variable values — log only their names; values leak credentials.
- Alerting on causes (high CPU) instead of symptoms (high error rate / latency) — page on what users actually feel.
- Creating cloud resources by hand — manage them as code (Terraform/Pulumi) with remote, locked state.

## Karpathy Notes
- **Think before coding:** Decide the trust and failure model first — what runs as root, where secrets live, what happens when a dependency is down.
- **Simplicity first:** Reach for Kubernetes or a service mesh only when scale demands it. A pinned image + health check + structured logs covers most needs.
- **Goal-driven:** Every layer, action pin, and probe must map to a concrete reproducibility, security, or availability requirement.
