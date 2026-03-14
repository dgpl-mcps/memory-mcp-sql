import { createEntity, getEntity, listEntities, updateEntity, deleteEntity, createRelation, getRelations, deleteRelation } from "../db/sqlite.js";
import { validatePayload, baseSchema } from "./validation.js";
import { z } from "zod";

export const graphTools = [
    {
        name: "create_entity",
        description: "Create a new Node in the long-term Graph memory (e.g. Goal, Task, Rule, Walkthrough).",
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
        description: "Read details of an Entity (Node) from the Graph Database by its ID.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID" },
                id: { type: "string", description: "The Mongo ObjectID of the Entity" }
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
        description: "Create an Edge linking two Graph Nodes to establish dependencies, sequences, or hierarchies (e.g DEPENDS_ON, FOLLOWS, SUBTASK_OF, GOVERNED_BY).",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID" },
                fromId: { type: "string", description: "Mongo ObjectID of the starting Node" },
                toId: { type: "string", description: "Mongo ObjectID of the target Node" },
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
        description: "Update the name or properties of an existing Entity in the Graph memory by its ID.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID" },
                id: { type: "string", description: "Mongo ObjectID of the Entity to update" },
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
                id: { type: "string", description: "Mongo ObjectID of the Entity to delete" }
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
                fromId: { type: "string", description: "Mongo ObjectID of the starting Node" },
                toId: { type: "string", description: "Mongo ObjectID of the target Node" },
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
        description: "Search the Graph DB for entities and immediately related nodes (1-degree of separation) by entity type and keyword.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID" },
                entityType: { type: "string", description: "Type to search for (e.g., Rule, Task)" },
                searchString: { type: "string", description: "Substring to match in name" }
            },
            required: ["userId", "projectId"],
        },
        handler: async (args: any) => {
            const { userId, projectId, entityType, searchString } = args;
            try {
                const entities = listEntities(userId, projectId, entityType);
                const filtered = searchString 
                    ? entities.filter(e => e.name.toLowerCase().includes(searchString.toLowerCase())).slice(0, 50)
                    : entities.slice(0, 50);

                const results = filtered.map(e => {
                    const outEdges = getRelations(userId, projectId, e.id);
                    const inEdges = getRelations(userId, projectId, undefined, e.id);
                    return { entity: e, outgoing: outEdges, incoming: inEdges };
                });

                return {
                    content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "deep_search_graph",
        description: "Recursively search the Graph Database to a specified depth to find an entire dependency/hierarchy tree.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                projectId: { type: "string" },
                id: { type: "string", description: "Mongo ObjectID of the starting Node" },
                maxDepth: { type: "number", description: "Maximum depth to search (default 3, max 5)" }
            },
            required: ["userId", "projectId", "id"],
        },
        handler: async (args: any) => {
            const { userId, projectId, id, maxDepth = 3 } = args;
            const depthLimit = Math.min(Math.max(1, maxDepth), 5);

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

                    if (depth < depthLimit) {
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
        description: "Find if a directed path exists between two nodes in the Graph memory.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string" },
                projectId: { type: "string" },
                fromId: { type: "string", description: "Mongo ObjectID of the starting Node" },
                toId: { type: "string", description: "Mongo ObjectID of the target Node" }
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
        description: "Returns a chronological timeline of Epics, Todos, and Rules created for this project to understand its history.",
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
