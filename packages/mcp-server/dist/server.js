import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerNavigationTools } from './tools/navigation.js';
import { registerVisualTools } from './tools/visual.js';
import { registerDomTools } from './tools/dom.js';
import { registerConsoleNetworkTools } from './tools/console-network.js';
import { registerStateTools } from './tools/state.js';
import { registerDevTools } from './tools/devtools.js';
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
    registerNavigationTools(server, bridge);
    registerVisualTools(server, bridge);
    registerDomTools(server, bridge);
    registerConsoleNetworkTools(server, bridge);
    registerStateTools(server, bridge);
    registerDevTools(server, bridge);
    return server;
}
//# sourceMappingURL=server.js.map