export const SCHEMA_SQL = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
  brand TEXT NOT NULL, variant TEXT NOT NULL, hsn_code TEXT NOT NULL,
  gst_rate REAL NOT NULL, mrp REAL NOT NULL, cost_price REAL NOT NULL,
  unit TEXT NOT NULL, stock_qty REAL NOT NULL DEFAULT 0,
  low_stock_threshold REAL NOT NULL DEFAULT 5, aliases TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'retail', gstin TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '', credit_limit REAL NOT NULL DEFAULT 0,
  credit_days INTEGER NOT NULL DEFAULT 0, opening_balance REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_cards (
  id TEXT PRIMARY KEY, customer_id TEXT, customer_type TEXT,
  product_id TEXT NOT NULL, special_price REAL NOT NULL,
  min_qty REAL NOT NULL DEFAULT 1, valid_from TEXT NOT NULL, valid_to TEXT NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY, invoice_no TEXT NOT NULL UNIQUE,
  customer_id TEXT, customer_snapshot TEXT, date TEXT NOT NULL,
  lines TEXT NOT NULL, subtotal REAL NOT NULL, gst_amount REAL NOT NULL,
  rounding REAL NOT NULL DEFAULT 0, total REAL NOT NULL,
  payments TEXT NOT NULL, credit_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft', notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, type TEXT NOT NULL,
  ref_type TEXT NOT NULL, ref_id TEXT NOT NULL, amount REAL NOT NULL,
  balance_after REAL NOT NULL, date TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS credit_payments (
  id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, amount REAL NOT NULL,
  mode TEXT NOT NULL, ref_no TEXT NOT NULL DEFAULT '', date TEXT NOT NULL,
  applied_to_bill_ids TEXT NOT NULL DEFAULT '[]', notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY, entity TEXT NOT NULL, operation TEXT NOT NULL,
  payload TEXT NOT NULL, created_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS credit_notes (
  id TEXT PRIMARY KEY,
  credit_note_no TEXT NOT NULL UNIQUE,
  original_bill_id TEXT NOT NULL,
  customer_id TEXT,
  date TEXT NOT NULL,
  lines TEXT NOT NULL,
  total_credit REAL NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (original_bill_id) REFERENCES bills(id)
);

CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO app_meta VALUES ('invoice_counter', '1');
INSERT OR IGNORE INTO app_meta VALUES ('credit_note_counter', '1');
INSERT OR IGNORE INTO app_meta VALUES ('device_id', 'D1');
INSERT OR IGNORE INTO app_meta VALUES ('db_version', '1');
`
