#!/bin/bash
# Humanity Pulse - start both server and tunnel
cd /Users/clawbox/.openclaw/workspace/humanity-pulse

# Start the server if not running
if ! curl -s http://localhost:3333/api/stats > /dev/null 2>&1; then
  echo "Starting Humanity Pulse server..."
  node server.js &
  sleep 3
fi

# Start cloudflare tunnel (auto-restarts if it dies)
while true; do
  echo "Starting Cloudflare Tunnel..."
  /Users/clawbox/bin/cloudflared tunnel --url http://localhost:3333
  echo "Tunnel died, restarting in 5 seconds..."
  sleep 5
done