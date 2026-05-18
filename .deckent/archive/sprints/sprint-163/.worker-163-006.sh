#!/bin/sh
RFILE="/workspace/.tasks/task-163-006.result"
HBFILE="/workspace/.tasks/task-163-006.hb"
PRFILE="/workspace/.tasks/task-163-006.partial-result"
fsync_file() { [ -f "$1" ] && dd if="$1" of="$1.fsync" bs=4096 conv=fsync 2>/dev/null && mv "$1.fsync" "$1" 2>/dev/null; }
on_exit() {
  local exit_code=$?
  if [ -f "$RFILE" ]; then
    fsync_file "$RFILE"
    fsync_file "$HBFILE"
    rm -f "$PRFILE" 2>/dev/null
    kill $HB_PID 2>/dev/null
    return
  fi
  cd "/workspace" 2>/dev/null || true
  local changed_files=""
  changed_files=$(git diff --name-only 2>/dev/null || true)
  if [ -n "$changed_files" ] && [ "$exit_code" -ne 0 ]; then
    local json_array="["
    local first=1
    local count=0
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      count=$((count + 1))
      if [ "$first" -eq 1 ]; then
        first=0
      else
        json_array="$json_array,"
      fi
      local escaped=$(printf "%s" "$f" | sed 's/\\/\\\\/g; s/"/\\"/g')
      json_array="$json_array\"$escaped\""
    done <<GITEOF
$changed_files
GITEOF
    json_array="$json_array]"
    local signal_info=""
    [ "$exit_code" -gt 128 ] && signal_info=" signal=$((exit_code - 128))"
    cat > "$RFILE" <<RESULTEOF
{"taskId":"163-006","selfAssessment":"TIMEOUT_WITH_WORK","filesChanged":$json_array,"exitCode":$exit_code,"notes":"Worker timeout/killed (exitCode=$exit_code$signal_info) but git diff shows $count files modified. Brain should reconcile via Spurious NO_GO helper.","tokenUsage":{"inputTokens":0,"outputTokens":0,"cacheReadTokens":0,"provider":"claude","model":"opus"}}
RESULTEOF
  else
    local signal_info_nw=""
    [ "$exit_code" -gt 128 ] && signal_info_nw=" signal=$((exit_code - 128))"
    cat > "$RFILE" <<NORESULTEOF
{"taskId":"163-006","workerId":"docker-163-006","filesChanged":[],"linesAdded":0,"linesRemoved":0,"testsPassed":false,"coverage":0,"selfAssessment":"NO_GO","exitCode":$exit_code,"notes":"Worker exited without writing result (exitCode=$exit_code$signal_info_nw)","tokenUsage":{"inputTokens":0,"outputTokens":0,"cacheReadTokens":0,"provider":"claude","model":"opus"}}
NORESULTEOF
  fi
  fsync_file "$RFILE"
  fsync_file "$HBFILE"
  rm -f "$PRFILE" 2>/dev/null
  kill $HB_PID 2>/dev/null
}
mkdir -p "/tmp/deckent-home/.claude" 2>/dev/null || true
touch "/tmp/deckent-home/.claude/session-env" 2>/dev/null || true
cat > "$PRFILE" <<PARTIALEOF
{"taskId":"163-006","selfAssessment":"NO_GO","notes":"Worker started but did not complete — partial-result written at startup. If you see this, the container was likely OOM-killed or force-stopped before Claude CLI could write a .result.","partialMarker":true,"tokenUsage":{"inputTokens":0,"outputTokens":0,"cacheReadTokens":0,"provider":"claude","model":"opus"}}
PARTIALEOF
fsync_file "$PRFILE"
trap on_exit EXIT
trap 'fsync_file "$RFILE"; fsync_file "$HBFILE"; exit 0' TERM
( SEQ=2; while true; do sleep 15; SEQ=$((SEQ+1)); echo "{\"workerId\":\"docker-163-006\",\"taskId\":\"163-006\",\"status\":\"EXECUTING\",\"sequence\":$SEQ,\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",\"backend\":\"docker\"}" > "$HBFILE"; done ) &
HB_PID=$!
TIMEOUT=${TASK_TIMEOUT:-1200}
timeout $TIMEOUT claude -p - --model opus --allowedTools "Read,Write(.tasks/,docs/audits/sprint-163/,docs/audits/sprint-163/dogfood-smoke-report.md),Edit(.tasks/,docs/audits/sprint-163/,docs/audits/sprint-163/dogfood-smoke-report.md),Bash,Glob,Grep" --dangerously-skip-permissions < "/workspace/.tasks/.prompt-163-006-e9030443108d70f4.txt" || echo "WORKER_TIMEOUT" > "/workspace/.tasks/task-163-006.timeout"
rm -f "$PRFILE" 2>/dev/null