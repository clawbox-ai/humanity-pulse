const fetch = require('node-fetch');
const { parseStringPromise } = require('xml2js');
const db = require('./db');

const RSS_FEEDS = [
  { name: 'BBC World', url: 'http://feeds.bbci.co.uk/news/world/rss.xml', type: 'rss' },
  { name: 'BBC Tech', url: 'http://feeds.bbci.co.uk/news/technology/rss.xml', type: 'rss' },
  { name: 'BBC Science', url: 'http://feeds.bbci.co.uk/news/science_and_environment/rss.xml', type: 'rss' },
  { name: 'BBC Health', url: 'http://feeds.bbci.co.uk/news/health/rss.xml', type: 'rss' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', type: 'rss' },
  { name: 'The Guardian World', url: 'https://www.theguardian.com/world/rss', type: 'rss' },
  { name: 'The Guardian US', url: 'https://www.theguardian.com/us-news/rss', type: 'rss' },
  { name: 'The Guardian Tech', url: 'https://www.theguardian.com/technology/rss', type: 'rss' },
  { name: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml', type: 'rss' },
  { name: 'NPR Science', url: 'https://feeds.npr.org/1007/rss.xml', type: 'rss' },
  { name: 'NPR World', url: 'https://feeds.npr.org/1004/rss.xml', type: 'rss' },
];

async function fetchRSS(feed) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    
    const res = await fetch(feed.url, { 
      signal: controller.signal,
      headers: { 'User-Agent': 'HumanityPulse/1.0' }
    });
    clearTimeout(timeout);
    
    if (!res.ok) {
      console.log(`  [SKIP] ${feed.name}: HTTP ${res.status}`);
      return [];
    }

    const xml = await res.text();
    const result = await parseStringPromise(xml, { explicitArray: false });
    
    const items = result.rss?.channel?.item || result.feed?.entry || [];
    const stories = (Array.isArray(items) ? items : [items])
      .filter(item => item?.title)
      .map(item => ({
        source: feed.name,
        title: item.title?._ || item.title || '',
        link: item.link?.href || item.link || '',
        description: (item.description?._ || item.description || item.summary?._ || item.summary || '').replace(/<[^>]*>/g, '').trim().slice(0, 500),
        pub_date: item.pubDate || item.published || item.updated || new Date().toISOString()
      }));

    console.log(`  [OK] ${feed.name}: ${stories.length} stories`);
    return stories;
  } catch (err) {
    console.log(`  [ERR] ${feed.name}: ${err.message}`);
    return [];
  }
}

async function scrapeWorldMonitor() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    
    const res = await fetch('https://worldmonitor.com', {
      signal: controller.signal,
      headers: { 'User-Agent': 'HumanityPulse/1.0' }
    });
    clearTimeout(timeout);
    
    if (!res.ok) return [];
    
    const html = await res.text();
    const stories = [];
    const seen = new Set();
    
    // Extract headlines from h tags, link text, and article titles
    const headlineRegex = /<(?:h[1-6]|a|p|span|div)[^>]*(?:class="[^"]*(?:title|headline|story|article|post)[^"]*")?[^>]*>([^<]+)<\//gi;
    let match;
    while ((match = headlineRegex.exec(html)) !== null) {
      const title = match[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, '').trim();
      if (title && title.length > 15 && title.length < 300 && !seen.has(title) && 
          !/^(Home|About|Contact|Login|Sign)/.test(title) &&
          !/worldmonitor/i.test(title)) {
        seen.add(title);
        stories.push({
          source: 'WorldMonitor',
          title: title,
          link: 'https://worldmonitor.com',
          description: '',
          pub_date: new Date().toISOString()
        });
      }
    }
    
    console.log(`  [OK] WorldMonitor: ${stories.length} stories`);
    return stories.slice(0, 30); // Cap at 30
  } catch (err) {
    console.log(`  [ERR] WorldMonitor: ${err.message}`);
    return [];
  }
}

function storeStories(stories) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO stories (source, title, link, description, pub_date)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  let newCount = 0;
  const insertMany = db.transaction((items) => {
    for (const s of items) {
      const result = insert.run(s.source, s.title, s.link, s.description, s.pub_date);
      if (result.changes > 0) newCount++;
    }
  });
  
  insertMany(stories);
  return newCount;
}

async function scrapeAll() {
  console.log(`\n📡 [${new Date().toISOString()}] Starting scrape...`);
  
  const allStories = [];
  
  // Scrape WorldMonitor
  const wmStories = await scrapeWorldMonitor();
  allStories.push(...wmStories);
  
  // Scrape all RSS feeds in parallel
  const rssResults = await Promise.all(RSS_FEEDS.map(feed => fetchRSS(feed)));
  for (const stories of rssResults) {
    allStories.push(...stories);
  }
  
  console.log(`📊 Total stories fetched: ${allStories.length}`);
  
  const newCount = storeStories(allStories);
  console.log(`💾 New stories stored: ${newCount}`);
  
  return newCount;
}

// Run if called directly
if (require.main === module) {
  scrapeAll().then(count => {
    console.log(`\n✅ Done. ${count} new stories.`);
    process.exit(0);
  }).catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}

module.exports = { scrapeAll, RSS_FEEDS };