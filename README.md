# Humanity Pulse 🌍

Real-time global news sentiment dashboard. Scrapes world news, rates each story's impact on humanity (-10 to +10), and displays it on a beautiful dark-themed dashboard.

## Quick Start

```bash
cd humanity-pulse
npm install
npm start
```

Open http://localhost:3333

## Architecture

- **server.js** — Express server + API endpoints + auto-refresh scheduler
- **scraper.js** — RSS feed scraper (BBC, Reuters, Al Jazeera, etc.) + WorldMonitor
- **analyzer.js** — Ollama LLM sentiment analyzer
- **db.js** — SQLite database schema & connection
- **public/index.html** — Dashboard frontend (Chart.js, dark theme)

## How It Works

1. Every 20 minutes, scrapes headlines from 10+ RSS news feeds
2. Each story is sent to a local LLM (Ollama) for sentiment rating
3. Scores range from -10 (catastrophic) to +10 (breakthrough)
4. Dashboard shows real-time average, timeline, distribution, and story feed
5. Manual refresh available via button

## Requirements

- Node.js 18+
- Ollama running on localhost:11434 with llama3.2 (or any model)