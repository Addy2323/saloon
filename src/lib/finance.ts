import type {
  Sale,
  Expense,
  Purchase,
  Product,
  ProductUsage,
  Service,
  SalePaymentStatus,
} from './types';

// ---------------------------------------------------------------------------
// Date Helpers (Local Salon Timezone YYYY-MM-DD)
// ---------------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, '0');

export function toYMD(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export type UnifiedPeriodPreset =
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'lastWeek'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisYear'
  | 'all'
  | 'custom';

export interface DateRangeBounds {
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
}

export function getPeriodBounds(preset: UnifiedPeriodPreset, customFrom?: string, customTo?: string): DateRangeBounds {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (preset === 'today') {
    const y = addDays(today, -1);
    return { start: toYMD(today), end: toYMD(today), prevStart: toYMD(y), prevEnd: toYMD(y) };
  }

  if (preset === 'yesterday') {
    const y = addDays(today, -1);
    const beforeY = addDays(today, -2);
    return { start: toYMD(y), end: toYMD(y), prevStart: toYMD(beforeY), prevEnd: toYMD(beforeY) };
  }

  if (preset === 'thisWeek') {
    const dow = today.getDay();
    const start = addDays(today, dow === 0 ? -6 : 1 - dow);
    return {
      start: toYMD(start),
      end: toYMD(today),
      prevStart: toYMD(addDays(start, -7)),
      prevEnd: toYMD(addDays(today, -7)),
    };
  }

  if (preset === 'lastWeek') {
    const dow = today.getDay();
    const thisWeekStart = addDays(today, dow === 0 ? -6 : 1 - dow);
    const start = addDays(thisWeekStart, -7);
    const end = addDays(thisWeekStart, -1);
    return {
      start: toYMD(start),
      end: toYMD(end),
      prevStart: toYMD(addDays(start, -7)),
      prevEnd: toYMD(addDays(end, -7)),
    };
  }

  if (preset === 'thisMonth') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const prevStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevEnd = new Date(
      today.getFullYear(),
      today.getMonth() - 1,
      Math.min(today.getDate(), new Date(today.getFullYear(), today.getMonth(), 0).getDate()),
    );
    return {
      start: toYMD(start),
      end: toYMD(today),
      prevStart: toYMD(prevStart),
      prevEnd: toYMD(prevEnd),
    };
  }

  if (preset === 'lastMonth') {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    const prevStart = new Date(today.getFullYear(), today.getMonth() - 2, 1);
    const prevEnd = new Date(today.getFullYear(), today.getMonth() - 1, 0);
    return {
      start: toYMD(start),
      end: toYMD(end),
      prevStart: toYMD(prevStart),
      prevEnd: toYMD(prevEnd),
    };
  }

  if (preset === 'thisYear') {
    const start = new Date(today.getFullYear(), 0, 1);
    return {
      start: toYMD(start),
      end: toYMD(today),
      prevStart: toYMD(new Date(today.getFullYear() - 1, 0, 1)),
      prevEnd: toYMD(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())),
    };
  }

  if (preset === 'custom' && customFrom && customTo) {
    return {
      start: customFrom,
      end: customTo,
      prevStart: customFrom,
      prevEnd: customTo,
    };
  }

  return {
    start: '1900-01-01',
    end: '2099-12-31',
    prevStart: '1900-01-01',
    prevEnd: '1900-01-01',
  };
}

export function isDateInRange(dateStr: string | undefined | null, start: string, end: string): boolean {
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  return d >= start && d <= end;
}

// ---------------------------------------------------------------------------
// Single-Sale Financial Formulas
// ---------------------------------------------------------------------------
export function getSaleGrossAmount(sale: Sale): number {
  if (sale.status === 'cancelled') return 0;
  return (sale.num_customers || 0) * (sale.price_per_customer || 0);
}

export function getSaleNetAmount(sale: Sale): number {
  if (sale.status === 'cancelled') return 0;
  const gross = (sale.num_customers || 0) * (sale.price_per_customer || 0);
  const disc = sale.discount || 0;
  const refund = sale.refund_amount || 0;
  return Math.max(0, gross - disc - refund);
}

