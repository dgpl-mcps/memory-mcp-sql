// =============================================
// TOOL: extract (entities, text, keypoint, thought, note, discovery, mistake, learning, boundary)
// =============================================
import { db } from "../db/sqlite.js";

export const extractTool = {
    name: "extract",
    description: `## Unified Extract/Remember Tool

**Purpose:** Extract entities and remember information.

**Operations:**
| Op | Description |
|----|-------------|
| entities | Extract from text |
| text | Remember general |
| keypoint | Remember highlight |
| thought | Add thought |
| note | General note |
| discovery | New discovery |
| mistake | Remember mistake |
| learning | Lesson learned |
| boundary | Scope boundary |

**Examples:**
\`\`\`json
{ "op": "entities", "userId": "u1", "text": "John from Acme called" }
{ "op": "learning", "userId": "u1", "insight": "Tests first" }
\`\`\``,
    inputSchema: {
        type: "object",
        properties: {
            op: { type: "string", enum: ["entities", "text", "keypoint", "thought", "note", "discovery", "mistake", "learning", "boundary"] },
            userId: { type: "string" },
            projectId: { type: "string" },
            sessionId: { type: "string" },
            text: { type: "string" },
            content: { type: "string" },
            thought: { type: "string" },
            description: { type: "string" },
            insight: { type: "string" },
            resolution: { type: "string" },
            taskId: { type: "string" },
            boundary: { type: "string" },
            autoStore: { type: "boolean" },
        },
        required: ["op", "userId"],
    },
    handler: async (args: any) => {
        const { op, userId, projectId, sessionId, text, content, thought, description, insight, resolution, taskId, boundary, autoStore } = args;
        try {
            switch (op) {
                case "entities": {
                    if (!text) return { content: [{ type: "text", text: "text required" }], isError: true };
                    const entities: any[] = [];
                    const mentions = text.match(/@(\w+)/g);
                    if (mentions) mentions.forEach((m: any) => entities.push({ name: m.slice(1), type: "Person" }));
                    const emails = text.match(/[\w.-]+@[\w.-]+\.\w+/g);
                    if (emails) emails.forEach((e: any) => entities.push({ name: e, type: "Person", email: e }));
                    if (autoStore && entities.length > 0) {
                        entities.forEach((e: any) => {
                            const id = `${e.type.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                            db.prepare(`INSERT INTO Entities (id, userId, projectId, entityType, name, ownerId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, userId, projectId || null, e.type, e.name, userId, new Date().toISOString());
                        });
                    }
                    return { content: [{ type: "text", text: JSON.stringify({ extracted: entities, stored: autoStore ? entities.length : 0 }) }] };
                }
                case "text":
                case "keypoint":
                case "note": {
                    const c = content || text;
                    if (!c) return { content: [{ type: "text", text: "content/text required" }], isError: true };
                    const id = `ltm_${Date.now()}`;
                    const mtype = op === "keypoint" ? "keypoint" : op === "note" ? "note" : "general";
                    db.prepare(`INSERT INTO Timeline (id, ownerId, sessionId, perspectiveOf, content, memoryType, priority, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, userId, sessionId || null, "self", c, mtype, 0.6, new Date().toISOString());
                    return { content: [{ type: "text", text: `Stored as ${mtype}` }] };
                }
                case "thought": {
                    if (!thought) return { content: [{ type: "text", text: "thought required" }], isError: true };
                    const id = `ltm_${Date.now()}`;
                    db.prepare(`INSERT INTO Timeline (id, ownerId, sessionId, content, memoryType, priority, createdAt) VALUES (?, ?, ?, ?, 'thought', ?, ?, ?)`).run(id, userId, sessionId || null, thought, 0.5, new Date().toISOString());
                    return { content: [{ type: "text", text: "Thought stored" }] };
                }
                case "discovery": {
                    if (!description) return { content: [{ type: "text", text: "description required" }], isError: true };
                    const id = `ltm_${Date.now()}`;
                    db.prepare(`INSERT INTO Timeline (id, ownerId, projectId, content, memoryType, priority, createdAt) VALUES (?, ?, ?, ?, 'discovery', ?, ?, ?)`).run(id, userId, projectId || null, description, 0.7, new Date().toISOString());
                    return { content: [{ type: "text", text: "Discovery stored" }] };
                }
                case "mistake": {
                    if (!description) return { content: [{ type: "text", text: "description required" }], isError: true };
                    const c = `Mistake: ${description}${resolution ? " | Resolution: " + resolution : ""}`;
                    const id = `ltm_${Date.now()}`;
                    db.prepare(`INSERT INTO Timeline (id, ownerId, content, memoryType, priority, createdAt) VALUES (?, ?, ?, 'mistake', ?, ?, ?)`).run(id, userId, c, 0.8, new Date().toISOString());
                    return { content: [{ type: "text", text: "Mistake stored" }] };
                }
                case "learning": {
                    if (!insight) return { content: [{ type: "text", text: "insight required" }], isError: true };
                    const id = `ltm_${Date.now()}`;
                    db.prepare(`INSERT INTO Timeline (id, ownerId, content, memoryType, priority, createdAt) VALUES (?, ?, ?, 'learning', ?, ?, ?)`).run(id, userId, insight, 0.8, new Date().toISOString());
                    return { content: [{ type: "text", text: "Learning stored" }] };
                }
                case "boundary": {
                    if (!taskId || !boundary) return { content: [{ type: "text", text: "taskId and boundary required" }], isError: true };
                    const id = `ltm_${Date.now()}`;
                    db.prepare(`INSERT INTO Timeline (id, ownerId, content, memoryType, entities, priority, createdAt) VALUES (?, ?, ?, 'boundary', ?, ?, ?, ?)`).run(id, userId, `Scope for ${taskId}: ${boundary}`, JSON.stringify([taskId]), 0.7, new Date().toISOString());
                    return { content: [{ type: "text", text: "Boundary stored" }] };
                }
                default:
                    return { content: [{ type: "text", text: `Unknown op: ${op}` }], isError: true };
            }
        } catch (err: any) {
            return { content: [{ type: "text", text: err.message }], isError: true };
        }
    }
};
