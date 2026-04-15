# Render Deployment Guide — Humanity Pulse

## Quick Setup

1. **Fork/connect the repo** to Render from GitHub: `clawbox-ai/humanity-pulse`

2. **Set the `GEMINI_API_KEY` environment variable** in Render Dashboard:
   - Go to your service → Environment
   - Add key: `GEMINI_API_KEY`  
   - Value: your Gemini API key (starts with `AIzaSy...`)
   - This is the **recommended way** — no files to manage, no path issues

3. **Render auto-detects** `render.yaml` in the repo root, which configures:
   - Build: `npm install`
   - Start: `bash start.sh` (detects production mode and runs `node server.js`)
   - Plan: free

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | **Yes** | Your Google Gemini API key for sentiment analysis |
| `NODE_ENV` | No | Set to `production` automatically by Render |
| `PORT` | No | Set automatically by Render (default: 3333) |

## Setting GEMINI_API_KEY on Render

### Option A: Render Dashboard (Recommended)
1. Open https://dashboard.render.com
2. Select your `humanity-pulse` service
3. Click **Environment** in the left sidebar
4. Add `GEMINI_API_KEY` with your key value
5. Click **Save Changes** — Render will auto-redeploy

### Option B: render.yaml (already configured)
The `render.yaml` declares `GEMINI_API_KEY` with `sync: false`, meaning:
- You must set it manually in the dashboard
- It won't accidentally be synced from a file

## How the Key is Detected

The app checks for the Gemini key in this order:
1. **Environment variable** `GEMINI_API_KEY` (best for Render)
2. **Secret files** at various paths (fallback):
   - `./gemini.secret.json` (local dev)
   - `./gemeni.secret.json` (legacy typo path)
   - `/etc/secrets/gemini.secret.json`
   - `/opt/render/project/src/gemini.secret.json`
   - Other common cloud paths

## Health Check

After deployment, verify it's working:
```bash
curl https://humanity-pulse.onrender.com/health
```

Should return:
```json
{
  "status": "ok",
  "gemini": { "keyDetected": true, "keySource": "env:GEMINI_API_KEY" },
  "stories": { "total": 123, "rated": 100, "unrated": 23 },
  ...
}
```

If `keyDetected` is `false`, the Gemini key is not set correctly.

## Debugging

- `/api/debug` — shows file paths, env vars, key detection details
- `/health` — clean health check with key status
- Render logs: Dashboard → your service → Logs

## Common Issues

### "No Gemini key found"
→ Set `GEMINI_API_KEY` in Render Environment settings (see above)

### "gemeni.secret.json" instead of "gemini.secret.json"
→ This was a legacy typo. The code now checks both paths, but using the env var is preferred.

### Free tier cold starts
→ Render free tier sleeps after 15 min of inactivity. First request takes ~30s to wake up.