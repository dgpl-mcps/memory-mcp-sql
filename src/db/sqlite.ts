import Database from 'better-sqlite3';
import path from 'path';
import { createRequire } from 'module';
import { getMemoryConfig } from '../utils/env.js';

const require = createRequire(import.meta.url);
let sqliteVss: any = null;
let sqliteVec: any = null;

try {
    sqliteVss = require('sqlite-vss');
} catch (e) {
    console.error("sqlite-vss not available, will use fallback");
}
try {
    sqliteVec = require('sqlite-vec');
} catch (e) {
    console.error("sqlite-vec not available, will use fallback");
}

export interface ShortTermMemoryData {
    id: string;
    userId: string;
    projectId: string;
    key: string;
    value: string;
    updatedAt: string;
}

interface DbConfig {
    useVectorSearch: boolean;
    vectorBackend: 'vss' | 'vec' | 'none';
}

export const dbConfig: DbConfig = {
    useVectorSearch: false,
    vectorBackend: 'none'
};

// Database setup
const dbPath = path.resolve(process.cwd(), 'memory_mcp.db');
export const db = new Database(dbPath);

export const initSqlite = () => {
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');

    if (sqliteVss) {
        try {
            db.loadExtension(sqliteVss.getVectorLoadablePath());
            db.loadExtension(sqliteVss.getVssLoadablePath());
            dbConfig.useVectorSearch = true;
            dbConfig.vectorBackend = 'vss';
            console.error('SQLite vector search: using sqlite-vss');
        } catch (e) {
            console.error("Failed to load sqlite-vss:", e);
        }
    } else if (sqliteVec) {
        try {
            db.loadExtension(sqliteVec.getVecLoadablePath());
            dbConfig.useVectorSearch = true;
            dbConfig.vectorBackend = 'vec';
            console.error('SQLite vector search: using sqlite-vec');
        } catch (e) {
            console.error("Failed to load sqlite-vec:", e);
        }
    } else {
        console.error('SQLite vector search: disabled (no extension available)');
    }

    db.exec(`
        -- Core MCP Tables (as per specification)
        
        CREATE TABLE IF NOT EXISTS Projects (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            metadata TEXT DEFAULT '{}',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_projects_user ON Projects(userId);

        CREATE TABLE IF NOT EXISTS Tasks (
            id TEXT PRIMARY KEY,
            projectId TEXT NOT NULL,
            userId TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            status TEXT DEFAULT 'pending',
            priority TEXT DEFAULT 'medium',
            todos TEXT DEFAULT '[]',
            metadata TEXT DEFAULT '{}',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (projectId) REFERENCES Projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_tasks_project ON Tasks(projectId);
        CREATE INDEX IF NOT EXISTS idx_tasks_user ON Tasks(userId);

        CREATE TABLE IF NOT EXISTS Workflows (
            id TEXT PRIMARY KEY,
            projectId TEXT NOT NULL,
            userId TEXT NOT NULL,
            name TEXT NOT NULL,
            steps TEXT DEFAULT '[]',
            status TEXT DEFAULT 'active',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (projectId) REFERENCES Projects(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_workflows_project ON Workflows(projectId);

        CREATE TABLE IF NOT EXISTS Keypoints (
            id TEXT PRIMARY KEY,
            projectId TEXT,
            taskId TEXT,
            userId TEXT NOT NULL,
            content TEXT NOT NULL,
            metadata TEXT DEFAULT '{}',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (projectId) REFERENCES Projects(id) ON DELETE SET NULL,
            FOREIGN KEY (taskId) REFERENCES Tasks(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_keypoints_project ON Keypoints(projectId);
        CREATE INDEX IF NOT EXISTS idx_keypoints_task ON Keypoints(taskId);

        CREATE TABLE IF NOT EXISTS Comments (
            id TEXT PRIMARY KEY,
            projectId TEXT,
            taskId TEXT,
            userId TEXT NOT NULL,
            content TEXT NOT NULL,
            metadata TEXT DEFAULT '{}',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (projectId) REFERENCES Projects(id) ON DELETE SET NULL,
            FOREIGN KEY (taskId) REFERENCES Tasks(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_comments_project ON Comments(projectId);
        CREATE INDEX IF NOT EXISTS idx_comments_task ON Comments(taskId);

        CREATE TABLE IF NOT EXISTS Mistakes (
            id TEXT PRIMARY KEY,
            projectId TEXT,
            taskId TEXT,
            userId TEXT NOT NULL,
            description TEXT NOT NULL,
            resolution TEXT DEFAULT '',
            metadata TEXT DEFAULT '{}',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (projectId) REFERENCES Projects(id) ON DELETE SET NULL,
            FOREIGN KEY (taskId) REFERENCES Tasks(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_mistakes_project ON Mistakes(projectId);

        CREATE TABLE IF NOT EXISTS Learnings (
            id TEXT PRIMARY KEY,
            projectId TEXT,
            taskId TEXT,
            userId TEXT NOT NULL,
            insight TEXT NOT NULL,
            metadata TEXT DEFAULT '{}',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (projectId) REFERENCES Projects(id) ON DELETE SET NULL,
            FOREIGN KEY (taskId) REFERENCES Tasks(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_learnings_project ON Learnings(projectId);

        CREATE TABLE IF NOT EXISTS TaskBoundaries (
            id TEXT PRIMARY KEY,
            taskId TEXT NOT NULL,
            userId TEXT NOT NULL,
            boundary TEXT NOT NULL,
            metadata TEXT DEFAULT '{}',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (taskId) REFERENCES Tasks(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_task_boundaries_task ON TaskBoundaries(taskId);

        CREATE TABLE IF NOT EXISTS Discoveries (
            id TEXT PRIMARY KEY,
            projectId TEXT,
            userId TEXT NOT NULL,
            description TEXT NOT NULL,
            metadata TEXT DEFAULT '{}',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (projectId) REFERENCES Projects(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_discoveries_project ON Discoveries(projectId);

        CREATE TABLE IF NOT EXISTS Notes (
            id TEXT PRIMARY KEY,
            projectId TEXT,
            userId TEXT NOT NULL,
            content TEXT NOT NULL,
            metadata TEXT DEFAULT '{}',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (projectId) REFERENCES Projects(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_notes_project ON Notes(projectId);

        CREATE TABLE IF NOT EXISTS Tools (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            name TEXT NOT NULL UNIQUE,
            description TEXT DEFAULT '',
            metadata TEXT DEFAULT '{}',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_tools_name ON Tools(name);

        CREATE TABLE IF NOT EXISTS ToolSchemas (
            id TEXT PRIMARY KEY,
            toolId TEXT NOT NULL,
            userId TEXT NOT NULL,
            schema TEXT NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (toolId) REFERENCES Tools(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_tool_schemas_tool ON ToolSchemas(toolId);

        CREATE TABLE IF NOT EXISTS Embeddings (
            id TEXT PRIMARY KEY,
            refTable TEXT NOT NULL,
            refId TEXT NOT NULL,
            userId TEXT NOT NULL,
            content TEXT NOT NULL,
            embedding BLOB,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_embeddings_ref ON Embeddings(refTable, refId);
        CREATE INDEX IF NOT EXISTS idx_embeddings_user ON Embeddings(userId);

        -- Short Term Memory (existing)
        CREATE TABLE IF NOT EXISTS ShortTermMemory (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            projectId TEXT NOT NULL,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_short_term_memory_key 
        ON ShortTermMemory (userId, projectId, key);

        -- Document Chunks (existing)
        CREATE TABLE IF NOT EXISTS DocumentChunks (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            projectId TEXT NOT NULL,
            documentId TEXT NOT NULL,
            chunkIndex INTEGER NOT NULL,
            content TEXT NOT NULL,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_document_chunks 
        ON DocumentChunks (userId, projectId, documentId, chunkIndex);

        -- Graph: Entities and Relations
        CREATE TABLE IF NOT EXISTS Entities (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            projectId TEXT NOT NULL,
            entityType TEXT NOT NULL,
            name TEXT NOT NULL,
            properties TEXT DEFAULT '{}',
            -- Extended properties for Person/Bot/Org
            email TEXT,
            phone TEXT,
            role TEXT,
            metadata TEXT DEFAULT '{}',
            -- Perspective ownership
            ownerId TEXT NOT NULL,
            perspectiveOf TEXT DEFAULT 'self',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_entities_project_type ON Entities(userId, projectId, entityType);
        CREATE INDEX IF NOT EXISTS idx_entities_name ON Entities(userId, projectId, name);
        CREATE INDEX IF NOT EXISTS idx_entities_owner ON Entities(ownerId);
        CREATE INDEX IF NOT EXISTS idx_entities_email ON Entities(email);
        CREATE INDEX IF NOT EXISTS idx_entities_perspective ON Entities(perspectiveOf);

        CREATE TABLE IF NOT EXISTS Relations (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            projectId TEXT NOT NULL,
            fromId TEXT NOT NULL,
            toId TEXT NOT NULL,
            relationType TEXT NOT NULL,
            properties TEXT DEFAULT '{}',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (fromId) REFERENCES Entities(id) ON DELETE CASCADE,
            FOREIGN KEY (toId) REFERENCES Entities(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_relations_from ON Relations(userId, projectId, fromId, relationType);
        CREATE INDEX IF NOT EXISTS idx_relations_to ON Relations(userId, projectId, toId, relationType);

        -- Self-Improvement Tables
        CREATE TABLE IF NOT EXISTS SelfReflections (
            id TEXT PRIMARY KEY,
            taskId TEXT,
            userId TEXT NOT NULL,
            projectId TEXT,
            evaluation TEXT NOT NULL,
            mistakes TEXT DEFAULT '[]',
            learnings TEXT DEFAULT '[]',
            rating INTEGER DEFAULT 3,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_reflections_user ON SelfReflections(userId);
        CREATE INDEX IF NOT EXISTS idx_reflections_task ON SelfReflections(taskId);

        CREATE TABLE IF NOT EXISTS ImprovementSuggestions (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            projectId TEXT,
            suggestion TEXT NOT NULL,
            basedOn TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_suggestions_user ON ImprovementSuggestions(userId);
        CREATE INDEX IF NOT EXISTS idx_suggestions_status ON ImprovementSuggestions(status);

        -- Working Buffer for multi-step operations
        CREATE TABLE IF NOT EXISTS WorkingBuffer (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            projectId TEXT,
            operationType TEXT NOT NULL,
            state TEXT NOT NULL,
            stepIndex INTEGER DEFAULT 0,
            totalSteps INTEGER,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_working_buffer_user ON WorkingBuffer(userId);

        -- Short-Term Memory (memories/notes with low threshold 20%)
        CREATE TABLE IF NOT EXISTS ShortTermChat (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            projectId TEXT,
            sessionId TEXT NOT NULL,
            chatIndex INTEGER NOT NULL,
            -- Memory content (note/memory from perspective of writer)
            content TEXT NOT NULL,
            summary TEXT,
            -- Response/follow-up if applicable
            response TEXT,
            responseSummary TEXT,
            combo TEXT,
            isSummarized INTEGER DEFAULT 0,
            -- Priority/importance
            priority REAL DEFAULT 0.5,
            isPinned INTEGER DEFAULT 0,
            -- References to other memory entities
            referencedTasks TEXT DEFAULT '[]',
            referencedKeypoints TEXT DEFAULT '[]',
            referencedEntities TEXT DEFAULT '[]',
            referencedProjects TEXT DEFAULT '[]',
            -- Linked sessions for cross-session context
            linkedSessions TEXT DEFAULT '[]',
            -- Perspective system
            topicId TEXT,
            perspectiveOf TEXT DEFAULT 'self',
            sourcePersonId TEXT,
            isShared INTEGER DEFAULT 0,
            sharedWith TEXT DEFAULT '[]',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            lastAccessedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_short_term_chat_user ON ShortTermChat(userId);
        CREATE INDEX IF NOT EXISTS idx_short_term_chat_session ON ShortTermChat(sessionId);
        CREATE INDEX IF NOT EXISTS idx_short_term_chat_project ON ShortTermChat(projectId);
        CREATE INDEX IF NOT EXISTS idx_short_term_chat_priority ON ShortTermChat(priority DESC);
        CREATE INDEX IF NOT EXISTS idx_short_term_chat_topic ON ShortTermChat(topicId);
        CREATE INDEX IF NOT EXISTS idx_short_term_chat_perspective ON ShortTermChat(perspectiveOf);

        -- Long-Term Memory (75%+ similarity required)
        CREATE TABLE IF NOT EXISTS LongTermMemory (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            projectId TEXT,
            -- Memory content and summary
            content TEXT NOT NULL,
            summary TEXT,
            response TEXT,
            responseSummary TEXT,
            combo TEXT,
            keywords TEXT DEFAULT '[]',
            entities TEXT DEFAULT '[]',
            intent TEXT DEFAULT 'general',
            similarity REAL DEFAULT 0,
            -- Priority/importance with time decay
            priority REAL DEFAULT 0.5,
            accessCount INTEGER DEFAULT 1,
            lastAccessedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            -- TTL/expiration (NULL = never expire)
            expiresAt DATETIME,
            -- References to other memory entities
            referencedTasks TEXT DEFAULT '[]',
            referencedKeypoints TEXT DEFAULT '[]',
            referencedEntities TEXT DEFAULT '[]',
            referencedProjects TEXT DEFAULT '[]',
            -- Linked sessions for cross-session context
            linkedSessions TEXT DEFAULT '[]',
            -- For incremental summarization
            parentSummaryId TEXT,
            isIncremental INTEGER DEFAULT 0,
            -- Tags/categories for organization
            tags TEXT DEFAULT '[]',
            -- Pinned memories
            isPinned INTEGER DEFAULT 0,
            -- Quality and voting
            qualityScore REAL DEFAULT 0.5,
            likes INTEGER DEFAULT 0,
            dislikes INTEGER DEFAULT 0,
            -- Version tracking
            version INTEGER DEFAULT 1,
            previousVersionId TEXT,
            -- Archive status
            isArchived INTEGER DEFAULT 0,
            archivedAt DATETIME,
            -- Perspective system
            topicId TEXT,
            perspectiveOf TEXT DEFAULT 'self',
            sourcePersonId TEXT,
            isShared INTEGER DEFAULT 0,
            sharedWith TEXT DEFAULT '[]'
        );
        CREATE INDEX IF NOT EXISTS idx_long_term_user ON LongTermMemory(userId);
        CREATE INDEX IF NOT EXISTS idx_long_term_project ON LongTermMemory(projectId);
        CREATE INDEX IF NOT EXISTS idx_long_term_similarity ON LongTermMemory(similarity DESC);
        CREATE INDEX IF NOT EXISTS idx_long_term_priority ON LongTermMemory(priority DESC);
        CREATE INDEX IF NOT EXISTS idx_long_term_access ON LongTermMemory(lastAccessedAt DESC);
        CREATE INDEX IF NOT EXISTS idx_long_term_created ON LongTermMemory(createdAt DESC);
        CREATE INDEX IF NOT EXISTS idx_long_term_archived ON LongTermMemory(isArchived);
        CREATE INDEX IF NOT EXISTS idx_long_term_topic ON LongTermMemory(topicId);
        CREATE INDEX IF NOT EXISTS idx_long_term_perspective ON LongTermMemory(perspectiveOf);

        -- Memory Links (for cross-session relationships)
        CREATE TABLE IF NOT EXISTS MemoryLinks (
            id TEXT PRIMARY KEY,
            memoryId1 TEXT NOT NULL,
            memoryId2 TEXT NOT NULL,
            relationship TEXT DEFAULT 'related',
            strength REAL DEFAULT 0.5,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (memoryId1) REFERENCES LongTermMemory(id) ON DELETE CASCADE,
            FOREIGN KEY (memoryId2) REFERENCES LongTermMemory(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_memory_links_1 ON MemoryLinks(memoryId1);
        CREATE INDEX IF NOT EXISTS idx_memory_links_2 ON MemoryLinks(memoryId2);

        -- Session Summary (1 summary per N chats)
        CREATE TABLE IF NOT EXISTS SessionSummary (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            projectId TEXT,
            sessionId TEXT NOT NULL,
            summaryIndex INTEGER NOT NULL,
            summary TEXT NOT NULL,
            responseSummary TEXT NOT NULL,
            combo TEXT,
            chatCount INTEGER NOT NULL,
            referencedTasks TEXT DEFAULT '[]',
            referencedKeypoints TEXT DEFAULT '[]',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_session_summary_user ON SessionSummary(userId);
        CREATE INDEX IF NOT EXISTS idx_session_summary_session ON SessionSummary(sessionId);

        -- User Persona & Preferences
        CREATE TABLE IF NOT EXISTS UserPersona (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL UNIQUE,
            name TEXT,
            traits TEXT DEFAULT '{}',
            communicationStyle TEXT DEFAULT 'friendly',
            preferredTopics TEXT DEFAULT '[]',
            workStyle TEXT DEFAULT 'collaborative',
            quirks TEXT DEFAULT '[]',
            reminders TEXT DEFAULT '[]',
            lastMood TEXT,
            moodHistory TEXT DEFAULT '[]',
            learningData TEXT DEFAULT '{}',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_persona_user ON UserPersona(userId);

        -- Emotional Memory (moods, preferences, feelings)
        CREATE TABLE IF NOT EXISTS EmotionalMemory (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            mood TEXT NOT NULL,
            triggers TEXT DEFAULT '[]',
            context TEXT,
            intensity INTEGER DEFAULT 5,
            relatedMemoryId TEXT,
            sessionId TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_emotional_user ON EmotionalMemory(userId);
        CREATE INDEX IF NOT EXISTS idx_emotional_mood ON EmotionalMemory(mood);

        -- Learning Log (adaptive intelligence)
        CREATE TABLE IF NOT EXISTS LearningLog (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            type TEXT NOT NULL,
            pattern TEXT,
            data TEXT DEFAULT '{}',
            confidence REAL DEFAULT 0.5,
            usageCount INTEGER DEFAULT 1,
            lastUsedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_learning_user ON LearningLog(userId);
        CREATE INDEX IF NOT EXISTS idx_learning_type ON LearningLog(type);

        -- Memory Reminders (proactive)
        CREATE TABLE IF NOT EXISTS MemoryReminders (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            memoryId TEXT,
            reminderType TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            triggerCondition TEXT,
            relatedEntities TEXT DEFAULT '[]',
            priority INTEGER DEFAULT 5,
            status TEXT DEFAULT 'pending',
            snoozedUntil DATETIME,
            completedAt DATETIME,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_reminders_user ON MemoryReminders(userId);
        CREATE INDEX IF NOT EXISTS idx_reminders_status ON MemoryReminders(status);
        CREATE INDEX IF NOT EXISTS idx_reminders_trigger ON MemoryReminders(triggerCondition);

        -- Conversation Memory (for summary compression with raw fallback)
        CREATE TABLE IF NOT EXISTS ConversationMemory (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            projectId TEXT,
            sessionId TEXT,
            role TEXT NOT NULL,
            summary TEXT NOT NULL,
            rawContent TEXT,
            keywords TEXT DEFAULT '[]',
            entities TEXT DEFAULT '[]',
            tokenCount INTEGER DEFAULT 0,
            isCompressed INTEGER DEFAULT 1,
            metadata TEXT DEFAULT '{}',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_conv_memory_user ON ConversationMemory(userId);
        CREATE INDEX IF NOT EXISTS idx_conv_memory_session ON ConversationMemory(sessionId);
        CREATE INDEX IF NOT EXISTS idx_conv_memory_project ON ConversationMemory(projectId);

        -- Raw Interaction Storage (uncompressed fallback)
        CREATE TABLE IF NOT EXISTS RawInteraction (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            projectId TEXT,
            sessionId TEXT,
            request TEXT NOT NULL,
            response TEXT NOT NULL,
            context TEXT DEFAULT '',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_raw_interaction_user ON RawInteraction(userId);
        CREATE INDEX IF NOT EXISTS idx_raw_interaction_session ON RawInteraction(sessionId);

        -- Memory Index (for fast keyword/entity lookup)
        CREATE TABLE IF NOT EXISTS MemoryIndex (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            projectId TEXT,
            sessionId TEXT,
            summary TEXT NOT NULL,
            keywords TEXT DEFAULT '[]',
            entities TEXT DEFAULT '[]',
            compressionRatio REAL DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_memory_index_user ON MemoryIndex(userId);
        CREATE INDEX IF NOT EXISTS idx_memory_index_keywords ON MemoryIndex(keywords);

        -- Topics Table (for topic-based memory organization)
        CREATE TABLE IF NOT EXISTS Topics (
            id TEXT PRIMARY KEY,
            ownerId TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            keywords TEXT DEFAULT '[]',
            color TEXT DEFAULT '#6366f1',
            isActive INTEGER DEFAULT 1,
            parentTopicId TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_topics_owner ON Topics(ownerId);
        CREATE INDEX IF NOT EXISTS idx_topics_name ON Topics(ownerId, name);

        -- Enhanced Sessions Table (persistent, topic, timeline, cross)
        CREATE TABLE IF NOT EXISTS Sessions (
            id TEXT PRIMARY KEY,
            ownerId TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'persistent',
            topicId TEXT,
            title TEXT,
            context TEXT DEFAULT '',
            parentSessionId TEXT,
            startTime DATETIME DEFAULT CURRENT_TIMESTAMP,
            endTime DATETIME,
            lastActivity DATETIME DEFAULT CURRENT_TIMESTAMP,
            isActive INTEGER DEFAULT 1,
            metadata TEXT DEFAULT '{}',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_owner ON Sessions(ownerId);
        CREATE INDEX IF NOT EXISTS idx_sessions_type ON Sessions(ownerId, type);
        CREATE INDEX IF NOT EXISTS idx_sessions_topic ON Sessions(ownerId, topicId);
        CREATE INDEX IF NOT EXISTS idx_sessions_active ON Sessions(ownerId, isActive);

        -- Timeline Entries (1hr/day granularity)
        CREATE TABLE IF NOT EXISTS Timeline (
            id TEXT PRIMARY KEY,
            ownerId TEXT NOT NULL,
            sessionId TEXT,
            topicId TEXT,
            perspectiveOf TEXT DEFAULT 'self',
            sourcePersonId TEXT,
            content TEXT NOT NULL,
            memoryType TEXT NOT NULL DEFAULT 'general',
            timeSlot DATETIME DEFAULT CURRENT_TIMESTAMP,
            durationMinutes INTEGER DEFAULT 60,
            entities TEXT DEFAULT '[]',
            relations TEXT DEFAULT '[]',
            priority REAL DEFAULT 0.5,
            isShared INTEGER DEFAULT 0,
            sharedWith TEXT DEFAULT '[]',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_timeline_owner ON Timeline(ownerId);
        CREATE INDEX IF NOT EXISTS idx_timeline_session ON Timeline(ownerId, sessionId);
        CREATE INDEX IF NOT EXISTS idx_timeline_topic ON Timeline(ownerId, topicId);
        CREATE INDEX IF NOT EXISTS idx_timeline_time ON Timeline(ownerId, timeSlot DESC);
        CREATE INDEX IF NOT EXISTS idx_timeline_perspective ON Timeline(ownerId, perspectiveOf);

        -- Shared Memories (for cross-user sharing)
        CREATE TABLE IF NOT EXISTS SharedMemories (
            id TEXT PRIMARY KEY,
            memoryId TEXT NOT NULL,
            memoryType TEXT NOT NULL,
            fromOwnerId TEXT NOT NULL,
            toOwnerId TEXT NOT NULL,
            perspectiveNote TEXT,
            shareType TEXT DEFAULT 'auto',
            isRead INTEGER DEFAULT 0,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_shared_from ON SharedMemories(fromOwnerId);
        CREATE INDEX IF NOT EXISTS idx_shared_to ON SharedMemories(toOwnerId);
    `);

    if (dbConfig.useVectorSearch) {
        if (dbConfig.vectorBackend === 'vss') {
            db.exec(`
                CREATE VIRTUAL TABLE IF NOT EXISTS vss_stm USING vss0(embedding(384));
                CREATE VIRTUAL TABLE IF NOT EXISTS vss_doc USING vss0(embedding(384));
                CREATE VIRTUAL TABLE IF NOT EXISTS vss_embeddings USING vss0(embedding(384));
            `);
        } else if (dbConfig.vectorBackend === 'vec') {
            db.exec(`
                CREATE VIRTUAL TABLE IF NOT EXISTS vec_stm USING vec0(embedding float[384]);
                CREATE VIRTUAL TABLE IF NOT EXISTS vec_doc USING vec0(embedding float[384]);
                CREATE VIRTUAL TABLE IF NOT EXISTS vec_embeddings USING vec0(embedding float[384]);
            `);
        }
    }

    console.error(`SQLite Initialized with MCP schema (${dbConfig.vectorBackend === 'none' ? 'no' : dbConfig.vectorBackend} vector search, WAL mode)`);
};

