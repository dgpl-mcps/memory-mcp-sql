import { db } from "../db/sqlite.js";
import { getMemoryConfig } from "../utils/env.js";

interface ShareOptions {
    memoryId: string;
    memoryType: "timeline" | "longterm" | "shortterm";
    fromOwnerId: string;
    toOwnerId: string;
    perspectiveNote?: string;
    shareType?: "auto" | "manual";
}

export function shareMemory(options: ShareOptions): { success: boolean; shareId?: string; error?: string } {
    try {
        const shareId = `share_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        
        db.prepare(`
            INSERT INTO SharedMemories 
            (id, memoryId, memoryType, fromOwnerId, toOwnerId, perspectiveNote, shareType)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            shareId,
            options.memoryId,
            options.memoryType,
            options.fromOwnerId,
            options.toOwnerId,
            options.perspectiveNote || null,
            options.shareType || "auto"
        );
        
        db.prepare(`
            UPDATE Timeline SET isShared = 1, sharedWith = ?
            WHERE id = ? AND ownerId = ?
        `).run(
            JSON.stringify([options.toOwnerId]),
            options.memoryId,
            options.fromOwnerId
        );
        
        return { success: true, shareId };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export function shareWithMultiple(
    memoryId: string,
    memoryType: string,
    fromOwnerId: string,
    toOwnerIds: string[],
    perspectiveNote?: string
): { success: boolean; shared: number; failed: number } {
    let shared = 0;
    let failed = 0;
    
    toOwnerIds.forEach(toOwnerId => {
        const result = shareMemory({
            memoryId,
            memoryType: memoryType as any,
            fromOwnerId,
            toOwnerId,
            perspectiveNote,
            shareType: "auto"
        });
        
        if (result.success) shared++;
        else failed++;
    });
    
    return { success: shared > 0, shared, failed };
}

export function getSharedWithMe(ownerId: string, options?: {
    includeRead?: boolean;
    limit?: number;
    offset?: number;
}): any[] {
    const config = getMemoryConfig();
    const limit = options?.limit ?? config.DEFAULT_SEARCH_LIMIT;
    const offset = options?.offset ?? config.DEFAULT_SEARCH_OFFSET;
    
    let sql = `
        SELECT sm.*, t.content, t.entities, t.topicId, t.timeSlot,
               e.name as fromPersonName, e.entityType as fromPersonType
        FROM SharedMemories sm
        LEFT JOIN Timeline t ON sm.memoryId = t.id AND sm.memoryType = 'timeline'
        LEFT JOIN Entities e ON sm.fromOwnerId = e.ownerId AND e.entityType = 'Person'
        WHERE sm.toOwnerId = ?
    `;
    const params: any[] = [ownerId];
    
    if (!options?.includeRead) {
        sql += " AND sm.isRead = 0";
    }
    
    sql += " ORDER BY sm.createdAt DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);
    
    const results = db.prepare(sql).all(...params) as any[];
    
    return results.map(r => ({
        id: r.id,
        shareId: r.id,
        from: r.fromOwnerId,
        fromPerson: r.fromPersonName || r.fromOwnerId,
        content: r.content?.slice(0, 300),
        topic: r.topicId,
        sharedAt: r.createdAt,
        isRead: r.isRead === 1,
        perspective: r.perspectiveNote
    }));
}

export function getSharedByMe(ownerId: string, options?: {
    limit?: number;
    offset?: number;
}): any[] {
    const config = getMemoryConfig();
    const limit = options?.limit ?? config.DEFAULT_SEARCH_LIMIT;
    const offset = options?.offset ?? config.DEFAULT_SEARCH_OFFSET;
    
    const results = db.prepare(`
        SELECT sm.*, t.content, t.topicId, t.timeSlot,
               e.name as toPersonName
        FROM SharedMemories sm
        LEFT JOIN Timeline t ON sm.memoryId = t.id AND sm.memoryType = 'timeline'
        LEFT JOIN Entities e ON sm.toOwnerId = e.ownerId AND e.entityType = 'Person'
        WHERE sm.fromOwnerId = ?
        ORDER BY sm.createdAt DESC
        LIMIT ? OFFSET ?
    `).all(ownerId, limit, offset) as any[];
    
    return results.map(r => ({
        id: r.id,
        to: r.toOwnerId,
        toPerson: r.toPersonName || r.toOwnerId,
        content: r.content?.slice(0, 200),
        topic: r.topicId,
        sharedAt: r.createdAt,
        perspective: r.perspectiveNote
    }));
}

export function markAsRead(shareId: string, ownerId: string): boolean {
    const result = db.prepare(`
        UPDATE SharedMemories SET isRead = 1 
        WHERE id = ? AND toOwnerId = ?
    `).run(shareId, ownerId);
    
    return result.changes > 0;
}

export function markAllAsRead(ownerId: string): number {
    const result = db.prepare(`
        UPDATE SharedMemories SET isRead = 1 
        WHERE toOwnerId = ? AND isRead = 0
    `).run(ownerId);
    
    return result.changes;
}

export function revokeShare(shareId: string, fromOwnerId: string): boolean {
    const share = db.prepare(`
        SELECT * FROM SharedMemories WHERE id = ? AND fromOwnerId = ?
    `).get(shareId, fromOwnerId) as any;
    
    if (!share) return false;
    
    db.prepare("DELETE FROM SharedMemories WHERE id = ?").run(shareId);
    
    db.prepare(`
        UPDATE Timeline SET isShared = 0 
        WHERE id = ? AND ownerId = ?
    `).run(share.memoryId, fromOwnerId);
    
    return true;
}

export function autoShareRelevantInfo(
    fromOwnerId: string,
    memoryId: string,
    content: string,
    relatedPersons: string[]
): { shared: number } {
    const toShareWith: string[] = [];
    
    relatedPersons.forEach(personName => {
        const person = db.prepare(`
            SELECT DISTINCT ownerId FROM Entities 
            WHERE name = ? AND entityType = 'Person' AND ownerId != ?
        `).get(personName, fromOwnerId) as any;
        
        if (person && person.ownerId) {
            toShareWith.push(person.ownerId);
        }
    });
    
    let shared = 0;
    toShareWith.forEach(toOwnerId => {
        const result = shareMemory({
            memoryId,
            memoryType: "timeline",
            fromOwnerId,
            toOwnerId,
            perspectiveNote: `Shared because ${relatedPersons.join(", ")} mentioned`,
            shareType: "auto"
        });
        if (result.success) shared++;
    });
    
    return { shared };
}

export function getUnreadCount(ownerId: string): number {
    const result = db.prepare(`
        SELECT COUNT(*) as count FROM SharedMemories 
        WHERE toOwnerId = ? AND isRead = 0
    `).get(ownerId) as any;
    
    return result?.count || 0;
}

export function syncSharedInfoToMyMemory(ownerId: string, shareId: string): { success: boolean; memoryId?: string; error?: string } {
    try {
        const share = db.prepare(`
            SELECT * FROM SharedMemories WHERE id = ? AND toOwnerId = ?
        `).get(shareId, ownerId) as any;
        
        if (!share) {
            return { success: false, error: "Share not found" };
        }
        
        if (share.memoryType !== "timeline") {
            return { success: false, error: "Only timeline memories can be synced" };
        }
        
        const originalMemory = db.prepare(`
            SELECT * FROM Timeline WHERE id = ?
        `).get(share.memoryId) as any;
        
        if (!originalMemory) {
            return { success: false, error: "Original memory not found" };
        }
        
        const newMemoryId = `sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        
        db.prepare(`
            INSERT INTO Timeline 
            (id, ownerId, sessionId, topicId, perspectiveOf, sourcePersonId, content, memoryType, entities, priority)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            newMemoryId,
            ownerId,
            originalMemory.sessionId,
            originalMemory.topicId,
            "other",
            share.fromOwnerId,
            `[Synced from ${share.fromOwnerId}]: ${originalMemory.content}`,
            originalMemory.memoryType,
            originalMemory.entities,
            originalMemory.priority
        );
        
        markAsRead(shareId, ownerId);
        
        return { success: true, memoryId: newMemoryId };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
