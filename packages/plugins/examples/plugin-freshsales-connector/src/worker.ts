import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import { spawn, type ChildProcess } from "node:child_process";

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

interface McpToolDeclaration {
  name: string;
  description?: string;
  inputSchema?: { type: string; properties?: Record<string, unknown>; required?: string[] };
}

interface McpToolResult {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface FreshsalesMcpConfig {
  apiKeyRef?: string;
  bundleAlias?: string;
  mcpCommand?: string;
  mcpArgs?: string;
}

// ---------------------------------------------------------------------------
// MCP stdio client — lightweight JSON-RPC over stdin/stdout
// ---------------------------------------------------------------------------

class McpStdioClient {
  private proc: ChildProcess | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: JsonRpcResponse) => void; reject: (e: Error) => void }>();
  private buffer = "";

  constructor(
    private command: string,
    private args: string[],
    private env: Record<string, string>,
    private logger: { info: (m: string, meta?: Record<string, unknown>) => void; error: (m: string, meta?: Record<string, unknown>) => void },
  ) {}

  async start(): Promise<void> {
    this.proc = spawn(this.command, this.args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...this.env },
    });

    this.proc.stdout?.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString();
      this.processBuffer();
    });

    this.proc.stderr?.on("data", (chunk: Buffer) => {
      this.logger.error("MCP server stderr", { text: chunk.toString().trim() });
    });

    this.proc.on("exit", (code) => {
      this.logger.info(`MCP server exited with code ${code}`);
      for (const p of this.pending.values()) p.reject(new Error("MCP server exited"));
      this.pending.clear();
    });

    // Initialize MCP session
    await this.send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "paperclip-freshsales-connector", version: "0.1.0" },
    });
    await this.notify("notifications/initialized", {});
  }

  private processBuffer(): void {
    let newlineIdx: number;
    while ((newlineIdx = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newlineIdx).trim();
      this.buffer = this.buffer.slice(newlineIdx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as JsonRpcResponse;
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          this.pending.get(msg.id)!.resolve(msg);
          this.pending.delete(msg.id);
        }
      } catch {
        // skip malformed lines
      }
    }
  }

  async send(method: string, params?: unknown): Promise<unknown> {
    if (!this.proc?.stdin?.writable) throw new Error("MCP server not running");
    const id = this.nextId++;
    const req: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (resp) => {
          if (resp.error) reject(new Error(resp.error.message));
          else resolve(resp.result);
        },
        reject,
      });
      this.proc!.stdin!.write(JSON.stringify(req) + "\n");
    });
  }

  async notify(method: string, params?: unknown): Promise<void> {
    if (!this.proc?.stdin?.writable) return;
    const msg = { jsonrpc: "2.0", method, params };
    this.proc.stdin.write(JSON.stringify(msg) + "\n");
  }

  async listTools(): Promise<McpToolDeclaration[]> {
    const result = (await this.send("tools/list", {})) as { tools?: McpToolDeclaration[] };
    return result?.tools ?? [];
  }

  async callTool(name: string, args: unknown): Promise<McpToolResult> {
    return (await this.send("tools/call", { name, arguments: args })) as McpToolResult;
  }

  stop(): void {
    this.proc?.kill("SIGTERM");
    this.proc = null;
  }

  get isRunning(): boolean {
    return this.proc !== null && !this.proc.killed;
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

const PLUGIN_NAME = "freshsales-connector";

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info(`${PLUGIN_NAME} setting up`);

    let mcpClient: McpStdioClient | null = null;
    let discoveredTools: McpToolDeclaration[] = [];

    // ------ Resolve MCP server config ------

    async function getConfig(): Promise<FreshsalesMcpConfig> {
      return ((await ctx.config.get()) as FreshsalesMcpConfig | null) ?? {};
    }

    async function ensureMcpClient(): Promise<McpStdioClient | null> {
      if (mcpClient?.isRunning) return mcpClient;

      const config = await getConfig();
      const command = config.mcpCommand || "npx";
      const rawArgs = config.mcpArgs || "";
      if (!rawArgs) {
        ctx.logger.warn("No MCP server command configured (mcpArgs is empty)");
        return null;
      }
      const args = rawArgs.split(/\s+/).filter(Boolean);

      // Resolve credentials for the MCP server env
      const env: Record<string, string> = {};
      if (config.apiKeyRef) {
        try {
          const key = await ctx.secrets.resolve(config.apiKeyRef);
          env.FRESHSALES_API_KEY = key;
        } catch {
          ctx.logger.warn("Failed to resolve Freshsales API key");
          return null;
        }
      }
      if (config.bundleAlias) {
        env.FRESHSALES_BUNDLE_ALIAS = config.bundleAlias;
      }

      mcpClient = new McpStdioClient(command, args, env, ctx.logger);

      try {
        await mcpClient.start();
        ctx.logger.info("MCP server started");
      } catch (err) {
        ctx.logger.error("Failed to start MCP server", { error: String(err) });
        mcpClient = null;
        return null;
      }

      return mcpClient;
    }

    // ------ Discover and register MCP tools ------

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

      for (const tool of discoveredTools) {
        ctx.tools.register(
          tool.name,
          {
            displayName: tool.name,
            description: tool.description ?? `Freshsales MCP tool: ${tool.name}`,
            parametersSchema: tool.inputSchema ?? { type: "object" as const, properties: {} },
          },
          async (rawParams) => {
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

    // ===================================================================
    // Data & actions for UI
    // ===================================================================

    ctx.data.register("stats", async () => {
      const config = await getConfig();
      return {
        isConfigured: !!(config.apiKeyRef && config.mcpArgs),
        bundleAlias: config.bundleAlias ?? null,
        mcpCommand: config.mcpCommand || "npx",
        mcpArgs: config.mcpArgs || "",
        toolCount: discoveredTools.length,
        toolNames: discoveredTools.map((t) => t.name),
        mcpRunning: mcpClient?.isRunning ?? false,
      };
    });

    ctx.data.register("config", async () => {
      const config = await getConfig();
      return {
        hasApiKey: !!config.apiKeyRef,
        bundleAlias: config.bundleAlias ?? "",
        mcpCommand: config.mcpCommand ?? "npx",
        mcpArgs: config.mcpArgs ?? "",
      };
    });

    ctx.actions.register("test-connection", async () => {
      const client = await ensureMcpClient();
      if (!client) return { ok: false, error: "Could not start MCP server" };
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

  async onShutdown() {
    // Client cleanup happens via process exit
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
