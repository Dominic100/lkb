#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/Dominic100/lkb.git"
DEFAULT_BRANCH="main"
DEFAULT_EXTENSION_BUNDLE_URL="https://github.com/Dominic100/lkb/releases/latest/download/lkb-extension.zip"
DEFAULT_NATIVE_BUNDLE_URL="https://github.com/Dominic100/lkb/releases/latest/download/lkb-native.zip"
DOCKER_COMPOSE_FILE="native/docker-compose.yml"
ENV_FILE="native/.env"
ENV_EXAMPLE_FILE="native/.env.example"
MODELS_DEFAULT="qwen2.5:7b"
OPEN_CHROME_AFTER_SETUP="true"

SCRIPT_DIR_SOURCE="$0"
if [[ -n "${BASH_SOURCE:-}" ]]; then
  SCRIPT_DIR_SOURCE="${BASH_SOURCE[0]}"
fi
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_DIR_SOURCE")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
DOWNLOAD_DIR="${PROJECT_DIR}/.downloaded-extension"
EXTENSION_DIR_DEFAULT="${PROJECT_DIR}/.downloaded-extension/extension"
NATIVE_DIR_DEFAULT="${PROJECT_DIR}/.downloaded-extension/native"

log() {
  printf '%s\n' "[setup] $*"
}

warn() {
  printf '%s\n' "[setup] WARNING: $*" >&2
}

die() {
  printf '%s\n' "[setup] ERROR: $*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage:
  bash setup.sh [--mode webstore|local] [--branch BRANCH] [--repo-url URL] [--extension-bundle-url URL] [--native-bundle-url URL] [--models MODEL1,MODEL2]

Modes:
  webstore  Prepare local Docker services and print Chrome Web Store instructions.
  local     Download and extract both release bundles, then prepare local Docker services.

Examples:
  bash setup.sh --mode webstore
  bash setup.sh --mode local --models qwen2.5:7b
  bash setup.sh --mode local --extension-bundle-url https://github.com/Dominic100/lkb/releases/latest/download/lkb-extension.zip --native-bundle-url https://github.com/Dominic100/lkb/releases/latest/download/lkb-native.zip
EOF
}

MODE="webstore"
BRANCH="$DEFAULT_BRANCH"
REPO_URL_OVERRIDE=""
EXTENSION_BUNDLE_URL="$DEFAULT_EXTENSION_BUNDLE_URL"
NATIVE_BUNDLE_URL="$DEFAULT_NATIVE_BUNDLE_URL"
MODELS="$MODELS_DEFAULT"
EXTENSION_DIR="$EXTENSION_DIR_DEFAULT"
NATIVE_DIR="$NATIVE_DIR_DEFAULT"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="${2:-}"
      shift 2
      ;;
    --branch)
      BRANCH="${2:-}"
      shift 2
      ;;
    --repo-url)
      REPO_URL_OVERRIDE="${2:-}"
      shift 2
      ;;
    --extension-bundle-url)
      EXTENSION_BUNDLE_URL="${2:-}"
      shift 2
      ;;
    --native-bundle-url)
      NATIVE_BUNDLE_URL="${2:-}"
      shift 2
      ;;
    --models)
      MODELS="${2:-}"
      shift 2
      ;;
    --extension-dir)
      EXTENSION_DIR="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

if [[ "$MODE" != "webstore" && "$MODE" != "local" ]]; then
  die "--mode must be either 'webstore' or 'local'"
fi

if [[ -n "$REPO_URL_OVERRIDE" ]]; then
  REPO_URL="$REPO_URL_OVERRIDE"
fi

ensure_command() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

ensure_docker() {
  ensure_command docker
  if ! docker info >/dev/null 2>&1; then
    die "Docker is not running or not accessible"
  fi
  if ! docker compose version >/dev/null 2>&1; then
    die "Docker Compose v2 is required"
  fi
}

