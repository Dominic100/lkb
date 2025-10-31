// gemini-api.js - Gemini Nano API Integration (Chrome 138+)

console.log('Gemini API module loading...');

// ============================================
// API AVAILABILITY CHECKS
// ============================================

/**
 * Check if Summarizer API is available
 */
async function canSummarize() {
  try {
    if (typeof Summarizer === 'undefined') {
      console.warn('Summarizer API not available');
      return 'unavailable';
    }
    const availability = await Summarizer.availability();
    console.log('Summarizer availability:', availability);
    return availability;
  } catch (error) {
    console.error('Error checking summarizer availability:', error);
    return 'unavailable';
  }
}

/**
 * Check if Prompt API (Language Model) is available
 */
async function canPrompt() {
  try {
    if (typeof LanguageModel === 'undefined') {
      console.warn('LanguageModel API not available');
      return 'unavailable';
    }
    const availability = await LanguageModel.availability();
    console.log('LanguageModel availability:', availability);
    return availability;
  } catch (error) {
    console.error('Error checking language model availability:', error);
    return 'unavailable';
  }
}

// ============================================
// SUMMARIZER API
// ============================================

/**
 * Summarize text using Gemini Nano Summarizer API
 */
async function summarizeWithGemini(text, options = {}) {
  try {
    console.log('🔄 Starting Gemini summarization, text length:', text?.length);
    
    if (!text || text.length < 50) {
      console.warn('Text too short to summarize');
      return text || 'No content to summarize';
    }
    
    // Check API availability
    const availability = await canSummarize();
    
    if (availability === 'unavailable') {
      console.warn('Summarizer API unavailable, using fallback');
      return fallbackSummarize(text);
    }
    
    if (availability === 'downloadable') {
      console.log('⏳ Gemini Nano needs user activation to download');
      return fallbackSummarize(text) + ' (Gemini Nano available - activate to use)';
    }
    
    if (availability === 'downloading') {
      console.log('⏳ Gemini Nano is downloading');
      return fallbackSummarize(text) + ' (Gemini Nano downloading...)';
    }
    
    // Add temporal context with current date
    const currentDate = new Date();
    const dateString = currentDate.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const currentYear = currentDate.getFullYear();
    
    const sharedContext = options.sharedContext || 
      `Today is ${dateString}. When summarizing, use appropriate past tense for events that have already occurred in ${currentYear} or earlier years. Preserve exact dates and timelines from the source text. Do not speculate about future events.`;
    
    // Create summarizer session
    const summarizer = await Summarizer.create({
      type: options.type || 'key-points',
      format: options.format || 'plain-text',
      length: options.length || 'medium',
      sharedContext: sharedContext,
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          console.log(`📥 Downloading: ${(e.loaded * 100).toFixed(1)}%`);
        });
      }
    });
    
    console.log('✓ Summarizer session created with temporal context');
    
    // Limit text length (model has input limits)
    const maxLength = 4000;
    const textToSummarize = text.length > maxLength 
      ? text.substring(0, maxLength) 
      : text;
    
    // Generate summary
    let summary = await summarizer.summarize(textToSummarize);
    
    // Post-process to fix common temporal issues
    summary = fixTemporalReferences(summary);
    
    console.log('✅ Gemini summary generated, length:', summary.length);
    
    // Cleanup
    summarizer.destroy();
    
    return summary;
    
  } catch (error) {
    console.error('❌ Gemini summarization error:', error);
    console.log('Falling back to simple summarization');
    return fallbackSummarize(text);
  }
}

/**
 * Post-process summary to fix temporal references
 */
