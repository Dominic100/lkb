// popup.js - LocalFirst Knowledge Base Extension

// DOM elements
const saveCurrentPageBtn = document.getElementById('saveCurrentPage');
const multiSummarizeBtn = document.getElementById('multiSummarizeBtn');
const chatButton = document.getElementById('chatButton');
const llmToggleBtn = document.getElementById('llmToggleBtn');
const llmStatusBadge = document.getElementById('llmStatus');
const llmLoadingIndicator = document.getElementById('llmLoadingIndicator');
const llmLoadingText = document.getElementById('llmLoadingText');
const searchInput = document.getElementById('searchInput');
const articlesList = document.getElementById('articlesList');
const emptyState = document.getElementById('emptyState');
const articleCount = document.getElementById('articleCount');
const settingsButton = document.getElementById('settingsButton');
const exportButton = document.getElementById('exportButton');
const importButton = document.getElementById('importButton');
const tagFilterContainer = document.getElementById('tagFilterContainer');
const tagFilterList = document.getElementById('tagFilterList');
const clearTagsBtn = document.getElementById('clearTagsBtn');
const insightsBtn = document.getElementById('insightsBtn');
const insightsModal = document.getElementById('insightsModal');
const closeInsightsBtn = document.getElementById('closeInsightsBtn');
const notesModal = document.getElementById('notesModal');
const closeNotesBtn = document.getElementById('closeNotesBtn');
const noteArticleTitle = document.getElementById('noteArticleTitle');
const noteTextarea = document.getElementById('noteTextarea');
const rephraseNoteBtn = document.getElementById('rephraseNoteBtn');
const saveNoteBtn = document.getElementById('saveNoteBtn');
const articleViewModal = document.getElementById('articleViewModal');
const closeArticleViewBtn = document.getElementById('closeArticleViewBtn');
const articleViewTitle = document.getElementById('articleViewTitle');
const articleViewContent = document.getElementById('articleViewContent');
const openInTabBtn = document.getElementById('openInTabBtn');
const openSourceUrlBtn = document.getElementById('openSourceUrlBtn');

// Chat view elements
const chatView = document.getElementById('chatView');
const backToListBtn = document.getElementById('backToList');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChat');

// State
let articles = [];
let filteredArticles = [];
let currentChatSession = null;
let chatMessagesArray = [];
let selectedArticles = new Set();
let selectedTags = new Set();
let currentEditingArticleId = null;
let currentArticleForView = null;
let currentLLMStatus = null;
let llmStatusPoller = null;
const defaultChatInputPlaceholder = chatInput?.placeholder || 'Ask me anything about your saved knowledge...';

// Initialize on popup load
document.addEventListener('DOMContentLoaded', async () => {
  await loadArticles();
  renderArticles();
  setupEventListeners();
  await checkLLMStatus();

  if (llmStatusPoller) clearInterval(llmStatusPoller);
  llmStatusPoller = setInterval(() => {
    checkLLMStatus();
  }, 5000);
});

window.addEventListener('unload', () => {
  if (llmStatusPoller) {
    clearInterval(llmStatusPoller);
    llmStatusPoller = null;
  }
});

// Setup event listeners
function setupEventListeners() {
  if (saveCurrentPageBtn) saveCurrentPageBtn.addEventListener('click', handleSaveCurrentPage);
  if (chatButton) chatButton.addEventListener('click', showChatView);
  if (llmToggleBtn) llmToggleBtn.addEventListener('click', handleLLMToggle);
  if (backToListBtn) backToListBtn.addEventListener('click', showArticlesView);
  if (searchInput) searchInput.addEventListener('input', handleSearch);
  if (sendChatBtn) sendChatBtn.addEventListener('click', handleSendChat);
  if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleSendChat();
    });
  }
  if (settingsButton) settingsButton.addEventListener('click', handleSettings);
  if (exportButton) exportButton.addEventListener('click', handleExport);
  if (importButton) importButton.addEventListener('click', handleImport);
  if (clearTagsBtn) clearTagsBtn.addEventListener('click', clearTagFilters);
  if (insightsBtn) insightsBtn.addEventListener('click', showInsights);
  if (closeInsightsBtn) closeInsightsBtn.addEventListener('click', hideInsights);
  if (closeNotesBtn) closeNotesBtn.addEventListener('click', hideNotesModal);
  if (saveNoteBtn) saveNoteBtn.addEventListener('click', handleSaveNote);
  if (rephraseNoteBtn) rephraseNoteBtn.addEventListener('click', handleRephraseNote);
  if (closeArticleViewBtn) closeArticleViewBtn.addEventListener('click', hideArticleModal);
  if (openInTabBtn) openInTabBtn.addEventListener('click', handleViewInNewTab);
  if (openSourceUrlBtn) openSourceUrlBtn.addEventListener('click', handleOpenSourceUrl);

  insightsModal?.addEventListener('click', (e) => {
    if (e.target === insightsModal) hideInsights();
  });

  notesModal?.addEventListener('click', (e) => {
    if (e.target === notesModal) hideNotesModal();
  });
  
  console.log('✓ Event listeners attached');
}

