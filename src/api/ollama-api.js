// src/api/ollama-api.js
// Ollama API module - handles local LLM interactions and basic lifecycle (load/warm/unload)

// Default local Ollama configuration. Users can override via `chrome.storage.local` key `ollamaConfig`.
const DEFAULT_OLLAMA_CONFIG = {
  baseUrl: 'http://127.0.0.1:11434',
  summarizerModel: 'qwen2.5:7b',
  chatModel: 'qwen2.5:7b',
  embeddingModel: 'nomic-embed-text',
  embeddingDimensions: 256
};

const OLLAMA_RUNTIME_STATE_KEY = 'ollamaRuntimeState';
const DEFAULT_RUNTIME_STATE = {
  phase: 'stopped',
  loading: false,
  ready: false,
  message: 'LLM is stopped',
  updatedAt: 0
};

async function getOllamaConfig() {
  try {
    const stored = await chrome.storage.local.get(['ollamaConfig']);
    const cfg = stored.ollamaConfig || {};
    return {
      baseUrl: cfg.baseUrl || DEFAULT_OLLAMA_CONFIG.baseUrl,
      summarizerModel: cfg.summarizerModel || DEFAULT_OLLAMA_CONFIG.summarizerModel,
      chatModel: cfg.chatModel || DEFAULT_OLLAMA_CONFIG.chatModel,
      embeddingModel: cfg.embeddingModel || DEFAULT_OLLAMA_CONFIG.embeddingModel,
      embeddingDimensions: Number.isInteger(cfg.embeddingDimensions) ? cfg.embeddingDimensions : DEFAULT_OLLAMA_CONFIG.embeddingDimensions
    };
  } catch (e) {
    return DEFAULT_OLLAMA_CONFIG;
  }
}

async function ollamaFetch(path, opts = {}) {
  const cfg = await getOllamaConfig();
  const url = cfg.baseUrl.replace(/\/$/, '') + path;
  return fetch(url, opts);
}

// Helper: try to extract text from a variety of Ollama response shapes
function extractTextFromJson(json) {
  if (!json) return '';
  if (typeof json === 'string') return json;

  if (json.completion) return String(json.completion);
  if (json.text) return String(json.text);

  if (json.choices && Array.isArray(json.choices)) {
    return json.choices.map(c => c.text || c.message || '').join('');
  }

  if (json.results && Array.isArray(json.results)) {
    const parts = [];
    for (const r of json.results) {
      if (r.output) parts.push(String(r.output));
      if (r.content && Array.isArray(r.content)) {
        for (const c of r.content) {
          if (typeof c === 'string') parts.push(c);
          else if (c.text) parts.push(c.text);
          else if (c.data) parts.push(c.data);
        }
      }
    }
    if (parts.length) return parts.join('');
  }

  if (json.output && Array.isArray(json.output)) {
    return json.output.map(o => (typeof o === 'string' ? o : (o.text || o.content || ''))).join('');
  }

  try { return JSON.stringify(json); } catch (e) { return String(json); }
}

async function parseOllamaResponse(res) {
  try {
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const text = await res.text();
    if (contentType.includes('application/json')) {
      try {
        const json = JSON.parse(text);
        return extractTextFromJson(json);
      } catch (e) {
        return text;
      }
    }
    return text;
  } catch (e) {
    console.error('Error parsing Ollama response:', e);
    return '';
  }
}

function extractEmbeddingFromJson(json) {
  if (!json) return null;

  if (Array.isArray(json.embedding)) {
    return json.embedding.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  }

  if (Array.isArray(json.embeddings) && json.embeddings.length > 0) {
    const first = json.embeddings[0];
    if (Array.isArray(first)) {
      return first.map((value) => Number(value)).filter((value) => Number.isFinite(value));
    }
  }

  if (Array.isArray(json.data) && json.data.length > 0) {
    const first = json.data[0];
    if (first && Array.isArray(first.embedding)) {
      return first.embedding.map((value) => Number(value)).filter((value) => Number.isFinite(value));
    }
  }

  if (Array.isArray(json.vectors) && json.vectors.length > 0 && Array.isArray(json.vectors[0])) {
    return json.vectors[0].map((value) => Number(value)).filter((value) => Number.isFinite(value));
  }

  if (Array.isArray(json.vector)) {
    return json.vector.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  }

  return null;
}

