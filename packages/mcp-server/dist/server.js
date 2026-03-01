import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export function createServer(bridge) {
    const server = new McpServer({
        name: 'claude-browser-bridge',
        version: '1.0.0',
    });
    server.tool('browser_status', 'Check if the browser extension is connected', {}, async () => {
        const connected = bridge.isConnected;
        return {
            content: [{
                    type: 'text',
                    text: connected
                        ? 'Browser extension is connected and ready.'
                        : 'Browser extension is NOT connected. Please make sure the Claude Browser Bridge extension is installed and active in Edge.'
                }]
        };
    });
    return server;
}
//# sourceMappingURL=server.js.map