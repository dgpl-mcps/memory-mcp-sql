import { z } from "zod";
import { validatePayload, baseSchema } from "./validation.js";
import { getMemoryConfig } from "../utils/env.js";
import {
    addShortTermChat, getShortTermChats, getSessionChatCount,
    summarizeAndMoveToLongTerm, searchShortTermMemory, searchLongTermMemory,
    getSessionSummaries, clearShortTermMemory, getOptimizedContext,
    updateMemoryPriority, pinMemory, getMemoryById, getLongTermMemoryStats,
    cleanupOldMemories, findCrossSessionMemories, db, createRelation, getRelations,
    findDuplicateMemories, mergeDuplicateMemories, linkMemoryToSession,
    setMemoryTTL, removeMemoryTTL, cleanupExpiredMemories, getExpiringMemories,
    searchMemoriesByDate, addMemoryTags, removeMemoryTags, searchMemoriesByTag, getMemoryTags,
    voteMemory, getMemoryVotes, getMemoryVersions, bulkUpdatePriority, bulkAddTags,
    bulkDelete, bulkPin, updateMemoryQuality, getHighQualityMemories, calculateQualityScore,
    archiveMemory, unarchiveMemory, getArchivedMemories, createReminder, getPendingReminders,
    completeReminder, deleteReminder, getUpcomingReminders, mergeMemories
} from "../db/sqlite.js";

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

