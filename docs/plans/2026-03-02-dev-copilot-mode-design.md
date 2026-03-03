# Dev Copilot Mode — Browser Bridge Super Dev Helper

**Date:** 2026-03-02
**Status:** Approved

## Goal

Transform the Claude Browser Bridge from a tool collection into a proactive development partner that auto-monitors localhost builds, classifies errors, and gives Claude Code full insight into the frontend state — enabling auto-diagnose + fix workflows.

## Current State

41 MCP tools across navigation, screenshots, DOM, console/network monitoring, storage, DevTools. Console logs auto-captured from page load via MAIN world content script. Network monitoring requires manual enable.

## Design

### 1. New Composite MCP Tools

#### `dev_health` — Full state snapshot in one call
Returns:
- Console errors/warnings since last check (count + last 10)
- Failed network requests (4xx/5xx) with URL, status, method
- Slow requests (>2s) with duration
- Current page URL + title
- Screenshot (base64 PNG)
- Performance metrics (load time, FCP, DOM nodes, memory)
- Framework status: React error overlay detected, Next.js compilation error detected, HMR status
- Error summary: total errors, total warnings, total network failures

#### `dev_watch` — Start/stop active monitoring
- Auto-starts network monitoring on localhost tabs
- Enables framework-specific detection (Next.js overlay, React errors, HMR)
- Returns current watch state

#### `dev_errors` — Smart error retrieval
- Errors grouped and deduplicated (repeated errors collapsed with count)
- Classified by type: `runtime-error`, `network-error`, `react-error`, `nextjs-build-error`, `hydration-mismatch`, `unhandled-rejection`
- Sorted by severity: build > runtime > network > warning
- Includes source file + line number when available
- Includes stack traces when available

### 2. Network Intelligence

Auto-capture on all localhost tabs (no manual enable needed):
- Flag 4xx/5xx responses
- Track request duration, flag slow requests (>2s)
- Detect CORS errors
- Group requests by endpoint pattern (e.g., `/api/email/sync` x 5, 3 failed)
- Capture JSON response bodies for failed requests (size-limited to 4KB)

### 3. Next.js / React Framework Detection

Content script additions via MutationObserver:
- **Next.js error overlay**: Watch for `nextjs-portal`, `nextjs__container_errors_` elements, extract error text
- **HMR status**: Classify HMR logs (`[HMR] connected`, `[Fast Refresh]`, build errors)
- **Hydration mismatches**: Detect hydration warning patterns in console
- **React error boundaries**: Detect error boundary fallback DOM
- **Compilation errors**: Parse Next.js `Failed to compile` patterns

### 4. Visual Regression

- Auto-screenshot on URL change (store with URL label)
- Before/after comparison available via existing `visual_diff` tool
- Screenshots stored in background with max 20 entries (LRU eviction)

### 5. Enhanced Console Capture

Upgrade console-hooks.ts:
- Capture stack traces via `new Error().stack`
- Parse source file + line number from stack
- Capture object details (not just `[object Object]`)
- Increased max logs to 2000 per tab

### 6. Auto-Watch Architecture

```
Page loads on localhost
  -> console-hooks.ts: captures ALL logs with stack traces
  -> content.ts: relays logs + runs framework detection (MutationObserver)
  -> background.ts: classifies errors, auto-starts network monitoring
  -> MCP server: exposes via dev_health / dev_errors / dev_watch

Claude Code workflow:
  1. Start session -> dev_health -> full picture
  2. Make code change -> HMR reloads -> dev_health -> check for breakage
  3. Error detected -> dev_errors -> grouped, classified, with source
  4. Read source file -> fix -> dev_health -> verify fix worked
```

## New Files

- `packages/extension/src/error-classifier.ts` — Classifies console logs into categories
- `packages/extension/src/network-tracker.ts` — Enhanced network with timing + auto-flag
- `packages/extension/src/framework-detector.ts` — Next.js/React detection via DOM + console patterns
- `packages/mcp-server/src/tools/dev-tools.ts` — New composite MCP tools

## Modified Files

- `packages/extension/src/background.ts` — Wire up new modules, auto-watch localhost
- `packages/extension/src/content.ts` — Framework detection relay, error classification
- `packages/extension/src/console-hooks.ts` — Stack trace capture, better serialization
- `packages/mcp-server/src/server.ts` — Register new tools
- `packages/shared/src/protocol.ts` — New types

## Not Changing

- WebSocket bridge architecture
- Connection/reconnect logic
- Existing 41 tools (all preserved)
- Manifest permissions (already have everything needed)
