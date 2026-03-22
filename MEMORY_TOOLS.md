# Memory MCP Server - Consolidated Tool Reference

> **116 tools → 9 tools** via `op` parameter

## Available Tools (9)

| # | Tool | Operations | Description |
|---|------|------------|-------------|
| 1 | `memory` | 15 ops | Store, search, manage memories |
| 2 | `entity` | 5 ops | Knowledge graph entities |
| 3 | `relation` | 3 ops | Entity relationships |
| 4 | `short_term` | 6 ops | Fast KV storage |
| 5 | `project` | 14 ops | Projects, tasks, workflows |
| 6 | `session` | 8 ops | Sessions and timelines |
| 7 | `context` | 5 ops | Conversation context |
| 8 | `extract` | 9 ops | Extract/remember info |
| 9 | `share` | 5 ops | Share with others |

---

## Tool Details

### 1. memory (15 operations)

| Op | Description |
|----|-------------|
| remember | Store conversation |
| recall | Search memories |
| history | Get conversation history |
| context | LLM-optimized context |
| stats | Memory statistics |
| cleanup | Delete old memories |
| boost | Adjust priority |
| pin | Pin/unpin memory |
| inspect | View memory details |
| export | Export to JSON |
| import | Import from JSON |
| insights | Extract patterns |
| trim | Smart trimming |
| analytics | Session analytics |
| link | Link memories |

**Example:**
```json
{ "op": "remember", "userId": "u1", "userMessage": "Q?", "agentMessage": "A!" }
{ "op": "recall", "userId": "u1", "query": "deadline" }
{ "op": "stats", "userId": "u1" }
```

---

### 2. entity (5 operations)

**Entity Types:** Person, Bot, Organization, Task, Rule, CoreRule, LongTermGoal, Epic, Todo, Insight, Walkthrough

| Op | Description |
|----|-------------|
| create | Create entity |
| read | Get by ID |
| update | Update name/properties |
| delete | Delete entity |
| search | Find by type/name |

**Example:**
```json
{ "op": "create", "userId": "u1", "entityType": "Person", "name": "Priya", "properties": {"role": "Lead"} }
{ "op": "search", "userId": "u1", "entityType": "Person", "search": "priya" }
```

---

### 3. relation (3 operations)

**Relation Types:** DEPENDS_ON, SUBTASK_OF, FOLLOWS, GOVERNED_BY, PART_OF, WORKS_WITH, KNOWS, TOLD, CONTACTS, BELONGS_TO, MANAGED_BY, OWNS, DEADLINE_FOR

| Op | Description |
|----|-------------|
| create | Create relation |
| delete | Delete relation |
| search | Find relations |

**Example:**
```json
{ "op": "create", "userId": "u1", "fromId": "e1", "toId": "e2", "type": "DEPENDS_ON" }
```

---

### 4. short_term (6 operations)

| Op | Description |
|----|-------------|
| set | Store key-value |
| get | Get by key |
| list | List all keys |
| delete | Delete key |
| clear | Clear all |
| search | Search values |

**Example:**
```json
{ "op": "set", "userId": "u1", "key": "active_task", "value": {"id": "t1"} }
{ "op": "get", "userId": "u1", "key": "active_task" }
```

---

### 5. project (14 operations)

**Project Operations:**
| Op | Description |
|----|-------------|
| create_project | Create project |
| get_project | Get by ID |
| list_projects | List all |
| delete_project | Delete project |

**Task Operations:**
| Op | Description |
|----|-------------|
| plan_task | Create task |
| get_task | Get by ID |
| list_tasks | List tasks |
| update_task | Update status |
| complete_task | Mark done |
| delete_task | Remove task |

**Workflow Operations:**
| Op | Description |
|----|-------------|
| plan_workflow | Create workflow |
| get_workflow | Get by ID |
| list_workflows | List workflows |

**Example:**
```json
{ "op": "create_project", "userId": "u1", "name": "My App" }
{ "op": "plan_task", "userId": "u1", "projectId": "p1", "title": "Fix bug", "status": "pending" }
{ "op": "complete_task", "id": "task_123" }
```

---

### 6. session (8 operations)

