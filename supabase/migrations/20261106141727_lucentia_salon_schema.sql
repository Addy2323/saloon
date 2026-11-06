/*
# Lucentia Beauty & Salon — Core Schema

## Overview
Creates the full database schema for a single-tenant beauty salon management system.
No authentication — the owner uses the app directly. All data is shared (single business).

## New Tables

1. `categories` — product and expense categories (e.g. Hair Products, Utilities)
2. `suppliers` — product suppliers/vendors
3. `staff` — salon employees/workers
4. `services` — service types offered (e.g. Kusuka, Washing) and their default prices
5. `hairstyles` — named styles under a service (e.g. "Twende Kilioni")
6. `products` — inventory items with current stock levels
7. `purchases` — records of product purchases (each purchase adds to stock)
8. `purchase_items` — line items within a purchase (product, qty, unit cost)
9. `expenses` — daily operating expenses (electricity, water, rent, etc.)
10. `sales` — salon service sales records (service, hairstyle, customers, payment)
11. `product_usage` — records of products consumed/spoiled/used up (reduces stock)

## Stock logic
- `products.current_stock` is increased by purchase line items and decreased by product_usage records.
- A trigger on `purchase_items` (after insert/update/delete) keeps `products.current_stock` in sync with the sum of purchased quantities minus used quantities.
- Purchases themselves do NOT count as expenses on the day of purchase — only product_usage counts as cost of goods used.

## Security
- RLS enabled on every table.
- Grants (SELECT/INSERT/UPDATE/DELETE) to `anon` and `authenticated` since this is a no-auth single-tenant app.
- Policies allow all CRUD for anon + authenticated (data is intentionally shared).
*/

-- ============================================================
-- CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('product', 'expense')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON categories TO anon, authenticated;
DROP POLICY IF EXISTS "anon_crud_categories" ON categories;
CREATE POLICY "anon_crud_categories" ON categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_ins_categories" ON categories FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_upd_categories" ON categories FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_del_categories" ON categories FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- SUPPLIERS
-- ============================================================
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  location text,
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON suppliers TO anon, authenticated;
DROP POLICY IF EXISTS "anon_sel_suppliers" ON suppliers;
CREATE POLICY "anon_sel_suppliers" ON suppliers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_ins_suppliers" ON suppliers FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_upd_suppliers" ON suppliers FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_del_suppliers" ON suppliers FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- STAFF
-- ============================================================
CREATE TABLE IF NOT EXISTS staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  role text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON staff TO anon, authenticated;
DROP POLICY IF EXISTS "anon_sel_staff" ON staff;
CREATE POLICY "anon_sel_staff" ON staff FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_ins_staff" ON staff FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_upd_staff" ON staff FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_del_staff" ON staff FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- SERVICES
-- ============================================================
CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  default_price numeric NOT NULL DEFAULT 0,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON services TO anon, authenticated;
DROP POLICY IF EXISTS "anon_sel_services" ON services;
CREATE POLICY "anon_sel_services" ON services FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_ins_services" ON services FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_upd_services" ON services FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_del_services" ON services FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- HAIRSTYLES
-- ============================================================
CREATE TABLE IF NOT EXISTS hairstyles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid REFERENCES services(id) ON DELETE CASCADE,
  name text NOT NULL,
  default_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE hairstyles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON hairstyles TO anon, authenticated;
DROP POLICY IF EXISTS "anon_sel_hairstyles" ON hairstyles;
CREATE POLICY "anon_sel_hairstyles" ON hairstyles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_ins_hairstyles" ON hairstyles FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_upd_hairstyles" ON hairstyles FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_del_hairstyles" ON hairstyles FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- PRODUCTS (inventory)
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  unit text NOT NULL DEFAULT 'pcs',
  unit_cost numeric NOT NULL DEFAULT 0,
  current_stock numeric NOT NULL DEFAULT 0,
  low_stock_threshold numeric NOT NULL DEFAULT 5,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON products TO anon, authenticated;
DROP POLICY IF EXISTS "anon_sel_products" ON products;
CREATE POLICY "anon_sel_products" ON products FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_ins_products" ON products FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_upd_products" ON products FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_del_products" ON products FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- PURCHASES (header)
-- ============================================================
CREATE TABLE IF NOT EXISTS purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  total_amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON purchases TO anon, authenticated;
DROP POLICY IF EXISTS "anon_sel_purchases" ON purchases;
CREATE POLICY "anon_sel_purchases" ON purchases FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_ins_purchases" ON purchases FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_upd_purchases" ON purchases FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_del_purchases" ON purchases FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- PURCHASE_ITEMS (line items)
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_cost numeric NOT NULL CHECK (unit_cost >= 0),
  line_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON purchase_items TO anon, authenticated;
