import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

// Memory Configuration Schema
const memoryConfigSchema = z.object({
    MAX_SHORT_TERM_CHATS: z.coerce.number().min(1).max(100).default(10),
    SHORT_TERM_THRESHOLD: z.coerce.number().min(0).max(100).default(20),
    LONG_TERM_THRESHOLD: z.coerce.number().min(0).max(100).default(75),
    AUTO_SUMMARIZE_AFTER_CHATS: z.coerce.number().min(1).default(20),
    SUMMARY_MIN_LENGTH: z.coerce.number().min(10).max(1000).default(50),
    SUMMARY_MAX_LENGTH: z.coerce.number().min(50).max(2000).default(500),
});

// Define strictly what ENV variables the entire system mandates to boot
const envSchema = z.object({
    MONGODB_URI: z.string().url("MONGODB_URI must be a valid connection string URL").optional(),
    // Memory Configuration
    MAX_SHORT_TERM_CHATS: z.coerce.number().optional(),
    SHORT_TERM_THRESHOLD: z.coerce.number().optional(),
    LONG_TERM_THRESHOLD: z.coerce.number().optional(),
    AUTO_SUMMARIZE_AFTER_CHATS: z.coerce.number().optional(),
    SUMMARY_MIN_LENGTH: z.coerce.number().optional(),
    SUMMARY_MAX_LENGTH: z.coerce.number().optional(),
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
        AUTO_SUMMARIZE_AFTER_CHATS: 20,
        SUMMARY_MIN_LENGTH: 50,
        SUMMARY_MAX_LENGTH: 500,
    };
    
    const result = memoryConfigSchema.safeParse(process.env);
    if (result.success) {
        return { ...defaults, ...result.data };
    }
    return defaults;
};
