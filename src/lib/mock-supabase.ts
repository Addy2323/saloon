// Local storage-backed database adapter conforming to Supabase syntax
// Enables Lucentia Beauty & Salon to run zero-config out of the box with persistent storage
import { verifyBackendPermission, type SystemModuleKey } from './auth';

export interface Category {
  id: string;
  name: string;
  type: 'product' | 'service' | 'expense';
  description?: string | null;
  status?: 'active' | 'archived';
  created_at?: string;
  updated_at?: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone?: string | null;
  location?: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface Staff {
  id: string;
  name: string;
  phone?: string | null;
  role?: string | null;
  active?: boolean;
  created_at?: string;
}

export interface Service {
  id: string;
  name: string;
  default_price: number;
  active?: boolean;
  created_at?: string;
}

export interface Hairstyle {
  id: string;
  service_id?: string | null;
  name: string;
  default_price: number;
  created_at?: string;
}

export interface Product {
  id: string;
  name: string;
  category_id?: string | null;
  unit: string;
  unit_cost: number;
  current_stock: number;
  low_stock_threshold: number;
  image_url?: string | null;
  created_at?: string;
}

export interface Purchase {
  id: string;
  supplier_id?: string | null;
  purchase_date: string;
  total_amount: number;
  notes?: string | null;
  created_at?: string;
}

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
  created_at?: string;
}

export interface Expense {
  id: string;
  name: string;
  category_id?: string | null;
  amount: number;
  expense_date: string;
  notes?: string | null;
  recorded_by?: string | null;
  created_at?: string;
}

export interface Sale {
  id: string;
  service_id?: string | null;
  hairstyle_id?: string | null;
  hairstyle_name?: string | null;
  customer_name?: string | null;
  num_customers: number;
  price_per_customer: number;
  buying_cost?: number;
  discount: number;
  amount_paid: number;
  payment_method: string;
  staff_id?: string | null;
  sale_date: string;
  notes?: string | null;
  created_at?: string;
}

export interface ProductUsage {
  id: string;
  product_id: string;
  quantity: number;
  usage_type: 'used' | 'spoiled' | 'finished';
  usage_date: string;
  notes?: string | null;
  created_at?: string;
}

function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getStored<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(`lucentia_db_${key}`);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setStored<T>(key: string, val: T): void {
  try {
    localStorage.setItem(`lucentia_db_${key}`, JSON.stringify(val));
  } catch {
    // Ignore storage quota errors
  }
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const DEFAULT_CATEGORIES: Category[] = [
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
    id: 'cat-exp-1',
    name: 'Utilities & Bills',
    type: 'expense',
    description: 'Electricity (LUKU), water (DAWASA), internet, and municipal waste bills',
    status: 'active',
  },
  {
    id: 'cat-exp-2',
    name: 'Shop Operations & Rent',
    type: 'expense',
    description: 'Monthly salon rent, staff meals, allowances, and equipment maintenance',
    status: 'active',
  },
  {
    id: 'cat-exp-3',
    name: 'Cleaning & Sanitation',
    type: 'expense',
    description: 'Towels, disinfectants, detergents, and daily salon hygiene supplies',
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

/**
 * Checks whether a record ID belongs to demonstration/seed fixtures.
 * Matches prefix patterns like 'sal-1', 'pur-1', 'pit-1', 'exp-1', 'prd-1', etc.
 */
function isMockFixtureId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^(sal-|pur-|pit-|exp-|prd-|stf-|sup-|srv-|hst-|usg-demo)/.test(id);
}

function initDefaultDatabase() {
  if (typeof window === 'undefined') return;

  // 1. One-time clean migration: purge all mock/demo fixtures from local database,
  // preserving any genuine user transactions and business entities.
  if (!localStorage.getItem('lucentia_db_clean_real_v1')) {
    const purgeMockTable = (table: string) => {
      const existing = getStored<any[]>(table, []);
      if (Array.isArray(existing) && existing.length > 0) {
        // Keep ONLY genuine records created by user (preserve real transactions)
        const realOnly = existing.filter((item) => !isMockFixtureId(item.id));
        setStored(table, realOnly);
      }
    };

    purgeMockTable('sales');
    purgeMockTable('expenses');
    purgeMockTable('purchases');
    purgeMockTable('purchase_items');
    purgeMockTable('products');
    purgeMockTable('staff');
    purgeMockTable('suppliers');
    purgeMockTable('services');
    purgeMockTable('hairstyles');
    purgeMockTable('product_usage');
    purgeMockTable('sale_payments');
    purgeMockTable('customers');

    // Remove legacy demo init flags
    localStorage.removeItem('lucentia_db_initialized_v1');
    localStorage.removeItem('lucentia_db_initialized_v2');
    localStorage.setItem('lucentia_db_clean_real_v1', 'true');
  }

  // 2. Ensure organizational categories taxonomy is available for dropdowns
  const categories = getStored<Category[]>('categories', []);
  if (!Array.isArray(categories) || categories.length === 0) {
    setStored('categories', DEFAULT_CATEGORIES);
  } else {
    // If user has categories, ensure service, product, and expense category types exist
    let updated = false;
    const catList = [...categories];
    DEFAULT_CATEGORIES.forEach((def) => {
      if (!catList.some((c) => c.name.toLowerCase() === def.name.toLowerCase() && c.type === def.type)) {
        catList.push(def);
        updated = true;
      }
    });
    if (updated) {
      setStored('categories', catList);
    }
  }
}

let sqliteMigrationPromise: Promise<void> | null = null;

async function syncLocalToSqliteOnce(): Promise<void> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
  if (localStorage.getItem('lucentia_sqlite_migrated_v1') === 'true') return;

  try {
    const tablesToMigrate = [
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
    ];
    const tablesPayload: Record<string, any[]> = {};
    for (const t of tablesToMigrate) {
      const rows = getStored<any[]>(t, []);
      if (Array.isArray(rows) && rows.length > 0) {
        tablesPayload[t] = rows;
      }
    }

    const rawUsers = localStorage.getItem('lucentia_users_v3');
    const rawRoles = localStorage.getItem('lucentia_roles_v2');
    const rawLogs = localStorage.getItem('lucentia_audit_logs_v1');

    const res = await fetch('/api/sqlite/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tables: tablesPayload,
        auth: {
          users: rawUsers ? JSON.parse(rawUsers) : undefined,
          roles: rawRoles ? JSON.parse(rawRoles) : undefined,
          auditLogs: rawLogs ? JSON.parse(rawLogs) : undefined,
        },
      }),
    });

    if (res.ok) {
      localStorage.setItem('lucentia_sqlite_migrated_v1', 'true');
    }
  } catch {
    // SQLite server not reachable in offline mode; will retry next session
  }
}

