# Claude Browser Bridge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an Edge extension + MCP server that gives Claude Code full access to live browser tabs.

**Architecture:** Two-component system: (1) Node.js MCP server speaks stdio to Claude Code, hosts WebSocket on localhost:9876; (2) Edge Manifest V3 extension connects to WebSocket, executes commands using Chrome APIs.

**Tech Stack:** TypeScript, @modelcontextprotocol/sdk, ws, zod, esbuild, pixelmatch, Chrome Extension Manifest V3

**Security Note:** The execute_script tool runs JS in page context via chrome.scripting.executeScript (the Chrome extension API for script injection). Only accessible via localhost WebSocket from authenticated Claude Code session.

---

See the full plan content in the conversation context. The plan has 12 tasks:

1. Initialize Monorepo and Shared Types
2. MCP Server Core Setup and WebSocket
3. MCP Server Navigation Tools
4. MCP Server Visual Tools (Screenshot, Diff)
5. MCP Server DOM & Interaction Tools
6. MCP Server Console, Network & Page State Tools
7. MCP Server Dev Workflow Tools
8. Edge Extension Manifest and Service Worker Core
9. Edge Extension Content Script
10. Extension Side Panel and Icons
11. Claude Code Integration Config and README
12. Full Build and End-to-End Verification

Each task includes exact file paths, complete code, build commands, and commit messages.
