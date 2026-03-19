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
    
    console.log("\n=== Testing Enhanced Memory System ===\n");
    
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
    console.log("   Result:", JSON.stringify(JSON.parse(result3.content[0].text), null, 2));
    
    // Check links created
    const links = db.prepare("SELECT * FROM MemoryLinks").all();
    console.log("\n4. Memory Links Created:", links.length);
    links.forEach((l: any) => {
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
    console.log("   Stats:", JSON.parse(stats.content[0].text));
    
    // Test 5: Entity extraction
    console.log("\n6. Testing entity extraction...");
    await memoryTool.handler({
        op: "remember",
        userId: testUser,
        projectId: testProject,
        userMessage: "Mentioned @JohnDoe and @JaneSmith in #meeting about /src/api/handlers.ts - see https://example.com"
    });
    
    const lastMem = db.prepare("SELECT entities FROM LongTermMemory WHERE userId = ? ORDER BY createdAt DESC LIMIT 1").get(testUser) as any;
    console.log("   Extracted entities:", lastMem?.entities);
    
    // Test 6: Query expansion
    console.log("\n7. Testing query expansion...");
    const recallResult = await memoryTool.handler({
        op: "recall",
        userId: testUser,
        query: "bug fix"
    });
    const recall = JSON.parse(recallResult.content[0].text);
    console.log("   Query 'bug fix' found:", recall.count, "results");
    
    // Test 7: Auto-linking strength
    console.log("\n8. Testing auto-link strength scores...");
    const strongLinks = links.filter((l: any) => l.strength >= 0.7);
    const mediumLinks = links.filter((l: any) => l.strength >= 0.4 && l.strength < 0.7);
    const weakLinks = links.filter((l: any) => l.strength < 0.4);
    console.log("   Strong (entity match):", strongLinks.length);
    console.log("   Medium (intent cluster):", mediumLinks.length);
    console.log("   Weak (keyword match):", weakLinks.length);
    
    console.log("\n=== All Tests Complete ===\n");
    process.exit(0);
}

test().catch(e => {
    console.error("Error:", e);
    process.exit(1);
});
