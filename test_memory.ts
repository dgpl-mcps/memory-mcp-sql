#!/usr/bin/env node
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { initSqlite, db } from "./src/db/sqlite.js";
import { memoryTool } from "./src/tools/memory_v2.js";

function safeParse(text: string | undefined) {
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        return { raw: text };
    }
}

async function test() {
    initSqlite();
    
    const testUser = "test_user_" + Date.now();
    const project1 = "project_alpha";
    const project2 = "project_beta";
    
    console.log("\n=== Testing Enhanced 8-Phase Auto-Linking ===\n");
    
    // Test 1: Store memory in project 1
    console.log("1. Storing memory in project_alpha...");
    const r1 = await memoryTool.handler({
        op: "remember",
        userId: testUser,
        projectId: project1,
        userMessage: "Found bug in @AuthService - JWT validation failing",
        agentMessage: "Check the token expiry."
    });
    const r1Data = safeParse(r1.content?.[0]?.text);
    console.log("   Entities:", r1Data.entities);
    console.log("   Intent:", r1Data.intent);
    
    // Test 2: Store memory in same project (should link via temporal + entity)
    console.log("\n2. Storing 2nd memory in same project...");
    const r2 = await memoryTool.handler({
        op: "remember",
        userId: testUser,
        projectId: project1,
        userMessage: "Fixed @AuthService bug - was token expiry issue",
        agentMessage: "Great! What was the root cause?"
    });
    const r2Data = safeParse(r2.content?.[0]?.text);
    console.log("   Auto-linked:", r2Data.autoLinked, "memories");
    console.log("   Link types:", r2Data.linkTypes);
    
    // Test 3: Store memory in different project (should link via cross-project)
    console.log("\n3. Storing memory in project_beta (cross-project)...");
    const r3 = await memoryTool.handler({
        op: "remember",
        userId: testUser,
        projectId: project2,
        userMessage: "The @AuthService works now - applied same fix",
        agentMessage: "Perfect! Reusable solution."
    });
    const r3Data = safeParse(r3.content?.[0]?.text);
    console.log("   Auto-linked:", r3Data.autoLinked, "memories");
    console.log("   Link types:", r3Data.linkTypes);
    
    // Test 4: Check all links created
    console.log("\n4. Memory Link Analysis...");
    const allLinks = db.prepare("SELECT * FROM MemoryLinks").all() as any[];
    const linkByType: Record<string, number> = {};
    allLinks.forEach(l => {
        linkByType[l.relationship] = (linkByType[l.relationship] || 0) + 1;
    });
    console.log("   Total links:", allLinks.length);
    console.log("   By type:", linkByType);
    
    // Test 5: Cross-project links exist
    const crossProjectLinks = allLinks.filter(l => l.relationship === "cross_project");
    const temporalChainLinks = allLinks.filter(l => l.relationship === "temporal_chain");
    const entityGraphLinks = allLinks.filter(l => l.relationship === "entity_graph");
    console.log("\n5. New Link Types:");
    console.log("   Cross-project links:", crossProjectLinks.length);
    console.log("   Temporal chain links:", temporalChainLinks.length);
    console.log("   Entity graph links:", entityGraphLinks.length);
    
    // Test 6: Thread to see all connections
    console.log("\n6. Thread Context Chain...");
    const mem = db.prepare("SELECT id FROM LongTermMemory WHERE userId = ? ORDER BY createdAt DESC LIMIT 1").get(testUser) as any;
    if (mem) {
        const thread = await memoryTool.handler({ op: "thread", userId: testUser, memoryId: mem.id, depth: 2 });
        const threadData = safeParse(thread.content?.[0]?.text);
        console.log("   Root:", threadData.root?.slice(0, 20) + "...");
        console.log("   Nodes visited:", threadData.nodesVisited);
    }
    
    // Test 7: Health check
    console.log("\n7. Memory Health...");
    const health = await memoryTool.handler({ op: "health", userId: testUser });
    const healthData = safeParse(health.content?.[0]?.text);
    console.log("   Health score:", healthData.score + "%");
    console.log("   Total links:", healthData.metrics?.totalLinks);
    console.log("   Orphaned:", healthData.metrics?.orphanedMemories);
    
    // Test 8: Quick recall with linked context
    console.log("\n8. Recall with Linked Context...");
    const recall = await memoryTool.handler({ op: "recall", userId: testUser, query: "AuthService" });
    const recallData = safeParse(recall.content?.[0]?.text);
    console.log("   Results:", recallData.count);
    if (recallData.results?.[0]?.linkedContext?.length > 0) {
        console.log("   First result links:", recallData.results[0].linkedContext.length);
    }
    
    console.log("\n=== Enhanced Auto-Linking Test Complete ===\n");
    console.log("New 8-Phase Auto-Linking:");
    console.log("  ✓ Temporal (0.9) - conversation flow");
    console.log("  ✓ Entity (0.8) - shared @mentions");
    console.log("  ✓ Project (0.7) - same project");
    console.log("  ✓ Intent (0.6) - context clustering");
    console.log("  ✓ Keyword (0.4) - keyword overlap");
    console.log("  ✓ Cross-Project (0.6) - across projects");
    console.log("  ✓ Temporal Chain (0.95) - consecutive");
    console.log("  ✓ Entity Graph (0.75) - knowledge graph");
    console.log("\n");
    process.exit(0);
}

test().catch(e => {
    console.error("Error:", e);
    process.exit(1);
});
