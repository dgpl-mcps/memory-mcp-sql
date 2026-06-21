import { z } from "zod";

export const EntityTypes = {
    Person: "Person",
    Bot: "Bot",
    Organization: "Organization",
    Project: "Project",
    Server: "Server",
    Service: "Service",
    Incident: "Incident",
    Task: "Task",
    Event: "Event",
    Document: "Document",
    Rule: "Rule",
    CoreRule: "CoreRule",
    Goal: "Goal",
    LongTermGoal: "LongTermGoal",
    Insight: "Insight",
    Epic: "Epic",
    Todo: "Todo",
    Walkthrough: "Walkthrough"
} as const;

export type EntityType = typeof EntityTypes[keyof typeof EntityTypes];

export const EntitySchemas: Record<EntityType, z.ZodType<any>> = {
    Person: z.object({
        name: z.string().min(1),
        role: z.string().optional(),
        contact: z.string().optional(),
        metadata: z.record(z.any()).optional()
    }),
    Bot: z.object({
        name: z.string().min(1),
        role: z.string().optional(),
        platform: z.string().optional(),
        metadata: z.record(z.any()).optional()
    }),
    Organization: z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        industry: z.string().optional(),
        metadata: z.record(z.any()).optional()
    }),
    Project: z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        status: z.enum(["active", "completed", "archived", "on_hold"]).optional(),
        goals: z.array(z.string()).optional(),
        metadata: z.record(z.any()).optional()
    }),
    Server: z.object({
        name: z.string().min(1),
        host: z.string().optional(),
        ip: z.string().optional(),
        os: z.string().optional(),
        role: z.string().optional(),
        metadata: z.record(z.any()).optional()
    }),
    Service: z.object({
        name: z.string().min(1),
        type: z.string().optional(),
        port: z.number().optional(),
        status: z.string().optional(),
        metadata: z.record(z.any()).optional()
    }),
    Incident: z.object({
        name: z.string().min(1),
        severity: z.enum(["critical", "high", "medium", "low"]).optional(),
        duration: z.string().optional(),
        rootCause: z.string().optional(),
        resolution: z.string().optional(),
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
    CoreRule: z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        rationale: z.string().optional(),
        enforcement: z.enum(["strict", "flexible", "advisory"]).optional(),
        metadata: z.record(z.any()).optional()
    }),
    Goal: z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        targetDate: z.string().optional(),
        progress: z.number().min(0).max(100).optional(),
        metadata: z.record(z.any()).optional()
    }),
    LongTermGoal: z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        targetDate: z.string().optional(),
        progress: z.number().min(0).max(100).optional(),
        milestones: z.array(z.string()).optional(),
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
    Walkthrough: z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        steps: z.array(z.string()).optional(),
        category: z.string().optional(),
        metadata: z.record(z.any()).optional()
    })
};

export const RelationTypes = {
    DEPENDS_ON: "DEPENDS_ON",
    SUBTASK_OF: "SUBTASK_OF",
    FOLLOWS: "FOLLOWS",
    GOVERNED_BY: "GOVERNED_BY",
    PART_OF: "PART_OF",
    WORKS_WITH: "WORKS_WITH",
    KNOWS: "KNOWS",
    TOLD: "TOLD",
    CONTACTS: "CONTACTS",
    BELONGS_TO: "BELONGS_TO",
    MANAGED_BY: "MANAGED_BY",
    OWNS: "OWNS",
    DEADLINE_FOR: "DEADLINE_FOR",
    RELATES_TO: "RELATES_TO",
    BLOCKED_BY: "BLOCKED_BY",
    ENABLED_BY: "ENABLED_BY",
    HAS_SUBTASK: "HAS_SUBTASK",
    HOSTS: "HOSTS",
    RUNS_ON: "RUNS_ON",
    CAUSED_BY: "CAUSED_BY",
    RESOLVED_BY: "RESOLVED_BY"
} as const;

export type RelationType = typeof RelationTypes[keyof typeof RelationTypes];

export const AllowedRelations: Record<EntityType, RelationType[]> = {
    Person: [RelationTypes.RELATES_TO, RelationTypes.PART_OF, RelationTypes.WORKS_WITH, RelationTypes.KNOWS, RelationTypes.TOLD, RelationTypes.CONTACTS, RelationTypes.MANAGED_BY, RelationTypes.OWNS],
    Bot: [RelationTypes.RELATES_TO, RelationTypes.PART_OF, RelationTypes.WORKS_WITH, RelationTypes.MANAGED_BY],
    Organization: [RelationTypes.RELATES_TO, RelationTypes.PART_OF, RelationTypes.WORKS_WITH, RelationTypes.OWNS, RelationTypes.MANAGED_BY],
    Project: [RelationTypes.RELATES_TO, RelationTypes.GOVERNED_BY, RelationTypes.PART_OF, RelationTypes.DEPENDS_ON, RelationTypes.ENABLED_BY, RelationTypes.BLOCKED_BY, RelationTypes.DEADLINE_FOR],
    Server: [RelationTypes.PART_OF, RelationTypes.HOSTS, RelationTypes.RUNS_ON, RelationTypes.MANAGED_BY, RelationTypes.DEPENDS_ON],
    Service: [RelationTypes.PART_OF, RelationTypes.RUNS_ON, RelationTypes.DEPENDS_ON, RelationTypes.BLOCKED_BY, RelationTypes.ENABLED_BY],
    Incident: [RelationTypes.CAUSED_BY, RelationTypes.RESOLVED_BY, RelationTypes.RELATES_TO, RelationTypes.BLOCKED_BY],
    Task: [RelationTypes.DEPENDS_ON, RelationTypes.SUBTASK_OF, RelationTypes.BLOCKED_BY, RelationTypes.PART_OF, RelationTypes.ENABLED_BY, RelationTypes.DEADLINE_FOR],
    Event: [RelationTypes.RELATES_TO, RelationTypes.PART_OF, RelationTypes.FOLLOWS],
    Document: [RelationTypes.RELATES_TO, RelationTypes.ENABLED_BY, RelationTypes.PART_OF],
    Rule: [RelationTypes.GOVERNED_BY, RelationTypes.RELATES_TO, RelationTypes.ENABLED_BY],
    CoreRule: [RelationTypes.GOVERNED_BY, RelationTypes.RELATES_TO, RelationTypes.ENABLED_BY],
    Goal: [RelationTypes.DEPENDS_ON, RelationTypes.PART_OF, RelationTypes.ENABLED_BY, RelationTypes.BLOCKED_BY, RelationTypes.DEADLINE_FOR],
    LongTermGoal: [RelationTypes.DEPENDS_ON, RelationTypes.PART_OF, RelationTypes.ENABLED_BY, RelationTypes.BLOCKED_BY, RelationTypes.DEADLINE_FOR, RelationTypes.HAS_SUBTASK],
    Insight: [RelationTypes.RELATES_TO, RelationTypes.ENABLED_BY, RelationTypes.PART_OF],
    Epic: [RelationTypes.HAS_SUBTASK, RelationTypes.PART_OF, RelationTypes.DEPENDS_ON, RelationTypes.BLOCKED_BY],
    Todo: [RelationTypes.SUBTASK_OF, RelationTypes.BLOCKED_BY, RelationTypes.DEPENDS_ON, RelationTypes.DEADLINE_FOR],
    Walkthrough: [RelationTypes.RELATES_TO, RelationTypes.PART_OF, RelationTypes.FOLLOWS]
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