import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";

// ---------------------------------------------------------------------------
// Types — Telegram Bot API (minimal subset we actually use)
// ---------------------------------------------------------------------------

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  caption?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
}

// ---------------------------------------------------------------------------
// Types — Plugin config & state
// ---------------------------------------------------------------------------

interface TelegramConfig {
  botTokenRef?: string;
  defaultCompanyId?: string;
  defaultProjectId?: string;
  autoCreateIssues?: boolean;
  forwardAgentReplies?: boolean;
}

/** Persisted per-chat mapping stored in plugin state. */
interface ChatLink {
  chatId: string;
  issueId: string;
  companyId: string;
  projectId: string;
  chatTitle: string;
  createdAt: string;
}

/** Stats summary exposed to UI. */
interface TelegramStats {
  linkedChats: number;
  messagesForwarded: number;
  repliesSent: number;
  lastPollAt: string | null;
  botUsername: string | null;
  isConfigured: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLUGIN_NAME = "telegram-connector";
const TG_API = "https://api.telegram.org";
const STATE_STATS_KEY = "stats";
const STATE_OFFSET_KEY = "poll-offset";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chatDisplayName(chat: TelegramChat): string {
  if (chat.title) return chat.title;
  const parts = [chat.first_name, chat.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : `Chat ${chat.id}`;
}

function userDisplayName(user?: TelegramUser): string {
  if (!user) return "Unknown";
  const parts = [user.first_name, user.last_name].filter(Boolean);
  const name = parts.join(" ");
  return user.username ? `${name} (@${user.username})` : name;
}

function extractMessageText(msg: TelegramMessage): string {
  return msg.text ?? msg.caption ?? "";
}

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info(`${PLUGIN_NAME} setting up`);

    // ------ Telegram Bot API caller ------

    async function resolveToken(): Promise<string | null> {
      const config = (await ctx.config.get()) as TelegramConfig | null;
      const ref = config?.botTokenRef;
      if (!ref) return null;
      try {
        return await ctx.secrets.resolve(ref);
      } catch {
        ctx.logger.warn("Failed to resolve bot token secret ref", { ref });
        return null;
      }
    }

    async function tgCall<T = unknown>(method: string, body?: Record<string, unknown>): Promise<T | null> {
      const token = await resolveToken();
      if (!token) {
        ctx.logger.warn("Telegram API call skipped — no bot token configured");
        return null;
      }
      const url = `${TG_API}/bot${token}/${method}`;
      const resp = await ctx.http.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = (await resp.json()) as { ok: boolean; result?: T; description?: string };
      if (!data.ok) {
        ctx.logger.error(`Telegram API error on ${method}: ${data.description ?? "unknown"}`);
        return null;
      }
      return data.result ?? null;
    }

    // ------ State helpers ------

    async function getStats(): Promise<TelegramStats> {
      try {
        const raw = await ctx.state.get({ scopeKind: "instance", scopeId: "default", stateKey: STATE_STATS_KEY });
        if (raw) return raw as TelegramStats;
      } catch { /* first run */ }
      return {
        linkedChats: 0,
        messagesForwarded: 0,
        repliesSent: 0,
        lastPollAt: null,
        botUsername: null,
        isConfigured: false,
      };
    }

    async function saveStats(stats: TelegramStats): Promise<void> {
      await ctx.state.set({ scopeKind: "instance", scopeId: "default", stateKey: STATE_STATS_KEY }, stats);
    }

    async function getChatLink(chatId: string): Promise<ChatLink | null> {
      try {
        const raw = await ctx.state.get({
          scopeKind: "instance",
          scopeId: "default",
          stateKey: `chat:${chatId}`,
        });
        return raw ? (raw as ChatLink) : null;
      } catch {
        return null;
      }
    }

    async function saveChatLink(link: ChatLink): Promise<void> {
      await ctx.state.set(
        { scopeKind: "instance", scopeId: "default", stateKey: `chat:${link.chatId}` },
        link,
      );
    }

    async function getPollOffset(): Promise<number> {
      try {
        const raw = await ctx.state.get({
          scopeKind: "instance",
          scopeId: "default",
          stateKey: STATE_OFFSET_KEY,
        });
        return typeof raw === "number" ? raw : 0;
      } catch {
        return 0;
      }
    }

    async function savePollOffset(offset: number): Promise<void> {
      await ctx.state.set({ scopeKind: "instance", scopeId: "default", stateKey: STATE_OFFSET_KEY }, offset);
    }

    // ------ Core message handler ------

    async function handleTelegramMessage(msg: TelegramMessage): Promise<void> {
      const text = extractMessageText(msg);
      if (!text) return; // skip non-text messages for now

      const chatId = String(msg.chat.id);
      const sender = userDisplayName(msg.from);
      const chatName = chatDisplayName(msg.chat);
      const config = (await ctx.config.get()) as TelegramConfig | null;

      ctx.logger.info(`Telegram message from ${sender} in "${chatName}"`, { chatId });

      // Look up existing link
      let link = await getChatLink(chatId);

      // Auto-create issue if needed
      if (!link && config?.autoCreateIssues !== false) {
        const companyId = config?.defaultCompanyId;
        const projectId = config?.defaultProjectId;
        if (!companyId || !projectId) {
          ctx.logger.warn("Cannot auto-create issue: defaultCompanyId or defaultProjectId not configured");
          return;
        }

        try {
          const issue = await ctx.issues.create({
            title: `Telegram: ${chatName}`,
            description: `Linked Telegram chat **${chatName}** (ID: \`${chatId}\`).\n\nFirst message from ${sender}:\n> ${text}`,
            companyId,
            projectId,
          });

          link = {
            chatId,
            issueId: issue.id,
            companyId,
            projectId,
            chatTitle: chatName,
            createdAt: new Date().toISOString(),
          };
          await saveChatLink(link);

          // Store reverse mapping so we can find chat by issueId
          await ctx.state.set(
            { scopeKind: "instance", scopeId: "default", stateKey: `issue:${issue.id}` },
            { chatId },
          );

          const stats = await getStats();
          stats.linkedChats += 1;
          await saveStats(stats);

          await ctx.activity.log({
            companyId,
            message: `Linked Telegram chat "${chatName}" → issue ${issue.id}`,
            entityType: "issue",
            entityId: issue.id,
            metadata: { chatId, sender },
          });

          ctx.logger.info(`Created issue ${issue.id} for Telegram chat ${chatId}`);
        } catch (err) {
          ctx.logger.error("Failed to create issue for Telegram chat", { chatId, error: String(err) });
          return;
        }
      }

      if (!link) return;

      // Forward the message as a comment on the linked issue
      try {
        await ctx.issues.createComment(link.issueId, `**${sender}** (Telegram):\n> ${text}`, link.companyId);

        const stats = await getStats();
        stats.messagesForwarded += 1;
        await saveStats(stats);
      } catch (err) {
        ctx.logger.error("Failed to forward Telegram message to issue", {
          chatId,
          issueId: link.issueId,
          error: String(err),
        });
      }
    }

    // ------ Process a batch of Telegram updates ------

    async function processUpdates(updates: TelegramUpdate[]): Promise<void> {
      for (const update of updates) {
        const msg = update.message ?? update.edited_message ?? update.channel_post;
        if (msg) {
          await handleTelegramMessage(msg);
        }
      }
    }

    // ===================================================================
    // Webhook handler — Telegram pushes updates here
    // ===================================================================

    ctx.data.register("webhook:telegram-update", async (params: Record<string, unknown>) => {
      const body = params.body as TelegramUpdate | undefined;
      if (!body) return { ok: true };
      await processUpdates([body]);
      return { ok: true };
    });

    // ===================================================================
    // Polling job — fallback when webhooks aren't reachable
    // ===================================================================

    ctx.jobs.register("poll-updates", async () => {
      const offset = await getPollOffset();
      const updates = await tgCall<TelegramUpdate[]>("getUpdates", {
        offset: offset > 0 ? offset : undefined,
        timeout: 10,
        allowed_updates: ["message", "edited_message", "channel_post"],
      });

      if (!updates || updates.length === 0) {
        const stats = await getStats();
        stats.lastPollAt = new Date().toISOString();
        await saveStats(stats);
        return;
      }

      await processUpdates(updates);

      // Advance the offset past the last processed update
      const maxId = Math.max(...updates.map((u) => u.update_id));
      await savePollOffset(maxId + 1);

      const stats = await getStats();
      stats.lastPollAt = new Date().toISOString();
      await saveStats(stats);
    });

    // ===================================================================
    // Event: forward agent comments back to Telegram
    // ===================================================================

    ctx.events.on("issue.comment.created", async (event) => {
      const config = (await ctx.config.get()) as TelegramConfig | null;
      if (config?.forwardAgentReplies === false) return;

      const { issueId, companyId } = event.payload as { issueId: string; companyId: string };
      const comment = event.payload as { body?: string; authorType?: string };

      // Only forward agent-authored comments (not our own forwarded ones)
      if (comment.authorType !== "agent") return;
      if (!comment.body) return;

      // Look through state to find a chat linked to this issue
      // Since we don't have a reverse index, we store issue→chat mapping too
      try {
        const reverseLink = await ctx.state.get({
          scopeKind: "instance",
          scopeId: "default",
          stateKey: `issue:${issueId}`,
        }) as { chatId: string } | null;

        if (!reverseLink) return;

        await tgCall("sendMessage", {
          chat_id: reverseLink.chatId,
          text: comment.body,
          parse_mode: "MarkdownV2",
        });

        const stats = await getStats();
        stats.repliesSent += 1;
        await saveStats(stats);

        ctx.logger.info(`Forwarded agent reply to Telegram chat ${reverseLink.chatId}`);
      } catch (err) {
        ctx.logger.warn("Failed to forward agent reply to Telegram", { issueId, error: String(err) });
      }
    });

    // ===================================================================
    // Agent tools
    // ===================================================================

    ctx.tools.register(
      "sendTelegramMessage",
      {
        displayName: "Send Telegram Message",
        description: "Send a text message to a Telegram chat.",
        parametersSchema: {
          type: "object" as const,
          properties: {
            chatId: { type: "string" as const, description: "Telegram chat ID" },
            text: { type: "string" as const, description: "Message text" },
            parseMode: { type: "string" as const, description: "Parse mode (MarkdownV2, HTML, or empty)" },
          },
          required: ["chatId", "text"],
        },
      },
      async (rawParams) => {
        const params = rawParams as Record<string, unknown>;
        const chatId = params.chatId as string;
        const text = params.text as string;
        const parseMode = (params.parseMode as string) || undefined;

        const result = await tgCall("sendMessage", {
          chat_id: chatId,
          text,
          ...(parseMode ? { parse_mode: parseMode } : {}),
        });

        if (!result) {
          return { error: "Failed to send Telegram message" };
        }

        const stats = await getStats();
        stats.repliesSent += 1;
        await saveStats(stats);

        return { content: `Message sent to chat ${chatId}`, data: result };
      },
    );

    ctx.tools.register(
      "getTelegramChatInfo",
      {
        displayName: "Get Telegram Chat Info",
        description: "Retrieve metadata about a Telegram chat.",
        parametersSchema: {
          type: "object" as const,
          properties: {
            chatId: { type: "string" as const, description: "Telegram chat ID" },
          },
          required: ["chatId"],
        },
      },
      async (rawParams) => {
        const params = rawParams as Record<string, unknown>;
        const chatId = params.chatId as string;
        const result = await tgCall("getChat", { chat_id: chatId });
        if (!result) {
          return { error: "Failed to fetch chat info" };
        }
        return { data: result };
      },
    );

    // ===================================================================
    // Data handlers for the UI
    // ===================================================================

    ctx.data.register("stats", async () => {
      const stats = await getStats();
      // Check if configured
      const config = (await ctx.config.get()) as TelegramConfig | null;
      stats.isConfigured = !!config?.botTokenRef;

      // Fetch bot info if we have a token and haven't cached the username
      if (stats.isConfigured && !stats.botUsername) {
        const me = await tgCall<{ username?: string }>("getMe");
        if (me?.username) {
          stats.botUsername = me.username;
          await saveStats(stats);
        }
      }

      return stats;
    });

    ctx.data.register("linked-chats", async () => {
      // Return a list of all linked chats by scanning state keys
      // In a production plugin you'd use ctx.entities or a proper index.
      // For the NanoClaw-light approach we keep it simple and return stats.
      const stats = await getStats();
      return { count: stats.linkedChats };
    });

    ctx.data.register("config", async () => {
      const config = (await ctx.config.get()) as TelegramConfig | null;
      return {
        hasToken: !!config?.botTokenRef,
        defaultCompanyId: config?.defaultCompanyId ?? "",
        defaultProjectId: config?.defaultProjectId ?? "",
        autoCreateIssues: config?.autoCreateIssues !== false,
        forwardAgentReplies: config?.forwardAgentReplies !== false,
      };
    });

    // ===================================================================
    // Actions for the UI
    // ===================================================================

    ctx.actions.register("test-connection", async () => {
      const me = await tgCall<{ username?: string; first_name?: string }>("getMe");
      if (!me) {
        return { ok: false, error: "Could not connect to Telegram. Check your bot token." };
      }
      const stats = await getStats();
      stats.botUsername = me.username ?? null;
      stats.isConfigured = true;
      await saveStats(stats);
      return { ok: true, bot: me };
    });

    ctx.actions.register("set-webhook", async (params: Record<string, unknown>) => {
      const webhookUrl = params.webhookUrl as string | undefined;
      if (!webhookUrl) {
        return { ok: false, error: "webhookUrl is required" };
      }
      const result = await tgCall("setWebhook", {
        url: webhookUrl,
        allowed_updates: ["message", "edited_message", "channel_post"],
      });
      return { ok: !!result };
    });

    ctx.actions.register("remove-webhook", async () => {
      const result = await tgCall("deleteWebhook");
      return { ok: !!result };
    });

    ctx.logger.info(`${PLUGIN_NAME} setup complete`);
  },

  async onHealth() {
    return { status: "ok", message: `${PLUGIN_NAME} running` };
  },

  async onWebhook(input) {
    // Telegram sends updates as JSON POST body.
    // The main processing happens via the poll job or webhook data handler.
    // onWebhook is called by the host for inbound webhook requests.
    const _update = input.parsedBody as TelegramUpdate | undefined;
    // Processing is handled by the registered webhook data handler.
    void _update;
  },

  async onShutdown() {
    // nothing to clean up
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
