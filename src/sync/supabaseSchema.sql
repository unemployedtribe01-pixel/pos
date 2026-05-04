CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY, name TEXT, category TEXT, brand TEXT, variant TEXT,
  hsn_code TEXT, gst_rate REAL, mrp REAL, cost_price REAL, unit TEXT,
  stock_qty REAL, low_stock_threshold REAL, aliases TEXT, price_inclusive BOOLEAN DEFAULT FALSE, is_active BOOLEAN,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY, name TEXT, phone TEXT, type TEXT, gstin TEXT,
  address TEXT, credit_limit REAL, credit_days INTEGER, opening_balance REAL, created_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY, invoice_no TEXT UNIQUE, customer_id TEXT, customer_snapshot JSONB,
  date DATE, lines JSONB, subtotal REAL, gst_amount REAL, rounding REAL, total REAL,
  payments JSONB, credit_amount REAL, change_due REAL DEFAULT 0,
  supply_type TEXT DEFAULT 'intra', cgst_amount REAL DEFAULT 0, sgst_amount REAL DEFAULT 0, igst_amount REAL DEFAULT 0,
  place_of_supply_code TEXT DEFAULT '', place_of_supply_name TEXT DEFAULT '',
  status TEXT, notes TEXT, created_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS rate_cards (
  id TEXT PRIMARY KEY,
  customer_id TEXT,
  customer_type TEXT,
  product_id TEXT,
  special_price REAL,
  min_qty REAL,
  valid_from DATE,
  valid_to DATE
);
CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY, customer_id TEXT, type TEXT, ref_type TEXT, ref_id TEXT, amount REAL, balance_after REAL, date DATE, notes TEXT, created_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS credit_payments (
  id TEXT PRIMARY KEY, customer_id TEXT, amount REAL, mode TEXT, ref_no TEXT, date DATE, applied_to_bill_ids JSONB, notes TEXT, created_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS credit_notes (
  id TEXT PRIMARY KEY,
  credit_note_no TEXT UNIQUE,
  original_bill_id TEXT,
  customer_id TEXT,
  date DATE,
  lines JSONB,
  total_credit REAL,
  notes TEXT,
  created_at TIMESTAMPTZ
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS price_inclusive BOOLEAN DEFAULT FALSE;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS change_due REAL DEFAULT 0;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS supply_type TEXT DEFAULT 'intra';
ALTER TABLE bills ADD COLUMN IF NOT EXISTS cgst_amount REAL DEFAULT 0;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS sgst_amount REAL DEFAULT 0;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS igst_amount REAL DEFAULT 0;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS place_of_supply_code TEXT DEFAULT '';
ALTER TABLE bills ADD COLUMN IF NOT EXISTS place_of_supply_name TEXT DEFAULT '';

ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE bills DISABLE ROW LEVEL SECURITY;
ALTER TABLE rate_cards DISABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries DISABLE ROW LEVEL SECURITY;
ALTER TABLE credit_payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE credit_notes DISABLE ROW LEVEL SECURITY;
