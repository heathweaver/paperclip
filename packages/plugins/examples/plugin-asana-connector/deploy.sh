#!/bin/bash
set -e

PLUGIN_NAME="plugin-asana-connector"
CONTAINER="paperclip"
CONTAINER_PLUGIN_DIR="/paperclip/plugins/${PLUGIN_NAME}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

echo "==> Building ${PLUGIN_NAME}..."
cd "$REPO_ROOT"
pnpm --filter @paperclipai/${PLUGIN_NAME} build

echo "==> Ensuring plugin directory exists in container..."
docker exec -u root "$CONTAINER" mkdir -p "${CONTAINER_PLUGIN_DIR}/dist/ui"
docker exec -u root "$CONTAINER" chown -R node:node "${CONTAINER_PLUGIN_DIR}"

echo "==> Copying dist files to container ${CONTAINER}..."
docker cp "$SCRIPT_DIR/package.json" "${CONTAINER}:${CONTAINER_PLUGIN_DIR}/package.json"
for f in worker.js index.js manifest.js; do
  docker cp "$SCRIPT_DIR/dist/$f" "${CONTAINER}:${CONTAINER_PLUGIN_DIR}/dist/$f"
done
docker cp "$SCRIPT_DIR/dist/ui/index.js" "${CONTAINER}:${CONTAINER_PLUGIN_DIR}/dist/ui/index.js"
docker cp "$SCRIPT_DIR/dist/ui/index.js.map" "${CONTAINER}:${CONTAINER_PLUGIN_DIR}/dist/ui/index.js.map"

echo "==> Done. Restart the plugin worker to pick up changes."
echo "    docker restart ${CONTAINER}"