function fixTemporalReferences(summary) {
  const currentYear = new Date().getFullYear();
  
  // Fix future tense for current year and earlier
  summary = summary.replace(/will be released in 202[0-5]/gi, (match) => 
    match.replace('will be released', 'was released')
  );
  
  summary = summary.replace(/will (\w+) in 202[0-5]/gi, (match, verb) => {
    // Handle common verbs
    const pastTenseMap = {
      'be': 'was',
      'release': 'released',
      'launch': 'launched',
      'debut': 'debuted',
      'premiere': 'premiered',
      'feature': 'featured'
    };
    
    const pastTense = pastTenseMap[verb.toLowerCase()] || verb + 'ed';
    return match.replace(`will ${verb}`, pastTense);
  });
  
  summary = summary.replace(/is set to (\w+) in 202[0-5]/gi, (match, verb) => {
    return match.replace(`is set to ${verb}`, verb + 'ed');
  });
  
  summary = summary.replace(/is scheduled to (\w+) in 202[0-5]/gi, (match, verb) => {
    return match.replace(`is scheduled to ${verb}`, verb + 'ed');
  });
  
  // Remove "upcoming" qualifier for current year and earlier
  summary = summary.replace(/upcoming 202[0-5]/gi, (match) => 
    match.replace('upcoming ', '')
  );
  
  // Fix "will be" constructions
  summary = summary.replace(/will be (\w+) in 202[0-5]/gi, (match, adj) => {
    return match.replace('will be', 'was');
  });
  
  return summary;
}

/**
 * Fallback summarizer (simple sentence extraction)
 */
function fallbackSummarize(text) {
  if (!text || text.length < 50) {
    return text || 'No content to summarize';
  }
  
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 20);
  
  const summaryLength = Math.min(5, Math.ceil(sentences.length / 3));
  let summary = sentences.slice(0, summaryLength).join('. ');
  
  if (summary && !summary.endsWith('.')) {
    summary += '.';
  }
  
  if (summary.length < 100) {
    summary = text.substring(0, 200) + '...';
  }
  
  return summary;
}

// ============================================
// PROMPT API (CHAT)
// ============================================

/**
 * Chat with knowledge base using Gemini Nano Prompt API
 * (Updated to use a "jailbreak" prompt to enforce rules)
 */
async function chatWithGemini(query, articles = [], chatHistory = []) {
  try {
    console.log('🔄 Starting Gemini chat, query:', query, 'articles:', articles.length, 'history:', chatHistory.length);
    
    // --- Availability checks remain the same ---
    const availability = await canPrompt();
    if (availability === 'unavailable') { console.warn('LanguageModel API unavailable, using fallback'); return fallbackChat(query, articles); }
    if (availability === 'downloadable') { console.log('⏳ Gemini Nano needs user activation'); return 'Gemini Nano is available but needs activation. Using fallback: ' + fallbackChat(query, articles); }
    if (availability === 'downloading') { console.log('⏳ Gemini Nano is downloading'); return 'Gemini Nano is downloading. Using fallback: ' + fallbackChat(query, articles); }
    
    // 1. Create a MINIMAL session
    const session = await LanguageModel.create({
      // The system prompt is now just the persona. All rules are in the main prompt.
      systemPrompt: `You are a helpful knowledge assistant named "Assistant". The human you are talking to is "User".`,
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          console.log(`📥 Downloading: ${(e.loaded * 100).toFixed(1)}%`);
        });
      }
    });
    
    console.log('✓ LanguageModel session created');
    
    // 2. Build History String (using your slice(-1) rule)
    let historyString = 'No chat history yet.';
    if (chatHistory && chatHistory.length > 0) {
      const recentHistory = chatHistory.slice(-1);
      historyString = "This is the conversation so far:\n" +
        recentHistory.map(msg => {
            const role = msg.role === 'user' ? 'User' : 'Assistant';
            return `${role}: ${msg.content}`;
        }).join('\n');
    }

    // 3. Build Knowledge Base Context
    const contextString = buildKnowledgeBaseContext(articles); // Calls our new, simpler function

    // 4. Build the FINAL, INSTRUCTION-HEAVY prompt
    const finalPrompt = `
Your instructions are:
1.  Your *only* job is to answer questions based on the "CHAT HISTORY" and "KNOWLEDGE BASE" provided below.
2.  **CRITICAL RULE:** If the user's question cannot be answered using *only* the CHAT HISTORY or the KNOWLEDGE BASE, you MUST respond with: "I'm sorry, I couldn't find any relevant information in your knowledge base about that."
3.  **DO NOT** use your own general knowledge to answer factual questions.
4.  **EXCEPTION:** You may answer simple greetings like "hello" or "how are you?".
5.  Use appropriate past tense for events that have already occurred.

---
KNOWLEDGE BASE:
${contextString}
---
CHAT HISTORY:
${historyString}
---

User: ${query}
Assistant:
`;

    // 5. (As requested) Log this final combined prompt for debugging
    console.log('--- DEBUG: Final Prompt to AI ---');
    console.log(finalPrompt);
    console.log('--- END DEBUG ---');

    // 6. Send the *entire* context blob as the main prompt
    const response = await session.prompt(finalPrompt);
    
    console.log('✅ Gemini response generated, length:', response.length);
    
    // Cleanup
    session.destroy();
    
    return response;
    
  } catch (error) {
    console.error('❌ Gemini chat error:', error);
    console.log('Falling back to simple chat');
    return fallbackChat(query, articles);
  }
}

