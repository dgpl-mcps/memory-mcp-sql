import { z } from "zod";
import { validatePayload, baseSchema } from "./validation.js";
import {
    storeConversationMessage,
    storeRawInteraction,
    getConversationMemory,
    searchConversationMemory,
    getRawInteraction,
    expandFromRaw,
    getMemoryIndex,
    deleteConversationMemory,
    updateMemoryIndex
} from "../db/sqlite.js";

function extractKeywords(text: string): string[] {
    const words = text.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3);
    
    const freq: Record<string, number> = {};
    words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
    
    return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([w]) => w);
}

function extractEntities(text: string): string[] {
    const entities: string[] = [];
    const patterns = [
        /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:said|mentioned|asked|told)/g,
        /(?:project|task|feature|bug):\s*([^\s,]+)/gi,
        /#(\w+)/g
    ];
    
    patterns.forEach(p => {
        const matches = text.matchAll(p);
        for (const m of matches) {
            if (m[1] && m[1].length > 2) {
                entities.push(m[1]);
            }
        }
    });
    
    return [...new Set(entities)].slice(0, 5);
}

function generateSummary(content: string, maxLength: number = 500): string {
    if (content.length <= maxLength) {
        return content;
    }
    
    const sentences = content
        .replace(/([.!?])\s*(?=[A-Z])/g, '$1|')
        .split('|')
        .map(s => s.trim())
        .filter(s => s.length > 10);
    
    if (sentences.length <= 3) {
        return content.slice(0, maxLength) + "...";
    }
    
    const first = sentences[0];
    const last = sentences[sentences.length - 1];
    const middle = sentences.slice(1, -1).slice(0, 2).join(' ');
    
    let summary = first;
    if (middle) summary += " " + middle;
    summary += " " + last;
    
    if (summary.length > maxLength) {
        return summary.slice(0, maxLength) + "...";
    }
    
    return summary;
}

function countTokens(text: string): number {
    return Math.ceil(text.split(/\s+/).length * 1.3);
}

