// TOOL: project (project/task/workflow CRUD)
import { db } from "../db/sqlite.js";

export const projectTool = {
    name: "project",
    description: `## Unified Project/Task/Workflow Tool

**Project Operations:**
| Op | Description |
|----|-------------|
| create_project | Create project |
| get_project | Get by ID |
| list_projects | List all |
| update_project | Update details |
| delete_project | Delete project |

**Task Operations:**
| Op | Description |
|----|-------------|
| plan_task | Create task |
| get_task | Get by ID |
| list_tasks | List project tasks |
| update_task | Update status |
| complete_task | Mark done |
| delete_task | Remove task |

**Workflow Operations:**
| Op | Description |
|----|-------------|
| plan_workflow | Create workflow |
| get_workflow | Get by ID |
| list_workflows | List workflows |

**Examples:**
\`\`\`json
{ "op": "create_project", "userId": "u1", "name": "My App" }
{ "op": "plan_task", "userId": "u1", "projectId": "p1", "title": "Fix bug", "status": "pending" }
{ "op": "complete_task", "id": "task_123" }
\`\`\``,
    inputSchema: {
        type: "object",
        properties: {
            op: { type: "string", enum: ["create_project", "get_project", "list_projects", "update_project", "delete_project", "plan_task", "get_task", "list_tasks", "update_task", "complete_task", "delete_task", "plan_workflow", "get_workflow", "list_workflows"] },
            userId: { type: "string" },
            id: { type: "string" },
            projectId: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            metadata: { type: "object" },
            title: { type: "string" },
            status: { type: "string" },
            priority: { type: "string" },
            todos: { type: "array" },
            steps: { type: "array" },
        },
        required: ["op", "userId"],
    },
    handler: async (args: any) => {
        const { op, userId, id, projectId, name, description, metadata, title, status, priority, todos, steps } = args;
        try {
            if (op === "create_project") {
                if (!name) return { content: [{ type: "text", text: "name required" }], isError: true };
                const pid = `proj_${Date.now()}`;
                db.prepare(`INSERT INTO Projects (id, userId, name, description, metadata, createdAt) VALUES (?, ?, ?, ?, ?, ?)`).run(pid, userId, name, description || "", JSON.stringify(metadata || {}), new Date().toISOString());
                return { content: [{ type: "text", text: `Created project: ${name}` }] };
            }
            if (op === "get_project") {
                if (!id) return { content: [{ type: "text", text: "id required" }], isError: true };
                const p = db.prepare(`SELECT * FROM Projects WHERE id = ?`).get(id) as any;
                if (!p) return { content: [{ type: "text", text: "Not found" }] };
                return { content: [{ type: "text", text: JSON.stringify({ id: p.id, name: p.name, description: p.description }) }] };
            }
            if (op === "list_projects") {
                const projects = db.prepare(`SELECT id, name, description FROM Projects WHERE userId = ?`).all(userId) as any[];
                return { content: [{ type: "text", text: JSON.stringify({ projects }) }] };
            }
            if (op === "delete_project") {
                if (!id) return { content: [{ type: "text", text: "id required" }], isError: true };
                db.prepare(`DELETE FROM Projects WHERE id = ?`).run(id);
                return { content: [{ type: "text", text: "Deleted" }] };
            }
            if (op === "plan_task") {
                if (!projectId || !title) return { content: [{ type: "text", text: "projectId and title required" }], isError: true };
                const tid = `task_${Date.now()}`;
                db.prepare(`INSERT INTO Tasks (id, projectId, userId, title, status, priority, todos, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(tid, projectId, userId, title, status || "pending", priority || "medium", JSON.stringify(todos || []), new Date().toISOString());
                return { content: [{ type: "text", text: `Created task: ${title}` }] };
            }
            if (op === "get_task") {
                if (!id) return { content: [{ type: "text", text: "id required" }], isError: true };
                const t = db.prepare(`SELECT * FROM Tasks WHERE id = ?`).get(id) as any;
                if (!t) return { content: [{ type: "text", text: "Not found" }] };
                return { content: [{ type: "text", text: JSON.stringify({ id: t.id, title: t.title, status: t.status }) }] };
            }
            if (op === "list_tasks") {
                const tasks = db.prepare(`SELECT id, title, status FROM Tasks WHERE projectId = ?`).all(projectId) as any[];
                return { content: [{ type: "text", text: JSON.stringify({ tasks }) }] };
            }
            if (op === "update_task") {
                if (!id) return { content: [{ type: "text", text: "id required" }], isError: true };
                const sets: string[] = []; const vals: any[] = [];
                if (status) { sets.push("status = ?"); vals.push(status); }
                if (sets.length === 0) return { content: [{ type: "text", text: "Nothing to update" }] };
                vals.push(id);
                db.prepare(`UPDATE Tasks SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
                return { content: [{ type: "text", text: "Updated" }] };
            }
            if (op === "complete_task") {
                if (!id) return { content: [{ type: "text", text: "id required" }], isError: true };
                db.prepare(`UPDATE Tasks SET status = 'completed' WHERE id = ?`).run(id);
                return { content: [{ type: "text", text: "Completed" }] };
            }
            if (op === "delete_task") {
                if (!id) return { content: [{ type: "text", text: "id required" }], isError: true };
                db.prepare(`DELETE FROM Tasks WHERE id = ?`).run(id);
                return { content: [{ type: "text", text: "Deleted" }] };
            }
            if (op === "plan_workflow") {
                if (!projectId || !name || !steps) return { content: [{ type: "text", text: "projectId, name, steps required" }], isError: true };
                const wid = `wf_${Date.now()}`;
                db.prepare(`INSERT INTO Workflows (id, projectId, userId, name, steps, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(wid, projectId, userId, name, JSON.stringify(steps), "pending", new Date().toISOString());
                return { content: [{ type: "text", text: `Created workflow: ${name}` }] };
            }
            if (op === "get_workflow") {
                if (!id) return { content: [{ type: "text", text: "id required" }], isError: true };
                const w = db.prepare(`SELECT * FROM Workflows WHERE id = ?`).get(id) as any;
                if (!w) return { content: [{ type: "text", text: "Not found" }] };
                return { content: [{ type: "text", text: JSON.stringify({ id: w.id, name: w.name, status: w.status }) }] };
            }
            if (op === "list_workflows") {
                const workflows = db.prepare(`SELECT id, name, status FROM Workflows WHERE projectId = ?`).all(projectId) as any[];
                return { content: [{ type: "text", text: JSON.stringify({ workflows }) }] };
            }
            return { content: [{ type: "text", text: `Unknown op: ${op}` }], isError: true };
        } catch (err: any) {
            return { content: [{ type: "text", text: err.message }], isError: true };
        }
    }
};
