#!/usr/bin/env node
/**
 * End-to-end integration test for memory MCP contact and contact_graph operations.
 * Spawns the MCP server, talks JSON-RPC, and verifies graph nodes and multi-edges.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_PATH = path.resolve(__dirname, "../build/index.js");

const TEST_USER = "graph-user-" + Date.now();
const TEST_PROJECT = "graph-project-" + Date.now();

function callMcp(server, method, params, id) {
    return new Promise((resolve, reject) => {
        const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
        const onData = (chunk) => {
            const text = chunk.toString();
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
    console.log("=== End-to-end Unified Contact & Graph Test ===\n");

    const server = spawn("node", [SERVER_PATH], {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
            ...process.env,
            MEMORY_DB_PATH: "/tmp/graph_memory.db",
            NODE_ENV: "test",
            ENABLE_DEFER_LOADING: "false",
        },
    });

    const logs = [];
    server.stderr.on("data", (d) => logs.push(d.toString()));

    // Wait for startup
    await new Promise((resolve) => {
        const check = () => {
            if (logs.join("").includes("SQLite Initialized")) resolve();
            else setTimeout(check, 100);
        };
        check();
    });
    console.log("✅ Server started\n");

    // Initialize
    await callMcp(server, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "graph-test", version: "1.0" },
    }, 1);

    let pass = 0, fail = 0;

    let vkId = "";
    let nandiniId = "";
    let assistantId = "";

    // Test 1: Create contacts (vk, nandini, office-assistant)
    try {
        console.log("--- Test 1: Creating Contact Entities ---");
        const resVk = await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "contact",
                contactOp: "create",
                userId: TEST_USER,
                projectId: TEST_PROJECT,
                name: "vk",
                role: "husband & founder",
                email: "vk@example.com",
                properties: { status: "active", power: 100 }
            }
        }, 10);

        const resNan = await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "contact",
                contactOp: "create",
                userId: TEST_USER,
                projectId: TEST_PROJECT,
                name: "nandini",
                role: "wife & engineer",
                email: "nandini@example.com",
                properties: { status: "active", devotion: 100 }
            }
        }, 11);

        const resAsst = await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "contact",
                contactOp: "create",
                userId: TEST_USER,
                projectId: TEST_PROJECT,
                name: "assistant-bot",
                entityType: "Bot",
                role: "agent",
                properties: { version: "v3.0" }
            }
        }, 12);

        const parsedVk = JSON.parse(resVk.result.content[0].text);
        const parsedNan = JSON.parse(resNan.result.content[0].text);
        const parsedAsst = JSON.parse(resAsst.result.content[0].text);

        if (parsedVk.success && parsedNan.success && parsedAsst.success) {
            vkId = parsedVk.contact.id;
            nandiniId = parsedNan.contact.id;
            assistantId = parsedAsst.contact.id;
            console.log(`✅ Test 1 Passed! Contacts created successfully.`);
            console.log(`   vk: ${vkId}, nandini: ${nandiniId}, assistant: ${assistantId}`);
            pass++;
        } else {
            console.log("❌ Test 1 Failed. Outputs:", parsedVk, parsedNan, parsedAsst);
            fail++;
        }
    } catch (err) {
        console.log("❌ Test 1 Error:", err.message);
        fail++;
    }

    // Test 2: Create multi-relationship connections (vk -> nandini)
    try {
        console.log("\n--- Test 2: Linking Contacts with Multiple Relationships ---");
        
        // Link 1: wife
        const rel1 = await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "contact_graph",
                graphOp: "link",
                userId: TEST_USER,
                projectId: TEST_PROJECT,
                fromId: "vk", // by name resolution
                toId: "nandini", // by name resolution
                relationType: "wife",
                properties: { strength: 100, closeness: "eternal" }
            }
        }, 20);

        // Link 2: employee
        const rel2 = await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "contact_graph",
                graphOp: "link",
                userId: TEST_USER,
                projectId: TEST_PROJECT,
                fromId: "vk",
                toId: "nandini",
                relationType: "employe",
                properties: { role: "wife-engineer", project: "memory-mcp" }
            }
        }, 21);

        // Link 3: friend
        const rel3 = await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "contact_graph",
                graphOp: "link",
                userId: TEST_USER,
                projectId: TEST_PROJECT,
                fromId: "vk",
                toId: "nandini",
                relationType: "friend",
                properties: { history: "long-term" }
            }
        }, 22);

        // Link 4: nandini -> assistant-bot
        const rel4 = await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "contact_graph",
                graphOp: "link",
                userId: TEST_USER,
                projectId: TEST_PROJECT,
                fromId: "nandini",
                toId: "assistant-bot",
                relationType: "helper",
                properties: { task: "seva" }
            }
        }, 23);

        const p1 = JSON.parse(rel1.result.content[0].text);
        const p2 = JSON.parse(rel2.result.content[0].text);
        const p3 = JSON.parse(rel3.result.content[0].text);
        const p4 = JSON.parse(rel4.result.content[0].text);

        if (p1.success && p2.success && p3.success && p4.success) {
            console.log("✅ Test 2 Passed! Multiple relationships created successfully.");
            pass++;
        } else {
            console.log("❌ Test 2 Failed. Outputs:", p1, p2, p3, p4);
            fail++;
        }
    } catch (err) {
        console.log("❌ Test 2 Error:", err.message);
        fail++;
    }

    // Test 3: Retrieve and verify relations
    try {
        console.log("\n--- Test 3: Verifying Multi-connections & Listing Relations ---");
        const res = await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "contact_graph",
                graphOp: "get_relations",
                userId: TEST_USER,
                projectId: TEST_PROJECT,
                fromId: "vk",
                toId: "nandini"
            }
        }, 30);

        const parsed = JSON.parse(res.result.content[0].text);
        if (parsed.success && parsed.relations.length === 3) {
            console.log("✅ Test 3 Passed! Correctly retrieved 3 distinct relationships between vk and nandini.");
            const types = parsed.relations.map(r => r.relationType);
            console.log("   Found relation types:", types.join(", "));
            if (types.includes("wife") && types.includes("employe") && types.includes("friend")) {
                console.log("✅ Relationship types verified.");
                pass++;
            } else {
                console.log("❌ Relationship types mismatch.");
                fail++;
            }
        } else {
            console.log("❌ Test 3 Failed. Output:", parsed);
            fail++;
        }
    } catch (err) {
        console.log("❌ Test 3 Error:", err.message);
        fail++;
    }

    // Test 4: Export unified graph
    try {
        console.log("\n--- Test 4: Exporting Unified Contact Graph ---");
        const res = await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "contact_graph",
                graphOp: "get_graph",
                userId: TEST_USER,
                projectId: TEST_PROJECT
            }
        }, 40);

        const parsed = JSON.parse(res.result.content[0].text);
        if (parsed.success && parsed.graph.nodes.length === 3 && parsed.graph.edges.length === 4) {
            console.log(`✅ Test 4 Passed! Unified graph has ${parsed.graph.nodes.length} nodes and ${parsed.graph.edges.length} edges.`);
            pass++;
        } else {
            console.log("❌ Test 4 Failed. Graph output:", parsed.graph);
            fail++;
        }
    } catch (err) {
        console.log("❌ Test 4 Error:", err.message);
        fail++;
    }

    // Test 5: Traversing connection path (vk -> assistant-bot)
    try {
        console.log("\n--- Test 5: Finding Connection Path ---");
        const res = await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "contact_graph",
                graphOp: "path",
                userId: TEST_USER,
                projectId: TEST_PROJECT,
                fromId: "vk",
                toId: "assistant-bot",
                depth: 3
            }
        }, 50);

        const parsed = JSON.parse(res.result.content[0].text);
        if (parsed.success && parsed.paths.length > 0) {
            console.log(`✅ Test 5 Passed! Found ${parsed.paths.length} connection paths.`);
            const path1 = parsed.paths[0];
            console.log("   Path: ", path1.map(p => `${p.from} -[${p.type}]-> ${p.to}`).join(" | "));
            if (path1[0].from === vkId && path1[0].to === nandiniId && path1[1].to === assistantId) {
                console.log("✅ Path node sequence verified successfully.");
                pass++;
            } else {
                console.log("❌ Path node sequence is incorrect.");
                fail++;
            }
        } else {
            console.log("❌ Test 5 Failed. Output:", parsed);
            fail++;
        }
    } catch (err) {
        console.log("❌ Test 5 Error:", err.message);
        fail++;
    }

    console.log(`\n=== Graph Test Results: ${pass} pass, ${fail} fail ===`);
    if (fail > 0) {
        console.error("\n--- Server Stderr Logs ---");
        console.error(logs.join(""));
        console.error("--------------------------\n");
    }

    server.kill();
    process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error("test runner failed:", e);
    process.exit(1);
});