// LLM runtime status check
async function checkLLMStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'checkLLMStatus' });
    const statusBadge = llmStatusBadge;

    if (response && response.success && statusBadge) {
      const status = response.status;
      currentLLMStatus = status;

      statusBadge.classList.remove('hidden', 'available', 'downloading', 'unavailable');

      if (status.ready) {
        statusBadge.classList.add('available');
        statusBadge.querySelector('.status-icon').textContent = '⚡';
        statusBadge.querySelector('.status-text').textContent = 'LLM Ready';
      } else if (status.runtime?.loading) {
        statusBadge.classList.add('downloading');
        statusBadge.querySelector('.status-icon').textContent = '⏳';
        statusBadge.querySelector('.status-text').textContent = status.runtime?.message || 'LLM loading...';
      } else if (status.runtime?.phase === 'model-missing' || status.summarizer === 'downloadable' || status.prompt === 'downloadable') {
        statusBadge.classList.add('downloading');
        statusBadge.querySelector('.status-icon').textContent = '💾';
        statusBadge.querySelector('.status-text').textContent = status.runtime?.message || 'Model not pulled yet';
      } else {
        statusBadge.classList.add('unavailable');
        statusBadge.querySelector('.status-icon').textContent = '🔌';
        statusBadge.querySelector('.status-text').textContent = status.runtime?.message || 'LLM unavailable';
      }

      // Update LLM toggle button label
      if (llmToggleBtn) {
        const loading = !!status.runtime?.loading;
        const readyOrLoaded = !!status.ready || !!status.loaded;
        llmToggleBtn.disabled = loading;
        llmToggleBtn.textContent = loading
          ? '⏳ Loading LLM...'
          : (readyOrLoaded ? '⏹️ Stop LLM' : '▶️ Start LLM');
      }

      setLLMActionAvailability(status);
      renderLLMLoadingIndicator(status);
    }
  } catch (error) {
    console.error('Error checking LLM status:', error);
    setLLMActionAvailability({ ready: false, runtime: { loading: false } });
    renderLLMLoadingIndicator({ ready: false, runtime: { loading: false, message: 'LLM unavailable' } });
  }
}

function renderLLMLoadingIndicator(status) {
  if (!llmLoadingIndicator || !llmLoadingText) return;

  const loading = !!status?.runtime?.loading;
  if (!loading) {
    llmLoadingIndicator.classList.add('hidden');
    return;
  }

  const phase = status?.runtime?.phase || 'loading';
  const phaseLabelMap = {
    checking: 'Checking Ollama server and model availability...',
    warming: 'Loading model into memory...',
    'server-unavailable': 'Waiting for Ollama server...',
    'model-missing': 'Model not found locally. Pulling model...',
    loading: 'LLM is loading...'
  };

  llmLoadingText.textContent = status?.runtime?.message || phaseLabelMap[phase] || 'LLM is loading...';
  llmLoadingIndicator.classList.remove('hidden');
}

function setLLMActionAvailability(status) {
  const ready = !!status?.ready;
  const loading = !!status?.runtime?.loading;
  const disableLLMActions = !ready;

  if (chatButton) chatButton.disabled = disableLLMActions;
  if (sendChatBtn) sendChatBtn.disabled = disableLLMActions;
  if (chatInput) {
    chatInput.disabled = disableLLMActions;
    chatInput.placeholder = loading
      ? 'LLM is loading... please wait'
      : (disableLLMActions ? 'Start LLM and wait until ready...' : defaultChatInputPlaceholder);
  }
  if (rephraseNoteBtn) rephraseNoteBtn.disabled = disableLLMActions;
  if (multiSummarizeBtn) multiSummarizeBtn.disabled = disableLLMActions;
}

function ensureLLMReady(featureLabel) {
  if (currentLLMStatus?.ready) return true;

  const reason = currentLLMStatus?.runtime?.message || 'LLM is still loading or unavailable.';
  alert(`${reason}\n\n${featureLabel} is disabled until the model is ready for inference.`);
  return false;
}

async function handleLLMToggle() {
  if (!llmToggleBtn) return;

  if (currentLLMStatus?.runtime?.loading) {
    return;
  }

  llmToggleBtn.disabled = true;
  try {
    const statusResp = await chrome.runtime.sendMessage({ action: 'checkLLMStatus' });
    if (!statusResp || !statusResp.success) {
      alert('Could not determine LLM status');
      return;
    }

    const loaded = !!statusResp.status?.loaded || !!statusResp.status?.ready;
    if (loaded) {
      const stopResp = await chrome.runtime.sendMessage({ action: 'stopLLM' });
      if (stopResp && stopResp.success) {
        llmToggleBtn.textContent = '▶️ Start LLM';
      } else {
        alert('Failed to stop LLM: ' + (stopResp?.error || 'unknown'));
      }
    } else {
      llmToggleBtn.textContent = '⏳ Loading LLM...';
      const startResp = await chrome.runtime.sendMessage({ action: 'startLLM' });
      if (startResp && startResp.success) {
        llmToggleBtn.textContent = '⏹️ Stop LLM';
      } else {
        alert('Failed to start LLM: ' + (startResp?.error || 'unknown'));
      }
    }
  } catch (e) {
    console.error(e);
    alert('LLM control error: ' + e.message);
  } finally {
    await checkLLMStatus();
  }
}

// Load articles from storage
async function loadArticles() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getArticles' });
    if (response && response.success) {
      articles = response.articles || [];
      filteredArticles = [...articles];
    } else {
      articles = [];
      filteredArticles = [];
    }
  } catch (error) {
    console.error('Error loading articles:', error);
    articles = [];
    filteredArticles = [];
  }
}

// Render articles list
function renderArticles() {
  loadAndDisplayTags();
  articleCount.textContent = filteredArticles.length;
  
  if (filteredArticles.length === 0) {
    emptyState.style.display = 'block';
    articlesList.innerHTML = '';
    articlesList.appendChild(emptyState);
    return;
  }
  
  emptyState.style.display = 'none';
  articlesList.innerHTML = '';
  
  filteredArticles.forEach(article => {
    const articleItem = createArticleElement(article);
    articlesList.appendChild(articleItem);
  });
}

function hideNotesModal() {
  notesModal.classList.add('hidden');
  currentEditingArticleId = null;
}

function handleEditNote(articleId) {
  const article = articles.find(a => a.id === articleId);
  if (!article) return;
  
  currentEditingArticleId = article.id;
  noteArticleTitle.textContent = article.title;
  noteTextarea.value = article.notes || '';
  notesModal.classList.remove('hidden');
  noteTextarea.focus();
}