DROP POLICY IF EXISTS "anon_sel_purchase_items" ON purchase_items;
CREATE POLICY "anon_sel_purchase_items" ON purchase_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_ins_purchase_items" ON purchase_items FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_upd_purchase_items" ON purchase_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_del_purchase_items" ON purchase_items FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- EXPENSES (daily operating expenses)
-- ============================================================
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  recorded_by text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON expenses TO anon, authenticated;
DROP POLICY IF EXISTS "anon_sel_expenses" ON expenses;
CREATE POLICY "anon_sel_expenses" ON expenses FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_ins_expenses" ON expenses FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_upd_expenses" ON expenses FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_del_expenses" ON expenses FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- SALES (salon services provided to customers)
-- ============================================================
CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  hairstyle_id uuid REFERENCES hairstyles(id) ON DELETE SET NULL,
  hairstyle_name text,
  customer_name text,
  num_customers integer NOT NULL DEFAULT 1 CHECK (num_customers > 0),
  price_per_customer numeric NOT NULL DEFAULT 0 CHECK (price_per_customer >= 0),
  discount numeric NOT NULL DEFAULT 0 CHECK (discount >= 0),
  amount_paid numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'Cash' CHECK (payment_method IN ('Cash','M-Pesa','Tigo Pesa','Airtel Money','Mixx by Yas','Bank')),
  staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
  sale_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz DEFAULT now()
);
-- computed: total_revenue = num_customers * price_per_customer - discount
-- balance = total_revenue - amount_paid (deni)
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON sales TO anon, authenticated;
DROP POLICY IF EXISTS "anon_sel_sales" ON sales;
CREATE POLICY "anon_sel_sales" ON sales FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_ins_sales" ON sales FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_upd_sales" ON sales FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_del_sales" ON sales FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- PRODUCT_USAGE (products used/spoiled/finished)
-- ============================================================
CREATE TABLE IF NOT EXISTS product_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity numeric NOT NULL CHECK (quantity > 0),
  usage_type text NOT NULL DEFAULT 'used' CHECK (usage_type IN ('used','spoiled','finished')),
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE product_usage ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON product_usage TO anon, authenticated;
DROP POLICY IF EXISTS "anon_sel_product_usage" ON product_usage;
CREATE POLICY "anon_sel_product_usage" ON product_usage FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_ins_product_usage" ON product_usage FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_upd_product_usage" ON product_usage FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_del_product_usage" ON product_usage FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- STOCK SYNC FUNCTION + TRIGGER
-- Recompute products.current_stock from purchases minus usage
-- ============================================================
CREATE OR REPLACE FUNCTION sync_product_stock(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_purchased numeric;
  v_used numeric;
BEGIN
  SELECT COALESCE(SUM(quantity), 0) INTO v_purchased
  FROM purchase_items WHERE product_id = p_product_id;
  SELECT COALESCE(SUM(quantity), 0) INTO v_used
  FROM product_usage WHERE product_id = p_product_id;
  UPDATE products SET current_stock = v_purchased - v_used WHERE id = p_product_id;
END;
$$;

CREATE OR REPLACE FUNCTION trg_sync_stock_on_purchase()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM sync_product_stock(NEW.product_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trg_sync_stock_on_purchase_del()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM sync_product_stock(OLD.product_id);
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION trg_sync_stock_on_usage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM sync_product_stock(NEW.product_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trg_sync_stock_on_usage_del()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM sync_product_stock(OLD.product_id);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS purchase_items_sync_ins ON purchase_items;
CREATE TRIGGER purchase_items_sync_ins AFTER INSERT ON purchase_items
  FOR EACH ROW EXECUTE FUNCTION trg_sync_stock_on_purchase();

DROP TRIGGER IF EXISTS purchase_items_sync_upd ON purchase_items;
CREATE TRIGGER purchase_items_sync_upd AFTER UPDATE ON purchase_items
  FOR EACH ROW EXECUTE FUNCTION trg_sync_stock_on_purchase();

DROP TRIGGER IF EXISTS purchase_items_sync_del ON purchase_items;
CREATE TRIGGER purchase_items_sync_del AFTER DELETE ON purchase_items
  FOR EACH ROW EXECUTE FUNCTION trg_sync_stock_on_purchase_del();

DROP TRIGGER IF EXISTS product_usage_sync_ins ON product_usage;
CREATE TRIGGER product_usage_sync_ins AFTER INSERT OR UPDATE ON product_usage
  FOR EACH ROW EXECUTE FUNCTION trg_sync_stock_on_usage();

DROP TRIGGER IF EXISTS product_usage_sync_del ON product_usage;
CREATE TRIGGER product_usage_sync_del AFTER DELETE ON product_usage
  FOR EACH ROW EXECUTE FUNCTION trg_sync_stock_on_usage_del();

-- Revoke EXECUTE from anon/public for the helper functions (internal)
REVOKE EXECUTE ON FUNCTION sync_product_stock(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION trg_sync_stock_on_purchase() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION trg_sync_stock_on_purchase_del() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION trg_sync_stock_on_usage() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION trg_sync_stock_on_usage_del() FROM PUBLIC, anon;

-- ============================================================
-- SEED DATA: default categories, services
-- ============================================================
INSERT INTO categories (name, type) VALUES
  ('Hair Products', 'product'),
  ('Hair Tools', 'product'),
  ('Treatments', 'product'),
  ('Utilities', 'expense'),
  ('Rent', 'expense'),
  ('Staff Welfare', 'expense'),
  ('Maintenance', 'expense'),
  ('Transport', 'expense'),
  ('Other', 'expense')
ON CONFLICT DO NOTHING;

INSERT INTO services (name, default_price) VALUES
  ('Kusuka (Braiding)', 15000),
  ('Kufunga Rasta (Dreadlocks)', 20000),
  ('Relaxing', 12000),
  ('Washing', 5000),
  ('Hair Treatment', 10000),
  ('Blow Dry', 8000),
  ('Hair Styling', 10000)
ON CONFLICT DO NOTHING;

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchase_date);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product ON purchase_items(product_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_product_usage_date ON product_usage(usage_date);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
