const fetch = require('node-fetch');
// dotenv won't override existing env vars (Render sets GEMINI_API_KEY directly)
try { require('dotenv').config(); } catch(e) {}
const db = require('./db');

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'qwen2.5:1.5b'; // Local Ollama model

// Auto-detect: use Ollama if available, otherwise Gemini
let useGemini = false;
let geminiKey = process.env.GEMINI_API_KEY || '';

// If no env var, try loading from secret files (multiple paths for different hosting)
if (!geminiKey) {
  try {
    const fs = require('fs');
    const path = require('path');
    // Check multiple paths where Render and other hosts might mount secret files
    // Also checks for the common typo 'gemeni' (was the original filename on Render)
    const secretPaths = [
      path.join(__dirname, 'gemini.secret.json'),
      path.join(__dirname, 'gemeni.secret.json'),  // legacy typo path
      '/etc/secrets/gemini.secret.json',
      '/opt/render/project/src/gemini.secret.json',
      '/opt/render/project/gemini.secret.json',
      '/opt/render/secrets/gemini.secret.json',
      '/run/secrets/gemini.secret.json',  // Docker/K8s secrets
    ];
    for (const p of secretPaths) {
      try {
        if (fs.existsSync(p)) {
          const secret = JSON.parse(fs.readFileSync(p, 'utf8'));
          const key = secret.apiKey || secret.api_key || secret.key || '';
          if (key && key.startsWith('AIza')) {
            geminiKey = key;
            console.log(`🔑 Gemini key loaded from: ${p}`);
            break;
          }
        }
      } catch (fileErr) {
        console.log(`⚠️  Could not read ${p}: ${fileErr.message}`);
      }
    }
  } catch (e) {
    console.log(`⚠️  Secret file scan failed: ${e.message}`);
  }
} else {
  console.log('🔑 Gemini key loaded from GEMINI_API_KEY env var');
}

// Load OpenAI key
let openaiKey = process.env.OPENAI_API_KEY || '';
if (!openaiKey) {
  try {
    const fs2 = require('fs');
    const p2 = require('path');
    const oaiPaths = [
      path.join(__dirname, 'openai.secret.json'),
      '/etc/secrets/openai.secret.json',
    ];
    for (const p of oaiPaths) {
      if (fs2.existsSync(p)) {
        const sec = JSON.parse(fs2.readFileSync(p, 'utf8'));
        openaiKey = sec.apiKey || sec.key || '';
        if (openaiKey) { console.log(`🔑 OpenAI key loaded from: ${p}`); break; }
      }
    }
  } catch(e) {}
}

if (geminiKey) {
  useGemini = true;
  console.log('🔑 Gemini API key found — using Gemini for analysis');
} else if (openaiKey) {
  console.log('🔑 OpenAI key found — using GPT-4o-mini for analysis');
} else {
  console.log('🔑 No Gemini/OpenAI key found — will use Ollama if available');
}

const SENTIMENT_PROMPT = `You are rating news stories on their impact for humanity on a planetary scale. Rate from -10 (catastrophic for humanity) to +10 (amazing breakthrough for humanity).

Consider: wars, pandemics, climate change, scientific breakthroughs, human rights advances, technological progress, economic stability, democratic governance, etc.

Respond in EXACTLY this format (no other text):
SCORE: <number between -10 and 10>
REASON: <one sentence explanation>`;

function parseResponse(response) {
  const scoreMatch = response.match(/SCORE:\s*([+-]?\d+\.?\d*)/i);
  const reasonMatch = response.match(/REASON:\s*(.+)/i);

  if (!scoreMatch) {
    console.log(`  [WARN] No score parsed from: ${response.slice(0, 80)}`);
    return null;
  }

  let score = parseFloat(scoreMatch[1]);
  score = Math.max(-10, Math.min(10, score));

  return {
    score: Math.round(score * 10) / 10,
    reason: reasonMatch ? reasonMatch[1].trim() : 'No reason provided'
  };
}

async function analyzeViaOllama(text) {
  const model = module.exports.MODEL || MODEL;
  const prompt = `${SENTIMENT_PROMPT}\n\nStory: ${text}`;
  
  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: { temperature: 0.3, num_predict: 150 }
    })
  });

  if (!res.ok) return null;
  const data = await res.json();
  return parseResponse(data.response || '');
}

async function analyzeViaGemini(text) {
  if (!geminiKey) return null;
  
  try {
    const res = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${SENTIMENT_PROMPT}\n\nStory: ${text}` }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 500 }
      })
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.log(`  ❌ Gemini ${res.status}: ${errBody.slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const response = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!response) {
      console.log(`  ❌ Gemini empty response: ${JSON.stringify(data).slice(0, 200)}`);
      return null;
    }
    return parseResponse(response);
  } catch (err) {
    console.log(`  ❌ Gemini error: ${err.message}`);
    return null;
  }
}

// Retry wrapper for 429 rate limits
async function analyzeWithRetry(story, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await analyzeSentiment(story.title, story.description);
    if (result) return result;
    // If we got null (likely 429), wait and retry
    if (attempt < retries && geminiKey) {
      const backoff = (attempt + 1) * 10 * 1000; // 10s, 20s
      console.log(`  ⏳ Retry ${attempt + 1}/${retries} in ${backoff/1000}s...`);
      await new Promise(r => setTimeout(r, backoff));
    }
  }
  return null;
}

