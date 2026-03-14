export class CircuitBreaker {
    // Map of <projectId>_User_<userId> -> array of timestamps
    private static requests = new Map<string, number[]>();

    // Limits: Max 60 memory mutations/reads per minute per project per user
    private static readonly MAX_REQUESTS_PER_MINUTE = 60;
    private static readonly WINDOW_MS = 60 * 1000;

    static checkRateLimit(userId: string, projectId: string): void {
        const now = Date.now();
        const key = `${projectId}_${userId}`;

        if (!this.requests.has(key)) {
            this.requests.set(key, []);
        }

        const timestamps = this.requests.get(key)!;

        // Prune timestamps older than 1 minute
        const validTimestamps = timestamps.filter(t => now - t < this.WINDOW_MS);

        if (validTimestamps.length >= this.MAX_REQUESTS_PER_MINUTE) {
            throw new Error(`CIRCUIT BREAKER TRIGGERED: Rate limit exceeded (${this.MAX_REQUESTS_PER_MINUTE} calls / min). You are caught in an autonomous loop. Stop, back off, and verify your logic.`);
        }

        validTimestamps.push(now);
        this.requests.set(key, validTimestamps);
    }
}
