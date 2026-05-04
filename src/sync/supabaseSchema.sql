CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY, name TEXT, category TEXT, brand TEXT, variant TEXT,
  hsn_code TEXT, gst_rate REAL, mrp REAL, cost_price REAL, unit TEXT,
  stock_qty REAL, low_stock_threshold REAL, aliases TEXT, is_active BOOLEAN,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY, name TEXT, phone TEXT, type TEXT, gstin TEXT,
  address TEXT, credit_limit REAL, credit_days INTEGER, opening_balance REAL, created_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY, invoice_no TEXT UNIQUE, customer_id TEXT, customer_snapshot JSONB,
  date DATE, lines JSONB, subtotal REAL, gst_amount REAL, rounding REAL, total REAL, payments JSONB, credit_amount REAL, status TEXT, notes TEXT, created_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY, customer_id TEXT, type TEXT, ref_type TEXT, ref_id TEXT, amount REAL, balance_after REAL, date DATE, notes TEXT, created_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS credit_payments (
  id TEXT PRIMARY KEY, customer_id TEXT, amount REAL, mode TEXT, ref_no TEXT, date DATE, applied_to_bill_ids JSONB, notes TEXT, created_at TIMESTAMPTZ
);
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE bills DISABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries DISABLE ROW LEVEL SECURITY;
ALTER TABLE credit_payments DISABLE ROW LEVEL SECURITY;
