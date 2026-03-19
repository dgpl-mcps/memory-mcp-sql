import { createEntity, getEntity, listEntities, updateEntity, deleteEntity, createRelation, getRelations, deleteRelation } from "../db/sqlite.js";
import { validatePayload, baseSchema } from "./validation.js";
import { getMemoryConfig } from "../utils/env.js";
import { z } from "zod";

export const graphTools = [
    // =============================================
    // ENTITY (NODE) OPERATIONS
    // =============================================
    // Entity Types: Person, Bot, Organization, Task, Event, Topic, Rule, 
    //               LongTermGoal, Epic, Todo, Insight, FileMeta, CoreRule, Walkthrough
    // Properties: Can store any key-value pairs for entity metadata
    // =============================================
    {
        name: "create_entity",
        description: `## Create Entity (Node) in Knowledge Graph

**Purpose:** Create a new node/entity to represent things in your knowledge graph.

**Entity Types & When to Use:**
| Type | Use For | Example |
|------|---------|---------|
| Person | Humans, users, contacts | "John", "Sarah from marketing" |
| Bot | AI assistants, chatbots | "Claude", "Slack bot" |
| Organization | Companies, teams, groups | "Acme Corp", "Engineering team" |
| Task | Work items, todos | "API integration", "Bug fix" |
| Rule | Guidelines, principles | "Use explicit imports" |
| CoreRule | Critical project rules | "Always validate input" |
| LongTermGoal | Major objectives | "Reduce latency by 50%" |
| Epic | Large features | "User authentication" |
| Todo | Small tasks | "Fix login button" |
| Insight | Lessons learned | "REST is better for this" |
| FileMeta | Codebase architecture | "src/auth handles auth" |
| Walkthrough | Step-by-step guides | "How to deploy" |

**Use Cases:**
- User mentions a new project, goal, or concept
- Capturing architectural decisions
- Tracking people, bots, or organizations
- Building dependency hierarchies

**Tool Chaining:**
- After: create_relation to link entities
- Before: add_todo, add_core_rule for sub-items

**Keywords:** node, entity, create, add, new, goal, task, rule, project, concept, person, bot, organization

**Example:**
\`\`\`json
{
  "userId": "nandini",
  "projectId": "work-project",
  "entityType": "Person",
  "name": "Priya Sharma",
  "properties": {"role": "Team Lead", "department": "Engineering", "email": "priya@company.com"}
}
\`\`\`

**Example - Creating a Rule:**
\`\`\`json
{
  "userId": "dev",
  "projectId": "myapp",
  "entityType": "CoreRule",
  "name": "Validate all inputs",
  "properties": {"severity": "critical", "reason": "Security"}
}
\`\`\``,
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID" },
                entityType: { type: "string", description: "Type of entity (Rule, Task, LongTermGoal, etc)" },
                name: { type: "string", description: "Name/Title of the entity" },
                properties: { type: "object", description: "JSON object containing the entity's details" }
            },
            required: ["userId", "projectId", "entityType", "name"],
        },
        handler: async (args: any) => {
            try {
                const schema = baseSchema.extend({
                    entityType: z.string().min(1, "entityType cannot be empty"),
                    name: z.string().min(1, "name cannot be empty"),
                    properties: z.record(z.any()).optional()
                });

                const { userId, projectId, entityType, name, properties } = validatePayload(schema, args);

                const newEntity = createEntity(userId, projectId, entityType, name, properties || {});
                return {
                    content: [{ type: "text", text: `Entity created with ID: ${newEntity.id}` }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "read_entity",
        description: `## Read Entity Details from Graph

**Purpose:** Retrieve full details of a specific entity/node from the knowledge graph.

**Use Cases:**
- User asks "what is X?" or wants details about stored entity
- Following up on entity creation to verify
- Getting context before updating/linking entities
- Investigating a specific task, person, rule, or goal

**Returns:** Entity with all properties including:
- id, name, entityType
- All custom properties stored
- createdAt, updatedAt timestamps
- For Persons: email, phone, role if stored

**Tool Chaining:**
- After: search_graph to find entity ID
- Before: Often leads to update_entity or create_relation

**Keywords:** read, get, show, details, view, info, fetch, entity, node, graph, who, what

**Example:**
\`\`\`json
{
  "userId": "nandini",
  "projectId": "my-project",
  "id": "entity_abc123"
}
\`\`\`

**Example Response:**
\`\`\`json
{
  "id": "entity_abc123",
  "entityType": "Person",
  "name": "Priya Sharma",
  "properties": {"role": "Team Lead"},
  "email": "priya@company.com"
}
\`\`\``,
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID" },
                id: { type: "string", description: "The Entity ID of the Entity" }
            },
            required: ["userId", "projectId", "id"],
        },
        handler: async (args: any) => {
            const { userId, projectId, id } = args;
            try {
                const entity = getEntity(id);
                if (!entity || entity.userId !== userId || entity.projectId !== projectId) {
                    return { isError: true, content: [{ type: "text", text: "Entity not found." }] };
                }
                return {
                    content: [{ type: "text", text: JSON.stringify(entity, null, 2) }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "create_relation",
        description: `## Create Relation (Edge) Between Entities

**Purpose:** Link two entities together to create a knowledge graph with relationships.

**Relation Types:**
| Type | Meaning | Example |
|------|---------|---------|
| DEPENDS_ON | A needs B to complete | Task A depends on Task B |
| SUBTASK_OF | A is part of B | Bug fix is subtask of Sprint |
| FOLLOWS | A comes after B | Test follows Implementation |
| GOVERNED_BY | A follows B's rules | Code governed by Architecture |
| PART_OF | A belongs to B | Feature part of Epic |
| WORKS_WITH | A collaborates with B | Dev works with Designer |
| KNOWS | A knows B | Person A knows Person B |
| TOLD | A told B something | Person A told B about deadline |
| CONTACTS | A contacted B | Person contacted support |
| BELONGS_TO | A belongs to B | Person belongs to Org |
| MANAGED_BY | A is managed by B | Employee managed by Manager |
| OWNS | A owns B | Person owns Project |
| DEADLINE_FOR | Task has deadline for Person | Report deadline for Manager |

**Use Cases:**
- Building task dependencies
- Linking people to projects
- Creating organizational hierarchies
- Establishing communication patterns

**Tool Chaining:**
- After: Need entity IDs from create_entity or search_graph
- Before: Can chain deep_search_graph to explore relationships

**Keywords:** relation, edge, link, connect, dependency, hierarchy, relationship, between

**Example - Task Dependencies:**
\`\`\`json
{
  "userId": "dev",
  "projectId": "myapp",
  "fromId": "entity_design",
  "toId": "entity_implementation",
  "relationType": "DEPENDS_ON",
  "properties": {"reason": "Implementation needs design approval"}
}
\`\`\`

**Example - Person-Project Link:**
\`\`\`json
{
  "userId": "manager",
  "projectId": "work",
  "fromId": "entity_john",
  "toId": "entity_projectx",
  "relationType": "WORKS_WITH",
  "properties": {"role": "Lead Developer"}
}
\`\`\``,
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID" },
                fromId: { type: "string", description: "Entity ID of the starting Node" },
                toId: { type: "string", description: "Entity ID of the target Node" },
                relationType: { type: "string", description: "Type of relationship (DEPENDS_ON, SUBTASK_OF, etc)" },
                properties: { type: "object", description: "JSON properties describing the relation context" }
            },
            required: ["userId", "projectId", "fromId", "toId", "relationType"],
        },
        handler: async (args: any) => {
            const { userId, projectId, fromId, toId, relationType, properties } = args;
            try {
                const fromDb = getEntity(fromId);
                const toDb = getEntity(toId);

                if (!fromDb || !toDb || fromDb.userId !== userId || toDb.userId !== userId) {
                    return { isError: true, content: [{ type: "text", text: "One or both Entities do not exist or you lack access to them." }] };
                }

                const newRelation = createRelation(userId, projectId, fromId, toId, relationType, properties || {});
                return {
                    content: [{ type: "text", text: `Relation created: ${fromDb.name} -[${relationType}]-> ${toDb.name}` }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "update_entity",
        description: `## Update Entity in Graph

**Purpose:** Modify an existing entity's name or properties.

**Use Cases:**
- Entity information changed (new role, email, etc.)
- Updating task status or progress
- Adding new properties to existing entity
- Changing entity name

**Properties Behavior:** New properties merge with existing ones (shallow merge).

**Tool Chaining:**
- After: Usually from read_entity to see current state
- Before: Often followed by create_relation if relationships changed

**Keywords:** update, edit, modify, change, set, rename, properties, entity

**Example:**
\`\`\`json
{
  "userId": "nandini",
  "projectId": "work",
  "id": "entity_person123",
  "name": "Priya Sharma (Updated)",
  "properties": {"role": "Senior Lead", "newField": "value"}
}
\`\`\`

**Note:** If you only want to update name, omit properties. If only properties, omit name.`,
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID" },
                id: { type: "string", description: "Entity ID of the Entity to update" },
                name: { type: "string", description: "New Name/Title of the entity (optional)" },
                properties: { type: "object", description: "JSON properties to merge/update (optional, merges with existing if present)" }
            },
            required: ["userId", "projectId", "id"],
        },
        handler: async (args: any) => {
            const { userId, projectId, id, name, properties } = args;
            try {
                const entity = getEntity(id);
                if (!entity || entity.userId !== userId || entity.projectId !== projectId) {
                    return { isError: true, content: [{ type: "text", text: "Entity not found." }] };
                }

                const mergedProps = properties ? { ...entity.properties, ...properties } : undefined;
                updateEntity(id, { name, properties: mergedProps });
                return {
                    content: [{ type: "text", text: `Entity ${id} updated.` }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "delete_entity",
        description: "Delete an Entity by its ID and remove all Relations attached to it.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID" },
                id: { type: "string", description: "Entity ID of the Entity to delete" }
            },
            required: ["userId", "projectId", "id"],
        },
        handler: async (args: any) => {
            const { userId, projectId, id } = args;
            try {
                const entity = getEntity(id);
                if (!entity || entity.userId !== userId || entity.projectId !== projectId) {
                    return { isError: true, content: [{ type: "text", text: "Entity not found." }] };
                }

                deleteEntity(id);
                return {
                    content: [{ type: "text", text: `Entity ${id} and attached relations deleted.` }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "delete_relation",
        description: "Delete a Relation (Edge) from the Graph Database connecting two entities.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID" },
                fromId: { type: "string", description: "Entity ID of the starting Node" },
                toId: { type: "string", description: "Entity ID of the target Node" },
                relationType: { type: "string", description: "Type of relationship to delete (e.g. DEPENDS_ON)" }
            },
            required: ["userId", "projectId", "fromId", "toId", "relationType"],
        },
        handler: async (args: any) => {
            const { userId, projectId, fromId, toId, relationType } = args;
            try {
                const relations = getRelations(userId, projectId, fromId, toId, relationType);
                if (relations.length === 0) {
                    return { isError: true, content: [{ type: "text", text: "Relation not found." }] };
                }
                deleteRelation(relations[0].id);
                return {
                    content: [{ type: "text", text: `Relation deleted.` }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "search_graph",
        description: `## Search Graph for Entities

**Purpose:** Find entities by type and/or name, with their immediate relationships (1-degree).

**Use Cases:**
- Finding all tasks in a project
- Searching for people by name
- Finding entities by type (all Rules, all Epics)
- Getting entity overview with relationships

**Returns:** Entities with their outgoing and incoming relations.

**Tool Chaining:**
- After: Often followed by read_entity for full details
- Can chain: create_relation to link found entities

**Keywords:** search, find, list, query, graph, entities, nodes, type, filter

**Example - Find all Tasks:**
\`\`\`json
{
  "userId": "dev",
  "projectId": "myapp",
  "entityType": "Task",
  "limit": 20
}
\`\`\`

**Example - Search by Name:**
\`\`\`json
{
  "userId": "manager",
  "projectId": "work",
  "entityType": "Person",
  "searchString": "priya"
}
\`\`\`

**Example - Find All Entities:**
\`\`\`json
{
  "userId": "dev",
  "projectId": "myapp",
  "limit": 50
}
\`\`\``,
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID" },
                entityType: { type: "string", description: "Type to search for (e.g., Rule, Task)" },
                searchString: { type: "string", description: "Substring to match in name" },
                limit: { type: "number", description: "Max results (default from env: 10)" },
                offset: { type: "number", description: "Pagination offset (default from env: 0)" }
            },
            required: ["userId", "projectId"],
        },
        handler: async (args: any) => {
            const config = getMemoryConfig();
            const { userId, projectId, entityType, searchString } = args;
            const limit = args.limit ?? config.DEFAULT_SEARCH_LIMIT;
            const offset = args.offset ?? config.DEFAULT_SEARCH_OFFSET;
            
            try {
                const entities = listEntities(userId, projectId, entityType);
                const filtered = searchString 
                    ? entities.filter(e => e.name.toLowerCase().includes(searchString.toLowerCase()))
                    : entities;

                const paginated = filtered.slice(offset, offset + limit);

                const results = paginated.map(e => {
                    const outEdges = getRelations(userId, projectId, e.id);
                    const inEdges = getRelations(userId, projectId, undefined, e.id);
                    return { entity: e, outgoing: outEdges, incoming: inEdges };
                });

                return {
                    content: [{ type: "text", text: JSON.stringify({
                        results,
                        search_context: { limit, offset, source: "search_graph" }
                    }, null, 2) }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "deep_search_graph",
        description: `## Deep Search Graph (Multi-level)

**Purpose:** Recursively explore the graph to find entire dependency trees or hierarchical structures.

**Use Cases:**
- Finding all subtasks of a task
- Mapping out project dependencies
- Understanding how things relate in complex hierarchies
- Finding all work related to an epic

**Parameters:**
- maxDepth: How deep to search (1-5, default 3)
- limit: Results per level

**Tool Chaining:**
- After: Often from search_graph or read_entity
- Before: Can follow with read_entity for details on found nodes

**Keywords:** deep, recursive, explore, hierarchy, dependency, tree, all, related, subtasks

**Example - Find All Subtasks:**
\`\`\`json
{
  "userId": "dev",
  "projectId": "myapp",
  "id": "entity_epic123",
  "maxDepth": 5,
  "limit": 50
}
\`\`\`

**Returns:** All nodes and relations found within depth, preventing infinite loops.`,
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                projectId: { type: "string" },
                id: { type: "string", description: "Entity ID of the starting Node" },
                maxDepth: { type: "number", description: "Maximum depth to search (default 3, max 5)" },
                limit: { type: "number", description: "Max results per level (default from env: 10)" }
            },
            required: ["userId", "projectId", "id"],
        },
        handler: async (args: any) => {
            const config = getMemoryConfig();
            const { userId, projectId, id } = args;
            const maxDepth = Math.min(Math.max(1, args.maxDepth ?? 3), 5);
            const limit = args.limit ?? config.DEFAULT_SEARCH_LIMIT;

            try {
                const visitedNodes = new Set<string>();
                const nodes: any[] = [];
                const relations: any[] = [];

                const queue: { currentId: string, depth: number }[] = [{ currentId: id, depth: 0 }];

                while (queue.length > 0) {
                    const { currentId, depth } = queue.shift()!;

                    if (visitedNodes.has(currentId)) continue;
                    visitedNodes.add(currentId);

                    const entity = getEntity(currentId);
                    if (entity && entity.userId === userId && entity.projectId === projectId) {
                        nodes.push(entity);
                    } else continue;

                    if (depth < maxDepth) {
                        const outEdges = getRelations(userId, projectId, currentId);
                        const inEdges = getRelations(userId, projectId, undefined, currentId);

                        outEdges.forEach(e => {
                            relations.push(e);
                            if (!visitedNodes.has(e.toId)) queue.push({ currentId: e.toId, depth: depth + 1 });
                        });

                        inEdges.forEach(e => {
                            relations.push(e);
                            if (!visitedNodes.has(e.fromId)) queue.push({ currentId: e.fromId, depth: depth + 1 });
                        });
                    }
                }

                const uniqueRelations = Array.from(new Map(relations.map(r => [r.id, r])).values());

                return {
                    content: [{ type: "text", text: JSON.stringify({ nodes, relations: uniqueRelations }, null, 2) }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "find_path",
        description: `## Find Path Between Entities

**Purpose:** Check if there's a directed path connecting two entities through their relationships.

**Use Cases:**
- Checking if task A eventually depends on task B
- Verifying organizational hierarchy
- Understanding how information flows
- Detecting circular dependencies

**Keywords:** path, route, connection, between, exists, connected, trace

**Example:**
\`\`\`json
{
  "userId": "dev",
  "projectId": "myapp",
  "fromId": "entity_task1",
  "toId": "entity_task50"
}
\`\`\`

**Returns:** Path if exists (A -> B -> C) or "No path found".`,
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                projectId: { type: "string" },
                fromId: { type: "string", description: "Entity ID of the starting Node" },
                toId: { type: "string", description: "Entity ID of the target Node" }
            },
            required: ["userId", "projectId", "fromId", "toId"],
        },
        handler: async (args: any) => {
            const { userId, projectId, fromId, toId } = args;
            try {
                const visited = new Set<string>();
                const queue = [{ id: fromId, path: [fromId] }];
                let foundPath = null;

                while (queue.length > 0) {
                    const { id, path } = queue.shift()!;

                    if (id === toId) {
                        foundPath = path;
                        break;
                    }

                    if (visited.has(id)) continue;
                    visited.add(id);

                    const outEdges = getRelations(userId, projectId, id);
                    for (const edge of outEdges) {
                        const nextId = edge.toId;
                        if (!visited.has(nextId)) {
                            queue.push({ id: nextId, path: [...path, nextId] });
                        }
                    }
                }

                if (foundPath) {
                    return {
                        content: [{ type: "text", text: `Path found: ${foundPath.join(" -> ")}` }],
                    };
                } else {
                    return {
                        content: [{ type: "text", text: "No path found between these nodes." }],
                    };
                }

            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "get_project_timeline",
        description: `## Get Project Timeline

**Purpose:** Get chronological history of project entities (Epics, Todos, Rules, Insights).

**Use Cases:**
- Understanding project history
- Seeing what was created when
- Tracking project evolution
- Getting overview of project

**Entity Types Shown:** Epic, Todo, CoreRule, Insight

**Keywords:** timeline, history, chronological, project, created, when, evolution

**Example:**
\`\`\`json
{
  "userId": "dev",
  "projectId": "myapp",
  "limit": 20
}
\`\`\``,
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                projectId: { type: "string" },
                limit: { type: "number", description: "Max items to return (default 20)" }
            },
            required: ["userId", "projectId"],
        },
        handler: async (args: any) => {
            const { userId, projectId, limit = 20 } = args;
            try {
                const allEntities = listEntities(userId, projectId);
                const timeline = allEntities
                    .filter(e => ['Epic', 'Todo', 'CoreRule', 'Insight'].includes(e.entityType))
                    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                    .slice(0, limit);

                return {
                    content: [{ type: "text", text: JSON.stringify(timeline, null, 2) }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    }
];
