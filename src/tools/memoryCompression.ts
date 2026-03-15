import { z } from "zod";
import { validatePayload, baseSchema } from "./validation.js";
import {
    addShortTermChat, getShortTermChats, getSessionChatCount,
    summarizeAndMoveToLongTerm, searchShortTermMemory, searchLongTermMemory,
    getSessionSummaries, clearShortTermMemory, getOptimizedContext,
    updateMemoryPriority, pinMemory, getMemoryById, getLongTermMemoryStats,
    cleanupOldMemories, findCrossSessionMemories, db, createRelation, getRelations
} from "../db/sqlite.js";
import { getMemoryConfig } from "../utils/env.js";

const STOP_WORDS = new Set(['the','a','an','and','or','but','is','are','was','were','be','been','have','has','had','do','does','did','will','would','could','should','to','of','in','for','on','with','at','by','from','this','that','what','which','who','just','also','now','about']);

const INTENT_TYPES = ['question', 'request', 'command', 'statement', 'error', 'success', 'learning', 'planning'];
const ACTION_WORDS = new Set(['create','update','delete','fix','add','build','deploy','test','merge','review','analyze','implement','refactor','configure','setup','run','push','pull']);

function extractKeywords(text: string): string[] {
    const words = text.toLowerCase().replace(/[^\w\s]/g,' ').split(/\s+/).filter(w => w.length > 3 && !STOP_WORDS.has(w));
    const freq: Record<string, number> = {};
    words.forEach(w => freq[w] = (freq[w] || 0) + 1);
    return Object.entries(freq).sort((a,b) => b[1] - a[1]).slice(0,8).map(x => x[0]);
}

// Smart intent detection
function detectIntent(userMsg: string): string {
    const first = userMsg.toLowerCase().split(/\s+/)[0];
    if (['what','why','how','when','where','who','can','could','would','should','is','are','do','does'].includes(first)) return 'question';
    if (ACTION_WORDS.has(first)) return 'command';
    if (/error|fail|exception|bug/i.test(userMsg)) return 'error';
    if (/success|done|completed|finished/i.test(userMsg)) return 'success';
    if (/learn|realize|discover|understand/i.test(userMsg)) return 'learning';
    if (/plan|will|should|might|consider/i.test(userMsg)) return 'planning';
    return 'statement';
}