async function handleSaveNote() {
  if (!currentEditingArticleId) return;

  saveNoteBtn.disabled = true;
  saveNoteBtn.textContent = 'Saving...';

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'updateArticle',
      id: currentEditingArticleId,
      updates: { notes: noteTextarea.value }
    });

    if (response && response.success) {
      // Update the local article object
      const article = articles.find(a => a.id === currentEditingArticleId);
      if (article) article.notes = noteTextarea.value;
      hideNotesModal();
    } else {
      throw new Error(response?.error || 'Failed to save note');
    }
  } catch (error) {
    console.error('Error saving note:', error);
    alert('Error saving note: ' + error.message);
  }

  saveNoteBtn.disabled = false;
  saveNoteBtn.textContent = 'Save Note';
}

// Update article rendering to show tags
function createArticleElement(article) {
  const div = document.createElement('div');
  div.className = 'article-item';
  div.dataset.id = article.id;
  
  const date = new Date(article.dateAdded).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  
  // Build tags HTML
  let tagsHtml = '';
  if (article.tags && article.tags.length > 0) {
    tagsHtml = '<div class="article-tags">' + 
      article.tags.map(tag => `<span class="tag" data-tag="${tag}">#${escapeHtml(tag)}</span>`).join('') +
      '</div>';
  }
  
  div.innerHTML = `
    <div class="article-title">${escapeHtml(article.title)}</div>
    <div class="article-meta">
      <span>${date}</span>
      <span>${article.url ? '🔗' : '📝'}</span>
    </div>
    ${tagsHtml}
    <div class="article-summary">${escapeHtml(article.summary || 'No summary available')}</div>
    <div class="article-actions">
      <button class="btn-small btn-view" data-id="${article.id}">View</button>
      <button class="btn-small btn-tag" data-id="${article.id}">🏷️</button>
      <button class="btn-small btn-similar" data-id="${article.id}" title="Find Similar">🔗</button>
      <button class="btn-small btn-note" data-id="${article.id}" title="Edit Note">📝</button>
      <button class="btn-small btn-delete" data-id="${article.id}">Delete</button>
    </div>
  `;
  
  // Add tag click handlers
  div.querySelectorAll('.tag').forEach(tagEl => {
    tagEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const tag = tagEl.dataset.tag;
      selectedTags.clear();
      selectedTags.add(tag);
      loadAndDisplayTags();
      applyTagFilter();
    });
  });

  div.querySelector('.btn-tag').addEventListener('click', (e) => {
    e.stopPropagation();
    handleEditTags(article.id, article.tags || []);
  });
  
  div.querySelector('.btn-view').addEventListener('click', (e) => {
    e.stopPropagation();
    showArticleModal(article);
  });
  
  div.querySelector('.btn-delete').addEventListener('click', (e) => {
    e.stopPropagation();
    handleDeleteArticle(article.id);
  });

  div.querySelector('.btn-similar').addEventListener('click', (e) => {
    e.stopPropagation();
    handleFindSimilar(article.id, article.title);
  });

  div.querySelector('.btn-note').addEventListener('click', (e) => {
    e.stopPropagation();
    handleEditNote(article.id);
  });

  div.addEventListener('click', () => {
    const isSelected = selectedArticles.has(article.id);
    updateArticleSelection(article.id, !isSelected);
  });
  
  return div;
}

async function handleFindSimilar(id, title) {
  // Update search bar to show context
  searchInput.value = `Similar to: "${title.substring(0, 30)}..."`;
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'findSimilarArticles',
      articleId: id
    });
    
    if (response && response.success) {
      filteredArticles = response.articles;
      renderArticles();
    } else {
      console.warn('Find similar failed:', response?.error);
      alert('Could not find similar articles: ' + response?.error);
    }
  } catch (error) {
    console.error('Error finding similar articles:', error);
  }
}

// Handle save current page
async function handleSaveCurrentPage() {
  try {
    saveCurrentPageBtn.disabled = true;
    saveCurrentPageBtn.textContent = '💾 Saving...';
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url) {
      throw new Error('No active tab found');
    }
    
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      alert('Cannot save Chrome system pages');
      saveCurrentPageBtn.textContent = '💾 Save Current Page';
      saveCurrentPageBtn.disabled = false;
      return;
    }
    
    const article = {
      title: tab.title || 'Untitled',
      url: tab.url,
      summary: 'Summary will be generated...',
      dateAdded: Date.now(),
      originalText: '',
      tags: [],
      encrypted: false
    };
    
    const response = await chrome.runtime.sendMessage({ 
      action: 'saveArticle', 
      article 
    });
    
    if (response && response.success) {
      await loadArticles();
      renderArticles();
      
      saveCurrentPageBtn.textContent = '✓ Saved!';
      setTimeout(() => {
        saveCurrentPageBtn.textContent = '💾 Save Current Page';
        saveCurrentPageBtn.disabled = false;
      }, 2000);
    } else {
      throw new Error(response?.error || 'Failed to save article');
    }
    
  } catch (error) {
    console.error('Error saving page:', error);
    saveCurrentPageBtn.textContent = '❌ Error';
    setTimeout(() => {
      saveCurrentPageBtn.textContent = '💾 Save Current Page';
      saveCurrentPageBtn.disabled = false;
    }, 2000);
  }
}

// Handle search
async function handleSearch(e) {
  const query = e.target.value.trim();
  
  if (!query) {
    // If query is empty, just render all articles
    filteredArticles = [...articles];
    renderArticles();
    return;
  }
  
  try {
    // Send the search query to the service worker
    const response = await chrome.runtime.sendMessage({
      action: 'searchArticles',
      query: query
    });
    
    if (response && response.success) {
      // Update the UI with the hybrid results
      filteredArticles = response.results;
      renderArticles();
    } else {
      console.warn('Search failed:', response?.error);
      // Fallback to local keyword search on error
      const lowerQuery = query.toLowerCase();
      filteredArticles = articles.filter(article => 
        article.title.toLowerCase().includes(lowerQuery) ||
        (article.summary && article.summary.toLowerCase().includes(lowerQuery))
      );
      renderArticles();
    }
  } catch (error) {
    console.error('Error during search:', error);
  }
}

