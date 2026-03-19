# Memory MCP Skills - Consolidated Tools (9 Tools)

> **For AI Agents: Use this guide for the consolidated 9-tool memory system.**

---

## Summary

**116 tools → 9 tools** via operation parameters.

Each tool has an `op` parameter to specify the operation.

**Tools:**
1. `memory` - Store, search, manage memories
2. `entity` - Knowledge graph entities
3. `relation` - Entity relationships
4. `short_term` - Fast KV storage
5. `project` - Projects, tasks, workflows
6. `context` - Conversation context
7. `extract` - Extract/remember info
8. `share` - Share with others
9. `search` - Find tools by keyword

---

## Tool Reference

---

### 1. memory
**Purpose:** Store, search, and manage memories.

**Operations:**
| Op | Description | Key Params |
|----|-------------|------------|
| remember | Store conversation | userMessage, agentMessage, sessionId |
| recall | Search memories | query, scope, limit |
| history | Get conversation history | sessionId, limit |
| context | LLM-optimized context | sessionId, maxTokens |
| stats | Memory statistics | - |
| cleanup | Delete old memories | daysOld, preview |
| boost | Adjust priority | memoryId, delta |
| pin | Pin/unpin memory | memoryId, pinned |
| inspect | View memory details | memoryId |
| export | Export to JSON | includeShortTerm, limit |
| import | Import from JSON | importData |
| insights | Extract patterns | focus, days |
| trim | Smart trimming | sessionId, maxChars |
| analytics | Session analytics | sessionId, days |
| analytics | Session analytics | sessionId, days |
| link | Link memories | memoryId1, memoryId2 |
| all | Get everything (quick start) | limit |
| recent | Get recent memories | hours, limit |
| search | Semantic search | query |
| thread | Full context chain | memoryId, depth |
| health | Memory health check | - |
| decay | Decay unused memories | daysUnused, decayRate |

**Thread Operation** - Get a memory with its entire linked context chain:
```json
{ "op": "thread", "userId": "u1", "memoryId": "mem_123", "depth": 2 }
```

**Health Operation** - Check memory system health:
```json
{ "op": "health", "userId": "u1" }
// Returns: score, metrics, suggestions
```

**Decay Operation** - Smart forgetting:
```json
{ "op": "decay", "userId": "u1", "daysUnused": 7, "decayRate": 0.05 }
// Decays unused memories, boosts frequently accessed
```

**Examples:**
```json
// Remember
{ "op": "remember", "userId": "u1", "sessionId": "s1", "userMessage": "Q?", "agentMessage": "A!" }

// Recall
{ "op": "recall", "userId": "u1", "query": "deadline" }

// Stats
{ "op": "stats", "userId": "u1" }
```

---

### 2. entity
**Purpose:** Manage knowledge graph entities.

**Entity Types:** Person, Bot, Organization, Task, Rule, CoreRule, LongTermGoal, Epic, Todo, Insight, Walkthrough

**Operations:**
| Op | Description |
|----|-------------|
| create | Create new entity |
| read | Get by ID |
| update | Update name/properties |
| delete | Delete entity |
| search | Find by type/name |

**Examples:**
```json
// Create
{ "op": "create", "userId": "u1", "projectId": "p1", "entityType": "Person", "name": "Priya Sharma", "properties": {"role": "Lead"} }

// Search
{ "op": "search", "userId": "u1", "entityType": "Person", "search": "priya" }
```

---

### 3. relation
**Purpose:** Create and manage entity relationships.

**Relation Types:** DEPENDS_ON, SUBTASK_OF, FOLLOWS, GOVERNED_BY, PART_OF, WORKS_WITH, KNOWS, TOLD, CONTACTS, BELONGS_TO, MANAGED_BY, OWNS, DEADLINE_FOR

**Operations:**
| Op | Description |
|----|-------------|
| create | Create relation |
| delete | Delete relation |
| search | Find relations |

**Examples:**
```json
// Create
{ "op": "create", "userId": "u1", "fromId": "e1", "toId": "e2", "type": "DEPENDS_ON" }

// Search
{ "op": "search", "userId": "u1", "entityId": "e1" }
```

---

### 4. short_term
**Purpose:** Fast key-value storage for session data.

**Operations:**
| Op | Description |
|----|-------------|
| set | Store key-value |
| get | Get by key |
| list | List all keys |
| delete | Delete key |
| clear | Clear all |
| search | Search values |

**Examples:**
```json
// Set
{ "op": "set", "userId": "u1", "key": "active_task", "value": {"id": "t1"} }

// Get
{ "op": "get", "userId": "u1", "key": "active_task" }

// List
{ "op": "list", "userId": "u1" }
```

---

### 5. project
**Purpose:** Manage projects, tasks, and workflows.

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
| list_tasks | List project tasks |
| update_task | Update status |
| complete_task | Mark done |
| delete_task | Remove task |