/**
 * Builds the knowledge base context string.
 * (This function NO LONGER returns a full system prompt)
 */
function buildKnowledgeBaseContext(articles) {
  let contextString;
  if (!articles || articles.length === 0) {
    contextString = "The user hasn't saved any articles yet.";
  } else {
    // Keep slice(0, 3) to manage token limits
    const context = articles.slice(0, 3).map((article, index) => {
      return `Article ${index + 1}: "${article.title}"
Summary: ${article.summary || 'No summary available'}
URL: ${article.url || 'N/A'}
---`;
    }).join('\n\n');
    
    contextString = context;
  }
  return contextString;
}

/**
 * Fallback chat (simple keyword matching)
 */
function fallbackChat(query, articles) {
  const lowerQuery = query.toLowerCase();
  const relevantArticles = articles.filter(a => 
    a.title.toLowerCase().includes(lowerQuery) ||
    (a.summary && a.summary.toLowerCase().includes(lowerQuery))
  );
  
  if (relevantArticles.length > 0) {
    const titles = relevantArticles.slice(0, 3).map(a => `"${a.title}"`).join(', ');
    return `I found ${relevantArticles.length} article(s) related to your query: ${titles}.`;
  } else {
    return `I couldn't find articles matching "${query}". Try different keywords or save more articles.`;
  }
}

// ============================================
// INITIALIZATION & TESTING
// ============================================

/**
 * Test Gemini APIs
 */
async function testGeminiAPIs() {
  console.log('🧪 Testing Gemini Nano APIs...');
  
  // Test Summarizer
  const summarizerAvailable = await canSummarize();
  console.log('📊 Summarizer API:', summarizerAvailable);
  
  if (summarizerAvailable === 'available') {
    try {
      const testText = 'Artificial intelligence is transforming how we interact with technology. Machine learning models can now understand context, generate creative content, and assist with complex tasks. The rise of on-device AI means these capabilities are becoming more private and accessible.';
      const testSummary = await summarizeWithGemini(testText, { length: 'short' });
      console.log('✅ Test summary:', testSummary);
    } catch (error) {
      console.error('Test summarization failed:', error);
    }
  }
  
  // Test Prompt API
  const promptAvailable = await canPrompt();
  console.log('📊 LanguageModel API:', promptAvailable);
  
  if (promptAvailable === 'available') {
    try {
      const testQuery = 'Say hello in 5 words';
      const testResponse = await chatWithGemini(testQuery, []);
      console.log('✅ Test chat response:', testResponse);
    } catch (error) {
      console.error('Test chat failed:', error);
    }
  }
 
  console.log('✅ Gemini API tests complete');
}

console.log('✓ Gemini API module loaded');