// Handle view article
function handleViewArticle(id) {
  const article = articles.find(a => a.id === id);
  if (!article) return;
  
  if (article.url) {
    chrome.tabs.create({ url: article.url });
  } else {
    const details = `
Title: ${article.title}

Summary: ${article.summary || 'No summary available'}

Date: ${new Date(article.dateAdded).toLocaleString()}

${article.originalText ? '\nOriginal Text:\n' + article.originalText.substring(0, 500) + '...' : ''}
    `.trim();
    
    alert(details);
  }
}

// Handle delete article
async function handleDeleteArticle(id) {
  if (!confirm('Delete this article? This action cannot be undone.')) return;
  
  try {
    const response = await chrome.runtime.sendMessage({ 
      action: 'deleteArticle', 
      id 
    });
    
    if (response && response.success) {
      await loadArticles();
      renderArticles();
    } else {
      throw new Error(response?.error || 'Failed to delete article');
    }
  } catch (error) {
    console.error('Error deleting article:', error);
    alert('Failed to delete article. Please try again.');
  }
}

// Chat history functions
function toggleChatHistory() {
  console.log('🔍 toggleChatHistory called');
  const chatHistorySidebar = document.getElementById('chatHistorySidebar');
  
  if (!chatHistorySidebar) {
    console.error('❌ chatHistorySidebar not found');
    return;
  }
  
  chatHistorySidebar.classList.toggle('hidden');
  console.log('Sidebar hidden?', chatHistorySidebar.classList.contains('hidden'));
  
  if (!chatHistorySidebar.classList.contains('hidden')) {
    loadChatHistory();
  }
}

async function loadChatHistory() {
  try {
    console.log('Loading chat history...');
    const response = await chrome.runtime.sendMessage({ action: 'getChatSessions' });
    if (response && response.success) {
      console.log('Got', response.sessions.length, 'sessions');
      renderChatHistory(response.sessions);
    }
  } catch (error) {
    console.error('Error loading chat history:', error);
  }
}

function renderChatHistory(sessions) {
  const chatHistoryList = document.getElementById('chatHistoryList');
  if (!chatHistoryList) return;
  
  chatHistoryList.innerHTML = '';
  
  if (sessions.length === 0) {
    chatHistoryList.innerHTML = '<p style="text-align: center; color: #868e96; font-size: 11px; padding: 20px;">No previous chats</p>';
    return;
  }
  
  sessions.forEach(session => {
    const item = document.createElement('div');
    item.className = 'chat-history-item';
    if (currentChatSession && currentChatSession.id === session.id) {
      item.classList.add('active');
    }
    
    const date = new Date(session.dateCreated).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    item.innerHTML = `
      <div class="chat-item-title">${escapeHtml(session.title)}</div>
      <div class="chat-item-date">${date}</div>
    `;
    
    item.addEventListener('click', () => loadChatSession(session.id));
    chatHistoryList.appendChild(item);
  });
}

async function loadChatSession(sessionId) {
  try {
    const response = await chrome.runtime.sendMessage({ 
      action: 'getChatSession', 
      id: sessionId 
    });
    
    if (response && response.success) {
      currentChatSession = response.session;
      chatMessagesArray = [...currentChatSession.messages];
      
      chatMessages.innerHTML = '';
      
      chatMessagesArray.forEach(msg => {
        addChatMessage(msg.role, msg.content, false);
      });
      
      const sidebar = document.getElementById('chatHistorySidebar');
      if (sidebar) {
        sidebar.classList.add('hidden');
      }
      loadChatHistory();
    }
  } catch (error) {
    console.error('Error loading chat session:', error);
  }
}

function startNewChat() {
  currentChatSession = {
    id: generateId(),
    dateCreated: Date.now(),
    title: 'New Chat',
    messages: [],
    sourceArticles: articles.slice(0, 10).map(a => a.id)
  };
  chatMessagesArray = [];
  
  chatMessages.innerHTML = '';
  
  addChatMessage('assistant', `Hi! I can help you explore your saved knowledge. You have ${articles.length} article${articles.length !== 1 ? 's' : ''} saved. What would you like to know?`, false);
  
  const sidebar = document.getElementById('chatHistorySidebar');
  if (sidebar) {
    sidebar.classList.add('hidden');
  }
}

// Show chat view
function showChatView() {
  if (!ensureLLMReady('Chat')) {
    return;
  }

  document.querySelector('.search-container').style.display = 'none';
  document.querySelector('.actions').style.display = 'none';
  document.querySelector('.articles-section').style.display = 'none';
  document.querySelector('.footer').style.display = 'none';
  chatView.classList.remove('hidden');
  
  if (!currentChatSession) {
    startNewChat();
  }
  
  // Attach chat history listeners NOW (elements are visible)
  setTimeout(() => {
    const historyBtn = document.getElementById('chatHistoryBtn');
    const closeChatBtn = document.getElementById('closeChatHistory');
    const newChatButton = document.getElementById('newChatBtn');
    
    if (historyBtn && !historyBtn.dataset.listenerAttached) {
      historyBtn.addEventListener('click', () => {
        console.log('📚 History button clicked!');
        toggleChatHistory();
      });
      historyBtn.dataset.listenerAttached = 'true';
      console.log('✓ Chat history button listener attached');
    }
    
    if (closeChatBtn && !closeChatBtn.dataset.listenerAttached) {
      closeChatBtn.addEventListener('click', () => {
        const sidebar = document.getElementById('chatHistorySidebar');
        if (sidebar) sidebar.classList.add('hidden');
      });
      closeChatBtn.dataset.listenerAttached = 'true';
    }
    
    if (newChatButton && !newChatButton.dataset.listenerAttached) {
      newChatButton.addEventListener('click', startNewChat);
      newChatButton.dataset.listenerAttached = 'true';
    }
  }, 50);
  
  chatInput.focus();
}

// Show articles view
function showArticlesView() {
  document.querySelector('.search-container').style.display = 'block';
  document.querySelector('.actions').style.display = 'flex';
  document.querySelector('.articles-section').style.display = 'block';
  document.querySelector('.footer').style.display = 'flex';
  chatView.classList.add('hidden');
}

