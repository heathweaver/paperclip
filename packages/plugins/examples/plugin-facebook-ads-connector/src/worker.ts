import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";

// ---------------------------------------------------------------------------
// MCP JSON-RPC types (minimal subset)
// ---------------------------------------------------------------------------

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

interface McpToolDeclaration {
  name: string;
  description?: string;
  inputSchema?: { type: string; properties?: Record<string, unknown>; required?: string[] };
}

interface McpToolResult {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

function parseSseJsonResponse(text: string): JsonRpcResponse | null {
  const eventLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("data: "));

  if (!eventLine) return null;

  const rawJson = eventLine.slice("data: ".length).trim();
  if (!rawJson) return null;

  return JSON.parse(rawJson) as JsonRpcResponse;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface FacebookAdsMcpConfig {
  mcpUrl?: string;
  authToken?: string;
  authTokenRef?: string;
}

// ---------------------------------------------------------------------------
// MCP HTTP client — lightweight JSON-RPC over a remote HTTPS endpoint
// ---------------------------------------------------------------------------

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

class McpHttpClient {
  private nextId = 1;
  private sessionId: string | null = null;
  private started = false;

  constructor(
    private url: string,
    private authToken: string | null,
    private fetcher: FetchLike,
    private logger: { info: (m: string, meta?: Record<string, unknown>) => void; error: (m: string, meta?: Record<string, unknown>) => void },
  ) {}

