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

// Generate optimized BM25 vector (production-grade search)
async function generateArticleVector(article) {
  try {
    console.log(`🔄 Generating vector for: "${article.title.substring(0, 50)}..."`);
    
    const fullText = `${article.title} ${article.summary} ${article.originalText} ${(article.tags || []).join(' ')}`.substring(0, 50000);
    const vector = generateBM25Vector(fullText, article.tags, article.title);
    
    console.log(`✓ BM25 vector generated (${vector.length} dimensions)`);
    return vector;
    
  } catch (error) {
    console.error('❌ Error generating vector:', error);
    return null;
  }
}

// BM25 algorithm - industry standard for search ranking
function generateBM25Vector(text, tags = [], title = '') {
  const k1 = 1.5;  // BM25 parameter (term frequency saturation)
  const b = 0.75;  // BM25 parameter (length normalization)
  const vector = new Array(256).fill(0);
  
  // Tokenize and calculate term frequencies
  const words = text.toLowerCase().match(/\b\w+\b/g) || [];
  const titleWords = title.toLowerCase().match(/\b\w+\b/g) || [];
  
  const termFreq = {};
  const docLength = words.length;
  const avgLength = 50; // Average document length in words
  
  // Count term frequencies
  words.forEach(word => {
    if (word.length > 2) {
      termFreq[word] = (termFreq[word] || 0) + 1;
    }
  });
  
  // Map words to vector dimensions using BM25 scoring
  Object.entries(termFreq).forEach(([word, freq]) => {
    // BM25 scoring formula
    const idf = Math.log(1 + freq); // Inverse document frequency
    const tf = (freq * (k1 + 1)) / 
               (freq + k1 * (1 - b + b * (docLength / avgLength)));
    
    const bm25Score = idf * tf;
    
    // Map to vector dimensions
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash) + word.charCodeAt(i);
    }
    
    const dim1 = Math.abs(hash) % 256;
    const dim2 = Math.abs(hash >> 8) % 256;
    
    vector[dim1] = (vector[dim1] || 0) + bm25Score;
    vector[dim2] = (vector[dim2] || 0) + bm25Score * 0.5;
  });
  
  // Boost words from title (3x weight)
  titleWords.forEach(word => {
    if (word.length > 2 && termFreq[word]) {
      let hash = 0;
      for (let i = 0; i < word.length; i++) {
        hash = ((hash << 5) - hash) + word.charCodeAt(i);
      }
      const dim = Math.abs(hash) % 256;
      vector[dim] = (vector[dim] || 0) + termFreq[word] * 3.0;
    }
  });
  
  // Tag boost (2x weight)
  tags.forEach(tag => {
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
      hash = ((hash << 5) - hash) + tag.charCodeAt(i);
    }
    const dim = Math.abs(hash) % 256;
    vector[dim] = (vector[dim] || 0) + 2.0;
  });
  
  // Normalize to unit length (cosine similarity)
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return magnitude > 0 ? vector.map(v => v / magnitude) : vector;
}

// Lightweight vector generation as fallback
function generateSimpleVector(text) {
  // Hash text into a simple 128-dim vector (deterministic, repeatable)
  const words = text.toLowerCase().match(/\b\w+\b/g) || [];
  const vector = new Array(128).fill(0);
  
  words.forEach((word, idx) => {
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash) + word.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }
    
    // Map hash to vector dimensions
    const dim1 = Math.abs(hash) % 128;
    const dim2 = Math.abs(hash >> 16) % 128;
    vector[dim1] = (vector[dim1] || 0) + 1;
    vector[dim2] = (vector[dim2] || 0) + 1;
  });
  
  // Normalize vector
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return magnitude > 0 ? vector.map(v => v / magnitude) : vector;
}

