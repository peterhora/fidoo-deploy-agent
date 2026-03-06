export declare function scheduleAcrBuild(token: string, imageTag: string, sasUrl: string): Promise<string>;
export declare function pollAcrBuild(token: string, runId: string, onLog?: (line: string) => void): Promise<void>;
