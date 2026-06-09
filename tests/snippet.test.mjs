#!/usr/bin/env node
/**
 * End-to-end integration test for memory MCP snippet_search operation.
 * Spawns the MCP server, talks JSON-RPC, and verifies exact and semantic snippet search.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_PATH = path.resolve(__dirname, "../build/index.js");

const TEST_USER = "snippet-user-" + Date.now();
const TEST_PROJECT = "snippet-project";

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
    console.log("=== End-to-end Snippet Search Test ===\n");

    const server = spawn("node", [SERVER_PATH], {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
            ...process.env,
            MEMORY_DB_PATH: "/tmp/snippet_memory.db",
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
        clientInfo: { name: "snippet-test", version: "1.0" },
    }, 1);

    const essay = `Line 1: Once upon a time in a digital kingdom.
Line 2: A developer encountered a vector search bug.
Line 3: The database would not store embeddings properly.
Line 4: Only standard integer rowids were allowed on vec0 tables.
Line 5: She debugged the code and converted rowids to BigInt.
Line 6: After this fix, everything compiled and ran smoothly.
Line 7: The integration test passed with zero failures.
Line 8: She documented her findings in the project logs.
Line 9: And they all lived happily ever after.`;

    let pass = 0, fail = 0;

    // Test 1: Exact search with default limits
    try {
        console.log("--- Test 1: Exact search (default limits) ---");
        const res = await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "snippet_search",
                userId: TEST_USER,
                text: essay,
                query: "BigInt",
                searchType: "exact"
            }
        }, 10);
        
        const parsed = JSON.parse(res.result.content[0].text);
        const textResult = parsed.snippets[0]?.text || "";
        
        if (parsed.success && textResult.includes("She debugged the code") && textResult.includes("* 5: Line 5: She debugged the code and converted rowids to BigInt.")) {
            console.log("✅ Test 1 Passed! Match and context lines retrieved.");
            // Default limit should show 2 lines before (lines 3, 4) and 2 lines after (lines 6, 7)
            if (textResult.includes("Line 3:") && textResult.includes("Line 7:") && !textResult.includes("Line 2:") && !textResult.includes("Line 8:")) {
                console.log("✅ Test 1 context limits verified.");
                pass++;
            } else {
                console.log("❌ Test 1 context limits failed. Output:\n", textResult);
                fail++;
            }
        } else {
            console.log("❌ Test 1 Failed. Output:\n", res.result.content[0].text);
            fail++;
        }
    } catch (err) {
        console.log("❌ Test 1 Error:", err.message);
        fail++;
    }

    // Test 2: Semantic search with custom limits & custom minScore
    try {
        console.log("\n--- Test 2: Semantic search (custom limits and minScore) ---");
        const res = await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "snippet_search",
                userId: TEST_USER,
                text: essay,
                query: "vector database",
                searchType: "semantic",
                minScore: 0.3, // Loose threshold to match lines related to vector search
                beforeLimit: 1,
                afterLimit: 2
            }
        }, 20);

        const parsed = JSON.parse(res.result.content[0].text);
        const textResult = parsed.snippets[0]?.text || "";

        if (parsed.success && parsed.snippets.length > 0) {
            console.log(`✅ Test 2 Passed! Found ${parsed.snippets.length} matching semantic snippets.`);
            // Verify context boundaries (1 line before, 2 lines after for matches)
            const first = parsed.snippets[0];
            const firstMatch = first.matchingLines[0];
            const lastMatch = first.matchingLines[first.matchingLines.length - 1];
            const startLineNum = first.startLine;
            const endLineNum = first.endLine;
            
            if (firstMatch - startLineNum <= 1 && endLineNum - lastMatch <= 2) {
                console.log(`✅ Test 2 context boundaries verified: Matches from line ${firstMatch} to ${lastMatch}, snippet lines ${startLineNum} to ${endLineNum}.`);
                pass++;
            } else {
                console.log("❌ Test 2 context limits out of bound:", first);
                fail++;
            }
        } else {
            console.log("❌ Test 2 Failed. Output:\n", res.result.content[0].text);
            fail++;
        }
    } catch (err) {
        console.log("❌ Test 2 Error:", err.message);
        fail++;
    }

    // Test 3: Overlapping matches merging
    try {
        console.log("\n--- Test 3: Overlapping range merging ---");
        const res = await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "snippet_search",
                userId: TEST_USER,
                text: essay,
                query: "Line", // Will match every line!
                searchType: "exact",
                beforeLimit: 2,
                afterLimit: 2
            }
        }, 30);

        const parsed = JSON.parse(res.result.content[0].text);
        if (parsed.success && parsed.snippets.length === 1) {
            console.log("✅ Test 3 Passed! All overlapping matches merged into a single snippet spanning the entire essay.");
            pass++;
        } else {
            console.log(`❌ Test 3 Failed. Expected 1 merged snippet, got ${parsed.snippets.length}.`);
            fail++;
        }
    } catch (err) {
        console.log("❌ Test 3 Error:", err.message);
        fail++;
    }

    // Test 4: Database fallback search
    try {
        console.log("\n--- Test 4: Database fallback search ---");
        
        // First insert a memory
        await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "remember",
                userId: TEST_USER,
                sessionId: TEST_PROJECT,
                userMessage: "Here is a story about a dragon named Pyroth.\nPyroth breathed bright blue fire.\nHe lived in a dark cave near the snowy peaks.\nMany knights came to challenge the blue fire dragon.",
                agentMessage: "Noted the story about Pyroth the blue fire dragon."
            }
        }, 40);

        // Search the DB without passing 'text'
        const res = await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "snippet_search",
                userId: TEST_USER,
                query: "blue fire dragon",
                searchType: "semantic",
                minScore: 0.3,
                beforeLimit: 1,
                afterLimit: 1
            }
        }, 50);

        const parsed = JSON.parse(res.result.content[0].text);
        
        if (parsed.success && parsed.results && parsed.results.length > 0) {
            const firstResult = parsed.results[0];
            const snippetText = firstResult.snippets[0]?.text || "";
            if (snippetText.includes("breathed bright blue fire")) {
                console.log("✅ Test 4 Passed! Snippet extracted from database-stored memory content.");
                pass++;
            } else {
                console.log("❌ Test 4 Failed. Snippet text did not match expected database content:", snippetText);
                fail++;
            }
        } else {
            console.log("❌ Test 4 Failed. No results from DB. Output:\n", res.result.content[0].text);
            fail++;
        }
    } catch (err) {
        console.log("❌ Test 4 Error:", err.message);
        fail++;
    }

    // Test 5: Literal wildcard search escaping in Database fallback
    try {
        console.log("\n--- Test 5: Database exact search wildcard escaping ---");
        
        // Insert memories
        await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "remember",
                userId: TEST_USER,
                sessionId: TEST_PROJECT,
                userMessage: "Database progress is at 99% completed.",
                agentMessage: "Noted database progress 99%."
            }
        }, 60);

        await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "remember",
                userId: TEST_USER,
                sessionId: TEST_PROJECT,
                userMessage: "Database progress is at 995 completed.",
                agentMessage: "Noted database progress 995."
            }
        }, 61);

        // Search for exact "99%"
        const res = await callMcp(server, "tools/call", {
            name: "memory",
            arguments: {
                op: "snippet_search",
                userId: TEST_USER,
                query: "99%",
                searchType: "exact"
            }
        }, 62);

        const parsed = JSON.parse(res.result.content[0].text);
        
        if (parsed.success && parsed.results && parsed.results.length > 0) {
            const matches = parsed.results;
            // It should match the 99% memory but NOT 995 memory (since % is treated literally, not as wildcard)
            const matchedContents = matches.map(r => r.snippets[0]?.text || "");
            const hasLiteralMatch = matchedContents.some(txt => txt.includes("99%"));
            const hasWildcardMatch = matchedContents.some(txt => txt.includes("995"));

            if (hasLiteralMatch && !hasWildcardMatch) {
                console.log("✅ Test 5 Passed! Literal wildcards (%) in exact search escaped successfully in DB queries.");
                pass++;
            } else {
                console.log("❌ Test 5 Failed. Mixed or incorrect literal matching results:", matchedContents);
                fail++;
            }
        } else {
            console.log("❌ Test 5 Failed. No results matched. Output:\n", res.result.content[0].text);
            fail++;
        }
    } catch (err) {
        console.log("❌ Test 5 Error:", err.message);
        fail++;
    }

    console.log(`\n=== Snippet Search Results: ${pass} pass, ${fail} fail ===`);
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
