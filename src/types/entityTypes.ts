import { z } from "zod";

export const EntityTypes = {
    Person: "Person",
    Project: "Project",
    Task: "Task",
    Event: "Event",
    Document: "Document",
    Rule: "Rule",
    Goal: "Goal",
    Insight: "Insight",
    Epic: "Epic",
    Todo: "Todo",
    CoreRule: "CoreRule"
} as const;

export type EntityType = typeof EntityTypes[keyof typeof EntityTypes];

export const EntitySchemas: Record<EntityType, z.ZodType<any>> = {
    Person: z.object({
        name: z.string().min(1),
        role: z.string().optional(),
        contact: z.string().optional(),
        metadata: z.record(z.any()).optional()
    }),
    Project: z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        status: z.enum(["active", "completed", "archived", "on_hold"]).optional(),
        goals: z.array(z.string()).optional(),
        metadata: z.record(z.any()).optional()
    }),
    Task: z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        status: z.enum(["pending", "in_progress", "completed"]).optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        assignee: z.string().optional(),
        metadata: z.record(z.any()).optional()
    }),
    Event: z.object({
        name: z.string().min(1),
        date: z.string().optional(),
        location: z.string().optional(),
        participants: z.array(z.string()).optional(),
        metadata: z.record(z.any()).optional()
    }),
    Document: z.object({
        title: z.string().min(1),
        content: z.string().optional(),
        version: z.string().optional(),
        author: z.string().optional(),
        metadata: z.record(z.any()).optional()
    }),
    Rule: z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        conditions: z.array(z.string()).optional(),
        actions: z.array(z.string()).optional(),
        metadata: z.record(z.any()).optional()
    }),
    Goal: z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        targetDate: z.string().optional(),
        progress: z.number().min(0).max(100).optional(),
        metadata: z.record(z.any()).optional()
    }),
    Insight: z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        category: z.string().optional(),
        confidence: z.number().min(0).max(1).optional(),
        metadata: z.record(z.any()).optional()
    }),
    Epic: z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        status: z.enum(["planning", "in_progress", "completed"]).optional(),
        milestones: z.array(z.string()).optional(),
        metadata: z.record(z.any()).optional()
    }),
    Todo: z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        completed: z.boolean().optional(),
        dueDate: z.string().optional(),
        metadata: z.record(z.any()).optional()
    }),
    CoreRule: z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        rationale: z.string().optional(),
        enforcement: z.enum(["strict", "flexible", "advisory"]).optional(),
        metadata: z.record(z.any()).optional()
    })
};

export const RelationTypes = {
    DEPENDS_ON: "DEPENDS_ON",
    SUBTASK_OF: "SUBTASK_OF",
    FOLLOWS: "FOLLOWS",
    GOVERNED_BY: "GOVERNED_BY",
    PART_OF: "PART_OF",
    RELATES_TO: "RELATES_TO",
    BLOCKED_BY: "BLOCKED_BY",
    ENABLED_BY: "ENABLED_BY",
    HAS_SUBTASK: "HAS_SUBTASK"
} as const;

export type RelationType = typeof RelationTypes[keyof typeof RelationTypes];

export const AllowedRelations: Record<EntityType, RelationType[]> = {
    Person: [RelationTypes.RELATES_TO, RelationTypes.PART_OF],
    Project: [RelationTypes.RELATES_TO, RelationTypes.GOVERNED_BY],
    Task: [RelationTypes.DEPENDS_ON, RelationTypes.SUBTASK_OF, RelationTypes.BLOCKED_BY, RelationTypes.PART_OF],
    Event: [RelationTypes.RELATES_TO, RelationTypes.PART_OF],
    Document: [RelationTypes.RELATES_TO, RelationTypes.ENABLED_BY],
    Rule: [RelationTypes.GOVERNED_BY, RelationTypes.RELATES_TO],
    Goal: [RelationTypes.DEPENDS_ON, RelationTypes.PART_OF, RelationTypes.ENABLED_BY],
    Insight: [RelationTypes.RELATES_TO, RelationTypes.ENABLED_BY],
    Epic: [RelationTypes.HAS_SUBTASK, RelationTypes.PART_OF],
    Todo: [RelationTypes.SUBTASK_OF, RelationTypes.BLOCKED_BY],
    CoreRule: [RelationTypes.GOVERNED_BY, RelationTypes.RELATES_TO]
} as const;

export function validateEntityType(entityType: string): entityType is EntityType {
    return Object.values(EntityTypes).includes(entityType as EntityType);
}

export function validateEntity(entityType: EntityType, properties: any): { valid: boolean; errors: string[] } {
    const schema = EntitySchemas[entityType];
    if (!schema) {
        return { valid: false, errors: [`Unknown entity type: ${entityType}`] };
    }
    
    const result = schema.safeParse(properties);
    if (!result.success) {
        const errors = result.error.errors.map(e => `${e.path.join(".")}: ${e.message}`);
        return { valid: false, errors };
    }
    
    return { valid: true, errors: [] };
}

export function getAllowedRelations(entityType: EntityType): RelationType[] {
    return AllowedRelations[entityType] || [];
}

export function validateRelationType(entityType: EntityType, relationType: string): boolean {
    const allowed = getAllowedRelations(entityType);
    return allowed.includes(relationType as RelationType);
}