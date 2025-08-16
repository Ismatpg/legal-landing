-- Tablas básicas
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  phone TEXT NOT NULL,
  city TEXT NOT NULL,
  summary TEXT NOT NULL,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_term TEXT, utm_content TEXT,
  gclid TEXT
);

CREATE TABLE IF NOT EXISTS routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL
  -- email puede contener varios correos separados por coma
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Valor por defecto (puedes cambiarlo por API)
INSERT OR IGNORE INTO settings (key, value) VALUES ('default_email', 'leads@example.com');
