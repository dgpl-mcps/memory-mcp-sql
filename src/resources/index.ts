import { 
    listProjects, listTasks, listEntities, getRelations, 
    getProject, getTask, getEntity, listShortTermMemory,
    listWorkflows, getWorkflow
} from "../db/sqlite.js";

interface Resource {
    uri: string;
    name: string;
    description: string;
    mimeType: string;
}

const resourceTemplates: Resource[] = [
    {
        uri: "memory:///{userId}/projects",
        name: "User Projects",
        description: "List all projects for a user",
        mimeType: "application/json"
    },
    {
        uri: "memory:///{userId}/{projectId}/tasks",
        name: "Project Tasks",
        description: "List all tasks in a project",
        mimeType: "application/json"
    },
    {
        uri: "memory:///{userId}/{projectId}/entities",
        name: "Project Entities",
        description: "List all graph entities in a project",
        mimeType: "application/json"
    },
    {
        uri: "memory:///{userId}/{projectId}/relations",
        name: "Project Relations",
        description: "List all graph relations in a project",
        mimeType: "application/json"
    },
    {
        uri: "memory:///{userId}/{projectId}/memories",
        name: "Short-term Memories",
        description: "List all short-term memories for a project",
        mimeType: "application/json"
    },
    {
        uri: "memory:///{userId}/{projectId}/workflows",
        name: "Project Workflows",
        description: "List all workflows in a project",
        mimeType: "application/json"
    },
    {
        uri: "memory:///{userId}/{projectId}/task/{taskId}",
        name: "Task Detail",
        description: "Get detailed information about a specific task",
        mimeType: "application/json"
    },
    {
        uri: "memory:///{userId}/{projectId}/entity/{entityId}",
        name: "Entity Detail",
        description: "Get detailed information about a specific entity",
        mimeType: "application/json"
    },
    {
        uri: "memory:///{userId}/{projectId}/workflow/{workflowId}",
        name: "Workflow Detail",
        description: "Get detailed information about a specific workflow",
        mimeType: "application/json"
    }
];

export const getResources = async () => {
    return {
        resources: resourceTemplates.map(r => ({
            uri: r.uri,
            name: r.name,
            description: r.description,
            mimeType: r.mimeType
        })),
        resourceTemplates: resourceTemplates.map(r => ({
            uriTemplate: r.uri,
            name: r.name,
            description: r.description,
            mimeType: r.mimeType
        }))
    };
};

export const readResource = async (uri: string) => {
    const url = new URL(uri);
    const pathParts = url.pathname.split("/").filter(Boolean);
    
    // Parse URI pattern: memory:///{userId}/{projectId}/...
    if (url.protocol !== "memory:") {
        throw new Error("Invalid resource protocol");
    }
    
    const userId = decodeURIComponent(url.searchParams.get("userId") || "");
    const projectId = decodeURIComponent(url.searchParams.get("projectId") || "");
    const taskId = decodeURIComponent(url.searchParams.get("taskId") || "");
    const entityId = decodeURIComponent(url.searchParams.get("entityId") || "");
    const workflowId = decodeURIComponent(url.searchParams.get("workflowId") || "");
    
    let content: any = null;
    
    // Route based on path
    if (pathParts.length === 2 && pathParts[1] === "projects") {
        if (!userId) throw new Error("userId required");
        content = listProjects(userId);
    } else if (pathParts.length === 3 && pathParts[2] === "tasks") {
        if (!userId || !projectId) throw new Error("userId and projectId required");
        content = listTasks(projectId, userId);
    } else if (pathParts.length === 3 && pathParts[2] === "entities") {
        if (!userId || !projectId) throw new Error("userId and projectId required");
        content = listEntities(userId, projectId);
    } else if (pathParts.length === 3 && pathParts[2] === "relations") {
        if (!userId || !projectId) throw new Error("userId and projectId required");
        content = getRelations(userId, projectId);
    } else if (pathParts.length === 3 && pathParts[2] === "memories") {
        if (!userId || !projectId) throw new Error("userId and projectId required");
        content = listShortTermMemory(userId, projectId);
    } else if (pathParts.length === 3 && pathParts[2] === "workflows") {
        if (!userId || !projectId) throw new Error("userId and projectId required");
        content = listWorkflows(projectId, userId);
    } else if (pathParts[3] === "task" && taskId) {
        content = getTask(taskId);
    } else if (pathParts[3] === "entity" && entityId) {
        content = getEntity(entityId);
    } else if (pathParts[3] === "workflow" && workflowId) {
        content = getWorkflow(workflowId);
    } else {
        throw new Error("Unknown resource path");
    }
    
    return {
        contents: [{
            uri,
            mimeType: "application/json",
            text: JSON.stringify(content, null, 2)
        }]
    };
};