function updateArticleSelection(articleId, isSelected) {
  if (isSelected) {
    selectedArticles.add(articleId);
  } else {
    selectedArticles.delete(articleId);
  }
  
  // Show/hide summarize button
  if (selectedArticles.size >= 2) {
    multiSummarizeBtn.style.display = 'block';
  } else {
    multiSummarizeBtn.style.display = 'none';
  }
  
  // Update article UI
  document.querySelectorAll('.article-item').forEach(item => {
    const id = item.dataset.id;
    if (selectedArticles.has(id)) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });
}

async function handleMultiSummarize() {
  if (selectedArticles.size < 2) {
    alert('Please select at least 2 articles to summarize');
    return;
  }

  if (!ensureLLMReady('Multi-summary')) {
    return;
  }
  
  try {
    const selected = Array.from(selectedArticles)
      .map(id => articles.find(a => a.id === id))
      .filter(a => a);
    
    console.log('Selected articles:', selected);
    
    if (selected.length === 0) return;
    
    multiSummarizeBtn.disabled = true;
    multiSummarizeBtn.textContent = '⏳ Generating insights...';
    
    const summaries = selected.map(a => `"${a.title}": ${a.summary}`).join('\n\n');
    
    console.log('Sending multiSummarize request');
    const response = await chrome.runtime.sendMessage({
      action: 'multiSummarize',
      summaries: summaries,
      titles: selected.map(a => a.title)
    });
    
    console.log('✅ Response received:', response);
    
    let insights = '';
    if (response && response.success && response.insights) {
      insights = response.insights;
      console.log('Got insights from response.success path');
    } else if (typeof response === 'string') {
      insights = response;
      console.log('Got insights as string');
    } else {
      console.log('Unexpected response:', response);
      throw new Error('Unexpected response format');
    }
    
    if (!insights) {
      throw new Error('No insights generated');
    }
    
    console.log('Creating article with insights:', insights.substring(0, 100));
    
    // Create combined article
    const combinedArticle = {
      title: `📊 Insights: ${selected.length} articles connected`,
      summary: insights,
      url: '',
      originalText: `Sources:\n${selected.map((a, i) => `${i+1}. ${a.title}`).join('\n')}\n\n${insights}`,
      tags: ['multi-summary', ...new Set(selected.flatMap(a => a.tags || []))],
      dateAdded: Date.now()
    };
    
    console.log('Saving article:', combinedArticle.title);
    
    // ========================================
    // STEP 1: GENERATE VECTOR
    // ========================================
    multiSummarizeBtn.textContent = '🔍 Generating search index...';
    console.log('📊 Generating vector for combined article...');
    
    let vectorResponse;
    try {
      vectorResponse = await chrome.runtime.sendMessage({
        action: 'generateVector',
        article: combinedArticle
      });
      
      if (vectorResponse?.vector) {
        combinedArticle.vector = vectorResponse.vector;
        console.log('✓ Vector generated for combined article');
      } else {
        console.warn('⚠️ Vector generation returned empty, continuing...');
      }
    } catch (vectorError) {
      console.warn('⚠️ Vector generation failed:', vectorError.message);
    }
    
    // ========================================
    // STEP 2: SAVE ARTICLE (with vector if available)
    // ========================================
    multiSummarizeBtn.textContent = '💾 Saving to knowledge base...';
    console.log('💾 Saving article with precomputed vector...');
    
    const saveResponse = await chrome.runtime.sendMessage({
      action: 'saveArticle',
      article: combinedArticle
    });
    
    console.log('Save response:', saveResponse);
    
    if (saveResponse && saveResponse.success) {
      console.log('✅ Article saved, reloading...');
      selectedArticles.clear();
      multiSummarizeBtn.style.display = 'none';
      
      await loadArticles();
      renderArticles();
      
      alert(`✅ Combined Summary Saved!\n\nTitle: ${combinedArticle.title}\n\nArticle ID: ${saveResponse.id}`);
    } else {
      throw new Error('Save failed: ' + JSON.stringify(saveResponse));
    }
    
    multiSummarizeBtn.textContent = '📋 Summarize';
    multiSummarizeBtn.disabled = false;
    
  } catch (error) {
    console.error('❌ Multi-summarize error:', error);
    alert(`Failed: ${error.message}`);
    multiSummarizeBtn.textContent = '📋 Summarize';
    multiSummarizeBtn.disabled = false;
  }
}

// Handle send chat
async function handleSendChat() {
  if (!ensureLLMReady('Chat')) {
    return;
  }

  const query = chatInput.value.trim();
  if (!query) return;
  
  if (!currentChatSession) {
    startNewChat();
  }
  
  const userMessage = { role: 'user', content: query, timestamp: Date.now() };
  chatMessagesArray.push(userMessage);
  addChatMessage('user', query);
  chatInput.value = '';
  
  if (chatMessagesArray.filter(m => m.role === 'user').length === 1) {
    currentChatSession.title = query.substring(0, 50) + (query.length > 50 ? '...' : '');
  }
  
  const thinkingMsg = addChatMessage('assistant', '💭 Thinking...');
  
  try {
    const response = await chrome.runtime.sendMessage({ 
      action: 'chatQuery', 
      query,
      articles: articles.slice(0, 10),
      chatHistory: chatMessagesArray.slice(0, -1)
    });
    
    thinkingMsg.remove();
    
      if (response && response.success) {
        const assistantMessage = {
          role: 'assistant',
          content: response.answer,
          citations: response.citations || [],
          retrievedChunks: response.retrievedChunks || [],
          retrieval: response.retrieval || null,
          timestamp: Date.now()
        };
        chatMessagesArray.push(assistantMessage);
        addChatMessage('assistant', response.answer, true, assistantMessage);
        
        currentChatSession.messages = chatMessagesArray;
        currentChatSession.lastRetrieval = assistantMessage.retrieval;
        await chrome.runtime.sendMessage({
          action: 'saveChatSession',
          session: currentChatSession
        });
      } else {
        thinkingMsg.remove();
        addChatMessage('assistant', 'Sorry, I encountered an error. Please try again.');
      }
  } catch (error) {
    console.error('Chat error:', error);
    thinkingMsg.remove();
    addChatMessage('assistant', 'Sorry, I encountered an error. Please try again.');
  }
}

