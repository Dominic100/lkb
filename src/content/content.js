// content.js - Content script for extracting page content

console.log('LocalFirst KB content script loaded');

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);
  
  if (message.action === 'extractContent') {
    extractAndSaveContent(message.selectionText);
    sendResponse({ success: true });
  }
  
  return true;
});

/**
 * Extract page content and send to background for saving
 */
async function extractAndSaveContent(selectionText = null) {
  try {
    console.log('📋 Starting content extraction and save workflow...');
    
    // ========================================
    // STEP 1: EXTRACT CONTENT
    // ========================================
    showNotification('Extracting content...', 'info');
    
    const pageData = {
      title: document.title,
      url: window.location.href,
      dateAdded: Date.now(),
      originalText: '',
      summary: 'Pending summary...',
      tags: [],
      encrypted: false
    };
    
    if (selectionText) {
      pageData.originalText = selectionText;
      pageData.title = `Selection from: ${document.title}`;
      console.log('✓ Using selected text:', selectionText.substring(0, 100));
    } else {
      const extractedContent = extractMainContent();
      pageData.originalText = extractedContent.text;
      console.log('✓ Extracted full page content, length:', extractedContent.text.length);
    }
    
    if (pageData.originalText.length < 100) {
      showNotification('Article too short to save', 'error');
      return;
    }
    
    // ========================================
    // STEP 2: GENERATE SUMMARY
    // ========================================
    showNotification('Checking LLM readiness...', 'info');
    let llmReady = false;
    try {
      const statusResponse = await chrome.runtime.sendMessage({ action: 'checkLLMStatus' });
      llmReady = !!(statusResponse?.success && statusResponse?.status?.ready);
    } catch (statusError) {
      console.warn('⚠️ Could not check LLM status:', statusError.message);
    }

    if (llmReady) {
      showNotification('Generating summary...', 'info');
      console.log('📝 Requesting summarization...');

      let summaryResponse;
      try {
        summaryResponse = await chrome.runtime.sendMessage({
          action: 'summarizeText',
          text: pageData.originalText
        });

        if (summaryResponse?.success && summaryResponse?.summary) {
          pageData.summary = summaryResponse.summary;
          console.log('✓ Summary generated:', pageData.summary.substring(0, 100));
        } else {
          console.warn('⚠️ Summary generation failed, continuing with placeholder');
          pageData.summary = 'Summary pending...';
        }
      } catch (summaryError) {
        console.warn('⚠️ Summary request failed:', summaryError.message);
        pageData.summary = 'Summary pending...';
      }
    } else {
      console.log('⏳ LLM not ready yet - skipping summarization call');
      pageData.summary = 'Summary pending (LLM still loading)...';
      showNotification('LLM still loading. Saved with pending summary.', 'warning');
    }
    
    // ========================================
    // STEP 3: GENERATE VECTOR (with complete data)
    // ========================================
    showNotification('Generating search index...', 'info');
    console.log('🔍 Generating vector with: title, summary, originalText, tags');
    
    let vectorResponse;
    try {
      vectorResponse = await chrome.runtime.sendMessage({
        action: 'generateVector',
        article: pageData
      });
      
      if (vectorResponse?.vector) {
        pageData.vector = vectorResponse.vector;
        console.log('✓ Vector generated successfully');
      } else {
        console.warn('⚠️ Vector generation returned empty, continuing...');
      }
    } catch (vectorError) {
      console.error('⚠️ Vector generation error:', vectorError.message);
      
      if (vectorError.message.includes('Extension context invalidated')) {
        console.warn('Extension was reloaded - retrying vector generation...');
        await new Promise(r => setTimeout(r, 500));
        vectorResponse = await chrome.runtime.sendMessage({
          action: 'generateVector',
          article: pageData
        });
        if (vectorResponse?.vector) {
          pageData.vector = vectorResponse.vector;
        }
      }
    }
    
    // ========================================
    // STEP 4: SAVE ARTICLE (with vector precomputed)
    // ========================================
    showNotification('Saving to LocalFirst KB...', 'info');
    console.log('💾 Saving article with precomputed vector...');
    
    let saveResponse;
    try {
      saveResponse = await chrome.runtime.sendMessage({
        action: 'saveArticle',
        article: pageData
      });
    } catch (sendError) {
      console.error('⚠️ Send message error:', sendError.message);
      
      if (sendError.message.includes('Extension context invalidated')) {
        console.warn('Extension was reloaded - retrying save...');
        showNotification('⏳ Retrying after extension reload...', 'warning');
        await new Promise(r => setTimeout(r, 500));
        saveResponse = await chrome.runtime.sendMessage({
          action: 'saveArticle',
          article: pageData
        });
      } else {
        throw sendError;
      }
    }
    
    if (saveResponse && saveResponse.success) {
      console.log('✅ Article saved successfully:', saveResponse.id);
      showNotification('✓ Saved to LocalFirst KB!', 'success');
      console.log('Article ID:', saveResponse.id);
    } else {
      console.error('❌ Failed to save article:', saveResponse?.error);
      showNotification('Failed to save article', 'error');
    }
    
  } catch (error) {
    console.error('❌ Error in extraction workflow:', error);
    showNotification('Error: ' + error.message, 'error');
  }
}

