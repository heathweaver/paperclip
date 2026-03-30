import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "paperclip-asana-connector",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Asana Connector",
  description:
    "Thin MCP bridge — connects to your remote Asana MCP server and proxies all its tools as Paperclip agent tools. Tools are discovered dynamically at startup via tools/list.",
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
      mcpUrl: {
        type: "string",
        title: "Remote MCP URL",
        description:
          "HTTPS URL for your remote Asana MCP server (for example https://asana.ssc.one/mcp).",
      },
      authTokenRef: {
        type: "string",
        title: "Remote MCP Auth Token (secret ref)",
        description:
          "Optional secret reference for a bearer token sent to the remote MCP server.",
      },
      defaultWorkspaceGid: {
        type: "string",
        title: "Default Workspace GID",
        description: "Default Asana workspace GID (optional).",
      },
    },
    required: ["mcpUrl"],
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
