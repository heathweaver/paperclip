#!/bin/sh

# Start cloudflared if cert files exist, otherwise skip.
if [ -f /paperclip/.cloudflared/cert.pem ] && [ -f /paperclip/.cloudflared/fb46a1a5-b93d-4c05-a870-de639bfc6aaf.json ]; then
  /usr/local/bin/cloudflared tunnel --config /paperclip/.cloudflared/config.yml run fb46a1a5-b93d-4c05-a870-de639bfc6aaf &
else
  echo "Warning: Cloudflared certificate files not found. Skipping cloudflared startup."
fi

exec node --import ./server/node_modules/tsx/dist/loader.mjs server/dist/index.js
