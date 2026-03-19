import { setShortTermMemory, getShortTermMemory, deleteShortTermMemory, clearSessionMemory, searchShortTermMemory, listShortTermMemory } from "../db/sqlite.js";
import { getMemoryConfig } from "../utils/env.js";

export const shortTermTools = [
    // =============================================
    // SHORT-TERM MEMORY (Session-based KV Store)
    // =============================================
    // Use for: Fast access, session state, scratch pad
    // Auto-expires: Based on SHORT_TERM_THRESHOLD config
    // Unlike LongTerm: Uses exact key lookup, not semantic search
    // =============================================
    {
        name: "set_short_term_memory",
        description: `## Set Short-Term Memory (Key-Value)

**Purpose:** Store fast-access key-value data for current session/project.

**Use Cases:**
- Storing active task context
- Scratch pad for calculations
- Caching intermediate results
- Session-specific state

**Storage:** JSON-serializable values. Key uniqueness: userId + projectId + key.

**Tool Chaining:**
- After: Often followed by get_short_term_memory
- Use: list_short_term_memory to see all keys

**Keywords:** set, save, store, cache, session, key-value, scratch, temporary

**Example - Store Active Task:**
\`\`\`json
{
  "userId": "dev",
  "projectId": "myapp",
  "key": "active_task",
  "value": {"id": "task_123", "name": "Fix login bug", "status": "in_progress"}
}
\`\`\`

**Example - Scratch Pad:**
\`\`\`json
{
  "userId": "dev",
  "projectId": "myapp",
  "key": "scratch_pad",
  "value": {"calculation": "55 * 12 = 660", "note": "for report section 3"}
}
\`\`\``,
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID" },
                key: { type: "string", description: "Memory Key to set" },
                value: { type: "object", description: "Value (JSON Serializable) to store" }
            },
            required: ["userId", "projectId", "key", "value"],
        },
        handler: async (args: any) => {
            const { userId, projectId, key, value } = args;
            try {
                await setShortTermMemory(userId, projectId, key, value);
                return {
                    content: [{ type: "text", text: `Saved short-term memory key '${key}'` }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "get_short_term_memory",
        description: `## Get Short-Term Memory Value

**Purpose:** Retrieve a specific value by key from session storage.

**Use Cases:**
- Fetching cached session state
- Getting active task context
- Retrieving scratch pad calculations

**Keywords:** get, retrieve, fetch, read, session, key-value

**Example:**
\`\`\`json
{
  "userId": "dev",
  "projectId": "myapp",
  "key": "active_task"
}
\`\`\``,
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID" },
                key: { type: "string", description: "Memory Key to retrieve" }
            },
            required: ["userId", "projectId", "key"],
        },
        handler: async (args: any) => {
            const { userId, projectId, key } = args;
            try {
                const value = await getShortTermMemory(userId, projectId, key);
                if (value === null) {
                    return { isError: true, content: [{ type: "text", text: `Key '${key}' not found in short-term memory.` }] };
                }
                return {
                    content: [{ type: "text", text: JSON.stringify({ key, value }, null, 2) }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "search_short_term_memory",
        description: `## Search Short-Term Memory (Semantic)

**Purpose:** Search short-term memories using embeddings/semantic similarity.

**Use Cases:**
- Finding related session memories
- Semantic search across session data
- Fallback to text search if embeddings disabled

**Returns:** Memories with confidence scores based on semantic similarity.

**Keywords:** search, find, semantic, similarity, embeddings, recall, short-term

**Example:**
\`\`\`json
{
  "userId": "dev",
  "projectId": "myapp",
  "query": "login bug fix",
  "confidenceThreshold": 20,
  "limit": 10
}
\`\`\``,
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID" },
                query: { type: "string", description: "Search query text." },
                limit: { type: "number", description: "Max results (default from env: 10)" },
                offset: { type: "number", description: "Pagination offset (default from env: 0)" },
                confidenceThreshold: { type: "number", description: "Min confidence score (default from env: 20)" }
            },
            required: ["userId", "projectId", "query"],
        },
        handler: async (args: any) => {
            const config = getMemoryConfig();
            const { userId, projectId, query } = args;
            const limit = args.limit ?? config.DEFAULT_SEARCH_LIMIT;
            const offset = args.offset ?? config.DEFAULT_SEARCH_OFFSET;
            const threshold = args.confidenceThreshold ?? config.DEFAULT_CONFIDENCE_THRESHOLD;
            
            try {
                const results = await searchShortTermMemory(userId, query, undefined, projectId, threshold, limit, offset);
                return {
                    content: [{ type: "text", text: JSON.stringify({
                        results,
                        search_context: { limit, offset, confidenceThreshold: threshold, source: "search_short_term_memory" }
                    }, null, 2) }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "list_short_term_memory",
        description: `## List All Short-Term Memory Keys

**Purpose:** Get all keys and values stored for a session.

**Use Cases:**
- Seeing all cached session data
- Debugging session state
- Overview of temporary storage

**Keywords:** list, keys, all, session, overview, keys

**Example:**
\`\`\`json
{
  "userId": "dev",
  "projectId": "myapp",
  "limit": 20
}
\`\`\``,
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID" },
                limit: { type: "number", description: "Max results (default from env: 10)" },
                offset: { type: "number", description: "Pagination offset (default from env: 0)" }
            },
            required: ["userId", "projectId"],
        },
        handler: async (args: any) => {
            const cfg = getMemoryConfig();
            const { userId, projectId } = args;
            const limit = args.limit ?? cfg.DEFAULT_SEARCH_LIMIT;
            const offset = args.offset ?? cfg.DEFAULT_SEARCH_OFFSET;
            
            try {
                const results = listShortTermMemory(userId, projectId);
                return {
                    content: [{ type: "text", text: JSON.stringify({
                        results: results.slice(offset, offset + limit),
                        search_context: { limit, offset, source: "list_short_term_memory" }
                    }, null, 2) }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "delete_short_term_memory",
        description: `## Delete Short-Term Memory Key

**Purpose:** Remove a specific key from short-term storage.

**Use Cases:**
- Clearing outdated cache
- Removing temporary data
- Resetting session state

**Keywords:** delete, remove, clear, key, forget

**Example:**
\`\`\`json
{
  "userId": "dev",
  "projectId": "myapp",
  "key": "old_cache"
}
\`\`\``,
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID" },
                key: { type: "string", description: "Memory Key to delete" }
            },
            required: ["userId", "projectId", "key"],
        },
        handler: async (args: any) => {
            const { userId, projectId, key } = args;
            try {
                await deleteShortTermMemory(userId, projectId, key);
                return {
                    content: [{ type: "text", text: `Key '${key}' removed from short-term memory.` }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "clear_session",
        description: `## Clear All Short-Term Memory for Session

**Purpose:** Wipe all temporary session data for user+project.

**Use Cases:**
- Starting fresh session
- Clearing all cached data
- Reset before new task

**Warning:** This deletes ALL short-term data for the user+project combination.

**Keywords:** clear, reset, wipe, delete, all, session, fresh

**Example:**
\`\`\`json
{
  "userId": "dev",
  "projectId": "myapp"
}
\`\`\``,
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID" }
            },
            required: ["userId", "projectId"],
        },
        handler: async (args: any) => {
            const { userId, projectId } = args;
            try {
                await clearSessionMemory(userId, projectId);
                return {
                    content: [{ type: "text", text: `Session cleared for project.` }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    }
];
