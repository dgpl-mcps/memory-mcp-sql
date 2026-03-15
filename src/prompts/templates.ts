import { z } from "zod";
import { searchShortTermMemoryVector } from "../db/sqlite.js";

export interface PromptArgument {
    name: string;
    description: string;
    required: boolean;
    schema?: z.ZodTypeAny;
}

export interface PromptTemplate {
    name: string;
    description: string;
    arguments: PromptArgument[];
    generate: (args: Record<string, any>) => Promise<{
        messages: Array<{
            role: "user" | "assistant";
            content: {
                type: "text";
                text: string;
            };
        }>;
    }>;
}

export const promptTemplates: PromptTemplate[] = [
    {
        name: "project_summary",
        description: "Get a comprehensive summary of a project including tasks, entities, and recent activity",
        arguments: [
            { name: "userId", description: "User ID", required: true, schema: z.string() },
            { name: "projectId", description: "Project ID", required: true, schema: z.string() },
            { name: "focus", description: "Focus area: tasks, entities, relations, or all", required: false, schema: z.string().default("all") }
        ],
        generate: async (args) => {
            const { listEntities, getRelations, listTasks } = await import("../db/sqlite.js");
            const { userId, projectId, focus = "all" } = args;
            
            let content = `# Project Summary: ${projectId}\n\n`;
            
            if (focus === "all" || focus === "tasks") {
                const tasks = listTasks(projectId, userId);
                const pending = tasks.filter((t: any) => t.status === "pending").length;
                const completed = tasks.filter((t: any) => t.status === "completed").length;
                content += `## Tasks\n- Total: ${tasks.length}\n- Pending: ${pending}\n- Completed: ${completed}\n\n`;
            }
            
            if (focus === "all" || focus === "entities") {
                const entities = listEntities(userId, projectId);
                const byType: Record<string, number> = {};
                entities.forEach((e: any) => {
                    byType[e.entityType] = (byType[e.entityType] || 0) + 1;
                });
                content += `## Entities\n`;
                Object.entries(byType).forEach(([type, count]) => {
                    content += `- ${type}: ${count}\n`;
                });
                content += "\n";
            }
            
            if (focus === "all" || focus === "relations") {
                const relations = getRelations(userId, projectId);
                const byType: Record<string, number> = {};
                relations.forEach((r: any) => {
                    byType[r.relationType] = (byType[r.relationType] || 0) + 1;
                });
                content += `## Relations\n`;
                Object.entries(byType).forEach(([type, count]) => {
                    content += `- ${type}: ${count}\n`;
                });
            }
            
            return {
                messages: [{
                    role: "user",
                    content: { type: "text", text: content }
                }]
            };
        }
    },
    {
        name: "task_breakdown",
        description: "Break down a goal into actionable sub-tasks based on project context",
        arguments: [
            { name: "userId", description: "User ID", required: true, schema: z.string() },
            { name: "projectId", description: "Project ID", required: true, schema: z.string() },
            { name: "goal", description: "The goal or high-level task to break down", required: true, schema: z.string() },
            { name: "context", description: "Additional context about the project", required: false, schema: z.string() }
        ],
        generate: async (args) => {
            const { listTasks, listEntities, getRelations } = await import("../db/sqlite.js");
            const { userId, projectId, goal, context = "" } = args;
            
            const tasks = listTasks(projectId, userId);
            const entities = listEntities(userId, projectId);
            const relations = getRelations(userId, projectId);
            
            let content = `# Task Breakdown for: ${goal}\n\n`;
            content += `## Project Context\n`;
            content += `- Total Tasks: ${tasks.length}\n`;
            content += `- Total Entities: ${entities.length}\n`;
            content += `- Total Relations: ${relations.length}\n\n`;
            
            if (context) {
                content += `## Additional Context\n${context}\n\n`;
            }
            
            content += `## Suggested Sub-tasks\n`;
            content += `Based on the project structure, here are suggested steps:\n\n`;
            content += `1. **Analyze Requirements** - Break down the goal into specific requirements\n`;
            content += `2. **Identify Dependencies** - Determine what other entities or tasks are needed\n`;
            content += `3. **Plan Implementation** - Create a step-by-step execution plan\n`;
            content += `4. **Define Success Criteria** - Establish how completion will be measured\n`;
            content += `5. **Allocate Resources** - Assign entities and define boundaries\n`;
            
            return {
                messages: [{
                    role: "user",
                    content: { type: "text", text: content }
                }]
            };
        }
    },
    {
        name: "knowledge_graph_explore",
        description: "Explore the knowledge graph to find related entities and dependencies",
        arguments: [
            { name: "userId", description: "User ID", required: true, schema: z.string() },
            { name: "projectId", description: "Project ID", required: true, schema: z.string() },
            { name: "entityId", description: "Starting entity ID", required: true, schema: z.string() },
            { name: "depth", description: "Search depth (1-3)", required: false, schema: z.number().default(2) }
        ],
        generate: async (args) => {
            const { getEntity, getRelations, getEntity: fetchEntity } = await import("../db/sqlite.js");
            const { userId, projectId, entityId, depth = 2 } = args;
            
            const startEntity = getEntity(entityId);
            if (!startEntity || startEntity.userId !== userId) {
                return {
                    messages: [{
                        role: "user",
                        content: { type: "text", text: "Entity not found or access denied." }
                    }]
                };
            }
            
            let content = `# Knowledge Graph Exploration\n\n`;
            content += `## Starting Entity\n`;
            content += `- **Name**: ${startEntity.name}\n`;
            content += `- **Type**: ${startEntity.entityType}\n`;
            content += `- **ID**: ${startEntity.id}\n\n`;
            
            const visited = new Set<string>();
            const queue: { id: string; currentDepth: number }[] = [{ id: entityId, currentDepth: 0 }];
            
            while (queue.length > 0) {
                const { id, currentDepth } = queue.shift()!;
                if (visited.has(id) || currentDepth > depth) continue;
                visited.add(id);
                
                const outRelations = getRelations(userId, projectId, id);
                const inRelations = getRelations(userId, projectId, undefined, id);
                
                if (currentDepth > 0) {
                    content += `## Depth ${currentDepth}\n`;
                }
                
                if (outRelations.length > 0) {
                    content += `### Outgoing Relations (${outRelations.length})\n`;
                    outRelations.forEach((r: any) => {
                        const target = fetchEntity(r.toId);
                        content += `- ${r.relationType} → ${target?.name || r.toId}\n`;
                        if (currentDepth < depth) {
                            queue.push({ id: r.toId, currentDepth: currentDepth + 1 });
                        }
                    });
                }
                
                if (inRelations.length > 0) {
                    content += `### Incoming Relations (${inRelations.length})\n`;
                    inRelations.forEach((r: any) => {
                        const source = fetchEntity(r.fromId);
                        content += `- ${r.relationType} ← ${source?.name || r.fromId}\n`;
                        if (currentDepth < depth) {
                            queue.push({ id: r.fromId, currentDepth: currentDepth + 1 });
                        }
                    });
                }
                content += "\n";
            }
            
            return {
                messages: [{
                    role: "user",
                    content: { type: "text", text: content }
                }]
            };
        }
    },
    {
        name: "context_retrieval",
        description: "Retrieve relevant context from memory for a specific topic or query",
        arguments: [
            { name: "userId", description: "User ID", required: true, schema: z.string() },
            { name: "projectId", description: "Project ID", required: true, schema: z.string() },
            { name: "query", description: "What to find context for", required: true, schema: z.string() },
            { name: "source", description: "Source types to search: entities, tasks, memories, all", required: false, schema: z.string().default("all") }
        ],
        generate: async (args) => {
            const { listEntities, listTasks, getShortTermMemory, searchShortTermMemory } = await import("../db/sqlite.js");
            const { userId, projectId, query, source = "all" } = args;
            
            let content = `# Context Retrieval: "${query}"\n\n`;
            let foundAnything = false;
            
            if (source === "all" || source === "entities") {
                const entities = listEntities(userId, projectId);
                const matched = entities.filter((e: any) => 
                    e.name.toLowerCase().includes(query.toLowerCase()) ||
                    JSON.stringify(e.properties).toLowerCase().includes(query.toLowerCase())
                );
                if (matched.length > 0) {
                    foundAnything = true;
                    content += `## Matching Entities (${matched.length})\n`;
                    matched.slice(0, 5).forEach((e: any) => {
                        content += `- **${e.name}** (${e.entityType})\n`;
                    });
                    content += "\n";
                }
            }
            
            if (source === "all" || source === "tasks") {
                const tasks = listTasks(projectId, userId);
                const matched = tasks.filter((t: any) =>
                    t.title.toLowerCase().includes(query.toLowerCase()) ||
                    t.description?.toLowerCase().includes(query.toLowerCase())
                );
                if (matched.length > 0) {
                    foundAnything = true;
                    content += `## Matching Tasks (${matched.length})\n`;
                    matched.slice(0, 5).forEach((t: any) => {
                        content += `- **${t.title}** [${t.status}]\n`;
                    });
                    content += "\n";
                }
            }
            
            if (source === "all" || source === "memories") {
                try {
                    const memories = await searchShortTermMemoryVector(userId, projectId, query, 5);
                    if (memories.length > 0) {
                        foundAnything = true;
                        content += `## Relevant Memories\n`;
                        memories.forEach((m: any) => {
                            content += `- ${m.key}: ${JSON.stringify(m.value).slice(0, 100)}...\n`;
                        });
                    }
                } catch (e) {
                    // Search might fail if vector search not configured
                }
            }
            
            if (!foundAnything) {
                content += "No relevant context found. Try a broader query or different source.";
            }
            
            return {
                messages: [{
                    role: "user",
                    content: { type: "text", text: content }
                }]
            };
        }
    },
    {
        name: "self_reflection_prompt",
        description: "Guide the agent through self-reflection on recent work and improvements",
        arguments: [
            { name: "userId", description: "User ID", required: true, schema: z.string() },
            { name: "projectId", description: "Project ID", required: true, schema: z.string() },
            { name: "taskId", description: "Task ID to reflect on (optional)", required: false, schema: z.string() }
        ],
        generate: async (args) => {
            const { getTask, listTasks, getRelations } = await import("../db/sqlite.js");
            const { userId, projectId, taskId } = args;
            
            let content = `# Self-Reflection\n\n`;
            content += `Please reflect on your recent work in this project.\n\n`;
            
            if (taskId) {
                const task = getTask(taskId);
                if (task) {
                    content += `## Current Task: ${task.title}\n`;
                    content += `- Status: ${task.status}\n`;
                    content += `- Description: ${task.description || "N/A"}\n\n`;
                }
            } else {
                const recentTasks = listTasks(projectId, userId).slice(0, 5);
                content += `## Recent Tasks\n`;
                recentTasks.forEach((t: any) => {
                    content += `- ${t.title} [${t.status}]\n`;
                });
                content += "\n";
            }
            
            content += `## Reflection Questions\n`;
            content += `1. What went well in this work?\n`;
            content += `2. What could have been done better?\n`;
            content += `3. What did you learn from this task?\n`;
            content += `4. How can you apply these learnings to future work?\n`;
            content += `5. Are there any recurring patterns you'd like to address?\n\n`;
            
            content += `After reflecting, use the self-improvement tools to log your evaluation.`;
            
            return {
                messages: [{
                    role: "user",
                    content: { type: "text", text: content }
                }]
            };
        }
    },
    {
        name: "planning_assistant",
        description: "Help plan multi-step workflows with awareness of existing dependencies",
        arguments: [
            { name: "userId", description: "User ID", required: true, schema: z.string() },
            { name: "projectId", description: "Project ID", required: true, schema: z.string() },
            { name: "objective", description: "The objective to plan for", required: true, schema: z.string() },
            { name: "constraints", description: "Any constraints or requirements", required: false, schema: z.string() }
        ],
        generate: async (args) => {
            const { listTasks, listEntities, getRelations, createEntity, createRelation } = await import("../db/sqlite.js");
            const { userId, projectId, objective, constraints = "" } = args;
            
            const tasks = listTasks(projectId, userId);
            const entities = listEntities(userId, projectId);
            const relations = getRelations(userId, projectId);
            
            let content = `# Planning Assistant: ${objective}\n\n`;
            
            if (constraints) {
                content += `## Constraints\n${constraints}\n\n`;
            }
            
            content += `## Project Status\n`;
            content += `- Active Tasks: ${tasks.filter((t: any) => t.status !== "completed").length}\n`;
            content += `- Completed Tasks: ${tasks.filter((t: any) => t.status === "completed").length}\n`;
            content += `- Total Entities: ${entities.length}\n`;
            content += `- Relations: ${relations.length}\n\n`;
            
            content += `## Planning Steps\n`;
            content += `Based on the current project state, here's a suggested approach:\n\n`;
            content += `1. **Define the Plan** - Create a new workflow entity to track this objective\n`;
            content += `2. **Break into Tasks** - Create task entities with clear dependencies\n`;
            content += `3. **Establish Relations** - Link tasks using SUBTASK_OF, DEPENDS_ON relations\n`;
            content += `4. **Set Milestones** - Define keypoints to track progress\n`;
            content += `5. **Allocate Resources** - Use entity properties to track requirements\n\n`;
            
            content += `## Recommendation\n`;
            content += `Use the graph tools to create a structured plan:\n`;
            content += `- create_entity to create a planning entity\n`;
            content += `- create_relation to establish dependencies\n`;
            content += `- plan_task to create individual tasks\n`;
            
            return {
                messages: [{
                    role: "user",
                    content: { type: "text", text: content }
                }]
            };
        }
    },
    {
        name: "progress_review",
        description: "Review project progress including timeline, completed items, and upcoming tasks",
        arguments: [
            { name: "userId", description: "User ID", required: true, schema: z.string() },
            { name: "projectId", description: "Project ID", required: true, schema: z.string() },
            { name: "period", description: "Time period: week, month, all", required: false, schema: z.string().default("all") }
        ],
        generate: async (args) => {
            const { listTasks, listEntities, getRelations } = await import("../db/sqlite.js");
            const { userId, projectId, period = "all" } = args;
            
            const tasks = listTasks(projectId, userId);
            const entities = listEntities(userId, projectId);
            
            const completedTasks = tasks.filter((t: any) => t.status === "completed");
            const pendingTasks = tasks.filter((t: any) => t.status === "pending");
            const inProgressTasks = tasks.filter((t: any) => t.status === "in_progress");
            
            const completionRate = tasks.length > 0 
                ? Math.round((completedTasks.length / tasks.length) * 100) 
                : 0;
            
            let content = `# Project Progress Review: ${projectId}\n\n`;
            content += `## Overview\n`;
            content += `- Total Tasks: ${tasks.length}\n`;
            content += `- Completion Rate: ${completionRate}%\n\n`;
            
            content += `## Task Status\n`;
            content += `- ✅ Completed: ${completedTasks.length}\n`;
            content += `- 🔄 In Progress: ${inProgressTasks.length}\n`;
            content += `- ⏳ Pending: ${pendingTasks.length}\n\n`;
            
            if (completedTasks.length > 0) {
                content += `## Recently Completed\n`;
                completedTasks.slice(0, 3).forEach((t: any) => {
                    content += `- ${t.title}\n`;
                });
                content += "\n";
            }
            
            if (inProgressTasks.length > 0) {
                content += `## In Progress\n`;
                inProgressTasks.slice(0, 3).forEach((t: any) => {
                    content += `- ${t.title}\n`;
                });
                content += "\n";
            }
            
            const entityTypes = [...new Set(entities.map((e: any) => e.entityType))];
            content += `## Entity Types\n`;
            entityTypes.forEach((type: any) => {
                const count = entities.filter((e: any) => e.entityType === type).length;
                content += `- ${type}: ${count}\n`;
            });
            
            return {
                messages: [{
                    role: "user",
                    content: { type: "text", text: content }
                }]
            };
        }
    },
    {
        name: "memory_recall",
        description: "Search and retrieve relevant memories, learnings, and past experiences",
        arguments: [
            { name: "userId", description: "User ID", required: true, schema: z.string() },
            { name: "projectId", description: "Project ID", required: true, schema: z.string() },
            { name: "topic", description: "Topic to recall", required: true, schema: z.string() }
        ],
        generate: async (args) => {
            const { addLearning, addNote, searchEmbeddings } = await import("../db/sqlite.js");
            const { userId, projectId, topic } = args;
            
            let content = `# Memory Recall: ${topic}\n\n`;
            content += `Searching for relevant memories and learnings related to "${topic}"...\n\n`;
            
            // Try semantic search if available
            try {
                const results = await searchEmbeddings(userId, topic, undefined, 5);
                if (results.length > 0) {
                    content += `## Semantic Matches\n`;
                    results.forEach((r: any) => {
                        content += `- ${r.content.slice(0, 150)}...\n\n`;
                    });
                } else {
                    content += `No semantic matches found.\n\n`;
                }
            } catch (e) {
                content += `Semantic search not available. Using direct matching.\n\n`;
            }
            
            content += `## How to Use These Memories\n`;
            content += `- Review the matched content above\n`;
            content += `- Use remember_learning to capture new insights\n`;
            content += `- Use remember_note to save important findings\n`;
            content += `- Link related entities using create_relation`;
            
            return {
                messages: [{
                    role: "user",
                    content: { type: "text", text: content }
                }]
            };
        }
    }
];

