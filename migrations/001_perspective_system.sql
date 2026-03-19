-- Migration: Add Multi-User Perspective System
-- Run this script to migrate existing data to new perspective-based schema

-- 1. Create new tables if not exist

-- Topics Table
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

-- Enhanced Sessions Table
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

-- Timeline Table
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

-- Shared Memories Table
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

-- 2. Add columns to existing tables if not exist

-- LongTermMemory
ALTER TABLE LongTermMemory ADD COLUMN topicId TEXT;
ALTER TABLE LongTermMemory ADD COLUMN perspectiveOf TEXT DEFAULT 'self';
ALTER TABLE LongTermMemory ADD COLUMN sourcePersonId TEXT;
ALTER TABLE LongTermMemory ADD COLUMN isShared INTEGER DEFAULT 0;
ALTER TABLE LongTermMemory ADD COLUMN sharedWith TEXT DEFAULT '[]';

-- ShortTermChat
ALTER TABLE ShortTermChat ADD COLUMN topicId TEXT;
ALTER TABLE ShortTermChat ADD COLUMN perspectiveOf TEXT DEFAULT 'self';
ALTER TABLE ShortTermChat ADD COLUMN sourcePersonId TEXT;
ALTER TABLE ShortTermChat ADD COLUMN isShared INTEGER DEFAULT 0;
ALTER TABLE ShortTermChat ADD COLUMN sharedWith TEXT DEFAULT '[]';

-- Entities
ALTER TABLE Entities ADD COLUMN email TEXT;
ALTER TABLE Entities ADD COLUMN phone TEXT;
ALTER TABLE Entities ADD COLUMN role TEXT;
ALTER TABLE Entities ADD COLUMN metadata TEXT DEFAULT '{}';
ALTER TABLE Entities ADD COLUMN ownerId TEXT NOT NULL DEFAULT userId;
ALTER TABLE Entities ADD COLUMN perspectiveOf TEXT DEFAULT 'self';

-- 3. Create indexes if not exist

-- LongTermMemory indexes
CREATE INDEX IF NOT EXISTS idx_long_term_topic ON LongTermMemory(topicId);
CREATE INDEX IF NOT EXISTS idx_long_term_perspective ON LongTermMemory(perspectiveOf);

-- ShortTermChat indexes
CREATE INDEX IF NOT EXISTS idx_short_term_chat_topic ON ShortTermChat(topicId);
CREATE INDEX IF NOT EXISTS idx_short_term_chat_perspective ON ShortTermChat(perspectiveOf);

-- Entities indexes
CREATE INDEX IF NOT EXISTS idx_entities_owner ON Entities(ownerId);
CREATE INDEX IF NOT EXISTS idx_entities_email ON Entities(email);
CREATE INDEX IF NOT EXISTS idx_entities_perspective ON Entities(perspectiveOf);

-- 4. Create default topic for existing users
INSERT OR IGNORE INTO Topics (id, ownerId, name, description)
SELECT 'default-' || userId, userId, 'General', 'Default topic for general conversations'
FROM (SELECT DISTINCT userId FROM LongTermMemory);

-- 5. Update Entities with default ownerId if not set
UPDATE Entities SET ownerId = userId WHERE ownerId IS NULL;

-- Migration complete!
