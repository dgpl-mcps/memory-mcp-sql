import { z } from "zod";

// A utility function to execute Zod validation against incoming MCP JSONRPC arguments.
// If it fails, it returns a beautifully formatted JSON string pointing exactly to the hallucinated field.
export const validatePayload = (schema: z.ZodSchema, args: any) => {
    const result = schema.safeParse(args);
    if (!result.success) {
        const errorMessages = result.error.errors.map(err =>
            `Path '${err.path.join('.')}' - ${err.message}`
        ).join(' | ');
        throw new Error(`Schema Validation Failed: ${errorMessages}`);
    }
    return result.data;
};

// Re-usable base fields for almost every memory-mcp tool
// V6 Hardening: Strictly max length parameters to block Buffer bloat or infinite LLM recursion.
// V6 Hardening: Regex enforces keys to contain only clean Alphanumeric syntax, blocking typical NoSQL Injection $ / {} artifacts.
export const baseSchema = z.object({
    userId: z.string().min(1, "userId is required").max(64).regex(/^[a-zA-Z0-9_-]+$/, "userId must be strictly alphanumeric/dash/underscore"),
    projectId: z.string().min(1, "projectId is required").max(64).regex(/^[a-zA-Z0-9_-]+$/, "projectId must be strictly alphanumeric/dash/underscore")
});
