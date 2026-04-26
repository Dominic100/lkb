// storage.js - Chrome Storage API wrapper for LocalFirst KB Extension

console.log('Storage module loading...');

async function initDB() {
  console.log('Storage initialized (using chrome.storage.local)');
  return true;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// ============================================
// ARTICLES CRUD OPERATIONS
// ============================================

async function addArticle(article) {
  try {
    const articleData = {
      id: article.id || generateId(),
      title: article.title || 'Untitled',
      url: article.url || '',
      originalText: article.originalText || '',
      summary: article.summary || '',
      dateAdded: article.dateAdded || Date.now(),
      tags: article.tags || [],
      notes: article.notes || '',
      encrypted: article.encrypted || false,
      encryptionIV: article.encryptionIV || null
    };

    console.log('📝 Saving article...');

    // CHECK: If vector already exists (from content.js or popup.js), use it
    if (article.vector) {
      console.log('✓ Using precomputed vector from caller');
      articleData.vector = article.vector;
    } else {
      // FALLBACK: Generate vector if not precomputed
      console.log('📊 Generating vector as fallback...');
      articleData.vector = await generateArticleVector(articleData);
    }

    // Save to storage
    const result = await chrome.storage.local.get(['articles']);
    const articles = result.articles || [];
    articles.unshift(articleData);
    await chrome.storage.local.set({ articles });

    console.log('✅ Article added:', articleData.id);
    return articleData.id;

  } catch (error) {
    console.error('Error adding article:', error);
    throw error;
  }
}

async function getArticle(id) {
  try {
    const result = await chrome.storage.local.get(['articles']);
    const articles = result.articles || [];
    return articles.find(a => a.id === id) || null;
  } catch (error) {
    console.error('Error getting article:', error);
    throw error;
  }
}

async function getAllArticles() {
  try {
    const result = await chrome.storage.local.get(['articles']);
    const articles = result.articles || [];
    return articles.sort((a, b) => b.dateAdded - a.dateAdded);
  } catch (error) {
    console.error('Error getting all articles:', error);
    throw error;
  }
}

async function updateArticle(id, updates) {
  try {
    const result = await chrome.storage.local.get(['articles']);
    const articles = result.articles || [];
    
    const index = articles.findIndex(a => a.id === id);
    if (index === -1) {
      throw new Error('Article not found');
    }
    
    articles[index] = { ...articles[index], ...updates };
    await chrome.storage.local.set({ articles });
    
    console.log('Article updated:', id);
    return true;
  } catch (error) {
    console.error('Error updating article:', error);
    throw error;
  }
}

async function deleteArticle(id) {
  try {
    const result = await chrome.storage.local.get(['articles']);
    const articles = result.articles || [];
    const filtered = articles.filter(a => a.id !== id);
    await chrome.storage.local.set({ articles: filtered });
    
    console.log('Article deleted:', id);
    return true;
  } catch (error) {
    console.error('Error deleting article:', error);
    throw error;
  }
}

async function getArticlesCount() {
  try {
    const result = await chrome.storage.local.get(['articles']);
    const articles = result.articles || [];
    return articles.length;
  } catch (error) {
    console.error('Error counting articles:', error);
    throw error;
  }
}

async function clearAllArticles() {
  try {
    await chrome.storage.local.set({ articles: [] });
    console.log('All articles cleared');
    return true;
  } catch (error) {
    console.error('Error clearing articles:', error);
    throw error;
  }
}

// ============================================
// CHAT SESSIONS OPERATIONS
// ============================================

async function saveChatSession(session) {
  try {
    const sessionData = {
      id: session.id || generateId(),
      dateCreated: session.dateCreated || Date.now(),
      title: session.title || 'Chat Session',
      messages: session.messages || [],
      sourceArticles: session.sourceArticles || []
    };
    
    const result = await chrome.storage.local.get(['chatSessions']);
    const sessions = result.chatSessions || [];
    
    const existingIndex = sessions.findIndex(s => s.id === sessionData.id);
    if (existingIndex !== -1) {
      sessions[existingIndex] = sessionData;
    } else {
      sessions.unshift(sessionData);
    }
    
    await chrome.storage.local.set({ chatSessions: sessions });
    console.log('Chat session saved:', sessionData.id);
    return sessionData.id;
  } catch (error) {
    console.error('Error saving chat session:', error);
    throw error;
  }
}

async function getAllChatSessions() {
  try {
    const result = await chrome.storage.local.get(['chatSessions']);
    const sessions = result.chatSessions || [];
    return sessions.sort((a, b) => b.dateCreated - a.dateCreated);
  } catch (error) {
    console.error('Error getting chat sessions:', error);
    throw error;
  }
}

async function getChatSession(id) {
  try {
    const result = await chrome.storage.local.get(['chatSessions']);
    const sessions = result.chatSessions || [];
    return sessions.find(s => s.id === id) || null;
  } catch (error) {
    console.error('Error getting chat session:', error);
    throw error;
  }
}

async function deleteChatSession(id) {
  try {
    const result = await chrome.storage.local.get(['chatSessions']);
    const sessions = result.chatSessions || [];
    const filtered = sessions.filter(s => s.id !== id);
    await chrome.storage.local.set({ chatSessions: filtered });
    console.log('Chat session deleted:', id);
    return true;
  } catch (error) {
    console.error('Error deleting chat session:', error);
    throw error;
  }
}

// ============================================
// METADATA OPERATIONS
// ============================================

async function setMetadata(key, value) {
  try {
    const metadataKey = `metadata_${key}`;
    await chrome.storage.local.set({ [metadataKey]: value });
    return true;
  } catch (error) {
    console.error('Error setting metadata:', error);
    throw error;
  }
}

async function getMetadata(key) {
  try {
    const metadataKey = `metadata_${key}`;
    const result = await chrome.storage.local.get([metadataKey]);
    return result[metadataKey] || null;
  } catch (error) {
    console.error('Error getting metadata:', error);
    throw error;
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

async function getStorageInfo() {
  try {
    const bytesInUse = await chrome.storage.local.getBytesInUse();
    const quota = 10 * 1024 * 1024;
    
    return {
      usage: bytesInUse,
      quota: quota,
      usageInMB: (bytesInUse / (1024 * 1024)).toFixed(2),
      quotaInMB: (quota / (1024 * 1024)).toFixed(2),
      percentUsed: ((bytesInUse / quota) * 100).toFixed(2)
    };
  } catch (error) {
    console.error('Error getting storage info:', error);
    return null;
  }
}

async function exportAllData() {
  try {
    const articles = await getAllArticles();
    const sessions = await getAllChatSessions();
    
    return {
      version: 1,
      exportDate: new Date().toISOString(),
      articles,
      chatSessions: sessions,
      metadata: {}
    };
  } catch (error) {
    console.error('Error exporting data:', error);
    throw error;
  }
}

async function importData(data) {
  const stats = {
    articlesImported: 0,
    sessionsImported: 0,
    errors: []
  };
  
  try {
    if (data.articles && Array.isArray(data.articles)) {
      for (const article of data.articles) {
        try {
          await addArticle(article);
          stats.articlesImported++;
        } catch (error) {
          stats.errors.push(`Failed to import article: ${article.title}`);
        }
      }
    }
    
    if (data.chatSessions && Array.isArray(data.chatSessions)) {
      for (const session of data.chatSessions) {
        try {
          await saveChatSession(session);
          stats.sessionsImported++;
        } catch (error) {
          stats.errors.push(`Failed to import session: ${session.title}`);
        }
      }
    }
    
    return stats;
  } catch (error) {
    console.error('Error importing data:', error);
    throw error;
  }
}

async function testStorage() {
  try {
    console.log('🧪 Testing storage operations...');
    
    const testArticle = {
      title: 'Test Article - ' + new Date().toLocaleTimeString(),
      url: 'https://test.com',
      summary: 'This is a test article to verify storage is working',
      originalText: 'Test content for storage verification',
      dateAdded: Date.now(),
      tags: ['test'],
      encrypted: false
    };
    
    const id = await addArticle(testArticle);
    console.log('✓ Test article added with ID:', id);
    
    const retrieved = await getArticle(id);
    console.log('✓ Test article retrieved:', retrieved.title);
    
    const all = await getAllArticles();
    console.log('✓ Total articles:', all.length);
    
    const info = await getStorageInfo();
    console.log('✓ Storage usage:', info.usageInMB + 'MB / ' + info.quotaInMB + 'MB');
    
    console.log('✅ Storage is working correctly!');
    return true;
  } catch (error) {
    console.error('❌ Storage test failed:', error);
    return false;
  }
}

const FALLBACK_VECTOR_SIZE = 256;
const EMBEDDING_TEXT_LIMIT = 12000;

function normalizeVector(vector) {
  if (!Array.isArray(vector) || vector.length === 0) return [];
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + (Number(value) || 0) ** 2, 0));
  if (!magnitude) return vector.map(() => 0);
  return vector.map((value) => Number(value) / magnitude);
}

function buildEmbeddingText(source, tags = [], title = '') {
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    const article = source;
    const parts = [
      article.title || '',
      article.summary || '',
      article.originalText || '',
      Array.isArray(article.tags) ? article.tags.join(' ') : '',
      article.notes || ''
    ];
    return parts.filter(Boolean).join('\n\n').replace(/\s+/g, ' ').trim().slice(0, EMBEDDING_TEXT_LIMIT);
  }

  const parts = [
    title || '',
    Array.isArray(tags) ? tags.join(' ') : '',
    String(source || '')
  ];

  return parts.filter(Boolean).join('\n\n').replace(/\s+/g, ' ').trim().slice(0, EMBEDDING_TEXT_LIMIT);
}

