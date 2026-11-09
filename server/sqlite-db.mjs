import initSqlJs from 'sql.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');
export const DATA_DIR = process.env.SQLITE_DATA_DIR
  ? path.resolve(process.env.SQLITE_DATA_DIR)
  : path.join(ROOT_DIR, 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const DB_PATH = process.env.SQLITE_DB_PATH
  ? path.resolve(process.env.SQLITE_DB_PATH)
  : path.join(DATA_DIR, 'lucentia.sqlite');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const SQL = await initSqlJs();

let dbInstance;
if (fs.existsSync(DB_PATH) && fs.statSync(DB_PATH).size > 0) {
  const fileBuffer = fs.readFileSync(DB_PATH);
  dbInstance = new SQL.Database(fileBuffer);
} else {
  dbInstance = new SQL.Database();
}

export const db = dbInstance;
db.run('PRAGMA foreign_keys = ON;');

let inTransaction = false;

export function persistDatabaseToDisk() {
  if (inTransaction) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, DB_PATH);
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    if (params.length > 0) {
      stmt.bind(params);
    }
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    return rows;
  } finally {
    stmt.free();
  }
}

function queryGet(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows[0] ?? null;
}

function runSql(sql, params = []) {
  db.run(sql, params);
}

function runTransaction(fn) {
  const wasInTx = inTransaction;
  if (!wasInTx) {
    db.run('BEGIN TRANSACTION;');
    inTransaction = true;
  }
  try {
    const res = fn();
    if (!wasInTx) {
      db.run('COMMIT;');
      inTransaction = false;
      persistDatabaseToDisk();
    }
    return res;
  } catch (err) {
    if (!wasInTx) {
      try {
        db.run('ROLLBACK;');
      } catch {
        // ignore rollback error
      }
      inTransaction = false;
    }
    throw err;
  }
}

const ALLOWED_TABLES = new Set([
  'categories',
  'suppliers',
  'staff',
  'services',
  'hairstyles',
  'products',
  'purchases',
  'purchase_items',
  'expenses',
  'customers',
  'sales',
  'sale_payments',
  'product_usage',
]);

const BOOLEAN_COLUMNS = {
  staff: ['active'],
  services: ['active'],
};

const TABLE_COLUMNS = {
  categories: ['id', 'name', 'type', 'description', 'status', 'created_at', 'updated_at'],
  suppliers: ['id', 'name', 'phone', 'location', 'notes', 'created_at', 'updated_at'],
  staff: ['id', 'name', 'phone', 'role', 'active', 'created_at', 'updated_at'],
  services: ['id', 'name', 'category_id', 'default_price', 'active', 'created_at', 'updated_at'],
  hairstyles: ['id', 'service_id', 'name', 'default_price', 'created_at', 'updated_at'],
  products: [
    'id',
    'name',
    'category_id',
    'unit',
    'unit_cost',
    'current_stock',
    'low_stock_threshold',
    'image_url',
    'created_at',
    'updated_at',
  ],
  purchases: ['id', 'supplier_id', 'purchase_date', 'total_amount', 'notes', 'created_at', 'updated_at'],
  purchase_items: [
    'id',
    'purchase_id',
    'product_id',
    'quantity',
    'unit_cost',
    'line_total',
    'created_at',
    'updated_at',
  ],
  expenses: [
    'id',
    'name',
    'category_id',
    'amount',
    'expense_date',
    'payment_method',
    'notes',
    'recorded_by',
    'created_at',
    'updated_at',
  ],
  customers: ['id', 'name', 'phone', 'notes', 'created_at', 'updated_at'],
  sales: [
    'id',
    'service_id',
    'hairstyle_id',
    'hairstyle_name',
    'customer_id',
    'customer_name',
    'customer_phone',
    'num_customers',
    'price_per_customer',
    'buying_cost',
    'consumed_product_id',
    'consumed_quantity',
    'discount',
    'refund_amount',
    'amount_paid',
    'payment_method',
    'status',
    'staff_id',
    'sale_date',
    'notes',
    'created_at',
    'updated_at',
  ],
  sale_payments: [
    'id',
    'sale_id',
    'amount',
    'payment_method',
    'payment_date',
    'recorded_by',
    'notes',
    'created_at',
    'updated_at',
  ],
  product_usage: [
    'id',
    'product_id',
    'sale_id',
    'quantity',
    'unit_cost',
    'usage_type',
    'usage_date',
    'notes',
    'created_at',
    'updated_at',
  ],
};

function initSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      location TEXT,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      role TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category_id TEXT,
      default_price REAL DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS hairstyles (
      id TEXT PRIMARY KEY,
      service_id TEXT,
      name TEXT NOT NULL,
      default_price REAL DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category_id TEXT,
      unit TEXT DEFAULT 'pack',
      unit_cost REAL DEFAULT 0,
      current_stock REAL DEFAULT 0,
      low_stock_threshold REAL DEFAULT 5,
      image_url TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY,
      supplier_id TEXT,
      purchase_date TEXT NOT NULL,
      total_amount REAL DEFAULT 0,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS purchase_items (
      id TEXT PRIMARY KEY,
      purchase_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity REAL DEFAULT 0,
      unit_cost REAL DEFAULT 0,
      line_total REAL DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category_id TEXT,
      amount REAL DEFAULT 0,
      expense_date TEXT NOT NULL,
      payment_method TEXT,
      notes TEXT,
      recorded_by TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      service_id TEXT,
      hairstyle_id TEXT,
      hairstyle_name TEXT,
      customer_id TEXT,
      customer_name TEXT,
      customer_phone TEXT,
      num_customers INTEGER DEFAULT 1,
      price_per_customer REAL DEFAULT 0,
      buying_cost REAL DEFAULT 0,
      consumed_product_id TEXT,
      consumed_quantity REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      refund_amount REAL DEFAULT 0,
      amount_paid REAL DEFAULT 0,
      payment_method TEXT DEFAULT 'cash',
      status TEXT DEFAULT 'completed',
      staff_id TEXT,
      sale_date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sale_payments (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      amount REAL DEFAULT 0,
      payment_method TEXT DEFAULT 'cash',
      payment_date TEXT NOT NULL,
      recorded_by TEXT,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS product_usage (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      sale_id TEXT,
      quantity REAL DEFAULT 0,
      unit_cost REAL DEFAULT 0,
      usage_type TEXT DEFAULT 'used',
      usage_date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS auth_kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchase_date);
    CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_items_product ON purchase_items(product_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
    CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
    CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON sale_payments(sale_id);
    CREATE INDEX IF NOT EXISTS idx_product_usage_date ON product_usage(usage_date);
    CREATE INDEX IF NOT EXISTS idx_product_usage_sale ON product_usage(sale_id);
  `);

  const now = new Date().toISOString();
  const defaultCategories = [
    {
      id: 'cat-prod-1',
      name: 'Braiding & Rasta',
      type: 'product',
      description: 'Braiding hair packs, Rasta extensions, and crochet supplies',
      status: 'active',
    },
    {
      id: 'cat-prod-2',
      name: 'Hair Care & Oils',
      type: 'product',
      description: 'Hair oils, serums, edge control wax, and styling gels',
      status: 'active',
    },
    {
      id: 'cat-prod-3',
      name: 'Hair Wash & Treatment',
      type: 'product',
      description: 'Shampoos, leave-in conditioners, hair masks, and relaxer kits',
      status: 'active',
    },
    {
      id: 'cat-prod-4',
      name: 'Hair Products',
      type: 'product',
      description: 'General hair products and styling supplies',
      status: 'active',
    },
    {
      id: 'cat-prod-5',
      name: 'Hair Tools',
      type: 'product',
      description: 'Combs, clips, dryers, and salon tools',
      status: 'active',
    },
    {
      id: 'cat-prod-6',
      name: 'Treatments',
      type: 'product',
      description: 'Deep conditioning and hair treatment products',
      status: 'active',
    },
    {
      id: 'cat-exp-1',
      name: 'Utilities',
      type: 'expense',
      description: 'Electricity (LUKU), water (DAWASA), internet, and municipal waste bills',
      status: 'active',
    },
    {
      id: 'cat-exp-2',
      name: 'Rent',
      type: 'expense',
      description: 'Monthly salon rent',
      status: 'active',
    },
    {
      id: 'cat-exp-3',
      name: 'Staff Welfare',
      type: 'expense',
      description: 'Staff meals, allowances, and welfare',
      status: 'active',
    },
    {
      id: 'cat-exp-4',
      name: 'Maintenance',
      type: 'expense',
      description: 'Salon equipment maintenance and repairs',
      status: 'active',
    },
    {
      id: 'cat-exp-5',
      name: 'Transport',
      type: 'expense',
      description: 'Transportation and delivery costs',
      status: 'active',
    },
    {
      id: 'cat-exp-6',
      name: 'Cleaning & Sanitation',
      type: 'expense',
      description: 'Towels, disinfectants, detergents, and daily salon hygiene supplies',
      status: 'active',
    },
    {
      id: 'cat-exp-7',
      name: 'Other',
      type: 'expense',
      description: 'Other daily operating expenses',
      status: 'active',
    },
    {
      id: 'cat-srv-1',
      name: 'Braiding & Protective Styles',
      type: 'service',
      description: 'Knotless braids, Twende Kilioni, and Rasta installations',
      status: 'active',
    },
    {
      id: 'cat-srv-2',
      name: 'Wash, Treatment & Styling',
      type: 'service',
      description: 'Deep conditioning, silk press, blow dry, and hair treatment services',
      status: 'active',
    },
  ];

  const defaultServices = [
    { id: 'srv-seed-1', name: 'Kusuka (Braiding)', category_id: 'cat-srv-1', default_price: 15000, active: 1 },
    { id: 'srv-seed-2', name: 'Kufunga Rasta (Dreadlocks)', category_id: 'cat-srv-1', default_price: 20000, active: 1 },
    { id: 'srv-seed-3', name: 'Relaxing', category_id: 'cat-srv-2', default_price: 12000, active: 1 },
    { id: 'srv-seed-4', name: 'Washing', category_id: 'cat-srv-2', default_price: 5000, active: 1 },
    { id: 'srv-seed-5', name: 'Hair Treatment', category_id: 'cat-srv-2', default_price: 10000, active: 1 },
    { id: 'srv-seed-6', name: 'Blow Dry', category_id: 'cat-srv-2', default_price: 8000, active: 1 },
    { id: 'srv-seed-7', name: 'Hair Styling', category_id: 'cat-srv-2', default_price: 10000, active: 1 },
  ];

  runTransaction(() => {
    for (const c of defaultCategories) {
      runSql(
        'INSERT OR IGNORE INTO categories (id, name, type, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [c.id, c.name, c.type, c.description, c.status, now]
      );
    }
    const srvCount = queryGet('SELECT COUNT(*) AS cnt FROM services');
    if (!srvCount || Number(srvCount.cnt) === 0) {
      for (const s of defaultServices) {
        runSql(
          'INSERT OR IGNORE INTO services (id, name, category_id, default_price, active, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [s.id, s.name, s.category_id, s.default_price, s.active, now]
        );
      }
    }
  });
}

initSchema();

/**
 * Extracts a base64 Data URL image, writes it to `data/uploads/` on disk,
 * and returns the lightweight `/uploads/<filename>` path.
 */
function persistBase64ImageIfPresent(val) {
  if (typeof val !== 'string' || !val.startsWith('data:image/')) {
    return val;
  }
  const match = val.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
  if (!match) return val;
  const extRaw = match[1].toLowerCase();
  const ext = extRaw === 'jpeg' ? 'jpg' : extRaw === 'svg+xml' ? 'svg' : extRaw;
  const base64Data = match[2];
  const filename = `prd-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  const filePath = path.join(UPLOADS_DIR, filename);
  try {
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    return `/uploads/${filename}`;
  } catch {
    return val;
  }
}

function normalizeRowFromDb(table, row) {
  if (!row) return row;
  const out = { ...row };
  const boolCols = BOOLEAN_COLUMNS[table] || [];
  for (const col of boolCols) {
    if (out[col] !== undefined && out[col] !== null) {
      out[col] = Boolean(out[col]);
    }
  }
  return out;
}

function resolveJoins(row, selectClause = '*') {
  const copy = { ...row };

  if (selectClause.includes('categories(name)') && copy.category_id) {
    const cat = queryGet('SELECT name FROM categories WHERE id = ?', [copy.category_id]);
    copy.categories = cat ? { name: cat.name } : null;
  }

  if (selectClause.includes('suppliers(name)') && copy.supplier_id) {
    const sup = queryGet('SELECT name FROM suppliers WHERE id = ?', [copy.supplier_id]);
    copy.suppliers = sup ? { name: sup.name } : null;
  }

  if (selectClause.includes('services(name)') && copy.service_id) {
    const srv = queryGet('SELECT name FROM services WHERE id = ?', [copy.service_id]);
    copy.services = srv ? { name: srv.name } : null;
  }

  if (selectClause.includes('staff(name)') && copy.staff_id) {
    const stf = queryGet('SELECT name FROM staff WHERE id = ?', [copy.staff_id]);
    copy.staff = stf ? { name: stf.name } : null;
  }

  if (selectClause.includes('products(') && copy.product_id) {
    const prd = queryGet('SELECT name, unit_cost, image_url FROM products WHERE id = ?', [
      copy.product_id,
    ]);
    copy.products = prd
      ? { name: prd.name, unit_cost: prd.unit_cost, image_url: prd.image_url }
      : null;
  }

  return copy;
}

function buildWhereClause(table, filters = []) {
  const validCols = new Set(TABLE_COLUMNS[table] || []);
  const clauses = [];
  const params = [];

  for (const f of filters) {
    if (!f || !validCols.has(f.column)) continue;
    const opMap = {
      eq: '=',
      neq: '!=',
      gte: '>=',
      lte: '<=',
    };
    const sqlOp = opMap[f.op];
    if (!sqlOp) continue;

    if (f.value === null) {
      clauses.push(`${f.column} IS ${f.op === 'neq' ? 'NOT NULL' : 'NULL'}`);
    } else {
      let val = f.value;
      if (typeof val === 'boolean') val = val ? 1 : 0;
      clauses.push(`${f.column} ${sqlOp} ?`);
      params.push(val);
    }
  }

  return {
    whereSql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

export function executeSqliteQuery({
  table,
  action = 'select',
  selectClause = '*',
  filters = [],
  orderClauses = [],
  limitCount,
  isSingle = false,
  payload = null,
}) {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`Invalid table: ${table}`);
  }

  const validCols = TABLE_COLUMNS[table];
  const validColSet = new Set(validCols);

  if (action === 'select') {
    const { whereSql, params } = buildWhereClause(table, filters);
    let orderSql = '';
    if (Array.isArray(orderClauses) && orderClauses.length > 0) {
      const parts = orderClauses
        .filter((o) => o && validColSet.has(o.column))
        .map((o) => `${o.column} ${o.ascending ? 'ASC' : 'DESC'}`);
      if (parts.length > 0) {
        orderSql = `ORDER BY ${parts.join(', ')}`;
      }
    }
    const limitSql =
      typeof limitCount === 'number' && limitCount > 0 ? `LIMIT ${Math.floor(limitCount)}` : '';

    const sql = `SELECT * FROM ${table} ${whereSql} ${orderSql} ${limitSql}`;
    const rows = queryAll(sql, params).map((r) =>
      resolveJoins(normalizeRowFromDb(table, r), selectClause)
    );

    return isSingle ? (rows[0] ?? null) : rows;
  }

  if (action === 'insert') {
    const rows = Array.isArray(payload) ? payload : [payload];
    const nowIso = new Date().toISOString();

    const inserted = runTransaction(() => {
      const insertedRows = [];

      for (const raw of rows) {
        if (!raw || typeof raw !== 'object') continue;
        const item = {
          ...raw,
          id: raw.id || crypto.randomUUID(),
          created_at: raw.created_at || nowIso,
        };

        if (table === 'products' && item.image_url) {
          item.image_url = persistBase64ImageIfPresent(item.image_url);
        }

        const colsToInsert = validCols.filter((c) => item[c] !== undefined);
        const placeholders = colsToInsert.map(() => '?').join(', ');
        const values = colsToInsert.map((c) => {
          const v = item[c];
          if (typeof v === 'boolean') return v ? 1 : 0;
          return v ?? null;
        });

        runSql(
          `INSERT OR REPLACE INTO ${table} (${colsToInsert.join(', ')}) VALUES (${placeholders})`,
          values
        );

        // Relational side-effects inside the same ACID transaction:
        if (table === 'purchase_items') {
          const prd = queryGet(
            'SELECT id, current_stock, unit_cost FROM products WHERE id = ?',
            [item.product_id]
          );
          if (prd) {
            const oldQty = Math.max(0, Number(prd.current_stock || 0));
            const addQty = Number(item.quantity || 0);
            const newCost = Number(item.unit_cost || 0);
            let nextUnitCost = Number(prd.unit_cost || 0);
            if (newCost > 0 && oldQty + addQty > 0) {
              nextUnitCost = Math.round(
                (oldQty * nextUnitCost + addQty * newCost) / (oldQty + addQty)
              );
            }
            const nextStock = Number(prd.current_stock || 0) + addQty;
            runSql(
              'UPDATE products SET current_stock = ?, unit_cost = ?, updated_at = ? WHERE id = ?',
              [nextStock, nextUnitCost, nowIso, prd.id]
            );
          }
        } else if (table === 'sale_payments') {
          const sale = queryGet('SELECT * FROM sales WHERE id = ?', [item.sale_id]);
          if (sale) {
            const nextPaid = Number(sale.amount_paid || 0) + Number(item.amount || 0);
            const net =
              Number(sale.num_customers || 0) * Number(sale.price_per_customer || 0) -
              Number(sale.discount || 0) -
              Number(sale.refund_amount || 0);
            let nextStatus = sale.status || 'completed';
            if (nextStatus !== 'cancelled' && nextStatus !== 'refunded') {
              nextStatus = nextPaid >= net ? 'completed' : nextPaid > 0 ? 'partial' : 'unpaid';
            }
            runSql('UPDATE sales SET amount_paid = ?, status = ?, updated_at = ? WHERE id = ?', [
              nextPaid,
              nextStatus,
              nowIso,
              sale.id,
            ]);
          }
        } else if (table === 'product_usage') {
          const prd = queryGet('SELECT id, current_stock FROM products WHERE id = ?', [
            item.product_id,
          ]);
          if (prd) {
            const nextStock = Math.max(
              0,
              Number(prd.current_stock || 0) - Number(item.quantity || 0)
            );
            runSql('UPDATE products SET current_stock = ?, updated_at = ? WHERE id = ?', [
              nextStock,
              nowIso,
              prd.id,
            ]);
          }
        }

        const saved = queryGet(`SELECT * FROM ${table} WHERE id = ?`, [item.id]);
        insertedRows.push(resolveJoins(normalizeRowFromDb(table, saved), selectClause));
      }

      return insertedRows;
    });

    return isSingle || !Array.isArray(payload) ? (inserted[0] ?? null) : inserted;
  }

  if (action === 'update') {
    const { whereSql, params } = buildWhereClause(table, filters);
    const nowIso = new Date().toISOString();
    const patch = { ...(payload || {}), updated_at: nowIso };

    if (table === 'products' && patch.image_url) {
      patch.image_url = persistBase64ImageIfPresent(patch.image_url);
    }

    const updateCols = validCols.filter((c) => c !== 'id' && patch[c] !== undefined);
    if (updateCols.length === 0) {
      return null;
    }

    return runTransaction(() => {
      const setClause = updateCols.map((c) => `${c} = ?`).join(', ');
      const setValues = updateCols.map((c) => {
        const v = patch[c];
        if (typeof v === 'boolean') return v ? 1 : 0;
        return v ?? null;
      });

      runSql(`UPDATE ${table} SET ${setClause} ${whereSql}`, [...setValues, ...params]);
      const updatedRows = queryAll(`SELECT * FROM ${table} ${whereSql}`, params).map((r) =>
        resolveJoins(normalizeRowFromDb(table, r), selectClause)
      );
      return updatedRows[0] ?? null;
    });
  }

  if (action === 'delete') {
    const { whereSql, params } = buildWhereClause(table, filters);
    const nowIso = new Date().toISOString();

    return runTransaction(() => {
      const toDelete = queryAll(`SELECT * FROM ${table} ${whereSql}`, params).map((r) =>
        normalizeRowFromDb(table, r)
      );

      if (toDelete.length === 0) return [];

      if (table === 'purchases') {
        for (const pur of toDelete) {
          const items = queryAll('SELECT * FROM purchase_items WHERE purchase_id = ?', [pur.id]);
          for (const item of items) {
            const prd = queryGet('SELECT id, current_stock FROM products WHERE id = ?', [
              item.product_id,
            ]);
            if (prd) {
              const nextStock = Math.max(
                0,
                Number(prd.current_stock || 0) - Number(item.quantity || 0)
              );
              runSql('UPDATE products SET current_stock = ?, updated_at = ? WHERE id = ?', [
                nextStock,
                nowIso,
                prd.id,
              ]);
            }
          }
          runSql('DELETE FROM purchase_items WHERE purchase_id = ?', [pur.id]);
        }
      } else if (table === 'product_usage') {
        for (const u of toDelete) {
          const prd = queryGet('SELECT id, current_stock FROM products WHERE id = ?', [
            u.product_id,
          ]);
          if (prd) {
            const nextStock = Number(prd.current_stock || 0) + Number(u.quantity || 0);
            runSql('UPDATE products SET current_stock = ?, updated_at = ? WHERE id = ?', [
              nextStock,
              nowIso,
              prd.id,
            ]);
          }
        }
      } else if (table === 'sales') {
        for (const s of toDelete) {
          const usages = queryAll('SELECT * FROM product_usage WHERE sale_id = ?', [s.id]);
          for (const u of usages) {
            const prd = queryGet('SELECT id, current_stock FROM products WHERE id = ?', [
              u.product_id,
            ]);
            if (prd) {
              const nextStock = Number(prd.current_stock || 0) + Number(u.quantity || 0);
              runSql('UPDATE products SET current_stock = ?, updated_at = ? WHERE id = ?', [
                nextStock,
                nowIso,
                prd.id,
              ]);
            }
          }
          runSql('DELETE FROM product_usage WHERE sale_id = ?', [s.id]);
          runSql('DELETE FROM sale_payments WHERE sale_id = ?', [s.id]);
        }
      }

      runSql(`DELETE FROM ${table} ${whereSql}`, params);
      return toDelete;
    });
  }

  throw new Error(`Unsupported action: ${action}`);
}

export function getAuthKv(key) {
  const row = queryGet('SELECT value FROM auth_kv WHERE key = ?', [key]);
  if (!row) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

export function setAuthKv(key, value) {
  const now = new Date().toISOString();
  runTransaction(() => {
    runSql('INSERT OR REPLACE INTO auth_kv (key, value, updated_at) VALUES (?, ?, ?)', [
      key,
      JSON.stringify(value),
      now,
    ]);
  });
}

export function exportSqliteBinaryBuffer() {
  return Buffer.from(db.export());
}

export function getDatabaseStats() {
  const stats = {};
  for (const table of ALLOWED_TABLES) {
    const row = queryGet(`SELECT COUNT(*) AS cnt FROM ${table}`);
    stats[table] = row ? Number(row.cnt) : 0;
  }
  let sizeBytes = 0;
  try {
    sizeBytes = fs.statSync(DB_PATH).size;
  } catch {
    // ignore
  }
  return {
    engine: 'SQLite3 (sql.js WASM + Atomic File Persistence)',
    dbPath: DB_PATH,
    sizeBytes,
    tables: stats,
  };
}