| Op | Description |
|----|-------------|
| create | Create session |
| get | Get by ID |
| list | List sessions |
| end | End session |
| switch | Switch topic |
| merge | Merge sessions |
| timeline | Get timeline |
| cross | Cross-session memories |

**Example:**
```json
{ "op": "create", "userId": "u1", "type": "persistent", "title": "Morning chat" }
{ "op": "timeline", "userId": "u1", "granularity": "day" }
```

---

### 7. context (5 operations)

| Op | Description |
|----|-------------|
| better | All-in-one context |
| chat_add | Add chat message |
| chat_get | Get chat history |
| chat_summary | Store summary |
| get_summary | Get summaries |

**Example:**
```json
{ "op": "better", "userId": "u1", "timeRange": "week" }
{ "op": "chat_add", "userId": "u1", "role": "user", "content": "Hello" }
```

---

### 8. extract (9 operations)

| Op | Description |
|----|-------------|
| entities | Extract from text |
| text | Remember general |
| keypoint | Remember highlight |
| thought | Add thought |
| note | General note |
| discovery | New discovery |
| mistake | Remember mistake |
| learning | Lesson learned |
| boundary | Scope boundary |

**Example:**
```json
{ "op": "entities", "userId": "u1", "text": "John from Acme called", "autoStore": true }
{ "op": "learning", "userId": "u1", "insight": "Tests first" }
```

---

### 9. share (5 operations)

| Op | Description |
|----|-------------|
| share | Share memory |
| shared_with_me | View shared with you |
| shared_by_me | View shared by you |
| get_network | Get relation network |
| person_memories | Get person's memories |

**Example:**
```json
{ "op": "share", "userId": "u1", "toOwnerId": "u2", "content": "Deadline Sunday" }
{ "op": "shared_with_me", "userId": "u1" }
```

---

## Common Patterns

### Store & Recall
```
1. memory remember
2. memory recall
3. entity search
```

### Project Management
```
1. project create_project
2. project plan_task
3. project complete_task
```

### Context Building
```
1. context better
2. extract entities
3. entity create
```

---

## Configuration

```env
TOOL_PREFIX=memory
ENABLE_DEFER_LOADING=false

DEFAULT_SEARCH_LIMIT=10
DEFAULT_CONFIDENCE_THRESHOLD=20

SHORT_TERM_THRESHOLD=20%    # Below → short-term
LONG_TERM_THRESHOLD=75%     # Above → long-term
```

---

---

## Vector Search (sqlite-vec & sqlite-vss)

The MCP server uses **sqlite-vec** and **sqlite-vss** for vector similarity search.

### Backend Selection
The server auto-detects available extensions (priority: sqlite-vss → sqlite-vec → none):
```typescript
// In src/db/sqlite.ts - initializeVectorExtension()
sqlite-vss: CREATE VIRTUAL TABLE vss_* USING vss0(embedding(384))
sqlite-vec: CREATE VIRTUAL TABLE vec_* USING vec0(embedding float[384])
```

### Vector Tables
| Table | Purpose | Backend |
|-------|---------|---------|
| `vss_stm` / `vec_stm` | Statement embeddings | `memory_remember`, `memory_search` |
| `vss_doc` / `vec_doc` | Document embeddings | `remember_learning`, `document_search` |
| `vss_embeddings` / `vec_embeddings` | Entity embeddings | `store_entity`, `search_graph` |

### Usage Flow
1. Content stored via `memory_remember` / `store_entity` / `remember_learning`
2. Embedding generated via `getEmbeddingString()` (384-dim vector)
3. Vector stored in appropriate vss_*/vec_* table
4. Search uses `vss_search()` or `<=>` operator for similarity

### Embedding Service
Requires external embedding service (configured via `EMBEDDING_SERVICE_URL` env var). If not configured, falls back to simple text matching.

### Dependencies (package.json)
```json
{
  "sqlite-vec": "^0.1.7-alpha.2",
  "sqlite-vss": "^0.1.2"
}
```

---

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| "id required" | Missing ID | Add `id` param |
| "sessionId required" | Missing sessionId | Add `sessionId` |
| "entityType and name required" | Missing params | Add both |
| "Unknown op" | Invalid operation | Check tool docs |
