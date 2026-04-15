const express = require('express');
const path = require('path');
const db = require('./db');
const { scrapeAll } = require('./scraper');
const { runAnalysis, takeSnapshot, analyzeSentiment } = require('./analyzer');
const { geminiKey } = require('./analyzer');

const app = express();
const PORT = process.env.PORT || 3333;

// Serve static dashboard
app.use(express.static(path.join(__dirname, 'public')));

// API: Health check
app.get('/health', (req, res) => {
  const fs = require('fs');
  const path = require('path');

  // Basic stats
  const total = db.prepare('SELECT COUNT(*) as count FROM stories').get().count;
  const rated = db.prepare('SELECT COUNT(*) as count FROM stories WHERE sentiment_score IS NOT NULL').get().count;

  // Last scrape time (most recent story created_at)
  const lastScrape = db.prepare('SELECT MAX(created_at) as last FROM stories').get();

  // Last snapshot time
  const lastSnap = db.prepare('SELECT MAX(created_at) as last FROM snapshots').get();

  // Gemini key detection
  const geminiKeySet = !!(process.env.GEMINI_API_KEY || geminiKey);
  const geminiKeySource = process.env.GEMINI_API_KEY ? 'env:GEMINI_API_KEY'
    : geminiKey ? 'file:gemini.secret.json'
    : 'none';

  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    gemini: {
      keyDetected: geminiKeySet,
      keySource: geminiKeySource
    },
    stories: {
      total,
      rated,
      unrated: total - rated
    },
    lastScrape: lastScrape.last || null,
    lastSnapshot: lastSnap.last || null,
    uptime: process.uptime(),
    nodeEnv: process.env.NODE_ENV || 'development'
  };

  res.json(health);
});

// API: Dashboard data
app.get('/api/dashboard', (req, res) => {
  // Current overall sentiment
  const overall = db.prepare(`
    SELECT 
      COUNT(*) as total,
      COALESCE(AVG(sentiment_score), 0) as avg_score,
      SUM(CASE WHEN sentiment_score > 0.5 THEN 1 ELSE 0 END) as positive,
      SUM(CASE WHEN sentiment_score < -0.5 THEN 1 ELSE 0 END) as negative,
      SUM(CASE WHEN ABS(sentiment_score) <= 0.5 THEN 1 ELSE 0 END) as neutral
    FROM stories 
    WHERE sentiment_score IS NOT NULL
  `).get();

  // Recent stories (last 100)
  const recentStories = db.prepare(`
    SELECT id, source, title, link, description, sentiment_score, sentiment_reason, created_at
    FROM stories 
    WHERE sentiment_score IS NOT NULL 
    ORDER BY created_at DESC 
    LIMIT 100
  `).all();

  // Timeline data (hourly averages for last 7 days)
  const timeline = db.prepare(`
    SELECT 
      strftime('%Y-%m-%d %H:00', created_at) as hour,
      AVG(sentiment_score) as avg_score,
      COUNT(*) as count
    FROM stories 
    WHERE sentiment_score IS NOT NULL 
      AND created_at >= datetime('now', '-7 days')
    GROUP BY hour 
    ORDER BY hour
  `).all();

  // Daily averages for 30 days
  const dailyTimeline = db.prepare(`
    SELECT 
      strftime('%Y-%m-%d', created_at) as day,
      AVG(sentiment_score) as avg_score,
      COUNT(*) as count
    FROM stories 
    WHERE sentiment_score IS NOT NULL 
      AND created_at >= datetime('now', '-30 days')
    GROUP BY day 
    ORDER BY day
  `).all();

  // Score distribution
  const distribution = db.prepare(`
    SELECT 
      CASE 
        WHEN sentiment_score >= 7 THEN '7-10'
        WHEN sentiment_score >= 4 THEN '4-7'
        WHEN sentiment_score >= 1 THEN '1-4'
        WHEN sentiment_score > -1 THEN '-1 to 1'
        WHEN sentiment_score > -4 THEN '-4 to -1'
        WHEN sentiment_score > -7 THEN '-7 to -4'
        ELSE '-10 to -7'
      END as bucket,
      COUNT(*) as count
    FROM stories 
    WHERE sentiment_score IS NOT NULL
    GROUP BY bucket
    ORDER BY MIN(sentiment_score)
  `).all();

  // Source breakdown
  const sourceBreakdown = db.prepare(`
    SELECT 
      source,
      COUNT(*) as count,
      ROUND(AVG(sentiment_score), 2) as avg_score
    FROM stories 
    WHERE sentiment_score IS NOT NULL
    GROUP BY source
    ORDER BY count DESC
  `).all();

  // Snapshots for trend
  const snapshots = db.prepare(`
    SELECT avg_score, story_count, positive_count, negative_count, neutral_count, created_at
    FROM snapshots 
    ORDER BY created_at DESC 
    LIMIT 100
  `).all();

  // Top positive stories
  const topPositive = db.prepare(`
    SELECT title, source, sentiment_score, sentiment_reason, created_at
    FROM stories WHERE sentiment_score >= 5 
    ORDER BY sentiment_score DESC LIMIT 5
  `).all();

  // Top negative stories  
  const topNegative = db.prepare(`
    SELECT title, source, sentiment_score, sentiment_reason, created_at
    FROM stories WHERE sentiment_score <= -5 
    ORDER BY sentiment_score ASC LIMIT 5
  `).all();

  res.json({
    overall,
    recentStories,
    timeline,
    dailyTimeline,
    distribution,
    sourceBreakdown,
    snapshots,
    topPositive,
    topNegative,
    lastUpdated: new Date().toISOString()
  });
});

