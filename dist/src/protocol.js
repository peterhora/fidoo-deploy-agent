export const ErrorCodes = {
    ParseError: -32700,
    InvalidRequest: -32600,
    MethodNotFound: -32601,
    InvalidParams: -32602,
    InternalError: -32603,
};
export function parseJsonRpcMessage(raw) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new Error("Parse error: invalid JSON");
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("Invalid request: expected object");
    }
    const obj = parsed;
    if (obj.jsonrpc !== "2.0") {
        throw new Error("Invalid request: jsonrpc must be '2.0'");
    }
    if (typeof obj.method !== "string") {
        throw new Error("Invalid request: method must be a string");
    }
    const msg = {
        jsonrpc: "2.0",
        method: obj.method,
    };
    if (obj.params !== undefined) {
        msg.params = obj.params;
    }
    if ("id" in obj) {
        msg.id = obj.id;
    }
    return msg;
}
export function formatResponse(id, result) {
    return { jsonrpc: "2.0", id, result };
}
export function formatError(id, code, message, data) {
    const error = { code, message };
    if (data !== undefined) {
        error.data = data;
    }
    return { jsonrpc: "2.0", id, error };
}
export function createStdioTransport(handlers, notificationHandlers) {
    let buffer = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length === 0)
                continue;
            handleLine(trimmed);
        }
    });
    async function handleLine(line) {
        let msg;
        try {
            msg = parseJsonRpcMessage(line);
        }
        catch (err) {
            send(formatError(null, ErrorCodes.ParseError, err instanceof Error ? err.message : "Parse error"));
            return;
        }
        const isRequest = "id" in msg;
        if (!isRequest) {
            const handler = notificationHandlers?.get(msg.method);
            if (handler) {
                try {
                    await handler(msg.params);
                }
                catch {
                    // Notifications don't get responses
                }
            }
            return;
        }
        const request = msg;
        const handler = handlers.get(request.method);
        if (!handler) {
            send(formatError(request.id, ErrorCodes.MethodNotFound, `Method not found: ${request.method}`));
            return;
        }
        try {
            const result = await handler(request.params);
            send(formatResponse(request.id, result));
        }
        catch (err) {
            send(formatError(request.id, ErrorCodes.InternalError, err instanceof Error ? err.message : "Internal error"));
        }
    }
    function send(msg) {
        process.stdout.write(JSON.stringify(msg) + "\n");
    }
}
//# sourceMappingURL=protocol.js.map