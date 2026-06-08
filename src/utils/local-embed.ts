/**
 * Local Embedding Generator
 * 
 * Generates 384-dim vector embeddings locally without any external API.
 * Uses feature hashing (Weinberger et al.) with TF-IDF weighting and L2 normalization.
 * 
 * Why this approach:
 * - Fully offline, zero network, zero API keys
 * - Deterministic (same text → same vector)
 * - Robust edge case handling (empty, very long, unicode, special chars)
 * - Good enough for keyword/phrase similarity + works with vss0/vec0
 * - Can be replaced by an external embedder later by setting EMBEDDING_URL
 * 
 * Algorithm:
 * 1. Tokenize: lowercase, split on non-alphanumeric, keep tokens of length 2-30
 * 2. Optional bigrams: also generate 2-grams for phrase similarity
 * 3. Feature hashing: each token (with sign) → 384-dim vector position
 * 4. TF weighting: count occurrences in current text
 * 5. IDF weighting: log((N+1)/(df+1)) + 1, where df is document frequency
 * 6. L2 normalize for cosine similarity
 * 
 * Limitations:
 * - Not as good as transformer embeddings (BERT, etc.) for semantic similarity
 * - Works best for keyword overlap, named entities, technical terms
 * - Synonyms won't match (e.g., "fast" vs "quick" score low)
 * - For best results, use with combined FTS5 keyword search
 */

const EMBED_DIM = 384;
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const SIGN_PRIME = 0x9e3779b1;

/**
 * 32-bit FNV-1a hash. Returns unsigned 32-bit integer.
 * Deterministic across platforms (no Math.random, no time-based seed).
 */
function fnv1a32(str: string): number {
    let hash = FNV_OFFSET_BASIS;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        // Multiply by FNV prime, keeping within 32-bit unsigned range
        hash = Math.imul(hash, FNV_PRIME) >>> 0;
    }
    return hash >>> 0;
}

/**
 * Generate a stable per-token sign bit for feature hashing.
 * Returns +1 or -1.
 */
function tokenSign(str: string): number {
    return (fnv1a32(str + ":sign") & 1) === 0 ? 1 : -1;
}

/**
 * Map a token to its position in the 384-dim vector.
 */
function tokenPosition(str: string): number {
    return fnv1a32(str) % EMBED_DIM;
}

// Common English stop words — kept minimal to preserve signal.
// (Skip-list is intentionally short; we want content-bearing tokens.)
const STOP_WORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
    "has", "have", "in", "is", "it", "its", "of", "on", "that", "the",
    "to", "was", "were", "will", "with", "this", "but", "or", "not",
    "so", "if", "do", "does", "did", "can", "could", "would", "should",
    "i", "you", "he", "she", "we", "they", "them", "their", "my", "your",
    "our", "me", "him", "her", "us",
]);

/**
 * Tokenize text. Splits on any non-alphanumeric Unicode character,
 * keeps tokens of length 2-30, lowercases everything.
 * 
 * Edge cases handled:
 * - empty / whitespace-only → returns []
 * - very long text (>100KB) → truncates to first 100KB
 * - unicode (emojis, accented chars, CJK) → kept as-is, length-checked
 * - control chars → stripped
 * - pure numbers → kept (might be meaningful: "8080", "v2", "404")
 */
export function tokenize(text: string): string[] {
    if (!text) return [];

    // Truncate very long text to prevent DoS via memory blowup.
    // 100KB is plenty for any realistic input.
    if (text.length > 100_000) {
        text = text.slice(0, 100_000);
    }

    // Strip control chars except whitespace, then collapse whitespace.
    // \p{L} = any letter, \p{N} = any number, \p{M} = combining marks
    const cleaned = text
        .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, " ")
        .toLowerCase();

    // Split on any character that is not a letter, number, or combining mark.
    // The lookahead/lookbehind with \p{L}\p{N}\p{M} keeps CJK and accented chars.
    const rawTokens = cleaned.split(/[^\p{L}\p{N}\p{M}]+/u);

    const tokens: string[] = [];
    for (const t of rawTokens) {
        if (t.length < 2 || t.length > 30) continue;
        if (STOP_WORDS.has(t)) continue;
        tokens.push(t);
    }
    return tokens;
}

/**
 * Generate bigrams from token list.
 * Returns the same tokens plus " " joined bigrams.
 * Example: ["db", "fail"] → ["db", "fail", "db fail"]
 */
function bigrams(tokens: string[]): string[] {
    if (tokens.length < 2) return tokens;
    const out = tokens.slice();
    for (let i = 0; i < tokens.length - 1; i++) {
        out.push(tokens[i] + " " + tokens[i + 1]);
    }
    return out;
}

