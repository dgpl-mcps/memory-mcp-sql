import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

// Memory Configuration Schema - Enhanced with more options
const memoryConfigSchema = z.object({
    // Short-term memory
    MAX_SHORT_TERM_CHATS: z.coerce.number().min(1).max(100).default(10),
    SHORT_TERM_THRESHOLD: z.coerce.number().min(0).max(100).default(20),
    
    // Long-term memory
    LONG_TERM_THRESHOLD: z.coerce.number().min(0).max(100).default(75),
    MAX_LONG_TERM_MEMORIES: z.coerce.number().min(10).max(10000).default(1000),
    
    // Auto-summarization
    AUTO_SUMMARIZE_AFTER_CHATS: z.coerce.number().min(1).default(20),
    INCREMENTAL_SUMMARIZE: z.coerce.boolean().default(true),
    
    // Summary settings
    SUMMARY_MIN_LENGTH: z.coerce.number().min(10).max(1000).default(50),
    SUMMARY_MAX_LENGTH: z.coerce.number().min(50).max(2000).default(500),
    
    // Memory importance/priority
    ENABLE_PRIORITY_SCORING: z.coerce.boolean().default(true),
    PRIORITY_DECAY_DAYS: z.coerce.number().min(1).max(90).default(30),
    
    // Search Configuration
    DEFAULT_SEARCH_LIMIT: z.coerce.number().min(1).max(100).default(10),
    DEFAULT_SEARCH_OFFSET: z.coerce.number().min(0).max(1000).default(0),
    DEFAULT_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(100).default(20),
    
    // Cross-session linking
    ENABLE_SESSION_LINKING: z.coerce.boolean().default(true),
    CROSS_SESSION_THRESHOLD: z.coerce.number().min(0).max(100).default(60),
    
    // Auto-cleanup
    ENABLE_AUTO_CLEANUP: z.coerce.boolean().default(true),
    CLEANUP_AFTER_DAYS: z.coerce.number().min(7).max(365).default(90),
    
    // Context window
    MAX_CONTEXT_TOKENS: z.coerce.number().min(1000).max(100000).default(8000),
    CONTEXT_OVERLAP: z.coerce.number().min(1).max(10).default(3),
});

// Define strictly what ENV variables the entire system mandates to boot
const envSchema = z.object({
    MONGODB_URI: z.string().url("MONGODB_URI must be a valid connection string URL").optional(),
    // Memory Configuration - all optional with defaults
    MAX_SHORT_TERM_CHATS: z.coerce.number().optional(),
    SHORT_TERM_THRESHOLD: z.coerce.number().optional(),
    LONG_TERM_THRESHOLD: z.coerce.number().optional(),
    MAX_LONG_TERM_MEMORIES: z.coerce.number().optional(),
    AUTO_SUMMARIZE_AFTER_CHATS: z.coerce.number().optional(),
    INCREMENTAL_SUMMARIZE: z.coerce.boolean().optional(),
    SUMMARY_MIN_LENGTH: z.coerce.number().optional(),
    SUMMARY_MAX_LENGTH: z.coerce.number().optional(),
    ENABLE_PRIORITY_SCORING: z.coerce.boolean().optional(),
    PRIORITY_DECAY_DAYS: z.coerce.number().optional(),
    ENABLE_SESSION_LINKING: z.coerce.boolean().optional(),
    CROSS_SESSION_THRESHOLD: z.coerce.number().optional(),
    DEFAULT_SEARCH_LIMIT: z.coerce.number().optional(),
    DEFAULT_SEARCH_OFFSET: z.coerce.number().optional(),
    DEFAULT_CONFIDENCE_THRESHOLD: z.coerce.number().optional(),
    ENABLE_AUTO_CLEANUP: z.coerce.boolean().optional(),
    CLEANUP_AFTER_DAYS: z.coerce.number().optional(),
    MAX_CONTEXT_TOKENS: z.coerce.number().optional(),
    CONTEXT_OVERLAP: z.coerce.number().optional(),
});

export const validateEnv = () => {
    try {
        const parsed = envSchema.safeParse(process.env);
        if (!parsed.success) {
            console.error("\n🚨 V6 FATAL SYSTEM HALT: Invalid Environment Variables Configuration.");
            parsed.error.errors.forEach(err => {
                console.error(`- Missing or Invalid Env Key [${err.path.join('.')}]: ${err.message}`);
            });
            console.error("The Node Server refuses to start corrupted. Fix '.env' and reboot.\n");
            process.exit(1);
        }
        return parsed.data;
    } catch (e) {
        console.warn("⚠️ Environment validation skipped, proceeding with defaults.");
    }
};

// Memory Config Accessor
export const getMemoryConfig = () => {
    const defaults = {
        MAX_SHORT_TERM_CHATS: 10,
        SHORT_TERM_THRESHOLD: 20,
        LONG_TERM_THRESHOLD: 75,
        MAX_LONG_TERM_MEMORIES: 1000,
        AUTO_SUMMARIZE_AFTER_CHATS: 20,
        INCREMENTAL_SUMMARIZE: true,
        SUMMARY_MIN_LENGTH: 50,
        SUMMARY_MAX_LENGTH: 500,
        ENABLE_PRIORITY_SCORING: true,
        PRIORITY_DECAY_DAYS: 30,
        ENABLE_SESSION_LINKING: true,
        CROSS_SESSION_THRESHOLD: 60,
        DEFAULT_SEARCH_LIMIT: 10,
        DEFAULT_SEARCH_OFFSET: 0,
        DEFAULT_CONFIDENCE_THRESHOLD: 20,
        ENABLE_AUTO_CLEANUP: true,
        CLEANUP_AFTER_DAYS: 90,
        MAX_CONTEXT_TOKENS: 8000,
        CONTEXT_OVERLAP: 3,
    };
    
    const result = memoryConfigSchema.safeParse(process.env);
    if (result.success) {
        return { ...defaults, ...result.data };
    }
    return defaults;
};
