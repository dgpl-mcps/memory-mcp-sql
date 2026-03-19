# AI Agent Memory System - Consolidated Guide

> **For AI Agents: Use this guide for the consolidated 9-tool memory system.**

---

## Quick Reference

### Tool Structure: `tool({ op: "operation", ...params })`

**116 tools → 9 tools** via `op` parameter.

### Available Tools
| Tool | Operations |
|------|------------|
| `memory` | remember, recall, history, context, stats, cleanup, boost, pin, inspect, export, import, insights, trim, analytics, link |
| `entity` | create, read, update, delete, search |
| `relation` | create, delete, search |
| `short_term` | set, get, list, delete, clear, search |
| `project` | create_project, get_project, list_projects, delete_project, plan_task, get_task, list_tasks, update_task, complete_task, delete_task, plan_workflow, get_workflow, list_workflows |
| `session` | create, get, list, end, switch, merge, timeline, cross |
| `context` | better, chat_add, chat_get, chat_summary, get_summary |
| `extract` | entities, text, keypoint, thought, note, discovery, mistake, learning, boundary |
| `share` | share, shared_with_me, shared_by_me, get_network, person_memories |
| `search` | tool search |

### Tool Naming
- All tools have `memory_` prefix (default)
- Use `search({ query: "..." })` to find tools

---

## Configuration (.env)

```env
TOOL_PREFIX=memory
ENABLE_DEFER_LOADING=false

DEFAULT_SEARCH_LIMIT=10
DEFAULT_CONFIDENCE_THRESHOLD=20

SHORT_TERM_THRESHOLD=20%    # Below → short-term
LONG_TERM_THRESHOLD=75%     # Above → long-term
```

---

## MUST-KNOW Parameters

| Param | Purpose | Required |
|-------|---------|----------|
| `op` | Operation to perform | Yes |
| `userId` | Who owns this | Yes |
| `projectId` | Project context | Often |
| `sessionId` | Conversation thread | For session ops |

---

## Tool Reference

---

### 1. memory

Store, search, and manage memories.

**Operations:**
| Op | Description | Params |
|----|-------------|--------|
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
| link | Link memories | memoryId1, memoryId2 |

**Examples:**
```javascript
// Remember
memory({ op: "remember", userId: "u1", sessionId: "s1", userMessage: "Q?", agentMessage: "A!" })

// Recall
memory({ op: "recall", userId: "u1", query: "deadline" })

// Stats
memory({ op: "stats", userId: "u1" })
```

---

### 2. entity

Manage knowledge graph entities.

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
```javascript
// Create
memory({ op: "create", userId: "u1", projectId: "p1", entityType: "Person", name: "Priya Sharma", properties: {role: "Lead"} })

// Search
memory({ op: "search", userId: "u1", entityType: "Person", search: "priya" })
```

---

### 3. relation

Create and manage entity relationships.

**Relation Types:** DEPENDS_ON, SUBTASK_OF, FOLLOWS, GOVERNED_BY, PART_OF, WORKS_WITH, KNOWS, TOLD, CONTACTS, BELONGS_TO, MANAGED_BY, OWNS, DEADLINE_FOR

**Operations:**
| Op | Description |
|----|-------------|
| create | Create relation |
| delete | Delete relation |
| search | Find relations |

**Examples:**
```javascript
// Create
memory({ op: "create", userId: "u1", fromId: "e1", toId: "e2", type: "DEPENDS_ON" })

// Search
memory({ op: "search", userId: "u1", entityId: "e1" })
```

---

### 4. short_term

Fast key-value storage for session data.

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
```javascript
// Set
memory({ op: "set", userId: "u1", key: "active_task", value: {id: "t1"} })

// Get
memory({ op: "get", userId: "u1", key: "active_task" })

// List
memory({ op: "list", userId: "u1" })
```

---

### 5. project

Manage projects, tasks, and workflows.

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
```javascript
// Create project
memory({ op: "create_project", userId: "u1", name: "My App" })

// Plan task
memory({ op: "plan_task", userId: "u1", projectId: "p1", title: "Fix bug", status: "pending" })

// Complete task
memory({ op: "complete_task", id: "task_123" })
```

---

### 6. session

Manage conversation sessions and timelines.

**Operations:**
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

**Examples:**
```javascript
// Create
memory({ op: "create", userId: "u1", type: "persistent", title: "Morning chat" })

// Timeline
memory({ op: "timeline", userId: "u1", granularity: "day" })

// List active
memory({ op: "list", userId: "u1", isActive: true })
```

---

### 7. context

Get comprehensive context for conversations.

**Operations:**
| Op | Description |
|----|-------------|
| better | All-in-one context |
| chat_add | Add chat message |
| chat_get | Get chat history |
| chat_summary | Store summary |
| get_summary | Get summaries |

**Examples:**
```javascript
// Get better context
memory({ op: "better", userId: "u1", timeRange: "week" })

// Add chat
memory({ op: "chat_add", userId: "u1", role: "user", content: "Hello" })

// Get chat history
memory({ op: "chat_get", userId: "u1" })
```

---

### 8. extract

Extract entities and remember information.

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
```javascript
// Extract entities
memory({ op: "entities", userId: "u1", text: "John from Acme called", autoStore: true })

// Remember learning
memory({ op: "learning", userId: "u1", insight: "Tests first" })

// Remember mistake
memory({ op: "mistake", userId: "u1", description: "Forgot validation", resolution: "Added middleware" })
```

---

### 9. share

Share memories with others and view shared content.

**Operations:**
| Op | Description |
|----|-------------|
| share | Share memory |
| shared_with_me | View shared with you |
| shared_by_me | View shared by you |
| get_network | Get relation network |
| person_memories | Get person's memories |

**Examples:**
```javascript
// Share
memory({ op: "share", userId: "u1", toOwnerId: "u2", content: "Deadline Sunday" })

// View shared
memory({ op: "shared_with_me", userId: "u1" })

// Person's memories
memory({ op: "person_memories", userId: "u1", personId: "John" })
```

---

### 10. search

**[META]** Search available tools by keyword.

**Examples:**
```javascript
memory({ query: "entity" })
```

Returns matching tools with their operations.

---

## Common Patterns

### Store & Recall
```
1. memory({ op: "remember", ... })
2. memory({ op: "recall", query: "..." })
3. entity({ op: "search", ... })
```

### Project Management
```
1. project({ op: "create_project", ... })
2. project({ op: "plan_task", ... })
3. project({ op: "complete_task", ... })
```

### Context Building
```
1. context({ op: "better", timeRange: "week" })
2. extract({ op: "entities", text: "..." })
3. entity({ op: "create", ... })
```

---

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| "id required" | Missing ID | Add `id` param |
| "sessionId required" | Missing sessionId | Add `sessionId` |
| "entityType and name required" | Missing params | Add both |
| "Unknown op" | Invalid operation | Check tool docs |

---

## Tips

1. **Always use `userId`** - Ensures proper memory isolation
2. **Use `op` parameter** - Specifies which operation
3. **Pin important memories** - Never deleted
4. **Link memories** - Creates explicit relationships
5. **Export regularly** - Backup important memories