export function getSaleOutstandingBalance(sale: Sale): number {
  if (sale.status === 'cancelled' || sale.status === 'refunded') return 0;
  const net = getSaleNetAmount(sale);
  return Math.max(0, net - (sale.amount_paid || 0));
}

export function getSalePaymentStatus(sale: Sale): SalePaymentStatus {
  if (sale.status === 'cancelled') return 'cancelled';
  if (sale.status === 'refunded') return 'refunded';
  const net = getSaleNetAmount(sale);
  const paid = sale.amount_paid || 0;
  if (net > 0 && paid <= 0) return 'unpaid';
  if (paid < net) return 'partial';
  return 'completed';
}

export function getSaleGrossProfit(sale: Sale): number {
  if (sale.status === 'cancelled') return 0;
  return getSaleNetAmount(sale) - (sale.buying_cost || 0);
}

// ---------------------------------------------------------------------------
// Unified System-Wide Financial Calculation Engine
// ---------------------------------------------------------------------------
export interface FinancialCalculationInput {
  sales: Sale[];
  expenses: Expense[];
  purchases?: Purchase[];
  products?: Product[];
  usage?: (ProductUsage & { products?: { name?: string; unit_cost?: number } | null })[];
  services?: Service[];
  start?: string;
  end?: string;
}

export interface EnrichedSaleRecord extends Sale {
  refCode: string;
  serviceName: string;
  customerLabel: string;
  grossSale: number;
  netSale: number;
  allocatedCost: number;
  saleGrossProfit: number;
  costPerCustomer: number;
  outstandingBalance: number;
  paymentStatus: SalePaymentStatus;
  auditStatusLabel: 'COMPLETED' | 'PENDING_BALANCE' | 'UNPAID' | 'DISCOUNTED' | 'CANCELLED' | 'REFUNDED';
}

export interface UnifiedFinancialMetrics {
  grossSalesVolume: number;
  totalDiscounts: number;
  totalRefunds: number;
  revenue: number; // Net Sales Revenue after discounts & refunds
  cashCollected: number;
  outstandingBalance: number;
  salesBuyingCost: number;
  standaloneUsageCost: number;
  productCost: number; // Total COGS (without double counting)
  grossProfit: number; // revenue - productCost
  operatingExpenses: number; // Sum of operating expenses (excludes stock purchases)
  netProfit: number; // grossProfit - operatingExpenses
  purchaseTotal: number; // Supplier stock purchases (asset addition)
  totalCustomers: number;
  transactionsCount: number;
  completedCount: number;
  pendingCount: number;
  unpaidCount: number;
  discountedCount: number;
  missingCostCount: number;
  inventoryValuation: number;
  totalUnitsInStock: number;
  lowStockCount: number;
  outOfStockCount: number;
  enrichedSales: EnrichedSaleRecord[];
  servicePerf: Record<string, { count: number; revenue: number; profit: number }>;
}

function makeOrderRef(prefix: string, id: string, index: number): string {
  const digits = id.replace(/\D/g, '');
  const code = (digits ? digits.slice(-5) : String(10200 + index)).padStart(5, '2');
  return `${prefix}-${code}`;
}

