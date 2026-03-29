import type {
  PluginPageProps,
  PluginWidgetProps,
  PluginSettingsPageProps,
} from "@paperclipai/plugin-sdk/ui";
import { usePluginAction, usePluginData } from "@paperclipai/plugin-sdk/ui";
import { useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TelegramStats {
  linkedChats: number;
  messagesForwarded: number;
  repliesSent: number;
  lastPollAt: string | null;
  botUsername: string | null;
  isConfigured: boolean;
}

interface TelegramConfigView {
  hasToken: boolean;
  defaultCompanyId: string;
  defaultProjectId: string;
  autoCreateIssues: boolean;
  forwardAgentReplies: boolean;
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const card: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "8px",
  backgroundColor: "var(--card)",
  padding: "16px",
};

const statBox: React.CSSProperties = {
  textAlign: "center" as const,
  padding: "12px",
  borderRadius: "6px",
  backgroundColor: "color-mix(in oklab, var(--accent) 30%, transparent)",
};

const statNumber: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: 700,
  color: "var(--foreground)",
  lineHeight: 1.2,
};

const statLabel: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 500,
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
  color: "var(--muted-foreground)",
  marginTop: "4px",
};

const badge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  padding: "2px 8px",
  borderRadius: "9999px",
  fontSize: "11px",
  fontWeight: 600,
};

const badgeGreen: React.CSSProperties = {
  ...badge,
  backgroundColor: "color-mix(in oklab, oklch(0.72 0.17 142) 20%, transparent)",
  color: "oklch(0.72 0.17 142)",
};

const badgeYellow: React.CSSProperties = {
  ...badge,
  backgroundColor: "color-mix(in oklab, oklch(0.80 0.15 85) 20%, transparent)",
  color: "oklch(0.75 0.15 85)",
};

const btnPrimary: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: "6px",
  border: "1px solid var(--border)",
  backgroundColor: "var(--primary)",
  color: "var(--primary-foreground)",
  fontSize: "13px",
  fontWeight: 500,
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  ...btnPrimary,
  backgroundColor: "var(--background)",
  color: "var(--foreground)",
};

// ---------------------------------------------------------------------------
// Dashboard Widget
// ---------------------------------------------------------------------------

