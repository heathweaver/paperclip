import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const PLUGIN_ID = "paperclip-telegram-connector";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Telegram Connector",
  description:
    "Lightweight Telegram bridge — forwards Telegram messages to Paperclip issues and lets agents reply back through the bot. Inspired by the NanoClaw approach: minimal surface, maximal utility.",
  author: "Paperclip",
  categories: ["connector"],

  capabilities: [
    // Domain reads
    "companies.read",
    "projects.read",
    "issues.read",
    "issues.create",
    "issues.update",
    "issue.comments.read",
    "issue.comments.create",
    // Agent interaction
    "agents.read",
    "agents.invoke",
    // Events & jobs
    "events.subscribe",
    "jobs.schedule",
    // Outbound HTTP (Telegram Bot API)
    "http.outbound",
    // Secrets (bot token)
    "secrets.read-ref",
    // State (chat↔issue mapping)
    "plugin.state.read",
    "plugin.state.write",
    // Activity logging
    "activity.log.write",
    // Webhooks (Telegram updates)
    "webhooks.receive",
    // Agent tools
    "agent.tools.register",
    // UI
    "ui.page.register",
    "ui.dashboardWidget.register",
    "instance.settings.register",
  ],

  instanceConfigSchema: {
    type: "object",
    properties: {
      botTokenRef: {
        type: "string",
        title: "Bot Token (secret ref)",
        description:
          "Secret reference for the Telegram Bot API token (e.g. secret:telegram-bot-token). Create a bot via @BotFather on Telegram.",
      },
      defaultCompanyId: {
        type: "string",
        title: "Default Company ID",
        description: "Company to create issues under when a new Telegram chat starts.",
      },
      defaultProjectId: {
        type: "string",
        title: "Default Project ID",
        description: "Project to create issues under when a new Telegram chat starts.",
      },
      autoCreateIssues: {
        type: "boolean",
        title: "Auto-create Issues",
        default: true,
        description: "Automatically create a Paperclip issue for new Telegram chats.",
      },
      forwardAgentReplies: {
        type: "boolean",
        title: "Forward Agent Replies",
        default: true,
        description: "When an agent comments on a linked issue, forward the reply to Telegram.",
      },
    },
    required: ["botTokenRef"],
  },

  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },

  webhooks: [
    {
      endpointKey: "telegram-update",
      displayName: "Telegram Update",
      description: "Receives Telegram Bot API webhook updates (messages, callbacks, etc.)",
    },
  ],

  jobs: [
    {
      jobKey: "poll-updates",
      displayName: "Poll Telegram Updates",
      description:
        "Fallback long-polling job for environments where inbound webhooks are unavailable. Polls getUpdates every 30 seconds.",
      schedule: "*/1 * * * *",
    },
  ],

  tools: [
    {
      name: "sendTelegramMessage",
      displayName: "Send Telegram Message",
      description:
        "Send a text message to a Telegram chat. Agents can use this to reply to users who contacted via Telegram.",
      parametersSchema: {
        type: "object",
        properties: {
          chatId: {
            type: "string",
            description: "Telegram chat ID to send the message to.",
          },
          text: {
            type: "string",
            description: "Message text (supports Telegram MarkdownV2).",
          },
          parseMode: {
            type: "string",
            enum: ["MarkdownV2", "HTML", ""],
            description: "Optional parse mode for formatting.",
          },
        },
        required: ["chatId", "text"],
      },
    },
    {
      name: "getTelegramChatInfo",
      displayName: "Get Telegram Chat Info",
      description: "Retrieve metadata about a Telegram chat (title, type, member count).",
      parametersSchema: {
        type: "object",
        properties: {
          chatId: {
            type: "string",
            description: "Telegram chat ID.",
          },
        },
        required: ["chatId"],
      },
    },
  ],

  ui: {
    slots: [
      {
        type: "page",
        id: "telegram-page",
        displayName: "Telegram",
        exportName: "TelegramPage",
        routePath: "telegram",
      },
      {
        type: "dashboardWidget",
        id: "telegram-widget",
        displayName: "Telegram Activity",
        exportName: "TelegramWidget",
      },
      {
        type: "settingsPage",
        id: "telegram-settings",
        displayName: "Telegram Settings",
        exportName: "TelegramSettings",
      },
    ],
  },
};

export default manifest;
