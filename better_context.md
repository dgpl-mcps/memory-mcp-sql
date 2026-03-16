# AI Agent Context & Search Guide

This document provides guidance on which memory functions to use for optimal context retrieval.

---

## Configuration (Default from .env)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `DEFAULT_SEARCH_LIMIT` | 10 | Number of results to return |
| `DEFAULT_SEARCH_OFFSET` | 0 | Pagination offset |
| `DEFAULT_CONFIDENCE_THRESHOLD` | 20 | Minimum confidence score (0-100) |

---

## Startup / First Chat

Use these functions when starting a new conversation or when you need to establish context:

### Primary Functions

| Function | Use Case |
|----------|----------|
| **`memory_recall`** | **BEST CHOICE** - Searches short-term → long-term → cross-session all at once |
| **`global_memory_search`** | Search ALL memories globally (no userId/projectId filter) |
| **`memory_fuzzy_recall`** | Typo-tolerant search with Levenshtein distance |

### Example - Startup Context
```javascript
// First call - get comprehensive context
memory_recall({
  userId: "user1",
  projectId: "proj1",
  sessionId: "new_session_id",
  query: "previous work on this project",
  limit: 10,
  confidenceThreshold: 20
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
| **`search_short_term_memory`** | Search only current session's memory |

### Example - Ongoing Context
```javascript
// Get LLM-optimized context
memory_context({
  userId: "user1",
  sessionId: "current_session",
  maxTokens: 6000,
  limit: 10
})

// Background search while chatting
memory_recall({
  userId: "user1",
  projectId: "proj1",
  sessionId: "current_session",
  query: "api configuration"
})
```

---

## All Search Functions

### Core Memory Search

| Function | Description |
|----------|-------------|
| `memory_recall` | Multi-source search (short-term + long-term + cross-session) |
| `memory_fuzzy_recall` | Fuzzy search with typo tolerance |
| `global_memory_search` | Global search without user/project filters |
| `search_short_term_memory` | Search current session memory only |

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
| `memory_history` | Conversation history |
| `get_chat_history` | Raw chat history |

---

## Recommended Flow

### 1. Startup Flow
```
1. memory_recall(query, userId, projectId, sessionId)
   ↓
2. If no results → memory_fuzzy_recall(query, userId)
   ↓
3. If still nothing → global_memory_search(query)
```

### 2. Continued Chat Flow
```
1. Start with: memory_context(userId, sessionId, maxTokens)
   ↓
2. Background: memory_recall(query) for each user message
   ↓
3. On demand: search_short_term_memory(userId, projectId, query)
```

### 3. Fallback Flow
```
If specific search fails → try global_search → then fuzzy_recall
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

## Tips for Better Context

1. **Always provide `userId`** - Ensures personalized results
2. **Provide `sessionId`** - Enables cross-session memory linking
3. **Use `projectId`** - Scopes search to specific project
4. **Set `confidenceThreshold`** - Higher (50+) for precise, Lower (10-20) for more results
5. **Use pagination** - `limit` + `offset` for large result sets
6. **Query expansion** - `memory_recall` automatically expands queries for better recall

---

## Error Handling

If a search fails:
- Check if `userId` is valid
- Verify `projectId` exists
- Try lowering `confidenceThreshold`
- Fall back to `global_memory_search` without filters
