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

// API: Debug info
app.get('/api/debug', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const secretPath = path.join(__dirname, 'gemini.secret.json');
  let fileInfo = 'not found';
  try {
    if (fs.existsSync(secretPath)) {
      fileInfo = 'exists at ' + secretPath;
    }
  } catch(e) { fileInfo = 'error: ' + e.message; }
  
  // Also check /etc/secrets (Render mounts there sometimes)
  let etcInfo = 'not found';
  try {
    if (fs.existsSync('/etc/secrets/gemini.secret.json')) {
      etcInfo = 'exists at /etc/secrets/gemini.secret.json';
    }
  } catch(e) {}
  
  res.json({
    geminiKeySet: !!process.env.GEMINI_API_KEY,
    geminiKeyPrefix: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.slice(0, 8) + '...' : 'NONE',
    secretFile: fileInfo,
    etcSecrets: etcInfo,
    dirname: __dirname,
    nodeEnv: process.env.NODE_ENV || 'not set'
  });
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