async function tryGenerateEmbeddingVector(text) {
  if (typeof generateEmbeddingVector !== 'function') return null;

  try {
    const vector = await generateEmbeddingVector(text);
    return Array.isArray(vector) ? normalizeVector(vector) : null;
  } catch (error) {
    console.warn('Embedding generation failed, falling back to local vectorization:', error.message);
    return null;
  }
}

async function generateArticleVector(article) {
  try {
    const title = article?.title || 'Untitled';
    console.log(`🔄 Generating vector for: "${title.substring(0, 50)}..."`);

    const embeddingText = buildEmbeddingText(article);
    const vector = (await tryGenerateEmbeddingVector(embeddingText)) || generateSimpleVector(embeddingText);

    console.log(`✓ Vector generated (${vector.length} dimensions)`);
    return vector;
  } catch (error) {
    console.error('❌ Error generating vector:', error);
    return generateSimpleVector(buildEmbeddingText(article));
  }
}

async function generateBM25Vector(text, tags = [], title = '') {
  const embeddingText = buildEmbeddingText(text, tags, title);
  const vector = (await tryGenerateEmbeddingVector(embeddingText)) || generateSimpleVector(embeddingText);
  return vector;
}

function generateSimpleVector(text) {
  const tokens = String(text || '')
    .toLowerCase()
    .match(/\b[\p{L}\p{N}]+\b/gu) || String(text || '').toLowerCase().match(/\b\w+\b/g) || [];
  const vector = new Array(FALLBACK_VECTOR_SIZE).fill(0);

  if (tokens.length === 0) return vector;

  tokens.forEach((token, index) => {
    let hash = 2166136261;
    for (let i = 0; i < token.length; i++) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    const dim1 = Math.abs(hash) % FALLBACK_VECTOR_SIZE;
    const dim2 = Math.abs((hash >>> 16) ^ (hash << 5)) % FALLBACK_VECTOR_SIZE;
    const weight = 1 + Math.min(token.length, 12) / 12 + (index < 12 ? 0.25 : 0);

    vector[dim1] += weight;
    vector[dim2] += weight * 0.5;
  });

  return normalizeVector(vector);
}

