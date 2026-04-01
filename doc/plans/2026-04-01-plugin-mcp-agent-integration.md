# Plugin MCP Agent Integration — Attempt Log

## Problem Statement

Paperclip has 3 MCP connector plugins (Asana, ClickUp, Freshsales) that proxy tools from remote MCP servers. The plugins install and connect successfully (157 tools discovered), but agents cannot see or use the tools.

Asana only works because it was added directly to Claude's MCP interface — NOT through the Paperclip plugin system.

---

## Attempt 1: Dynamic Tool Registration (REVERTED)

### What was tried

Added a full worker→host RPC path so that when a plugin worker calls `ctx.tools.register()`, it would also notify the host to register the tool in the `PluginToolRegistry`.

**Files changed:**
- `packages/plugins/sdk/src/protocol.ts` — added `agent.tools.register` and `agent.tools.execute` RPC methods
- `packages/plugins/sdk/src/worker-rpc-host.ts` — made `ctx.tools.register()` call `callHost("agent.tools.register", ...)`
- `packages/plugins/sdk/src/host-client-factory.ts` — added `tools` to `HostServices` interface and handler map
- `server/src/services/plugin-host-services.ts` — implemented `tools.register` handler calling `toolDispatcher.registerDynamicTool()`
- `server/src/services/plugin-tool-dispatcher.ts` — added `registerDynamicTool()` method
- `server/src/services/plugin-tool-registry.ts` — added `registerTool()` method exposing internal `addTool()`
- `server/src/app.ts` — passed `toolDispatcher` to `buildHostServices()`

### Why it didn't work

The tools were successfully registered in the in-memory `PluginToolRegistry` (confirmed: 157 tools, logs show "dynamically registered tool for plugin"). **But agents never query this registry.**

The agent execution path is:
1. `heartbeat.ts` builds a context object
2. Context is passed to the adapter (e.g., claude-local)
3. Adapter spawns Claude CLI with skills, env vars, etc.

**The `PluginToolRegistry` is never consulted during this process.** The registry is only used by the plugin REST API (`GET /api/plugins/tools`) for the UI. There is no code path that connects the registry to the agent execution pipeline.

### Why it was reverted

The changes worked at the registry level but accomplished nothing for agents. They added complexity to the SDK protocol, host services, and dispatcher without any user-visible benefit. Reverted to keep the codebase clean.

---

## Attempt 2: MCP Config Injection (CURRENT — has a bug)

### What was tried

Instead of going through the internal tool registry, pass the MCP server URLs directly to Claude CLI via `--mcp-config`. This way Claude Code connects to the MCP servers natively, same as when you configure them in Claude's UI.

**Files changed (still active):**
- `server/src/services/heartbeat.ts` — queries ready plugins for `mcpUrl` and `authToken` from their `pluginConfig.configJson`, injects as `context.paperclipMcpServers`
- `packages/adapters/claude-local/src/server/execute.ts` — reads `context.paperclipMcpServers`, generates a JSON file, passes `--mcp-config <path>` to Claude CLI

### Current status

Claude CLI IS reading the config and attempting to load the MCP servers. But it fails with:

```
Error: Invalid MCP configuration:
mcpServers.paperclip-asana-connector: Does not adhere to MCP server configuration schema
mcpServers.paperclip-clickup-connector: Does not adhere to MCP server configuration schema
mcpServers.paperclip-freshsales-connector: Does not adhere to MCP server configuration schema
```

### What's wrong

The JSON format is missing `"type": "http"`. I'm producing:

```json
{
  "mcpServers": {
    "paperclip-asana-connector": {
      "url": "https://asana.ssc.one/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

Claude Code requires `"type": "http"` for HTTP-based MCP servers. The correct format is:

```json
{
  "mcpServers": {
    "paperclip-asana-connector": {
      "type": "http",
      "url": "https://asana.ssc.one/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

**Verified**: Tested locally with `claude --mcp-config /dev/stdin` — without `type` it throws the exact error we see. With `"type": "http"` it connects and lists tools successfully.

### Fix

One-line change in `execute.ts`: add `type: "http"` to the server config object.

### Result: WORKING

After adding `"type": "http"` to the generated MCP config, agents successfully connect to all 3 MCP servers and can use their tools.

### Important context

- This approach only works for Claude-based adapters. Other adapters (OpenAI Codex, Cursor) would need their own MCP integration path.
- The 3 MCP servers are confirmed working via their Cloudflare tunnels (asana.ssc.one, clickup.ssc.one, freshsales.ssc.one)
- All 3 accept the same pre-shared bearer token: the one in their `MCP_ALLOWED_TOKENS` env var
- The Asana MCP server works when configured directly in Claude's MCP interface — so the servers themselves are fine

---

---

## Attempt 3: Kitchen Sink Smoke Test (TESTING)

### Hypothesis

The kitchen-sink example plugin declares tools statically in its manifest (not dynamically discovered). If agents can use kitchen-sink tools, the problem is that our MCP connector plugins discover tools at runtime instead of declaring them in the manifest. If agents CAN'T use kitchen-sink tools either, then the agent-tool bridge is genuinely unfinished for ALL plugins.

### What we're testing

Deploy the kitchen-sink plugin and check if its 3 manifest-declared tools (echo, company-summary, create-issue) appear to agents.

### Known issues (unrelated but blocking agent runs)

- Skills not loading: `gtm-analysis` and `sokolov-cro` show "not available from the Paperclip skills directory" in the skills tab despite being on disk at the expected path. Agent runs fail because required skills can't be mounted.
- MCP config format wrong: Bucket 2 changes generate invalid JSON for `--mcp-config`, causing "Does not adhere to MCP server configuration schema" errors on every agent run.

### Next steps depending on result

- **If kitchen-sink tools work**: Modify connector plugins to declare a proxy tool in manifest, or fix the MCP config JSON format
- **If kitchen-sink tools DON'T work**: The spec's agent-tool bridge is unfinished — need to wire dispatcher into heartbeat/adapter

---

## Files overview

### Plugin connectors (all 3 use the same HTTP MCP client pattern)
- `packages/plugins/examples/plugin-asana-connector/` — modified to add `authToken` direct config field
- `packages/plugins/examples/plugin-clickup-connector/` — NEW, created from asana pattern
- `packages/plugins/examples/plugin-freshsales-connector/` — rewritten from stdio to HTTP pattern

### Bucket 2 changes (active, needs fix)
- `server/src/services/heartbeat.ts` — line ~2580: queries plugin configs, injects `context.paperclipMcpServers`
- `packages/adapters/claude-local/src/server/execute.ts` — line ~358: generates MCP config JSON, passes `--mcp-config`

### Deploy scripts
- `packages/plugins/examples/plugin-*/deploy.sh` — build + docker cp to running container