// Add chat message
function addChatMessage(role, content, save = true, metadata = null) {
  const div = document.createElement('div');
  div.className = `chat-message ${role}`;

  const text = document.createElement('div');
  text.className = 'chat-message-text';
  text.textContent = content;
  div.appendChild(text);

  if (role === 'assistant' && metadata) {
    const citations = Array.isArray(metadata.citations) ? metadata.citations : [];
    if (citations.length > 0) {
      const citationsWrap = document.createElement('div');
      citationsWrap.className = 'chat-citations';

      const label = document.createElement('div');
      label.className = 'chat-citations-label';
      label.textContent = 'Sources';
      citationsWrap.appendChild(label);

      citations.slice(0, 5).forEach((citation) => {
        const citationEl = document.createElement('div');
        citationEl.className = 'chat-citation';
        const sourceText = citation.articleTitle || 'Untitled';
        const excerpt = citation.excerpt ? ` — ${citation.excerpt}` : '';
        citationEl.textContent = `[${citation.label}] ${sourceText}${excerpt}`;
        citationsWrap.appendChild(citationEl);
      });

      div.appendChild(citationsWrap);
    }

    const retrieval = metadata.retrieval;
    if (retrieval) {
      const retrievalEl = document.createElement('div');
      retrievalEl.className = 'chat-retrieval-meta';
      retrievalEl.textContent = `Retrieved ${retrieval.chunkCount || 0} chunk(s) • ${retrieval.citationCount || 0} citation(s)${retrieval.usedFallback ? ' • local fallback' : ''}`;
      div.appendChild(retrievalEl);
    }
  }

  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

// Handle export
async function handleExport() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'exportData' });
    
    if (response && response.success) {
      const data = response.data;
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `localfirst-kb-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      
      URL.revokeObjectURL(url);
      alert(`Exported ${data.articles.length} articles successfully!`);
    }
  } catch (error) {
    console.error('Error exporting data:', error);
    alert('Failed to export data. Please try again.');
  }
}

// Handle import
async function handleImport() {
  try {
    // Create file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        // Validate data structure
        if (!data.articles || !Array.isArray(data.articles)) {
          alert('❌ Invalid backup file format. Expected structure with "articles" array.');
          return;
        }
        
        // Build confirmation message
        const articleCount = data.articles.length;
        const sessionCount = data.chatSessions?.length || 0;
        
        const confirmMsg = `📥 Import Data\n\n✓ ${articleCount} articles\n✓ ${sessionCount} chat sessions\n\nThis will ADD to your existing data (not replace).\n\nContinue?`;
        
        if (!confirm(confirmMsg)) return;
        
        // Send to background for import
        const response = await chrome.runtime.sendMessage({
          action: 'importData',
          data: data
        });
        
        if (response && response.success) {
          const stats = response.stats;
          
          // Build success message
          let successMsg = `✅ Import Complete!\n\n`;
          successMsg += `✓ ${stats.articlesImported} articles imported\n`;
          successMsg += `✓ ${stats.sessionsImported} chat sessions imported`;
          
          if (stats.errors.length > 0) {
            successMsg += `\n\n⚠️ ${stats.errors.length} error(s):\n`;
            stats.errors.slice(0, 3).forEach(err => {
              successMsg += `• ${err}\n`;
            });
            if (stats.errors.length > 3) {
              successMsg += `... and ${stats.errors.length - 3} more`;
            }
          }
          
          alert(successMsg);
          
          // Reload articles and refresh UI
          await loadArticles();
          renderArticles();
          
          console.log('✅ Import successful:', stats);
        } else {
          throw new Error(response?.error || 'Import failed');
        }
        
      } catch (error) {
        console.error('Import error:', error);
        if (error instanceof SyntaxError) {
          alert('❌ Invalid JSON file. Please check the file format.');
        } else {
          alert(`❌ Failed to import data.\n\n${error.message}`);
        }
      }
    };
    
    input.click();
    
  } catch (error) {
    console.error('Error creating import dialog:', error);
    alert('❌ Failed to open import dialog.');
  }
}

// Handle settings
async function handleSettings() {
  try {
    // 1. Get Storage Info (as before)
    const storageResponse = await chrome.runtime.sendMessage({ action: 'getStorageInfo' });
    
    let storageInfo = 'Storage information not available';
    if (storageResponse && storageResponse.success && storageResponse.info) {
      const info = storageResponse.info;
      storageInfo = `Storage Used: ${info.usageInMB} MB / ${info.quotaInMB} MB (${info.percentUsed}%)`;
    }

    // 2. NEW: Manually re-check LLM status
    const statusResponse = await chrome.runtime.sendMessage({ action: 'checkLLMStatus' });
    
    let apiStatus = 'API Status: Could not be determined.';
    if (statusResponse && statusResponse.success) {
      const s = statusResponse.status;
      apiStatus = `
API Status:
• Summarizer: ${s.summarizer}
• Chat Model: ${s.prompt}
• Loaded: ${!!s.loaded}
• Ready: ${!!s.ready}
• Phase: ${s.runtime?.phase || 'unknown'}
• Detail: ${s.runtime?.message || 'n/a'}
      `.trim();
    }

    const ragResponse = await chrome.runtime.sendMessage({ action: 'checkRAGDBStatus' });
    let ragStatus = 'RAG DB: unavailable';
    if (ragResponse?.success) {
      const rs = ragResponse.status || {};
      ragStatus = rs.available
        ? `RAG DB: connected (${rs.collection} @ ${rs.baseUrl})`
        : `RAG DB: unavailable (${rs.reason || 'not reachable'})`;
    }
    
    const settingsText = `
⚙️ LocalFirst KB Settings

📊 Storage Information:
${storageInfo}
📚 Total Articles: ${articles.length}

${apiStatus}

${ragStatus}

Developer: Check console for logs
    `.trim();
    
    alert(settingsText);

  } catch (error) {
    console.error('Settings error:', error);
    alert('Settings panel error: ' + error.message);
  }
}

// Utility functions
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Tag Management
async function loadAndDisplayTags() {
  try {
    const allTags = new Set();
    articles.forEach(article => {
      if (article.tags && Array.isArray(article.tags)) {
        article.tags.forEach(tag => allTags.add(tag));
      }
    });
    
    if (allTags.size === 0) {
      tagFilterContainer.style.display = 'none';
      return;
    }
    
    tagFilterContainer.style.display = 'block';
    tagFilterList.innerHTML = '';
    
    Array.from(allTags).sort().forEach(tag => {
      const tagEl = document.createElement('button');
      tagEl.className = 'tag-filter-item';
      if (selectedTags.has(tag)) {
        tagEl.classList.add('active');
      }
      tagEl.textContent = `#${tag}`;
      tagEl.addEventListener('click', () => toggleTagFilter(tag));
      tagFilterList.appendChild(tagEl);
    });
    
    console.log('✓ Tags loaded:', allTags.size);
  } catch (error) {
    console.error('Error loading tags:', error);
  }
}