async function generateEmbeddingVector(text, options = {}) {
  const cfg = await getOllamaConfig();
  const model = options.model || cfg.embeddingModel;
  const dimensions = Number.isInteger(options.dimensions) ? options.dimensions : cfg.embeddingDimensions;

  if (!model) {
    throw new Error('No embedding model configured');
  }

  const body = {
    model,
    input: typeof text === 'string' ? text : String(text ?? ''),
    truncate: true
  };

  if (Number.isInteger(dimensions) && dimensions > 0) {
    body.dimensions = dimensions;
  }

  const res = await ollamaFetch('/api/embed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Ollama embedding failed: ${res.status} ${errorText}`);
  }

  const json = await res.json();
  const vector = extractEmbeddingFromJson(json);

  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error('Ollama embedding response did not include a usable vector');
  }

  return vector;
}

/**
 * Summarize text using local Ollama server
 */
async function summarizeWithLLM(text, options = {}) {
  try {
    console.log('🔁 Summarize via Ollama, length:', text?.length);
    if (!text || text.length < 50) return text || 'No content to summarize';

    const cfg = await getOllamaConfig();

    const lengthHint = options.length === 'short' ? 'in 1-2 sentences' : (options.length === 'long' ? 'in 4-6 sentences' : 'in 2-4 sentences');
    const prompt = `Summarize the following text ${lengthHint}. Keep the summary factual and concise.\n\nText:\n${text}`;

    const body = {
      model: options.model || cfg.summarizerModel,
      prompt,
      max_tokens: options.maxTokens || 400,
      temperature: typeof options.temperature === 'number' ? options.temperature : 0.0,
      top_p: 0.95,
      stream: false
    };

    const res = await ollamaFetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      console.warn('Ollama summarization failed:', res.status, res.statusText);
      return fallbackSummarize(text);
    }

    const summary = (await parseOllamaResponse(res)).trim();
    return summary || fallbackSummarize(text);
  } catch (error) {
    console.error('Ollama summarization error:', error);
    return fallbackSummarize(text);
  }
}

function fallbackSummarize(text) {
  if (!text || text.length < 50) return text || 'No content to summarize';
  const sentences = text.replace(/\s+/g, ' ').split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  const n = Math.max(1, Math.min(3, Math.ceil(sentences.length / 4)));
  let summary = sentences.slice(0, n).join('. ');
  if (summary && !summary.endsWith('.')) summary += '.';
  if (summary.length < 100) summary = text.substring(0, 200) + '...';
  return summary;
}

function fallbackChat(query, articles) {
  const lowerQuery = String(query || '').toLowerCase();
  const relevant = (articles || []).filter(a => (a.title || '').toLowerCase().includes(lowerQuery) || (a.summary || '').toLowerCase().includes(lowerQuery));
  if (relevant.length) {
    const titles = relevant.slice(0, 3).map(a => `"${a.title}"`).join(', ');
    return `I found ${relevant.length} article(s) related to your query: ${titles}.`;
  }
  return `I couldn't find articles matching "${query}". Try different keywords or save more articles.`;
}

async function chatWithLLM(query, articles = [], chatHistory = [], retrievedContext = '') {
  try {
    console.log('💬 Chat via Ollama. Query:', query, 'articles:', (articles || []).length);
    if (!query) return '';

    const cfg = await getOllamaConfig();

    let historyString = 'No chat history.';
    if (chatHistory && chatHistory.length > 0) {
      const recent = chatHistory.slice(-1);
      historyString = recent.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
    }

    const kb = buildKnowledgeBaseContext(articles);

    const chunkContext = retrievedContext && retrievedContext.trim()
      ? retrievedContext.trim()
      : 'No retrieved chunks available.';

    const finalPrompt = `You are an assistant whose ONLY job is to answer questions using the provided KNOWLEDGE BASE, RETRIEVED CHUNKS, and CHAT HISTORY. Prefer RETRIEVED CHUNKS when they are relevant. If the answer cannot be found in the provided materials, respond with exactly: "I'm sorry, I couldn't find any relevant information in your knowledge base about that."\n\nKNOWLEDGE BASE:\n${kb}\n\nRETRIEVED CHUNKS:\n${chunkContext}\n\nCHAT HISTORY:\n${historyString}\n\nUser: ${query}\nAssistant:`;

    const body = {
      model: cfg.chatModel,
      prompt: finalPrompt,
      max_tokens: 600,
      temperature: 0.0,
      top_p: 0.95,
      stream: false
    };

    const res = await ollamaFetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      console.warn('Ollama chat failed:', res.status, res.statusText);
      return fallbackChat(query, articles);
    }

    const text = (await parseOllamaResponse(res)).trim();
    return text || fallbackChat(query, articles);
  } catch (e) {
    console.error('Ollama chat error:', e);
    return fallbackChat(query, articles);
  }
}

