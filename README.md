# LocalFirst Knowledge Base (LKB)

LocalFirst Knowledge Base is a privacy-first Chrome extension that saves web content, generates local summaries, and enables chat over your saved knowledge.

The extension now depends on:
- a local Ollama API server (Dockerized)
- optional local Qdrant vector DB (Dockerized) for RAG-ready storage

There is no dependency on Chrome built-in Gemini/Nano APIs.

## Architecture

- Chrome Extension (Manifest V3)
  - `src/content/content.js`: extracts page content
  - `src/background/service-worker.js`: orchestration, storage, LLM/RAG messaging
  - `src/background/storage.js`: local article storage + BM25 vector generation
  - `src/popup/*`: UI, controls, chat, status
- Ollama (Docker)
  - local inference endpoint at `http://127.0.0.1:11434`
  - startup sequence is strict: server ready -> model pull on first setup -> warmup inference -> ready
  - the model is not shipped in the repo; it is pulled into the user’s local Docker volume during setup
  - Ollama state is stored in a Docker-managed local volume, not in a bundled repo cache
- Qdrant (Docker, optional but recommended)
  - vector DB endpoint at `http://127.0.0.1:6333`
  - articles with vectors can be synced for RAG retrieval pipelines

## Key Behaviors

- LLM calls are hard-gated by readiness:
  - no summarization/chat/multi-summary until model is ready for inference
- Popup shows LLM state:
  - checking, loading, model missing, ready, unavailable
- Chat answers now include source citations and retrieval metadata in the popup UI
- If LLM is not ready when saving a page:
  - article is still saved with a pending summary placeholder

## Requirements

- Docker + Docker Compose
- Chrome/Chromium with Developer Mode enabled for extensions

## Installation options

### Option A — Chrome Web Store + GitHub Releases backend

Use this if you publish the extension to the Chrome Web Store.

1. The setup script downloads the browser extension bundle and native backend bundle directly from GitHub Releases:
   - `lkb-extension.zip`
   - `lkb-native.zip`
2. Run the setup script directly from GitHub:
   - macOS/Linux: `curl -fsSL https://raw.githubusercontent.com/Dominic100/lkb/v2/setup.sh | bash -s -- --mode webstore`
   - Windows PowerShell: `powershell -ExecutionPolicy Bypass -Command "iwr https://raw.githubusercontent.com/Dominic100/lkb/v2/setup.ps1 -OutFile $env:TEMP\setup.ps1; & $env:TEMP\setup.ps1 -Mode webstore"`
3. Install the browser extension from the Chrome Web Store.
4. Keep the local setup running the first time so Ollama can pull the model into the local Docker volume.

This flow does not require a repo clone for the user.

### Option B — Local unpacked extension + GitHub Releases backend

Use this if you do not publish to the Chrome Web Store.

1. The setup script downloads the same two release bundles:
   - `lkb-extension.zip`
   - `lkb-native.zip`
2. Run the setup script directly from GitHub:
   - macOS/Linux: `curl -fsSL https://raw.githubusercontent.com/Dominic100/lkb/v2/setup.sh | bash -s -- --mode local`
   - Windows PowerShell: `powershell -ExecutionPolicy Bypass -Command "iwr https://raw.githubusercontent.com/Dominic100/lkb/v2/setup.ps1 -OutFile $env:TEMP\setup.ps1; & $env:TEMP\setup.ps1 -Mode local"`
3. Open `chrome://extensions`.
4. Enable Developer Mode.
5. Click Load unpacked.
6. Select the extracted extension folder created by the setup script.

## Quick Start

1. Configure model(s):

```bash
cp native/.env.example native/.env
```

2. Start services:

```bash
docker compose -f native/docker-compose.yml up -d
```

3. Watch startup logs:

```bash
docker compose -f native/docker-compose.yml logs -f --tail=200
```

4. Verify services:

```bash
curl http://127.0.0.1:11434/api/tags
curl http://127.0.0.1:6333/collections
```

The first startup will pull the configured Ollama model into the local Docker volume if it is not already present.

5. Load extension:
- For Web Store installs, install the published extension and keep the local services running.
- For unpacked installs, open `chrome://extensions`, enable Developer Mode, click Load unpacked, and select the local extension folder.

## Docker Services

`native/docker-compose.yml` runs:
- `ollama` (`ollama/ollama:latest`) on `11434`
- `qdrant` (`qdrant/qdrant:latest`) on `6333`

Persistent volumes:
- Docker-managed local volumes for Ollama and Qdrant state

### Ollama startup flow (entrypoint)

`native/entrypoint.sh` enforces sequence:
1. start `ollama serve`
2. wait for server API reachability
3. pull model if missing
4. warm model with a real inference call
5. mark startup complete

Environment variables:
- `MODELS` (default: `qwen2.5:7b`)
- `OLLAMA_READY_RETRIES` (default: `300`)
- `OLLAMA_READY_INTERVAL_SEC` (default: `1`)
- `OLLAMA_WARMUP_PROMPT` (default: `Reply with exactly OK.`)
- `MODELS_SEPARATOR` (default: `,`)

## Qdrant / RAG Notes

Qdrant is included as the recommended DB for local RAG because it is:
- lightweight
- vector-native
- simple HTTP API

Scaffolding is included in:
- `src/api/qdrant-api.js`

Current integration:
- on article save/update, service worker attempts best-effort sync to Qdrant if available
- local extension storage remains the source of truth for core features

Planned next step:
- add retrieval path that queries Qdrant top-K vectors and passes those chunks to the LLM prompt context

## Configuration

You can override runtime config in extension devtools:

```js
chrome.storage.local.set({
  ollamaConfig: {
    baseUrl: 'http://127.0.0.1:11434',
    summarizerModel: 'qwen2.5:7b',
    chatModel: 'qwen2.5:7b'
  },
  qdrantConfig: {
    baseUrl: 'http://127.0.0.1:6333',
    collection: 'lkb_articles',
    vectorSize: 256,
    distance: 'Cosine'
  }
});
```

## Troubleshooting

- Model not ready:
  - check `docker compose -f native/docker-compose.yml logs -f`
  - wait for warmup completion logs
- Model missing:
  - ensure `MODELS` is set in `native/.env`
  - on first startup, wait for the pull to complete and watch compose logs
  - if you changed models, restart compose and watch pull progress
- Qdrant unavailable:
  - ensure container is running and `6333` is reachable

## License

MIT
