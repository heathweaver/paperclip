import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

type MockJsonRpcRequest = {
  jsonrpc: "2.0";
  id?: number;
  method: string;
  params?: unknown;
};

function jsonResponse(body: unknown, init?: { headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

function sseJsonResponse(body: unknown, init?: { headers?: Record<string, string> }) {
  return new Response(`event: message\ndata: ${JSON.stringify(body)}\n\n`, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      ...(init?.headers ?? {}),
    },
  });
}

describe("plugin-asana-connector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("connects to a remote MCP server and proxies discovered tools", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as MockJsonRpcRequest;
      switch (body.method) {
        case "initialize":
          return sseJsonResponse(
            { jsonrpc: "2.0", id: body.id, result: { serverInfo: { name: "asana-mcp" } } },
            { headers: { "mcp-session-id": "session-1" } },
          );
        case "notifications/initialized":
          return new Response("", { status: 202, headers: { "mcp-session-id": "session-1" } });
        case "tools/list":
          return sseJsonResponse({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              tools: [
                {
                  name: "asana.search_tasks",
                  description: "Search tasks",
                  inputSchema: {
                    type: "object",
                    properties: {
                      query: { type: "string" },
                    },
                    required: ["query"],
                  },
                },
              ],
            },
          });
        case "tools/call":
          return sseJsonResponse({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              content: [{ type: "text", text: "Found task ABC-123" }],
            },
          });
        default:
          throw new Error(`Unexpected RPC method: ${body.method}`);
      }
    });
    vi.stubGlobal("fetch", fetchMock);

    const harness = createTestHarness({
      manifest,
      config: {
        mcpUrl: "https://asana.ssc.one/mcp",
        authTokenRef: "secret://asana-mcp-token",
      },
    });

    await plugin.definition.setup(harness.ctx);

    const stats = await harness.getData<{
      isConfigured: boolean;
      mcpUrl: string;
      toolCount: number;
      toolNames: string[];
      mcpRunning: boolean;
    }>("stats");

    expect(stats.isConfigured).toBe(true);
    expect(stats.mcpUrl).toBe("https://asana.ssc.one/mcp");
    expect(stats.toolCount).toBe(1);
    expect(stats.toolNames).toEqual(["asana.search_tasks"]);
    expect(stats.mcpRunning).toBe(true);

    const toolResult = await harness.executeTool<{ content: string }>(
      "asana.search_tasks",
      { query: "onboarding" },
    );
    expect(toolResult.content).toContain("ABC-123");

    expect(fetchMock).toHaveBeenCalled();
    const authHeaders = fetchMock.mock.calls
      .map((call) => call[1]?.headers as Record<string, string> | undefined)
      .find(Boolean);
    expect(authHeaders?.authorization).toBe("Bearer resolved:secret://asana-mcp-token");
  });

  it("reports an unreachable remote MCP server as a failed test connection", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED");
    });
    vi.stubGlobal("fetch", fetchMock);

    const harness = createTestHarness({
      manifest,
      config: {
        mcpUrl: "https://asana.ssc.one/mcp",
      },
    });

    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction<{ ok: boolean; error?: string }>("test-connection");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Could not connect to remote MCP server");
  });
});
