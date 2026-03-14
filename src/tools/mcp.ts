import {
    createProject, updateProject, getProject, listProjects,
    createTask, updateTask, deleteTask, getTask, listTasks,
    createWorkflow, updateWorkflow, getWorkflow, listWorkflows,
    addKeypoint, addComment, addNote, addDiscovery,
    logMistake, addLearning, addTaskBoundary,
    registerTool, searchTools, addToolSchema, getToolSchema,
    storeEmbedding, searchEmbeddings
} from "../db/sqlite.js";

const baseSchema = {
    userId: z.string(),
    projectId: z.string().optional()
};

import { z } from "zod";

export const mcpTools = [
    // Project Operations
    {
        name: "create_project",
        description: "Create a new project to organize related work.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                name: { type: "string", description: "Project name" },
                description: { type: "string", description: "Project description" },
                metadata: { type: "object", description: "Additional metadata as JSON" }
            },
            required: ["userId", "name"],
        },
        handler: async (args: any) => {
            try {
                const { userId, name, description = '', metadata = {} } = args;
                const project = createProject(userId, name, description, metadata);
                return { content: [{ type: "text", text: `Project created: ${JSON.stringify(project)}` }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "update_project",
        description: "Update an existing project's name, description, or metadata.",
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "Project ID" },
                name: { type: "string", description: "New project name" },
                description: { type: "string", description: "New project description" },
                metadata: { type: "object", description: "Updated metadata" }
            },
            required: ["id"],
        },
        handler: async (args: any) => {
            try {
                const { id, ...updates } = args;
                const project = updateProject(id, updates);
                return { content: [{ type: "text", text: project ? `Project updated: ${JSON.stringify(project)}` : "Project not found" }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "get_project",
        description: "Get details of a specific project by ID.",
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "Project ID" }
            },
            required: ["id"],
        },
        handler: async (args: any) => {
            try {
                const project = getProject(args.id);
                return { content: [{ type: "text", text: project ? JSON.stringify(project, null, 2) : "Project not found" }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "list_projects",
        description: "List all projects for a user.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" }
            },
            required: ["userId"],
        },
        handler: async (args: any) => {
            try {
                const projects = listProjects(args.userId);
                return { content: [{ type: "text", text: JSON.stringify(projects, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },

    // Task Operations (with todo/completed status)
    {
        name: "create_task",
        description: "Create a new task with optional sub-todos.",
        inputSchema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "Project ID" },
                userId: { type: "string", description: "User ID" },
                title: { type: "string", description: "Task title" },
                description: { type: "string", description: "Task description" },
                status: { type: "string", description: "Status: pending, in_progress, completed", default: "pending" },
                priority: { type: "string", description: "Priority: low, medium, high", default: "medium" },
                todos: { type: "array", description: "Array of todos: [{text: string, status: 'pending'|'completed'}]" },
                metadata: { type: "object", description: "Additional metadata" }
            },
            required: ["projectId", "userId", "title"],
        },
        handler: async (args: any) => {
            try {
                const { projectId, userId, title, description = '', status = 'pending', priority = 'medium', todos = [], metadata = {} } = args;
                const task = createTask(projectId, userId, title, description, status, priority, todos, metadata);
                return { content: [{ type: "text", text: `Task created: ${JSON.stringify(task)}` }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "update_task",
        description: "Update a task including marking as completed or updating todos.",
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "Task ID" },
                title: { type: "string", description: "New title" },
                description: { type: "string", description: "New description" },
                status: { type: "string", description: "Status: pending, in_progress, completed" },
                priority: { type: "string", description: "Priority: low, medium, high" },
                todos: { type: "array", description: "Array of todos: [{text, status}]" },
                metadata: { type: "object", description: "Updated metadata" }
            },
            required: ["id"],
        },
        handler: async (args: any) => {
            try {
                const { id, ...updates } = args;
                const task = updateTask(id, updates);
                return { content: [{ type: "text", text: task ? `Task updated: ${JSON.stringify(task)}` : "Task not found" }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "add_todo_to_task",
        description: "Add a sub-todo to a task.",
        inputSchema: {
            type: "object",
            properties: {
                taskId: { type: "string", description: "Task ID" },
                text: { type: "string", description: "Todo text" },
                status: { type: "string", description: "Status: pending, completed", default: "pending" }
            },
            required: ["taskId", "text"],
        },
        handler: async (args: any) => {
            try {
                const task = getTask(args.taskId);
                if (!task) return { isError: true, content: [{ type: "text", text: "Task not found" }] };
                const todos = task.todos || [];
                todos.push({ text: args.text, status: args.status || 'pending' });
                const updated = updateTask(args.taskId, { todos });
                return { content: [{ type: "text", text: `Todo added: ${JSON.stringify(updated?.todos)}` }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "complete_todo",
        description: "Mark a specific sub-todo as completed.",
        inputSchema: {
            type: "object",
            properties: {
                taskId: { type: "string", description: "Task ID" },
                todoIndex: { type: "number", description: "Index of the todo to mark complete (0-based)" }
            },
            required: ["taskId", "todoIndex"],
        },
        handler: async (args: any) => {
            try {
                const task = getTask(args.taskId);
                if (!task) return { isError: true, content: [{ type: "text", text: "Task not found" }] };
                const todos = task.todos || [];
                if (todos[args.todoIndex]) {
                    todos[args.todoIndex].status = 'completed';
                    updateTask(args.taskId, { todos });
                    return { content: [{ type: "text", text: `Todo marked as completed` }] };
                }
                return { isError: true, content: [{ type: "text", text: "Todo index not found" }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "complete_task",
        description: "Mark a task as completed.",
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "Task ID" }
            },
            required: ["id"],
        },
        handler: async (args: any) => {
            try {
                const task = updateTask(args.id, { status: 'completed' });
                return { content: [{ type: "text", text: task ? `Task marked as completed: ${task.title}` : "Task not found" }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "delete_task",
        description: "Delete a task by ID.",
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "Task ID" }
            },
            required: ["id"],
        },
        handler: async (args: any) => {
            try {
                deleteTask(args.id);
                return { content: [{ type: "text", text: "Task deleted" }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "get_task",
        description: "Get details of a specific task.",
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "Task ID" }
            },
            required: ["id"],
        },
        handler: async (args: any) => {
            try {
                const task = getTask(args.id);
                return { content: [{ type: "text", text: task ? JSON.stringify(task, null, 2) : "Task not found" }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "list_tasks",
        description: "List tasks in a project with optional filtering.",
        inputSchema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "Project ID" },
                userId: { type: "string", description: "User ID" },
                status: { type: "string", description: "Filter by status" }
            },
            required: ["projectId"],
        },
        handler: async (args: any) => {
            try {
                const { projectId, userId, status } = args;
                const tasks = listTasks(projectId, userId, status);
                return { content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },

    // Workflow Operations
    {
        name: "create_workflow",
        description: "Create a multi-step workflow.",
        inputSchema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "Project ID" },
                userId: { type: "string", description: "User ID" },
                name: { type: "string", description: "Workflow name" },
                steps: { type: "array", description: "Array of workflow steps" },
                status: { type: "string", description: "Status: active, paused, completed" }
            },
            required: ["projectId", "userId", "name"],
        },
        handler: async (args: any) => {
            try {
                const { projectId, userId, name, steps = [], status = 'active' } = args;
                const workflow = createWorkflow(projectId, userId, name, steps, status);
                return { content: [{ type: "text", text: `Workflow created: ${JSON.stringify(workflow)}` }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "update_workflow",
        description: "Update workflow steps or status.",
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "Workflow ID" },
                name: { type: "string", description: "New name" },
                steps: { type: "array", description: "Updated steps" },
                status: { type: "string", description: "New status" }
            },
            required: ["id"],
        },
        handler: async (args: any) => {
            try {
                const { id, ...updates } = args;
                const workflow = updateWorkflow(id, updates);
                return { content: [{ type: "text", text: workflow ? `Workflow updated: ${JSON.stringify(workflow)}` : "Workflow not found" }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "get_workflow",
        description: "Get workflow details.",
        inputSchema: {
            type: "object",
            properties: {
                id: { type: "string", description: "Workflow ID" }
            },
            required: ["id"],
        },
        handler: async (args: any) => {
            try {
                const workflow = getWorkflow(args.id);
                return { content: [{ type: "text", text: workflow ? JSON.stringify(workflow, null, 2) : "Workflow not found" }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "list_workflows",
        description: "List workflows in a project.",
        inputSchema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "Project ID" },
                userId: { type: "string", description: "User ID" }
            },
            required: ["projectId"],
        },
        handler: async (args: any) => {
            try {
                const { projectId, userId } = args;
                const workflows = listWorkflows(projectId, userId);
                return { content: [{ type: "text", text: JSON.stringify(workflows, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },

    // Knowledge Operations
    {
        name: "add_keypoint",
        description: "Add an important keypoint or highlight.",
        inputSchema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "Project ID" },
                taskId: { type: "string", description: "Task ID (optional)" },
                userId: { type: "string", description: "User ID" },
                content: { type: "string", description: "Keypoint content" },
                metadata: { type: "object", description: "Additional metadata" }
            },
            required: ["userId", "content"],
        },
        handler: async (args: any) => {
            try {
                const { projectId = null, taskId = null, userId, content, metadata = {} } = args;
                const keypoint = addKeypoint(projectId, taskId, userId, content, metadata);
                return { content: [{ type: "text", text: `Keypoint added: ${JSON.stringify(keypoint)}` }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "add_comment",
        description: "Add a comment to a task or project.",
        inputSchema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "Project ID" },
                taskId: { type: "string", description: "Task ID (optional)" },
                userId: { type: "string", description: "User ID" },
                content: { type: "string", description: "Comment content" },
                metadata: { type: "object", description: "Additional metadata" }
            },
            required: ["userId", "content"],
        },
        handler: async (args: any) => {
            try {
                const { projectId = null, taskId = null, userId, content, metadata = {} } = args;
                const comment = addComment(projectId, taskId, userId, content, metadata);
                return { content: [{ type: "text", text: `Comment added: ${JSON.stringify(comment)}` }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "add_note",
        description: "Add a general note.",
        inputSchema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "Project ID (optional)" },
                userId: { type: "string", description: "User ID" },
                content: { type: "string", description: "Note content" },
                metadata: { type: "object", description: "Additional metadata" }
            },
            required: ["userId", "content"],
        },
        handler: async (args: any) => {
            try {
                const { projectId = null, userId, content, metadata = {} } = args;
                const note = addNote(projectId, userId, content, metadata);
                return { content: [{ type: "text", text: `Note added: ${JSON.stringify(note)}` }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "add_discovery",
        description: "Record a new discovery or finding.",
        inputSchema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "Project ID (optional)" },
                userId: { type: "string", description: "User ID" },
                description: { type: "string", description: "Discovery description" },
                metadata: { type: "object", description: "Additional metadata" }
            },
            required: ["userId", "description"],
        },
        handler: async (args: any) => {
            try {
                const { projectId = null, userId, description, metadata = {} } = args;
                const discovery = addDiscovery(projectId, userId, description, metadata);
                return { content: [{ type: "text", text: `Discovery added: ${JSON.stringify(discovery)}` }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },

    // Learning and Issue Tracking
    {
        name: "log_mistake",
        description: "Log a mistake or failure to learn from.",
        inputSchema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "Project ID (optional)" },
                taskId: { type: "string", description: "Task ID (optional)" },
                userId: { type: "string", description: "User ID" },
                description: { type: "string", description: "What went wrong" },
                resolution: { type: "string", description: "How it was resolved" },
                metadata: { type: "object", description: "Additional metadata" }
            },
            required: ["userId", "description"],
        },
        handler: async (args: any) => {
            try {
                const { projectId = null, taskId = null, userId, description, resolution = '', metadata = {} } = args;
                const mistake = logMistake(projectId, taskId, userId, description, resolution, metadata);
                return { content: [{ type: "text", text: `Mistake logged: ${JSON.stringify(mistake)}` }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "add_learning",
        description: "Add a lesson learned or insight.",
        inputSchema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "Project ID (optional)" },
                taskId: { type: "string", description: "Task ID (optional)" },
                userId: { type: "string", description: "User ID" },
                insight: { type: "string", description: "The insight or lesson" },
                metadata: { type: "object", description: "Additional metadata" }
            },
            required: ["userId", "insight"],
        },
        handler: async (args: any) => {
            try {
                const { projectId = null, taskId = null, userId, insight, metadata = {} } = args;
                const learning = addLearning(projectId, taskId, userId, insight, metadata);
                return { content: [{ type: "text", text: `Learning added: ${JSON.stringify(learning)}` }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "add_task_boundary",
        description: "Define a scope boundary for a task.",
        inputSchema: {
            type: "object",
            properties: {
                taskId: { type: "string", description: "Task ID" },
                userId: { type: "string", description: "User ID" },
                boundary: { type: "string", description: "Boundary description" },
                metadata: { type: "object", description: "Additional metadata" }
            },
            required: ["taskId", "userId", "boundary"],
        },
        handler: async (args: any) => {
            try {
                const { taskId, userId, boundary, metadata = {} } = args;
                const tb = addTaskBoundary(taskId, userId, boundary, metadata);
                return { content: [{ type: "text", text: `Task boundary added: ${JSON.stringify(tb)}` }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },

    // Tool Registry
    {
        name: "register_tool",
        description: "Register a new tool in the registry.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                name: { type: "string", description: "Tool name" },
                description: { type: "string", description: "Tool description" },
                metadata: { type: "object", description: "Additional metadata" }
            },
            required: ["userId", "name"],
        },
        handler: async (args: any) => {
            try {
                const { userId, name, description = '', metadata = {} } = args;
                const tool = registerTool(userId, name, description, metadata);
                return { content: [{ type: "text", text: `Tool registered: ${JSON.stringify(tool)}` }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "search_tools",
        description: "Search registered tools by keyword.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                query: { type: "string", description: "Search query" }
            },
            required: ["userId", "query"],
        },
        handler: async (args: any) => {
            try {
                const { userId, query } = args;
                const tools = searchTools(userId, query);
                return { content: [{ type: "text", text: JSON.stringify(tools, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "add_tool_schema",
        description: "Add a schema definition for a tool.",
        inputSchema: {
            type: "object",
            properties: {
                toolId: { type: "string", description: "Tool ID" },
                userId: { type: "string", description: "User ID" },
                schema: { type: "object", description: "Tool schema definition" }
            },
            required: ["toolId", "userId", "schema"],
        },
        handler: async (args: any) => {
            try {
                const { toolId, userId, schema } = args;
                const toolSchema = addToolSchema(toolId, userId, schema);
                return { content: [{ type: "text", text: `Tool schema added: ${JSON.stringify(toolSchema)}` }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "get_tool_schema",
        description: "Get schema for a specific tool.",
        inputSchema: {
            type: "object",
            properties: {
                toolId: { type: "string", description: "Tool ID" }
            },
            required: ["toolId"],
        },
        handler: async (args: any) => {
            try {
                const schemas = getToolSchema(args.toolId);
                return { content: [{ type: "text", text: JSON.stringify(schemas, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },

    // Semantic Search
    {
        name: "store_embedding",
        description: "Store content with its embedding for semantic search.",
        inputSchema: {
            type: "object",
            properties: {
                refTable: { type: "string", description: "Reference table name" },
                refId: { type: "string", description: "Reference ID" },
                userId: { type: "string", description: "User ID" },
                content: { type: "string", description: "Content to embed" }
            },
            required: ["refTable", "refId", "userId", "content"],
        },
        handler: async (args: any) => {
            try {
                const { refTable, refId, userId, content } = args;
                const result = await storeEmbedding(refTable, refId, userId, content);
                return { content: [{ type: "text", text: `Embedding stored: ${JSON.stringify(result)}` }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
    {
        name: "search_embeddings",
        description: "Semantic search across stored embeddings.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                query: { type: "string", description: "Search query" },
                refTable: { type: "string", description: "Optional table filter" },
                limit: { type: "number", description: "Max results", default: 10 }
            },
            required: ["userId", "query"],
        },
        handler: async (args: any) => {
            try {
                const { userId, query, refTable, limit = 10 } = args;
                const results = await searchEmbeddings(userId, query, refTable, limit);
                return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        },
    },
];