const getEmbeddingString = async (text: string): Promise<string | null> => {
    try {
        // Using a simple fetch to a free/local embedding service or mock
        // NOTE: In production, switch to an actual LLM Embedding endpoint. 
        // Here we will use a demo endpoint if provided, or otherwise we fallback to skipping vector storage.
        if (process.env.EMBEDDING_URL) {
            const res = await fetch(process.env.EMBEDDING_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ input: text })
            });
            if (res.ok) {
                const data = await res.json();
                return JSON.stringify(data.embedding);
            }
        }
        return null;
    } catch (e) {
        console.error("Embedding generation failed:", e);
        return null;
    }
}

export const setShortTermMemory = async (userId: string, projectId: string, key: string, value: any) => {
    const stmId = `${userId}-${projectId}-${key}`;
    const valueStr = JSON.stringify(value);

    // 1. Insert/Update base table
    const stmt = db.prepare(`
        INSERT INTO ShortTermMemory (id, userId, projectId, key, value, updatedAt)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(userId, projectId, key) 
        DO UPDATE SET value = excluded.value, updatedAt = CURRENT_TIMESTAMP
    `);
    stmt.run(stmId, userId, projectId, key, valueStr);

    // 2. Insert/Update vector table for searchability
    const embedding = await getEmbeddingString(`${key} ${valueStr}`);
    if (embedding) {
        // Note: We need a numeric rowid for vss0 table
        // Since id is TEXT, we hash the string to integer or lookup rowid. 
        const rowIdStmt = db.prepare(`SELECT rowid FROM ShortTermMemory WHERE id = ?`);
        const rowInfo = rowIdStmt.get(stmId) as { rowid: number } | undefined;
        if (!rowInfo) return;

        const vssStmt = db.prepare(`
              INSERT INTO vss_stm(rowid, embedding) 
              VALUES (?, ?)
         `);
        try {
            vssStmt.run(rowInfo.rowid, embedding);
        } catch (e) {
            // If conflict or update, we might need to delete & re-insert for sqlite-vss
            db.prepare(`DELETE FROM vss_stm WHERE rowid = ?`).run(rowInfo.rowid);
            vssStmt.run(rowInfo.rowid, embedding);
        }
    }
};