prepare_bundles() {
  if [[ "$MODE" != "local" ]]; then
    return 0
  fi

  ensure_command curl
  ensure_command unzip
  mkdir -p "$DOWNLOAD_DIR"
  rm -rf "${DOWNLOAD_DIR:?}"/*
  local extension_bundle_path="${DOWNLOAD_DIR}/lkb-extension.zip"
  local native_bundle_path="${DOWNLOAD_DIR}/lkb-native.zip"

  log "Downloading extension bundle from ${EXTENSION_BUNDLE_URL}"
  curl -fsSL "$EXTENSION_BUNDLE_URL" -o "$extension_bundle_path"
  log "Downloading native bundle from ${NATIVE_BUNDLE_URL}"
  curl -fsSL "$NATIVE_BUNDLE_URL" -o "$native_bundle_path"

  local extension_extract_dir="${DOWNLOAD_DIR}/extension-extracted"
  local native_extract_dir="${DOWNLOAD_DIR}/native-extracted"

  rm -rf "$EXTENSION_DIR" "$NATIVE_DIR" "$extension_extract_dir" "$native_extract_dir"
  mkdir -p "$EXTENSION_DIR" "$NATIVE_DIR" "$extension_extract_dir" "$native_extract_dir"

  log "Extracting extension bundle to ${extension_extract_dir}"
  unzip -q "$extension_bundle_path" -d "$extension_extract_dir"
  if [[ -d "${extension_extract_dir}/extension" ]]; then
    cp -R "${extension_extract_dir}/extension/." "$EXTENSION_DIR/"
  else
    cp -R "${extension_extract_dir}/." "$EXTENSION_DIR/"
  fi

  log "Extracting native bundle to ${native_extract_dir}"
  unzip -q "$native_bundle_path" -d "$native_extract_dir"
  if [[ -d "${native_extract_dir}/native" ]]; then
    cp -R "${native_extract_dir}/native/." "$NATIVE_DIR/"
  else
    cp -R "${native_extract_dir}/." "$NATIVE_DIR/"
  fi

  DOCKER_COMPOSE_FILE="$NATIVE_DIR/docker-compose.yml"
  ENV_FILE="$NATIVE_DIR/.env"
  ENV_EXAMPLE_FILE="$NATIVE_DIR/.env.example"
}

prepare_env_file() {
  if [[ ! -f "$ENV_EXAMPLE_FILE" ]]; then
    die "Missing $ENV_EXAMPLE_FILE"
  fi

  if [[ ! -f "$ENV_FILE" ]]; then
    log "Creating $ENV_FILE from template"
    cp "$ENV_EXAMPLE_FILE" "$ENV_FILE"
  fi

  if [[ -n "$MODELS" ]]; then
    if grep -q '^MODELS=' "$ENV_FILE"; then
      sed -i.bak "s/^MODELS=.*/MODELS=${MODELS}/" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
    else
      printf '\nMODELS=%s\n' "$MODELS" >> "$ENV_FILE"
    fi
  fi
}

start_services() {
  log "Starting local Ollama/Qdrant services"
  docker compose -f "$DOCKER_COMPOSE_FILE" --env-file "$ENV_FILE" up -d
}

wait_for_service() {
  local url="$1"
  local label="$2"
  local retries="${3:-300}"
  local sleep_seconds="${4:-1}"
  local counter=0

  log "Waiting for $label..."
  while true; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      log "$label is reachable"
      return 0
    fi

    counter=$((counter + 1))
    if [[ "$counter" -ge "$retries" ]]; then
      die "$label did not become reachable"
    fi
    sleep "$sleep_seconds"
  done
}

wait_for_ollama_models_ready() {
  local retries="${1:-300}"
  local sleep_seconds="${2:-1}"
  local counter=0

  if [[ -z "$MODELS" ]]; then
    log "No models configured; skipping model readiness wait"
    return 0
  fi

  log "Waiting for Ollama model readiness..."
  while true; do
    if docker compose -f "$DOCKER_COMPOSE_FILE" --env-file "$ENV_FILE" logs --no-color ollama 2>/dev/null | grep -Fq "Startup complete. Models are ready for inference."; then
      log "Ollama models are ready for inference"
      return 0
    fi

    counter=$((counter + 1))
    if [[ "$counter" -ge "$retries" ]]; then
      die "Ollama models did not become ready in time"
    fi
    sleep "$sleep_seconds"
  done
}

print_next_steps() {
  case "$MODE" in
    webstore)
      cat <<EOF

Next steps for Web Store flow:
1. Install the Chrome extension from the Chrome Web Store.
2. Keep this terminal open until Ollama finishes pulling the model.
3. If the extension cannot connect, verify Chrome is allowed to reach http://127.0.0.1:11434.

EOF
      ;;
    local)
      cat <<EOF

Next steps for local unpacked flow:
1. The extension bundle and native bundle have been downloaded and extracted locally.
2. Open chrome://extensions in Chrome.
3. Enable Developer Mode.
4. Click Load unpacked.
5. Select the extension directory: ${EXTENSION_DIR}.

EOF
      ;;
  esac
}

open_browser_help() {
  if [[ "$OPEN_CHROME_AFTER_SETUP" != "true" ]]; then
    return 0
  fi

  if command -v google-chrome >/dev/null 2>&1; then
    google-chrome "chrome://extensions" >/dev/null 2>&1 &
  elif command -v chromium >/dev/null 2>&1; then
    chromium "chrome://extensions" >/dev/null 2>&1 &
  else
    warn "Chrome/Chromium not found automatically. Open chrome://extensions manually."
  fi
}

main() {
  ensure_docker
  prepare_bundles
  prepare_env_file
  start_services
  wait_for_service "http://127.0.0.1:11434/api/tags" "Ollama" 600 1
  wait_for_ollama_models_ready 600 1
  wait_for_service "http://127.0.0.1:6333/collections" "Qdrant" 120 1
  print_next_steps
  open_browser_help
  log "Setup complete"
}

main "$@"
