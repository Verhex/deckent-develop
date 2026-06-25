#!/usr/bin/env bash
# run.sh — launch the deckent voice-wrapper server with the dogfood production env.
#
# Prerequisites:
#   1. Create and activate a venv:   python -m venv .venv && .venv/bin/pip install -r requirements.txt
#   2. Install engine deps per requirements.txt comments (voxcpm, faster-whisper, torch-cu128).
#   3. Place (or record) the canonical voice reference WAV at the path below.
#
# Usage:
#   chmod +x run.sh
#   ./run.sh
#
# Override any variable before calling, e.g.:
#   TTS_VOICE_REF=/my/ref.wav ./run.sh

set -euo pipefail

# ---------------------------------------------------------------------------
# Engine selection
# ---------------------------------------------------------------------------
export TTS_ENGINE="${TTS_ENGINE:-voxcpm}"
export STT_ENGINE="${STT_ENGINE:-faster_whisper}"

# ---------------------------------------------------------------------------
# VoxCPM2 recipe knobs (empirically tuned; see Sprint-007 winning recipe)
# ---------------------------------------------------------------------------
export TTS_VOICE_REF="${TTS_VOICE_REF:-$(dirname "$0")/voice-ref/deckent-canonical.wav}"
export TTS_TIMESTEPS="${TTS_TIMESTEPS:-60}"
export TTS_CFG="${TTS_CFG:-1.3}"

# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------
export IDLE_EVICT_SEC="${IDLE_EVICT_SEC:-600}"

# ---------------------------------------------------------------------------
# Audio tmp directory (incoming STT uploads)
# ---------------------------------------------------------------------------
export AUDIO_TMP="${AUDIO_TMP:-/tmp/voice_wrapper}"
mkdir -p "$AUDIO_TMP"

# ---------------------------------------------------------------------------
# Launch
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

exec "$SCRIPT_DIR/.venv/bin/python" -m uvicorn server:app \
    --host 127.0.0.1 \
    --port 8001 \
    --workers 1 \
    --log-level info \
    --no-access-log