export const getShortTermMemory = (userId: string, projectId: string, key: string): any | null => {
    const stmt = db.prepare(`
        SELECT value FROM ShortTermMemory 
        WHERE userId = ? AND projectId = ? AND key = ?
    `);
    const result = stmt.get(userId, projectId, key) as { value: string } | undefined;
    return result ? (() => { try { return JSON.parse(result.value); } catch { return null; } })() : null;
};

export const searchShortTermMemoryVector = async (userId: string, projectId: string, query: string, limit: number = 5) => {
    const embedding = await getEmbeddingString(query);
    if (!embedding) {
        // Fallback to simple matching if embeddings are not configured
        const stmt = db.prepare(`
             SELECT key, value FROM ShortTermMemory 
             WHERE userId = ? AND projectId = ? 
             AND (key LIKE ? OR value LIKE ?)
             LIMIT ?
         `);
        const wildcard = `%${query}%`;
        return stmt.all(userId, projectId, wildcard, wildcard, limit).map((row: any) => ({
            key: row.key,
            value: (() => { try { return JSON.parse(row.value); } catch { return null; } })()
        }));
    }

    // Vector search
    const stmt = db.prepare(`
         SELECT s.key, s.value, v.distance 
         FROM vss_stm v
         JOIN ShortTermMemory s ON v.rowid = s.rowid
         WHERE s.userId = ? AND s.projectId = ?
           AND vss_search(v.embedding, vss_search_params(?, ?))
    `);
    const results = stmt.all(userId, projectId, embedding, limit);
    return results.map((row: any) => ({
        key: row.key,
        value: (() => { try { return JSON.parse(row.value); } catch { return null; } })(),
        distance: row.distance
    }));
};

export const listShortTermMemory = (userId: string, projectId: string) => {
    const stmt = db.prepare(`
        SELECT key, value FROM ShortTermMemory
        WHERE userId = ? AND projectId = ?
    `);
    const results = stmt.all(userId, projectId);
    return results.map((row: any) => ({
        key: row.key,
        value: (() => { try { return JSON.parse(row.value); } catch { return null; } })()
    }));
};

export const deleteShortTermMemory = (userId: string, projectId: string, key: string) => {
    const stmId = `${userId}-${projectId}-${key}`;
    const rowIdStmt = db.prepare(`SELECT rowid FROM ShortTermMemory WHERE id = ?`);
    const rowInfo = rowIdStmt.get(stmId) as { rowid: number } | undefined;

    if (rowInfo) {
        db.prepare(`DELETE FROM vss_stm WHERE rowid = ?`).run(rowInfo.rowid);
    }

    const stmt = db.prepare(`
        DELETE FROM ShortTermMemory 
        WHERE userId = ? AND projectId = ? AND key = ?
    `);
    stmt.run(userId, projectId, key);
};

export const clearSessionMemory = (userId: string, projectId: string) => {
    // Identify all rows to delete in VSS
    const idsStmt = db.prepare(`SELECT rowid FROM ShortTermMemory WHERE userId = ? AND projectId = ?`);
    const rows = idsStmt.all(userId, projectId) as { rowid: number }[];

    const deleteVss = db.prepare(`DELETE FROM vss_stm WHERE rowid = ?`);
    rows.forEach(r => deleteVss.run(r.rowid));

    const stmt = db.prepare(`
        DELETE FROM ShortTermMemory 
        WHERE userId = ? AND projectId = ?
    `);
    stmt.run(userId, projectId);
};

export const storeDocumentChunk = async (userId: string, projectId: string, documentId: string, chunkIndex: number, content: string) => {
    const docId = `${userId}-${projectId}-${documentId}-${chunkIndex}`;

    const stmt = db.prepare(`
        INSERT INTO DocumentChunks (id, userId, projectId, documentId, chunkIndex, content, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(userId, projectId, documentId, chunkIndex) 
        DO UPDATE SET content = excluded.content, updatedAt = CURRENT_TIMESTAMP
    `);
    stmt.run(docId, userId, projectId, documentId, chunkIndex, content);

    const embedding = await getEmbeddingString(content);
    if (embedding) {
        const rowIdStmt = db.prepare(`SELECT rowid FROM DocumentChunks WHERE id = ?`);
        const rowInfo = rowIdStmt.get(docId) as { rowid: number } | undefined;
        if (!rowInfo) return;

        const vssStmt = db.prepare(`INSERT INTO vss_doc(rowid, embedding) VALUES (?, ?)`);
        try {
            vssStmt.run(rowInfo.rowid, embedding);
        } catch (e) {
            db.prepare(`DELETE FROM vss_doc WHERE rowid = ?`).run(rowInfo.rowid);
            vssStmt.run(rowInfo.rowid, embedding);
        }
    }
};

export const searchDocumentChunks = async (userId: string, projectId: string, documentId: string, query: string, limit: number = 3) => {
    const embedding = await getEmbeddingString(query);
    if (!embedding) {
        const stmt = db.prepare(`
             SELECT chunkIndex, content FROM DocumentChunks 
             WHERE userId = ? AND projectId = ? AND documentId = ?
             AND content LIKE ?
             LIMIT ?
         `);
        const wildcard = `%${query}%`;
        return stmt.all(userId, projectId, documentId, wildcard, limit).map((row: any) => ({
            chunkIndex: row.chunkIndex,
            content: row.content
        }));
    }

    const stmt = db.prepare(`
         SELECT d.chunkIndex, d.content, v.distance 
         FROM vss_doc v
         JOIN DocumentChunks d ON v.rowid = d.rowid
         WHERE d.userId = ? AND d.projectId = ? AND d.documentId = ?
           AND vss_search(v.embedding, vss_search_params(?, ?))
    `);
    const results = stmt.all(userId, projectId, documentId, embedding, limit);
    return results.map((row: any) => ({
        chunkIndex: row.chunkIndex,
        content: row.content,
        distance: row.distance
    }));
};

// JSON helper functions
const ensureJson = (val: any): string => {
    if (typeof val === 'string') return val;
    return JSON.stringify(val);
};

const parseJson = (val: string | null): any => {
    if (!val) return {};
    try { return JSON.parse(val); } catch { return {}; }
};

// MCP Core Operations

// Project Operations
export const createProject = (userId: string, name: string, description: string = '', metadata: any = {}) => {
    const id = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    db.prepare(`INSERT INTO Projects (id, userId, name, description, metadata) VALUES (?, ?, ?, ?, ?)`)
        .run(id, userId, name, description, ensureJson(metadata));
    return { id, userId, name, description, metadata, createdAt: new Date().toISOString() };
};

