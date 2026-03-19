#!/usr/bin/env node
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { initSqlite, db } from "./src/db/sqlite.js";
import { memoryTool } from "./src/tools/memory_v2.js";
import { entityTool } from "./src/tools/entity_v2.js";
import { shortTermTool } from "./src/tools/short_term_v2.js";

async function test() {
    initSqlite();
    
    const testUser = "test_user_" + Date.now();
    const testProject = "test_project";
    
    console.log("\n=== Testing Memory MCP Tools ===\n");
    
    // Test memory remember
    console.log("1. Testing memory remember...");
    try {
        const rememberResult = memoryTool.handler({
            op: "remember",
            userId: testUser,
            projectId: testProject,
            userMessage: "I need to fix the @AuthService bug in the /src/api endpoint",
            agentMessage: "I'll help you fix the authentication issue."
        });
        console.log("   Result:", JSON.stringify(rememberResult, null, 2));
    } catch (e) {
        console.log("   Error:", e);
    }
    
    // Check DB directly
    const mems = db.prepare("SELECT * FROM LongTermMemory WHERE userId = ?").all(testUser);
    console.log("   DB check - memories:", mems.length);
    
    // Test memory recall
    console.log("\n2. Testing memory recall...");
    try {
        const recallResult = memoryTool.handler({
            op: "recall",
            userId: testUser,
            query: "auth bug"
        });
        console.log("   Result:", JSON.stringify(recallResult, null, 2));
    } catch (e) {
        console.log("   Error:", e);
    }
    
    // Test memory stats
    console.log("\n3. Testing memory stats...");
    try {
        const statsResult = memoryTool.handler({
            op: "stats",
            userId: testUser
        });
        console.log("   Result:", JSON.stringify(statsResult, null, 2));
    } catch (e) {
        console.log("   Error:", e);
    }
    
    // Test entity create
    console.log("\n4. Testing entity create...");
    try {
        const entityResult = entityTool.handler({
            op: "create",
            userId: testUser,
            projectId: testProject,
            entityType: "Person",
            name: "Test User",
            properties: { role: "developer" }
        });
        console.log("   Result:", JSON.stringify(entityResult, null, 2));
    } catch (e) {
        console.log("   Error:", e);
    }
    
    // Test short_term set
    console.log("\n5. Testing short_term set...");
    try {
        const shortTermResult = shortTermTool.handler({
            op: "set",
            userId: testUser,
            key: "test_key",
            value: "test_value"
        });
        console.log("   Result:", JSON.stringify(shortTermResult, null, 2));
    } catch (e) {
        console.log("   Error:", e);
    }
    
    // Test memory all
    console.log("\n6. Testing memory all...");
    try {
        const allResult = memoryTool.handler({
            op: "all",
            userId: testUser
        });
        console.log("   Result:", JSON.stringify(allResult, null, 2));
    } catch (e) {
        console.log("   Error:", e);
    }
    
    console.log("\n=== Tests Complete ===\n");
    process.exit(0);
}

test().catch(console.error);
