// src/api/qdrant-api.js
// Minimal Qdrant helpers for local RAG storage/retrieval.

const DEFAULT_QDRANT_CONFIG = {
  baseUrl: 'http://127.0.0.1:6333',
  collection: 'lkb_articles',
  chunkCollection: 'lkb_chunks',
  vectorSize: 256,
  distance: 'Cosine'
};

async function getQdrantConfig() {
  try {
    const stored = await chrome.storage.local.get(['qdrantConfig']);
    const cfg = stored.qdrantConfig || {};
    return {
      baseUrl: cfg.baseUrl || DEFAULT_QDRANT_CONFIG.baseUrl,
      collection: cfg.collection || DEFAULT_QDRANT_CONFIG.collection,
      chunkCollection: cfg.chunkCollection || DEFAULT_QDRANT_CONFIG.chunkCollection,
      vectorSize: Number.isInteger(cfg.vectorSize) ? cfg.vectorSize : DEFAULT_QDRANT_CONFIG.vectorSize,
      distance: cfg.distance || DEFAULT_QDRANT_CONFIG.distance
    };
  } catch (e) {
    return { ...DEFAULT_QDRANT_CONFIG };
  }
}

async function qdrantFetch(path, opts = {}) {
  const cfg = await getQdrantConfig();
  const url = cfg.baseUrl.replace(/\/$/, '') + path;
  return fetch(url, opts);
}

async function canUseQdrant() {
  try {
    const res = await qdrantFetch('/collections');
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function ensureQdrantCollection() {
  const cfg = await getQdrantConfig();
  return ensureQdrantCollectionByName(cfg.collection);
}

async function ensureQdrantChunkCollection() {
  const cfg = await getQdrantConfig();
  return ensureQdrantCollectionByName(cfg.chunkCollection);
}

async function ensureQdrantCollectionByName(collectionName) {
  const cfg = await getQdrantConfig();
  const body = {
    vectors: {
      size: cfg.vectorSize,
      distance: cfg.distance
    }
  };

  const res = await qdrantFetch(`/collections/${encodeURIComponent(collectionName)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Qdrant collection ensure failed: ${res.status} ${text}`);
  }

  return true;
}

async function upsertArticleVectorToQdrant(article) {
  const cfg = await getQdrantConfig();

  if (!article || !article.id || !Array.isArray(article.vector)) {
    throw new Error('Invalid article payload for Qdrant upsert');
  }

  const point = {
    id: String(article.id),
    vector: article.vector,
    payload: {
      title: article.title || '',
      url: article.url || '',
      summary: article.summary || '',
      tags: Array.isArray(article.tags) ? article.tags : [],
      dateAdded: article.dateAdded || Date.now()
    }
  };

  const res = await qdrantFetch(`/collections/${encodeURIComponent(cfg.collection)}/points`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: [point] })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Qdrant upsert failed: ${res.status} ${text}`);
  }

  return true;
}

function qdrantPointIdFromString(value) {
  // Deterministic 32-bit hash -> positive integer for Qdrant point id
  let hash = 0;
  const text = String(value || '');
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  const positive = Math.abs(hash);
  return positive === 0 ? 1 : positive;
}

async function upsertArticleChunksToQdrant(article, chunks) {
  const cfg = await getQdrantConfig();

  if (!article || !article.id) {
    throw new Error('Invalid article for chunk upsert');
  }
  if (!Array.isArray(chunks)) {
    throw new Error('Chunks must be an array');
  }

  const points = chunks
    .filter((c) => Array.isArray(c.vector) && c.vector.length > 0)
    .map((c) => {
      const chunkId = c.id || `${article.id}::${c.chunkIndex || 0}`;
      return {
        id: qdrantPointIdFromString(chunkId),
        vector: c.vector,
        payload: {
          pointType: 'chunk',
          chunkId,
          chunkIndex: c.chunkIndex || 0,
          text: c.text || '',
          articleId: String(article.id),
          articleTitle: article.title || '',
          articleUrl: article.url || '',
          dateAdded: article.dateAdded || Date.now(),
          tags: Array.isArray(article.tags) ? article.tags : []
        }
      };
    });

  if (points.length === 0) return true;

  const res = await qdrantFetch(`/collections/${encodeURIComponent(cfg.chunkCollection)}/points`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Qdrant chunk upsert failed: ${res.status} ${text}`);
  }

  return true;
}

async function searchQdrantByVector(vector, limit = 8, scoreThreshold = 0.05) {
  const cfg = await getQdrantConfig();

  if (!Array.isArray(vector)) {
    throw new Error('searchQdrantByVector requires an embedding/vector array');
  }

  const res = await qdrantFetch(`/collections/${encodeURIComponent(cfg.collection)}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vector,
      limit,
      score_threshold: scoreThreshold,
      with_payload: true
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Qdrant search failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  return Array.isArray(json?.result) ? json.result : [];
}

async function searchQdrantChunksByVector(vector, limit = 8, scoreThreshold = 0.05) {
  const cfg = await getQdrantConfig();

  if (!Array.isArray(vector)) {
    throw new Error('searchQdrantChunksByVector requires an embedding/vector array');
  }

  const res = await qdrantFetch(`/collections/${encodeURIComponent(cfg.chunkCollection)}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vector,
      limit,
      score_threshold: scoreThreshold,
      with_payload: true
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Qdrant chunk search failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  return Array.isArray(json?.result) ? json.result : [];
}

async function deleteQdrantChunksByArticleId(articleId) {
  const cfg = await getQdrantConfig();

  const res = await qdrantFetch(`/collections/${encodeURIComponent(cfg.chunkCollection)}/points/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filter: {
        must: [{ key: 'articleId', match: { value: String(articleId) } }]
      }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Qdrant chunk delete failed: ${res.status} ${text}`);
  }

  return true;
}

console.log('✓ qdrant-api module loaded');
