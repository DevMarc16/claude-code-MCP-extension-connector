import { WebSocketServer, WebSocket } from 'ws';
import { execFileSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { WS_PORT, isResponse, isEvent } from '@claude-browser-bridge/shared';
const MAX_RETRIES = 10;
const BASE_DELAY_MS = 1000;
const PID_FILE = join(tmpdir(), 'claude-browser-bridge.pid');
export class BridgeWebSocket {
    wss = null;
    client = null;
    pendingRequests = new Map();
    eventHandlers = [];
    requestCounter = 0;
    stopping = false;
    async start() {
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            if (this.stopping)
                return;
            try {
                await this.tryBind();
                this.writePidFile();
                return;
            }
            catch (err) {
                if (err.code === 'EADDRINUSE') {
                    console.error(`[Bridge] Port ${WS_PORT} in use (attempt ${attempt + 1}/${MAX_RETRIES})`);
                    this.killOrphan();
                    const delay = Math.min(BASE_DELAY_MS * Math.pow(1.5, attempt), 10000);
                    await new Promise(r => setTimeout(r, delay));
                }
                else {
                    throw err;
                }
            }
        }
        throw new Error(`[Bridge] Failed to bind port ${WS_PORT} after ${MAX_RETRIES} attempts`);
    }
    writePidFile() {
        try {
            writeFileSync(PID_FILE, String(process.pid));
        }
        catch { }
    }
    removePidFile() {
        try {
            if (existsSync(PID_FILE))
                unlinkSync(PID_FILE);
        }
        catch { }
    }
    killOrphan() {
        // First try the PID file (fast path)
        try {
            if (existsSync(PID_FILE)) {
                const pid = Number(readFileSync(PID_FILE, 'utf8').trim());
                if (pid && pid !== process.pid) {
                    console.error(`[Bridge] Killing orphan PID ${pid} from pid file`);
                    execFileSync('taskkill', ['/F', '/PID', String(pid)], { timeout: 5000 });
                    this.removePidFile();
                    return;
                }
            }
        }
        catch { }
        // Fallback: find the process holding the port
        try {
            const out = execFileSync('netstat', ['-ano'], { encoding: 'utf8', timeout: 5000 });
            const line = out.split('\n').find(l => l.includes(`127.0.0.1:${WS_PORT}`) && l.includes('LISTENING'));
            if (!line)
                return;
            const match = line.match(/LISTENING\s+(\d+)/);
            if (match) {
                const pid = Number(match[1]);
                if (pid !== process.pid) {
                    console.error(`[Bridge] Killing orphan PID ${pid} from netstat`);
                    execFileSync('taskkill', ['/F', '/PID', String(pid)], { timeout: 5000 });
                }
            }
        }
        catch { }
    }
    tryBind() {
        return new Promise((resolve, reject) => {
            const wss = new WebSocketServer({ port: WS_PORT, host: '127.0.0.1' });
            wss.on('listening', () => {
                console.error(`[Bridge] WebSocket server listening on ws://127.0.0.1:${WS_PORT}`);
                this.wss = wss;
                this.setupConnectionHandler(wss);
                resolve();
            });
            wss.on('error', (err) => {
                wss.close();
                reject(err);
            });
        });
    }
    setupConnectionHandler(wss) {
        wss.on('connection', (ws) => {
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
        this.stopping = true;
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
        this.removePidFile();
    }
}
//# sourceMappingURL=websocket.js.map