export const updateProject = (id: string, updates: { name?: string; description?: string; metadata?: any }) => {
    const sets: string[] = [];
    const vals: any[] = [];
    if (updates.name !== undefined) { sets.push('name = ?'); vals.push(updates.name); }
    if (updates.description !== undefined) { sets.push('description = ?'); vals.push(updates.description); }
    if (updates.metadata !== undefined) { sets.push('metadata = ?'); vals.push(ensureJson(updates.metadata)); }
    if (sets.length === 0) return null;
    vals.push(id);
    db.prepare(`UPDATE Projects SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    return getProject(id);
};

export const getProject = (id: string) => {
    const row = db.prepare(`SELECT * FROM Projects WHERE id = ?`).get(id) as any;
    if (!row) return null;
    return { ...row, metadata: parseJson(row.metadata) };
};

export const listProjects = (userId: string) => {
    const rows = db.prepare(`SELECT * FROM Projects WHERE userId = ? ORDER BY createdAt DESC`).all(userId) as any[];
    return rows.map(r => ({ ...r, metadata: parseJson(r.metadata) }));
};

// Task Operations
export const createTask = (projectId: string, userId: string, title: string, description: string = '', status: string = 'pending', priority: string = 'medium', todos: any[] = [], metadata: any = {}) => {
    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    db.prepare(`INSERT INTO Tasks (id, projectId, userId, title, description, status, priority, todos, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, projectId, userId, title, description, status, priority, ensureJson(todos), ensureJson(metadata));
    return { id, projectId, userId, title, description, status, priority, todos, metadata, createdAt: new Date().toISOString() };
};

export const updateTask = (id: string, updates: { title?: string; description?: string; status?: string; priority?: string; todos?: any[]; metadata?: any }) => {
    const sets: string[] = ['updatedAt = CURRENT_TIMESTAMP'];
    const vals: any[] = [];
    if (updates.title !== undefined) { sets.push('title = ?'); vals.push(updates.title); }
    if (updates.description !== undefined) { sets.push('description = ?'); vals.push(updates.description); }
    if (updates.status !== undefined) { sets.push('status = ?'); vals.push(updates.status); }
    if (updates.priority !== undefined) { sets.push('priority = ?'); vals.push(updates.priority); }
    if (updates.todos !== undefined) { sets.push('todos = ?'); vals.push(ensureJson(updates.todos)); }
    if (updates.metadata !== undefined) { sets.push('metadata = ?'); vals.push(ensureJson(updates.metadata)); }
    vals.push(id);
    db.prepare(`UPDATE Tasks SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    return getTask(id);
};

export const deleteTask = (id: string) => {
    db.prepare(`DELETE FROM Tasks WHERE id = ?`).run(id);
};

export const getTask = (id: string) => {
    const row = db.prepare(`SELECT * FROM Tasks WHERE id = ?`).get(id) as any;
    if (!row) return null;
    return { ...row, todos: parseJson(row.todos), metadata: parseJson(row.metadata) };
};

export const listTasks = (projectId?: string, userId?: string, status?: string) => {
    let sql = `SELECT * FROM Tasks WHERE 1=1`;
    const params: any[] = [];
    if (projectId) { sql += ` AND projectId = ?`; params.push(projectId); }
    if (userId) { sql += ` AND userId = ?`; params.push(userId); }
    if (status) { sql += ` AND status = ?`; params.push(status); }
    sql += ` ORDER BY createdAt DESC`;
    const rows = db.prepare(sql).all(...params) as any[];
    return rows.map(r => ({ ...r, todos: parseJson(r.todos), metadata: parseJson(r.metadata) }));
};

// Workflow Operations
export const createWorkflow = (projectId: string, userId: string, name: string, steps: any[] = [], status: string = 'active') => {
    const id = `wf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    db.prepare(`INSERT INTO Workflows (id, projectId, userId, name, steps, status) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(id, projectId, userId, name, ensureJson(steps), status);
    return { id, projectId, userId, name, steps, status, createdAt: new Date().toISOString() };
};

export const updateWorkflow = (id: string, updates: { name?: string; steps?: any[]; status?: string }) => {
    const sets: string[] = [];
    const vals: any[] = [];
    if (updates.name !== undefined) { sets.push('name = ?'); vals.push(updates.name); }
    if (updates.steps !== undefined) { sets.push('steps = ?'); vals.push(ensureJson(updates.steps)); }
    if (updates.status !== undefined) { sets.push('status = ?'); vals.push(updates.status); }
    if (sets.length === 0) return null;
    vals.push(id);
    db.prepare(`UPDATE Workflows SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    return getWorkflow(id);
};

export const getWorkflow = (id: string) => {
    const row = db.prepare(`SELECT * FROM Workflows WHERE id = ?`).get(id) as any;
    if (!row) return null;
    return { ...row, steps: parseJson(row.steps) };
};

export const listWorkflows = (projectId?: string, userId?: string) => {
    let sql = `SELECT * FROM Workflows WHERE 1=1`;
    const params: any[] = [];
    if (projectId) { sql += ` AND projectId = ?`; params.push(projectId); }
    if (userId) { sql += ` AND userId = ?`; params.push(userId); }
    sql += ` ORDER BY createdAt DESC`;
    const rows = db.prepare(sql).all(...params) as any[];
    return rows.map(r => ({ ...r, steps: parseJson(r.steps) }));
};

// Knowledge Operations
export const addKeypoint = (projectId: string | null, taskId: string | null, userId: string, content: string, metadata: any = {}) => {
    const id = `kp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    db.prepare(`INSERT INTO Keypoints (id, projectId, taskId, userId, content, metadata) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(id, projectId, taskId, userId, content, ensureJson(metadata));
    return { id, projectId, taskId, userId, content, metadata, createdAt: new Date().toISOString() };
};

export const addComment = (projectId: string | null, taskId: string | null, userId: string, content: string, metadata: any = {}) => {
    const id = `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    db.prepare(`INSERT INTO Comments (id, projectId, taskId, userId, content, metadata) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(id, projectId, taskId, userId, content, ensureJson(metadata));
    return { id, projectId, taskId, userId, content, metadata, createdAt: new Date().toISOString() };
};

export const addNote = (projectId: string | null, userId: string, content: string, metadata: any = {}) => {
    const id = `note_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    db.prepare(`INSERT INTO Notes (id, projectId, userId, content, metadata) VALUES (?, ?, ?, ?, ?)`)
        .run(id, projectId, userId, content, ensureJson(metadata));
    return { id, projectId, userId, content, metadata, createdAt: new Date().toISOString() };
};

export const addDiscovery = (projectId: string | null, userId: string, description: string, metadata: any = {}) => {
    const id = `disc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    db.prepare(`INSERT INTO Discoveries (id, projectId, userId, description, metadata) VALUES (?, ?, ?, ?, ?)`)
        .run(id, projectId, userId, description, ensureJson(metadata));
    return { id, projectId, userId, description, metadata, createdAt: new Date().toISOString() };
};

// Learning and Issue Tracking
export const logMistake = (projectId: string | null, taskId: string | null, userId: string, description: string, resolution: string = '', metadata: any = {}) => {
    const id = `mistake_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    db.prepare(`INSERT INTO Mistakes (id, projectId, taskId, userId, description, resolution, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, projectId, taskId, userId, description, resolution, ensureJson(metadata));
    return { id, projectId, taskId, userId, description, resolution, metadata, createdAt: new Date().toISOString() };
};

export const addLearning = (projectId: string | null, taskId: string | null, userId: string, insight: string, metadata: any = {}) => {
    const id = `learn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    db.prepare(`INSERT INTO Learnings (id, projectId, taskId, userId, insight, metadata) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(id, projectId, taskId, userId, insight, ensureJson(metadata));
    return { id, projectId, taskId, userId, insight, metadata, createdAt: new Date().toISOString() };
};

export const addTaskBoundary = (taskId: string, userId: string, boundary: string, metadata: any = {}) => {
    const id = `bound_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    db.prepare(`INSERT INTO TaskBoundaries (id, taskId, userId, boundary, metadata) VALUES (?, ?, ?, ?, ?)`)
        .run(id, taskId, userId, boundary, ensureJson(metadata));
    return { id, taskId, userId, boundary, metadata, createdAt: new Date().toISOString() };
};

// Tool Registry
export const registerTool = (userId: string, name: string, description: string = '', metadata: any = {}) => {
    const id = `tool_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    db.prepare(`INSERT INTO Tools (id, userId, name, description, metadata) VALUES (?, ?, ?, ?, ?)`)
        .run(id, userId, name, description, ensureJson(metadata));
    return { id, userId, name, description, metadata, createdAt: new Date().toISOString() };
};

export const searchTools = (userId: string, query: string) => {
    const pattern = `%${query}%`;
    const rows = db.prepare(`SELECT * FROM Tools WHERE userId = ? AND (name LIKE ? OR description LIKE ?)`)
        .all(userId, pattern, pattern) as any[];
    return rows.map(r => ({ ...r, metadata: parseJson(r.metadata) }));
};

export const addToolSchema = (toolId: string, userId: string, schema: any) => {
    const id = `schema_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    db.prepare(`INSERT INTO ToolSchemas (id, toolId, userId, schema) VALUES (?, ?, ?, ?)`)
        .run(id, toolId, userId, ensureJson(schema));
    return { id, toolId, userId, schema, createdAt: new Date().toISOString() };
};

export const getToolSchema = (toolId: string) => {
    const rows = db.prepare(`SELECT * FROM ToolSchemas WHERE toolId = ?`).all(toolId) as any[];
    return rows.map(r => ({ ...r, schema: parseJson(r.schema) }));
};

// Semantic Search Operations
export const storeEmbedding = async (refTable: string, refId: string, userId: string, content: string) => {
    const id = `emb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const embedding = await getEmbeddingString(content);
    
    db.prepare(`INSERT INTO Embeddings (id, refTable, refId, userId, content, embedding) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(id, refTable, refId, userId, content, embedding);
    
    if (embedding && dbConfig.useVectorSearch) {
        const rowInfo = db.prepare(`SELECT rowid FROM Embeddings WHERE id = ?`).get(id) as { rowid: number };
        if (rowInfo) {
            const tableName = dbConfig.vectorBackend === 'vss' ? 'vss_embeddings' : 'vec_embeddings';
            const stmt = db.prepare(`INSERT INTO ${tableName}(rowid, embedding) VALUES (?, ?)`);
            try {
                stmt.run(rowInfo.rowid, embedding);
            } catch (e) {
                db.prepare(`DELETE FROM ${tableName} WHERE rowid = ?`).run(rowInfo.rowid);
                stmt.run(rowInfo.rowid, embedding);
            }
        }
    }
    return { id, refTable, refId, userId, content };
};

export const searchEmbeddings = async (userId: string, query: string, refTable?: string, limit: number = 10): Promise<any[]> => {
    const embedding = await getEmbeddingString(query);
    if (!embedding) {
        const pattern = `%${query}%`;
        let sql = `SELECT * FROM Embeddings WHERE userId = ? AND content LIKE ?`;
        const params: any[] = [userId, pattern];
        if (refTable) { sql += ` AND refTable = ?`; params.push(refTable); }
        sql += ` LIMIT ?`;
        params.push(limit);
        return db.prepare(sql).all(...params) as any[];
    }

    if (!dbConfig.useVectorSearch) {
        const pattern = `%${query}%`;
        let sql = `SELECT * FROM Embeddings WHERE userId = ? AND content LIKE ?`;
        const params: any[] = [userId, pattern];
        if (refTable) { sql += ` AND refTable = ?`; params.push(refTable); }
        sql += ` LIMIT ?`;
        params.push(limit);
        return db.prepare(sql).all(...params) as any[];
    }

    const tableName = dbConfig.vectorBackend === 'vss' ? 'vss_embeddings' : 'vec_embeddings';
    let sql = '';
    if (dbConfig.vectorBackend === 'vss') {
        sql = `SELECT e.*, v.distance FROM ${tableName} v JOIN Embeddings e ON v.rowid = e.rowid WHERE e.userId = ? AND vss_search(v.embedding, vss_search_params(?, ?))`;
    } else {
        sql = `SELECT e.*, distance as dist FROM ${tableName} v JOIN Embeddings e ON v.rowid = e.rowid WHERE e.userId = ? ORDER BY v.embedding <=> ? LIMIT ?`;
    }
    
    const params: any[] = [userId, embedding, limit];
    if (refTable) {
        sql = sql.replace('WHERE e.userId', 'WHERE e.userId = ? AND e.refTable = ?');
        params.splice(1, 0, refTable);
    }
    
    const rows = db.prepare(sql).all(...params);
    return rows.map((r: any) => ({ ...r, distance: r.distance || r.dist }));
};

export const findRelatedContent = async (refTable: string, refId: string, limit: number = 5) => {
    const contentRow = db.prepare(`SELECT content FROM Embeddings WHERE refTable = ? AND refId = ?`).get(refTable, refId) as { content: string } | undefined;
    if (!contentRow) return [];
    return searchEmbeddings('', contentRow.content, undefined, limit);
};

// Graph Operations
export const createEntity = (userId: string, projectId: string, entityType: string, name: string, properties: any = {}, ownerId?: string) => {
    const id = `entity_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const owner = ownerId || userId;
    db.prepare(`INSERT INTO Entities (id, userId, projectId, entityType, name, properties, ownerId) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, userId, projectId, entityType, name, ensureJson(properties), owner);
    return { id, userId, projectId, entityType, name, properties, ownerId: owner, createdAt: new Date().toISOString() };
};

export const updateEntity = (id: string, updates: { name?: string; properties?: any }) => {
    const sets: string[] = ['updatedAt = CURRENT_TIMESTAMP'];
    const vals: any[] = [];
    if (updates.name !== undefined) { sets.push('name = ?'); vals.push(updates.name); }
    if (updates.properties !== undefined) { sets.push('properties = ?'); vals.push(ensureJson(updates.properties)); }
    if (sets.length === 0) return null;
    vals.push(id);
    db.prepare(`UPDATE Entities SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    const row = db.prepare(`SELECT * FROM Entities WHERE id = ?`).get(id) as any;
    return row ? { ...row, properties: parseJson(row.properties) } : null;
};

export const getEntity = (id: string) => {
    const row = db.prepare(`SELECT * FROM Entities WHERE id = ?`).get(id) as any;
    if (!row) return null;
    return { ...row, properties: parseJson(row.properties) };
};

export const listEntities = (userId: string, projectId: string, entityType?: string) => {
    let sql = `SELECT * FROM Entities WHERE userId = ? AND projectId = ?`;
    const params: any[] = [userId, projectId];
    if (entityType) { sql += ` AND entityType = ?`; params.push(entityType); }
    sql += ` ORDER BY createdAt DESC`;
    const rows = db.prepare(sql).all(...params) as any[];
    return rows.map(r => ({ ...r, properties: parseJson(r.properties) }));
};

export const deleteEntity = (id: string) => {
    db.prepare(`DELETE FROM Entities WHERE id = ?`).run(id);
};

export const createRelation = (userId: string, projectId: string, fromId: string, toId: string, relationType: string, properties: any = {}) => {
    const id = `rel_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    db.prepare(`INSERT INTO Relations (id, userId, projectId, fromId, toId, relationType, properties) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, userId, projectId, fromId, toId, relationType, ensureJson(properties));
    return { id, userId, projectId, fromId, toId, relationType, properties, createdAt: new Date().toISOString() };
};

export const getRelations = (userId: string, projectId: string, fromId?: string, toId?: string, relationType?: string) => {
    let sql = `SELECT * FROM Relations WHERE userId = ? AND projectId = ?`;
    const params: any[] = [userId, projectId];
    if (fromId) { sql += ` AND fromId = ?`; params.push(fromId); }
    if (toId) { sql += ` AND toId = ?`; params.push(toId); }
    if (relationType) { sql += ` AND relationType = ?`; params.push(relationType); }
    const rows = db.prepare(sql).all(...params) as any[];
    return rows.map(r => ({ ...r, properties: parseJson(r.properties) }));
};

export const deleteRelation = (id: string) => {
    db.prepare(`DELETE FROM Relations WHERE id = ?`).run(id);
};

// Self-Improvement Functions

export const createReflection = (
    userId: string, 
    projectId: string | null, 
    taskId: string | null, 
    evaluation: any, 
    mistakes: any[] = [], 
    learnings: any[] = [],
    rating: number = 3
) => {
    const id = `refl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    db.prepare(`INSERT INTO SelfReflections (id, userId, projectId, taskId, evaluation, mistakes, learnings, rating) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, userId, projectId, taskId, ensureJson(evaluation), ensureJson(mistakes), ensureJson(learnings), rating);
    return { id, userId, projectId, taskId, evaluation, mistakes, learnings, rating, createdAt: new Date().toISOString() };
};

export const getReflectionByTask = (taskId: string) => {
    const row = db.prepare(`SELECT * FROM SelfReflections WHERE taskId = ?`).get(taskId) as any;
    if (!row) return null;
    return {
        ...row,
        evaluation: parseJson(row.evaluation),
        mistakes: parseJson(row.mistakes),
        learnings: parseJson(row.learnings)
    };
};

export const getUserReflections = (userId: string, limit: number = 20) => {
    const rows = db.prepare(`SELECT * FROM SelfReflections WHERE userId = ? ORDER BY createdAt DESC LIMIT ?`)
        .all(userId, limit) as any[];
    return rows.map(r => ({
        ...r,
        evaluation: parseJson(r.evaluation),
        mistakes: parseJson(r.mistakes),
        learnings: parseJson(r.learnings)
    }));
};

export const analyzeMistakePatterns = (userId: string, days: number = 30) => {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const rows = db.prepare(`
        SELECT mistakes FROM SelfReflections 
        WHERE userId = ? AND createdAt > ?
    `).all(userId, since) as any[];
    
    const allMistakes: string[] = [];
    rows.forEach(r => {
        const mistakes = parseJson(r.mistakes);
        if (Array.isArray(mistakes)) {
            allMistakes.push(...mistakes);
        }
    });
    
    // Count frequency of each mistake type
    const frequency: Record<string, number> = {};
    allMistakes.forEach((m: any) => {
        const type = typeof m === 'string' ? m : (m.type || 'unknown');
        frequency[type] = (frequency[type] || 0) + 1;
    });
    
    return Object.entries(frequency)
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => ({ type, count }));
};

export const getAverageRating = (userId: string, days: number = 30) => {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const row = db.prepare(`
        SELECT AVG(rating) as avg FROM SelfReflections 
        WHERE userId = ? AND createdAt > ?
    `).get(userId, since) as any;
    return row?.avg || 0;
};

// Improvement Suggestions

export const createImprovementSuggestion = (
    userId: string,
    projectId: string | null,
    suggestion: string,
    basedOn: string
) => {
    const id = `sugg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    db.prepare(`INSERT INTO ImprovementSuggestions (id, userId, projectId, suggestion, basedOn) VALUES (?, ?, ?, ?, ?)`)
        .run(id, userId, projectId, suggestion, basedOn);
    return { id, userId, projectId, suggestion, basedOn, status: 'pending', createdAt: new Date().toISOString() };
};

export const getUserSuggestions = (userId: string, status?: string) => {
    let sql = `SELECT * FROM ImprovementSuggestions WHERE userId = ?`;
    const params: any[] = [userId];
    if (status) { sql += ` AND status = ?`; params.push(status); }
    sql += ` ORDER BY createdAt DESC`;
    return db.prepare(sql).all(...params) as any[];
};

export const updateSuggestionStatus = (id: string, status: string) => {
    db.prepare(`UPDATE ImprovementSuggestions SET status = ? WHERE id = ?`).run(status, id);
    return db.prepare(`SELECT * FROM ImprovementSuggestions WHERE id = ?`).get(id);
};

// Working Buffer Functions

export const createWorkingBuffer = (
    userId: string,
    projectId: string | null,
    operationType: string,
    totalSteps: number,
    initialState: any = {}
) => {
    const id = `wb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    db.prepare(`INSERT INTO WorkingBuffer (id, userId, projectId, operationType, state, totalSteps) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(id, userId, projectId, operationType, ensureJson(initialState), totalSteps);
    return { id, userId, projectId, operationType, state: initialState, stepIndex: 0, totalSteps, createdAt: new Date().toISOString() };
};

export const getWorkingBuffer = (id: string) => {
    const row = db.prepare(`SELECT * FROM WorkingBuffer WHERE id = ?`).get(id) as any;
    if (!row) return null;
    return { ...row, state: parseJson(row.state) };
};

export const updateWorkingBuffer = (id: string, stepIndex: number, state: any) => {
    db.prepare(`UPDATE WorkingBuffer SET stepIndex = ?, state = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(stepIndex, ensureJson(state), id);
    return getWorkingBuffer(id);
};

export const completeWorkingBuffer = (id: string, finalState: any) => {
    db.prepare(`UPDATE WorkingBuffer SET stepIndex = totalSteps, state = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(ensureJson(finalState), id);
    return getWorkingBuffer(id);
};

export const abortWorkingBuffer = (id: string) => {
    db.prepare(`DELETE FROM WorkingBuffer WHERE id = ?`).run(id);
    return { success: true };
};

export const getUserWorkingBuffers = (userId: string) => {
    const rows = db.prepare(`SELECT * FROM WorkingBuffer WHERE userId = ? ORDER BY updatedAt DESC`).all(userId) as any[];
    return rows.map(r => ({ ...r, state: parseJson(r.state) }));
};

// Conversation Memory Functions (Summary Compression + Raw Fallback)

export const storeConversationMessage = (
    userId: string,
    projectId: string | null,
    sessionId: string | null,
    role: string,
    summary: string,
    rawContent: string,
    keywords: string[] = [],
    entities: string[] = [],
    tokenCount: number = 0,
    metadata: any = {}
) => {
    const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const compressionRatio = rawContent.length > 0 ? (1 - summary.length / rawContent.length) * 100 : 0;
    
    db.prepare(`INSERT INTO ConversationMemory 
        (id, userId, projectId, sessionId, role, summary, rawContent, keywords, entities, tokenCount, isCompressed, metadata) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, userId, projectId, sessionId, role, summary, rawContent, ensureJson(keywords), ensureJson(entities), tokenCount, 1, ensureJson(metadata));
    
    return { id, userId, projectId, sessionId, role, summary, rawContent: rawContent ? "[stored]" : null, compressionRatio, createdAt: new Date().toISOString() };
};

export const storeRawInteraction = (
    userId: string,
    projectId: string | null,
    sessionId: string | null,
    request: string,
    response: string,
    context: string = ""
) => {
    const id = `raw_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    db.prepare(`INSERT INTO RawInteraction (id, userId, projectId, sessionId, request, response, context) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, userId, projectId, sessionId, request, response, context);
    return { id, userId, projectId, sessionId, request: "[stored]", response: "[stored]", createdAt: new Date().toISOString() };
};

export const getConversationMemory = (
    userId: string,
    projectId?: string | null,
    sessionId?: string | null,
    limit: number = 20
) => {
    let sql = `SELECT * FROM ConversationMemory WHERE userId = ?`;
    const params: any[] = [userId];
    
    if (projectId) { sql += ` AND projectId = ?`; params.push(projectId); }
    if (sessionId) { sql += ` AND sessionId = ?`; params.push(sessionId); }
    
    sql += ` ORDER BY createdAt DESC LIMIT ?`;
    params.push(limit);
    
    const rows = db.prepare(sql).all(...params) as any[];
    return rows.map(r => ({
        ...r,
        keywords: parseJson(r.keywords),
        entities: parseJson(r.entities),
        metadata: parseJson(r.metadata)
    }));
};

export const searchConversationMemory = (
    userId: string,
    query: string,
    projectId?: string | null,
    limit: number = 10
) => {
    // First try summary search
    const pattern = `%${query}%`;
    let sql = `SELECT * FROM ConversationMemory WHERE userId = ? AND summary LIKE ?`;
    const params: any[] = [userId, pattern];
    
    if (projectId) { sql += ` AND projectId = ?`; params.push(projectId); }
    sql += ` ORDER BY createdAt DESC LIMIT ?`;
    params.push(limit);
    
    const rows = db.prepare(sql).all(...params) as any[];
    
    if (rows.length > 0) {
        return rows.map(r => ({
            ...r,
            keywords: parseJson(r.keywords),
            entities: parseJson(r.entities),
            source: "summary"
        }));
    }
    
    // Fallback to raw interaction search if summary didn't find enough
    let rawSql = `SELECT * FROM RawInteraction WHERE userId = ? AND (request LIKE ? OR response LIKE ? OR context LIKE ?)`;
    const rawParams: any[] = [userId, pattern, pattern, pattern];
    
    if (projectId) { rawSql += ` AND projectId = ?`; rawParams.push(projectId); }
    rawSql += ` ORDER BY createdAt DESC LIMIT ?`;
    rawParams.push(limit);
    
    const rawRows = db.prepare(rawSql).all(...rawParams) as any[];
    
    return rawRows.map(r => ({
        ...r,
        source: "raw",
        summary: `[Retrieved from raw: ${(r.request || '').slice(0, 100)}...]`
    }));
};

export const getRawInteraction = (
    userId: string,
    sessionId: string,
    limit: number = 10
) => {
    const rows = db.prepare(`SELECT * FROM RawInteraction WHERE userId = ? AND sessionId = ? ORDER BY createdAt DESC LIMIT ?`)
        .all(userId, sessionId, limit) as any[];
    return rows;
};

export const expandFromRaw = (
    userId: string,
    sessionId: string,
    startIndex: number = 0,
    count: number = 5
) => {
    const rows = db.prepare(`SELECT * FROM RawInteraction WHERE userId = ? AND sessionId = ? ORDER BY createdAt ASC LIMIT ? OFFSET ?`)
        .all(userId, sessionId, count, startIndex) as any[];
    return rows;
};

export const updateMemoryIndex = (
    userId: string,
    projectId: string | null,
    sessionId: string | null,
    summary: string,
    keywords: string[],
    entities: string[]
) => {
    const id = `idx_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    db.prepare(`INSERT OR REPLACE INTO MemoryIndex (id, userId, projectId, sessionId, summary, keywords, entities, compressionRatio) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, userId, projectId, sessionId, summary, ensureJson(keywords), ensureJson(entities), 0);
    return { id, userId, projectId, sessionId, summary, keywords, entities };
};

export const getMemoryIndex = (
    userId: string,
    projectId?: string | null,
    sessionId?: string | null
) => {
    let sql = `SELECT * FROM MemoryIndex WHERE userId = ?`;
    const params: any[] = [userId];
    
    if (projectId) { sql += ` AND projectId = ?`; params.push(projectId); }
    if (sessionId) { sql += ` AND sessionId = ?`; params.push(sessionId); }
    
    sql += ` ORDER BY createdAt DESC`;
    
    const rows = db.prepare(sql).all(...params) as any[];
    return rows.map(r => ({
        ...r,
        keywords: parseJson(r.keywords),
        entities: parseJson(r.entities)
    }));
};

export const deleteConversationMemory = (
    userId: string,
    sessionId?: string,
    beforeDate?: string
) => {
    let sql = `DELETE FROM ConversationMemory WHERE userId = ?`;
    const params: any[] = [userId];
    
    if (sessionId) { sql += ` AND sessionId = ?`; params.push(sessionId); }
    if (beforeDate) { sql += ` AND createdAt < ?`; params.push(beforeDate); }
    
    db.prepare(sql).run(...params);
    
    // Also clean raw interactions
    let rawSql = `DELETE FROM RawInteraction WHERE userId = ?`;
    const rawParams: any[] = [userId];
    
    if (sessionId) { rawSql += ` AND sessionId = ?`; rawParams.push(sessionId); }
    if (beforeDate) { rawSql += ` AND createdAt < ?`; rawParams.push(beforeDate); }
    
    db.prepare(rawSql).run(...rawParams);
    
    return { success: true };
};

// ============================================
// NEW SHORT-TERM + LONG-TERM MEMORY SYSTEM
// ============================================

export const addShortTermChat = (
    userId: string,
    projectId: string | null,
    sessionId: string,
    content: string,
    response: string,
    summary?: string,
    responseSummary?: string,
    combo?: string,
    referencedTasks: string[] = [],
    referencedKeypoints: string[] = [],
    referencedEntities: string[] = [],
    referencedProjects: string[] = []
) => {
    const id = `stc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    
    // Get current max chat index for this session
    const maxIdx = db.prepare(`SELECT MAX(chatIndex) as maxIdx FROM ShortTermChat WHERE sessionId = ?`)
        .get(sessionId) as { maxIdx: number | null };
    const chatIndex = (maxIdx?.maxIdx ?? -1) + 1;
    
    db.prepare(`INSERT INTO ShortTermChat 
        (id, userId, projectId, sessionId, chatIndex, content, summary, response, responseSummary, combo, referencedTasks, referencedKeypoints, referencedEntities, referencedProjects) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, userId, projectId, sessionId, chatIndex, content, summary || "", response, responseSummary || "", combo || "", 
             ensureJson(referencedTasks), ensureJson(referencedKeypoints), ensureJson(referencedEntities), ensureJson(referencedProjects));
    
    return { id, sessionId, chatIndex };
};