function toggleTagFilter(tag) {
  if (selectedTags.has(tag)) {
    selectedTags.delete(tag);
  } else {
    selectedTags.add(tag);
  }
  
  loadAndDisplayTags();
  applyTagFilter();
}

function clearTagFilters() {
  selectedTags.clear();
  loadAndDisplayTags();
  applyTagFilter();
}

function applyTagFilter() {
  if (selectedTags.size === 0) {
    // Show all articles
    filteredArticles = [...articles];
  } else {
    // Filter articles by selected tags
    filteredArticles = articles.filter(article => {
      if (!article.tags || article.tags.length === 0) return false;
      return Array.from(selectedTags).some(tag => article.tags.includes(tag));
    });
  }
  
  renderArticles();
  console.log(`Filtered to ${filteredArticles.length} articles with tags: ${Array.from(selectedTags).join(', ')}`);
}

// Edit Tags
async function handleEditTags(articleId, currentTags) {
  const article = articles.find(a => a.id === articleId);
  if (!article) return;
  
  const tagInput = prompt(
    `Edit tags for: "${article.title}"\n\nEnter tags separated by commas (e.g., ai, research, tutorial)\n\nCurrent: ${currentTags.join(', ') || 'none'}`,
    currentTags.join(', ')
  );
  
  if (tagInput === null) return; // User cancelled
  
  // Parse and clean tags
  const newTags = tagInput
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length > 0 && !t.includes(' '));
  
  try {
    console.log(`Updating tags for "${article.title}":`, newTags);
    
    const response = await chrome.runtime.sendMessage({
      action: 'updateArticle',
      id: articleId,
      updates: { tags: newTags }
    });
    
    if (response && response.success) {
      article.tags = newTags;
      await loadArticles();
      renderArticles();
      console.log('✓ Tags updated');
    } else {
      throw new Error(response?.error || 'Failed to update tags');
    }
  } catch (error) {
    console.error('Error updating tags:', error);
    alert(`Failed to update tags:\n\n${error.message}`);
  }
}

if (multiSummarizeBtn) {
  multiSummarizeBtn.addEventListener('click', handleMultiSummarize);
}

// Time-Based Insights
function showInsights() {
  const stats = calculateReadingStats();
  displayInsights(stats);
  insightsModal.classList.remove('hidden');
}

function hideInsights() {
  insightsModal.classList.add('hidden');
}

function calculateReadingStats() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  
  // Count articles by day
  const dayStats = {};
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateKey = date.toISOString().split('T')[0];
    dayStats[dateKey] = { count: 0, day: dayNames[date.getDay()], date };
  }
  
  // Count articles
  articles.forEach(article => {
    const articleDate = new Date(article.dateAdded);
    const dateKey = articleDate.toISOString().split('T')[0];
    if (dayStats[dateKey]) {
      dayStats[dateKey].count++;
    }
  });
  
  const sortedDays = Object.values(dayStats).sort((a, b) => b.date - a.date);
  
  // Calculate stats
  const thisWeek = sortedDays.reduce((sum, day) => sum + day.count, 0);
  const totalArticles = articles.length;
  const avgPerDay = totalArticles > 0 ? (totalArticles / (totalArticles > 0 ? 
    Math.ceil((now - new Date(articles[articles.length - 1]?.dateAdded || now)) / (24 * 60 * 60 * 1000)) || 1 : 1)).toFixed(1) : 0;
  
  // Most active day
  let mostActiveDay = '-';
  let maxCount = 0;
  sortedDays.forEach(day => {
    if (day.count > maxCount) {
      maxCount = day.count;
      mostActiveDay = day.day;
    }
  });
  
  return {
    totalArticles,
    thisWeek,
    mostActiveDay,
    avgPerDay,
    dailyBreakdown: sortedDays,
    maxDaily: Math.max(...sortedDays.map(d => d.count), 1)
  };
}

function displayInsights(stats) {
  // Update stat cards
  document.getElementById('totalArticles').textContent = stats.totalArticles;
  document.getElementById('thisWeek').textContent = stats.thisWeek;
  document.getElementById('mostActiveDay').textContent = stats.mostActiveDay;
  document.getElementById('avgPerDay').textContent = stats.avgPerDay;
  
  // Create activity chart
  const chartContainer = document.getElementById('activityChart');
  chartContainer.innerHTML = '';
  
  stats.dailyBreakdown.forEach(day => {
    const barHeight = (day.count / stats.maxDaily) * 100;
    const barDiv = document.createElement('div');
    barDiv.className = 'chart-bar';
    barDiv.style.height = `${Math.max(barHeight, 5)}%`;
    barDiv.title = `${day.day}: ${day.count} articles`;
    
    barDiv.innerHTML = `
      ${day.count > 0 ? `<div class="chart-bar-value">${day.count}</div>` : ''}
      <div class="chart-bar-label">${day.day}</div>
    `;
    
    chartContainer.appendChild(barDiv);
  });
  
  // Generate summary
  const summary = generateInsightsSummary(stats);
  document.getElementById('insightsSummary').innerHTML = summary;
  
  console.log('✓ Insights displayed:', stats);
}

