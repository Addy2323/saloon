import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  FileBarChart,
  Download,
  FileSpreadsheet,
  TrendingUp,
  Wallet,
  Scissors,
  Package,
  Receipt,
  ShoppingCart,
  Percent,
  FileText,
  Printer,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate, todayISO, startOfMonthISO } from '@/lib/format';
import { computeFinancialMetrics, getPeriodBounds, type UnifiedPeriodPreset } from '@/lib/finance';
import { useI18n } from '@/lib/i18n';
import { BarChart } from '@/components/Charts';
import { exportCSV, exportAuditPDF, type AuditReportConfig } from '@/lib/export';
import type { Sale, Expense, Product, PurchaseItem, ProductUsage } from '@/lib/types';

type ReportType = 'profit' | 'sales' | 'services' | 'expenses' | 'stock' | 'purchases';
type PeriodPreset = UnifiedPeriodPreset;

function formatNumber2(n: number): string {
  return Number(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatTZS(n: number, prefix: '+' | '-' | '' = ''): string {
  const abs = Math.abs(Math.round(n || 0)).toLocaleString('en-US');
  if (prefix) return `${prefix}TZS ${abs}`;
  return `TZS ${abs}`;
}

function formatDMY(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.slice(0, 10).split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function makeOrderRef(prefix: string, id: string, index: number): string {
  const digits = id.replace(/\D/g, '');
  const code = (digits ? digits.slice(-5) : String(10200 + index)).padStart(5, '2');
  return `${prefix}-${code}`;
}

export function Reports() {
  const { t, lang } = useI18n();
  const [reportType, setReportType] = useState<ReportType>('profit');
  const [preset, setPreset] = useState<PeriodPreset>('thisMonth');
  const [from, setFrom] = useState(startOfMonthISO());
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const applyPreset = (p: PeriodPreset) => {
    setPreset(p);
    if (p === 'custom') return;
    const b = getPeriodBounds(p);
    setFrom(b.start);
    setTo(b.end);
  };

  const loadReport = useCallback(async () => {
    setLoading(true);

    if (reportType === 'stock') {
      const { data: products } = await supabase.from('products').select('*, categories(name)').order('name');
      setData({ products: products || [] });
      setLoading(false);
      return;
    }

    const [salesRes, expensesRes] = await Promise.all([
      supabase
        .from('sales')
        .select('*, services(name), staff(name)')
        .gte('sale_date', from)
        .lte('sale_date', to)
        .order('sale_date', { ascending: false }),
      supabase
        .from('expenses')
        .select('*, categories(name)')
        .gte('expense_date', from)
        .lte('expense_date', to)
        .order('expense_date', { ascending: false }),
    ]);

    const sales = (salesRes.data || []) as (Sale & {
      services: { name: string } | null;
      staff: { name: string } | null;
    })[];
    const expenses = (expensesRes.data || []) as (Expense & { categories: { name: string } | null })[];

    const [usageRes, purchItemsRes, purchasesRes, productsRes] = await Promise.all([
      supabase
        .from('product_usage')
        .select('*, products(name, unit_cost)')
        .gte('usage_date', from)
        .lte('usage_date', to),
      supabase
        .from('purchase_items')
        .select('*, products(name)')
        .gte('created_at', from + 'T00:00:00')
        .lte('created_at', to + 'T23:59:59'),
      supabase
        .from('purchases')
        .select('*, suppliers(name)')
        .gte('purchase_date', from)
        .lte('purchase_date', to)
        .order('purchase_date', { ascending: false }),
      supabase.from('products').select('*'),
    ]);

    const usage = (usageRes.data || []) as (ProductUsage & {
      products: { name: string; unit_cost: number } | null;
    })[];
    const purchItems = (purchItemsRes.data || []) as (PurchaseItem & { products: { name: string } | null })[];
    const purchases = (purchasesRes.data || []) as any[];

    // Single source of truth — identical formulas to Dashboard & Sales Ledger
    const fm = computeFinancialMetrics({
      sales,
      expenses,
      purchases,
      products: (productsRes.data || []) as Product[],
      usage,
      start: from,
      end: to,
    });
    const {
      grossSalesVolume,
      totalDiscounts,
      totalRefunds,
      revenue,
      cashCollected,
      outstandingBalance,
      totalCustomers,
      operatingExpenses,
      productCost,
      purchaseTotal,
      grossProfit,
      netProfit,
      enrichedSales: fmSales,
      servicePerf,
    } = fm;
    const enrichedSales = fmSales.map((e) => ({ ...e, status: e.auditStatusLabel }));

    // Daily revenue for chart
    const dailyMap: Record<string, number> = {};
    fmSales.forEach((s) => {
      if (s.status === 'cancelled') return;
      dailyMap[s.sale_date] = (dailyMap[s.sale_date] || 0) + s.netSale;
    });
    const dailyData = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([date, val]) => ({ label: formatDate(date).slice(0, 6), value: val }));

    setData({
      sales,
      enrichedSales,
      expenses,
      usage,
      purchItems,
      purchases,
      grossSalesVolume,
      totalDiscounts,
      totalRefunds,
      cashCollected,
      outstandingBalance,
      totalCustomers,
      revenue,
      operatingExpenses,
      productCost,
      purchaseTotal,
      grossProfit,
      netProfit,
      servicePerf,
      dailyData,
    });
    setLoading(false);
  }, [reportType, from, to]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const reportTypes: { type: ReportType; icon: typeof FileBarChart; key: string }[] = [
    { type: 'profit', icon: Wallet, key: 'profitLoss' },
    { type: 'sales', icon: Scissors, key: 'dailySalesReport' },
    { type: 'services', icon: TrendingUp, key: 'servicePerformance' },
    { type: 'expenses', icon: Receipt, key: 'expensesReport' },
    { type: 'stock', icon: Package, key: 'stockReport' },
    { type: 'purchases', icon: ShoppingCart, key: 'purchasesReport' },
  ];

  // Build the exact AuditReportConfig matching the executive PDF layout for the active report
  const auditConfig = useMemo<AuditReportConfig | null>(() => {
    if (!data) return null;

    const periodLabel =
      preset === 'today' || preset === 'yesterday'
        ? 'DAILY AUDIT'
        : preset === 'thisWeek' || preset === 'lastWeek'
          ? 'WEEKLY AUDIT'
          : preset === 'thisMonth' || preset === 'lastMonth'
            ? 'MONTHLY AUDIT'
            : preset === 'thisYear'
              ? 'ANNUAL AUDIT'
              : 'FINANCIAL AUDIT';

    if (reportType === 'stock') {
      const products = (data.products || []) as (Product & { categories: { name: string } | null })[];
      const totalVal = products.reduce((s, p) => s + p.current_stock * p.unit_cost, 0);
      const lowCount = products.filter((p) => p.current_stock <= p.low_stock_threshold).length;
      const outCount = products.filter((p) => p.current_stock <= 0).length;

      return {
        reportCode: 'INVENTORY & STOCK AUDIT',
        periodFrom: todayISO(),
        periodTo: todayISO(),
        transactionsBoxTitle: 'INVENTORY COUNTS',
        transactionsRows: [
          { label: 'Total Products:', value: String(products.length), tone: 'default' },
          { label: 'In Stock Items:', value: String(products.length - outCount), tone: 'positive' },
          { label: 'Low Stock Alerts:', value: String(lowCount), tone: 'negative' },
          { label: 'Out of Stock:', value: String(outCount), tone: 'negative' },
        ],
        financeBoxTitle: 'VALUATION',
        financeRows: [
          { label: 'Total Stock Value:', value: formatTZS(totalVal, '+'), tone: 'positive' },
          {
            label: 'Total Units in Stock:',
            value: `${products.reduce((s, p) => s + p.current_stock, 0)} Units`,
            tone: 'default',
          },
        ],
        bannerLabel: 'Total Available Inventory Valuation',
        bannerValue: formatTZS(totalVal, '+'),
        bannerPositive: true,
        footnote:
          'Inventory valuation reflects current available stock multiplied by unit purchase cost. Low stock items require replenishment.',
        sections: [
          {
            heading: 'INVENTORY STOCK LEDGER (TZS)',
            headers: ['Product Code', 'Product / Category', 'Unit Cost', 'Available Stock', 'Stock Value', 'STATUS'],
            rows: products.map((p, i) => [
              { primary: makeOrderRef('PRD', p.id, i + 1), secondary: p.unit },
              { primary: p.name, secondary: p.categories?.name || 'General' },
              formatNumber2(p.unit_cost),
              `${p.current_stock} ${p.unit}`,
              formatNumber2(p.current_stock * p.unit_cost),
              p.current_stock <= 0 ? 'OUT_OF_STOCK' : p.current_stock <= p.low_stock_threshold ? 'LOW_STOCK' : 'IN_STOCK',
            ]),
          },
        ],
      };
    }

    const enrichedSales = data.enrichedSales || [];
    const salesLedgerSection = {
      heading: 'SALES LEDGER (TZS)',
      headers: ['Order Date', 'Customer / Service', 'Net sales', 'Net buying cost', 'Gross Profit', 'STATUS'],
      rows: enrichedSales.map((s: any) => [
        { primary: s.refCode, secondary: formatDMY(s.sale_date) },
        { primary: s.customerLabel, secondary: s.serviceName },
        formatNumber2(s.netSale),
        s.allocatedCost > 0 ? formatNumber2(s.allocatedCost) : '0.00',
        formatNumber2(s.saleGrossProfit),
        s.status,
      ]),
    };

    const pricesAtSaleSection = {
      heading: 'PRODUCT & SERVICE PRICES AT SALE (TZS)',
      headers: ['Order / Service', 'Qty', 'Buying / unit', 'Selling / unit', 'Discount', 'Sale profit'],
      rows: enrichedSales.map((s: any) => [
        { primary: s.refCode, secondary: s.serviceName },
        s.num_customers,
        s.costPerCustomer > 0 ? formatNumber2(s.costPerCustomer) : '0.00',
        formatNumber2(s.price_per_customer),
        formatNumber2(s.discount || 0),
        formatNumber2(s.saleGrossProfit),
      ]),
    };

    const expensesLedgerSection = {
      heading: 'OPERATING EXPENSES LEDGER (TZS)',
      headers: ['Expense Date', 'Expense / Notes', 'Category', 'Recorded By', 'Amount (TZS)', 'STATUS'],
      rows: (data.expenses || []).map((e: Expense & { categories: { name: string } | null }, idx: number) => [
        { primary: makeOrderRef('EXP', e.id, idx + 1), secondary: formatDMY(e.expense_date) },
        { primary: e.name, secondary: e.notes || 'Daily operation expense' },
        e.categories?.name || 'Operating',
        e.recorded_by || 'Owner / Admin',
        formatNumber2(e.amount),
        'PAID',
      ]),
    };

    if (reportType === 'expenses') {
      return {
        reportCode: `${periodLabel} — EXPENSES`,
        periodFrom: from,
        periodTo: to,
        transactionsBoxTitle: 'EXPENSE RECORDS',
        transactionsRows: [
          { label: 'Total Count:', value: String(data.expenses.length), tone: 'default' },
          { label: 'Operating Expenses:', value: formatTZS(data.operatingExpenses, '-'), tone: 'negative' },
          { label: 'Consumed Products:', value: formatTZS(data.productCost, '-'), tone: 'negative' },
          { label: 'Stock Purchases:', value: formatTZS(data.purchaseTotal, '-'), tone: 'default' },
        ],
        financeBoxTitle: 'FINANCE IMPACT',
        financeRows: [
          { label: 'Sales Revenue:', value: formatTZS(data.revenue, '+'), tone: 'positive' },
          { label: 'Operating Expenses:', value: formatTZS(data.operatingExpenses, '-'), tone: 'negative' },
          { label: 'Product Cost (COGS):', value: formatTZS(data.productCost, '-'), tone: 'negative' },
          {
            label: 'Net Profit:',
            value: formatTZS(data.netProfit, data.netProfit >= 0 ? '+' : '-'),
            tone: data.netProfit >= 0 ? 'positive' : 'negative',
          },
        ],
        bannerLabel: 'Total Operating Expenses in Period',
        bannerValue: formatTZS(data.operatingExpenses, '-'),
        bannerPositive: false,
        metaLine2: `Expense Entries: ${data.expenses.length} | Product Consumption Entries: ${data.usage.length}`,
        footnote:
          'Operating expenses represent daily recurring salon costs (electricity, water, rent, cleaning, staff meals) deducted from Gross Profit.',
        sections: [expensesLedgerSection],
      };
    }

    if (reportType === 'services') {
      const entries = Object.entries(data.servicePerf || {}).sort((a: any, b: any) => b[1].revenue - a[1].revenue);
      return {
        reportCode: `${periodLabel} — SERVICE PERFORMANCE`,
        periodFrom: from,
        periodTo: to,
        transactionsBoxTitle: 'SERVICE VOLUME',
        transactionsRows: [
          { label: 'Active Services:', value: String(entries.length), tone: 'default' },
          { label: 'Total Customers Served:', value: String(data.totalCustomers), tone: 'teal' },
          { label: 'Completed Transactions:', value: String(data.sales.length), tone: 'positive' },
          { label: 'Discounts Applied:', value: formatTZS(data.totalDiscounts, '-'), tone: 'negative' },
        ],
        financeBoxTitle: 'FINANCE',
        financeRows: [
          { label: 'Sales Revenue:', value: formatTZS(data.revenue, '+'), tone: 'positive' },
          { label: 'Product Cost (COGS):', value: formatTZS(data.productCost, '-'), tone: 'negative' },
          { label: 'Gross Profit:', value: formatTZS(data.grossProfit, '+'), tone: 'default' },
          { label: 'Net Profit:', value: formatTZS(data.netProfit, '+'), tone: 'positive' },
        ],
        bannerLabel: 'Total Service Revenue Generated',
        bannerValue: formatTZS(data.revenue, '+'),
        bannerPositive: true,
        sections: [
          {
            heading: 'SALON SERVICE PERFORMANCE LEDGER (TZS)',
            headers: ['Service Rank', 'Hairstyle / Service Name', 'Customers Served', 'Net Revenue (TZS)', 'Share (%)', 'STATUS'],
            rows: entries.map(([name, info]: [string, any], i) => {
              const pct = data.revenue > 0 ? ((info.revenue / data.revenue) * 100).toFixed(1) : '0.0';
              return [
                `#${i + 1}`,
                name,
                info.count,
                formatNumber2(info.revenue),
                `${pct}%`,
                'ACTIVE',
              ];
            }),
          },
          salesLedgerSection,
        ],
      };
    }

    if (reportType === 'purchases') {
      return {
        reportCode: `${periodLabel} — PURCHASES`,
        periodFrom: from,
        periodTo: to,
        transactionsBoxTitle: 'PURCHASE ORDERS',
        transactionsRows: [
          { label: 'Total Orders:', value: String(data.purchases.length), tone: 'default' },
          { label: 'Total Purchase Value:', value: formatTZS(data.purchaseTotal, '+'), tone: 'teal' },
          { label: 'Consumed in Services:', value: formatTZS(data.productCost, '-'), tone: 'negative' },
          { label: 'Added to Stock:', value: 'Inventory Asset', tone: 'positive' },
        ],
        financeBoxTitle: 'FINANCE',
        financeRows: [
          { label: 'Sales Revenue:', value: formatTZS(data.revenue, '+'), tone: 'positive' },
          { label: 'Stock Purchased:', value: formatTZS(data.purchaseTotal, '-'), tone: 'default' },
          { label: 'Product Cost Used:', value: formatTZS(data.productCost, '-'), tone: 'negative' },
          { label: 'Net Profit:', value: formatTZS(data.netProfit, '+'), tone: 'positive' },
        ],
        bannerLabel: 'Total Inventory Purchases Recorded',
        bannerValue: formatTZS(data.purchaseTotal, '+'),
        bannerPositive: true,
        footnote:
          'Purchasing inventory increases salon stock value. Only the cost of products actually consumed during salon services is deducted in Profit & Loss.',
        sections: [
          {
            heading: 'SUPPLIER PURCHASE LEDGER (TZS)',
            headers: ['Order Date', 'Supplier Name', 'Notes', 'Total Cost (TZS)', 'STATUS'],
            rows: (data.purchases || []).map((p: any, i: number) => [
              { primary: makeOrderRef('PO', p.id, i + 1), secondary: formatDMY(p.purchase_date) },
              p.suppliers?.name || 'General Supplier',
              p.notes || 'Salon stock replenishment',
              formatNumber2(p.total_amount),
              'RECEIVED',
            ]),
          },
        ],
      };
    }

    // Default for 'profit' (Profit & Loss) and 'sales' (Sales Report) — exact match to the executive audit screenshot
    return {
      reportCode: periodLabel,
      periodFrom: from,
      periodTo: to,
      transactionsBoxTitle: 'TRANSACTIONS',
      transactionsRows: [
        { label: 'Total Count:', value: String(data.sales.length), tone: 'default' },
        { label: 'Volume / Sales:', value: formatTZS(data.grossSalesVolume, '+'), tone: 'teal' },
        { label: 'Net Sales:', value: formatTZS(data.revenue, '+'), tone: 'positive' },
        { label: 'Discounts / Refunds:', value: formatTZS(data.totalDiscounts + data.totalRefunds, '-'), tone: 'negative' },
        { label: 'Cash Collected:', value: formatTZS(data.cashCollected, '+'), tone: 'positive' },
        { label: 'Outstanding Balance:', value: formatTZS(data.outstandingBalance, '-'), tone: 'negative' },
      ],
      financeBoxTitle: 'FINANCE',
      financeRows: [
        { label: 'Sales Revenue:', value: formatTZS(data.revenue, '+'), tone: 'positive' },
        { label: 'Product Cost:', value: formatTZS(data.productCost, '-'), tone: 'negative' },
        { label: 'Gross Profit:', value: formatTZS(data.grossProfit, data.grossProfit >= 0 ? '+' : '-'), tone: 'default' },
        { label: 'Operating Expenses:', value: formatTZS(data.operatingExpenses, '-'), tone: 'negative' },
        {
          label: 'Net Profit:',
          value: formatTZS(data.netProfit, data.netProfit >= 0 ? '+' : '-'),
          tone: data.netProfit >= 0 ? 'positive' : 'negative',
        },
      ],
      bannerLabel:
        reportType === 'sales'
          ? 'Gross Profit After Discounts & Product Cost'
          : 'Net Profit After Operating Expenses & Product Cost',
      bannerValue:
        reportType === 'sales'
          ? formatTZS(data.grossProfit, data.grossProfit >= 0 ? '+' : '-')
          : formatTZS(data.netProfit, data.netProfit >= 0 ? '+' : '-'),
      bannerPositive: (reportType === 'sales' ? data.grossProfit : data.netProfit) >= 0,
      metaLine2: `Discounts: TZS ${formatNumber2(data.totalDiscounts)} | Customers Served: ${data.totalCustomers} | Operating Expense Records: ${data.expenses.length}`,
      footnote:
        'Figures include all salon service transactions, product consumption costs (COGS), and daily operating expenses recorded in this period. Purchasing stock increases inventory; only products consumed during services and operating expenses are deducted from revenue.',
      sections:
        reportType === 'sales'
          ? [salesLedgerSection, pricesAtSaleSection]
          : [salesLedgerSection, pricesAtSaleSection, expensesLedgerSection],
    };
  }, [data, reportType, preset, from, to]);

  const handleExportExcel = () => {
    if (!data) return;
    if (reportType === 'profit') {
      exportCSV(
        'profit-loss-audit',
        [
          'Order Ref',
          'Date',
          'Customer',
          'Hairstyle / Service',
          'Customers (Qty)',
          'Selling / Unit (TZS)',
          'Discount (TZS)',
          'Net Sales (TZS)',
          'Est. Product Cost (TZS)',
          'Gross Profit (TZS)',
          'Status',
        ],
        (data.enrichedSales || []).map((s: any) => [
          s.refCode,
          formatDMY(s.sale_date),
          s.customerLabel,
          s.serviceName,
          s.num_customers,
          s.price_per_customer,
          s.discount || 0,
          s.netSale,
          s.allocatedCost,
          s.saleGrossProfit,
          s.status,
        ]).concat([
          [],
          ['SUMMARY', '', '', '', '', '', '', 'Net Sales', data.revenue],
          ['', '', '', '', '', '', '', 'COGS', data.productCost],
          ['', '', '', '', '', '', '', 'Gross Profit', data.grossProfit],
          ['', '', '', '', '', '', '', 'Operating Expenses', data.operatingExpenses],
          ['', '', '', '', '', '', '', 'Net Profit', data.netProfit],
          ['', '', '', '', '', '', '', 'Cash Collected', data.cashCollected],
          ['', '', '', '', '', '', '', 'Outstanding', data.outstandingBalance],
        ] as any[]),
      );
    } else if (reportType === 'sales') {
      exportCSV(
        'sales-report',
        [
          t('date'),
          t('hairstyle'),
          t('customerName'),
          t('numCustomers'),
          t('pricePerCustomer'),
          t('discount'),
          t('totalRevenue'),
          t('paymentMethod'),
        ],
        data.sales.map((s: Sale & { services: { name: string } | null; staff: { name: string } | null }) => [
          formatDate(s.sale_date),
          s.hairstyle_name || s.services?.name || '',
          s.customer_name || '',
          s.num_customers,
          formatCurrency(s.price_per_customer),
          formatCurrency(s.discount),
          formatCurrency(Math.max(0, s.num_customers * s.price_per_customer - s.discount - (s.refund_amount || 0))),
          s.payment_method,
        ]),
      );
    } else if (reportType === 'expenses') {
      exportCSV(
        'expenses-report',
        [t('expenseName'), t('category'), t('amount'), t('date'), t('recordedBy')],
        data.expenses.map((e: Expense & { categories: { name: string } | null }) => [
          e.name,
          e.categories?.name || '',
          formatCurrency(e.amount),
          formatDate(e.expense_date),
          e.recorded_by || '',
        ]),
      );
    } else if (reportType === 'stock') {
      exportCSV(
        'stock-report',
        [t('productName'), t('category'), t('unitCost'), t('currentStock'), t('lowStockThreshold')],
        data.products.map((p: Product & { categories: { name: string } | null }) => [
          p.name,
          p.categories?.name || '',
          formatCurrency(p.unit_cost),
          p.current_stock,
          p.low_stock_threshold,
        ]),
      );
    } else if (reportType === 'services') {
      exportCSV(
        'service-performance',
        [t('service'), t('customers'), t('revenue')],
        Object.entries(data.servicePerf).map(([name, info]: [string, any]) => [
          name,
          info.count,
          formatCurrency(info.revenue),
        ]),
      );
    } else if (reportType === 'purchases') {
      exportCSV(
        'purchases-report',
        [t('date'), t('supplier'), t('grandTotal')],
        data.purchases.map((p: any) => [
          formatDate(p.purchase_date),
          p.suppliers?.name || '',
          formatCurrency(p.total_amount),
        ]),
      );
    }
  };

  const handleExportPDF = () => {
    if (!auditConfig) return;
    exportAuditPDF(auditConfig);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-ink-900">{t('reports')}</h2>
          <p className="text-xs text-ink-500 mt-0.5">
            {lang === 'sw'
              ? 'Ripoti ya Faida na Hasara (Profit & Loss), Miamala ya Mauzo, Huduma, Matumizi na Stoo'
              : 'Executive Profit & Loss Audit, Sales Ledger, Service Pricing, Operating Expenses & Stock Valuation'}
          </p>
        </div>

        {/* Top Quick Export Buttons */}
        <div className="flex items-center gap-2.5">
          <button onClick={handleExportExcel} className="btn btn-secondary">
            <FileSpreadsheet size={17} /> {t('exportExcel')}
          </button>
          <button onClick={handleExportPDF} className="btn btn-primary">
            <Download size={17} /> {t('exportPdf')}
          </button>
        </div>
      </div>

      {/* Report Type Selector */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {reportTypes.map((rt) => {
          const Icon = rt.icon;
          const isActive = reportType === rt.type;
          return (
            <button
              key={rt.type}
              onClick={() => setReportType(rt.type)}
              className={`panel p-4 flex flex-col items-center gap-2 transition-all ${
                isActive ? 'ring-2 ring-[#6d28d9] bg-[#f3edff]' : 'hover:shadow-md'
              }`}
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  isActive ? 'bg-[#6d28d9] text-white' : 'bg-[#f4f0fb] text-[#6d28d9]'
                }`}
              >
                <Icon size={20} />
              </div>
              <span className={`text-xs font-semibold text-center ${isActive ? 'text-[#4c1d95]' : 'text-ink-700'}`}>
                {t(rt.key)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Date Filter + Period Presets */}
      {reportType !== 'stock' && (
        <div className="panel p-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap items-center gap-1.5 mr-2">
            {(
              [
                { id: 'today', label: lang === 'sw' ? 'Leo' : 'Today' },
                { id: 'yesterday', label: lang === 'sw' ? 'Jana' : 'Yesterday' },
                { id: 'thisWeek', label: lang === 'sw' ? 'Wiki Hii' : 'This Week' },
                { id: 'lastWeek', label: lang === 'sw' ? 'Wiki Iliyopita' : 'Last Week' },
                { id: 'thisMonth', label: lang === 'sw' ? 'Mwezi Huu' : 'This Month' },
                { id: 'lastMonth', label: lang === 'sw' ? 'Mwezi Uliopita' : 'Last Month' },
                { id: 'thisYear', label: lang === 'sw' ? 'Mwaka Huu' : 'This Year' },
                { id: 'custom', label: lang === 'sw' ? 'Tarehe Maalum' : 'Custom Range' },
              ] as { id: PeriodPreset; label: string }[]
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition ${
                  preset === p.id
                    ? 'bg-[#6D28D9] text-white shadow-xs'
                    : 'bg-[#F3F4F6] text-[#374151] hover:bg-[#E5E7EB]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div>
            <label className="label">{t('from')}</label>
            <input
              type="date"
              className="input"
              value={from}
              onChange={(e) => {
                setPreset('custom');
                setFrom(e.target.value);
              }}
            />
          </div>
          <div>
            <label className="label">{t('to')}</label>
            <input
              type="date"
              className="input"
              value={to}
              onChange={(e) => {
                setPreset('custom');
                setTo(e.target.value);
              }}
            />
          </div>
          <div className="flex-1" />
          <button onClick={handleExportPDF} className="btn btn-primary">
            <Printer size={17} /> {lang === 'sw' ? 'Pakua PDF ya Ukaguzi' : 'Download Audit PDF'}
          </button>
        </div>
      )}

      {/* Report Content */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          <ReportContent reportType={reportType} data={data} t={t} lang={lang} onReload={loadReport} />

          {/* Live Executive Audit Document Preview (matches downloaded PDF 1:1) */}
          {auditConfig && <AuditDocumentPreview config={auditConfig} onPrint={handleExportPDF} lang={lang} />}
        </div>
      )}
    </div>
  );
}

function AuditDocumentPreview({
  config,
  onPrint,
  lang,
}: {
  config: AuditReportConfig;
  onPrint: () => void;
  lang: 'sw' | 'en';
}) {
  const company = config.companyName || 'LUCENTIA BEAUTY & SALON';
  const subtitle = config.systemSubtitle || 'Financial & Salon Operations Audit System';
  const status = config.statusText || 'GENERATED REPORT';
  const isPositive = config.bannerPositive !== false;

  const toneColor = (tone?: 'default' | 'positive' | 'negative' | 'teal') => {
    if (tone === 'positive') return 'text-[#16A34A]';
    if (tone === 'negative') return 'text-[#DC2626]';
    if (tone === 'teal') return 'text-[#0D9488]';
    return 'text-[#0F172A]';
  };

  return (
    <div className="panel overflow-hidden border border-[#CBD5E1] shadow-card">
      {/* Top Preview Banner */}
      <div className="bg-[#160D24] sidebar-dotted px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#6D28D9] text-[#FAE29C] flex items-center justify-center">
            <FileText size={17} />
          </div>
          <div>
            <p className="text-xs font-extrabold text-[#FAE29C] tracking-wide uppercase">
              {lang === 'sw' ? 'Muonekano wa Ripoti ya PDF (Audit Layout)' : 'Official PDF Audit Report Preview'}
            </p>
            <p className="text-[11px] text-white/75">
              {lang === 'sw'
                ? 'Muonekano huu ni sawa kabisa na PDF utakayoipakua'
                : 'Exact layout generated when you click Export PDF / Download Audit PDF'}
            </p>
          </div>
        </div>
        <button
          onClick={onPrint}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#6D28D9] px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-95 transition"
        >
          <Download size={15} />
          {lang === 'sw' ? 'Pakua / Chapisha PDF' : 'Download / Print PDF'}
        </button>
      </div>

      {/* A4 Document Sheet */}
      <div className="bg-white p-6 sm:p-10 max-w-[920px] mx-auto text-[#1E293B]">
        {/* Document Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-4 border-b-[1.5px] border-[#CBD5E1] mb-6">
          <div>
            <h1 className="text-2xl sm:text-[26px] font-extrabold text-[#0D9488] tracking-wide uppercase leading-tight">
              {company}
            </h1>
            <p className="text-xs font-medium text-[#64748B] mt-1">{subtitle}</p>
          </div>
          <div className="sm:text-right text-xs leading-relaxed">
            <p className="font-extrabold text-[#334155]">Report: {config.reportCode}</p>
            <p className="text-[#64748B]">
              Generated: {formatDMY(todayISO())}, {new Date().toTimeString().slice(0, 8)}
            </p>
            <p className="font-extrabold text-[#0D9488] uppercase">Status: {status}</p>
          </div>
        </div>

        {/* OPERATIONAL SUMMARY */}
        <div className="mb-6">
          <h2 className="text-[13px] font-extrabold text-[#0F172A] uppercase tracking-wide mb-3">
            OPERATIONAL SUMMARY
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Left Box: TRANSACTIONS */}
            <div className="bg-[#F8FAFC] border border-[#CBD5E1] p-4">
              <h3 className="text-[11px] font-extrabold text-[#334155] uppercase tracking-wider mb-2.5">
                {config.transactionsBoxTitle || 'TRANSACTIONS'}
              </h3>
              <div className="space-y-1.5 text-xs">
                {config.transactionsRows.map((r, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-[#475569] font-medium">{r.label}</span>
                    <span className={`font-extrabold ${toneColor(r.tone)}`}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Box: FINANCE */}
            <div className="bg-[#F8FAFC] border border-[#CBD5E1] p-4">
              <h3 className="text-[11px] font-extrabold text-[#334155] uppercase tracking-wider mb-2.5">
                {config.financeBoxTitle || 'FINANCE'}
              </h3>
              <div className="space-y-1.5 text-xs">
                {config.financeRows.map((r, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-[#475569] font-medium">{r.label}</span>
                    <span className={`font-extrabold ${toneColor(r.tone)}`}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Profit Highlight Banner */}
          <div
            className={`px-4 py-3.5 border flex flex-wrap items-center justify-between gap-2 mb-3 ${
              isPositive ? 'bg-[#F0FDF4] border-[#86EFAC]' : 'bg-[#FEF2F2] border-[#FCA5A5]'
            }`}
          >
            <span className="text-xs sm:text-[13px] font-extrabold text-[#1E293B]">{config.bannerLabel}</span>
            <span className={`text-lg sm:text-xl font-extrabold ${isPositive ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
              {config.bannerValue}
            </span>
          </div>

          {/* Period & Audit Notes */}
          <div className="text-xs text-[#475569] space-y-1">
            <p>
              Period: {formatDMY(config.periodFrom)} - {formatDMY(config.periodTo)}
            </p>
            {config.metaLine2 && <p>{config.metaLine2}</p>}
            {config.footnote && <p className="text-[11px] text-[#64748B] pt-1 leading-relaxed">{config.footnote}</p>}
          </div>
        </div>

        {/* Ledger Table Sections */}
        <div className="space-y-6">
          {config.sections.map((section, sIdx) => (
            <div key={sIdx}>
              <h2 className="text-[13px] font-extrabold text-[#0F172A] uppercase tracking-wide mb-2.5">
                {section.heading}
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#F1F5F9] border-b-[1.5px] border-[#CBD5E1] text-[#334155]">
                      {section.headers.map((h, hIdx) => (
                        <th key={hIdx} className="text-left font-extrabold px-3 py-2.5 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#CBD5E1]">
                    {section.rows.length === 0 ? (
                      <tr>
                        <td colSpan={section.headers.length} className="text-center py-6 text-[#94A3B8] italic">
                          No records recorded in this period
                        </td>
                      </tr>
                    ) : (
                      section.rows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-[#F8FAFC]">
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="px-3 py-2.5 align-top text-[#334155]">
                              {cell && typeof cell === 'object' && 'primary' in cell ? (
                                <div>
                                  <div className="font-semibold text-[#1E293B]">{cell.primary}</div>
                                  {cell.secondary && <div className="text-[#475569] text-[11px]">{cell.secondary}</div>}
                                </div>
                              ) : (
                                String(cell ?? '')
                              )}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReportContent({
  reportType,
  data,
  t,
  lang,
  onReload,
}: {
  reportType: ReportType;
  data: any;
  t: (k: string) => string;
  lang: 'sw' | 'en';
  onReload: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBuyingCost, setEditBuyingCost] = useState<number>(0);

  if (!data) return null;

  const saveRowBuyingCost = async (saleId: string) => {
    await supabase.from('sales').update({ buying_cost: editBuyingCost }).eq('id', saleId);
    setEditingId(null);
    onReload();
  };

  if (reportType === 'profit' || reportType === 'sales') {
    const grossMargin = data.revenue > 0 ? ((data.grossProfit / data.revenue) * 100).toFixed(1) : '0.0';
    const netMargin = data.revenue > 0 ? ((data.netProfit / data.revenue) * 100).toFixed(1) : '0.0';
    const enrichedSales = data.enrichedSales || [];

    return (
      <div className="space-y-5">
        {/* 4 Automatic Profit Calculation Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          <SummaryCard
            icon={<Package size={20} />}
            label={lang === 'sw' ? 'Gharama ya Bidhaa (Buying Cost)' : 'Total Buying / Product Cost'}
            value={formatCurrency(data.productCost)}
            sub={`${enrichedSales.length} ${lang === 'sw' ? 'miamala' : 'recorded orders'}`}
            tone="violet"
          />
          <SummaryCard
            icon={<TrendingUp size={20} />}
            label={lang === 'sw' ? 'Jumla ya Mauzo (Selling Price)' : 'Total Selling Price'}
            value={formatCurrency(data.revenue)}
            sub={lang === 'sw' ? 'Mauzo baada ya punguzo' : 'Selling total after discounts'}
            tone="teal"
          />
          <SummaryCard
            icon={<Percent size={20} />}
            label={lang === 'sw' ? 'Faida Ghafi (Gross Profit)' : 'Gross Profit'}
            value={formatCurrency(data.grossProfit)}
            sub={`Gross Margin: ${grossMargin}%`}
            tone="green"
          />
          <SummaryCard
            icon={<Receipt size={20} />}
            label={t('operatingExpenses')}
            value={formatCurrency(data.operatingExpenses)}
            sub={`${data.expenses.length} ${t('items')}`}
            tone="orange"
          />
          <SummaryCard
            icon={<Wallet size={20} />}
            label={t('netProfit')}
            value={formatCurrency(data.netProfit)}
            sub={`Net Margin: ${netMargin}%`}
            tone="green"
          />
        </div>

        {/* Automatic Profit Ledger Table (Buying Cost, Selling Price & Automatic Profit) */}
        <div className="panel overflow-hidden border border-[#E2E8F0]">
          <div className="px-5 py-3.5 bg-[#F8FAFC] border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-extrabold text-[#0F172A]">
                {lang === 'sw'
                  ? 'Daftari la Mauzo na Ukokotoaji wa Faida Otomatiki'
                  : 'Digital Sales & Automatic Profit Calculation Ledger'}
              </h3>
              <p className="text-xs text-[#64748B]">
                {lang === 'sw'
                  ? 'Faida = Bei ya Mauzo − Gharama ya Bidhaa (Bonyeza "Edit" kubadili gharama ya bidhaa)'
                  : 'Automatic Profit = Selling Price − Buying/Product Cost (Click "Edit" on any row to adjust buying cost)'}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#160D24] text-white uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="text-left font-bold px-4 py-3.5">ORDER ID</th>
                  <th className="text-left font-bold px-4 py-3.5">DATE</th>
                  <th className="text-left font-bold px-4 py-3.5">CUSTOMER</th>
                  <th className="text-left font-bold px-4 py-3.5">SERVICE / HAIRSTYLE</th>
                  <th className="text-right font-bold px-4 py-3.5">BUYING COST (TZS)</th>
                  <th className="text-right font-bold px-4 py-3.5">SELLING PRICE (TZS)</th>
                  <th className="text-right font-bold px-4 py-3.5">PROFIT (TZS)</th>
                  <th className="text-left font-bold px-4 py-3.5">STAFF</th>
                  <th className="text-center font-bold px-4 py-3.5">STATUS</th>
                  <th className="text-center font-bold px-4 py-3.5">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {enrichedSales.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-8 text-[#94A3B8]">
                      {t('noData')}
                    </td>
                  </tr>
                ) : (
                  enrichedSales.map((s: any) => {
                    const isEditing = editingId === s.id;
                    const liveProfit = isEditing ? s.netSale - editBuyingCost : s.saleGrossProfit;
                    return (
                      <tr key={s.id} className="hover:bg-[#F8FAFC]">
                        <td className="px-4 py-3.5 font-extrabold text-[#0F172A] whitespace-nowrap">{s.refCode}</td>
                        <td className="px-4 py-3.5 text-[#64748B] whitespace-nowrap">{formatDMY(s.sale_date)}</td>
                        <td className="px-4 py-3.5">
                          <div className="font-bold text-[#0F172A]">{s.customerLabel}</div>
                          <div className="text-[11px] text-[#94A3B8]">{s.payment_method}</div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-[#1E293B]">{s.serviceName}</div>
                          <span className="inline-block mt-0.5 px-2 py-0.5 rounded bg-[#F1F5F9] text-[#475569] text-[10px] font-bold">
                            {s.num_customers} {s.num_customers === 1 ? 'customer' : 'customers'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          {isEditing ? (
                            <input
                              type="number"
                              min={0}
                              className="input w-28 py-1 px-2 text-right text-xs font-bold ml-auto"
                              value={editBuyingCost}
                              onChange={(e) => setEditBuyingCost(parseFloat(e.target.value) || 0)}
                            />
                          ) : s.allocatedCost > 0 ? (
                            <span className="font-extrabold text-[#334155]">
                              {s.allocatedCost.toLocaleString('en-US')}
                            </span>
                          ) : (
                            <span className="text-[#94A3B8] italic">Not recorded</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right font-semibold text-[#475569] whitespace-nowrap">
                          {s.netSale.toLocaleString('en-US')}
                        </td>
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <span className={`font-extrabold ${liveProfit >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                            {liveProfit.toLocaleString('en-US')}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-[#475569] font-semibold uppercase text-[11px]">
                          {s.staff?.name || 'SALON STAFF'}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className="inline-block px-2.5 py-1 rounded-full bg-[#DCFCE7] text-[#15803D] text-[10px] font-bold">
                            {s.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center whitespace-nowrap">
                          {isEditing ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() => saveRowBuyingCost(s.id)}
                                className="px-2.5 py-1 rounded-lg bg-[#16A34A] text-white text-[11px] font-bold"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="px-2 py-1 rounded-lg bg-[#F1F5F9] text-[#475569] text-[11px] font-semibold"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingId(s.id);
                                setEditBuyingCost(s.allocatedCost || 0);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-[#DCFCE7] text-[#15803D] hover:bg-[#BBF7D0] text-[11px] font-bold transition"
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {data.dailyData.length > 0 && (
          <div className="panel p-5">
            <h3 className="font-bold text-ink-900 mb-4">{t('dailySalesReport')}</h3>
            <BarChart data={data.dailyData} color="#6d28d9" height={220} />
          </div>
        )}

        <div className="panel p-6">
          <h3 className="font-bold text-ink-900 mb-4">{t('profitLoss')}</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center pb-3 border-b border-[#f1edf8]">
              <span className="text-ink-700 font-medium">{t('revenue')} (Salon Services & Sales)</span>
              <span className="font-bold text-success-600">{formatCurrency(data.revenue)}</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-[#f1edf8]">
              <span className="text-ink-600">− {t('costOfProducts')} (Buying / Product Cost)</span>
              <span className="font-semibold text-error-600">{formatCurrency(data.productCost)}</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-[#f1edf8] bg-[#faf8fe] px-3 py-2 rounded-xl">
              <span className="font-bold text-ink-900">
                = {lang === 'sw' ? 'Faida Ghafi (Gross Profit)' : 'Gross Profit'} ({grossMargin}%)
              </span>
              <span className="font-extrabold text-[#6d28d9]">{formatCurrency(data.grossProfit)}</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-[#f1edf8]">
              <span className="text-ink-600">− {t('operatingExpenses')} (Daily Expenses)</span>
              <span className="font-semibold text-error-600">{formatCurrency(data.operatingExpenses)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 bg-[#ecf9e9] px-4 py-3 rounded-xl">
              <span className="text-base font-extrabold text-ink-900">
                = {t('netProfit')} ({netMargin}%)
              </span>
              <span className={`text-xl font-extrabold ${data.netProfit >= 0 ? 'text-[#16a34a]' : 'text-error-600'}`}>
                {formatCurrency(data.netProfit)}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: 'violet' | 'teal' | 'orange' | 'green';
}) {
  const styles = {
    violet: { icon: 'bg-[#F5F3FF] border border-[#DDD6FE] text-[#6D28D9]' },
    teal: { icon: 'bg-[#FDFAEF] border border-[#F4DE9E] text-[#B8862D]' },
    orange: { icon: 'bg-[#FFFBEB] border border-[#FDE68A] text-[#D97706]' },
    green: { icon: 'bg-[#EDFCF2] border border-[#AAEFC6] text-[#098F50]' },
  }[tone];

  return (
    <div className="panel p-5">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${styles.icon}`}>{icon}</div>
      <p className="text-xs font-semibold text-[#4B5563]">{label}</p>
      <p className="mt-0.5 text-xl font-extrabold text-[#111827]">{value}</p>
      <p className="mt-1 text-[11px] font-medium text-[#6B7280]">{sub}</p>
    </div>
  );
}