// Extract important entities/names (enhanced with URLs, emails, file paths)
function extractEntities(text: string): string[] {
    const camel = text.match(/[A-Z][a-z]+(?:[A-Z][a-z]+)*/g) || [];
    const numbers = text.match(/#\d+/g) || [];
    const urls = text.match(/https?:\/\/[^\s]+/g) || [];
    const emails = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    const files = text.match(/(?:\/|\\)[a-zA-Z0-9_\-\.]+\.[a-zA-Z]{1,6}/g) || [];
    return [...camel, ...numbers, ...urls.slice(0,2), ...emails.slice(0,2), ...files.slice(0,2)].slice(0,8).map(x => x.toLowerCase());
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
    const fields = ['content', 'summary', 'response', 'responseSummary', 'combo', 'referencedTasks', 'referencedEntities'];
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
    
    const intents = chats.map(c => detectIntent(c.content || ''));
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

// Memory freshness score - recency + time decay
function freshnessScore(createdAt: string, lastAccessed: string | null, decayDays: number = 30): number {
    const created = new Date(createdAt).getTime();
    const accessed = lastAccessed ? new Date(lastAccessed).getTime() : created;
    const now = Date.now();
    
    const ageHours = (now - created) / (1000 * 60 * 60);
    const accessedHours = (now - accessed) / (1000 * 60 * 60);
    
    // Base freshness from creation (decay over 30 days)
    const ageScore = Math.max(10, 100 - (ageHours / (decayDays * 24) * 100));
    
    // Access bonus - recently accessed = more relevant
    const accessBonus = accessedHours < 24 ? 20 : accessedHours < 168 ? 10 : 0;
    
    return Math.min(100, Math.round(ageScore + accessBonus));
}

// Query expansion - add related terms for better recall
function expandQuery(query: string): string[] {
    const expansions: Record<string, string[]> = {
        'fix': ['bug', 'error', 'issue', 'problem'],
        'create': ['add', 'new', 'build', 'implement'],
        'update': ['change', 'modify', 'edit', 'refactor'],
        'delete': ['remove', 'clear', 'drop', 'clean'],
        'deploy': ['release', 'push', 'ship', 'publish'],
        'test': ['verify', 'check', 'validate', 'QA'],
        'debug': ['troubleshoot', 'error', 'issue', 'problem'],
        'review': ['check', 'examine', 'audit', 'inspect'],
        'question': ['how', 'what', 'why', 'when', 'where'],
        'learn': ['understand', 'discover', 'figure', 'explore']
    };
    
    const queryLower = query.toLowerCase();
    const expanded = [query];
    
    Object.entries(expansions).forEach(([term, synonyms]) => {
        if (queryLower.includes(term)) {
            expanded.push(...synonyms);
        }
    });
    
    return [...new Set(expanded)];
}

// Suggest follow-up queries based on history
function suggestQueries(recentQueries: string[]): string[] {
    const suggestions: string[] = [];
    
    recentQueries.forEach(q => {
        const lower = q.toLowerCase();
        
        // If asked about error, suggest fixes
        if (/error|bug|issue|problem/i.test(lower)) {
            suggestions.push('how to fix', 'solution for', 'debug steps');
        }
        
        // If asked about creation, suggest next steps
        if (/create|add|new build/i.test(lower)) {
            suggestions.push('next steps', 'how to test', 'deployment');
        }
        
        // If asked about project, suggest status
        if (/project|progress|status/i.test(lower)) {
            suggestions.push('update', 'completion', 'timeline');
        }
    });
    
    return [...new Set(suggestions)].slice(0, 5);
}

// Weighted priority - combines freshness + usage + manual priority
function weightedPriority(memory: any): number {
    const freshness = freshnessScore(memory.createdAt, memory.lastAccessedAt);
    const usage = Math.min(30, (memory.accessCount || 1) * 5); // Up to 30% from usage
    const manual = (memory.priority || 0.5) * 30; // Up to 30% manual
    
    return Math.round(freshness * 0.4 + usage + manual);
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
    const m = ((memory.content||'') + ' ' + (memory.summary||'') + ' ' + (memory.responseSummary||'')).toLowerCase();
    
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
    const memIntent = detectIntent(memory.content||'');
    const queryIntent = detectIntent(query);
    const intentBonus = memIntent === queryIntent ? 10 : 0;
    
    return Math.min(100, baseScore + posBonus + intentBonus);
}

// Levenshtein distance for fuzzy matching
function levenshtein(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

// =============================================
// CORE MEMORY TOOLS (10 essential tools only)
// =============================================

export const memoryTools = [
    // =============================================
    // CORE MEMORY TOOLS
    // =============================================
    // Memory Flow: remember → recall → context
    // Auto-features: summarization, deduplication, linking
    // Storage: ShortTermChat → LongTermMemory (after N chats)
    // =============================================
    
    // 1. remember - store conversation
    {
        name: "memory_remember",
        description: `## Store Conversation (Remember)

**Purpose:** Save a conversation turn (user message + agent response) to memory.

**Auto-Features:**
- Extracts entities, tasks, keypoints from message
- Links to knowledge graph entities
- Auto-deduplicates every 10th chat
- Auto-summarizes after N chats (config: AUTO_SUMMARIZE_AFTER_CHATS)
- Moves to long-term memory after summarization

**Use Cases:**
- Storing important conversations
- Capturing decisions and answers
- Saving user requests and responses

**Tool Chaining:**
- After: Often followed by memory_recall to verify
- Can chain: memory_context for optimized prompt

**Keywords:** remember, store, save, conversation, chat, message, note

**Example:**
\`\`\`json
{
  "userId": "nandini",
  "sessionId": "morning-chat-001",
  "userMessage": "What did we discuss about the API deadline?",
  "agentMessage": "We agreed on Friday March 21st for the API delivery.",
  "progress": "API milestone set"
}
\`\`\``,
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

                // Auto-link to related entities in knowledge graph
                if (entities.length > 0 && refs.tasks.length > 0) {
                    try {
                        const allEntities = db.prepare(`SELECT id, name FROM Entities WHERE userId = ?`).all(userId) as any[];
                        entities.forEach((entity: string) => {
                            const matched = allEntities.find((e: any) => e.name.toLowerCase() === entity.toLowerCase());
                            if (matched) {
                                refs.tasks.forEach((taskId: string) => {
                                    createRelation(userId, projectId || '', matched.id, taskId, 'mentioned_in', { sessionId, chatIndex: result.chatIndex });
                                });
                            }
                        });
                    } catch (e) { /* ignore graph errors */ }
                }

                // Auto-deduplicate check on long-term memories (every 10th chat)
                if (count > 0 && count % 10 === 0) {
                    try {
                        const dups = findDuplicateMemories(userId, 85);
                        if (dups.length > 0) {
                            dups.forEach((d: any) => mergeDuplicateMemories(d.original, d.duplicate));
                            note += ` | merged ${dups.length} duplicates`;
                        }
                    } catch (e) { /* ignore dedup errors */ }
                }
                
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
        description: `## Search Memories (Recall)

**Purpose:** Find relevant memories across all memory sources using semantic search.

**Search Order:**
1. **Short-term memory** - Recent conversations (threshold: 20%)
2. **Long-term memory** - Summarized memories (threshold: 75%)
3. **Cross-session** - Related sessions (if scope=all)

**Query Expansion:** Automatically expands queries (e.g., "fix" → "fix bug error issue problem")

**Use Cases:**
- Finding information from past conversations
- Answering "what did we discuss about X?"
- Recalling decisions or agreements

**Tool Chaining:**
- Often followed by: memory_inspect for full details
- Can chain: memory_context for LLM-optimized context

**Keywords:** recall, remember, find, search, query, memory, past, previous, discussed

**Example:**
\`\`\`json
{
  "userId": "nandini",
  "query": "API deadline",
  "scope": "all",
  "limit": 10,
  "confidenceThreshold": 20
}
\`\`\``,
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                projectId: { type: "string" },
                sessionId: { type: "string" },
                query: { type: "string" },
                scope: { type: "string", enum: ["session", "all"], default: "all" },
                limit: { type: "number", description: "Max results per source (default from env: 10)" },
                offset: { type: "number", description: "Pagination offset (default from env: 0)" },
                confidenceThreshold: { type: "number", description: "Min confidence score (default from env: 20)" }
            },
            required: ["userId", "query"],
        },
        handler: async (args: any) => {
            try {
                const cfg = getMemoryConfig();
                const limit = args.limit ?? cfg.DEFAULT_SEARCH_LIMIT;
                const offset = args.offset ?? cfg.DEFAULT_SEARCH_OFFSET;
                const threshold = args.confidenceThreshold ?? cfg.DEFAULT_CONFIDENCE_THRESHOLD;
                
                const schema = baseSchema.extend({
                    sessionId: z.string().optional(),
                    query: z.string().min(1),
                    scope: z.enum(["session", "all"]).default("all")
                });
                const { userId, projectId, sessionId, query, scope } = validatePayload(schema, args);
                
                const results: any[] = [];

                // Use query expansion for better recall
                const expandedQueries = expandQuery(query);
                
                // Short-term (low threshold)
                for (const q of expandedQueries.slice(0, 3)) {
                    const st = searchShortTermMemory(userId, q, scope === "session" ? sessionId : undefined, projectId || null, threshold, limit, offset);
                    results.push(...st.map(r => ({ ...r, src: "short-term", score: calculateRelevance(query, r), queryUsed: q })));
                }
                
                // Long-term (high threshold)
                for (const q of expandedQueries.slice(0, 3)) {
                    const lt = searchLongTermMemory(userId, q, projectId || null, limit);
                    results.push(...lt.map(r => ({ ...r, src: "long-term", score: calculateRelevance(query, r), queryUsed: q })));
                }
                
                // Cross-session
                if (scope === "all" && sessionId) {
                    for (const q of expandedQueries.slice(0, 2)) {
                        const cs = findCrossSessionMemories(userId, sessionId, q, threshold);
                        results.push(...cs.map(r => ({ ...r, src: "cross-session", score: Math.round(r.similarity), queryUsed: q })));
                    }
                }

                return { content: [{ type: "text", text: JSON.stringify({
                    results: results.slice(0, limit),
                    search_context: { limit, offset, confidenceThreshold: threshold, scope, source: "memory_recall" }
                }, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 3. history - get conversation history
    {
        name: "memory_history",
        description: `## Get Conversation History

**Purpose:** Retrieve raw conversation history for a session with flow analysis.

**Returns:**
- Chat count and summaries count
- Flow analysis (question, command, debugging, learning, progress)
- Complexity score
- Recent messages preview

**Use Cases:**
- Reviewing what was discussed
- Getting context before answering
- Understanding conversation structure

**Keywords:** history, conversation, past, messages, session, review, earlier

**Example:**
\`\`\`json
{
  "userId": "nandini",
  "sessionId": "morning-chat-001",
  "limit": 10
}
\`\`\``,
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                sessionId: { type: "string" },
                limit: { type: "number", description: "Max results (default from env: 10)" },
                offset: { type: "number", description: "Pagination offset (default from env: 0)" }
            },
            required: ["userId", "sessionId"],
        },
        handler: async (args: any) => {
            try {
                const cfg = getMemoryConfig();
                const limit = args.limit ?? cfg.DEFAULT_SEARCH_LIMIT;
                const offset = args.offset ?? cfg.DEFAULT_SEARCH_OFFSET;
                
                const schema = z.object({ userId: z.string().min(1), sessionId: z.string().min(1) });
                const { userId, sessionId } = validatePayload(schema, args);
                
                const chats = getShortTermChats(userId, sessionId, undefined, limit);
                const summaries = getSessionSummaries(userId, sessionId);
                const flow = analyzeFlow(chats);
                
                return { content: [{ type: "text", text: JSON.stringify({ 
                    chats: chats.length, 
                    summaries: summaries.length,
                    flow: flow.type,
                    complexity: flow.complexity + '%',
                    summary: flow.summary,
                    recent: chats.reverse().map(c => ({ i: c.chatIndex, u: c.content?.slice(0,60), a: c.response?.slice(0,80) })),
                    search_context: { limit, offset, source: "memory_history" }
                }, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 4. context - get optimized LLM context
    {
        name: "memory_context",
        description: `## Get LLM-Optimized Context

**Purpose:** Get token-optimized context ready for LLM consumption.

**Features:**
- Smart truncation preserving important parts
- Combines summaries + recent chats
- Token-limited output (default 6000)

**Use Cases:**
- Before generating LLM response
- Context for new conversation turn
- Summarizing session for context

**Keywords:** context, prompt, LLM, token, optimize, ready, prepare

**Example:**
\`\`\`json
{
  "userId": "nandini",
  "sessionId": "morning-chat-001",
  "maxTokens": 6000
}
\`\`\``,
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                sessionId: { type: "string" },
                maxTokens: { type: "number", description: "Max tokens (default: 6000)" },
                limit: { type: "number", description: "Max memories to include (default from env: 10)" }
            },
            required: ["userId", "sessionId"],
        },
        handler: async (args: any) => {
            try {
                const cfg = getMemoryConfig();
                const limit = args.limit ?? cfg.DEFAULT_SEARCH_LIMIT;
                const schema = z.object({ 
                    userId: z.string().min(1), 
                    sessionId: z.string().min(1), 
                    maxTokens: z.number().default(6000) 
                });
                const { userId, sessionId, maxTokens } = validatePayload(schema, args);
                
                const result = getOptimizedContext(userId, sessionId, maxTokens, 3);
                return { content: [{ type: "text", text: JSON.stringify({ 
                    tokens: result.tokens, 
                    sources: result.summariesUsed+result.chatsUsed, 
                    text: result.context.slice(0,300)+"...",
                    search_context: { maxTokens, limit, source: "memory_context" }
                }, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 5. boost - adjust memory importance
    {
        name: "memory_boost",
        description: `## Boost Memory Importance

**Purpose:** Adjust memory priority up or down to influence recall.

**Delta Range:** -0.3 to +0.3 (default: +0.1)

**Use Cases:**
- Marking important decisions as high priority
- Demoting less relevant memories
- Influencing which memories get recalled first

**Keywords:** boost, priority, importance, weight, enhance

**Example:**
\`\`\`json
{
  "memoryId": "mem_abc123",
  "delta": 0.2
}
\`\`\``,
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
        description: `## Pin/Unpin Memory

**Purpose:** Pin important memories to prevent deletion and ensure recall.

**Pinned Memories:**
- Never auto-deleted during cleanup
- Always included in context
- Protected from TTL expiration

**Use Cases:**
- Preserving critical decisions
- Keeping important learnings
- Protecting key information

**Keywords:** pin, unpin, preserve, protect, important, sticky, star

**Example:**
\`\`\`json
{
  "memoryId": "mem_abc123",
  "pinned": true
}
\`\`\``,
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
        description: `## Get Memory Statistics

**Purpose:** View memory system configuration and statistics.

**Returns:**
- Short-term threshold (default: 20%)
- Long-term threshold (default: 75%)
- Auto-summarize interval
- Total memories count
- Average priority

**Use Cases:**
- Checking memory health
- Understanding recall behavior
- System diagnostics

**Keywords:** stats, statistics, info, system, health, diagnostics

**Example:**
\`\`\`json
{
  "userId": "nandini"
}
\`\`\``,
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
        description: `## Clean Up Old Memories

**Purpose:** Delete memories older than specified days (pinned preserved).

**Safety Features:**
- Preview mode available (preview: true)
- Pinned memories are NEVER deleted
- Only affects LongTermMemory

**Use Cases:**
- Periodic maintenance
- Freeing up storage
- Removing stale information

**Keywords:** cleanup, delete, remove, old, stale, purge, maintain

**Example - Preview:**
\`\`\`json
{
  "userId": "nandini",
  "daysOld": 90,
  "preview": true
}
\`\`\`

**Example - Execute:**
\`\`\`json
{
  "userId": "nandini",
  "daysOld": 90,
  "preview": false
}
\`\`\``,
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
        description: `## Inspect Memory Details

**Purpose:** View full details of a specific memory including completeness score.

**Returns:**
- Full content and summary
- Priority percentage
- Pin status
- Access count
- Completeness score (how rich the memory is)
- Extracted action items (TODO, FIXME, NOTE patterns)

**Use Cases:**
- Verifying stored memory
- Checking memory quality
- Extracting action items

**Keywords:** inspect, view, details, check, examine, full

**Example:**
\`\`\`json
{
  "memoryId": "mem_abc123"
}
\`\`\``,
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
                const actions = extractActionItems((m.content||'') + ' ' + (m.response||''));
                
                return { content: [{ type: "text", text: JSON.stringify({
                    id: m.id,
                    query: m.content,
                    summary: m.summary,
                    response: m.responseSummary,
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
        description: `## Batch Store Conversations

**Purpose:** Store multiple conversation turns at once efficiently.

**Use Cases:**
- Importing conversation history
- Bulk saving
- Migration from other systems

**Keywords:** batch, bulk, multiple, import, store, many

**Example:**
\`\`\`json
{
  "userId": "nandini",
  "sessionId": "morning-chat-001",
  "conversations": [
    {"user": "Hello", "agent": "Hi there!"},
    {"user": "How are you?", "agent": "I'm doing well."},
    {"user": "What can you do?", "agent": "I can help with tasks, memories, and more."}
  ]
}
\`\`\``,
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
        description: `## Extract Insights from Memory

**Purpose:** Analyze memories to extract learnings, patterns, and key information.

**Focus Options:**
| Focus | Returns |
|-------|---------|
| questions | All questions asked |
| errors | Errors and issues encountered |
| progress | Completed items and successes |
| all | Everything combined |

**Analysis Includes:**
- Question patterns
- Error tracking
- Progress/completion tracking
- Top keywords/frequency

**Use Cases:**
- Understanding what you work on most
- Finding recurring issues
- Reviewing completed work

**Keywords:** insights, learnings, patterns, analyze, extract, summarize

**Example:**
\`\`\`json
{
  "userId": "nandini",
  "focus": "all"
}
\`\`\``,
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
                    const txt = ((m.content||'') + ' ' + (m.response||'')).toLowerCase();
                    
                    // Questions asked
                    if (m.content?.match(/^(what|why|how|when|where|who|is|are|can|do)/i)) {
                        insights.questions.push(m.content?.slice(0,80));
                    }
                    
                    // Errors/issues
                    if (/error|fail|bug|issue|problem|exception/i.test(txt)) {
                        const taskMatch = m.content?.match(/#(\d+)/);
                        insights.errors.push({ task: taskMatch?.[1], issue: m.content?.slice(0,60) });
                    }
                    
                    // Progress/completion
                    if (/done|completed|finished|success|fixed|deployed/i.test(txt)) {
                        insights.progress.push(m.summary || m.content?.slice(0,60));
                    }
                });
                
                // Find patterns - most common keywords
                const keywordCounts: Record<string, number> = {};
                recent.forEach((m: any) => {
                    const kw = extractKeywords(m.content || '');
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
        description: `## Smart Context Trimming

**Purpose:** Reduce context size while preserving important parts.

**Smart Trimming:**
- Cuts at sentence boundaries when possible
- Falls back to word boundaries if needed
- Preserves summaries + recent messages

**Use Cases:**
- Freeing up context window
- Creating concise prompts
- Summarizing for external use

**Keywords:** trim, reduce, shorten, compress, context, concise

**Example:**
\`\`\`json
{
  "userId": "nandini",
  "sessionId": "morning-chat-001",
  "maxChars": 3000
}
\`\`\``,
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
                summaries.slice(-3).forEach((s: any) => { context += `- ${s.summary}\n`; });
                
                context += "\n## Recent Messages\n";
                chats.reverse().forEach((c: any) => {
                    context += `Q: ${smartTrim(c.content||'', 100)}\n`;
                    context += `A: ${smartTrim(c.response||'', 150)}\n\n`;
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
    },

    // 13. analytics - session-level analytics and insights
    {
        name: "memory_analytics",
        description: `## Get Memory Analytics

**Purpose:** Analyze conversation patterns and session metrics.

**Analytics Includes:**
- Intent breakdown (questions, commands, errors, etc.)
- Top keywords/topics
- Top entities mentioned
- Estimated session duration
- Completion rate (commands → success)
- Question ratio

**Use Cases:**
- Understanding conversation patterns
- Measuring productivity
- Identifying focus areas

**Keywords:** analytics, metrics, stats, patterns, analysis, productivity

**Example:**
\`\`\`json
{
  "userId": "nandini",
  "days": 7
}
\`\`\``,
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                sessionId: { type: "string" },
                days: { type: "number", default: 7 }
            },
            required: ["userId"],
        },
        handler: async (args: any) => {
            try {
                const schema = baseSchema.extend({
                    sessionId: z.string().optional(),
                    days: z.number().default(7)
                });
                const { userId, sessionId, days } = validatePayload(schema, args);

                const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
                
                // Get chats for analysis
                let chats: any[] = [];
                if (sessionId) {
                    chats = getShortTermChats(userId, sessionId, undefined, 100);
                } else {
                    const allChats = db.prepare(`SELECT * FROM ShortTermChat WHERE userId = ? AND createdAt > ? ORDER BY createdAt DESC LIMIT 100`).all(userId, cutoff) as any[];
                    chats = allChats;
                }

                if (chats.length === 0) {
                    return { content: [{ type: "text", text: JSON.stringify({ message: "No session data found", chats: 0 }, null, 2) }] };
                }

                // Analyze intents
                const intents = chats.map(c => detectIntent(c.content || ''));
                const intentCounts: Record<string, number> = {};
                intents.forEach(i => intentCounts[i] = (intentCounts[i] || 0) + 1);

                // Extract top keywords
                const allText = chats.map(c => c.content + ' ' + c.response).join(' ');
                const keywords = extractKeywords(allText).slice(0, 10);

                // Calculate topics (entity clusters)
                const entities = chats.flatMap(c => {
                    try { return JSON.parse(c.referencedEntities || "[]"); } catch { return []; }
                });
                const entityCounts: Record<string, number> = {};
                entities.forEach(e => entityCounts[e.toLowerCase()] = (entityCounts[e.toLowerCase()] || 0) + 1);
                const topEntities = Object.entries(entityCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([e, c]) => ({ entity: e, count: c }));

                // Session duration estimate
                const firstChat = chats[chats.length - 1];
                const lastChat = chats[0];
                const durationMins = firstChat && lastChat ? Math.round(((new Date(lastChat.createdAt).getTime() || 0) - (new Date(firstChat.createdAt).getTime() || 0)) / 60000) : 0;

                // Completion metrics
                const successCount = intents.filter(i => i === 'success').length;
                const commandCount = intents.filter(i => i === 'command').length;

                return { content: [{ type: "text", text: JSON.stringify({
                    period: { days, chats: chats.length },
                    intentBreakdown: intentCounts,
                    topKeywords: keywords,
                    topEntities,
                    estimatedDuration: durationMins + ' mins',
                    completionRate: commandCount > 0 ? Math.round((successCount / commandCount) * 100) + '%' : 'N/A',
                    questionRatio: Math.round((intentCounts['question'] || 0) / chats.length * 100) + '%'
                }, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 14. export - export memories to JSON
    {
        name: "memory_export",
        description: `## Export Memories

**Purpose:** Export all memories to JSON for backup or migration.

**Exports:**
- Long-term memories (with keywords, entities, priority)
- Session summaries
- Short-term chats (optional)

**Use Cases:**
- Backing up memories
- Migrating to new system
- Sharing memories with another user

**Keywords:** export, backup, save, JSON, migrate, download

**Example:**
\`\`\`json
{
  "userId": "nandini",
  "includeShortTerm": true,
  "limit": 100
}
\`\`\``,
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                projectId: { type: "string" },
                includeShortTerm: { type: "boolean", default: false },
                limit: { type: "number", default: 100 }
            },
            required: ["userId"],
        },
        handler: async (args: any) => {
            try {
                const schema = baseSchema.extend({
                    includeShortTerm: z.boolean().default(false),
                    limit: z.number().default(100)
                });
                const { userId, projectId, includeShortTerm, limit } = validatePayload(schema, args);

                const longTerm = db.prepare(`SELECT * FROM LongTermMemory WHERE userId = ? ORDER BY createdAt DESC LIMIT ?`).all(userId, limit) as any[];
                const summaries = db.prepare(`SELECT * FROM SessionSummary WHERE userId = ? ORDER BY createdAt DESC LIMIT 20`).all(userId) as any[];
                
                let shortTerm: any[] = [];
                if (includeShortTerm) {
                    shortTerm = db.prepare(`SELECT * FROM ShortTermChat WHERE userId = ? ORDER BY createdAt DESC LIMIT ?`).all(userId, limit) as any[];
                }

                const exportData = {
                    exportedAt: new Date().toISOString(),
                    userId,
                    projectId: projectId || null,
                    longTermMemoryCount: longTerm.length,
                    sessionSummariesCount: summaries.length,
                    shortTermChatsCount: shortTerm.length,
                    longTermMemories: longTerm.map(m => ({
                        id: m.id,
                        query: m.content,
                        summary: m.summary,
                        response: m.responseSummary,
                        keywords: (() => { try { return JSON.parse(m.keywords||"[]"); } catch { return []; } })(),
                        entities: (() => { try { return JSON.parse(m.entities||"[]"); } catch { return []; } })(),
                        priority: m.priority,
                        pinned: m.isPinned === 1,
                        createdAt: m.createdAt
                    })),
                    sessionSummaries: summaries.map(s => ({
                        id: s.id,
                        sessionId: s.sessionId,
                        summary: s.summary,
                        chatCount: s.chatCount,
                        createdAt: s.createdAt
                    })),
                    shortTermChats: shortTerm.map(c => ({
                        id: c.id,
                        sessionId: c.sessionId,
                        query: c.content,
                        response: c.response,
                        createdAt: c.createdAt
                    }))
                };

                return { content: [{ type: "text", text: JSON.stringify(exportData, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 15. import - import memories from JSON
    {
        name: "memory_import",
        description: `## Import Memories

**Purpose:** Import memories from JSON export to restore or merge.

**Imports:**
- Long-term memories
- Session summaries

**Use Cases:**
- Restoring from backup
- Merging memories from another system
- Cross-user memory transfer

**Keywords:** import, restore, merge, upload, load

**Example:**
\`\`\`json
{
  "userId": "nandini",
  "projectId": "new-project",
  "importData": "{\"longTermMemories\":[...],\"sessionSummaries\":[...]}"
}
\`\`\``,
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                projectId: { type: "string" },
                importData: { type: "string", description: "JSON string from memory_export" }
            },
            required: ["userId", "importData"],
        },
        handler: async (args: any) => {
            try {
                const schema = baseSchema.extend({
                    importData: z.string().min(10)
                });
                const { userId, projectId, importData } = validatePayload(schema, args);

                const data = JSON.parse(importData);
                let imported = { longTerm: 0, summaries: 0, shortTerm: 0 };

                // Import long-term memories
                if (data.longTermMemories && Array.isArray(data.longTermMemories)) {
                    for (const m of data.longTermMemories) {
                        try {
                            const id = `ltm_imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                            db.prepare(`INSERT INTO LongTermMemory 
                                (id, userId, projectId, content, summary, response, responseSummary, combo, keywords, entities, priority, isPinned, createdAt) 
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                                .run(id, userId, projectId || null, m.query, m.summary, m.response || '', m.summary || '', '', 
                                    JSON.stringify(m.keywords || []), JSON.stringify(m.entities || []), m.priority || 0.5, m.pinned ? 1 : 0, m.createdAt || new Date().toISOString());
                            imported.longTerm++;
                        } catch (e) { /* skip duplicates */ }
                    }
                }

                // Import session summaries
                if (data.sessionSummaries && Array.isArray(data.sessionSummaries)) {
                    for (const s of data.sessionSummaries) {
                        try {
                            const id = `ss_imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                            db.prepare(`INSERT INTO SessionSummary 
                                (id, userId, projectId, sessionId, summaryIndex, summary, responseSummary, combo, chatCount, createdAt) 
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                                .run(id, userId, projectId || null, s.sessionId || 'imported', 0, s.summary, '', '', s.chatCount || 0, s.createdAt || new Date().toISOString());
                            imported.summaries++;
                        } catch (e) { /* skip */ }
                    }
                }

                return { content: [{ type: "text", text: JSON.stringify({ success: true, imported }, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 16. link - link related conversations/threads
    {
        name: "memory_link",
        description: `## Link Memories

**Purpose:** Create explicit relationships between memories for better recall.

**Relationship Types:**
| Type | Meaning |
|------|---------|
| related | General connection |
| follows | Memory A follows from B |
| supersedes | Memory A replaces B |
| references | Memory A references B |

**Use Cases:**
- Creating conversation threads
- Linking related discussions
- Building memory connections

**Keywords:** link, connect, relate, thread, relationship

**Example:**
\`\`\`json
{
  "memoryId1": "mem_abc123",
  "memoryId2": "mem_def456",
  "relationship": "follows"
}
\`\`\``,
        inputSchema: {
            type: "object",
            properties: {
                memoryId1: { type: "string" },
                memoryId2: { type: "string" },
                relationship: { type: "string", enum: ["related", "follows", "supersedes", "references"], default: "related" }
            },
            required: ["memoryId1", "memoryId2"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({
                    memoryId1: z.string().min(1),
                    memoryId2: z.string().min(1),
                    relationship: z.enum(["related", "follows", "supersedes", "references"]).default("related")
                });
                const { memoryId1, memoryId2, relationship } = validatePayload(schema, args);

                // Store as linked session (reuse existing field)
                const m1 = db.prepare(`SELECT linkedSessions FROM LongTermMemory WHERE id = ?`).get(memoryId1) as any;
                const m2 = db.prepare(`SELECT linkedSessions FROM LongTermMemory WHERE id = ?`).get(memoryId2) as any;

                if (!m1 && !m2) return { isError: true, content: [{ type: "text", text: "One or both memories not found" }] };

                if (m1) {
                    const sessions = JSON.parse(m1.linkedSessions || "[]");
                    if (!sessions.includes(memoryId2)) {
                        sessions.push(`${relationship}:${memoryId2}`);
                        db.prepare(`UPDATE LongTermMemory SET linkedSessions = ? WHERE id = ?`).run(JSON.stringify(sessions), memoryId1);
                    }
                }
                if (m2) {
                    const sessions = JSON.parse(m2.linkedSessions || "[]");
                    if (!sessions.includes(memoryId1)) {
                        sessions.push(`related:${memoryId1}`);
                        db.prepare(`UPDATE LongTermMemory SET linkedSessions = ? WHERE id = ?`).run(JSON.stringify(sessions), memoryId2);
                    }
                }

                return { content: [{ type: "text", text: `Linked ${memoryId1.slice(0,8)} ↔ ${memoryId2.slice(0,8)} as ${relationship}` }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 17. set_ttl - set expiration on memory
    {
        name: "memory_set_ttl",
        description: "Set time-to-live (expiration) on a memory. Pinned memories won't expire.",
        inputSchema: {
            type: "object",
            properties: {
                memoryId: { type: "string" },
                daysToLive: { type: "number", description: "Days until expiration. Use 0 to remove TTL." }
            },
            required: ["memoryId", "daysToLive"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({
                    memoryId: z.string().min(1),
                    daysToLive: z.number().min(0).max(365)
                });
                const { memoryId, daysToLive } = validatePayload(schema, args);

                if (daysToLive === 0) {
                    removeMemoryTTL(memoryId);
                    return { content: [{ type: "text", text: "TTL removed (never expires)" }] };
                }

                const result = setMemoryTTL(memoryId, daysToLive);
                return { content: [{ type: "text", text: `Set TTL: ${daysToLive} days (expires ${new Date(result.expiresAt).toLocaleDateString()})` }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 18. search_by_date - search memories by date range
    {
        name: "memory_search_by_date",
        description: "Search memories within a date range. Useful for timeline review.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                startDate: { type: "string", description: "ISO date string (e.g., 2024-01-01)" },
                endDate: { type: "string", description: "ISO date string (e.g., 2024-12-31)" },
                limit: { type: "number", description: "Max results (default from env: 10)" },
                offset: { type: "number", description: "Pagination offset (default from env: 0)" }
            },
            required: ["userId", "startDate", "endDate"],
        },
        handler: async (args: any) => {
            try {
                const cfg = getMemoryConfig();
                const limit = args.limit ?? cfg.DEFAULT_SEARCH_LIMIT;
                const offset = args.offset ?? cfg.DEFAULT_SEARCH_OFFSET;
                
                const schema = baseSchema.extend({
                    startDate: z.string().min(1),
                    endDate: z.string().min(1),
                });
                const { userId, startDate, endDate } = validatePayload(schema, args);

                const results = searchMemoriesByDate(userId, startDate, endDate, limit + offset);
                
                return { content: [{ type: "text", text: JSON.stringify({
                    count: results.length,
                    memories: results.slice(offset, offset + limit).map((r: any) => ({
                        id: r.id,
                        query: r.content?.slice(0,60),
                        summary: r.summary?.slice(0,80),
                        created: r.createdAt,
                        priority: Math.round((r.priority||0.5)*100)+'%'
                    })),
                    search_context: { limit, offset, source: "memory_search_by_date" }
                }, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 19. tag - add/remove tags on memory
    {
        name: "memory_tag",
        description: "Add or remove tags on a memory. Tags help organize and filter memories.",
        inputSchema: {
            type: "object",
            properties: {
                memoryId: { type: "string" },
                tags: { type: "array", items: { type: "string" }, description: "Tags to add or remove" },
                action: { type: "string", enum: ["add", "remove"], default: "add" }
            },
            required: ["memoryId", "tags"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({
                    memoryId: z.string().min(1),
                    tags: z.array(z.string()).min(1),
                    action: z.enum(["add", "remove"]).default("add")
                });
                const { memoryId, tags, action } = validatePayload(schema, args);

                const result = action === "add" 
                    ? addMemoryTags(memoryId, tags)
                    : removeMemoryTags(memoryId, tags);

                if (!result.success) return { isError: true, content: [{ type: "text", text: "Memory not found" }] };

                return { content: [{ type: "text", text: `Tags ${action}ed: [${result.tags?.join(", ")}]` }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 20. search_by_tag - find memories by tag
    {
        name: "memory_search_by_tag",
        description: "Search memories by tag. Find all memories with a specific tag.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                tag: { type: "string" },
                limit: { type: "number", description: "Max results (default from env: 10)" },
                offset: { type: "number", description: "Pagination offset (default from env: 0)" }
            },
            required: ["userId", "tag"],
        },
        handler: async (args: any) => {
            try {
                const cfg = getMemoryConfig();
                const limit = args.limit ?? cfg.DEFAULT_SEARCH_LIMIT;
                const offset = args.offset ?? cfg.DEFAULT_SEARCH_OFFSET;
                
                const schema = baseSchema.extend({
                    tag: z.string().min(1),
                });
                const { userId, tag } = validatePayload(schema, args);

                const results = searchMemoriesByTag(userId, tag, limit + offset);
                
                return { content: [{ type: "text", text: JSON.stringify({
                    tag,
                    count: results.length,
                    memories: results.slice(offset, offset + limit).map((r: any) => ({
                        id: r.id,
                        query: r.content?.slice(0,60),
                        summary: r.summary?.slice(0,80),
                        tags: (() => { try { return JSON.parse(r.tags||"[]"); } catch { return []; } })()
                    })),
                    search_context: { limit, offset, source: "memory_search_by_tag" }
                }, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 21. fuzzy_recall - fuzzy search with typo tolerance
    {
        name: "memory_fuzzy_recall",
        description: "Fuzzy search memories with typo tolerance. Uses Levenshtein distance for approximate matching.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                query: { type: "string" },
                threshold: { type: "number", description: "Min match score 0-1 (default from env: 20 converted to 0.2)" },
                limit: { type: "number", description: "Max results (default from env: 10)" },
                offset: { type: "number", description: "Pagination offset (default from env: 0)" }
            },
            required: ["userId", "query"],
        },
        handler: async (args: any) => {
            try {
                const cfg = getMemoryConfig();
                const limit = args.limit ?? cfg.DEFAULT_SEARCH_LIMIT;
                const offset = args.offset ?? cfg.DEFAULT_SEARCH_OFFSET;
                const threshold = args.threshold ? args.threshold / 100 : cfg.DEFAULT_CONFIDENCE_THRESHOLD / 100;
                
                const schema = baseSchema.extend({
                    query: z.string().min(1),
                });
                const { userId, query } = validatePayload(schema, args);

                // Get all memories for fuzzy matching
                const all = db.prepare(`SELECT id, content, summary, response FROM LongTermMemory WHERE userId = ? ORDER BY createdAt DESC LIMIT 100`).all(userId) as any[];
                
                // Simple fuzzy match using substring with wildcards
                const fuzzyResults = all.map(m => {
                    const text = ((m.content||'') + ' ' + (m.summary||'')).toLowerCase();
                    const q = query.toLowerCase();
                    
                    // Check for common typos (1 character difference)
                    let score = 0;
                    if (text.includes(q)) score = 1;
                    else {
                        // Check each word
                        const words = text.split(/\s+/);
                        for (const w of words) {
                            if (w.length >= 4 && q.length >= 4) {
                                const dist = levenshtein(w, q);
                                const len = Math.max(w.length, q.length);
                                if (dist <= 2) score = 1 - (dist / len);
                            }
                        }
                    }
                    return { ...m, score };
                }).filter(r => r.score >= threshold)
                 .sort((a, b) => b.score - a.score);

                return { content: [{ type: "text", text: JSON.stringify({
                    query: query,
                    found: fuzzyResults.length,
                    memories: fuzzyResults.slice(offset, offset + limit).map((r: any) => ({
                        id: r.id,
                        query: r.content?.slice(0,60),
                        score: Math.round(r.score*100)+'%'
                    })),
                    search_context: { limit, offset, threshold: threshold * 100, source: "memory_fuzzy_recall" }
                }, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 22. vote - like or dislike a memory
    {
        name: "memory_vote",
        description: "Vote on a memory quality. Helps identify high-value memories.",
        inputSchema: {
            type: "object",
            properties: {
                memoryId: { type: "string" },
                vote: { type: "string", enum: ["like", "dislike"] }
            },
            required: ["memoryId", "vote"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({
                    memoryId: z.string().min(1),
                    vote: z.enum(["like", "dislike"])
                });
                const { memoryId, vote } = validatePayload(schema, args);

                const result = voteMemory(memoryId, vote);
                return { content: [{ type: "text", text: `Vote recorded. Likes: ${result.likes}, Dislikes: ${result.dislikes}` }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 23. quality - get or set memory quality score
    {
        name: "memory_quality",
        description: "Get or calculate memory quality score. High quality memories are more likely to be recalled.",
        inputSchema: {
            type: "object",
            properties: {
                memoryId: { type: "string" },
                score: { type: "number", description: "Set quality score (0-1). Leave empty to calculate automatically." }
            },
            required: ["memoryId"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({
                    memoryId: z.string().min(1),
                    score: z.number().min(0).max(1).optional()
                });
                const { memoryId, score } = validatePayload(schema, args);

                if (score !== undefined) {
                    updateMemoryQuality(memoryId, score);
                    return { content: [{ type: "text", text: `Quality score set to ${Math.round(score*100)}%` }] };
                }

                const memory = getMemoryById(memoryId) as any;
                if (!memory) return { isError: true, content: [{ type: "text", text: "Memory not found" }] };

                const autoScore = calculateQualityScore(memory);
                const votes = getMemoryVotes(memoryId);
                
                return { content: [{ type: "text", text: JSON.stringify({
                    memoryId,
                    autoCalculatedScore: Math.round(autoScore*100)+'%',
                    votes: { likes: votes.likes, dislikes: votes.dislikes },
                    currentQuality: Math.round((votes.qualityScore||0.5)*100)+'%'
                }, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 24. best - get high quality memories
    {
        name: "memory_best",
        description: "Get high quality memories. Useful for retrieving most valuable memories.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                minScore: { type: "number", default: 0.7 },
                limit: { type: "number", default: 20 }
            },
            required: ["userId"],
        },
        handler: async (args: any) => {
            try {
                const schema = baseSchema.extend({
                    minScore: z.number().min(0).max(1).default(0.7),
                    limit: z.number().min(1).max(100).default(20)
                });
                const { userId, minScore, limit } = validatePayload(schema, args);

                const results = getHighQualityMemories(userId, minScore, limit);
                
                return { content: [{ type: "text", text: JSON.stringify({
                    count: results.length,
                    threshold: Math.round(minScore*100)+'%',
                    memories: results.map((r: any) => ({
                        id: r.id,
                        query: r.content?.slice(0,60),
                        quality: Math.round((r.qualityScore||0.5)*100)+'%',
                        likes: r.likes || 0,
                        created: r.createdAt
                    }))
                }, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 25. bulk - bulk operations on memories
    {
        name: "memory_bulk",
        description: "Bulk operations: pin, tag, update priority, or delete multiple memories.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                memoryIds: { type: "array", items: { type: "string" } },
                operation: { type: "string", enum: ["pin", "unpin", "add_tags", "delete", "boost"] },
                tags: { type: "array", items: { type: "string" } }
            },
            required: ["userId", "memoryIds", "operation"],
        },
        handler: async (args: any) => {
            try {
                const schema = baseSchema.extend({
                    memoryIds: z.array(z.string()).min(1),
                    operation: z.enum(["pin", "unpin", "add_tags", "delete", "boost"]),
                    tags: z.array(z.string()).optional()
                });
                const { userId, memoryIds, operation, tags } = validatePayload(schema, args);

                let result;
                switch (operation) {
                    case "pin":
                        result = bulkPin(memoryIds, true);
                        break;
                    case "unpin":
                        result = bulkPin(memoryIds, false);
                        break;
                    case "add_tags":
                        if (!tags?.length) return { isError: true, content: [{ type: "text", text: "Tags required for add_tags" }] };
                        result = bulkAddTags(memoryIds, tags);
                        break;
                    case "delete":
                        result = bulkDelete(memoryIds);
                        break;
                    case "boost":
                        result = bulkUpdatePriority(memoryIds, 0.1);
                        break;
                    default:
                        return { isError: true, content: [{ type: "text", text: "Unknown operation" }] };
                }

                return { content: [{ type: "text", text: JSON.stringify({ operation, ...result }, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 26. archive - archive a memory
    {
        name: "memory_archive",
        description: "Archive or unarchive a memory. Archived memories are hidden from normal recall but preserved.",
        inputSchema: {
            type: "object",
            properties: {
                memoryId: { type: "string" },
                action: { type: "string", enum: ["archive", "unarchive"], default: "archive" }
            },
            required: ["memoryId"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({
                    memoryId: z.string().min(1),
                    action: z.enum(["archive", "unarchive"]).default("archive")
                });
                const { memoryId, action } = validatePayload(schema, args);

                if (action === "archive") {
                    archiveMemory(memoryId);
                    return { content: [{ type: "text", text: "Memory archived" }] };
                } else {
                    unarchiveMemory(memoryId);
                    return { content: [{ type: "text", text: "Memory unarchived" }] };
                }
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 27. archived - list archived memories
    {
        name: "memory_archived",
        description: "List archived memories.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                limit: { type: "number", default: 50 }
            },
            required: ["userId"],
        },
        handler: async (args: any) => {
            try {
                const schema = baseSchema.extend({
                    limit: z.number().default(50)
                });
                const { userId, limit } = validatePayload(schema, args);

                const results = getArchivedMemories(userId, limit);
                return { content: [{ type: "text", text: JSON.stringify({
                    count: results.length,
                    memories: results.map((r: any) => ({
                        id: r.id,
                        query: r.content?.slice(0,60),
                        archivedAt: r.archivedAt
                    }))
                }, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 28. remind - set a reminder based on memory
    {
        name: "memory_remind",
        description: "Set a reminder to revisit a memory later.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                memoryId: { type: "string" },
                title: { type: "string" },
                description: { type: "string" },
                remindAt: { type: "string", description: "ISO date string for when to remind" }
            },
            required: ["userId", "title", "remindAt"],
        },
        handler: async (args: any) => {
            try {
                const schema = baseSchema.extend({
                    memoryId: z.string().optional(),
                    title: z.string().min(1),
                    description: z.string().optional(),
                    remindAt: z.string().min(1)
                });
                const { userId, memoryId, title, description, remindAt } = validatePayload(schema, args);

                const result = createReminder(userId, memoryId || null, title, description || '', remindAt);
                return { content: [{ type: "text", text: `Reminder set for ${new Date(remindAt).toLocaleString()}` }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 29. reminders - list pending reminders
    {
        name: "memory_reminders",
        description: "List pending or upcoming reminders.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                type: { type: "string", enum: ["pending", "upcoming"], default: "pending" },
                daysAhead: { type: "number", default: 7 }
            },
            required: ["userId"],
        },
        handler: async (args: any) => {
            try {
                const schema = baseSchema.extend({
                    type: z.enum(["pending", "upcoming"]).default("pending"),
                    daysAhead: z.number().default(7)
                });
                const { userId, type, daysAhead } = validatePayload(schema, args);

                const results = type === "pending" ? getPendingReminders(userId) : getUpcomingReminders(userId, daysAhead);
                return { content: [{ type: "text", text: JSON.stringify({
                    type,
                    count: results.length,
                    reminders: results.map((r: any) => ({
                        id: r.id,
                        title: r.title,
                        description: r.description?.slice(0,50),
                        memoryId: r.memoryId,
                        remindAt: r.remindAt
                    }))
                }, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    // 30. merge - merge two memories
    {
        name: "memory_merge",
        description: "Merge two memories into one. Combines keywords, entities, and links.",
        inputSchema: {
            type: "object",
            properties: {
                targetId: { type: "string", description: "Memory to keep" },
                sourceId: { type: "string", description: "Memory to merge into target" }
            },
            required: ["targetId", "sourceId"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({
                    targetId: z.string().min(1),
                    sourceId: z.string().min(1)
                });
                const { targetId, sourceId } = validatePayload(schema, args);

                const result = mergeMemories(targetId, sourceId);
                if (!result.success) return { isError: true, content: [{ type: "text", text: result.error || "Merge failed" }] };

                return { content: [{ type: "text", text: `Merged ${sourceId.slice(0,8)} → ${targetId.slice(0,8)} (${result.mergedKeywords} keywords, ${result.mergedEntities} entities)` }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    }
];