export const getShortTermChats = (
    userId: string,
    sessionId?: string,
    projectId?: string | null,
    limit?: number
) => {
    let sql = `SELECT * FROM ShortTermChat WHERE userId = ?`;
    const params: any[] = [userId];
    
    if (sessionId) { sql += ` AND sessionId = ?`; params.push(sessionId); }
    if (projectId) { sql += ` AND projectId = ?`; params.push(projectId); }
    
    sql += ` ORDER BY chatIndex DESC`;
    if (limit) { sql += ` LIMIT ?`; params.push(limit); }
    
    return db.prepare(sql).all(...params) as any[];
};

export const getSessionChatCount = (sessionId: string): number => {
    const result = db.prepare(`SELECT COUNT(*) as count FROM ShortTermChat WHERE sessionId = ?`)
        .get(sessionId) as { count: number };
    return result?.count || 0;
};

export const summarizeAndMoveToLongTerm = (
    userId: string,
    projectId: string | null,
    sessionId: string,
    summaryIndex: number,
    summary: string,
    responseSummary: string,
    combo: string,
    chatCount: number,
    referencedTasks: string[] = [],
    referencedKeypoints: string[] = [],
    referencedEntities: string[] = [],
    referencedProjects: string[] = []
) => {
    const id = `ltm_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    
    // Extract keywords from combo
    const keywords = combo.toLowerCase().split(/\s+/).filter(w => w.length > 3).slice(0, 10);
    
    db.prepare(`INSERT INTO LongTermMemory 
        (id, userId, projectId, content, summary, response, responseSummary, combo, keywords, referencedTasks, referencedKeypoints, referencedEntities, referencedProjects) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, userId, projectId, "", summary, "", responseSummary, combo, ensureJson(keywords),
             ensureJson(referencedTasks), ensureJson(referencedKeypoints), ensureJson(referencedEntities), ensureJson(referencedProjects));
    
    // Save session summary
    const summaryId = `ss_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    db.prepare(`INSERT INTO SessionSummary 
        (id, userId, projectId, sessionId, summaryIndex, summary, responseSummary, combo, chatCount, referencedTasks, referencedKeypoints) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(summaryId, userId, projectId, sessionId, summaryIndex, summary, responseSummary, combo, chatCount,
             ensureJson(referencedTasks), ensureJson(referencedKeypoints));
    
    return { id, movedToLongTerm: true };
};

