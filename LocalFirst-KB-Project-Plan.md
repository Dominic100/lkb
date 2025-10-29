# LocalFirst Knowledge Base - Comprehensive Project Plan
## Google Chrome Built-in AI Challenge 2025

**Document Version**: 1.0  
**Last Updated**: October 27, 2025  
**Timeline**: 6 days (Oct 27 - Nov 2, 2025)  
**Hackathon Submission Deadline**: Oct 31, 2025 (11:45 PM PST)

---

## Executive Summary

**Project Name**: LocalFirst Knowledge Base (LFKB)  
**Type**: Chrome Extension + Web App (hybrid)  
**Core USP**: Privacy-first, browser-native knowledge management powered by Gemini Nano. All data stays local. No cloud sync. No subscriptions.

**APIs Used**: 
- Summarizer API (auto-summarize content)
- Writer API (generate connections/insights)
- Prompt API (chat with your knowledge)
- Proofreader API (polish saved notes) [Optional in MVP]

**Tech Stack**: 
- Manifest V3 Chrome Extension
- IndexedDB (local storage)
- Web Crypto API (client-side encryption)
- Service Workers (background processing)
- Vanilla JavaScript + Tailwind CSS

---

## Phase 1: MVP (6-Day Sprint) - Core Deliverables

### Sprint Breakdown by Day

#### **Day 1 (Oct 27) - Foundation & Setup**
**Goal**: Environment ready, core architecture in place, first API integrated

**Deliverables**:
1. **Project Scaffolding** (2-3 hours)
   - Create Chrome extension structure (Manifest V3 compliant)
   - Set up folder structure: `/src/background`, `/src/content`, `/src/popup`, `/src/ui`
   - Initialize git repo with `.gitignore`, LICENSE (MIT)

2. **Manifest V3 Configuration** (1 hour)
   ```json
   {
     "manifest_version": 3,
     "name": "LocalFirst Knowledge Base",
     "description": "Private, offline-first knowledge management powered by Gemini Nano",
     "permissions": ["storage", "tabs", "webRequest"],
     "host_permissions": ["<all_urls>"],
     "background": {
       "service_worker": "src/background/service-worker.js"
     },
     "action": {
       "default_popup": "src/popup/popup.html",
       "default_title": "Open LocalFirst KB"
     },
     "icons": {
       "16": "assets/icon-16.png",
       "48": "assets/icon-48.png",
       "128": "assets/icon-128.png"
     }
   }
   ```

3. **Early Preview Program Access** (1 hour)
   - Sign up for Chrome Built-in AI EPP if not already enrolled
   - Verify Gemini Nano access in Chrome Canary
   - Test Summarizer API basic functionality

4. **Storage Schema Design** (1.5 hours)
   - Design IndexedDB schema:
     ```
     Database: "lfkb-store" (version 1)
     
     ObjectStore 1: "articles"
       keyPath: "id"
       indexes: ["url", "dateAdded", "source"]
       schema: {
         id: UUID,
         url: string,
         title: string,
         originalText: string,
         summary: string,
         source: "web-save" | "clipboard" | "highlight",
         dateAdded: timestamp,
         tags: string[],
         encrypted: boolean,
         encryptionIV: string (if encrypted)
       }
     
     ObjectStore 2: "metadata"
       keyPath: "key"
       schema: {
         key: string (e.g., "userSettings", "apiKeys"),
         value: any,
         encrypted: boolean
       }
     ```

5. **UI Scaffolding** (1 hour)
   - Popup HTML structure (save button, search box, settings link)
   - Sidebar/panel UI mockup (list of saved items)
   - CSS reset + Tailwind setup

---

#### **Day 2 (Oct 28) - Summarizer Integration & Data Capture**
**Goal**: Save web content, auto-summarize with Gemini Nano

**Deliverables**:
1. **Content Capture System** (2 hours)
   - Context menu item: "Save & Summarize to LFKB"
   - Content script to extract:
     - Main article text (use dom-purify or similar)
     - Metadata (title, URL, publish date, author if available)
     - Page heading/outline
   - Message passing from content script → service worker → storage

2. **Summarizer API Integration** (2 hours)
   - Initialize Summarizer API connection
   - Function: `summarizeContent(textString)` → Promise<summary>
   - Error handling:
     - If API unavailable → use fallback (take first N sentences)
     - Queue summaries if offline
   - Test with 3-5 real articles

