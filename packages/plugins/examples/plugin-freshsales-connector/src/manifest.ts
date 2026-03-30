import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "paperclip-freshsales-connector",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Freshsales Connector",
  description:
    "Thin MCP bridge — spawns your Freshsales MCP server and proxies all its tools as Paperclip agent tools. Tools are discovered dynamically at startup via tools/list.",
  author: "Paperclip",
  categories: ["connector"],

  capabilities: [
    "http.outbound",
    "secrets.read-ref",
    "agent.tools.register",
    "plugin.state.read",
    "plugin.state.write",
    "ui.page.register",
    "ui.dashboardWidget.register",
    "instance.settings.register",
  ],

  instanceConfigSchema: {
    type: "object",
    properties: {
      apiKeyRef: {
        type: "string",
        title: "Freshsales API Key (secret ref)",
        description:
          "Secret reference for the Freshsales API key, injected as FRESHSALES_API_KEY env var to the MCP server.",
      },
      bundleAlias: {
        type: "string",
        title: "Bundle Alias",
        description:
          "Your Freshworks bundle alias (e.g. 'acme' for acme.myfreshworks.com), injected as FRESHSALES_BUNDLE_ALIAS env var.",
      },
      mcpCommand: {
        type: "string",
        title: "MCP Server Command",
        default: "npx",
        description: "Command to launch the MCP server (default: npx).",
      },
      mcpArgs: {
        type: "string",
        title: "MCP Server Args",
        description:
          "Space-separated arguments for the MCP server command (e.g. '-y @your-org/mcp-server-freshsales').",
      },
    },
    required: ["apiKeyRef", "bundleAlias", "mcpArgs"],
  },

  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },

  // Tools are discovered dynamically from the MCP server — not declared statically.

  ui: {
    slots: [
      {
        type: "page",
        id: "freshsales-page",
        displayName: "Freshsales",
        exportName: "FreshsalesPage",
        routePath: "freshsales",
      },
      {
        type: "dashboardWidget",
        id: "freshsales-widget",
        displayName: "Freshsales Status",
        exportName: "FreshsalesWidget",
      },
      {
        type: "settingsPage",
        id: "freshsales-settings",
        displayName: "Freshsales Settings",
        exportName: "FreshsalesSettings",
      },
    ],
  },
};

export default manifest;
