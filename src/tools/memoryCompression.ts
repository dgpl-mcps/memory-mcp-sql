import { z } from "zod";
import { validatePayload, baseSchema } from "./validation.js";
import {
    addShortTermChat, getShortTermChats, getSessionChatCount,
    summarizeAndMoveToLongTerm, searchShortTermMemory, searchLongTermMemory,
    getSessionSummaries, clearShortTermMemory, getOptimizedContext,
    updateMemoryPriority, pinMemory, getMemoryById, getLongTermMemoryStats,
    cleanupOldMemories, findCrossSessionMemories, db
} from "../db/sqlite.js";
import { getMemoryConfig } from "../utils/env.js";

const STOP_WORDS = new Set(['the','a','an','and','or','but','is','are','was','were','be','been','have','has','had','do','does','did','will','would','could','should','to','of','in','for','on','with','at','by','from','this','that','what','which','who','just','also','now','about']);

function extractKeywords(text: string): string[] {
    const words = text.toLowerCase().replace(/[^\w\s]/g,' ').split(/\s+/).filter(w => w.length > 3 && !STOP_WORDS.has(w));
    const freq: Record<string, number> = {};
    words.forEach(w => freq[w] = (freq[w] || 0) + 1);
    return Object.entries(freq).sort((a,b) => b[1] - a[1]).slice(0,8).map(x => x[0]);
}

