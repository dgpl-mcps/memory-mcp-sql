import { getShortTermMemory, setShortTermMemory } from "../db/sqlite.js";

const DEFAULT_CHAT_LIMIT = parseInt(process.env.CHAT_CONTEXT_LIMIT || '10', 10);

export const contextTools = [
    // =============================================
    // CHAT CONTEXT & SUMMARIZATION
    // =============================================
    // Use for: Managing conversation history, summaries
    // Auto-trigger: Warns when history exceeds context limit
    // Storage: ShortTermMemory with 'chat_history' and 'chat_summary' keys
    // =============================================
    {
        name: "add_chat_message",
        description: `## Add Chat Message to Context

**Purpose:** Save a chat message to session's conversation history.

**Use Cases:**
- Storing user-agent conversation turns
- Building conversation context
- Tracking discussion topics

**Auto-Summary:** When history reaches limit (default 10), returns WARNING to summarize.

**Tool Chaining:**
- After: Often followed by store_context_summary
- Use: get_chat_history to review history

**Keywords:** add, save, store, chat, message, conversation, history

**Example:**
\`\`\`json
{
  "userId": "nandini",
  "projectId": "myproject",
  "role": "user",
  "content": "Please help me fix the login bug"
}
\`\`\``,
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
        description: `## Get Chat History

**Purpose:** Retrieve raw chat history that hasn't been summarized.

**Use Cases:**
- Reviewing recent conversation
- Getting context before responding
- Checking what was discussed

**Keywords:** history, chat, messages, conversation, review, past

**Example:**
\`\`\`json
{
  "userId": "nandini",
  "projectId": "myproject"
}
\`\`\``,
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
        description: `## Store Context Summary

**Purpose:** Save condensed summary and clear chat history.

**Use Cases:**
- Freeing up context window
- Condensing long conversations
- Saving key takeaways

**Note:** Automatically clears chat history after storing summary.

**Keywords:** summarize, condense, summary, compress, key points

**Example:**
\`\`\`json
{
  "userId": "nandini",
  "projectId": "myproject",
  "summary": "Discussed login bug - root cause is expired token. Fix needed in auth middleware."
}
\`\`\``,
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
        description: `## Get Context Summary

**Purpose:** Retrieve stored condensed conversation summary.

**Use Cases:**
- Getting condensed context
- Reviewing key takeaways
- Refreshing memory before new conversation

**Keywords:** summary, condensed, overview, key points

**Example:**
\`\`\`json
{
  "userId": "nandini",
  "projectId": "myproject"
}
\`\`\``,
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
