// Initialize SQLite database with full schema
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'db', 'winfut.db');

// Ensure db dir exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  -- OHLCV data by timeframe
  CREATE TABLE IF NOT EXISTS ohlcv (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timeframe TEXT NOT NULL,       -- M5, M15, M30, H1, H4, D1, W1
    timestamp INTEGER NOT NULL,    -- Unix ms
    open REAL NOT NULL,
    high REAL NOT NULL,
    low REAL NOT NULL,
    close REAL NOT NULL,
    volume REAL DEFAULT 0,
    UNIQUE(timeframe, timestamp)
  );
  CREATE INDEX IF NOT EXISTS idx_ohlcv_tf_ts ON ohlcv(timeframe, timestamp);

  -- Detected patterns
  CREATE TABLE IF NOT EXISTS patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id TEXT NOT NULL,         -- Group scans together
    pattern TEXT NOT NULL,         -- Pattern name e.g. "Bullish_Engulfing"
    category TEXT NOT NULL,        -- candlestick, chart, harmonic, liquidity, volume, wyckoff
    direction TEXT NOT NULL,       -- bullish, bearish, neutral
    strength INTEGER DEFAULT 1,   -- 1-5
    timeframe TEXT NOT NULL,
    candle_ts INTEGER NOT NULL,    -- Timestamp of the candle
    price REAL NOT NULL,
    open REAL, high REAL, low REAL, close REAL,
    forward_5 REAL,                -- Price 5 candles later
    forward_10 REAL,
    forward_20 REAL,
    forward_50 REAL,
    result_5 REAL,                 -- Price change after 5 candles
    result_10 REAL,
    result_20 REAL,
    result_50 REAL,
    success_5 INTEGER,             -- 1 if direction matched, 0 if not, NULL if unknown
    success_10 INTEGER,
    success_20 INTEGER,
    description TEXT,
    extra_json TEXT,               -- Full pattern metadata as JSON
    detected_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    UNIQUE(scan_id, pattern, timeframe, candle_ts)
  );
  CREATE INDEX IF NOT EXISTS idx_patterns_pattern ON patterns(pattern);
  CREATE INDEX IF NOT EXISTS idx_patterns_tf ON patterns(timeframe);
  CREATE INDEX IF NOT EXISTS idx_patterns_cat ON patterns(category);
  CREATE INDEX IF NOT EXISTS idx_patterns_scan ON patterns(scan_id);

  -- Pattern statistics (aggregated)
  CREATE TABLE IF NOT EXISTS pattern_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    category TEXT NOT NULL,
    direction TEXT,
    occurrences INTEGER DEFAULT 0,
    win_rate_5 REAL,
    win_rate_10 REAL,
    win_rate_20 REAL,
    avg_gain_5 REAL,
    avg_loss_5 REAL,
    avg_gain_10 REAL,
    avg_loss_10 REAL,
    profit_factor_5 REAL,
    expectancy_5 REAL,
    expectancy_20 REAL,
    std_dev_5 REAL,
    sharpe_5 REAL,
    reliability TEXT,
    best_horizon TEXT,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    UNIQUE(pattern, timeframe)
  );

  -- Scan log
  CREATE TABLE IF NOT EXISTS scans (
    id TEXT PRIMARY KEY,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    timeframes TEXT,
    total_patterns INTEGER DEFAULT 0,
    status TEXT DEFAULT 'running'   -- running, completed, failed
  );

  -- Real-time alerts
  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    direction TEXT NOT NULL,
    price REAL NOT NULL,
    strength INTEGER,
    win_rate_5 REAL,
    profit_factor_5 REAL,
    message TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    acknowledged INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at);

  -- Config
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Insert default config if not exists
const insertConfig = db.prepare('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)');
insertConfig.run('capital', '10000');
insertConfig.run('risk_per_trade', '0.5');
insertConfig.run('limit_daily', '2');
insertConfig.run('limit_weekly', '5');
insertConfig.run('yh_symbol', '^BVSP');
insertConfig.run('tv_symbol', 'BMFBOVESPA:WIN1!');

console.log(`✅ Database initialized: ${DB_PATH}`);
console.log('   Tables: ohlcv, patterns, pattern_stats, scans, alerts, config');

db.close();
