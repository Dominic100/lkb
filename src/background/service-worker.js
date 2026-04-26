// service-worker.js - Background script for LocalFirst KB Extension

console.log('Service worker loading...');

// Extension version and heartbeat intervals
const EXTENSION_VERSION = '1.1.0';
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
let heartbeatTimer = null;

// Import modules
try {
  importScripts('storage.js');
  console.log('✓ storage.js loaded');
  importScripts('../api/ollama-api.js');
  console.log('✓ ollama-api.js loaded');
  importScripts('../api/qdrant-api.js');
  console.log('✓ qdrant-api.js loaded');
} catch (error) {
  console.error('✗ Failed to load modules:', error);
}

// ============================================
// HEARTBEAT MECHANISM - Keep service worker alive
// ============================================
function startHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);

  heartbeatTimer = setInterval(async () => {
    try {
      const { articles = [] } = await chrome.storage.local.get(['articles']);
      console.log(`💓 Service worker heartbeat - Articles: ${articles.length}, Version: ${EXTENSION_VERSION}`);
    } catch (error) {
      console.warn('⚠️ Heartbeat check failed:', error.message);
    }
  }, HEARTBEAT_INTERVAL);

  console.log(`✓ Heartbeat started (${HEARTBEAT_INTERVAL}ms interval)`);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    console.log('⏹️ Heartbeat stopped');
  }
}

// ============================================
// INITIALIZATION
// ============================================
console.log('Initializing...');
(async () => {
  try {
    await initDB();
    const storageOk = await testStorage();

    if (storageOk) {
      console.log('✅ Storage ready');
      startHeartbeat();
      try {
        await testLLMAPIs();
        console.log('✅ Extension fully ready!');
      } catch (error) {
        console.warn('⚠️ LLM APIs not available:', error.message);
      }
    }
  } catch (error) {
    console.error('❌ Initialization error:', error);
  }
})();

// Extension lifecycle events
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Extension installed/updated:', details.reason);
  try {
    await initDB();
    console.log('✓ Storage initialized on install');

    chrome.contextMenus.create({
      id: 'save-to-lfkb',
      title: 'Save & Summarize to LocalFirst KB',
      contexts: ['page', 'selection', 'link']
    });

    console.log('✓ Context menu created');
    if (details.reason === 'install') console.log('🎉 Welcome to LocalFirst KB!');
    startHeartbeat();
  } catch (error) {
    console.error('✗ Error during installation:', error);
  }
});

chrome.runtime.onStartup.addListener(() => {
  console.log('🚀 Extension started');
  startHeartbeat();
  initDB().catch(err => console.error('Error:', err));
});

chrome.runtime.onSuspend?.addListener?.(() => {
  console.log('🛑 Extension suspending');
  stopHeartbeat();
});

// ============================================
// CONTEXT MENU HANDLER
// ============================================
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'save-to-lfkb') {
    console.log('📌 Context menu clicked on:', tab.title);
    try {
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        console.warn('⚠️ Cannot inject into Chrome system pages');
        return;
      }

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['src/content/content.js']
      });

      console.log('✓ Content script injected');
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'extractContent',
          selectionText: info.selectionText || null
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Error:', chrome.runtime.lastError);
          } else {
            console.log('✓ Message sent:', response);
          }
        });
      }, 100);
    } catch (error) {
      console.error('✗ Error:', error);
    }
  }
});

// ============================================
// MESSAGE HANDLER - Main communication hub
// ============================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const senderType = sender.tab ? `content script (tab ${sender.tab.id})` : 'popup';
  console.log(`📨 Message from ${senderType}:`, message.action);
  handleMessage(message, sender, sendResponse);
  return true; // async response
});