async function analyzeViaOpenAI(text) {
  if (!openaiKey) return null;
  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: `${SENTIMENT_PROMPT}\n\nStory: ${text}` }],
        max_tokens: 200,
        temperature: 0.3
      })
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.log(`  ❌ OpenAI ${res.status}: ${errBody.slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const response = data?.choices?.[0]?.message?.content || '';
    if (!response) return null;
    return parseResponse(response);
  } catch (err) {
    console.log(`  ❌ OpenAI error: ${err.message}`);
    return null;
  }
}

async function analyzeSentiment(title, description) {
  const text = description ? `${title}\n\n${description}` : title;
  
  try {
    // Try Gemini first (works on Render/cloud)
    if (geminiKey) {
      const result = await analyzeViaGemini(text);
      if (result) return result;
      console.log('  Gemini failed, trying OpenAI...');
    }
    
    // Try OpenAI as fallback (cheap, reliable)
    if (openaiKey) {
      const result = await analyzeViaOpenAI(text);
      if (result) return result;
      console.log('  OpenAI failed, trying Ollama...');
    }
    
    // Fallback to Ollama (works locally)
    const result = await analyzeViaOllama(text);
    if (result) return result;
    
    return null;
  } catch (err) {
    console.error(`  Sentiment error: ${err.message}`);
    return null;
  }
}

async function analyzeUnrated(limit = 15) {
  const stories = db.prepare(`
    SELECT id, title, description, source 
    FROM stories 
    WHERE sentiment_score IS NULL 
    ORDER BY created_at DESC 
    LIMIT ?
  `).all(limit);

  if (stories.length === 0) {
    console.log('  No unrated stories to analyze.');
    return 0;
  }

  console.log(`\n🧠 Analyzing ${stories.length} unrated stories with ${geminiKey ? 'Gemini 2.5 Flash Lite' : MODEL}...`);

  let analyzed = 0;
  const update = db.prepare(`
    UPDATE stories 
    SET sentiment_score = ?, sentiment_reason = ? 
    WHERE id = ?
  `);

  for (const story of stories) {
    const result = await analyzeWithRetry(story);
    
    if (result) {
      update.run(result.score, result.reason, story.id);
      analyzed++;
      
      const emoji = result.score > 0 ? '🟢' : result.score < 0 ? '🔴' : '⚪';
      console.log(`  ${emoji} ${result.score > 0 ? '+' : ''}${result.score} | ${story.title.slice(0, 60)}...`);
    }

    // Rate limit: Gemini free tier = 20 req/min. 3.5s delay = ~17/min
    // Add 429 retry with backoff
    await new Promise(r => setTimeout(r, geminiKey ? 3500 : 200));
  }

  console.log(`  Analyzed: ${analyzed}/${stories.length}`);
  return analyzed;
}

function takeSnapshot() {
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      COALESCE(AVG(sentiment_score), 0) as avg_score,
      SUM(CASE WHEN sentiment_score > 0.5 THEN 1 ELSE 0 END) as positive,
      SUM(CASE WHEN sentiment_score < -0.5 THEN 1 ELSE 0 END) as negative,
      SUM(CASE WHEN ABS(sentiment_score) <= 0.5 THEN 1 ELSE 0 END) as neutral
    FROM stories 
    WHERE sentiment_score IS NOT NULL
  `).get();

  db.prepare(`
    INSERT INTO snapshots (avg_score, story_count, positive_count, negative_count, neutral_count)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    Math.round(stats.avg_score * 100) / 100,
    stats.total,
    stats.positive,
    stats.negative,
    stats.neutral
  );

  console.log(`📸 Snapshot: avg=${stats.avg_score.toFixed(2)} total=${stats.total} +${stats.positive}/-${stats.negative}/=${stats.neutral}`);
  return stats;
}

async function runAnalysis() {
  console.log(`\n🧠 [${new Date().toISOString()}] Starting sentiment analysis...`);
  
  // Check for Gemini API key (for cloud deployment)
  if (geminiKey) {
    console.log('  Using Gemini API (cloud)');
    useGemini = true;
  } else {
    // Check if Ollama is available (for local deployment)
    try {
      const res = await fetch('http://localhost:11434/api/tags');
      if (!res.ok) throw new Error('Ollama not responding');
      const models = await res.json();
      const modelNames = (models.models || []).map(m => m.name);
      console.log(`  Available models: ${modelNames.join(', ')}`);
      
      // Auto-select best available model
      if (!modelNames.some(m => m.startsWith(MODEL.split(':')[0]))) {
        if (modelNames.length > 0) {
          module.exports.MODEL = modelNames[0];
          console.log(`  Using available model: ${modelNames[0]}`);
        }
      }
    } catch (err) {
      console.error('❌ Neither Gemini API key nor Ollama available!');
      console.error('   Set GEMINI_API_KEY env var or start Ollama on localhost:11434');
      return 0;
    }
  }

  const analyzed = await analyzeUnrated();
  takeSnapshot();
  return analyzed;
}

// Run if called directly
if (require.main === module) {
  runAnalysis().then(count => {
    console.log(`\n✅ Analysis done. ${count} stories analyzed.`);
    process.exit(0);
  }).catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}

module.exports = { runAnalysis, takeSnapshot, analyzeSentiment, geminiKey, openaiKey };