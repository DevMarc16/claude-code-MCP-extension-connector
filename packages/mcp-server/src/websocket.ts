import { WebSocketServer, WebSocket } from 'ws';
import { WS_PORT, type BridgeRequest, type BridgeResponse, type BridgeEvent, isResponse, isEvent } from '@claude-browser-bridge/shared';

type EventHandler = (event: BridgeEvent) => void;

export class BridgeWebSocket {
  private wss: WebSocketServer | null = null;
  private client: WebSocket | null = null;
  private pendingRequests = new Map<string, {
    resolve: (value: BridgeResponse) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private eventHandlers: EventHandler[] = [];
  private requestCounter = 0;

  async start(): Promise<void> {
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
            } else if (isEvent(msg)) {
              this.eventHandlers.forEach(h => h(msg));
            }
          } catch (e) {
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

  get isConnected(): boolean {
    return this.client !== null && this.client.readyState === WebSocket.OPEN;
  }

  async send(command: BridgeRequest['command'], params: Record<string, unknown> = {}, timeoutMs = 30000): Promise<BridgeResponse> {
    if (!this.isConnected) {
      return { id: '', success: false, error: 'Extension not connected. Make sure the Claude Browser Bridge extension is installed and active in Edge.' };
    }

    const id = `req_${++this.requestCounter}_${Date.now()}`;
    const request: BridgeRequest = { id, command, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        resolve({ id, success: false, error: `Command '${command}' timed out after ${timeoutMs}ms` });
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this.client!.send(JSON.stringify(request));
    });
  }

  onEvent(handler: EventHandler): void {
    this.eventHandlers.push(handler);
  }

  async stop(): Promise<void> {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Server shutting down'));
    }
    this.pendingRequests.clear();
    if (this.client) { this.client.close(); this.client = null; }
    if (this.wss) { this.wss.close(); this.wss = null; }
  }
}
