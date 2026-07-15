# PostgreSQL Migration Research & Technical Blueprint

This document outlines the architecture, database schema mapping, query conversions, and implementation phases for migrating the **Memory MCP Server** from a local **SQLite** database to **PostgreSQL**.

---

## 1. Executive Summary

The current Memory MCP server relies on a local SQLite database (`better-sqlite3`) and vector extensions (`sqlite-vss` / `sqlite-vec`). While this configuration requires zero setup and works well for single-user offline workflows, it has strict constraints:
- **Local Access Only:** SQLite databases are locked to the host filesystem and cannot easily scale or serve multiple processes concurrently.
- **Limited Multi-User Scaling:** Multi-user support requires synchronous serializations, which can cause transaction contentions under concurrent write operations.
- **Binary Extension Dependencies:** Installing `sqlite-vss`/`sqlite-vec` requires local C++ toolchains, which makes cross-platform containerization and cloud hosting brittle.

Migrating to **PostgreSQL** resolves these limitations. By leveraging **`pgvector`**, native **`JSONB`** columns, and **arrays**, we can build a distributed, high-performance, and multi-user memory system.

---

## 2. SQLite vs. PostgreSQL Features Map

| Capability | SQLite (`better-sqlite3`) | PostgreSQL (`pg` + `pgvector`) |
| :--- | :--- | :--- |
| **Connection Protocol** | Synchronous local file bindings | Asynchronous client-server TCP/IP pool |
| **Vector Embedding Type** | `BLOB` / Virtual tables (`vss0`/`vec0`) | Native `vector` data type (via `pgvector`) |
| **Vector Index Type** | Custom virtual table indexes | HNSW (Hierarchical Navigable Small World) / IVFFlat |
| **Multi-Value Support** | JSON strings (stored as `TEXT`) | Native Arrays (`TEXT[]`) or native `JSONB` structures |
| **Full-Text Lexical Search** | `FTS5` extension | Native `tsvector` and `tsquery` |
| **Transaction Concurrency** | Single-writer locks (WAL mode helps, but limited) | Multi-Version Concurrency Control (MVCC) |

---

## 3. PostgreSQL Database Schema Definition

Below is the PostgreSQL schema mapping for the memory server tables, replacing SQLite schemas.

```sql
-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector; -- pgvector support

-- 1. Projects Table
CREATE TABLE IF NOT EXISTS Projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON Projects(user_id);

-- 2. Tasks Table
CREATE TABLE IF NOT EXISTS Tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES Projects(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    priority TEXT DEFAULT 'medium',
    todos JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON Tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON Tasks(user_id);

-- 3. Entities Table (Knowledge Graph Nodes)
CREATE TABLE IF NOT EXISTS Entities (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    name TEXT NOT NULL,
    properties JSONB DEFAULT '{}'::jsonb,
    email TEXT,
    phone TEXT,
    role TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    owner_id TEXT NOT NULL,
    perspective_of TEXT DEFAULT 'self',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_entities_project_type ON Entities(user_id, project_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_name ON Entities(user_id, project_id, name);
CREATE INDEX IF NOT EXISTS idx_entities_owner ON Entities(owner_id);
CREATE INDEX IF NOT EXISTS idx_entities_email ON Entities(email);

-- 4. Relations Table (Knowledge Graph Edges)
CREATE TABLE IF NOT EXISTS Relations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    from_id TEXT NOT NULL REFERENCES Entities(id) ON DELETE CASCADE,
    to_id TEXT NOT NULL REFERENCES Entities(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL,
    properties JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_relations_from ON Relations(user_id, project_id, from_id, relation_type);
CREATE INDEX IF NOT EXISTS idx_relations_to ON Relations(user_id, project_id, to_id, relation_type);

-- 5. Long-Term Memory Table
CREATE TABLE IF NOT EXISTS LongTermMemory (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    project_id TEXT REFERENCES Projects(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    summary TEXT,
    response TEXT,
    response_summary TEXT,
    combo TEXT,
    keywords TEXT[] DEFAULT '{}'::text[], -- PostgreSQL Text Array
    entities TEXT[] DEFAULT '{}'::text[], -- PostgreSQL Text Array
    intent TEXT DEFAULT 'general',
    similarity REAL DEFAULT 0,
    priority REAL DEFAULT 0.5,
    access_count INT DEFAULT 1,
    last_accessed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ,
    referenced_tasks TEXT[] DEFAULT '{}'::text[],
    referenced_keypoints TEXT[] DEFAULT '{}'::text[],
    referenced_entities TEXT[] DEFAULT '{}'::text[],
    referenced_projects TEXT[] DEFAULT '{}'::text[],
    linked_sessions TEXT[] DEFAULT '{}'::text[],
    parent_summary_id TEXT,
    is_incremental BOOLEAN DEFAULT FALSE,
    tags TEXT[] DEFAULT '{}'::text[],
    is_pinned BOOLEAN DEFAULT FALSE,
    quality_score REAL DEFAULT 0.5,
    likes INT DEFAULT 0,
    dislikes INT DEFAULT 0,
    version INT DEFAULT 1,
    previous_version_id TEXT,
    is_archived BOOLEAN DEFAULT FALSE,
    archived_at TIMESTAMPTZ,
    topic_id TEXT,
    perspective_of TEXT DEFAULT 'self',
    source_person_id TEXT,
    is_shared BOOLEAN DEFAULT FALSE,
    shared_with TEXT[] DEFAULT '{}'::text[]
);
CREATE INDEX IF NOT EXISTS idx_long_term_user ON LongTermMemory(user_id);
CREATE INDEX IF NOT EXISTS idx_long_term_project ON LongTermMemory(project_id);
CREATE INDEX IF NOT EXISTS idx_long_term_topic ON LongTermMemory(topic_id);

-- 6. Embeddings Table (Vector storage)
CREATE TABLE IF NOT EXISTS Embeddings (
    id TEXT PRIMARY KEY,
    ref_table TEXT NOT NULL,
    ref_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding vector(384), -- pgvector data type
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_embeddings_ref ON Embeddings(ref_table, ref_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_user ON Embeddings(user_id);

-- Fast Approximate Nearest Neighbor vector search indexing (HNSW)
CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw_cosine 
ON Embeddings USING hnsw (embedding vector_cosine_ops);
```

