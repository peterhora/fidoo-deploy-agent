export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: Record<string, unknown>;
        required?: string[];
    };
}
export interface ToolResult {
    content: Array<{
        type: "text";
        text: string;
    }>;
    isError?: boolean;
}
export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;
export interface RegisteredTool {
    definition: ToolDefinition;
    handler: ToolHandler;
}
export declare const toolRegistry: Map<string, RegisteredTool>;