// Helper: Check which embedder is available
async function checkEmbedderCapability() {
  if (self.ai?.textEmbedder) {
    console.log('✓ Chrome AI Embedder available (Gemini Nano)');
    return 'native';
  } else if (self.ai?.languageModel) {
    console.log('⚠️ Only language model available, using Gemini API');
    return 'gemini';
  } else {
    console.log('⚠️ No AI APIs available, using TF-IDF fallback');
    return 'fallback';
  }
}


/**
 * Calculates cosine similarity between two vectors.
 * Assumes vectors are normalized (which your BM25 vector is).
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  
  let dotProduct = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += (vecA[i] || 0) * (vecB[i] || 0);
  }
  
  // Since vectors are normalized, magA and magB are ~1.
  // We can just return the dot product.
  return dotProduct;
}

/**
 * Performs semantic search using vectors.
 */
async function semanticSearch(query, allArticles) {
  // 1. Generate a vector for the search query itself
  const queryVector = generateBM25Vector(query, [], query);
  
  // 2. Score all articles against the query vector
  const scoredArticles = [];
  for (const article of allArticles) {
    if (article.vector) {
      // 3. Calculate similarity
      const similarity = cosineSimilarity(queryVector, article.vector);
      
      // Set a threshold to filter out irrelevant results
      if (similarity > 0.05) { 
        scoredArticles.push({ ...article, score: similarity });
      }
    }
  }
  
  // 4. Return sorted by highest score
  return scoredArticles.sort((a, b) => b.score - a.score);
}

async function searchArticles(query) {
  try {
    const allArticles = await getAllArticles();
    const lowerQuery = query.toLowerCase().trim();
    
    if (!lowerQuery) return allArticles; // Return all if query is empty

    // ===================================
    // 1. Keyword Search
    // ===================================
    const keywordResults = allArticles.filter(article => 
      article.title.toLowerCase().includes(lowerQuery) ||
      (article.summary && article.summary.toLowerCase().includes(lowerQuery)) ||
      (article.originalText && article.originalText.toLowerCase().includes(lowerQuery)) ||
      (article.url && article.url.toLowerCase().includes(lowerQuery))
    );

    // ===================================
    // 2. Semantic (Vector) Search
    // ===================================
    const semanticResults = await semanticSearch(query, allArticles);

    // ===================================
    // 3. Combine & Rank Results
    // ===================================
    const combined = new Map();

    // Add keyword results with a base score
    keywordResults.forEach(a => {
      combined.set(a.id, { ...a, score: (combined.get(a.id)?.score || 0) + 1.0 });
    });

    // Add semantic results, adding to their score
    semanticResults.forEach(a => {
      combined.set(a.id, { ...a, score: (combined.get(a.id)?.score || 0) + a.score });
    });

    // Convert map back to array and sort by final score
    return Array.from(combined.values()).sort((a, b) => b.score - a.score);

  } catch (error) {
    console.error('Error searching articles:', error);
    throw error;
  }
}

async function findSimilarArticles(articleId, topN = 5) {
  console.log(`Finding articles similar to: ${articleId}`);
  
  // 1. Get the target article's vector
  const targetArticle = await getArticle(articleId);
  if (!targetArticle) {
    throw new Error('Target article not found.');
  }
  if (!targetArticle.vector) {
    throw new Error('Target article does not have a vector. Please re-save it.');
  }
  
  const targetVector = targetArticle.vector;
  
  // 2. Get all other articles
  const allArticles = await getAllArticles();
  
  // 3. Score all articles against the target vector
  const scoredArticles = [];
  for (const article of allArticles) {
    // Don't compare the article to itself
    if (article.id === articleId) continue;
    
    if (article.vector) {
      const similarity = cosineSimilarity(targetVector, article.vector);
      
      // Use a similarity threshold to keep results relevant
      if (similarity > 0.1) { 
        scoredArticles.push({ ...article, score: similarity });
      }
    }
  }
  
  // 4. Return the top N most similar articles
  return scoredArticles.sort((a, b) => b.score - a.score).slice(0, topN);
}

console.log('✓ Storage module loaded');