export const getPromptTemplate = (name: string): PromptTemplate | undefined => {
    return promptTemplates.find(p => p.name === name);
};

// Additional Self-Improvement Prompts (injected dynamically)
export const selfImprovementPrompts: PromptTemplate[] = [
    {
        name: "self_evaluation",
        description: "Conduct a self-evaluation after completing a task - assess what went well, what could improve, and lessons learned",
        arguments: [
            { name: "userId", description: "User ID", required: true, schema: z.string() },
            { name: "projectId", description: "Project ID", required: true, schema: z.string() },
            { name: "taskId", description: "Task ID just completed", required: false, schema: z.string() },
            { name: "taskDescription", description: "Description of what was accomplished", required: true, schema: z.string() }
        ],
        generate: async (args) => {
            const { getTask, getUserReflections, analyzeMistakePatterns, getAverageRating } = await import("../db/sqlite.js");
            const { userId, projectId, taskId, taskDescription } = args;
            
            let content = `# Self-Evaluation: ${taskDescription}\n\n`;
            
            if (taskId) {
                const task = getTask(taskId);
                if (task) {
                    content += `## Task Context\n- **Title**: ${task.title}\n- **Status**: ${task.status}\n- **Description**: ${task.description || "N/A"}\n\n`;
                }
            }
            
            // Get recent performance data
            const recentReflections = getUserReflections(userId, 5);
            const patterns = analyzeMistakePatterns(userId, 14);
            const avgRating = getAverageRating(userId, 14);
            
            content += `## Performance Snapshot (Last 14 days)\n`;
            content += `- Average Self-Rating: ${avgRating.toFixed(1)}/5\n`;
            content += `- Recent Reflections: ${recentReflections.length}\n`;
            
            if (patterns.length > 0) {
                content += `- Top Issue: ${patterns[0].type} (${patterns[0].count}x)\n`;
            }
            content += "\n";
            
            content += `## Reflection Questions\n`;
            content += `Please evaluate your work on this task:\n\n`;
            content += `1. **What went well?** - Identify specific successes\n`;
            content += `2. **What could be improved?** - List areas for growth\n`;
            content += `3. **What did you learn?** - Capture key insights\n`;
            content += `4. **Any mistakes made?** - Document errors for future prevention\n`;
            content += `5. **Rate your performance** - 1-5 scale\n\n`;
            
            content += `## Next Step\n`;
            content += `After reflecting, use the **reflect_on_task** tool to log your evaluation.\n`;
            content += `This enables continuous improvement by tracking patterns over time.`;
            
            return {
                messages: [{
                    role: "user",
                    content: { type: "text", text: content }
                }]
            };
        }
    },
    {
        name: "error_recovery_guide",
        description: "When an error occurs, guide through the recovery process and capture lessons",
        arguments: [
            { name: "userId", description: "User ID", required: true, schema: z.string() },
            { name: "projectId", description: "Project ID", required: true, schema: z.string() },
            { name: "errorDescription", description: "What went wrong", required: true, schema: z.string() },
            { name: "context", description: "Additional context about the error", required: false, schema: z.string() }
        ],
        generate: async (args) => {
            const { analyzeMistakePatterns } = await import("../db/sqlite.js");
            const { userId, projectId, errorDescription, context = "" } = args;
            
            let content = `# Error Recovery Guide\n\n`;
            content += `## Error Encountered\n${errorDescription}\n\n`;
            
            if (context) {
                content += `## Context\n${context}\n\n`;
            }
            
            // Check for similar past errors
            const patterns = analyzeMistakePatterns(userId, 30);
            const similarPatterns = patterns.filter(p => 
                errorDescription.toLowerCase().includes(p.type.toLowerCase()) ||
                p.type.toLowerCase().includes(errorDescription.toLowerCase().slice(0, 20))
            );
            
            if (similarPatterns.length > 0) {
                content += `## Similar Past Errors\n`;
                content += `This appears related to: ${similarPatterns.map(p => p.type).join(", ")}\n`;
                content += `Consider addressing this recurring pattern.\n\n`;
            }
            
            content += `## Recovery Steps\n`;
            content += `1. **Acknowledge** - Accept the error without blame\n`;
            content += `2. **Diagnose** - Identify root cause, not just symptoms\n`;
            content += `3. **Fix** - Apply the minimum necessary correction\n`;
            content += `4. **Verify** - Confirm the fix works\n`;
            content += `5. **Learn** - Document what happened and why\n\n`;
            
            content += `## After Recovery\n`;
            content += `Use **log_error_and_recover** to capture:\n`;
            content += `- What went wrong\n`;
            content += `- How you resolved it\n`;
            content += `- Lessons learned for the future\n\n`;
            
            content += `This creates a feedback loop that prevents similar errors.`;
            
            return {
                messages: [{
                    role: "user",
                    content: { type: "text", text: content }
                }]
            };
        }
    },
    {
        name: "improvement_plan",
        description: "Generate a personalized improvement plan based on your history and patterns",
        arguments: [
            { name: "userId", description: "User ID", required: true, schema: z.string() },
            { name: "projectId", description: "Project ID", required: false, schema: z.string() }
        ],
        generate: async (args) => {
            const { getUserReflections, getUserSuggestions, analyzeMistakePatterns, getAverageRating } = await import("../db/sqlite.js");
            const { userId, projectId } = args;
            
            const patterns = analyzeMistakePatterns(userId, 30);
            const avgRating = getAverageRating(userId, 30);
            const suggestions = getUserSuggestions(userId, "pending");
            const recentReflections = getUserReflections(userId, 10);
            
            let content = `# Personalized Improvement Plan\n\n`;
            
            content += `## Current Performance\n`;
            content += `- 30-day average rating: ${avgRating.toFixed(1)}/5\n`;
            content += `- Recent reflections: ${recentReflections.length}\n`;
            content += `- Pending suggestions: ${suggestions.length}\n\n`;
            
            if (patterns.length > 0) {
                content += `## Priority Issues (Based on Patterns)\n`;
                patterns.slice(0, 3).forEach(p => {
                    content += `### ${p.type} (${p.count} occurrences)\n`;
                    content += `Action: Focus on reducing this specific mistake type\n\n`;
                });
            }
            
            const improvements: string[] = [];
            recentReflections.forEach(r => {
                if (r.evaluation?.improvements) {
                    improvements.push(...r.evaluation.improvements);
                }
            });
            
            if (improvements.length > 0) {
                content += `## Common Improvement Areas\n`;
                const unique = [...new Set(improvements)].slice(0, 5);
                unique.forEach(imp => content += `- ${imp}\n`);
                content += "\n";
            }
            
            if (suggestions.length > 0) {
                content += `## Action Items\n`;
                suggestions.slice(0, 5).forEach(s => {
                    content += `- [ ] ${s.suggestion}\n`;
                });
            }
            
            content += `## Implementation\n`;
            content += `Use these tools to track progress:\n`;
            content += `- **reflect_on_task** - Log evaluations after tasks\n`;
            content += `- **analyze_mistake_patterns** - Review patterns weekly\n`;
            content += `- **suggest_self_improvement** - Get recommendations\n`;
            content += `- **dismiss_improvement_suggestion** - Mark completed items`;
            
            return {
                messages: [{
                    role: "user",
                    content: { type: "text", text: content }
                }]
            };
        }
    }
];

// Combine all prompts
export const allPrompts = [...promptTemplates, ...selfImprovementPrompts];

export const getAllPrompts = () => allPrompts;