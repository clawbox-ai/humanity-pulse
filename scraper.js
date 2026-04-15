const fetch = require('node-fetch');
const { parseStringPromise } = require('xml2js');
const db = require('./db');

const RSS_FEEDS = [
  // === BBC ===
  { name: 'BBC World', url: 'http://feeds.bbci.co.uk/news/world/rss.xml', type: 'rss' },
  { name: 'BBC Tech', url: 'http://feeds.bbci.co.uk/news/technology/rss.xml', type: 'rss' },
  { name: 'BBC Science', url: 'http://feeds.bbci.co.uk/news/science_and_environment/rss.xml', type: 'rss' },
  { name: 'BBC Health', url: 'http://feeds.bbci.co.uk/news/health/rss.xml', type: 'rss' },
  { name: 'BBC Business', url: 'http://feeds.bbci.co.uk/news/business/rss.xml', type: 'rss' },
  { name: 'BBC Politics', url: 'http://feeds.bbci.co.uk/news/politics/rss.xml', type: 'rss' },
  { name: 'BBC Africa', url: 'http://feeds.bbci.co.uk/news/world/africa/rss.xml', type: 'rss' },
  { name: 'BBC Asia', url: 'http://feeds.bbci.co.uk/news/world/asia/rss.xml', type: 'rss' },
  { name: 'BBC Europe', url: 'http://feeds.bbci.co.uk/news/world/europe/rss.xml', type: 'rss' },
  { name: 'BBC Latin America', url: 'http://feeds.bbci.co.uk/news/world/latin_america/rss.xml', type: 'rss' },
  { name: 'BBC Middle East', url: 'http://feeds.bbci.co.uk/news/world/middle_east/rss.xml', type: 'rss' },

  // === The Guardian ===
  { name: 'Guardian World', url: 'https://www.theguardian.com/world/rss', type: 'rss' },
  { name: 'Guardian US', url: 'https://www.theguardian.com/us-news/rss', type: 'rss' },
  { name: 'Guardian Tech', url: 'https://www.theguardian.com/technology/rss', type: 'rss' },
  { name: 'Guardian Science', url: 'https://www.theguardian.com/science/rss', type: 'rss' },
  { name: 'Guardian Environment', url: 'https://www.theguardian.com/environment/rss', type: 'rss' },
  { name: 'Guardian Business', url: 'https://www.theguardian.com/business/rss', type: 'rss' },
  { name: 'Guardian Health', url: 'https://www.theguardian.com/society/health/rss', type: 'rss' },
  { name: 'Guardian Climate Crisis', url: 'https://www.theguardian.com/environment/climate-crisis/rss', type: 'rss' },
  { name: 'Guardian Global Development', url: 'https://www.theguardian.com/global-development/rss', type: 'rss' },

  // === NPR ===
  { name: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml', type: 'rss' },
  { name: 'NPR Science', url: 'https://feeds.npr.org/1007/rss.xml', type: 'rss' },
  { name: 'NPR World', url: 'https://feeds.npr.org/1004/rss.xml', type: 'rss' },
  { name: 'NPR Health', url: 'https://feeds.npr.org/1127/rss.xml', type: 'rss' },
  { name: 'NPR Tech', url: 'https://feeds.npr.org/1019/rss.xml', type: 'rss' },

  // === Al Jazeera ===
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', type: 'rss' },

  // === Reuters ===
  { name: 'Reuters World', url: 'https://www.reuters.com/rssFeed/worldNews', type: 'rss' },
  { name: 'Reuters Tech', url: 'https://www.reuters.com/rssFeed/technologyNews', type: 'rss' },
  { name: 'Reuters Science', url: 'https://www.reuters.com/rssFeed/scienceNews', type: 'rss' },
  { name: 'Reuters Health', url: 'https://www.reuters.com/rssFeed/healthNews', type: 'rss' },
  { name: 'Reuters Business', url: 'https://www.reuters.com/rssFeed/businessNews', type: 'rss' },

  // === AP News ===
  { name: 'AP World', url: 'https://feedx.net/rss/ap-world.xml', type: 'rss' },
  { name: 'AP Science', url: 'https://feedx.net/rss/ap-science.xml', type: 'rss' },

  // === CNN ===
  { name: 'CNN World', url: 'http://rss.cnn.com/rss/edition_world.rss', type: 'rss' },
  { name: 'CNN Tech', url: 'http://rss.cnn.com/rss/edition_technology.rss', type: 'rss' },
  { name: 'CNN Health', url: 'http://rss.cnn.com/rss/edition_health.rss', type: 'rss' },

  // === Tech & Science ===
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', type: 'rss' },
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', type: 'rss' },
  { name: 'Wired', url: 'https://www.wired.com/feed/rss', type: 'rss' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', type: 'rss' },
  { name: 'New Scientist', url: 'https://www.newscientist.com/feed/home/', type: 'rss' },
  { name: 'Science Daily', url: 'https://www.sciencedaily.com/rss/all.xml', type: 'rss' },
  { name: 'Nature', url: 'https://www.nature.com/nature.rss', type: 'rss' },
  { name: 'MIT Tech Review', url: 'https://www.technologyreview.com/feed/', type: 'rss' },

  // === Climate & Environment ===
  { name: 'Carbon Brief', url: 'https://www.carbonbrief.org/feed/', type: 'rss' },
  { name: 'Inside Climate News', url: 'https://insideclimatenews.org/feed/', type: 'rss' },
  { name: 'Grist', url: 'https://grist.org/feed/', type: 'rss' },

  // === Health & Medicine ===
  { name: 'WHO News', url: 'https://www.who.int/rss-feeds/news-english.xml', type: 'rss' },
  { name: 'Stat News', url: 'https://www.statnews.com/feed/', type: 'rss' },

  // === Global Development & Human Rights ===
  { name: 'UN News', url: 'https://news.un.org/en/feed/subscribe', type: 'rss' },
  { name: 'Human Rights Watch', url: 'https://www.hrw.org/en/rss/news', type: 'rss' },
  { name: 'Amnesty International', url: 'https://www.amnesty.org/en/feed/', type: 'rss' },

  // === Economy & Finance ===
  { name: 'CNBC World', url: 'https://www.cnbc.com/id/100727362/device/rss/rss.html', type: 'rss' },
  { name: 'Financial Times', url: 'https://www.ft.com/rss/home', type: 'rss' },

  // === Space & Exploration ===
  { name: 'NASA', url: 'https://www.nasa.gov/rss/dyn/breaking_news.rss', type: 'rss' },
  { name: 'Space.com', url: 'https://www.space.com/feeds/all', type: 'rss' },

  // === AI & Future ===
  { name: 'AI News', url: 'https://artificialintelligence-news.com/feed/', type: 'rss' },
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
        pub_date: (item.pubDate || item.published || item.updated || new Date().toISOString() || '').toString().slice(0, 100) || new Date().toISOString()
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
      try {
        const result = insert.run(
          s.source || 'Unknown',
          s.title || '',
          s.link || '',
          s.description || '',
          s.pub_date || new Date().toISOString()
        );
        if (result.changes > 0) newCount++;
      } catch(e) {
        // Skip malformed stories
      }
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