3. **IndexedDB Write Operations** (1 hour)
   - Create/update transactions for storing articles
   - Handle `QuotaExceededError` with user warning
   - Implement auto-cleanup (optional): flag old articles after 30 days

4. **UI: Article List View** (1.5 hours)
   - Display saved articles with:
     - Title, URL, date added
     - Original text (collapsed, expandable)
     - Auto-generated summary (highlighted)
   - Basic pagination/infinite scroll

5. **Testing & Debugging** (1 hour)
   - Save 5+ articles from real websites
   - Verify summaries are generated client-side
   - Check storage in DevTools → Application → IndexedDB

---

#### **Day 3 (Oct 29) - Search & Prompt API (Chat Feature)**
**Goal**: Chat with your knowledge base via Prompt API

**Deliverables**:
1. **Full-Text Search** (1.5 hours)
   - IndexedDB query: search across titles, summaries, original text
   - Implement fuzzy search or simple keyword matching
   - Display results with snippet preview

2. **Prompt API Integration** (2.5 hours)
   - Function: `chatWithKnowledge(userQuery, recentArticles)` → Promise<response>
   - Flow:
     - User types: "What did I read about AI regulation?"
     - Search LFKB for relevant articles (regex match)
     - Pass top 3-5 articles + user query to Prompt API
     - Gemini Nano generates contextual response
   - Example system prompt:
     ```
     You are a personal knowledge assistant. The user has saved these articles and summaries.
     Based on this knowledge base, answer the user's question concisely.
     
     [Articles]:
     - [title]: [summary]
     ...
     
     User Question: {userQuery}
     ```

3. **Chat UI** (1.5 hours)
   - Chat panel in popup/sidebar
   - Message history (session-only for MVP)
   - Display sources: link back to original articles

4. **Error Handling** (1 hour)
   - Handle Prompt API failures gracefully
   - Show "Processing..." states
   - Log errors for debugging

5. **Testing** (1 hour)
   - Chat with sample KB (save 5-10 test articles)
   - Test natural language queries
   - Verify response relevance

---

#### **Day 4 (Oct 30) - Polish, Encryption, & UI Refinement**
**Goal**: Production-ready MVP, privacy hardening

**Deliverables**:
1. **Client-Side Encryption** (1.5 hours)
   - Implement basic Web Crypto API (AES-GCM)
   - Optional toggle: "Encrypt stored data"
   - Store encryption IV in IndexedDB alongside encrypted blob
   - Note: User must remember encryption password (or we prompt on startup)
   - Code snippet:
     ```javascript
     async function encryptArticle(article, password) {
       const key = await crypto.subtle.deriveBits(
         { name: "PBKDF2", salt: new Uint8Array(16), iterations: 100000, hash: "SHA-256" },
         await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]),
         256
       );
       const iv = crypto.getRandomValues(new Uint8Array(12));
       const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(article)));
       return { encrypted: new Uint8Array(encrypted), iv };
     }
     ```

2. **Settings Panel** (1 hour)
   - Toggle: "Enable encryption"
   - Option: "Export all data as JSON"
   - Option: "Delete all data"
   - Storage quota display: `navigator.storage.estimate()`

3. **Popup UI Refinement** (1.5 hours)
   - Icons and proper styling
   - Responsive design (works on mobile too if web version)
   - Keyboard shortcuts: Ctrl+Shift+S (save) or similar
   - Visual polish: colors, spacing, fonts

4. **Error Messages & UX** (1 hour)
   - User-friendly error messages
   - "No articles saved yet" state
   - "Summarization in progress..." feedback
   - Retry buttons for failed operations

5. **Code Cleanup** (1 hour)
   - Remove console.logs (except errors)
   - Code comments for key functions
   - Modularize code (utils.js, storage.js, api.js)

---

#### **Day 5 (Oct 31 - Submission Day) - Demo & Documentation**
**Goal**: Submit working project, create compelling demo

**Deliverables**:
1. **README.md** (1 hour)
   - Features overview
   - Installation instructions
   - Screenshots
   - Architecture diagram (simple)
   - Privacy statement: "All data stored locally, never sent to servers"

