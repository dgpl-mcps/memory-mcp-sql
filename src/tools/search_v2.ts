// =============================================
// TOOL: search (meta tool search)
// =============================================

export const searchTool = {
    name: "search",
    description: `## Unified Tool Search

**[META]** Search available tools by keyword.

Use this when you need a specific capability.

**Examples:**
\`\`\`json
{ "query": "entity" }
\`\`\`

Returns: Matching tools with their operations.`,
    inputSchema: {
        type: "object",
        properties: {
            query: { type: "string" }
        },
        required: ["query"],
    },
    handler: async (args: any) => {
        const { query } = args;
        const tools = [
            "memory: remember, recall, history, context, stats, cleanup, boost, pin, inspect, export, import, insights, trim, analytics, link",
            "entity: create, read, update, delete, search",
            "relation: create, delete, search",
            "short_term: set, get, list, delete, clear, search",
            "project: create_project, plan_task, complete_task, list_tasks, update_task, delete_task, plan_workflow",
            "session: create, list, timeline, cross, end, switch, merge",
            "extract: entities, text, keypoint, thought, note, discovery, mistake, learning, boundary",
            "context: better, chat_add, chat_get, chat_summary, get_summary",
            "share: share, shared_with_me, shared_by_me, get_network, person_memories",
            "search: tool search"
        ];
        const matches = tools.filter(t => t.toLowerCase().includes(query?.toLowerCase() || ""));
        return { content: [{ type: "text", text: `Tools matching "${query}":\n\n${matches.join("\n")}` }] };
    }
};
