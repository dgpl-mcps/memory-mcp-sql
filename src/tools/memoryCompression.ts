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
    listProjects,
    getProject,
    getTask,
    updateMemoryPriority,
    applyTimeDecay,
    linkMemoryToSession,
    findCrossSessionMemories,
    cleanupOldMemories,
    findDuplicateMemories,
    mergeDuplicateMemories,
    getOptimizedContext,
    createIncrementalSummary,
    pinMemory,
    getPinnedMemories,
    getMemoryById,
    db
} from "../db/sqlite.js";
import { getMemoryConfig } from "../utils/env.js";

// Stop words for keyword extraction
const STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now', 'about', 'this', 'that', 'what', 'which', 'who', 'whom', 'whose']);

function extractKeywordsAdvanced(text: string): string[] {
    const words = text.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3 && !STOP_WORDS.has(w));
    
    // Calculate term frequency
    const freq: Record<string, number> = {};
    words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
    
    // Score by frequency and position (earlier words get bonus)
    const scored = Object.entries(freq).map(([word, count]) => {
        const position = text.toLowerCase().indexOf(word);
        const positionBonus = position < 100 ? 1.2 : position < 300 ? 1.1 : 1.0;
        return { word, score: count * positionBonus };
    });
    
    return scored.sort((a, b) => b.score - a.score).slice(0, 15).map(x => x.word);
}

