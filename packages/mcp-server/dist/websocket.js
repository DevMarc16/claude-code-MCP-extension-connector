import { WebSocketServer, WebSocket } from 'ws';
import { WS_PORT, isResponse, isEvent } from '@claude-browser-bridge/shared';
export class BridgeWebSocket {
    wss = null;
    client = null;
    pendingRequests = new Map();
    eventHandlers = [];
    requestCounter = 0;
    async start() {
        return new Promise((resolve, reject) => {
            this.wss = new WebSocketServer({ port: WS_PORT, host: 'localhost' });
            this.wss.on('listening', () => {
                console.error(`[Bridge] WebSocket server listening on ws://localhost:${WS_PORT}`);
                resolve();
            });
            this.wss.on('error', (err) => {
                console.error('[Bridge] WebSocket server error:', err.message);
                reject(err);
            });
            this.wss.on('connection', (ws) => {
                console.error('[Bridge] Extension connected');
                this.client = ws;
                ws.on('message', (raw) => {
                    try {
                        const msg = JSON.parse(raw.toString());
                        if (isResponse(msg)) {
                            const pending = this.pendingRequests.get(msg.id);
                            if (pending) {
                                clearTimeout(pending.timer);
                                this.pendingRequests.delete(msg.id);
                                pending.resolve(msg);
                            }
                        }
                        else if (isEvent(msg)) {
                            this.eventHandlers.forEach(h => h(msg));
                        }
                    }
                    catch (e) {
                        console.error('[Bridge] Failed to parse message:', e);
                    }
                });
                ws.on('close', () => {
                    console.error('[Bridge] Extension disconnected');
                    this.client = null;
                    for (const [id, pending] of this.pendingRequests) {
                        clearTimeout(pending.timer);
                        pending.reject(new Error('Extension disconnected'));
                        this.pendingRequests.delete(id);
                    }
                });
            });
        });
    }
    get isConnected() {
        return this.client !== null && this.client.readyState === WebSocket.OPEN;
    }
    async send(command, params = {}, timeoutMs = 30000) {
        if (!this.isConnected) {
            return { id: '', success: false, error: 'Extension not connected. Make sure the Claude Browser Bridge extension is installed and active in Edge.' };
        }
        const id = `req_${++this.requestCounter}_${Date.now()}`;
        const request = { id, command, params };
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingRequests.delete(id);
                resolve({ id, success: false, error: `Command '${command}' timed out after ${timeoutMs}ms` });
            }, timeoutMs);
            this.pendingRequests.set(id, { resolve, reject, timer });
            this.client.send(JSON.stringify(request));
        });
    }
    onEvent(handler) {
        this.eventHandlers.push(handler);
    }
    async stop() {
        for (const [id, pending] of this.pendingRequests) {
            clearTimeout(pending.timer);
            pending.reject(new Error('Server shutting down'));
        }
        this.pendingRequests.clear();
        if (this.client) {
            this.client.close();
            this.client = null;
        }
        if (this.wss) {
            this.wss.close();
            this.wss = null;
        }
    }
}
//# sourceMappingURL=websocket.js.map