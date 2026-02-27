export declare const ErrorCodes: {
    readonly ParseError: -32700;
    readonly InvalidRequest: -32600;
    readonly MethodNotFound: -32601;
    readonly InvalidParams: -32602;
    readonly InternalError: -32603;
};
export type JsonRpcId = string | number;
export interface JsonRpcRequest {
    jsonrpc: "2.0";
    id: JsonRpcId;
    method: string;
    params?: Record<string, unknown>;
}
export interface JsonRpcNotification {
    jsonrpc: "2.0";
    method: string;
    params?: Record<string, unknown>;
}
export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification;
export interface JsonRpcResponse {
    jsonrpc: "2.0";
    id: JsonRpcId;
    result: unknown;
}
export interface JsonRpcErrorResponse {
    jsonrpc: "2.0";
    id: JsonRpcId | null;
    error: {
        code: number;
        message: string;
        data?: unknown;
    };
}
export type MethodHandler = (params: Record<string, unknown> | undefined) => Promise<unknown>;
export declare function parseJsonRpcMessage(raw: string): JsonRpcMessage;
export declare function formatResponse(id: JsonRpcId, result: unknown): JsonRpcResponse;
export declare function formatError(id: JsonRpcId | null, code: number, message: string, data?: unknown): JsonRpcErrorResponse;
export declare function createStdioTransport(handlers: Map<string, MethodHandler>, notificationHandlers?: Map<string, MethodHandler>): void;
