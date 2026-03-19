import { db } from "../db/sqlite.js";
import { getMemoryConfig } from "../utils/env.js";

export const hybridTools = [
    {
        name: "global_memory_search",
        description: "A Unified RAG search across short-term memory and graph nodes. If userId/projectId provided, filters by them. If omitted, searches ALL memories globally.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "Optional: filter by userId" },
                projectId: { type: "string", description: "Optional: filter by projectId" },
                query: { type: "string", description: "The search query" },
                limit: { type: "number", description: "Results per branch (default from env: 10)" },
                offset: { type: "number", description: "Pagination offset (default from env: 0)" },
                confidenceThreshold: { type: "number", description: "Min confidence score (default from env: 20)" }
            },
            required: ["query"],
        },
        handler: async (args: any) => {
            const config = getMemoryConfig();
            const { userId, projectId, query } = args;
            const limit = args.limit ?? config.DEFAULT_SEARCH_LIMIT;
            const offset = args.offset ?? config.DEFAULT_SEARCH_OFFSET;
            const threshold = args.confidenceThreshold ?? config.DEFAULT_CONFIDENCE_THRESHOLD;
            
            try {
                // 1. Dynamic Short Term Memory Search
                let stmSql = `SELECT * FROM ShortTermChat WHERE 
                    (content LIKE ? OR summary LIKE ? OR response LIKE ? OR responseSummary LIKE ? OR combo LIKE ?)`;
                const pattern = `%${query}%`;
                const params: any[] = [pattern, pattern, pattern, pattern, pattern];
                
                if (userId) { stmSql += ` AND userId = ?`; params.push(userId); }
                if (projectId) { stmSql += ` AND projectId = ?`; params.push(projectId); }
                stmSql += ` ORDER BY chatIndex DESC LIMIT ? OFFSET ?`;
                params.push(limit, offset);
                
                const stmResults = db.prepare(stmSql).all(...params);

                // 2. Dynamic Graph Entity Search
                let graphSql = `SELECT * FROM Entities WHERE name LIKE ?`;
                const graphParams: any[] = [pattern];
                if (userId) { graphSql += ` AND userId = ?`; graphParams.push(userId); }
                if (projectId) { graphSql += ` AND projectId = ?`; graphParams.push(projectId); }
                graphSql += ` ORDER BY createdAt DESC LIMIT ? OFFSET ?`;
                graphParams.push(limit, offset);
                
                const graphResults = db.prepare(graphSql).all(...graphParams).map((r: any) => ({
                    ...r,
                    properties: r.properties ? JSON.parse(r.properties) : {}
                }));

                const unifiedResult = {
                    short_term_memory: stmResults,
                    long_term_graph: graphResults,
                    search_context: { 
                        userId: userId || "ALL", 
                        projectId: projectId || "ALL", 
                        query,
                        limit,
                        offset,
                        confidenceThreshold: threshold,
                        source: "global_memory_search"
                    }
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
