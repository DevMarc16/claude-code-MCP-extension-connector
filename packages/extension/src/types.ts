export const WS_PORT = 9876;
export const WS_URL = `ws://127.0.0.1:${WS_PORT}`;
export const RECONNECT_INTERVAL_MS = 3000;

export interface BridgeRequest {
  id: string;
  command: string;
  params: Record<string, unknown>;
}

export interface BridgeResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}