/**
 * Extract main content from the page
 * Uses multiple strategies to find the most relevant content
 */
function extractMainContent() {
  let text = '';
  let source = 'unknown';
  
  // Strategy 1: Look for article tags (best for news sites, blogs)
  const article = document.querySelector('article');
  if (article) {
    text = extractTextFromElement(article);
    source = 'article';
    console.log('Found <article> tag');
  }
  
  // Strategy 2: Look for main content area
  if (!text || text.length < 200) {
    const main = document.querySelector('main, [role="main"], .main-content, #main, #content');
    if (main) {
      text = extractTextFromElement(main);
      source = 'main';
      console.log('Found main content area');
    }
  }
  
  // Strategy 3: Look for specific content classes (common patterns)
  if (!text || text.length < 200) {
    const contentSelectors = [
      '.post-content',
      '.article-content',
      '.entry-content',
      '.blog-post',
      '.story-body',
      '[itemprop="articleBody"]'
    ];
    
    for (const selector of contentSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        text = extractTextFromElement(element);
        source = selector;
        console.log('Found content via selector:', selector);
        break;
      }
    }
  }
  
  // Strategy 4: Fallback to body (less accurate, but works)
  if (!text || text.length < 100) {
    text = extractTextFromElement(document.body);
    source = 'body';
    console.log('Falling back to body text');
  }
  
  // Clean up the text
  text = cleanText(text);
  
  return {
    text,
    source,
    length: text.length
  };
}

/**
 * Extract text from an element, excluding scripts, styles, etc.
 */
function extractTextFromElement(element) {
  if (!element) return '';
  
  // Clone the element to avoid modifying the page
  const clone = element.cloneNode(true);
  
  // Remove unwanted elements
  const unwantedSelectors = [
    'script',
    'style',
    'nav',
    'header',
    'footer',
    '.advertisement',
    '.ad',
    '.social-share',
    '.comments',
    '.sidebar',
    '[role="navigation"]',
    '[role="complementary"]'
  ];
  
  unwantedSelectors.forEach(selector => {
    clone.querySelectorAll(selector).forEach(el => el.remove());
  });
  
  // Get text content
  let text = clone.textContent || clone.innerText || '';
  
  return text;
}

/**
 * Clean and normalize extracted text
 */
function cleanText(text) {
  if (!text) return '';
  
  return text
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    // Remove leading/trailing whitespace
    .trim()
    // Limit length (optional, adjust as needed)
    .substring(0, 50000); // Max 50k characters
}

/**
 * Request summarization of the saved article
 */
async function requestSummarization(articleId, text) {
  try {
    console.log('Requesting summarization for article:', articleId);
    
    const response = await chrome.runtime.sendMessage({
      action: 'summarizeText',
      text: text,
      articleId: articleId
    });
    
    if (response && response.success && response.summary) {
      console.log('Summary generated:', response.summary.substring(0, 100));
      
      // Update the article with the summary
      await chrome.runtime.sendMessage({
        action: 'updateArticle',
        id: articleId,
        updates: { summary: response.summary }
      });
      
      console.log('Article updated with summary');
    }
  } catch (error) {
    console.error('Error requesting summarization:', error);
  }
}

/**
 * Show visual notification to user
 */
function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = 'lfkb-notification';
  notification.textContent = message;
  
  // Style based on type
  const styles = {
    info: { background: '#667eea', color: 'white' },
    success: { background: '#28a745', color: 'white' },
    error: { background: '#dc3545', color: 'white' }
  };
  
  const style = styles[type] || styles.info;
  
  Object.assign(notification.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    padding: '12px 20px',
    borderRadius: '8px',
    backgroundColor: style.background,
    color: style.color,
    fontSize: '14px',
    fontWeight: '600',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    zIndex: '999999',
    animation: 'lfkb-slide-in 0.3s ease-out',
    cursor: 'pointer'
  });
  
  // Add animation keyframes if not already added
  if (!document.getElementById('lfkb-notification-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'lfkb-notification-styles';
    styleSheet.textContent = `
      @keyframes lfkb-slide-in {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      @keyframes lfkb-slide-out {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(400px);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(styleSheet);
  }
  
  // Add to page
  document.body.appendChild(notification);
  
  // Auto-dismiss after 3 seconds
  setTimeout(() => {
    notification.style.animation = 'lfkb-slide-out 0.3s ease-out';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
  
  // Click to dismiss
  notification.addEventListener('click', () => {
    notification.style.animation = 'lfkb-slide-out 0.3s ease-out';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  });
}

// Optional: Add keyboard shortcut for quick save
document.addEventListener('keydown', (e) => {
  // Ctrl+Shift+S (or Cmd+Shift+S on Mac) to save page
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
    e.preventDefault();
    console.log('Keyboard shortcut triggered: Save page');
    extractAndSaveContent();
  }
});

console.log('LocalFirst KB content script ready. Press Ctrl+Shift+S to save page.');