function generateInsightsSummary(stats) {
  let summary = '';
  
  if (stats.totalArticles === 0) {
    summary = '📖 <strong>Get Started!</strong> Save articles to track your reading habits and see insights.';
  } else if (stats.thisWeek === 0) {
    summary = `📚 <strong>${stats.totalArticles} Total Articles</strong> saved. You haven't saved any this week. Consider reviewing your knowledge base!`;
  } else if (stats.thisWeek >= 5) {
    summary = `🔥 <strong>Great Week!</strong> You saved <strong>${stats.thisWeek}</strong> articles this week. Your most productive day was <strong>${stats.mostActiveDay}</strong>.`;
  } else if (stats.thisWeek >= 2) {
    summary = `📚 <strong>Steady Progress!</strong> You've saved <strong>${stats.thisWeek}</strong> articles this week. Average: <strong>${stats.avgPerDay}</strong> per day.`;
  } else {
    summary = `📖 <strong>Keep Learning!</strong> You've saved <strong>${stats.thisWeek}</strong> article this week. You have <strong>${stats.totalArticles}</strong> total articles in your knowledge base.`;
  }
  
  return summary;
}

/**
 * Uses the local LLM API to suggest alternative phrasings
 */
async function handleRephraseNote() {
  if (!ensureLLMReady('Rephrase')) {
    return;
  }

  const text = noteTextarea.value;
  if (!text.trim()) return;

  rephraseNoteBtn.disabled = true;
  rephraseNoteBtn.textContent = 'Thinking...';

  try {
    // We can re-use the 'chatQuery' action for this!
    const response = await chrome.runtime.sendMessage({ 
      action: 'chatQuery', 
      query: `Concisely rephrase the following note for clarity and style. Return only the rephrased text, nothing else:\n\n"${text}"`,
      articles: [] // No article context needed for this
    });
    
    if (response && response.success && response.answer) {
      // Clean the AI's response (it sometimes adds quotes)
      let rephrasedText = response.answer.trim();
      if (rephrasedText.startsWith('"') && rephrasedText.endsWith('"')) {
        rephrasedText = rephrasedText.substring(1, rephrasedText.length - 1);
      }
      noteTextarea.value = rephrasedText;
      noteTextarea.style.borderColor = '#28a745';
      setTimeout(() => { noteTextarea.style.borderColor = '#ced4da'; }, 1000);
    } else {
      throw new Error(response?.error || 'Failed to rephrase');
    }
  } catch (error) {
    console.error('Rephrase error:', error);
    alert('Error rephrasing: ' + error.message);
  }

  rephraseNoteBtn.disabled = false;
  rephraseNoteBtn.textContent = '✨ Rephrase';
}

// ============================================
// ARTICLE VIEW MODAL FUNCTIONS
// ============================================

function hideArticleModal() {
  articleViewModal.classList.add('hidden');
  currentArticleForView = null;
}

function showArticleModal(article) {
  if (typeof showdown === 'undefined') {
    alert('Markdown renderer is not loaded. Please try again.');
    return;
  }
  
  currentArticleForView = article;
  
  // 1. Initialize the markdown converter
  const converter = new showdown.Converter();
  
  // 2. Get the text to render (prefer summary, fallback to originalText)
  const textToRender = article.summary || article.originalText || "No content available.";
  
  // 3. Convert markdown to HTML
  const html = converter.makeHtml(textToRender);
  
  // 4. Populate the modal
  articleViewTitle.textContent = article.title;
  articleViewContent.innerHTML = html;
  
  // 5. Show/hide the "Open Original Source" button
  if (article.url) {
    openSourceUrlBtn.style.display = 'block';
  } else {
    openSourceUrlBtn.style.display = 'none';
  }
  
  // 6. Show the modal
  articleViewModal.classList.remove('hidden');
}

/**
 * Handles opening the original source URL in a new tab
 */
function handleOpenSourceUrl() {
  if (currentArticleForView && currentArticleForView.url) {
    chrome.tabs.create({ url: currentArticleForView.url });
    hideArticleModal();
  }
}

/**
 * Handles opening the *rendered content* in a new tab
 * (This is your "web page with markdown" feature)
 */
function handleViewInNewTab() {
  if (!currentArticleForView) return;

  const title = currentArticleForView.title;
  const contentHtml = articleViewContent.innerHTML;

  // 1. Create a full HTML document for the new tab
  // We embed the CSS from popup.css for consistent styling
  const newTabHtml = `
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: #f8f9fa;
            color: #212529;
            padding: 20px 40px;
            max-width: 800px;
            margin: 0 auto;
          }
          h1 {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 20px;
            border-bottom: 2px solid #e9ecef;
            padding-bottom: 10px;
          }
          /* These styles are copied from your #articleViewContent styles */
          #content {
            background: #ffffff;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            padding: 20px 24px;
            font-size: 16px;
            line-height: 1.7;
          }
          #content p { margin-bottom: 16px; }
          #content h1, #content h2, #content h3 {
            font-weight: 600;
            margin-top: 24px;
            margin-bottom: 10px;
          }
          #content h1 { font-size: 24px; }
          #content h2 { font-size: 22px; }
          #content h3 { font-size: 18px; }
          #content ul, #content ol { padding-left: 24px; margin-bottom: 16px; }
          #content li { margin-bottom: 6px; }
          #content blockquote {
            padding-left: 16px;
            border-left: 4px solid #667eea;
            color: #495057;
            font-style: italic;
            margin: 16px 0;
          }
          #content code {
            background: #e9ecef;
            padding: 3px 6px;
            border-radius: 4px;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <div id="content">
          ${contentHtml}
        </div>
      </body>
    </html>
  `;

  // 2. Create a data URL
  const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(newTabHtml);
  
  // 3. Open the new tab
  chrome.tabs.create({ url: dataUrl });
  hideArticleModal();
}