export const searchShortTermMemory = (
    userId: string,
    query: string,
    sessionId?: string,
    projectId?: string | null,
    threshold: number = 20,
    limit: number = 20,
    offset: number = 0
) => {
    const pattern = `%${query}%`;
    let sql = `SELECT * FROM ShortTermChat WHERE userId = ? AND 
        (content LIKE ? OR summary LIKE ? OR response LIKE ? OR responseSummary LIKE ? OR combo LIKE ?)`;
    const params: any[] = [userId, pattern, pattern, pattern, pattern, pattern];
    
    if (sessionId) { sql += ` AND sessionId = ?`; params.push(sessionId); }
    if (projectId) { sql += ` AND projectId = ?`; params.push(projectId); }
    
    sql += ` ORDER BY chatIndex DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    const rows = db.prepare(sql).all(...params) as any[];
    
    // Calculate improved similarity with fuzzy matching
    return rows.map(r => {
        const combined = (r.content || "") + " " + (r.summary || "") + " " + (r.response || "") + " " + (r.responseSummary || "") + " " + (r.combo || "");
        const similarity = calculateFuzzySimilarity(query, combined);
        
        return { ...r, similarity, source: "short_term" };
    }).filter(r => r.similarity >= threshold);
};

function calculateFuzzySimilarity(query: string, text: string): number {
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();
    
    if (textLower.includes(queryLower)) return 100;
    
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    const textWords = textLower.split(/\s+/).filter(w => w.length > 2);
    
    if (queryWords.length === 0 || textWords.length === 0) return 0;
    
    // Jaccard similarity
    const querySet = new Set(queryWords);
    const textSet = new Set(textWords);
    const intersection = [...querySet].filter(w => textSet.has(w) || textLower.includes(w)).length;
    const union = new Set([...querySet, ...textSet]).size;
    
    let similarity = (intersection / union) * 100;
    
    // Bonus for word order
    let consecutiveBonus = 0;
    let lastMatch = -1;
    queryWords.forEach((w, i) => {
        const idx = textWords.indexOf(w);
        if (idx !== -1) {
            if (lastMatch !== -1 && idx === lastMatch + 1) consecutiveBonus += 5;
            lastMatch = idx;
        }
    });
    
    return Math.min(similarity + consecutiveBonus, 100);
}

export const searchLongTermMemory = (
    userId: string,
    query: string,
    projectId?: string | null,
    threshold: number = 75
) => {
    // Use text search for initial filter, then calculate actual similarity
    const pattern = `%${query}%`;
    let sql = `SELECT * FROM LongTermMemory WHERE userId = ? AND 
        (content LIKE ? OR summary LIKE ? OR response LIKE ? OR combo LIKE ?)`;
    const params: any[] = [userId, pattern, pattern, pattern, pattern];
    
    if (projectId) { sql += ` AND projectId = ?`; params.push(projectId); }
    
    sql += ` ORDER BY createdAt DESC LIMIT 50`;
    
    const rows = db.prepare(sql).all(...params) as any[];
    
    return rows.map(r => {
        const combined = (r.content || "") + " " + (r.summary || "") + " " + (r.response || "") + " " + (r.responseSummary || "") + " " + (r.combo || "");
        const similarity = calculateFuzzySimilarity(query, combined);
        
        return { ...r, similarity, source: "long_term" };
    }).filter(r => r.similarity >= threshold);
};

export const getSessionSummaries = (
    userId: string,
    sessionId: string
) => {
    return db.prepare(`SELECT * FROM SessionSummary WHERE userId = ? AND sessionId = ? ORDER BY summaryIndex`)
        .all(userId, sessionId) as any[];
};

export const clearShortTermMemory = (
    userId: string,
    sessionId?: string,
    keepLast: number = 0
) => {
    if (sessionId && keepLast > 0) {
        const ids = db.prepare(`SELECT id FROM ShortTermChat WHERE sessionId = ? ORDER BY chatIndex DESC LIMIT ?`)
            .all(sessionId, keepLast) as any[];
        const keepIds = ids.map(r => r.id);
        
        if (keepIds.length > 0) {
            const placeholders = keepIds.map(() => '?').join(',');
            db.prepare(`DELETE FROM ShortTermChat WHERE userId = ? AND sessionId = ? AND id NOT IN (${placeholders})`)
                .run(userId, sessionId, ...keepIds);
        }
    } else if (sessionId) {
        db.prepare(`DELETE FROM ShortTermChat WHERE sessionId = ?`).run(sessionId);
    } else {
        db.prepare(`DELETE FROM ShortTermChat WHERE userId = ?`).run(userId);
    }
    
    return { success: true };
};

export const updateChatSummary = (
    chatId: string,
    summary: string,
    responseSummary: string,
    combo: string
) => {
    db.prepare(`UPDATE ShortTermChat SET summary = ?, responseSummary = ?, combo = ?, isSummarized = 1 WHERE id = ?`)
        .run(summary, responseSummary, combo, chatId);
    return { success: true };
};

export const getLongTermMemoryStats = (userId: string) => {
    const total = db.prepare(`SELECT COUNT(*) as count FROM LongTermMemory WHERE userId = ?`).get(userId) as { count: number };
    const avgSimilarity = db.prepare(`SELECT AVG(similarity) as avg FROM LongTermMemory WHERE userId = ?`).get(userId) as { avg: number };
    const avgPriority = db.prepare(`SELECT AVG(priority) as avg FROM LongTermMemory WHERE userId = ?`).get(userId) as { avg: number };
    
    return {
        totalMemories: total?.count || 0,
        averageSimilarity: avgSimilarity?.avg || 0,
        averagePriority: avgPriority?.avg || 0.5
    };
};

// Priority and time-decay functions
export const updateMemoryPriority = (memoryId: string, delta: number) => {
    db.prepare(`UPDATE LongTermMemory SET priority = MIN(1.0, MAX(0.1, priority + ?)), accessCount = accessCount + 1, lastAccessedAt = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(delta, memoryId);
    return { success: true };
};

