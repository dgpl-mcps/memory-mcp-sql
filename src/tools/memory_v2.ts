// =============================================
// ROBUST MEMORY TOOL
// Features: Auto-extract, intent detection, query expansion, smart defaults
// =============================================
import { db, dbConfig, searchEmbeddings } from "../db/sqlite.js";
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
| search | Semantic search (vector + keyword) |
| semantic | Pure vector similarity search |
| thread | Get memory with full linked context chain |
| health | Memory health & optimization suggestions |
| decay | Decay unused memories |
| persona | User personality & preferences |
| mood | Track emotional state |
| learn | Adaptive learning patterns |
| remind | Proactive memory reminders |
| suggest | Get smart suggestions |
| graph | Knowledge graph visualization data |
| dedup | Find and merge duplicate memories |
| backup | Backup memories to JSON |
| restore | Restore memories from JSON |
| importance | Memory importance scoring |

**Smart Features:**
- **8-phase auto-linking** (bidirectional)
- **Intent detection** & priority boost
- **Entity extraction** (@mentions, CamelCase, #hashtags)
- **Vector search** (semantic similarity)
- **Thread context chains**
- **Health monitoring** & decay
- **Emotional memory** & learning
- **Proactive suggestions**

**Examples:**
\`\`\`json
{ "op": "remember", "userId": "u1", "sessionId": "s1", "userMessage": "Q?", "agentMessage": "A!" }
{ "op": "recall", "userId": "u1", "query": "deadline" }
{ "op": "mood", "userId": "u1", "mood": "happy", "context": "Fixed a bug" }
{ "op": "suggest", "userId": "u1" }
\`\`\``,
    inputSchema: {
        type: "object",
        properties: {
            op: { type: "string", enum: ["remember", "recall", "history", "context", "stats", "cleanup", "boost", "pin", "inspect", "export", "import", "insights", "trim", "analytics", "link", "all", "recent", "search", "semantic", "thread", "health", "decay", "persona", "mood", "learn", "remind", "suggest", "graph", "dedup", "backup", "restore", "importance"] },
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
            mood: { type: "string", description: "User mood (happy, sad, excited, frustrated, calm)" },
            intensity: { type: "number", description: "Mood intensity 1-10" },
            traits: { type: "object", description: "Personality traits" },
            style: { type: "string", description: "Communication style" },
            type: { type: "string", description: "Learning/type pattern type" },
            pattern: { type: "string", description: "Pattern to learn" },
            reminderType: { type: "string", description: "Type of reminder" },
            title: { type: "string", description: "Reminder title" },
        },
        required: ["op", "userId"],
    },
    handler: async (args: any) => {
        const { op, userId, projectId, sessionId } = args;
        
        // Validate userId is provided
        if (!userId) {
            return { isError: true, content: [{ type: "text", text: "userId is required" }] };
        }
        
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
                    
                    // Generate smart summary
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
                    
                    // Auto-link to related memories (ROBUST 5-PHASE SYSTEM)
                    interface AutoLink { id: string; type: string; content: string; strength: number; }
                    const autoLinks: AutoLink[] = [];
                    
                    // Helper to create link and track
                    const createLink = (targetId: string, relType: string, strength: number, content?: string) => {
                        if (autoLinks.find(l => l.id === targetId)) return;
                        const linkId = `link_${Date.now()}_${Math.random().toString(36).slice(2,5)}`;
                        db.prepare(`
                            INSERT OR IGNORE INTO MemoryLinks (id, memoryId1, memoryId2, relationship, strength, createdAt)
                            VALUES (?, ?, ?, ?, ?, ?)
                        `).run(linkId, id, targetId, relType, strength, new Date().toISOString());
                        // Bidirectional: also link back
                        const revLinkId = `link_${Date.now()}_${Math.random().toString(36).slice(2,5)}`;
                        db.prepare(`
                            INSERT OR IGNORE INTO MemoryLinks (id, memoryId1, memoryId2, relationship, strength, createdAt)
                            VALUES (?, ?, ?, ?, ?, ?)
                        `).run(revLinkId, targetId, id, relType + "_reverse", strength, new Date().toISOString());
                        autoLinks.push({ id: targetId, type: relType, strength, content: content?.slice(0, 50) || "" });
                    };
                    
                    // Phase 0: TEMPORAL - Link to most recent memory (conversation flow)
                    const recentMem = db.prepare(`
                        SELECT id, content FROM LongTermMemory 
                        WHERE userId = ? AND id != ? AND projectId = ?
                        ORDER BY createdAt DESC LIMIT 1
                    `).get(userId, id, projectId || "default") as any;
                    if (recentMem) {
                        createLink(recentMem.id, "temporal", 0.9, recentMem.content);
                    }
                    
                    if (entities.length > 0) {
                        // Phase 1: Entity Match (HIGHEST PRIORITY - strength 0.8)
                        for (const entity of entities.slice(0, 3)) {
                            const relatedByEntity = db.prepare(`
                                SELECT id, content, intent, entities FROM LongTermMemory 
                                WHERE userId = ? AND id != ? AND entities LIKE ?
                                ORDER BY priority DESC, createdAt DESC LIMIT 5
                            `).all(userId, id, `%${entity}%`) as any[];
                            
                            for (const rel of relatedByEntity) {
                                createLink(rel.id, "entity_related", 0.8, rel.content);
                            }
                        }
                        
                        // Phase 2: Intent Cluster (context clustering - strength 0.6)
                        const similarIntent = db.prepare(`
                            SELECT id, content, entities FROM LongTermMemory 
                            WHERE userId = ? AND id != ? AND intent = ? AND createdAt > datetime('now', '-1 hour')
                            ORDER BY priority DESC LIMIT 3
                        `).all(userId, id, intent) as any[];
                        
                        for (const rel of similarIntent) {
                            const relEntities = JSON.parse(rel.entities || "[]");
                            const sharedEntity = entities.find(e => relEntities.includes(e));
                            if (sharedEntity) {
                                createLink(rel.id, "intent_cluster", 0.6, rel.content);
                            }
                        }
                        
                        // Phase 3: Project Match (same project context - strength 0.7)
                        const sameProject = db.prepare(`
                            SELECT id, content FROM LongTermMemory 
                            WHERE userId = ? AND id != ? AND projectId = ?
                            AND id NOT IN (SELECT memoryId2 FROM MemoryLinks WHERE memoryId1 = ?)
                            ORDER BY createdAt DESC LIMIT 3
                        `).all(userId, id, projectId || "default", id) as any[];
                        
                        for (const rel of sameProject) {
                            createLink(rel.id, "project_related", 0.7, rel.content);
                        }
                        
                        // Phase 4: Keyword Match (deeper linking - strength 0.4)
                        const keywords = expandQuery(text).slice(0, 5);
                        for (const kw of keywords) {
                            const byKeyword = db.prepare(`
                                SELECT id, content FROM LongTermMemory 
                                WHERE userId = ? AND id != ? AND (content LIKE ? OR summary LIKE ?)
                                AND id NOT IN (SELECT memoryId2 FROM MemoryLinks WHERE memoryId1 = ?)
                                ORDER BY priority DESC LIMIT 2
                            `).all(userId, id, `%${kw}%`, `%${kw}%`, id) as any[];
                            
                            for (const rel of byKeyword) {
                                if (autoLinks.length >= 15) break;
                                createLink(rel.id, "keyword_related", 0.4, rel.content);
                            }
                            if (autoLinks.length >= 15) break;
                        }
                        
                        // Phase 5: CROSS-PROJECT Linking (find related memories across projects - strength 0.6)
                        const crossProject = db.prepare(`
                            SELECT id, content, projectId FROM LongTermMemory 
                            WHERE userId = ? AND id != ? AND projectId != ?
                            AND (entities LIKE ? OR intent = ?)
                            AND id NOT IN (SELECT memoryId2 FROM MemoryLinks WHERE memoryId1 = ?)
                            ORDER BY priority DESC LIMIT 3
                        `).all(userId, id, projectId || "default", `%${entities[0] || ""}%`, intent, id) as any[];
                        
                        for (const rel of crossProject) {
                            if (autoLinks.length >= 15) break;
                            createLink(rel.id, "cross_project", 0.6, rel.content);
                        }
                        
                        // Phase 6: TEMPORAL CHAIN (build conversation chains - strength 0.95 for consecutive)
                        const temporalChain = db.prepare(`
                            SELECT id, content, createdAt FROM LongTermMemory 
                            WHERE userId = ? AND id != ?
                            AND createdAt > datetime('now', '-30 minutes')
                            ORDER BY createdAt DESC LIMIT 5
                        `).all(userId, id) as any[];
                        
                        for (const rel of temporalChain) {
                            if (autoLinks.length >= 15) break;
                            // Higher strength for very recent memories
                            const minutesAgo = (Date.now() - new Date(rel.createdAt).getTime()) / 60000;
                            const chainStrength = Math.max(0.5, 0.95 - (minutesAgo * 0.02));
                            createLink(rel.id, "temporal_chain", chainStrength, rel.content);
                        }
                        
                        // Phase 7: ENTITY GRAPH (build knowledge graph based on shared entities)
                        const entityMentions = entities.slice(0, 2);
                        for (const entity of entityMentions) {
                            const sameEntity = db.prepare(`
                                SELECT id, content, entities FROM LongTermMemory 
                                WHERE userId = ? AND id != ? AND entities LIKE ?
                                AND id NOT IN (SELECT memoryId2 FROM MemoryLinks WHERE memoryId1 = ?)
                                ORDER BY createdAt DESC LIMIT 2
                            `).all(userId, id, `%${entity}%`, id) as any[];
                            
                            for (const rel of sameEntity) {
                                if (autoLinks.length >= 15) break;
                                createLink(rel.id, "entity_graph", 0.75, rel.content);
                            }
                        }
                    } else {
                        // No entities - try temporal and project linking only
                        // Phase 0 & 6 already handled above
                        
                        // Recent memories without entity match
                        const recentNoEntity = db.prepare(`
                            SELECT id, content FROM LongTermMemory 
                            WHERE userId = ? AND id != ? AND createdAt > datetime('now', '-1 hour')
                            AND id NOT IN (SELECT memoryId2 FROM MemoryLinks WHERE memoryId1 = ?)
                            ORDER BY createdAt DESC LIMIT 3
                        `).all(userId, id, id) as any[];
                        
                        for (const rel of recentNoEntity) {
                            if (autoLinks.length >= 10) break;
                            createLink(rel.id, "recent_context", 0.5, rel.content);
                        }
                    }
                    
                    // Phase 8: ADAPTIVE BOOST - If this memory has high priority, boost related memories
                    if (priority >= 0.7) {
                        const linkedIds = autoLinks.map(l => l.id);
                        if (linkedIds.length > 0) {
                            const placeholders = linkedIds.map(() => '?').join(',');
                            db.prepare(`
                                UPDATE LongTermMemory SET priority = MIN(1.0, priority + 0.05) 
                                WHERE id IN (${placeholders})
                            `).run(...linkedIds);
                        }
                    }
                    
                    // Track memory patterns for learning
                    const recentIntents = db.prepare(`
                        SELECT intent, COUNT(*) as c FROM LongTermMemory 
                        WHERE userId = ? AND createdAt > datetime('now', '-24 hours')
                        GROUP BY intent ORDER BY c DESC LIMIT 3
                    `).all(userId) as any[];
                    
                    // Count links by type
                    const linkTypes: Record<string, number> = {};
                    autoLinks.forEach(l => {
                        linkTypes[l.type] = (linkTypes[l.type] || 0) + 1;
                    });
                    
                    return { content: [{ type: "text", text: JSON.stringify({
                        success: true,
                        id,
                        intent,
                        entities,
                        priority: Math.round(priority * 100) + "%",
                        summarized: needsSummarization,
                        summaryLength: summary.length,
                        autoLinked: autoLinks.length,
                        linkTypes,
                        relatedMemories: autoLinks.map(l => ({ id: l.id.slice(0, 15) + "...", type: l.type, strength: l.strength })),
                        recentPatterns: recentIntents.map(i => i.intent)
                    }) }] };
                }
                
                // =============================================
                // RECALL: Smart search with query expansion + linked context
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
                    
                    // ENHANCED: Include linked memories as context
                    const resultsWithContext = memories.map(m => {
                        // Get linked memories
                        const links = db.prepare(`
                            SELECT m2.id, m2.content, m2.intent, m2.priority, l.relationship, l.strength
                            FROM MemoryLinks l
                            JOIN LongTermMemory m2 ON m2.id = l.memoryId2
                            WHERE l.memoryId1 = ? AND l.strength >= 0.5
                            ORDER BY l.strength DESC
                            LIMIT 3
                        `).all(m.id) as any[];
                        
                        return {
                            id: m.id,
                            content: m.content?.slice(0, 100),
                            summary: m.summary,
                            intent: m.intent,
                            entities: JSON.parse(m.entities || "[]"),
                            priority: Math.round((m.priority || 0.5) * 100) + "%",
                            created: m.createdAt,
                            linkedContext: links.map(l => ({
                                id: l.id.slice(0, 15) + "...",
                                preview: l.content?.slice(0, 50),
                                relationship: l.relationship,
                                strength: l.strength
                            }))
                        };
                    });
                    
                    return { content: [{ type: "text", text: JSON.stringify({
                        count: memories.length,
                        query: query || "recent",
                        results: resultsWithContext
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
                // SEMANTIC: Pure vector similarity search
                // Uses embeddings for semantic understanding
                // =============================================
                case "semantic": {
                    const { query, limit = 10 } = args;
                    if (!query) return { content: [{ type: "text", text: "query required" }], isError: true };
                    
                    // Check if vector search is available
                    const hasVector = dbConfig?.useVectorSearch && process.env.EMBEDDING_URL;
                    
                    // First, try to get vector results from Embeddings table
                    const vectorResults = await searchEmbeddings(userId, query, "LongTermMemory", limit);
                    
                    if (vectorResults && vectorResults.length > 0) {
                        // Merge with memory data
                        const memoryIds = vectorResults.map((r: any) => r.refId);
                        if (memoryIds.length > 0) {
                            const placeholders = memoryIds.map(() => '?').join(',');
                            const memories = db.prepare(`
                                SELECT * FROM LongTermMemory WHERE id IN (${placeholders})
                            `).all(...memoryIds) as any[];
                            
                            const memMap = new Map(memories.map((m: any) => [m.id, m]));
                            
                            return { content: [{ type: "text", text: JSON.stringify({
                                query,
                                type: "semantic",
                                engine: dbConfig?.vectorBackend || "embeddings",
                                count: vectorResults.length,
                                results: vectorResults.map((r: any) => {
                                    const mem = memMap.get(r.refId);
                                    return {
                                        id: r.refId,
                                        content: mem?.content?.slice(0, 100) || r.content?.slice(0, 100),
                                        distance: r.distance,
                                        intent: mem?.intent,
                                        entities: mem ? JSON.parse(mem.entities || "[]") : []
                                    };
                                })
                            }) }] };
                        }
                    }
                    
                    // Fallback to enhanced keyword search with query expansion
                    const expanded = expandQuery(query);
                    const results: any[] = [];
                    
                    expanded.forEach(q => {
                        const found = db.prepare(`
                            SELECT *, content || ' ' || response as full_text
                            FROM LongTermMemory 
                            WHERE userId = ? AND (content LIKE ? OR summary LIKE ? OR response LIKE ?)
                            ORDER BY priority DESC
                            LIMIT ?
                        `).all(userId, `%${q}%`, `%${q}%`, `%${q}%`, limit) as any[];
                        
                        found.forEach(f => {
                            if (!results.find(r => r.id === f.id)) {
                                f.score = relevanceScore(f.full_text || "", query);
                                results.push(f);
                            }
                        });
                    });
                    
                    results.sort((a, b) => (b.score || 0) - (a.score || 0));
                    
                    return { content: [{ type: "text", text: JSON.stringify({
                        query,
                        type: "semantic_fallback",
                        engine: hasVector ? "vector_no_results" : "keyword_expanded",
                        embeddingConfigured: !!process.env.EMBEDDING_URL,
                        count: results.length,
                        results: results.slice(0, limit).map(r => ({
                            id: r.id,
                            content: r.content?.slice(0, 100),
                            score: r.score,
                            intent: r.intent,
                            entities: JSON.parse(r.entities || "[]")
                        }))
                    }) }] };
                }
                
                // =============================================
                // THREAD: Get memory with FULL linked context chain
                // This is the KEY feature for robust memory
                // =============================================
                case "thread": {
                    const { memoryId, depth } = args;
                    if (!memoryId) return { content: [{ type: "text", text: "memoryId required" }], isError: true };
                    
                    const maxDepth = Math.min(depth ?? 2, 5); // Limit depth to prevent infinite loops
                    
                    // Get the root memory
                    const root = db.prepare(`SELECT * FROM LongTermMemory WHERE id = ?`).get(memoryId) as any;
                    if (!root) return { content: [{ type: "text", text: "Memory not found" }], isError: true };
                    
                    // Build thread recursively
                    const buildThread = (memId: string, currentDepth: number, visited: Set<string>): any[] => {
                        if (currentDepth >= maxDepth || visited.has(memId)) return [];
                        visited.add(memId);
                        
                        const mem = db.prepare(`SELECT * FROM LongTermMemory WHERE id = ?`).get(memId) as any;
                        if (!mem) return [];
                        
                        // Get all linked memories
                        const links = db.prepare(`
                            SELECT m2.*, l.relationship, l.strength
                            FROM MemoryLinks l
                            JOIN LongTermMemory m2 ON m2.id = l.memoryId2
                            WHERE l.memoryId1 = ? AND l.strength >= 0.5
                            ORDER BY l.strength DESC
                            LIMIT 5
                        `).all(memId) as any[];
                        
                        const thread = {
                            id: mem.id,
                            content: mem.content,
                            response: mem.response,
                            summary: mem.summary,
                            intent: mem.intent,
                            entities: JSON.parse(mem.entities || "[]"),
                            priority: Math.round((mem.priority || 0.5) * 100) + "%",
                            created: mem.createdAt,
                            depth: currentDepth,
                            linked: links.map(l => ({
                                id: l.id,
                                preview: l.content?.slice(0, 80),
                                relationship: l.relationship,
                                strength: l.strength
                            })),
                            children: [] as any[]
                        };
                        
                        // Recursively get children
                        for (const link of links.slice(0, 3)) {
                            if (!visited.has(link.id)) {
                                thread.children.push(...buildThread(link.id, currentDepth + 1, visited));
                            }
                        }
                        
                        return [thread];
                    };
                    
                    const visited = new Set<string>();
                    const thread = buildThread(memoryId, 0, visited);
                    
                    // Also boost access count for this memory
                    db.prepare(`UPDATE LongTermMemory SET accessCount = accessCount + 1 WHERE id = ?`).run(memoryId);
                    
                    return { content: [{ type: "text", text: JSON.stringify({
                        root: memoryId,
                        depth: maxDepth,
                        nodesVisited: visited.size,
                        thread
                    }) }] };
                }
                
                // =============================================
                // HEALTH: Memory health check & optimization
                // =============================================
                case "health": {
                    // Gather health metrics
                    const total = db.prepare(`SELECT COUNT(*) as c FROM LongTermMemory WHERE userId = ?`).get(userId) as any;
                    const orphaned = db.prepare(`
                        SELECT COUNT(*) as c FROM LongTermMemory m
                        LEFT JOIN MemoryLinks l ON m.id = l.memoryId1 OR m.id = l.memoryId2
                        WHERE m.userId = ? AND l.id IS NULL
                    `).get(userId) as any;
                    const lowPriority = db.prepare(`SELECT COUNT(*) as c FROM LongTermMemory WHERE userId = ? AND priority < 0.3`).get(userId) as any;
                    const highAccess = db.prepare(`SELECT COUNT(*) as c FROM LongTermMemory WHERE userId = ? AND accessCount > 5`).get(userId) as any;
                    const linkStats = db.prepare(`
                        SELECT COUNT(*) as total, AVG(strength) as avgStrength,
                               COUNT(DISTINCT memoryId1) as linkedFrom
                        FROM MemoryLinks
                    `).get() as any;
                    const intentBreakdown = db.prepare(`
                        SELECT intent, COUNT(*) as c FROM LongTermMemory 
                        WHERE userId = ? GROUP BY intent ORDER BY c DESC
                    `).all(userId) as any;
                    const entityFreq = db.prepare(`
                        SELECT entities FROM LongTermMemory WHERE userId = ?
                    `).all(userId) as any[];
                    
                    // Count entity frequency
                    const entityCounts: Record<string, number> = {};
                    entityFreq.forEach((m: any) => {
                        const ents = JSON.parse(m.entities || "[]");
                        ents.forEach((e: string) => { entityCounts[e] = (entityCounts[e] || 0) + 1; });
                    });
                    const topEntities = Object.entries(entityCounts)
                        .sort((a, b) => b[1] - a[1]).slice(0, 10)
                        .map(([e, c]) => ({ entity: e, count: c }));
                    
                    // Calculate health score
                    const linkScore = Math.min(100, (linkStats?.linkedFrom || 0) / Math.max(1, total?.c || 1) * 100);
                    const priorityScore = 100 - (lowPriority?.c || 0) * 5;
                    const connectionScore = 100 - (orphaned?.c || 0) * 10;
                    const healthScore = Math.round((linkScore + priorityScore + connectionScore) / 3);
                    
                    // Generate suggestions
                    const suggestions: string[] = [];
                    if (orphaned?.c > total?.c * 0.3) suggestions.push("Many orphaned memories - consider linking related ones");
                    if (lowPriority?.c > total?.c * 0.5) suggestions.push("Too many low-priority memories - boost important ones");
                    if (!linkStats?.total) suggestions.push("No memory links yet - auto-linking should create them");
                    if (healthScore < 50) suggestions.push("Memory health is poor - engage more with your memories");
                    if (healthScore >= 80) suggestions.push("Memory system is healthy! Keep using it");
                    
                    return { content: [{ type: "text", text: JSON.stringify({
                        score: healthScore,
                        status: healthScore >= 80 ? "healthy" : healthScore >= 50 ? "fair" : "needs attention",
                        metrics: {
                            totalMemories: total?.c || 0,
                            totalLinks: linkStats?.total || 0,
                            avgLinkStrength: linkStats?.avgStrength?.toFixed(2) || "N/A",
                            orphanedMemories: orphaned?.c || 0,
                            lowPriorityMemories: lowPriority?.c || 0,
                            highAccessMemories: highAccess?.c || 0,
                            memoriesWithLinks: linkStats?.linkedFrom || 0
                        },
                        topIntents: intentBreakdown.slice(0, 5).map((i: any) => ({ intent: i.intent, count: i.c })),
                        topEntities,
                        suggestions
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
                            shortTerm: "20%",
                            longTerm: "75%"
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
                
                // =============================================
                // DECAY: Decay unused memories, boost frequently accessed
                // Smart forgetting for long-term memory optimization
                // =============================================
                case "decay": {
                    const { daysUnused = 7, decayRate = 0.05 } = args;
                    
                    // Decay memories not accessed in N days
                    const cutoff = new Date(Date.now() - daysUnused * 24 * 60 * 60 * 1000).toISOString();
                    
                    // Find memories to decay
                    const toDecay = db.prepare(`
                        SELECT id, priority, accessCount, lastAccessedAt FROM LongTermMemory 
                        WHERE userId = ? AND lastAccessedAt < ? AND isPinned = 0
                    `).all(userId, cutoff) as any[];
                    
                    // Decay them
                    let decayed = 0;
                    toDecay.forEach((m: any) => {
                        if (m.priority > 0.1) {
                            db.prepare(`
                                UPDATE LongTermMemory SET priority = MAX(0.1, priority - ?) WHERE id = ?
                            `).run(decayRate, m.id);
                            decayed++;
                        }
                    });
                    
                    // Boost memories that are frequently accessed but have low priority
                    const toBoost = db.prepare(`
                        SELECT id, priority, accessCount FROM LongTermMemory 
                        WHERE userId = ? AND accessCount > 3 AND priority < 0.6 AND isPinned = 0
                    `).all(userId) as any[];
                    
                    let boosted = 0;
                    toBoost.forEach((m: any) => {
                        const boost = Math.min(0.2, m.accessCount * 0.02);
                        db.prepare(`
                            UPDATE LongTermMemory SET priority = MIN(1.0, priority + ?) WHERE id = ?
                        `).run(boost, m.id);
                        boosted++;
                    });
                    
                    return { content: [{ type: "text", text: JSON.stringify({
                        action: "decay_completed",
                        decayed,
                        boosted,
                        cutoff: `${daysUnused} days unused`,
                        decayRate: `${decayRate * 100}%`,
                        message: decayed > 0 
                            ? `Decayed ${decayed} unused memories, boosted ${boosted} frequently accessed ones`
                            : "Memory is well maintained - no decay needed"
                    }) }] };
                }
                
                // =============================================
                // PERSONA: User personality & preferences
                // =============================================
                case "persona": {
                    const { traits, style } = args;
                    
                    // Get or create persona
                    let persona = db.prepare(`SELECT * FROM UserPersona WHERE userId = ?`).get(userId) as any;
                    
                    if (!persona) {
                        const id = `persona_${Date.now()}`;
                        db.prepare(`
                            INSERT INTO UserPersona (id, userId, traits, communicationStyle, createdAt)
                            VALUES (?, ?, ?, ?, ?)
                        `).run(id, userId, JSON.stringify({}), style || "friendly", new Date().toISOString());
                        persona = { id, userId, traits: "{}", communicationStyle: style || "friendly" };
                    }
                    
                    // Update if provided
                    if (traits || style) {
                        const updates: string[] = [];
                        const values: any[] = [];
                        
                        if (traits) {
                            const existingTraits = JSON.parse(persona.traits || "{}");
                            const newTraits = { ...existingTraits, ...traits };
                            updates.push("traits = ?");
                            values.push(JSON.stringify(newTraits));
                        }
                        if (style) {
                            updates.push("communicationStyle = ?");
                            values.push(style);
                        }
                        updates.push("updatedAt = ?");
                        values.push(new Date().toISOString());
                        values.push(userId);
                        
                        db.prepare(`UPDATE UserPersona SET ${updates.join(", ")} WHERE userId = ?`).run(...values);
                    }
                    
                    // Reload persona
                    persona = db.prepare(`SELECT * FROM UserPersona WHERE userId = ?`).get(userId) as any;
                    
                    // Get recent mood
                    const recentMood = db.prepare(`
                        SELECT mood, createdAt FROM EmotionalMemory WHERE userId = ? 
                        ORDER BY createdAt DESC LIMIT 1
                    `).get(userId) as any;
                    
                    // Get learning stats
                    const learningStats = db.prepare(`
                        SELECT COUNT(*) as patterns, AVG(confidence) as avgConfidence 
                        FROM LearningLog WHERE userId = ?
                    `).get(userId) as any;
                    
                    return { content: [{ type: "text", text: JSON.stringify({
                        personality: {
                            traits: JSON.parse(persona?.traits || "{}"),
                            style: persona?.communicationStyle || "friendly",
                            workStyle: persona?.workStyle || "collaborative"
                        },
                        currentMood: recentMood?.mood || "unknown",
                        moodHistory: persona?.moodHistory ? JSON.parse(persona.moodHistory) : [],
                        learningStats: {
                            patternsLearned: learningStats?.patterns || 0,
                            confidence: learningStats?.avgConfidence?.toFixed(2) || "0.50"
                        },
                        created: persona?.createdAt
                    }) }] };
                }
                
                // =============================================
                // MOOD: Track emotional state
                // =============================================
                case "mood": {
                    const { mood, intensity = 5, context } = args;
                    if (!mood) return { content: [{ type: "text", text: "mood required" }], isError: true };
                    
                    const validMoods = ["happy", "sad", "excited", "frustrated", "calm", "anxious", "confused", "satisfied", "tired", "energized"];
                    const normalizedMood = validMoods.includes(mood.toLowerCase()) ? mood.toLowerCase() : "neutral";
                    
                    // Record emotional memory
                    const id = `emotion_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
                    db.prepare(`
                        INSERT INTO EmotionalMemory (id, userId, mood, intensity, context, sessionId, createdAt)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `).run(id, userId, normalizedMood, Math.min(10, Math.max(1, intensity)), context || "", sessionId || "", new Date().toISOString());
                    
                    // Update persona mood
                    db.prepare(`UPDATE UserPersona SET lastMood = ?, updatedAt = ? WHERE userId = ?`)
                        .run(normalizedMood, new Date().toISOString(), userId);
                    
                    // Detect triggers from recent high-intensity memories
                    const triggers = db.prepare(`
                        SELECT content FROM LongTermMemory 
                        WHERE userId = ? AND intent IN ('error', 'success') 
                        ORDER BY createdAt DESC LIMIT 3
                    `).all(userId) as any[];
                    
                    // Learn from this mood
                    const existingMood = db.prepare(`
                        SELECT * FROM LearningLog WHERE userId = ? AND type = 'mood' AND pattern = ?
                    `).get(userId, normalizedMood) as any;
                    
                    if (existingMood) {
                        db.prepare(`
                            UPDATE LearningLog SET usageCount = usageCount + 1, lastUsedAt = ? WHERE id = ?
                        `).run(new Date().toISOString(), existingMood.id);
                    } else {
                        db.prepare(`
                            INSERT INTO LearningLog (id, userId, type, pattern, confidence, createdAt)
                            VALUES (?, ?, 'mood', ?, 0.5, ?)
                        `).run(`learn_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, userId, normalizedMood, new Date().toISOString());
                    }
                    
                    return { content: [{ type: "text", text: JSON.stringify({
                        recorded: true,
                        mood: normalizedMood,
                        intensity,
                        triggers: triggers.map(t => t.content?.slice(0, 50)),
                        suggestion: normalizedMood === "frustrated" ? "Take a break, you seem stressed" :
                                   normalizedMood === "excited" ? "Great energy! Channel it into important tasks" :
                                   normalizedMood === "sad" ? "Remember: tough times pass" :
                                   "Keep going, you're doing great!"
                    }) }] };
                }
                
                // =============================================
                // LEARN: Adaptive learning patterns
                // =============================================
                case "learn": {
                    const { type, pattern, data } = args;
                    
                    // Learn a pattern
                    if (type && pattern) {
                        const id = `learn_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
                        db.prepare(`
                            INSERT INTO LearningLog (id, userId, type, pattern, data, confidence, createdAt)
                            VALUES (?, ?, ?, ?, ?, 0.5, ?)
                        `).run(id, userId, type, pattern, JSON.stringify(data || {}), new Date().toISOString());
                    }
                    
                    // Get all learning patterns
                    const patterns = db.prepare(`
                        SELECT * FROM LearningLog WHERE userId = ? ORDER BY usageCount DESC, confidence DESC
                    `).all(userId) as any[];
                    
                    // Group by type
                    const byType: Record<string, any[]> = {};
                    patterns.forEach((p: any) => {
                        if (!byType[p.type]) byType[p.type] = [];
                        byType[p.type].push({
                            pattern: p.pattern,
                            confidence: p.confidence,
                            usageCount: p.usageCount,
                            lastUsed: p.lastUsedAt
                        });
                    });
                    
                    // Update confidence based on usage
                    patterns.forEach((p: any) => {
                        const newConf = Math.min(1, 0.3 + (p.usageCount * 0.1));
                        db.prepare(`UPDATE LearningLog SET confidence = ? WHERE id = ?`).run(newConf, p.id);
                    });
                    
                    return { content: [{ type: "text", text: JSON.stringify({
                        totalPatterns: patterns.length,
                        byCategory: byType,
                        topPatterns: patterns.slice(0, 5).map((p: any) => ({
                            type: p.type,
                            pattern: p.pattern,
                            confidence: p.confidence.toFixed(2)
                        })),
                        learningTip: patterns.length > 10 ? 
                            "You're building a rich understanding of patterns!" :
                            "Keep interacting - I'll learn your patterns over time"
                    }) }] };
                }
                
                // =============================================
                // REMIND: Proactive memory reminders
                // =============================================
                case "remind": {
                    const { reminderType, title, description, memoryId, priority = 5 } = args;
                    
                    // Get pending reminders
                    if (!reminderType && !title) {
                        const pending = db.prepare(`
                            SELECT * FROM MemoryReminders 
                            WHERE userId = ? AND status = 'pending' 
                            AND (snoozedUntil IS NULL OR snoozedUntil < ?)
                            ORDER BY priority DESC, createdAt DESC
                            LIMIT 10
                        `).all(userId, new Date().toISOString()) as any[];
                        
                        return { content: [{ type: "text", text: JSON.stringify({
                            count: pending.length,
                            reminders: pending.map((r: any) => ({
                                id: r.id,
                                type: r.reminderType,
                                title: r.title,
                                description: r.description,
                                priority: r.priority,
                                created: r.createdAt
                            }))
                        }) }] };
                    }
                    
                    // Create reminder
                    if (reminderType && title) {
                        const id = `remind_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
                        db.prepare(`
                            INSERT INTO MemoryReminders (id, userId, memoryId, reminderType, title, description, priority, createdAt)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        `).run(id, userId, memoryId || "", reminderType, title, description || "", priority, new Date().toISOString());
                        
                        return { content: [{ type: "text", text: JSON.stringify({
                            created: true,
                            id,
                            reminderType,
                            title
                        }) }] };
                    }
                    
                    // Snooze or complete
                    if (args.memoryId && args.mood) {
                        const action = args.mood;
                        if (action === "snooze") {
                            const snoozeUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                            db.prepare(`UPDATE MemoryReminders SET snoozedUntil = ? WHERE id = ?`).run(snoozeUntil, args.memoryId);
                            return { content: [{ type: "text", text: JSON.stringify({ snoozed: true, until: snoozeUntil }) }] };
                        }
                        if (action === "done") {
                            db.prepare(`UPDATE MemoryReminders SET status = 'completed', completedAt = ? WHERE id = ?`)
                                .run(new Date().toISOString(), args.memoryId);
                            return { content: [{ type: "text", text: JSON.stringify({ completed: true }) }] };
                        }
                    }
                    
                    return { content: [{ type: "text", text: "Use remind without args to get pending, or with reminderType+title to create" }] };
                }
                
                // =============================================
                // SUGGEST: Proactive suggestions based on patterns
                // =============================================
                case "suggest": {
                    // Get recent mood
                    const recentMood = db.prepare(`
                        SELECT mood, intensity, context FROM EmotionalMemory 
                        WHERE userId = ? ORDER BY createdAt DESC LIMIT 1
                    `).get(userId) as any;
                    
                    // Get high-priority unaccessed memories
                    const highPriority = db.prepare(`
                        SELECT id, content, intent FROM LongTermMemory 
                        WHERE userId = ? AND priority >= 0.7 AND accessCount < 2
                        ORDER BY priority DESC LIMIT 3
                    `).all(userId) as any[];
                    
                    // Get learning patterns for suggestions
                    const patterns = db.prepare(`
                        SELECT pattern, confidence FROM LearningLog 
                        WHERE userId = ? ORDER BY confidence DESC LIMIT 5
                    `).all(userId) as any[];
                    
                    // Get pending reminders
                    const pendingReminders = db.prepare(`
                        SELECT COUNT(*) as c FROM MemoryReminders 
                        WHERE userId = ? AND status = 'pending'
                    `).get(userId) as any;
                    
                    // Get error memories that need follow-up
                    const unresolvedErrors = db.prepare(`
                        SELECT id, content FROM LongTermMemory 
                        WHERE userId = ? AND intent = 'error' AND accessCount < 3
                        ORDER BY createdAt DESC LIMIT 2
                    `).all(userId) as any[];
                    
                    // Build suggestions
                    const suggestions: { type: string; text: string; priority: number }[] = [];
                    
                    // Mood-based
                    if (recentMood?.mood === "frustrated" && recentMood?.intensity > 7) {
                        suggestions.push({ type: "care", text: "You seem stressed. Remember to take breaks!", priority: 10 });
                    }
                    if (recentMood?.mood === "excited") {
                        suggestions.push({ type: "energy", text: "Great energy! Perfect time for tackling difficult tasks.", priority: 8 });
                    }
                    
                    // Reminder-based
                    if (pendingReminders?.c > 0) {
                        suggestions.push({ type: "reminder", text: `You have ${pendingReminders.c} pending reminder(s)`, priority: 7 });
                    }
                    
                    // Error follow-up
                    if (unresolvedErrors.length > 0) {
                        suggestions.push({ type: "followup", text: "You have unresolved errors - want to check on them?", priority: 9 });
                    }
                    
                    // Learning suggestions
                    patterns.forEach((p: any) => {
                        if (p.confidence > 0.7) {
                            suggestions.push({ type: "learned", text: `I notice you often ${p.pattern} - keep it up!`, priority: 5 });
                        }
                    });
                    
                    // High priority memories
                    if (highPriority.length > 0) {
                        suggestions.push({ type: "memory", text: `You have ${highPriority.length} important memory(ies) to revisit`, priority: 6 });
                    }
                    
                    // Generic
                    if (suggestions.length === 0) {
                        const timeOfDay = new Date().getHours();
                        if (timeOfDay < 12) {
                            suggestions.push({ type: "morning", text: "Good morning! Ready to make progress today?", priority: 3 });
                        } else if (timeOfDay < 18) {
                            suggestions.push({ type: "afternoon", text: "Afternoon check-in: How's it going?", priority: 3 });
                        } else {
                            suggestions.push({ type: "evening", text: "Wrapping up for today? Any loose ends?", priority: 3 });
                        }
                    }
                    
                    // Sort by priority
                    suggestions.sort((a, b) => b.priority - a.priority);
                    
                    return { content: [{ type: "text", text: JSON.stringify({
                        currentMood: recentMood?.mood || "unknown",
                        suggestions: suggestions.slice(0, 5),
                        stats: {
                            pendingReminders: pendingReminders?.c || 0,
                            patternsLearned: patterns.length,
                            highPriorityMemories: highPriority.length
                        }
                    }) }] };
                }
                
                // =============================================
                // GRAPH: Knowledge graph visualization data
                // Export memory network as nodes and edges
                // =============================================
                case "graph": {
                    const { depth = 2, focusMemoryId } = args;
                    
                    // Get all memories for this user
                    const memories = db.prepare(`
                        SELECT id, content, intent, entities, priority, createdAt 
                        FROM LongTermMemory WHERE userId = ? ORDER BY createdAt DESC LIMIT 100
                    `).all(userId) as any[];
                    
                    // Get all links
                    const memoryIds = memories.map((m: any) => m.id);
                    let links: any[] = [];
                    
                    if (memoryIds.length > 0) {
                        const placeholders = memoryIds.map(() => '?').join(',');
                        links = db.prepare(`
                            SELECT memoryId1, memoryId2, relationship, strength 
                            FROM MemoryLinks 
                            WHERE memoryId1 IN (${placeholders}) OR memoryId2 IN (${placeholders})
                        `).all(...memoryIds, ...memoryIds) as any[];
                    }
                    
                    // Build entity frequency map
                    const entityMap: Record<string, string[]> = {};
                    memories.forEach((m: any) => {
                        const entities = JSON.parse(m.entities || "[]");
                        entities.forEach((e: string) => {
                            if (!entityMap[e]) entityMap[e] = [];
                            entityMap[e].push(m.id);
                        });
                    });
                    
                    // Format as nodes and edges for graph visualization
                    const nodes = memories.map((m: any) => ({
                        id: m.id,
                        label: m.content?.slice(0, 50) || "",
                        intent: m.intent,
                        priority: m.priority,
                        entities: JSON.parse(m.entities || "[]"),
                        created: m.createdAt
                    }));
                    
                    const edges = links.map((l: any) => ({
                        source: l.memoryId1,
                        target: l.memoryId2,
                        type: l.relationship,
                        strength: l.strength
                    }));
                    
                    // Find clusters (memories sharing entities)
                    const clusters = Object.entries(entityMap)
                        .filter(([_, ids]) => ids.length > 1)
                        .map(([entity, ids]) => ({ entity, memories: ids.length }));
                    
                    return { content: [{ type: "text", text: JSON.stringify({
                        stats: {
                            totalMemories: memories.length,
                            totalLinks: links.length,
                            totalEntities: Object.keys(entityMap).length,
                            clusters: clusters.length
                        },
                        nodes,
                        edges,
                        clusters: clusters.slice(0, 10),
                        entityMap
                    }) }] };
                }
                
                // =============================================
                // DEDUP: Find and merge duplicate memories
                // =============================================
                case "dedup": {
                    const { threshold = 0.8, autoMerge = false } = args;
                    
                    // Find potential duplicates based on content similarity
                    const memories = db.prepare(`
                        SELECT id, content, entities, intent, priority 
                        FROM LongTermMemory WHERE userId = ? ORDER BY createdAt DESC LIMIT 50
                    `).all(userId) as any[];
                    
                    const duplicates: { original: any; duplicate: any; similarity: number }[] = [];
                    
                    for (let i = 0; i < memories.length; i++) {
                        for (let j = i + 1; j < Math.min(i + 10, memories.length); j++) {
                            const m1 = memories[i];
                            const m2 = memories[j];
                            
                            // Calculate simple similarity
                            const words1 = new Set((m1.content || "").toLowerCase().split(/\s+/));
                            const words2 = new Set((m2.content || "").toLowerCase().split(/\s+/));
                            const intersection = new Set([...words1].filter(x => words2.has(x)));
                            const union = new Set([...words1, ...words2]);
                            const similarity = intersection.size / union.size;
                            
                            if (similarity >= threshold) {
                                duplicates.push({
                                    original: { id: m1.id, content: m1.content?.slice(0, 50) },
                                    duplicate: { id: m2.id, content: m2.content?.slice(0, 50) },
                                    similarity: Math.round(similarity * 100) / 100
                                });
                            }
                        }
                    }
                    
                    let merged = 0;
                    if (autoMerge && duplicates.length > 0) {
                        // Merge duplicates - keep higher priority, update links
                        for (const dup of duplicates) {
                            const orig = db.prepare(`SELECT * FROM LongTermMemory WHERE id = ?`).get(dup.original.id) as any;
                            const dupe = db.prepare(`SELECT * FROM LongTermMemory WHERE id = ?`).get(dup.duplicate.id) as any;
                            
                            if (orig && dupe) {
                                // Update links from duplicate to original
                                db.prepare(`
                                    UPDATE MemoryLinks SET memoryId2 = ? WHERE memoryId2 = ?
                                `).run(orig.id, dupe.id);
                                
                                // Merge entities
                                const origEnts = JSON.parse(orig.entities || "[]");
                                const dupeEnts = JSON.parse(dupe.entities || "[]");
                                const mergedEnts = [...new Set([...origEnts, ...dupeEnts])];
                                
                                db.prepare(`UPDATE LongTermMemory SET entities = ?, priority = MAX(?, ?) WHERE id = ?`)
                                    .run(JSON.stringify(mergedEnts), orig.priority, dupe.priority, orig.id);
                                
                                // Delete duplicate
                                db.prepare(`DELETE FROM LongTermMemory WHERE id = ?`).run(dupe.id);
                                merged++;
                            }
                        }
                    }
                    
                    return { content: [{ type: "text", text: JSON.stringify({
                        found: duplicates.length,
                        merged: autoMerge ? merged : "skipped",
                        autoMerge,
                        threshold,
                        duplicates: duplicates.slice(0, 10)
                    }) }] };
                }
                
                // =============================================
                // BACKUP: Export memories to JSON
                // =============================================
                case "backup": {
                    const { includeLinks = true, includePersona = true, includeMood = true } = args;
                    
                    const backup: any = {
                        version: "1.0",
                        timestamp: new Date().toISOString(),
                        userId
                    };
                    
                    // Backup memories
                    const memories = db.prepare(`
                        SELECT * FROM LongTermMemory WHERE userId = ?
                    `).all(userId) as any[];
                    backup.memories = memories;
                    
                    // Backup links
                    if (includeLinks) {
                        const memoryIds = memories.map((m: any) => m.id);
                        if (memoryIds.length > 0) {
                            const placeholders = memoryIds.map(() => '?').join(',');
                            backup.links = db.prepare(`
                                SELECT * FROM MemoryLinks WHERE memoryId1 IN (${placeholders})
                            `).all(...memoryIds) as any[];
                        }
                    }
                    
                    // Backup persona
                    if (includePersona) {
                        backup.persona = db.prepare(`SELECT * FROM UserPersona WHERE userId = ?`).get(userId);
                    }
                    
                    // Backup mood history
                    if (includeMood) {
                        backup.emotions = db.prepare(`
                            SELECT * FROM EmotionalMemory WHERE userId = ? ORDER BY createdAt DESC LIMIT 100
                        `).all(userId) as any[];
                    }
                    
                    // Backup reminders
                    backup.reminders = db.prepare(`
                        SELECT * FROM MemoryReminders WHERE userId = ? AND status = 'pending'
                    `).all(userId) as any[];
                    
                    // Backup learning
                    backup.learning = db.prepare(`
                        SELECT * FROM LearningLog WHERE userId = ?
                    `).all(userId) as any[];
                    
                    return { content: [{ type: "text", text: JSON.stringify({
                        backupSize: JSON.stringify(backup).length,
                        stats: {
                            memories: backup.memories?.length || 0,
                            links: backup.links?.length || 0,
                            emotions: backup.emotions?.length || 0,
                            reminders: backup.reminders?.length || 0,
                            learning: backup.learning?.length || 0
                        },
                        download: Buffer.from(JSON.stringify(backup, null, 2)).toString('base64')
                    }) }] };
                }
                
                // =============================================
                // RESTORE: Import memories from JSON backup
                // =============================================
                case "restore": {
                    const { backupData, merge = true } = args;
                    
                    if (!backupData) {
                        return { content: [{ type: "text", text: "backupData required" }], isError: true };
                    }
                    
                    let backup: any;
                    try {
                        // Try base64 first, then JSON
                        try {
                            backup = JSON.parse(Buffer.from(backupData, 'base64').toString());
                        } catch {
                            backup = JSON.parse(backupData);
                        }
                    } catch {
                        return { content: [{ type: "text", text: "Invalid backup data format" }], isError: true };
                    }
                    
                    let restored = { memories: 0, links: 0, emotions: 0, reminders: 0, learning: 0, skipped: 0 };
                    
                    // Restore memories
                    if (backup.memories) {
                        for (const mem of backup.memories) {
                            const existing = db.prepare(`SELECT id FROM LongTermMemory WHERE id = ?`).get(mem.id);
                            if (existing && merge) {
                                restored.skipped++;
                                continue;
                            }
                            db.prepare(`
                                INSERT OR REPLACE INTO LongTermMemory 
                                (id, userId, projectId, content, summary, response, intent, entities, priority, createdAt)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            `).run(
                                mem.id, userId, mem.projectId, mem.content, mem.summary, mem.response,
                                mem.intent, mem.entities, mem.priority, mem.createdAt
                            );
                            restored.memories++;
                        }
                    }
                    
                    // Restore links
                    if (backup.links) {
                        for (const link of backup.links) {
                            db.prepare(`
                                INSERT OR IGNORE INTO MemoryLinks (id, memoryId1, memoryId2, relationship, strength, createdAt)
                                VALUES (?, ?, ?, ?, ?, ?)
                            `).run(link.id, link.memoryId1, link.memoryId2, link.relationship, link.strength, link.createdAt);
                            restored.links++;
                        }
                    }
                    
                    // Restore emotions
                    if (backup.emotions) {
                        for (const emotion of backup.emotions) {
                            db.prepare(`
                                INSERT OR IGNORE INTO EmotionalMemory 
                                (id, userId, mood, intensity, context, createdAt)
                                VALUES (?, ?, ?, ?, ?, ?)
                            `).run(emotion.id, userId, emotion.mood, emotion.intensity, emotion.context, emotion.createdAt);
                            restored.emotions++;
                        }
                    }
                    
                    // Restore reminders
                    if (backup.reminders) {
                        for (const reminder of backup.reminders) {
                            db.prepare(`
                                INSERT OR IGNORE INTO MemoryReminders 
                                (id, userId, memoryId, reminderType, title, description, priority, createdAt)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            `).run(reminder.id, userId, reminder.memoryId, reminder.reminderType, reminder.title, reminder.description, reminder.priority, reminder.createdAt);
                            restored.reminders++;
                        }
                    }
                    
                    // Restore learning
                    if (backup.learning) {
                        for (const learn of backup.learning) {
                            db.prepare(`
                                INSERT OR IGNORE INTO LearningLog 
                                (id, userId, type, pattern, data, confidence, usageCount, createdAt)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            `).run(learn.id, userId, learn.type, learn.pattern, learn.data, learn.confidence, learn.usageCount, learn.createdAt);
                            restored.learning++;
                        }
                    }
                    
                    return { content: [{ type: "text", text: JSON.stringify({
                        restored,
                        mergeMode: merge
                    }) }] };
                }
                
                // =============================================
                // IMPORTANCE: Calculate memory importance score
                // Based on: access count, links, priority, recency
                // =============================================
                case "importance": {
                    const { memoryId } = args;
                    
                    if (memoryId) {
                        // Score single memory
                        const mem = db.prepare(`
                            SELECT * FROM LongTermMemory WHERE id = ? AND userId = ?
                        `).get(memoryId, userId) as any;
                        
                        if (!mem) return { content: [{ type: "text", text: "Memory not found" }], isError: true };
                        
                        // Calculate importance
                        const linkCount = db.prepare(`
                            SELECT COUNT(*) as c FROM MemoryLinks WHERE memoryId1 = ? OR memoryId2 = ?
                        `).get(memoryId, memoryId) as any;
                        
                        const daysSinceCreated = (Date.now() - new Date(mem.createdAt).getTime()) / (1000 * 60 * 60 * 24);
                        const daysSinceAccessed = mem.lastAccessedAt 
                            ? (Date.now() - new Date(mem.lastAccessedAt).getTime()) / (1000 * 60 * 60 * 24)
                            : daysSinceCreated;
                        
                        // Importance formula
                        const accessScore = Math.min(1, mem.accessCount / 10);
                        const linkScore = Math.min(1, (linkCount?.c || 0) / 5);
                        const priorityScore = mem.priority;
                        const recencyScore = Math.max(0, 1 - (daysSinceAccessed / 30));
                        const intentBonus = ["error", "learning", "success"].includes(mem.intent) ? 0.1 : 0;
                        
                        const importance = Math.round((accessScore * 0.25 + linkScore * 0.25 + priorityScore * 0.25 + recencyScore * 0.2 + intentBonus) * 100);
                        
                        return { content: [{ type: "text", text: JSON.stringify({
                            memoryId,
                            importance,
                            rating: importance >= 80 ? "critical" : importance >= 60 ? "important" : importance >= 40 ? "normal" : "low",
                            breakdown: {
                                accessScore: Math.round(accessScore * 100),
                                linkScore: Math.round(linkScore * 100),
                                priorityScore: Math.round(priorityScore * 100),
                                recencyScore: Math.round(recencyScore * 100),
                                intentBonus: Math.round(intentBonus * 100)
                            },
                            metrics: {
                                accessCount: mem.accessCount,
                                linkCount: linkCount?.c || 0,
                                daysSinceCreated: Math.round(daysSinceCreated),
                                daysSinceAccessed: Math.round(daysSinceAccessed)
                            }
                        }) }] };
                    } else {
                        // Score all memories and return ranking
                        const memories = db.prepare(`
                            SELECT id, content, intent, priority, accessCount, createdAt, lastAccessedAt
                            FROM LongTermMemory WHERE userId = ?
                        `).all(userId) as any[];
                        
                        const scored = memories.map((mem: any) => {
                            const daysSinceCreated = (Date.now() - new Date(mem.createdAt).getTime()) / (1000 * 60 * 60 * 24);
                            const daysSinceAccessed = mem.lastAccessedAt 
                                ? (Date.now() - new Date(mem.lastAccessedAt).getTime()) / (1000 * 60 * 60 * 24)
                                : daysSinceCreated;
                            
                            const accessScore = Math.min(1, mem.accessCount / 10);
                            const priorityScore = mem.priority;
                            const recencyScore = Math.max(0, 1 - (daysSinceAccessed / 30));
                            const intentBonus = ["error", "learning", "success"].includes(mem.intent) ? 0.1 : 0;
                            
                            const importance = Math.round((accessScore * 0.3 + priorityScore * 0.3 + recencyScore * 0.3 + intentBonus) * 100);
                            
                            return { id: mem.id, content: mem.content?.slice(0, 50), importance, intent: mem.intent };
                        });
                        
                        scored.sort((a: any, b: any) => b.importance - a.importance);
                        
                        return { content: [{ type: "text", text: JSON.stringify({
                            total: scored.length,
                            critical: scored.filter((m: any) => m.importance >= 80).length,
                            important: scored.filter((m: any) => m.importance >= 60 && m.importance < 80).length,
                            normal: scored.filter((m: any) => m.importance >= 40 && m.importance < 60).length,
                            low: scored.filter((m: any) => m.importance < 40).length,
                            top10: scored.slice(0, 10)
                        }) }] };
                    }
                }
                
                default:
                    return { content: [{ type: "text", text: `Unknown op: ${op}. Available: remember, recall, history, context, stats, cleanup, boost, pin, inspect, export, import, insights, trim, analytics, link, all, recent, search` }], isError: true };
            }
        } catch (err: any) {
            return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
        }
    }
};
