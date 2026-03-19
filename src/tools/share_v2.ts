// =============================================
// TOOL: share (share, shared_with_me, shared_by_me, get_network, person_memories)
// =============================================
import { db } from "../db/sqlite.js";

export const shareTool = {
    name: "share",
    description: `## Unified Share Tool

**Purpose:** Share memories with others and view shared content.

**Operations:**
| Op | Description |
|----|-------------|
| share | Share memory |
| shared_with_me | View shared with you |
| shared_by_me | View shared by you |
| get_network | Get relation network |
| person_memories | Get person's memories |

**Examples:**
\`\`\`json
{ "op": "share", "userId": "u1", "toOwnerId": "u2", "content": "Deadline Sunday" }
{ "op": "shared_with_me", "userId": "u1" }
\`\`\``,
    inputSchema: {
        type: "object",
        properties: {
            op: { type: "string", enum: ["share", "shared_with_me", "shared_by_me", "get_network", "person_memories"] },
            userId: { type: "string" },
            fromOwnerId: { type: "string" },
            toOwnerId: { type: "string" },
            content: { type: "string" },
            perspectiveNote: { type: "string" },
            personId: { type: "string" },
        },
        required: ["op", "userId"],
    },
    handler: async (args: any) => {
        const { op, userId, fromOwnerId, toOwnerId, content, perspectiveNote, personId } = args;
        try {
            switch (op) {
                case "share": {
                    if (!toOwnerId || !content) return { content: [{ type: "text", text: "toOwnerId and content required" }], isError: true };
                    const id = `shared_${Date.now()}`;
                    const from = fromOwnerId || userId;
                    db.prepare(`INSERT INTO SharedMemories (id, fromOwnerId, toOwnerId, content, perspectiveNote, isRead, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, from, toOwnerId, content, perspectiveNote || "", 0, new Date().toISOString());
                    return { content: [{ type: "text", text: `Shared with ${toOwnerId}` }] };
                }
                case "shared_with_me": {
                    const shared = db.prepare(`SELECT * FROM SharedMemories WHERE toOwnerId = ? ORDER BY createdAt DESC LIMIT 20`).all(userId) as any[];
                    return { content: [{ type: "text", text: JSON.stringify({ received: shared.length, items: shared.map((s: any) => ({ from: s.fromOwnerId, content: s.content?.slice(0, 100), read: s.isRead })) }) }] };
                }
                case "shared_by_me": {
                    const shared = db.prepare(`SELECT * FROM SharedMemories WHERE fromOwnerId = ? ORDER BY createdAt DESC LIMIT 20`).all(userId) as any[];
                    return { content: [{ type: "text", text: JSON.stringify({ sent: shared.length, items: shared.map((s: any) => ({ to: s.toOwnerId, content: s.content?.slice(0, 100) })) }) }] };
                }
                case "get_network": {
                    if (!personId) return { content: [{ type: "text", text: "personId required" }], isError: true };
                    const entity = db.prepare(`SELECT * FROM Entities WHERE userId = ? AND name LIKE ? LIMIT 1`).get(userId, `%${personId}%`) as any;
                    if (!entity) return { content: [{ type: "text", text: "Person not found" }] };
                    const relations = db.prepare(`SELECT * FROM Relations WHERE fromId = ? OR toId = ?`).all(entity.id, entity.id) as any[];
                    return { content: [{ type: "text", text: JSON.stringify({ person: entity.name, relations: relations.length }) }] };
                }
                case "person_memories": {
                    if (!personId) return { content: [{ type: "text", text: "personId required" }], isError: true };
                    const memories = db.prepare(`SELECT * FROM Timeline WHERE ownerId = ? AND entities LIKE ? ORDER BY createdAt DESC LIMIT 20`).all(userId, `%${personId}%`) as any[];
                    return { content: [{ type: "text", text: JSON.stringify({ person: personId, memories: memories.length }) }] };
                }
                default:
                    return { content: [{ type: "text", text: `Unknown op: ${op}` }], isError: true };
            }
        } catch (err: any) {
            return { content: [{ type: "text", text: err.message }], isError: true };
        }
    }
};
