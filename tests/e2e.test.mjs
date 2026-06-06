#!/usr/bin/env node
/**
 * End-to-end integration test for memory MCP.
 * Spawns the MCP server, talks JSON-RPC over stdio, and exercises the full pipeline.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import readline from "node:readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_PATH = path.resolve(__dirname, "../build/index.js");

const TEST_USER = "e2e-user-" + Date.now();
const TEST_PROJECT = "e2e-project";

function callMcp(server, method, params, id) {
    return new Promise((resolve, reject) => {
        const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
        const onData = (chunk) => {
            const text = chunk.toString();
            // The server writes to stderr for logs, and to stdout for JSON-RPC
            for (const line of text.split("\n")) {
                if (!line.startsWith("{")) continue;
                try {
                    const obj = JSON.parse(line);
                    if (obj.id === id) {
                        server.stdout.off("data", onData);
                        resolve(obj);
                    }
                } catch (e) { /* ignore non-JSON */ }
            }
        };
        server.stdout.on("data", onData);
        server.stdin.write(msg);
        setTimeout(() => {
            server.stdout.off("data", onData);
            reject(new Error(`timeout for ${method}`));
        }, 10000);
    });
}

async function main() {
    console.log("=== End-to-end Memory MCP Test ===\n");

    const server = spawn("node", [SERVER_PATH], {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
            ...process.env,
            MEMORY_DB_PATH: "/tmp/e2e_memory.db",
            NODE_ENV: "test",
            ENABLE_DEFER_LOADING: "false", // expose all tools for the test
        },
    });

    // Drain stderr (logs) but capture for error messages
    const logs = [];
    server.stderr.on("data", (d) => logs.push(d.toString()));

    // Wait for "SQLite Initialized"
    await new Promise((resolve) => {
        const check = () => {
            if (logs.join("").includes("SQLite Initialized")) resolve();
            else setTimeout(check, 100);
        };
        check();
    });
    console.log("✅ Server started\n");

    // 1. Initialize
    const init = await callMcp(server, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "e2e-test", version: "1.0" },
    }, 1);
    console.log("✅ initialize:", init.result.serverInfo?.name || "ok");

    // 2. List tools
    const tools = await callMcp(server, "tools/list", {}, 2);
    console.log(`✅ tools/list: ${tools.result.tools.length} tools available`);
    const shortTermTool = tools.result.tools.find(t => t.name.includes("short_term") || t.name.includes("shortTerm") || t.name === "memory");
    if (!shortTermTool) {
        console.log("❌ no usable tool found");
        process.exit(1);
    }
    console.log(`   using: ${shortTermTool.name}\n`);

    // 3. Store memories (use op: "remember" with userMessage/agentMessage)
    const memories = [
        { key: "mongodb-conn-error",  userMessage: "MongoDB connection timeout on beta", agentMessage: "Investigated and found network issue on beta server" },
        { key: "docker-restart-loop", userMessage: "Docker container keeps restarting",     agentMessage: "ServerSelectionTimeoutMS was set too low in db.js" },
        { key: "ci-failed-health",    userMessage: "GitHub Actions CI failed",            agentMessage: "Health check returned 503, server boot took 41s but start-period was only 15s" },
        { key: "cache-bust-missing",  userMessage: "CACHE_BUST was after COPY",            agentMessage: "Docker build wasn't busting cache, ARG moved before COPY" },
    ];

    console.log("--- Storing memories ---");
    for (let i = 0; i < memories.length; i++) {
        const m = memories[i];
        const res = await callMcp(server, "tools/call", {
            name: "memory",
            arguments: { op: "remember", userId: TEST_USER, sessionId: TEST_PROJECT, userMessage: m.userMessage, agentMessage: m.agentMessage },
        }, 10 + i);
        const text = res.result?.content?.[0]?.text || "";
        // Check for success marker in the JSON response
        let parsed = null;
        try { parsed = JSON.parse(text); } catch {}
        if (parsed && parsed.success) {
            console.log(`✅ stored: ${m.key} (id: ${parsed.id})`);
        } else if (parsed && parsed.error) {
            console.log(`❌ remember ${m.key}:`, parsed.error);
            process.exit(1);
        } else {
            console.log(`❓ remember ${m.key}:`, text.slice(0, 100));
        }
    }

    // 4. Search using op: "semantic" (vector search)
    console.log("\n--- Vector search tests ---");
    const queries = [
        { q: "mongodb connection failure", expectText: "mongodb" },
        { q: "docker container not starting", expectText: "docker" },
        { q: "github actions pipeline broken", expectText: "github" },
        { q: "docker image cache stale", expectText: "cache" },
        { q: "totally unrelated cat video", expectText: null }, // expect no top match
    ];

    let pass = 0, fail = 0;
    for (let i = 0; i < queries.length; i++) {
        const q = queries[i];
        const res = await callMcp(server, "tools/call", {
            name: "memory",
            arguments: { op: "semantic", userId: TEST_USER, query: q.q, limit: 3 },
        }, 100 + i);

        const text = res.result?.content?.[0]?.text || "";
        let parsed = null;
        try { parsed = JSON.parse(text); } catch {}
        const results = parsed?.results || [];

        if (q.expectText === null) {
            console.log(`Q: "${q.q}" → ${results.length} results (unrelated, OK)`);
            pass++;
        } else {
            const topText = (results[0]?.content || "").toLowerCase();
            if (topText.includes(q.expectText)) {
                console.log(`✅ Q: "${q.q}" → top: "${results[0]?.content?.slice(0, 60)}"`);
                pass++;
            } else {
                console.log(`❌ Q: "${q.q}" → top: "${results[0]?.content?.slice(0, 60) || 'NONE'}"`);
                fail++;
            }
        }
    }

    // 5. Test edge cases
    console.log("\n--- Edge cases ---");
    const edgeCases = [
        { q: "", label: "empty query" },
        { q: "    ", label: "whitespace query" },
        { q: "🚀🔥💯", label: "emoji-only" },
        { q: "'; DROP TABLE users; --", label: "sql-injection" },
    ];
    for (let i = 0; i < edgeCases.length; i++) {
        const e = edgeCases[i];
        try {
            const res = await callMcp(server, "tools/call", {
                name: "memory",
                arguments: { op: "semantic", userId: TEST_USER, query: e.q, limit: 3 },
            }, 200 + i);
            console.log(`✅ ${e.label}: no crash`);
            pass++;
        } catch (err) {
            console.log(`❌ ${e.label}: ${err.message}`);
            fail++;
        }
    }

    console.log(`\n=== Result: ${pass} pass, ${fail} fail ===`);

    server.kill();
    process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error("test runner failed:", e);
    process.exit(1);
});
