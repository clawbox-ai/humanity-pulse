const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'humanity-pulse.db'));

// Enable WAL mode for better concurrent reads
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    title TEXT NOT NULL,
    link TEXT,
    description TEXT,
    pub_date TEXT,
    sentiment_score REAL,
    sentiment_reason TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(source, title)
  );

  CREATE INDEX IF NOT EXISTS idx_stories_created ON stories(created_at);
  CREATE INDEX IF NOT EXISTS idx_stories_score ON stories(sentiment_score);

  CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    avg_score REAL,
    story_count INTEGER,
    positive_count INTEGER,
    negative_count INTEGER,
    neutral_count INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_snapshots_created ON snapshots(created_at);
`);

module.exports = db;