export const memoryCompressionTools = [
    {
        name: "compress_and_store",
        description: "Compress (summarize) a conversation message and store with raw fallback. Use after user-agent interactions to create compact memory.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID (optional)" },
                sessionId: { type: "string", description: "Session ID for conversation tracking" },
                role: { type: "string", enum: ["user", "assistant", "system"], description: "Message role" },
                content: { type: "string", description: "Full message content to compress" },
                customSummary: { type: "string", description: "Optional custom summary (if not provided, auto-generated)" },
                storeRaw: { type: "boolean", description: "Store raw content for fallback", default: true }
            },
            required: ["userId", "sessionId", "role", "content"],
        },
        handler: async (args: any) => {
            try {
                const schema = baseSchema.extend({
                    sessionId: z.string().min(1),
                    role: z.enum(["user", "assistant", "system"]),
                    content: z.string().min(1),
                    customSummary: z.string().optional(),
                    storeRaw: z.boolean().default(true)
                });
                const { userId, projectId, sessionId, role, content, customSummary, storeRaw } = validatePayload(schema, args);
                
                const summary = customSummary || generateSummary(content);
                const keywords = extractKeywords(content);
                const entities = extractEntities(content);
                const tokens = countTokens(content);
                
                const result = storeConversationMessage(
                    userId,
                    projectId || null,
                    sessionId,
                    role,
                    summary,
                    storeRaw ? content : "",
                    keywords,
                    entities,
                    tokens
                );
                
                // Also store in raw table if enabled
                if (storeRaw) {
                    storeRawInteraction(
                        userId,
                        projectId || null,
                        sessionId,
                        role === "user" ? content : "",
                        role === "assistant" ? content : "",
                        ""
                    );
                }
                
                // Update memory index
                updateMemoryIndex(userId, projectId || null, sessionId, summary, keywords, entities);
                
                return {
                    content: [{ type: "text", text: `Compressed and stored message\nOriginal: ${content.length} chars\nSummary: ${summary.length} chars\nCompression: ${Math.round((1 - summary.length/content.length)*100)}%\nKeywords: ${keywords.slice(0,3).join(", ")}` }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "retrieve_compressed_memory",
        description: "Retrieve compressed (summarized) conversation memory. Automatically falls back to raw if summary insufficient.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID (optional)" },
                sessionId: { type: "string", description: "Session ID (optional)" },
                query: { type: "string", description: "Search query to find relevant memories" },
                limit: { type: "number", description: "Max messages to retrieve", default: 10 }
            },
            required: ["userId"],
        },
        handler: async (args: any) => {
            try {
                const schema = baseSchema.extend({
                    sessionId: z.string().optional(),
                    query: z.string().optional(),
                    limit: z.number().default(10)
                });
                const { userId, projectId, sessionId, query, limit } = validatePayload(schema, args);
                
                let results;
                
                if (query) {
                    results = searchConversationMemory(userId, query, projectId || null, limit);
                } else {
                    results = getConversationMemory(userId, projectId || null, sessionId || null, limit);
                }
                
                if (results.length === 0) {
                    return { content: [{ type: "text", text: "No conversation memory found." }] };
                }
                
                const formatted = results.map(r => ({
                    role: r.role,
                    summary: r.summary,
                    source: r.source || "summary",
                    tokens: r.tokenCount,
                    createdAt: r.createdAt
                }));
                
                return {
                    content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "expand_from_raw",
        description: "Expand compressed memory by retrieving raw conversation data. Use when summary lacks needed context.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                sessionId: { type: "string", description: "Session ID to expand" },
                startIndex: { type: "number", description: "Start position in conversation", default: 0 },
                count: { type: "number", description: "Number of messages to retrieve", default: 5 }
            },
            required: ["userId", "sessionId"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({
                    userId: z.string().min(1),
                    sessionId: z.string().min(1),
                    startIndex: z.number().default(0),
                    count: z.number().default(5)
                });
                const { userId, sessionId, startIndex, count } = validatePayload(schema, args);
                
                const rawData = expandFromRaw(userId, sessionId, startIndex, count);
                
                if (rawData.length === 0) {
                    return { content: [{ type: "text", text: "No raw interactions found for this session." }] };
                }
                
                return {
                    content: [{ type: "text", text: JSON.stringify(rawData, null, 2) }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "get_memory_index",
        description: "Get the memory index (keywords, entities) for fast context lookup without loading full content.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID (optional)" },
                sessionId: { type: "string", description: "Session ID (optional)" }
            },
            required: ["userId"],
        },
        handler: async (args: any) => {
            try {
                const schema = baseSchema.extend({
                    sessionId: z.string().optional()
                });
                const { userId, projectId, sessionId } = validatePayload(schema, args);
                
                const index = getMemoryIndex(userId, projectId || null, sessionId || null);
                
                return {
                    content: [{ type: "text", text: JSON.stringify(index, null, 2) }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "clear_conversation_memory",
        description: "Clear conversation memory by session or date. Helps manage memory size.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                sessionId: { type: "string", description: "Session ID to clear (optional)" },
                beforeDate: { type: "string", description: "Clear memories before this date (ISO string)" }
            },
            required: ["userId"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({
                    userId: z.string().min(1),
                    sessionId: z.string().optional(),
                    beforeDate: z.string().optional()
                });
                const { userId, sessionId, beforeDate } = validatePayload(schema, args);
                
                deleteConversationMemory(userId, sessionId, beforeDate);
                
                return {
                    content: [{ type: "text", text: `Conversation memory cleared${sessionId ? ` for session ${sessionId}` : ''}${beforeDate ? ` before ${beforeDate}` : ''}` }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "summarize_session",
        description: "Generate a comprehensive summary of an entire session from stored messages.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                sessionId: { type: "string", description: "Session ID to summarize" }
            },
            required: ["userId", "sessionId"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({
                    userId: z.string().min(1),
                    sessionId: z.string().min(1)
                });
                const { userId, sessionId } = validatePayload(schema, args);
                
                const messages = getConversationMemory(userId, null, sessionId, 100);
                
                if (messages.length === 0) {
                    return { content: [{ type: "text", text: "No messages found for this session." }] };
                }
                
                const userMessages = messages.filter(m => m.role === "user").map(m => m.summary);
                const assistantMessages = messages.filter(m => m.role === "assistant").map(m => m.summary);
                
                const allKeywords: string[] = [];
                const allEntities: string[] = [];
                messages.forEach(m => {
                    if (m.keywords) allKeywords.push(...m.keywords);
                    if (m.entities) allEntities.push(...m.entities);
                });
                
                const uniqueKeywords = [...new Set(allKeywords)].slice(0, 10);
                const uniqueEntities = [...new Set(allEntities)].slice(0, 5);
                
                let sessionSummary = `## Session Summary\n\n`;
                sessionSummary += `**Messages**: ${messages.length} (${userMessages.length} user, ${assistantMessages.length} assistant)\n`;
                sessionSummary += `**Key Topics**: ${uniqueKeywords.join(", ") || "None detected"}\n`;
                sessionSummary += `**Entities**: ${uniqueEntities.join(", ") || "None detected"}\n\n`;
                sessionSummary += `### Recent User Messages\n`;
                userMessages.slice(0, 3).forEach(m => { sessionSummary += `- ${m.slice(0, 100)}...\n`; });
                
                return {
                    content: [{ type: "text", text: sessionSummary }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    }
];