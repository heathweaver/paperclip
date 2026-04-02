# MCP Connector Plugin Template

Copy this directory to create a new MCP connector plugin.

## Quick start

```bash
# 1. Copy the template
cp -r plugin-mcp-connector-template plugin-YOUR-NAME-connector

# 2. Find and replace all placeholders:
#    CHANGEME_ID    → your-plugin-id (kebab-case, e.g. "facebook-ads")
#    CHANGEME_NAME  → Your Display Name (e.g. "Facebook Ads")
#    CHANGEME_URL   → default MCP URL (e.g. "https://metaads.ssc.one/mcp")
#    ChangeName     → PascalCase for React components (e.g. "FacebookAds")
#    changename     → lowercase for route paths (e.g. "facebook-ads")

# 3. Update package.json name field

# 4. Install deps and build
cd ../../.. && pnpm install
pnpm --filter @paperclipai/plugin-YOUR-NAME-connector build

# 5. Deploy
./deploy.sh
```

## Files to update

- `package.json` — name and description
- `src/manifest.ts` — id, displayName, description, default URL, UI slot ids/names
- `src/worker.ts` — PLUGIN_NAME and tool description prefix
- `src/ui/index.tsx` — component names and display strings
- `deploy.sh` — PLUGIN_NAME variable
