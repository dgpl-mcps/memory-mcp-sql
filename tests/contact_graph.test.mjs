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

    // Test 6: Validation, trimming, and Case-insensitive name resolution
    try {
        console.log("\n--- Test 6: Validation, Whitespace Normalization & Case-Insensitive Name Resolution ---");
        
        // 1. Try creating with empty name
        const resErr = await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "contact",
                contactOp: "create",
                userId: TEST_USER,
                projectId: TEST_PROJECT,
                name: "   ",
                role: "invalid"
            }
        }, 60);
        
        // 2. Try linking with different casing (e.g. "VK" instead of "vk")
        const relCase = await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "contact_graph",
                graphOp: "link",
                userId: TEST_USER,
                projectId: TEST_PROJECT,
                fromId: "VK", // different casing!
                toId: "Nandini", // different casing!
                relationType: "collaborator"
            }
        }, 61);

        // 3. Create a contact with multiple spaces and leading/trailing padding
        const resSp = await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "contact",
                contactOp: "create",
                userId: TEST_USER,
                projectId: TEST_PROJECT,
                name: "   vk   the    developer  ",
                role: "coder"
            }
        }, 62);

        // 4. Get the contact using collapsed-spaces and mixed case name
        const resGet = await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "contact",
                contactOp: "get",
                userId: TEST_USER,
                projectId: TEST_PROJECT,
                name: "VK the DEVELOPER"
            }
        }, 63);

        // 5. Link using mixed-case relation type with spacing
        const relNorm = await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "contact_graph",
                graphOp: "link",
                userId: TEST_USER,
                projectId: TEST_PROJECT,
                fromId: "vk",
                toId: "nandini",
                relationType: "   WIFE-COLLABORATOR   "
            }
        }, 64);

        const pErr = JSON.parse(resErr.result.content[0].text);
        const pCase = JSON.parse(relCase.result.content[0].text);
        const pSp = JSON.parse(resSp.result.content[0].text);
        const pGet = JSON.parse(resGet.result.content[0].text);
        const pNorm = JSON.parse(relNorm.result.content[0].text);

        // Assert all normalization and validations
        if (resErr.result.isError && 
            pCase.success && pCase.relation.relationType === "collaborator" &&
            pSp.success && pSp.contact.name === "vk the developer" &&
            pGet.success && pGet.contact.name === "vk the developer" &&
            pNorm.success && pNorm.relation.relationType === "wife-collaborator") {
            console.log("✅ Test 6 Passed! Blocked empty name, resolved case-insensitive names, normalized spaces, and relationship types correctly.");
            pass++;
        } else {
            console.log("❌ Test 6 Failed. Outputs:", pErr, pCase, pSp, pGet, pNorm);
            fail++;
        }
    } catch (err) {
        console.log("❌ Test 6 Error:", err.message);
        fail++;
    }

    // Test 7: Loop connections (self-relationships)
    try {
        console.log("\n--- Test 7: Self-Relationships & Loop Paths ---");
        
        // Link vk to vk
        const relSelf1 = await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "contact_graph",
                graphOp: "link",
                userId: TEST_USER,
                projectId: TEST_PROJECT,
                fromId: "vk",
                toId: "vk",
                relationType: "self-reference",
                properties: { note: "loop relation" }
            }
        }, 70);

        // Path search vk to vk (should terminate immediately with length 0)
        const pathSelf = await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "contact_graph",
                graphOp: "path",
                userId: TEST_USER,
                projectId: TEST_PROJECT,
                fromId: "vk",
                toId: "vk",
                depth: 3
            }
        }, 71);

        const pSelf1 = JSON.parse(relSelf1.result.content[0].text);
        const pPathSelf = JSON.parse(pathSelf.result.content[0].text);

        if (pSelf1.success && pPathSelf.success && pPathSelf.paths.length > 0 && pPathSelf.paths[0].length === 0) {
            console.log(`✅ Test 7 Passed! Self-relationship created and loop path resolved without infinite traversal.`);
            console.log(`   Found ${pPathSelf.paths.length} total paths for vk -> vk (including loops).`);
            const loops = pPathSelf.paths.filter(p => p.length > 0);
            if (loops.length > 0) {
                console.log(`   Found loop: ${loops[0].map(step => `${step.from} -[${step.type}]-> ${step.to}`).join(" | ")}`);
                pass++;
            } else {
                console.log("❌ Test 7 Failed. Expected to find loop paths of length > 0, but got none.");
                fail++;
            }
        } else {
            console.log("❌ Test 7 Failed. Outputs:", pSelf1, pPathSelf);
            fail++;
        }
    } catch (err) {
        console.log("❌ Test 7 Error:", err.message);
        fail++;
    }

    // Test 9: Multi-path connection traversals & NaN inputs in search
    try {
        console.log("\n--- Test 9: Multi-Path Traversals & NaN Search Parameter Checks ---");

        // 1. Path search between vk and nandini with depth 1
        // Since there are 4 relationships (wife, employe, friend, collaborator)
        // they should all be returned as distinct paths of length 1!
        const resMultiPath = await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "contact_graph",
                graphOp: "path",
                userId: TEST_USER,
                projectId: TEST_PROJECT,
                fromId: "vk",
                toId: "nandini",
                depth: 1
            }
        }, 90);

        // 2. Snippet search with NaN inputs
        const resSearchNaN = await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "snippet_search",
                userId: TEST_USER,
                text: "Line 1\nLine 2\nLine 3\nLine 4",
                query: "Line 2",
                searchType: "semantic",
                minScore: "NaN", // String NaN
                beforeLimit: "NaN",
                afterLimit: "NaN"
            }
        }, 91);

        const pMultiPath = JSON.parse(resMultiPath.result.content[0].text);
        const pSearchNaN = JSON.parse(resSearchNaN.result.content[0].text);

        // Under path-level visited queues, there should be multiple paths found
        if (pMultiPath.success && pMultiPath.paths.length > 1 && pSearchNaN.success && pSearchNaN.snippets.length > 0) {
            console.log(`✅ Test 9 Passed! Multi-path resolved successfully (found ${pMultiPath.paths.length} alternative routes).`);
            console.log(`   NaN parameter inputs sanitized and snippet matched:\n`, pSearchNaN.snippets[0]?.text);
            pass++;
        } else {
            console.log("❌ Test 9 Failed. Outputs:", pMultiPath, pSearchNaN);
            fail++;
        }
    } catch (err) {
        console.log("❌ Test 9 Error:", err.message);
        fail++;
    }

    // Test 8: Deletion cascades & unreachable paths
    try {
        console.log("\n--- Test 8: Deletion Cascades & Unreachable Paths ---");
        
        // Create an isolated contact
        await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "contact",
                contactOp: "create",
                userId: TEST_USER,
                projectId: TEST_PROJECT,
                name: "isolated-contact"
            }
        }, 80);

        // Find path between vk and isolated-contact (should return no paths)
        const resPath = await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "contact_graph",
                graphOp: "path",
                userId: TEST_USER,
                projectId: TEST_PROJECT,
                fromId: "vk",
                toId: "isolated-contact",
                depth: 3
            }
        }, 81);

        // Delete contact vk
        const resDel = await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "contact",
                contactOp: "delete",
                userId: TEST_USER,
                projectId: TEST_PROJECT,
                contactId: vkId
            }
        }, 82);

        // Retrieve relations (should be 0 because vk was deleted and cascade removed all relations)
        const resRel = await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "contact_graph",
                graphOp: "get_relations",
                userId: TEST_USER,
                projectId: TEST_PROJECT,
                fromId: "vk"
            }
        }, 83);

        const pPath = JSON.parse(resPath.result.content[0].text);
        const pDel = JSON.parse(resDel.result.content[0].text);
        const pRel = JSON.parse(resRel.result.content[0].text);

        if (pPath.success && pPath.paths.length === 0 && pDel.success && pRel.success && pRel.relations.length === 0) {
            console.log("✅ Test 8 Passed! Unreachable path handled, contact deleted, and relations cascades verified.");
            pass++;
        } else {
            console.log("❌ Test 8 Failed. Outputs:", pPath, pDel, pRel);
            fail++;
        }
    } catch (err) {
        console.log("❌ Test 8 Error:", err.message);
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
