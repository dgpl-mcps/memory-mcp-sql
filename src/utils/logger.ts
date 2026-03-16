import fs from 'fs';
import path from 'path';

const LOG_FILE = path.resolve(process.cwd(), 'agent_audit.log');

export class AuditLogger {
    static log(toolName: string, userId: string, projectId: string, args: any, result: any, durationMs: number) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            tool: toolName,
            userId,
            projectId,
            durationMs,
            // Censor extremely long text fields to keep the log file readable
            args: AuditLogger.censorLargeFields(args),
            status: result.isError ? 'ERROR' : 'SUCCESS',
            result: result.isError ? result.content[0].text : AuditLogger.censorLargeFields(result)
        };

        const logString = JSON.stringify(logEntry) + '\n';
        fs.appendFile(LOG_FILE, logString, (err) => {
            if (err) console.error('Failed to write to audit log:', err);
        });
    }

    private static censorLargeFields(obj: any): any {
        if (!obj) return obj;

        try {
            // Attempt generic truncate if it's deeply nested (simple strategy)
            const stringified = JSON.stringify(obj);
            if (stringified.length > 500) {
                return { _truncated: true, preview: stringified.substring(0, 500) + '...' };
            }
            return obj;
        } catch (e) {
            return { _error: "Could not serialize for logging" };
        }
    }
}
