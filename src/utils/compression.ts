import zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const deflate = promisify(zlib.deflate);
const inflate = promisify(zlib.inflate);

export interface CompressionResult {
    compressed: Buffer;
    algorithm: 'gzip' | 'deflate' | 'none';
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
}

export interface CompressedData {
    data: string;
    algorithm: 'gzip' | 'deflate' | 'none';
    originalSize: number;
}

export class MemoryCompressor {
    private static threshold = 1024;

    static async compress(data: string | object): Promise<CompressedData> {
        const jsonString = typeof data === 'string' ? data : JSON.stringify(data);
        const originalSize = Buffer.byteLength(jsonString, 'utf8');

        if (originalSize < this.threshold) {
            return {
                data: jsonString,
                algorithm: 'none',
                originalSize
            };
        }

        try {
            const compressed = await gzip(Buffer.from(jsonString, 'utf8'));
            const compressedSize = compressed.length;
            const ratio = originalSize > 0 ? (1 - compressedSize / originalSize) * 100 : 0;

            if (ratio < 10) {
                return {
                    data: jsonString,
                    algorithm: 'none',
                    originalSize
                };
            }

            return {
                data: compressed.toString('base64'),
                algorithm: 'gzip',
                originalSize
            };
        } catch (error) {
            return {
                data: jsonString,
                algorithm: 'none',
                originalSize
            };
        }
    }

    static async decompress(compressed: CompressedData): Promise<string> {
        if (compressed.algorithm === 'none') {
            return compressed.data;
        }

        try {
            const buffer = Buffer.from(compressed.data, 'base64');
            
            if (compressed.algorithm === 'gzip') {
                const decompressed = await gunzip(buffer);
                return decompressed.toString('utf8');
            } else if (compressed.algorithm === 'deflate') {
                const decompressed = await inflate(buffer);
                return decompressed.toString('utf8');
            }
            
            return compressed.data;
        } catch (error) {
            return compressed.data;
        }
    }

    static compressSync(data: string | object): CompressedData {
        const jsonString = typeof data === 'string' ? data : JSON.stringify(data);
        const originalSize = Buffer.byteLength(jsonString, 'utf8');

        if (originalSize < this.threshold) {
            return {
                data: jsonString,
                algorithm: 'none',
                originalSize
            };
        }

        try {
            const compressed = zlib.gzipSync(Buffer.from(jsonString, 'utf8'));
            const compressedSize = compressed.length;
            const ratio = originalSize > 0 ? (1 - compressedSize / originalSize) * 100 : 0;

            if (ratio < 10) {
                return {
                    data: jsonString,
                    algorithm: 'none',
                    originalSize
                };
            }

            return {
                data: compressed.toString('base64'),
                algorithm: 'gzip',
                originalSize
            };
        } catch (error) {
            return {
                data: jsonString,
                algorithm: 'none',
                originalSize
            };
        }
    }

    static decompressSync(compressed: CompressedData): string {
        if (compressed.algorithm === 'none') {
            return compressed.data;
        }

        try {
            const buffer = Buffer.from(compressed.data, 'base64');
            
            if (compressed.algorithm === 'gzip') {
                return zlib.gunzipSync(buffer).toString('utf8');
            } else if (compressed.algorithm === 'deflate') {
                return zlib.inflateSync(buffer).toString('utf8');
            }
            
            return compressed.data;
        } catch (error) {
            return compressed.data;
        }
    }
}

export async function compressMemory(data: string | object): Promise<CompressData> {
    return MemoryCompressor.compress(data);
}

export function compressMemorySync(data: string | object): CompressData {
    return MemoryCompressor.compressSync(data);
}

export async function decompressMemory(compressed: CompressData): Promise<string> {
    return MemoryCompressor.decompress(compressed);
}

export function decompressMemorySync(compressed: CompressData): string {
    return MemoryCompressor.decompressSync(compressed);
}

export type CompressData = {
    data: string;
    algorithm: 'gzip' | 'deflate' | 'none';
    originalSize: number;
};

export function isCompressed(data: any): boolean {
    return data && 
           typeof data === 'object' && 
           'algorithm' in data && 
           data.algorithm !== 'none';
}

export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

export function truncateForContext(text: string, maxTokens: number = 2000): { text: string; truncated: boolean } {
    const maxChars = maxTokens * 4;
    if (text.length <= maxChars) {
        return { text, truncated: false };
    }
    return { text: text.slice(0, maxChars) + '...', truncated: true };
}