import { z } from "zod";
import { validatePayload, baseSchema } from "./validation.js";
import {
    createReflection,
    getReflectionByTask,
    getUserReflections,
    analyzeMistakePatterns,
    getAverageRating,
    createImprovementSuggestion,
    getUserSuggestions,
    updateSuggestionStatus,
    createWorkingBuffer,
    getWorkingBuffer,
    updateWorkingBuffer,
    completeWorkingBuffer,
    abortWorkingBuffer,
    getUserWorkingBuffers
} from "../db/sqlite.js";

const baseSchemaWithProject = baseSchema.extend({
    projectId: z.string().optional()
});

export const selfImprovementTools = [
    {
        name: "reflect_on_task",
        description: "Post-task self-reflection - evaluate your own work, identify strengths, areas for improvement, and lessons learned.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID (optional)" },
                taskId: { type: "string", description: "Task ID to reflect on (optional)" },
                evaluation: { 
                    type: "object", 
                    description: "Self-evaluation with strengths, improvements, and rating (1-5)",
                    properties: {
                        strengths: { type: "array", items: { type: "string" } },
                        improvements: { type: "array", items: { type: "string" } },
                        overallRating: { type: "number", minimum: 1, maximum: 5 }
                    }
                },
                mistakes: { 
                    type: "array", 
                    description: "Mistakes or issues encountered during the task",
                    items: { type: "object" }
                },
                learnings: { 
                    type: "array", 
                    description: "Key learnings from this task",
                    items: { type: "string" }
                }
            },
            required: ["userId", "evaluation"],
        },
        handler: async (args: any) => {
            try {
                const schema = baseSchemaWithProject.extend({
                    taskId: z.string().optional(),
                    evaluation: z.object({
                        strengths: z.array(z.string()).optional(),
                        improvements: z.array(z.string()).optional(),
                        overallRating: z.number().min(1).max(5)
                    }),
                    mistakes: z.array(z.any()).default([]),
                    learnings: z.array(z.string()).default([])
                });
                const { userId, projectId, taskId, evaluation, mistakes = [], learnings = [] } = validatePayload(schema, args);
                
                const reflection = createReflection(
                    userId,
                    projectId || null,
                    taskId || null,
                    evaluation,
                    mistakes,
                    learnings,
                    evaluation.overallRating || 3
                );
                
                // Auto-suggest improvements based on the reflection
                if (evaluation.improvements && evaluation.improvements.length > 0) {
                    const suggestion = `Consider: ${evaluation.improvements.join(", ")}`;
                    createImprovementSuggestion(userId, projectId || null, suggestion, reflection.id);
                }
                
                return {
                    content: [{ type: "text", text: `Reflection created: ${reflection.id}\nRating: ${evaluation.overallRating}/5\nStrengths: ${(evaluation.strengths || []).length}\nImprovements: ${(evaluation.improvements || []).length}\nLearnings: ${learnings.length}` }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "log_error_and_recover",
        description: "Log an error or failure with context, resolution steps, and lessons learned for future improvement.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID (optional)" },
                taskId: { type: "string", description: "Task ID where error occurred (optional)" },
                errorDescription: { type: "string", description: "What went wrong" },
                resolution: { type: "string", description: "How it was resolved" },
                lessons: { type: "array", items: { type: "string" }, description: "Lessons learned from this error" },
                severity: { type: "string", enum: ["low", "medium", "high", "critical"], description: "Error severity" }
            },
            required: ["userId", "errorDescription"],
        },
        handler: async (args: any) => {
            try {
                const schema = baseSchemaWithProject.extend({
                    taskId: z.string().optional(),
                    errorDescription: z.string().min(1),
                    resolution: z.string().default(""),
                    lessons: z.array(z.string()).default([]),
                    severity: z.enum(["low", "medium", "high", "critical"]).default("medium")
                });
                const { userId, projectId, taskId, errorDescription, resolution, lessons, severity } = validatePayload(schema, args);
                
                const reflection = createReflection(
                    userId,
                    projectId || null,
                    taskId || null,
                    { errorDescription, severity, resolved: !!resolution },
                    [{ description: errorDescription, severity, resolved: !!resolution }],
                    lessons,
                    severity === "critical" ? 1 : severity === "high" ? 2 : 3
                );
                
                if (lessons.length > 0) {
                    lessons.forEach((lesson: string) => {
                        createImprovementSuggestion(
                            userId,
                            projectId || null,
                            `From error "${errorDescription.slice(0, 50)}": ${lesson}`,
                            reflection.id
                        );
                    });
                }
                
                return {
                    content: [{ type: "text", text: `Error logged and reflection created: ${reflection.id}\nSeverity: ${severity}\nLessons captured: ${lessons.length}` }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "analyze_mistake_patterns",
        description: "Analyze your mistake history to find recurring patterns and suggest areas for improvement.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                days: { type: "number", description: "Number of days to analyze (default 30)", default: 30 }
            },
            required: ["userId"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({
                    userId: z.string().min(1),
                    days: z.number().default(30)
                });
                const { userId, days } = validatePayload(schema, args);
                
                const patterns = analyzeMistakePatterns(userId, days);
                const avgRating = getAverageRating(userId, days);
                const recentReflections = getUserReflections(userId, 10);
                
                const suggestions = patterns
                    .filter(p => p.count >= 2)
                    .map(p => `Consider addressing recurring issue: ${p.type} (occurred ${p.count} times)`);
                
                let response = `# Mistake Pattern Analysis (Last ${days} days)\n\n`;
                response += `## Average Self-Rating: ${avgRating.toFixed(1)}/5\n`;
                response += `## Reflections: ${recentReflections.length}\n\n`;
                
                if (patterns.length > 0) {
                    response += `## Top Recurring Issues\n`;
                    patterns.slice(0, 5).forEach(p => {
                        response += `- ${p.type}: ${p.count} occurrences\n`;
                    });
                } else {
                    response += `No significant patterns detected.\n`;
                }
                
                if (suggestions.length > 0) {
                    response += `\n## Suggested Improvements\n`;
                    suggestions.forEach(s => response += `- ${s}\n`);
                }
                
                return {
                    content: [{ type: "text", text: response }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "suggest_self_improvement",
        description: "Generate improvement recommendations based on your reflection history and mistake patterns.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID (optional)" }
            },
            required: ["userId"],
        },
        handler: async (args: any) => {
            try {
                const schema = baseSchemaWithProject.extend({});
                const { userId, projectId } = validatePayload(schema, args);
                
                const suggestions = getUserSuggestions(userId, "pending");
                const patterns = analyzeMistakePatterns(userId, 30);
                const recentReflections = getUserReflections(userId, 5);
                
                let improvements: string[] = [];
                
                // Based on patterns
                patterns.slice(0, 3).forEach(p => {
                    if (p.count >= 2) {
                        improvements.push(`Focus on: ${p.type} (${p.count} recent occurrences)`);
                    }
                });
                
                // Based on common improvement areas from reflections
                const allImprovements: string[] = [];
                recentReflections.forEach(r => {
                    if (r.evaluation?.improvements) {
                        allImprovements.push(...r.evaluation.improvements);
                    }
                });
                
                // Count frequent improvement suggestions
                const freq: Record<string, number> = {};
                allImprovements.forEach(i => {
                    const key = i.toLowerCase().slice(0, 30);
                    freq[key] = (freq[key] || 0) + 1;
                });
                
                Object.entries(freq)
                    .filter(([_, count]) => count >= 2)
                    .forEach(([imp, _]) => {
                        improvements.push(`Repeated improvement area: ${imp}`);
                    });
                
                let response = `# Self-Improvement Recommendations\n\n`;
                
                if (suggestions.length > 0) {
                    response += `## Pending Suggestions (${suggestions.length})\n`;
                    suggestions.slice(0, 5).forEach(s => {
                        response += `- ${s.suggestion}\n`;
                    });
                }
                
                if (improvements.length > 0) {
                    response += `\n## Generated Recommendations\n`;
                    improvements.forEach(i => response += `- ${i}\n`);
                } else {
                    response += `\nNo specific recommendations at this time. Keep reflecting on your work!`;
                }
                
                return {
                    content: [{ type: "text", text: response }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "review_learnings",
        description: "Review key learnings from recent reflections to reinforce memory and future application.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                limit: { type: "number", description: "Number of recent reflections to review", default: 10 }
            },
            required: ["userId"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({
                    userId: z.string().min(1),
                    limit: z.number().default(10)
                });
                const { userId, limit } = validatePayload(schema, args);
                
                const reflections = getUserReflections(userId, limit);
                
                const allLearnings: string[] = [];
                reflections.forEach(r => {
                    if (Array.isArray(r.learnings)) {
                        allLearnings.push(...r.learnings);
                    }
                });
                
                let response = `# Key Learnings Review (${allLearnings.length} total)\n\n`;
                
                // Group by similarity
                const uniqueLearnings = [...new Set(allLearnings)];
                
                uniqueLearnings.slice(0, 15).forEach((learn, i) => {
                    response += `${i + 1}. ${learn}\n`;
                });
                
                if (uniqueLearnings.length > 15) {
                    response += `\n... and ${uniqueLearnings.length - 15} more`;
                }
                
                return {
                    content: [{ type: "text", text: response }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "dismiss_improvement_suggestion",
        description: "Mark an improvement suggestion as applied or dismissed.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                suggestionId: { type: "string", description: "Suggestion ID to update" },
                status: { type: "string", enum: ["applied", "dismissed"], description: "New status" }
            },
            required: ["userId", "suggestionId", "status"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({
                    userId: z.string().min(1),
                    suggestionId: z.string().min(1),
                    status: z.enum(["applied", "dismissed"])
                });
                const { userId, suggestionId, status } = validatePayload(schema, args);
                
                const updated = updateSuggestionStatus(suggestionId, status);
                
                return {
                    content: [{ type: "text", text: `Suggestion ${suggestionId} marked as ${status}` }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "start_working_buffer",
        description: "Start a working buffer for multi-step operations - tracks state across multiple steps.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" },
                projectId: { type: "string", description: "Project ID (optional)" },
                operationType: { type: "string", description: "Type of operation (planning, multi_step, batch)" },
                totalSteps: { type: "number", description: "Total number of steps" },
                initialState: { type: "object", description: "Initial state for the operation" }
            },
            required: ["userId", "operationType", "totalSteps"],
        },
        handler: async (args: any) => {
            try {
                const schema = baseSchemaWithProject.extend({
                    operationType: z.string().min(1),
                    totalSteps: z.number().min(1),
                    initialState: z.any().default({})
                });
                const { userId, projectId, operationType, totalSteps, initialState } = validatePayload(schema, args);
                
                const buffer = createWorkingBuffer(
                    userId,
                    projectId || null,
                    operationType,
                    totalSteps,
                    initialState
                );
                
                return {
                    content: [{ type: "text", text: `Working buffer created: ${buffer.id}\nOperation: ${operationType}\nSteps: ${totalSteps}\nState: ${JSON.stringify(initialState)}` }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "update_working_buffer",
        description: "Update the state of an existing working buffer at a specific step.",
        inputSchema: {
            type: "object",
            properties: {
                bufferId: { type: "string", description: "Working buffer ID" },
                stepIndex: { type: "number", description: "Current step index (0-based)" },
                state: { type: "object", description: "Updated state" }
            },
            required: ["bufferId", "stepIndex", "state"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({
                    bufferId: z.string().min(1),
                    stepIndex: z.number().min(0),
                    state: z.any()
                });
                const { bufferId, stepIndex, state } = validatePayload(schema, args);
                
                const existing = getWorkingBuffer(bufferId);
                if (!existing) {
                    return { isError: true, content: [{ type: "text", text: "Buffer not found" }] };
                }
                
                if (stepIndex > existing.totalSteps) {
                    return { isError: true, content: [{ type: "text", text: "Step index exceeds total steps" }] };
                }
                
                const updated = updateWorkingBuffer(bufferId, stepIndex, state);
                
                return {
                    content: [{ type: "text", text: `Buffer ${bufferId} updated\nStep: ${stepIndex + 1}/${updated.totalSteps}\nProgress: ${Math.round((stepIndex + 1) / updated.totalSteps * 100)}%` }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "complete_working_buffer",
        description: "Complete a working buffer with final state and optionally clean up.",
        inputSchema: {
            type: "object",
            properties: {
                bufferId: { type: "string", description: "Working buffer ID" },
                finalState: { type: "object", description: "Final state to save" },
                cleanup: { type: "boolean", description: "Whether to delete the buffer after completion", default: true }
            },
            required: ["bufferId"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({
                    bufferId: z.string().min(1),
                    finalState: z.any().default({}),
                    cleanup: z.boolean().default(true)
                });
                const { bufferId, finalState, cleanup } = validatePayload(schema, args);
                
                const completed = completeWorkingBuffer(bufferId, finalState);
                
                if (cleanup) {
                    abortWorkingBuffer(bufferId);
                    return {
                        content: [{ type: "text", text: `Working buffer ${bufferId} completed and cleaned up\nFinal step: ${completed.stepIndex}/${completed.totalSteps}` }]
                    };
                }
                
                return {
                    content: [{ type: "text", text: `Working buffer ${bufferId} completed\nFinal state: ${JSON.stringify(finalState)}` }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "list_working_buffers",
        description: "List all active working buffers for the user.",
        inputSchema: {
            type: "object",
            properties: {
                userId: { type: "string", description: "User ID" }
            },
            required: ["userId"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({
                    userId: z.string().min(1)
                });
                const { userId } = validatePayload(schema, args);
                
                const buffers = getUserWorkingBuffers(userId);
                
                return {
                    content: [{ type: "text", text: JSON.stringify(buffers, null, 2) }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    },
    {
        name: "abort_working_buffer",
        description: "Abort and delete a working buffer.",
        inputSchema: {
            type: "object",
            properties: {
                bufferId: { type: "string", description: "Working buffer ID to abort" }
            },
            required: ["bufferId"],
        },
        handler: async (args: any) => {
            try {
                const schema = z.object({
                    bufferId: z.string().min(1)
                });
                const { bufferId } = validatePayload(schema, args);
                
                const result = abortWorkingBuffer(bufferId);
                
                return {
                    content: [{ type: "text", text: `Working buffer ${bufferId} aborted and deleted` }]
                };
            } catch (err: any) {
                return { isError: true, content: [{ type: "text", text: err.message }] };
            }
        }
    }
];