// Extract important entities/names
function extractEntities(text: string): string[] {
    const camel = text.match(/[A-Z][a-z]+(?:[A-Z][a-z]+)*/g) || [];
    const numbers = text.match(/#\d+/g) || [];
    return [...camel, ...numbers].slice(0,5).map(x => x.toLowerCase());
}

function extractRefs(q: string) {
    const tasks = [...q.matchAll(/#(\d+)|task[-:](\w+)/gi)].map(m => m[1]||m[2]).filter(Boolean);
    const projects = [...q.matchAll(/project[-:](\w+)/gi)].map(m => m[1]);
    const keypoints = [...q.matchAll(/"([^"]+)"/g)].map(m => m[1].slice(0,40));
    return { tasks: [...new Set(tasks)], projects: [...new Set(projects)], keypoints: [...new Set(keypoints)] };
}

// Smart summary - captures more context
function summarize(text: string, max = 400): string {
    if (text.length <= max) return text;
    const s = text.split(/[.!?]+/).filter(x => x.trim().length > 10);
    if (s.length <= 2) return text.slice(0, max) + "...";
    return s[0] + " " + s[s.length-1].slice(0, max - s[0].length - 5) + "...";
}

// Memory completeness score - how complete is this memory?
function completenessScore(memory: any): number {
    let score = 0;
    const fields = ['userQuery', 'userSummary', 'agentResponse', 'agentSummary', 'combo', 'referencedTasks', 'referencedEntities'];
    fields.forEach(f => {
        if (memory[f] && (typeof memory[f] !== 'string' || memory[f].length > 0)) score++;
    });
    return Math.round((score / fields.length) * 100);
}

// Smart context trimming - preserve important parts when truncating
function smartTrim(context: string, maxChars: number): string {
    if (context.length <= maxChars) return context;
    
    // Try to cut at sentence boundary
    const sentences = context.split(/[.!?]\s+/);
    let result = "";
    for (const s of sentences) {
        if (result.length + s.length + 2 > maxChars) break;
        result += s + ". ";
    }
    
    // If too little, cut at word boundary
    if (result.length < maxChars * 0.5) {
        const words = context.split(/\s+/);
        result = "";
        for (const w of words) {
            if (result.length + w.length + 1 > maxChars) break;
            result += w + " ";
        }
    }
    
    return result.trim() + (result.length < context.length ? "..." : "");
}

// Conversation flow analysis
function analyzeFlow(chats: any[]): { type: string; summary: string; complexity: number } {
    if (!chats.length) return { type: "empty", summary: "No conversation", complexity: 0 };
    
    const intents = chats.map(c => detectIntent(c.userQuery || ''));
    const questionCount = intents.filter(i => i === 'question').length;
    const errorCount = intents.filter(i => i === 'error').length;
    const successCount = intents.filter(i => i === 'success').length;
    
    let type = "general";
    if (errorCount > questionCount && errorCount > 0) type = "debugging";
    else if (questionCount > chats.length * 0.6) type = "learning";
    else if (successCount > 0 && type === "general") type = "progress";
    
    const complexity = Math.min(100, Math.round((intents.filter(i => ['command','planning','learning'].includes(i)).length / Math.max(1, intents.length) * 100)));
    
    const summary = `${chats.length} messages. ${questionCount} questions, ${errorCount} issues, ${successCount} completions.`;
    
    return { type, summary, complexity };
}

// Extract actionable items from memory
function extractActionItems(text: string): string[] {
    const items: string[] = [];
    
    // TODO/FIX/NOTE patterns
    const patterns = [/TODO:\s*(.+)/gi, /FIX:\s*(.+)/gi, /NOTE:\s*(.+)/gi, /ACTION:\s*(.+)/gi];
    patterns.forEach(p => {
        const matches = text.matchAll(p);
        for (const m of matches) items.push(m[1].trim().slice(0, 60));
    });
    
    // Numbered action items
    const numbered = text.match(/^\s*\d+[.)]\s*(.+)$/gm);
    if (numbered) {
        numbered.forEach(n => {
            const clean = n.replace(/^\s*\d+[.)]\s*/, '').trim();
            if (clean.length > 5 && clean.length < 80) items.push(clean);
        });
    }
    
    return [...new Set(items)].slice(0,5);
}

// Find related memories based on entities overlap
function findRelatedByEntities(memory: any, allMemories: any[]): string[] {
    const myEntities = new Set((memory.referencedEntities || []).concat(memory.referencedTasks || []).map((e: string) => e.toLowerCase()));
    if (myEntities.size === 0) return [];
    
    const related: { id: string, overlap: number }[] = [];
    
    allMemories.forEach(m => {
        if (m.id === memory.id) return;
        const theirEntities = new Set((m.referencedEntities || []).concat(m.referencedTasks || []).map((e: string) => e.toLowerCase()));
        
        let overlap = 0;
        myEntities.forEach(e => { if (theirEntities.has(e)) overlap++; });
        
        if (overlap > 0) related.push({ id: m.id, overlap });
    });
    
    return related.sort((a, b) => b.overlap - a.overlap).slice(0, 3).map(r => r.id);
}

// Enhanced combo with intent and key entities
function combo(user: string, agent: string, prog?: string): string {
    const intent = detectIntent(user);
    const entities = extractEntities(user).slice(0,3);
    return `## Intent [${intent}]\n${user}\n\n## Response\n${agent}${prog ? `\n\n## Progress\n${prog}` : ''}${entities.length ? `\n\n## Entities\n${entities.join(', ')}` : ''}`;
}

// Calculate relevance with multiple factors
function calculateRelevance(query: string, memory: any): number {
    const q = query.toLowerCase();
    const m = ((memory.userQuery||'') + ' ' + (memory.userSummary||'') + ' ' + (memory.agentSummary||'')).toLowerCase();
    
    // Exact match bonus
    if (m.includes(q)) return 100;
    
    const qWords = q.split(/\s+/).filter(w => w.length > 2);
    const mWords = m.split(/\s+/).filter(w => w.length > 2);
    
    if (!qWords.length || !mWords.length) return 0;
    
    // Word overlap
    const overlap = qWords.filter(w => m.includes(w)).length;
    const baseScore = (overlap / qWords.length) * 80;
    
    // Position bonus - earlier mentions = more relevant
    const firstMatch = qWords.findIndex(w => m.includes(w));
    const posBonus = firstMatch >= 0 ? Math.max(0, 15 - firstMatch * 2) : 0;
    
    // Intent match bonus
    const memIntent = detectIntent(memory.userQuery||'');
    const queryIntent = detectIntent(query);
    const intentBonus = memIntent === queryIntent ? 10 : 0;
    
    return Math.min(100, baseScore + posBonus + intentBonus);
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
                const entities = extractEntities(userMessage);
                const uSum = summarize(userMessage, cfg.SUMMARY_MAX_LENGTH);
                const aSum = summarize(agentMessage, cfg.SUMMARY_MAX_LENGTH);
                
                const result = addShortTermChat(userId, projectId || null, sessionId, userMessage, agentMessage, uSum, aSum, combo(uSum, aSum, progress), refs.tasks, refs.keypoints, entities, refs.projects);
                
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
                
                // Short-term (low threshold) - use enhanced relevance
                const st = searchShortTermMemory(userId, query, scope === "session" ? sessionId : undefined, projectId || null, cfg.SHORT_TERM_THRESHOLD);
                results.push(...st.map(r => ({ ...r, src: "short-term", score: calculateRelevance(query, r) })));
                
                // Long-term (high threshold) - use enhanced relevance
                const lt = searchLongTermMemory(userId, query, projectId || null, 50);
                results.push(...lt.map(r => ({ ...r, src: "long-term", score: calculateRelevance(query, r) })));
                
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
                const flow = analyzeFlow(chats);
                
                return { content: [{ type: "text", text: JSON.stringify({ 
                    chats: chats.length, 
                    summaries: summaries.length,
                    flow: flow.type,
                    complexity: flow.complexity + '%',
                    summary: flow.summary,
                    recent: chats.reverse().map(c => ({ i: c.chatIndex, u: c.userQuery?.slice(0,60), a: c.agentResponse?.slice(0,80) })) 
                }, null, 2) }] };
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
                
                const completeness = completenessScore(m);
                const actions = extractActionItems((m.userQuery||'') + ' ' + (m.agentResponse||''));
                
                return { content: [{ type: "text", text: JSON.stringify({
                    id: m.id,
                    query: m.userQuery,
                    summary: m.userSummary,
                    response: m.agentSummary,
                    priority: Math.round((m.priority||0.5)*100)+'%',
                    pinned: m.isPinned===1,
                    accesses: m.accessCount,
                    created: m.createdAt,
                    completeness: completeness + '%',
                    actionItems: actions
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
                    const intent = detectIntent(c.user);
                    const entities = extractEntities(c.user);
                    addShortTermChat(userId, projectId||null, sessionId, c.user, c.agent, summarize(c.user,cfg.SUMMARY_MAX_LENGTH), summarize(c.agent,cfg.SUMMARY_MAX_LENGTH), combo(summarize(c.user),summarize(c.agent)), refs.tasks, refs.keypoints, entities, refs.projects);
                }
                
                return { content: [{ type: "text", text: `Stored ${conversations.length} conversations` }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 11. insights - extract key learnings from memory
    {
        name: "memory_insights",
        description: "Extract key learnings, patterns, and insights from memory.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                projectId: { type: "string" },
                focus: { type: "string", enum: ["questions", "errors", "progress", "all"], default: "all" }
            },
            required: ["userId"],
        },
        handler: async (args: any) => {
            try {
                const schema = baseSchema.extend({
                    focus: z.enum(["questions", "errors", "progress", "all"]).default("all")
                });
                const { userId, projectId, focus } = validatePayload(schema, args);
                
                // Get recent long-term memories
                const all = searchLongTermMemory(userId, "", projectId || null, 0);
                const recent = all.slice(0, 50);
                
                const insights: any = { questions: [], errors: [], progress: [], patterns: [] };
                
                recent.forEach((m: any) => {
                    const txt = ((m.userQuery||'') + ' ' + (m.agentResponse||'')).toLowerCase();
                    
                    // Questions asked
                    if (m.userQuery?.match(/^(what|why|how|when|where|who|is|are|can|do)/i)) {
                        insights.questions.push(m.userQuery?.slice(0,80));
                    }
                    
                    // Errors/issues
                    if (/error|fail|bug|issue|problem|exception/i.test(txt)) {
                        const taskMatch = m.userQuery?.match(/#(\d+)/);
                        insights.errors.push({ task: taskMatch?.[1], issue: m.userQuery?.slice(0,60) });
                    }
                    
                    // Progress/completion
                    if (/done|completed|finished|success|fixed|deployed/i.test(txt)) {
                        insights.progress.push(m.userSummary || m.userQuery?.slice(0,60));
                    }
                });
                
                // Find patterns - most common keywords
                const keywordCounts: Record<string, number> = {};
                recent.forEach((m: any) => {
                    const kw = extractKeywords(m.userQuery || '');
                    kw.forEach(k => keywordCounts[k] = (keywordCounts[k] || 0) + 1);
                });
                
                insights.patterns = Object.entries(keywordCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10)
                    .map(([word, count]) => ({ word, mentions: count }));
                
                // Filter based on focus
                if (focus !== "all") {
                    const filtered = { [focus]: insights[focus], patterns: insights.patterns };
                    return { content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }] };
                }
                
                return { content: [{ type: "text", text: JSON.stringify({
                    totalMemories: recent.length,
                    insights
                }, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 12. trim - smart context trimming for LLM
    {
        name: "memory_trim",
        description: "Smart context trimming - preserves important parts when reducing size.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                sessionId: { type: "string" },
                maxChars: { type: "number", default: 3000 }
            },
            required: ["userId", "sessionId"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({ userId: z.string().min(1), sessionId: z.string().min(1), maxChars: z.number().default(3000) });
                const { userId, sessionId, maxChars } = validatePayload(schema, args);
                
                const summaries = getSessionSummaries(userId, sessionId);
                const chats = getShortTermChats(userId, sessionId, undefined, 10);
                
                let context = "## Session Summaries\n";
                summaries.slice(-3).forEach((s: any) => { context += `- ${s.userSummary}\n`; });
                
                context += "\n## Recent Messages\n";
                chats.reverse().forEach((c: any) => {
                    context += `Q: ${smartTrim(c.userQuery||'', 100)}\n`;
                    context += `A: ${smartTrim(c.agentResponse||'', 150)}\n\n`;
                });
                
                const trimmed = smartTrim(context, maxChars);
                
                return { content: [{ type: "text", text: JSON.stringify({
                    original: context.length,
                    trimmed: trimmed.length,
                    ratio: Math.round((1 - trimmed.length/context.length) * 100) + '%',
                    text: trimmed
                }, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    }
];