  async start(): Promise<void> {
    if (this.started) return;
    await this.send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "paperclip-facebook-ads-connector", version: "0.1.0" },
    });
    await this.notify("notifications/initialized", {});
    this.started = true;
  }

  private buildHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    };
    if (this.authToken) {
      headers.authorization = `Bearer ${this.authToken}`;
    }
    if (this.sessionId) {
      headers["mcp-session-id"] = this.sessionId;
    }
    return headers;
  }

  private async post(body: JsonRpcRequest | JsonRpcNotification): Promise<JsonRpcResponse | null> {
    const response = await this.fetcher(this.url, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });

    const sessionId = response.headers.get("mcp-session-id");
    if (sessionId) {
      this.sessionId = sessionId;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Remote MCP request failed (${response.status}): ${text || response.statusText}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return (await response.json()) as JsonRpcResponse;
    }

    const text = await response.text().catch(() => "");
    if (!text.trim()) return null;

    if (contentType.includes("text/event-stream")) {
      const parsed = parseSseJsonResponse(text);
      if (parsed) return parsed;
      throw new Error("Remote MCP response did not contain an SSE data payload");
    }

    throw new Error(`Unsupported MCP response content-type: ${contentType || "unknown"}`);
  }

  async send(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const req: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
    const resp = await this.post(req);
    if (!resp) {
      throw new Error(`Remote MCP request '${method}' returned no response body`);
    }
    if (resp.error) {
      throw new Error(resp.error.message);
    }
    return resp.result;
  }

  async notify(method: string, params?: unknown): Promise<void> {
    const msg: JsonRpcNotification = { jsonrpc: "2.0", method, params };
    await this.post(msg);
  }

  async listTools(): Promise<McpToolDeclaration[]> {
    const result = (await this.send("tools/list", {})) as { tools?: McpToolDeclaration[] };
    return result?.tools ?? [];
  }

  async callTool(name: string, args: unknown): Promise<McpToolResult> {
    return (await this.send("tools/call", { name, arguments: args })) as McpToolResult;
  }

  stop(): void {
    this.started = false;
    this.sessionId = null;
  }

  get isRunning(): boolean {
    return this.started;
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

const PLUGIN_NAME = "facebook-ads-connector";

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info(`${PLUGIN_NAME} setting up`);

    let mcpClient: McpHttpClient | null = null;
    let discoveredTools: McpToolDeclaration[] = [];
    let toolRegistrationRevision = 0;

    async function getConfig(): Promise<FacebookAdsMcpConfig> {
      return ((await ctx.config.get()) as FacebookAdsMcpConfig | null) ?? {};
    }

    async function ensureMcpClient(): Promise<McpHttpClient | null> {
      if (mcpClient?.isRunning) return mcpClient;

      const config = await getConfig();
      const mcpUrl = config.mcpUrl?.trim();
      if (!mcpUrl) {
        ctx.logger.warn("Missing remote MCP URL");
        return null;
      }

      let authToken: string | null = config.authToken?.trim() || null;
      if (!authToken && config.authTokenRef) {
        try {
          authToken = await ctx.secrets.resolve(config.authTokenRef);
        } catch {
          ctx.logger.warn("Failed to resolve remote MCP auth token");
          return null;
        }
      }

      mcpClient = new McpHttpClient(mcpUrl, authToken, ctx.http.fetch, ctx.logger);

      try {
        await mcpClient.start();
        ctx.logger.info("Remote MCP server connected", { mcpUrl });
      } catch (err) {
        ctx.logger.error("Failed to connect to remote MCP server", { error: String(err), mcpUrl });
        mcpClient = null;
        return null;
      }

      return mcpClient;
    }

    async function discoverAndRegisterTools(): Promise<void> {
      const client = await ensureMcpClient();
      if (!client) {
        ctx.logger.warn("Skipping tool discovery — MCP server not available");
        return;
      }

      try {
        discoveredTools = await client.listTools();
        ctx.logger.info(`Discovered ${discoveredTools.length} tools from MCP server`);
      } catch (err) {
        ctx.logger.error("Failed to discover MCP tools", { error: String(err) });
        return;
      }

      toolRegistrationRevision += 1;
      const currentRevision = toolRegistrationRevision;
      for (const tool of discoveredTools) {
        ctx.tools.register(
          tool.name,
          {
            displayName: tool.name,
            description: tool.description ?? `Facebook Ads MCP tool: ${tool.name}`,
            parametersSchema: tool.inputSchema ?? { type: "object" as const, properties: {} },
          },
          async (rawParams) => {
            if (currentRevision !== toolRegistrationRevision) {
              return { error: "Tool registration is stale. Refresh and retry." };
            }
            const currentClient = await ensureMcpClient();
            if (!currentClient) return { error: "MCP server not available" };

            try {
              const result = await currentClient.callTool(tool.name, rawParams);
              if (result.isError) {
                const errorText = result.content?.map((c) => c.text).join("\n") ?? "Unknown error";
                return { error: errorText };
              }
              const text = result.content?.map((c) => c.text).join("\n") ?? "";
              return { content: text };
            } catch (err) {
              return { error: `MCP tool call failed: ${err instanceof Error ? err.message : String(err)}` };
            }
          },
        );
      }
    }

    await discoverAndRegisterTools();

    ctx.data.register("stats", async () => {
      const config = await getConfig();
      return {
        isConfigured: !!config.mcpUrl,
        mcpUrl: config.mcpUrl || "",
        toolCount: discoveredTools.length,
        toolNames: discoveredTools.map((t) => t.name),
        mcpRunning: mcpClient?.isRunning ?? false,
      };
    });

    ctx.data.register("config", async () => {
      const config = await getConfig();
      return {
        hasToken: !!(config.authToken || config.authTokenRef),
        mcpUrl: config.mcpUrl ?? "",
      };
    });

    ctx.actions.register("test-connection", async () => {
      const client = await ensureMcpClient();
      if (!client) return { ok: false, error: "Could not connect to remote MCP server" };
      try {
        const tools = await client.listTools();
        return { ok: true, toolCount: tools.length, tools: tools.map((t) => t.name) };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    });

    ctx.actions.register("refresh-tools", async () => {
      await discoverAndRegisterTools();
      return { ok: true, toolCount: discoveredTools.length };
    });

    ctx.logger.info(`${PLUGIN_NAME} setup complete — ${discoveredTools.length} MCP tools proxied`);
  },

  async onHealth() {
    return { status: "ok", message: `${PLUGIN_NAME} running` };
  },

  async onShutdown() {},
});

export default plugin;
runWorker(plugin, import.meta.url);