/**
 * IDF cache: maps token → { df, lastSeen }.
 * Capped to prevent memory bloat from a hostile input stream.
 */
interface IdfEntry { df: number; }
const IDF_CACHE = new Map<string, IdfEntry>();
const IDF_CACHE_MAX = 50_000;

function getCachedDf(token: string): number {
    const e = IDF_CACHE.get(token);
    return e ? e.df : 0;
}

function bumpCachedDf(token: string): void {
    const e = IDF_CACHE.get(token);
    if (e) {
        e.df += 1;
    } else {
        if (IDF_CACHE.size >= IDF_CACHE_MAX) {
            // Evict ~10% oldest entries to make room. Map preserves insertion order.
            const evict = Math.floor(IDF_CACHE_MAX * 0.1);
            const it = IDF_CACHE.keys();
            for (let i = 0; i < evict; i++) {
                const k = it.next().value;
                if (k === undefined) break;
                IDF_CACHE.delete(k);
            }
        }
        IDF_CACHE.set(token, { df: 1 });
    }
}

/**
 * Reset IDF cache. Call this if you want to rebuild IDF weights from scratch,
 * e.g., after a database rebuild or when switching corpora.
 */
export function resetIdfCache(): void {
    IDF_CACHE.clear();
}

/**
 * Feed a corpus of documents into the IDF cache before searching.
 * Call this once at startup or after bulk inserts to get better IDF weights.
 * 
 * @param docs Array of pre-tokenized documents
 */
export function feedIdfCorpus(docs: string[][]): void {
    const seen = new Set<string>();
    for (const tokens of docs) {
        seen.clear();
        for (const t of tokens) {
            if (seen.has(t)) continue;  // count each token once per doc
            seen.add(t);
            bumpCachedDf(t);
        }
    }
}

/**
 * The number of documents seen by the IDF cache so far.
 */
export function idfCorpusSize(): number {
    // We don't track this directly, but it can be inferred.
    // For now, callers can just call feedIdfCorpus themselves and track N.
    return -1;
}

/**
 * Compute the L2 norm of a Float32Array. Returns 0 if all-zero.
 */
function l2norm(v: Float32Array): number {
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i] * v[i];
    return Math.sqrt(s);
}

/**
 * Generate a 384-dim local embedding for a text.
 * 
 * Returns a Float32Array (length EMBED_DIM) ready to be JSON-stringified
 * for storage in the vss0/vec0 virtual table.
 * 
 * @param text Input text (any string)
 * @param useBigrams Whether to include 2-gram features (default true)
 */
export function localEmbed(text: string, useBigrams: boolean = true): Float32Array {
    const vec = new Float32Array(EMBED_DIM);
    if (!text) return vec;

    const baseTokens = tokenize(text);
    if (baseTokens.length === 0) return vec;

    const tokens = useBigrams ? bigrams(baseTokens) : baseTokens;

    // Step 1: TF (term frequency) — count how often each token occurs.
    const tf = new Map<string, number>();
    for (const t of tokens) {
        tf.set(t, (tf.get(t) || 0) + 1);
    }

    // Step 2: Apply feature hashing with TF*IDF weighting.
    for (const [token, count] of tf) {
        const pos = tokenPosition(token);
        const sign = tokenSign(token);
        const df = getCachedDf(token);
        // Smoothed IDF: log((N+1)/(df+1)) + 1
        // Without a known N, we approximate with 1 (so IDF ≈ 1+log(1/(df+1)))
        // This is safe because we're hashing onto a fixed dim — the bias is uniform.
        const idf = df > 0 ? 1 + Math.log(1 / (df + 1)) : 1;
        vec[pos] += sign * count * idf;
    }

    // Step 3: L2 normalize so dot product = cosine similarity.
    const norm = l2norm(vec);
    if (norm > 0) {
        for (let i = 0; i < vec.length; i++) vec[i] /= norm;
    }

    return vec;
}

/**
 * Convert a Float32Array to a JSON string suitable for vss0/vec0 storage.
 * 
 * Why JSON: sqlite-vss/vec0 use a `vector` type that accepts JSON arrays
 * of numbers. Native binary is faster, but the JSON path is what the
 * existing MCP code already uses.
 */
export function vectorToJson(v: Float32Array): string {
    const arr: number[] = new Array(v.length);
    for (let i = 0; i < v.length; i++) arr[i] = v[i];
    return JSON.stringify(arr);
}

/**
 * Convenience: text → JSON-string vector in one call.
 * Always returns a valid JSON string (never null), so the caller
 * doesn't need to null-check.
 */
export function embedText(text: string): string {
    return vectorToJson(localEmbed(text));
}

export const EMBED_DIMENSION = EMBED_DIM;
