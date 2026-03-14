import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

// Define strictly what ENV variables the entire system mandates to boot
const envSchema = z.object({
    MONGODB_URI: z.string().url("MONGODB_URI must be a valid connection string URL"),
    // If the system relies on vector search logic needing API keys later, we'd add them here
    // OPENAI_API_KEY: z.string().min(10, "Valid API key required for Embeddings"), 
});

export const validateEnv = () => {
    try {
        const parsed = envSchema.safeParse(process.env);
        if (!parsed.success) {
            console.error("\\n🚨 V6 FATAL SYSTEM HALT: Invalid Environment Variables Configuration.");
            parsed.error.errors.forEach(err => {
                console.error(`- Missing or Invalid Env Key [${err.path.join('.')}]: ${err.message}`);
            });
            console.error("The Node Server refuses to start corrupted. Fix '.env' and reboot.\\n");
            process.exit(1);
        }
        return parsed.data;
    } catch (e) {
        process.exit(1);
    }
};
