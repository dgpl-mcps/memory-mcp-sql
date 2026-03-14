import { getShortTermMemory, setShortTermMemory } from "../db/sqlite.js";

const DEFAULT_CHAT_LIMIT = parseInt(process.env.CHAT_CONTEXT_LIMIT || '10', 10);

export const contextTools = [
    {
        name: "add_chat_message",
        description: "Save a chat message to the current session's context history. Returns a warning if the chat history exceeds the context limit, prompting the agent to summarize.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID" },
                role: { type: "string", description: "Role of the sender (user, assistant, system)" },
                content: { type: "string", description: "The message text" }
            },
            required: ["userId", "projectId", "role", "content"],
        },
        handler: async (args: any) => {
            const { userId, projectId, role, content } = args;
            try {
                // Fetch existing messages
                const historyKey = 'chat_history';
                let history: any[] = await getShortTermMemory(userId, projectId, historyKey) || [];

                // Add new message
                const msg = { role, content, timestamp: new Date().toISOString() };
                history.push(msg);

                // Save back to sqlite
                await setShortTermMemory(userId, projectId, historyKey, history);

                // Check if summary is needed
                if (history.length >= DEFAULT_CHAT_LIMIT) {
                    return {
                        content: [{
                            type: "text",
                            text: `Message added. WARNING: SUMMARY_REQUIRED. The chat history has reached ${history.length} messages (limit ${DEFAULT_CHAT_LIMIT}). Please review the history using 'get_chat_history', generate a condensed summary, and save it using 'store_context_summary'.`
                        }],
                    };
                }

                return {
                    content: [{ type: "text", text: `Message added securely to context.` }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "get_chat_history",
        description: "Retrieve the current raw chat history that hasn't been summarized yet.",
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
                const historyKey = 'chat_history';
                const history: any[] = await getShortTermMemory(userId, projectId, historyKey) || [];
                return {
                    content: [{ type: "text", text: JSON.stringify(history, null, 2) }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "store_context_summary",
        description: "Save a generated summary of the recent chat. This automatically clears the recent chat history to free up context window.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID" },
                summary: { type: "string", description: "The condensed summary text" }
            },
            required: ["userId", "projectId", "summary"],
        },
        handler: async (args: any) => {
            const { userId, projectId, summary } = args;
            try {
                // First, securely store the summary logic (accumulate or replace)
                const summaryKey = 'chat_summary';
                let existingSummary = await getShortTermMemory(userId, projectId, summaryKey) || "";

                const newSummary = existingSummary
                    ? existingSummary + "\n\n---\n\nNew Summary section:\n" + summary
                    : summary;

                await setShortTermMemory(userId, projectId, summaryKey, newSummary);

                // Then, clear the chat history queue
                await setShortTermMemory(userId, projectId, 'chat_history', []);

                return {
                    content: [{ type: "text", text: `Context summary stored successfully. Chat history wiped for a fresh context window.` }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "get_context_summary",
        description: "Retrieve the stored condensed summary of the conversation.",
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
                const summaryKey = 'chat_summary';
                const summary = await getShortTermMemory(userId, projectId, summaryKey) || "No summary exists yet.";
                return {
                    content: [{ type: "text", text: summary }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "compress_summary",
        description: "Compress the current context summary into a shorter format. Use this when the accumulated summary itself becomes too long.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                projectId: { type: "string" },
                compressedSummary: { type: "string", description: "The newly compressed, shorter summary" }
            },
            required: ["userId", "projectId", "compressedSummary"],
        },
        handler: async (args: any) => {
            const { userId, projectId, compressedSummary } = args;
            try {
                const summaryKey = 'chat_summary';
                await setShortTermMemory(userId, projectId, summaryKey, compressedSummary);
                return {
                    content: [{ type: "text", text: `Summary successfully compressed and replaced.` }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    }
];
