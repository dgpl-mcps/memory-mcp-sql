// Utility to protect the LLM context window from massive database payload explosions
export class OutputSanitizer {
    private static readonly MAX_SAFE_TOKENS = 50000;

    static sanitize(result: any): any {
        if (!result || typeof result !== 'object') return result;

        if (Array.isArray(result.content)) {
            result.content = result.content.map((block: any) => {
                if (block.type === 'text' && typeof block.text === 'string') {
                    if (block.text.length > this.MAX_SAFE_TOKENS) {
                        block.text = block.text.substring(0, this.MAX_SAFE_TOKENS) +
                            `\n\n[...DATA TRUNCATED: Payload exceeded safe ${this.MAX_SAFE_TOKENS} character limits. Please utilize search filters to narrow your query.]`;
                    }
                }
                return block;
            });
        }
        return result;
    }
}