async function handleMessage(message, sender, sendResponse) {
  try {
    switch (message.action) {
      case 'checkVersion':
        sendResponse({ version: EXTENSION_VERSION });
        break;

      case 'saveArticle':
        try {
          const id = await addArticle(message.article);
          const savedArticle = await getArticle(id);
          const ragSync = await maybeSyncArticleToQdrant(savedArticle);
          sendResponse({ success: true, id, ragSync });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'getArticles':
        try {
          const articles = await getAllArticles();
          sendResponse({ success: true, articles });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'deleteArticle':
        try {
          const article = await getArticle(message.id);
          await deleteArticle(message.id);
          const ragSync = article ? await maybeDeleteArticleFromQdrant(article.id) : { synced: false, reason: 'Article not found for RAG cleanup' };
          sendResponse({ success: true, ragSync });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'updateArticle':
        try {
          await updateArticle(message.id, message.updates);
          const updatedArticle = await getArticle(message.id);
          const ragSync = await maybeSyncArticleToQdrant(updatedArticle);
          sendResponse({ success: true, ragSync });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'checkRAGDBStatus':
        try {
          if (typeof canUseQdrant !== 'function') {
            sendResponse({ success: true, status: { available: false, reason: 'Qdrant module unavailable' } });
            break;
          }

          const available = await canUseQdrant();
          const cfg = typeof getQdrantConfig === 'function' ? await getQdrantConfig() : null;
          sendResponse({
            success: true,
            status: {
              available,
              baseUrl: cfg?.baseUrl || 'http://127.0.0.1:6333',
              collection: cfg?.collection || 'lkb_articles',
              chunkCollection: cfg?.chunkCollection || 'lkb_chunks'
            }
          });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'searchArticles':
        try {
          const results = await searchArticles(message.query);
          sendResponse({ success: true, results });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'findSimilarArticles':
        try {
          const articles = await findSimilarArticles(message.articleId);
          sendResponse({ success: true, articles });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'getStorageInfo':
        try {
          const info = await getStorageInfo();
          sendResponse({ success: true, info });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'exportData':
        try {
          const exportedData = await exportAllData();
          sendResponse({ success: true, data: exportedData });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'importData':
        try {
          const importStats = await importData(message.data);
          sendResponse({ success: true, stats: importStats });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'checkLLMStatus':
        try {
          const status = await getLLMStatus();
          sendResponse({ success: true, status });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'startLLM':
        try {
          const result = await startOllama();
          if (result && result.success) {
            sendResponse({ success: true, result });
          } else {
            sendResponse({ success: false, error: result?.error || 'Failed to start LLM' });
          }
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'stopLLM':
        try {
          const result = await stopOllama();
          sendResponse({ success: true, result });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'summarizeText':
        try {
          await ensureLLMReady('summarization');
          const summary = await handleSummarize(message.text);
          sendResponse({ success: true, summary });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'generateVector':
        try {
          const vector = await generateArticleVector(message.article);
          sendResponse({ success: true, vector });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'chatQuery':
        try {
          await ensureLLMReady('chat');
          const result = await handleChatQuery(message.query, message.articles, message.chatHistory);
          sendResponse({
            success: true,
            answer: typeof result === 'string' ? result : result?.answer || '',
            citations: typeof result === 'string' ? [] : result?.citations || [],
            retrievedChunks: typeof result === 'string' ? [] : result?.retrievedChunks || []
          });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'saveChatSession':
        try {
          const sessionId = await saveChatSession(message.session);
          sendResponse({ success: true, id: sessionId });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'getChatSessions':
        try {
          const sessions = await getAllChatSessions();
          sendResponse({ success: true, sessions });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'getChatSession':
        try {
          const session = await getChatSession(message.id);
          sendResponse({ success: true, session });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'deleteChatSession':
        try {
          await deleteChatSession(message.id);
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'multiSummarize':
        try {
          await ensureLLMReady('multi-summary');
          const insights = await handleMultiSummarize(message.summaries, message.titles);
          sendResponse({ success: true, insights });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function ensureLLMReady(actionName) {
  const status = await getLLMStatus();
  if (status.ready) return status;

  const reason = status?.runtime?.message || 'LLM is not ready yet.';
  throw new Error(`${reason} Start the LLM and wait for ready status before using ${actionName}.`);
}

async function maybeSyncArticleToQdrant(article) {
  if (!article || !Array.isArray(article.vector)) {
    return { synced: false, reason: 'Article has no vector to sync' };
  }

  if (typeof canUseQdrant !== 'function') {
    return { synced: false, reason: 'Qdrant module unavailable' };
  }

  try {
    const available = await canUseQdrant();
    if (!available) {
      return { synced: false, reason: 'Qdrant is not reachable' };
    }

    await ensureQdrantCollection();
    await ensureQdrantChunkCollection();
    await upsertArticleVectorToQdrant(article);

    const chunks = buildArticleChunks(article);
    await saveArticleChunksLocally(article.id, chunks);

    // Re-index chunks for this article id to avoid stale chunk payloads.
    await deleteQdrantChunksByArticleId(article.id);
    await upsertArticleChunksToQdrant(article, chunks);

    return { synced: true, chunksIndexed: chunks.length };
  } catch (error) {
    console.warn('Qdrant sync failed:', error.message);
    return { synced: false, reason: error.message };
  }
}

async function maybeDeleteArticleFromQdrant(articleId) {
  if (!articleId) return { synced: false, reason: 'No article id provided' };
  if (typeof canUseQdrant !== 'function') {
    return { synced: false, reason: 'Qdrant module unavailable' };
  }

  try {
    const available = await canUseQdrant();
    if (available && typeof deleteQdrantChunksByArticleId === 'function') {
      await deleteQdrantChunksByArticleId(articleId);
    }
    await deleteArticleChunksLocally(articleId);
    return { synced: true };
  } catch (error) {
    console.warn('Qdrant delete failed:', error.message);
    return { synced: false, reason: error.message };
  }
}

function buildArticleChunks(article, maxChars = 2200, overlapChars = 250) {
  const text = String(article?.originalText || article?.summary || '').trim();
  if (!text) {
    return [];
  }

  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const chunks = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < normalized.length) {
    let end = Math.min(start + maxChars, normalized.length);

    if (end < normalized.length) {
      const window = normalized.slice(start, end);
      const sentenceCut = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '));
      if (sentenceCut > maxChars * 0.5) {
        end = start + sentenceCut + 1;
      } else {
        const spaceCut = window.lastIndexOf(' ');
        if (spaceCut > maxChars * 0.5) {
          end = start + spaceCut;
        }
      }
    }

    const chunkText = normalized.slice(start, end).trim();
    if (chunkText.length > 0) {
      const vector = generateBM25Vector(chunkText, article.tags || [], article.title || '');
      chunks.push({
        id: `${article.id}::${chunkIndex}`,
        articleId: article.id,
        chunkIndex,
        text: chunkText,
        vector
      });
      chunkIndex += 1;
    }

    if (end >= normalized.length) break;
    start = Math.max(end - overlapChars, start + 1);
  }

  return chunks;
}

async function saveArticleChunksLocally(articleId, chunks) {
  const result = await chrome.storage.local.get(['articleChunks']);
  const articleChunks = result.articleChunks || {};
  articleChunks[String(articleId)] = chunks;
  await chrome.storage.local.set({ articleChunks });
}

async function deleteArticleChunksLocally(articleId) {
  const result = await chrome.storage.local.get(['articleChunks']);
  const articleChunks = result.articleChunks || {};
  delete articleChunks[String(articleId)];
  await chrome.storage.local.set({ articleChunks });
}

async function getTopRelevantChunksForQuery(query, limit = 8) {
  if (!query || typeof canUseQdrant !== 'function' || typeof searchQdrantChunksByVector !== 'function') {
    return [];
  }

  const available = await canUseQdrant();
  if (!available) return [];

  const queryVector = generateBM25Vector(String(query), [], String(query));
  const hits = await searchQdrantChunksByVector(queryVector, limit, 0.03);

  return hits.map((hit) => {
    const payload = hit.payload || {};
    return {
      score: hit.score,
      articleId: payload.articleId,
      articleTitle: payload.articleTitle,
      articleUrl: payload.articleUrl,
      chunkIndex: payload.chunkIndex,
      text: payload.text
    };
  });
}

function buildRetrievedChunkContext(chunks) {
  if (!chunks || chunks.length === 0) return '';

  return chunks
    .slice(0, 8)
    .map((c, i) => {
      const score = typeof c.score === 'number' ? c.score.toFixed(3) : 'n/a';
      return [
        `Chunk ${i + 1} (score: ${score})`,
        `Source: ${c.articleTitle || 'Untitled'} (${c.articleUrl || 'N/A'})`,
        `Text: ${c.text || ''}`,
        '---'
      ].join('\n');
    })
    .join('\n\n');
}

async function handleSummarize(text) {
  console.log('📝 Summarize request, text length:', text?.length);
  if (!text || text.length < 50) return text || 'No content to summarize';
  try {
    const summary = await summarizeWithLLM(text, {
      type: 'key-points',
      length: 'medium',
      format: 'plain-text'
    });
    console.log('✓ Summary generated, length:', summary.length);
    return summary;
  } catch (error) {
    console.error('Summarization error:', error);
    return 'Error generating summary';
  }
}

function buildCitationMetadata(retrievedChunks) {
  return (retrievedChunks || []).map((chunk, index) => ({
    label: `C${index + 1}`,
    articleId: chunk.articleId || '',
    articleTitle: chunk.articleTitle || 'Untitled',
    articleUrl: chunk.articleUrl || '',
    chunkIndex: Number.isInteger(chunk.chunkIndex) ? chunk.chunkIndex : index,
    excerpt: String(chunk.text || '').slice(0, 240),
    score: typeof chunk.score === 'number' ? chunk.score : 0
  }));
}

async function handleChatQuery(query, articles, chatHistory) {
  console.log('💬 Chat query:', query, 'Articles:', articles?.length, 'History:', chatHistory?.length);
  try {
    const retrievedChunks = await getTopRelevantChunksForQuery(query, 8);
    const citations = buildCitationMetadata(retrievedChunks);
    const retrievedContext = buildRetrievedChunkContext(retrievedChunks);

    const response = await chatWithLLM(query, articles || [], chatHistory || [], retrievedContext);
    console.log('✓ Chat response generated');

    if (typeof response === 'string') {
      return {
        answer: response,
        citations,
        retrievedChunks,
        retrieval: {
          chunkCount: retrievedChunks.length,
          citationCount: citations.length,
          usedFallback: true
        }
      };
    }

    return {
      answer: response.answer || '',
      citations: response.citations || citations,
      retrievedChunks: response.retrievedChunks || citations,
      retrieval: response.retrieval || {
        chunkCount: retrievedChunks.length,
        citationCount: citations.length,
        usedFallback: false
      }
    };
  } catch (error) {
    console.error('Chat error:', error);
    return {
      answer: 'Sorry, I encountered an error. Please try again.',
      citations: [],
      retrievedChunks: [],
      retrieval: {
        chunkCount: 0,
        citationCount: 0,
        usedFallback: false
      }
    };
  }
}

async function handleMultiSummarize(summaries, titles) {
  try {
    const prompt = `You are analyzing multiple articles. Generate a unified insight that connects them.\n\nArticles: ${titles.join(', ')}\n\nSummaries:\n\n${summaries}\n\nGenerate a concise, insightful analysis (2-3 paragraphs) that:\n\n1. Identifies common themes\n2. Shows how these topics relate and interconnect\n3. Suggests actionable insights from the combined knowledge\nKeep it concise and focused.`;
    const response = await chatWithLLM(prompt, []);
    console.log('✅ Multi-summary generated');
    return typeof response === 'string' ? response : response.answer || '';
  } catch (error) {
    console.error('Multi-summarize error:', error);
    return `📊 Combined Analysis\n\nThese ${titles.length} articles explore related topics:\n${titles.map(t => `• ${t}`).join('\n')}\n\nReview them together for comprehensive understanding.`;
  }
}

console.log('✓ Service worker loaded');