export function createLocalSupabaseClient() {
  if (typeof window !== 'undefined') {
    initDefaultDatabase();
    if (!sqliteMigrationPromise) {
      sqliteMigrationPromise = syncLocalToSqliteOnce();
    }
  }

  return {
    from: (table: string) => new LocalQueryBuilder(table),
  };
}

interface SqliteFilterDescriptor {
  column: string;
  op: 'eq' | 'neq' | 'gte' | 'lte';
  value: any;
}

class LocalQueryBuilder {
  private table: string;
  private filters: ((item: any) => boolean)[] = [];
  private filterDescriptors: SqliteFilterDescriptor[] = [];
  private orderClauses: { column: string; ascending: boolean }[] = [];
  private limitCount?: number;
  private isSingle = false;
  private selectClause = '*';
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: any = null;

  constructor(table: string) {
    this.table = table;
  }

  select(columns = '*') {
    this.selectClause = columns;
    return this;
  }

  insert(values: any | any[]) {
    this.action = 'insert';
    this.payload = values;
    return this;
  }

  update(values: any) {
    this.action = 'update';
    this.payload = values;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push((item) => item[column] === value);
    this.filterDescriptors.push({ column, op: 'eq', value });
    return this;
  }

  neq(column: string, value: any) {
    this.filters.push((item) => item[column] !== value);
    this.filterDescriptors.push({ column, op: 'neq', value });
    return this;
  }

  gte(column: string, value: any) {
    this.filters.push((item) => item[column] >= value);
    this.filterDescriptors.push({ column, op: 'gte', value });
    return this;
  }

