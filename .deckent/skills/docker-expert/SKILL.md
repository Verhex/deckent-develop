# Docker Expert

## Multi-Stage Builds
- Use multi-stage builds to separate build dependencies from the runtime image. Build stage installs compilers and dev deps; final stage copies only the artifact.
- Name stages explicitly: `FROM node:20-alpine AS builder` ... `FROM node:20-alpine AS runtime`.
- Copy only what the runtime needs: `COPY --from=builder /app/dist ./dist` and `COPY --from=builder /app/node_modules ./node_modules`.
- For Node.js, run `npm ci --omit=dev` in the final stage or use a separate install stage for production dependencies only.

## Layer Caching Optimization
- Order Dockerfile instructions from least-changing to most-changing. `COPY package*.json` before `COPY . .` so `npm install` is cached when only source code changes.
- Group related `RUN` commands with `&&` to reduce layer count: `RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*`.
- Use `.dockerignore` to exclude `node_modules`, `.git`, `dist`, test files, and documentation from the build context.
- Pin base image versions with digest or specific tag (`node:20.11-alpine`) instead of `latest` for reproducible builds.

## .dockerignore Best Practices
- Always include: `node_modules`, `.git`, `*.md`, `*.log`, `.env*`, `dist`, `coverage`, `.vscode`, `.idea`.
- Mirror `.gitignore` as a starting point, then add Docker-specific exclusions (Dockerfile, docker-compose.yml are usually not needed in the context).
- A lean build context speeds up `docker build` significantly on large repos.

## Security
- Never run containers as root. Add `RUN addgroup -S app && adduser -S app -G app` and `USER app` before `CMD`.
- Use distroless or Alpine-based images to minimize attack surface. Fewer packages = fewer CVEs.
- Never embed secrets (API keys, passwords) in the image. Use build-time `--secret` mounts or runtime environment variables.
- Scan images with `docker scout cves` or `trivy image` in CI. Block deployment on critical/high CVEs.
- Set `HEALTHCHECK` to enable orchestrator health monitoring: `HEALTHCHECK --interval=30s CMD curl -f http://localhost:3000/health || exit 1`.

## Docker Compose
- Use `docker-compose.yml` for local development environments. Define services, networks, and volumes declaratively.
- Use `depends_on` with `condition: service_healthy` for proper startup ordering with health checks.
- Use named volumes for persistent data (databases). Use bind mounts for source code in development (hot reload).
- Define a `.env` file for environment variables. Reference with `${VAR_NAME}` in compose. Never commit `.env` files.

## Networking
- Use user-defined bridge networks for inter-container communication: `docker network create app-net`.
- Containers on the same network resolve each other by service name (DNS). Use service names as hostnames, not IPs.
- Expose only necessary ports. Use `expose` for inter-container, `ports` for host-accessible endpoints.
- For production, consider overlay networks (Swarm) or service meshes (Kubernetes) for cross-host communication.

## Volume Management
- Use named volumes for data that must persist across container restarts (databases, uploads, caches).
- Use `tmpfs` mounts for ephemeral data that should not persist and benefits from memory speed.
- Set proper ownership and permissions on volume mount points. Match the container user's UID/GID.
- Back up named volumes regularly: `docker run --rm -v mydata:/data -v $(pwd):/backup alpine tar czf /backup/data.tar.gz /data`.

## Image Size Reduction
- Start from the smallest viable base image: `alpine` (5MB) > `slim` (80MB) > `bookworm` (140MB).
- Remove package manager caches in the same `RUN` layer: `&& rm -rf /var/lib/apt/lists/*` or `&& apk --no-cache`.
- Use `--omit=dev` for production Node.js dependencies. Dev dependencies can add 200MB+.
- Audit final image with `docker history <image>` to identify large layers. Target < 200MB for Node.js apps.
- Consider `FROM scratch` or Google distroless for Go/Rust binaries that are statically compiled.

## Anti-Patterns to Avoid
- Single-stage build shipping compilers and dev deps — use multi-stage; copy only the artifact into the runtime image.
- `COPY . .` before installing dependencies — copy lockfiles first so `install` stays cached when only source changes.
- `latest` base tag — pin a specific version or digest for reproducible builds.
- Running as root in the final image — create and switch to a non-root user before `CMD`.
- Embedding secrets via `ENV` or build args — they persist in layers; use `--secret` mounts or runtime env.
- Forgetting `.dockerignore` — a fat build context (`node_modules`, `.git`) slows every build.
- `ADD` for plain local files — use `COPY`; reserve `ADD` for tar extraction or URL fetch semantics.

## Karpathy Notes
- **Simplicity first:** Start from the smallest viable base (alpine/distroless). Add packages only when the build actually fails without them.
- **Surgical:** Order instructions least-changing first. One misplaced `COPY` invalidates every downstream layer's cache.
- **Goal-driven:** Each layer should shrink the image or speed the build. Audit with `docker history`; cut layers that do neither.
