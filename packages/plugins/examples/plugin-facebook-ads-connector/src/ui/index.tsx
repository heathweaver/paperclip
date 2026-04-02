import type {
  PluginPageProps,
  PluginWidgetProps,
  PluginSettingsPageProps,
} from "@paperclipai/plugin-sdk/ui";
import { usePluginAction, usePluginData } from "@paperclipai/plugin-sdk/ui";
import { useState } from "react";

interface FacebookAdsStats {
  isConfigured: boolean;
  mcpUrl: string;
  toolCount: number;
  toolNames: string[];
  mcpRunning: boolean;
}

interface FacebookAdsConfigView {
  hasToken: boolean;
  mcpUrl: string;
}

const card: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: "8px", backgroundColor: "var(--card)", padding: "16px" };
const statBox: React.CSSProperties = { textAlign: "center", padding: "12px", borderRadius: "6px", backgroundColor: "color-mix(in oklab, var(--accent) 30%, transparent)" };
const statNumber: React.CSSProperties = { fontSize: "24px", fontWeight: 700, color: "var(--foreground)", lineHeight: 1.2 };
const statLabel: React.CSSProperties = { fontSize: "11px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)", marginTop: "4px" };
const badgeStyle = (color: string): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", padding: "2px 8px",
  borderRadius: "9999px", fontSize: "11px", fontWeight: 600,
  backgroundColor: `color-mix(in oklab, ${color} 20%, transparent)`, color,
});
const btn: React.CSSProperties = { padding: "6px 14px", borderRadius: "6px", border: "1px solid var(--border)", backgroundColor: "var(--primary)", color: "var(--primary-foreground)", fontSize: "13px", fontWeight: 500, cursor: "pointer" };
const mono: React.CSSProperties = { fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: "12px", backgroundColor: "color-mix(in oklab, var(--accent) 40%, transparent)", padding: "1px 5px", borderRadius: "3px" };

export function FacebookAdsWidget({ context }: PluginWidgetProps) {
  const { data: stats, loading } = usePluginData<FacebookAdsStats>("stats", {});
  if (loading || !stats) return <div style={card}><span style={{ color: "var(--muted-foreground)", fontSize: "13px" }}>Loading...</span></div>;

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <span style={{ fontSize: "14px", fontWeight: 600 }}>Facebook Ads MCP</span>
        {stats.mcpRunning
          ? <span style={badgeStyle("oklch(0.72 0.17 142)")}>Running</span>
          : <span style={badgeStyle("oklch(0.80 0.15 85)")}>{stats.isConfigured ? "Stopped" : "Not configured"}</span>}
      </div>
      <div style={statBox}>
        <div style={statNumber}>{stats.toolCount}</div>
        <div style={statLabel}>MCP Tools Proxied</div>
      </div>
    </div>
  );
}

export function FacebookAdsPage({ context }: PluginPageProps) {
  const { data: stats, refresh } = usePluginData<FacebookAdsStats>("stats", {});
  const { data: config } = usePluginData<FacebookAdsConfigView>("config", {});
  const testConnection = usePluginAction("test-connection");
  const refreshTools = usePluginAction("refresh-tools");
  const [actionStatus, setActionStatus] = useState<string | null>(null);

  async function handleTest() {
    setActionStatus("Connecting to MCP server...");
    try {
      const res = (await testConnection({})) as { ok: boolean; error?: string; toolCount?: number };
      setActionStatus(res.ok ? `Connected — ${res.toolCount} tools available` : `Error: ${res.error}`);
      refresh();
    } catch (e) { setActionStatus(`Error: ${e instanceof Error ? e.message : String(e)}`); }
  }

  async function handleRefresh() {
    setActionStatus("Re-discovering tools...");
    try {
      const res = (await refreshTools({})) as { ok: boolean; toolCount: number };
      setActionStatus(`Discovered ${res.toolCount} tools`);
      refresh();
    } catch (e) { setActionStatus(`Error: ${e instanceof Error ? e.message : String(e)}`); }
  }

  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--foreground)", margin: 0 }}>Facebook Ads Connector</h2>
        <p style={{ fontSize: "13px", color: "var(--muted-foreground)", margin: "4px 0 0" }}>
          Thin MCP bridge — connects to your remote Facebook Ads MCP server and proxies its tools to Paperclip agents.
        </p>
      </div>

      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <span style={{ fontSize: "14px", fontWeight: 600 }}>MCP Server</span>
          {stats?.mcpRunning
            ? <span style={badgeStyle("oklch(0.72 0.17 142)")}>Running</span>
            : <span style={badgeStyle("oklch(0.80 0.15 85)")}>{stats?.isConfigured ? "Stopped" : "Not configured"}</span>}
        </div>
        {stats && (
          <div style={{ fontSize: "12px", color: "var(--muted-foreground)", marginBottom: "12px" }}>
            <span style={mono}>{stats.mcpUrl || "Remote MCP URL not configured"}</span>
          </div>
        )}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" style={btn} onClick={handleTest}>Test Connection</button>
          <button type="button" style={{ ...btn, backgroundColor: "var(--background)", color: "var(--foreground)" }} onClick={handleRefresh}>Refresh Tools</button>
        </div>
        {actionStatus && <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--muted-foreground)" }}>{actionStatus}</div>}
      </div>

      {stats && stats.toolCount > 0 && (
        <div style={card}>
          <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>Discovered Tools ({stats.toolCount})</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {stats.toolNames.map((name) => (<span key={name} style={mono}>{name}</span>))}
          </div>
        </div>
      )}

      {config && (
        <div style={card}>
          <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>Configuration</div>
          <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse" }}>
            <tbody>
              <tr><td style={{ padding: "4px 8px 4px 0", color: "var(--muted-foreground)" }}>Auth Token</td><td style={{ fontWeight: 500 }}>{config.hasToken ? "Configured" : "Not set"}</td></tr>
              <tr><td style={{ padding: "4px 8px 4px 0", color: "var(--muted-foreground)" }}>Remote MCP URL</td><td style={{ fontWeight: 500 }}><span style={mono}>{config.mcpUrl || "—"}</span></td></tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function FacebookAdsSettings({ context }: PluginSettingsPageProps) {
  const { data: config } = usePluginData<FacebookAdsConfigView>("config", {});
  const testConnection = usePluginAction("test-connection");
  const [status, setStatus] = useState<string | null>(null);

  async function handleTest() {
    setStatus("Testing...");
    try {
      const res = (await testConnection({})) as { ok: boolean; error?: string; toolCount?: number };
      setStatus(res.ok ? `Connected — ${res.toolCount} tools` : `Failed: ${res.error}`);
    } catch (e) { setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`); }
  }

  return (
    <div style={{ maxWidth: "560px", display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <h3 style={{ fontSize: "16px", fontWeight: 600, margin: 0 }}>Facebook Ads Settings</h3>
        <p style={{ fontSize: "12px", color: "var(--muted-foreground)", margin: "4px 0 0" }}>
          Configure the remote MCP URL and auth token via the plugin instance config.
        </p>
      </div>
      <div style={card}>
        <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>Test MCP Connection</div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button type="button" style={btn} onClick={handleTest}>Test</button>
          {config?.hasToken ? <span style={badgeStyle("oklch(0.72 0.17 142)")}>Auth token set</span> : <span style={badgeStyle("oklch(0.80 0.15 85)")}>No auth token</span>}
        </div>
        {config && <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--muted-foreground)" }}>Server: <span style={mono}>{config.mcpUrl || "Not configured"}</span></div>}
        {status && <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--muted-foreground)" }}>{status}</div>}
      </div>
    </div>
  );
}
