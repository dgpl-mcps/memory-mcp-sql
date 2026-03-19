import { z } from "zod";
import { extractWithPatterns, extractWithLLM, storeExtractedEntities } from "./extract.js";
import { 
    createSession, getSession, updateSession, endSession, listSessions,
    switchTopic, mergeSessions, getSessionTimeline, addTimelineEntry,
    getCrossSessionMemories, getTimelineForTopic
} from "./session.js";
import { getBetterContext, getPerspectiveContext, getMemoryForPerson } from "./contextBetter.js";
import {
    shareMemory, shareWithMultiple, getSharedWithMe, getSharedByMe,
    markAsRead, markAllAsRead, revokeShare, autoShareRelevantInfo,
    getUnreadCount, syncSharedInfoToMyMemory
} from "./share.js";
import { getMemoryConfig } from "../utils/env.js";

const baseSchema = z.object({
    userId: z.string().optional(),
    projectId: z.string().optional(),
    sessionId: z.string().optional(),
    topicId: z.string().optional(),
    ownerId: z.string().optional(),
    query: z.string().optional(),
});

export const multiUserTools = [
    {
        name: "extract_entities",
        description: `## Extract Entities from Text

**Purpose:** Automatically extract persons, bots, organizations, tasks from text.

**Entity Types Extracted:** Person, Bot, Organization, Task, Event, Topic

**Extraction Methods:**
| Method | Use When |
|--------|----------|
| pattern | Fast, no API needed |
| llm | More accurate, needs LLM_EXTRACTION_URL |
| both | Best accuracy, uses both |

**Use Cases:**
- Processing conversation text
- Building knowledge graph from text
- Extracting contacts from messages
- Auto-organizing information

**Keywords:** extract, entities, parse, persons, organizations, NER

**Example:**
\`\`\`json
{
  "text": "John from Acme Inc called. He needs the report by Friday. Tell Sarah to send it.",
  "ownerId": "user123",
  "projectId": "work",
  "method": "both",
  "autoStore": true
}
\`\`\``,
        inputSchema: {
            type: "object",
            properties: {
                text: { type: "string", description: "Text to extract entities from" },
                ownerId: { type: "string", description: "Memory owner ID" },
                projectId: { type: "string", description: "Project ID" },
                sessionId: { type: "string", description: "Session ID (optional)" },
                topicId: { type: "string", description: "Topic ID (optional)" },
                sourcePersonId: { type: "string", description: "Who said this (optional)" },
                method: { type: "string", enum: ["pattern", "llm", "both"], default: "both", description: "Extraction method" },
                autoStore: { type: "boolean", default: true, description: "Auto-store extracted entities" }
            },
            required: ["text", "ownerId"],
        },
        handler: async (args: any) => {
            try {
                const config = getMemoryConfig();
                const { text, ownerId, projectId, sessionId, topicId, sourcePersonId, method, autoStore } = args;
                
                let result;
                if (method === "llm") {
                    result = await extractWithLLM(text);
                } else if (method === "pattern") {
                    result = extractWithPatterns(text);
                } else {
                    result = await extractWithLLM(text, true);
                }
                
                let stored = null;
                if (autoStore) {
                    stored = storeExtractedEntities(
                        ownerId,
                        projectId || "default",
                        result,
                        sessionId,
                        topicId,
                        sourcePersonId
                    );
                }
                
                return {
                    content: [{ type: "text", text: JSON.stringify({
                        extracted: result,
                        stored: stored ? {
                            entities: stored.entities.length,
                            relations: stored.relations.length,
                            memoryIds: stored.memoryIds.length
                        } : null
                    }, null, 2) }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    {
        name: "create_session",
        description: "Create a new session (persistent, topic, timeline, or cross).",
        inputSchema: {
            type: "object",
            properties: {
                ownerId: { type: "string", description: "Session owner ID" },
                type: { type: "string", enum: ["persistent", "topic", "timeline", "cross"], default: "persistent" },
                topicId: { type: "string", description: "Topic ID (for topic sessions)" },
                title: { type: "string", description: "Session title" },
                context: { type: "string", description: "Initial context" }
            },
            required: ["ownerId"],
        },
        handler: async (args: any) => {
            try {
                const session = createSession(args);
                return {
                    content: [{ type: "text", text: JSON.stringify({ session }, null, 2) }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    {
        name: "get_better_context",
        description: `## Get Better Context (Comprehensive)

**Purpose:** All-in-one context retrieval with timeline, topics, relations, and shared memories.

**Use Cases:**
- Starting new conversation with full context
- Getting AI-ready context
- Cross-session memory retrieval
- Comprehensive overview

**Options:**
- includeTimeline: Recent memories grouped by date
- includeTopics: Topic-based organization
- includeRelations: People/bots/organizations with relationships
- includeShared: Shared memories from others
- timeRange: today, week, month, all

**Keywords:** context, overview, summary, timeline, topics, relations, shared

**Example:**
\`\`\`json
{
  "ownerId": "nandini",
  "timeRange": "week",
  "includeTimeline": true,
  "includeTopics": true,
  "includeRelations": true,
  "includeShared": true,
  "maxTokens": 8000
}
\`\`\``,
        inputSchema: {
            type: "object",
            properties: {
                ownerId: { type: "string", description: "Memory owner ID" },
                sessionId: { type: "string", description: "Current session ID" },
                topicId: { type: "string", description: "Filter by topic" },
                personId: { type: "string", description: "Filter by person" },
                includeTimeline: { type: "boolean", default: true },
                includeTopics: { type: "boolean", default: true },
                includeRelations: { type: "boolean", default: true },
                includeShared: { type: "boolean", default: true },
                timeRange: { type: "string", enum: ["today", "week", "month", "all"], default: "week" },
                topicFilter: { type: "array", items: { type: "string" }, description: "Filter topics" },
                personFilter: { type: "array", items: { type: "string" }, description: "Filter persons" },
                maxTokens: { type: "number", default: 8000 }
            },
            required: ["ownerId"],
        },
        handler: async (args: any) => {
            try {
                const context = getBetterContext(args);
                return {
                    content: [{ type: "text", text: JSON.stringify(context, null, 2) }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    {
        name: "share_memory",
        description: "Share a memory with another user (for multi-user perspective).",
        inputSchema: {
            type: "object",
            properties: {
                memoryId: { type: "string", description: "Memory/Timeline ID to share" },
                memoryType: { type: "string", enum: ["timeline", "longterm", "shortterm"] },
                fromOwnerId: { type: "string", description: "Who is sharing" },
                toOwnerId: { type: "string", description: "Who to share with" },
                perspectiveNote: { type: "string", description: "Note about perspective" }
            },
            required: ["memoryId", "memoryType", "fromOwnerId", "toOwnerId"],
        },
        handler: async (args: any) => {
            try {
                const result = shareMemory(args);
                return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    {
        name: "get_shared_with_me",
        description: "Get memories shared with you by other users.",
        inputSchema: {
            type: "object",
            properties: {
                ownerId: { type: "string", description: "Your owner ID" },
                includeRead: { type: "boolean", default: false },
                limit: { type: "number" },
                offset: { type: "number" }
            },
            required: ["ownerId"],
        },
        handler: async (args: any) => {
            try {
                const shared = getSharedWithMe(args.ownerId, args);
                const unread = getUnreadCount(args.ownerId);
                return {
                    content: [{ type: "text", text: JSON.stringify({ shared, unreadCount: unread }, null, 2) }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    {
        name: "add_timeline_entry",
        description: "Add a memory to the timeline with perspective.",
        inputSchema: {
            type: "object",
            properties: {
                ownerId: { type: "string", description: "Memory owner" },
                sessionId: { type: "string", description: "Session ID" },
                topicId: { type: "string", description: "Topic ID" },
                perspectiveOf: { type: "string", default: "self", description: "self or other" },
                sourcePersonId: { type: "string", description: "Who shared this info" },
                content: { type: "string", description: "Memory content" },
                memoryType: { type: "string", default: "general" },
                entities: { type: "array", items: { type: "string" } },
                relations: { type: "array", items: { type: "string" } },
                priority: { type: "number", default: 0.5 }
            },
            required: ["ownerId", "content"],
        },
        handler: async (args: any) => {
            try {
                const entry = addTimelineEntry(args.ownerId, args);
                return {
                    content: [{ type: "text", text: JSON.stringify({ entry }, null, 2) }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    {
        name: "get_timeline",
        description: "Get memories grouped by time (hourly or daily).",
        inputSchema: {
            type: "object",
            properties: {
                ownerId: { type: "string", description: "Memory owner" },
                sessionId: { type: "string", description: "Session ID (optional)" },
                granularity: { type: "string", enum: ["hour", "day"], default: "hour" },
                startDate: { type: "string", description: "Start date ISO" },
                endDate: { type: "string", description: "End date ISO" },
                limit: { type: "number" }
            },
            required: ["ownerId"],
        },
        handler: async (args: any) => {
            try {
                const timeline = getSessionTimeline(args.ownerId, args.sessionId, args);
                return {
                    content: [{ type: "text", text: JSON.stringify({ timeline }, null, 2) }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    {
        name: "get_person_memories",
        description: "Get all memories about a specific person.",
        inputSchema: {
            type: "object",
            properties: {
                ownerId: { type: "string", description: "Memory owner" },
                personId: { type: "string", description: "Person entity ID or name" },
                perspective: { type: "string", enum: ["self", "other", "all"], default: "all" },
                limit: { type: "number" }
            },
            required: ["ownerId", "personId"],
        },
        handler: async (args: any) => {
            try {
                const memories = getMemoryForPerson(args.ownerId, args.personId, args);
                return {
                    content: [{ type: "text", text: JSON.stringify({ memories, count: memories.length }, null, 2) }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    {
        name: "switch_topic",
        description: "Switch current session to a different topic.",
        inputSchema: {
            type: "object",
            properties: {
                sessionId: { type: "string", description: "Session ID" },
                ownerId: { type: "string", description: "Session owner" },
                newTopicId: { type: "string", description: "New topic ID" }
            },
            required: ["sessionId", "ownerId", "newTopicId"],
        },
        handler: async (args: any) => {
            try {
                const session = switchTopic(args.sessionId, args.ownerId, args.newTopicId);
                return {
                    content: [{ type: "text", text: JSON.stringify({ session }, null, 2) }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },

    {
        name: "mark_shared_read",
        description: "Mark shared memories as read.",
        inputSchema: {
            type: "object",
            properties: {
                ownerId: { type: "string", description: "Your owner ID" },
                shareId: { type: "string", description: "Specific share ID (optional, marks all if omitted)" }
            },
            required: ["ownerId"],
        },
        handler: async (args: any) => {
            try {
                let result;
                if (args.shareId) {
                    result = markAsRead(args.shareId, args.ownerId);
                } else {
                    result = markAllAsRead(args.ownerId);
                }
                return {
                    content: [{ type: "text", text: JSON.stringify({ marked: result }, null, 2) }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    }
];