function extractRefs(q: string) {
    const tasks = [...q.matchAll(/#(\d+)|task[-:](\w+)/gi)].map(m => m[1]||m[2]).filter(Boolean);
    const projects = [...q.matchAll(/project[-:](\w+)/gi)].map(m => m[1]);
    const keypoints = [...q.matchAll(/"([^"]+)"/g)].map(m => m[1].slice(0,40));
    return { tasks: [...new Set(tasks)], projects: [...new Set(projects)], keypoints: [...new Set(keypoints)] };
}

function summarize(text: string, max = 400): string {
    if (text.length <= max) return text;
    const s = text.split(/[.!?]+/).filter(x => x.trim().length > 10);
    if (s.length <= 2) return text.slice(0, max) + "...";
    return s[0] + " " + s[s.length-1].slice(0, max - s[0].length - 5) + "...";
}

function combo(user: string, agent: string, prog?: string): string {
    return `## Intent\n${user}\n\n## Response\n${agent}${prog ? `\n\n## Progress\n${prog}` : ''}`;
}

// =============================================
// CORE MEMORY TOOLS (10 essential tools only)
// =============================================

export const memoryTools = [
    // 1. remember - store conversation
    {
        name: "memory_remember",
        description: "Store a conversation. Auto-summarizes and auto-summarizes after N chats.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                projectId: { type: "string" },
                sessionId: { type: "string" },
                userMessage: { type: "string" },
                agentMessage: { type: "string" },
                progress: { type: "string" }
            },
            required: ["userId", "sessionId", "userMessage", "agentMessage"],
        },
        handler: async (args: any) => {
            try {
                const schema = baseSchema.extend({
                    sessionId: z.string().min(1),
                    userMessage: z.string().min(1),
                    agentMessage: z.string().min(1),
                    progress: z.string().optional()
                });
                const { userId, projectId, sessionId, userMessage, agentMessage, progress } = validatePayload(schema, args);
                
                const cfg = getMemoryConfig();
                const refs = extractRefs(userMessage);
                const uSum = summarize(userMessage, cfg.SUMMARY_MAX_LENGTH);
                const aSum = summarize(agentMessage, cfg.SUMMARY_MAX_LENGTH);
                
                const result = addShortTermChat(userId, projectId || null, sessionId, userMessage, agentMessage, uSum, aSum, combo(uSum, aSum, progress), refs.tasks, refs.keypoints, [], refs.projects);
                
                const count = getSessionChatCount(sessionId);
                let note = `✓ Stored [${result.chatIndex}]`;
                
                if (count > 0 && count % cfg.AUTO_SUMMARIZE_AFTER_CHATS === 0) {
                    const recent = getShortTermChats(userId, sessionId, projectId || null, cfg.AUTO_SUMMARIZE_AFTER_CHATS);
                    const allTasks = [...new Set(recent.flatMap(c => JSON.parse(c.referencedTasks||"[]")))];
                    const allKps = [...new Set(recent.flatMap(c => JSON.parse(c.referencedKeypoints||"[]")))];
                    
                    summarizeAndMoveToLongTerm(userId, projectId || null, sessionId, Math.floor(count / cfg.AUTO_SUMMARIZE_AFTER_CHATS), uSum, aSum, combo(uSum, aSum), count, allTasks, allKps, [], []);
                    clearShortTermMemory(userId, sessionId, cfg.MAX_SHORT_TERM_CHATS);
                    note += " → summarized to long-term";
                }
                
                return { content: [{ type: "text", text: note }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 2. recall - find relevant memories
    {
        name: "memory_recall",
        description: "Find relevant memories. Searches short-term first, then long-term, then cross-session.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                projectId: { type: "string" },
                sessionId: { type: "string" },
                query: { type: "string" },
                scope: { type: "string", enum: ["session", "all"], default: "all" }
            },
            required: ["userId", "query"],
        },
        handler: async (args: any) => {
            try {
                const schema = baseSchema.extend({
                    sessionId: z.string().optional(),
                    query: z.string().min(1),
                    scope: z.enum(["session", "all"]).default("all")
                });
                const { userId, projectId, sessionId, query, scope } = validatePayload(schema, args);
                
                const cfg = getMemoryConfig();
                const results: any[] = [];
                
                // Short-term (low threshold)
                const st = searchShortTermMemory(userId, query, scope === "session" ? sessionId : undefined, projectId || null, cfg.SHORT_TERM_THRESHOLD);
                results.push(...st.map(r => ({ ...r, src: "short-term", score: Math.round(r.similarity) })));
                
                // Long-term (high threshold)
                const lt = searchLongTermMemory(userId, query, projectId || null, 50);
                results.push(...lt.map(r => ({ ...r, src: "long-term", score: Math.round(r.similarity) })));
                
                // Cross-session
                if (scope === "all" && sessionId) {
                    const cs = findCrossSessionMemories(userId, sessionId, query, cfg.CROSS_SESSION_THRESHOLD);
                    results.push(...cs.map(r => ({ ...r, src: "cross-session", score: Math.round(r.similarity) })));
                }
                
                if (results.length === 0) return { content: [{ type: "text", text: "No memories found." }] };
                
                // Dedupe and sort
                const seen = new Set();
                const uniq = results.filter(r => { if (seen.has(r.id+r.src)) return false; seen.add(r.id+r.src); return true; });
                uniq.sort((a, b) => b.similarity - a.similarity);
                
                return { content: [{ type: "text", text: JSON.stringify({
                    found: uniq.length,
                    memories: uniq.slice(0,6).map(r => ({
                        from: r.src,
                        score: r.score + '%',
                        user: r.userSummary||r.userQuery?.slice(0,60),
                        agent: r.agentSummary||r.agentResponse?.slice(0,80),
                        tasks: JSON.parse(r.referencedTasks||"[]").slice(0,2)
                    }))
                }, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 3. history - get conversation history
    {
        name: "memory_history",
        description: "Get recent conversation history.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                sessionId: { type: "string" },
                limit: { type: "number", default: 5 }
            },
            required: ["userId", "sessionId"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({ userId: z.string().min(1), sessionId: z.string().min(1), limit: z.number().default(5) });
                const { userId, sessionId, limit } = validatePayload(schema, args);
                
                const chats = getShortTermChats(userId, sessionId, undefined, limit);
                const summaries = getSessionSummaries(userId, sessionId);
                
                return { content: [{ type: "text", text: JSON.stringify({ chats: chats.length, summaries: summaries.length, recent: chats.reverse().map(c => ({ i: c.chatIndex, u: c.userQuery?.slice(0,60), a: c.agentResponse?.slice(0,80) })) }, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 4. context - get optimized LLM context
    {
        name: "memory_context",
        description: "Get token-optimized context for LLM.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                sessionId: { type: "string" },
                maxTokens: { type: "number", default: 6000 }
            },
            required: ["userId", "sessionId"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({ userId: z.string().min(1), sessionId: z.string().min(1), maxTokens: z.number().default(6000) });
                const { userId, sessionId, maxTokens } = validatePayload(schema, args);
                
                const result = getOptimizedContext(userId, sessionId, maxTokens, 3);
                return { content: [{ type: "text", text: JSON.stringify({ tokens: result.tokens, sources: result.summariesUsed+result.chatsUsed, text: result.context.slice(0,300)+"..." }, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 5. boost - adjust memory importance
    {
        name: "memory_boost",
        description: "Boost or reduce memory importance.",
        inputSchema: {
            type: "object",
            properties: {
                memoryId: { type: "string" },
                delta: { type: "number", default: 0.1 }
            },
            required: ["memoryId"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({ memoryId: z.string().min(1), delta: z.number().min(-0.3).max(0.3).default(0.1) });
                const { memoryId, delta } = validatePayload(schema, args);
                
                updateMemoryPriority(memoryId, delta);
                return { content: [{ type: "text", text: `Priority ${delta > 0 ? '+' : ''}${delta}` }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 6. pin - preserve important memory
    {
        name: "memory_pin",
        description: "Pin/unpin a memory.",
        inputSchema: {
            type: "object",
            properties: {
                memoryId: { type: "string" },
                pinned: { type: "boolean", default: true }
            },
            required: ["memoryId"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({ memoryId: z.string().min(1), pinned: z.boolean().default(true) });
                const { memoryId, pinned } = validatePayload(schema, args);
                
                pinMemory(memoryId, pinned);
                return { content: [{ type: "text", text: pinned ? "Pinned" : "Unpinned" }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 7. stats - memory system info
    {
        name: "memory_stats",
        description: "Get memory statistics.",
        inputSchema: {
            type: "object",
            properties: { userId: { type: "string" } },
            required: ["userId"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({ userId: z.string().min(1) });
                const { userId } = validatePayload(schema, args);
                
                const cfg = getMemoryConfig();
                const stats = getLongTermMemoryStats(userId);
                
                return { content: [{ type: "text", text: JSON.stringify({
                    shortTerm: cfg.SHORT_TERM_THRESHOLD + '%',
                    longTerm: cfg.LONG_TERM_THRESHOLD + '%',
                    autoSummarizeAfter: cfg.AUTO_SUMMARIZE_AFTER_CHATS,
                    totalMemories: stats.totalMemories,
                    avgPriority: Math.round((stats.averagePriority||0.5)*100) + '%'
                }, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 8. cleanup - clean old memories
    {
        name: "memory_cleanup",
        description: "Clean up old memories (pinned preserved).",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                daysOld: { type: "number", default: 90 },
                preview: { type: "boolean", default: false }
            },
            required: ["userId"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({ userId: z.string().min(1), daysOld: z.number().default(90), preview: z.boolean().default(false) });
                const { userId, daysOld, preview } = validatePayload(schema, args);
                
                if (preview) {
                    const cutoff = new Date(Date.now() - daysOld*24*60*60*1000).toISOString();
                    const c = db.prepare(`SELECT COUNT(*) as c FROM LongTermMemory WHERE userId = ? AND createdAt < ? AND isPinned = 0`).get(userId, cutoff) as { c: number };
                    return { content: [{ type: "text", text: `Would delete ${c?.c||0}` }] };
                }
                
                const r = cleanupOldMemories(userId, daysOld);
                return { content: [{ type: "text", text: `Deleted ${r.deleted}` }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 9. inspect - view memory details
    {
        name: "memory_inspect",
        description: "View full memory details.",
        inputSchema: {
            type: "object",
            properties: { memoryId: { type: "string" } },
            required: ["memoryId"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({ memoryId: z.string().min(1) });
                const { memoryId } = validatePayload(schema, args);
                
                const m = getMemoryById(memoryId) as any;
                if (!m) return { isError: true, content: [{ type: "text", text: "Not found" }] };
                
                return { content: [{ type: "text", text: JSON.stringify({
                    id: m.id,
                    query: m.userQuery,
                    summary: m.userSummary,
                    response: m.agentSummary,
                    priority: Math.round((m.priority||0.5)*100)+'%',
                    pinned: m.isPinned===1,
                    accesses: m.accessCount,
                    created: m.createdAt
                }, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 10. batch - store multiple conversations
    {
        name: "memory_batch",
        description: "Store multiple conversations at once.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                projectId: { type: "string" },
                sessionId: { type: "string" },
                conversations: { type: "array", items: { type: "object", properties: { user: { type: "string" }, agent: { type: "string" } }, required: ["user","agent"] } }
            },
            required: ["userId", "sessionId", "conversations"],
        },
        handler: async (args: any) => {
            try {
                const schema = baseSchema.extend({
                    sessionId: z.string().min(1),
                    conversations: z.array(z.object({ user: z.string().min(1), agent: z.string().min(1) })).min(1)
                });
                const { userId, projectId, sessionId, conversations } = validatePayload(schema, args);
                
                const cfg = getMemoryConfig();
                for (const c of conversations) {
                    const refs = extractRefs(c.user);
                    addShortTermChat(userId, projectId||null, sessionId, c.user, c.agent, summarize(c.user,cfg.SUMMARY_MAX_LENGTH), summarize(c.agent,cfg.SUMMARY_MAX_LENGTH), combo(summarize(c.user),summarize(c.agent)), refs.tasks, refs.keypoints, [], refs.projects);
                }
                
                return { content: [{ type: "text", text: `Stored ${conversations.length} conversations` }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    }
];