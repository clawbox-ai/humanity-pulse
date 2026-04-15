#!/bin/bash
# Humanity Pulse - Start Script
# Works both locally (with optional Cloudflare tunnel) and on Render

echo "🌍 Starting Humanity Pulse..."

# On Render, just start the server
if [ "$RENDER" = "true" ] || [ "$NODE_ENV" = "production" ]; then
  echo "📊 Production mode — starting server..."
  exec node server.js
fi

# Local development: start server + optional tunnel
# Kill any existing instances
pkill -f "node.*server.js" 2>/dev/null
pkill -f cloudflared 2>/dev/null
sleep 2

# Start the server
echo "📊 Starting dashboard server..."
nohup node server.js > /tmp/humanity-pulse.log 2>&1 &
SERVER_PID=$!
echo "   Server PID: $SERVER_PID"
sleep 5

# Check server is up
if curl -s http://localhost:3333/api/stats > /dev/null 2>&1; then
    echo "   ✅ Server is running on http://localhost:3333"
else
    echo "   ❌ Server failed to start. Check /tmp/humanity-pulse.log"
    exit 1
fi

# Start the tunnel if cloudflared exists
if command -v cloudflared &>/dev/null; then
    echo ""
    echo "🌐 Starting Cloudflare Tunnel..."
    nohup cloudflared tunnel --url http://localhost:3333 > /tmp/cloudflared.log 2>&1 &
    TUNNEL_PID=$!
    echo "   Tunnel PID: $TUNNEL_PID"
    sleep 10

    TUNNEL_URL=$(grep -o 'https://.*\.trycloudflare\.com' /tmp/cloudflared.log | head -1)
    if [ -n "$TUNNEL_URL" ]; then
        echo ""
        echo "🚀 Humanity Pulse is LIVE at:"
        echo ""
        echo "   $TUNNEL_URL"
        echo ""
        echo "   Local: http://localhost:3333"
        echo ""
    fi
fi

echo "💡 To stop: pkill -f 'node.*server.js'; pkill -f cloudflared"
echo "💡 To restart: bash $0"