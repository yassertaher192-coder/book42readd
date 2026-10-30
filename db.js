const Database = require('better-sqlite3');
const db = new Database('data/library.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','editor','reader')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS books(
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL,
  author TEXT, summary TEXT, description TEXT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  pages INTEGER CHECK(pages IS NULL OR pages > 0), year INTEGER, isbn TEXT, publisher TEXT,
  availability TEXT NOT NULL DEFAULT 'available' CHECK(availability IN ('available','upcoming','unavailable')),
  cover TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','published')),
  publish_at TEXT, sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS audit_logs(
  id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL, detail TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
`);
const DEFAULTS = {
  site_name: 'المكتبة الأدبية', author_name: '', tagline: '',
  empty_message: 'ستجد هنا إصدارات المكتبة قريبًا'
};
for (const [k, v] of Object.entries(DEFAULTS))
  db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').run(k, v);
db.settings = () => Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(r => [r.key, r.value]));
module.exports = db;
