import { type BridgeRequest, type BridgeResponse, type BridgeEvent } from '@claude-browser-bridge/shared';
type EventHandler = (event: BridgeEvent) => void;
export declare class BridgeWebSocket {
    private wss;
    private client;
    private pendingRequests;
    private eventHandlers;
    private requestCounter;
    start(): Promise<void>;
    get isConnected(): boolean;
    send(command: BridgeRequest['command'], params?: Record<string, unknown>, timeoutMs?: number): Promise<BridgeResponse>;
    onEvent(handler: EventHandler): void;
    stop(): Promise<void>;
}
export {};
//# sourceMappingURL=websocket.d.ts.map