export const calculateTimeDecayPriority = (createdAt: string, decayDays: number = 30): number => {
    const created = new Date(createdAt);
    const now = new Date();
    const daysOld = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
    const decayFactor = Math.max(0.1, 1 - (daysOld / decayDays));
    return Math.round(decayFactor * 100) / 100;
};

export const applyTimeDecay = (userId: string, decayDays: number = 30) => {
    const memories = db.prepare(`SELECT id, createdAt, priority FROM LongTermMemory WHERE userId = ?`).all(userId) as any[];
    memories.forEach(m => {
        const newPriority = calculateTimeDecayPriority(m.createdAt, decayDays);
        db.prepare(`UPDATE LongTermMemory SET priority = ? WHERE id = ?`).run(newPriority, m.id);
    });
    return { processed: memories.length };
};

// Cross-session linking
export const linkMemoryToSession = (memoryId: string, sessionId: string) => {
    const mem = db.prepare(`SELECT linkedSessions FROM LongTermMemory WHERE id = ?`).get(memoryId) as any;
    if (!mem) return { success: false };
    
    const sessions = parseJson(mem.linkedSessions);
    if (!sessions.includes(sessionId)) {
        sessions.push(sessionId);
        db.prepare(`UPDATE LongTermMemory SET linkedSessions = ? WHERE id = ?`).run(ensureJson(sessions), memoryId);
    }
    return { success: true };
};

export const findCrossSessionMemories = (
    userId: string,
    currentSessionId: string,
    query: string,
    threshold: number = 60
) => {
    const pattern = `%${query}%`;
    const memories = db.prepare(`
        SELECT * FROM LongTermMemory 
        WHERE userId = ? 
        AND sessionId != ?
        AND (content LIKE ? OR summary LIKE ? OR combo LIKE ?)
    `).all(userId, currentSessionId, pattern, pattern, pattern) as any[];
    
    // Calculate similarity for each
    return memories.map(r => {
        const combined = (r.content || "") + " " + (r.summary || "") + " " + (r.combo || "");
        const similarity = calculateFuzzySimilarity(query, combined);
        
        // Check if already linked
        const linked = parseJson(r.linkedSessions || "[]");
        const isLinked = linked.includes(currentSessionId);
        
        return { ...r, similarity, isLinked, source: "cross_session" };
    }).filter(r => r.similarity >= threshold);
};

// Auto-cleanup old memories
export const cleanupOldMemories = (userId: string, daysOld: number = 90, keepPinned: boolean = true) => {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
    
    let sql = `DELETE FROM LongTermMemory WHERE userId = ? AND createdAt < ?`;
    const params: any[] = [userId, cutoffDate];
    
    if (keepPinned) {
        sql += ` AND isPinned = 0`;
    }
    
    const result = db.prepare(sql).run(...params);
    
    return { deleted: result.changes };
};

// Memory deduplication
export const findDuplicateMemories = (userId: string, similarityThreshold: number = 90) => {
    const memories = db.prepare(`SELECT id, content, summary, combo FROM LongTermMemory WHERE userId = ?`).all(userId) as any[];
    
    const duplicates: any[] = [];
    const checked = new Set<string>();
    
    for (let i = 0; i < memories.length; i++) {
        if (checked.has(memories[i].id)) continue;
        
        for (let j = i + 1; j < memories.length; j++) {
            if (checked.has(memories[j].id)) continue;
            
            const combined1 = (memories[i].content || "") + " " + (memories[i].summary || "");
            const combined2 = (memories[j].content || "") + " " + (memories[j].summary || "");
            const similarity = calculateFuzzySimilarity(combined1, combined2);
            
            if (similarity >= similarityThreshold) {
                duplicates.push({
                    original: memories[i].id,
                    duplicate: memories[j].id,
                    similarity: Math.round(similarity)
                });
                checked.add(memories[j].id);
            }
        }
    }
    
    return duplicates;
};

export const mergeDuplicateMemories = (originalId: string, duplicateId: string) => {
    const dup = db.prepare(`SELECT * FROM LongTermMemory WHERE id = ?`).get(duplicateId) as any;
    if (!dup) return { success: false };
    
    // Merge: keep original, mark as merged
    const orig = db.prepare(`SELECT linkedSessions FROM LongTermMemory WHERE id = ?`).get(originalId) as any;
    if (orig) {
        const origSessions = parseJson(orig.linkedSessions || "[]");
        const dupSessions = parseJson(dup.linkedSessions || "[]");
        const mergedSessions = [...new Set([...origSessions, ...dupSessions])];
        
        db.prepare(`UPDATE LongTermMemory SET linkedSessions = ?, accessCount = accessCount + ? WHERE id = ?`)
            .run(ensureJson(mergedSessions), dup.accessCount || 1, originalId);
    }
    
    // Mark duplicate as merged (keep for reference)
    db.prepare(`UPDATE LongTermMemory SET content = '[MERGED] ' || content WHERE id = ?`).run(duplicateId);
    
    return { success: true };
};

// Context window optimization
export const getOptimizedContext = (
    userId: string,
    sessionId: string,
    maxTokens: number = 8000,
    overlap: number = 3
) => {
    const config = getMemoryConfig();
    const charsPerToken = 4;
    const maxChars = maxTokens * charsPerToken;
    
    // Get session summaries (high value, compressed)
    const summaries = getSessionSummaries(userId, sessionId);
    
    // Get recent short-term chats
    const recentChats = getShortTermChats(userId, sessionId, undefined, overlap);
    
    // Build context with priority
    let context = "";
    let totalChars = 0;
    
    // Add summaries first (most compressed)
    for (const s of summaries.reverse()) {
        const text = `## Summary ${s.summaryIndex}\n${s.summary}\n${s.responseSummary}\n`;
        if (totalChars + text.length > maxChars) break;
        context = text + context;
        totalChars += text.length;
    }
    
    // Add recent chats
    for (const c of recentChats.reverse()) {
        const text = `Q: ${(c.content || '').slice(0, 200)}\nA: ${(c.response || '').slice(0, 300)}\n`;
        if (totalChars + text.length > maxChars) break;
        context += text;
        totalChars += text.length;
    }
    
    return {
        context: context.slice(-maxChars),
        tokens: Math.ceil(totalChars / charsPerToken),
        summariesUsed: summaries.length,
        chatsUsed: recentChats.length
    };
};

// Incremental summarization
export const createIncrementalSummary = (
    userId: string,
    projectId: string | null,
    sessionId: string,
    parentSummaryId: string | null,
    summary: string,
    responseSummary: string,
    combo: string,
    chatCount: number
) => {
    const id = `inc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    
    db.prepare(`INSERT INTO LongTermMemory 
        (id, userId, projectId, sessionId, content, summary, response, responseSummary, combo, isIncremental, parentSummaryId, priority) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
        .run(id, userId, projectId, sessionId, `Incremental summary #${chatCount}`, summary, responseSummary || "", responseSummary, combo, parentSummaryId || null, 0.6);
    
    // Create session summary too
    const summaryId = `ss_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    db.prepare(`INSERT INTO SessionSummary 
        (id, userId, projectId, sessionId, summaryIndex, summary, responseSummary, combo, chatCount) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(summaryId, userId, projectId, sessionId, chatCount, summary, responseSummary, combo, chatCount);
    
    return { id, type: "incremental" };
};

export const getMemoryById = (memoryId: string) => {
    return db.prepare(`SELECT * FROM LongTermMemory WHERE id = ?`).get(memoryId);
};

export const pinMemory = (memoryId: string, pinned: boolean = true) => {
    db.prepare(`UPDATE LongTermMemory SET isPinned = ? WHERE id = ?`).run(pinned ? 1 : 0, memoryId);
    return { success: true };
};

export const getPinnedMemories = (userId: string) => {
    return db.prepare(`SELECT * FROM LongTermMemory WHERE userId = ? AND isPinned = 1 ORDER BY createdAt DESC`).all(userId);
};

// TTL/Expiration functions
export const setMemoryTTL = (memoryId: string, daysToLive: number) => {
    const expiresAt = new Date(Date.now() + daysToLive * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`UPDATE LongTermMemory SET expiresAt = ? WHERE id = ?`).run(expiresAt, memoryId);
    return { success: true, expiresAt };
};

export const removeMemoryTTL = (memoryId: string) => {
    db.prepare(`UPDATE LongTermMemory SET expiresAt = NULL WHERE id = ?`).run(memoryId);
    return { success: true };
};

export const cleanupExpiredMemories = (userId: string) => {
    const now = new Date().toISOString();
    const result = db.prepare(`DELETE FROM LongTermMemory WHERE userId = ? AND expiresAt IS NOT NULL AND expiresAt < ? AND isPinned = 0`).run(userId, now);
    return { deleted: result.changes };
};