---

## 4. Code & Query Conversion (SQLite vs. PostgreSQL)

### A. SQLite (`better-sqlite3`) vs. PostgreSQL Query Syntax
SQLite drivers in the project use `?` placeholders and operate **synchronously**. PostgreSQL uses `$` numbered placeholders (`$1`, `$2`) and operates **asynchronously**.

#### SQLite Insertion:
```typescript
// Synchronous SQLite execution
const stmt = db.prepare('INSERT INTO Projects (id, userId, name, description) VALUES (?, ?, ?, ?)');
stmt.run(id, userId, name, description);
```

#### PostgreSQL Insertion:
```typescript
// Asynchronous PostgreSQL execution
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

await pool.query(
    'INSERT INTO Projects (id, user_id, name, description) VALUES ($1, $2, $3, $4)',
    [id, userId, name, description]
);
```

---

### B. Vector Similarity Search Query

SQLite relies on extensions like `sqlite-vec` or `sqlite-vss` to do similarity matching. PostgreSQL utilizes the `<=>` operator which computes **cosine distance** (so similarity is calculated as `1 - (embedding <=> query_vector)`).

#### SQLite query using `sqlite-vec`:
```typescript
const rows = db.prepare(`
    SELECT refId, score 
    FROM vec_stm 
    WHERE embedding MATCH ? AND k = ?
`).all(queryVectorJson, limit);
```

#### PostgreSQL query using `pgvector`:
```typescript
const res = await pool.query(`
    SELECT ref_id, (1 - (embedding <=> $1)) AS similarity_score
    FROM Embeddings
    WHERE user_id = $2 AND ref_table = $3
    ORDER BY embedding <=> $1
    LIMIT $4;
`, [JSON.stringify(queryVector), userId, refTable, limit]);

const rows = res.rows.map(r => ({
    refId: r.ref_id,
    score: parseFloat(r.similarity_score)
}));
```

---

### C. Multi-Value Array Handling

In SQLite, arrays are converted to JSON text strings before write, and parsed back to arrays in JS. In PostgreSQL, arrays can be passed and retrieved natively.

#### SQLite Array Read/Write:
```typescript
// Write
const keywordsJson = JSON.stringify(['auth', 'bug']);
db.prepare('INSERT INTO LongTermMemory (id, keywords) VALUES (?, ?)').run(id, keywordsJson);

// Read
const row = db.prepare('SELECT keywords FROM LongTermMemory WHERE id = ?').get(id);
const keywords = JSON.parse(row.keywords); // ['auth', 'bug']
```

#### PostgreSQL Native Array Read/Write:
```typescript
// Write
await pool.query(
    'INSERT INTO LongTermMemory (id, keywords) VALUES ($1, $2)',
    [id, ['auth', 'bug']] // Passed directly as JS array
);

// Read
const res = await pool.query('SELECT keywords FROM LongTermMemory WHERE id = $1', [id]);
const keywords = res.rows[0].keywords; // Already a JS array ['auth', 'bug']
```

---

## 5. Migration Execution Strategy

To convert the codebase systematically without breaking core features, the migration can be split into three phases:

```mermaid
graph LR
    P1[Phase 1: DB Adapter & Schemas] --> P2[Phase 2: Code Async Refactoring]
    P2 --> P3[Phase 3: Integration & Testing]
```

### Phase 1: Database Adapter Rewrite
1. Setup PostgreSQL pool class in `src/db/postgres.ts` using connection environment variables (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` or `DATABASE_URL`).
2. Implement schema generation queries using `pgvector` and standard data types.
3. Configure `pgvector` array formatting in Node PG.

### Phase 2: Refactoring Code to Async
1. Re-declare all helper functions in the database module to return Promises (e.g. `export const createProject = async (...)`).
2. Refactor all handlers in `src/tools/` (e.g., `memory_v2.ts`, `entity_v2.ts`) to prefix database requests with `await`.
3. Update loops to use `Promise.all` for parallel operations where applicable.

### Phase 3: Validation and Verification
1. Setup a PostgreSQL testing instance (using Docker or a cloud instance like Neon/Supabase).
2. Run migration scripts.
3. Verify vector calculations and HNSW index performance.
4. Execute full end-to-end integration tests.
