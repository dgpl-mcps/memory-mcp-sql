// =============================================
// ROBUST MEMORY TOOL
// Features: Auto-extract, intent detection, query expansion, smart defaults
// =============================================
import { db } from "../db/sqlite.js";
import { getMemoryConfig } from "../utils/env.js";

// Intent detection patterns
const INTENT_PATTERNS = {
    question: /^(what|why|how|when|where|who|is|are|can|do|does|will|should|would|could)/i,
    command: /^(create|update|delete|remove|add|fix|start|stop|run|execute|build|make|get|set|show|display)/i,
    error: /error|bug|fail|issue|problem|exception|broken|not working|crash/i,
    success: /done|completed|finished|success|working|fixed|solved|deployed/i,
    learning: /learned|discovered|found out|realized|understood|figured out/i,
    planning: /will|going to|plan|should|need to|must|have to/i,
};

// Query expansion synonyms
const QUERY_EXPANSION: Record<string, string[]> = {
    fix: ["fix", "bug", "error", "issue", "problem", "broken"],
    create: ["create", "add", "new", "make", "build"],
    delete: ["delete", "remove", "clear", "drop", "destroy"],
    update: ["update", "edit", "modify", "change", "alter"],
    search: ["search", "find", "look", "query", "find"],
    project: ["project", "work", "task", "sprint"],
    deadline: ["deadline", "due", "date", "when", "finish by"],
    bug: ["bug", "error", "issue", "problem", "defect"],
    api: ["api", "endpoint", "rest", "http", "request"],
    database: ["database", "db", "sql", "query", "table"],
};

// Helper: Detect intent from text
function detectIntent(text: string): string {
    const t = text.toLowerCase();
    if (INTENT_PATTERNS.question.test(t)) return "question";
    if (INTENT_PATTERNS.error.test(t)) return "error";
    if (INTENT_PATTERNS.success.test(t)) return "success";
    if (INTENT_PATTERNS.learning.test(t)) return "learning";
    if (INTENT_PATTERNS.planning.test(t)) return "planning";
    if (INTENT_PATTERNS.command.test(t)) return "command";
    return "general";
}

// Helper: Extract entities from text
function extractEntities(text: string): string[] {
    const entities: string[] = [];
    // @mentions
    const mentions = text.match(/@(\w+)/g);
    if (mentions) entities.push(...mentions.map(m => m.slice(1)));
    // CamelCase words (likely names/entities)
    const camelCase = text.match(/[A-Z][a-z]+(?:[A-Z][a-z]+)+/g);
    if (camelCase) entities.push(...camelCase);
    // Hashtags
    const hashtags = text.match(/#(\w+)/g);
    if (hashtags) entities.push(...hashtags.map(h => h.slice(1)));
    // URLs
    const urls = text.match(/https?:\/\/\S+/g);
    if (urls) entities.push("URL");
    // File paths
    const paths = text.match(/\/[\w\/.-]+\.\w+/g);
    if (paths) entities.push("file_path");
    return [...new Set(entities)];
}

// Helper: Expand query with synonyms
function expandQuery(query: string): string[] {
    const words = query.toLowerCase().split(/\s+/);
    const expanded = new Set<string>([query.toLowerCase()]);
    
    words.forEach(word => {
        if (QUERY_EXPANSION[word]) {
            QUERY_EXPANSION[word].forEach(syn => expanded.add(syn));
        }
    });
    
    return Array.from(expanded);
}

// Helper: Calculate relevance score
function relevanceScore(text: string, query: string): number {
    const lower = text.toLowerCase();
    const queryWords = query.toLowerCase().split(/\s+/);
    let score = 0;
    queryWords.forEach(qw => {
        if (lower.includes(qw)) score += 10;
    });
    return score;
}

// Helper: Auto-summarize long content
const SUMMARY_THRESHOLD = 500;
const SUMMARY_LENGTH = 150;

function autoSummarize(text: string): { summary: string; needsSummarization: boolean } {
    if (text.length <= SUMMARY_THRESHOLD) {
        return { summary: text.slice(0, SUMMARY_LENGTH), needsSummarization: false };
    }
    
    // Extract key sentences: first sentence, sentences with important keywords
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text.slice(0, SUMMARY_LENGTH)];
    const important = ["important", "key", "main", "critical", "essential", "must", "need", "should", "remember"];
    
    const keySentences = sentences.filter(s => 
        important.some(w => s.toLowerCase().includes(w))
    );
    
    let summary = sentences[0] || "";
    if (keySentences.length > 0 && keySentences[0] !== sentences[0]) {
        summary = keySentences.slice(0, 2).join(" ");
    }
    
    // Truncate if too long
    if (summary.length > SUMMARY_LENGTH) {
        summary = summary.slice(0, SUMMARY_LENGTH - 3) + "...";
    } else if (summary.length < SUMMARY_LENGTH && sentences.length > 1) {
        summary += " " + (sentences[1] || "").slice(0, SUMMARY_LENGTH - summary.length);
    }
    
    return { summary: summary.trim(), needsSummarization: text.length > SUMMARY_THRESHOLD };
}

