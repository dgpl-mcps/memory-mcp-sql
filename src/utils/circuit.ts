export class CircuitBreaker {
    private static requests = new Map<string, number[]>();
    private static readonly MAX_REQUESTS_PER_MINUTE = 60;
    private static readonly WINDOW_MS = 60 * 1000;
    private static lastCleanup = 0;
    private static readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Cleanup every 5 minutes

    static checkRateLimit(userId: string, projectId: string): void {
        const now = Date.now();
        const key = `${projectId}_${userId}`;

        // Periodic cleanup to prevent memory leak
        if (now - this.lastCleanup > this.CLEANUP_INTERVAL_MS) {
            this.cleanup();
            this.lastCleanup = now;
        }

        if (!this.requests.has(key)) {
            this.requests.set(key, []);
        }

        const timestamps = this.requests.get(key)!;
        const validTimestamps = timestamps.filter(t => now - t < this.WINDOW_MS);

        if (validTimestamps.length >= this.MAX_REQUESTS_PER_MINUTE) {
            throw new Error(`CIRCUIT BREAKER TRIGGERED: Rate limit exceeded (${this.MAX_REQUESTS_PER_MINUTE} calls / min). You are caught in an autonomous loop. Stop, back off, and verify your logic.`);
        }

        validTimestamps.push(now);
        this.requests.set(key, validTimestamps);
    }

    private static cleanup(): void {
        const now = Date.now();
        for (const [key, timestamps] of this.requests.entries()) {
            const valid = timestamps.filter(t => now - t < this.WINDOW_MS);
            if (valid.length === 0) {
                this.requests.delete(key);
            } else {
                this.requests.set(key, valid);
            }
        }
    }
}