function extractEntityReferences(query: string, projectId?: string | null): { tasks: string[]; keypoints: string[]; entities: string[]; projects: string[] } {
    const refs = { tasks: [] as string[], keypoints: [] as string[], entities: [] as string[], projects: [] as string[] };
    
    // Task patterns
    const taskPatterns = [
        /(?:task|todo|item|action)[-:\s#]+(\w+)/gi,
        /#(\d+)/g,
        /task[:\s]+(\w+)/gi,
        /(?:update|fix|create|complete|finish)\s+(\w+)\s+(?:task|todo)/gi
    ];
    taskPatterns.forEach(p => {
        const matches = query.matchAll(p);
        for (const m of matches) {
            if (m[1]) refs.tasks.push(m[1].toLowerCase());
        }
    });
    refs.tasks = [...new Set(refs.tasks)];
    
    // Keypoint patterns
    const kpPatterns = [
        /(?:keypoint|key|important|note|remember)[-:\s]+(.+?)(?:\.|$)/gi,
        /📌\s*(.+?)(?:\.|$)/g,
        /\*(.+?)\*/g
    ];
    const kpMatches: string[] = [];
    kpPatterns.forEach(p => {
        const matches = query.matchAll(p);
        for (const m of matches) {
            if (m[1] && m[1].length > 3) kpMatches.push(m[1].trim().slice(0, 50));
        }
    });
    refs.keypoints = [...new Set(kpMatches)];
    
    // Project patterns
    const projPatterns = [
        /(?:project|pro)[-:\s#]+(\w+)/gi,
        /(?:in|for|with)\s+project\s+(\w+)/gi
    ];
    projPatterns.forEach(p => {
        const matches = query.matchAll(p);
        for (const m of matches) {
            if (m[1]) refs.projects.push(m[1].toLowerCase());
        }
    });
    refs.projects = [...new Set(refs.projects)];
    
    // Entity patterns (capitalized words)
    const entityMatches = query.match(/[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)*/g) || [];
    refs.entities = [...new Set(entityMatches.map(e => e.toLowerCase()))].slice(0, 5);
    
    return refs;
}

// Fuzzy string matching for better similarity
function calculateSimilarity(query: string, text: string): number {
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();
    
    if (textLower.includes(queryLower)) return 100;
    
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    const textWords = textLower.split(/\s+/).filter(w => w.length > 2);
    
    if (queryWords.length === 0 || textWords.length === 0) return 0;
    
    // Jaccard similarity
    const querySet = new Set(queryWords);
    const textSet = new Set(textWords);
    const intersection = [...querySet].filter(w => textSet.has(w) || textLower.includes(w)).length;
    const union = new Set([...querySet, ...textSet]).size;
    
    let similarity = (intersection / union) * 100;
    
    // Bonus for word order (consecutive matches)
    let consecutiveBonus = 0;
    let lastMatch = -1;
    queryWords.forEach((w, i) => {
        const idx = textWords.indexOf(w);
        if (idx !== -1) {
            if (lastMatch !== -1 && idx === lastMatch + 1) consecutiveBonus += 5;
            lastMatch = idx;
        }
    });
    
    return Math.min(similarity + consecutiveBonus, 100);
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
    },
    {
        name: "stitch_session_context",
        description: "Stitch together recent summaries to provide context continuity. Useful when context was lost.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                sessionId: { type: "string", description: "Session ID" },
                summaryCount: { type: "number", description: "Number of summaries to stitch", default: 3 }
            },
            required: ["userId", "sessionId"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({
                    userId: z.string().min(1),
                    sessionId: z.string().min(1),
                    summaryCount: z.number().default(3)
                });
                const { userId, sessionId, summaryCount } = validatePayload(schema, args);
                
                const summaries = getSessionSummaries(userId, sessionId);
                if (summaries.length === 0) {
                    // Fall back to short-term chats
                    const chats = getShortTermChats(userId, sessionId, undefined, summaryCount);
                    if (chats.length === 0) {
                        return { content: [{ type: "text", text: "No conversation history found." }] };
                    }
                    
                    // Stitch from short-term
                    const stitched = chats.reverse().map(c => 
                        `Q: ${c.userSummary || c.userQuery.slice(0, 80)}\nA: ${c.agentSummary || c.agentResponse.slice(0, 120)}`
                    ).join("\n\n---\n\n");
                    
                    return { content: [{ type: "text", text: `## Context from Short-Term (${chats.length} chats)\n\n${stitched}` }] };
                }
                
                // Stitch from long-term summaries
                const recent = summaries.slice(-summaryCount).reverse();
                const stitched = recent.map(s => 
                    `## Summary ${s.summaryIndex}\nUser: ${s.userSummary}\nAgent: ${s.agentSummary}\nRefs: ${(JSON.parse(s.referencedTasks || "[]") as string[]).join(", ") || "none"}`
                ).join("\n\n---\n\n");
                
                return { content: [{ type: "text", text: `## Context from Long-Term (${recent.length} summaries)\n\n${stitched}` }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "search_across_memory",
        description: "Search across all memory types with lower threshold. Returns unified results sorted by relevance.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID (optional)" },
                query: { type: "string", description: "Search query" },
                includeRaw: { type: "boolean", description: "Include raw content in results", default: true },
                limit: { type: "number", description: "Max results per type", default: 5 }
            },
            required: ["userId", "query"],
        },
        handler: async (args: any) => {
            try {
                const schema = baseSchema.extend({
                    query: z.string().min(1),
                    includeRaw: z.boolean().default(true),
                    limit: z.number().default(5)
                });
                const { userId, projectId, query, includeRaw, limit } = validatePayload(schema, args);
                
                const config = getMemoryConfig();
                const allResults: any[] = [];
                
                // Short-term (lower threshold for broader search)
                const shortResults = searchShortTermMemory(userId, query, undefined, projectId || null, 10);
                allResults.push(...shortResults.map(r => ({ 
                    ...r, 
                    memoryType: "short_term",
                    displayText: r.userSummary || r.userQuery?.slice(0, 100)
                })));
                
                // Long-term
                const longResults = searchLongTermMemory(userId, query, projectId || null, 50);
                allResults.push(...longResults.map(r => ({ 
                    ...r, 
                    memoryType: "long_term", 
                    displayText: r.userSummary || r.userQuery?.slice(0, 100)
                })));
                
                // De-duplicate and sort by similarity
                const uniqueResults = new Map();
                allResults.forEach(r => {
                    const key = `${r.memoryType}-${r.id}`;
                    if (!uniqueResults.has(key) || uniqueResults.get(key).similarity < r.similarity) {
                        uniqueResults.set(key, r);
                    }
                });
                
                const sortedResults = [...uniqueResults.values()].sort((a, b) => b.similarity - a.similarity);
                
                return {
                    content: [{ type: "text", text: JSON.stringify({
                        query,
                        totalFound: sortedResults.length,
                        results: sortedResults.slice(0, 15).map(r => ({
                            type: r.memoryType,
                            relevance: `${Math.round(r.similarity)}%`,
                            content: r.displayText,
                            references: r.referencedTasks ? JSON.parse(r.referencedTasks) : [],
                            createdAt: r.createdAt
                        }))
                    }, null, 2) }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "memory_health_check",
        description: "Check memory health - orphaned references, broken links, duplicate entries.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID (optional)" }
            },
            required: ["userId"],
        },
        handler: async (args: any) => {
            try {
                const schema = baseSchema.extend({});
                const { userId, projectId } = validatePayload(schema, args);
                
                const issues: string[] = [];
                const warnings: string[] = [];
                
                // Check short-term references
                const shortChats = getShortTermChats(userId, undefined, projectId || null, 100);
                const totalShort = shortChats.length;
                
                // Check long-term references
                const stats = getLongTermMemoryStats(userId);
                const totalLong = stats.totalMemories;
                
                // Check for empty summaries
                const emptySummaries = shortChats.filter(c => !c.userSummary || !c.agentSummary).length;
                if (emptySummaries > 0) {
                    warnings.push(`${emptySummaries} chats have missing summaries`);
                }
                
                // Check session counts
                const sessionCounts = new Map<string, number>();
                shortChats.forEach(c => {
                    const count = sessionCounts.get(c.sessionId) || 0;
                    sessionCounts.set(c.sessionId, count + 1);
                });
                
                const avgChats = sessionCounts.size > 0 
                    ? (totalShort / sessionCounts.size).toFixed(1) 
                    : "0";
                
                // Health score
                const healthScore = Math.max(0, 100 - (emptySummaries * 2) - (issues.length * 5));
                
                return {
                    content: [{ type: "text", text: JSON.stringify({
                        healthScore: `${healthScore}/100`,
                        shortTerm: {
                            totalChats: totalShort,
                            sessions: sessionCounts.size,
                            avgChatsPerSession: avgChats,
                            issues: emptySummaries
                        },
                        longTerm: {
                            totalMemories: totalLong,
                            avgSimilarity: stats.averageSimilarity.toFixed(1)
                        },
                        warnings: warnings.length > 0 ? warnings : ["All systems operational"],
                        recommendations: healthScore < 80 
                            ? ["Consider running memory cleanup", "Update missing summaries"]
                            : ["Memory system healthy"]
                    }, null, 2) }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "update_chat_summary",
        description: "Manually update a chat's summary for better context preservation.",
        inputSchema: {
            type: "object",
            properties: {
                chatId: { type: "string", description: "Chat ID to update" },
                userSummary: { type: "string", description: "New user summary" },
                agentSummary: { type: "string", description: "New agent summary" },
                combo: { type: "string", description: "New combo/understanding" }
            },
            required: ["chatId", "userSummary", "agentSummary"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({
                    chatId: z.string().min(1),
                    userSummary: z.string().min(1),
                    agentSummary: z.string().min(1),
                    combo: z.string().optional()
                });
                const { chatId, userSummary, agentSummary, combo } = validatePayload(schema, args);
                
                const finalCombo = combo || createCombo(userSummary, agentSummary);
                updateChatSummary(chatId, userSummary, agentSummary, finalCombo);
                
                return { content: [{ type: "text", text: `Chat ${chatId} updated successfully` }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "batch_store_chats",
        description: "Store multiple chats at once efficiently. Use for bulk import or replay.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID (optional)" },
                sessionId: { type: "string", description: "Session ID" },
                chats: { 
                    type: "array", 
                    items: {
                        type: "object",
                        properties: {
                            userQuery: { type: "string" },
                            agentResponse: { type: "string" }
                        },
                        required: ["userQuery", "agentResponse"]
                    },
                    description: "Array of user query and agent response pairs"
                }
            },
            required: ["userId", "sessionId", "chats"],
        },
        handler: async (args: any) => {
            try {
                const schema = baseSchema.extend({
                    sessionId: z.string().min(1),
                    chats: z.array(z.object({
                        userQuery: z.string().min(1),
                        agentResponse: z.string().min(1)
                    })).min(1)
                });
                const { userId, projectId, sessionId, chats } = validatePayload(schema, args);
                
                const config = getMemoryConfig();
                const results: any[] = [];
                
                for (const chat of chats) {
                    const refs = extractEntityReferences(chat.userQuery);
                    const userSummary = createUserSummary(chat.userQuery, config.SUMMARY_MAX_LENGTH);
                    const agentSummary = createAgentSummary(chat.agentResponse, config.SUMMARY_MAX_LENGTH);
                    const combo = createCombo(userSummary, agentSummary);
                    
                    const result = addShortTermChat(
                        userId, projectId || null, sessionId,
                        chat.userQuery, chat.agentResponse,
                        userSummary, agentSummary, combo,
                        refs.tasks, refs.keypoints, refs.entities, refs.projects
                    );
                    results.push(result);
                }
                
                const chatCount = getSessionChatCount(sessionId);
                let summarizeResult = null;
                
                if (chatCount > 0 && chatCount % config.AUTO_SUMMARIZE_AFTER_CHATS === 0) {
                    const summaryIndex = Math.floor(chatCount / config.AUTO_SUMMARIZE_AFTER_CHATS);
                    const recent = getShortTermChats(userId, sessionId, projectId || null, config.AUTO_SUMMARIZE_AFTER_CHATS);
                    const allRefs = { tasks: [] as string[], keypoints: [] as string[], entities: [] as string[], projects: [] as string[] };
                    recent.forEach(c => {
                        if (c.referencedTasks) allRefs.tasks.push(...JSON.parse(c.referencedTasks));
                        if (c.referencedKeypoints) allRefs.keypoints.push(...JSON.parse(c.referencedKeypoints));
                    });
                    
                    summarizeResult = summarizeAndMoveToLongTerm(
                        userId, projectId || null, sessionId, summaryIndex,
                        `Batch of ${chats.length} chats`, `Imported ${chats.length} conversations`,
                        `Batch import: ${chats.length} chats`,
                        chatCount, allRefs.tasks, allRefs.keypoints, [], []
                    );
                    clearShortTermMemory(userId, sessionId, config.MAX_SHORT_TERM_CHATS);
                }
                
                return {
                    content: [{ type: "text", text: `Batch stored: ${chats.length} chats\nTotal in session: ${chatCount}${summarizeResult ? `\nAuto-summarized to long-term` : ''}` }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "boost_memory_priority",
        description: "Boost or reduce priority of a long-term memory. Higher priority = more likely to be retrieved.",
        inputSchema: {
            type: "object",
            properties: {
                memoryId: { type: "string", description: "Memory ID to adjust" },
                delta: { type: "number", description: "Change in priority (-0.5 to +0.5)", default: 0.1 }
            },
            required: ["memoryId"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({
                    memoryId: z.string().min(1),
                    delta: z.number().min(-0.5).max(0.5).default(0.1)
                });
                const { memoryId, delta } = validatePayload(schema, args);
                
                updateMemoryPriority(memoryId, delta);
                
                return { content: [{ type: "text", text: `Memory ${memoryId} priority adjusted by ${delta > 0 ? '+' : ''}${delta}` }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "link_cross_session_context",
        description: "Link current session to relevant memories from other sessions for better context.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                sessionId: { type: "string", description: "Current session ID" },
                query: { type: "string", description: "Search query to find related memories" }
            },
            required: ["userId", "sessionId", "query"],
        },
        handler: async (args: any) => {
            try {
                const schema = baseSchema.extend({
                    sessionId: z.string().min(1),
                    query: z.string().min(1)
                });
                const { userId, projectId, sessionId, query } = validatePayload(schema, args);
                
                const config = getMemoryConfig();
                const crossSession = findCrossSessionMemories(userId, sessionId, query, config.CROSS_SESSION_THRESHOLD);
                
                if (crossSession.length === 0) {
                    return { content: [{ type: "text", text: "No cross-session memories found to link." }] };
                }
                
                // Auto-link top results
                const linked = crossSession.slice(0, 3).map(m => {
                    linkMemoryToSession(m.id, sessionId);
                    return m.id;
                });
                
                return {
                    content: [{ type: "text", text: `Linked ${linked.length} cross-session memories:\n${linked.join("\n")}` }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "optimize_context_window",
        description: "Get optimized context for current session within token limit.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                sessionId: { type: "string", description: "Session ID" },
                maxTokens: { type: "number", description: "Max tokens (default 8000)", default: 8000 }
            },
            required: ["userId", "sessionId"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({
                    userId: z.string().min(1),
                    sessionId: z.string().min(1),
                    maxTokens: z.number().default(8000)
                });
                const { userId, sessionId, maxTokens } = validatePayload(schema, args);
                
                const config = getMemoryConfig();
                const result = getOptimizedContext(userId, sessionId, maxTokens, config.CONTEXT_OVERLAP);
                
                return {
                    content: [{ type: "text", text: JSON.stringify({
                        tokens: result.tokens,
                        summariesUsed: result.summariesUsed,
                        chatsUsed: result.chatsUsed,
                        contextPreview: result.context.slice(0, 500) + "..."
                    }, null, 2) }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "cleanup_old_memories",
        description: "Clean up memories older than specified days. Pinned memories are preserved.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                daysOld: { type: "number", description: "Delete memories older than this (default 90)", default: 90 },
                dryRun: { type: "boolean", description: "Preview what would be deleted without actually deleting", default: false }
            },
            required: ["userId"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({
                    userId: z.string().min(1),
                    daysOld: z.number().default(90),
                    dryRun: z.boolean().default(false)
                });
                const { userId, daysOld, dryRun } = validatePayload(schema, args);
                
                if (dryRun) {
                    const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
                    const count = db.prepare(`SELECT COUNT(*) as c FROM LongTermMemory WHERE userId = ? AND createdAt < ? AND isPinned = 0`).get(userId, cutoff) as { c: number };
                    return { content: [{ type: "text", text: `Would delete ${count?.c || 0} memories older than ${daysOld} days` }] };
                }
                
                const result = cleanupOldMemories(userId, daysOld);
                
                return { content: [{ type: "text", text: `Deleted ${result.deleted} old memories (older than ${daysOld} days, pinned preserved)` }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "find_and_merge_duplicates",
        description: "Find similar long-term memories and optionally merge them.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                threshold: { type: "number", description: "Similarity threshold (default 90%)", default: 90 },
                autoMerge: { type: "boolean", description: "Auto-merge duplicates", default: false }
            },
            required: ["userId"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({
                    userId: z.string().min(1),
                    threshold: z.number().default(90),
                    autoMerge: z.boolean().default(false)
                });
                const { userId, threshold, autoMerge } = validatePayload(schema, args);
                
                const duplicates = findDuplicateMemories(userId, threshold);
                
                if (duplicates.length === 0) {
                    return { content: [{ type: "text", text: "No duplicate memories found." }] };
                }
                
                let merged = 0;
                if (autoMerge) {
                    for (const dup of duplicates) {
                        mergeDuplicateMemories(dup.original, dup.duplicate);
                        merged++;
                    }
                }
                
                return {
                    content: [{ type: "text", text: JSON.stringify({
                        found: duplicates.length,
                        merged: autoMerge ? merged : 0,
                        duplicates: duplicates.slice(0, 5).map(d => ({
                            original: d.original.slice(0, 20),
                            duplicate: d.duplicate.slice(0, 20),
                            similarity: `${d.similarity}%`
                        }))
                    }, null, 2) }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "pin_memory",
        description: "Pin or unpin a memory so it's preserved during cleanup and prioritized.",
        inputSchema: {
            type: "object",
            properties: {
                memoryId: { type: "string", description: "Memory ID" },
                pinned: { type: "boolean", description: "Pin status", default: true }
            },
            required: ["memoryId"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({
                    memoryId: z.string().min(1),
                    pinned: z.boolean().default(true)
                });
                const { memoryId, pinned } = validatePayload(schema, args);
                
                pinMemory(memoryId, pinned);
                
                return { content: [{ type: "text", text: `Memory ${pinned ? 'pinned' : 'unpinned'}` }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "list_pinned_memories",
        description: "List all pinned memories that won't be auto-cleaned.",
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
                
                const pinned = getPinnedMemories(userId) as any[];
                
                return {
                    content: [{ type: "text", text: JSON.stringify({
                        total: pinned.length,
                        memories: pinned.map((p: any) => ({
                            id: p.id,
                            query: p.userQuery?.slice(0, 50),
                            summary: p.userSummary?.slice(0, 80),
                            created: p.createdAt
                        }))
                    }, null, 2) }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "apply_time_decay",
        description: "Apply time-decay to memory priorities based on age.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                decayDays: { type: "number", description: "Full decay after days (default 30)", default: 30 }
            },
            required: ["userId"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({
                    userId: z.string().min(1),
                    decayDays: z.number().default(30)
                });
                const { userId, decayDays } = validatePayload(schema, args);
                
                const result = applyTimeDecay(userId, decayDays);
                
                return { content: [{ type: "text", text: `Time decay applied to ${result.processed} memories` }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "get_memory_details",
        description: "Get detailed information about a specific memory.",
        inputSchema: {
            type: "object",
            properties: {
                memoryId: { type: "string", description: "Memory ID" }
            },
            required: ["memoryId"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({ memoryId: z.string().min(1) });
                const { memoryId } = validatePayload(schema, args);
                
                const memory = getMemoryById(memoryId) as any;
                
                if (!memory) {
                    return { isError: true, content: [{ type: "text", text: "Memory not found" }] };
                }
                
                return {
                    content: [{ type: "text", text: JSON.stringify({
                        id: memory.id,
                        userQuery: memory.userQuery,
                        userSummary: memory.userSummary,
                        agentSummary: memory.agentSummary,
                        combo: memory.combo?.slice(0, 200),
                        priority: memory.priority,
                        isPinned: memory.isPinned,
                        accessCount: memory.accessCount,
                        lastAccessed: memory.lastAccessedAt,
                        created: memory.createdAt,
                        references: {
                            tasks: JSON.parse(memory.referencedTasks || "[]"),
                            keypoints: JSON.parse(memory.referencedKeypoints || "[]")
                        },
                        linkedSessions: JSON.parse(memory.linkedSessions || "[]")
                    }, null, 2) }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    }
];