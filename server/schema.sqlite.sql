-- =============================================================================
-- LUCENTIA BEAUTY & SALON MANAGEMENT SYSTEM
-- Production SQLite 3 Database Schema & Seed Data
-- Usage: sqlite3 data/lucentia.sqlite < server/schema.sqlite.sql
-- =============================================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

-- 1. Organizational Categories (Product, Service, Expense)
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('product', 'service', 'expense')),
  description TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT
);

-- 2. Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  location TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT
);

-- 3. Staff Members
CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT
);

-- 4. Salon Services
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  default_price REAL DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT
);

-- 5. Hairstyles (Linked to Services)
CREATE TABLE IF NOT EXISTS hairstyles (
  id TEXT PRIMARY KEY,
  service_id TEXT REFERENCES services(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  default_price REAL DEFAULT 0,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT
);

-- 6. Products & Inventory
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  unit TEXT DEFAULT 'pack',
  unit_cost REAL DEFAULT 0,
  current_stock REAL DEFAULT 0,
  low_stock_threshold REAL DEFAULT 5,
  image_url TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT
);

-- 7. Product Purchases (Header)
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  purchase_date TEXT NOT NULL,
  total_amount REAL DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT
);

-- 8. Purchase Items (Line Items)
CREATE TABLE IF NOT EXISTS purchase_items (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity REAL DEFAULT 0,
  unit_cost REAL DEFAULT 0,
  line_total REAL DEFAULT 0,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT
);

-- 9. Daily Operating Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  amount REAL DEFAULT 0,
  expense_date TEXT NOT NULL,
  payment_method TEXT,
  notes TEXT,
  recorded_by TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT
);

-- 10. Customers
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT
);

-- 11. Salon Sales & Service Transactions
CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  service_id TEXT REFERENCES services(id) ON DELETE SET NULL,
  hairstyle_id TEXT REFERENCES hairstyles(id) ON DELETE SET NULL,
  hairstyle_name TEXT,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_phone TEXT,
  num_customers INTEGER DEFAULT 1,
  price_per_customer REAL DEFAULT 0,
  buying_cost REAL DEFAULT 0,
  consumed_product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  consumed_quantity REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  refund_amount REAL DEFAULT 0,
  amount_paid REAL DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'partial', 'unpaid', 'cancelled', 'refunded')),
  staff_id TEXT REFERENCES staff(id) ON DELETE SET NULL,
  sale_date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT
);

-- 12. Sale Payments (Installments & Balance Settlements)
CREATE TABLE IF NOT EXISTS sale_payments (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  amount REAL DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  payment_date TEXT NOT NULL,
  recorded_by TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT
);

-- 13. Inventory Movements / Product Consumption
CREATE TABLE IF NOT EXISTS product_usage (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sale_id TEXT REFERENCES sales(id) ON DELETE CASCADE,
  quantity REAL DEFAULT 0,
  unit_cost REAL DEFAULT 0,
  usage_type TEXT DEFAULT 'used' CHECK (usage_type IN ('used', 'spoiled', 'finished')),
  usage_date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT
);

-- 14. Authentication, RBAC Roles & Security Audit Store
CREATE TABLE IF NOT EXISTS auth_kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- =============================================================================
-- Performance Indexes
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchase_date);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product ON purchase_items(product_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON sale_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_product_usage_date ON product_usage(usage_date);
CREATE INDEX IF NOT EXISTS idx_product_usage_sale ON product_usage(sale_id);

-- =============================================================================
-- Default Organizational Categories & Services Seed
-- (Matches 20261106141727_lucentia_salon_schema.sql)
-- =============================================================================
INSERT OR IGNORE INTO categories (id, name, type, description, status) VALUES
  ('cat-prod-1', 'Braiding & Rasta', 'product', 'Braiding hair packs, Rasta extensions, and crochet supplies', 'active'),
  ('cat-prod-2', 'Hair Care & Oils', 'product', 'Hair oils, serums, edge control wax, and styling gels', 'active'),
  ('cat-prod-3', 'Hair Wash & Treatment', 'product', 'Shampoos, leave-in conditioners, hair masks, and relaxer kits', 'active'),
  ('cat-prod-4', 'Hair Products', 'product', 'General hair products and styling supplies', 'active'),
  ('cat-prod-5', 'Hair Tools', 'product', 'Combs, clips, dryers, and salon tools', 'active'),
  ('cat-prod-6', 'Treatments', 'product', 'Deep conditioning and hair treatment products', 'active'),
  ('cat-exp-1', 'Utilities', 'expense', 'Electricity (LUKU), water (DAWASA), internet, and municipal waste bills', 'active'),
  ('cat-exp-2', 'Rent', 'expense', 'Monthly salon rent', 'active'),
  ('cat-exp-3', 'Staff Welfare', 'expense', 'Staff meals, allowances, and welfare', 'active'),
  ('cat-exp-4', 'Maintenance', 'expense', 'Salon equipment maintenance and repairs', 'active'),
  ('cat-exp-5', 'Transport', 'expense', 'Transportation and delivery costs', 'active'),
  ('cat-exp-6', 'Cleaning & Sanitation', 'expense', 'Towels, disinfectants, detergents, and daily salon hygiene supplies', 'active'),
  ('cat-exp-7', 'Other', 'expense', 'Other daily operating expenses', 'active'),
  ('cat-srv-1', 'Braiding & Protective Styles', 'service', 'Knotless braids, Twende Kilioni, and Rasta installations', 'active'),
  ('cat-srv-2', 'Wash, Treatment & Styling', 'service', 'Deep conditioning, silk press, blow dry, and hair treatment services', 'active');

INSERT OR IGNORE INTO services (id, name, category_id, default_price, active) VALUES
  ('srv-seed-1', 'Kusuka (Braiding)', 'cat-srv-1', 15000, 1),
  ('srv-seed-2', 'Kufunga Rasta (Dreadlocks)', 'cat-srv-1', 20000, 1),
  ('srv-seed-3', 'Relaxing', 'cat-srv-2', 12000, 1),
  ('srv-seed-4', 'Washing', 'cat-srv-2', 5000, 1),
  ('srv-seed-5', 'Hair Treatment', 'cat-srv-2', 10000, 1),
  ('srv-seed-6', 'Blow Dry', 'cat-srv-2', 8000, 1),
  ('srv-seed-7', 'Hair Styling', 'cat-srv-2', 10000, 1);