export const memoryTool = {
    name: "memory",
    description: `## Unified Memory Tool

**Purpose:** Store, search, and manage memories with smart features.

**Auto-Features:**
- Intent detection (question, command, error, success, learning, planning)
- Entity extraction (@mentions, CamelCase, hashtags, URLs, paths)
- Query expansion (synonyms for better recall)
- Relevance scoring
- Auto-summarization (extracts key sentences from content >500 chars)
- Auto-linking (automatically links related memories by shared entities)

**Operations:**
| Op | Description |
|----|-------------|
| remember | Store with auto-extract |
| recall | Smart search with expansion |
| history | Get conversation history |
| context | LLM-optimized context |
| stats | Memory statistics |
| cleanup | Delete old memories |
| boost | Adjust priority |
| pin | Pin/unpin memory |
| inspect | View memory details |
| export | Export to JSON |
| import | Import from JSON |
| insights | Extract patterns |
| trim | Smart trimming |
| analytics | Session analytics |
| link | Link memories |
| all | Get everything (quick start) |
| recent | Get recent memories |
| search | Semantic search |

**Examples:**
\`\`\`json
{ "op": "remember", "userId": "u1", "sessionId": "s1", "userMessage": "Q?", "agentMessage": "A!" }
{ "op": "recall", "userId": "u1", "query": "deadline" }
{ "op": "all", "userId": "u1" }
\`\`\``,
    inputSchema: {
        type: "object",
        properties: {
            op: { type: "string", enum: ["remember", "recall", "history", "context", "stats", "cleanup", "boost", "pin", "inspect", "export", "import", "insights", "trim", "analytics", "link", "all", "recent", "search"] },
            userId: { type: "string", description: "User identifier (required)" },
            projectId: { type: "string", description: "Project context" },
            sessionId: { type: "string", description: "Conversation thread" },
            userMessage: { type: "string", description: "User's message" },
            agentMessage: { type: "string", description: "Agent's response" },
            query: { type: "string", description: "Search query" },
            limit: { type: "number", description: "Max results (default: 10)" },
            maxTokens: { type: "number", description: "Max tokens for context" },
            memoryId: { type: "string", description: "Memory ID" },
            memoryId1: { type: "string", description: "First memory ID" },
            memoryId2: { type: "string", description: "Second memory ID" },
            delta: { type: "number", description: "Priority change (default: 0.1)" },
            pinned: { type: "boolean", description: "Pin/unpin" },
            relationship: { type: "string", description: "Link relationship type" },
            days: { type: "number", description: "Days for insights" },
            preview: { type: "boolean", description: "Preview cleanup" },
            daysOld: { type: "number", description: "Delete memories older than N days" },
            importData: { type: "string", description: "JSON data to import" },
            includeShortTerm: { type: "boolean", description: "Include short-term in export" },
        },
        required: ["op", "userId"],
    },
    handler: async (args: any) => {
        console.error("[DEBUG memory.handler] op:", args?.op, "userId:", args?.userId);
        const { op, userId, projectId, sessionId } = args;
        const cfg = getMemoryConfig();
        
        try {
            switch (op) {
                // =============================================
                // REMEMBER: Store with auto-features
                // =============================================
                case "remember": {
                    const { userMessage, agentMessage } = args;
                    if (!userMessage && !agentMessage) {
                        return { content: [{ type: "text", text: "userMessage or agentMessage required" }], isError: true };
                    }
                    
                    const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                    const text = userMessage || agentMessage || "";
                    
                    // Auto-detect intent
                    const intent = detectIntent(text);
                    
                    // Auto-extract entities
                    const entities = extractEntities(text);
                    
                    // Generate smart summary (auto-summarize if long)
                    const { summary, needsSummarization } = autoSummarize(text);
                    
                    // Determine priority based on intent
                    let priority = 0.5;
                    if (intent === "error") priority = 0.8;
                    if (intent === "success") priority = 0.7;
                    if (intent === "learning") priority = 0.8;
                    
                    db.prepare(`
                        INSERT INTO LongTermMemory (id, userId, projectId, content, summary, response, intent, entities, priority, createdAt)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        id, userId, projectId || "default", 
                        userMessage || "", summary,
                        agentMessage || "", intent,
                        JSON.stringify(entities),
                        priority, new Date().toISOString()
                    );
                    
                    // Auto-link to related memories
                    const autoLinks = [];
                    if (entities.length > 0) {
                        // Find memories with same entities
                        const relatedByEntity = db.prepare(`
                            SELECT id FROM LongTermMemory 
                            WHERE userId = ? AND id != ? AND entities LIKE ?
                            ORDER BY createdAt DESC LIMIT 3
                        `).all(userId, id, `%${entities[0]}%`) as any[];
                        
                        for (const rel of relatedByEntity) {
                            const linkId = `link_${Date.now()}_${Math.random().toString(36).slice(2,5)}`;
                            db.prepare(`
                                INSERT OR IGNORE INTO MemoryLinks (id, memoryId1, memoryId2, relationship, createdAt)
                                VALUES (?, ?, ?, ?, ?)
                            `).run(linkId, id, rel.id, "entity_related", new Date().toISOString());
                            autoLinks.push(rel.id.slice(0, 12) + "...");
                        }
                    }
                    
                    return { content: [{ type: "text", text: JSON.stringify({
                        success: true,
                        id,
                        intent,
                        entities,
                        priority: Math.round(priority * 100) + "%",
                        summarized: needsSummarization,
                        summaryLength: summary.length,
                        autoLinked: autoLinks.length
                    }) }] };
                }
                
                // =============================================
                // RECALL: Smart search with query expansion
                // =============================================
                case "recall": {
                    const { query, limit } = args;
                    const l = limit ?? 10;
                    const defaultProj = projectId || "default";
                    
                    // Get memories
                    let memories: any[] = [];
                    
                    if (query) {
                        // Expand query with synonyms
                        const expanded = expandQuery(query);
                        
                        // Search with expanded queries
                        expanded.forEach(q => {
                            const results = db.prepare(`
                                SELECT *, content || ' ' || response as full_text
                                FROM LongTermMemory 
                                WHERE userId = ? AND (content LIKE ? OR response LIKE ? OR summary LIKE ?)
                                ORDER BY priority DESC, createdAt DESC
                                LIMIT ?
                            `).all(userId, `%${q}%`, `%${q}%`, `%${q}%`, l) as any[];
                            
                            results.forEach(r => {
                                r.score = relevanceScore(r.full_text || "", query);
                                if (!memories.find(m => m.id === r.id)) {
                                    memories.push(r);
                                }
                            });
                        });
                        
                        // Sort by relevance score
                        memories.sort((a, b) => (b.score || 0) - (a.score || 0));
                        memories = memories.slice(0, l);
                    } else {
                        // No query = return recent
                        memories = db.prepare(`
                            SELECT * FROM LongTermMemory 
                            WHERE userId = ? 
                            ORDER BY createdAt DESC 
                            LIMIT ?
                        `).all(userId, l) as any[];
                    }
                    
                    return { content: [{ type: "text", text: JSON.stringify({
                        count: memories.length,
                        query: query || "recent",
                        results: memories.map(m => ({
                            id: m.id,
                            content: m.content?.slice(0, 100),
                            summary: m.summary,
                            intent: m.intent,
                            entities: JSON.parse(m.entities || "[]"),
                            priority: Math.round((m.priority || 0.5) * 100) + "%",
                            created: m.createdAt
                        }))
                    }) }] };
                }
                
                // =============================================
                // ALL: Get everything for quick start
                // =============================================
                case "all": {
                    const l = args.limit ?? 20;
                    
                    // Recent memories
                    const memories = db.prepare(`
                        SELECT * FROM LongTermMemory 
                        WHERE userId = ? 
                        ORDER BY createdAt DESC 
                        LIMIT ?
                    `).all(userId, l) as any[];
                    
                    // Pinned memories
                    const pinned = db.prepare(`
                        SELECT * FROM LongTermMemory 
                        WHERE userId = ? AND isPinned = 1
                        ORDER BY createdAt DESC
                    `).all(userId) as any[];
                    
                    // Stats
                    const total = db.prepare(`SELECT COUNT(*) as c FROM LongTermMemory WHERE userId = ?`).get(userId) as any;
                    const shortTerm = db.prepare(`SELECT COUNT(*) as c FROM ShortTermChat WHERE userId = ?`).get(userId) as any;
                    
                    return { content: [{ type: "text", text: JSON.stringify({
                        totalMemories: total?.c || 0,
                        shortTermChats: shortTerm?.c || 0,
                        pinnedCount: pinned.length,
                        recent: memories.slice(0, 5).map(m => ({
                            id: m.id,
                            content: m.content?.slice(0, 80),
                            intent: m.intent,
                            priority: Math.round((m.priority || 0.5) * 100) + "%"
                        })),
                        pinned: pinned.map(m => ({
                            id: m.id,
                            content: m.content?.slice(0, 80)
                        }))
                    }) }] };
                }
                
                // =============================================
                // RECENT: Get recent memories quickly
                // =============================================
                case "recent": {
                    const l = args.limit ?? 10;
                    const memories = db.prepare(`
                        SELECT * FROM LongTermMemory 
                        WHERE userId = ? 
                        ORDER BY createdAt DESC 
                        LIMIT ?
                    `).all(userId, l) as any[];
                    
                    return { content: [{ type: "text", text: JSON.stringify({
                        count: memories.length,
                        memories: memories.map(m => ({
                            id: m.id,
                            content: m.content?.slice(0, 100),
                            summary: m.summary,
                            intent: m.intent,
                            priority: Math.round((m.priority || 0.5) * 100) + "%",
                            time: m.createdAt
                        }))
                    }) }] };
                }
                
                // =============================================
                // SEARCH: Semantic search
                // =============================================
                case "search": {
                    const { query } = args;
                    if (!query) return { content: [{ type: "text", text: "query required" }], isError: true };
                    
                    const expanded = expandQuery(query);
                    const results: any[] = [];
                    
                    expanded.forEach(q => {
                        const found = db.prepare(`
                            SELECT * FROM LongTermMemory 
                            WHERE userId = ? AND (content LIKE ? OR summary LIKE ?)
                            ORDER BY priority DESC
                            LIMIT 20
                        `).all(userId, `%${q}%`, `%${q}%`) as any[];
                        
                        found.forEach(f => {
                            if (!results.find(r => r.id === f.id)) {
                                f.score = relevanceScore(f.content || "", query);
                                results.push(f);
                            }
                        });
                    });
                    
                    results.sort((a, b) => (b.score || 0) - (a.score || 0));
                    
                    return { content: [{ type: "text", text: JSON.stringify({
                        query,
                        expandedTo: expanded,
                        count: results.length,
                        results: results.slice(0, 10).map(r => ({
                            id: r.id,
                            content: r.content?.slice(0, 100),
                            score: r.score
                        }))
                    }) }] };
                }
                
                // =============================================
                // HISTORY: Get conversation history
                // =============================================
                case "history": {
                    if (!sessionId) return { content: [{ type: "text", text: "sessionId required" }], isError: true };
                    const chats = db.prepare(`
                        SELECT * FROM ShortTermChat 
                        WHERE userId = ? AND sessionId = ? 
                        ORDER BY createdAt DESC 
                        LIMIT ?
                    `).all(userId, sessionId, args.limit ?? 10) as any[];
                    
                    return { content: [{ type: "text", text: JSON.stringify({
                        sessionId,
                        count: chats.length,
                        chats: chats.map(c => ({
                            q: c.content?.slice(0, 100),
                            a: c.response?.slice(0, 100),
                            time: c.createdAt
                        }))
                    }) }] };
                }
                
                // =============================================
                // CONTEXT: Get LLM-ready context
                // =============================================
                case "context": {
                    if (!sessionId) {
                        // Get context without session
                        const memories = db.prepare(`
                            SELECT * FROM LongTermMemory 
                            WHERE userId = ? 
                            ORDER BY priority DESC, createdAt DESC 
                            LIMIT 10
                        `).all(userId) as any[];
                        
                        let ctx = "# Context\n\n";
                        memories.forEach(m => {
                            ctx += `## ${m.intent || "memory"}\n`;
                            ctx += `${m.content}\n`;
                            if (m.response) ctx += `→ ${m.response}\n`;
                            ctx += "\n";
                        });
                        
                        return { content: [{ type: "text", text: JSON.stringify({
                            type: "context",
                            tokens: ctx.length,
                            text: ctx.slice(0, args.maxTokens ?? 6000)
                        }) }] };
                    }
                    
                    const chats = db.prepare(`
                        SELECT * FROM ShortTermChat 
                        WHERE userId = ? AND sessionId = ? 
                        ORDER BY createdAt DESC 
                        LIMIT 10
                    `).all(userId, sessionId) as any[];
                    
                    let ctx = "# Conversation Context\n\n";
                    chats.reverse().forEach(c => {
                        ctx += `**User:** ${c.content}\n`;
                        if (c.response) ctx += `**Agent:** ${c.response}\n`;
                        ctx += "\n";
                    });
                    
                    return { content: [{ type: "text", text: JSON.stringify({
                        type: "session_context",
                        sessionId,
                        tokens: ctx.length,
                        text: ctx.slice(0, args.maxTokens ?? 6000)
                    }) }] };
                }
                
                // =============================================
                // STATS: Get memory statistics
                // =============================================
                case "stats": {
                    const total = db.prepare(`SELECT COUNT(*) as c FROM LongTermMemory WHERE userId = ?`).get(userId) as any;
                    const shortTerm = db.prepare(`SELECT COUNT(*) as c FROM ShortTermChat WHERE userId = ?`).get(userId) as any;
                    const pinned = db.prepare(`SELECT COUNT(*) as c FROM LongTermMemory WHERE userId = ? AND isPinned = 1`).get(userId) as any;
                    const avgPriority = db.prepare(`SELECT AVG(priority) as p FROM LongTermMemory WHERE userId = ?`).get(userId) as any;
                    
                    // Intent breakdown
                    const intents = db.prepare(`
                        SELECT intent, COUNT(*) as c FROM LongTermMemory 
                        WHERE userId = ? AND intent IS NOT NULL 
                        GROUP BY intent
                    `).all(userId) as any[];
                    
                    return { content: [{ type: "text", text: JSON.stringify({
                        longTerm: total?.c || 0,
                        shortTerm: shortTerm?.c || 0,
                        pinned: pinned?.c || 0,
                        avgPriority: Math.round((avgPriority?.p || 0.5) * 100) + "%",
                        intentBreakdown: intents.reduce((acc: any, i: any) => { acc[i.intent || "general"] = i.c; return acc; }, {}),
                        thresholds: {
                            shortTerm: cfg.SHORT_TERM_THRESHOLD + "%",
                            longTerm: cfg.LONG_TERM_THRESHOLD + "%"
                        }
                    }) }] };
                }
                
                // =============================================
                // CLEANUP: Delete old memories
                // =============================================
                case "cleanup": {
                    const days = args.daysOld ?? 90;
                    const preview = args.preview ?? false;
                    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
                    
                    if (preview) {
                        const count = db.prepare(`
                            SELECT COUNT(*) as c FROM LongTermMemory 
                            WHERE userId = ? AND createdAt < ? AND (isPinned = 0 OR isPinned IS NULL)
                        `).get(userId, cutoff) as any;
                        return { content: [{ type: "text", text: `Would delete ${count?.c || 0} memories older than ${days} days` }] };
                    }
                    
                    const r = db.prepare(`
                        DELETE FROM LongTermMemory 
                        WHERE userId = ? AND createdAt < ? AND (isPinned = 0 OR isPinned IS NULL)
                    `).run(userId, cutoff);
                    
                    return { content: [{ type: "text", text: `Deleted ${r.changes} memories older than ${days} days` }] };
                }
                
                // =============================================
                // BOOST: Adjust memory importance
                // =============================================
                case "boost": {
                    const { memoryId, delta } = args;
                    if (!memoryId) return { content: [{ type: "text", text: "memoryId required" }], isError: true };
                    
                    const d = delta ?? 0.1;
                    db.prepare(`
                        UPDATE LongTermMemory 
                        SET priority = MIN(1.0, MAX(0.0, priority + ?)) 
                        WHERE id = ?
                    `).run(d, memoryId);
                    
                    return { content: [{ type: "text", text: `Priority ${d > 0 ? "+" : ""}${d}` }] };
                }
                
                // =============================================
                // PIN: Pin/unpin memory
                // =============================================
                case "pin": {
                    const { memoryId, pinned } = args;
                    if (!memoryId) return { content: [{ type: "text", text: "memoryId required" }], isError: true };
                    
                    db.prepare(`UPDATE LongTermMemory SET isPinned = ? WHERE id = ?`).run(pinned ? 1 : 0, memoryId);
                    return { content: [{ type: "text", text: pinned ? "Pinned ✓" : "Unpinned" }] };
                }
                
                // =============================================
                // INSPECT: View memory details
                // =============================================
                case "inspect": {
                    const { memoryId } = args;
                    if (!memoryId) return { content: [{ type: "text", text: "memoryId required" }], isError: true };
                    
                    const m = db.prepare(`SELECT * FROM LongTermMemory WHERE id = ?`).get(memoryId) as any;
                    if (!m) return { content: [{ type: "text", text: "Memory not found" }] };
                    
                    return { content: [{ type: "text", text: JSON.stringify({
                        id: m.id,
                        content: m.content,
                        summary: m.summary,
                        response: m.response,
                        intent: m.intent,
                        entities: JSON.parse(m.entities || "[]"),
                        priority: Math.round((m.priority || 0.5) * 100) + "%",
                        pinned: m.isPinned === 1,
                        created: m.createdAt,
                        updated: m.updatedAt
                    }) }] };
                }
                
                // =============================================
                // EXPORT: Export memories
                // =============================================
                case "export": {
                    const memories = db.prepare(`
                        SELECT id, content, summary, response, intent, entities, priority, isPinned, createdAt
                        FROM LongTermMemory 
                        WHERE userId = ? 
                        ORDER BY createdAt DESC
                        LIMIT ?
                    `).all(userId, args.limit ?? 100) as any[];
                    
                    return { content: [{ type: "text", text: JSON.stringify({
                        exportedAt: new Date().toISOString(),
                        userId,
                        count: memories.length,
                        memories
                    }) }] };
                }
                
                // =============================================
                // IMPORT: Import memories
                // =============================================
                case "import": {
                    const { importData } = args;
                    if (!importData) return { content: [{ type: "text", text: "importData required" }], isError: true };
                    
                    const data = JSON.parse(importData);
                    let count = 0;
                    
                    if (data.memories?.length) {
                        for (const m of data.memories) {
                            const id = `ltm_imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                            db.prepare(`
                                INSERT INTO LongTermMemory (id, userId, content, summary, response, intent, entities, priority, isPinned, createdAt)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            `).run(
                                id, userId, m.content, m.summary, m.response,
                                m.intent || "imported",
                                JSON.stringify(m.entities || []),
                                m.priority || 0.5,
                                m.isPinned ? 1 : 0,
                                m.createdAt || new Date().toISOString()
                            );
                            count++;
                        }
                    }
                    
                    return { content: [{ type: "text", text: `Imported ${count} memories` }] };
                }
                
                // =============================================
                // INSIGHTS: Extract patterns
                // =============================================
                case "insights": {
                    const { days } = args;
                    const cutoff = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString() : null;
                    
                    const sql = cutoff 
                        ? `SELECT content, response, intent FROM LongTermMemory WHERE userId = ? AND createdAt > ?`
                        : `SELECT content, response, intent FROM LongTermMemory WHERE userId = ?`;
                    
                    const memories = (cutoff 
                        ? db.prepare(sql).all(userId, cutoff) 
                        : db.prepare(sql).all(userId)) as any[];
                    
                    const insights: any = {
                        questions: [],
                        errors: [],
                        successes: [],
                        learnings: [],
                        topEntities: {},
                        intentBreakdown: {}
                    };
                    
                    memories.forEach((m: any) => {
                        const text = ((m.content || "") + " " + (m.response || "")).toLowerCase();
                        
                        if (INTENT_PATTERNS.question.test(m.content || "")) {
                            insights.questions.push(m.content?.slice(0, 100));
                        }
                        if (INTENT_PATTERNS.error.test(text)) {
                            insights.errors.push(m.content?.slice(0, 80));
                        }
                        if (INTENT_PATTERNS.success.test(text)) {
                            insights.successes.push(m.content?.slice(0, 80));
                        }
                        if (INTENT_PATTERNS.learning.test(text)) {
                            insights.learnings.push(m.content?.slice(0, 80));
                        }
                        
                        // Count intents
                        insights.intentBreakdown[m.intent || "general"] = (insights.intentBreakdown[m.intent || "general"] || 0) + 1;
                        
                        // Count entities
                        const entities = JSON.parse(m.entities || "[]") as string[];
                        entities.forEach((e: string) => {
                            insights.topEntities[e] = (insights.topEntities[e] || 0) + 1;
                        });
                    });
                    
                    // Top entities
                    const topEntities = Object.entries(insights.topEntities)
                        .sort((a: any, b: any) => b[1] - a[1])
                        .slice(0, 10)
                        .map(([e, c]: any) => ({ entity: e, count: c }));
                    
                    return { content: [{ type: "text", text: JSON.stringify({
                        total: memories.length,
                        intentBreakdown: insights.intentBreakdown,
                        topEntities,
                        samples: {
                            questions: insights.questions.slice(0, 3),
                            errors: insights.errors.slice(0, 3),
                            successes: insights.successes.slice(0, 3),
                            learnings: insights.learnings.slice(0, 3)
                        }
                    }) }] };
                }
                
                // =============================================
                // TRIM: Smart trimming
                // =============================================
                case "trim": {
                    if (!sessionId) return { content: [{ type: "text", text: "sessionId required" }], isError: true };
                    
                    const maxChars = args.maxChars ?? 3000;
                    const chats = db.prepare(`
                        SELECT content, response FROM ShortTermChat 
                        WHERE userId = ? AND sessionId = ? 
                        ORDER BY createdAt DESC 
                        LIMIT 10
                    `).all(userId, sessionId) as any[];
                    
                    let ctx = "";
                    chats.reverse().forEach((c: any) => {
                        ctx += `Q: ${(c.content || "").slice(0, 200)}\n`;
                        ctx += `A: ${(c.response || "").slice(0, 200)}\n\n`;
                    });
                    
                    const trimmed = ctx.length > maxChars ? ctx.slice(0, maxChars) + "..." : ctx;
                    return { content: [{ type: "text", text: JSON.stringify({
                        original: ctx.length,
                        trimmed: trimmed.length,
                        ratio: Math.round((1 - trimmed.length / ctx.length) * 100) + "%",
                        text: trimmed
                    }) }] };
                }
                
                // =============================================
                // ANALYTICS: Session analytics
                // =============================================
                case "analytics": {
                    const { days } = args;
                    const cutoff = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString() : null;
                    
                    const sql = cutoff 
                        ? `SELECT intent FROM LongTermMemory WHERE userId = ? AND createdAt > ?`
                        : `SELECT intent FROM LongTermMemory WHERE userId = ?`;
                    
                    const memories = (cutoff 
                        ? db.prepare(sql).all(userId, cutoff) 
                        : db.prepare(sql).all(userId)) as any[];
                    
                    const breakdown = memories.reduce((acc: any, m: any) => {
                        const i = m.intent || "general";
                        acc[i] = (acc[i] || 0) + 1;
                        return acc;
                    }, {} as Record<string, number>);
                    
                    return { content: [{ type: "text", text: JSON.stringify({
                        period: days ? `${days} days` : "all time",
                        total: memories.length,
                        intentBreakdown: breakdown,
                        mostCommon: Object.entries(breakdown as Record<string, number>).sort((a, b) => b[1] - a[1])[0]
                    }) }] };
                }
                
                // =============================================
                // LINK: Link memories
                // =============================================
                case "link": {
                    const { memoryId1, memoryId2, relationship } = args;
                    if (!memoryId1 || !memoryId2) {
                        return { content: [{ type: "text", text: "memoryId1 and memoryId2 required" }], isError: true };
                    }
                    
                    const id = `link_${Date.now()}`;
                    db.prepare(`
                        INSERT INTO MemoryLinks (id, memoryId1, memoryId2, relationship, createdAt)
                        VALUES (?, ?, ?, ?, ?)
                    `).run(id, memoryId1, memoryId2, relationship || "related", new Date().toISOString());
                    
                    return { content: [{ type: "text", text: `Linked ${memoryId1.slice(0, 12)}... → ${memoryId2.slice(0, 12)}... (${relationship || "related"})` }] };
                }
                
                default:
                    return { content: [{ type: "text", text: `Unknown op: ${op}. Available: remember, recall, history, context, stats, cleanup, boost, pin, inspect, export, import, insights, trim, analytics, link, all, recent, search` }], isError: true };
            }
        } catch (err: any) {
            return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
        }
    }
};