export function TelegramWidget({ context }: PluginWidgetProps) {
  const { data: stats, loading } = usePluginData<TelegramStats>("stats", {});

  if (loading || !stats) {
    return (
      <div style={card}>
        <div style={{ color: "var(--muted-foreground)", fontSize: "13px" }}>Loading Telegram stats...</div>
      </div>
    );
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--foreground)" }}>Telegram</div>
        {stats.isConfigured ? (
          <span style={badgeGreen}>Connected</span>
        ) : (
          <span style={badgeYellow}>Not configured</span>
        )}
      </div>
      {stats.botUsername && (
        <div style={{ fontSize: "12px", color: "var(--muted-foreground)", marginBottom: "12px" }}>
          @{stats.botUsername}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
        <div style={statBox}>
          <div style={statNumber}>{stats.linkedChats}</div>
          <div style={statLabel}>Chats</div>
        </div>
        <div style={statBox}>
          <div style={statNumber}>{stats.messagesForwarded}</div>
          <div style={statLabel}>Forwarded</div>
        </div>
        <div style={statBox}>
          <div style={statNumber}>{stats.repliesSent}</div>
          <div style={statLabel}>Replies</div>
        </div>
      </div>
      {stats.lastPollAt && (
        <div style={{ fontSize: "11px", color: "var(--muted-foreground)", marginTop: "10px" }}>
          Last poll: {new Date(stats.lastPollAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plugin Page — overview & linked chats
// ---------------------------------------------------------------------------

export function TelegramPage({ context }: PluginPageProps) {
  const { data: stats, loading: statsLoading, refresh: refreshStats } = usePluginData<TelegramStats>("stats", {});
  const { data: config } = usePluginData<TelegramConfigView>("config", {});
  const testConnection = usePluginAction("test-connection");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = (await testConnection({})) as { ok: boolean; error?: string; bot?: { first_name?: string } };
      if (result.ok) {
        setTestResult(`Connected to bot: ${result.bot?.first_name ?? "unknown"}`);
        refreshStats();
      } else {
        setTestResult(`Error: ${result.error ?? "Unknown error"}`);
      }
    } catch (err) {
      setTestResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--foreground)", margin: 0 }}>Telegram Connector</h2>
        <p style={{ fontSize: "13px", color: "var(--muted-foreground)", margin: "4px 0 0" }}>
          Lightweight bridge between Telegram chats and Paperclip issues.
        </p>
      </div>

      {/* Connection status */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--foreground)" }}>Connection</div>
          {stats?.isConfigured ? (
            <span style={badgeGreen}>Active</span>
          ) : (
            <span style={badgeYellow}>Not configured</span>
          )}
        </div>
        {stats?.botUsername && (
          <div style={{ fontSize: "13px", color: "var(--foreground)", marginBottom: "8px" }}>
            Bot: <strong>@{stats.botUsername}</strong>
          </div>
        )}
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button type="button" style={btnPrimary} onClick={handleTestConnection} disabled={testing}>
            {testing ? "Testing..." : "Test Connection"}
          </button>
          {testResult && (
            <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{testResult}</span>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div style={card}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--foreground)", marginBottom: "12px" }}>
            Activity
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <div style={statBox}>
              <div style={statNumber}>{stats.linkedChats}</div>
              <div style={statLabel}>Linked Chats</div>
            </div>
            <div style={statBox}>
              <div style={statNumber}>{stats.messagesForwarded}</div>
              <div style={statLabel}>Messages In</div>
            </div>
            <div style={statBox}>
              <div style={statNumber}>{stats.repliesSent}</div>
              <div style={statLabel}>Replies Out</div>
            </div>
          </div>
          {stats.lastPollAt && (
            <div style={{ fontSize: "11px", color: "var(--muted-foreground)", marginTop: "10px" }}>
              Last poll: {new Date(stats.lastPollAt).toLocaleString()}
            </div>
          )}
        </div>
      )}

      {/* How it works */}
      <div style={card}>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--foreground)", marginBottom: "8px" }}>
          How it works
        </div>
        <ol style={{ margin: 0, paddingLeft: "20px", fontSize: "13px", color: "var(--muted-foreground)", lineHeight: 1.8 }}>
          <li>Create a bot via <strong>@BotFather</strong> on Telegram and add the token in Settings.</li>
          <li>When someone messages the bot, a Paperclip issue is auto-created and linked to the chat.</li>
          <li>Incoming Telegram messages are forwarded as issue comments.</li>
          <li>Agent replies on the issue are sent back to Telegram.</li>
          <li>Agents can also use the <code>sendTelegramMessage</code> tool directly.</li>
        </ol>
      </div>

      {/* Config summary */}
      {config && (
        <div style={card}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--foreground)", marginBottom: "8px" }}>
            Configuration
          </div>
          <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse" }}>
            <tbody>
              <ConfigRow label="Bot Token" value={config.hasToken ? "Configured" : "Not set"} />
              <ConfigRow label="Default Company" value={config.defaultCompanyId || "—"} />
              <ConfigRow label="Default Project" value={config.defaultProjectId || "—"} />
              <ConfigRow label="Auto-create Issues" value={config.autoCreateIssues ? "Yes" : "No"} />
              <ConfigRow label="Forward Agent Replies" value={config.forwardAgentReplies ? "Yes" : "No"} />
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={{ padding: "4px 8px 4px 0", color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{label}</td>
      <td style={{ padding: "4px 0", color: "var(--foreground)", fontWeight: 500 }}>{value}</td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Settings Page
// ---------------------------------------------------------------------------

export function TelegramSettings({ context }: PluginSettingsPageProps) {
  const { data: config, refresh: refreshConfig } = usePluginData<TelegramConfigView>("config", {});
  const testConnection = usePluginAction("test-connection");
  const setWebhook = usePluginAction("set-webhook");
  const removeWebhook = usePluginAction("remove-webhook");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [actionStatus, setActionStatus] = useState<string | null>(null);

  async function handleTest() {
    setActionStatus("Testing...");
    try {
      const res = (await testConnection({})) as { ok: boolean; error?: string; bot?: { first_name?: string } };
      setActionStatus(res.ok ? `Connected: ${res.bot?.first_name}` : `Failed: ${res.error}`);
      refreshConfig();
    } catch (err) {
      setActionStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleSetWebhook() {
    if (!webhookUrl) return;
    setActionStatus("Setting webhook...");
    try {
      const res = (await setWebhook({ webhookUrl })) as { ok: boolean };
      setActionStatus(res.ok ? "Webhook set successfully" : "Failed to set webhook");
    } catch (err) {
      setActionStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleRemoveWebhook() {
    setActionStatus("Removing webhook...");
    try {
      const res = (await removeWebhook({})) as { ok: boolean };
      setActionStatus(res.ok ? "Webhook removed" : "Failed to remove webhook");
    } catch (err) {
      setActionStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <div style={{ maxWidth: "560px", display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--foreground)", margin: 0 }}>
          Telegram Settings
        </h3>
        <p style={{ fontSize: "12px", color: "var(--muted-foreground)", margin: "4px 0 0" }}>
          Configure your Telegram bot token and webhook. The bot token is set via the plugin instance config
          (secret ref). Use the controls below to test and manage the webhook.
        </p>
      </div>

      {/* Test connection */}
      <div style={card}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--foreground)", marginBottom: "8px" }}>
          Test Connection
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button type="button" style={btnPrimary} onClick={handleTest}>
            Test Bot Token
          </button>
          {config?.hasToken ? (
            <span style={{ ...badgeGreen, fontSize: "11px" }}>Token set</span>
          ) : (
            <span style={{ ...badgeYellow, fontSize: "11px" }}>No token</span>
          )}
        </div>
      </div>

      {/* Webhook management */}
      <div style={card}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--foreground)", marginBottom: "8px" }}>
          Webhook
        </div>
        <p style={{ fontSize: "12px", color: "var(--muted-foreground)", margin: "0 0 10px" }}>
          Set the Telegram webhook URL so updates are pushed to this Paperclip instance. If your instance is not
          publicly reachable, leave this empty — the plugin will fall back to polling.
        </p>
        <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
          <input
            type="text"
            placeholder="https://your-paperclip-instance.com/api/plugins/.../webhook/telegram-update"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            style={{
              flex: 1,
              padding: "6px 10px",
              borderRadius: "6px",
              border: "1px solid var(--border)",
              backgroundColor: "var(--background)",
              color: "var(--foreground)",
              fontSize: "13px",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button type="button" style={btnPrimary} onClick={handleSetWebhook} disabled={!webhookUrl}>
            Set Webhook
          </button>
          <button type="button" style={btnSecondary} onClick={handleRemoveWebhook}>
            Remove Webhook
          </button>
        </div>
      </div>

      {/* Status */}
      {actionStatus && (
        <div style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "12px", color: "var(--muted-foreground)" }}>
          {actionStatus}
        </div>
      )}
    </div>
  );
}