**Workflow Operations:**
| Op | Description |
|----|-------------|
| plan_workflow | Create workflow |
| get_workflow | Get by ID |
| list_workflows | List workflows |

**Examples:**
```json
// Create project
{ "op": "create_project", "userId": "u1", "name": "My App" }

// Plan task
{ "op": "plan_task", "userId": "u1", "projectId": "p1", "title": "Fix bug", "status": "pending" }

// Complete task
{ "op": "complete_task", "id": "task_123" }
```

---

### 6. context
**Purpose:** Get comprehensive context for conversations.

**Operations:**
| Op | Description |
|----|-------------|
| better | All-in-one context |
| chat_add | Add chat message |
| chat_get | Get chat history |
| chat_summary | Store summary |
| get_summary | Get summaries |

**Examples:**
```json
// Get better context
{ "op": "better", "userId": "u1", "timeRange": "week" }

// Add chat
{ "op": "chat_add", "userId": "u1", "role": "user", "content": "Hello" }
```

---

### 7. extract
**Purpose:** Extract entities and remember information.

**Operations:**
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

**Examples:**
```json
// Extract entities
{ "op": "entities", "userId": "u1", "text": "John from Acme called", "autoStore": true }

// Remember learning
{ "op": "learning", "userId": "u1", "insight": "Tests first" }
```

---

### 8. share
**Purpose:** Share memories with others and view shared content.

**Operations:**
| Op | Description |
|----|-------------|
| share | Share memory |
| shared_with_me | View shared with you |
| shared_by_me | View shared by you |
| get_network | Get relation network |
| person_memories | Get person's memories |

**Examples:**
```json
// Share
{ "op": "share", "userId": "u1", "toOwnerId": "u2", "content": "Deadline Sunday" }

// View shared
{ "op": "shared_with_me", "userId": "u1" }
```

---

### 9. search
**[META]** Search available tools by keyword.

**Examples:**
```json
{ "query": "entity" }
```

---

## Smart Memory Features

The `memory` tool includes intelligent auto-detection:

### Intent Detection
Automatically detects conversation type and adjusts priority:
| Intent | Priority | Examples |
|--------|----------|----------|
| error | 80 | "bug", "crash", "failed", "error" |
| success | 70 | "fixed", "working", "completed" |
| learning | 60 | "learned", "discovered", "figured out" |
| question | 50 | "how", "why", "what" |
| planning | 50 | "will", "should", "going to" |

### Query Expansion
Recall automatically expands queries with synonyms:
- "remember" → remember, recall, recall, recollect
- "deadline" → deadline, due, time limit, timebox
- "error" → error, bug, issue, problem, fail
- "task" → task, todo, to-do, action item

### Entity Extraction
Automatically extracts from text:
- @mentions → user references
- CamelCase → code entities  
- #hashtags → topics
- URLs and file paths

### Relevance Scoring
Search results ranked by:
- Keyword match (exact/partial)
- Entity match score
- Time decay (recent weighted higher)
- Intent match (errors score higher)

### Auto-Summarization
For content >500 characters:
- Extracts first sentence as base
- Prioritizes sentences with: important, key, main, critical, essential, must, need, should, remember
- Truncates summary to ~150 characters
- Full content always stored; summary for quick reference

### Auto-Linking (MOST POWERFUL FEATURE)
**5-Phase automatic memory relationship discovery:**
| Phase | Method | Strength | Description |
|-------|--------|----------|-------------|
| 0 | Temporal | 0.9 | Conversation flow (consecutive memories) |
| 1 | Entity | 0.8 | Memories share @mention, CamelCase entities |
| 2 | Project | 0.7 | Same project context |
| 3 | Intent | 0.6 | Same intent + shared entity + recent |
| 4 | Keyword | 0.4 | Content/summary keyword overlap |

**Key Features:**
- Bidirectional links (both directions)
- Max 15 links per memory
- Adaptive boost: High-priority memories boost linked memories by +5%
- Returns `relatedMemories` with type and strength
- `thread` operation retrieves full context chain recursively

---

## Common Patterns

### Store & Recall
```
1. memory remember (store conversation)
2. memory recall (search memories)
3. entity search (find entities)
```

### Project Management
```
1. project create_project
2. project plan_task
3. project complete_task
```

### Context Building
```
1. context better (get overview)
2. extract entities (from text)
3. entity create (store found)
```

---

## Key Parameters

| Param | Purpose | Required |
|-------|---------|----------|
| `userId` | Who owns this | Yes |
| `projectId` | Project context | Often |
| `sessionId` | Conversation thread | For session ops |
| `op` | Operation | Yes |

---

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| "id required" | Missing ID param | Add id |
| "sessionId required" | Missing sessionId | Add sessionId |
| "entityType and name required" | Missing params | Add both |
