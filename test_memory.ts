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
    
    console.log("\n=== Testing Ultra-Robust Memory System ===\n");
    
    // Test 1: Store memories with rich context
    console.log("1. Storing memory about AuthService...");
    const r1 = await memoryTool.handler({
        op: "remember",
        userId: testUser,
        projectId: testProject,
        userMessage: "Found critical bug in @AuthService - JWT validation failing",
        agentMessage: "Check the token expiry settings."
    });
    console.log("   Result:", JSON.parse(r1.content?.[0]?.text || "{}"));
    
    console.log("2. Storing memory about Database...");
    const r2 = await memoryTool.handler({
        op: "remember",
        userId: testUser,
        projectId: testProject,
        userMessage: "@Database connection pool exhausted - need to increase limits",
        agentMessage: "What are the current pool settings?"
    });
    console.log("   Entities:", JSON.parse(r2.content?.[0]?.text || "{}").entities);
    
    console.log("3. Storing memory linking both...");
    const r3 = await memoryTool.handler({
        op: "remember",
        userId: testUser,
        projectId: testProject,
        userMessage: "Fixed @AuthService and @Database issues - both working now",
        agentMessage: "Great teamwork!"
    });
    const r3Data = JSON.parse(r3.content?.[0]?.text || "{}");
    console.log("   Auto-linked:", r3Data.autoLinked, "memories");
    console.log("   Recent patterns:", r3Data.recentPatterns);
    
    // Test 2: Health check
    console.log("\n4. Memory Health Check...");
    const health = await memoryTool.handler({ op: "health", userId: testUser });
    const healthData = JSON.parse(health.content?.[0]?.text);
    console.log("   Health Score:", healthData.score + "% (" + healthData.status + ")");
    console.log("   Total Memories:", healthData.metrics.totalMemories);
    console.log("   Total Links:", healthData.metrics.totalLinks);
    console.log("   Orphaned:", healthData.metrics.orphanedMemories);
    console.log("   Suggestions:", healthData.suggestions.slice(0, 2));
    
    // Test 3: Thread operation
    console.log("\n5. Thread Context Chain...");
    const mem = db.prepare("SELECT id FROM LongTermMemory WHERE userId = ? ORDER BY createdAt DESC LIMIT 1").get(testUser) as any;
    if (mem) {
        const thread = await memoryTool.handler({ op: "thread", userId: testUser, memoryId: mem.id, depth: 2 });
        const threadData = JSON.parse(thread.content?.[0]?.text);
        console.log("   Nodes visited:", threadData.nodesVisited);
        console.log("   Has children:", threadData.thread?.[0]?.children?.length > 0);
    }
    
    // Test 4: Decay operation
    console.log("\n6. Memory Decay...");
    const decay = await memoryTool.handler({ op: "decay", userId: testUser, daysUnused: 1, decayRate: 0.05 });
    const decayData = JSON.parse(decay.content?.[0]?.text);
    console.log("   Action:", decayData.action);
    console.log("   Message:", decayData.message);
    
    // Test 5: Recall with linked context
    console.log("\n7. Recall with Linked Context...");
    const recall = await memoryTool.handler({ op: "recall", userId: testUser, query: "bug fix" });
    const recallData = JSON.parse(recall.content?.[0]?.text);
    console.log("   Found:", recallData.count, "results");
    if (recallData.results?.[0]?.linkedContext?.length > 0) {
        console.log("   First result has linked context:", recallData.results[0].linkedContext.length, "links");
    }
    
    // Test 6: Stats
    console.log("\n8. Memory Stats...");
    const stats = await memoryTool.handler({ op: "stats", userId: testUser });
    const statsData = JSON.parse(stats.content?.[0]?.text);
    console.log("   Total:", statsData.longTerm, "memories");
    console.log("   Avg Priority:", statsData.avgPriority);
    console.log("   Top Intents:", Object.keys(statsData.intentBreakdown || {}).slice(0, 3));
    
    console.log("\n=== Ultra-Robust Memory System Ready ===\n");
    process.exit(0);
}

test().catch(e => {
    console.error("Error:", e);
    process.exit(1);
});
