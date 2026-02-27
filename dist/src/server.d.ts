export declare function handleInitialize(params: Record<string, unknown> | undefined): Promise<{
    protocolVersion: string;
    capabilities: {
        tools: {};
    };
    serverInfo: {
        name: string;
        version: string;
    };
}>;
export declare function handleToolsList(): Promise<{
    tools: import("./tools/index.js").ToolDefinition[];
}>;
export declare function handleToolsCall(params: Record<string, unknown> | undefined): Promise<import("./tools/index.js").ToolResult>;