function buildKnowledgeBaseContext(articles) {
  if (!articles || articles.length === 0) return "The user hasn't saved any articles yet.";
  const context = articles.slice(0, 3).map((a, i) => `Article ${i + 1}: \"${a.title}\"\nSummary: ${a.summary || 'No summary available'}\nURL: ${a.url || 'N/A'}\n---`).join('\n\n');
  return context;
}

async function testLLMAPIs() {
  console.log('🧪 Testing Ollama connectivity');
  const avail = await canSummarize();
  const embedAvail = await canEmbed();
  console.log('📊 Ollama availability:', avail, 'embedding:', embedAvail);
  if (avail === 'available' && embedAvail === 'available') {
    try {
      const testText = 'On-device models enable private, offline summarization and assistant features.';
      const s = await summarizeWithLLM(testText, { length: 'short' });
      console.log('✅ Summarizer test result:', s);
    } catch (e) {
      console.warn('Summarizer test failed:', e);
    }

    try {
      const chat = await chatWithLLM('Say hello in five words', []);
      console.log('✅ Chat test result:', chat);
    } catch (e) {
      console.warn('Chat test failed:', e);
    }

    try {
      const embedding = await generateEmbeddingVector(testText);
      console.log('✅ Embedding test vector size:', embedding.length);
    } catch (e) {
      console.warn('Embedding test failed:', e);
    }
  }

  console.log('✅ Ollama tests complete');
}

// --- New lifecycle helpers ---
function extractModelNames(payload) {
  if (!payload) return [];

  let models = [];
  if (Array.isArray(payload)) {
    models = payload;
  } else if (Array.isArray(payload.models)) {
    models = payload.models;
  } else if (payload.model) {
    models = [payload.model];
  }

  return models
    .map((m) => {
      if (typeof m === 'string') return m;
      if (m && typeof m.name === 'string') return m.name;
      if (m && typeof m.model === 'string') return m.model;
      return '';
    })
    .filter(Boolean);
}

function modelIsAvailable(targetModel, availableModels) {
  const target = String(targetModel || '').toLowerCase();
  if (!target) return false;

  return (availableModels || []).some((m) => {
    const candidate = String(m || '').toLowerCase();
    return candidate === target || candidate.includes(target) || target.includes(candidate);
  });
}

async function fetchAvailableModels() {
  try {
    const tagsRes = await ollamaFetch('/api/tags');
    if (tagsRes.ok) {
      const tagsJson = await tagsRes.json();
      return extractModelNames(tagsJson);
    }

    const modelsRes = await ollamaFetch('/api/models');
    if (!modelsRes.ok) return null;
    const modelsJson = await modelsRes.json();
    return extractModelNames(modelsJson);
  } catch (e) {
    return null;
  }
}

async function getRuntimeState() {
  try {
    const stored = await chrome.storage.local.get([OLLAMA_RUNTIME_STATE_KEY]);
    return {
      ...DEFAULT_RUNTIME_STATE,
      ...(stored[OLLAMA_RUNTIME_STATE_KEY] || {})
    };
  } catch (e) {
    return { ...DEFAULT_RUNTIME_STATE };
  }
}

async function setRuntimeState(partialState) {
  const prev = await getRuntimeState();
  const next = {
    ...prev,
    ...(partialState || {}),
    updatedAt: Date.now()
  };
  await chrome.storage.local.set({ [OLLAMA_RUNTIME_STATE_KEY]: next });
  return next;
}

async function canSummarize() {
  const cfg = await getOllamaConfig();
  const models = await fetchAvailableModels();
  if (models === null) {
    return 'unavailable';
  }

  if (modelIsAvailable(cfg.summarizerModel, models)) return 'available';
  return 'downloadable';
}

async function canPrompt() {
  const cfg = await getOllamaConfig();
  const models = await fetchAvailableModels();
  if (models === null) {
    return 'unavailable';
  }

  if (modelIsAvailable(cfg.chatModel, models)) return 'available';
  return 'downloadable';
}

async function canEmbed() {
  const cfg = await getOllamaConfig();
  const models = await fetchAvailableModels();
  if (models === null) {
    return 'unavailable';
  }

  if (modelIsAvailable(cfg.embeddingModel, models)) return 'available';
  return 'downloadable';
}

async function isModelLoaded() {
  try {
    const r = await chrome.storage.local.get(['ollamaModelLoaded']);
    return !!r.ollamaModelLoaded;
  } catch (e) {
    return false;
  }
}

