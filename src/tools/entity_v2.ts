// =============================================
// TOOL: entity (create, read, update, delete, search)
// =============================================
import { db } from "../db/sqlite.js";

export const entityTool = {
    name: "entity",
    description: `## Unified Entity Tool

**Purpose:** Manage knowledge graph entities.

**Entity Types:** Person, Bot, Organization, Task, Rule, CoreRule, LongTermGoal, Epic, Todo, Insight, Walkthrough

**Operations:**
| Op | Description |
|----|-------------|
| create | Create new entity |
| read | Get by ID |
| update | Update name/properties |
| delete | Delete entity |
| search | Find by type/name |

**Examples:**
\`\`\`json
{ "op": "create", "userId": "u1", "entityType": "Person", "name": "Priya", "properties": {"role": "Lead"} }
{ "op": "search", "userId": "u1", "entityType": "Person", "search": "priya" }
\`\`\``,
    inputSchema: {
        type: "object",
        properties: {
            op: { type: "string", enum: ["create", "read", "update", "delete", "search"] },
            userId: { type: "string" },
            projectId: { type: "string" },
            ownerId: { type: "string" },
            id: { type: "string" },
            entityType: { type: "string" },
            name: { type: "string" },
            properties: { type: "object" },
            search: { type: "string" },
            limit: { type: "number" },
        },
        required: ["op", "userId"],
    },
    handler: async (args: any) => {
        const { op, userId, projectId, ownerId, id, entityType, name, properties, search, limit } = args;
        try {
            switch (op) {
                case "create": {
                    if (!entityType || !name) return { content: [{ type: "text", text: "entityType and name required" }], isError: true };
                    const eid = `entity_${Date.now()}`;
                    const owner = ownerId || userId;
                    const proj = projectId || "default";
                    db.prepare(`INSERT INTO Entities (id, userId, projectId, entityType, name, properties, ownerId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(eid, userId, proj, entityType, name, JSON.stringify(properties || {}), owner, new Date().toISOString());
                    return { content: [{ type: "text", text: `Created ${entityType}: ${name}` }] };
                }
                case "read": {
                    if (!id) return { content: [{ type: "text", text: "id required" }], isError: true };
                    const e = db.prepare(`SELECT * FROM Entities WHERE id = ?`).get(id) as any;
                    if (!e) return { content: [{ type: "text", text: "Not found" }] };
                    return { content: [{ type: "text", text: JSON.stringify({ id: e.id, type: e.entityType, name: e.name, properties: JSON.parse(e.properties || "{}") }) }] };
                }
                case "update": {
                    if (!id) return { content: [{ type: "text", text: "id required" }], isError: true };
                    const sets = ["updatedAt = ?"];
                    const vals: any[] = [new Date().toISOString()];
                    if (name) { sets.push("name = ?"); vals.push(name); }
                    if (properties) { sets.push("properties = ?"); vals.push(JSON.stringify(properties)); }
                    vals.push(id);
                    db.prepare(`UPDATE Entities SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
                    return { content: [{ type: "text", text: "Updated" }] };
                }
                case "delete": {
                    if (!id) return { content: [{ type: "text", text: "id required" }], isError: true };
                    db.prepare(`DELETE FROM Entities WHERE id = ?`).run(id);
                    db.prepare(`DELETE FROM Relations WHERE fromId = ? OR toId = ?`).run(id, id);
                    return { content: [{ type: "text", text: "Deleted" }] };
                }
                case "search": {
                    let sql = `SELECT * FROM Entities WHERE userId = ?`;
                    const params: any[] = [userId];
                    if (entityType) { sql += ` AND entityType = ?`; params.push(entityType); }
                    if (search) { sql += ` AND name LIKE ?`; params.push(`%${search}%`); }
                    sql += ` ORDER BY createdAt DESC LIMIT ?`;
                    params.push(limit ?? 20);
                    const entities = db.prepare(sql).all(...params) as any[];
                    return { content: [{ type: "text", text: JSON.stringify({ count: entities.length, entities: entities.map((e: any) => ({ id: e.id, type: e.entityType, name: e.name })) }) }] };
                }
                default:
                    return { content: [{ type: "text", text: `Unknown op: ${op}` }], isError: true };
            }
        } catch (err: any) {
            return { content: [{ type: "text", text: err.message }], isError: true };
        }
    }
};
