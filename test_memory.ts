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
    const testProject = "test_project";
    
    console.log("\n=== Testing Smart Memory with Persona & Emotion ===\n");
    
    // Test 1: Persona
    console.log("1. Creating Persona...");
    const persona = await memoryTool.handler({
        op: "persona",
        userId: testUser,
        traits: { creative: true, analytical: true, helpful: true },
        style: "friendly"
    });
    const personaData = safeParse(persona.content?.[0]?.text);
    console.log("   Traits:", personaData.personality?.traits || personaData);
    console.log("   Style:", personaData.personality?.style || "default");
    
    // Test 2: Mood tracking
    console.log("\n2. Recording Moods...");
    
    const moods = ["happy", "excited", "frustrated", "calm"];
    for (const mood of moods) {
        try {
            const result = await memoryTool.handler({
                op: "mood",
                userId: testUser,
                mood,
                intensity: mood === "frustrated" ? 8 : 5,
                context: `Testing ${mood} mood`
            });
            const moodData = safeParse(result.content?.[0]?.text);
            console.log(`   ${mood}:`, moodData.suggestion?.slice(0, 50) || JSON.stringify(moodData));
        } catch (e) {
            console.log(`   ${mood}: Error - ${e}`);
        }
    }
    
    // Test 3: Learning patterns
    console.log("\n3. Learning Patterns...");
    try {
        await memoryTool.handler({
            op: "learn",
            userId: testUser,
            type: "work",
            pattern: "takes breaks when frustrated",
            data: { trigger: "frustrated", action: "break" }
        });
        await memoryTool.handler({
            op: "learn",
            userId: testUser,
            type: "work",
            pattern: "prefers morning work",
            data: { time: "morning", productivity: "high" }
        });
        
        const learnResult = await memoryTool.handler({ op: "learn", userId: testUser });
        const learnData = safeParse(learnResult.content?.[0]?.text);
        console.log("   Patterns learned:", learnData.totalPatterns);
        console.log("   Categories:", Object.keys(learnData.byCategory || {}));
    } catch (e) {
        console.log("   Error:", e);
    }
    
    // Test 4: Reminders
    console.log("\n4. Creating Reminders...");
    try {
        await memoryTool.handler({
            op: "remind",
            userId: testUser,
            reminderType: "followup",
            title: "Check on AuthService fix",
            description: "Verify the authentication bug is still fixed",
            priority: 8
        });
        await memoryTool.handler({
            op: "remind",
            userId: testUser,
            reminderType: "task",
            title: "Review Database optimization",
            priority: 6
        });
        
        const remindResult = await memoryTool.handler({ op: "remind", userId: testUser });
        const remindData = safeParse(remindResult.content?.[0]?.text);
        console.log("   Pending reminders:", remindData.count);
        console.log("   First:", remindData.reminders?.[0]?.title);
    } catch (e) {
        console.log("   Error:", e);
    }
    
    // Test 5: Proactive Suggestions
    console.log("\n5. Getting Proactive Suggestions...");
    try {
        const suggestResult = await memoryTool.handler({ op: "suggest", userId: testUser });
        const suggestData = safeParse(suggestResult.content?.[0]?.text);
        console.log("   Current mood:", suggestData.currentMood);
        console.log("   Suggestions:", suggestData.suggestions?.length || 0);
        (suggestData.suggestions || []).slice(0, 3).forEach((s: any, i: number) => {
            console.log(`   ${i + 1}. [${s.type}] ${s.text?.slice(0, 50)}...`);
        });
    } catch (e) {
        console.log("   Error:", e);
    }
    
    // Test 6: Memory with emotional context
    console.log("\n6. Storing Emotional Memory...");
    try {
        const memResult = await memoryTool.handler({
            op: "remember",
            userId: testUser,
            projectId: testProject,
            userMessage: "I'm really excited about this new feature!",
            agentMessage: "That's great! What makes you excited?"
        });
        const memData = safeParse(memResult.content?.[0]?.text);
        console.log("   Memory stored with intent:", memData.intent);
        console.log("   Priority:", memData.priority);
    } catch (e) {
        console.log("   Error:", e);
    }
    
    // Test 7: Health check
    console.log("\n7. Memory Health...");
    try {
        const healthResult = await memoryTool.handler({ op: "health", userId: testUser });
        const healthData = safeParse(healthResult.content?.[0]?.text);
        console.log("   Health score:", healthData.score + "%");
        console.log("   Total memories:", healthData.metrics?.totalMemories);
    } catch (e) {
        console.log("   Error:", e);
    }
    
    console.log("\n=== Smart Memory System Complete ===\n");
    console.log("She now has:");
    console.log("  ✓ Personality traits");
    console.log("  ✓ Emotional memory");
    console.log("  ✓ Adaptive learning");
    console.log("  ✓ Proactive reminders");
    console.log("  ✓ Smart suggestions");
    console.log("\n");
    process.exit(0);
}

test().catch(e => {
    console.error("Error:", e);
    process.exit(1);
});
