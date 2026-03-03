export type CommandType =
  | 'list_tabs' | 'get_active_tab' | 'navigate' | 'open_tab' | 'close_tab' | 'reload_tab'
  | 'screenshot' | 'screenshot_element'
  | 'get_dom' | 'query_selector' | 'click' | 'type_text' | 'fill_form' | 'execute_script'
  | 'get_computed_styles' | 'highlight_element' | 'get_event_listeners'
  | 'get_console_logs' | 'get_network_requests' | 'clear_console' | 'get_page_errors'
  | 'get_cookies' | 'get_local_storage' | 'get_session_storage'
  | 'wait_for_element' | 'wait_for_navigation'
  | 'get_accessibility_report' | 'get_performance_metrics' | 'emulate_device'
  | 'toggle_dark_mode' | 'disable_cache' | 'block_urls' | 'inject_css'
  | 'get_meta_tags' | 'pdf_page' | 'get_responsive_screenshots'
  | 'simulate_slow_network' | 'monitor_console' | 'monitor_network'
  | 'dev_health' | 'dev_errors' | 'dev_watch' | 'get_framework_status';

export interface BridgeRequest {
  id: string;
  command: CommandType;
  params: Record<string, unknown>;
}

export interface BridgeResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface BridgeEvent {
  type: 'console_log' | 'network_request' | 'page_error';
  tabId: number;
  data: unknown;
  timestamp: number;
}

export type BridgeMessage = BridgeRequest | BridgeResponse | BridgeEvent;

export function isRequest(msg: BridgeMessage): msg is BridgeRequest {
  return 'command' in msg;
}

export function isResponse(msg: BridgeMessage): msg is BridgeResponse {
  return 'success' in msg;
}

export function isEvent(msg: BridgeMessage): msg is BridgeEvent {
  return 'type' in msg && !('command' in msg) && !('success' in msg);
}

export interface TabInfo {
  id: number;
  title: string;
  url: string;
  active: boolean;
  windowId: number;
  favIconUrl?: string;
  status?: string;
}

export interface ConsoleEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  message: string;
  timestamp: number;
  source?: string;
  lineNumber?: number;
}

export interface NetworkEntry {
  url: string;
  method: string;
  status?: number;
  statusText?: string;
  type: string;
  startTime: number;
  duration?: number;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  size?: number;
}

export interface DOMNode {
  tag: string;
  id?: string;
  classes?: string[];
  attributes?: Record<string, string>;
  textContent?: string;
  children?: DOMNode[];
}

export interface PerformanceData {
  loadTime: number;
  domContentLoaded: number;
  firstContentfulPaint?: number;
  largestContentfulPaint?: number;
  cumulativeLayoutShift?: number;
  totalBlockingTime?: number;
  memoryUsage?: { usedJSHeapSize: number; totalJSHeapSize: number };
}
