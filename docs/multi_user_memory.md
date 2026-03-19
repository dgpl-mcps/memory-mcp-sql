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
│ "I must complete   │        │ "He must complete   │
│  project by Sunday"│       │  project by Sunday" │
└─────────────────────┘        └─────────────────────┘
```

---

## Quick Start

### Using Consolidated Tools

```javascript
// Extract entities from conversation
extract({ op: "entities", userId: "user", text: "John told me to complete the report by Friday. He works with Sarah." })

// Get better context
context({ op: "better", userId: "user", timeRange: "week" })

// Share with wife
share({ op: "share", userId: "user", toOwnerId: "wife", content: "He has deadline on Friday" })

// View what's shared with you
share({ op: "shared_with_me", userId: "wife" })

// Get person's memories
share({ op: "person_memories", userId: "user", personId: "John" })
```

---

## Entity Types

| Type | Description | Example |
|------|-------------|---------|
| `Person` | Human individuals | John, Sarah, Wife |
| `Bot` | AI assistants/bots | Claude, CodeBot |
| `Organization` | Companies/teams | Anthropic, Google |
| `Task` | Work items with deadlines | Report, Project X |
| `Rule` | Guidelines | Validate input |
| `CoreRule` | Critical rules | Auth required |
| `LongTermGoal` | Major objectives | Reduce latency |
| `Epic` | Large features | User auth |
| `Todo` | Small tasks | Fix button |
| `Insight` | Lessons | REST is better |
| `Walkthrough` | Guides | How to deploy |

---

## Relation Types

| Type | Meaning | Example |
|------|---------|---------|
| DEPENDS_ON | A needs B | Task A → Task B |
| SUBTASK_OF | A part of B | Bug → Sprint |
| FOLLOWS | A after B | Test → Code |
| GOVERNED_BY | A follows B | Code → Rules |
| PART_OF | A belongs to B | Feature → Epic |
| WORKS_WITH | A collaborates | Dev ↔ Designer |
| KNOWS | A knows B | Person ↔ Person |
| TOLD | A told B | Person → Person |
| CONTACTS | A contacted B | Person → Person |
| BELONGS_TO | A belongs to B | Person → Org |
| MANAGED_BY | A managed by B | Employee → Manager |
| OWNS | A owns B | Person → Project |
| DEADLINE_FOR | Task deadline | Report → Manager |

---

## Key Concepts

### Perspective

- `self` = Your own memory
- `other` = Shared with you by others

### Sharing Flow

```
User A creates memory
        ↓
User A shares with User B
        ↓
User B sees memory from "other" perspective
        ↓
User B can add their own memory about same event
```

---

## Common Patterns

### Share Task Deadline
```javascript
share({ op: "share", userId: "user", toOwnerId: "wife", content: "Project deadline is Sunday" })
```

### View Shared Memories
```javascript
share({ op: "shared_with_me", userId: "wife" })
share({ op: "shared_by_me", userId: "user" })
```

### Get Person Network
```javascript
share({ op: "get_network", userId: "user", personId: "John" })
```

---

## Configuration

```env
TOOL_PREFIX=memory
ENABLE_DEFER_LOADING=false
```
