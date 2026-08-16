# DIRECTIVES — local-llm hardware acceleration closure

## Goal

Extend the production-wired `deckent local-llm` lifecycle with a config-resolved,
cross-platform hardware-acceleration contract. The implementation must preserve the
working CPU path while enabling this owner's llama.cpp CUDA backend to offload
`Qwen3.8-27B` to the WSL-visible RTX 5090. Closure requires hermetic launch-contract
tests, type-check evidence, terminal settlement, then host-side build/restart and
live GPU proof.

Verified host authority: WSL exposes `CUDA0: NVIDIA GeForce RTX 5090` with 32606 MiB
VRAM. The installed upstream llama.cpp bundle loads the device only when
`GGML_BACKEND_PATH=/usr/local/lib/ollama/cuda_v13/libggml-cuda.so`; its CUDA runtime
directories are `/usr/local/lib/ollama/cuda_v13`, `/usr/local/lib/ollama`, and
`/usr/lib/wsl/lib`. These owner-specific paths belong in `.deckent/config.json`, never
as production defaults.

## Hard rules

- Provider/model/effort come from effective config and the owner active-set; no task
  pins a model. `gpt-5.5` remains inactive.
- Effective concurrency is one. No parallel writer or parallel full-tree verification.
- Preserve the existing keyless localhost-only security boundary and CPU behavior.
- Acceleration is config-resolved and cross-platform: `auto`, `cpu`, `cuda`, `vulkan`,
  and `metal` are first-class policies. No WSL/CUDA path is hardcoded in source.
- Explicit dynamic backends fail loud when their backend library/runtime paths,
  device, or GPU-layer policy are malformed; no silent CPU fallback for an explicitly
  selected GPU backend.
- Environment composition must preserve the parent environment and use the target
  platform's library variable/path delimiter.
- Tests are hermetic and cover CPU preservation, CUDA projection, Windows/macOS/Linux
  environment composition, validation failures, and real `loadConfig` round-trip.
- No MASTER/recovery-state-machine changes, broad cleanup, commit or push.
- User-facing strings remain i18n-clean.

## Task 1: wire config-resolved local-llm hardware acceleration
- Files: src/core/config-types.ts, src/cli/commands/local-llm.ts, tests/cli/local-llm-command.test.ts, docs/governance/owner-model-policy.md
- Scope: src/core/, src/cli/commands/, tests/cli/, docs/governance/
- Dependencies: none

### Description

Add a typed acceleration policy to `LocalLlmLaunchConfig` and project it through
`resolveLocalLlmLaunchConfig` and `buildLocalLlmLaunch`. Support explicit backend
library loading (`GGML_BACKEND_PATH`), ordered runtime-library directories, device,
GPU-layer policy (`auto`, `all`, or a non-negative integer), and flash-attention
policy. CPU mode must explicitly prevent GPU offload; `auto` must retain llama.cpp's
portable discovery behavior; CUDA/Vulkan/Metal must remain platform-neutral config
choices rather than deployment constants. Extend the existing hermetic lifecycle
tests without weakening current assertions, and document the acceleration authority
and fail-loud semantics in the existing owner-model-policy reference.

Smoke: node dist/cli/entry.js local-llm status → JSON with `healthy:true` and model id `Qwen3.8-27B` after the host-side canonical restart.

### goNogo

GO when the typed config survives real `loadConfig`, CPU and auto behavior are
backward-safe, explicit GPU launch arguments/environment are deterministic on
Linux/macOS/Windows, invalid explicit acceleration is rejected before spawn,
targeted tests plus `npx tsc --noEmit` pass, documentation is truthful, and the task
receives canonical evaluation/settlement. NO-GO on hardcoded owner paths, silent
GPU-to-CPU fallback, credential/header regression, non-loopback exposure, platform
assumption, weakened test, or scope violation.
