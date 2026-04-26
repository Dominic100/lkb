#!/bin/sh
set -e

RETRIES="${OLLAMA_READY_RETRIES:-300}"
SLEEP_SECONDS="${OLLAMA_READY_INTERVAL_SEC:-1}"
WARMUP_PROMPT="${OLLAMA_WARMUP_PROMPT:-Reply with exactly OK.}"
MODEL_LIST_SEPARATOR="${MODELS_SEPARATOR:-,}"

log() {
  echo "[entrypoint] $*"
}

log "MODELS=${MODELS}"

start_server() {
  log "Starting Ollama server in background"
  ollama serve &
  SERVER_PID=$!
  log "Ollama server PID: ${SERVER_PID}"
}

wait_for_server() {
  log "Waiting for Ollama API..."
  COUNTER=0
  while true; do
    if ollama ls >/dev/null 2>&1; then
      log "Ollama API is reachable"
      return 0
    fi

    COUNTER=$((COUNTER + 1))
    if [ "$COUNTER" -ge "$RETRIES" ]; then
      log "Ollama server did not become ready in ${RETRIES} seconds"
      return 1
    fi
    sleep "$SLEEP_SECONDS"
  done
}

model_exists() {
  MODEL="$1"
  ollama ls 2>/dev/null | awk 'NR>1 { print $1 }' | grep -Fxq "$MODEL"
}

wait_for_model_available() {
  MODEL="$1"
  COUNTER=0
  while true; do
    if model_exists "$MODEL"; then
      log "Model is available locally: $MODEL"
      return 0
    fi

    COUNTER=$((COUNTER + 1))
    if [ "$COUNTER" -ge "$RETRIES" ]; then
      log "Model did not appear locally in time: $MODEL"
      return 1
    fi
    sleep "$SLEEP_SECONDS"
  done
}

pull_model_if_needed() {
  MODEL="$1"
  if model_exists "$MODEL"; then
    log "Model already downloaded: $MODEL"
    return 0
  fi

  log "Pulling model: $MODEL"
  ollama pull "$MODEL"
  wait_for_model_available "$MODEL"
}

warm_model_for_inference() {
  MODEL="$1"
  log "Warming model for inference: $MODEL"

  # This performs a real inference call so we know the model can serve requests.
  if ! ollama run "$MODEL" "$WARMUP_PROMPT" >/dev/null 2>&1; then
    log "Warmup inference failed for model: $MODEL"
    return 1
  fi

  log "Warmup inference completed: $MODEL"
}

prepare_models() {
  if [ -z "${MODELS}" ]; then
    log "No MODELS configured; server will run without preloaded models"
    return 0
  fi

  OLD_IFS="$IFS"
  IFS="${MODEL_LIST_SEPARATOR}"
  for m in ${MODELS}; do
    MODEL=$(echo "$m" | sed -e 's/^ *//' -e 's/ *$//')
    if [ -z "$MODEL" ]; then
      continue
    fi

    pull_model_if_needed "$MODEL"
    if ! warm_model_for_inference "$MODEL"; then
      log "Warmup failed for model: $MODEL"
      return 1
    fi
  done
  IFS="$OLD_IFS"
}

shutdown() {
  if [ -n "${SERVER_PID}" ]; then
    log "Stopping Ollama server"
    kill "$SERVER_PID" 2>/dev/null || true
  fi
  exit 0
}

trap shutdown INT TERM

start_server
wait_for_server
if ! prepare_models; then
  log "Model preparation failed"
  exit 1
fi
log "Startup complete. Models are ready for inference."

# Keep container alive while Ollama server runs.
wait "$SERVER_PID"
