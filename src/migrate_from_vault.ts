#!/usr/bin/env node

import Database from "better-sqlite3";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface Chunk {
    id: string;
    path: string;
    source: string;
    start_line: number;
    end_line: number;
    hash: string;
    model: string;
    text: string;
    embedding: string;
    updated_at: number;
}

async function callMcpTool(toolName: string, args: Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
        const proc = spawn("node", [path.join(__dirname, "index.js")], {
            stdio: ["pipe", "pipe", "pipe"],
            env: { ...process.env, ENABLE_DEFER_LOADING: "false" }
        });

        let output = "";
        proc.stdout.on("data", (data) => {
            output += data.toString();
        });
        proc.stderr.on("data", (data) => {
            console.error(`[MCP] ${data.toString().trim()}`);
        });

        proc.on("close", () => {
            try {
                const lines = output.trim().split("\n");
                const lastLine = lines.filter(l => l.startsWith("{")).pop();
                if (lastLine) {
                    const result = JSON.parse(lastLine);
                    resolve(result.result);
                } else {
                    reject(new Error("No JSON output"));
                }
            } catch (e) {
                reject(e);
            }
        });

        const request = {
            jsonrpc: "2.0",
            id: Date.now(),
            method: "tools/call",
            params: { name: toolName, arguments: args }
        };

        proc.stdin.write(JSON.stringify(request) + "\n");
        proc.stdin.end();
    });
}

async function migrate() {
    console.error("🚀 Starting Migration from Obsidian Vault...");

    const oldDbPath = path.join(__dirname, "..", "main.sqlite");
    const oldDb = new Database(oldDbPath, { readonly: true });

    const chunks = oldDb.prepare("SELECT * FROM chunks ORDER BY path, start_line").all() as Chunk[];
    console.error(`📦 Found ${chunks.length} chunks to migrate`);

    let migrated = 0;
    let errors = 0;

    for (const chunk of chunks) {
        try {
            const ownerId = "nandini";
            const sessionId = "migration_session";
            const text = chunk.text;
            
            if (!text || text.trim().length < 10) continue;

            let topicId = "general";
            let memoryType = "note";
            
            if (chunk.path.includes("daily/")) {
                topicId = "daily-notes";
                memoryType = "daily";
            } else if (chunk.path.includes("goals/")) {
                topicId = "goals";
                memoryType = "goal";
            } else if (chunk.path.includes("insights/")) {
                topicId = "insights";
                memoryType = "insight";
            } else if (chunk.path.includes("ontology/")) {
                topicId = "ontology";
                memoryType = "concept";
            }

            await callMcpTool("extract_entities", {
                text: text,
                ownerId: ownerId,
                projectId: "nandini-vault",
                sessionId: sessionId,
                topicId: topicId,
                method: "pattern",
                autoStore: "true"
            });

            await callMcpTool("add_timeline_entry", {
                ownerId: ownerId,
                sessionId: sessionId,
                topicId: topicId,
                perspectiveOf: "self",
                content: `[${chunk.path}]\n${text.slice(0, 500)}`,
                memoryType: memoryType,
                priority: 0.6
            });

            migrated++;
            if (migrated % 5 === 0) {
                console.error(`✅ Migrated ${migrated}/${chunks.length} chunks`);
            }
        } catch (err: any) {
            errors++;
            if (errors < 5) console.error(`❌ Error: ${err.message}`);
        }
    }

    console.error("\n📊 Migration Summary:");
    console.error(`   - Total chunks: ${chunks.length}`);
    console.error(`   - Migrated: ${migrated}`);
    console.error(`   - Errors: ${errors}`);

    oldDb.close();
    
    if (errors > 0) {
        console.error("\n⚠️  Some chunks failed to migrate.");
    }
    
    console.error("\n✅ Migration complete!");
}

migrate().catch(err => {
    console.error("Migration failed:", err);
    process.exit(1);
});
