import { searchShortTermMemory, listEntities } from "../db/sqlite.js";

// Note: To make this a true hybrid search, it should also hit the 'vss_doc' vector table. 
// For simplicity without duplicating all logic, we'll demonstrate a unified RAG orchestrator 
// that hits ShortTerm Vector + SQLite Graph Node Names simultaneously.

export const hybridTools = [
    {
        name: "global_memory_search",
        description: "A Unified Retrieval-Augmented Generation (RAG) search. Simultaneously queries the SQLite Vector short-term DB and the SQLite Graph node titles to retrieve a consolidated block of highly relevant memory.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                projectId: { type: "string" },
                query: { type: "string", description: "The overarching search objective" },
                limit: { type: "number", description: "Limit per database branch (default 3)" }
            },
            required: ["userId", "projectId", "query"],
        },
        handler: async (args: any) => {
            const { userId, projectId, query, limit = 3 } = args;
            try {
                // 1. Vector Search across Short Term Keys & Values via SQLite
                const stmResults = await searchShortTermMemory(userId, projectId, query, limit);

                // 2. Text Search across Long Term Graph Nodes via SQLite
                const graphResults = listEntities(userId, projectId).filter(e => 
                    e.name.toLowerCase().includes(query.toLowerCase())
                ).slice(0, limit);

                const unifiedResult = {
                    vector_short_term: stmResults,
                    graph_long_term: graphResults
                };

                return {
                    content: [{ type: "text", text: JSON.stringify(unifiedResult, null, 2) }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    }
];
