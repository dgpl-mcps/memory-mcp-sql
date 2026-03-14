import Database from 'better-sqlite3';
import path from 'path';
import { createRequire } from 'module';

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

const dbConfig: DbConfig = {
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

        -- Graph: Entities and Relations (migrated from MongoDB)
        CREATE TABLE IF NOT EXISTS Entities (
            id TEXT PRIMARY KEY,
            userId TEXT NOT NULL,
            projectId TEXT NOT NULL,
            entityType TEXT NOT NULL,
            name TEXT NOT NULL,
            properties TEXT DEFAULT '{}',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_entities_project_type ON Entities(userId, projectId, entityType);
        CREATE INDEX IF NOT EXISTS idx_entities_name ON Entities(userId, projectId, name);

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
        const rowInfo = rowIdStmt.get(stmId) as { rowid: number };

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
    return result ? JSON.parse(result.value) : null;
};

export const searchShortTermMemory = async (userId: string, projectId: string, query: string, limit: number = 5) => {
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
            value: JSON.parse(row.value)
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
        value: JSON.parse(row.value),
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
        value: JSON.parse(row.value)
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
        const rowInfo = rowIdStmt.get(docId) as { rowid: number };

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
export const createTask = (projectId: string, userId: string, title: string, description: string = '', status: string = 'pending', priority: string = 'medium', metadata: any = {}) => {
    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    db.prepare(`INSERT INTO Tasks (id, projectId, userId, title, description, status, priority, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, projectId, userId, title, description, status, priority, ensureJson(metadata));
    return { id, projectId, userId, title, description, status, priority, metadata, createdAt: new Date().toISOString() };
};

export const updateTask = (id: string, updates: { title?: string; description?: string; status?: string; priority?: string; metadata?: any }) => {
    const sets: string[] = ['updatedAt = CURRENT_TIMESTAMP'];
    const vals: any[] = [];
    if (updates.title !== undefined) { sets.push('title = ?'); vals.push(updates.title); }
    if (updates.description !== undefined) { sets.push('description = ?'); vals.push(updates.description); }
    if (updates.status !== undefined) { sets.push('status = ?'); vals.push(updates.status); }
    if (updates.priority !== undefined) { sets.push('priority = ?'); vals.push(updates.priority); }
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
    return { ...row, metadata: parseJson(row.metadata) };
};

export const listTasks = (projectId?: string, userId?: string, status?: string) => {
    let sql = `SELECT * FROM Tasks WHERE 1=1`;
    const params: any[] = [];
    if (projectId) { sql += ` AND projectId = ?`; params.push(projectId); }
    if (userId) { sql += ` AND userId = ?`; params.push(userId); }
    if (status) { sql += ` AND status = ?`; params.push(status); }
    sql += ` ORDER BY createdAt DESC`;
    const rows = db.prepare(sql).all(...params) as any[];
    return rows.map(r => ({ ...r, metadata: parseJson(r.metadata) }));
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

export const searchEmbeddings = async (userId: string, query: string, refTable?: string, limit: number = 10) => {
    const embedding = await getEmbeddingString(query);
    if (!embedding) {
        const pattern = `%${query}%`;
        let sql = `SELECT * FROM Embeddings WHERE userId = ? AND content LIKE ?`;
        const params: any[] = [userId, pattern];
        if (refTable) { sql += ` AND refTable = ?`; params.push(refTable); }
        sql += ` LIMIT ?`;
        params.push(limit);
        return db.prepare(sql).all(...params);
    }

    if (!dbConfig.useVectorSearch) {
        return searchEmbeddings(userId, query, refTable, limit);
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

// Graph Operations (migrated from MongoDB)
export const createEntity = (userId: string, projectId: string, entityType: string, name: string, properties: any = {}) => {
    const id = `entity_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    db.prepare(`INSERT INTO Entities (id, userId, projectId, entityType, name, properties) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(id, userId, projectId, entityType, name, ensureJson(properties));
    return { id, userId, projectId, entityType, name, properties, createdAt: new Date().toISOString() };
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
