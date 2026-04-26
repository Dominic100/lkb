Ollama Docker setup for LKB
=================================

This folder contains a Docker Compose setup to run:
- an Ollama server locally for inference
- a Qdrant vector database for RAG-ready storage

Prerequisites
- Docker (Docker Desktop or Docker Engine) installed and working
- Docker Compose v2 recommended

Files
- `docker-compose.yml` — Compose services for `ollama/ollama` and `qdrant/qdrant`.
- `entrypoint.sh` — Script run inside the container to start Ollama, pull configured model(s) if missing, and warm them up for inference.
- `.env.example` — Example environment file to set `MODELS`.

Quick start
1. Copy `.env.example` to `.env` and edit `MODELS` to the model(s) you want, comma-separated. Example:

```bash
MODELS=qwen2.5:7b
```

2. Start the container:

```bash
docker compose -f native/docker-compose.yml up -d
```

3. Confirm APIs are available:

```bash
curl http://127.0.0.1:11434/api/tags
curl http://127.0.0.1:6333/collections
```

Notes & tips
- The compose uses Docker-managed named volumes for Ollama and Qdrant persistence. No model blobs are shipped in the repository.
- The first startup will pull the configured Ollama model into the local volume; this may take a while.
- Memory note: On CPU-only machines with ~16GB RAM, `qwen2.5:7b` (quantized) can require several GBs; run with low concurrency and monitor memory during the first startup.
- The `entrypoint.sh` startup flow is sequential:
  1) start `ollama serve`
  2) wait until API is reachable
  3) pull each configured model if missing
  4) run a warmup inference for each model
  5) only then report startup complete
- Optional tuning via environment variables:
  - `OLLAMA_READY_RETRIES` (default `300`)
  - `OLLAMA_READY_INTERVAL_SEC` (default `1`)
  - `OLLAMA_WARMUP_PROMPT` (default `Reply with exactly OK.`)
- If you need to stop and remove the container:

```bash
docker compose -f native/docker-compose.yml down
```
