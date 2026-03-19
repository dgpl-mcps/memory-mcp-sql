# AI Agent Context & Search Guide

This document provides guidance on which memory functions to use for optimal context retrieval.

---

## Configuration (Default from .env)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `DEFAULT_SEARCH_LIMIT` | 10 | Number of results to return |
| `DEFAULT_SEARCH_OFFSET` | 0 | Pagination offset |
| `DEFAULT_CONFIDENCE_THRESHOLD` | 20 | Minimum confidence score (0-100) |
| `ENABLE_DEFER_LOADING` | true | Load all tools on startup (set false in .env for all tools) |

---

## Migration from Obsidian Vault

To migrate from an Obsidian vault SQLite database:

```bash
# Run migration (will use MCP tools automatically)
node build/migrate_from_vault.js
```

The migration script:
1. Reads chunks from `main.sqlite`
2. Uses `extract_entities` to extract persons, bots, organizations
3. Uses `add_timeline_entry` to store content
4. Creates topics based on path structure

---

## Startup / First Chat

Use these functions when starting a new conversation or when you need to establish context:

### Step 1: Store the conversation first
```javascript
// Store user message and agent response
memory_remember({
  userId: "user1",
  projectId: "proj1",
  sessionId: "new_session_id",
  userMessage: "What is React?",
  agentMessage: "React is a JavaScript library..."
})
```

### Step 2: Recall context from previous sessions
```javascript
// BEST CHOICE - Searches short-term → long-term → cross-session
memory_recall({
  userId: "user1",
  projectId: "proj1",  // Required!
  sessionId: "new_session_id",
  query: "previous work on this project",
  limit: 10,
  offset: 0,
  confidenceThreshold: 20
})

// Fallback: Typo-tolerant search
memory_fuzzy_recall({
  userId: "user1",
  projectId: "proj1",  // Required!
  query: "react hooks"
})

// Global: Search ALL memories (no userId/projectId filter)
global_memory_search({
  query: "api setup"
  // Optional: userId, projectId, limit, offset, confidenceThreshold
})
```

### Alternative: Semantic Embedding Search
```javascript
// Uses vector embeddings for semantic similarity
recall({
  userId: "user1",
  query: "how to setup database",
  refTable: "ShortTermChat",  // Optional: filter by table
  limit: 10,
  offset: 0
})
```

---

## Continued Chats

Use these functions during an ongoing conversation:

### Primary Functions

| Function | Use Case |
|----------|----------|
| **`memory_context`** | **BEST CHOICE** - Token-optimized context for LLM |
| **`memory_history`** | Get conversation history for current session |
| **`add_chat_message`** | Store individual chat messages |
| **`search_short_term_memory`** | Search only current session's memory |

### Example - Ongoing Context
```javascript
// Get LLM-optimized context (summarized)
memory_context({
  userId: "user1",
  sessionId: "current_session",
  maxTokens: 6000,
  limit: 10
})

// Store each message
add_chat_message({
  userId: "user1",
  projectId: "proj1",
  sessionId: "current_session",
  role: "user",  // or "assistant"
  content: "User message here"
})

// Background search while chatting
memory_recall({
  userId: "user1",
  projectId: "proj1",
  sessionId: "current_session",
  query: "api configuration"
})

// Get session history
memory_history({
  userId: "user1",
  sessionId: "current_session",
  limit: 10,
  offset: 0
})
```

---

## All Search Functions

### Core Memory Search

| Function | Description | Required Params |
|----------|-------------|-----------------|
| `memory_recall` | Multi-source search (short-term + long-term + cross-session) | userId, projectId, query |
| `memory_fuzzy_recall` | Fuzzy search with typo tolerance | userId, projectId, query |
| `global_memory_search` | Global search (optional userId/projectId filters) | query |
| `search_short_term_memory` | Search current session memory only | userId, projectId, query |
| `recall` | Semantic embedding search | userId, query |

### Specialized Search

| Function | Description |
|----------|-------------|
| `search_graph` | Search graph database entities |
| `deep_search_graph` | Recursive graph search with depth control |
| `search_document` | Search stored document chunks |
| `memory_search_by_date` | Search by date range |
| `memory_search_by_tag` | Search by tags |
| `search_insights` | Search agent insights |
| `search_tools` | Search registered tools |

### Context & History

| Function | Description |
|----------|-------------|
| `memory_context` | Token-optimized LLM context |
| `memory_history` | Conversation history with summaries |
| `get_chat_history` | Raw chat history |

### Storage Functions

| Function | Description |
|----------|-------------|
| `memory_remember` | Store conversation (userMessage + agentMessage) |
| `memorize` | Store general content to embeddings |
| `add_chat_message` | Store individual chat message |
| `store_insight` | Store agent insight to graph |

---

## Recommended Flow

### 1. Startup Flow
```
1. First: memory_remember() to store initial context
   ↓
2. Then: memory_recall(query, userId, projectId, sessionId)
   ↓
3. If no results → memory_fuzzy_recall(query, userId, projectId)
   ↓
4. If still nothing → global_memory_search(query) [works WITHOUT filters!]
```

### 2. Continued Chat Flow
```
1. Start with: memory_context(userId, sessionId, maxTokens)
   ↓
2. Store each message: add_chat_message(userId, projectId, sessionId, role, content)
   ↓
3. Background: memory_recall(query) for relevant context
   ↓
4. On demand: search_short_term_memory(userId, projectId, query)
```

### 3. Fallback Flow
```
If specific search fails → try global_memory_search WITHOUT filters
```

---

## Response Format

All search functions return a consistent format:

```json
{
  "results": [...],
  "search_context": {
    "limit": 10,
    "offset": 0,
    "confidenceThreshold": 20,
    "scope": "all",
    "source": "memory_recall"
  }
}
```

---

## Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `FOREIGN KEY constraint failed` | Project/Task doesn't exist | Create project first with `create_project()` |
| `Schema Validation Failed` | Missing required params | Check required params for each tool |
| `NOT NULL constraint failed` | Missing required field like `name` | Provide all required fields |
| No results | Wrong userId/projectId | Use `global_memory_search` without filters |

---

## Tips for Better Context

1. **Always create project first** - Many tools require valid projectId
   ```javascript
   create_project({ userId: "user1", name: "My Project" })
   ```

2. **Store messages with add_chat_message** - Better context tracking
   ```javascript
   add_chat_message({ userId, projectId, sessionId, role: "user", content: "..." })
   ```

3. **Use memory_remember** - For full conversation storage
   ```javascript
   memory_remember({ userId, projectId, sessionId, userMessage, agentMessage })
   ```

4. **Provide userId** - Ensures personalized results
5. **Provide sessionId** - Enables cross-session memory linking
6. **Use projectId** - Scopes search to specific project
7. **Set confidenceThreshold** - Higher (50+) for precise, Lower (10-20) for more results
8. **Use pagination** - `limit` + `offset` for large result sets

---

## Important Notes

- **`global_memory_search`** can work WITHOUT userId/projectId - searches ALL memories
- **Most tools require projectId** except: global_memory_search, memory_stats, diagnose_memory_health
- **memory_recall requires projectId** even though it's useful for search
- **Vector search (recall)** requires embedding table setup - falls back gracefully if not available
