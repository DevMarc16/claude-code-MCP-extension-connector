# Claude Browser Bridge — Design Document

## Problem

Playwright MCP spins up its own browser instance, disconnected from your actual development workflow. When working on an app locally, you want Claude Code to see and interact with the **real browser** where your app is already running — your actual tabs, your actual state.

## Solution

A two-component system:
1. **Edge Extension** (Manifest V3) — lives in your browser, has full access to all tabs, DOM, console, network
2. **MCP Server** (Node.js) — connects to Claude Code via stdio MCP protocol, relays commands to the extension via WebSocket

## Architecture

```
Claude Code ←── stdio/MCP ──→ MCP Server ←── WebSocket (localhost:9876) ──→ Edge Extension ──→ Your Browser Tabs
```

### MCP Server (`packages/mcp-server/`)
- Node.js + TypeScript
- Uses `@modelcontextprotocol/sdk` for MCP protocol
- Hosts WebSocket server on `ws://localhost:9876`
- Exposes tools to Claude Code, forwards commands to extension
- Handles response serialization (screenshots as base64, DOM as structured data)

### Edge Extension (`packages/extension/`)
- Manifest V3 with service worker
- Maintains persistent WebSocket connection to MCP server
- Content script injected into pages for DOM access and console capture
- Optional side panel for connection status and command log

#### Extension Permissions
- `tabs` — list and manage tabs
- `activeTab` — access active tab
- `scripting` — inject scripts into pages
- `debugger` — Chrome DevTools Protocol access for deep inspection
- `webRequest` — monitor network requests
- `storage` — persist settings
- `cookies` — read cookies
- `<all_urls>` — access any page

## MCP Tools

### Navigation & Tabs
| Tool | Description |
|------|-------------|
| `list_tabs` | List all open tabs (title, URL, id) |
| `get_active_tab` | Get info about the currently focused tab |
| `navigate` | Navigate a tab to a URL |
| `open_tab` | Open a new tab |
| `close_tab` | Close a tab |
| `reload_tab` | Reload a tab (with optional cache bypass) |

### Visual
| Tool | Description |
|------|-------------|
| `screenshot` | Capture screenshot of a tab (full page or viewport) |
| `screenshot_element` | Screenshot a specific CSS-selected element |
| `visual_diff` | Compare two screenshots, highlight differences |
| `get_responsive_screenshots` | Screenshots at multiple viewport sizes |

### DOM & Interaction
| Tool | Description |
|------|-------------|
| `get_dom` | Get the DOM tree (full or subtree via selector) |
| `query_selector` | Find elements matching a CSS selector |
| `click` | Click an element by selector |
| `type_text` | Type text into an input/textarea |
| `fill_form` | Fill multiple form fields at once |
| `execute_script` | Run arbitrary JavaScript in page context |
| `get_computed_styles` | Get computed CSS for an element |
| `highlight_element` | Visually highlight an element with overlay |
| `get_event_listeners` | List event listeners on an element |

### Console & Network
| Tool | Description |
|------|-------------|
| `get_console_logs` | Get captured console output |
| `get_network_requests` | Get captured network requests/responses |
| `clear_console` | Clear captured console logs |
| `monitor_console` | Start/stop real-time console monitoring |
| `monitor_network` | Start/stop real-time network monitoring |
| `get_page_errors` | Get all JS errors on the page |

### Page State
| Tool | Description |
|------|-------------|
| `get_cookies` | Get cookies for a tab |
| `get_local_storage` | Read localStorage |
| `get_session_storage` | Read sessionStorage |
| `wait_for_element` | Wait for an element to appear in DOM |
| `wait_for_navigation` | Wait for page navigation to complete |

### Dev Workflow
| Tool | Description |
|------|-------------|
| `get_accessibility_report` | Run a11y audit, report WCAG violations |
| `get_performance_metrics` | LCP, CLS, FID, memory usage |
| `emulate_device` | Emulate mobile device viewport + user agent |
| `toggle_dark_mode` | Toggle prefers-color-scheme |
| `disable_cache` | Disable/enable browser cache |
| `block_urls` | Block specific URLs |
| `inject_css` | Inject custom CSS into the page |
| `get_meta_tags` | Read meta/OG tags |
| `pdf_page` | Export page as PDF |
| `simulate_slow_network` | Throttle network speed |
| `record_actions` | Record user interactions |
| `replay_actions` | Replay recorded sequences |

## Tech Stack

| Component | Technology |
|-----------|-----------|
| MCP Server | Node.js, TypeScript, `@modelcontextprotocol/sdk`, `ws` |
| Extension | Manifest V3, TypeScript, Chrome APIs |
| Screenshots | `chrome.tabs.captureVisibleTab` + `chrome.debugger` |
| Visual Diff | `pixelmatch` |
| Build | `esbuild` |
| Package Manager | npm workspaces (monorepo) |

## Project Structure

```
claude-code-ext/
├── package.json                    # workspace root
├── packages/
│   ├── mcp-server/
│   │   ├── src/
│   │   │   ├── index.ts            # entry point
│   │   │   ├── server.ts           # MCP server setup
│   │   │   ├── websocket.ts        # WebSocket server
│   │   │   ├── tools/              # tool implementations
│   │   │   │   ├── navigation.ts
│   │   │   │   ├── visual.ts
│   │   │   │   ├── dom.ts
│   │   │   │   ├── console.ts
│   │   │   │   ├── network.ts
│   │   │   │   ├── state.ts
│   │   │   │   └── devtools.ts
│   │   │   └── types.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── extension/
│   │   ├── src/
│   │   │   ├── background.ts       # service worker
│   │   │   ├── content.ts          # content script
│   │   │   ├── sidepanel.ts        # side panel UI
│   │   │   ├── handlers/           # command handlers
│   │   │   │   ├── navigation.ts
│   │   │   │   ├── visual.ts
│   │   │   │   ├── dom.ts
│   │   │   │   ├── console.ts
│   │   │   │   ├── network.ts
│   │   │   │   ├── state.ts
│   │   │   │   └── devtools.ts
│   │   │   └── types.ts
│   │   ├── manifest.json
│   │   ├── sidepanel.html
│   │   └── icons/
│   └── shared/
│       ├── src/
│       │   ├── protocol.ts          # shared message types
│       │   └── constants.ts         # shared constants
│       ├── package.json
│       └── tsconfig.json
└── docs/
    └── plans/
```

## Communication Protocol

Messages between MCP server and extension use JSON over WebSocket:

```typescript
interface BridgeRequest {
  id: string;
  command: string;
  params: Record<string, unknown>;
}

interface BridgeResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}
```

## Claude Code Integration

Add to `~/.claude/settings.json` or project `.claude/settings.json`:

```json
{
  "mcpServers": {
    "browser-bridge": {
      "command": "node",
      "args": ["C:/claude-code-ext/packages/mcp-server/dist/index.js"]
    }
  }
}
```

## Security Considerations

- WebSocket only binds to `localhost` (no external access)
- Extension only loaded as unpacked (personal use, no store distribution needed)
- No sensitive data persisted to disk by default
- Console/network logs cleared on tab close
