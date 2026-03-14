import { Entity, Relation } from "../db/mongo.js";
import mongoose from "mongoose";
import { setShortTermMemory, getShortTermMemory } from "../db/sqlite.js";

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
                const newEntity = await Entity.create({
                    userId,
                    projectId,
                    entityType: 'CoreRule',
                    name: ruleName,
                    properties: { description: ruleDescription },
                });
                return {
                    content: [{ type: "text", text: `Core Rule added with ID: ${newEntity._id}` }],
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
                const newEntity = await Entity.create({
                    userId,
                    projectId,
                    entityType: 'Epic',
                    name: epicName,
                    properties: { description: epicDescription || "", status: "planned" },
                });
                return {
                    content: [{ type: "text", text: `Epic created with ID: ${newEntity._id}` }],
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

            // Enterprise Resilience V5: Complex operations are atomic via Transactions.
            const session = await mongoose.startSession();
            session.startTransaction();

            try {
                const newEntity = await Entity.create([{
                    userId,
                    projectId,
                    entityType: 'Todo',
                    name: taskName,
                    properties: { details: details || "", status: "todo" },
                }], { session });

                let relText = "";
                if (epicId) {
                    await Relation.create([{
                        userId,
                        projectId,
                        fromId: new mongoose.Types.ObjectId(newEntity[0]._id),
                        toId: new mongoose.Types.ObjectId(epicId),
                        relationType: "PART_OF",
                        properties: {}
                    }], { session });
                    relText = ` Linked to Epic ${epicId}.`;
                }

                await session.commitTransaction();
                return {
                    content: [{ type: "text", text: `Todo created with ID: ${newEntity[0]._id}.${relText}` }],
                };
            } catch (err: any) {
                await session.abortTransaction();
                return { isError: true, content: [{ type: "text", text: `Transaction Aborted due to error: ${err.message}` }] };
            } finally {
                session.endSession();
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
                // Upsert logic for Mongo based on type and path
                const existing = await Entity.findOne({ userId, projectId, entityType: 'FileMeta', name: path });

                if (existing) {
                    existing.properties = { description };
                    await existing.save();
                    return { content: [{ type: "text", text: `File Meta updated for ${path}` }] };
                } else {
                    await Entity.create({
                        userId,
                        projectId,
                        entityType: 'FileMeta',
                        name: path,
                        properties: { description },
                    });
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
                const newEntity = await Entity.create({
                    userId,
                    projectId,
                    entityType: 'Insight',
                    name: `Insight: ${insight.substring(0, 30)}...`,
                    properties: { insight },
                });
                return {
                    content: [{ type: "text", text: `Insight securely logged in long-term memory with ID: ${newEntity._id}` }],
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
                keyword: { type: "string", description: "Word or concept to search for" }
            },
            required: ["userId", "projectId", "keyword"],
        },
        handler: async (args: any) => {
            const { userId, projectId, keyword } = args;
            try {
                const insights = await Entity.find({
                    userId,
                    projectId,
                    entityType: 'Insight',
                    name: { $regex: keyword, $options: "i" }
                }).lean();
                return {
                    content: [{ type: "text", text: JSON.stringify(insights, null, 2) }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    }
];
