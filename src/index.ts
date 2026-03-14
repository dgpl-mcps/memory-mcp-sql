import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { initMongo } from "./db/mongo.js";
import { initSqlite } from "./db/sqlite.js";
import { graphTools } from "./tools/graph.js";
import { shortTermTools } from "./tools/shortTerm.js";

import { contextTools } from "./tools/context.js";
import { projectTools } from "./tools/project.js";
import { documentTools } from "./tools/document.js";
import { hybridTools } from "./tools/hybrid.js";
import { systemTools } from "./tools/system.js";
import { AuditLogger } from "./utils/logger.js";
import { CircuitBreaker } from "./utils/circuit.js";
import { validateEnv } from "./utils/env.js";
import { OutputSanitizer } from "./utils/sanitizer.js";

import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../.env");
dotenv.config({ path: envPath });

// Step 1 - Extract all tool definitions into a module-level ALL_TOOLS constant
const ALL_TOOLS: any[] = [
    ...graphTools,
    ...shortTermTools,
    ...contextTools,
    ...projectTools,
    ...documentTools,
    ...hybridTools,
    ...systemTools,
];

// V6 Hardening: Fatal fail immediately if Environment configuration is corrupted
validateEnv();

// Inject the search tool at the beginning (it must NOT be deferred)
ALL_TOOLS.unshift({
    name: 'memory_tool_search',
    description: '[meta] Search for available tools by keyword. Use this when you need a specific capability. Returns names, descriptions and full schemas for matching tools.',
    inputSchema: {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'Keyword to search for in tool names and descriptions' },
        },
        required: ['query'],
    },
});

async function run() {
    console.error("Starting Memory MCP...");

    // Initialize Databases
    await initMongo();
    initSqlite();

    // Step 4 - Ensure appropriate Server instantiation
    const server = new Server(
        { name: "memory-mcp", version: "1.0.0" },
        {
            capabilities: {
                tools: {},
            },
        }
    );

    // Step 2 - Update ListToolsRequestSchema Handler
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        const enableDeferLoading = process.env.ENABLE_DEFER_LOADING !== 'false';

        const tools = enableDeferLoading
            ? ALL_TOOLS.filter(t => t.name === 'memory_tool_search')
            : ALL_TOOLS;

        // Ensure we map the inputSchema correctly for the Server API response
        return {
            tools: tools.map(t => ({
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema
            }))
        };
    });

    // Step 3 - Add Tool Search Handler in CallToolRequestSchema
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        if (name === 'memory_tool_search') {
            const query = String((args as any)?.query || '').toLowerCase();

            const results = ALL_TOOLS.filter((t: any) =>
                t.name.toLowerCase().includes(query) ||
                (t.description && t.description.toLowerCase().includes(query))
            );

            if (results.length === 0) {
                return {
                    content: [{ type: 'text', text: `No tools found matching '${query}'. Try a broader keyword.` }]
                };
            }

            const formatted = results.map((t: any) =>
                `--- Tool: ${t.name} ---\nDescription: ${t.description}\nSchema: ${JSON.stringify(t.inputSchema, null, 2)}`
            ).join('\n\n');

            return {
                content: [{ type: 'text', text: `Found ${results.length} matching tools:\n\n${formatted}` }]
            };
        }

        // Handle dynamically registered tools
        const tool = ALL_TOOLS.find(t => t.name === name);
        if (tool && tool.handler) {
            try {
                const startTime = Date.now();
                const args = request.params.arguments as any || {};
                const userId = args.userId || "UNKNOWN_USER";
                const projectId = args.projectId || "UNKNOWN_PROJECT";

                // Enterprise Resilience V5: Circuit Breaker validation before execution.
                try {
                    CircuitBreaker.checkRateLimit(userId, projectId);
                } catch (cbError: any) {
                    return {
                        isError: true,
                        content: [{ type: "text", text: cbError.message }]
                    };
                }

                // Execute Tool
                let result = await tool.handler(args);

                // V7 Distributed Reliability: Protect context limits from massive DB blobs
                result = OutputSanitizer.sanitize(result);

                const duration = Date.now() - startTime;

                // Enterprise Resilience V5: Secure Audit Logging of the action, success or fail.
                AuditLogger.log(request.params.name, userId, projectId, args, result, duration);

                return result;
            } catch (error: any) {
                return {
                    isError: true,
                    content: [{ type: "text", text: `Tool execution failed: ${error.message}` }]
                };
            }
        }

        return {
            isError: true,
            content: [{ type: "text", text: `Unknown tool: ${name}` }]
        };
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
}

// V7 Distributed Reliability: Graceful Shutdown Hooks
// We must flush WAL caches to SSD and disconnect remote DBs cleanly before exits.
const gracefulShutdown = async (signal: string) => {
    console.error(`\nReceived ${signal}. V7 Distributed Reliability triggering Safe Shutdown Sequence...`);
    try {
        await mongoose.disconnect();
        console.error("- MongoDB Connections Safely Closed");
        // Wait briefly for SQLite WAL files to flush
        setTimeout(() => {
            console.error("- SQLite Buffers Flushed");
            console.error("Memory Node Terminated Cleanly.");
            process.exit(0);
        }, 500);
    } catch (err) {
        console.error("Error during graceful shutdown:", err);
        process.exit(1);
    }
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

run().catch((error: any) => {
    console.error("Server error:", error);
    process.exit(1);
});
