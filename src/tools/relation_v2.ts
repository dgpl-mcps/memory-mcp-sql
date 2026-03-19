// =============================================
// TOOL: relation (create, delete, search)
// =============================================
import { db } from "../db/sqlite.js";

export const relationTool = {
    name: "relation",
    description: `## Unified Relation Tool

**Purpose:** Create and manage entity relationships.

**Relation Types:** DEPENDS_ON, SUBTASK_OF, FOLLOWS, GOVERNED_BY, PART_OF, WORKS_WITH, KNOWS, TOLD, CONTACTS, BELONGS_TO, MANAGED_BY, OWNS, DEADLINE_FOR

**Operations:**
| Op | Description |
|----|-------------|
| create | Create relation |
| delete | Delete relation |
| search | Find relations |

**Examples:**
\`\`\`json
{ "op": "create", "userId": "u1", "fromId": "e1", "toId": "e2", "type": "DEPENDS_ON" }
{ "op": "search", "userId": "u1", "entityId": "e1" }
\`\`\``,
    inputSchema: {
        type: "object",
        properties: {
            op: { type: "string", enum: ["create", "delete", "search"] },
            userId: { type: "string" },
            projectId: { type: "string" },
            id: { type: "string" },
            fromId: { type: "string" },
            toId: { type: "string" },
            entityId: { type: "string" },
            type: { type: "string" },
            properties: { type: "object" },
        },
        required: ["op", "userId"],
    },
    handler: async (args: any) => {
        const { op, userId, projectId, id, fromId, toId, entityId, type, properties } = args;
        try {
            switch (op) {
                case "create": {
                    if (!fromId || !toId || !type) return { content: [{ type: "text", text: "fromId, toId, type required" }], isError: true };
                    const rid = `rel_${Date.now()}`;
                    db.prepare(`INSERT INTO Relations (id, userId, projectId, fromId, toId, relationType, properties, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(rid, userId, projectId || null, fromId, toId, type, JSON.stringify(properties || {}), new Date().toISOString());
                    return { content: [{ type: "text", text: `Created ${type}: ${fromId} -> ${toId}` }] };
                }
                case "delete": {
                    if (!id) return { content: [{ type: "text", text: "id required" }], isError: true };
                    db.prepare(`DELETE FROM Relations WHERE id = ?`).run(id);
                    return { content: [{ type: "text", text: "Deleted" }] };
                }
                case "search": {
                    if (!entityId) return { content: [{ type: "text", text: "entityId required" }], isError: true };
                    const outgoing = db.prepare(`SELECT * FROM Relations WHERE fromId = ?`).all(entityId) as any[];
                    const incoming = db.prepare(`SELECT * FROM Relations WHERE toId = ?`).all(entityId) as any[];
                    return { content: [{ type: "text", text: JSON.stringify({ outgoing: outgoing.map((r: any) => ({ id: r.id, to: r.toId, type: r.relationType })), incoming: incoming.map((r: any) => ({ id: r.id, from: r.fromId, type: r.relationType })) }) }] };
                }
                default:
                    return { content: [{ type: "text", text: `Unknown op: ${op}` }], isError: true };
            }
        } catch (err: any) {
            return { content: [{ type: "text", text: err.message }], isError: true };
        }
    }
};