  lte(column: string, value: any) {
    this.filters.push((item) => item[column] <= value);
    this.filterDescriptors.push({ column, op: 'lte', value });
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}) {
    const ascending = options.ascending ?? true;
    this.orderClauses.push({ column, ascending });
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  private resolveJoins(item: any): any {
    const copy = { ...item };

    if (this.selectClause.includes('categories(name)') && copy.category_id) {
      const categories: Category[] = getStored('categories', []);
      const cat = categories.find((c) => c.id === copy.category_id);
      copy.categories = cat ? { name: cat.name } : null;
    }

    if (this.selectClause.includes('suppliers(name)') && copy.supplier_id) {
      const suppliers: Supplier[] = getStored('suppliers', []);
      const sup = suppliers.find((s) => s.id === copy.supplier_id);
      copy.suppliers = sup ? { name: sup.name } : null;
    }

    if (this.selectClause.includes('services(name)') && copy.service_id) {
      const services: Service[] = getStored('services', []);
      const srv = services.find((s) => s.id === copy.service_id);
      copy.services = srv ? { name: srv.name } : null;
    }

    if (this.selectClause.includes('staff(name)') && copy.staff_id) {
      const staffList: Staff[] = getStored('staff', []);
      const stf = staffList.find((s) => s.id === copy.staff_id);
      copy.staff = stf ? { name: stf.name } : null;
    }

    if (this.selectClause.includes('products(') && copy.product_id) {
      const products: Product[] = getStored('products', []);
      const prd = products.find((p) => p.id === copy.product_id);
      if (prd) {
        copy.products = { name: prd.name, unit_cost: prd.unit_cost, image_url: prd.image_url };
      } else {
        copy.products = null;
      }
    }

    return copy;
  }

  private getModuleKeyForTable(): SystemModuleKey {
    const map: Record<string, SystemModuleKey> = {
      products: 'inventory',
      product_usage: 'inventory',
      purchases: 'purchases',
      purchase_items: 'purchases',
      suppliers: 'purchases',
      expenses: 'expenses',
      services: 'services',
      hairstyles: 'services',
      sales: 'sales',
      sale_payments: 'sales',
      customers: 'sales',
      categories: 'categories',
      staff: 'settings',
    };
    return map[this.table] || 'settings';
  }

  async then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    try {
      // Backend RBAC Authorization Check on all database operations
      const modKey = this.getModuleKeyForTable();
      const reqAction =
        this.action === 'select'
          ? 'view'
          : this.action === 'insert'
            ? 'create'
            : this.action === 'update'
              ? 'edit'
              : 'delete';
      if (this.action !== 'select') {
        const check = verifyBackendPermission(modKey, reqAction);
        if (!check.allowed) {
          const forbiddenRes = { data: null, error: { message: check.reason || 'Forbidden' } };
          return onfulfilled ? onfulfilled(forbiddenRes) : (forbiddenRes as any);
        }
      }

      // Primary Database Engine: SQLite3 (/api/sqlite/query)
      if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
        try {
          if (sqliteMigrationPromise) {
            await sqliteMigrationPromise;
          }
          const sqliteRes = await fetch('/api/sqlite/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              table: this.table,
              action: this.action,
              selectClause: this.selectClause,
              filters: this.filterDescriptors,
              orderClauses: this.orderClauses,
              limitCount: this.limitCount,
              isSingle: this.isSingle,
              payload: this.payload,
            }),
          });
          if (sqliteRes.ok) {
            const json = await sqliteRes.json();
            return onfulfilled ? onfulfilled(json) : (json as any);
          }
        } catch {
          // Offline fallback to local storage if SQLite server is unreachable
        }
      }

      const list: any[] = getStored(this.table, []);
      let resultData: any = null;

      if (this.action === 'select') {
        let filtered = list.filter((item) => this.filters.every((fn) => fn(item)));

        if (this.orderClauses.length > 0) {
          filtered.sort((a, b) => {
            for (const { column, ascending } of this.orderClauses) {
              const valA = a[column];
              const valB = b[column];
              if (valA < valB) return ascending ? -1 : 1;
              if (valA > valB) return ascending ? 1 : -1;
            }
            return 0;
          });
        }

        if (this.limitCount !== undefined) {
          filtered = filtered.slice(0, this.limitCount);
        }

        const resolved = filtered.map((item) => this.resolveJoins(item));
        resultData = this.isSingle ? (resolved[0] ?? null) : resolved;
      } else if (this.action === 'insert') {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
        const inserted = rows.map((r) => ({
          ...r,
          id: r.id || uid(),
          created_at: r.created_at || new Date().toISOString(),
        }));

        list.push(...inserted);
        setStored(this.table, list);

        // Auto stock adjustments for purchases & usage
        if (this.table === 'purchase_items') {
          const products: Product[] = getStored('products', []);
          inserted.forEach((item) => {
            const prd = products.find((p) => p.id === item.product_id);
            if (prd) {
              const oldQty = Math.max(0, prd.current_stock || 0);
              const addQty = Number(item.quantity || 0);
              const newCost = Number(item.unit_cost || 0);
              // Weighted-average unit cost keeps inventory valuation accurate
              if (newCost > 0 && oldQty + addQty > 0) {
                prd.unit_cost = Math.round((oldQty * (prd.unit_cost || 0) + addQty * newCost) / (oldQty + addQty));
              }
              prd.current_stock = (prd.current_stock || 0) + addQty;
            }
          });
          setStored('products', products);
        } else if (this.table === 'sale_payments') {
          // Keep parent sale amount_paid & status synchronized with its payment history
          const sales: any[] = getStored('sales', []);
          inserted.forEach((pay) => {
            const sale = sales.find((s) => s.id === pay.sale_id);
            if (sale) {
              sale.amount_paid = (sale.amount_paid || 0) + Number(pay.amount || 0);
              const net =
                (sale.num_customers || 0) * (sale.price_per_customer || 0) -
                (sale.discount || 0) -
                (sale.refund_amount || 0);
              if (sale.status !== 'cancelled' && sale.status !== 'refunded') {
                sale.status = sale.amount_paid >= net ? 'completed' : sale.amount_paid > 0 ? 'partial' : 'unpaid';
              }
            }
          });
          setStored('sales', sales);
        } else if (this.table === 'product_usage') {
          const products: Product[] = getStored('products', []);
          inserted.forEach((item) => {
            const prd = products.find((p) => p.id === item.product_id);
            if (prd) {
              prd.current_stock = Math.max(0, (prd.current_stock || 0) - Number(item.quantity || 0));
            }
          });
          setStored('products', products);
        }

        resultData = this.isSingle || !Array.isArray(this.payload) ? inserted[0] : inserted;
      } else if (this.action === 'update') {
        const updatedList = list.map((item) => {
          if (this.filters.every((fn) => fn(item))) {
            return { ...item, ...this.payload, updated_at: new Date().toISOString() };
          }
          return item;
        });
        setStored(this.table, updatedList);
        resultData = updatedList.find((item) => this.filters.every((fn) => fn(item))) || null;
      } else if (this.action === 'delete') {
        const toDelete = list.filter((item) => this.filters.every((fn) => fn(item)));
        const remaining = list.filter((item) => !this.filters.every((fn) => fn(item)));
        setStored(this.table, remaining);

        // Revert stock if purchase items or purchase deleted
        if (this.table === 'purchases') {
          const allPurchaseItems: PurchaseItem[] = getStored('purchase_items', []);
          const products: Product[] = getStored('products', []);
          const delIds = new Set(toDelete.map((p) => p.id));
          const itemsToRemove = allPurchaseItems.filter((i) => delIds.has(i.purchase_id));
          const itemsToKeep = allPurchaseItems.filter((i) => !delIds.has(i.purchase_id));

          itemsToRemove.forEach((item) => {
            const prd = products.find((p) => p.id === item.product_id);
            if (prd) {
              prd.current_stock = Math.max(0, (prd.current_stock || 0) - Number(item.quantity || 0));
            }
          });
          setStored('products', products);
          setStored('purchase_items', itemsToKeep);
        } else if (this.table === 'product_usage') {
          // Restore stock when a consumption record is removed
          const products: Product[] = getStored('products', []);
          toDelete.forEach((u) => {
            const prd = products.find((p) => p.id === u.product_id);
            if (prd) prd.current_stock = (prd.current_stock || 0) + Number(u.quantity || 0);
          });
          setStored('products', products);
        } else if (this.table === 'sales') {
          // Cascade: restore stock for linked consumption & remove payment history
          const delIds = new Set(toDelete.map((s) => s.id));
          const usage: any[] = getStored('product_usage', []);
          const products: Product[] = getStored('products', []);
          usage
            .filter((u) => u.sale_id && delIds.has(u.sale_id))
            .forEach((u) => {
              const prd = products.find((p) => p.id === u.product_id);
              if (prd) prd.current_stock = (prd.current_stock || 0) + Number(u.quantity || 0);
            });
          setStored('products', products);
          setStored(
            'product_usage',
            usage.filter((u) => !(u.sale_id && delIds.has(u.sale_id))),
          );
          const payments: any[] = getStored('sale_payments', []);
          setStored(
            'sale_payments',
            payments.filter((p) => !delIds.has(p.sale_id)),
          );
        }

        resultData = toDelete;
      }

      const res = { data: resultData, error: null };
      return onfulfilled ? onfulfilled(res) : (res as any);
    } catch (err: any) {
      const res = { data: null, error: err };
      return onrejected ? onrejected(err) : onfulfilled ? onfulfilled(res) : (res as any);
    }
  }
}
