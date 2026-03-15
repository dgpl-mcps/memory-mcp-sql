import { z } from "zod";
import { validatePayload, baseSchema } from "./validation.js";
import {
    addShortTermChat,
    getShortTermChats,
    getSessionChatCount,
    summarizeAndMoveToLongTerm,
    searchShortTermMemory,
    searchLongTermMemory,
    getSessionSummaries,
    clearShortTermMemory,
    updateChatSummary,
    getLongTermMemoryStats,
    listTasks,
    listEntities,
    listProjects
} from "../db/sqlite.js";
import { getMemoryConfig } from "../utils/env.js";

function extractKeywords(text: string): string[] {
    const words = text.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3);
    const freq: Record<string, number> = {};
    words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([w]) => w);
}

function extractEntityReferences(query: string, projectId?: string | null): { tasks: string[]; keypoints: string[]; entities: string[]; projects: string[] } {
    const refs = { tasks: [] as string[], keypoints: [] as string[], entities: [] as string[], projects: [] as string[] };
    
    const taskMatch = query.match(/(?:task|todo|#\d+)[-:\s]+(\w+)/gi);
    if (taskMatch) refs.tasks = taskMatch.map(m => m.split(/[-:\s]+/).pop() || "").filter(Boolean);
    
    const projectMatch = query.match(/(?:project|pro)[-:\s]+(\w+)/gi);
    if (projectMatch) refs.projects = projectMatch.map(m => m.split(/[-:\s]+/).pop() || "").filter(Boolean);
    
    return refs;
}

function createUserSummary(query: string, maxLength: number = 200): string {
    if (query.length <= maxLength) return query;
    return query.slice(0, maxLength) + "...";
}

function createAgentSummary(response: string, maxLength: number = 300): string {
    if (response.length <= maxLength) return response;
    const sentences = response.replace(/([.!?])\s*(?=[A-Z])/, '$1|').split('|').map(s => s.trim()).filter(s => s.length > 10);
    if (sentences.length <= 2) return response.slice(0, maxLength) + "...";
    return sentences[0] + " " + sentences[sentences.length - 1].slice(0, maxLength - sentences[0].length - 10) + "...";
}

function createCombo(userSummary: string, agentSummary: string, progress: string = ""): string {
    let combo = `## User Intent\n${userSummary}\n\n## Agent Response\n${agentSummary}`;
    if (progress) combo += `\n\n## Progress\n${progress}`;
    return combo;
}

export const smartMemoryTools = [
    {
        name: "store_chat_interaction",
        description: "Store a user-agent chat interaction with automatic summary, references, and auto-summarization at N+1 threshold. Stores to short-term, auto-summarizes to long-term.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID (optional)" },
                sessionId: { type: "string", description: "Session ID for conversation tracking" },
                userQuery: { type: "string", description: "User's query/message" },
                agentResponse: { type: "string", description: "Agent's response" },
                progress: { type: "string", description: "Progress/updates to track (optional)" }
            },
            required: ["userId", "sessionId", "userQuery", "agentResponse"],
        },
        handler: async (args: any) => {
            try {
                const schema = baseSchema.extend({
                    sessionId: z.string().min(1),
                    userQuery: z.string().min(1),
                    agentResponse: z.string().min(1),
                    progress: z.string().optional()
                });
                const { userId, projectId, sessionId, userQuery, agentResponse, progress } = validatePayload(schema, args);
                
                const config = getMemoryConfig();
                
                // Extract entity references
                const refs = extractEntityReferences(userQuery, projectId || null);
                
                // Create summaries
                const userSummary = createUserSummary(userQuery, config.SUMMARY_MAX_LENGTH);
                const agentSummary = createAgentSummary(agentResponse, config.SUMMARY_MAX_LENGTH);
                const combo = createCombo(userSummary, agentSummary, progress);
                
                // Add to short-term memory
                const result = addShortTermChat(
                    userId, projectId || null, sessionId,
                    userQuery, agentResponse,
                    userSummary, agentSummary, combo,
                    refs.tasks, refs.keypoints, refs.entities, refs.projects
                );
                
                // Check if we need to auto-summarize
                const chatCount = getSessionChatCount(sessionId);
                let summarizeResult = null;
                
                if (chatCount > 0 && chatCount % config.AUTO_SUMMARIZE_AFTER_CHATS === 0) {
                    const summaryIndex = Math.floor(chatCount / config.AUTO_SUMMARIZE_AFTER_CHATS);
                    
                    // Get referenced entities from recent chats
                    const recentChats = getShortTermChats(userId, sessionId, projectId || null, config.AUTO_SUMMARIZE_AFTER_CHATS);
                    const allRefs = { tasks: [] as string[], keypoints: [] as string[], entities: [] as string[], projects: [] as string[] };
                    recentChats.forEach(c => {
                        if (c.referencedTasks) allRefs.tasks.push(...JSON.parse(c.referencedTasks));
                        if (c.referencedKeypoints) allRefs.keypoints.push(...JSON.parse(c.referencedKeypoints));
                        if (c.referencedEntities) allRefs.entities.push(...JSON.parse(c.referencedEntities));
                        if (c.referencedProjects) allRefs.projects.push(...JSON.parse(c.referencedProjects));
                    });
                    
                    summarizeResult = summarizeAndMoveToLongTerm(
                        userId, projectId || null, sessionId, summaryIndex,
                        userSummary, agentSummary, combo, chatCount,
                        [...new Set(allRefs.tasks)], [...new Set(allRefs.keypoints)], [...new Set(allRefs.entities)], [...new Set(allRefs.projects)]
                    );
                    
                    // Keep only last MAX_SHORT_TERM_CHATS in short-term
                    clearShortTermMemory(userId, sessionId, config.MAX_SHORT_TERM_CHATS);
                }
                
                return {
                    content: [{ type: "text", text: `Chat stored: session=${sessionId}, index=${result.chatIndex}, total=${chatCount}${summarizeResult ? `, summarized to long-term (index ${summarizeResult.id})` : ''}\nRefs: ${refs.tasks.length} tasks, ${refs.keypoints.length} keypoints` }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "retrieve_smart_memory",
        description: "Retrieve relevant memory - searches short-term (20% threshold) first, then long-term (75% threshold). Falls back to raw if needed.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID (optional)" },
                sessionId: { type: "string", description: "Session ID (optional, searches all)" },
                query: { type: "string", description: "Search query" },
                shortTermOnly: { type: "boolean", description: "Only search short-term (default false)" }
            },
            required: ["userId", "query"],
        },
        handler: async (args: any) => {
            try {
                const schema = baseSchema.extend({
                    sessionId: z.string().optional(),
                    query: z.string().min(1),
                    shortTermOnly: z.boolean().default(false)
                });
                const { userId, projectId, sessionId, query, shortTermOnly } = validatePayload(schema, args);
                
                const config = getMemoryConfig();
                const results: any[] = [];
                
                // Search short-term (20% threshold)
                const shortTermResults = searchShortTermMemory(userId, query, sessionId, projectId || null, config.SHORT_TERM_THRESHOLD);
                results.push(...shortTermResults.map(r => ({ ...r, memoryType: "short_term" })));
                
                // Search long-term (75% threshold) if not shortTermOnly
                if (!shortTermOnly) {
                    const longTermResults = searchLongTermMemory(userId, query, projectId || null, config.LONG_TERM_THRESHOLD);
                    results.push(...longTermResults.map(r => ({ ...r, memoryType: "long_term" })));
                }
                
                if (results.length === 0) {
                    return { content: [{ type: "text", text: "No matching memories found. Try a different query or reduce threshold." }] };
                }
                
                // Sort by memory type priority (short-term first) then similarity
                results.sort((a, b) => {
                    if (a.memoryType !== b.memoryType) return a.memoryType === "short_term" ? -1 : 1;
                    return b.similarity - a.similarity;
                });
                
                return {
                    content: [{ type: "text", text: JSON.stringify({
                        found: results.length,
                        shortTerm: shortTermResults.length,
                        longTerm: shortTermOnly ? 0 : results.length - shortTermResults.length,
                        memories: results.slice(0, 10).map(r => ({
                            type: r.memoryType,
                            similarity: `${Math.round(r.similarity)}%`,
                            userQuery: r.userQuery?.slice(0, 100),
                            userSummary: r.userSummary?.slice(0, 80),
                            agentSummary: r.agentSummary?.slice(0, 100),
                            references: {
                                tasks: r.referencedTasks ? JSON.parse(r.referencedTasks) : [],
                                keypoints: r.referencedKeypoints ? JSON.parse(r.referencedKeypoints) : [],
                                entities: r.referencedEntities ? JSON.parse(r.referencedEntities) : []
                            }
                        }))
                    }, null, 2) }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "get_session_history",
        description: "Get session conversation history from short-term memory.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                sessionId: { type: "string", description: "Session ID" },
                limit: { type: "number", description: "Max chats to retrieve", default: 10 }
            },
            required: ["userId", "sessionId"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({
                    userId: z.string().min(1),
                    sessionId: z.string().min(1),
                    limit: z.number().default(10)
                });
                const { userId, sessionId, limit } = validatePayload(schema, args);
                
                const chats = getShortTermChats(userId, sessionId, undefined, limit);
                
                return {
                    content: [{ type: "text", text: JSON.stringify({
                        session: sessionId,
                        totalChats: chats.length,
                        chats: chats.map(c => ({
                            index: c.chatIndex,
                            userQuery: c.userQuery.slice(0, 100),
                            agentResponse: c.agentResponse.slice(0, 100),
                            summarized: c.isSummarized === 1,
                            references: {
                                tasks: JSON.parse(c.referencedTasks || "[]"),
                                keypoints: JSON.parse(c.referencedKeypoints || "[]")
                            }
                        }))
                    }, null, 2) }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "get_session_summaries",
        description: "Get session summaries from long-term memory.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                sessionId: { type: "string", description: "Session ID" }
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
                
                const summaries = getSessionSummaries(userId, sessionId);
                
                return {
                    content: [{ type: "text", text: JSON.stringify({
                        session: sessionId,
                        summaries: summaries.map(s => ({
                            index: s.summaryIndex,
                            userSummary: s.userSummary?.slice(0, 150),
                            agentSummary: s.agentSummary?.slice(0, 200),
                            chatCount: s.chatCount,
                            references: {
                                tasks: JSON.parse(s.referencedTasks || "[]"),
                                keypoints: JSON.parse(s.referencedKeypoints || "[]")
                            }
                        }))
                    }, null, 2) }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "clear_short_term_chats",
        description: "Clear short-term memory, keeping last N chats.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                sessionId: { type: "string", description: "Session ID (optional, clears all if not provided)" },
                keepLast: { type: "number", description: "Number of recent chats to keep", default: 0 }
            },
            required: ["userId"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({
                    userId: z.string().min(1),
                    sessionId: z.string().optional(),
                    keepLast: z.number().default(0)
                });
                const { userId, sessionId, keepLast } = validatePayload(schema, args);
                
                clearShortTermMemory(userId, sessionId, keepLast);
                
                return {
                    content: [{ type: "text", text: `Short-term memory cleared${sessionId ? ` for session ${sessionId}` : ''}${keepLast > 0 ? `, kept last ${keepLast}` : ''}` }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "get_memory_stats",
        description: "Get memory statistics - counts and average similarity.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" }
            },
            required: ["userId"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({ userId: z.string().min(1) });
                const { userId } = validatePayload(schema, args);
                
                const config = getMemoryConfig();
                const stats = getLongTermMemoryStats(userId);
                
                return {
                    content: [{ type: "text", text: JSON.stringify({
                        configuration: {
                            maxShortTermChats: config.MAX_SHORT_TERM_CHATS,
                            shortTermThreshold: `${config.SHORT_TERM_THRESHOLD}%`,
                            longTermThreshold: `${config.LONG_TERM_THRESHOLD}%`,
                            autoSummarizeAfter: config.AUTO_SUMMARIZE_AFTER_CHATS
                        },
                        longTermMemory: stats,
                        thresholds: {
                            shortTerm: config.SHORT_TERM_THRESHOLD,
                            longTerm: config.LONG_TERM_THRESHOLD
                        }
                    }, null, 2) }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    }
];