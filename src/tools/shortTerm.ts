import { setShortTermMemory, getShortTermMemory, deleteShortTermMemory, clearSessionMemory, searchShortTermMemory, listShortTermMemory } from "../db/sqlite.js";
import { getMemoryConfig } from "../utils/env.js";

export const shortTermTools = [
    {
        name: "set_short_term_memory",
        description: "Save arbitrary fast-access key-value pair for the current session (e.g active_task, scratch_pad).",
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
        description: "Retrieve a fast-access key-value pair for the current session.",
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
        description: "Search local SQLite memory using embeddings/semantic search, matching the intent. If embedding url is disabled, it will fallback to standard text search.",
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
        description: "List all keys and values in short-term memory for the current session.",
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
        description: "Deletes a specific short-term memory key.",
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
        description: "Clears ALL short term memory for a specific User and Project.",
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