export function computeFinancialMetrics(input: FinancialCalculationInput): UnifiedFinancialMetrics {
  const start = input.start || '1900-01-01';
  const end = input.end || '2099-12-31';

  const periodSales = (input.sales || []).filter((s) => isDateInRange(s.sale_date, start, end));
  const activeSales = periodSales.filter((s) => s.status !== 'cancelled');
  const periodExpenses = (input.expenses || []).filter((e) => isDateInRange(e.expense_date, start, end));
  const periodPurchases = (input.purchases || []).filter((p) => isDateInRange(p.purchase_date, start, end));
  const periodUsage = (input.usage || []).filter((u) => isDateInRange(u.usage_date, start, end));
  const products = input.products || [];
  const services = input.services || [];

  const serviceNameMap = new Map<string, string>(services.map((sv) => [sv.id, sv.name]));
  const productCostMap = new Map<string, number>(products.map((pr) => [pr.id, pr.unit_cost]));

  // Map usage linked by sale_id so if a sale has linked product_usage rows, we know its exact product cost
  const linkedUsageCostBySaleId = new Map<string, number>();
  periodUsage.forEach((u) => {
    if (u.sale_id) {
      const unitCost = u.unit_cost ?? u.products?.unit_cost ?? productCostMap.get(u.product_id) ?? 0;
      const lineCost = u.quantity * unitCost;
      linkedUsageCostBySaleId.set(u.sale_id, (linkedUsageCostBySaleId.get(u.sale_id) || 0) + lineCost);
    }
  });

  // Standalone usage (e.g., spoiled/finished or general usage recorded in Inventory not tied to a specific sale)
  // When a sale already records its product consumption or explicit cost, standalone usage only adds unlinked usage
  // to avoid double-counting.
  const datesWithExplicitSaleBuyingCost = new Set<string>(
    activeSales.filter((s) => (s.buying_cost || 0) > 0).map((s) => s.sale_date),
  );

  const standaloneUsageByDate: Record<string, number> = {};
  let standaloneUsageCost = 0;

  periodUsage.forEach((u) => {
    if (u.sale_id) return; // Already accounted for on the linked sale
    const unitCost = u.unit_cost ?? u.products?.unit_cost ?? productCostMap.get(u.product_id) ?? 0;
    const cost = u.quantity * unitCost;
    if (u.usage_type !== 'used' || !datesWithExplicitSaleBuyingCost.has(u.usage_date)) {
      standaloneUsageCost += cost;
      standaloneUsageByDate[u.usage_date] = (standaloneUsageByDate[u.usage_date] || 0) + cost;
    }
  });

  const grossSalesVolume = activeSales.reduce((sum, s) => sum + getSaleGrossAmount(s), 0);
  const totalDiscounts = activeSales.reduce((sum, s) => sum + (s.discount || 0), 0);
  const totalRefunds = activeSales.reduce((sum, s) => sum + (s.refund_amount || 0), 0);
  const revenue = activeSales.reduce((sum, s) => sum + getSaleNetAmount(s), 0);

  const cashCollected = activeSales.reduce((sum, s) => {
    const net = getSaleNetAmount(s);
    return sum + Math.min(net, Math.max(0, s.amount_paid || 0));
  }, 0);

  const outstandingBalance = activeSales.reduce((sum, s) => sum + getSaleOutstandingBalance(s), 0);

  const salesBuyingCost = activeSales.reduce((sum, s) => {
    const explicitCost = s.buying_cost !== undefined && s.buying_cost !== null ? s.buying_cost : linkedUsageCostBySaleId.get(s.id) || 0;
    return sum + explicitCost;
  }, 0);

  const productCost = salesBuyingCost + standaloneUsageCost;
  const grossProfit = revenue - productCost;
  const operatingExpenses = periodExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const netProfit = grossProfit - operatingExpenses;
  const purchaseTotal = periodPurchases.reduce((sum, p) => sum + (p.total_amount || 0), 0);
  const totalCustomers = activeSales.reduce((sum, s) => sum + (s.num_customers || 0), 0);

  // Sales revenue per date for proportional allocation of any unlinked daily usage
  const salesRevenueByDate: Record<string, number> = {};
  activeSales.forEach((s) => {
    salesRevenueByDate[s.sale_date] = (salesRevenueByDate[s.sale_date] || 0) + getSaleNetAmount(s);
  });

  let completedCount = 0;
  let pendingCount = 0;
  let unpaidCount = 0;
  let discountedCount = 0;
  let missingCostCount = 0;

  const servicePerf: Record<string, { count: number; revenue: number; profit: number }> = {};

  const enrichedSales: EnrichedSaleRecord[] = periodSales.map((s, idx) => {
    const grossSale = getSaleGrossAmount(s);
    const netSale = getSaleNetAmount(s);
    const bal = getSaleOutstandingBalance(s);
    const paymentStatus = getSalePaymentStatus(s);

    let allocatedCost =
      s.buying_cost !== undefined && s.buying_cost !== null && s.buying_cost > 0
        ? s.buying_cost
        : linkedUsageCostBySaleId.get(s.id) || 0;

    if (allocatedCost <= 0 && s.status !== 'cancelled') {
      const dateUsageCost = standaloneUsageByDate[s.sale_date];
      const dateRev = salesRevenueByDate[s.sale_date] || 1;
      if (dateUsageCost !== undefined && dateUsageCost > 0) {
        allocatedCost = Math.round((netSale / dateRev) * dateUsageCost);
      }
    }

    const saleGrossProfit = s.status === 'cancelled' ? 0 : netSale - allocatedCost;
    const svcFromJoin = (s as Sale & { services?: { name: string } | null }).services?.name;
    const serviceName =
      s.hairstyle_name || svcFromJoin || (s.service_id ? serviceNameMap.get(s.service_id) : '') || 'Salon Service';
    const customerLabel = s.customer_name || 'Walk-in Client';
    const refCode = makeOrderRef('LBS', s.id, idx + 1);

    if (s.status !== 'cancelled') {
      if (paymentStatus === 'completed') completedCount++;
      else if (paymentStatus === 'partial') pendingCount++;
      else if (paymentStatus === 'unpaid') {
        pendingCount++;
        unpaidCount++;
      }
      if ((s.discount || 0) > 0) discountedCount++;
      if (!allocatedCost || allocatedCost <= 0) missingCostCount++;

      if (!servicePerf[serviceName]) {
        servicePerf[serviceName] = { count: 0, revenue: 0, profit: 0 };
      }
      servicePerf[serviceName].count += s.num_customers || 0;
      servicePerf[serviceName].revenue += netSale;
      servicePerf[serviceName].profit += saleGrossProfit;
    }

    const auditStatusLabel =
      paymentStatus === 'cancelled'
        ? 'CANCELLED'
        : paymentStatus === 'refunded'
          ? 'REFUNDED'
          : paymentStatus === 'unpaid'
            ? 'UNPAID'
            : bal > 0
              ? 'PENDING_BALANCE'
              : (s.discount || 0) > 0
                ? 'DISCOUNTED'
                : 'COMPLETED';

    return {
      ...s,
      refCode,
      serviceName,
      customerLabel,
      grossSale,
      netSale,
      allocatedCost,
      saleGrossProfit,
      costPerCustomer: s.num_customers > 0 ? allocatedCost / s.num_customers : 0,
      outstandingBalance: bal,
      paymentStatus,
      auditStatusLabel,
    };
  });

  const inventoryValuation = products.reduce((sum, p) => sum + (p.current_stock || 0) * (p.unit_cost || 0), 0);
  const totalUnitsInStock = products.reduce((sum, p) => sum + (p.current_stock || 0), 0);
  const outOfStockCount = products.filter((p) => (p.current_stock || 0) <= 0).length;
  const lowStockCount = products.filter(
    (p) => (p.current_stock || 0) > 0 && (p.current_stock || 0) <= (p.low_stock_threshold || 0),
  ).length;

  return {
    grossSalesVolume,
    totalDiscounts,
    totalRefunds,
    revenue,
    cashCollected,
    outstandingBalance,
    salesBuyingCost,
    standaloneUsageCost,
    productCost,
    grossProfit,
    operatingExpenses,
    netProfit,
    purchaseTotal,
    totalCustomers,
    transactionsCount: activeSales.length,
    completedCount,
    pendingCount,
    unpaidCount,
    discountedCount,
    missingCostCount,
    inventoryValuation,
    totalUnitsInStock,
    lowStockCount,
    outOfStockCount,
    enrichedSales,
    servicePerf,
  };
}

