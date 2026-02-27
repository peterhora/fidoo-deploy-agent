import { createStdioTransport } from "./protocol.js";
import { toolRegistry } from "./tools/index.js";
const SERVER_INFO = {
    name: "deploy-agent",
    version: "0.1.0",
};
export async function handleInitialize(params) {
    return {
        protocolVersion: "2025-11-25",
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
    };
}
export async function handleToolsList() {
    const tools = Array.from(toolRegistry.values()).map((t) => t.definition);
    return { tools };
}
export async function handleToolsCall(params) {
    const name = params?.name;
    const args = (params?.arguments) ?? {};
    const tool = toolRegistry.get(name);
    if (!tool) {
        return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
        };
    }
    return tool.handler(args);
}
// Only start the transport when run as a script (not imported for tests)
const isMainModule = process.argv[1] &&
    (process.argv[1].endsWith("/server.js") ||
        process.argv[1].endsWith("\\server.js"));
if (isMainModule) {
    const handlers = new Map();
    handlers.set("initialize", handleInitialize);
    handlers.set("tools/list", handleToolsList);
    handlers.set("tools/call", handleToolsCall);
    const notificationHandlers = new Map();
    notificationHandlers.set("notifications/initialized", async () => { });
    createStdioTransport(handlers, notificationHandlers);
}
//# sourceMappingURL=server.js.map