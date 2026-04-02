import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "paperclip-facebook-ads-connector",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Facebook Ads Connector",
  description:
    "Thin MCP bridge — connects to your remote Facebook Ads MCP server and proxies all its tools as Paperclip agent tools. Tools are discovered dynamically at startup via tools/list.",
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
          "HTTPS URL for your remote Facebook Ads MCP server (for example https://metaads.ssc.one/mcp).",
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

  ui: {
    slots: [
      {
        type: "page",
        id: "facebook-ads-page",
        displayName: "Facebook Ads",
        exportName: "FacebookAdsPage",
        routePath: "facebook-ads",
      },
      {
        type: "dashboardWidget",
        id: "facebook-ads-widget",
        displayName: "Facebook Ads Status",
        exportName: "FacebookAdsWidget",
      },
      {
        type: "settingsPage",
        id: "facebook-ads-settings",
        displayName: "Facebook Ads Settings",
        exportName: "FacebookAdsSettings",
      },
    ],
  },
};

export default manifest;
