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
  importScripts('gemini-api.js');
  console.log('✓ gemini-api.js loaded');
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
        await testGeminiAPIs();
        console.log('✅ Extension fully ready!');
      } catch (error) {
        console.warn('⚠️ Gemini APIs not available:', error.message);
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
          sendResponse({ success: true, id });
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
          await deleteArticle(message.id);
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'updateArticle':
        try {
          await updateArticle(message.id, message.updates);
          sendResponse({ success: true });
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

      case 'checkGeminiStatus':
        try {
          const summarizerStatus = await canSummarize();
          const promptStatus = await canPrompt();
          sendResponse({
            success: true,
            status: { summarizer: summarizerStatus, prompt: promptStatus }
          });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
        break;

      case 'summarizeText':
        try {
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
          const answer = await handleChatQuery(message.query, message.articles, message.chatHistory);
          sendResponse({ success: true, answer });
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

async function handleSummarize(text) {
  console.log('📝 Summarize request, text length:', text?.length);
  if (!text || text.length < 50) return text || 'No content to summarize';
  try {
    const summary = await summarizeWithGemini(text, {
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

async function handleChatQuery(query, articles, chatHistory) {
  console.log('💬 Chat query:', query, 'Articles:', articles?.length, 'History:', chatHistory?.length);
  try {
    const response = await chatWithGemini(query, articles || [], chatHistory || []);
    console.log('✓ Chat response generated');
    return response;
  } catch (error) {
    console.error('Chat error:', error);
    return 'Sorry, I encountered an error. Please try again.';
  }
}

async function handleMultiSummarize(summaries, titles) {
  try {
    const prompt = `You are analyzing multiple articles. Generate a unified insight that connects them.\n\nArticles: ${titles.join(', ')}\n\nSummaries:\n\n${summaries}\n\nGenerate a concise, insightful analysis (2-3 paragraphs) that:\n\n1. Identifies common themes\n2. Shows how these topics relate and interconnect\n3. Suggests actionable insights from the combined knowledge\nKeep it concise and focused.`;
    const response = await chatWithGemini(prompt, []);
    console.log('✅ Multi-summary generated');
    return response;
  } catch (error) {
    console.error('Multi-summarize error:', error);
    return `📊 Combined Analysis\n\nThese ${titles.length} articles explore related topics:\n${titles.map(t => `• ${t}`).join('\n')}\n\nReview them together for comprehensive understanding.`;
  }
}

console.log('✓ Service worker loaded');