// API: Test Gemini with one story
app.get('/api/test-gemini', async (req, res) => {
  try {
    // Get a real news story (skip short/garbage titles)
    const story = db.prepare('SELECT id, title, description FROM stories WHERE sentiment_score IS NULL AND length(title) > 20 ORDER BY RANDOM() LIMIT 1').get();
    if (!story) return res.json({ error: 'no unrated stories' });
    
    const text = story.description ? `${story.title}\n\n${story.description}` : story.title;
    
    // Call Gemini directly to see raw response
    const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';
    const gemRes = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Rate this news story from -10 to +10 for humanity impact. Respond ONLY with: SCORE: <number> REASON: <one sentence>\n\nStory: ${text}` }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 200 }
      })
    });
    
    const rawBody = await gemRes.text();
    let parsed;
    try { parsed = JSON.parse(rawBody); } catch(e) { parsed = null; }
    
    const geminiText = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || 'NO TEXT';
    
    res.json({ 
      story: story.title.slice(0, 100),
      geminiStatus: gemRes.status,
      geminiText: geminiText,
      geminiRaw: rawBody.slice(0, 500),
      result: await analyzeSentiment(story.title, story.description)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Trigger scrape + analysis manually
app.post('/api/refresh', async (req, res) => {
  try {
    const newCount = await scrapeAll();
    const analyzedCount = await runAnalysis();
    takeSnapshot();
    res.json({ success: true, newStories: newCount, analyzed: analyzedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Debug info (legacy — prefer /health for monitoring)
app.get('/api/debug', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const checks = {};
  
  // Check env var
  checks.geminiKeySet = !!process.env.GEMINI_API_KEY;
  checks.geminiKeyPrefix = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.slice(0, 8) + '...' : 'NONE';
  checks.openaiKeySet = !!process.env.OPENAI_API_KEY;
  checks.openaiKeyPrefix = process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.slice(0, 8) + '...' : 'NONE';
  
  // Check if analyzer.js loaded a key (from file or env)
  checks.analyzerGeminiKeyLoaded = !!geminiKey;
  checks.analyzerGeminiKeySource = process.env.GEMINI_API_KEY ? 'env:GEMINI_API_KEY'
    : geminiKey ? 'file:gemini.secret.json (or typo variant)'
    : 'none';
  
  // Check multiple file paths
  const paths = [
    path.join(__dirname, 'gemini.secret.json'),
    path.join(__dirname, 'gemeni.secret.json'),
    '/etc/secrets/gemini.secret.json',
    '/opt/render/project/src/gemini.secret.json',
    '/opt/render/project/gemini.secret.json',
    '/opt/render/secrets/gemini.secret.json',
    ];
  checks.files = {};
  for (const p of paths) {
    try { checks.files[p] = fs.existsSync(p) ? 'EXISTS' : 'missing'; } catch(e) { checks.files[p] = 'error: ' + e.message; }
  }
  
  // List files in __dirname that contain 'secret' or 'gemini'
  try {
    const dirFiles = fs.readdirSync(__dirname);
    checks.dirFiles = dirFiles.filter(f => f.includes('secret') || f.includes('gemini') || f.includes('.env'));
  } catch(e) { checks.dirFiles = 'error'; }
  
  checks.dirname = __dirname;
  checks.nodeEnv = process.env.NODE_ENV || 'not set';
  
  res.json(checks);
});

// API: Stats summary
app.get('/api/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as count FROM stories').get();
  const rated = db.prepare('SELECT COUNT(*) as count FROM stories WHERE sentiment_score IS NOT NULL').get();
  const unrated = db.prepare('SELECT COUNT(*) as count FROM stories WHERE sentiment_score IS NULL').get();
  const sources = db.prepare('SELECT COUNT(DISTINCT source) as count FROM stories').get();
  res.json({ total: total.count, rated: rated.count, unrated: unrated.count, sources: sources.count });
});

app.listen(PORT, () => {
  console.log(`🌍 Humanity Pulse running on http://localhost:${PORT}`);
  
  // Auto-refresh every 30 minutes (keeps Gemini API under free tier limits)
  const INTERVAL_MS = 30 * 60 * 1000;
  
  async function autoRefresh() {
    console.log(`\n⏰ [${new Date().toISOString()}] Auto-refresh triggered`);
    try {
      await scrapeAll();
      await runAnalysis();
      takeSnapshot();
    } catch (err) {
      console.error('Auto-refresh error:', err);
    }
  }
  
  // Initial scrape on startup (with delay to let Ollama be ready)
  setTimeout(autoRefresh, 5000);
  
  // Schedule periodic refreshes
  setInterval(autoRefresh, INTERVAL_MS);
  
  console.log(`🔄 Auto-refresh every ${INTERVAL_MS / 60000} minutes`);
});