async function checkEmbedderCapability() {
  try {
    const status = await canEmbed?.();
    if (status === 'available') {
      console.log('ℹ️ Ollama embeddings are available');
      return 'available';
    }
    if (status === 'downloadable') {
      console.log('ℹ️ Ollama embedding model needs to be pulled');
      return 'downloadable';
    }
  } catch (error) {
    console.warn('Embedding capability check failed:', error.message);
  }

  console.log('ℹ️ Using fallback local vectorization');
  return 'fallback';
}

/**
 * Calculates cosine similarity between two vectors.
 * Assumes vectors are normalized.
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;

  let dotProduct = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += (vecA[i] || 0) * (vecB[i] || 0);
  }

  return dotProduct;
}

function articleTextForSearch(article) {
  return [
    article.title || '',
    article.summary || '',
    article.originalText || '',
    article.notes || '',
    Array.isArray(article.tags) ? article.tags.join(' ') : ''
  ].join(' ').toLowerCase();
}

function keywordScore(article, query) {
  const articleText = articleTextForSearch(article);
  const title = String(article.title || '').toLowerCase();
  const lowerQuery = String(query || '').toLowerCase().trim();

  if (!lowerQuery) return 0;

  let score = 0;
  if (title.includes(lowerQuery)) score += 1.5;
  if (articleText.includes(lowerQuery)) score += 1.0;

  const terms = lowerQuery.split(/\s+/).filter(Boolean);
  for (const term of terms) {
    if (term.length < 2) continue;
    if (title.includes(term)) score += 0.25;
    if (articleText.includes(term)) score += 0.15;
  }

  return Math.min(score, 2.5);
}

/**
 * Performs semantic search using embeddings and keyword boosts.
 */