2. **Demo Video** (2-3 hours)
   - Script: 2.5 minutes max
     - 0:00-0:30 - Problem statement (info overload, privacy concerns)
     - 0:30-1:15 - Save article → auto-summarize (show Summarizer API working)
     - 1:15-1:45 - Chat with KB (show Prompt API, natural query)
     - 1:45-2:15 - Settings, encryption, local storage proof
     - 2:15-2:30 - Privacy statement, call to action
   - Record with OBS or similar
   - Edit: speed up boring parts, add captions/text overlays
   - Upload to YouTube (unlisted initially, make public for submission)
   - Include background music (royalty-free, low volume)

3. **GitHub Setup** (30 mins)
   - Push all code to public repo
   - Include: `README.md`, `ARCHITECTURE.md`, `LICENSE` (MIT)
   - Installation instructions (load from `chrome://extensions`, enable Developer Mode)
   - Clarify EPP requirement in README

4. **Test Run** (1 hour)
   - Fresh Chrome profile, load extension
   - Walk through full workflow: save → summarize → chat
   - Verify no errors in console
   - Time the operation (should be <5s per action)

5. **Submission** (30 mins)
   - Fill out Devpost form:
     - Application link (GitHub repo)
     - Video link (YouTube)
     - Description:
       ```
       "LocalFirst Knowledge Base: A privacy-first, offline knowledge management system 
       powered by Chrome's Gemini Nano. Save articles, auto-summarize with Summarizer API, 
       and chat with your knowledge using Prompt API—all on your device, no cloud sync, 
       no subscriptions.
       
       APIs used: Summarizer, Prompt, (optional: Proofreader)
       Problem solved: Information overload + privacy concerns with existing PKM tools
       ```
     - Testing instructions (how to load extension, use EPP)

---

#### **Day 6 (Nov 1 Buffer/Polish)**
**Goal**: Respond to any feedback, minor fixes

**Deliverables**:
- Address any issues found during Day 5 testing
- Final video edits if needed
- Optional: Create feedback submission form response (eligibility for "Most Valuable Feedback" prize)

---

## Phase 2: Full-Featured Vision (Post-MVP, Time Permitting)

*These features are intentionally scoped out of the 6-day MVP but included here for discussion and potential inclusion if sprint momentum allows.*

### Tier 1: High-Impact Add-ons (If 2-3 extra days)

#### **A. Smart Content Connections (Writer API)**
**Scope**: Generate relationships between saved articles
- **Feature**: "Related insights" - Writer API suggests connections
- **Implementation**:
  - After summarizing 3+ articles, trigger Writer API
  - System prompt: "Find conceptual connections between these summaries and generate insights"
  - Example: If saved articles about "AI regulation", "data privacy", "Chrome AI"
  - Generate: "These articles suggest browsers are becoming AI gatekeepers. Key tension: privacy vs. capability"
- **UI**: New tab "Insights" showing auto-generated connections

#### **B. Persistent Chat History**
**Scope**: Store and replay chat conversations
- **Feature**: Chat sessions preserved in IndexedDB
- **Schema**:
  ```
  ObjectStore: "chatSessions"
  {
    sessionId: UUID,
    dateCreated: timestamp,
    messages: [{ role: "user"|"assistant", content: string, timestamp }],
    sourceArticles: [articleIds]
  }
  ```
- **UI**: "Previous conversations" sidebar, replay chats

#### **C. Tag Management & Hierarchy**
**Scope**: Organize articles with tags/folders
- **Feature**: Auto-suggest tags based on content + manual tagging
- **Implementation**: Use Writer API to suggest tags (e.g., "ai-policy", "privacy")
- **UI**: Tag filter, tag hierarchy view

#### **D. Export & Share (Privacy-Preserved)**
**Scope**: Export KB as JSON, optionally encrypted
- **Feature**: 
  - Export all articles + chat history as `.json.gpg` (with password)
  - Import from backup
  - Share anonymized KB (remove URLs, personalizations)
- **Use Case**: Backup, migration, or share research with team (encrypted)

### Tier 2: Advanced Features (If 4+ extra days)

#### **E. Browser History Context Extraction**
**Scope**: Optionally import browser history for semantic search
- **Challenge**: Requires `history` permission, complex to implement
- **Feature**: 
  - User opts in: "Index browser history for search context"
  - Extract titles + snippets from history
  - Index in separate ObjectStore (not articles)
  - Query: "Show me all pages I visited about X"
- **Privacy**: Can be disabled; data stays local
- **Limitation**: Max 10,000 history items indexed

