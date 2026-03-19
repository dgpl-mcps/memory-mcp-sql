#!/usr/bin/env node
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { initSqlite, db } from "./src/db/sqlite.js";
import { memoryTool } from "./src/tools/memory_v2.js";

async function test() {
    initSqlite();
    
    const testUser = "test_user_" + Date.now();
    const testProject = "test_project";
    
    console.log("\n=== Testing Robust Memory System ===\n");
    
    // Test 1: Store multiple related memories
    console.log("1. Storing memory about AuthService bug...");
    await memoryTool.handler({
        op: "remember",
        userId: testUser,
        projectId: testProject,
        userMessage: "Found a critical bug in @AuthService - authentication is failing",
        agentMessage: "Let me investigate the authentication flow."
    });
    
    console.log("2. Storing memory about database issue...");
    await memoryTool.handler({
        op: "remember",
        userId: testUser,
        projectId: testProject,
        userMessage: "The @Database is also having connection issues",
        agentMessage: "We should check the connection pool settings."
    });
    
    console.log("3. Storing memory about fixing both...");
    const result3 = await memoryTool.handler({
        op: "remember",
        userId: testUser,
        projectId: testProject,
        userMessage: "Fixed both @AuthService and @Database issues",
        agentMessage: "Great! What was the root cause?"
    });
    console.log("   Result:", result3.content?.[0]?.text || result3);
    
    // Check links created
    const links = db.prepare("SELECT * FROM MemoryLinks").all();
    console.log("\n4. Memory Links Created:", links.length);
    links.slice(0, 5).forEach((l: any) => {
        console.log(`   - ${l.memoryId1.slice(0,15)}... → ${l.memoryId2.slice(0,15)}... (${l.relationship}, strength: ${l.strength})`);
    });
    
    // Test 4: Intent detection
    console.log("\n5. Testing intent detection...");
    
    const intentTests = [
        { msg: "How do I fix the bug?", expected: "question" },
        { msg: "Created a new API endpoint", expected: "command" },
        { msg: "The server crashed with error 500", expected: "error" },
        { msg: "Successfully deployed the application", expected: "success" },
        { msg: "I learned that async/await is better than promises", expected: "learning" },
        { msg: "I will fix this tomorrow", expected: "planning" },
    ];
    
    for (const t of intentTests) {
        await memoryTool.handler({
            op: "remember",
            userId: testUser,
            projectId: testProject,
            userMessage: t.msg
        });
    }
    
    // Check stats
    const stats = await memoryTool.handler({ op: "stats", userId: testUser });
    const statsText = stats.content?.[0]?.text;
    console.log("   Stats:", statsText ? JSON.parse(statsText) : stats);
    
    // Test 5: Recall with linked context
    console.log("\n6. Testing recall with linked context...");
    const recall = await memoryTool.handler({
        op: "recall",
        userId: testUser,
        query: "bug"
    });
    const recallData = JSON.parse(recall.content?.[0]?.text);
    console.log("   Found:", recallData?.count, "results");
    if (recallData?.results?.[0]?.linkedContext) {
        console.log("   First result has linked context:", recallData.results[0].linkedContext.length, "links");
    }
    
    // Test 6: Thread operation - get full context chain
    console.log("\n7. Testing thread (full context chain)...");
    const memories = db.prepare("SELECT id FROM LongTermMemory WHERE userId = ? ORDER BY createdAt DESC LIMIT 1").get(testUser) as any;
    if (memories) {
        const thread = await memoryTool.handler({
            op: "thread",
            userId: testUser,
            memoryId: memories.id,
            depth: 2
        });
        const threadData = JSON.parse(thread.content?.[0]?.text);
        console.log("   Thread root:", threadData?.root);
        console.log("   Nodes visited:", threadData?.nodesVisited);
        console.log("   Has children:", threadData?.thread?.[0]?.children?.length > 0);
    }
    
    // Test 7: Query expansion
    console.log("\n8. Testing query expansion...");
    const recallResult = await memoryTool.handler({
        op: "recall",
        userId: testUser,
        query: "bug fix"
    });
    const recall2 = JSON.parse(recallResult.content?.[0]?.text);
    console.log("   Query 'bug fix' found:", recall2?.count, "results");
    
    // Test 8: Memory health
    console.log("\n9. Memory health check...");
    const totalLinks = db.prepare("SELECT COUNT(*) as c FROM MemoryLinks").get() as any;
    const avgStrength = db.prepare("SELECT AVG(strength) as avg FROM MemoryLinks").get() as any;
    const bidirectional = db.prepare("SELECT COUNT(*) as c FROM MemoryLinks WHERE relationship LIKE '%_reverse'").get() as any;
    console.log("   Total links:", totalLinks?.c);
    console.log("   Average strength:", avgStrength?.avg?.toFixed(2));
    console.log("   Bidirectional links:", bidirectional?.c);
    
    console.log("\n=== All Tests Complete ===\n");
    process.exit(0);
}

test().catch(e => {
    console.error("Error:", e);
    process.exit(1);
});
