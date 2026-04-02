import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "paperclip-clickup-connector",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "ClickUp Connector",
  description:
    "Thin MCP bridge — connects to your remote ClickUp MCP server and proxies all its tools as Paperclip agent tools. Tools are discovered dynamically at startup via tools/list.",
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
          "HTTPS URL for your remote ClickUp MCP server (for example https://clickup.ssc.one/mcp).",
      },
      authToken: {
        type: "string",
        title: "Remote MCP Auth Token",
        description:
          "Bearer token sent to the remote MCP server. Use this for pre-shared tokens.",
      },
      authTokenRef: {
        type: "string",
        title: "Remote MCP Auth Token (secret ref)",
        description:
          "Optional secret UUID reference. If authToken is set, this is ignored.",
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
        id: "clickup-page",
        displayName: "ClickUp",
        exportName: "ClickUpPage",
        routePath: "clickup",
      },
      {
        type: "dashboardWidget",
        id: "clickup-widget",
        displayName: "ClickUp Status",
        exportName: "ClickUpWidget",
      },
      {
        type: "settingsPage",
        id: "clickup-settings",
        displayName: "ClickUp Settings",
        exportName: "ClickUpSettings",
      },
    ],
  },
};

export default manifest;
