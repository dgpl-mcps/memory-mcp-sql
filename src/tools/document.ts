import { storeDocumentChunk, searchDocumentChunks } from "../db/sqlite.js";
import { getMemoryConfig } from "../utils/env.js";

// Basic chunking helper if no library is allowed
function chunkText(text: string, maxChars: number = 2000): string[] {
    const chunks: string[] = [];
    let currentIndex = 0;
    while (currentIndex < text.length) {
        const end = Math.min(currentIndex + maxChars, text.length);
        chunks.push(text.substring(currentIndex, end));
        currentIndex = end;
    }
    return chunks;
}

export const documentTools = [
    {
        name: "store_document",
        description: "Store a large text document by automatically splitting it into semantic chunks and indexing them in the vector database.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                projectId: { type: "string" },
                documentId: { type: "string", description: "A unique identifier for this document (e.g., filename or URL)" },
                text: { type: "string", description: "The full raw text of the document" }
            },
            required: ["userId", "projectId", "documentId", "text"],
        },
        handler: async (args: any) => {
            const { userId, projectId, documentId, text } = args;
            try {
                const chunks = chunkText(text, 2000); // chunking into pieces of 2000 characters

                // Store each chunk sequentially to avoid locking SQLite
                for (let i = 0; i < chunks.length; i++) {
                    await storeDocumentChunk(userId, projectId, documentId, i, chunks[i]);
                }

                return {
                    content: [{ type: "text", text: `Document '${documentId}' successfully stored into ${chunks.length} vectorized chunks.` }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "search_document",
        description: "Search across a stored document to find the most semantically relevant chunks.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                projectId: { type: "string" },
                documentId: { type: "string", description: "The unique identifier of the document to query" },
                query: { type: "string", description: "The question or search query" },
                limit: { type: "number", description: "Max results (default from env: 10)" },
                offset: { type: "number", description: "Pagination offset (default from env: 0)" }
            },
            required: ["userId", "projectId", "documentId", "query"],
        },
        handler: async (args: any) => {
            const config = getMemoryConfig();
            const { userId, projectId, documentId, query } = args;
            const limit = args.limit ?? config.DEFAULT_SEARCH_LIMIT;
            const offset = args.offset ?? config.DEFAULT_SEARCH_OFFSET;
            
            try {
                const results = await searchDocumentChunks(userId, projectId, documentId, query, limit);

                if (results.length === 0) {
                    return {
                        content: [{ type: "text", text: `No matching chunks found in document '${documentId}'.` }],
                    };
                }

                return {
                    content: [{ type: "text", text: JSON.stringify({
                        results: results.slice(offset),
                        search_context: { limit, offset, source: "search_document" }
                    }, null, 2) }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    }
];
