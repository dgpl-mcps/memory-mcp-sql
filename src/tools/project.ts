import { setShortTermMemory, getShortTermMemory, createEntity, getEntity, listEntities, updateEntity, createRelation, getRelations } from "../db/sqlite.js";
import { getMemoryConfig } from "../utils/env.js";

// Specialized helper tools for common graph actions to avoid complex MCP JSON construction by the agent

export const projectTools = [
    {
        name: "add_core_rule",
        description: "Add a Core Rule to the project (e.g. 'Use explicit imports', 'Always mock external APIs').",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID" },
                ruleName: { type: "string", description: "Short title for the rule" },
                ruleDescription: { type: "string", description: "Detailed description of the rule" }
            },
            required: ["userId", "projectId", "ruleName", "ruleDescription"],
        },
        handler: async (args: any) => {
            const { userId, projectId, ruleName, ruleDescription } = args;
            try {
                const newEntity = createEntity(userId, projectId, 'CoreRule', ruleName, { description: ruleDescription });
                return {
                    content: [{ type: "text", text: `Core Rule added with ID: ${newEntity.id}` }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "create_epic",
        description: "Create an Epic (large overarching feature) in the project.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID" },
                epicName: { type: "string", description: "Name of the Epic" },
                epicDescription: { type: "string", description: "Description of what the Epic accomplishes" }
            },
            required: ["userId", "projectId", "epicName"],
        },
        handler: async (args: any) => {
            const { userId, projectId, epicName, epicDescription } = args;
            try {
                const newEntity = createEntity(userId, projectId, 'Epic', epicName, { description: epicDescription || "", status: "planned" });
                return {
                    content: [{ type: "text", text: `Epic created with ID: ${newEntity.id}` }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "add_todo",
        description: "Create a Todo/Task, optionally linking it to an Epic.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID" },
                taskName: { type: "string", description: "Name of the task" },
                epicId: { type: "string", description: "(Optional) Mongo ID of the epic this task belongs to" },
                details: { type: "string", description: "Further details or checklist for the task" }
            },
            required: ["userId", "projectId", "taskName"],
        },
        handler: async (args: any) => {
            const { userId, projectId, taskName, epicId, details } = args;

            try {
                const newEntity = createEntity(userId, projectId, 'Todo', taskName, { details: details || "", status: "todo" });

                let relText = "";
                if (epicId) {
                    createRelation(userId, projectId, newEntity.id, epicId, "PART_OF", {});
                    relText = ` Linked to Epic ${epicId}.`;
                }

                return {
                    content: [{ type: "text", text: `Todo created with ID: ${newEntity.id}.${relText}` }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "set_file_meta",
        description: "Attach architectural meta-data or purpose to a specific file path.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID" },
                path: { type: "string", description: "File path (e.g., src/index.ts)" },
                description: { type: "string", description: "What this file is responsible for" }
            },
            required: ["userId", "projectId", "path", "description"],
        },
        handler: async (args: any) => {
            const { userId, projectId, path, description } = args;
            try {
                const entities = listEntities(userId, projectId, 'FileMeta');
                const existing = entities.find(e => e.name === path);

                if (existing) {
                    updateEntity(existing.id, { properties: { description } });
                    return { content: [{ type: "text", text: `File Meta updated for ${path}` }] };
                } else {
                    createEntity(userId, projectId, 'FileMeta', path, { description });
                    return { content: [{ type: "text", text: `File Meta created for ${path}` }] };
                }
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "set_next_steps",
        description: "Write down the next steps or immediate focus for the project. Stored in short-term memory.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID" },
                steps: { type: "string", description: "The instructions for what to tackle next" }
            },
            required: ["userId", "projectId", "steps"],
        },
        handler: async (args: any) => {
            const { userId, projectId, steps } = args;
            try {
                await setShortTermMemory(userId, projectId, 'next_steps', { text: steps, timestamp: new Date().toISOString() });
                return {
                    content: [{ type: "text", text: `Next steps successfully saved to short term memory.` }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "get_next_steps",
        description: "Retrieve the next steps or immediate focus for the project.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID" }
            },
            required: ["userId", "projectId"],
        },
        handler: async (args: any) => {
            const { userId, projectId } = args;
            try {
                const steps = await getShortTermMemory(userId, projectId, 'next_steps');
                return {
                    content: [{ type: "text", text: steps ? steps.text : "No next steps defined." }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "store_insight",
        description: "Store an autonomous agent insight or lesson learned to prevent future repeating of mistakes.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                projectId: { type: "string" },
                insight: { type: "string", description: "The overarching lesson or realization to store" }
            },
            required: ["userId", "projectId", "insight"],
        },
        handler: async (args: any) => {
            const { userId, projectId, insight } = args;
            try {
                const newEntity = createEntity(userId, projectId, 'Insight', `Insight: ${insight.substring(0, 30)}...`, { insight });
                return {
                    content: [{ type: "text", text: `Insight securely logged in long-term memory with ID: ${newEntity.id}` }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "search_insights",
        description: "Search across all previously logged Agent Insights for a project using a keyword or concept.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                projectId: { type: "string" },
                keyword: { type: "string", description: "Word or concept to search for" },
                limit: { type: "number", description: "Max results (default from env: 10)" },
                offset: { type: "number", description: "Pagination offset (default from env: 0)" }
            },
            required: ["userId", "projectId", "keyword"],
        },
        handler: async (args: any) => {
            const cfg = getMemoryConfig();
            const { userId, projectId, keyword } = args;
            const limit = args.limit ?? cfg.DEFAULT_SEARCH_LIMIT;
            const offset = args.offset ?? cfg.DEFAULT_SEARCH_OFFSET;
            
            try {
                const insights = listEntities(userId, projectId, 'Insight');
                const filtered = insights.filter(i => i.name.toLowerCase().includes(keyword.toLowerCase()));
                return {
                    content: [{ type: "text", text: JSON.stringify({
                        results: filtered.slice(offset, offset + limit),
                        search_context: { limit, offset, source: "search_insights" }
                    }, null, 2) }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    }
];
