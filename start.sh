#!/bin/bash
# Humanity Pulse - Start Everything
# Run this after a reboot to get the dashboard live again

echo "🌍 Starting Humanity Pulse..."
echo ""

# Kill any existing instances
pkill -f "node.*server.js" 2>/dev/null
pkill -f cloudflared 2>/dev/null
sleep 2

# Start the server
echo "📊 Starting dashboard server..."
nohup node /Users/clawbox/.openclaw/workspace/humanity-pulse/server.js > /tmp/humanity-pulse.log 2>&1 &
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

# Start the tunnel
echo ""
echo "🌐 Starting Cloudflare Tunnel..."
nohup /Users/clawbox/bin/cloudflared tunnel --url http://localhost:3333 > /tmp/cloudflared.log 2>&1 &
TUNNEL_PID=$!
echo "   Tunnel PID: $TUNNEL_PID"
sleep 10

# Get the tunnel URL
TUNNEL_URL=$(grep -o 'https://.*\.trycloudflare\.com' /tmp/cloudflared.log | head -1)
if [ -n "$TUNNEL_URL" ]; then
    echo ""
    echo "🚀 Humanity Pulse is LIVE at:"
    echo ""
    echo "   $TUNNEL_URL"
    echo ""
    echo "   Local: http://localhost:3333"
    echo ""
else
    echo "   ⚠️  Could not get tunnel URL. Check /tmp/cloudflared.log"
fi

echo "💡 To stop: pkill -f 'node.*server.js'; pkill -f cloudflared"
echo "💡 To restart: bash $0"