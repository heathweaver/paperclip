import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "paperclip-asana-connector",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Asana Connector",
  description:
    "Thin MCP bridge — spawns your Asana MCP server and proxies all its tools as Paperclip agent tools. Tools are discovered dynamically at startup via tools/list.",
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
      accessTokenRef: {
        type: "string",
        title: "Asana Access Token (secret ref)",
        description:
          "Secret reference for the Asana PAT, injected as ASANA_ACCESS_TOKEN env var to the MCP server.",
      },
      defaultWorkspaceGid: {
        type: "string",
        title: "Default Workspace GID",
        description: "Default Asana workspace GID (optional).",
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
        default: "-y @roychri/mcp-server-asana",
        description:
          "Space-separated arguments for the MCP server command (e.g. '-y @roychri/mcp-server-asana').",
      },
    },
    required: ["accessTokenRef"],
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
        id: "asana-page",
        displayName: "Asana",
        exportName: "AsanaPage",
        routePath: "asana",
      },
      {
        type: "dashboardWidget",
        id: "asana-widget",
        displayName: "Asana Status",
        exportName: "AsanaWidget",
      },
      {
        type: "settingsPage",
        id: "asana-settings",
        displayName: "Asana Settings",
        exportName: "AsanaSettings",
      },
    ],
  },
};

export default manifest;
