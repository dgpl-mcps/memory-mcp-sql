#!/usr/bin/env node

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const baseDir = path.join(__dirname, "..");

interface ChatRow {
    id: string;
    userId: string;
    projectId: string | null;
    sessionId: string;
    chatIndex: number;
    userQuery: string;
    userSummary: string | null;
    agentResponse: string;
    agentSummary: string | null;
    combo: string | null;
    isSummarized: number;
    priority: number;
    isPinned: number;
    referencedTasks: string;
    referencedKeypoints: string;
    referencedEntities: string;
    referencedProjects: string;
    linkedSessions: string;
    createdAt: string;
    lastAccessedAt: string;
}

interface EntityRow {
    id: string;
    userId: string;
    projectId: string | null;
    entityType: string;
    name: string;
    properties: string;
}

async function migrate() {
    console.error("🚀 Starting Memory Migration...");

    const oldDbPath = path.join(baseDir, "memory_mcp_final_old.db");
    const newDbPath = path.join(baseDir, "memory_mcp.db");

    const oldDb = new Database(oldDbPath, { readonly: true });
    const newDb = new Database(newDbPath);

    console.error("📦 Reading old memories...");

    const chats = oldDb.prepare(`
        SELECT id, userId, projectId, sessionId, chatIndex, 
               userQuery, userSummary, agentResponse, agentSummary, combo,
               isSummarized, priority, isPinned,
               referencedTasks, referencedKeypoints, referencedEntities, referencedProjects,
               linkedSessions, createdAt, lastAccessedAt
        FROM ShortTermChat
        ORDER BY createdAt
    `).all() as ChatRow[];

    console.error(`📝 Found ${chats.length} memories to migrate`);

    let migrated = 0;

    const insert = newDb.prepare(`
        INSERT INTO ShortTermChat (
            id, userId, projectId, sessionId, chatIndex,
            content, summary, response, responseSummary, combo,
            isSummarized, priority, isPinned,
            referencedTasks, referencedKeypoints, referencedEntities, referencedProjects,
            linkedSessions, createdAt, lastAccessedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = newDb.transaction((rows: ChatRow[]) => {
        for (const row of rows) {
            try {
                insert.run(
                    row.id,
                    row.userId,
                    row.projectId || null,
                    row.sessionId,
                    row.chatIndex,
                    row.userQuery,
                    row.userSummary || null,
                    row.agentResponse,
                    row.agentSummary || null,
                    row.combo || null,
                    row.isSummarized,
                    row.priority,
                    row.isPinned,
                    row.referencedTasks,
                    row.referencedKeypoints,
                    row.referencedEntities,
                    row.referencedProjects,
                    row.linkedSessions,
                    row.createdAt,
                    row.lastAccessedAt
                );
                migrated++;
            } catch (err: any) {
                console.error(`❌ Error migrating ${row.id}: ${err.message}`);
            }
        }
    });

    insertMany(chats);

    console.error(`\n✅ Migrated ${migrated}/${chats.length} memories`);

    // Create sessions from unique sessionIds
    console.error("\n📁 Creating sessions...");
    const sessionIds = [...new Set(chats.map(c => c.sessionId))];
    const insertSession = newDb.prepare(`
        INSERT OR IGNORE INTO Sessions (id, ownerId, type, title, isActive)
        VALUES (?, ?, 'topic', ?, 1)
    `);

    sessionIds.forEach(sessionId => {
        try {
            insertSession.run(`sess_${sessionId}`, chats[0]?.userId || "nandini", sessionId);
        } catch (err) {
            // Ignore
        }
    });
    console.error(`✅ Created ${sessionIds.length} sessions`);

    // Add timeline entries for each memory
    console.error("\n⏰ Adding timeline entries...");
    const insertTimeline = newDb.prepare(`
        INSERT OR IGNORE INTO Timeline (id, ownerId, sessionId, content, memoryType, priority)
        VALUES (?, ?, ?, ?, 'memory', ?)
    `);

    let timelineAdded = 0;
    chats.forEach((chat: ChatRow) => {
        try {
            const content = chat.userQuery?.slice(0, 300) || "";
            if (content) {
                insertTimeline.run(`tl_${chat.id}`, chat.userId, `sess_${chat.sessionId}`, content, chat.priority || 0.5);
                timelineAdded++;
            }
        } catch (err) {
            // Ignore
        }
    });
    console.error(`✅ Added ${timelineAdded} timeline entries`);

    // Migrate entities
    console.error("\n🏷️ Migrating entities...");
    const entities = oldDb.prepare(`SELECT * FROM Entities`).all() as EntityRow[];
    const insertEntity = newDb.prepare(`
        INSERT OR IGNORE INTO Entities (id, userId, projectId, entityType, name, properties, ownerId)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    entities.forEach((e: EntityRow) => {
        try {
            insertEntity.run(e.id, e.userId, e.projectId || null, e.entityType, e.name, e.properties, e.userId);
        } catch (err) {
            // Ignore
        }
    });
    console.error(`✅ Migrated ${entities.length} entities`);

    oldDb.close();
    newDb.close();

    console.error("\n🎉 Migration Complete!");
    console.error(`   - Memories: ${migrated}`);
    console.error(`   - Sessions: ${sessionIds.length}`);
    console.error(`   - Timeline: ${timelineAdded}`);
    console.error(`   - Entities: ${entities.length}`);
}

migrate().catch(err => {
    console.error("Migration failed:", err);
    process.exit(1);
});