#### **F. Multi-Document Summarization**
**Scope**: Summarize multiple articles together for holistic insights
- **Feature**:
  - Select 3+ articles
  - Generate combined summary (Writer API)
  - Example: "Summarize the top 3 arguments about AI regulation I've saved"
- **Use Case**: Research synthesis, literature review prep

#### **G. Proofreader API Integration**
**Scope**: Polish user notes/highlights
- **Feature**: 
  - User adds personal notes to saved articles
  - Proofreader API fixes grammar/clarity
  - Suggest alternative phrasings
- **UI**: "Review note" button → shows corrections

#### **H. Time-Based Insights**
**Scope**: Semantic analysis over time
- **Feature**:
  - "What topics have I been researching?"
  - "How has my thinking on X evolved?" (show progression)
  - Generate trend analysis using Prompt API
- **Implementation**: Use timestamps + article summaries for temporal analysis

#### **I. Collaborative/Team Mode** (Web App Version)
**Scope**: Share encrypted KB with team (hybrid with cloud)
- **Challenge**: Requires server + trust model; conflicts with "privacy-first" ethos
- **Feature**: 
  - Optional: sync with Firebase (all data still encrypted client-side)
  - Share read-only links (encrypted)
  - Team annotations (still private to user)
- **Note**: This dilutes the "local-first" narrative; consider carefully

#### **J. Audio/Video Transcript Summarization**
**Scope**: Support for video transcripts or audio notes
- **Feature**:
  - User uploads video transcript or audio file
  - Summarizer API processes audio (multimodal)
  - Save summary + original transcript
- **Challenge**: File size limits, browser API constraints for audio processing
- **Use Case**: Podcast/lecture notes management

### Tier 3: Technical Enhancements (Infrastructure)

#### **K. Full-Text Search Indexing**
**Scope**: Faster search via indexed queries
- **Implementation**:
  - Add indexes to IndexedDB on "summary", "title"
  - Implement trie-based search for autocomplete
  - Use Web Workers for non-blocking search

#### **L. Data Sync Across Devices** (Optional Cloud Bridge)
**Scope**: Hybrid approach—local-first with optional sync
- **Feature**:
  - User can opt-in to encrypt & backup to Google Drive/Dropbox
  - Restore on different device
  - Uses Web Crypto API to ensure data encrypted before leaving device
- **Challenge**: Complex encryption key management
- **Privacy**: Clear user consent, audit trail

#### **M. Offline Service Worker Caching**
**Scope**: Better offline support
- **Implementation**:
  - Service Worker caches Gemini Nano responses
  - Even if tab closed, next session uses cached responses
  - Cache TTL: 7 days, with purge on quota exceeded

---

## Full Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│            Chrome Extension (Manifest V3)                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐         ┌──────────────────┐           │
│  │  Content Script  │         │  Service Worker  │           │
│  │  (inject in      │◄───────►│  (background.js) │           │
│  │   web pages)     │         │  - Event handler │           │
│  │  - Capture text  │         │  - API calls     │           │
│  │  - Context menu  │         │  - Storage mgmt  │           │
│  └──────────────────┘         └──────────────────┘           │
│           ▲                             │                     │
│           │                             ▼                     │
│           │                    ┌──────────────────┐           │
│           │                    │  Chrome AI APIs  │           │
│           │                    │  - Summarizer    │           │
│           │                    │  - Prompt        │           │
│           │                    │  - Writer        │           │
│           │                    │  - Proofreader   │           │
│           │                    └──────────────────┘           │
│           │                             ▲                     │
│           │        ┌────────────────────┘                     │
│           │        │                                          │
│  ┌──────────────────────────────────┐                        │
│  │        Popup UI (popup.html)     │                        │
│  │  - Chat interface                │                        │
│  │  - Article list                  │                        │
│  │  - Search                         │                        │
│  │  - Settings                       │                        │
│  └──────────────────────────────────┘                        │
│           ▲                                                    │
│           │                                                    │
│  ┌──────────────────────────────────┐                        │
│  │     IndexedDB (Local Storage)    │                        │
│  │  - articles (summaries, text)    │                        │
│  │  - metadata (settings, cache)    │                        │
│  │  - chatSessions (optional)       │                        │
│  │  [Encrypted with Web Crypto API] │                        │
│  └──────────────────────────────────┘                        │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Storage & Quota Management

