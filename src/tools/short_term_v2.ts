// =============================================
// TOOL: short_term (set, get, list, delete, clear, search)
// =============================================
import { db } from "../db/sqlite.js";

export const shortTermTool = {
    name: "short_term",
    description: `## Unified Short-Term Memory Tool

**Purpose:** Fast key-value storage for session data.

**Operations:**
| Op | Description |
|----|-------------|
| set | Store key-value |
| get | Get by key |
| list | List all keys |
| delete | Delete key |
| clear | Clear all |
| search | Search values |

**Examples:**
\`\`\`json
{ "op": "set", "userId": "u1", "key": "active_task", "value": {"id": "t1"} }
{ "op": "get", "userId": "u1", "key": "active_task" }
{ "op": "list", "userId": "u1" }
\`\`\``,
    inputSchema: {
        type: "object",
        properties: {
            op: { type: "string", enum: ["set", "get", "list", "delete", "clear", "search"] },
            userId: { type: "string" },
            projectId: { type: "string" },
            key: { type: "string" },
            value: { type: "object" },
            limit: { type: "number" },
            query: { type: "string" },
        },
        required: ["op", "userId"],
    },
    handler: async (args: any) => {
        const { op, userId, projectId, key, value, limit, query } = args;
        try {
            switch (op) {
                case "set": {
                    if (!key) return { content: [{ type: "text", text: "key required" }], isError: true };
                    const id = `stm_${Date.now()}`;
                    db.prepare(`INSERT OR REPLACE INTO ShortTermMemory (id, userId, projectId, key, value, createdAt) VALUES (?, ?, ?, ?, ?, ?)`).run(id, userId, projectId || null, key, JSON.stringify(value), new Date().toISOString());
                    return { content: [{ type: "text", text: `Set ${key}` }] };
                }
                case "get": {
                    if (!key) return { content: [{ type: "text", text: "key required" }], isError: true };
                    const row = db.prepare(`SELECT * FROM ShortTermMemory WHERE userId = ? AND key = ?`).get(userId, key) as any;
                    if (!row) return { content: [{ type: "text", text: "Not found" }] };
                    return { content: [{ type: "text", text: JSON.stringify({ key: row.key, value: JSON.parse(row.value) }) }] };
                }
                case "list": {
                    const rows = db.prepare(`SELECT key, value FROM ShortTermMemory WHERE userId = ? LIMIT ?`).all(userId, limit ?? 50) as any[];
                    return { content: [{ type: "text", text: JSON.stringify({ keys: rows.map((r: any) => ({ key: r.key, value: JSON.parse(r.value) })) }) }] };
                }
                case "delete": {
                    if (!key) return { content: [{ type: "text", text: "key required" }], isError: true };
                    db.prepare(`DELETE FROM ShortTermMemory WHERE userId = ? AND key = ?`).run(userId, key);
                    return { content: [{ type: "text", text: `Deleted ${key}` }] };
                }
                case "clear": {
                    db.prepare(`DELETE FROM ShortTermMemory WHERE userId = ?`).run(userId);
                    return { content: [{ type: "text", text: "Cleared" }] };
                }
                case "search": {
                    const rows = db.prepare(`SELECT * FROM ShortTermMemory WHERE userId = ? AND value LIKE ? LIMIT ?`).all(userId, `%${query || ""}%`, limit ?? 10) as any[];
                    return { content: [{ type: "text", text: JSON.stringify({ results: rows.length, items: rows.map((r: any) => ({ key: r.key, value: JSON.parse(r.value) })) }) }] };
                }
                default:
                    return { content: [{ type: "text", text: `Unknown op: ${op}` }], isError: true };
            }
        } catch (err: any) {
            return { content: [{ type: "text", text: err.message }], isError: true };
        }
    }
};
