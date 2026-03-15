# Memory MCP Server - Tool Reference

A robust memory management system for AI agents with typed knowledge graph, self-improvement capabilities, and smart conversation memory.

## Core Memory Tools (30 tools)

| # | Tool Name | Description |
|---|-----------|-------------|
| 1 | `memory_remember` | Store a conversation. Auto-summarizes after N chats. |
| 2 | `memory_recall` | Find relevant memories. Searches short-term, long-term, and cross-session with query expansion. |
| 3 | `memory_history` | Get recent conversation history with flow analysis. |
| 4 | `memory_context` | Get token-optimized context for LLM. |
| 5 | `memory_boost` | Boost or reduce memory importance. |
| 6 | `memory_pin` | Pin/unpin a memory to preserve it. |
| 7 | `memory_stats` | Get memory system statistics. |
| 8 | `memory_cleanup` | Clean up old memories (pinned preserved). |
| 9 | `memory_inspect` | View full memory details. |
| 10 | `memory_batch` | Store multiple conversations at once. |
| 11 | `memory_insights` | Extract key learnings, patterns from memory. |
| 12 | `memory_trim` | Smart context trimming - preserves important parts when reducing size. |
| 13 | `memory_analytics` | Session-level analytics: topics, time spent, questions vs commands ratio. |
| 14 | `memory_export` | Export memories to JSON. |
| 15 | `memory_import` | Import memories from JSON export. |
| 16 | `memory_link` | Link two memories as related/follows/supersedes/references. |
| 17 | `memory_set_ttl` | Set time-to-live (expiration) on memories. |
| 18 | `memory_search_by_date` | Search memories within date range. |
| 19 | `memory_tag` | Add or remove tags on memories. |
| 20 | `memory_search_by_tag` | Find memories by specific tag. |
| 21 | `memory_fuzzy_recall` | Fuzzy search with typo tolerance (Levenshtein distance). |
| 22 | `memory_vote` | Like/dislike a memory to rate quality. |
| 23 | `memory_quality` | Get or calculate memory quality score. |
| 24 | `memory_best` | Get high quality memories above threshold. |
| 25 | `memory_bulk` | Bulk operations: pin, unpin, add_tags, delete, boost. |
| 26 | `memory_archive` | Archive or unarchive memories. |
| 27 | `memory_archived` | List archived memories. |
| 28 | `memory_remind` | Set a reminder to revisit a memory. |
| 29 | `memory_reminders` | List pending or upcoming reminders. |
| 30 | `memory_merge` | Merge two memories into one. |

## Additional Tools

| Tool Name | Description |
|-----------|-------------|
| `global_memory_search` | Search across all memory types (entities, relations, documents). |
| `create_memory_snapshot` | Create backup of entire SQLite graph. |
| `diagnose_memory_health` | Get real-time operational status (RAM, DB connectivity). |
| `[prefix]_tool_search` | Search for available tools by keyword. |

## Key Features

### Smart Memory System
- **Short-term memory**: 20% threshold for recent conversations
- **Long-term memory**: 75% similarity threshold for permanent storage
- **Auto-summarization**: At N+1 chats (configurable, default 20)
- **Auto-linking**: Automatically links related entities when storing

### Intelligence Features
- **Intent detection**: Questions, commands, errors, success, learning, planning
- **Entity extraction**: CamelCase names, #tags, URLs, emails, file paths
- **Query expansion**: Synonyms for better recall (e.g., "fix" → "bug", "error")
- **Fuzzy search**: Levenshtein distance for typo tolerance
- **Quality scoring**: Auto-calculated based on completeness, keywords, priority

### Memory Management
- **Priority scoring**: With time decay (default 30 days)
- **Memory pinning**: Preserve important memories
- **TTL/Expiration**: Set auto-expiry on memories
- **Archive**: Hide from recall but preserve
- **Tags**: Organize with custom tags
- **Bulk operations**: Pin, tag, delete multiple at once
- **Voting**: Like/dislike to rate quality

### Data Operations
- **Export/Import**: JSON format for backup/transfer
- **Merge**: Combine duplicate memories
- **Link**: Create relationships between memories
- **Reminders**: Schedule follow-up notifications

## Configuration

Environment variables (optional, defaults provided):

```
MAX_SHORT_TERM_CHATS=10
SHORT_TERM_THRESHOLD=20
LONG_TERM_THRESHOLD=75
AUTO_SUMMARIZE_AFTER_CHATS=20
SUMMARY_MAX_LENGTH=500
PRIORITY_DECAY_DAYS=30
CROSS_SESSION_THRESHOLD=60
TOOL_PREFIX=memory
```

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Run
npm start
# or dev mode
npm run dev
```

## Tool Usage Examples

```json
// Store conversation
{ "name": "memory_remember", "arguments": { "userId": "user1", "sessionId": "sess1", "userMessage": "How do I fix the login bug?", "agentMessage": "Check the auth middleware..." } }

// Recall memories
{ "name": "memory_recall", "arguments": { "userId": "user1", "query": "login bug" } }

// Set TTL (30 days)
{ "name": "memory_set_ttl", "arguments": { "memoryId": "ltm_xxx", "daysToLive": 30 } }

// Tag memory
{ "name": "memory_tag", "arguments": { "memoryId": "ltm_xxx", "tags": ["important", "auth"], "action": "add" } }

// Export
{ "name": "memory_export", "arguments": { "userId": "user1" } }

// Vote
{ "name": "memory_vote", "arguments": { "memoryId": "ltm_xxx", "vote": "like" } }
```