| Browser | Limit | Notes |
|---------|-------|-------|
| Chrome | ~80% of free disk | Per origin. Typical: 60GB on 100GB drive. Shared pool. |
| Firefox | ~2GB (desktop) or ~5MB (mobile) | Dynamically allocated. Prompts user at 50MB. |
| Safari | ~1GB per origin | iOS: stricter. May auto-delete if low space. |
| Edge | Similar to Chrome | 80% of free disk. Enterprise policies may override. |

**MVP Strategy**: 
- Warn user at 100MB of stored data
- Offer "Archive old articles" (move to separate store, keep in UI)
- Show storage usage in settings: `navigator.storage.estimate()`

---

## Tech Stack Details

### Dependencies (for package.json, if using bundler)
```json
{
  "devDependencies": {
    "webpack": "^5.x",
    "webpack-cli": "^5.x",
    "tailwindcss": "^3.x",
    "postcss": "^8.x"
  },
  "dependencies": {}
}
```
*(Minimize dependencies for lean bundle; prefer vanilla JS)*

### File Structure
```
localfirst-kb/
├── src/
│   ├── background/
│   │   ├── service-worker.js (main background logic)
│   │   ├── apis.js (Summarizer, Prompt API wrappers)
│   │   └── storage.js (IndexedDB operations)
│   ├── content/
│   │   └── content.js (web page injection, context menu)
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.js
│   │   └── popup.css
│   ├── ui/
│   │   ├── components.js (reusable UI components)
│   │   └── styles.css (Tailwind base)
│   └── utils/
│       ├── encryption.js (Web Crypto utilities)
│       ├── indexeddb.js (DB schema, queries)
│       └── helpers.js (general utilities)
├── assets/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── manifest.json
├── README.md
├── ARCHITECTURE.md
├── LICENSE (MIT)
└── package.json (if using build tools)
```

---

## Success Criteria & Metrics

### MVP Success (Day 5 Submission)
- [ ] Extension loads without errors in Chrome 123+
- [ ] Save articles with context menu
- [ ] Summarizer API generates summaries (<5s per article)
- [ ] Prompt API chat works (at least 1 successful query)
- [ ] IndexedDB stores 20+ articles reliably
- [ ] No sensitive data logged to console
- [ ] Demo video under 3 minutes, shows all features
- [ ] GitHub repo is public, includes README & LICENSE

### Demo Scoring Rubric (Estimated)
| Criterion | Weight | Judging Criteria |
|-----------|--------|------------------|
| **Functionality** | 25% | Does it work? All APIs used? Edge cases handled? |
| **Novelty** | 25% | Is it genuinely new? (Yes—local + AI combo) |
| **User Experience** | 20% | Is it intuitive? Polished UI? |
| **Technical Depth** | 15% | Smart architecture? Efficient code? |
| **Problem-Solution Fit** | 15% | Does it solve the stated problem? |

---

## Known Limitations & Constraints

### MVP Limitations (Intentional)
1. **No cross-browser sync** - Data stored only in current browser/profile
2. **No multimodal input** - Text-only for MVP (no images/PDFs)
3. **Chat history session-only** - Cleared on extension reload
4. **Encryption optional** - Not enforced (data unencrypted by default for performance)
5. **Limited to ~100 articles comfortably** - Before UI becomes sluggish (can optimize with virtualization)

### Technical Constraints
1. **Service Worker lifetime** - Terminates after 30s inactivity (Chrome MV3)
2. **IndexedDB transaction limits** - Can't keep transactions open long
3. **Content script injection** - Not all sites allow it (e.g., Chrome Web Store, gmail.com)
4. **API rate limits** - Gemini Nano may throttle if hammered

### Privacy Trade-offs
- **Web Crypto API encryption is client-side, but**:
  - Browser extensions run with high privileges (can be exploited)
  - Always assume data **could** be accessed by browser itself
  - Not suitable for highly sensitive data (e.g., passwords)
  - For general knowledge/research = excellent privacy

---

## Testing Checklist

### Unit Tests (if time)
- [ ] `summarizeContent()` function
- [ ] `chatWithKnowledge()` function
- [ ] `encryptArticle()` / `decryptArticle()` functions
- [ ] IndexedDB CRUD operations

