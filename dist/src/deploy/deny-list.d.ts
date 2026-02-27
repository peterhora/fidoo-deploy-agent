export declare const DENIED_PATTERNS: string[];
export declare function shouldExclude(filePath: string): boolean;
export declare function collectFiles(rootDir: string): Promise<string[]>;