async function setModelLoaded(flag) {
  try {
    await chrome.storage.local.set({ ollamaModelLoaded: !!flag });
    return true;
  } catch (e) {
    console.warn('Error saving model loaded state:', e);
    return false;
  }
}

async function warmupModel(modelName) {
  try {
    const body = {
      model: modelName,
      prompt: 'Warmup ping',
      max_tokens: 1,
      temperature: 0.0,
      stream: false,
      keep_alive: '30m',
      options: {
        num_predict: 1
      }
    };
    const res = await ollamaFetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) return false;
    await res.text();
    return true;
  } catch (e) {
    return false;
  }
}

async function warmupEmbeddingModel(modelName) {
  try {
      const res = await ollamaFetch('/api/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          input: '',
          truncate: true,
          dimensions: (await getOllamaConfig()).embeddingDimensions
        })
      });
    if (!res.ok) return false;
    await res.text();
    return true;
  } catch (e) {
    return false;
  }
}

async function startOllama() {
  await setRuntimeState({
    phase: 'checking',
    loading: true,
    ready: false,
    message: 'Checking Ollama server and model availability...'
  });

  const cfg = await getOllamaConfig();
  const summarizerStatus = await canSummarize();
  const promptStatus = await canPrompt();
  const embedStatus = await canEmbed();

  if (summarizerStatus === 'unavailable' && promptStatus === 'unavailable' && embedStatus === 'unavailable') {
    await setModelLoaded(false);
    await setRuntimeState({
      phase: 'server-unavailable',
      loading: false,
      ready: false,
      message: 'Ollama server is unreachable.'
    });
    return { success: false, error: 'Ollama server unreachable' };
  }

  if (summarizerStatus !== 'available' || promptStatus !== 'available' || embedStatus !== 'available') {
    await setModelLoaded(false);
    await setRuntimeState({
      phase: 'model-missing',
      loading: false,
      ready: false,
      message: 'One or more configured models have not been pulled yet.'
    });
    return { success: false, error: 'Configured model is not available locally' };
  }

  await setRuntimeState({
    phase: 'warming',
    loading: true,
    ready: false,
    message: 'Loading models into memory...'
  });

  const modelsToWarm = Array.from(new Set([cfg.summarizerModel, cfg.chatModel, cfg.embeddingModel].filter(Boolean)));
  for (const modelName of modelsToWarm) {
    const warmed = modelName === cfg.embeddingModel
      ? await warmupEmbeddingModel(modelName)
      : await warmupModel(modelName);
    if (!warmed) {
      await setModelLoaded(false);
      await setRuntimeState({
        phase: 'error',
        loading: false,
        ready: false,
        message: `Failed to load model into memory: ${modelName}`
      });
      return { success: false, error: `Failed to warm model: ${modelName}` };
    }
  }

  await setModelLoaded(true);
  await setRuntimeState({
    phase: 'ready',
    loading: false,
    ready: true,
    message: 'LLM ready for inference.'
  });

  return { success: true, warmedModels: modelsToWarm };
}

async function stopOllama() {
  // There isn't a guaranteed unload endpoint for Ollama HTTP; we mark unloaded locally
  await setModelLoaded(false);
  await setRuntimeState({
    phase: 'stopped',
    loading: false,
    ready: false,
    message: 'LLM stopped.'
  });
  return { success: true };
}

async function getLLMStatus() {
  const summarizer = await canSummarize();
  const prompt = await canPrompt();
  const embedding = await canEmbed();
  const loaded = await isModelLoaded();
  const runtime = await getRuntimeState();

  let ready = !!runtime.ready;
  let loading = !!runtime.loading;
  let phase = runtime.phase;
  let message = runtime.message;

  if (!ready && loaded && summarizer === 'available' && prompt === 'available' && embedding === 'available') {
    ready = true;
    phase = 'ready';
    message = 'LLM ready for inference.';
  }

  if (!loading && !ready && summarizer === 'unavailable' && prompt === 'unavailable' && embedding === 'unavailable') {
    phase = 'server-unavailable';
    message = 'Ollama server is unreachable.';
  }

  if (!loading && !ready && (summarizer === 'downloadable' || prompt === 'downloadable' || embedding === 'downloadable')) {
    phase = 'model-missing';
    message = 'Configured models are not pulled yet.';
  }

  return {
    summarizer,
    prompt,
    embedding,
    loaded,
    ready,
    ragReady: ready,
    runtime: {
      ...runtime,
      phase,
      loading,
      ready,
      message
    }
  };
}

console.log('✓ ollama-api module loaded');