### Integration Tests
- [ ] Context menu → Save article → appears in list
- [ ] Search query → returns relevant articles
- [ ] Chat query → Prompt API responds with knowledge
- [ ] Settings → Encryption toggle works
- [ ] Export data → JSON file is valid

### Manual Testing (Critical)
- [ ] Test on Chrome Canary (where Gemini Nano available)
- [ ] Test with 10+ varied articles (news, blog, academic)
- [ ] Test chat with natural language (typos, unclear queries)
- [ ] Test offline mode (disconnect internet, try operations)
- [ ] Test encryption toggle on/off
- [ ] Test storage quota warnings
- [ ] Test on slow network (3G simulation)

---

## Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Gemini Nano API fails | High | Fallback to simple text extraction for summaries |
| Prompt API rate limited | Medium | Implement request queue, exponential backoff |
| IndexedDB quota exceeded | Medium | Warn user, offer archive/cleanup |
| Chrome MV3 service worker terminates mid-operation | Low | Use `sendResponse(true)` for async messages |
| User loses encryption password | High | Store unencrypted backup initially; add password recovery in future |
| Complex articles don't summarize well | Medium | Manual override: user can edit summary |
| Privacy concerns raised | Medium | Clear documentation, audit logs, no telemetry |

---

## Feedback Form & Future Work

### Optional: "Most Valuable Feedback" Prize
After submitting, fill out: https://forms.gle/V3QzcVcNMotTiYdd9
- Share your experience building with Chrome AI APIs
- Suggest improvements to developer tools
- Eligible for special recognition + potential prize

### Post-Hackathon Roadmap (If winning / going further)
- **Month 1**: Optimize search (virtual scrolling for 1000+ articles)
- **Month 2**: Add Tier 1 features (connections, chat history, tags)
- **Month 3**: Community feedback loop, publish to Chrome Web Store
- **Month 4+**: Consider monetization (optional: premium features like cross-device sync)

---

## Compliance & Legal

- **License**: MIT (permissive, hackathon-friendly)
- **Privacy Policy**: Not required for MVP (extension + local data = no external data collection)
- **Compliance**: Follows Chrome Web Store policies (no malware, no data collection without consent)
- **User Data**: Never sent anywhere. All processing client-side.

---

## Contact & Collaboration

**Author**: [Your Name]  
**GitHub**: [Repo Link]  
**Twitter/Contact**: [Your handle]

Questions? Open an issue on GitHub.

---

## Appendix: Code Snippets & Reference

### A. Basic Summarizer API Usage
```javascript
async function summarizeContent(text) {
  try {
    const canSummarize = await ai.canCreateTextSession();
    if (canSummarize !== "readily") {
      console.warn("Summarizer not available");
      return text.substring(0, 200) + "...";
    }
    
    const session = await ai.createTextSession();
    const summary = await session.summarize(text, { type: "key-points" });
    return summary;
  } catch (error) {
    console.error("Summarize failed:", error);
    return null;
  }
}
```

### B. IndexedDB Initialization
```javascript
async function initializeDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("lfkb-store", 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains("articles")) {
        const store = db.createObjectStore("articles", { keyPath: "id" });
        store.createIndex("url", "url", { unique: false });
        store.createIndex("dateAdded", "dateAdded", { unique: false });
      }
      
      if (!db.objectStoreNames.contains("metadata")) {
        db.createObjectStore("metadata", { keyPath: "key" });
      }
    };
  });
}
```

### C. Prompt API Chat
```javascript
async function chatWithKnowledge(query, articles) {
  try {
    const canGenerate = await ai.canCreateTextSession();
    if (canGenerate !== "readily") return null;
    
    const session = await ai.createTextSession();
    
    const context = articles
      .map(a => `- ${a.title}: ${a.summary}`)
      .join("\n");
    
    const systemPrompt = `You are a personal knowledge assistant. 
    Here are saved articles:
    ${context}
    
    User question: ${query}
    Respond concisely.`;
    
    const response = await session.prompt(systemPrompt);
    return response;
  } catch (error) {
    console.error("Chat failed:", error);
    return null;
  }
}
```

### D. Web Crypto Encryption (Simple)
```javascript
async function encryptData(data, password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
  
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(JSON.stringify(data))
  );
  
  return { encrypted: new Uint8Array(encrypted), salt, iv };
}
```

---

## Version History
- **v1.0** (Oct 27, 2025) - Initial comprehensive plan with MVP + full vision features

---

**End of Document**
