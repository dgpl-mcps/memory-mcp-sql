# Multi-User Knowledge Graph Memory System

A perspective-based memory system that enables AI agents to understand, store, and share memories with proper context from multiple users' viewpoints.

---

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Shared Knowledge                          │
│  Person B told Person A: "Complete project by Sunday"       │
└─────────────────────────────────────────────────────────────┘
         │                                    │
         ▼                                    ▼
┌─────────────────────┐        ┌─────────────────────┐
│   USER's Memory     │        │   WIFE's Memory     │
│                     │        │                     │
│ Perspective:        │        │ Perspective:        │
│ "I must complete    │        │ "He must complete   │
│  project by Sunday" │       │  project by Sunday" │
└─────────────────────┘        └─────────────────────┘
```

---

## Quick Start

### 1. Run Migration

```bash
sqlite3 memory_mcp.db < migrations/001_perspective_system.sql
```

### 2. Start Using

```javascript
// Create a session
create_session({ ownerId: "user", type: "persistent", title: "My Session" })

// Extract entities from conversation
extract_entities({
  text: "John told me to complete the report by Friday. He works with Sarah.",
  ownerId: "user",
  projectId: "work"
})

// Get better context
get_better_context({
  ownerId: "user",
  timeRange: "week",
  includeTimeline: true,
  includeRelations: true
})

// Share with wife
share_memory({
  memoryId: "tl_xxx",
  memoryType: "timeline",
  fromOwnerId: "user",
  toOwnerId: "wife",
  perspectiveNote: "He has deadline on Friday"
})
```

---

## Entity Types

| Type | Description | Example |
|------|-------------|---------|
| `Person` | Human individuals | John, Sarah, Wife |
| `Bot` | AI assistants/bots | CodeBot, ChatBot |
| `Organization` | Companies/teams | Anthropic, Google |
| `Task` | Work items with deadlines | Report, Project X |
| `Event` | Time-based events | Meeting, Deadline |
| `Topic` | Subject categories | Work, Family, Personal |

## Relation Types

| Type | From → To | Example |
|------|-----------|---------|
| `KNOWS` | Person → Person | John KNOWS Sarah |
| `WORKS_WITH` | Person → Person/Bot | John WORKS_WITH CodeBot |
| `TOLD` | Person → Person | Wife TOLD John |
| `CONTACTS` | Person → Person/Bot | John CONTACTS Support |
| `BELONGS_TO` | Person → Org | John BELONGS_TO Anthropic |
| `MANAGED_BY` | Person → Person | Alice MANAGED_BY John |
| `OWNS` | Person → Bot | Mike OWNS CodeBot |
| `DEADLINE_FOR` | Task → Person | "Report" DEADLINE_FOR John |

---

## Session Types

| Type | Use Case |
|------|----------|
| `persistent` | Always continue same session |
| `topic` | Per-topic discussions |
| `timeline` | Time-based sessions |
| `cross` | Merged virtual sessions |

---

## New MCP Tools

### Entity Extraction
```javascript
extract_entities({
  text: "Conversation text...",
  ownerId: "user",
  method: "both",  // pattern, llm, or both
  autoStore: true
})
```

### Better Context
```javascript
get_better_context({
  ownerId: "user",
  sessionId: "sess_xxx",
  timeRange: "week",  // today, week, month, all
  includeTimeline: true,
  includeTopics: true,
  includeRelations: true,
  includeShared: true,
  maxTokens: 8000
})
```

### Sessions
```javascript
create_session({ ownerId: "user", type: "topic", title: "Project X" })
switch_topic({ sessionId: "sess_xxx", ownerId: "user", newTopicId: "topic_yyy" })
get_timeline({ ownerId: "user", granularity: "hour" })
```

### Sharing
```javascript
share_memory({ memoryId: "xxx", fromOwnerId: "user", toOwnerId: "wife" })
get_shared_with_me({ ownerId: "wife" })
mark_shared_read({ ownerId: "wife" })
```

### Person Memories
```javascript
get_person_memories({ ownerId: "user", personId: "John", perspective: "all" })
```

---

## Perspective System

### How It Works

1. **Source Detection**: When Person B tells something to Person A
2. **Auto-Extract**: System detects the relationship
3. **Multi-Store**: 
   - Store for Person A with `perspectiveOf: "self"`
   - Store for Person B with `sourcePersonId` tracking

### Example

```javascript
// Wife tells John: "You need to complete Project X by Sunday"
extract_entities({
  text: "Wife told John he needs to complete Project X by Sunday",
  ownerId: "john",
  sourcePersonId: "wife_id"
})

// Results:
// Memory for John: "Wife told me I need to complete Project X by Sunday" (perspective: self)
// Memory for Wife: "I told John about Project X deadline" (sourcePersonId: wife)
```

---

## Timeline Granularity

### Hourly View (Default)
```javascript
get_timeline({ ownerId: "user", granularity: "hour" })
// Returns: { timeSlot: "2026-03-19T14:00", entries: [...], count: 3 }
```

### Daily View
```javascript
get_timeline({ ownerId: "user", granularity: "day" })
// Returns: { timeSlot: "2026-03-19", entries: [...], count: 15 }
```

---

## Multi-User Setup

### For You and Wife

```javascript
// Create sessions for both
create_session({ ownerId: "user", type: "persistent" })
create_session({ ownerId: "wife", type: "persistent" })

// When wife shares something with you
share_memory({
  memoryId: "tl_xxx",
  memoryType: "timeline",
  fromOwnerId: "wife",
  toOwnerId: "user",
  perspectiveNote: "Important deadline"
})

// Get shared memories
get_shared_with_me({ ownerId: "user" })
```

---

## Configuration (.env)

```env
# Default search limits
DEFAULT_SEARCH_LIMIT=10
DEFAULT_SEARCH_OFFSET=0
DEFAULT_CONFIDENCE_THRESHOLD=20

# LLM Extraction (optional)
LLM_EXTRACTION_URL=https://api.openai.com/v1/chat/completions
```

---

## Migration

### Fresh Database
```bash
sqlite3 memory_mcp.db < migrations/001_perspective_system.sql
```

### Existing Database
1. Backup your data
2. Run migration script
3. Verify indexes created
4. Test with `get_better_context`

---

## Error Handling

| Error | Solution |
|-------|----------|
| `Session not found` | Create session first with `create_session` |
| `Memory not found` | Check memoryId is correct |
| `Permission denied` | Verify ownerId matches |
| `LLM extraction failed` | Falls back to pattern matching |

---

## Tips

1. **Always use ownerId**: Ensures proper memory isolation
2. **Use sourcePersonId**: For tracking who shared what
3. **Set perspectiveNote**: Helps understand context later
4. **Use timeRange**: Limits context to relevant period
5. **Auto-share**: System shares with related persons automatically