export const getExpiringMemories = (userId: string, daysAhead: number = 7) => {
    const now = new Date();
    const ahead = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000).toISOString();
    return db.prepare(`SELECT id, content, expiresAt FROM LongTermMemory WHERE userId = ? AND expiresAt IS NOT NULL AND expiresAt BETWEEN ? AND ? ORDER BY expiresAt`).all(userId, now.toISOString(), ahead);
};

// Search by date range
export const searchMemoriesByDate = (userId: string, startDate: string, endDate: string, limit: number = 50) => {
    return db.prepare(`SELECT * FROM LongTermMemory WHERE userId = ? AND createdAt BETWEEN ? AND ? ORDER BY createdAt DESC LIMIT ?`)
        .all(userId, startDate, endDate, limit);
};

// Tag functions
export const addMemoryTags = (memoryId: string, tags: string[]) => {
    const current = db.prepare(`SELECT tags FROM LongTermMemory WHERE id = ?`).get(memoryId) as any;
    if (!current) return { success: false };
    const existing = JSON.parse(current.tags || "[]");
    const merged = [...new Set([...existing, ...tags])];
    db.prepare(`UPDATE LongTermMemory SET tags = ? WHERE id = ?`).run(JSON.stringify(merged), memoryId);
    return { success: true, tags: merged };
};

export const removeMemoryTags = (memoryId: string, tags: string[]) => {
    const current = db.prepare(`SELECT tags FROM LongTermMemory WHERE id = ?`).get(memoryId) as any;
    if (!current) return { success: false };
    const existing = JSON.parse(current.tags || "[]");
    const remaining = existing.filter((t: string) => !tags.includes(t));
    db.prepare(`UPDATE LongTermMemory SET tags = ? WHERE id = ?`).run(JSON.stringify(remaining), memoryId);
    return { success: true, tags: remaining };
};

export const searchMemoriesByTag = (userId: string, tag: string, limit: number = 50) => {
    const pattern = `%"${tag}"%`;
    return db.prepare(`SELECT * FROM LongTermMemory WHERE userId = ? AND tags LIKE ? ORDER BY createdAt DESC LIMIT ?`)
        .all(userId, pattern, limit);
};

export const getMemoryTags = (memoryId: string) => {
    const row = db.prepare(`SELECT tags FROM LongTermMemory WHERE id = ?`).get(memoryId) as any;
    return row ? JSON.parse(row.tags || "[]") : [];
};

// Voting functions
export const voteMemory = (memoryId: string, vote: 'like' | 'dislike') => {
    const col = vote === 'like' ? 'likes' : 'dislikes';
    db.prepare(`UPDATE LongTermMemory SET ${col} = ${col} + 1 WHERE id = ?`).run(memoryId);
    const row = db.prepare(`SELECT likes, dislikes FROM LongTermMemory WHERE id = ?`).get(memoryId) as any;
    return row || { likes: 0, dislikes: 0 };
};

export const getMemoryVotes = (memoryId: string) => {
    const row = db.prepare(`SELECT likes, dislikes, qualityScore FROM LongTermMemory WHERE id = ?`).get(memoryId) as any;
    return row || { likes: 0, dislikes: 0, qualityScore: 0.5 };
};

// Version history
export const updateMemoryVersion = (memoryId: string, newContent: string, userId: string) => {
    const current = db.prepare(`SELECT version FROM LongTermMemory WHERE id = ?`).get(memoryId) as any;
    if (!current) return { success: false };
    
    const newVersion = (current.version || 1) + 1;
    db.prepare(`UPDATE LongTermMemory SET previousVersionId = id, version = ? WHERE id = ?`).run(newVersion, memoryId);
    
    // Store previous version in a simple way (as part of metadata)
    const prev = db.prepare(`SELECT content, response FROM LongTermMemory WHERE id = ?`).get(memoryId) as any;
    
    return { success: true, version: newVersion, previousContent: prev };
};

export const getMemoryVersions = (memoryId: string) => {
    // Get current and previous version info
    const row = db.prepare(`SELECT id, version, previousVersionId, content, createdAt FROM LongTermMemory WHERE id = ? OR previousVersionId = ?`).all(memoryId, memoryId) as any[];
    return row;
};

// Bulk operations
export const bulkUpdatePriority = (memoryIds: string[], delta: number) => {
    const placeholders = memoryIds.map(() => '?').join(',');
    db.prepare(`UPDATE LongTermMemory SET priority = MIN(1.0, MAX(0.1, priority + ?)) WHERE id IN (${placeholders})`).run(delta, ...memoryIds);
    return { updated: memoryIds.length };
};

export const bulkAddTags = (memoryIds: string[], tags: string[]) => {
    let updated = 0;
    for (const id of memoryIds) {
        const current = db.prepare(`SELECT tags FROM LongTermMemory WHERE id = ?`).get(id) as any;
        if (current) {
            const existing = JSON.parse(current.tags || "[]");
            const merged = [...new Set([...existing, ...tags])];
            db.prepare(`UPDATE LongTermMemory SET tags = ? WHERE id = ?`).run(JSON.stringify(merged), id);
            updated++;
        }
    }
    return { updated };
};

export const bulkDelete = (memoryIds: string[]) => {
    const placeholders = memoryIds.map(() => '?').join(',');
    const result = db.prepare(`DELETE FROM LongTermMemory WHERE id IN (${placeholders}) AND isPinned = 0`).run(...memoryIds);
    return { deleted: result.changes };
};

export const bulkPin = (memoryIds: string[], pinned: boolean) => {
    const placeholders = memoryIds.map(() => '?').join(',');
    db.prepare(`UPDATE LongTermMemory SET isPinned = ? WHERE id IN (${placeholders})`).run(pinned ? 1 : 0, ...memoryIds);
    return { updated: memoryIds.length };
};

// Quality scoring
export const updateMemoryQuality = (memoryId: string, score: number) => {
    db.prepare(`UPDATE LongTermMemory SET qualityScore = ? WHERE id = ?`).run(Math.max(0, Math.min(1, score)), memoryId);
    return { success: true };
};

export const getHighQualityMemories = (userId: string, minScore: number = 0.7, limit: number = 20) => {
    return db.prepare(`SELECT * FROM LongTermMemory WHERE userId = ? AND qualityScore >= ? ORDER BY qualityScore DESC LIMIT ?`)
        .all(userId, minScore, limit);
};

export const calculateQualityScore = (memory: any): number => {
    let score = 0.5;
    
    // Length bonus (not too short, not too long)
    const queryLen = (memory.content || '').length;
    const respLen = (memory.response || '').length;
    if (queryLen > 20 && queryLen < 500) score += 0.1;
    if (respLen > 50 && respLen < 2000) score += 0.1;
    
    // Completeness bonus
    const hasSummary = memory.summary && memory.summary.length > 10;
    const hasKeywords = memory.keywords && (() => { try { return JSON.parse(memory.keywords).length > 0; } catch { return false; } })();
    const hasEntities = memory.entities && (() => { try { return JSON.parse(memory.entities).length > 0; } catch { return false; } })();
    if (hasSummary) score += 0.1;
    if (hasKeywords) score += 0.1;
    if (hasEntities) score += 0.1;
    
    // Priority bonus
    if (memory.priority > 0.6) score += 0.1;
    
    return Math.min(1, score);
};

// Archive functions
export const archiveMemory = (memoryId: string) => {
    db.prepare(`UPDATE LongTermMemory SET isArchived = 1, archivedAt = CURRENT_TIMESTAMP WHERE id = ?`).run(memoryId);
    return { success: true };
};

export const unarchiveMemory = (memoryId: string) => {
    db.prepare(`UPDATE LongTermMemory SET isArchived = 0, archivedAt = NULL WHERE id = ?`).run(memoryId);
    return { success: true };
};

export const getArchivedMemories = (userId: string, limit: number = 50) => {
    return db.prepare(`SELECT * FROM LongTermMemory WHERE userId = ? AND isArchived = 1 ORDER BY archivedAt DESC LIMIT ?`)
        .all(userId, limit);
};

// Reminder functions
export const createReminder = (userId: string, memoryId: string | null, title: string, description: string, remindAt: string) => {
    const id = `rem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    db.prepare(`INSERT INTO Reminders (id, userId, memoryId, title, description, remindAt) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(id, userId, memoryId, title, description, remindAt);
    return { id, title, remindAt };
};

export const getPendingReminders = (userId: string) => {
    const now = new Date().toISOString();
    return db.prepare(`SELECT * FROM Reminders WHERE userId = ? AND status = 'pending' AND remindAt <= ? ORDER BY remindAt`)
        .all(userId, now);
};

export const completeReminder = (reminderId: string) => {
    db.prepare(`UPDATE Reminders SET status = 'completed' WHERE id = ?`).run(reminderId);
    return { success: true };
};

export const deleteReminder = (reminderId: string) => {
    db.prepare(`DELETE FROM Reminders WHERE id = ?`).run(reminderId);
    return { success: true };
};

export const getUpcomingReminders = (userId: string, daysAhead: number = 7) => {
    const now = new Date().toISOString();
    const ahead = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();
    return db.prepare(`SELECT * FROM Reminders WHERE userId = ? AND status = 'pending' AND remindAt BETWEEN ? AND ? ORDER BY remindAt`)
        .all(userId, now, ahead);
};

// Merge function for combining memories
export const mergeMemories = (targetId: string, sourceId: string) => {
    const source = db.prepare(`SELECT * FROM LongTermMemory WHERE id = ?`).get(sourceId) as any;
    const target = db.prepare(`SELECT * FROM LongTermMemory WHERE id = ?`).get(targetId) as any;
    
    if (!source || !target) return { success: false, error: "Memory not found" };
    
    // Merge: combine keywords, entities, add links
    const targetKeywords = (() => { try { return JSON.parse(target.keywords || "[]"); } catch { return []; } })();
    const sourceKeywords = (() => { try { return JSON.parse(source.keywords || "[]"); } catch { return []; } })();
    const mergedKeywords = [...new Set([...targetKeywords, ...sourceKeywords])];
    
    const targetEntities = (() => { try { return JSON.parse(target.entities || "[]"); } catch { return []; } })();
    const sourceEntities = (() => { try { return JSON.parse(source.entities || "[]"); } catch { return []; } })();
    const mergedEntities = [...new Set([...targetEntities, ...sourceEntities])];
    
    const targetSessions = (() => { try { return JSON.parse(target.linkedSessions || "[]"); } catch { return []; } })();
    const sourceSessions = (() => { try { return JSON.parse(source.linkedSessions || "[]"); } catch { return []; } })();
    const mergedSessions = [...new Set([...targetSessions, ...sourceSessions])];
    
    // Update target
    db.prepare(`UPDATE LongTermMemory SET 
        keywords = ?, entities = ?, linkedSessions = ?,
        qualityScore = MIN(1.0, qualityScore + 0.1), accessCount = accessCount + 1
        WHERE id = ?`)
        .run(JSON.stringify(mergedKeywords), JSON.stringify(mergedEntities), JSON.stringify(mergedSessions), targetId);
    
    // Mark source as merged
    db.prepare(`UPDATE LongTermMemory SET content = '[MERGED] ' || content WHERE id = ?`).run(sourceId);
    
    return { success: true, mergedKeywords: mergedKeywords.length, mergedEntities: mergedEntities.length };
};
