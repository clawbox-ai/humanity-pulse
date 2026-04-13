#!/bin/bash
# Keep-alive script for Humanity Pulse
while true; do
  if ! curl -s http://localhost:3333/api/stats > /dev/null 2>&1; then
    echo "[$(date)] Server down, restarting..."
    cd /Users/clawbox/.openclaw/workspace/humanity-pulse
    node server.js &
    sleep 5
  fi
  sleep 30
done