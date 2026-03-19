# Memory MCP Skills - Consolidated Tools (9 Tools)

> **For AI Agents: Use this guide for the smart memory system with persona, emotion, and learning.**

---

## Summary

**116 tools → 9 tools** via operation parameters.

Each tool has an `op` parameter to specify the operation.

**Tools:**
1. `memory` - Store, search, manage memories (with AI features)
2. `entity` - Knowledge graph entities
3. `relation` - Entity relationships
4. `short_term` - Fast KV storage
5. `project` - Projects, tasks, workflows
6. `context` - Conversation context
7. `extract` - Extract/remember info
8. `share` - Share with others
9. `search` - Find tools by keyword

---

## Memory Tool Operations

### Core Memory
| Op | Description | Key Params |
|----|-------------|------------|
| remember | Store conversation | userMessage, agentMessage |
| recall | Search memories | query, limit |
| history | Get conversation history | sessionId, limit |
| context | LLM-optimized context | sessionId, maxTokens |
| stats | Memory statistics | - |
| all | Get everything | limit |
| recent | Get recent memories | hours, limit |
| search | Semantic search | query |

### Memory Management
| Op | Description | Key Params |
|----|-------------|------------|
| cleanup | Delete old memories | daysOld, preview |
| boost | Adjust priority | memoryId, delta |
| pin | Pin/unpin memory | memoryId, pinned |
| inspect | View memory details | memoryId |
| export | Export to JSON | includeShortTerm, limit |
| import | Import from JSON | importData |
| trim | Smart trimming | sessionId, maxChars |
| analytics | Session analytics | sessionId, days |
| link | Link memories | memoryId1, memoryId2 |

### Smart Features
| Op | Description | Key Params |
|----|-------------|------------|
| thread | Full context chain | memoryId, depth |
| health | Memory health check | - |
| decay | Decay unused memories | daysUnused, decayRate |
| persona | User personality & preferences | traits, style |
| mood | Track emotional state | mood, intensity, context |
| learn | Adaptive learning patterns | type, pattern |
| remind | Proactive memory reminders | reminderType, title |
| suggest | Get smart suggestions |
| graph | Knowledge graph visualization |
| dedup | Find & merge duplicate memories |
| backup | Export memories to JSON |
| restore | Import memories from backup |
| importance | Memory importance scoring |

---

## Advanced Memory Operations

### Graph Visualization
```json
{ "op": "graph", "userId": "u1" }
```
Returns: nodes, edges, clusters, entityMap

### Memory Deduplication
```json
{ "op": "dedup", "userId": "u1", "threshold": 0.8, "autoMerge": false }
```
Finds similar memories and optionally merges them

### Backup & Restore
```json
{ "op": "backup", "userId": "u1", "includeLinks": true }
{ "op": "restore", "userId": "u1", "backupData": "...", "merge": true }
```
Full memory export/import with base64 encoding

### Importance Scoring
```json
{ "op": "importance", "userId": "u1" }
// Returns: all memories ranked by importance
{ "op": "importance", "userId": "u1", "memoryId": "mem_123" }
// Returns: single memory with breakdown
```
Importance = access(30%) + priority(30%) + recency(30%) + intent_bonus(10%) - |

---

## Smart Memory Features

### 1. 8-Phase Auto-Linking (MOST POWERFUL)
| Phase | Method | Strength | Description |
|-------|--------|----------|-------------|
| 0 | Temporal | 0.9 | Conversation flow (most recent) |
| 1 | Entity | 0.8 | Shared @mentions, CamelCase |
| 2 | Project | 0.7 | Same project context |
| 3 | Intent | 0.6 | Same intent + shared entity |
| 4 | Keyword | 0.4 | Content keyword overlap |
| 5 | **Cross-Project** | 0.6 | Related across projects |
| 6 | **Temporal Chain** | 0.95 | Conversation within 30min |
| 7 | **Entity Graph** | 0.75 | Knowledge graph from entities |

**Features:**
- Bidirectional links (both directions)
- Max 15 links per memory
- Adaptive boost (+5% for high-priority memories)
- Temporal decay (older = slightly lower strength)
- Returns `linkTypes` breakdown

### 2. Intent Detection
| Intent | Priority | Examples |
|--------|----------|----------|
| error | 80% | bug, crash, failed |
| success | 70% | fixed, working, completed |
| learning | 80% | learned, discovered |
| question | 50% | how, why, what |
| planning | 50% | will, going to |

### 3. Entity Extraction
- @mentions → user references
- CamelCase → code entities
- #hashtags → topics
- URLs and file paths

### 4. Persona System
```json
{ "op": "persona", "userId": "u1", "traits": {"creative": true}, "style": "friendly" }
```
Returns: personality traits, communication style, current mood, learning stats

### 5. Emotional Memory
```json
{ "op": "mood", "userId": "u1", "mood": "excited", "intensity": 8, "context": "Launch day!" }
```
**Supported moods:** happy, sad, excited, frustrated, calm, anxious, confused, satisfied, tired, energized

**Contextual suggestions based on mood:**
- frustrated → "Take a break, you seem stressed"
- excited → "Great energy! Channel it into important tasks"
- sad → "Remember: tough times pass"

### 6. Adaptive Learning
```json
{ "op": "learn", "userId": "u1", "type": "work", "pattern": "prefers morning" }
```
- Tracks patterns over time
- Updates confidence based on usage
- Groups by category (work, mood, preferences)

### 7. Proactive Reminders
```json
// Create reminder
{ "op": "remind", "userId": "u1", "reminderType": "followup", "title": "Check bug fix", "priority": 8 }

// Get pending reminders
{ "op": "remind", "userId": "u1" }

// Complete reminder
{ "op": "remind", "userId": "u1", "memoryId": "remind_123", "mood": "done" }
```

### 8. Smart Suggestions
```json
{ "op": "suggest", "userId": "u1" }
```
**Proactive suggestions based on:**
- Current mood (care tips when stressed)
- Pending reminders (follow-up prompts)
- High-priority memories (revisit important items)
- Learned patterns (personalized encouragement)
- Time of day (morning/afternoon/evening greetings)

### 9. Memory Health System
```json
{ "op": "health", "userId": "u1" }
```
**Returns:**
- Health score (0-100%)
- Metrics: total memories, links, orphaned, low priority
- Suggestions for optimization

### 10. Smart Decay
```json
{ "op": "decay", "userId": "u1", "daysUnused": 7, "decayRate": 0.05 }
```
- Decays unused memories (-5% priority)
- Boosts frequently accessed memories
- Never decays pinned memories

---

## Examples

```json
// Store memory with auto-features
{ "op": "remember", "userId": "u1", "userMessage": "Fixed @AuthService bug!", "agentMessage": "Great!" }

// Recall with context
{ "op": "recall", "userId": "u1", "query": "auth" }

// Get full context thread
{ "op": "thread", "userId": "u1", "memoryId": "mem_123", "depth": 2 }

// Track mood
{ "op": "mood", "userId": "u1", "mood": "happy", "context": "Fixed a bug" }

// Get smart suggestions
{ "op": "suggest", "userId": "u1" }

// Learn pattern
{ "op": "learn", "userId": "u1", "type": "work", "pattern": "takes breaks when frustrated" }

// Create reminder
{ "op": "remind", "userId": "u1", "reminderType": "followup", "title": "Check database" }

// Check health
{ "op": "health", "userId": "u1" }

// Decay old memories
{ "op": "decay", "userId": "u1", "daysUnused": 7 }
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
| "mood required" | Missing mood | Add mood (happy/sad/etc) |
