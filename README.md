# Claude Browser Bridge

An Edge/Chrome extension + MCP server that gives Claude Code full access to your live browser tabs — screenshots, DOM inspection, console logs, network monitoring, and dev workflow tools.

## Quick Start

### 1. Build

```bash
npm install
npm run build
```

### 2. Load the Edge Extension

1. Open `edge://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select `packages/extension/`

### 3. Use with Claude Code

The MCP server auto-configures when you run Claude Code in this directory.

Or add to your global config (`~/.claude/settings.json`):

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

### 4. Verify

Ask Claude Code: "Check browser status"

## Tools (30+)

**Navigation:** list_tabs, get_active_tab, navigate, open_tab, close_tab, reload_tab

**Visual:** screenshot, screenshot_element, visual_diff, get_responsive_screenshots

**DOM:** get_dom, query_selector, click, type_text, fill_form, execute_script, get_computed_styles, highlight_element, get_event_listeners, wait_for_element, wait_for_navigation

**Console/Network:** monitor_console, get_console_logs, monitor_network, get_network_requests, get_page_errors, clear_console

**Page State:** get_cookies, get_local_storage, get_session_storage

**Dev Workflow:** get_accessibility_report, get_performance_metrics, emulate_device, toggle_dark_mode, disable_cache, block_urls, inject_css, get_meta_tags, pdf_page, simulate_slow_network

## Architecture

```
Claude Code <-- stdio/MCP --> MCP Server <-- WebSocket (localhost:9876) --> Edge Extension --> Your Browser Tabs
```

Two components:

1. **MCP Server** (Node.js) — registers 30+ tools with Claude Code, forwards commands to extension via WebSocket
2. **Edge Extension** (Manifest V3) — lives in your browser, executes commands using Chrome APIs and content scripts