async function semanticSearch(query, allArticles) {
  const queryVector = await generateBM25Vector(query, [], query);

  const scoredArticles = [];
  for (const article of allArticles) {
    const articleVector = Array.isArray(article.vector) && article.vector.length === queryVector.length
      ? article.vector
      : await generateArticleVector(article);

    if (!Array.isArray(articleVector) || articleVector.length !== queryVector.length) {
      continue;
    }

    const similarity = cosineSimilarity(queryVector, articleVector);
    const combinedScore = similarity * 0.85 + keywordScore(article, query) * 0.15;

    if (combinedScore > 0.05) {
      scoredArticles.push({ ...article, score: combinedScore });
    }
  }

  return scoredArticles.sort((a, b) => b.score - a.score);
}

async function searchArticles(query) {
  try {
    const allArticles = await getAllArticles();
    const lowerQuery = String(query || '').toLowerCase().trim();

    if (!lowerQuery) return allArticles;

    const keywordResults = allArticles
      .map((article) => ({
        ...article,
        score: keywordScore(article, lowerQuery)
      }))
      .filter((article) => article.score > 0);

    const semanticResults = await semanticSearch(query, allArticles);
    const combined = new Map();

    for (const article of keywordResults) {
      combined.set(article.id, { ...article, score: (combined.get(article.id)?.score || 0) + article.score });
    }

    for (const article of semanticResults) {
      combined.set(article.id, { ...article, score: (combined.get(article.id)?.score || 0) + article.score });
    }

    return Array.from(combined.values())
      .sort((a, b) => b.score - a.score)
      .map((article) => ({
        ...article,
        searchScore: article.score
      }));
  } catch (error) {
    console.error('Error searching articles:', error);
    throw error;
  }
}

async function findSimilarArticles(articleId, topN = 5) {
  console.log(`Finding articles similar to: ${articleId}`);

  const targetArticle = await getArticle(articleId);
  if (!targetArticle) {
    throw new Error('Target article not found.');
  }

  const targetVector = Array.isArray(targetArticle.vector) ? targetArticle.vector : await generateArticleVector(targetArticle);

  if (!Array.isArray(targetVector) || targetVector.length === 0) {
    throw new Error('Target article does not have a usable vector yet. Please re-save it.');
  }

  const allArticles = await getAllArticles();
  const scoredArticles = [];

  for (const article of allArticles) {
    if (article.id === articleId) continue;

    const articleVector = Array.isArray(article.vector) && article.vector.length === targetVector.length
      ? article.vector
      : await generateArticleVector(article);

    if (!Array.isArray(articleVector) || articleVector.length !== targetVector.length) {
      continue;
    }

    const similarity = cosineSimilarity(targetVector, articleVector);
    const combinedScore = similarity * 0.9 + keywordScore(article, targetArticle.title || '') * 0.1;

    if (combinedScore > 0.08) {
      scoredArticles.push({ ...article, score: combinedScore });
    }
  }

  return scoredArticles.sort((a, b) => b.score - a.score).slice(0, topN);
}

console.log('✓ Storage module loaded');
