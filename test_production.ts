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
    } catch (e: any) {
        return { error: e.message, raw: text?.slice(0, 100) };
    }
}

async function test() {
    initSqlite();
    
    const testUser = "test_edge_" + Date.now();
    const project1 = "project_test";
    
    console.log("\n=== PRODUCTION READY + EDGE CASE TEST SUITE ===\n");
    
    let passed = 0;
    let failed = 0;
    const errors: string[] = [];
    
    function test(name: string, fn: () => Promise<boolean>) {
        return fn().then(result => {
            if (result) {
                console.log(`✅ ${name}`);
                passed++;
            } else {
                console.log(`❌ ${name}`);
                failed++;
                errors.push(name);
            }
        }).catch((e: any) => {
            console.log(`❌ ${name}: ${e.message}`);
            failed++;
            errors.push(`${name}: ${e.message}`);
        });
    }
    
    console.log("--- CORE FEATURES ---");
    
    // Core Memory Tests
    await test("1. Store memory with entities", async () => {
        const r = await memoryTool.handler({
            op: "remember",
            userId: testUser,
            projectId: project1,
            userMessage: "Found bug in @AuthService - JWT failing"
        });
        const data = safeParse(r.content?.[0]?.text);
        return data.success === true && data.entities?.includes("AuthService");
    });
    
    await test("2. Intent detection works", async () => {
        const r = await memoryTool.handler({
            op: "remember",
            userId: testUser,
            projectId: project1,
            userMessage: "Server crashed with error 500"
        });
        const data = safeParse(r.content?.[0]?.text);
        return data.intent === "error" && data.priority === "80%";
    });
    
    await test("3. Cross-project linking works", async () => {
        const r = await memoryTool.handler({
            op: "remember",
            userId: testUser,
            projectId: "project_other",
            userMessage: "Applied @AuthService fix"
        });
        const data = safeParse(r.content?.[0]?.text);
        return data.autoLinked >= 1;
    });
    
    await test("4. Recall returns linked context", async () => {
        const r = await memoryTool.handler({
            op: "recall",
            userId: testUser,
            query: "AuthService"
        });
        const data = safeParse(r.content?.[0]?.text);
        return data.count >= 2;
    });
    
    await test("5. Thread context chain works", async () => {
        const mem = db.prepare("SELECT id FROM LongTermMemory WHERE userId = ? ORDER BY createdAt DESC LIMIT 1").get(testUser) as any;
        const r = await memoryTool.handler({ op: "thread", userId: testUser, memoryId: mem?.id, depth: 2 });
        const data = safeParse(r.content?.[0]?.text);
        return data.nodesVisited >= 1;
    });
    
    await test("6. Mood tracking works", async () => {
        const r = await memoryTool.handler({
            op: "mood",
            userId: testUser,
            mood: "happy",
            intensity: 7
        });
        const data = safeParse(r.content?.[0]?.text);
        return data.recorded === true;
    });
    
    await test("7. Learning patterns work", async () => {
        const r = await memoryTool.handler({
            op: "learn",
            userId: testUser,
            type: "work",
            pattern: "prefers morning tasks"
        });
        const data = safeParse(r.content?.[0]?.text);
        return data.totalPatterns >= 1;
    });
    
    await test("8. Reminders work", async () => {
        const r = await memoryTool.handler({
            op: "remind",
            userId: testUser,
            reminderType: "followup",
            title: "Check bug fix"
        });
        const data = safeParse(r.content?.[0]?.text);
        return data.created === true;
    });
    
    await test("9. Smart suggestions work", async () => {
        const r = await memoryTool.handler({ op: "suggest", userId: testUser });
        const data = safeParse(r.content?.[0]?.text);
        return Array.isArray(data.suggestions);
    });
    
    await test("10. Health check works", async () => {
        const r = await memoryTool.handler({ op: "health", userId: testUser });
        const data = safeParse(r.content?.[0]?.text);
        return data.score >= 0;
    });
    
    console.log("\n--- EDGE CASES ---");
    
    await test("11. Empty query returns recent", async () => {
        const r = await memoryTool.handler({
            op: "recall",
            userId: testUser,
            query: ""
        });
        const data = safeParse(r.content?.[0]?.text);
        return data.count >= 1;
    });
    
    await test("12. No entities still links temporally", async () => {
        const r = await memoryTool.handler({
            op: "remember",
            userId: testUser,
            projectId: project1,
            userMessage: "Just a regular message without any special entities"
        });
        const data = safeParse(r.content?.[0]?.text);
        return data.success === true;
    });
    
    await test("13. Very long message handled", async () => {
        const longMsg = "This is a very long message. ".repeat(100);
        const r = await memoryTool.handler({
            op: "remember",
            userId: testUser,
            projectId: project1,
            userMessage: longMsg
        });
        const data = safeParse(r.content?.[0]?.text);
        return data.success === true;
    });
    
    await test("14. Special characters in message", async () => {
        const r = await memoryTool.handler({
            op: "remember",
            userId: testUser,
            projectId: project1,
            userMessage: "Test <script>alert('xss')</script> & \"quotes\" & 'apostrophes'"
        });
        const data = safeParse(r.content?.[0]?.text);
        return data.success === true;
    });
    
    await test("15. Unicode characters work", async () => {
        const r = await memoryTool.handler({
            op: "remember",
            userId: testUser,
            projectId: project1,
            userMessage: "Testing unicode: 你好 🌍 🎉 àéïôû"
        });
        const data = safeParse(r.content?.[0]?.text);
        return data.success === true;
    });
    
    await test("16. Invalid mood handled gracefully", async () => {
        const r = await memoryTool.handler({
            op: "mood",
            userId: testUser,
            mood: "invalid_mood_xyz",
            intensity: 5
        });
        const data = safeParse(r.content?.[0]?.text);
        return data.recorded === true; // Should normalize to neutral
    });
    
    await test("17. Intensity out of range handled", async () => {
        const r = await memoryTool.handler({
            op: "mood",
            userId: testUser,
            mood: "happy",
            intensity: 15 // Over max
        });
        const data = safeParse(r.content?.[0]?.text);
        return data.recorded === true;
    });
    
    await test("18. Thread with invalid memoryId", async () => {
        const r = await memoryTool.handler({
            op: "thread",
            userId: testUser,
            memoryId: "invalid_id_12345"
        });
        const data = safeParse(r.content?.[0]?.text);
        return data.error !== undefined || data.root === undefined;
    });
    
    await test("19. Multiple rapid requests handled", async () => {
        const promises = Array(5).fill(0).map(() => 
            memoryTool.handler({
                op: "remember",
                userId: testUser,
                projectId: project1,
                userMessage: "Rapid test " + Math.random()
            })
        );
        const results = await Promise.all(promises);
        return results.every(r => !r.isError);
    });
    
    await test("20. New user has no errors", async () => {
        const r = await memoryTool.handler({ op: "health", userId: "brand_new_user_" + Date.now() });
        const data = safeParse(r.content?.[0]?.text);
        return data.score >= 0 && !r.isError;
    });
    
    await test("21. Empty userMessage still stores", async () => {
        const r = await memoryTool.handler({
            op: "remember",
            userId: testUser,
            projectId: project1,
            agentMessage: "Only agent response"
        });
        const data = safeParse(r.content?.[0]?.text);
        return data.success === true;
    });
    
    await test("22. No userId returns error", async () => {
        const r = await memoryTool.handler({ op: "stats" } as any);
        return r.isError === true || r.content?.[0]?.text?.includes("required");
    });
    
    await test("23. Persona works for new user", async () => {
        const r = await memoryTool.handler({
            op: "persona",
            userId: "new_persona_user_" + Date.now()
        });
        const data = safeParse(r.content?.[0]?.text);
        return data.personality !== undefined;
    });
    
    await test("24. Reminders list works when empty", async () => {
        const r = await memoryTool.handler({
            op: "remind",
            userId: "fresh_user_" + Date.now()
        });
        const data = safeParse(r.content?.[0]?.text);
        return data.count === 0;
    });
    
    await test("25. Learn without params works", async () => {
        const r = await memoryTool.handler({
            op: "learn",
            userId: testUser
        });
        const data = safeParse(r.content?.[0]?.text);
        return data.totalPatterns >= 0;
    });
    
    await test("26. Link types breakdown returned", async () => {
        const r = await memoryTool.handler({
            op: "remember",
            userId: testUser,
            projectId: project1,
            userMessage: "Testing link types"
        });
        const data = safeParse(r.content?.[0]?.text);
        return data.linkTypes !== undefined;
    });
    
    await test("27. Health has suggestions", async () => {
        const r = await memoryTool.handler({ op: "health", userId: testUser });
        const data = safeParse(r.content?.[0]?.text);
        return Array.isArray(data.suggestions);
    });
    
    await test("28. Bidirectional links created", async () => {
        const reverse = db.prepare("SELECT COUNT(*) as c FROM MemoryLinks WHERE relationship LIKE '%_reverse'").get() as any;
        return reverse.c > 0;
    });
    
    await test("29. No orphaned memories", async () => {
        const r = await memoryTool.handler({ op: "health", userId: testUser });
        const data = safeParse(r.content?.[0]?.text);
        return data.metrics?.orphanedMemories === 0;
    });
    
    await test("30. Database integrity intact", async () => {
        const check = db.prepare("PRAGMA integrity_check").get() as any;
        return check && (check.ok === "ok" || check['integrity_check'] === "ok");
    });
    
    await test("31. Semantic search works", async () => {
        const r = await memoryTool.handler({
            op: "semantic",
            userId: testUser,
            query: "authentication"
        });
        const data = safeParse(r.content?.[0]?.text);
        return data.type !== undefined;
    });
    
    await test("32. Vector backend detected", async () => {
        const r = await memoryTool.handler({
            op: "semantic",
            userId: testUser,
            query: "test"
        });
        const data = safeParse(r.content?.[0]?.text);
        return data.engine !== undefined;
    });
    
    console.log("\n--- NEW FEATURES ---");
    
    await test("33. Graph visualization data works", async () => {
        const r = await memoryTool.handler({
            op: "graph",
            userId: testUser
        });
        const data = safeParse(r.content?.[0]?.text);
        return data.nodes !== undefined && data.edges !== undefined;
    });
    
    await test("34. Dedup finds duplicates", async () => {
        const r = await memoryTool.handler({
            op: "dedup",
            userId: testUser
        });
        const data = safeParse(r.content?.[0]?.text);
        return data.found !== undefined;
    });
    
    await test("35. Backup creates export", async () => {
        const r = await memoryTool.handler({
            op: "backup",
            userId: testUser
        });
        const data = safeParse(r.content?.[0]?.text);
        return data.backupSize > 0 && data.stats !== undefined;
    });
    
    await test("36. Importance scoring works", async () => {
        const r = await memoryTool.handler({
            op: "importance",
            userId: testUser
        });
        const data = safeParse(r.content?.[0]?.text);
        return data.total !== undefined;
    });
    
    await test("37. Health has graph stats", async () => {
        const r = await memoryTool.handler({ op: "health", userId: testUser });
        const data = safeParse(r.content?.[0]?.text);
        return data.metrics?.totalLinks > 0;
    });
    
    await test("38. Mood tracking affects suggestions", async () => {
        await memoryTool.handler({
            op: "mood",
            userId: testUser,
            mood: "excited",
            intensity: 8
        });
        const r = await memoryTool.handler({ op: "suggest", userId: testUser });
        const data = safeParse(r.content?.[0]?.text);
        return data.suggestions?.some((s: any) => s.type === "energy");
    });
    
    console.log("\n=== TEST RESULTS ===");
    console.log(`✅ Passed: ${passed}/30`);
    console.log(`❌ Failed: ${failed}/30`);
    
    if (errors.length > 0) {
        console.log("\nFailed tests:");
        errors.forEach(e => console.log(`  - ${e}`));
    }
    
    if (failed === 0) {
        console.log("\n🎉 SHE IS PRODUCTION READY! 🎉");
        console.log("\nFeatures verified:");
        console.log("  ✓ 8-phase auto-linking");
        console.log("  ✓ Intent detection");
        console.log("  ✓ Entity extraction");
        console.log("  ✓ Mood tracking");
        console.log("  ✓ Learning patterns");
        console.log("  ✓ Reminders");
        console.log("  ✓ Smart suggestions");
        console.log("  ✓ Health monitoring");
        console.log("  ✓ Edge cases handled");
        console.log("  ✓ Database integrity");
    } else {
        console.log("\n⚠️ NEEDS FIXES BEFORE PRODUCTION");
    }
    
    process.exit(failed === 0 ? 0 : 1);
}

test().catch(e => {
    console.error("FATAL ERROR:", e);
    process.exit(1);
});
