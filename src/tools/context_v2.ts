// =============================================
// TOOL: context (better, chat_add, chat_get, chat_summary, get_summary)
// =============================================
import { db } from "../db/sqlite.js";

export const contextTool = {
    name: "context",
    description: `## Unified Context Tool

**Purpose:** Get comprehensive context for conversations.

**Operations:**
| Op | Description |
|----|-------------|
| better | All-in-one context |
| chat_add | Add chat message |
| chat_get | Get chat history |
| chat_summary | Store summary |
| get_summary | Get summaries |

**Examples:**
\`\`\`json
{ "op": "better", "userId": "u1", "timeRange": "week" }
{ "op": "chat_add", "userId": "u1", "role": "user", "content": "Hello" }
\`\`\``,
    inputSchema: {
        type: "object",
        properties: {
            op: { type: "string", enum: ["better", "chat_add", "chat_get", "chat_summary", "get_summary"] },
            userId: { type: "string" },
            projectId: { type: "string" },
            timeRange: { type: "string" },
            includeTimeline: { type: "boolean" },
            includeRelations: { type: "boolean" },
            maxTokens: { type: "number" },
            role: { type: "string" },
            content: { type: "string" },
            summary: { type: "string" },
            limit: { type: "number" },
        },
        required: ["op", "userId"],
    },
    handler: async (args: any) => {
        const { op, userId, projectId, timeRange, includeTimeline, includeRelations, role, content, summary, limit } = args;
        try {
            switch (op) {
                case "better": {
                    const days = timeRange === "today" ? 1 : timeRange === "week" ? 7 : timeRange === "month" ? 30 : 999;
                    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
                    const memories = db.prepare(`SELECT * FROM Timeline WHERE ownerId = ? AND createdAt > ? ORDER BY createdAt DESC LIMIT ?`).all(userId, cutoff, limit ?? 50) as any[];
                    const timeline: any = {};
                    memories.forEach((m: any) => {
                        const date = m.createdAt.slice(0, 10);
                        if (!timeline[date]) timeline[date] = [];
                        timeline[date].push(m.content?.slice(0, 100));
                    });
                    let relations: any = {};
                    if (includeRelations) {
                        const entities = db.prepare(`SELECT * FROM Entities WHERE ownerId = ? ORDER BY createdAt DESC LIMIT 20`).all(userId) as any[];
                        relations = entities.reduce((acc: any, e: any) => { acc[e.name] = { id: e.id, type: e.entityType }; return acc; }, {});
                    }
                    return { content: [{ type: "text", text: JSON.stringify({ timeline, relations, total: memories.length }) }] };
                }
                case "chat_add": {
                    if (!content) return { content: [{ type: "text", text: "content required" }], isError: true };
                    const id = `chat_${Date.now()}`;
                    db.prepare(`INSERT INTO ChatHistory (id, userId, projectId, role, content, createdAt) VALUES (?, ?, ?, ?, ?, ?)`).run(id, userId, projectId || null, role || "user", content, new Date().toISOString());
                    return { content: [{ type: "text", text: "Message added" }] };
                }
                case "chat_get": {
                    const chats = db.prepare(`SELECT * FROM ChatHistory WHERE userId = ? ORDER BY createdAt DESC LIMIT ?`).all(userId, limit ?? 20) as any[];
                    return { content: [{ type: "text", text: JSON.stringify({ chats: chats.length, recent: chats.map((c: any) => ({ role: c.role, content: c.content?.slice(0, 100) })) }) }] };
                }
                case "chat_summary": {
                    if (!summary) return { content: [{ type: "text", text: "summary required" }], isError: true };
                    const id = `sum_${Date.now()}`;
                    db.prepare(`INSERT INTO SessionSummary (id, userId, projectId, summary, createdAt) VALUES (?, ?, ?, ?, ?)`).run(id, userId, projectId || null, summary, new Date().toISOString());
                    return { content: [{ type: "text", text: "Summary stored" }] };
                }
                case "get_summary": {
                    const summaries = db.prepare(`SELECT * FROM SessionSummary WHERE userId = ? ORDER BY createdAt DESC LIMIT ?`).all(userId, limit ?? 5) as any[];
                    return { content: [{ type: "text", text: JSON.stringify({ summaries: summaries.map((s: any) => ({ id: s.id, summary: s.summary, createdAt: s.createdAt })) }) }] };
                }
                default:
                    return { content: [{ type: "text", text: `Unknown op: ${op}` }], isError: true };
            }
        } catch (err: any) {
            return { content: [{ type: "text", text: err.message }], isError: true };
        }
    }
};
